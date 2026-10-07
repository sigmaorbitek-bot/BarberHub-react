-- BarberHub
-- Migration 009: módulo seguro de agendamentos
-- Executar após 008.
--
-- Esta migration:
-- - adiciona timezone por barbearia;
-- - padroniza a grade da agenda em 15 minutos;
-- - atualiza disponibilidade do cliente;
-- - atualiza criação segura do cliente;
-- - cria disponibilidade do painel do dono;
-- - cria agendamento manual pelo dono;
-- - protege transições de status;
-- - impede dupla reserva com lock + nova validação.

-- =========================================================
-- 1. TIMEZONE DA BARBEARIA
-- =========================================================

alter table public.barbearias
add column if not exists timezone text
not null
default 'America/Recife';


-- =========================================================
-- 2. HORÁRIOS DISPONÍVEIS PARA O CLIENTE
-- =========================================================
--
-- Mantém a assinatura usada pelo frontend:
--
-- buscar_horarios_disponiveis(
--   barbearia,
--   profissional,
--   data,
--   duração
-- )
--
-- A disponibilidade é exibida em intervalos de 15 minutos.

create or replace function public.buscar_horarios_disponiveis(
  p_barbearia_id uuid,
  p_profissional_id uuid,
  p_data date,
  p_duracao integer
)
returns table (
  hora text
)
language plpgsql
stable
security definer
set search_path = public, auth
as $$
declare
  v_timezone text;
  v_dia_semana integer;
  v_duracao integer;

  v_barbearia_aberto boolean;
  v_barbearia_inicio time;
  v_barbearia_fim time;
  v_barbearia_intervalo_inicio time;
  v_barbearia_intervalo_fim time;

  v_prof_tem_config boolean := false;
  v_prof_aberto boolean := true;
  v_prof_inicio time;
  v_prof_fim time;
  v_prof_intervalo_inicio time;
  v_prof_intervalo_fim time;

  v_inicio time;
  v_fim time;
  v_slot time;

  v_slot_inicio timestamptz;
  v_slot_fim timestamptz;

  v_agora timestamptz := now();
begin

  if auth.uid() is null then
    raise exception 'Usuário não autenticado.';
  end if;


  if p_barbearia_id is null
     or p_profissional_id is null
     or p_data is null then
    return;
  end if;


  v_duracao :=
    greatest(
      coalesce(p_duracao, 30),
      1
    );


  -- =======================================================
  -- BARBEARIA
  -- =======================================================

  select b.timezone
  into v_timezone
  from public.barbearias b
  where b.id = p_barbearia_id;


  if v_timezone is null then
    return;
  end if;


  -- =======================================================
  -- PROFISSIONAL
  -- =======================================================

  if not exists (
    select 1
    from public.profissionais p
    where p.id = p_profissional_id
      and p.barbearia_id = p_barbearia_id
      and p.ativo = true
  ) then
    return;
  end if;


  v_dia_semana :=
    extract(dow from p_data)::integer;


  -- =======================================================
  -- HORÁRIO DA BARBEARIA
  -- =======================================================

  select
    h.aberto,
    h.hora_abertura,
    h.hora_fechamento,
    h.intervalo_inicio,
    h.intervalo_fim
  into
    v_barbearia_aberto,
    v_barbearia_inicio,
    v_barbearia_fim,
    v_barbearia_intervalo_inicio,
    v_barbearia_intervalo_fim
  from public.horarios_funcionamento h
  where h.barbearia_id = p_barbearia_id
    and h.dia_semana = v_dia_semana
  limit 1;


  if not found
     or not coalesce(v_barbearia_aberto, false)
     or v_barbearia_inicio is null
     or v_barbearia_fim is null then
    return;
  end if;


  -- =======================================================
  -- HORÁRIO DO PROFISSIONAL
  -- =======================================================

  select
    true,
    hp.aberto,
    hp.hora_inicio,
    hp.hora_fim,
    hp.intervalo_inicio,
    hp.intervalo_fim
  into
    v_prof_tem_config,
    v_prof_aberto,
    v_prof_inicio,
    v_prof_fim,
    v_prof_intervalo_inicio,
    v_prof_intervalo_fim
  from public.horarios_profissionais hp
  where hp.profissional_id = p_profissional_id
    and hp.dia_semana = v_dia_semana
  limit 1;


  -- Se existe configuração dizendo fechado,
  -- não usamos o horário geral como fallback.

  if v_prof_tem_config
     and not coalesce(v_prof_aberto, false) then
    return;
  end if;


  -- =======================================================
  -- INTERSEÇÃO DE HORÁRIOS
  -- =======================================================

  v_inicio :=
    greatest(
      v_barbearia_inicio,
      coalesce(
        v_prof_inicio,
        v_barbearia_inicio
      )
    );


  v_fim :=
    least(
      v_barbearia_fim,
      coalesce(
        v_prof_fim,
        v_barbearia_fim
      )
    );


  if v_inicio >= v_fim then
    return;
  end if;


  -- =======================================================
  -- GERAR GRADE DE 15 MINUTOS
  -- =======================================================

  v_slot :=
    v_inicio;


  while (
    p_data
    + v_slot
    + make_interval(
        mins => v_duracao
      )
  )::time <= v_fim
  loop

    v_slot_inicio :=
      (p_data + v_slot)
      at time zone v_timezone;


    v_slot_fim :=
      v_slot_inicio
      + make_interval(
          mins => v_duracao
        );


    if v_slot_inicio > v_agora then

      -- Intervalo da barbearia.

      if not (
        v_barbearia_intervalo_inicio is not null
        and v_barbearia_intervalo_fim is not null

        and v_slot
          < v_barbearia_intervalo_fim

        and (
          v_slot
          + make_interval(
              mins => v_duracao
            )
        )::time
          > v_barbearia_intervalo_inicio
      )

      -- Intervalo do profissional.

      and not (
        v_prof_intervalo_inicio is not null
        and v_prof_intervalo_fim is not null

        and v_slot
          < v_prof_intervalo_fim

        and (
          v_slot
          + make_interval(
              mins => v_duracao
            )
        )::time
          > v_prof_intervalo_inicio
      )

      -- Conflito com outro agendamento.

      and not exists (
        select 1

        from public.agendamentos a

        join public.servicos s_existente
          on s_existente.id = a.servico_id

        where a.barbearia_id =
                p_barbearia_id

          and a.profissional_id =
                p_profissional_id

          and a.status in (
            'pendente',
            'confirmado'
          )

          and a.arquivado = false

          and tstzrange(
            a.data_hora,

            a.data_hora
              + make_interval(
                  mins =>
                    greatest(
                      s_existente.duracao,
                      1
                    )
                ),

            '[)'
          )
          &&
          tstzrange(
            v_slot_inicio,
            v_slot_fim,
            '[)'
          )
      ) then

        hora :=
          to_char(
            v_slot,
            'HH24:MI'
          );

        return next;

      end if;

    end if;


    v_slot :=
      (
        v_slot
        + interval '15 minutes'
      )::time;

  end loop;

end;
$$;


revoke all
on function public.buscar_horarios_disponiveis(
  uuid,
  uuid,
  date,
  integer
)
from public;


grant execute
on function public.buscar_horarios_disponiveis(
  uuid,
  uuid,
  date,
  integer
)
to authenticated;


-- =========================================================
-- 3. CRIAR AGENDAMENTO PELO CLIENTE
-- =========================================================
--
-- Atualiza a RPC criada na 004.
--
-- Mantém exatamente a mesma assinatura utilizada
-- pelo ClienteAgendarPage.

create or replace function public.criar_agendamento_seguro(
  p_barbearia_id uuid,
  p_servico_id uuid,
  p_data_hora timestamptz,
  p_profissional_id uuid default null,
  p_cliente_id uuid default null
)
returns public.agendamentos
language plpgsql
security definer
set search_path = public, auth
as $$
declare
  v_cliente_id uuid;

  v_cliente public.clientes%rowtype;
  v_servico public.servicos%rowtype;
  v_profissional public.profissionais%rowtype;
  v_agendamento public.agendamentos%rowtype;

  v_timezone text;
  v_data_local date;
  v_hora_local time;

  v_lock_key bigint;
begin

  if auth.uid() is null then
    raise exception
      'Usuário não autenticado.';
  end if;


  if p_barbearia_id is null
     or p_servico_id is null
     or p_profissional_id is null
     or p_data_hora is null then

    raise exception
      'Dados obrigatórios do agendamento não informados.';

  end if;


  if p_data_hora <= now() then
    raise exception
      'Não é possível agendar um horário que já passou.';
  end if;


  -- =======================================================
  -- TIMEZONE
  -- =======================================================

  select b.timezone
  into v_timezone
  from public.barbearias b
  where b.id = p_barbearia_id;


  if v_timezone is null then
    raise exception
      'Barbearia não encontrada.';
  end if;


  v_data_local :=
    (
      p_data_hora
      at time zone v_timezone
    )::date;


  v_hora_local :=
    (
      p_data_hora
      at time zone v_timezone
    )::time;


  -- Grade oficial: 15 minutos.

  if extract(
       minute from v_hora_local
     )::integer % 15 <> 0

     or extract(
       second from v_hora_local
     ) <> 0 then

    raise exception
      'O horário deve respeitar intervalos de 15 minutos.';

  end if;


  -- =======================================================
  -- CLIENTE AUTENTICADO
  -- =======================================================

  v_cliente_id :=
    public.cliente_atual_id();


  if v_cliente_id is null then
    raise exception
      'A conta autenticada não possui cadastro de cliente.';
  end if;


  if p_cliente_id is not null
     and p_cliente_id <> v_cliente_id then

    raise exception
      'Cliente informado não corresponde ao usuário autenticado.';

  end if;


  select *
  into v_cliente
  from public.clientes c
  where c.id = v_cliente_id;


  if not found then
    raise exception
      'Cliente não encontrado.';
  end if;


  -- =======================================================
  -- SERVIÇO
  -- =======================================================

  select *
  into v_servico
  from public.servicos s
  where s.id = p_servico_id
    and s.barbearia_id = p_barbearia_id;


  if not found then
    raise exception
      'Serviço não pertence à barbearia informada.';
  end if;


  -- =======================================================
  -- PROFISSIONAL
  -- =======================================================

  select *
  into v_profissional
  from public.profissionais p
  where p.id = p_profissional_id
    and p.barbearia_id = p_barbearia_id
    and p.ativo = true;


  if not found then
    raise exception
      'Profissional não pertence à barbearia ou está inativo.';
  end if;


  -- =======================================================
  -- LOCK DE CONCORRÊNCIA
  -- =======================================================

  v_lock_key :=
    hashtextextended(
      p_barbearia_id::text
      || ':'
      || p_profissional_id::text
      || ':'
      || v_data_local::text,
      0
    );


  perform pg_advisory_xact_lock(
    v_lock_key
  );


  -- =======================================================
  -- VALIDAR DISPONIBILIDADE REAL
  -- =======================================================

  if not exists (
    select 1

    from public.buscar_horarios_disponiveis(
      p_barbearia_id,
      p_profissional_id,
      v_data_local,
      v_servico.duracao
    ) h

    where h.hora =
      to_char(
        v_hora_local,
        'HH24:MI'
      )
  ) then

    raise exception
      'Esse horário não está mais disponível.';

  end if;


  -- =======================================================
  -- VÍNCULO CLIENTE X BARBEARIA
  -- =======================================================

  insert into public.clientes_barbearias (
    cliente_id,
    barbearia_id
  )
  values (
    v_cliente_id,
    p_barbearia_id
  )
  on conflict (
    cliente_id,
    barbearia_id
  )
  do nothing;


  -- =======================================================
  -- CRIAR AGENDAMENTO
  -- =======================================================

  insert into public.agendamentos (
    barbearia_id,
    cliente_id,
    servico_id,
    profissional_id,
    data_hora,
    status,
    cliente_nome,
    cliente_telefone,
    arquivado
  )
  values (
    p_barbearia_id,
    v_cliente_id,
    p_servico_id,
    p_profissional_id,
    p_data_hora,
    'pendente',
    v_cliente.nome,
    v_cliente.telefone,
    false
  )
  returning *
  into v_agendamento;


  return v_agendamento;

end;
$$;


revoke all
on function public.criar_agendamento_seguro(
  uuid,
  uuid,
  timestamptz,
  uuid,
  uuid
)
from public;


grant execute
on function public.criar_agendamento_seguro(
  uuid,
  uuid,
  timestamptz,
  uuid,
  uuid
)
to authenticated;


-- =========================================================
-- 4. HORÁRIOS DISPONÍVEIS NO PAINEL DO DONO
-- =========================================================

create or replace function public.buscar_horarios_disponiveis_painel(
  p_barbearia_id uuid,
  p_profissional_id uuid,
  p_servico_id uuid,
  p_data date
)
returns table (
  hora text,
  data_hora timestamptz
)
language plpgsql
security definer
set search_path = public, auth
as $$
declare
  v_timezone text;
  v_dia_semana integer;
  v_duracao integer;

  v_barbearia_aberto boolean;
  v_abertura time;
  v_fechamento time;
  v_intervalo_inicio time;
  v_intervalo_fim time;

  v_prof_tem_config boolean := false;
  v_prof_aberto boolean := true;
  v_prof_abertura time;
  v_prof_fechamento time;
  v_prof_intervalo_inicio time;
  v_prof_intervalo_fim time;

  v_inicio time;
  v_fim time;
  v_slot time;

  v_slot_inicio timestamptz;
  v_slot_fim timestamptz;

  v_agora timestamptz := now();
begin

  if auth.uid() is null then
    raise exception
      'Usuário não autenticado.';
  end if;


  if p_barbearia_id is null
     or p_profissional_id is null
     or p_servico_id is null
     or p_data is null then
    return;
  end if;


  if not public.eh_dono_da_barbearia(
    p_barbearia_id
  ) then

    raise exception
      'Você não possui acesso a esta barbearia.';

  end if;


  -- =======================================================
  -- BARBEARIA / TIMEZONE
  -- =======================================================

  select b.timezone
  into v_timezone
  from public.barbearias b
  where b.id = p_barbearia_id;


  -- =======================================================
  -- SERVIÇO
  -- =======================================================

  select s.duracao
  into v_duracao
  from public.servicos s
  where s.id = p_servico_id
    and s.barbearia_id = p_barbearia_id;


  if v_duracao is null
     or v_duracao <= 0 then

    raise exception
      'Serviço inválido.';

  end if;


  -- =======================================================
  -- PROFISSIONAL
  -- =======================================================

  if not exists (
    select 1
    from public.profissionais p
    where p.id = p_profissional_id
      and p.barbearia_id = p_barbearia_id
      and p.ativo = true
  ) then

    raise exception
      'Profissional inválido ou inativo.';

  end if;


  v_dia_semana :=
    extract(
      dow from p_data
    )::integer;


  -- =======================================================
  -- HORÁRIO DA BARBEARIA
  -- =======================================================

  select
    h.aberto,
    h.hora_abertura,
    h.hora_fechamento,
    h.intervalo_inicio,
    h.intervalo_fim
  into
    v_barbearia_aberto,
    v_abertura,
    v_fechamento,
    v_intervalo_inicio,
    v_intervalo_fim
  from public.horarios_funcionamento h
  where h.barbearia_id = p_barbearia_id
    and h.dia_semana = v_dia_semana
  limit 1;


  if not found
     or not coalesce(v_barbearia_aberto, false)
     or v_abertura is null
     or v_fechamento is null then

    return;

  end if;


  -- =======================================================
  -- HORÁRIO DO PROFISSIONAL
  -- =======================================================

  select
    true,
    hp.aberto,
    hp.hora_inicio,
    hp.hora_fim,
    hp.intervalo_inicio,
    hp.intervalo_fim
  into
    v_prof_tem_config,
    v_prof_aberto,
    v_prof_abertura,
    v_prof_fechamento,
    v_prof_intervalo_inicio,
    v_prof_intervalo_fim
  from public.horarios_profissionais hp
  where hp.profissional_id =
          p_profissional_id

    and hp.dia_semana =
          v_dia_semana
  limit 1;


  if v_prof_tem_config
     and not coalesce(v_prof_aberto, false) then
    return;
  end if;


  v_inicio :=
    greatest(
      v_abertura,
      coalesce(
        v_prof_abertura,
        v_abertura
      )
    );


  v_fim :=
    least(
      v_fechamento,
      coalesce(
        v_prof_fechamento,
        v_fechamento
      )
    );


  if v_inicio >= v_fim then
    return;
  end if;


  -- =======================================================
  -- GRADE DE 15 MINUTOS
  -- =======================================================

  v_slot :=
    v_inicio;


  while (
    p_data
    + v_slot
    + make_interval(
        mins => v_duracao
      )
  )::time <= v_fim
  loop

    v_slot_inicio :=
      (p_data + v_slot)
      at time zone v_timezone;


    v_slot_fim :=
      v_slot_inicio
      + make_interval(
          mins => v_duracao
        );


    if v_slot_inicio > v_agora then

      if not (
        v_intervalo_inicio is not null
        and v_intervalo_fim is not null

        and v_slot
          < v_intervalo_fim

        and (
          v_slot
          + make_interval(
              mins => v_duracao
            )
        )::time
          > v_intervalo_inicio
      )

      and not (
        v_prof_intervalo_inicio is not null
        and v_prof_intervalo_fim is not null

        and v_slot
          < v_prof_intervalo_fim

        and (
          v_slot
          + make_interval(
              mins => v_duracao
            )
        )::time
          > v_prof_intervalo_inicio
      )

      and not exists (
        select 1

        from public.agendamentos a

        join public.servicos s_existente
          on s_existente.id =
             a.servico_id

        where a.barbearia_id =
                p_barbearia_id

          and a.profissional_id =
                p_profissional_id

          and a.status in (
            'pendente',
            'confirmado'
          )

          and a.arquivado = false

          and tstzrange(
            a.data_hora,

            a.data_hora
              + make_interval(
                  mins =>
                    greatest(
                      s_existente.duracao,
                      1
                    )
                ),

            '[)'
          )
          &&
          tstzrange(
            v_slot_inicio,
            v_slot_fim,
            '[)'
          )
      ) then

        hora :=
          to_char(
            v_slot,
            'HH24:MI'
          );

        data_hora :=
          v_slot_inicio;

        return next;

      end if;

    end if;


    v_slot :=
      (
        v_slot
        + interval '15 minutes'
      )::time;

  end loop;

end;
$$;


revoke all
on function public.buscar_horarios_disponiveis_painel(
  uuid,
  uuid,
  uuid,
  date
)
from public;


grant execute
on function public.buscar_horarios_disponiveis_painel(
  uuid,
  uuid,
  uuid,
  date
)
to authenticated;


-- =========================================================
-- 5. CRIAR AGENDAMENTO PELO DONO
-- =========================================================

create or replace function public.criar_agendamento_painel(
  p_barbearia_id uuid,
  p_cliente_id uuid,
  p_cliente_nome text,
  p_cliente_telefone text,
  p_servico_id uuid,
  p_profissional_id uuid,
  p_data_hora timestamptz
)
returns public.agendamentos
language plpgsql
security definer
set search_path = public, auth
as $$
declare
  v_agendamento public.agendamentos%rowtype;

  v_cliente_id uuid :=
    p_cliente_id;

  v_cliente_nome text;
  v_cliente_telefone text;

  v_telefone_normalizado text;

  v_duracao integer;
  v_timezone text;
  v_data_local date;

  v_lock_key bigint;
begin

  if auth.uid() is null then
    raise exception
      'Usuário não autenticado.';
  end if;


  if not public.eh_dono_da_barbearia(
    p_barbearia_id
  ) then

    raise exception
      'Você não possui acesso a esta barbearia.';

  end if;


  -- =======================================================
  -- SERVIÇO
  -- =======================================================

  select s.duracao
  into v_duracao
  from public.servicos s
  where s.id = p_servico_id
    and s.barbearia_id =
          p_barbearia_id;


  if v_duracao is null
     or v_duracao <= 0 then

    raise exception
      'Serviço inválido.';

  end if;


  -- =======================================================
  -- PROFISSIONAL
  -- =======================================================

  if not exists (
    select 1

    from public.profissionais p

    where p.id =
            p_profissional_id

      and p.barbearia_id =
            p_barbearia_id

      and p.ativo = true
  ) then

    raise exception
      'Profissional inválido ou inativo.';

  end if;


  if p_data_hora <= now() then
    raise exception
      'O agendamento deve ser feito para um horário futuro.';
  end if;


  -- =======================================================
  -- TIMEZONE
  -- =======================================================

  select b.timezone
  into v_timezone
  from public.barbearias b
  where b.id =
    p_barbearia_id;


  v_data_local :=
    (
      p_data_hora
      at time zone v_timezone
    )::date;


  -- =======================================================
  -- CLIENTE EXISTENTE
  -- =======================================================

  if v_cliente_id is not null then

    select
      c.nome,
      c.telefone

    into
      v_cliente_nome,
      v_cliente_telefone

    from public.clientes c

    join public.clientes_barbearias cb
      on cb.cliente_id = c.id

    where c.id =
            v_cliente_id

      and cb.barbearia_id =
            p_barbearia_id

    limit 1;


    if not found then
      raise exception
        'Cliente não pertence a esta barbearia.';
    end if;


  -- =======================================================
  -- NOVO CLIENTE MANUAL
  -- =======================================================

  else

    if nullif(
         trim(
           coalesce(
             p_cliente_nome,
             ''
           )
         ),
         ''
       ) is null then

      raise exception
        'Informe o nome do cliente.';

    end if;


    v_cliente_nome :=
      trim(
        p_cliente_nome
      );


    v_telefone_normalizado :=
      nullif(
        regexp_replace(
          coalesce(
            p_cliente_telefone,
            ''
          ),
          '\D',
          '',
          'g'
        ),
        ''
      );


    -- Se o mesmo telefone já pertence a um cliente
    -- desta barbearia, reutilizamos o cadastro.

    if v_telefone_normalizado is not null then

      select
        c.id,
        c.nome,
        c.telefone

      into
        v_cliente_id,
        v_cliente_nome,
        v_cliente_telefone

      from public.clientes_barbearias cb

      join public.clientes c
        on c.id =
           cb.cliente_id

      where cb.barbearia_id =
              p_barbearia_id

        and c.telefone =
              v_telefone_normalizado

      limit 1;

    end if;


    -- Caso não exista, criamos um novo cadastro manual.

    if v_cliente_id is null then

      insert into public.clientes (
        profile_id,
        nome,
        telefone,
        email
      )
      values (
        null,
        v_cliente_nome,
        v_telefone_normalizado,
        null
      )
      returning
        id,
        nome,
        telefone
      into
        v_cliente_id,
        v_cliente_nome,
        v_cliente_telefone;

    end if;

  end if;


  -- =======================================================
  -- VÍNCULO COM A BARBEARIA
  -- =======================================================

  insert into public.clientes_barbearias (
    cliente_id,
    barbearia_id
  )
  values (
    v_cliente_id,
    p_barbearia_id
  )
  on conflict (
    cliente_id,
    barbearia_id
  )
  do nothing;


  -- =======================================================
  -- LOCK
  -- =======================================================

  v_lock_key :=
    hashtextextended(
      p_barbearia_id::text
      || ':'
      || p_profissional_id::text
      || ':'
      || v_data_local::text,
      0
    );


  perform pg_advisory_xact_lock(
    v_lock_key
  );


  -- =======================================================
  -- VALIDAR DISPONIBILIDADE
  -- =======================================================

  if not exists (
    select 1

    from public.buscar_horarios_disponiveis_painel(
      p_barbearia_id,
      p_profissional_id,
      p_servico_id,
      v_data_local
    ) h

    where h.data_hora =
      p_data_hora
  ) then

    raise exception
      'Esse horário não está mais disponível.';

  end if;


  -- =======================================================
  -- CRIAR AGENDAMENTO
  -- =======================================================

  insert into public.agendamentos (
    barbearia_id,
    cliente_id,
    servico_id,
    profissional_id,
    data_hora,
    status,
    cliente_nome,
    cliente_telefone,
    arquivado,
    arquivado_at
  )
  values (
    p_barbearia_id,
    v_cliente_id,
    p_servico_id,
    p_profissional_id,
    p_data_hora,
    'pendente',
    v_cliente_nome,
    v_cliente_telefone,
    false,
    null
  )
  returning *
  into v_agendamento;


  return v_agendamento;

end;
$$;


revoke all
on function public.criar_agendamento_painel(
  uuid,
  uuid,
  text,
  text,
  uuid,
  uuid,
  timestamptz
)
from public;


grant execute
on function public.criar_agendamento_painel(
  uuid,
  uuid,
  text,
  text,
  uuid,
  uuid,
  timestamptz
)
to authenticated;


-- =========================================================
-- 6. ALTERAR STATUS PELO DONO
-- =========================================================
--
-- Fluxos permitidos:
--
-- pendente
--   -> confirmado
--   -> cancelado
--
-- confirmado
--   -> concluido
--   -> cancelado
--
-- concluido/cancelado são estados finais.

create or replace function public.atualizar_status_agendamento_painel(
  p_agendamento_id uuid,
  p_status text
)
returns public.agendamentos
language plpgsql
security definer
set search_path = public, auth
as $$
declare
  v_agendamento public.agendamentos%rowtype;
  v_status_atual text;
begin

  if auth.uid() is null then
    raise exception
      'Usuário não autenticado.';
  end if;


  if p_status not in (
    'confirmado',
    'concluido',
    'cancelado'
  ) then

    raise exception
      'Status inválido.';

  end if;


  -- Bloqueia a linha durante a transição.

  select a.status
  into v_status_atual
  from public.agendamentos a

  where a.id =
          p_agendamento_id

    and public.eh_dono_da_barbearia(
      a.barbearia_id
    )

  for update;


  if not found then
    raise exception
      'Agendamento não encontrado.';
  end if;


  -- Estados finais.

  if v_status_atual in (
    'concluido',
    'cancelado'
  ) then

    raise exception
      'Este agendamento já está encerrado.';

  end if;


  -- Pendente só pode confirmar ou cancelar.

  if v_status_atual = 'pendente'
     and p_status not in (
       'confirmado',
       'cancelado'
     ) then

    raise exception
      'Confirme o agendamento antes de concluí-lo.';

  end if;


  -- Confirmado só pode concluir ou cancelar.

  if v_status_atual = 'confirmado'
     and p_status not in (
       'concluido',
       'cancelado'
     ) then

    raise exception
      'Transição de status inválida.';

  end if;


  update public.agendamentos
  set status =
    p_status
  where id =
    p_agendamento_id

  returning *
  into v_agendamento;


  return v_agendamento;

end;
$$;


revoke all
on function public.atualizar_status_agendamento_painel(
  uuid,
  text
)
from public;


grant execute
on function public.atualizar_status_agendamento_painel(
  uuid,
  text
)
to authenticated;
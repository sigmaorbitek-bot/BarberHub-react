-- BarberHub React
-- Migration 009: módulo seguro de agendamentos
-- Executar após as migrations anteriores.

alter table public.barbearias
add column if not exists timezone text not null default 'America/Recife';

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
  v_abertura time;
  v_fechamento time;
  v_intervalo_inicio time;
  v_intervalo_fim time;
  v_prof_abertura time;
  v_prof_fechamento time;
  v_prof_intervalo_inicio time;
  v_prof_intervalo_fim time;
  v_prof_tem_horario boolean := false;
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

  if not exists (
    select 1
    from public.barbearias b
    where b.id = p_barbearia_id
      and b.dono_id = auth.uid()
  ) then
    raise exception 'Você não possui acesso a esta barbearia.';
  end if;

  select
    b.timezone
  into
    v_timezone
  from public.barbearias b
  where b.id = p_barbearia_id;

  select
    s.duracao
  into
    v_duracao
  from public.servicos s
  where s.id = p_servico_id
    and s.barbearia_id = p_barbearia_id;

  if v_duracao is null or v_duracao <= 0 then
    raise exception 'Serviço inválido.';
  end if;

  if not exists (
    select 1
    from public.profissionais p
    where p.id = p_profissional_id
      and p.barbearia_id = p_barbearia_id
      and p.ativo = true
  ) then
    raise exception 'Profissional inválido ou inativo.';
  end if;

  v_dia_semana := extract(dow from p_data)::integer;

  select
    h.hora_abertura,
    h.hora_fechamento,
    h.intervalo_inicio,
    h.intervalo_fim
  into
    v_abertura,
    v_fechamento,
    v_intervalo_inicio,
    v_intervalo_fim
  from public.horarios_funcionamento h
  where h.barbearia_id = p_barbearia_id
    and h.dia_semana = v_dia_semana
    and h.aberto = true;

  if v_abertura is null or v_fechamento is null then
    return;
  end if;

  select
    true,
    hp.hora_inicio,
    hp.hora_fim,
    hp.intervalo_inicio,
    hp.intervalo_fim
  into
    v_prof_tem_horario,
    v_prof_abertura,
    v_prof_fechamento,
    v_prof_intervalo_inicio,
    v_prof_intervalo_fim
  from public.horarios_profissionais hp
  where hp.profissional_id = p_profissional_id
    and hp.dia_semana = v_dia_semana
    and hp.aberto = true
  limit 1;

  v_inicio := greatest(
    v_abertura,
    coalesce(v_prof_abertura, v_abertura)
  );

  v_fim := least(
    v_fechamento,
    coalesce(v_prof_fechamento, v_fechamento)
  );

  v_slot := v_inicio;

  while
    (p_data + v_slot + make_interval(mins => v_duracao))::time <= v_fim
  loop
    v_slot_inicio :=
      (p_data + v_slot) at time zone v_timezone;

    v_slot_fim :=
      v_slot_inicio + make_interval(mins => v_duracao);

    if v_slot_inicio > v_agora then
      if not (
        v_intervalo_inicio is not null
        and v_intervalo_fim is not null
        and v_slot < v_intervalo_fim
        and (v_slot + make_interval(mins => v_duracao))::time > v_intervalo_inicio
      )
      and not (
        v_prof_intervalo_inicio is not null
        and v_prof_intervalo_fim is not null
        and v_slot < v_prof_intervalo_fim
        and (v_slot + make_interval(mins => v_duracao))::time > v_prof_intervalo_inicio
      )
      and not exists (
        select 1
        from public.agendamentos a
        join public.servicos s_existente
          on s_existente.id = a.servico_id
        where a.barbearia_id = p_barbearia_id
          and a.profissional_id = p_profissional_id
          and a.status in ('pendente', 'confirmado')
          and a.arquivado = false
          and tstzrange(
            a.data_hora,
            a.data_hora
              + make_interval(
                  mins => greatest(
                    coalesce(s_existente.duracao, 30),
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
        hora := to_char(v_slot, 'HH24:MI');
        data_hora := v_slot_inicio;
        return next;
      end if;
    end if;

    v_slot :=
      (v_slot + interval '15 minutes')::time;
  end loop;
end;
$$;

revoke all on function public.buscar_horarios_disponiveis_painel(
  uuid, uuid, uuid, date
) from public;

grant execute on function public.buscar_horarios_disponiveis_painel(
  uuid, uuid, uuid, date
) to authenticated;


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
  v_cliente_id uuid := p_cliente_id;
  v_cliente_nome text;
  v_cliente_telefone text;
  v_duracao integer;
  v_fim timestamptz;
  v_lock_key bigint;
begin
  if auth.uid() is null then
    raise exception 'Usuário não autenticado.';
  end if;

  if not exists (
    select 1
    from public.barbearias b
    where b.id = p_barbearia_id
      and b.dono_id = auth.uid()
  ) then
    raise exception 'Você não possui acesso a esta barbearia.';
  end if;

  if not exists (
    select 1
    from public.servicos s
    where s.id = p_servico_id
      and s.barbearia_id = p_barbearia_id
  ) then
    raise exception 'Serviço inválido.';
  end if;

  if not exists (
    select 1
    from public.profissionais p
    where p.id = p_profissional_id
      and p.barbearia_id = p_barbearia_id
      and p.ativo = true
  ) then
    raise exception 'Profissional inválido ou inativo.';
  end if;

  select s.duracao
  into v_duracao
  from public.servicos s
  where s.id = p_servico_id;

  if p_data_hora <= now() then
    raise exception 'O agendamento deve ser feito para um horário futuro.';
  end if;

  if v_cliente_id is null then
    if nullif(trim(coalesce(p_cliente_nome, '')), '') is null then
      raise exception 'Informe o nome do cliente.';
    end if;

    insert into public.clientes (
      profile_id,
      nome,
      telefone,
      email
    )
    values (
      null,
      trim(p_cliente_nome),
      nullif(
        regexp_replace(
          coalesce(p_cliente_telefone, ''),
          '\D',
          '',
          'g'
        ),
        ''
      ),
      null
    )
    returning id, nome, telefone
    into v_cliente_id, v_cliente_nome, v_cliente_telefone;
  else
    select c.nome, c.telefone
    into v_cliente_nome, v_cliente_telefone
    from public.clientes c
    where c.id = v_cliente_id;

    if v_cliente_nome is null then
      raise exception 'Cliente inválido.';
    end if;
  end if;

  insert into public.clientes_barbearias (
    cliente_id,
    barbearia_id
  )
  values (
    v_cliente_id,
    p_barbearia_id
  )
  on conflict do nothing;

  v_lock_key := hashtextextended(
    p_barbearia_id::text
      || ':'
      || p_profissional_id::text
      || ':'
      || p_data_hora::date::text,
    0
  );

  perform pg_advisory_xact_lock(v_lock_key);

  v_fim :=
    p_data_hora
      + make_interval(
          mins => greatest(
            coalesce(v_duracao, 30),
            1
          )
        );

  if exists (
    select 1
    from public.agendamentos a
    join public.servicos s_existente
      on s_existente.id = a.servico_id
    where a.barbearia_id = p_barbearia_id
      and a.profissional_id = p_profissional_id
      and a.status in ('pendente', 'confirmado')
      and a.arquivado = false
      and tstzrange(
        a.data_hora,
        a.data_hora
          + make_interval(
              mins => greatest(
                coalesce(s_existente.duracao, 30),
                1
              )
            ),
        '[)'
      )
      &&
      tstzrange(
        p_data_hora,
        v_fim,
        '[)'
      )
  ) then
    raise exception 'Esse horário não está mais disponível.';
  end if;

  if not exists (
    select 1
    from public.buscar_horarios_disponiveis_painel(
      p_barbearia_id,
      p_profissional_id,
      p_servico_id,
      (
        p_data_hora
          at time zone (
            select b.timezone
            from public.barbearias b
            where b.id = p_barbearia_id
          )
      )::date
    ) h
    where h.data_hora = p_data_hora
  ) then
    raise exception 'O horário selecionado não está disponível.';
  end if;

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
    coalesce(v_cliente_nome, trim(p_cliente_nome)),
    coalesce(
      v_cliente_telefone,
      nullif(
        regexp_replace(
          coalesce(p_cliente_telefone, ''),
          '\D',
          '',
          'g'
        ),
        ''
      )
    ),
    false,
    null
  )
  returning *
  into v_agendamento;

  return v_agendamento;
end;
$$;

revoke all on function public.criar_agendamento_painel(
  uuid, uuid, text, text, uuid, uuid, timestamptz
) from public;

grant execute on function public.criar_agendamento_painel(
  uuid, uuid, text, text, uuid, uuid, timestamptz
) to authenticated;


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
begin
  if auth.uid() is null then
    raise exception 'Usuário não autenticado.';
  end if;

  if p_status not in (
    'pendente',
    'confirmado',
    'concluido',
    'cancelado'
  ) then
    raise exception 'Status inválido.';
  end if;

  update public.agendamentos a
  set
    status = p_status,
    arquivado =
      case
        when p_status in ('concluido', 'cancelado')
          then a.arquivado
        else false
      end
  where a.id = p_agendamento_id
    and exists (
      select 1
      from public.barbearias b
      where b.id = a.barbearia_id
        and b.dono_id = auth.uid()
    )
  returning a.*
  into v_agendamento;

  if v_agendamento.id is null then
    raise exception 'Agendamento não encontrado.';
  end if;

  return v_agendamento;
end;
$$;

revoke all on function public.atualizar_status_agendamento_painel(
  uuid, text
) from public;

grant execute on function public.atualizar_status_agendamento_painel(
  uuid, text
) to authenticated;

-- BarberHub
-- Migration 010: módulo de serviços
-- Executar após 009_agendamentos.sql.
--
-- Esta migration:
-- - adiciona controle ativo/inativo aos serviços;
-- - cria índice otimizado para serviços ativos;
-- - impede novos agendamentos com serviço inativo;
-- - impede exclusão direta de serviços pelo frontend;
-- - preserva o histórico comercial.

-- =========================================================
-- 1. STATUS DO SERVIÇO
-- =========================================================

alter table public.servicos
add column if not exists ativo boolean
not null
default true;


-- =========================================================
-- 2. ÍNDICE DE SERVIÇOS ATIVOS
-- =========================================================
--
-- Usado principalmente por:
--
-- catálogo do cliente
-- novo agendamento
-- painel da barbearia

create index if not exists idx_servicos_barbearia_ativos
on public.servicos (
  barbearia_id,
  nome
)
where ativo = true;


-- =========================================================
-- 3. VALIDAR SERVIÇO DOS AGENDAMENTOS
-- =========================================================
--
-- Substitui a validação criada anteriormente.
--
-- Para NOVOS agendamentos, o serviço precisa:
--
-- - existir;
-- - pertencer à mesma barbearia;
-- - estar ativo.
--
-- Agendamentos históricos continuam podendo apontar
-- para serviços posteriormente desativados.

create or replace function public.validate_agendamento_relations()
returns trigger
language plpgsql
set search_path = public
as $$
begin

  -- =======================================================
  -- SERVIÇO
  -- =======================================================

  if not exists (
    select 1
    from public.servicos s

    where s.id =
            new.servico_id

      and s.barbearia_id =
            new.barbearia_id
  ) then

    raise exception
      'Serviço não pertence à barbearia do agendamento.';

  end if;


  -- Serviço inativo só é bloqueado:
  --
  -- 1. em um novo agendamento;
  -- 2. quando o serviço do agendamento é alterado.
  --
  -- Isso preserva agendamentos históricos de serviços
  -- que foram desativados depois do atendimento.

  if tg_op = 'INSERT'
     or new.servico_id
        is distinct from old.servico_id then

    if not exists (
      select 1
      from public.servicos s

      where s.id =
              new.servico_id

        and s.barbearia_id =
              new.barbearia_id

        and s.ativo = true
    ) then

      raise exception
        'Serviço inválido ou inativo.';

    end if;

  end if;


  -- =======================================================
  -- PROFISSIONAL
  -- =======================================================

  if new.profissional_id is not null
     and not exists (
       select 1
       from public.profissionais p

       where p.id =
               new.profissional_id

         and p.barbearia_id =
               new.barbearia_id
     ) then

    raise exception
      'Profissional não pertence à barbearia do agendamento.';

  end if;


  return new;
end;
$$;


revoke all
on function public.validate_agendamento_relations()
from public;


-- O trigger já existe desde a migration 005.
-- Recriamos apenas para garantir a definição correta.

drop trigger if exists trg_agendamentos_validar_relacoes
on public.agendamentos;


create trigger trg_agendamentos_validar_relacoes
before insert
or update of
  barbearia_id,
  servico_id,
  profissional_id
on public.agendamentos
for each row
execute function public.validate_agendamento_relations();


-- =========================================================
-- 4. DISPONIBILIDADE DO PAINEL
-- =========================================================
--
-- A busca do painel recebe o ID do serviço.
-- Portanto já podemos impedir que um serviço inativo
-- gere horários disponíveis.

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

  v_agora timestamptz :=
    now();
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

  where b.id =
    p_barbearia_id;


  if v_timezone is null then
    raise exception
      'Barbearia não encontrada.';
  end if;


  -- =======================================================
  -- SERVIÇO ATIVO
  -- =======================================================

  select s.duracao
  into v_duracao

  from public.servicos s

  where s.id =
          p_servico_id

    and s.barbearia_id =
          p_barbearia_id

    and s.ativo = true;


  if v_duracao is null
     or v_duracao <= 0 then

    raise exception
      'Serviço inválido ou inativo.';

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

  where h.barbearia_id =
          p_barbearia_id

    and h.dia_semana =
          v_dia_semana

  limit 1;


  if not found
     or not coalesce(
       v_barbearia_aberto,
       false
     )
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
     and not coalesce(
       v_prof_aberto,
       false
     ) then

    return;

  end if;


  -- =======================================================
  -- INTERSEÇÃO DOS HORÁRIOS
  -- =======================================================

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

      -- Intervalo geral.

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

      -- Intervalo profissional.

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

      -- Agendamento conflitante.

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

          and a.arquivado =
                false

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
-- 5. PROTEGER EXCLUSÃO DE SERVIÇOS
-- =========================================================
--
-- O BarberHub utiliza desativação em vez de exclusão.
--
-- Assim:
--
-- ativo = false
--
-- preserva agendamentos e histórico financeiro.

drop policy if exists "servicos_delete_dono"
on public.servicos;


revoke delete
on table public.servicos
from authenticated;
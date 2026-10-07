-- BarberHub
-- Migration 012: profissionais e proteção de histórico
-- Executar após 011_google_oauth.sql.
--
-- Esta migration:
-- - otimiza consultas de profissionais ativos;
-- - preserva histórico de profissionais;
-- - utiliza desativação em vez de exclusão;
-- - mantém horários individuais preparados para uso;
-- - não recria as RPCs de agenda já corrigidas nas migrations 009 e 010.

-- =========================================================
-- 1. ÍNDICE DE PROFISSIONAIS ATIVOS
-- =========================================================

create index if not exists idx_profissionais_barbearia_ativos_nome
on public.profissionais (
  barbearia_id,
  nome
)
where ativo = true;


-- =========================================================
-- 2. ÍNDICE DE HORÁRIOS POR PROFISSIONAL
-- =========================================================
--
-- A constraint UNIQUE já garante profissional + dia,
-- mas este índice ajuda consultas que procuram profissionais
-- com configuração aberta por dia.

create index if not exists idx_horarios_profissionais_abertos
on public.horarios_profissionais (
  profissional_id,
  dia_semana
)
where aberto = true;


-- =========================================================
-- 3. PRESERVAR HISTÓRICO DO PROFISSIONAL
-- =========================================================
--
-- O fluxo oficial do BarberHub utiliza:
--
-- ativo = true
-- ativo = false
--
-- em vez de excluir o registro.
--
-- Isso preserva:
-- - agendamentos históricos;
-- - relatórios;
-- - financeiro;
-- - avaliações;
-- - futura comissão do profissional.

drop policy if exists "profissionais_delete_dono"
on public.profissionais;


revoke delete
on table public.profissionais
from authenticated;


-- =========================================================
-- 4. VALIDAÇÃO DE PROFISSIONAL EM NOVOS AGENDAMENTOS
-- =========================================================
--
-- Profissional inativo não pode receber novos agendamentos.
--
-- Agendamentos antigos continuam válidos mesmo que o
-- profissional seja desativado depois.

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

  if new.profissional_id is not null then

    -- Sempre precisa pertencer à mesma barbearia.

    if not exists (
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


    -- Em novos agendamentos ou troca de profissional,
    -- exige profissional ativo.

    if tg_op = 'INSERT'
       or new.profissional_id
          is distinct from old.profissional_id then

      if not exists (
        select 1

        from public.profissionais p

        where p.id =
                new.profissional_id

          and p.barbearia_id =
                new.barbearia_id

          and p.ativo = true
      ) then

        raise exception
          'Profissional inválido ou inativo.';

      end if;

    end if;

  end if;


  return new;

end;
$$;


revoke all
on function public.validate_agendamento_relations()
from public;


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
-- 5. GARANTIR CONSISTÊNCIA DOS HORÁRIOS
-- =========================================================
--
-- Quando aberto = false:
-- os horários podem permanecer nulos.
--
-- Quando aberto = true:
-- se início e fim forem informados,
-- início precisa ser anterior ao fim.
--
-- As constraints principais já nasceram na migration 001.
-- Aqui validamos a estrutura esperada.

do $$
begin

  if not exists (
    select 1

    from pg_constraint c

    join pg_class t
      on t.oid =
         c.conrelid

    join pg_namespace n
      on n.oid =
         t.relnamespace

    where n.nspname =
            'public'

      and t.relname =
            'horarios_profissionais'

      and c.conname =
            'horarios_profissionais_dia_unique'
  ) then

    raise exception
      'Constraint de dia único dos horários profissionais não encontrada.';

  end if;

end
$$;
-- BarberHub
-- Migration 005: triggers e automações de integridade
-- Executar após:
-- 001_base_schema.sql
-- 002_indexes.sql
-- 003_rls.sql
-- 004_functions.sql

-- =========================================================
-- 1. UPDATED_AT GENÉRICO
-- =========================================================

create or replace function public.set_updated_at()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

revoke all
on function public.set_updated_at()
from public;


-- Push subscriptions

drop trigger if exists trg_push_subscriptions_updated_at
on public.push_subscriptions;

create trigger trg_push_subscriptions_updated_at
before update
on public.push_subscriptions
for each row
execute function public.set_updated_at();


-- Preferências de notificações

drop trigger if exists trg_preferencias_notificacoes_updated_at
on public.preferencias_notificacoes;

create trigger trg_preferencias_notificacoes_updated_at
before update
on public.preferencias_notificacoes
for each row
execute function public.set_updated_at();


-- =========================================================
-- PEDIDOS
-- =========================================================
--
-- pedidos utiliza atualizado_at em vez de updated_at.

create or replace function public.set_pedido_atualizado_at()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  new.atualizado_at := now();
  return new;
end;
$$;

revoke all
on function public.set_pedido_atualizado_at()
from public;


drop trigger if exists trg_pedidos_atualizado_at
on public.pedidos;

create trigger trg_pedidos_atualizado_at
before update
on public.pedidos
for each row
execute function public.set_pedido_atualizado_at();


-- =========================================================
-- 2. CRIAR PROFILE APÓS AUTH.USERS
-- =========================================================
--
-- Existem três papéis oficiais:
--
-- dono
-- cliente
-- profissional
--
-- IMPORTANTE:
--
-- Não existe fallback automático para "cliente".
--
-- Se o provedor de autenticação, como Google OAuth,
-- criar auth.users sem um tipo explicitamente definido,
-- esta função NÃO cria o profile.
--
-- O profile será criado posteriormente pelo fluxo seguro
-- de onboarding/finalização de login.
--
-- Isso evita transformar acidentalmente um novo dono ou
-- profissional em cliente.
--
-- Quando o tipo estiver presente e válido, o profile pode
-- ser criado imediatamente.
--
-- Para o nome tentamos, nesta ordem:
--
-- nome
-- full_name
-- name
--
-- Isso permite aproveitar os dados fornecidos pelo Google.

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public, auth
as $$
declare
  v_tipo text;
  v_nome text;
  v_telefone text;
begin

  v_tipo :=
    nullif(
      trim(
        coalesce(
          new.raw_user_meta_data ->> 'tipo',
          ''
        )
      ),
      ''
    );


  -- Se ainda não existe papel definido,
  -- deixamos somente auth.users ser criado.
  --
  -- O onboarding finalizará o cadastro posteriormente.

  if v_tipo is null then
    return new;
  end if;


  -- Nunca convertemos silenciosamente um tipo inválido
  -- para outro papel.

  if v_tipo not in (
    'dono',
    'cliente',
    'profissional'
  ) then
    raise exception
      'Tipo de conta inválido.';
  end if;


  -- Nome enviado diretamente pelo BarberHub
  -- ou proveniente do Google OAuth.

  v_nome :=
    nullif(
      trim(
        coalesce(
          new.raw_user_meta_data ->> 'nome',
          new.raw_user_meta_data ->> 'full_name',
          new.raw_user_meta_data ->> 'name',
          ''
        )
      ),
      ''
    );


  v_telefone :=
    nullif(
      trim(
        coalesce(
          new.raw_user_meta_data ->> 'telefone',
          new.raw_user_meta_data ->> 'phone',
          ''
        )
      ),
      ''
    );


  insert into public.profiles (
    id,
    nome,
    telefone,
    tipo
  )
  values (
    new.id,
    v_nome,
    v_telefone,
    v_tipo
  )
  on conflict (id)
  do nothing;


  return new;
end;
$$;


revoke all
on function public.handle_new_user()
from public;


drop trigger if exists on_auth_user_created
on auth.users;

create trigger on_auth_user_created
after insert
on auth.users
for each row
execute function public.handle_new_user();


-- =========================================================
-- 3. CRIAR PREFERÊNCIAS PADRÃO DE NOTIFICAÇÃO
-- =========================================================
--
-- As preferências só são criadas quando o profile
-- realmente existir.
--
-- Portanto, no Google OAuth:
--
-- auth.users
--     ↓
-- onboarding/finalização
--     ↓
-- profiles
--     ↓
-- preferências

create or replace function public.handle_new_profile_preferences()
returns trigger
language plpgsql
security definer
set search_path = public, auth
as $$
begin

  insert into public.preferencias_notificacoes (
    usuario_id
  )
  values (
    new.id
  )
  on conflict (
    usuario_id
  )
  do nothing;


  return new;
end;
$$;


revoke all
on function public.handle_new_profile_preferences()
from public;


drop trigger if exists trg_profile_criar_preferencias
on public.profiles;

create trigger trg_profile_criar_preferencias
after insert
on public.profiles
for each row
execute function public.handle_new_profile_preferences();


-- =========================================================
-- 4. GARANTIR CONSISTÊNCIA DOS PEDIDOS
-- =========================================================
--
-- Controla:
--
-- confirmado_at
-- concluido_at
-- arquivado_at
-- devolução de estoque
--
-- O estoque é reservado no momento da criação do pedido.
--
-- Quando ocorre a primeira transição para cancelado,
-- o estoque é devolvido exatamente uma vez.
--
-- Um pedido cancelado ou concluído não pode retornar
-- para um estado ativo.

create or replace function public.handle_pedido_status()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin

  -- =======================================================
  -- CONFIRMADO
  -- =======================================================

  if new.status = 'confirmado'
     and old.status is distinct from 'confirmado'
     and new.confirmado_at is null then

    new.confirmado_at :=
      now();

  end if;


  -- =======================================================
  -- CONCLUÍDO
  -- =======================================================

  if new.status = 'concluido'
     and old.status is distinct from 'concluido'
     and new.concluido_at is null then

    new.concluido_at :=
      now();

  end if;


  -- =======================================================
  -- ARQUIVADO
  -- =======================================================

  if new.arquivado = true
     and old.arquivado = false
     and new.arquivado_at is null then

    new.arquivado_at :=
      now();

  end if;


  if new.arquivado = false then
    new.arquivado_at :=
      null;
  end if;


  -- =======================================================
  -- DEVOLVER ESTOQUE
  -- =======================================================
  --
  -- Só acontece durante a primeira transição
  -- para cancelado.

  if new.status = 'cancelado'
     and old.status is distinct from 'cancelado' then

    update public.produtos

    set estoque =
      estoque + old.quantidade

    where id =
      old.produto_id;

  end if;


  -- =======================================================
  -- ESTADOS FINAIS
  -- =======================================================

  if old.status = 'cancelado'
     and new.status <> 'cancelado' then

    raise exception
      'Pedido cancelado não pode voltar para outro status.';

  end if;


  if old.status = 'concluido'
     and new.status <> 'concluido' then

    raise exception
      'Pedido concluído não pode voltar para outro status.';

  end if;


  return new;
end;
$$;


revoke all
on function public.handle_pedido_status()
from public;


drop trigger if exists trg_pedidos_status
on public.pedidos;

create trigger trg_pedidos_status
before update
on public.pedidos
for each row
execute function public.handle_pedido_status();


-- =========================================================
-- 5. GARANTIR CONSISTÊNCIA DOS AGENDAMENTOS
-- =========================================================

create or replace function public.handle_agendamento_archive()
returns trigger
language plpgsql
set search_path = public
as $$
begin

  -- =======================================================
  -- ARQUIVAMENTO
  -- =======================================================

  if new.arquivado = true
     and old.arquivado = false
     and new.arquivado_at is null then

    new.arquivado_at :=
      now();

  end if;


  if new.arquivado = false then
    new.arquivado_at :=
      null;
  end if;


  -- =======================================================
  -- ESTADOS FINAIS
  -- =======================================================

  if old.status = 'cancelado'
     and new.status <> 'cancelado' then

    raise exception
      'Agendamento cancelado não pode voltar para outro status.';

  end if;


  if old.status = 'concluido'
     and new.status <> 'concluido' then

    raise exception
      'Agendamento concluído não pode voltar para outro status.';

  end if;


  return new;
end;
$$;


revoke all
on function public.handle_agendamento_archive()
from public;


drop trigger if exists trg_agendamentos_integridade
on public.agendamentos;

create trigger trg_agendamentos_integridade
before update
on public.agendamentos
for each row
execute function public.handle_agendamento_archive();


-- =========================================================
-- 6. VALIDAR RELAÇÕES DO AGENDAMENTO
-- =========================================================
--
-- Mesmo operações realizadas pelo backend/service_role
-- não podem cruzar serviço ou profissional pertencentes
-- a outra barbearia.

create or replace function public.validate_agendamento_relations()
returns trigger
language plpgsql
set search_path = public
as $$
begin

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
-- 7. VALIDAR RELAÇÃO DO PEDIDO
-- =========================================================

create or replace function public.validate_pedido_relations()
returns trigger
language plpgsql
set search_path = public
as $$
begin

  if not exists (
    select 1

    from public.produtos p

    where p.id =
            new.produto_id

      and p.barbearia_id =
            new.barbearia_id
  ) then

    raise exception
      'Produto não pertence à barbearia do pedido.';

  end if;


  return new;
end;
$$;


revoke all
on function public.validate_pedido_relations()
from public;


drop trigger if exists trg_pedidos_validar_relacoes
on public.pedidos;

create trigger trg_pedidos_validar_relacoes
before insert
or update of
  produto_id,
  barbearia_id
on public.pedidos
for each row
execute function public.validate_pedido_relations();


-- =========================================================
-- 8. VALIDAR AVALIAÇÃO
-- =========================================================
--
-- Mesmo uma operação realizada por backend/service_role
-- precisa corresponder a um agendamento realmente concluído.

create or replace function public.validate_avaliacao()
returns trigger
language plpgsql
set search_path = public
as $$
begin

  if not exists (
    select 1

    from public.agendamentos a

    where a.id =
            new.agendamento_id

      and a.cliente_id =
            new.cliente_id

      and a.barbearia_id =
            new.barbearia_id

      and a.status =
            'concluido'
  ) then

    raise exception
      'A avaliação não corresponde a um agendamento concluído válido.';

  end if;


  return new;
end;
$$;


revoke all
on function public.validate_avaliacao()
from public;


drop trigger if exists trg_avaliacoes_validar
on public.avaliacoes;

create trigger trg_avaliacoes_validar
before insert
or update
on public.avaliacoes
for each row
execute function public.validate_avaliacao();
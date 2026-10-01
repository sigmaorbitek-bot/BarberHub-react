-- BarberHub React
-- Migration 005: triggers e automações de integridade
-- Executar após 001_base_schema.sql, 002_indexes.sql, 003_rls.sql e 004_functions.sql.
-- Banco novo de desenvolvimento/homologação.

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

-- Push subscriptions
drop trigger if exists trg_push_subscriptions_updated_at
on public.push_subscriptions;

create trigger trg_push_subscriptions_updated_at
before update on public.push_subscriptions
for each row
execute function public.set_updated_at();

-- Preferências de notificações
drop trigger if exists trg_preferencias_notificacoes_updated_at
on public.preferencias_notificacoes;

create trigger trg_preferencias_notificacoes_updated_at
before update on public.preferencias_notificacoes
for each row
execute function public.set_updated_at();

-- Pedidos usam atualizado_at (nome diferente de updated_at)
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

drop trigger if exists trg_pedidos_atualizado_at
on public.pedidos;

create trigger trg_pedidos_atualizado_at
before update on public.pedidos
for each row
execute function public.set_pedido_atualizado_at();

-- =========================================================
-- 2. CRIAR PROFILE AUTOMATICAMENTE APÓS AUTH.USERS
-- =========================================================
-- O frontend pode enviar:
-- options.data.nome
-- options.data.telefone
-- options.data.tipo
--
-- Segurança:
-- mesmo que alguém tente cadastrar tipo inesperado,
-- somente 'dono' ou 'cliente' são aceitos.

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public, auth
as $$
declare
  v_tipo text;
begin
  v_tipo := coalesce(new.raw_user_meta_data ->> 'tipo', 'cliente');

  if v_tipo not in ('dono', 'cliente') then
    v_tipo := 'cliente';
  end if;

  insert into public.profiles (
    id,
    nome,
    telefone,
    tipo
  )
  values (
    new.id,
    nullif(trim(new.raw_user_meta_data ->> 'nome'), ''),
    nullif(trim(new.raw_user_meta_data ->> 'telefone'), ''),
    v_tipo
  )
  on conflict (id) do nothing;

  return new;
end;
$$;

drop trigger if exists on_auth_user_created
on auth.users;

create trigger on_auth_user_created
after insert on auth.users
for each row
execute function public.handle_new_user();

-- =========================================================
-- 3. CRIAR PREFERÊNCIAS PADRÃO DE NOTIFICAÇÃO
-- =========================================================

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
  on conflict (usuario_id) do nothing;

  return new;
end;
$$;

drop trigger if exists trg_profile_criar_preferencias
on public.profiles;

create trigger trg_profile_criar_preferencias
after insert on public.profiles
for each row
execute function public.handle_new_profile_preferences();

-- =========================================================
-- 4. GARANTIR CONSISTÊNCIA DE PEDIDOS
-- =========================================================
-- Controla:
-- - confirmado_at
-- - concluido_at
-- - arquivado_at
-- - devolução de estoque ao cancelar
--
-- Regra adotada:
-- estoque é reservado na criação do pedido (migration 004).
-- Ao cancelar, o estoque é devolvido exatamente uma vez.

create or replace function public.handle_pedido_status()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  -- Confirmado
  if new.status = 'confirmado'
     and old.status is distinct from 'confirmado'
     and new.confirmado_at is null then
    new.confirmado_at := now();
  end if;

  -- Concluído
  if new.status = 'concluido'
     and old.status is distinct from 'concluido'
     and new.concluido_at is null then
    new.concluido_at := now();
  end if;

  -- Arquivado
  if new.arquivado = true
     and old.arquivado = false
     and new.arquivado_at is null then
    new.arquivado_at := now();
  end if;

  if new.arquivado = false then
    new.arquivado_at := null;
  end if;

  -- Devolver estoque apenas na transição para cancelado.
  if new.status = 'cancelado'
     and old.status is distinct from 'cancelado' then
    update public.produtos
    set estoque = estoque + old.quantidade
    where id = old.produto_id;
  end if;

  -- Evitar sair de cancelado para outro estado.
  if old.status = 'cancelado'
     and new.status <> 'cancelado' then
    raise exception 'Pedido cancelado não pode voltar para outro status.';
  end if;

  -- Evitar sair de concluído.
  if old.status = 'concluido'
     and new.status <> 'concluido' then
    raise exception 'Pedido concluído não pode voltar para outro status.';
  end if;

  return new;
end;
$$;

drop trigger if exists trg_pedidos_status
on public.pedidos;

create trigger trg_pedidos_status
before update on public.pedidos
for each row
execute function public.handle_pedido_status();

-- =========================================================
-- 5. GARANTIR CONSISTÊNCIA DE AGENDAMENTOS
-- =========================================================

create or replace function public.handle_agendamento_archive()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if new.arquivado = true
     and old.arquivado = false
     and new.arquivado_at is null then
    new.arquivado_at := now();
  end if;

  if new.arquivado = false then
    new.arquivado_at := null;
  end if;

  -- Estados finais não voltam para estados ativos.
  if old.status = 'cancelado'
     and new.status <> 'cancelado' then
    raise exception 'Agendamento cancelado não pode voltar para outro status.';
  end if;

  if old.status = 'concluido'
     and new.status <> 'concluido' then
    raise exception 'Agendamento concluído não pode voltar para outro status.';
  end if;

  return new;
end;
$$;

drop trigger if exists trg_agendamentos_integridade
on public.agendamentos;

create trigger trg_agendamentos_integridade
before update on public.agendamentos
for each row
execute function public.handle_agendamento_archive();

-- =========================================================
-- 6. VALIDAR BARBEARIA DO SERVIÇO/PROFISSIONAL NO AGENDAMENTO
-- =========================================================
-- Mesmo que um INSERT/UPDATE venha de backend/service_role,
-- o banco impede cruzar entidades de barbearias diferentes.

create or replace function public.validate_agendamento_relations()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if not exists (
    select 1
    from public.servicos s
    where s.id = new.servico_id
      and s.barbearia_id = new.barbearia_id
  ) then
    raise exception 'Serviço não pertence à barbearia do agendamento.';
  end if;

  if new.profissional_id is not null
     and not exists (
       select 1
       from public.profissionais p
       where p.id = new.profissional_id
         and p.barbearia_id = new.barbearia_id
     ) then
    raise exception 'Profissional não pertence à barbearia do agendamento.';
  end if;

  return new;
end;
$$;

drop trigger if exists trg_agendamentos_validar_relacoes
on public.agendamentos;

create trigger trg_agendamentos_validar_relacoes
before insert or update of barbearia_id, servico_id, profissional_id
on public.agendamentos
for each row
execute function public.validate_agendamento_relations();

-- =========================================================
-- 7. VALIDAR PRODUTO DO PEDIDO
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
    where p.id = new.produto_id
      and p.barbearia_id = new.barbearia_id
  ) then
    raise exception 'Produto não pertence à barbearia do pedido.';
  end if;

  return new;
end;
$$;

drop trigger if exists trg_pedidos_validar_relacoes
on public.pedidos;

create trigger trg_pedidos_validar_relacoes
before insert or update of produto_id, barbearia_id
on public.pedidos
for each row
execute function public.validate_pedido_relations();

-- =========================================================
-- 8. VALIDAR AVALIAÇÃO
-- =========================================================
-- Garante consistência mesmo fora das policies/RLS.

create or replace function public.validate_avaliacao()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if not exists (
    select 1
    from public.agendamentos a
    where a.id = new.agendamento_id
      and a.cliente_id = new.cliente_id
      and a.barbearia_id = new.barbearia_id
      and a.status = 'concluido'
  ) then
    raise exception 'A avaliação não corresponde a um agendamento concluído válido.';
  end if;

  return new;
end;
$$;

drop trigger if exists trg_avaliacoes_validar
on public.avaliacoes;

create trigger trg_avaliacoes_validar
before insert or update
on public.avaliacoes
for each row
execute function public.validate_avaliacao();

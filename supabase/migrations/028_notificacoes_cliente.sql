-- BarberHub React
-- Migration 028: notificações do cliente
-- Executar após 027_contas_receber.sql.

create or replace function public.listar_notificacoes_cliente(
  p_limite integer default 100
)
returns table (
  notificacao_id uuid,
  barbearia_id uuid,
  barbearia_nome text,
  barbearia_logo_url text,
  tipo text,
  titulo text,
  mensagem text,
  referencia_id uuid,
  rota text,
  dados jsonb,
  lida boolean,
  created_at timestamptz
)
language plpgsql
security definer
set search_path = public, auth
as $$
begin
  if auth.uid() is null then
    raise exception 'Usuário não autenticado.';
  end if;

  if not exists (
    select 1
    from public.profiles p
    where p.id = auth.uid()
      and p.tipo = 'cliente'
  ) then
    raise exception 'Esta função é exclusiva para clientes.';
  end if;

  return query
  select
    n.id,
    n.barbearia_id,
    b.nome,
    b.logo_url,
    n.tipo,
    n.titulo,
    n.mensagem,
    n.referencia_id,
    n.rota,
    n.dados,
    n.lida,
    n.created_at
  from public.notificacoes n
  left join public.barbearias b
    on b.id = n.barbearia_id
  where n.usuario_id = auth.uid()
  order by n.created_at desc
  limit greatest(1, least(coalesce(p_limite, 100), 200));
end;
$$;

revoke all on function public.listar_notificacoes_cliente(integer)
from public;

grant execute on function public.listar_notificacoes_cliente(integer)
to authenticated;


create or replace function public.marcar_todas_notificacoes_cliente_lidas()
returns void
language plpgsql
security definer
set search_path = public, auth
as $$
begin
  if auth.uid() is null then
    raise exception 'Usuário não autenticado.';
  end if;

  if not exists (
    select 1
    from public.profiles p
    where p.id = auth.uid()
      and p.tipo = 'cliente'
  ) then
    raise exception 'Esta função é exclusiva para clientes.';
  end if;

  update public.notificacoes
  set lida = true
  where usuario_id = auth.uid()
    and lida = false;
end;
$$;

revoke all on function public.marcar_todas_notificacoes_cliente_lidas()
from public;

grant execute on function public.marcar_todas_notificacoes_cliente_lidas()
to authenticated;


create or replace function public.notificar_cliente_agendamento_update()
returns trigger
language plpgsql
security definer
set search_path = public, auth
as $$
declare
  v_usuario_id uuid;
  v_barbearia_nome text;
  v_servico_nome text;
  v_titulo text;
  v_mensagem text;
begin
  if old.status is not distinct from new.status then
    return new;
  end if;

  select c.profile_id
  into v_usuario_id
  from public.clientes c
  where c.id = new.cliente_id;

  if v_usuario_id is null then
    return new;
  end if;

  -- Não cria aviso para uma alteração feita pelo próprio cliente.
  if auth.uid() is not null and auth.uid() = v_usuario_id then
    return new;
  end if;

  select b.nome
  into v_barbearia_nome
  from public.barbearias b
  where b.id = new.barbearia_id;

  select s.nome
  into v_servico_nome
  from public.servicos s
  where s.id = new.servico_id;

  if new.status = 'confirmado' then
    v_titulo := '✅ Agendamento confirmado';
    v_mensagem :=
      coalesce(v_barbearia_nome, 'A barbearia')
      || ' confirmou seu agendamento de '
      || coalesce(v_servico_nome, 'serviço')
      || '.';
  elsif new.status = 'cancelado' then
    v_titulo := '❌ Agendamento cancelado';
    v_mensagem :=
      coalesce(v_barbearia_nome, 'A barbearia')
      || ' cancelou seu agendamento de '
      || coalesce(v_servico_nome, 'serviço')
      || '.';
  elsif new.status = 'concluido' then
    v_titulo := '✂️ Atendimento concluído';
    v_mensagem :=
      'Seu atendimento de '
      || coalesce(v_servico_nome, 'serviço')
      || ' em '
      || coalesce(v_barbearia_nome, 'uma barbearia')
      || ' foi concluído.';
  else
    return new;
  end if;

  insert into public.notificacoes (
    usuario_id,
    barbearia_id,
    tipo,
    titulo,
    mensagem,
    referencia_id,
    rota,
    dados,
    lida
  )
  values (
    v_usuario_id,
    new.barbearia_id,
    case new.status
      when 'confirmado' then 'agendamento_confirmado'
      when 'cancelado' then 'agendamento_cancelado'
      when 'concluido' then 'agendamento_concluido'
      else 'agendamento_alterado'
    end,
    v_titulo,
    v_mensagem,
    new.id,
    '/cliente/agendamentos',
    jsonb_build_object(
      'agendamento_id', new.id,
      'status', new.status,
      'data_hora', new.data_hora
    ),
    false
  );

  return new;
end;
$$;

drop trigger if exists trg_notificar_cliente_agendamento_update
on public.agendamentos;

create trigger trg_notificar_cliente_agendamento_update
after update of status on public.agendamentos
for each row
execute function public.notificar_cliente_agendamento_update();


create or replace function public.notificar_cliente_pedido_update()
returns trigger
language plpgsql
security definer
set search_path = public, auth
as $$
declare
  v_usuario_id uuid;
  v_barbearia_nome text;
  v_produto_nome text;
  v_titulo text;
  v_mensagem text;
begin
  if old.status is not distinct from new.status then
    return new;
  end if;

  select c.profile_id
  into v_usuario_id
  from public.clientes c
  where c.id = new.cliente_id;

  if v_usuario_id is null then
    return new;
  end if;

  if auth.uid() is not null and auth.uid() = v_usuario_id then
    return new;
  end if;

  select b.nome
  into v_barbearia_nome
  from public.barbearias b
  where b.id = new.barbearia_id;

  select p.nome
  into v_produto_nome
  from public.produtos p
  where p.id = new.produto_id;

  if new.status = 'confirmado' then
    v_titulo := '✅ Pedido confirmado';
    v_mensagem :=
      coalesce(v_barbearia_nome, 'A barbearia')
      || ' confirmou seu pedido de '
      || coalesce(v_produto_nome, 'produto')
      || '.';
  elsif new.status = 'concluido' then
    v_titulo := '📦 Pedido concluído';
    v_mensagem :=
      'Seu pedido de '
      || coalesce(v_produto_nome, 'produto')
      || ' foi concluído.';
  elsif new.status = 'cancelado' then
    v_titulo := '❌ Pedido cancelado';
    v_mensagem :=
      coalesce(v_barbearia_nome, 'A barbearia')
      || ' cancelou seu pedido de '
      || coalesce(v_produto_nome, 'produto')
      || '.';
  else
    return new;
  end if;

  insert into public.notificacoes (
    usuario_id,
    barbearia_id,
    tipo,
    titulo,
    mensagem,
    referencia_id,
    rota,
    dados,
    lida
  )
  values (
    v_usuario_id,
    new.barbearia_id,
    'pedido_atualizado',
    v_titulo,
    v_mensagem,
    new.id,
    '/cliente/pedidos',
    jsonb_build_object(
      'pedido_id', new.id,
      'status', new.status
    ),
    false
  );

  return new;
end;
$$;

drop trigger if exists trg_notificar_cliente_pedido_update
on public.pedidos;

create trigger trg_notificar_cliente_pedido_update
after update of status on public.pedidos
for each row
execute function public.notificar_cliente_pedido_update();

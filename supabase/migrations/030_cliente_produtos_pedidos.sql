-- BarberHub React
-- Migration 030: produtos e pedidos no painel do cliente
-- Executar após 029_contador_notificacoes_cliente.sql.

create or replace function public.listar_produtos_cliente(
  p_busca text default null
)
returns table (
  produto_id uuid,
  nome text,
  descricao text,
  preco numeric,
  estoque integer,
  foto_url text,
  barbearia_id uuid,
  barbearia_nome text,
  barbearia_logo_url text,
  barbearia_cidade text
)
language plpgsql
security definer
set search_path = public, auth
as $$
declare
  v_busca text;
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
    raise exception 'A conta autenticada não é um cliente.';
  end if;

  v_busca := nullif(trim(coalesce(p_busca, '')), '');

  return query
  select
    pr.id,
    pr.nome,
    pr.descricao,
    pr.preco,
    pr.estoque,
    pr.foto_url,
    b.id,
    b.nome,
    b.logo_url,
    b.cidade
  from public.produtos pr
  join public.barbearias b
    on b.id = pr.barbearia_id
  where pr.ativo = true
    and (
      v_busca is null
      or pr.nome ilike '%' || v_busca || '%'
      or coalesce(pr.descricao, '') ilike '%' || v_busca || '%'
      or b.nome ilike '%' || v_busca || '%'
    )
  order by
    case when pr.estoque > 0 then 0 else 1 end,
    b.nome asc,
    pr.nome asc;
end;
$$;

revoke all on function public.listar_produtos_cliente(text) from public;
grant execute on function public.listar_produtos_cliente(text) to authenticated;


create or replace function public.listar_pedidos_cliente()
returns table (
  pedido_id uuid,
  produto_id uuid,
  produto_nome text,
  produto_foto_url text,
  barbearia_id uuid,
  barbearia_nome text,
  barbearia_logo_url text,
  quantidade integer,
  preco_unitario numeric,
  total numeric,
  status text,
  origem_pedido text,
  forma_pagamento text,
  observacoes text,
  arquivado boolean,
  created_at timestamptz,
  confirmado_at timestamptz,
  concluido_at timestamptz
)
language plpgsql
security definer
set search_path = public, auth
as $$
declare
  v_cliente_id uuid;
begin
  if auth.uid() is null then
    raise exception 'Usuário não autenticado.';
  end if;

  v_cliente_id := public.cliente_atual_id();

  if v_cliente_id is null then
    raise exception 'A conta autenticada não possui cadastro de cliente.';
  end if;

  return query
  select
    pe.id,
    pr.id,
    pr.nome,
    pr.foto_url,
    b.id,
    b.nome,
    b.logo_url,
    pe.quantidade,
    pe.preco_unitario,
    (pe.quantidade * pe.preco_unitario)::numeric,
    pe.status,
    pe.origem_pedido,
    pe.forma_pagamento,
    pe.observacoes,
    pe.arquivado,
    pe.created_at,
    pe.confirmado_at,
    pe.concluido_at
  from public.pedidos pe
  join public.produtos pr
    on pr.id = pe.produto_id
  join public.barbearias b
    on b.id = pe.barbearia_id
  where pe.cliente_id = v_cliente_id
  order by pe.created_at desc;
end;
$$;

revoke all on function public.listar_pedidos_cliente() from public;
grant execute on function public.listar_pedidos_cliente() to authenticated;


create or replace function public.cancelar_pedido_cliente(
  p_pedido_id uuid
)
returns void
language plpgsql
security definer
set search_path = public, auth
as $$
declare
  v_cliente_id uuid;
  v_status text;
begin
  if auth.uid() is null then
    raise exception 'Usuário não autenticado.';
  end if;

  v_cliente_id := public.cliente_atual_id();

  if v_cliente_id is null then
    raise exception 'A conta autenticada não possui cadastro de cliente.';
  end if;

  select pe.status
  into v_status
  from public.pedidos pe
  where pe.id = p_pedido_id
    and pe.cliente_id = v_cliente_id
    and pe.arquivado = false
  for update;

  if not found then
    raise exception 'Pedido não encontrado.';
  end if;

  if v_status <> 'pendente' then
    raise exception 'Somente pedidos pendentes podem ser cancelados pelo cliente.';
  end if;

  update public.pedidos
  set status = 'cancelado'
  where id = p_pedido_id
    and cliente_id = v_cliente_id
    and status = 'pendente'
    and arquivado = false;

  if not found then
    raise exception 'Não foi possível cancelar este pedido.';
  end if;
end;
$$;

revoke all on function public.cancelar_pedido_cliente(uuid) from public;
grant execute on function public.cancelar_pedido_cliente(uuid) to authenticated;

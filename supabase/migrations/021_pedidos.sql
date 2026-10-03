-- BarberHub React
-- Migration 021: módulo de pedidos
-- Executar após 020_produtos.sql.

alter table public.pedidos
add column if not exists forma_pagamento text;

alter table public.pedidos
add column if not exists observacoes text;

create index if not exists idx_pedidos_barbearia_arquivado_status
on public.pedidos (
  barbearia_id,
  arquivado,
  status,
  created_at desc
);

-- Reforça a integridade de status no próprio banco.
create or replace function public.handle_pedido_status()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if old.status is distinct from new.status then
    if old.status = 'pendente'
      and new.status not in ('confirmado', 'cancelado') then
      raise exception
        'Pedido pendente só pode ser confirmado ou cancelado.';
    end if;

    if old.status = 'confirmado'
      and new.status not in ('concluido', 'cancelado') then
      raise exception
        'Pedido confirmado só pode ser concluído ou cancelado.';
    end if;

    if old.status = 'cancelado' then
      raise exception
        'Pedido cancelado não pode voltar para outro status.';
    end if;

    if old.status = 'concluido' then
      raise exception
        'Pedido concluído não pode voltar para outro status.';
    end if;
  end if;

  if new.status = 'confirmado'
    and old.status is distinct from 'confirmado'
    and new.confirmado_at is null then
    new.confirmado_at := now();
  end if;

  if new.status = 'concluido'
    and old.status is distinct from 'concluido'
    and new.concluido_at is null then
    new.concluido_at := now();
  end if;

  if new.status = 'cancelado'
    and old.status is distinct from 'cancelado' then
    update public.produtos
    set estoque = estoque + old.quantidade
    where id = old.produto_id;
  end if;

  if new.arquivado = true
    and old.arquivado = false then
    if new.status not in ('concluido', 'cancelado') then
      raise exception
        'Somente pedidos concluídos ou cancelados podem ser arquivados.';
    end if;

    if new.arquivado_at is null then
      new.arquivado_at := now();
    end if;
  end if;

  if new.arquivado = false then
    new.arquivado_at := null;
  end if;

  return new;
end;
$$;


create or replace function public.listar_pedidos_painel(
  p_barbearia_id uuid
)
returns table (
  pedido_id uuid,
  cliente_id uuid,
  cliente_nome text,
  cliente_telefone text,
  cliente_email text,
  produto_id uuid,
  produto_nome text,
  produto_foto_url text,
  quantidade integer,
  preco_unitario numeric,
  total numeric,
  status text,
  origem_pedido text,
  forma_pagamento text,
  observacoes text,
  arquivado boolean,
  created_at timestamptz,
  atualizado_at timestamptz,
  confirmado_at timestamptz,
  concluido_at timestamptz,
  arquivado_at timestamptz
)
language plpgsql
security definer
set search_path = public, auth
as $$
begin
  if auth.uid() is null then
    raise exception 'Usuário não autenticado.';
  end if;

  if not public.eh_dono_da_barbearia(
    p_barbearia_id
  ) then
    raise exception 'Você não possui acesso a esta barbearia.';
  end if;

  return query
  select
    pe.id,
    c.id,
    coalesce(
      nullif(trim(cb.nome_local), ''),
      c.nome
    ),
    coalesce(
      nullif(trim(cb.telefone_local), ''),
      c.telefone
    ),
    coalesce(
      nullif(trim(cb.email_local), ''),
      c.email
    ),
    pr.id,
    pr.nome,
    pr.foto_url,
    pe.quantidade,
    pe.preco_unitario,
    (
      pe.quantidade *
      pe.preco_unitario
    )::numeric,
    pe.status,
    pe.origem_pedido,
    pe.forma_pagamento,
    pe.observacoes,
    pe.arquivado,
    pe.created_at,
    pe.atualizado_at,
    pe.confirmado_at,
    pe.concluido_at,
    pe.arquivado_at
  from public.pedidos pe
  join public.clientes c
    on c.id = pe.cliente_id
  left join public.clientes_barbearias cb
    on cb.cliente_id = c.id
    and cb.barbearia_id = pe.barbearia_id
  join public.produtos pr
    on pr.id = pe.produto_id
  where pe.barbearia_id = p_barbearia_id
  order by pe.created_at desc;
end;
$$;

revoke all on function public.listar_pedidos_painel(uuid)
from public;

grant execute on function public.listar_pedidos_painel(uuid)
to authenticated;


create or replace function public.criar_pedido_painel(
  p_barbearia_id uuid,
  p_cliente_id uuid,
  p_produto_id uuid,
  p_quantidade integer,
  p_forma_pagamento text default null,
  p_observacoes text default null
)
returns uuid
language plpgsql
security definer
set search_path = public, auth
as $$
declare
  v_produto public.produtos%rowtype;
  v_pedido_id uuid;
  v_pagamento text;
begin
  if auth.uid() is null then
    raise exception 'Usuário não autenticado.';
  end if;

  if not public.eh_dono_da_barbearia(
    p_barbearia_id
  ) then
    raise exception 'Você não possui acesso a esta barbearia.';
  end if;

  if p_quantidade is null
    or p_quantidade <= 0 then
    raise exception 'Quantidade inválida.';
  end if;

  if not exists (
    select 1
    from public.clientes_barbearias cb
    where cb.barbearia_id = p_barbearia_id
      and cb.cliente_id = p_cliente_id
      and cb.ativo = true
  ) then
    raise exception 'Cliente inválido ou inativo nesta barbearia.';
  end if;

  v_pagamento :=
    nullif(
      lower(
        trim(
          coalesce(
            p_forma_pagamento,
            ''
          )
        )
      ),
      ''
    );

  if v_pagamento is not null
    and v_pagamento not in (
      'dinheiro',
      'pix',
      'debito',
      'credito',
      'outro'
    ) then
    raise exception 'Forma de pagamento inválida.';
  end if;

  select *
  into v_produto
  from public.produtos p
  where p.id = p_produto_id
    and p.barbearia_id = p_barbearia_id
    and p.ativo = true
  for update;

  if not found then
    raise exception 'Produto inválido ou inativo.';
  end if;

  if v_produto.estoque < p_quantidade then
    raise exception 'Estoque insuficiente.';
  end if;

  update public.produtos
  set estoque =
    estoque - p_quantidade
  where id = v_produto.id;

  insert into public.pedidos (
    produto_id,
    cliente_id,
    barbearia_id,
    quantidade,
    preco_unitario,
    status,
    origem_pedido,
    forma_pagamento,
    observacoes,
    arquivado
  )
  values (
    v_produto.id,
    p_cliente_id,
    p_barbearia_id,
    p_quantidade,
    v_produto.preco,
    'pendente',
    'presencial',
    v_pagamento,
    nullif(
      trim(
        coalesce(
          p_observacoes,
          ''
        )
      ),
      ''
    ),
    false
  )
  returning id
  into v_pedido_id;

  return v_pedido_id;
end;
$$;

revoke all on function public.criar_pedido_painel(
  uuid,
  uuid,
  uuid,
  integer,
  text,
  text
) from public;

grant execute on function public.criar_pedido_painel(
  uuid,
  uuid,
  uuid,
  integer,
  text,
  text
) to authenticated;


create or replace function public.alterar_status_pedido_painel(
  p_barbearia_id uuid,
  p_pedido_id uuid,
  p_status text
)
returns void
language plpgsql
security definer
set search_path = public, auth
as $$
declare
  v_status_atual text;
begin
  if auth.uid() is null then
    raise exception 'Usuário não autenticado.';
  end if;

  if not public.eh_dono_da_barbearia(
    p_barbearia_id
  ) then
    raise exception 'Você não possui acesso a esta barbearia.';
  end if;

  if p_status not in (
    'confirmado',
    'concluido',
    'cancelado'
  ) then
    raise exception 'Status inválido.';
  end if;

  select pe.status
  into v_status_atual
  from public.pedidos pe
  where pe.id = p_pedido_id
    and pe.barbearia_id = p_barbearia_id
    and pe.arquivado = false
  for update;

  if not found then
    raise exception 'Pedido não encontrado ou arquivado.';
  end if;

  if v_status_atual = 'pendente'
    and p_status not in (
      'confirmado',
      'cancelado'
    ) then
    raise exception
      'Pedido pendente só pode ser confirmado ou cancelado.';
  end if;

  if v_status_atual = 'confirmado'
    and p_status not in (
      'concluido',
      'cancelado'
    ) then
    raise exception
      'Pedido confirmado só pode ser concluído ou cancelado.';
  end if;

  if v_status_atual in (
    'concluido',
    'cancelado'
  ) then
    raise exception
      'Este pedido já está encerrado.';
  end if;

  update public.pedidos
  set status = p_status
  where id = p_pedido_id
    and barbearia_id = p_barbearia_id;
end;
$$;

revoke all on function public.alterar_status_pedido_painel(
  uuid,
  uuid,
  text
) from public;

grant execute on function public.alterar_status_pedido_painel(
  uuid,
  uuid,
  text
) to authenticated;


create or replace function public.atualizar_detalhes_pedido_painel(
  p_barbearia_id uuid,
  p_pedido_id uuid,
  p_forma_pagamento text,
  p_observacoes text
)
returns void
language plpgsql
security definer
set search_path = public, auth
as $$
declare
  v_pagamento text;
begin
  if auth.uid() is null then
    raise exception 'Usuário não autenticado.';
  end if;

  if not public.eh_dono_da_barbearia(
    p_barbearia_id
  ) then
    raise exception 'Você não possui acesso a esta barbearia.';
  end if;

  v_pagamento :=
    nullif(
      lower(
        trim(
          coalesce(
            p_forma_pagamento,
            ''
          )
        )
      ),
      ''
    );

  if v_pagamento is not null
    and v_pagamento not in (
      'dinheiro',
      'pix',
      'debito',
      'credito',
      'outro'
    ) then
    raise exception 'Forma de pagamento inválida.';
  end if;

  update public.pedidos
  set
    forma_pagamento = v_pagamento,
    observacoes =
      nullif(
        trim(
          coalesce(
            p_observacoes,
            ''
          )
        ),
        ''
      )
  where id = p_pedido_id
    and barbearia_id = p_barbearia_id;

  if not found then
    raise exception 'Pedido não encontrado.';
  end if;
end;
$$;

revoke all on function public.atualizar_detalhes_pedido_painel(
  uuid,
  uuid,
  text,
  text
) from public;

grant execute on function public.atualizar_detalhes_pedido_painel(
  uuid,
  uuid,
  text,
  text
) to authenticated;


create or replace function public.arquivar_pedido_painel(
  p_barbearia_id uuid,
  p_pedido_id uuid
)
returns void
language plpgsql
security definer
set search_path = public, auth
as $$
begin
  if auth.uid() is null then
    raise exception 'Usuário não autenticado.';
  end if;

  if not public.eh_dono_da_barbearia(
    p_barbearia_id
  ) then
    raise exception 'Você não possui acesso a esta barbearia.';
  end if;

  update public.pedidos
  set arquivado = true
  where id = p_pedido_id
    and barbearia_id = p_barbearia_id
    and arquivado = false
    and status in (
      'concluido',
      'cancelado'
    );

  if not found then
    raise exception
      'Somente pedidos concluídos ou cancelados podem ser arquivados.';
  end if;
end;
$$;

revoke all on function public.arquivar_pedido_painel(
  uuid,
  uuid
) from public;

grant execute on function public.arquivar_pedido_painel(
  uuid,
  uuid
) to authenticated;


-- Mantém o fluxo online compatível, mas impede pedido de produto inativo.
create or replace function public.criar_pedido(
  p_produto_id uuid,
  p_quantidade integer default 1
)
returns table (
  id uuid,
  produto_id uuid,
  cliente_id uuid,
  barbearia_id uuid,
  quantidade integer,
  preco_unitario numeric,
  total numeric,
  status text,
  origem_pedido text,
  created_at timestamptz
)
language plpgsql
security definer
set search_path = public, auth
as $$
declare
  v_cliente_id uuid;
  v_produto public.produtos%rowtype;
  v_pedido public.pedidos%rowtype;
begin
  if auth.uid() is null then
    raise exception 'Usuário não autenticado.';
  end if;

  if p_quantidade is null
    or p_quantidade <= 0 then
    raise exception 'Quantidade inválida.';
  end if;

  v_cliente_id :=
    public.cliente_atual_id();

  if v_cliente_id is null then
    raise exception 'A conta autenticada não é um cliente.';
  end if;

  select *
  into v_produto
  from public.produtos p
  where p.id = p_produto_id
    and p.ativo = true
  for update;

  if not found then
    raise exception 'Produto não encontrado ou inativo.';
  end if;

  if v_produto.estoque < p_quantidade then
    raise exception 'Estoque insuficiente.';
  end if;

  update public.produtos
  set estoque =
    estoque - p_quantidade
  where id = v_produto.id;

  insert into public.clientes_barbearias (
    cliente_id,
    barbearia_id
  )
  values (
    v_cliente_id,
    v_produto.barbearia_id
  )
  on conflict (
    cliente_id,
    barbearia_id
  )
  do update set
    ativo = true,
    updated_at = now();

  insert into public.pedidos (
    produto_id,
    cliente_id,
    barbearia_id,
    quantidade,
    preco_unitario,
    status,
    origem_pedido,
    arquivado
  )
  values (
    v_produto.id,
    v_cliente_id,
    v_produto.barbearia_id,
    p_quantidade,
    v_produto.preco,
    'pendente',
    'online',
    false
  )
  returning *
  into v_pedido;

  return query
  select
    v_pedido.id,
    v_pedido.produto_id,
    v_pedido.cliente_id,
    v_pedido.barbearia_id,
    v_pedido.quantidade,
    v_pedido.preco_unitario,
    (
      v_pedido.quantidade *
      v_pedido.preco_unitario
    )::numeric,
    v_pedido.status,
    v_pedido.origem_pedido,
    v_pedido.created_at;
end;
$$;

revoke all on function public.criar_pedido(
  uuid,
  integer
) from public;

grant execute on function public.criar_pedido(
  uuid,
  integer
) to authenticated;

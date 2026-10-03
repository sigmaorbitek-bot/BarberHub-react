-- BarberHub React
-- Migration 020: módulo de produtos
-- Executar após 019_clientes.sql.

alter table public.produtos
add column if not exists descricao text;

alter table public.produtos
add column if not exists estoque_minimo integer not null default 2
check (estoque_minimo >= 0);

alter table public.produtos
add column if not exists ativo boolean not null default true;

alter table public.produtos
add column if not exists foto_path text;

alter table public.produtos
add column if not exists updated_at timestamptz not null default now();

create index if not exists idx_produtos_barbearia_ativo_nome
on public.produtos (barbearia_id, ativo, nome);

create index if not exists idx_produtos_barbearia_estoque_minimo
on public.produtos (barbearia_id, estoque, estoque_minimo);

insert into storage.buckets (
  id,
  name,
  public,
  file_size_limit,
  allowed_mime_types
)
values (
  'produtos',
  'produtos',
  true,
  5242880,
  array['image/jpeg','image/png','image/webp']
)
on conflict (id)
do update set
  public = excluded.public,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists "produtos_imagens_insert_dono" on storage.objects;
create policy "produtos_imagens_insert_dono"
on storage.objects
for insert
to authenticated
with check (
  bucket_id = 'produtos'
  and exists (
    select 1
    from public.barbearias b
    where b.id::text = (storage.foldername(name))[1]
      and b.dono_id = auth.uid()
  )
);

drop policy if exists "produtos_imagens_update_dono" on storage.objects;
create policy "produtos_imagens_update_dono"
on storage.objects
for update
to authenticated
using (
  bucket_id = 'produtos'
  and exists (
    select 1
    from public.barbearias b
    where b.id::text = (storage.foldername(name))[1]
      and b.dono_id = auth.uid()
  )
)
with check (
  bucket_id = 'produtos'
  and exists (
    select 1
    from public.barbearias b
    where b.id::text = (storage.foldername(name))[1]
      and b.dono_id = auth.uid()
  )
);

drop policy if exists "produtos_imagens_delete_dono" on storage.objects;
create policy "produtos_imagens_delete_dono"
on storage.objects
for delete
to authenticated
using (
  bucket_id = 'produtos'
  and exists (
    select 1
    from public.barbearias b
    where b.id::text = (storage.foldername(name))[1]
      and b.dono_id = auth.uid()
  )
);

create or replace function public.listar_produtos_painel(
  p_barbearia_id uuid
)
returns table (
  produto_id uuid,
  nome text,
  descricao text,
  preco numeric,
  estoque integer,
  estoque_minimo integer,
  ativo boolean,
  foto_url text,
  foto_path text,
  pedidos_total bigint,
  unidades_vendidas bigint,
  faturamento numeric,
  created_at timestamptz,
  updated_at timestamptz
)
language plpgsql
security definer
set search_path = public, auth
as $$
begin
  if auth.uid() is null then
    raise exception 'Usuário não autenticado.';
  end if;

  if not public.eh_dono_da_barbearia(p_barbearia_id) then
    raise exception 'Você não possui acesso a esta barbearia.';
  end if;

  return query
  select
    p.id,
    p.nome,
    p.descricao,
    p.preco,
    p.estoque,
    p.estoque_minimo,
    p.ativo,
    p.foto_url,
    p.foto_path,
    count(pd.id) filter (
      where pd.status <> 'cancelado'
    )::bigint,
    coalesce(
      sum(pd.quantidade) filter (
        where pd.status in ('confirmado', 'concluido')
      ),
      0
    )::bigint,
    coalesce(
      sum(pd.quantidade * pd.preco_unitario) filter (
        where pd.status in ('confirmado', 'concluido')
      ),
      0
    )::numeric,
    p.created_at,
    p.updated_at
  from public.produtos p
  left join public.pedidos pd
    on pd.produto_id = p.id
    and pd.barbearia_id = p.barbearia_id
    and pd.arquivado = false
  where p.barbearia_id = p_barbearia_id
  group by p.id
  order by p.ativo desc, p.nome asc;
end;
$$;

revoke all on function public.listar_produtos_painel(uuid) from public;
grant execute on function public.listar_produtos_painel(uuid) to authenticated;

create or replace function public.salvar_produto_painel(
  p_barbearia_id uuid,
  p_produto_id uuid,
  p_nome text,
  p_descricao text,
  p_preco numeric,
  p_estoque integer,
  p_estoque_minimo integer,
  p_foto_url text,
  p_foto_path text
)
returns uuid
language plpgsql
security definer
set search_path = public, auth
as $$
declare
  v_produto_id uuid;
  v_nome text;
begin
  if auth.uid() is null then
    raise exception 'Usuário não autenticado.';
  end if;

  if not public.eh_dono_da_barbearia(p_barbearia_id) then
    raise exception 'Você não possui acesso a esta barbearia.';
  end if;

  v_nome := nullif(trim(coalesce(p_nome, '')), '');

  if v_nome is null then
    raise exception 'Digite o nome do produto.';
  end if;

  if p_preco is null or p_preco < 0 then
    raise exception 'Informe um preço válido.';
  end if;

  if p_estoque is null or p_estoque < 0 then
    raise exception 'Informe um estoque válido.';
  end if;

  if p_estoque_minimo is null or p_estoque_minimo < 0 then
    raise exception 'Informe um estoque mínimo válido.';
  end if;

  if p_produto_id is null then
    insert into public.produtos (
      barbearia_id,
      nome,
      descricao,
      preco,
      estoque,
      estoque_minimo,
      foto_url,
      foto_path,
      ativo
    )
    values (
      p_barbearia_id,
      v_nome,
      nullif(trim(coalesce(p_descricao, '')), ''),
      p_preco,
      p_estoque,
      p_estoque_minimo,
      nullif(trim(coalesce(p_foto_url, '')), ''),
      nullif(trim(coalesce(p_foto_path, '')), ''),
      true
    )
    returning id into v_produto_id;

    return v_produto_id;
  end if;

  update public.produtos
  set
    nome = v_nome,
    descricao = nullif(trim(coalesce(p_descricao, '')), ''),
    preco = p_preco,
    estoque = p_estoque,
    estoque_minimo = p_estoque_minimo,
    foto_url = nullif(trim(coalesce(p_foto_url, '')), ''),
    foto_path = nullif(trim(coalesce(p_foto_path, '')), ''),
    updated_at = now()
  where id = p_produto_id
    and barbearia_id = p_barbearia_id;

  if not found then
    raise exception 'Produto não encontrado nesta barbearia.';
  end if;

  return p_produto_id;
end;
$$;

revoke all on function public.salvar_produto_painel(
  uuid, uuid, text, text, numeric, integer, integer, text, text
) from public;

grant execute on function public.salvar_produto_painel(
  uuid, uuid, text, text, numeric, integer, integer, text, text
) to authenticated;

create or replace function public.alterar_status_produto_painel(
  p_barbearia_id uuid,
  p_produto_id uuid,
  p_ativo boolean
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

  if not public.eh_dono_da_barbearia(p_barbearia_id) then
    raise exception 'Você não possui acesso a esta barbearia.';
  end if;

  update public.produtos
  set
    ativo = coalesce(p_ativo, false),
    updated_at = now()
  where id = p_produto_id
    and barbearia_id = p_barbearia_id;

  if not found then
    raise exception 'Produto não encontrado nesta barbearia.';
  end if;
end;
$$;

revoke all on function public.alterar_status_produto_painel(uuid, uuid, boolean) from public;
grant execute on function public.alterar_status_produto_painel(uuid, uuid, boolean) to authenticated;

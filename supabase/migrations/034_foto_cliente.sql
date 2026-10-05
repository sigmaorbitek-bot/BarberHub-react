-- BarberHub React
-- Migration 034: foto do cliente + suporte ao perfil
-- Executar após 033_perfil_cliente.sql.

alter table public.clientes
add column if not exists foto_path text;

insert into storage.buckets (
  id,
  name,
  public,
  file_size_limit,
  allowed_mime_types
)
values (
  'clientes',
  'clientes',
  true,
  5242880,
  array[
    'image/jpeg',
    'image/png',
    'image/webp'
  ]
)
on conflict (id)
do update set
  public = excluded.public,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists
"clientes_fotos_insert_proprio"
on storage.objects;

create policy
"clientes_fotos_insert_proprio"
on storage.objects
for insert
to authenticated
with check (
  bucket_id = 'clientes'
  and (storage.foldername(name))[1] = auth.uid()::text
);

drop policy if exists
"clientes_fotos_update_proprio"
on storage.objects;

create policy
"clientes_fotos_update_proprio"
on storage.objects
for update
to authenticated
using (
  bucket_id = 'clientes'
  and (storage.foldername(name))[1] = auth.uid()::text
)
with check (
  bucket_id = 'clientes'
  and (storage.foldername(name))[1] = auth.uid()::text
);

drop policy if exists
"clientes_fotos_delete_proprio"
on storage.objects;

create policy
"clientes_fotos_delete_proprio"
on storage.objects
for delete
to authenticated
using (
  bucket_id = 'clientes'
  and (storage.foldername(name))[1] = auth.uid()::text
);

drop function if exists public.obter_perfil_cliente();

create function public.obter_perfil_cliente()
returns table (
  cliente_id uuid,
  nome text,
  telefone text,
  email text,
  foto_path text,
  created_at timestamptz
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
    c.id,
    c.nome::text,
    c.telefone::text,
    c.email::text,
    c.foto_path::text,
    c.created_at
  from public.clientes c
  where c.id = v_cliente_id;
end;
$$;

revoke all on function public.obter_perfil_cliente()
from public;

grant execute on function public.obter_perfil_cliente()
to authenticated;


create or replace function public.atualizar_foto_cliente(
  p_foto_path text
)
returns void
language plpgsql
security definer
set search_path = public, auth
as $$
declare
  v_cliente_id uuid;
  v_path text;
begin
  if auth.uid() is null then
    raise exception 'Usuário não autenticado.';
  end if;

  v_cliente_id := public.cliente_atual_id();

  if v_cliente_id is null then
    raise exception 'A conta autenticada não possui cadastro de cliente.';
  end if;

  v_path := nullif(trim(coalesce(p_foto_path, '')), '');

  if v_path is not null
    and v_path not like auth.uid()::text || '/%' then
    raise exception 'Caminho da foto inválido.';
  end if;

  update public.clientes
  set foto_path = v_path
  where id = v_cliente_id;
end;
$$;

revoke all on function public.atualizar_foto_cliente(text)
from public;

grant execute on function public.atualizar_foto_cliente(text)
to authenticated;

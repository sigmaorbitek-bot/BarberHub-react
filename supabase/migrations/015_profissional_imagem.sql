-- BarberHub React
-- Migration 015: imagem de profissional via Supabase Storage
-- Executar após 014_acesso_profissional.sql.

alter table public.profissionais
add column if not exists foto_path text;

insert into storage.buckets (
  id,
  name,
  public,
  file_size_limit,
  allowed_mime_types
)
values (
  'profissionais',
  'profissionais',
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
"profissionais_imagens_insert_dono"
on storage.objects;

create policy
"profissionais_imagens_insert_dono"
on storage.objects
for insert
to authenticated
with check (
  bucket_id = 'profissionais'
  and exists (
    select 1
    from public.barbearias b
    where b.id::text =
      (storage.foldername(name))[1]
      and b.dono_id = auth.uid()
  )
);

drop policy if exists
"profissionais_imagens_update_dono"
on storage.objects;

create policy
"profissionais_imagens_update_dono"
on storage.objects
for update
to authenticated
using (
  bucket_id = 'profissionais'
  and exists (
    select 1
    from public.barbearias b
    where b.id::text =
      (storage.foldername(name))[1]
      and b.dono_id = auth.uid()
  )
)
with check (
  bucket_id = 'profissionais'
  and exists (
    select 1
    from public.barbearias b
    where b.id::text =
      (storage.foldername(name))[1]
      and b.dono_id = auth.uid()
  )
);

drop policy if exists
"profissionais_imagens_delete_dono"
on storage.objects;

create policy
"profissionais_imagens_delete_dono"
on storage.objects
for delete
to authenticated
using (
  bucket_id = 'profissionais'
  and exists (
    select 1
    from public.barbearias b
    where b.id::text =
      (storage.foldername(name))[1]
      and b.dono_id = auth.uid()
  )
);

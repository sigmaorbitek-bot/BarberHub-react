-- BarberHub
-- Migration 015: imagem do profissional
-- Executar após 014_contas_permissoes_profissionais.sql.
--
-- Responsabilidades:
-- - adicionar foto_path;
-- - criar/configurar bucket de profissionais;
-- - permitir upload somente pelo dono da barbearia;
-- - permitir remoção/substituição da foto;
-- - liberar foto_path para atualização comercial segura.

begin;

-- =========================================================
-- 1. CAMINHO DA FOTO
-- =========================================================

alter table public.profissionais
add column if not exists foto_path text;


-- =========================================================
-- 2. PRIVILÉGIO DE COLUNA
-- =========================================================
--
-- Na migration 014 o UPDATE foi restringido por coluna.
-- O frontend precisa atualizar foto_url e foto_path juntos.

grant update (
  foto_path
)
on table public.profissionais
to authenticated;


-- =========================================================
-- 3. BUCKET
-- =========================================================

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
  public =
    excluded.public,

  file_size_limit =
    excluded.file_size_limit,

  allowed_mime_types =
    excluded.allowed_mime_types;


-- =========================================================
-- 4. UPLOAD
-- =========================================================
--
-- Estrutura esperada pelo frontend:
--
-- <barbearia_id>/<profissional_id>/<arquivo>
--
-- Exemplo:
-- 123.../456.../foto.webp

drop policy if exists
"profissionais_imagens_insert_dono"
on storage.objects;


create policy
"profissionais_imagens_insert_dono"
on storage.objects
for insert
to authenticated
with check (
  bucket_id =
    'profissionais'

  and exists (
    select 1
    from public.barbearias b
    where b.id::text =
      (storage.foldername(name))[1]
      and b.dono_id =
        auth.uid()
  )
);


-- =========================================================
-- 5. ATUALIZAÇÃO DE ARQUIVO
-- =========================================================

drop policy if exists
"profissionais_imagens_update_dono"
on storage.objects;


create policy
"profissionais_imagens_update_dono"
on storage.objects
for update
to authenticated
using (
  bucket_id =
    'profissionais'

  and exists (
    select 1
    from public.barbearias b
    where b.id::text =
      (storage.foldername(name))[1]
      and b.dono_id =
        auth.uid()
  )
)
with check (
  bucket_id =
    'profissionais'

  and exists (
    select 1
    from public.barbearias b
    where b.id::text =
      (storage.foldername(name))[1]
      and b.dono_id =
        auth.uid()
  )
);


-- =========================================================
-- 6. REMOÇÃO
-- =========================================================

drop policy if exists
"profissionais_imagens_delete_dono"
on storage.objects;


create policy
"profissionais_imagens_delete_dono"
on storage.objects
for delete
to authenticated
using (
  bucket_id =
    'profissionais'

  and exists (
    select 1
    from public.barbearias b
    where b.id::text =
      (storage.foldername(name))[1]
      and b.dono_id =
        auth.uid()
  )
);


-- =========================================================
-- 7. VALIDAÇÃO
-- =========================================================

do $$
begin
  if not exists (
    select 1
    from information_schema.columns
    where table_schema =
      'public'
      and table_name =
        'profissionais'
      and column_name =
        'foto_path'
  ) then

    raise exception
      'Falha na migration 015: coluna foto_path não foi criada.';

  end if;


  if not exists (
    select 1
    from storage.buckets
    where id =
      'profissionais'
  ) then

    raise exception
      'Falha na migration 015: bucket profissionais não foi criado.';

  end if;
end;
$$;


commit;
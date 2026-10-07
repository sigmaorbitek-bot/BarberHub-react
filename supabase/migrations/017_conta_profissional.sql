-- BarberHub
-- Migration 017: foto, contexto visual e conta do profissional
-- Executar após 016_area_profissional.sql.
--
-- Esta versão substitui as antigas migrations 017 e 018
-- relacionadas ao contexto visual do profissional.

begin;

-- =========================================================
-- 1. POLÍTICAS DE STORAGE PARA A PRÓPRIA FOTO
-- =========================================================
--
-- O Supabase Storage já possui RLS habilitado.
-- Não alteramos diretamente a configuração da tabela
-- storage.objects.
--
-- Caminho obrigatório:
-- <barbearia_id>/<profissional_id>/<arquivo>

drop policy if exists
"profissionais_imagens_insert_proprio"
on storage.objects;


create policy
"profissionais_imagens_insert_proprio"
on storage.objects
for insert
to authenticated
with check (
  bucket_id = 'profissionais'

  and exists (
    select 1

    from public.profissionais p

    where p.usuario_id = auth.uid()
      and p.ativo = true

      and p.barbearia_id::text =
        (storage.foldername(name))[1]

      and p.id::text =
        (storage.foldername(name))[2]
  )
);


drop policy if exists
"profissionais_imagens_update_proprio"
on storage.objects;


create policy
"profissionais_imagens_update_proprio"
on storage.objects
for update
to authenticated
using (
  bucket_id = 'profissionais'

  and exists (
    select 1

    from public.profissionais p

    where p.usuario_id = auth.uid()
      and p.ativo = true

      and p.barbearia_id::text =
        (storage.foldername(name))[1]

      and p.id::text =
        (storage.foldername(name))[2]
  )
)
with check (
  bucket_id = 'profissionais'

  and exists (
    select 1

    from public.profissionais p

    where p.usuario_id = auth.uid()
      and p.ativo = true

      and p.barbearia_id::text =
        (storage.foldername(name))[1]

      and p.id::text =
        (storage.foldername(name))[2]
  )
);


drop policy if exists
"profissionais_imagens_delete_proprio"
on storage.objects;


create policy
"profissionais_imagens_delete_proprio"
on storage.objects
for delete
to authenticated
using (
  bucket_id = 'profissionais'

  and exists (
    select 1

    from public.profissionais p

    where p.usuario_id = auth.uid()
      and p.ativo = true

      and p.barbearia_id::text =
        (storage.foldername(name))[1]

      and p.id::text =
        (storage.foldername(name))[2]
  )
);


-- =========================================================
-- 2. ATUALIZAR SOMENTE A PRÓPRIA FOTO
-- =========================================================
--
-- A escrita da foto passa pela RPC.
-- O profissional não recebe acesso direto aos demais
-- campos sensíveis do registro profissional.

create or replace function public.atualizar_foto_profissional(
  p_foto_url text,
  p_foto_path text
)
returns void
language plpgsql
security definer
set search_path = public, auth
as $$
declare
  v_profissional_id uuid;
  v_barbearia_id uuid;
  v_partes text[];
begin
  if auth.uid() is null then
    raise exception
      'Usuário não autenticado.';
  end if;


  select
    p.id,
    p.barbearia_id

  into
    v_profissional_id,
    v_barbearia_id

  from public.profissionais p

  where p.usuario_id =
    auth.uid()

    and p.ativo =
      true

  limit 1;


  if v_profissional_id is null then
    raise exception
      'Profissional não encontrado.';
  end if;


  if p_foto_url is null
     or nullif(
       trim(
         p_foto_url
       ),
       ''
     ) is null then

    raise exception
      'URL da foto inválida.';

  end if;


  if p_foto_path is null
     or nullif(
       trim(
         p_foto_path
       ),
       ''
     ) is null then

    raise exception
      'Caminho da foto inválido.';

  end if;


  v_partes :=
    string_to_array(
      trim(
        p_foto_path
      ),
      '/'
    );


  if coalesce(
       array_length(
         v_partes,
         1
       ),
       0
     ) < 3

     or v_partes[1] <>
       v_barbearia_id::text

     or v_partes[2] <>
       v_profissional_id::text then

    raise exception
      'Caminho da foto não pertence ao profissional autenticado.';

  end if;


  if position(
    '/storage/v1/object/public/profissionais/'
    in p_foto_url
  ) = 0 then

    raise exception
      'URL da foto não pertence ao bucket profissionais.';

  end if;


  update public.profissionais

  set
    foto_url =
      trim(
        p_foto_url
      ),

    foto_path =
      trim(
        p_foto_path
      )

  where id =
    v_profissional_id;
end;
$$;


revoke all
on function public.atualizar_foto_profissional(
  text,
  text
)
from public;


grant execute
on function public.atualizar_foto_profissional(
  text,
  text
)
to authenticated;


-- =========================================================
-- 3. CONTEXTO VISUAL COMPLETO DO PROFISSIONAL
-- =========================================================
--
-- Inclui:
-- - foto profissional;
-- - caminho da foto;
-- - logo da barbearia;
-- - permissões;
-- - comissão;
-- - informações de primeiro acesso.

drop function if exists
public.obter_contexto_profissional();


create function public.obter_contexto_profissional()
returns table (
  profissional_id uuid,
  barbearia_id uuid,
  profissional_nome text,
  profissional_foto_url text,
  profissional_foto_path text,
  barbearia_nome text,
  barbearia_logo_url text,
  email_acesso text,
  primeiro_acesso_pendente boolean,
  comissao_percentual numeric,
  ver_agendamentos boolean,
  alterar_status boolean,
  ver_cliente_telefone boolean,
  ver_financeiro boolean,
  ver_comissao boolean,
  ver_agenda_equipe boolean,
  ver_clientes boolean,
  ver_produtos boolean
)
language sql
security definer
set search_path = public, auth
as $$
  select
    p.id,
    p.barbearia_id,
    p.nome,
    p.foto_url,
    p.foto_path,
    b.nome,
    b.logo_url,
    p.email_acesso,
    p.primeiro_acesso_pendente,
    p.comissao_percentual,

    coalesce(
      pp.ver_agendamentos,
      true
    ),

    coalesce(
      pp.alterar_status,
      true
    ),

    coalesce(
      pp.ver_cliente_telefone,
      true
    ),

    coalesce(
      pp.ver_financeiro,
      false
    ),

    coalesce(
      pp.ver_comissao,
      false
    ),

    coalesce(
      pp.ver_agenda_equipe,
      false
    ),

    coalesce(
      pp.ver_clientes,
      false
    ),

    coalesce(
      pp.ver_produtos,
      false
    )

  from public.profissionais p

  join public.barbearias b
    on b.id =
      p.barbearia_id

  left join public.permissoes_profissionais pp
    on pp.profissional_id =
      p.id

  where p.usuario_id =
    auth.uid()

    and p.ativo =
      true

  limit 1;
$$;


revoke all
on function public.obter_contexto_profissional()
from public;


grant execute
on function public.obter_contexto_profissional()
to authenticated;


-- =========================================================
-- 4. VALIDAÇÃO
-- =========================================================

do $$
begin

  if to_regprocedure(
    'public.atualizar_foto_profissional(text,text)'
  ) is null then

    raise exception
      'Falha na migration 017: atualizar_foto_profissional não foi criada.';

  end if;


  if to_regprocedure(
    'public.obter_contexto_profissional()'
  ) is null then

    raise exception
      'Falha na migration 017: obter_contexto_profissional não foi criada.';

  end if;

end;
$$;


commit;
-- BarberHub
-- Migration 020: módulo de produtos
-- Executar após 019_clientes.sql.
--
-- Responsabilidades:
-- - dados complementares de produtos;
-- - estoque mínimo;
-- - ativação/desativação;
-- - imagens de produtos;
-- - listagem administrativa;
-- - cadastro e edição segura;
-- - atualização automática de updated_at.

begin;


-- 1. ESTRUTURA DO PRODUTO

alter table public.produtos
add column if not exists descricao text;


alter table public.produtos
add column if not exists estoque_minimo integer
not null
default 2;


alter table public.produtos
add column if not exists ativo boolean
not null
default true;


alter table public.produtos
add column if not exists foto_path text;


alter table public.produtos
add column if not exists updated_at timestamptz
not null
default now();


alter table public.produtos
drop constraint if exists produtos_estoque_minimo_check;


alter table public.produtos
add constraint produtos_estoque_minimo_check
check (
  estoque_minimo >= 0
);


-- Garante dados coerentes em registros anteriores.

update public.produtos
set
  estoque_minimo =
    greatest(
      coalesce(
        estoque_minimo,
        2
      ),
      0
    ),

  ativo =
    coalesce(
      ativo,
      true
    ),

  updated_at =
    coalesce(
      updated_at,
      created_at,
      now()
    );


-- 2. ÍNDICES

create index if not exists
idx_produtos_barbearia_ativo_nome
on public.produtos (
  barbearia_id,
  ativo,
  nome
);


create index if not exists
idx_produtos_barbearia_estoque_minimo
on public.produtos (
  barbearia_id,
  estoque,
  estoque_minimo
);


-- 3. UPDATED_AT AUTOMÁTICO

create or replace function
public.atualizar_updated_at_produto()
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
on function public.atualizar_updated_at_produto()
from public;


drop trigger if exists
trg_produtos_updated_at
on public.produtos;


create trigger
trg_produtos_updated_at
before update
on public.produtos
for each row
execute function
public.atualizar_updated_at_produto();


-- 4. STORAGE DE PRODUTOS

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


-- Caminho esperado:
--
-- <barbearia_id>/<arquivo>


drop policy if exists
"produtos_imagens_insert_dono"
on storage.objects;


create policy
"produtos_imagens_insert_dono"
on storage.objects
for insert
to authenticated
with check (
  bucket_id = 'produtos'

  and exists (
    select 1

    from public.barbearias b

    where b.id::text =
      (storage.foldername(name))[1]

      and b.dono_id =
        auth.uid()
  )
);


drop policy if exists
"produtos_imagens_update_dono"
on storage.objects;


create policy
"produtos_imagens_update_dono"
on storage.objects
for update
to authenticated
using (
  bucket_id = 'produtos'

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
  bucket_id = 'produtos'

  and exists (
    select 1

    from public.barbearias b

    where b.id::text =
      (storage.foldername(name))[1]

      and b.dono_id =
        auth.uid()
  )
);


drop policy if exists
"produtos_imagens_delete_dono"
on storage.objects;


create policy
"produtos_imagens_delete_dono"
on storage.objects
for delete
to authenticated
using (
  bucket_id = 'produtos'

  and exists (
    select 1

    from public.barbearias b

    where b.id::text =
      (storage.foldername(name))[1]

      and b.dono_id =
        auth.uid()
  )
);


-- 5. LISTAR PRODUTOS NO PAINEL

create or replace function
public.listar_produtos_painel(
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
    raise exception
      'Usuário não autenticado.';
  end if;


  if not public.eh_dono_da_barbearia(
    p_barbearia_id
  ) then

    raise exception
      'Você não possui acesso a esta barbearia.';

  end if;


  return query

  select
    p.id as produto_id,
    p.nome,
    p.descricao,
    p.preco,
    p.estoque,
    p.estoque_minimo,
    p.ativo,
    p.foto_url,
    p.foto_path,

    count(
      pd.id
    ) filter (
      where pd.status <>
        'cancelado'
    )::bigint
      as pedidos_total,

    coalesce(
      sum(
        pd.quantidade
      ) filter (
        where pd.status in (
          'confirmado',
          'concluido'
        )
      ),
      0
    )::bigint
      as unidades_vendidas,

    coalesce(
      sum(
        pd.quantidade *
        pd.preco_unitario
      ) filter (
        where pd.status in (
          'confirmado',
          'concluido'
        )
      ),
      0
    )::numeric
      as faturamento,

    p.created_at,
    p.updated_at

  from public.produtos p

  left join public.pedidos pd
    on pd.produto_id =
      p.id

    and pd.barbearia_id =
      p.barbearia_id

    and pd.arquivado =
      false

  where p.barbearia_id =
    p_barbearia_id

  group by
    p.id

  order by
    p.ativo desc,
    p.nome asc;

end;
$$;


revoke all
on function
public.listar_produtos_painel(
  uuid
)
from public;


grant execute
on function
public.listar_produtos_painel(
  uuid
)
to authenticated;


-- 6. SALVAR PRODUTO

create or replace function
public.salvar_produto_painel(
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
  v_descricao text;
  v_foto_url text;
  v_foto_path text;
begin

  if auth.uid() is null then
    raise exception
      'Usuário não autenticado.';
  end if;


  if not public.eh_dono_da_barbearia(
    p_barbearia_id
  ) then

    raise exception
      'Você não possui acesso a esta barbearia.';

  end if;


  v_nome :=
    nullif(
      trim(
        coalesce(
          p_nome,
          ''
        )
      ),
      ''
    );


  if v_nome is null then
    raise exception
      'Digite o nome do produto.';
  end if;


  if length(v_nome) > 120 then
    raise exception
      'O nome do produto pode ter no máximo 120 caracteres.';
  end if;


  v_descricao :=
    nullif(
      trim(
        coalesce(
          p_descricao,
          ''
        )
      ),
      ''
    );


  if v_descricao is not null
     and length(v_descricao) > 800
  then

    raise exception
      'A descrição pode ter no máximo 800 caracteres.';

  end if;


  if p_preco is null
     or p_preco < 0
  then

    raise exception
      'Informe um preço válido.';

  end if;


  if p_preco > 99999999.99 then
    raise exception
      'O preço informado é muito alto.';

  end if;


  if p_estoque is null
     or p_estoque < 0
  then

    raise exception
      'Informe um estoque válido.';

  end if;


  if p_estoque_minimo is null
     or p_estoque_minimo < 0
  then

    raise exception
      'Informe um estoque mínimo válido.';

  end if;


  v_foto_url :=
    nullif(
      trim(
        coalesce(
          p_foto_url,
          ''
        )
      ),
      ''
    );


  v_foto_path :=
    nullif(
      trim(
        coalesce(
          p_foto_path,
          ''
        )
      ),
      ''
    );


  -- Se existir path, obrigatoriamente precisa estar
  -- dentro da pasta da própria barbearia.

  if v_foto_path is not null
     and v_foto_path not like
       p_barbearia_id::text || '/%'
  then

    raise exception
      'Caminho da imagem inválido para esta barbearia.';

  end if;


  -- URL e path devem existir juntos.

  if (
    v_foto_url is null
    and v_foto_path is not null
  )
  or (
    v_foto_url is not null
    and v_foto_path is null
  )
  then

    raise exception
      'Os dados da imagem do produto estão incompletos.';

  end if;


  -- NOVO PRODUTO

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
      v_descricao,
      p_preco,
      p_estoque,
      p_estoque_minimo,
      v_foto_url,
      v_foto_path,
      true
    )
    returning id
    into v_produto_id;


    return v_produto_id;

  end if;


  -- EDIÇÃO

  update public.produtos

  set
    nome =
      v_nome,

    descricao =
      v_descricao,

    preco =
      p_preco,

    estoque =
      p_estoque,

    estoque_minimo =
      p_estoque_minimo,

    foto_url =
      v_foto_url,

    foto_path =
      v_foto_path

  where id =
    p_produto_id

    and barbearia_id =
      p_barbearia_id;


  if not found then
    raise exception
      'Produto não encontrado nesta barbearia.';
  end if;


  return p_produto_id;

end;
$$;


revoke all
on function
public.salvar_produto_painel(
  uuid,
  uuid,
  text,
  text,
  numeric,
  integer,
  integer,
  text,
  text
)
from public;


grant execute
on function
public.salvar_produto_painel(
  uuid,
  uuid,
  text,
  text,
  numeric,
  integer,
  integer,
  text,
  text
)
to authenticated;


-- 7. ATIVAR / DESATIVAR PRODUTO

create or replace function
public.alterar_status_produto_painel(
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
    raise exception
      'Usuário não autenticado.';
  end if;


  if not public.eh_dono_da_barbearia(
    p_barbearia_id
  ) then

    raise exception
      'Você não possui acesso a esta barbearia.';

  end if;


  update public.produtos

  set
    ativo =
      coalesce(
        p_ativo,
        false
      )

  where id =
    p_produto_id

    and barbearia_id =
      p_barbearia_id;


  if not found then
    raise exception
      'Produto não encontrado nesta barbearia.';
  end if;

end;
$$;


revoke all
on function
public.alterar_status_produto_painel(
  uuid,
  uuid,
  boolean
)
from public;


grant execute
on function
public.alterar_status_produto_painel(
  uuid,
  uuid,
  boolean
)
to authenticated;


-- 8. VALIDAÇÃO

do $$
begin

  if not exists (
    select 1

    from information_schema.columns

    where table_schema =
      'public'

      and table_name =
        'produtos'

      and column_name =
        'estoque_minimo'
  ) then

    raise exception
      'Falha na migration 020: estoque_minimo não foi criado.';

  end if;


  if not exists (
    select 1

    from information_schema.columns

    where table_schema =
      'public'

      and table_name =
        'produtos'

      and column_name =
        'ativo'
  ) then

    raise exception
      'Falha na migration 020: ativo não foi criado.';

  end if;


  if not exists (
    select 1

    from information_schema.columns

    where table_schema =
      'public'

      and table_name =
        'produtos'

      and column_name =
        'foto_path'
  ) then

    raise exception
      'Falha na migration 020: foto_path não foi criado.';

  end if;


  if to_regprocedure(
    'public.listar_produtos_painel(uuid)'
  ) is null then

    raise exception
      'Falha na migration 020: listar_produtos_painel não foi criada.';

  end if;


  if to_regprocedure(
    'public.salvar_produto_painel(uuid,uuid,text,text,numeric,integer,integer,text,text)'
  ) is null then

    raise exception
      'Falha na migration 020: salvar_produto_painel não foi criada.';

  end if;


  if to_regprocedure(
    'public.alterar_status_produto_painel(uuid,uuid,boolean)'
  ) is null then

    raise exception
      'Falha na migration 020: alterar_status_produto_painel não foi criada.';

  end if;

end;
$$;


commit;
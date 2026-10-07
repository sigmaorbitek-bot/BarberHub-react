-- BarberHub
-- Migration 007: onboarding de dono e cliente
-- Executar após 001 a 005.
--
-- A migration 006 foi movida para seed/
-- e não faz parte da cadeia de produção.
--
-- Responsabilidades:
-- - onboarding seguro do dono;
-- - suporte a Google OAuth sem profile pré-criado;
-- - criação idempotente da barbearia;
-- - criação dos horários iniciais;
-- - onboarding seguro do cliente;
-- - criação idempotente do cadastro comercial do cliente;
-- - bucket e políticas de Storage para logos.

-- =========================================================
-- 1. IDEMPOTÊNCIA DA CRIAÇÃO DE BARBEARIA
-- =========================================================

alter table public.barbearias
add column if not exists chave_criacao uuid;

create unique index if not exists uq_barbearias_chave_criacao
on public.barbearias (chave_criacao)
where chave_criacao is not null;


-- =========================================================
-- 2. ONBOARDING DO DONO + CRIAÇÃO DA BARBEARIA
-- =========================================================

create or replace function public.criar_barbearia_com_horarios(
  p_nome text,
  p_cidade text,
  p_endereco text default null,
  p_telefone text default null,
  p_horario_abertura time default null,
  p_horario_fechamento time default null,
  p_dias integer[] default '{}'::integer[],
  p_chave_criacao uuid default null,
  p_nome_responsavel text default null
)
returns public.barbearias
language plpgsql
security definer
set search_path = public, auth
as $$
declare
  v_barbearia public.barbearias%rowtype;

  v_tipo_atual text;

  v_nome_responsavel text;
  v_nome_google text;

  v_dias integer[] :=
    coalesce(
      p_dias,
      '{}'::integer[]
    );

  v_dias_texto text[];

  v_chave uuid :=
    coalesce(
      p_chave_criacao,
      gen_random_uuid()
    );
begin

  -- =======================================================
  -- AUTENTICAÇÃO
  -- =======================================================

  if auth.uid() is null then
    raise exception
      'Usuário não autenticado.';
  end if;


  -- =======================================================
  -- NOME DO RESPONSÁVEL
  -- =======================================================

  v_nome_responsavel :=
    nullif(
      trim(
        coalesce(
          p_nome_responsavel,
          ''
        )
      ),
      ''
    );


  -- Caso o frontend não envie, tentamos obter do
  -- metadata da conta autenticada.

  if v_nome_responsavel is null then

    select
      nullif(
        trim(
          coalesce(
            u.raw_user_meta_data ->> 'nome',
            u.raw_user_meta_data ->> 'full_name',
            u.raw_user_meta_data ->> 'name',
            ''
          )
        ),
        ''
      )
    into v_nome_google
    from auth.users u
    where u.id = auth.uid();


    v_nome_responsavel :=
      v_nome_google;

  end if;


  if v_nome_responsavel is null then
    raise exception
      'Digite o nome do responsável.';
  end if;


  -- =======================================================
  -- PROFILE DO DONO
  -- =======================================================
  --
  -- Google OAuth pode criar auth.users sem criar profile.
  --
  -- Nesse caso, como estamos dentro do onboarding
  -- específico de barbearia, criamos o profile como dono.
  --
  -- Se já existir profile de cliente ou profissional,
  -- NÃO fazemos conversão silenciosa.

  select p.tipo
  into v_tipo_atual
  from public.profiles p
  where p.id = auth.uid();


  if not found then

    insert into public.profiles (
      id,
      nome,
      telefone,
      tipo
    )
    values (
      auth.uid(),
      v_nome_responsavel,
      null,
      'dono'
    );

    v_tipo_atual :=
      'dono';

  else

    if v_tipo_atual <> 'dono' then
      raise exception
        'Esta conta está vinculada a outro tipo de acesso. Use o fluxo de mudança de perfil.';
    end if;


    -- Mantém o nome do responsável atualizado.

    update public.profiles
    set nome =
      v_nome_responsavel
    where id =
      auth.uid();

  end if;


  -- =======================================================
  -- VALIDAR BARBEARIA
  -- =======================================================

  if nullif(
       trim(
         coalesce(
           p_nome,
           ''
         )
       ),
       ''
     ) is null then

    raise exception
      'Digite o nome da barbearia.';

  end if;


  if nullif(
       trim(
         coalesce(
           p_cidade,
           ''
         )
       ),
       ''
     ) is null then

    raise exception
      'Digite a cidade.';

  end if;


  -- =======================================================
  -- VALIDAR DIAS
  -- =======================================================

  if exists (
    select 1
    from unnest(v_dias) as d
    where d < 0
       or d > 6
  ) then

    raise exception
      'Dia de funcionamento inválido.';

  end if;


  -- Remove duplicados e ordena.

  select
    coalesce(
      array_agg(
        distinct d
        order by d
      ),
      '{}'::integer[]
    )
  into v_dias
  from unnest(v_dias) as d;


  -- =======================================================
  -- VALIDAR HORÁRIOS
  -- =======================================================

  if cardinality(v_dias) > 0 then

    if p_horario_abertura is null
       or p_horario_fechamento is null then

      raise exception
        'Informe os horários de abertura e fechamento.';

    end if;


    if p_horario_abertura
       >= p_horario_fechamento then

      raise exception
        'O horário de fechamento precisa ser depois da abertura.';

    end if;

  elsif p_horario_abertura is not null
        or p_horario_fechamento is not null then

    raise exception
      'Selecione pelo menos um dia de funcionamento.';

  end if;


  -- =======================================================
  -- CONVERTER DIAS
  -- =======================================================

  select
    coalesce(
      array_agg(
        case d
          when 0 then 'dom'
          when 1 then 'seg'
          when 2 then 'ter'
          when 3 then 'qua'
          when 4 then 'qui'
          when 5 then 'sex'
          when 6 then 'sab'
        end
        order by d
      ),
      '{}'::text[]
    )
  into v_dias_texto
  from unnest(v_dias) as d;


  -- =======================================================
  -- CRIAR BARBEARIA DE FORMA IDEMPOTENTE
  -- =======================================================
  --
  -- Se o navegador repetir a mesma requisição usando
  -- a mesma chave, a barbearia não será duplicada.

  insert into public.barbearias (
    dono_id,
    nome,
    cidade,
    endereco,
    telefone,
    horario_abertura,
    horario_fechamento,
    dias_funcionamento,
    logo_url,
    chave_criacao
  )
  values (
    auth.uid(),

    trim(p_nome),

    trim(p_cidade),

    nullif(
      trim(
        coalesce(
          p_endereco,
          ''
        )
      ),
      ''
    ),

    nullif(
      regexp_replace(
        coalesce(
          p_telefone,
          ''
        ),
        '\D',
        '',
        'g'
      ),
      ''
    ),

    p_horario_abertura,
    p_horario_fechamento,

    v_dias_texto,

    null,

    v_chave
  )

  on conflict (chave_criacao)
  where chave_criacao is not null

  do update set
    chave_criacao =
      excluded.chave_criacao

  returning *
  into v_barbearia;


  -- =======================================================
  -- PROTEGER CHAVE DE OUTRO USUÁRIO
  -- =======================================================

  if v_barbearia.dono_id <> auth.uid() then
    raise exception
      'Chave de criação inválida para este usuário.';
  end if;


  -- =======================================================
  -- CRIAR OS SETE DIAS
  -- =======================================================
  --
  -- Criamos linhas até para os dias fechados.
  --
  -- Isso permite distinguir:
  --
  -- sem configuração
  --
  -- de:
  --
  -- explicitamente fechado.

  insert into public.horarios_funcionamento (
    barbearia_id,
    dia_semana,
    aberto,
    hora_abertura,
    hora_fechamento,
    intervalo_inicio,
    intervalo_fim
  )

  select
    v_barbearia.id,

    d,

    d = any(v_dias),

    case
      when d = any(v_dias)
        then p_horario_abertura
      else null
    end,

    case
      when d = any(v_dias)
        then p_horario_fechamento
      else null
    end,

    null,
    null

  from generate_series(
    0,
    6
  ) as d

  on conflict (
    barbearia_id,
    dia_semana
  )
  do nothing;


  return v_barbearia;
end;
$$;


revoke all
on function public.criar_barbearia_com_horarios(
  text,
  text,
  text,
  text,
  time,
  time,
  integer[],
  uuid,
  text
)
from public;


grant execute
on function public.criar_barbearia_com_horarios(
  text,
  text,
  text,
  text,
  time,
  time,
  integer[],
  uuid,
  text
)
to authenticated;


-- =========================================================
-- 3. FINALIZAR CADASTRO DO CLIENTE
-- =========================================================
--
-- Usado por:
--
-- cadastro por e-mail/senha
-- Google OAuth
--
-- Nunca recebe e-mail do frontend como fonte confiável.
--
-- O e-mail é obtido diretamente de auth.users.

create or replace function public.finalizar_cadastro_cliente(
  p_nome text,
  p_telefone text default null
)
returns public.clientes
language plpgsql
security definer
set search_path = public, auth
as $$
declare
  v_cliente public.clientes%rowtype;

  v_tipo_atual text;

  v_nome text;
  v_telefone text;
  v_email text;
begin

  -- =======================================================
  -- AUTENTICAÇÃO
  -- =======================================================

  if auth.uid() is null then
    raise exception
      'Usuário não autenticado.';
  end if;


  -- =======================================================
  -- NORMALIZAR DADOS
  -- =======================================================

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
      'Digite seu nome.';
  end if;


  v_telefone :=
    nullif(
      regexp_replace(
        coalesce(
          p_telefone,
          ''
        ),
        '\D',
        '',
        'g'
      ),
      ''
    );


  -- O e-mail vem da identidade autenticada,
  -- e não de um valor enviado pelo navegador.

  select
    lower(
      nullif(
        trim(u.email),
        ''
      )
    )
  into v_email
  from auth.users u
  where u.id = auth.uid();


  if v_email is null then
    raise exception
      'A conta autenticada não possui um e-mail válido.';
  end if;


  -- =======================================================
  -- PROFILE
  -- =======================================================

  select p.tipo
  into v_tipo_atual
  from public.profiles p
  where p.id = auth.uid();


  -- Google pode ter criado somente auth.users.

  if not found then

    insert into public.profiles (
      id,
      nome,
      telefone,
      tipo
    )
    values (
      auth.uid(),
      v_nome,
      v_telefone,
      'cliente'
    );

    v_tipo_atual :=
      'cliente';

  else

    if v_tipo_atual <> 'cliente' then
      raise exception
        'Esta conta está vinculada a outro tipo de acesso. Use o fluxo de mudança de perfil.';
    end if;


    update public.profiles
    set
      nome =
        v_nome,

      telefone =
        v_telefone

    where id =
      auth.uid();

  end if;


  -- =======================================================
  -- CLIENTE JÁ EXISTE
  -- =======================================================
  --
  -- profile_id possui UNIQUE, então existe no máximo
  -- um cadastro comercial diretamente vinculado à conta.

  select *
  into v_cliente
  from public.clientes c
  where c.profile_id = auth.uid()
  limit 1;


  if found then

    update public.clientes
    set
      nome =
        v_nome,

      telefone =
        v_telefone,

      email =
        v_email

    where id =
      v_cliente.id

    returning *
    into v_cliente;


    return v_cliente;

  end if;


  -- =======================================================
  -- CRIAR CLIENTE
  -- =======================================================

  insert into public.clientes (
    profile_id,
    nome,
    telefone,
    email
  )
  values (
    auth.uid(),
    v_nome,
    v_telefone,
    v_email
  )
  returning *
  into v_cliente;


  return v_cliente;
end;
$$;


revoke all
on function public.finalizar_cadastro_cliente(
  text,
  text
)
from public;


grant execute
on function public.finalizar_cadastro_cliente(
  text,
  text
)
to authenticated;


-- =========================================================
-- 4. STORAGE DE LOGOS DAS BARBEARIAS
-- =========================================================
--
-- Estrutura:
--
-- barbearias/
--   {usuario_id}/
--     {barbearia_id}/
--       logo-uuid.webp
--
-- O bucket é público porque a logo é conteúdo público.
--
-- Escrita continua protegida por usuário autenticado.

insert into storage.buckets (
  id,
  name,
  public,
  file_size_limit,
  allowed_mime_types
)
values (
  'barbearias',
  'barbearias',
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
-- STORAGE: INSERT
-- =========================================================

drop policy if exists
  "barbearias_storage_insert_proprio"
on storage.objects;


create policy
  "barbearias_storage_insert_proprio"

on storage.objects

for insert

to authenticated

with check (
  bucket_id = 'barbearias'

  and (
    storage.foldername(name)
  )[1] = auth.uid()::text
);


-- =========================================================
-- STORAGE: UPDATE
-- =========================================================

drop policy if exists
  "barbearias_storage_update_proprio"
on storage.objects;


create policy
  "barbearias_storage_update_proprio"

on storage.objects

for update

to authenticated

using (
  bucket_id = 'barbearias'

  and (
    storage.foldername(name)
  )[1] = auth.uid()::text
)

with check (
  bucket_id = 'barbearias'

  and (
    storage.foldername(name)
  )[1] = auth.uid()::text
);


-- =========================================================
-- STORAGE: DELETE
-- =========================================================

drop policy if exists
  "barbearias_storage_delete_proprio"
on storage.objects;


create policy
  "barbearias_storage_delete_proprio"

on storage.objects

for delete

to authenticated

using (
  bucket_id = 'barbearias'

  and (
    storage.foldername(name)
  )[1] = auth.uid()::text
);
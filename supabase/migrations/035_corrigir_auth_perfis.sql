-- BarberHub
-- Migration 035: correções de autenticação e segurança de perfis
--
-- Tipos oficiais:
-- dono
-- cliente
-- profissional
--
-- Objetivos:
-- 1. impedir alteração direta do tipo de conta;
-- 2. impedir que OAuth sem metadata vire cliente automaticamente;
-- 3. corrigir profiles provisórios criados incorretamente pelo OAuth;
-- 4. manter suporte aos três tipos oficiais;
-- 5. preservar a validação especial das contas profissionais.

begin;

-- =========================================================
-- 1. GARANTIR OS TRÊS TIPOS OFICIAIS
-- =========================================================

alter table public.profiles
drop constraint if exists profiles_tipo_check;

alter table public.profiles
add constraint profiles_tipo_check
check (
  tipo in (
    'dono',
    'cliente',
    'profissional'
  )
);

-- =========================================================
-- 2. BLOQUEAR ALTERAÇÃO DIRETA DO TIPO DE CONTA
-- =========================================================
--
-- A migration antiga concedeu UPDATE da linha inteira.
-- Isso permitiria tentar alterar "tipo" diretamente.
--
-- Mantemos atualização direta somente para dados comuns.
-- Mudança de tipo deve acontecer apenas por fluxo controlado
-- no backend/RPC SECURITY DEFINER.

revoke update
on table public.profiles
from authenticated;

grant update (nome, telefone)
on table public.profiles
to authenticated;

-- Perfis não devem ser criados ou apagados diretamente
-- pelo frontend.

revoke insert, delete
on table public.profiles
from authenticated;

-- Leitura continua sujeita à RLS.

grant select
on table public.profiles
to authenticated;

-- =========================================================
-- 3. CORRIGIR TRIGGER DE NOVOS USUÁRIOS
-- =========================================================
--
-- REGRA IMPORTANTE:
--
-- Cadastro tradicional:
-- frontend envia metadata.tipo
-- -> profile pode ser criado imediatamente.
--
-- Google OAuth:
-- se não existir metadata.tipo confiável,
-- NÃO criaremos profile ainda.
--
-- O callback finalizar_login_google(p_tipo)
-- definirá o tipo correto posteriormente.
--
-- Isso evita:
--
-- Google OAuth
-- -> metadata sem tipo
-- -> cliente automático
-- -> tentativa de entrar como dono
-- -> "conta já cadastrada como cliente"

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public, auth
as $$
declare
  v_tipo text;
  v_nome text;
  v_telefone text;
begin
  v_tipo :=
    nullif(
      trim(
        coalesce(
          new.raw_user_meta_data ->> 'tipo',
          ''
        )
      ),
      ''
    );

  v_nome :=
    coalesce(
      nullif(
        trim(
          new.raw_user_meta_data ->> 'nome'
        ),
        ''
      ),
      nullif(
        trim(
          new.raw_user_meta_data ->> 'full_name'
        ),
        ''
      ),
      nullif(
        trim(
          new.raw_user_meta_data ->> 'name'
        ),
        ''
      )
    );

  v_telefone :=
    nullif(
      trim(
        coalesce(
          new.raw_user_meta_data ->> 'telefone',
          ''
        )
      ),
      ''
    );

  -- OAuth sem tipo definido:
  -- aguarda finalizar_login_google().
  if v_tipo is null then
    return new;
  end if;

  -- Nunca aceitar tipos arbitrários.
  if v_tipo not in (
    'dono',
    'cliente',
    'profissional'
  ) then
    return new;
  end if;

  insert into public.profiles (
    id,
    nome,
    telefone,
    tipo
  )
  values (
    new.id,
    v_nome,
    v_telefone,
    v_tipo
  )
  on conflict (id)
  do update set
    nome = coalesce(
      public.profiles.nome,
      excluded.nome
    ),
    telefone = coalesce(
      public.profiles.telefone,
      excluded.telefone
    );

  return new;
end;
$$;

-- Garantimos que o trigger atual continue apontando
-- para a função corrigida.

drop trigger if exists on_auth_user_created
on auth.users;

create trigger on_auth_user_created
after insert on auth.users
for each row
execute function public.handle_new_user();

-- =========================================================
-- 4. GOOGLE OAUTH SEGURO PARA OS TRÊS TIPOS
-- =========================================================

create or replace function public.finalizar_login_google(
  p_tipo text
)
returns table (
  tipo text,
  tem_barbearia boolean,
  cliente_id uuid
)
language plpgsql
security definer
set search_path = public, auth
as $$
declare
  v_user auth.users%rowtype;
  v_profile public.profiles%rowtype;

  v_nome text;

  v_cliente_id uuid;

  v_tem_barbearia boolean := false;

  v_tem_cliente boolean := false;
  v_tem_profissional boolean := false;
  v_tem_barbearia_existente boolean := false;

  v_metadata_tipo text;
begin
  if auth.uid() is null then
    raise exception 'Usuário não autenticado.';
  end if;

  if p_tipo not in (
    'dono',
    'cliente',
    'profissional'
  ) then
    raise exception 'Tipo de conta inválido.';
  end if;

  select *
  into v_user
  from auth.users
  where id = auth.uid();

  if v_user.id is null then
    raise exception
      'Usuário autenticado não encontrado.';
  end if;

  v_nome :=
    coalesce(
      nullif(
        trim(
          v_user.raw_user_meta_data ->> 'full_name'
        ),
        ''
      ),
      nullif(
        trim(
          v_user.raw_user_meta_data ->> 'name'
        ),
        ''
      ),
      nullif(
        trim(
          v_user.raw_user_meta_data ->> 'nome'
        ),
        ''
      ),
      nullif(
        trim(
          split_part(
            coalesce(v_user.email, ''),
            '@',
            1
          )
        ),
        ''
      ),
      'Usuário'
    );

  v_metadata_tipo :=
    nullif(
      trim(
        coalesce(
          v_user.raw_user_meta_data ->> 'tipo',
          ''
        )
      ),
      ''
    );

  select *
  into v_profile
  from public.profiles p
  where p.id = auth.uid();

  -- =======================================================
  -- PROFISSIONAL
  -- =======================================================
  --
  -- Um usuário não pode transformar a própria conta
  -- em profissional usando apenas o parâmetro da RPC.
  --
  -- A conta profissional precisa ter sido criada/liberada
  -- pela barbearia e possuir vínculo em profissionais.

  if p_tipo = 'profissional' then
    if v_profile.id is null
       or v_profile.tipo <> 'profissional'
    then
      raise exception
        'Sua conta profissional ainda não foi liberada pela barbearia.';
    end if;

    select exists (
      select 1
      from public.profissionais p
      where p.usuario_id = auth.uid()
        and p.ativo = true
    )
    into v_tem_profissional;

    if not v_tem_profissional then
      raise exception
        'Sua conta profissional não está vinculada a um profissional ativo.';
    end if;

    return query
    select
      'profissional'::text,
      false,
      null::uuid;

    return;
  end if;

  -- =======================================================
  -- DONO / CLIENTE
  -- =======================================================

  if v_profile.id is null then
    insert into public.profiles (
      id,
      nome,
      telefone,
      tipo
    )
    values (
      auth.uid(),
      v_nome,
      null,
      p_tipo
    )
    returning *
    into v_profile;

  elsif v_profile.tipo <> p_tipo then

    -- -----------------------------------------------------
    -- CORREÇÃO DE PROFILE PROVISÓRIO ANTIGO
    -- -----------------------------------------------------
    --
    -- Versões anteriores criavam automaticamente
    -- "cliente" quando Google OAuth não enviava tipo.
    --
    -- Podemos corrigir esse profile somente quando existem
    -- fortes evidências de que ele nunca virou uma conta
    -- real de cliente/dono/profissional.

    select exists (
      select 1
      from public.clientes c
      where c.profile_id = auth.uid()
    )
    into v_tem_cliente;

    select exists (
      select 1
      from public.barbearias b
      where b.dono_id = auth.uid()
    )
    into v_tem_barbearia_existente;

    select exists (
      select 1
      from public.profissionais p
      where p.usuario_id = auth.uid()
    )
    into v_tem_profissional;

    if v_profile.tipo = 'cliente'
       and p_tipo = 'dono'
       and v_metadata_tipo is null
       and not v_tem_cliente
       and not v_tem_barbearia_existente
       and not v_tem_profissional
    then
      update public.profiles
      set
        tipo = 'dono',
        nome = coalesce(
          nullif(trim(nome), ''),
          v_nome
        )
      where id = auth.uid()
      returning *
      into v_profile;

    else
      raise exception
        'Esta conta já está cadastrada como %. Entre pela área correspondente.',
        case
          when v_profile.tipo = 'dono'
            then 'barbearia'
          when v_profile.tipo = 'cliente'
            then 'cliente'
          when v_profile.tipo = 'profissional'
            then 'profissional'
          else v_profile.tipo
        end;
    end if;

  else
    update public.profiles
    set nome =
      case
        when nullif(
          trim(
            coalesce(nome, '')
          ),
          ''
        ) is null
        then v_nome
        else nome
      end
    where id = auth.uid()
    returning *
    into v_profile;
  end if;

  -- =======================================================
  -- CLIENTE
  -- =======================================================

  if p_tipo = 'cliente' then
    insert into public.clientes (
      profile_id,
      nome,
      telefone,
      email
    )
    values (
      auth.uid(),
      coalesce(
        nullif(
          trim(v_profile.nome),
          ''
        ),
        v_nome
      ),
      v_profile.telefone,
      v_user.email
    )
    on conflict (profile_id)
    do update set
      nome = coalesce(
        nullif(
          trim(
            public.clientes.nome
          ),
          ''
        ),
        excluded.nome
      ),
      email = coalesce(
        public.clientes.email,
        excluded.email
      )
    returning public.clientes.id
    into v_cliente_id;

  -- =======================================================
  -- DONO
  -- =======================================================

  elsif p_tipo = 'dono' then
    select exists (
      select 1
      from public.barbearias b
      where b.dono_id = auth.uid()
    )
    into v_tem_barbearia;
  end if;

  return query
  select
    p_tipo,
    v_tem_barbearia,
    v_cliente_id;
end;
$$;

revoke all
on function public.finalizar_login_google(text)
from public;

grant execute
on function public.finalizar_login_google(text)
to authenticated;

commit;
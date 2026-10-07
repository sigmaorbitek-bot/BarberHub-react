-- BarberHub
-- Migration 014: contas e permissões de profissionais
-- Executar após 013_horarios.sql.
--
-- Responsabilidades:
-- - vincular profissional a uma conta autenticada;
-- - armazenar dados de acesso;
-- - controlar comissão;
-- - controlar permissões;
-- - fornecer contexto seguro ao painel profissional;
-- - concluir primeiro acesso;
-- - reconhecer profissional no Google OAuth;
-- - proteger campos sensíveis contra escrita direta.
--
-- IMPORTANTE:
-- Não recriamos handle_new_user().
-- A versão segura já foi definida nas migrations anteriores.
-- Profissional não pode se autocadastrar apenas escolhendo
-- "profissional" na tela de login.

begin;

-- =========================================================
-- 1. CAMPOS DE ACESSO DO PROFISSIONAL
-- =========================================================

alter table public.profissionais
add column if not exists usuario_id uuid
references public.profiles(id)
on delete set null;


alter table public.profissionais
add column if not exists email_acesso text;


alter table public.profissionais
add column if not exists primeiro_acesso_pendente boolean
not null
default false;


alter table public.profissionais
add column if not exists comissao_percentual numeric(5,2)
not null
default 0;


-- =========================================================
-- 2. VALIDAÇÃO DA COMISSÃO
-- =========================================================

alter table public.profissionais
drop constraint if exists
profissionais_comissao_percentual_check;


alter table public.profissionais
add constraint profissionais_comissao_percentual_check
check (
  comissao_percentual >= 0
  and comissao_percentual <= 100
);


-- =========================================================
-- 3. IDENTIDADE DA CONTA PROFISSIONAL
-- =========================================================
--
-- Na arquitetura atual:
-- - uma conta representa um único profissional;
-- - um e-mail de acesso não pode pertencer a dois
--   profissionais diferentes.

create unique index if not exists
idx_profissionais_usuario_unico
on public.profissionais (
  usuario_id
)
where usuario_id is not null;


create unique index if not exists
idx_profissionais_email_acesso_unico
on public.profissionais (
  lower(email_acesso)
)
where email_acesso is not null;


-- =========================================================
-- 4. NORMALIZAÇÃO DO EMAIL DE ACESSO
-- =========================================================

create or replace function public.normalizar_email_profissional()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if new.email_acesso is not null then
    new.email_acesso :=
      nullif(
        lower(
          trim(
            new.email_acesso
          )
        ),
        ''
      );
  end if;

  return new;
end;
$$;


revoke all
on function public.normalizar_email_profissional()
from public;


drop trigger if exists
trg_profissionais_normalizar_email
on public.profissionais;


create trigger trg_profissionais_normalizar_email
before insert
or update of email_acesso
on public.profissionais
for each row
execute function public.normalizar_email_profissional();


-- =========================================================
-- 5. PERMISSÕES DOS PROFISSIONAIS
-- =========================================================

create table if not exists public.permissoes_profissionais (
  profissional_id uuid primary key
    references public.profissionais(id)
    on delete cascade,

  ver_agendamentos boolean
    not null
    default true,

  alterar_status boolean
    not null
    default true,

  ver_cliente_telefone boolean
    not null
    default true,

  ver_financeiro boolean
    not null
    default false,

  ver_comissao boolean
    not null
    default false,

  ver_agenda_equipe boolean
    not null
    default false,

  ver_clientes boolean
    not null
    default false,

  ver_produtos boolean
    not null
    default false,

  created_at timestamptz
    not null
    default now(),

  updated_at timestamptz
    not null
    default now()
);


alter table public.permissoes_profissionais
enable row level security;


-- =========================================================
-- 6. RLS DAS PERMISSÕES
-- =========================================================

drop policy if exists
"permissoes_profissionais_select_dono"
on public.permissoes_profissionais;


create policy
"permissoes_profissionais_select_dono"
on public.permissoes_profissionais
for select
to authenticated
using (
  exists (
    select 1
    from public.profissionais p
    where p.id =
      permissoes_profissionais.profissional_id
      and public.eh_dono_da_barbearia(
        p.barbearia_id
      )
  )
);


drop policy if exists
"permissoes_profissionais_select_proprio"
on public.permissoes_profissionais;


create policy
"permissoes_profissionais_select_proprio"
on public.permissoes_profissionais
for select
to authenticated
using (
  exists (
    select 1
    from public.profissionais p
    where p.id =
      permissoes_profissionais.profissional_id
      and p.usuario_id =
        auth.uid()
  )
);


-- Escrita direta pelo navegador fica bloqueada.
-- A Edge Function usa service_role.
-- Alterações posteriores do dono passam pela RPC.

revoke insert, update, delete
on table public.permissoes_profissionais
from authenticated;


grant select
on table public.permissoes_profissionais
to authenticated;


-- =========================================================
-- 7. PROTEÇÃO DOS CAMPOS SENSÍVEIS EM PROFISSIONAIS
-- =========================================================
--
-- O navegador pode continuar cadastrando e editando os
-- dados comerciais usados em ProfissionaisPage.
--
-- Campos de autenticação e comissão NÃO ficam disponíveis
-- para alteração direta pelo frontend.

revoke insert
on table public.profissionais
from authenticated;


grant insert (
  barbearia_id,
  nome,
  telefone,
  foto_url,
  ativo
)
on table public.profissionais
to authenticated;


revoke update
on table public.profissionais
from authenticated;


grant update (
  nome,
  telefone,
  foto_url,
  ativo
)
on table public.profissionais
to authenticated;


-- DELETE permanece bloqueado conforme migration 012.


-- =========================================================
-- 8. SALVAR PERMISSÕES E COMISSÃO
-- =========================================================

create or replace function public.salvar_acesso_profissional(
  p_profissional_id uuid,
  p_ver_agendamentos boolean,
  p_alterar_status boolean,
  p_ver_cliente_telefone boolean,
  p_ver_financeiro boolean,
  p_ver_comissao boolean,
  p_ver_agenda_equipe boolean,
  p_ver_clientes boolean,
  p_ver_produtos boolean,
  p_comissao_percentual numeric
)
returns void
language plpgsql
security definer
set search_path = public, auth
as $$
declare
  v_barbearia_id uuid;
  v_usuario_id uuid;
begin
  if auth.uid() is null then
    raise exception
      'Usuário não autenticado.';
  end if;


  select
    p.barbearia_id,
    p.usuario_id
  into
    v_barbearia_id,
    v_usuario_id
  from public.profissionais p
  where p.id =
    p_profissional_id;


  if not found then
    raise exception
      'Profissional não encontrado.';
  end if;


  if not public.eh_dono_da_barbearia(
    v_barbearia_id
  ) then
    raise exception
      'Você não possui acesso a este profissional.';
  end if;


  if v_usuario_id is null then
    raise exception
      'Este profissional ainda não possui uma conta vinculada.';
  end if;


  if p_comissao_percentual is null
     or p_comissao_percentual < 0
     or p_comissao_percentual > 100 then

    raise exception
      'A comissão precisa estar entre 0 e 100 por cento.';

  end if;


  update public.profissionais
  set comissao_percentual =
    p_comissao_percentual
  where id =
    p_profissional_id;


  insert into public.permissoes_profissionais (
    profissional_id,
    ver_agendamentos,
    alterar_status,
    ver_cliente_telefone,
    ver_financeiro,
    ver_comissao,
    ver_agenda_equipe,
    ver_clientes,
    ver_produtos
  )
  values (
    p_profissional_id,

    coalesce(
      p_ver_agendamentos,
      true
    ),

    coalesce(
      p_alterar_status,
      true
    ),

    coalesce(
      p_ver_cliente_telefone,
      true
    ),

    coalesce(
      p_ver_financeiro,
      false
    ),

    coalesce(
      p_ver_comissao,
      false
    ),

    coalesce(
      p_ver_agenda_equipe,
      false
    ),

    coalesce(
      p_ver_clientes,
      false
    ),

    coalesce(
      p_ver_produtos,
      false
    )
  )

  on conflict (
    profissional_id
  )

  do update set
    ver_agendamentos =
      excluded.ver_agendamentos,

    alterar_status =
      excluded.alterar_status,

    ver_cliente_telefone =
      excluded.ver_cliente_telefone,

    ver_financeiro =
      excluded.ver_financeiro,

    ver_comissao =
      excluded.ver_comissao,

    ver_agenda_equipe =
      excluded.ver_agenda_equipe,

    ver_clientes =
      excluded.ver_clientes,

    ver_produtos =
      excluded.ver_produtos,

    updated_at =
      now();
end;
$$;


revoke all
on function public.salvar_acesso_profissional(
  uuid,
  boolean,
  boolean,
  boolean,
  boolean,
  boolean,
  boolean,
  boolean,
  boolean,
  numeric
)
from public;


grant execute
on function public.salvar_acesso_profissional(
  uuid,
  boolean,
  boolean,
  boolean,
  boolean,
  boolean,
  boolean,
  boolean,
  boolean,
  numeric
)
to authenticated;


-- =========================================================
-- 9. CONTEXTO SEGURO DO PROFISSIONAL
-- =========================================================
--
-- Esta função alimenta ProfissionalContext.
--
-- Foto do profissional e logo da barbearia serão
-- acrescentadas pelas migrations específicas de imagem.

create or replace function public.obter_contexto_profissional()
returns table (
  profissional_id uuid,
  barbearia_id uuid,
  profissional_nome text,
  barbearia_nome text,
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
    b.nome,
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
-- 10. CONCLUIR PRIMEIRO ACESSO
-- =========================================================

create or replace function public.concluir_primeiro_acesso_profissional()
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


  update public.profissionais p
  set primeiro_acesso_pendente =
    false
  where p.usuario_id =
    auth.uid()
    and p.ativo =
      true;


  if not found then
    raise exception
      'Profissional não encontrado.';
  end if;
end;
$$;


revoke all
on function public.concluir_primeiro_acesso_profissional()
from public;


grant execute
on function public.concluir_primeiro_acesso_profissional()
to authenticated;


-- =========================================================
-- 11. LOGIN GOOGLE
-- =========================================================
--
-- REGRAS:
--
-- dono:
--   pode possuir/criar profile dono;
--
-- cliente:
--   pode possuir/criar profile cliente;
--   o cadastro comercial continua separado;
--
-- profissional:
--   não pode se tornar profissional apenas escolhendo
--   a área profissional;
--   precisa ter sido previamente vinculado pela barbearia.

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
  v_tem_barbearia boolean :=
    false;
begin
  if auth.uid() is null then
    raise exception
      'Usuário não autenticado.';
  end if;


  if p_tipo not in (
    'dono',
    'cliente',
    'profissional'
  ) then
    raise exception
      'Tipo de conta inválido.';
  end if;


  select *
  into v_user
  from auth.users
  where id =
    auth.uid();


  if not found then
    raise exception
      'Usuário autenticado não encontrado.';
  end if;


  v_nome :=
    coalesce(
      nullif(
        trim(
          v_user.raw_user_meta_data
            ->> 'nome'
        ),
        ''
      ),

      nullif(
        trim(
          v_user.raw_user_meta_data
            ->> 'full_name'
        ),
        ''
      ),

      nullif(
        trim(
          v_user.raw_user_meta_data
            ->> 'name'
        ),
        ''
      ),

      nullif(
        trim(
          split_part(
            coalesce(
              v_user.email,
              ''
            ),
            '@',
            1
          )
        ),
        ''
      ),

      'Usuário'
    );


  select *
  into v_profile
  from public.profiles p
  where p.id =
    auth.uid();


  -- =======================================================
  -- PROFILE AINDA NÃO EXISTE
  -- =======================================================

  if not found then

    if p_tipo =
      'profissional' then

      raise exception
        'Sua conta profissional ainda não foi liberada pela barbearia.';

    end if;


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


  -- =======================================================
  -- PROFILE DE OUTRO TIPO
  -- =======================================================

  elsif v_profile.tipo <>
    p_tipo then

    raise exception
      'Esta conta já está cadastrada como %. Entre pela área correspondente.',
      case
        when v_profile.tipo =
          'dono'
          then 'barbearia'

        when v_profile.tipo =
          'cliente'
          then 'cliente'

        when v_profile.tipo =
          'profissional'
          then 'profissional'

        else
          v_profile.tipo
      end;


  -- =======================================================
  -- PROFILE JÁ POSSUI O MESMO TIPO
  -- =======================================================

  else

    update public.profiles p
    set nome =
      case
        when nullif(
          trim(
            coalesce(
              p.nome,
              ''
            )
          ),
          ''
        ) is null
        then v_nome
        else p.nome
      end
    where p.id =
      auth.uid()
    returning *
    into v_profile;

  end if;


  -- =======================================================
  -- DONO
  -- =======================================================

  if p_tipo =
    'dono' then

    select exists (
      select 1
      from public.barbearias b
      where b.dono_id =
        auth.uid()
    )
    into v_tem_barbearia;


  -- =======================================================
  -- CLIENTE
  -- =======================================================

  elsif p_tipo =
    'cliente' then

    select c.id
    into v_cliente_id
    from public.clientes c
    where c.profile_id =
      auth.uid()
    limit 1;


  -- =======================================================
  -- PROFISSIONAL
  -- =======================================================

  else

    if not exists (
      select 1
      from public.profissionais p
      where p.usuario_id =
        auth.uid()
        and p.ativo =
          true
    ) then

      raise exception
        'Sua conta profissional não está vinculada a um profissional ativo.';

    end if;

  end if;


  return query
  select
    v_profile.tipo,
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


-- =========================================================
-- 12. VALIDAÇÃO DA MIGRATION
-- =========================================================

do $$
begin

  if not exists (
    select 1
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'profissionais'
      and column_name = 'usuario_id'
  ) then
    raise exception
      'Falha na migration 014: coluna usuario_id não foi criada.';
  end if;


  if not exists (
    select 1
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'profissionais'
      and column_name = 'email_acesso'
  ) then
    raise exception
      'Falha na migration 014: coluna email_acesso não foi criada.';
  end if;


  if not exists (
    select 1
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'profissionais'
      and column_name = 'primeiro_acesso_pendente'
  ) then
    raise exception
      'Falha na migration 014: coluna primeiro_acesso_pendente não foi criada.';
  end if;


  if not exists (
    select 1
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'profissionais'
      and column_name = 'comissao_percentual'
  ) then
    raise exception
      'Falha na migration 014: coluna comissao_percentual não foi criada.';
  end if;


  if to_regclass(
    'public.permissoes_profissionais'
  ) is null then

    raise exception
      'Falha na migration 014: tabela permissoes_profissionais não foi criada.';

  end if;


  if to_regprocedure(
    'public.salvar_acesso_profissional(uuid,boolean,boolean,boolean,boolean,boolean,boolean,boolean,boolean,numeric)'
  ) is null then

    raise exception
      'Falha na migration 014: RPC salvar_acesso_profissional não foi criada.';

  end if;


  if to_regprocedure(
    'public.obter_contexto_profissional()'
  ) is null then

    raise exception
      'Falha na migration 014: RPC obter_contexto_profissional não foi criada.';

  end if;


  if to_regprocedure(
    'public.concluir_primeiro_acesso_profissional()'
  ) is null then

    raise exception
      'Falha na migration 014: RPC concluir_primeiro_acesso_profissional não foi criada.';

  end if;

end;
$$;


commit;
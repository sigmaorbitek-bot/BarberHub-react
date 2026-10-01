-- BarberHub React
-- Migration 014: contas e permissões de profissionais
-- Executar após 013_horarios.sql.

-- 1. Novo tipo de perfil
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

-- 2. Vínculo entre profissional e conta autenticada
alter table public.profissionais
add column if not exists usuario_id uuid
references public.profiles(id)
on delete set null;

alter table public.profissionais
add column if not exists email_acesso text;

alter table public.profissionais
add column if not exists primeiro_acesso_pendente boolean
not null default false;

alter table public.profissionais
add column if not exists comissao_percentual numeric(5,2)
not null default 0
check (
  comissao_percentual >= 0
  and comissao_percentual <= 100
);

create unique index if not exists
idx_profissionais_usuario_unico
on public.profissionais (usuario_id)
where usuario_id is not null;

create unique index if not exists
idx_profissionais_email_acesso_unico
on public.profissionais (lower(email_acesso))
where email_acesso is not null;

-- 3. Permissões
create table if not exists public.permissoes_profissionais (
  profissional_id uuid primary key
    references public.profissionais(id)
    on delete cascade,

  ver_agendamentos boolean not null default true,
  alterar_status boolean not null default true,
  ver_cliente_telefone boolean not null default true,
  ver_financeiro boolean not null default false,
  ver_comissao boolean not null default false,
  ver_agenda_equipe boolean not null default false,
  ver_clientes boolean not null default false,
  ver_produtos boolean not null default false,

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.permissoes_profissionais
enable row level security;

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
      and p.usuario_id = auth.uid()
  )
);

-- Escrita direta bloqueada.
-- O dono altera permissões somente pela RPC abaixo.
revoke insert, update, delete
on public.permissoes_profissionais
from authenticated;

grant select
on public.permissoes_profissionais
to authenticated;

-- 4. Trigger de novos usuários aceita profissional
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public, auth
as $$
declare
  v_tipo text;
begin
  v_tipo :=
    coalesce(
      new.raw_user_meta_data ->> 'tipo',
      'cliente'
    );

  if v_tipo not in (
    'dono',
    'cliente',
    'profissional'
  ) then
    v_tipo := 'cliente';
  end if;

  insert into public.profiles (
    id,
    nome,
    telefone,
    tipo
  )
  values (
    new.id,
    nullif(
      trim(
        new.raw_user_meta_data ->> 'nome'
      ),
      ''
    ),
    nullif(
      trim(
        new.raw_user_meta_data ->> 'telefone'
      ),
      ''
    ),
    v_tipo
  )
  on conflict (id)
  do update set
    nome = coalesce(
      public.profiles.nome,
      excluded.nome
    );

  return new;
end;
$$;

-- 5. Atualizar permissões e comissão
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
begin
  if auth.uid() is null then
    raise exception 'Usuário não autenticado.';
  end if;

  select p.barbearia_id
  into v_barbearia_id
  from public.profissionais p
  where p.id = p_profissional_id;

  if v_barbearia_id is null
    or not public.eh_dono_da_barbearia(
      v_barbearia_id
    )
  then
    raise exception 'Você não possui acesso a este profissional.';
  end if;

  if p_comissao_percentual < 0
    or p_comissao_percentual > 100
  then
    raise exception 'Comissão inválida.';
  end if;

  update public.profissionais
  set comissao_percentual =
    p_comissao_percentual
  where id = p_profissional_id;

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
    coalesce(p_ver_agendamentos, true),
    coalesce(p_alterar_status, true),
    coalesce(p_ver_cliente_telefone, true),
    coalesce(p_ver_financeiro, false),
    coalesce(p_ver_comissao, false),
    coalesce(p_ver_agenda_equipe, false),
    coalesce(p_ver_clientes, false),
    coalesce(p_ver_produtos, false)
  )
  on conflict (profissional_id)
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
    updated_at = now();
end;
$$;

revoke all on function public.salvar_acesso_profissional(
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
) from public;

grant execute on function public.salvar_acesso_profissional(
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
) to authenticated;

-- 6. Contexto seguro da conta profissional
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
    coalesce(pp.ver_agendamentos, true),
    coalesce(pp.alterar_status, true),
    coalesce(pp.ver_cliente_telefone, true),
    coalesce(pp.ver_financeiro, false),
    coalesce(pp.ver_comissao, false),
    coalesce(pp.ver_agenda_equipe, false),
    coalesce(pp.ver_clientes, false),
    coalesce(pp.ver_produtos, false)
  from public.profissionais p
  join public.barbearias b
    on b.id = p.barbearia_id
  left join public.permissoes_profissionais pp
    on pp.profissional_id = p.id
  where p.usuario_id = auth.uid()
    and p.ativo = true
  limit 1;
$$;

revoke all on function public.obter_contexto_profissional()
from public;

grant execute on function public.obter_contexto_profissional()
to authenticated;

-- 7. Marcar primeiro acesso como concluído
create or replace function public.concluir_primeiro_acesso_profissional()
returns void
language plpgsql
security definer
set search_path = public, auth
as $$
begin
  if auth.uid() is null then
    raise exception 'Usuário não autenticado.';
  end if;

  update public.profissionais p
  set primeiro_acesso_pendente = false
  where p.usuario_id = auth.uid()
    and p.ativo = true;

  if not found then
    raise exception 'Profissional não encontrado.';
  end if;
end;
$$;

revoke all on function public.concluir_primeiro_acesso_profissional()
from public;

grant execute on function public.concluir_primeiro_acesso_profissional()
to authenticated;

-- 8. Google OAuth agora reconhece profissional.
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
    raise exception 'Usuário autenticado não encontrado.';
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

  select *
  into v_profile
  from public.profiles p
  where p.id = auth.uid();

  if v_profile.id is null then
    if p_tipo = 'profissional' then
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
  elsif v_profile.tipo <> p_tipo then
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
  elsif p_tipo = 'dono' then
    select exists (
      select 1
      from public.barbearias b
      where b.dono_id =
        auth.uid()
    )
    into v_tem_barbearia;
  else
    if not exists (
      select 1
      from public.profissionais p
      where p.usuario_id =
          auth.uid()
        and p.ativo = true
    ) then
      raise exception
        'Sua conta profissional não está vinculada a um profissional ativo.';
    end if;
  end if;

  return query
  select
    p_tipo,
    v_tem_barbearia,
    v_cliente_id;
end;
$$;

revoke all on function public.finalizar_login_google(text)
from public;

grant execute on function public.finalizar_login_google(text)
to authenticated;

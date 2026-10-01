-- BarberHub React
-- Migration 011: finalização segura do Google OAuth
-- Executar após as migrations anteriores.

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
  v_tipo text;
  v_nome text;
  v_cliente_id uuid;
  v_tem_barbearia boolean := false;
begin
  if auth.uid() is null then
    raise exception 'Usuário não autenticado.';
  end if;

  if p_tipo not in ('dono', 'cliente') then
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
      nullif(trim(v_user.raw_user_meta_data ->> 'full_name'), ''),
      nullif(trim(v_user.raw_user_meta_data ->> 'name'), ''),
      nullif(trim(v_user.raw_user_meta_data ->> 'nome'), ''),
      nullif(trim(split_part(coalesce(v_user.email, ''), '@', 1)), ''),
      'Usuário'
    );

  select *
  into v_profile
  from public.profiles p
  where p.id = auth.uid();

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
    raise exception
      'Esta conta já está cadastrada como %. Entre pela área correspondente.',
      case
        when v_profile.tipo = 'dono'
          then 'barbearia'
        when v_profile.tipo = 'cliente'
          then 'cliente'
        else v_profile.tipo
      end;
  else
    update public.profiles p
    set nome =
      case
        when nullif(trim(coalesce(p.nome, '')), '') is null
          then v_nome
        else p.nome
      end
    where p.id = auth.uid()
    returning *
    into v_profile;
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
        nullif(trim(v_profile.nome), ''),
        v_nome
      ),
      v_profile.telefone,
      v_user.email
    )
    on conflict (profile_id)
    do update set
      nome = coalesce(
        nullif(trim(public.clientes.nome), ''),
        excluded.nome
      ),
      email = coalesce(
        public.clientes.email,
        excluded.email
      )
    returning public.clientes.id
    into v_cliente_id;
  else
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

revoke all on function public.finalizar_login_google(text)
from public;

grant execute on function public.finalizar_login_google(text)
to authenticated;

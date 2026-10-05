-- BarberSig
-- Migration 036: identificação e atividade dos dispositivos Web Push

alter table public.push_subscriptions
add column if not exists dispositivo_nome text;

alter table public.push_subscriptions
add column if not exists plataforma text;

alter table public.push_subscriptions
add column if not exists navegador text;

alter table public.push_subscriptions
add column if not exists last_seen_at timestamptz;

alter table public.push_subscriptions
add column if not exists last_success_at timestamptz;

create index if not exists
idx_push_subscriptions_usuario_ativo
on public.push_subscriptions (
  usuario_id,
  ativo,
  updated_at desc
);

create or replace function public.salvar_push_subscription_v2(
  p_endpoint text,
  p_p256dh text,
  p_auth_key text,
  p_user_agent text default null,
  p_dispositivo_nome text default null,
  p_plataforma text default null,
  p_navegador text default null
)
returns uuid
language plpgsql
security definer
set search_path = public, auth
as $$
declare
  v_id uuid;
begin
  if auth.uid() is null then
    raise exception 'Usuário não autenticado.';
  end if;

  if nullif(trim(p_endpoint), '') is null
    or nullif(trim(p_p256dh), '') is null
    or nullif(trim(p_auth_key), '') is null then
    raise exception 'Assinatura push inválida.';
  end if;

  insert into public.push_subscriptions (
    usuario_id,
    endpoint,
    p256dh,
    auth_key,
    user_agent,
    dispositivo_nome,
    plataforma,
    navegador,
    ativo,
    last_seen_at
  )
  values (
    auth.uid(),
    trim(p_endpoint),
    trim(p_p256dh),
    trim(p_auth_key),
    nullif(trim(coalesce(p_user_agent, '')), ''),
    nullif(trim(coalesce(p_dispositivo_nome, '')), ''),
    nullif(trim(coalesce(p_plataforma, '')), ''),
    nullif(trim(coalesce(p_navegador, '')), ''),
    true,
    now()
  )
  on conflict (endpoint)
  do update set
    usuario_id = excluded.usuario_id,
    p256dh = excluded.p256dh,
    auth_key = excluded.auth_key,
    user_agent = excluded.user_agent,
    dispositivo_nome = excluded.dispositivo_nome,
    plataforma = excluded.plataforma,
    navegador = excluded.navegador,
    ativo = true,
    last_seen_at = now(),
    updated_at = now()
  returning id into v_id;

  return v_id;
end;
$$;

revoke all on function public.salvar_push_subscription_v2(
  text,
  text,
  text,
  text,
  text,
  text,
  text
) from public;

grant execute on function public.salvar_push_subscription_v2(
  text,
  text,
  text,
  text,
  text,
  text,
  text
) to authenticated;


create or replace function public.listar_meus_dispositivos_push()
returns table (
  id uuid,
  dispositivo_nome text,
  plataforma text,
  navegador text,
  ativo boolean,
  last_seen_at timestamptz,
  last_success_at timestamptz,
  created_at timestamptz
)
language sql
security definer
set search_path = public, auth
as $$
  select
    ps.id,
    coalesce(ps.dispositivo_nome, 'Dispositivo')::text,
    ps.plataforma,
    ps.navegador,
    ps.ativo,
    ps.last_seen_at,
    ps.last_success_at,
    ps.created_at
  from public.push_subscriptions ps
  where ps.usuario_id = auth.uid()
  order by
    ps.ativo desc,
    ps.last_seen_at desc nulls last,
    ps.created_at desc;
$$;

revoke all on function public.listar_meus_dispositivos_push()
from public;

grant execute on function public.listar_meus_dispositivos_push()
to authenticated;
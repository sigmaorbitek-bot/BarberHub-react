-- BarberHub React
-- Migration 033: perfil do cliente
-- Executar após 032_avaliacoes_anonimas.sql.

create or replace function public.obter_perfil_cliente()
returns table (
  cliente_id uuid,
  nome text,
  telefone text,
  email text,
  created_at timestamptz
)
language plpgsql
security definer
set search_path = public, auth
as $$
declare
  v_cliente_id uuid;
begin
  if auth.uid() is null then
    raise exception 'Usuário não autenticado.';
  end if;

  v_cliente_id := public.cliente_atual_id();

  if v_cliente_id is null then
    raise exception 'A conta autenticada não possui cadastro de cliente.';
  end if;

  return query
  select
    c.id,
    c.nome::text,
    c.telefone::text,
    c.email::text,
    c.created_at
  from public.clientes c
  where c.id = v_cliente_id;
end;
$$;

revoke all on function public.obter_perfil_cliente()
from public;

grant execute on function public.obter_perfil_cliente()
to authenticated;


create or replace function public.atualizar_perfil_cliente(
  p_nome text,
  p_telefone text
)
returns void
language plpgsql
security definer
set search_path = public, auth
as $$
declare
  v_cliente_id uuid;
  v_nome text;
  v_telefone text;
begin
  if auth.uid() is null then
    raise exception 'Usuário não autenticado.';
  end if;

  v_cliente_id := public.cliente_atual_id();

  if v_cliente_id is null then
    raise exception 'A conta autenticada não possui cadastro de cliente.';
  end if;

  v_nome := nullif(trim(coalesce(p_nome, '')), '');
  v_telefone := nullif(trim(coalesce(p_telefone, '')), '');

  if v_nome is null then
    raise exception 'Informe seu nome.';
  end if;

  if char_length(v_nome) > 120 then
    raise exception 'O nome deve ter no máximo 120 caracteres.';
  end if;

  if v_telefone is not null
    and char_length(v_telefone) > 30 then
    raise exception 'O telefone deve ter no máximo 30 caracteres.';
  end if;

  update public.profiles
  set
    nome = v_nome,
    telefone = v_telefone
  where id = auth.uid()
    and tipo = 'cliente';

  if not found then
    raise exception 'Perfil de cliente não encontrado.';
  end if;

  update public.clientes
  set
    nome = v_nome,
    telefone = v_telefone
  where id = v_cliente_id;
end;
$$;

revoke all on function public.atualizar_perfil_cliente(
  text,
  text
) from public;

grant execute on function public.atualizar_perfil_cliente(
  text,
  text
) to authenticated;

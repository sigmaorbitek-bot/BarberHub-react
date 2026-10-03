-- BarberHub React
-- Migration 029: contador de notificações não lidas do cliente
-- Executar após 028_notificacoes_cliente.sql.

create or replace function public.contar_notificacoes_cliente_nao_lidas()
returns bigint
language plpgsql
security definer
set search_path = public, auth
as $$
declare
  v_total bigint;
begin
  if auth.uid() is null then
    raise exception 'Usuário não autenticado.';
  end if;

  if not exists (
    select 1
    from public.profiles p
    where p.id = auth.uid()
      and p.tipo = 'cliente'
  ) then
    raise exception 'Esta função é exclusiva para clientes.';
  end if;

  select count(*)
  into v_total
  from public.notificacoes n
  where n.usuario_id = auth.uid()
    and n.lida = false;

  return coalesce(v_total, 0);
end;
$$;

revoke all on function public.contar_notificacoes_cliente_nao_lidas()
from public;

grant execute on function public.contar_notificacoes_cliente_nao_lidas()
to authenticated;

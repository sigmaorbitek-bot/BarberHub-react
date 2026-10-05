-- BarberHub React
-- Migration 031: avaliações do cliente
-- Executar após 030_cliente_produtos_pedidos.sql.

create or replace function public.listar_avaliacoes_cliente()
returns table (
  agendamento_id uuid,
  data_atendimento timestamptz,
  barbearia_id uuid,
  barbearia_nome text,
  barbearia_cidade text,
  barbearia_logo_url text,
  servico_nome text,
  profissional_nome text,
  avaliacao_id uuid,
  nota integer,
  comentario text,
  resposta_barbearia text,
  respondida_at timestamptz,
  avaliacao_created_at timestamptz
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
    a.id as agendamento_id,
    a.data_hora as data_atendimento,
    b.id as barbearia_id,
    b.nome::text as barbearia_nome,
    b.cidade::text as barbearia_cidade,
    b.logo_url::text as barbearia_logo_url,
    s.nome::text as servico_nome,
    coalesce(p.nome, 'Profissional não informado')::text as profissional_nome,
    av.id as avaliacao_id,
    av.nota,
    av.comentario,
    av.resposta_barbearia,
    av.respondida_at,
    av.created_at as avaliacao_created_at
  from public.agendamentos a
  join public.barbearias b
    on b.id = a.barbearia_id
  join public.servicos s
    on s.id = a.servico_id
  left join public.profissionais p
    on p.id = a.profissional_id
  left join public.avaliacoes av
    on av.agendamento_id = a.id
  where a.cliente_id = v_cliente_id
    and a.status = 'concluido'
  order by
    (av.id is null) desc,
    a.data_hora desc;
end;
$$;

revoke all on function public.listar_avaliacoes_cliente()
from public;

grant execute on function public.listar_avaliacoes_cliente()
to authenticated;

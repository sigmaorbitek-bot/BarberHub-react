-- BarberHub React
-- Migration 023: detalhamento diário do financeiro
-- Executar após 022_financeiro.sql.

create or replace function public.listar_movimentacoes_financeiras_painel(
  p_barbearia_id uuid,
  p_data_inicial date,
  p_data_final date
)
returns table (
  tipo text,
  data_movimento date,
  data_hora timestamptz,
  cliente_nome text,
  descricao text,
  profissional_nome text,
  quantidade integer,
  valor_unitario numeric,
  valor_entrada numeric,
  valor_saida numeric,
  comissao numeric,
  categoria text,
  pagamento text,
  observacao text
)
language plpgsql
security definer
set search_path = public, auth
as $$
declare
  v_timezone text;
begin
  if auth.uid() is null then
    raise exception 'Usuário não autenticado.';
  end if;

  if not public.eh_dono_da_barbearia(
    p_barbearia_id
  ) then
    raise exception 'Você não possui acesso a esta barbearia.';
  end if;

  if p_data_inicial is null
    or p_data_final is null
    or p_data_final < p_data_inicial
  then
    raise exception 'Período inválido.';
  end if;

  select coalesce(
    b.timezone,
    'America/Recife'
  )
  into v_timezone
  from public.barbearias b
  where b.id = p_barbearia_id;

  return query

  select
    'servico'::text as tipo,
    (
      a.data_hora
      at time zone v_timezone
    )::date as data_movimento,
    a.data_hora,
    coalesce(
      nullif(trim(cb.nome_local), ''),
      nullif(trim(a.cliente_nome), ''),
      c.nome,
      'Cliente'
    )::text as cliente_nome,
    s.nome::text as descricao,
    coalesce(
      p.nome,
      'Não informado'
    )::text as profissional_nome,
    1::integer as quantidade,
    s.preco::numeric as valor_unitario,
    s.preco::numeric as valor_entrada,
    0::numeric as valor_saida,
    (
      s.preco
      * coalesce(
          p.comissao_percentual,
          0
        )
      / 100
    )::numeric as comissao,
    null::text as categoria,
    null::text as pagamento,
    null::text as observacao
  from public.agendamentos a
  join public.servicos s
    on s.id = a.servico_id
  join public.clientes c
    on c.id = a.cliente_id
  left join public.clientes_barbearias cb
    on cb.cliente_id = a.cliente_id
    and cb.barbearia_id = a.barbearia_id
  left join public.profissionais p
    on p.id = a.profissional_id
  where a.barbearia_id = p_barbearia_id
    and a.status = 'concluido'
    and (
      a.data_hora
      at time zone v_timezone
    )::date between
      p_data_inicial
      and p_data_final

  union all

  select
    'produto'::text as tipo,
    (
      coalesce(
        pe.concluido_at,
        pe.atualizado_at,
        pe.created_at
      )
      at time zone v_timezone
    )::date as data_movimento,
    coalesce(
      pe.concluido_at,
      pe.atualizado_at,
      pe.created_at
    ) as data_hora,
    coalesce(
      nullif(trim(cb.nome_local), ''),
      c.nome,
      'Cliente'
    )::text as cliente_nome,
    pr.nome::text as descricao,
    null::text as profissional_nome,
    pe.quantidade::integer as quantidade,
    pe.preco_unitario::numeric as valor_unitario,
    (
      pe.quantidade
      * pe.preco_unitario
    )::numeric as valor_entrada,
    0::numeric as valor_saida,
    0::numeric as comissao,
    null::text as categoria,
    pe.forma_pagamento::text as pagamento,
    pe.observacoes::text as observacao
  from public.pedidos pe
  join public.produtos pr
    on pr.id = pe.produto_id
  join public.clientes c
    on c.id = pe.cliente_id
  left join public.clientes_barbearias cb
    on cb.cliente_id = pe.cliente_id
    and cb.barbearia_id = pe.barbearia_id
  where pe.barbearia_id = p_barbearia_id
    and pe.status = 'concluido'
    and (
      coalesce(
        pe.concluido_at,
        pe.atualizado_at,
        pe.created_at
      )
      at time zone v_timezone
    )::date between
      p_data_inicial
      and p_data_final

  union all

  select
    'gasto'::text as tipo,
    g.data_gasto as data_movimento,
    null::timestamptz as data_hora,
    null::text as cliente_nome,
    g.descricao::text as descricao,
    null::text as profissional_nome,
    null::integer as quantidade,
    null::numeric as valor_unitario,
    0::numeric as valor_entrada,
    g.valor::numeric as valor_saida,
    0::numeric as comissao,
    g.categoria::text as categoria,
    g.pagamento::text as pagamento,
    g.observacao::text as observacao
  from public.gastos g
  where g.barbearia_id = p_barbearia_id
    and g.arquivado = false
    and g.data_gasto between
      p_data_inicial
      and p_data_final

  order by
    data_movimento desc,
    data_hora desc nulls last,
    tipo asc;
end;
$$;

revoke all on function public.listar_movimentacoes_financeiras_painel(
  uuid,
  date,
  date
) from public;

grant execute on function public.listar_movimentacoes_financeiras_painel(
  uuid,
  date,
  date
) to authenticated;

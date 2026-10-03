-- BarberHub React
-- Migration 022: módulo financeiro
-- Executar após 021_pedidos.sql.

alter table public.gastos
add column if not exists arquivado boolean not null default false;

alter table public.gastos
add column if not exists updated_at timestamptz not null default now();

create index if not exists idx_gastos_barbearia_data_arquivado
on public.gastos (
  barbearia_id,
  data_gasto desc,
  arquivado
);

drop trigger if exists trg_gastos_updated_at
on public.gastos;

create trigger trg_gastos_updated_at
before update on public.gastos
for each row
execute function public.set_updated_at();


create or replace function public.obter_financeiro_painel(
  p_barbearia_id uuid,
  p_data_inicial date,
  p_data_final date
)
returns table (
  servicos_concluidos bigint,
  faturamento_servicos numeric,
  vendas_produtos bigint,
  faturamento_produtos numeric,
  entradas numeric,
  despesas numeric,
  comissoes_estimadas numeric,
  resultado_liquido numeric
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
  with servicos_periodo as (
    select
      a.id,
      s.preco,
      p.comissao_percentual
    from public.agendamentos a
    join public.servicos s
      on s.id = a.servico_id
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
  ),
  pedidos_periodo as (
    select
      pe.id,
      (
        pe.quantidade
        * pe.preco_unitario
      )::numeric as total
    from public.pedidos pe
    where pe.barbearia_id = p_barbearia_id
      and pe.status = 'concluido'
      and (
        coalesce(
          pe.concluido_at,
          pe.atualizado_at
        )
        at time zone v_timezone
      )::date between
        p_data_inicial
        and p_data_final
  ),
  gastos_periodo as (
    select g.valor
    from public.gastos g
    where g.barbearia_id = p_barbearia_id
      and g.arquivado = false
      and g.data_gasto between
        p_data_inicial
        and p_data_final
  ),
  resumo as (
    select
      (
        select count(*)
        from servicos_periodo
      )::bigint as total_servicos,

      coalesce(
        (
          select sum(sp.preco)
          from servicos_periodo sp
        ),
        0
      )::numeric as bruto_servicos,

      (
        select count(*)
        from pedidos_periodo
      )::bigint as total_produtos,

      coalesce(
        (
          select sum(pp.total)
          from pedidos_periodo pp
        ),
        0
      )::numeric as bruto_produtos,

      coalesce(
        (
          select sum(gp.valor)
          from gastos_periodo gp
        ),
        0
      )::numeric as total_gastos,

      coalesce(
        (
          select sum(
            sp.preco
            * coalesce(
                sp.comissao_percentual,
                0
              )
            / 100
          )
          from servicos_periodo sp
        ),
        0
      )::numeric as total_comissoes
  )
  select
    r.total_servicos,
    r.bruto_servicos,
    r.total_produtos,
    r.bruto_produtos,
    (
      r.bruto_servicos
      + r.bruto_produtos
    )::numeric,
    r.total_gastos,
    r.total_comissoes,
    (
      r.bruto_servicos
      + r.bruto_produtos
      - r.total_gastos
      - r.total_comissoes
    )::numeric
  from resumo r;
end;
$$;

revoke all on function public.obter_financeiro_painel(
  uuid,
  date,
  date
) from public;

grant execute on function public.obter_financeiro_painel(
  uuid,
  date,
  date
) to authenticated;


create or replace function public.listar_gastos_painel(
  p_barbearia_id uuid,
  p_data_inicial date,
  p_data_final date
)
returns table (
  gasto_id uuid,
  descricao text,
  valor numeric,
  categoria text,
  data_gasto date,
  pagamento text,
  observacao text,
  created_at timestamptz,
  updated_at timestamptz
)
language plpgsql
security definer
set search_path = public, auth
as $$
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

  return query
  select
    g.id,
    g.descricao,
    g.valor,
    g.categoria,
    g.data_gasto,
    g.pagamento,
    g.observacao,
    g.created_at,
    g.updated_at
  from public.gastos g
  where g.barbearia_id = p_barbearia_id
    and g.arquivado = false
    and g.data_gasto between
      p_data_inicial
      and p_data_final
  order by
    g.data_gasto desc,
    g.created_at desc;
end;
$$;

revoke all on function public.listar_gastos_painel(
  uuid,
  date,
  date
) from public;

grant execute on function public.listar_gastos_painel(
  uuid,
  date,
  date
) to authenticated;


create or replace function public.salvar_gasto_painel(
  p_barbearia_id uuid,
  p_gasto_id uuid,
  p_descricao text,
  p_valor numeric,
  p_categoria text,
  p_data_gasto date,
  p_pagamento text,
  p_observacao text
)
returns uuid
language plpgsql
security definer
set search_path = public, auth
as $$
declare
  v_id uuid;
  v_descricao text;
begin
  if auth.uid() is null then
    raise exception 'Usuário não autenticado.';
  end if;

  if not public.eh_dono_da_barbearia(
    p_barbearia_id
  ) then
    raise exception 'Você não possui acesso a esta barbearia.';
  end if;

  v_descricao :=
    nullif(
      trim(
        coalesce(
          p_descricao,
          ''
        )
      ),
      ''
    );

  if v_descricao is null then
    raise exception 'Digite a descrição do gasto.';
  end if;

  if p_valor is null
    or p_valor <= 0
  then
    raise exception 'Informe um valor maior que zero.';
  end if;

  if p_data_gasto is null then
    raise exception 'Informe a data do gasto.';
  end if;

  if p_gasto_id is not null then
    update public.gastos
    set
      descricao = v_descricao,
      valor = p_valor,
      categoria =
        nullif(
          trim(
            coalesce(
              p_categoria,
              ''
            )
          ),
          ''
        ),
      data_gasto = p_data_gasto,
      pagamento =
        nullif(
          trim(
            coalesce(
              p_pagamento,
              ''
            )
          ),
          ''
        ),
      observacao =
        nullif(
          trim(
            coalesce(
              p_observacao,
              ''
            )
          ),
          ''
        )
    where id = p_gasto_id
      and barbearia_id = p_barbearia_id
      and arquivado = false
    returning id
    into v_id;

    if v_id is null then
      raise exception 'Gasto não encontrado.';
    end if;

    return v_id;
  end if;

  insert into public.gastos (
    barbearia_id,
    descricao,
    valor,
    categoria,
    data_gasto,
    pagamento,
    observacao,
    arquivado
  )
  values (
    p_barbearia_id,
    v_descricao,
    p_valor,
    nullif(
      trim(
        coalesce(
          p_categoria,
          ''
        )
      ),
      ''
    ),
    p_data_gasto,
    nullif(
      trim(
        coalesce(
          p_pagamento,
          ''
        )
      ),
      ''
    ),
    nullif(
      trim(
        coalesce(
          p_observacao,
          ''
        )
      ),
      ''
    ),
    false
  )
  returning id
  into v_id;

  return v_id;
end;
$$;

revoke all on function public.salvar_gasto_painel(
  uuid,
  uuid,
  text,
  numeric,
  text,
  date,
  text,
  text
) from public;

grant execute on function public.salvar_gasto_painel(
  uuid,
  uuid,
  text,
  numeric,
  text,
  date,
  text,
  text
) to authenticated;


create or replace function public.arquivar_gasto_painel(
  p_barbearia_id uuid,
  p_gasto_id uuid
)
returns void
language plpgsql
security definer
set search_path = public, auth
as $$
begin
  if auth.uid() is null then
    raise exception 'Usuário não autenticado.';
  end if;

  if not public.eh_dono_da_barbearia(
    p_barbearia_id
  ) then
    raise exception 'Você não possui acesso a esta barbearia.';
  end if;

  update public.gastos
  set arquivado = true
  where id = p_gasto_id
    and barbearia_id = p_barbearia_id
    and arquivado = false;

  if not found then
    raise exception 'Gasto não encontrado.';
  end if;
end;
$$;

revoke all on function public.arquivar_gasto_painel(
  uuid,
  uuid
) from public;

grant execute on function public.arquivar_gasto_painel(
  uuid,
  uuid
) to authenticated;

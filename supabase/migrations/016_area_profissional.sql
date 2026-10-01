-- BarberHub React
-- Migration 016: painel real do profissional
-- Executar após 015_profissional_imagem.sql.

create or replace function public.listar_agendamentos_profissional()
returns table (
  id uuid,
  data_hora timestamptz,
  status text,
  cliente_nome text,
  cliente_telefone text,
  servico_nome text,
  servico_preco numeric,
  servico_duracao integer,
  profissional_id uuid
)
language plpgsql
security definer
set search_path = public, auth
as $$
declare
  v_profissional_id uuid;
  v_ver_agendamentos boolean;
  v_ver_cliente_telefone boolean;
begin
  if auth.uid() is null then
    raise exception 'Usuário não autenticado.';
  end if;

  select
    p.id,
    coalesce(pp.ver_agendamentos, true),
    coalesce(pp.ver_cliente_telefone, true)
  into
    v_profissional_id,
    v_ver_agendamentos,
    v_ver_cliente_telefone
  from public.profissionais p
  left join public.permissoes_profissionais pp
    on pp.profissional_id = p.id
  where p.usuario_id = auth.uid()
    and p.ativo = true
  limit 1;

  if v_profissional_id is null then
    raise exception 'Profissional não encontrado.';
  end if;

  if not v_ver_agendamentos then
    raise exception 'Acesso aos agendamentos não liberado.';
  end if;

  return query
  select
    a.id,
    a.data_hora,
    a.status,
    coalesce(
      c.nome,
      a.cliente_nome,
      'Cliente'
    ) as cliente_nome,
    case
      when v_ver_cliente_telefone
        then coalesce(
          c.telefone,
          a.cliente_telefone
        )
      else null
    end as cliente_telefone,
    s.nome as servico_nome,
    s.preco as servico_preco,
    s.duracao as servico_duracao,
    a.profissional_id
  from public.agendamentos a
  join public.servicos s
    on s.id = a.servico_id
  left join public.clientes c
    on c.id = a.cliente_id
  where a.profissional_id =
      v_profissional_id
    and a.arquivado = false
  order by a.data_hora asc;
end;
$$;

revoke all on function public.listar_agendamentos_profissional()
from public;

grant execute on function public.listar_agendamentos_profissional()
to authenticated;


create or replace function public.atualizar_status_agendamento_profissional(
  p_agendamento_id uuid,
  p_status text
)
returns void
language plpgsql
security definer
set search_path = public, auth
as $$
declare
  v_profissional_id uuid;
  v_alterar_status boolean;
  v_status_atual text;
begin
  if auth.uid() is null then
    raise exception 'Usuário não autenticado.';
  end if;

  select
    p.id,
    coalesce(pp.alterar_status, true)
  into
    v_profissional_id,
    v_alterar_status
  from public.profissionais p
  left join public.permissoes_profissionais pp
    on pp.profissional_id = p.id
  where p.usuario_id = auth.uid()
    and p.ativo = true
  limit 1;

  if v_profissional_id is null then
    raise exception 'Profissional não encontrado.';
  end if;

  if not v_alterar_status then
    raise exception 'Alteração de status não liberada.';
  end if;

  if p_status not in (
    'confirmado',
    'concluido',
    'cancelado'
  ) then
    raise exception 'Status inválido.';
  end if;

  select a.status
  into v_status_atual
  from public.agendamentos a
  where a.id = p_agendamento_id
    and a.profissional_id =
      v_profissional_id
    and a.arquivado = false
  for update;

  if v_status_atual is null then
    raise exception 'Agendamento não encontrado.';
  end if;

  if v_status_atual in (
    'cancelado',
    'concluido'
  ) then
    raise exception 'Este agendamento já está encerrado.';
  end if;

  if v_status_atual = 'pendente'
    and p_status not in (
      'confirmado',
      'cancelado'
    )
  then
    raise exception 'Confirme o agendamento antes de concluir.';
  end if;

  if v_status_atual = 'confirmado'
    and p_status not in (
      'concluido',
      'cancelado'
    )
  then
    raise exception 'Transição de status inválida.';
  end if;

  update public.agendamentos
  set status = p_status
  where id = p_agendamento_id
    and profissional_id =
      v_profissional_id;
end;
$$;

revoke all on function public.atualizar_status_agendamento_profissional(
  uuid,
  text
) from public;

grant execute on function public.atualizar_status_agendamento_profissional(
  uuid,
  text
) to authenticated;


create or replace function public.obter_financeiro_profissional(
  p_data_inicial date,
  p_data_final date
)
returns table (
  atendimentos_concluidos bigint,
  faturamento numeric,
  comissao_percentual numeric,
  comissao_estimada numeric,
  mostrar_comissao boolean
)
language plpgsql
security definer
set search_path = public, auth
as $$
declare
  v_profissional_id uuid;
  v_ver_financeiro boolean;
  v_ver_comissao boolean;
  v_comissao numeric;
begin
  if auth.uid() is null then
    raise exception 'Usuário não autenticado.';
  end if;

  if p_data_inicial is null
    or p_data_final is null
    or p_data_final < p_data_inicial
  then
    raise exception 'Período inválido.';
  end if;

  select
    p.id,
    coalesce(pp.ver_financeiro, false),
    coalesce(pp.ver_comissao, false),
    p.comissao_percentual
  into
    v_profissional_id,
    v_ver_financeiro,
    v_ver_comissao,
    v_comissao
  from public.profissionais p
  left join public.permissoes_profissionais pp
    on pp.profissional_id = p.id
  where p.usuario_id = auth.uid()
    and p.ativo = true
  limit 1;

  if v_profissional_id is null then
    raise exception 'Profissional não encontrado.';
  end if;

  if not v_ver_financeiro then
    raise exception 'Acesso ao financeiro não liberado.';
  end if;

  return query
  with resumo as (
    select
      count(*)::bigint as total,
      coalesce(
        sum(s.preco),
        0
      )::numeric as bruto
    from public.agendamentos a
    join public.servicos s
      on s.id = a.servico_id
    where a.profissional_id =
        v_profissional_id
      and a.status = 'concluido'
      and a.arquivado = false
      and (
        a.data_hora
        at time zone 'America/Recife'
      )::date >= p_data_inicial
      and (
        a.data_hora
        at time zone 'America/Recife'
      )::date <= p_data_final
  )
  select
    r.total,
    r.bruto,
    case
      when v_ver_comissao
        then v_comissao
      else null
    end,
    case
      when v_ver_comissao
        then round(
          (
            r.bruto *
            v_comissao /
            100
          )::numeric,
          2
        )
      else null
    end,
    v_ver_comissao
  from resumo r;
end;
$$;

revoke all on function public.obter_financeiro_profissional(
  date,
  date
) from public;

grant execute on function public.obter_financeiro_profissional(
  date,
  date
) to authenticated;

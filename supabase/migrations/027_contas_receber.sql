-- BarberHub React
-- Migration 027: Contas a Receber + integração de caixa
-- Executar após 026_configuracoes.sql.

alter table public.agendamentos
add column if not exists recebimento_via_conta boolean not null default false;

alter table public.agendamentos
add column if not exists situacao_pagamento text not null default 'pago';

alter table public.pedidos
add column if not exists recebimento_via_conta boolean not null default false;

alter table public.pedidos
add column if not exists situacao_pagamento text not null default 'pago';

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'agendamentos_situacao_pagamento_check'
  ) then
    alter table public.agendamentos
    add constraint agendamentos_situacao_pagamento_check
    check (situacao_pagamento in ('pago', 'a_receber', 'parcial'));
  end if;

  if not exists (
    select 1
    from pg_constraint
    where conname = 'pedidos_situacao_pagamento_check'
  ) then
    alter table public.pedidos
    add constraint pedidos_situacao_pagamento_check
    check (situacao_pagamento in ('pago', 'a_receber', 'parcial'));
  end if;
end
$$;

create table if not exists public.contas_receber (
  id uuid primary key default gen_random_uuid(),
  barbearia_id uuid not null references public.barbearias(id) on delete restrict,
  cliente_id uuid not null references public.clientes(id) on delete restrict,
  origem_tipo text not null default 'manual'
    check (origem_tipo in ('manual', 'agendamento', 'pedido', 'outro')),
  referencia_id uuid,
  descricao text not null,
  valor_original numeric(12,2) not null check (valor_original > 0),
  vencimento date not null,
  observacao text,
  cancelada boolean not null default false,
  cancelada_at timestamptz,
  arquivada boolean not null default false,
  arquivada_at timestamptz,
  criada_por uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.pagamentos_contas_receber (
  id uuid primary key default gen_random_uuid(),
  conta_id uuid not null references public.contas_receber(id) on delete restrict,
  barbearia_id uuid not null references public.barbearias(id) on delete restrict,
  cliente_id uuid not null references public.clientes(id) on delete restrict,
  valor numeric(12,2) not null check (valor > 0),
  forma_pagamento text not null
    check (forma_pagamento in ('dinheiro', 'pix', 'debito', 'credito', 'outro')),
  pago_em timestamptz not null default now(),
  observacao text,
  recebido_por uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now()
);

create index if not exists idx_contas_receber_barbearia_cliente
on public.contas_receber (barbearia_id, cliente_id, vencimento desc);

create index if not exists idx_contas_receber_barbearia_abertas
on public.contas_receber (barbearia_id, arquivada, cancelada, vencimento);

create unique index if not exists uq_contas_receber_origem
on public.contas_receber (barbearia_id, origem_tipo, referencia_id)
where referencia_id is not null and cancelada = false;

create index if not exists idx_pagamentos_conta_data
on public.pagamentos_contas_receber (conta_id, pago_em desc);

create index if not exists idx_pagamentos_barbearia_data
on public.pagamentos_contas_receber (barbearia_id, pago_em desc);

drop trigger if exists trg_contas_receber_updated_at on public.contas_receber;
create trigger trg_contas_receber_updated_at
before update on public.contas_receber
for each row execute function public.set_updated_at();

alter table public.contas_receber enable row level security;
alter table public.pagamentos_contas_receber enable row level security;

drop policy if exists "contas_receber_dono_select" on public.contas_receber;
create policy "contas_receber_dono_select"
on public.contas_receber for select
to authenticated
using (public.eh_dono_da_barbearia(barbearia_id));

drop policy if exists "contas_receber_cliente_select" on public.contas_receber;
create policy "contas_receber_cliente_select"
on public.contas_receber for select
to authenticated
using (
  exists (
    select 1
    from public.clientes c
    where c.id = contas_receber.cliente_id
      and c.profile_id = auth.uid()
  )
);

drop policy if exists "pagamentos_contas_dono_select" on public.pagamentos_contas_receber;
create policy "pagamentos_contas_dono_select"
on public.pagamentos_contas_receber for select
to authenticated
using (public.eh_dono_da_barbearia(barbearia_id));

drop policy if exists "pagamentos_contas_cliente_select" on public.pagamentos_contas_receber;
create policy "pagamentos_contas_cliente_select"
on public.pagamentos_contas_receber for select
to authenticated
using (
  exists (
    select 1
    from public.clientes c
    where c.id = pagamentos_contas_receber.cliente_id
      and c.profile_id = auth.uid()
  )
);

revoke insert, update, delete on public.contas_receber from authenticated;
revoke insert, update, delete on public.pagamentos_contas_receber from authenticated;

create or replace function public.listar_contas_receber_painel(
  p_barbearia_id uuid
)
returns table (
  conta_id uuid,
  cliente_id uuid,
  cliente_nome text,
  cliente_telefone text,
  cliente_email text,
  possui_conta boolean,
  origem_tipo text,
  referencia_id uuid,
  descricao text,
  valor_original numeric,
  valor_pago numeric,
  saldo numeric,
  vencimento date,
  status text,
  observacao text,
  arquivada boolean,
  ultimo_pagamento timestamptz,
  created_at timestamptz
)
language plpgsql
security definer
set search_path = public, auth
as $$
begin
  if auth.uid() is null then
    raise exception 'Usuário não autenticado.';
  end if;

  if not public.eh_dono_da_barbearia(p_barbearia_id) then
    raise exception 'Você não possui acesso a esta barbearia.';
  end if;

  return query
  with pagos as (
    select
      p.conta_id,
      coalesce(sum(p.valor), 0)::numeric as total_pago,
      max(p.pago_em) as ultimo
    from public.pagamentos_contas_receber p
    where p.barbearia_id = p_barbearia_id
    group by p.conta_id
  )
  select
    cr.id,
    c.id,
    coalesce(nullif(trim(cb.nome_local), ''), c.nome, 'Cliente')::text,
    coalesce(nullif(trim(cb.telefone_local), ''), c.telefone)::text,
    coalesce(nullif(trim(cb.email_local), ''), c.email)::text,
    (c.profile_id is not null),
    cr.origem_tipo,
    cr.referencia_id,
    cr.descricao,
    cr.valor_original,
    coalesce(pg.total_pago, 0)::numeric,
    greatest(cr.valor_original - coalesce(pg.total_pago, 0), 0)::numeric,
    cr.vencimento,
    case
      when cr.cancelada then 'cancelado'
      when cr.valor_original - coalesce(pg.total_pago, 0) <= 0 then 'pago'
      when cr.vencimento < current_date then 'vencido'
      when coalesce(pg.total_pago, 0) > 0 then 'parcial'
      else 'pendente'
    end::text,
    cr.observacao,
    cr.arquivada,
    pg.ultimo,
    cr.created_at
  from public.contas_receber cr
  join public.clientes c on c.id = cr.cliente_id
  left join public.clientes_barbearias cb
    on cb.cliente_id = c.id
   and cb.barbearia_id = cr.barbearia_id
  left join pagos pg on pg.conta_id = cr.id
  where cr.barbearia_id = p_barbearia_id
  order by
    cr.arquivada asc,
    case when cr.cancelada then 3
         when cr.valor_original - coalesce(pg.total_pago, 0) <= 0 then 2
         when cr.vencimento < current_date then 0
         else 1 end,
    cr.vencimento asc,
    cr.created_at desc;
end;
$$;

revoke all on function public.listar_contas_receber_painel(uuid) from public;
grant execute on function public.listar_contas_receber_painel(uuid) to authenticated;

create or replace function public.listar_origens_conta_receber_painel(
  p_barbearia_id uuid,
  p_cliente_id uuid
)
returns table (
  origem_tipo text,
  referencia_id uuid,
  titulo text,
  valor numeric,
  data_referencia timestamptz
)
language plpgsql
security definer
set search_path = public, auth
as $$
begin
  if auth.uid() is null then
    raise exception 'Usuário não autenticado.';
  end if;

  if not public.eh_dono_da_barbearia(p_barbearia_id) then
    raise exception 'Você não possui acesso a esta barbearia.';
  end if;

  return query
  select
    'agendamento'::text,
    a.id,
    ('Serviço: ' || s.nome)::text,
    s.preco::numeric,
    a.data_hora
  from public.agendamentos a
  join public.servicos s on s.id = a.servico_id
  where a.barbearia_id = p_barbearia_id
    and a.cliente_id = p_cliente_id
    and a.status = 'concluido'
    and a.recebimento_via_conta = false

  union all

  select
    'pedido'::text,
    pe.id,
    ('Produto: ' || pr.nome || ' x' || pe.quantidade)::text,
    (pe.quantidade * pe.preco_unitario)::numeric,
    coalesce(pe.concluido_at, pe.atualizado_at, pe.created_at)
  from public.pedidos pe
  join public.produtos pr on pr.id = pe.produto_id
  where pe.barbearia_id = p_barbearia_id
    and pe.cliente_id = p_cliente_id
    and pe.status = 'concluido'
    and pe.recebimento_via_conta = false

  order by data_referencia desc;
end;
$$;

revoke all on function public.listar_origens_conta_receber_painel(uuid, uuid) from public;
grant execute on function public.listar_origens_conta_receber_painel(uuid, uuid) to authenticated;

create or replace function public.criar_conta_receber_painel(
  p_barbearia_id uuid,
  p_cliente_id uuid,
  p_origem_tipo text,
  p_referencia_id uuid,
  p_descricao text,
  p_valor_original numeric,
  p_vencimento date,
  p_observacao text default null
)
returns uuid
language plpgsql
security definer
set search_path = public, auth
as $$
declare
  v_id uuid;
  v_origem text;
  v_descricao text;
  v_valor numeric;
  v_ref_valor numeric;
  v_ref_descricao text;
begin
  if auth.uid() is null then
    raise exception 'Usuário não autenticado.';
  end if;

  if not public.eh_dono_da_barbearia(p_barbearia_id) then
    raise exception 'Você não possui acesso a esta barbearia.';
  end if;

  if not exists (
    select 1
    from public.clientes_barbearias cb
    where cb.barbearia_id = p_barbearia_id
      and cb.cliente_id = p_cliente_id
      and cb.ativo = true
  ) then
    raise exception 'Cliente inválido ou inativo nesta barbearia.';
  end if;

  v_origem := lower(trim(coalesce(p_origem_tipo, 'manual')));
  if v_origem not in ('manual', 'agendamento', 'pedido', 'outro') then
    raise exception 'Origem inválida.';
  end if;

  if p_vencimento is null then
    raise exception 'Informe o vencimento.';
  end if;

  if v_origem = 'agendamento' then
    select s.preco, 'Serviço: ' || s.nome
      into v_ref_valor, v_ref_descricao
    from public.agendamentos a
    join public.servicos s on s.id = a.servico_id
    where a.id = p_referencia_id
      and a.barbearia_id = p_barbearia_id
      and a.cliente_id = p_cliente_id
      and a.status = 'concluido'
      and a.recebimento_via_conta = false;

    if not found then
      raise exception 'Agendamento concluído não encontrado ou já vinculado a uma conta.';
    end if;

    v_valor := v_ref_valor;
    v_descricao := v_ref_descricao;
  elsif v_origem = 'pedido' then
    select (pe.quantidade * pe.preco_unitario), 'Produto: ' || pr.nome || ' x' || pe.quantidade
      into v_ref_valor, v_ref_descricao
    from public.pedidos pe
    join public.produtos pr on pr.id = pe.produto_id
    where pe.id = p_referencia_id
      and pe.barbearia_id = p_barbearia_id
      and pe.cliente_id = p_cliente_id
      and pe.status = 'concluido'
      and pe.recebimento_via_conta = false;

    if not found then
      raise exception 'Pedido concluído não encontrado ou já vinculado a uma conta.';
    end if;

    v_valor := v_ref_valor;
    v_descricao := v_ref_descricao;
  else
    v_valor := p_valor_original;
    v_descricao := nullif(trim(coalesce(p_descricao, '')), '');
  end if;

  if v_descricao is null then
    raise exception 'Informe a descrição da conta.';
  end if;

  if v_valor is null or v_valor <= 0 then
    raise exception 'Informe um valor maior que zero.';
  end if;

  insert into public.contas_receber (
    barbearia_id,
    cliente_id,
    origem_tipo,
    referencia_id,
    descricao,
    valor_original,
    vencimento,
    observacao,
    criada_por
  )
  values (
    p_barbearia_id,
    p_cliente_id,
    v_origem,
    case when v_origem in ('agendamento', 'pedido') then p_referencia_id else null end,
    v_descricao,
    v_valor,
    p_vencimento,
    nullif(trim(coalesce(p_observacao, '')), ''),
    auth.uid()
  )
  returning id into v_id;

  if v_origem = 'agendamento' then
    update public.agendamentos
    set recebimento_via_conta = true,
        situacao_pagamento = 'a_receber'
    where id = p_referencia_id
      and barbearia_id = p_barbearia_id;
  elsif v_origem = 'pedido' then
    update public.pedidos
    set recebimento_via_conta = true,
        situacao_pagamento = 'a_receber'
    where id = p_referencia_id
      and barbearia_id = p_barbearia_id;
  end if;

  return v_id;
end;
$$;

revoke all on function public.criar_conta_receber_painel(uuid, uuid, text, uuid, text, numeric, date, text) from public;
grant execute on function public.criar_conta_receber_painel(uuid, uuid, text, uuid, text, numeric, date, text) to authenticated;

create or replace function public.listar_pagamentos_conta_receber_painel(
  p_barbearia_id uuid,
  p_conta_id uuid
)
returns table (
  pagamento_id uuid,
  valor numeric,
  forma_pagamento text,
  pago_em timestamptz,
  observacao text
)
language plpgsql
security definer
set search_path = public, auth
as $$
begin
  if auth.uid() is null then
    raise exception 'Usuário não autenticado.';
  end if;

  if not public.eh_dono_da_barbearia(p_barbearia_id) then
    raise exception 'Você não possui acesso a esta barbearia.';
  end if;

  return query
  select p.id, p.valor, p.forma_pagamento, p.pago_em, p.observacao
  from public.pagamentos_contas_receber p
  where p.barbearia_id = p_barbearia_id
    and p.conta_id = p_conta_id
  order by p.pago_em desc, p.created_at desc;
end;
$$;

revoke all on function public.listar_pagamentos_conta_receber_painel(uuid, uuid) from public;
grant execute on function public.listar_pagamentos_conta_receber_painel(uuid, uuid) to authenticated;

create or replace function public.registrar_pagamento_conta_receber_painel(
  p_barbearia_id uuid,
  p_conta_id uuid,
  p_valor numeric,
  p_forma_pagamento text,
  p_pago_em timestamptz default now(),
  p_observacao text default null
)
returns uuid
language plpgsql
security definer
set search_path = public, auth
as $$
declare
  v_conta public.contas_receber%rowtype;
  v_pago numeric;
  v_saldo numeric;
  v_pagamento_id uuid;
  v_forma text;
  v_profile_id uuid;
  v_nome_barbearia text;
  v_nova_situacao text;
begin
  if auth.uid() is null then
    raise exception 'Usuário não autenticado.';
  end if;

  if not public.eh_dono_da_barbearia(p_barbearia_id) then
    raise exception 'Você não possui acesso a esta barbearia.';
  end if;

  select *
  into v_conta
  from public.contas_receber cr
  where cr.id = p_conta_id
    and cr.barbearia_id = p_barbearia_id
  for update;

  if not found then
    raise exception 'Conta não encontrada.';
  end if;

  if v_conta.cancelada then
    raise exception 'Esta conta está cancelada.';
  end if;

  select coalesce(sum(p.valor), 0)
  into v_pago
  from public.pagamentos_contas_receber p
  where p.conta_id = v_conta.id;

  v_saldo := v_conta.valor_original - v_pago;

  if v_saldo <= 0 then
    raise exception 'Esta conta já está paga.';
  end if;

  if p_valor is null or p_valor <= 0 then
    raise exception 'Informe um valor de pagamento maior que zero.';
  end if;

  if p_valor > v_saldo then
    raise exception 'O pagamento não pode ser maior que o saldo da conta.';
  end if;

  v_forma := lower(trim(coalesce(p_forma_pagamento, '')));
  if v_forma not in ('dinheiro', 'pix', 'debito', 'credito', 'outro') then
    raise exception 'Forma de pagamento inválida.';
  end if;

  insert into public.pagamentos_contas_receber (
    conta_id,
    barbearia_id,
    cliente_id,
    valor,
    forma_pagamento,
    pago_em,
    observacao,
    recebido_por
  )
  values (
    v_conta.id,
    p_barbearia_id,
    v_conta.cliente_id,
    p_valor,
    v_forma,
    coalesce(p_pago_em, now()),
    nullif(trim(coalesce(p_observacao, '')), ''),
    auth.uid()
  )
  returning id into v_pagamento_id;

  v_saldo := v_saldo - p_valor;
  v_nova_situacao := case when v_saldo <= 0 then 'pago' else 'parcial' end;

  if v_conta.origem_tipo = 'agendamento' and v_conta.referencia_id is not null then
    update public.agendamentos
    set situacao_pagamento = v_nova_situacao
    where id = v_conta.referencia_id
      and barbearia_id = p_barbearia_id;
  elsif v_conta.origem_tipo = 'pedido' and v_conta.referencia_id is not null then
    update public.pedidos
    set situacao_pagamento = v_nova_situacao
    where id = v_conta.referencia_id
      and barbearia_id = p_barbearia_id;
  end if;

  select c.profile_id
  into v_profile_id
  from public.clientes c
  where c.id = v_conta.cliente_id;

  select b.nome
  into v_nome_barbearia
  from public.barbearias b
  where b.id = p_barbearia_id;

  if v_profile_id is not null then
    insert into public.notificacoes (
      usuario_id,
      barbearia_id,
      tipo,
      titulo,
      mensagem,
      referencia_id,
      rota,
      dados
    )
    values (
      v_profile_id,
      p_barbearia_id,
      'pagamento_recebido',
      'Pagamento registrado',
      coalesce(v_nome_barbearia, 'Barbearia') ||
        ' registrou um pagamento de R$ ' ||
        replace(to_char(p_valor, 'FM999999990D00'), '.', ',') ||
        '. Saldo restante: R$ ' ||
        replace(to_char(greatest(v_saldo, 0), 'FM999999990D00'), '.', ',') || '.',
      v_conta.id,
      '/cliente',
      jsonb_build_object(
        'conta_id', v_conta.id,
        'pagamento_id', v_pagamento_id,
        'valor', p_valor,
        'saldo', greatest(v_saldo, 0)
      )
    );
  end if;

  return v_pagamento_id;
end;
$$;

revoke all on function public.registrar_pagamento_conta_receber_painel(uuid, uuid, numeric, text, timestamptz, text) from public;
grant execute on function public.registrar_pagamento_conta_receber_painel(uuid, uuid, numeric, text, timestamptz, text) to authenticated;

create or replace function public.cancelar_conta_receber_painel(
  p_barbearia_id uuid,
  p_conta_id uuid
)
returns void
language plpgsql
security definer
set search_path = public, auth
as $$
declare
  v_conta public.contas_receber%rowtype;
  v_total_pago numeric;
begin
  if auth.uid() is null then
    raise exception 'Usuário não autenticado.';
  end if;

  if not public.eh_dono_da_barbearia(p_barbearia_id) then
    raise exception 'Você não possui acesso a esta barbearia.';
  end if;

  select *
  into v_conta
  from public.contas_receber cr
  where cr.id = p_conta_id
    and cr.barbearia_id = p_barbearia_id
  for update;

  if not found then
    raise exception 'Conta não encontrada.';
  end if;

  select coalesce(sum(p.valor), 0)
  into v_total_pago
  from public.pagamentos_contas_receber p
  where p.conta_id = v_conta.id;

  if v_total_pago > 0 then
    raise exception 'Uma conta com pagamentos não pode ser cancelada. Preserve o histórico financeiro.';
  end if;

  if v_conta.cancelada then
    raise exception 'Esta conta já está cancelada.';
  end if;

  update public.contas_receber
  set cancelada = true,
      cancelada_at = now()
  where id = v_conta.id;

  if v_conta.origem_tipo = 'agendamento' and v_conta.referencia_id is not null then
    update public.agendamentos
    set recebimento_via_conta = false,
        situacao_pagamento = 'pago'
    where id = v_conta.referencia_id
      and barbearia_id = p_barbearia_id;
  elsif v_conta.origem_tipo = 'pedido' and v_conta.referencia_id is not null then
    update public.pedidos
    set recebimento_via_conta = false,
        situacao_pagamento = 'pago'
    where id = v_conta.referencia_id
      and barbearia_id = p_barbearia_id;
  end if;
end;
$$;

revoke all on function public.cancelar_conta_receber_painel(uuid, uuid) from public;
grant execute on function public.cancelar_conta_receber_painel(uuid, uuid) to authenticated;

create or replace function public.arquivar_conta_receber_painel(
  p_barbearia_id uuid,
  p_conta_id uuid
)
returns void
language plpgsql
security definer
set search_path = public, auth
as $$
declare
  v_original numeric;
  v_pago numeric;
  v_cancelada boolean;
begin
  if auth.uid() is null then
    raise exception 'Usuário não autenticado.';
  end if;

  if not public.eh_dono_da_barbearia(p_barbearia_id) then
    raise exception 'Você não possui acesso a esta barbearia.';
  end if;

  select cr.valor_original, cr.cancelada, coalesce(sum(p.valor), 0)
  into v_original, v_cancelada, v_pago
  from public.contas_receber cr
  left join public.pagamentos_contas_receber p on p.conta_id = cr.id
  where cr.id = p_conta_id
    and cr.barbearia_id = p_barbearia_id
  group by cr.valor_original, cr.cancelada;

  if not found then
    raise exception 'Conta não encontrada.';
  end if;

  if not v_cancelada and v_pago < v_original then
    raise exception 'Somente contas pagas ou canceladas podem ser arquivadas.';
  end if;

  update public.contas_receber
  set arquivada = true,
      arquivada_at = now()
  where id = p_conta_id
    and barbearia_id = p_barbearia_id;
end;
$$;

revoke all on function public.arquivar_conta_receber_painel(uuid, uuid) from public;
grant execute on function public.arquivar_conta_receber_painel(uuid, uuid) to authenticated;

create or replace function public.listar_contas_cliente()
returns table (
  conta_id uuid,
  barbearia_id uuid,
  barbearia_nome text,
  barbearia_logo_url text,
  descricao text,
  valor_original numeric,
  valor_pago numeric,
  saldo numeric,
  vencimento date,
  status text,
  created_at timestamptz
)
language plpgsql
security definer
set search_path = public, auth
as $$
begin
  if auth.uid() is null then
    raise exception 'Usuário não autenticado.';
  end if;

  return query
  with cliente_atual as (
    select c.id
    from public.clientes c
    where c.profile_id = auth.uid()
    limit 1
  ),
  pagos as (
    select p.conta_id, coalesce(sum(p.valor), 0)::numeric total_pago
    from public.pagamentos_contas_receber p
    join cliente_atual ca on ca.id = p.cliente_id
    group by p.conta_id
  )
  select
    cr.id,
    b.id,
    b.nome,
    b.logo_url,
    cr.descricao,
    cr.valor_original,
    coalesce(pg.total_pago, 0)::numeric,
    greatest(cr.valor_original - coalesce(pg.total_pago, 0), 0)::numeric,
    cr.vencimento,
    case
      when cr.cancelada then 'cancelado'
      when cr.valor_original - coalesce(pg.total_pago, 0) <= 0 then 'pago'
      when cr.vencimento < current_date then 'vencido'
      when coalesce(pg.total_pago, 0) > 0 then 'parcial'
      else 'pendente'
    end::text,
    cr.created_at
  from public.contas_receber cr
  join cliente_atual ca on ca.id = cr.cliente_id
  join public.barbearias b on b.id = cr.barbearia_id
  left join pagos pg on pg.conta_id = cr.id
  where cr.arquivada = false
  order by cr.vencimento asc, cr.created_at desc;
end;
$$;

revoke all on function public.listar_contas_cliente() from public;
grant execute on function public.listar_contas_cliente() to authenticated;

-- Financeiro: entradas passam a representar dinheiro efetivamente recebido.
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

  if not public.eh_dono_da_barbearia(p_barbearia_id) then
    raise exception 'Você não possui acesso a esta barbearia.';
  end if;

  if p_data_inicial is null or p_data_final is null or p_data_final < p_data_inicial then
    raise exception 'Período inválido.';
  end if;

  select coalesce(b.timezone, 'America/Recife')
  into v_timezone
  from public.barbearias b
  where b.id = p_barbearia_id;

  return query
  with servicos_periodo as (
    select a.id, s.preco, p.comissao_percentual, a.recebimento_via_conta
    from public.agendamentos a
    join public.servicos s on s.id = a.servico_id
    left join public.profissionais p on p.id = a.profissional_id
    where a.barbearia_id = p_barbearia_id
      and a.status = 'concluido'
      and (a.data_hora at time zone v_timezone)::date between p_data_inicial and p_data_final
  ),
  pedidos_periodo as (
    select pe.id, (pe.quantidade * pe.preco_unitario)::numeric total, pe.recebimento_via_conta
    from public.pedidos pe
    where pe.barbearia_id = p_barbearia_id
      and pe.status = 'concluido'
      and (coalesce(pe.concluido_at, pe.atualizado_at) at time zone v_timezone)::date
          between p_data_inicial and p_data_final
  ),
  recebimentos_periodo as (
    select
      p.valor,
      cr.origem_tipo
    from public.pagamentos_contas_receber p
    join public.contas_receber cr on cr.id = p.conta_id
    where p.barbearia_id = p_barbearia_id
      and (p.pago_em at time zone v_timezone)::date between p_data_inicial and p_data_final
  ),
  gastos_periodo as (
    select g.valor
    from public.gastos g
    where g.barbearia_id = p_barbearia_id
      and g.arquivado = false
      and g.data_gasto between p_data_inicial and p_data_final
  ),
  resumo as (
    select
      (select count(*) from servicos_periodo)::bigint total_servicos,
      coalesce((select sum(sp.preco) from servicos_periodo sp where sp.recebimento_via_conta = false), 0)::numeric
        + coalesce((select sum(rp.valor) from recebimentos_periodo rp where rp.origem_tipo = 'agendamento'), 0)::numeric
        as bruto_servicos,
      (select count(*) from pedidos_periodo)::bigint total_produtos,
      coalesce((select sum(pp.total) from pedidos_periodo pp where pp.recebimento_via_conta = false), 0)::numeric
        + coalesce((select sum(rp.valor) from recebimentos_periodo rp where rp.origem_tipo = 'pedido'), 0)::numeric
        as bruto_produtos,
      coalesce((select sum(rp.valor) from recebimentos_periodo rp where rp.origem_tipo in ('manual','outro')), 0)::numeric
        as recebimentos_outros,
      coalesce((select sum(gp.valor) from gastos_periodo gp), 0)::numeric as total_gastos,
      coalesce((
        select sum(sp.preco * coalesce(sp.comissao_percentual, 0) / 100)
        from servicos_periodo sp
      ), 0)::numeric as total_comissoes
  )
  select
    r.total_servicos,
    r.bruto_servicos,
    r.total_produtos,
    r.bruto_produtos,
    (r.bruto_servicos + r.bruto_produtos + r.recebimentos_outros)::numeric,
    r.total_gastos,
    r.total_comissoes,
    (r.bruto_servicos + r.bruto_produtos + r.recebimentos_outros - r.total_gastos - r.total_comissoes)::numeric
  from resumo r;
end;
$$;

revoke all on function public.obter_financeiro_painel(uuid, date, date) from public;
grant execute on function public.obter_financeiro_painel(uuid, date, date) to authenticated;

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

  if not public.eh_dono_da_barbearia(p_barbearia_id) then
    raise exception 'Você não possui acesso a esta barbearia.';
  end if;

  if p_data_inicial is null or p_data_final is null or p_data_final < p_data_inicial then
    raise exception 'Período inválido.';
  end if;

  select coalesce(b.timezone, 'America/Recife')
  into v_timezone
  from public.barbearias b
  where b.id = p_barbearia_id;

  return query
  select
    'servico'::text,
    (a.data_hora at time zone v_timezone)::date,
    a.data_hora,
    coalesce(nullif(trim(cb.nome_local), ''), nullif(trim(a.cliente_nome), ''), c.nome, 'Cliente')::text,
    s.nome::text,
    coalesce(p.nome, 'Não informado')::text,
    1::integer,
    s.preco::numeric,
    case when a.recebimento_via_conta then 0 else s.preco end::numeric,
    0::numeric,
    (s.preco * coalesce(p.comissao_percentual, 0) / 100)::numeric,
    null::text,
    case when a.recebimento_via_conta then a.situacao_pagamento else null end::text,
    case when a.recebimento_via_conta then 'Valor lançado em Contas a Receber.' else null end::text
  from public.agendamentos a
  join public.servicos s on s.id = a.servico_id
  join public.clientes c on c.id = a.cliente_id
  left join public.clientes_barbearias cb
    on cb.cliente_id = a.cliente_id and cb.barbearia_id = a.barbearia_id
  left join public.profissionais p on p.id = a.profissional_id
  where a.barbearia_id = p_barbearia_id
    and a.status = 'concluido'
    and (a.data_hora at time zone v_timezone)::date between p_data_inicial and p_data_final

  union all

  select
    'produto'::text,
    (coalesce(pe.concluido_at, pe.atualizado_at, pe.created_at) at time zone v_timezone)::date,
    coalesce(pe.concluido_at, pe.atualizado_at, pe.created_at),
    coalesce(nullif(trim(cb.nome_local), ''), c.nome, 'Cliente')::text,
    pr.nome::text,
    null::text,
    pe.quantidade::integer,
    pe.preco_unitario::numeric,
    case when pe.recebimento_via_conta then 0 else (pe.quantidade * pe.preco_unitario) end::numeric,
    0::numeric,
    0::numeric,
    null::text,
    case when pe.recebimento_via_conta then pe.situacao_pagamento else pe.forma_pagamento end::text,
    case when pe.recebimento_via_conta then 'Valor lançado em Contas a Receber.' else pe.observacoes end::text
  from public.pedidos pe
  join public.produtos pr on pr.id = pe.produto_id
  join public.clientes c on c.id = pe.cliente_id
  left join public.clientes_barbearias cb
    on cb.cliente_id = pe.cliente_id and cb.barbearia_id = pe.barbearia_id
  where pe.barbearia_id = p_barbearia_id
    and pe.status = 'concluido'
    and (coalesce(pe.concluido_at, pe.atualizado_at, pe.created_at) at time zone v_timezone)::date
        between p_data_inicial and p_data_final

  union all

  select
    'recebimento'::text,
    (pc.pago_em at time zone v_timezone)::date,
    pc.pago_em,
    coalesce(nullif(trim(cb.nome_local), ''), c.nome, 'Cliente')::text,
    ('Recebimento: ' || cr.descricao)::text,
    null::text,
    1::integer,
    pc.valor::numeric,
    pc.valor::numeric,
    0::numeric,
    0::numeric,
    'contas_a_receber'::text,
    pc.forma_pagamento::text,
    pc.observacao::text
  from public.pagamentos_contas_receber pc
  join public.contas_receber cr on cr.id = pc.conta_id
  join public.clientes c on c.id = pc.cliente_id
  left join public.clientes_barbearias cb
    on cb.cliente_id = pc.cliente_id and cb.barbearia_id = pc.barbearia_id
  where pc.barbearia_id = p_barbearia_id
    and (pc.pago_em at time zone v_timezone)::date between p_data_inicial and p_data_final

  union all

  select
    'gasto'::text,
    g.data_gasto,
    null::timestamptz,
    null::text,
    g.descricao::text,
    null::text,
    null::integer,
    null::numeric,
    0::numeric,
    g.valor::numeric,
    0::numeric,
    g.categoria::text,
    g.pagamento::text,
    g.observacao::text
  from public.gastos g
  where g.barbearia_id = p_barbearia_id
    and g.arquivado = false
    and g.data_gasto between p_data_inicial and p_data_final

  order by data_movimento desc, data_hora desc nulls last, tipo asc;
end;
$$;

revoke all on function public.listar_movimentacoes_financeiras_painel(uuid, date, date) from public;
grant execute on function public.listar_movimentacoes_financeiras_painel(uuid, date, date) to authenticated;

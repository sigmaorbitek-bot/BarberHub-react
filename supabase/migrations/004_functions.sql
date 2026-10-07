-- BarberHub
-- Migration 004: funções/RPCs críticas
-- Executar após 001_base_schema.sql, 002_indexes.sql e 003_rls.sql.

-- =========================================================
-- 1. FECHAR INSERT DIRETO EM AGENDAMENTOS
-- =========================================================
--
-- A partir desta migration, novos agendamentos devem passar
-- obrigatoriamente por criar_agendamento_seguro().

drop policy if exists "agendamentos_insert_cliente"
  on public.agendamentos;

drop policy if exists "agendamentos_insert_dono"
  on public.agendamentos;


-- =========================================================
-- 2. BUSCAR HORÁRIOS DISPONÍVEIS
-- =========================================================
--
-- Retorna horários em intervalos de 30 minutos.
--
-- Respeita:
-- - horário geral da barbearia;
-- - horário específico do profissional;
-- - dia fechado do profissional;
-- - intervalo;
-- - duração informada;
-- - agendamentos pendentes/confirmados;
-- - horários que já passaram.
--
-- dia_semana:
-- 0 = domingo
-- 1 = segunda
-- ...
-- 6 = sábado

create or replace function public.buscar_horarios_disponiveis(
  p_barbearia_id uuid,
  p_profissional_id uuid,
  p_data date,
  p_duracao integer
)
returns table (
  hora text
)
language plpgsql
stable
security definer
set search_path = public, auth
as $$
declare
  v_dia_semana integer;

  v_aberto boolean;
  v_inicio time;
  v_fim time;

  v_intervalo_inicio time;
  v_intervalo_fim time;

  v_tem_horario_profissional boolean := false;

  v_duracao integer :=
    greatest(
      coalesce(p_duracao, 30),
      1
    );
begin
  if auth.uid() is null then
    raise exception 'Usuário não autenticado.';
  end if;

  if p_barbearia_id is null
     or p_data is null then
    return;
  end if;

  if not exists (
    select 1
    from public.barbearias b
    where b.id = p_barbearia_id
  ) then
    return;
  end if;

  if p_profissional_id is not null then
    if not exists (
      select 1
      from public.profissionais p
      where p.id = p_profissional_id
        and p.barbearia_id = p_barbearia_id
        and p.ativo = true
    ) then
      return;
    end if;
  end if;

  v_dia_semana :=
    extract(dow from p_data)::integer;


  -- =======================================================
  -- HORÁRIO ESPECÍFICO DO PROFISSIONAL
  -- =======================================================

  if p_profissional_id is not null then
    select
      true,
      hp.aberto,
      hp.hora_inicio,
      hp.hora_fim,
      hp.intervalo_inicio,
      hp.intervalo_fim
    into
      v_tem_horario_profissional,
      v_aberto,
      v_inicio,
      v_fim,
      v_intervalo_inicio,
      v_intervalo_fim
    from public.horarios_profissionais hp
    where hp.profissional_id = p_profissional_id
      and hp.dia_semana = v_dia_semana
    limit 1;
  end if;


  -- Se existe configuração específica dizendo
  -- que o profissional está fechado, não fazemos fallback
  -- para o horário geral da barbearia.

  if v_tem_horario_profissional
     and coalesce(v_aberto, false) = false then
    return;
  end if;


  -- =======================================================
  -- HORÁRIO GERAL DA BARBEARIA
  -- =======================================================

  if not v_tem_horario_profissional then
    select
      hf.aberto,
      hf.hora_abertura,
      hf.hora_fechamento,
      hf.intervalo_inicio,
      hf.intervalo_fim
    into
      v_aberto,
      v_inicio,
      v_fim,
      v_intervalo_inicio,
      v_intervalo_fim
    from public.horarios_funcionamento hf
    where hf.barbearia_id = p_barbearia_id
      and hf.dia_semana = v_dia_semana
    limit 1;


    -- Se existe configuração diária da barbearia
    -- explicitamente fechada, respeitamos essa configuração.

    if found
       and coalesce(v_aberto, false) = false then
      return;
    end if;
  end if;


  -- =======================================================
  -- FALLBACK DOS CAMPOS GERAIS
  -- =======================================================
  --
  -- Só usamos horario_abertura/horario_fechamento antigos
  -- quando NÃO existe configuração específica suficiente.

  if not v_tem_horario_profissional
     and (
       v_inicio is null
       or v_fim is null
     ) then

    select
      true,
      b.horario_abertura,
      b.horario_fechamento
    into
      v_aberto,
      v_inicio,
      v_fim
    from public.barbearias b
    where b.id = p_barbearia_id;
  end if;


  if coalesce(v_aberto, false) = false
     or v_inicio is null
     or v_fim is null then
    return;
  end if;


  -- =======================================================
  -- GERAR HORÁRIOS
  -- =======================================================

  return query

  with slots as (
    select
      gs as inicio_local,

      gs
      + make_interval(
          mins => v_duracao
        ) as fim_local

    from generate_series(
      p_data + v_inicio,

      (p_data + v_fim)
      - make_interval(
          mins => v_duracao
        ),

      interval '30 minutes'
    ) as gs
  ),

  validos as (
    select
      s.inicio_local,
      s.fim_local,

      s.inicio_local
        at time zone 'America/Recife'
          as inicio_utc,

      s.fim_local
        at time zone 'America/Recife'
          as fim_utc

    from slots s

    where

      (
        v_intervalo_inicio is null
        or v_intervalo_fim is null

        or not (
          s.inicio_local
            < (p_data + v_intervalo_fim)

          and s.fim_local
            > (p_data + v_intervalo_inicio)
        )
      )

      and (

        p_data >
          (
            now()
            at time zone 'America/Recife'
          )::date

        or s.inicio_local >
          (
            now()
            at time zone 'America/Recife'
          )
      )
  )

  select
    to_char(
      v.inicio_local,
      'HH24:MI'
    )

  from validos v

  where not exists (
    select 1
    from public.agendamentos a

    join public.servicos s_existente
      on s_existente.id = a.servico_id

    where a.barbearia_id = p_barbearia_id

      and a.status in (
        'pendente',
        'confirmado'
      )

      and a.arquivado = false

      and a.profissional_id
        is not distinct from
        p_profissional_id

      and a.data_hora
        < v.fim_utc

      and (
        a.data_hora
        + make_interval(
            mins =>
              greatest(
                s_existente.duracao,
                1
              )
          )
      ) > v.inicio_utc
  )

  order by
    v.inicio_local;
end;
$$;


revoke all
on function public.buscar_horarios_disponiveis(
  uuid,
  uuid,
  date,
  integer
)
from public;


grant execute
on function public.buscar_horarios_disponiveis(
  uuid,
  uuid,
  date,
  integer
)
to authenticated;


-- =========================================================
-- 3. CRIAR AGENDAMENTO COM SEGURANÇA
-- =========================================================
--
-- Esta função:
--
-- - identifica automaticamente o cliente autenticado;
-- - permite agendamento manual pelo dono;
-- - valida cliente;
-- - valida serviço;
-- - valida profissional;
-- - valida horário;
-- - valida intervalo;
-- - exige grade de 30 minutos;
-- - impede agendamento no passado;
-- - usa advisory lock;
-- - impede dupla reserva;
-- - cria vínculo cliente x barbearia;
-- - cria o agendamento.
--
-- p_cliente_id:
--
-- cliente:
-- pode omitir.
--
-- dono:
-- deve informar o cliente do agendamento manual.

create or replace function public.criar_agendamento_seguro(
  p_barbearia_id uuid,
  p_servico_id uuid,
  p_data_hora timestamptz,
  p_profissional_id uuid default null,
  p_cliente_id uuid default null
)
returns public.agendamentos
language plpgsql
security definer
set search_path = public, auth
as $$
declare
  v_cliente_id uuid;

  v_cliente public.clientes%rowtype;
  v_servico public.servicos%rowtype;
  v_profissional public.profissionais%rowtype;
  v_agendamento public.agendamentos%rowtype;

  v_eh_dono boolean;

  v_data_local date;
  v_inicio_local timestamp;
  v_fim_local timestamp;

  v_dia_semana integer;

  v_aberto boolean;
  v_abertura time;
  v_fechamento time;

  v_intervalo_inicio time;
  v_intervalo_fim time;

  v_tem_horario_profissional boolean := false;
  v_tem_horario_barbearia boolean := false;
begin

  -- =======================================================
  -- AUTENTICAÇÃO
  -- =======================================================

  if auth.uid() is null then
    raise exception 'Usuário não autenticado.';
  end if;


  -- =======================================================
  -- DADOS OBRIGATÓRIOS
  -- =======================================================

  if p_barbearia_id is null
     or p_servico_id is null
     or p_data_hora is null then
    raise exception
      'Dados obrigatórios do agendamento não informados.';
  end if;


  if p_data_hora <= now() then
    raise exception
      'Não é possível agendar um horário que já passou.';
  end if;


  -- =======================================================
  -- HORÁRIO LOCAL
  -- =======================================================

  v_inicio_local :=
    p_data_hora
      at time zone 'America/Recife';

  v_data_local :=
    v_inicio_local::date;


  -- A agenda oficial trabalha em blocos de 30 minutos.

  if extract(minute from v_inicio_local)::integer
       not in (0, 30)
     or extract(second from v_inicio_local) <> 0 then

    raise exception
      'O horário deve respeitar intervalos de 30 minutos.';
  end if;


  -- =======================================================
  -- IDENTIFICAR CLIENTE
  -- =======================================================

  v_eh_dono :=
    public.eh_dono_da_barbearia(
      p_barbearia_id
    );


  if v_eh_dono then

    if p_cliente_id is null then
      raise exception
        'Informe o cliente do agendamento manual.';
    end if;

    v_cliente_id :=
      p_cliente_id;

  else

    v_cliente_id :=
      public.cliente_atual_id();

    if v_cliente_id is null then
      raise exception
        'A conta autenticada não possui cadastro de cliente.';
    end if;

    if p_cliente_id is not null
       and p_cliente_id <> v_cliente_id then
      raise exception
        'Cliente informado não corresponde ao usuário autenticado.';
    end if;

  end if;


  select *
  into v_cliente
  from public.clientes c
  where c.id = v_cliente_id;


  if not found then
    raise exception
      'Cliente não encontrado.';
  end if;


  -- =======================================================
  -- SERVIÇO
  -- =======================================================

  select *
  into v_servico
  from public.servicos s
  where s.id = p_servico_id
    and s.barbearia_id = p_barbearia_id;


  if not found then
    raise exception
      'Serviço não pertence à barbearia informada.';
  end if;


  -- =======================================================
  -- PROFISSIONAL
  -- =======================================================

  if p_profissional_id is not null then

    select *
    into v_profissional
    from public.profissionais p
    where p.id = p_profissional_id
      and p.barbearia_id = p_barbearia_id
      and p.ativo = true;


    if not found then
      raise exception
        'Profissional não pertence à barbearia ou está inativo.';
    end if;

  end if;


  -- =======================================================
  -- LOCK DE CONCORRÊNCIA
  -- =======================================================
  --
  -- Serializa tentativas para o mesmo recurso no mesmo dia.

  perform pg_advisory_xact_lock(
    hashtextextended(
      p_barbearia_id::text
      || ':'
      || coalesce(
          p_profissional_id::text,
          'sem-profissional'
        )
      || ':'
      || v_data_local::text,
      0
    )
  );


  v_fim_local :=
    v_inicio_local
    + make_interval(
        mins => v_servico.duracao
      );


  v_dia_semana :=
    extract(
      dow from v_data_local
    )::integer;


  -- =======================================================
  -- HORÁRIO DO PROFISSIONAL
  -- =======================================================

  if p_profissional_id is not null then

    select
      true,
      hp.aberto,
      hp.hora_inicio,
      hp.hora_fim,
      hp.intervalo_inicio,
      hp.intervalo_fim

    into
      v_tem_horario_profissional,
      v_aberto,
      v_abertura,
      v_fechamento,
      v_intervalo_inicio,
      v_intervalo_fim

    from public.horarios_profissionais hp

    where hp.profissional_id =
            p_profissional_id

      and hp.dia_semana =
            v_dia_semana

    limit 1;

  end if;


  -- Se existe configuração dizendo que o profissional
  -- está fechado, não usamos o horário da barbearia.

  if v_tem_horario_profissional
     and coalesce(v_aberto, false) = false then

    raise exception
      'O profissional não atende neste dia.';
  end if;


  -- =======================================================
  -- HORÁRIO DA BARBEARIA
  -- =======================================================

  if not v_tem_horario_profissional then

    select
      true,
      hf.aberto,
      hf.hora_abertura,
      hf.hora_fechamento,
      hf.intervalo_inicio,
      hf.intervalo_fim

    into
      v_tem_horario_barbearia,
      v_aberto,
      v_abertura,
      v_fechamento,
      v_intervalo_inicio,
      v_intervalo_fim

    from public.horarios_funcionamento hf

    where hf.barbearia_id =
            p_barbearia_id

      and hf.dia_semana =
            v_dia_semana

    limit 1;


    if v_tem_horario_barbearia
       and coalesce(v_aberto, false) = false then

      raise exception
        'A barbearia não atende neste dia.';
    end if;

  end if;


  -- =======================================================
  -- FALLBACK DOS CAMPOS GERAIS
  -- =======================================================

  if not v_tem_horario_profissional
     and not v_tem_horario_barbearia then

    select
      true,
      b.horario_abertura,
      b.horario_fechamento

    into
      v_aberto,
      v_abertura,
      v_fechamento

    from public.barbearias b

    where b.id =
      p_barbearia_id;

  end if;


  if coalesce(v_aberto, false) = false
     or v_abertura is null
     or v_fechamento is null then

    raise exception
      'A barbearia/profissional não atende neste dia.';
  end if;


  -- =======================================================
  -- VALIDAR EXPEDIENTE
  -- =======================================================

  if v_inicio_local
       < (v_data_local + v_abertura)

     or v_fim_local
       > (v_data_local + v_fechamento) then

    raise exception
      'Horário fora do expediente.';
  end if;


  -- =======================================================
  -- VALIDAR INTERVALO
  -- =======================================================

  if v_intervalo_inicio is not null
     and v_intervalo_fim is not null

     and v_inicio_local
       < (v_data_local + v_intervalo_fim)

     and v_fim_local
       > (v_data_local + v_intervalo_inicio) then

    raise exception
      'Horário coincide com o intervalo de atendimento.';
  end if;


  -- =======================================================
  -- VERIFICAÇÃO DEFINITIVA DE CONCORRÊNCIA
  -- =======================================================

  if exists (
    select 1

    from public.agendamentos a

    join public.servicos s_existente
      on s_existente.id =
         a.servico_id

    where a.barbearia_id =
            p_barbearia_id

      and a.status in (
        'pendente',
        'confirmado'
      )

      and a.arquivado = false

      and a.profissional_id
        is not distinct from
        p_profissional_id

      and a.data_hora
        <
        p_data_hora
        + make_interval(
            mins => v_servico.duracao
          )

      and (
        a.data_hora
        + make_interval(
            mins =>
              greatest(
                s_existente.duracao,
                1
              )
          )
      ) > p_data_hora

  ) then

    raise exception
      'Esse horário não está mais disponível.';

  end if;


  -- =======================================================
  -- VINCULAR CLIENTE À BARBEARIA
  -- =======================================================

  insert into public.clientes_barbearias (
    cliente_id,
    barbearia_id
  )
  values (
    v_cliente_id,
    p_barbearia_id
  )
  on conflict (
    cliente_id,
    barbearia_id
  )
  do nothing;


  -- =======================================================
  -- CRIAR AGENDAMENTO
  -- =======================================================

  insert into public.agendamentos (
    barbearia_id,
    cliente_id,
    servico_id,
    profissional_id,
    data_hora,
    status,
    cliente_nome,
    cliente_telefone,
    arquivado
  )
  values (
    p_barbearia_id,
    v_cliente_id,
    p_servico_id,
    p_profissional_id,
    p_data_hora,
    'pendente',
    v_cliente.nome,
    v_cliente.telefone,
    false
  )
  returning *
  into v_agendamento;


  return v_agendamento;
end;
$$;


revoke all
on function public.criar_agendamento_seguro(
  uuid,
  uuid,
  timestamptz,
  uuid,
  uuid
)
from public;


grant execute
on function public.criar_agendamento_seguro(
  uuid,
  uuid,
  timestamptz,
  uuid,
  uuid
)
to authenticated;


-- =========================================================
-- 4. CANCELAR AGENDAMENTO PELO CLIENTE
-- =========================================================

create or replace function public.cancelar_agendamento_cliente(
  p_agendamento_id uuid
)
returns public.agendamentos
language plpgsql
security definer
set search_path = public, auth
as $$
declare
  v_cliente_id uuid;
  v_agendamento public.agendamentos%rowtype;
begin

  if auth.uid() is null then
    raise exception
      'Usuário não autenticado.';
  end if;


  v_cliente_id :=
    public.cliente_atual_id();


  if v_cliente_id is null then
    raise exception
      'A conta autenticada não possui cadastro de cliente.';
  end if;


  select *
  into v_agendamento

  from public.agendamentos a

  where a.id =
          p_agendamento_id

    and a.cliente_id =
          v_cliente_id

  for update;


  if not found then
    raise exception
      'Agendamento não encontrado.';
  end if;


  if v_agendamento.status
       not in (
         'pendente',
         'confirmado'
       ) then

    raise exception
      'Este agendamento não pode mais ser cancelado.';
  end if;


  if v_agendamento.data_hora <= now() then
    raise exception
      'Não é possível cancelar um agendamento que já começou ou passou.';
  end if;


  update public.agendamentos

  set status =
    'cancelado'

  where id =
    p_agendamento_id

  returning *
  into v_agendamento;


  return v_agendamento;
end;
$$;


revoke all
on function public.cancelar_agendamento_cliente(uuid)
from public;


grant execute
on function public.cancelar_agendamento_cliente(uuid)
to authenticated;


-- =========================================================
-- 5. CRIAR PEDIDO COM RESERVA DE ESTOQUE
-- =========================================================
--
-- O produto recebe FOR UPDATE para impedir que duas compras
-- simultâneas consumam a mesma última unidade.
--
-- O estoque é reservado no momento em que o pedido é criado.
-- A migration seguinte tratará devolução do estoque em caso
-- de cancelamento.

create or replace function public.criar_pedido(
  p_produto_id uuid,
  p_quantidade integer default 1
)
returns table (
  id uuid,
  produto_id uuid,
  cliente_id uuid,
  barbearia_id uuid,
  quantidade integer,
  preco_unitario numeric,
  total numeric,
  status text,
  origem_pedido text,
  created_at timestamptz
)
language plpgsql
security definer
set search_path = public, auth
as $$
declare
  v_cliente_id uuid;

  v_produto public.produtos%rowtype;
  v_pedido public.pedidos%rowtype;
begin

  if auth.uid() is null then
    raise exception
      'Usuário não autenticado.';
  end if;


  if p_quantidade is null
     or p_quantidade <= 0 then

    raise exception
      'Quantidade inválida.';
  end if;


  v_cliente_id :=
    public.cliente_atual_id();


  if v_cliente_id is null then
    raise exception
      'A conta autenticada não é um cliente.';
  end if;


  -- Bloqueia o produto durante a transação.

  select *
  into v_produto

  from public.produtos p

  where p.id =
    p_produto_id

  for update;


  if not found then
    raise exception
      'Produto não encontrado.';
  end if;


  if v_produto.estoque < p_quantidade then
    raise exception
      'Estoque insuficiente.';
  end if;


  -- Reserva o estoque.

  update public.produtos

  set estoque =
    estoque - p_quantidade

  where id =
    v_produto.id;


  -- Garante relacionamento entre cliente e barbearia.

  insert into public.clientes_barbearias (
    cliente_id,
    barbearia_id
  )
  values (
    v_cliente_id,
    v_produto.barbearia_id
  )
  on conflict (
    cliente_id,
    barbearia_id
  )
  do nothing;


  -- Cria o pedido utilizando o preço atual como
  -- preço histórico da venda.

  insert into public.pedidos (
    produto_id,
    cliente_id,
    barbearia_id,
    quantidade,
    preco_unitario,
    status,
    origem_pedido,
    arquivado
  )
  values (
    v_produto.id,
    v_cliente_id,
    v_produto.barbearia_id,
    p_quantidade,
    v_produto.preco,
    'pendente',
    'online',
    false
  )
  returning *
  into v_pedido;


  return query
  select
    v_pedido.id,
    v_pedido.produto_id,
    v_pedido.cliente_id,
    v_pedido.barbearia_id,
    v_pedido.quantidade,
    v_pedido.preco_unitario,

    (
      v_pedido.quantidade
      * v_pedido.preco_unitario
    )::numeric
      as total,

    v_pedido.status,
    v_pedido.origem_pedido,
    v_pedido.created_at;
end;
$$;


revoke all
on function public.criar_pedido(
  uuid,
  integer
)
from public;


grant execute
on function public.criar_pedido(
  uuid,
  integer
)
to authenticated;
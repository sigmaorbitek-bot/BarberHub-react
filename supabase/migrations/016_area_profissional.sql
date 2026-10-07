-- BarberHub
-- Migration 016: área real do profissional
-- Executar após 015_imagem_profissional.sql.
--
-- Responsabilidades:
-- - listar agenda própria;
-- - permitir alteração controlada de status;
-- - alimentar dashboard profissional;
-- - calcular financeiro respeitando timezone da barbearia;
-- - listar agenda da equipe conforme permissão;
-- - listar clientes conforme permissão;
-- - listar produtos conforme permissão;
-- - impedir vazamento de telefone e dados financeiros.

begin;

-- =========================================================
-- 1. AGENDA DO PROFISSIONAL
-- =========================================================

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
    raise exception
      'Usuário não autenticado.';
  end if;


  select
    p.id,
    coalesce(
      pp.ver_agendamentos,
      true
    ),
    coalesce(
      pp.ver_cliente_telefone,
      true
    )
  into
    v_profissional_id,
    v_ver_agendamentos,
    v_ver_cliente_telefone
  from public.profissionais p

  left join public.permissoes_profissionais pp
    on pp.profissional_id =
      p.id

  where p.usuario_id =
    auth.uid()

    and p.ativo =
      true

  limit 1;


  if v_profissional_id is null then
    raise exception
      'Profissional não encontrado.';
  end if;


  if not v_ver_agendamentos then
    raise exception
      'Acesso aos agendamentos não liberado.';
  end if;


  return query

  select
    a.id,
    a.data_hora,
    a.status,

    coalesce(
      nullif(
        trim(
          a.cliente_nome
        ),
        ''
      ),
      c.nome,
      'Cliente'
    ) as cliente_nome,

    case
      when v_ver_cliente_telefone
      then
        coalesce(
          nullif(
            trim(
              a.cliente_telefone
            ),
            ''
          ),
          c.telefone
        )
      else
        null
    end as cliente_telefone,

    s.nome as servico_nome,
    s.preco as servico_preco,
    s.duracao as servico_duracao,
    a.profissional_id

  from public.agendamentos a

  join public.servicos s
    on s.id =
      a.servico_id

  left join public.clientes c
    on c.id =
      a.cliente_id

  where a.profissional_id =
    v_profissional_id

    and a.arquivado =
      false

  order by
    a.data_hora asc;
end;
$$;


revoke all
on function public.listar_agendamentos_profissional()
from public;


grant execute
on function public.listar_agendamentos_profissional()
to authenticated;


-- =========================================================
-- 2. ALTERAR STATUS DO AGENDAMENTO
-- =========================================================

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
    raise exception
      'Usuário não autenticado.';
  end if;


  select
    p.id,
    coalesce(
      pp.alterar_status,
      true
    )
  into
    v_profissional_id,
    v_alterar_status

  from public.profissionais p

  left join public.permissoes_profissionais pp
    on pp.profissional_id =
      p.id

  where p.usuario_id =
    auth.uid()

    and p.ativo =
      true

  limit 1;


  if v_profissional_id is null then
    raise exception
      'Profissional não encontrado.';
  end if;


  if not v_alterar_status then
    raise exception
      'Alteração de status não liberada.';
  end if;


  if p_status not in (
    'confirmado',
    'concluido',
    'cancelado'
  ) then
    raise exception
      'Status inválido.';
  end if;


  select
    a.status

  into
    v_status_atual

  from public.agendamentos a

  where a.id =
    p_agendamento_id

    and a.profissional_id =
      v_profissional_id

    and a.arquivado =
      false

  for update;


  if not found then
    raise exception
      'Agendamento não encontrado.';
  end if;


  if v_status_atual in (
    'cancelado',
    'concluido'
  ) then
    raise exception
      'Este agendamento já está encerrado.';
  end if;


  if v_status_atual =
    'pendente'

    and p_status not in (
      'confirmado',
      'cancelado'
    )
  then

    raise exception
      'Confirme o agendamento antes de concluir.';

  end if;


  if v_status_atual =
    'confirmado'

    and p_status not in (
      'concluido',
      'cancelado'
    )
  then

    raise exception
      'Transição de status inválida.';

  end if;


  update public.agendamentos

  set status =
    p_status

  where id =
    p_agendamento_id

    and profissional_id =
      v_profissional_id;
end;
$$;


revoke all
on function public.atualizar_status_agendamento_profissional(
  uuid,
  text
)
from public;


grant execute
on function public.atualizar_status_agendamento_profissional(
  uuid,
  text
)
to authenticated;


-- =========================================================
-- 3. DASHBOARD DO PROFISSIONAL
-- =========================================================

create or replace function public.obter_dashboard_profissional()
returns table (
  atendimentos_hoje bigint,
  proximos_atendimentos bigint,
  concluidos_mes bigint,
  faturamento_mes numeric
)
language plpgsql
security definer
set search_path = public, auth
as $$
declare
  v_profissional_id uuid;
  v_barbearia_id uuid;
  v_timezone text;

  v_ver_agendamentos boolean;
  v_ver_financeiro boolean;

  v_hoje date;
  v_inicio_mes date;
  v_inicio_proximo_mes date;
begin
  if auth.uid() is null then
    raise exception
      'Usuário não autenticado.';
  end if;


  select
    p.id,
    p.barbearia_id,
    b.timezone,

    coalesce(
      pp.ver_agendamentos,
      true
    ),

    coalesce(
      pp.ver_financeiro,
      false
    )

  into
    v_profissional_id,
    v_barbearia_id,
    v_timezone,
    v_ver_agendamentos,
    v_ver_financeiro

  from public.profissionais p

  join public.barbearias b
    on b.id =
      p.barbearia_id

  left join public.permissoes_profissionais pp
    on pp.profissional_id =
      p.id

  where p.usuario_id =
    auth.uid()

    and p.ativo =
      true

  limit 1;


  if v_profissional_id is null then
    raise exception
      'Profissional não encontrado.';
  end if;


  v_timezone :=
    coalesce(
      nullif(
        trim(
          v_timezone
        ),
        ''
      ),
      'America/Recife'
    );


  v_hoje :=
    (
      now()
      at time zone v_timezone
    )::date;


  v_inicio_mes :=
    date_trunc(
      'month',
      v_hoje::timestamp
    )::date;


  v_inicio_proximo_mes :=
    (
      v_inicio_mes
      + interval '1 month'
    )::date;


  return query

  select

    case
      when v_ver_agendamentos
      then (
        select
          count(*)::bigint

        from public.agendamentos a

        where a.profissional_id =
          v_profissional_id

          and a.arquivado =
            false

          and a.status not in (
            'cancelado'
          )

          and (
            a.data_hora
            at time zone v_timezone
          )::date =
            v_hoje
      )

      else 0::bigint
    end as atendimentos_hoje,


    case
      when v_ver_agendamentos
      then (
        select
          count(*)::bigint

        from public.agendamentos a

        where a.profissional_id =
          v_profissional_id

          and a.arquivado =
            false

          and a.status in (
            'pendente',
            'confirmado'
          )

          and a.data_hora >
            now()
      )

      else 0::bigint
    end as proximos_atendimentos,


    (
      select
        count(*)::bigint

      from public.agendamentos a

      where a.profissional_id =
        v_profissional_id

        and a.arquivado =
          false

        and a.status =
          'concluido'

        and (
          a.data_hora
          at time zone v_timezone
        )::date >=
          v_inicio_mes

        and (
          a.data_hora
          at time zone v_timezone
        )::date <
          v_inicio_proximo_mes
    ) as concluidos_mes,


    case
      when v_ver_financeiro
      then (
        select
          coalesce(
            sum(
              s.preco
            ),
            0
          )::numeric

        from public.agendamentos a

        join public.servicos s
          on s.id =
            a.servico_id

        where a.profissional_id =
          v_profissional_id

          and a.arquivado =
            false

          and a.status =
            'concluido'

          and (
            a.data_hora
            at time zone v_timezone
          )::date >=
            v_inicio_mes

          and (
            a.data_hora
            at time zone v_timezone
          )::date <
            v_inicio_proximo_mes
      )

      else null::numeric
    end as faturamento_mes;
end;
$$;


revoke all
on function public.obter_dashboard_profissional()
from public;


grant execute
on function public.obter_dashboard_profissional()
to authenticated;


-- =========================================================
-- 4. FINANCEIRO DO PROFISSIONAL
-- =========================================================

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
  v_timezone text;

  v_ver_financeiro boolean;
  v_ver_comissao boolean;

  v_comissao numeric;
begin
  if auth.uid() is null then
    raise exception
      'Usuário não autenticado.';
  end if;


  if p_data_inicial is null
     or p_data_final is null
     or p_data_final < p_data_inicial then

    raise exception
      'Período inválido.';

  end if;


  select
    p.id,
    b.timezone,

    coalesce(
      pp.ver_financeiro,
      false
    ),

    coalesce(
      pp.ver_comissao,
      false
    ),

    p.comissao_percentual

  into
    v_profissional_id,
    v_timezone,
    v_ver_financeiro,
    v_ver_comissao,
    v_comissao

  from public.profissionais p

  join public.barbearias b
    on b.id =
      p.barbearia_id

  left join public.permissoes_profissionais pp
    on pp.profissional_id =
      p.id

  where p.usuario_id =
    auth.uid()

    and p.ativo =
      true

  limit 1;


  if v_profissional_id is null then
    raise exception
      'Profissional não encontrado.';
  end if;


  if not v_ver_financeiro then
    raise exception
      'Acesso ao financeiro não liberado.';
  end if;


  v_timezone :=
    coalesce(
      nullif(
        trim(
          v_timezone
        ),
        ''
      ),
      'America/Recife'
    );


  return query

  with resumo as (
    select
      count(*)::bigint as total,

      coalesce(
        sum(
          s.preco
        ),
        0
      )::numeric as bruto

    from public.agendamentos a

    join public.servicos s
      on s.id =
        a.servico_id

    where a.profissional_id =
      v_profissional_id

      and a.status =
        'concluido'

      and a.arquivado =
        false

      and (
        a.data_hora
        at time zone v_timezone
      )::date >=
        p_data_inicial

      and (
        a.data_hora
        at time zone v_timezone
      )::date <=
        p_data_final
  )

  select
    r.total,
    r.bruto,

    case
      when v_ver_comissao
      then v_comissao
      else null
    end as comissao_percentual,

    case
      when v_ver_comissao
      then round(
        (
          r.bruto
          * v_comissao
          / 100
        )::numeric,
        2
      )

      else null
    end as comissao_estimada,

    v_ver_comissao

  from resumo r;
end;
$$;


revoke all
on function public.obter_financeiro_profissional(
  date,
  date
)
from public;


grant execute
on function public.obter_financeiro_profissional(
  date,
  date
)
to authenticated;


-- =========================================================
-- 5. AGENDA DA EQUIPE
-- =========================================================

create or replace function public.listar_agenda_equipe_profissional()
returns table (
  agendamento_id uuid,
  profissional_id uuid,
  profissional_nome text,
  cliente_nome text,
  servico_nome text,
  data_hora timestamptz,
  status text
)
language plpgsql
security definer
set search_path = public, auth
as $$
declare
  v_barbearia_id uuid;
  v_ver_agenda_equipe boolean;
begin
  if auth.uid() is null then
    raise exception
      'Usuário não autenticado.';
  end if;


  select
    p.barbearia_id,

    coalesce(
      pp.ver_agenda_equipe,
      false
    )

  into
    v_barbearia_id,
    v_ver_agenda_equipe

  from public.profissionais p

  left join public.permissoes_profissionais pp
    on pp.profissional_id =
      p.id

  where p.usuario_id =
    auth.uid()

    and p.ativo =
      true

  limit 1;


  if v_barbearia_id is null then
    raise exception
      'Profissional não encontrado.';
  end if;


  if not v_ver_agenda_equipe then
    raise exception
      'Acesso à agenda da equipe não liberado.';
  end if;


  return query

  select
    a.id as agendamento_id,
    p.id as profissional_id,
    p.nome as profissional_nome,

    coalesce(
      nullif(
        trim(
          a.cliente_nome
        ),
        ''
      ),
      c.nome,
      'Cliente'
    ) as cliente_nome,

    s.nome as servico_nome,
    a.data_hora,
    a.status

  from public.agendamentos a

  join public.profissionais p
    on p.id =
      a.profissional_id

  join public.servicos s
    on s.id =
      a.servico_id

  left join public.clientes c
    on c.id =
      a.cliente_id

  where a.barbearia_id =
    v_barbearia_id

    and a.arquivado =
      false

  order by
    a.data_hora asc,
    p.nome asc;
end;
$$;


revoke all
on function public.listar_agenda_equipe_profissional()
from public;


grant execute
on function public.listar_agenda_equipe_profissional()
to authenticated;


-- =========================================================
-- 6. CLIENTES DA BARBEARIA
-- =========================================================

create or replace function public.listar_clientes_profissional()
returns table (
  cliente_id uuid,
  nome text,
  telefone text,
  email text,
  total_agendamentos bigint
)
language plpgsql
security definer
set search_path = public, auth
as $$
declare
  v_barbearia_id uuid;
  v_ver_clientes boolean;
  v_ver_cliente_telefone boolean;
begin
  if auth.uid() is null then
    raise exception
      'Usuário não autenticado.';
  end if;


  select
    p.barbearia_id,

    coalesce(
      pp.ver_clientes,
      false
    ),

    coalesce(
      pp.ver_cliente_telefone,
      true
    )

  into
    v_barbearia_id,
    v_ver_clientes,
    v_ver_cliente_telefone

  from public.profissionais p

  left join public.permissoes_profissionais pp
    on pp.profissional_id =
      p.id

  where p.usuario_id =
    auth.uid()

    and p.ativo =
      true

  limit 1;


  if v_barbearia_id is null then
    raise exception
      'Profissional não encontrado.';
  end if;


  if not v_ver_clientes then
    raise exception
      'Acesso aos clientes não liberado.';
  end if;


  return query

  select
    c.id as cliente_id,
    c.nome,

    case
      when v_ver_cliente_telefone
      then c.telefone
      else null
    end as telefone,

    c.email,

    count(
      a.id
    )::bigint as total_agendamentos

  from public.clientes_barbearias cb

  join public.clientes c
    on c.id =
      cb.cliente_id

  left join public.agendamentos a
    on a.cliente_id =
      c.id

    and a.barbearia_id =
      v_barbearia_id

    and a.arquivado =
      false

  where cb.barbearia_id =
    v_barbearia_id

  group by
    c.id,
    c.nome,
    c.telefone,
    c.email

  order by
    c.nome asc;
end;
$$;


revoke all
on function public.listar_clientes_profissional()
from public;


grant execute
on function public.listar_clientes_profissional()
to authenticated;


-- =========================================================
-- 7. PRODUTOS DA BARBEARIA
-- =========================================================

create or replace function public.listar_produtos_profissional()
returns table (
  id uuid,
  nome text,
  preco numeric,
  estoque integer,
  foto_url text
)
language plpgsql
security definer
set search_path = public, auth
as $$
declare
  v_barbearia_id uuid;
  v_ver_produtos boolean;
begin
  if auth.uid() is null then
    raise exception
      'Usuário não autenticado.';
  end if;


  select
    p.barbearia_id,

    coalesce(
      pp.ver_produtos,
      false
    )

  into
    v_barbearia_id,
    v_ver_produtos

  from public.profissionais p

  left join public.permissoes_profissionais pp
    on pp.profissional_id =
      p.id

  where p.usuario_id =
    auth.uid()

    and p.ativo =
      true

  limit 1;


  if v_barbearia_id is null then
    raise exception
      'Profissional não encontrado.';
  end if;


  if not v_ver_produtos then
    raise exception
      'Acesso aos produtos não liberado.';
  end if;


  return query

  select
    pr.id,
    pr.nome,
    pr.preco,
    pr.estoque,
    pr.foto_url

  from public.produtos pr

  where pr.barbearia_id =
    v_barbearia_id

  order by
    pr.nome asc;
end;
$$;


revoke all
on function public.listar_produtos_profissional()
from public;


grant execute
on function public.listar_produtos_profissional()
to authenticated;


-- =========================================================
-- 8. VALIDAÇÃO DA MIGRATION
-- =========================================================

do $$
begin

  if to_regprocedure(
    'public.listar_agendamentos_profissional()'
  ) is null then

    raise exception
      'Falha na migration 016: listar_agendamentos_profissional não foi criada.';

  end if;


  if to_regprocedure(
    'public.atualizar_status_agendamento_profissional(uuid,text)'
  ) is null then

    raise exception
      'Falha na migration 016: atualizar_status_agendamento_profissional não foi criada.';

  end if;


  if to_regprocedure(
    'public.obter_dashboard_profissional()'
  ) is null then

    raise exception
      'Falha na migration 016: obter_dashboard_profissional não foi criada.';

  end if;


  if to_regprocedure(
    'public.obter_financeiro_profissional(date,date)'
  ) is null then

    raise exception
      'Falha na migration 016: obter_financeiro_profissional não foi criada.';

  end if;


  if to_regprocedure(
    'public.listar_agenda_equipe_profissional()'
  ) is null then

    raise exception
      'Falha na migration 016: listar_agenda_equipe_profissional não foi criada.';

  end if;


  if to_regprocedure(
    'public.listar_clientes_profissional()'
  ) is null then

    raise exception
      'Falha na migration 016: listar_clientes_profissional não foi criada.';

  end if;


  if to_regprocedure(
    'public.listar_produtos_profissional()'
  ) is null then

    raise exception
      'Falha na migration 016: listar_produtos_profissional não foi criada.';

  end if;

end;
$$;


commit;
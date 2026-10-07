-- BarberHub
-- Migration 019: módulo de clientes + snapshot histórico de serviços
-- Executar após 017_conta_profissional.sql.
--
-- Responsabilidades:
-- - dados locais do cliente por barbearia;
-- - listagem completa de clientes no painel;
-- - cadastro e edição de cliente;
-- - ativação e desativação sem apagar histórico;
-- - evitar duplicidade dentro da mesma barbearia;
-- - vincular com segurança uma conta cliente a cadastro manual existente;
-- - preservar nome, preço e duração históricos dos serviços;
-- - manter indicadores financeiros históricos corretos.

begin;


-- =========================================================
-- 1. DADOS DO RELACIONAMENTO CLIENTE X BARBEARIA
-- =========================================================

alter table public.clientes_barbearias
add column if not exists nome_local text;


alter table public.clientes_barbearias
add column if not exists telefone_local text;


alter table public.clientes_barbearias
add column if not exists email_local text;


alter table public.clientes_barbearias
add column if not exists observacoes text;


alter table public.clientes_barbearias
add column if not exists ativo boolean
not null
default true;


alter table public.clientes_barbearias
add column if not exists updated_at timestamptz
not null
default now();


-- Preenche relacionamentos antigos sem sobrescrever
-- personalizações já existentes.

update public.clientes_barbearias cb
set
  nome_local =
    coalesce(
      nullif(
        trim(cb.nome_local),
        ''
      ),
      c.nome
    ),

  telefone_local =
    coalesce(
      nullif(
        regexp_replace(
          coalesce(
            cb.telefone_local,
            ''
          ),
          '\D',
          '',
          'g'
        ),
        ''
      ),
      c.telefone
    ),

  email_local =
    coalesce(
      nullif(
        lower(
          trim(
            coalesce(
              cb.email_local,
              ''
            )
          )
        ),
        ''
      ),
      lower(c.email)
    ),

  updated_at =
    coalesce(
      cb.updated_at,
      now()
    )

from public.clientes c

where c.id =
  cb.cliente_id;


-- =========================================================
-- 2. ÍNDICES
-- =========================================================

create index if not exists
idx_clientes_barbearias_barbearia_ativo
on public.clientes_barbearias (
  barbearia_id,
  ativo,
  cliente_id
);


create index if not exists
idx_clientes_barbearias_telefone_local
on public.clientes_barbearias (
  barbearia_id,
  telefone_local
)
where telefone_local is not null;


create index if not exists
idx_clientes_barbearias_email_local
on public.clientes_barbearias (
  barbearia_id,
  lower(email_local)
)
where email_local is not null;


-- =========================================================
-- 3. SNAPSHOT HISTÓRICO DO SERVIÇO
-- =========================================================
--
-- Preserva como o serviço era no momento do agendamento.
--
-- Exemplo:
-- serviço custava R$ 30
-- atendimento concluído por R$ 30
-- depois o serviço passa para R$ 40
--
-- o histórico continua valendo R$ 30.

alter table public.agendamentos
add column if not exists servico_nome_snapshot text;


alter table public.agendamentos
add column if not exists servico_preco_snapshot numeric(10,2);


alter table public.agendamentos
add column if not exists servico_duracao_snapshot integer;


-- Backfill de agendamentos já existentes.

update public.agendamentos a
set
  servico_nome_snapshot =
    coalesce(
      a.servico_nome_snapshot,
      s.nome
    ),

  servico_preco_snapshot =
    coalesce(
      a.servico_preco_snapshot,
      s.preco
    ),

  servico_duracao_snapshot =
    coalesce(
      a.servico_duracao_snapshot,
      s.duracao
    )

from public.servicos s

where s.id =
  a.servico_id

  and (
    a.servico_nome_snapshot is null
    or a.servico_preco_snapshot is null
    or a.servico_duracao_snapshot is null
  );


alter table public.agendamentos
drop constraint if exists
agendamentos_servico_preco_snapshot_check;


alter table public.agendamentos
add constraint
agendamentos_servico_preco_snapshot_check
check (
  servico_preco_snapshot is null
  or servico_preco_snapshot >= 0
);


alter table public.agendamentos
drop constraint if exists
agendamentos_servico_duracao_snapshot_check;


alter table public.agendamentos
add constraint
agendamentos_servico_duracao_snapshot_check
check (
  servico_duracao_snapshot is null
  or servico_duracao_snapshot > 0
);


-- =========================================================
-- 4. TRIGGER DO SNAPSHOT
-- =========================================================

create or replace function
public.preencher_snapshot_servico_agendamento()
returns trigger
language plpgsql
set search_path = public
as $$
declare
  v_servico public.servicos%rowtype;
begin

  if new.servico_id is null then
    return new;
  end if;


  if tg_op = 'INSERT'
     or old.servico_id is distinct from new.servico_id
     or new.servico_nome_snapshot is null
     or new.servico_preco_snapshot is null
     or new.servico_duracao_snapshot is null
  then

    select *
    into v_servico

    from public.servicos s

    where s.id =
      new.servico_id;


    if not found then
      raise exception
        'Serviço não encontrado.';
    end if;


    new.servico_nome_snapshot :=
      v_servico.nome;

    new.servico_preco_snapshot :=
      v_servico.preco;

    new.servico_duracao_snapshot :=
      v_servico.duracao;

  end if;


  return new;
end;
$$;


revoke all
on function
public.preencher_snapshot_servico_agendamento()
from public;


drop trigger if exists
trg_agendamentos_snapshot_servico
on public.agendamentos;


create trigger
trg_agendamentos_snapshot_servico
before insert
or update of servico_id
on public.agendamentos
for each row
execute function
public.preencher_snapshot_servico_agendamento();


-- =========================================================
-- 5. LISTAR CLIENTES NO PAINEL
-- =========================================================

create or replace function public.listar_clientes_painel(
  p_barbearia_id uuid
)
returns table (
  cliente_id uuid,
  profile_id uuid,
  nome text,
  telefone text,
  email text,
  observacoes text,
  ativo boolean,
  possui_conta boolean,
  total_agendamentos bigint,
  concluidos bigint,
  total_gerado numeric,
  ultimo_agendamento timestamptz,
  created_at timestamptz
)
language plpgsql
security definer
set search_path = public, auth
as $$
begin

  if auth.uid() is null then
    raise exception
      'Usuário não autenticado.';
  end if;


  if not public.eh_dono_da_barbearia(
    p_barbearia_id
  ) then

    raise exception
      'Você não possui acesso a esta barbearia.';

  end if;


  return query

  select
    c.id as cliente_id,
    c.profile_id,

    coalesce(
      nullif(
        trim(
          cb.nome_local
        ),
        ''
      ),
      c.nome
    ) as nome,

    coalesce(
      nullif(
        trim(
          cb.telefone_local
        ),
        ''
      ),
      c.telefone
    ) as telefone,

    coalesce(
      nullif(
        trim(
          cb.email_local
        ),
        ''
      ),
      c.email
    ) as email,

    cb.observacoes,
    cb.ativo,

    (
      c.profile_id is not null
    ) as possui_conta,

    count(
      a.id
    )::bigint
      as total_agendamentos,

    count(
      a.id
    ) filter (
      where a.status =
        'concluido'
    )::bigint
      as concluidos,

    coalesce(
      sum(
        a.servico_preco_snapshot
      ) filter (
        where a.status =
          'concluido'
      ),
      0
    )::numeric
      as total_gerado,

    max(
      a.data_hora
    ) as ultimo_agendamento,

    cb.created_at

  from public.clientes_barbearias cb

  join public.clientes c
    on c.id =
      cb.cliente_id

  left join public.agendamentos a
    on a.cliente_id =
      c.id

    and a.barbearia_id =
      cb.barbearia_id

    and a.arquivado =
      false

  where cb.barbearia_id =
    p_barbearia_id

  group by
    c.id,
    c.profile_id,
    c.nome,
    c.telefone,
    c.email,
    cb.nome_local,
    cb.telefone_local,
    cb.email_local,
    cb.observacoes,
    cb.ativo,
    cb.created_at

  order by
    cb.ativo desc,

    coalesce(
      nullif(
        trim(
          cb.nome_local
        ),
        ''
      ),
      c.nome
    ) asc;

end;
$$;


revoke all
on function public.listar_clientes_painel(
  uuid
)
from public;


grant execute
on function public.listar_clientes_painel(
  uuid
)
to authenticated;


-- =========================================================
-- 6. SALVAR CLIENTE PELO PAINEL
-- =========================================================

create or replace function public.salvar_cliente_painel(
  p_barbearia_id uuid,
  p_cliente_id uuid,
  p_nome text,
  p_telefone text default null,
  p_email text default null,
  p_observacoes text default null
)
returns uuid
language plpgsql
security definer
set search_path = public, auth
as $$
declare
  v_cliente_id uuid;
  v_nome text;
  v_telefone text;
  v_email text;
  v_observacoes text;
  v_existente uuid;
begin

  if auth.uid() is null then
    raise exception
      'Usuário não autenticado.';
  end if;


  if not public.eh_dono_da_barbearia(
    p_barbearia_id
  ) then

    raise exception
      'Você não possui acesso a esta barbearia.';

  end if;


  perform pg_advisory_xact_lock(
    hashtext(
      'clientes:'
      || p_barbearia_id::text
    )
  );


  v_nome :=
    nullif(
      trim(
        coalesce(
          p_nome,
          ''
        )
      ),
      ''
    );


  if v_nome is null then
    raise exception
      'Digite o nome do cliente.';
  end if;


  v_telefone :=
    nullif(
      regexp_replace(
        coalesce(
          p_telefone,
          ''
        ),
        '\D',
        '',
        'g'
      ),
      ''
    );


  v_email :=
    nullif(
      lower(
        trim(
          coalesce(
            p_email,
            ''
          )
        )
      ),
      ''
    );


  v_observacoes :=
    nullif(
      trim(
        coalesce(
          p_observacoes,
          ''
        )
      ),
      ''
    );


  if v_email is not null
     and v_email !~
       '^[^@\s]+@[^@\s]+\.[^@\s]+$'
  then

    raise exception
      'Digite um e-mail válido.';

  end if;


  -- =======================================================
  -- EDIÇÃO
  -- =======================================================

  if p_cliente_id is not null then

    if not exists (
      select 1

      from public.clientes_barbearias cb

      where cb.barbearia_id =
        p_barbearia_id

        and cb.cliente_id =
          p_cliente_id
    ) then

      raise exception
        'Cliente não encontrado nesta barbearia.';

    end if;


    select cb.cliente_id

    into v_existente

    from public.clientes_barbearias cb

    join public.clientes c
      on c.id =
        cb.cliente_id

    where cb.barbearia_id =
      p_barbearia_id

      and cb.cliente_id <>
        p_cliente_id

      and (
        (
          v_telefone is not null

          and coalesce(
            nullif(
              cb.telefone_local,
              ''
            ),
            c.telefone
          ) =
            v_telefone
        )

        or

        (
          v_email is not null

          and lower(
            coalesce(
              nullif(
                cb.email_local,
                ''
              ),
              c.email,
              ''
            )
          ) =
            v_email
        )
      )

    limit 1;


    if v_existente is not null then
      raise exception
        'Já existe outro cliente com este telefone ou e-mail nesta barbearia.';
    end if;


    update public.clientes_barbearias

    set
      nome_local =
        v_nome,

      telefone_local =
        v_telefone,

      email_local =
        v_email,

      observacoes =
        v_observacoes,

      updated_at =
        now()

    where barbearia_id =
      p_barbearia_id

      and cliente_id =
        p_cliente_id;


    return p_cliente_id;

  end if;


  -- =======================================================
  -- NOVO CLIENTE
  -- =======================================================

  select cb.cliente_id

  into v_existente

  from public.clientes_barbearias cb

  join public.clientes c
    on c.id =
      cb.cliente_id

  where cb.barbearia_id =
    p_barbearia_id

    and (
      (
        v_telefone is not null

        and coalesce(
          nullif(
            cb.telefone_local,
            ''
          ),
          c.telefone
        ) =
          v_telefone
      )

      or

      (
        v_email is not null

        and lower(
          coalesce(
            nullif(
              cb.email_local,
              ''
            ),
            c.email,
            ''
          )
        ) =
          v_email
      )
    )

  limit 1;


  if v_existente is not null then

    update public.clientes_barbearias

    set
      nome_local =
        v_nome,

      telefone_local =
        v_telefone,

      email_local =
        v_email,

      observacoes =
        v_observacoes,

      ativo =
        true,

      updated_at =
        now()

    where barbearia_id =
      p_barbearia_id

      and cliente_id =
        v_existente;


    return v_existente;

  end if;


  insert into public.clientes (
    nome,
    telefone,
    email
  )
  values (
    v_nome,
    v_telefone,
    v_email
  )
  returning id
  into v_cliente_id;


  insert into public.clientes_barbearias (
    cliente_id,
    barbearia_id,
    nome_local,
    telefone_local,
    email_local,
    observacoes,
    ativo
  )
  values (
    v_cliente_id,
    p_barbearia_id,
    v_nome,
    v_telefone,
    v_email,
    v_observacoes,
    true
  );


  return v_cliente_id;

end;
$$;


revoke all
on function public.salvar_cliente_painel(
  uuid,
  uuid,
  text,
  text,
  text,
  text
)
from public;


grant execute
on function public.salvar_cliente_painel(
  uuid,
  uuid,
  text,
  text,
  text,
  text
)
to authenticated;


-- =========================================================
-- 7. ATIVAR / DESATIVAR CLIENTE
-- =========================================================

create or replace function
public.alterar_status_cliente_painel(
  p_barbearia_id uuid,
  p_cliente_id uuid,
  p_ativo boolean
)
returns void
language plpgsql
security definer
set search_path = public, auth
as $$
begin

  if auth.uid() is null then
    raise exception
      'Usuário não autenticado.';
  end if;


  if not public.eh_dono_da_barbearia(
    p_barbearia_id
  ) then

    raise exception
      'Você não possui acesso a esta barbearia.';

  end if;


  update public.clientes_barbearias

  set
    ativo =
      coalesce(
        p_ativo,
        false
      ),

    updated_at =
      now()

  where barbearia_id =
    p_barbearia_id

    and cliente_id =
      p_cliente_id;


  if not found then
    raise exception
      'Cliente não encontrado nesta barbearia.';
  end if;

end;
$$;


revoke all
on function
public.alterar_status_cliente_painel(
  uuid,
  uuid,
  boolean
)
from public;


grant execute
on function
public.alterar_status_cliente_painel(
  uuid,
  uuid,
  boolean
)
to authenticated;


-- =========================================================
-- 8. ONBOARDING DO CLIENTE
-- =========================================================
--
-- Precisamos remover explicitamente a versão anterior,
-- pois ela possuía parâmetros com DEFAULT.
--
-- PostgreSQL não permite remover DEFAULT usando apenas
-- CREATE OR REPLACE FUNCTION.

drop function if exists
public.finalizar_cadastro_cliente(
  text,
  text
);


create function public.finalizar_cadastro_cliente(
  p_nome text,
  p_telefone text
)
returns public.clientes
language plpgsql
security definer
set search_path = public, auth
as $$
declare
  v_user auth.users%rowtype;
  v_profile public.profiles%rowtype;

  v_cliente public.clientes%rowtype;

  v_nome text;
  v_telefone text;
  v_email text;

  v_candidato_id uuid;
  v_total_candidatos integer;
begin

  if auth.uid() is null then
    raise exception
      'Usuário não autenticado.';
  end if;


  perform pg_advisory_xact_lock(
    hashtext(
      'cliente-conta:'
      || auth.uid()::text
    )
  );


  select *
  into v_user

  from auth.users u

  where u.id =
    auth.uid();


  if not found then
    raise exception
      'Usuário autenticado não encontrado.';
  end if;


  v_email :=
    nullif(
      lower(
        trim(
          coalesce(
            v_user.email,
            ''
          )
        )
      ),
      ''
    );


  if v_email is null then
    raise exception
      'A conta autenticada não possui e-mail válido.';
  end if;


  v_nome :=
    nullif(
      trim(
        coalesce(
          p_nome,
          ''
        )
      ),
      ''
    );


  if v_nome is null then
    raise exception
      'Digite seu nome.';
  end if;


  v_telefone :=
    nullif(
      regexp_replace(
        coalesce(
          p_telefone,
          ''
        ),
        '\D',
        '',
        'g'
      ),
      ''
    );


  -- =======================================================
  -- PROFILE
  -- =======================================================

  select *
  into v_profile

  from public.profiles p

  where p.id =
    auth.uid();


  if found then

    if v_profile.tipo <>
      'cliente'
    then

      raise exception
        'Esta conta está vinculada a outro tipo de acesso.';

    end if;


    update public.profiles

    set
      nome =
        v_nome,

      telefone =
        v_telefone

    where id =
      auth.uid();

  else

    insert into public.profiles (
      id,
      nome,
      telefone,
      tipo
    )
    values (
      auth.uid(),
      v_nome,
      v_telefone,
      'cliente'
    );

  end if;


  -- =======================================================
  -- CLIENTE JÁ VINCULADO
  -- =======================================================

  select *
  into v_cliente

  from public.clientes c

  where c.profile_id =
    auth.uid()

  limit 1;


  if found then

    update public.clientes

    set
      nome =
        v_nome,

      telefone =
        v_telefone,

      email =
        v_email

    where id =
      v_cliente.id

    returning *
    into v_cliente;


    return v_cliente;

  end if;


  -- =======================================================
  -- TENTATIVA SEGURA DE REAPROVEITAR CLIENTE MANUAL
  -- =======================================================
  --
  -- Só reaproveitamos automaticamente quando existe
  -- exatamente UM candidato sem conta.

  select
    count(*)::integer,
    min(c.id)

  into
    v_total_candidatos,
    v_candidato_id

  from public.clientes c

  where c.profile_id is null

    and (
      lower(
        coalesce(
          c.email,
          ''
        )
      ) =
        v_email

      or (
        v_telefone is not null

        and c.telefone =
          v_telefone
      )
    );


  if v_total_candidatos = 1
     and v_candidato_id is not null
  then

    update public.clientes

    set
      profile_id =
        auth.uid(),

      nome =
        v_nome,

      telefone =
        coalesce(
          v_telefone,
          telefone
        ),

      email =
        v_email

    where id =
      v_candidato_id

    returning *
    into v_cliente;


    return v_cliente;

  end if;


  -- =======================================================
  -- NOVO CLIENTE
  -- =======================================================

  insert into public.clientes (
    profile_id,
    nome,
    telefone,
    email
  )
  values (
    auth.uid(),
    v_nome,
    v_telefone,
    v_email
  )
  returning *
  into v_cliente;


  return v_cliente;

end;
$$;


revoke all
on function public.finalizar_cadastro_cliente(
  text,
  text
)
from public;


grant execute
on function public.finalizar_cadastro_cliente(
  text,
  text
)
to authenticated;


-- =========================================================
-- 9. AGENDA PROFISSIONAL PASSA A USAR SNAPSHOT
-- =========================================================

create or replace function
public.listar_agendamentos_profissional()
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
    ),

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

      else null
    end,

    coalesce(
      a.servico_nome_snapshot,
      s.nome
    ),

    coalesce(
      a.servico_preco_snapshot,
      s.preco
    ),

    coalesce(
      a.servico_duracao_snapshot,
      s.duracao
    ),

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
on function
public.listar_agendamentos_profissional()
from public;


grant execute
on function
public.listar_agendamentos_profissional()
to authenticated;


-- =========================================================
-- 10. VALIDAÇÃO
-- =========================================================

do $$
begin

  if not exists (
    select 1

    from information_schema.columns

    where table_schema =
      'public'

      and table_name =
        'clientes_barbearias'

      and column_name =
        'nome_local'
  ) then

    raise exception
      'Falha na migration 019: nome_local não foi criada.';

  end if;


  if not exists (
    select 1

    from information_schema.columns

    where table_schema =
      'public'

      and table_name =
        'agendamentos'

      and column_name =
        'servico_preco_snapshot'
  ) then

    raise exception
      'Falha na migration 019: snapshot de preço não foi criado.';

  end if;


  if to_regprocedure(
    'public.listar_clientes_painel(uuid)'
  ) is null then

    raise exception
      'Falha na migration 019: listar_clientes_painel não foi criada.';

  end if;


  if to_regprocedure(
    'public.salvar_cliente_painel(uuid,uuid,text,text,text,text)'
  ) is null then

    raise exception
      'Falha na migration 019: salvar_cliente_painel não foi criada.';

  end if;


  if to_regprocedure(
    'public.alterar_status_cliente_painel(uuid,uuid,boolean)'
  ) is null then

    raise exception
      'Falha na migration 019: alterar_status_cliente_painel não foi criada.';

  end if;


  if to_regprocedure(
    'public.finalizar_cadastro_cliente(text,text)'
  ) is null then

    raise exception
      'Falha na migration 019: finalizar_cadastro_cliente não foi criada.';

  end if;


  if to_regprocedure(
    'public.listar_agendamentos_profissional()'
  ) is null then

    raise exception
      'Falha na migration 019: listar_agendamentos_profissional não foi criada.';

  end if;

end;
$$;

-- BarberHub
-- Patch entre 019 e 020: remoção segura de profissional da equipe.
-- Preserva o registro comercial para manter o histórico de atendimentos.

begin;

alter table public.profissionais
add column if not exists removido_em timestamptz;

create index if not exists
idx_profissionais_barbearia_removido
on public.profissionais (
  barbearia_id,
  removido_em,
  ativo
);

comment on column public.profissionais.removido_em is
'Data em que o profissional foi removido da equipe. O registro é preservado para manter o histórico comercial.';

commit;

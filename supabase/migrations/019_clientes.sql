-- BarberHub React
-- Migration 019: módulo de clientes
-- Executar após 018_logo_barbearia_profissional.sql.

alter table public.clientes_barbearias
add column if not exists nome_local text;

alter table public.clientes_barbearias
add column if not exists telefone_local text;

alter table public.clientes_barbearias
add column if not exists email_local text;

alter table public.clientes_barbearias
add column if not exists observacoes text;

alter table public.clientes_barbearias
add column if not exists ativo boolean not null default true;

alter table public.clientes_barbearias
add column if not exists updated_at timestamptz not null default now();

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
    raise exception 'Usuário não autenticado.';
  end if;

  if not public.eh_dono_da_barbearia(
    p_barbearia_id
  ) then
    raise exception 'Você não possui acesso a esta barbearia.';
  end if;

  return query
  select
    c.id,
    c.profile_id,
    coalesce(
      nullif(trim(cb.nome_local), ''),
      c.nome
    ) as nome,
    coalesce(
      nullif(trim(cb.telefone_local), ''),
      c.telefone
    ) as telefone,
    coalesce(
      nullif(trim(cb.email_local), ''),
      c.email
    ) as email,
    cb.observacoes,
    cb.ativo,
    (c.profile_id is not null) as possui_conta,
    count(a.id)::bigint as total_agendamentos,
    count(a.id) filter (
      where a.status = 'concluido'
    )::bigint as concluidos,
    coalesce(
      sum(s.preco) filter (
        where a.status = 'concluido'
      ),
      0
    )::numeric as total_gerado,
    max(a.data_hora) as ultimo_agendamento,
    cb.created_at
  from public.clientes_barbearias cb
  join public.clientes c
    on c.id = cb.cliente_id
  left join public.agendamentos a
    on a.cliente_id = c.id
    and a.barbearia_id = cb.barbearia_id
    and a.arquivado = false
  left join public.servicos s
    on s.id = a.servico_id
  where cb.barbearia_id = p_barbearia_id
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
      nullif(trim(cb.nome_local), ''),
      c.nome
    ) asc;
end;
$$;

revoke all on function public.listar_clientes_painel(uuid)
from public;

grant execute on function public.listar_clientes_painel(uuid)
to authenticated;


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
  v_existente uuid;
begin
  if auth.uid() is null then
    raise exception 'Usuário não autenticado.';
  end if;

  if not public.eh_dono_da_barbearia(
    p_barbearia_id
  ) then
    raise exception 'Você não possui acesso a esta barbearia.';
  end if;

  v_nome :=
    nullif(trim(coalesce(p_nome, '')), '');

  if v_nome is null then
    raise exception 'Digite o nome do cliente.';
  end if;

  v_telefone :=
    nullif(
      regexp_replace(
        coalesce(p_telefone, ''),
        '\D',
        '',
        'g'
      ),
      ''
    );

  v_email :=
    nullif(
      lower(trim(coalesce(p_email, ''))),
      ''
    );

  if v_email is not null
    and v_email !~ '^[^@\s]+@[^@\s]+\.[^@\s]+$'
  then
    raise exception 'Digite um e-mail válido.';
  end if;

  if p_cliente_id is not null then
    if not exists (
      select 1
      from public.clientes_barbearias cb
      where cb.barbearia_id = p_barbearia_id
        and cb.cliente_id = p_cliente_id
    ) then
      raise exception 'Cliente não encontrado nesta barbearia.';
    end if;

    select cb.cliente_id
    into v_existente
    from public.clientes_barbearias cb
    join public.clientes c
      on c.id = cb.cliente_id
    where cb.barbearia_id = p_barbearia_id
      and cb.cliente_id <> p_cliente_id
      and (
        (
          v_telefone is not null
          and coalesce(
            nullif(cb.telefone_local, ''),
            c.telefone
          ) = v_telefone
        )
        or
        (
          v_email is not null
          and lower(
            coalesce(
              nullif(cb.email_local, ''),
              c.email,
              ''
            )
          ) = v_email
        )
      )
    limit 1;

    if v_existente is not null then
      raise exception 'Já existe outro cliente com este telefone ou e-mail nesta barbearia.';
    end if;

    update public.clientes_barbearias
    set
      nome_local = v_nome,
      telefone_local = v_telefone,
      email_local = v_email,
      observacoes =
        nullif(
          trim(coalesce(p_observacoes, '')),
          ''
        ),
      updated_at = now()
    where barbearia_id = p_barbearia_id
      and cliente_id = p_cliente_id;

    return p_cliente_id;
  end if;

  select cb.cliente_id
  into v_existente
  from public.clientes_barbearias cb
  join public.clientes c
    on c.id = cb.cliente_id
  where cb.barbearia_id = p_barbearia_id
    and (
      (
        v_telefone is not null
        and coalesce(
          nullif(cb.telefone_local, ''),
          c.telefone
        ) = v_telefone
      )
      or
      (
        v_email is not null
        and lower(
          coalesce(
            nullif(cb.email_local, ''),
            c.email,
            ''
          )
        ) = v_email
      )
    )
  limit 1;

  if v_existente is not null then
    update public.clientes_barbearias
    set
      nome_local = v_nome,
      telefone_local = v_telefone,
      email_local = v_email,
      observacoes =
        nullif(
          trim(coalesce(p_observacoes, '')),
          ''
        ),
      ativo = true,
      updated_at = now()
    where barbearia_id = p_barbearia_id
      and cliente_id = v_existente;

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
    nullif(
      trim(coalesce(p_observacoes, '')),
      ''
    ),
    true
  );

  return v_cliente_id;
end;
$$;

revoke all on function public.salvar_cliente_painel(
  uuid,
  uuid,
  text,
  text,
  text,
  text
) from public;

grant execute on function public.salvar_cliente_painel(
  uuid,
  uuid,
  text,
  text,
  text,
  text
) to authenticated;


create or replace function public.alterar_status_cliente_painel(
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
    raise exception 'Usuário não autenticado.';
  end if;

  if not public.eh_dono_da_barbearia(
    p_barbearia_id
  ) then
    raise exception 'Você não possui acesso a esta barbearia.';
  end if;

  update public.clientes_barbearias
  set
    ativo = coalesce(p_ativo, false),
    updated_at = now()
  where barbearia_id = p_barbearia_id
    and cliente_id = p_cliente_id;

  if not found then
    raise exception 'Cliente não encontrado nesta barbearia.';
  end if;
end;
$$;

revoke all on function public.alterar_status_cliente_painel(
  uuid,
  uuid,
  boolean
) from public;

grant execute on function public.alterar_status_cliente_painel(
  uuid,
  uuid,
  boolean
) to authenticated;

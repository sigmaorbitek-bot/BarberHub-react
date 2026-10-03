-- BarberHub React
-- Migration 025: central de notificações + preparação Web Push
-- Executar após 024_avaliacoes.sql.

alter table public.notificacoes
add column if not exists rota text;

alter table public.notificacoes
add column if not exists dados jsonb not null default '{}'::jsonb;

alter table public.notificacoes
add column if not exists push_enviado_at timestamptz;

alter table public.notificacoes
add column if not exists updated_at timestamptz not null default now();

create index if not exists idx_notificacoes_usuario_lida_created
on public.notificacoes (
  usuario_id,
  lida,
  created_at desc
);

create index if not exists idx_notificacoes_barbearia_tipo_created
on public.notificacoes (
  barbearia_id,
  tipo,
  created_at desc
);

drop trigger if exists trg_notificacoes_updated_at
on public.notificacoes;

create trigger trg_notificacoes_updated_at
before update on public.notificacoes
for each row
execute function public.set_updated_at();


-- Preferências adicionais para eventos do painel administrativo.
alter table public.preferencias_notificacoes
add column if not exists conta_vencendo boolean not null default true;

alter table public.preferencias_notificacoes
add column if not exists conta_vencida boolean not null default true;

alter table public.preferencias_notificacoes
add column if not exists pagamento_recebido boolean not null default true;


create or replace function public.listar_notificacoes_painel(
  p_barbearia_id uuid,
  p_limite integer default 50
)
returns table (
  notificacao_id uuid,
  tipo text,
  titulo text,
  mensagem text,
  referencia_id uuid,
  rota text,
  lida boolean,
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
  select
    n.id,
    n.tipo,
    n.titulo,
    n.mensagem,
    n.referencia_id,
    n.rota,
    n.lida,
    n.created_at
  from public.notificacoes n
  where n.usuario_id = auth.uid()
    and n.barbearia_id = p_barbearia_id
  order by n.created_at desc
  limit greatest(1, least(coalesce(p_limite, 50), 100));
end;
$$;

revoke all on function public.listar_notificacoes_painel(uuid, integer)
from public;

grant execute on function public.listar_notificacoes_painel(uuid, integer)
to authenticated;


create or replace function public.marcar_notificacao_lida(
  p_notificacao_id uuid
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

  update public.notificacoes
  set lida = true
  where id = p_notificacao_id
    and usuario_id = auth.uid();

  if not found then
    raise exception 'Notificação não encontrada.';
  end if;
end;
$$;

revoke all on function public.marcar_notificacao_lida(uuid)
from public;

grant execute on function public.marcar_notificacao_lida(uuid)
to authenticated;


create or replace function public.marcar_todas_notificacoes_lidas(
  p_barbearia_id uuid
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

  if not public.eh_dono_da_barbearia(p_barbearia_id) then
    raise exception 'Você não possui acesso a esta barbearia.';
  end if;

  update public.notificacoes
  set lida = true
  where usuario_id = auth.uid()
    and barbearia_id = p_barbearia_id
    and lida = false;
end;
$$;

revoke all on function public.marcar_todas_notificacoes_lidas(uuid)
from public;

grant execute on function public.marcar_todas_notificacoes_lidas(uuid)
to authenticated;


-- Salva/reativa uma assinatura do navegador de forma controlada.
create or replace function public.salvar_push_subscription(
  p_endpoint text,
  p_p256dh text,
  p_auth_key text,
  p_user_agent text default null
)
returns uuid
language plpgsql
security definer
set search_path = public, auth
as $$
declare
  v_id uuid;
begin
  if auth.uid() is null then
    raise exception 'Usuário não autenticado.';
  end if;

  if nullif(trim(p_endpoint), '') is null
    or nullif(trim(p_p256dh), '') is null
    or nullif(trim(p_auth_key), '') is null then
    raise exception 'Assinatura push inválida.';
  end if;

  insert into public.push_subscriptions (
    usuario_id,
    endpoint,
    p256dh,
    auth_key,
    user_agent,
    ativo
  )
  values (
    auth.uid(),
    p_endpoint,
    p_p256dh,
    p_auth_key,
    nullif(trim(coalesce(p_user_agent, '')), ''),
    true
  )
  on conflict (endpoint)
  do update set
    usuario_id = excluded.usuario_id,
    p256dh = excluded.p256dh,
    auth_key = excluded.auth_key,
    user_agent = excluded.user_agent,
    ativo = true,
    updated_at = now()
  returning id into v_id;

  return v_id;
end;
$$;

revoke all on function public.salvar_push_subscription(text, text, text, text)
from public;

grant execute on function public.salvar_push_subscription(text, text, text, text)
to authenticated;


create or replace function public.desativar_push_subscription(
  p_endpoint text
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

  update public.push_subscriptions
  set ativo = false
  where usuario_id = auth.uid()
    and endpoint = p_endpoint;
end;
$$;

revoke all on function public.desativar_push_subscription(text)
from public;

grant execute on function public.desativar_push_subscription(text)
to authenticated;


-- Garante que usuários existentes também tenham preferências.
insert into public.preferencias_notificacoes (usuario_id)
select p.id
from public.profiles p
where not exists (
  select 1
  from public.preferencias_notificacoes pn
  where pn.usuario_id = p.id
)
on conflict (usuario_id) do nothing;


-- Função interna para criar notificação do dono.
create or replace function public.criar_notificacao_dono(
  p_barbearia_id uuid,
  p_tipo text,
  p_titulo text,
  p_mensagem text,
  p_referencia_id uuid,
  p_rota text,
  p_dados jsonb default '{}'::jsonb
)
returns uuid
language plpgsql
security definer
set search_path = public, auth
as $$
declare
  v_dono_id uuid;
  v_id uuid;
begin
  select b.dono_id
  into v_dono_id
  from public.barbearias b
  where b.id = p_barbearia_id;

  if v_dono_id is null then
    return null;
  end if;

  insert into public.notificacoes (
    usuario_id,
    barbearia_id,
    tipo,
    titulo,
    mensagem,
    referencia_id,
    rota,
    dados,
    lida
  )
  values (
    v_dono_id,
    p_barbearia_id,
    p_tipo,
    p_titulo,
    p_mensagem,
    p_referencia_id,
    p_rota,
    coalesce(p_dados, '{}'::jsonb),
    false
  )
  returning id into v_id;

  return v_id;
end;
$$;

revoke all on function public.criar_notificacao_dono(
  uuid, text, text, text, uuid, text, jsonb
) from public;


-- Novo agendamento para o dono.
create or replace function public.notificar_dono_agendamento_insert()
returns trigger
language plpgsql
security definer
set search_path = public, auth
as $$
declare
  v_dono uuid;
  v_servico text;
begin
  select b.dono_id
  into v_dono
  from public.barbearias b
  where b.id = new.barbearia_id;

  -- Não notifica o dono sobre um agendamento que ele mesmo cadastrou.
  if auth.uid() is not null and auth.uid() = v_dono then
    return new;
  end if;

  select s.nome
  into v_servico
  from public.servicos s
  where s.id = new.servico_id;

  perform public.criar_notificacao_dono(
    new.barbearia_id,
    'novo_agendamento',
    '📅 Novo agendamento',
    coalesce(new.cliente_nome, 'Cliente')
      || ' agendou '
      || coalesce(v_servico, 'um serviço')
      || '.',
    new.id,
    format('/painel/%s/agendamentos', new.barbearia_id),
    jsonb_build_object(
      'agendamento_id', new.id,
      'data_hora', new.data_hora,
      'status', new.status
    )
  );

  return new;
end;
$$;

drop trigger if exists trg_notificar_dono_agendamento_insert
on public.agendamentos;

create trigger trg_notificar_dono_agendamento_insert
after insert on public.agendamentos
for each row
execute function public.notificar_dono_agendamento_insert();


-- Cancelamento/alteração de agendamento feito fora do painel do dono.
create or replace function public.notificar_dono_agendamento_update()
returns trigger
language plpgsql
security definer
set search_path = public, auth
as $$
declare
  v_dono uuid;
begin
  if old.status is not distinct from new.status then
    return new;
  end if;

  select b.dono_id
  into v_dono
  from public.barbearias b
  where b.id = new.barbearia_id;

  if auth.uid() is not null and auth.uid() = v_dono then
    return new;
  end if;

  if new.status = 'cancelado' then
    perform public.criar_notificacao_dono(
      new.barbearia_id,
      'agendamento_cancelado',
      '❌ Agendamento cancelado',
      coalesce(new.cliente_nome, 'Cliente')
        || ' cancelou um agendamento.',
      new.id,
      format('/painel/%s/agendamentos', new.barbearia_id),
      jsonb_build_object(
        'agendamento_id', new.id,
        'status', new.status
      )
    );
  elsif new.status = 'confirmado' then
    perform public.criar_notificacao_dono(
      new.barbearia_id,
      'agendamento_confirmado',
      '✅ Agendamento confirmado',
      coalesce(new.cliente_nome, 'Cliente')
        || ' teve o agendamento confirmado.',
      new.id,
      format('/painel/%s/agendamentos', new.barbearia_id),
      jsonb_build_object(
        'agendamento_id', new.id,
        'status', new.status
      )
    );
  end if;

  return new;
end;
$$;

drop trigger if exists trg_notificar_dono_agendamento_update
on public.agendamentos;

create trigger trg_notificar_dono_agendamento_update
after update of status on public.agendamentos
for each row
execute function public.notificar_dono_agendamento_update();


-- Novo pedido online para o dono.
create or replace function public.notificar_dono_pedido_insert()
returns trigger
language plpgsql
security definer
set search_path = public, auth
as $$
declare
  v_dono uuid;
  v_produto text;
  v_cliente text;
begin
  select b.dono_id
  into v_dono
  from public.barbearias b
  where b.id = new.barbearia_id;

  -- Pedido presencial criado pelo próprio dono não precisa gerar push para ele.
  if auth.uid() is not null and auth.uid() = v_dono then
    return new;
  end if;

  select p.nome
  into v_produto
  from public.produtos p
  where p.id = new.produto_id;

  select c.nome
  into v_cliente
  from public.clientes c
  where c.id = new.cliente_id;

  perform public.criar_notificacao_dono(
    new.barbearia_id,
    'novo_pedido',
    '🛍️ Novo pedido',
    coalesce(v_cliente, 'Cliente')
      || ' pediu '
      || new.quantidade::text
      || 'x '
      || coalesce(v_produto, 'produto')
      || '.',
    new.id,
    format('/painel/%s/pedidos', new.barbearia_id),
    jsonb_build_object(
      'pedido_id', new.id,
      'status', new.status,
      'quantidade', new.quantidade
    )
  );

  return new;
end;
$$;

drop trigger if exists trg_notificar_dono_pedido_insert
on public.pedidos;

create trigger trg_notificar_dono_pedido_insert
after insert on public.pedidos
for each row
execute function public.notificar_dono_pedido_insert();


-- Nova avaliação para o dono.
create or replace function public.notificar_dono_avaliacao_insert()
returns trigger
language plpgsql
security definer
set search_path = public, auth
as $$
declare
  v_cliente text;
begin
  select c.nome
  into v_cliente
  from public.clientes c
  where c.id = new.cliente_id;

  perform public.criar_notificacao_dono(
    new.barbearia_id,
    'nova_avaliacao',
    '⭐ Nova avaliação',
    coalesce(v_cliente, 'Cliente')
      || ' avaliou a barbearia com '
      || new.nota::text
      || ' estrela(s).',
    new.id,
    format('/painel/%s/avaliacoes', new.barbearia_id),
    jsonb_build_object(
      'avaliacao_id', new.id,
      'nota', new.nota
    )
  );

  return new;
end;
$$;

drop trigger if exists trg_notificar_dono_avaliacao_insert
on public.avaliacoes;

create trigger trg_notificar_dono_avaliacao_insert
after insert on public.avaliacoes
for each row
execute function public.notificar_dono_avaliacao_insert();


-- Estoque baixo: avisa somente quando cruza o limite.
create or replace function public.notificar_dono_estoque_baixo()
returns trigger
language plpgsql
security definer
set search_path = public, auth
as $$
begin
  if new.ativo = true
    and new.estoque <= new.estoque_minimo
    and (
      old.estoque > old.estoque_minimo
      or old.estoque is distinct from new.estoque
         and old.estoque_minimo is distinct from new.estoque_minimo
    )
  then
    perform public.criar_notificacao_dono(
      new.barbearia_id,
      'estoque_baixo',
      case
        when new.estoque = 0 then '📦 Produto sem estoque'
        else '⚠️ Estoque baixo'
      end,
      new.nome
        || ' está com '
        || new.estoque::text
        || ' unidade(s) em estoque.',
      new.id,
      format('/painel/%s/produtos', new.barbearia_id),
      jsonb_build_object(
        'produto_id', new.id,
        'estoque', new.estoque,
        'estoque_minimo', new.estoque_minimo
      )
    );
  end if;

  return new;
end;
$$;

drop trigger if exists trg_notificar_dono_estoque_baixo
on public.produtos;

create trigger trg_notificar_dono_estoque_baixo
after update of estoque, estoque_minimo, ativo
on public.produtos
for each row
execute function public.notificar_dono_estoque_baixo();

-- BarberHub React
-- Migration 026: configurações do painel administrativo

create or replace function public.obter_configuracoes_painel(
  p_barbearia_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = public, auth
as $$
declare
  v_barbearia jsonb;
  v_perfil jsonb;
  v_preferencias jsonb;
  v_email text;
begin
  if auth.uid() is null then
    raise exception 'Usuário não autenticado.';
  end if;

  if not public.eh_dono_da_barbearia(p_barbearia_id) then
    raise exception 'Você não possui acesso a esta barbearia.';
  end if;

  select jsonb_build_object(
    'id', b.id,
    'nome', b.nome,
    'cidade', b.cidade,
    'endereco', b.endereco,
    'telefone', b.telefone,
    'logo_url', b.logo_url
  )
  into v_barbearia
  from public.barbearias b
  where b.id = p_barbearia_id;

  select jsonb_build_object(
    'nome', p.nome,
    'telefone', p.telefone
  )
  into v_perfil
  from public.profiles p
  where p.id = auth.uid();

  select to_jsonb(pn) - 'usuario_id' - 'id' - 'created_at' - 'updated_at'
  into v_preferencias
  from public.preferencias_notificacoes pn
  where pn.usuario_id = auth.uid();

  select u.email
  into v_email
  from auth.users u
  where u.id = auth.uid();

  return jsonb_build_object(
    'barbearia', coalesce(v_barbearia, '{}'::jsonb),
    'perfil', coalesce(v_perfil, '{}'::jsonb),
    'preferencias', coalesce(v_preferencias, '{}'::jsonb),
    'email', v_email
  );
end;
$$;

revoke all on function public.obter_configuracoes_painel(uuid) from public;
grant execute on function public.obter_configuracoes_painel(uuid) to authenticated;

create or replace function public.atualizar_configuracoes_barbearia_painel(
  p_barbearia_id uuid,
  p_nome text,
  p_cidade text,
  p_endereco text default null,
  p_telefone text default null,
  p_logo_url text default null
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

  if length(trim(coalesce(p_nome, ''))) < 2 then
    raise exception 'Informe um nome válido para a barbearia.';
  end if;

  if length(trim(coalesce(p_cidade, ''))) < 2 then
    raise exception 'Informe uma cidade válida.';
  end if;

  if p_telefone is not null and length(trim(p_telefone)) > 30 then
    raise exception 'Telefone inválido.';
  end if;

  update public.barbearias
  set
    nome = trim(p_nome),
    cidade = trim(p_cidade),
    endereco = nullif(trim(coalesce(p_endereco, '')), ''),
    telefone = nullif(trim(coalesce(p_telefone, '')), ''),
    logo_url = nullif(trim(coalesce(p_logo_url, '')), '')
  where id = p_barbearia_id
    and dono_id = auth.uid();

  if not found then
    raise exception 'Barbearia não encontrada.';
  end if;
end;
$$;

revoke all on function public.atualizar_configuracoes_barbearia_painel(uuid, text, text, text, text, text) from public;
grant execute on function public.atualizar_configuracoes_barbearia_painel(uuid, text, text, text, text, text) to authenticated;

create or replace function public.atualizar_perfil_dono_painel(
  p_nome text,
  p_telefone text default null
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

  if length(trim(coalesce(p_nome, ''))) < 2 then
    raise exception 'Informe um nome válido.';
  end if;

  update public.profiles
  set
    nome = trim(p_nome),
    telefone = nullif(trim(coalesce(p_telefone, '')), '')
  where id = auth.uid();

  if not found then
    raise exception 'Perfil do administrador não encontrado.';
  end if;
end;
$$;

revoke all on function public.atualizar_perfil_dono_painel(text, text) from public;
grant execute on function public.atualizar_perfil_dono_painel(text, text) to authenticated;

create or replace function public.salvar_preferencias_notificacoes_painel(
  p_barbearia_id uuid,
  p_novo_agendamento boolean,
  p_agendamento_cancelado boolean,
  p_agendamento_alterado boolean,
  p_agendamento_confirmado boolean,
  p_lembrete_agendamento boolean,
  p_novo_pedido boolean,
  p_pedido_atualizado boolean,
  p_estoque_baixo boolean,
  p_nova_avaliacao boolean,
  p_conta_vencendo boolean,
  p_conta_vencida boolean,
  p_pagamento_recebido boolean
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

  insert into public.preferencias_notificacoes (
    usuario_id,
    novo_agendamento,
    agendamento_cancelado,
    agendamento_alterado,
    agendamento_confirmado,
    lembrete_agendamento,
    novo_pedido,
    pedido_atualizado,
    estoque_baixo,
    nova_avaliacao,
    conta_vencendo,
    conta_vencida,
    pagamento_recebido
  )
  values (
    auth.uid(),
    p_novo_agendamento,
    p_agendamento_cancelado,
    p_agendamento_alterado,
    p_agendamento_confirmado,
    p_lembrete_agendamento,
    p_novo_pedido,
    p_pedido_atualizado,
    p_estoque_baixo,
    p_nova_avaliacao,
    p_conta_vencendo,
    p_conta_vencida,
    p_pagamento_recebido
  )
  on conflict (usuario_id)
  do update set
    novo_agendamento = excluded.novo_agendamento,
    agendamento_cancelado = excluded.agendamento_cancelado,
    agendamento_alterado = excluded.agendamento_alterado,
    agendamento_confirmado = excluded.agendamento_confirmado,
    lembrete_agendamento = excluded.lembrete_agendamento,
    novo_pedido = excluded.novo_pedido,
    pedido_atualizado = excluded.pedido_atualizado,
    estoque_baixo = excluded.estoque_baixo,
    nova_avaliacao = excluded.nova_avaliacao,
    conta_vencendo = excluded.conta_vencendo,
    conta_vencida = excluded.conta_vencida,
    pagamento_recebido = excluded.pagamento_recebido;
end;
$$;

revoke all on function public.salvar_preferencias_notificacoes_painel(uuid, boolean, boolean, boolean, boolean, boolean, boolean, boolean, boolean, boolean, boolean, boolean, boolean) from public;
grant execute on function public.salvar_preferencias_notificacoes_painel(uuid, boolean, boolean, boolean, boolean, boolean, boolean, boolean, boolean, boolean, boolean, boolean, boolean) to authenticated;

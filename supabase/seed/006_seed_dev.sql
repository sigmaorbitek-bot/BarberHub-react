-- BarberHub React
-- Migration 006: dados fictícios de desenvolvimento
-- Executar após 001 a 005.
--
-- IMPORTANTE:
-- Antes de executar este arquivo, crie DUAS contas de teste em
-- Supabase > Authentication > Users:
--
-- 1) dono.teste@barberhub.local
--    metadata sugerida:
--    nome = Dono Teste
--    tipo = dono
--
-- 2) cliente.teste@barberhub.local
--    metadata sugerida:
--    nome = Cliente Teste
--    tipo = cliente
--
-- Não use dados reais de clientes.
--
-- Este seed NÃO cria usuários em auth.users.
-- Ele usa as contas acima e popula somente dados fictícios.

do $$
declare
  v_dono_id uuid;
  v_cliente_profile_id uuid;
  v_cliente_id uuid;
  v_barbearia_id uuid;

  v_servico_corte uuid;
  v_servico_barba uuid;
  v_servico_combo uuid;

  v_profissional_1 uuid;
  v_profissional_2 uuid;

  v_produto_1 uuid;
  v_produto_2 uuid;
begin
  -- =======================================================
  -- 1. LOCALIZAR USUÁRIOS DE TESTE
  -- =======================================================

  select id
  into v_dono_id
  from auth.users
  where lower(email) = 'dono.teste@barberhub.local'
  limit 1;

  if v_dono_id is null then
    raise exception
      'Crie primeiro o usuário dono.teste@barberhub.local em Authentication > Users.';
  end if;

  select id
  into v_cliente_profile_id
  from auth.users
  where lower(email) = 'cliente.teste@barberhub.local'
  limit 1;

  if v_cliente_profile_id is null then
    raise exception
      'Crie primeiro o usuário cliente.teste@barberhub.local em Authentication > Users.';
  end if;

  -- =======================================================
  -- 2. GARANTIR PROFILES
  -- =======================================================
  -- Normalmente os triggers da migration 005 já terão criado.
  -- O upsert deixa o seed reexecutável.

  insert into public.profiles (
    id,
    nome,
    telefone,
    tipo
  )
  values (
    v_dono_id,
    'Dono Teste',
    '81999990001',
    'dono'
  )
  on conflict (id)
  do update set
    nome = excluded.nome,
    telefone = excluded.telefone,
    tipo = excluded.tipo;

  insert into public.profiles (
    id,
    nome,
    telefone,
    tipo
  )
  values (
    v_cliente_profile_id,
    'Cliente Teste',
    '81999990002',
    'cliente'
  )
  on conflict (id)
  do update set
    nome = excluded.nome,
    telefone = excluded.telefone,
    tipo = excluded.tipo;

  -- =======================================================
  -- 3. CLIENTE
  -- =======================================================

  insert into public.clientes (
    profile_id,
    nome,
    telefone,
    email
  )
  values (
    v_cliente_profile_id,
    'Cliente Teste',
    '81999990002',
    'cliente.teste@barberhub.local'
  )
  on conflict (profile_id)
  do update set
    nome = excluded.nome,
    telefone = excluded.telefone,
    email = excluded.email
  returning id into v_cliente_id;

  -- =======================================================
  -- 4. BARBEARIA
  -- =======================================================

  select id
  into v_barbearia_id
  from public.barbearias
  where dono_id = v_dono_id
    and nome = 'Barbearia Demo'
  limit 1;

  if v_barbearia_id is null then
    insert into public.barbearias (
      dono_id,
      nome,
      cidade,
      endereco,
      telefone,
      horario_abertura,
      horario_fechamento,
      dias_funcionamento
    )
    values (
      v_dono_id,
      'Barbearia Demo',
      'Altinho',
      'Rua de Teste, 100',
      '81999990003',
      '08:00',
      '18:00',
      array['seg','ter','qua','qui','sex','sab']
    )
    returning id into v_barbearia_id;
  end if;

  -- =======================================================
  -- 5. VÍNCULO CLIENTE X BARBEARIA
  -- =======================================================

  insert into public.clientes_barbearias (
    cliente_id,
    barbearia_id
  )
  values (
    v_cliente_id,
    v_barbearia_id
  )
  on conflict (cliente_id, barbearia_id) do nothing;

  -- =======================================================
  -- 6. HORÁRIOS DA BARBEARIA
  -- 0 domingo ... 6 sábado
  -- =======================================================

  insert into public.horarios_funcionamento (
    barbearia_id,
    dia_semana,
    aberto,
    hora_abertura,
    hora_fechamento,
    intervalo_inicio,
    intervalo_fim
  )
  values
    (v_barbearia_id, 0, false, null, null, null, null),
    (v_barbearia_id, 1, true, '08:00', '18:00', '12:00', '13:00'),
    (v_barbearia_id, 2, true, '08:00', '18:00', '12:00', '13:00'),
    (v_barbearia_id, 3, true, '08:00', '18:00', '12:00', '13:00'),
    (v_barbearia_id, 4, true, '08:00', '18:00', '12:00', '13:00'),
    (v_barbearia_id, 5, true, '08:00', '18:00', '12:00', '13:00'),
    (v_barbearia_id, 6, true, '08:00', '14:00', null, null)
  on conflict (barbearia_id, dia_semana)
  do update set
    aberto = excluded.aberto,
    hora_abertura = excluded.hora_abertura,
    hora_fechamento = excluded.hora_fechamento,
    intervalo_inicio = excluded.intervalo_inicio,
    intervalo_fim = excluded.intervalo_fim;

  -- =======================================================
  -- 7. SERVIÇOS
  -- =======================================================

  select id into v_servico_corte
  from public.servicos
  where barbearia_id = v_barbearia_id
    and nome = 'Corte'
  limit 1;

  if v_servico_corte is null then
    insert into public.servicos (
      barbearia_id,
      nome,
      preco,
      duracao
    )
    values (
      v_barbearia_id,
      'Corte',
      30.00,
      40
    )
    returning id into v_servico_corte;
  end if;

  select id into v_servico_barba
  from public.servicos
  where barbearia_id = v_barbearia_id
    and nome = 'Barba'
  limit 1;

  if v_servico_barba is null then
    insert into public.servicos (
      barbearia_id,
      nome,
      preco,
      duracao
    )
    values (
      v_barbearia_id,
      'Barba',
      20.00,
      30
    )
    returning id into v_servico_barba;
  end if;

  select id into v_servico_combo
  from public.servicos
  where barbearia_id = v_barbearia_id
    and nome = 'Corte + Barba'
  limit 1;

  if v_servico_combo is null then
    insert into public.servicos (
      barbearia_id,
      nome,
      preco,
      duracao
    )
    values (
      v_barbearia_id,
      'Corte + Barba',
      45.00,
      60
    )
    returning id into v_servico_combo;
  end if;

  -- =======================================================
  -- 8. PROFISSIONAIS
  -- =======================================================

  select id into v_profissional_1
  from public.profissionais
  where barbearia_id = v_barbearia_id
    and nome = 'Carlos Demo'
  limit 1;

  if v_profissional_1 is null then
    insert into public.profissionais (
      barbearia_id,
      nome,
      telefone,
      ativo
    )
    values (
      v_barbearia_id,
      'Carlos Demo',
      '81999990004',
      true
    )
    returning id into v_profissional_1;
  end if;

  select id into v_profissional_2
  from public.profissionais
  where barbearia_id = v_barbearia_id
    and nome = 'Marcos Demo'
  limit 1;

  if v_profissional_2 is null then
    insert into public.profissionais (
      barbearia_id,
      nome,
      telefone,
      ativo
    )
    values (
      v_barbearia_id,
      'Marcos Demo',
      '81999990005',
      true
    )
    returning id into v_profissional_2;
  end if;

  -- =======================================================
  -- 9. HORÁRIOS DOS PROFISSIONAIS
  -- =======================================================

  insert into public.horarios_profissionais (
    profissional_id,
    dia_semana,
    aberto,
    hora_inicio,
    hora_fim,
    intervalo_inicio,
    intervalo_fim
  )
  values
    (v_profissional_1, 1, true, '08:00', '18:00', '12:00', '13:00'),
    (v_profissional_1, 2, true, '08:00', '18:00', '12:00', '13:00'),
    (v_profissional_1, 3, true, '08:00', '18:00', '12:00', '13:00'),
    (v_profissional_1, 4, true, '08:00', '18:00', '12:00', '13:00'),
    (v_profissional_1, 5, true, '08:00', '18:00', '12:00', '13:00'),
    (v_profissional_1, 6, true, '08:00', '14:00', null, null),

    (v_profissional_2, 1, true, '09:00', '17:00', '12:30', '13:30'),
    (v_profissional_2, 2, true, '09:00', '17:00', '12:30', '13:30'),
    (v_profissional_2, 3, true, '09:00', '17:00', '12:30', '13:30'),
    (v_profissional_2, 4, true, '09:00', '17:00', '12:30', '13:30'),
    (v_profissional_2, 5, true, '09:00', '17:00', '12:30', '13:30')
  on conflict (profissional_id, dia_semana)
  do update set
    aberto = excluded.aberto,
    hora_inicio = excluded.hora_inicio,
    hora_fim = excluded.hora_fim,
    intervalo_inicio = excluded.intervalo_inicio,
    intervalo_fim = excluded.intervalo_fim;

  -- =======================================================
  -- 10. PRODUTOS
  -- =======================================================

  select id into v_produto_1
  from public.produtos
  where barbearia_id = v_barbearia_id
    and nome = 'Pomada Modeladora Demo'
  limit 1;

  if v_produto_1 is null then
    insert into public.produtos (
      barbearia_id,
      nome,
      preco,
      estoque
    )
    values (
      v_barbearia_id,
      'Pomada Modeladora Demo',
      35.90,
      10
    )
    returning id into v_produto_1;
  end if;

  select id into v_produto_2
  from public.produtos
  where barbearia_id = v_barbearia_id
    and nome = 'Óleo para Barba Demo'
  limit 1;

  if v_produto_2 is null then
    insert into public.produtos (
      barbearia_id,
      nome,
      preco,
      estoque
    )
    values (
      v_barbearia_id,
      'Óleo para Barba Demo',
      29.90,
      8
    )
    returning id into v_produto_2;
  end if;

  raise notice 'Seed concluído.';
  raise notice 'Barbearia Demo: %', v_barbearia_id;
  raise notice 'Cliente Teste: %', v_cliente_id;
  raise notice 'Profissional Carlos: %', v_profissional_1;
  raise notice 'Profissional Marcos: %', v_profissional_2;
end
$$;

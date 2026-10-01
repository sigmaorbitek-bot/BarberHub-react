-- BarberHub React
-- Migration 002: índices
-- Executar após 001_base_schema.sql
-- Banco novo de desenvolvimento/homologação.

-- BARBEARIAS

create index idx_barbearias_dono_id
  on public.barbearias (dono_id);

create index idx_barbearias_nome
  on public.barbearias (nome);

-- CLIENTES

create index idx_clientes_profile_id
  on public.clientes (profile_id);

create index idx_clientes_nome
  on public.clientes (nome);

create index idx_clientes_email
  on public.clientes (email)
  where email is not null;

create index idx_clientes_telefone
  on public.clientes (telefone)
  where telefone is not null;

-- CLIENTES X BARBEARIAS
-- A PK já cobre (cliente_id, barbearia_id).
-- Este índice cobre buscas no sentido inverso: clientes de uma barbearia.

create index idx_clientes_barbearias_barbearia_id
  on public.clientes_barbearias (barbearia_id, cliente_id);

-- SERVIÇOS

create index idx_servicos_barbearia_id
  on public.servicos (barbearia_id);

create index idx_servicos_barbearia_nome
  on public.servicos (barbearia_id, nome);

-- PROFISSIONAIS

create index idx_profissionais_barbearia_id
  on public.profissionais (barbearia_id);

create index idx_profissionais_barbearia_ativo
  on public.profissionais (barbearia_id, ativo);

-- HORÁRIOS

create index idx_horarios_funcionamento_barbearia
  on public.horarios_funcionamento (barbearia_id, dia_semana);

create index idx_horarios_profissionais_profissional
  on public.horarios_profissionais (profissional_id, dia_semana);

-- PRODUTOS

create index idx_produtos_barbearia_id
  on public.produtos (barbearia_id);

create index idx_produtos_barbearia_nome
  on public.produtos (barbearia_id, nome);

create index idx_produtos_estoque_baixo
  on public.produtos (barbearia_id, estoque)
  where estoque <= 5;

-- AGENDAMENTOS

create index idx_agendamentos_barbearia_data
  on public.agendamentos (barbearia_id, data_hora);

create index idx_agendamentos_cliente_data
  on public.agendamentos (cliente_id, data_hora desc);

create index idx_agendamentos_profissional_data
  on public.agendamentos (profissional_id, data_hora)
  where profissional_id is not null;

create index idx_agendamentos_barbearia_status_data
  on public.agendamentos (barbearia_id, status, data_hora);

create index idx_agendamentos_barbearia_ativos
  on public.agendamentos (barbearia_id, data_hora)
  where arquivado = false;

create index idx_agendamentos_cliente_ativos
  on public.agendamentos (cliente_id, data_hora desc)
  where arquivado = false;

-- PEDIDOS

create index idx_pedidos_barbearia_created_at
  on public.pedidos (barbearia_id, created_at desc);

create index idx_pedidos_cliente_created_at
  on public.pedidos (cliente_id, created_at desc);

create index idx_pedidos_barbearia_status
  on public.pedidos (barbearia_id, status, created_at desc);

create index idx_pedidos_barbearia_ativos
  on public.pedidos (barbearia_id, created_at desc)
  where arquivado = false;

create index idx_pedidos_produto_id
  on public.pedidos (produto_id);

-- AVALIAÇÕES

create index idx_avaliacoes_barbearia_created_at
  on public.avaliacoes (barbearia_id, created_at desc);

create index idx_avaliacoes_cliente_created_at
  on public.avaliacoes (cliente_id, created_at desc);

-- FAVORITOS
-- A constraint UNIQUE(cliente_id, barbearia_id) já cria índice útil
-- para consulta iniciando por cliente_id.
-- Este índice cobre o sentido inverso.

create index idx_favoritos_barbearia_id
  on public.favoritos (barbearia_id, cliente_id);

-- GASTOS

create index idx_gastos_barbearia_data
  on public.gastos (barbearia_id, data_gasto desc);

create index idx_gastos_barbearia_categoria_data
  on public.gastos (barbearia_id, categoria, data_gasto desc)
  where categoria is not null;

-- NOTIFICAÇÕES

create index idx_notificacoes_usuario_created_at
  on public.notificacoes (usuario_id, created_at desc);

create index idx_notificacoes_usuario_nao_lidas
  on public.notificacoes (usuario_id, created_at desc)
  where lida = false;

create index idx_notificacoes_barbearia_created_at
  on public.notificacoes (barbearia_id, created_at desc)
  where barbearia_id is not null;

create index idx_notificacoes_referencia_id
  on public.notificacoes (referencia_id)
  where referencia_id is not null;

-- PUSH SUBSCRIPTIONS

create index idx_push_subscriptions_usuario_ativo
  on public.push_subscriptions (usuario_id, ativo);

-- PREFERÊNCIAS
-- usuario_id já possui UNIQUE e, portanto, índice próprio.

-- ÍNDICES DE APOIO

create index idx_agendamentos_servico_id
  on public.agendamentos (servico_id);

create index idx_agendamentos_profissional_id
  on public.agendamentos (profissional_id)
  where profissional_id is not null;

create index idx_avaliacoes_agendamento_id
  on public.avaliacoes (agendamento_id);

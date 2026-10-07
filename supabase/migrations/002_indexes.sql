-- BarberHub
-- Migration 002: índices
-- Executar após 001_base_schema.sql.
--
-- Índices voltados às consultas reais do sistema.
-- Evitamos índices que já são criados automaticamente
-- por PRIMARY KEY e UNIQUE.

-- BARBEARIAS

create index idx_barbearias_dono_id
  on public.barbearias (dono_id);

create index idx_barbearias_nome
  on public.barbearias (nome);


-- CLIENTES

-- profile_id já possui UNIQUE na migration 001,
-- portanto o PostgreSQL já criou um índice para essa coluna.

create index idx_clientes_nome
  on public.clientes (nome);

create index idx_clientes_email
  on public.clientes (email)
  where email is not null;

create index idx_clientes_telefone
  on public.clientes (telefone)
  where telefone is not null;


-- CLIENTES X BARBEARIAS

-- A PRIMARY KEY já cobre:
-- (cliente_id, barbearia_id)
--
-- Este índice atende o sentido inverso:
-- localizar os clientes pertencentes a uma barbearia.

create index idx_clientes_barbearias_barbearia_id
  on public.clientes_barbearias (
    barbearia_id,
    cliente_id
  );


-- SERVIÇOS

-- Este índice também atende consultas iniciadas apenas
-- por barbearia_id devido à ordem das colunas.

create index idx_servicos_barbearia_nome
  on public.servicos (
    barbearia_id,
    nome
  );


-- PROFISSIONAIS

-- Também cobre consultas apenas por barbearia_id.

create index idx_profissionais_barbearia_ativo
  on public.profissionais (
    barbearia_id,
    ativo
  );


-- HORÁRIOS

-- Não criamos índices extras aqui.
--
-- A migration 001 já possui UNIQUE:
--
-- horarios_funcionamento(barbearia_id, dia_semana)
-- horarios_profissionais(profissional_id, dia_semana)
--
-- Essas constraints já criam os índices necessários.


-- PRODUTOS

-- Também atende consultas somente por barbearia_id.

create index idx_produtos_barbearia_nome
  on public.produtos (
    barbearia_id,
    nome
  );

-- O índice de estoque baixo será criado posteriormente,
-- quando a estrutura possuir estoque_minimo.
--
-- Não utilizamos mais a antiga regra fixa:
-- estoque <= 5.


-- AGENDAMENTOS

create index idx_agendamentos_barbearia_data
  on public.agendamentos (
    barbearia_id,
    data_hora
  );

create index idx_agendamentos_cliente_data
  on public.agendamentos (
    cliente_id,
    data_hora desc
  );

create index idx_agendamentos_profissional_data
  on public.agendamentos (
    profissional_id,
    data_hora
  )
  where profissional_id is not null;

create index idx_agendamentos_barbearia_status_data
  on public.agendamentos (
    barbearia_id,
    status,
    data_hora
  );

create index idx_agendamentos_barbearia_ativos
  on public.agendamentos (
    barbearia_id,
    data_hora
  )
  where arquivado = false;

create index idx_agendamentos_cliente_ativos
  on public.agendamentos (
    cliente_id,
    data_hora desc
  )
  where arquivado = false;

create index idx_agendamentos_servico_id
  on public.agendamentos (
    servico_id
  );

-- Não criamos idx_agendamentos_profissional_id separado.
-- O índice (profissional_id, data_hora) acima já atende
-- consultas iniciadas por profissional_id.


-- PEDIDOS

create index idx_pedidos_barbearia_created_at
  on public.pedidos (
    barbearia_id,
    created_at desc
  );

create index idx_pedidos_cliente_created_at
  on public.pedidos (
    cliente_id,
    created_at desc
  );

create index idx_pedidos_barbearia_status
  on public.pedidos (
    barbearia_id,
    status,
    created_at desc
  );

create index idx_pedidos_barbearia_ativos
  on public.pedidos (
    barbearia_id,
    created_at desc
  )
  where arquivado = false;

create index idx_pedidos_produto_id
  on public.pedidos (
    produto_id
  );


-- AVALIAÇÕES

create index idx_avaliacoes_barbearia_created_at
  on public.avaliacoes (
    barbearia_id,
    created_at desc
  );

create index idx_avaliacoes_cliente_created_at
  on public.avaliacoes (
    cliente_id,
    created_at desc
  );

-- agendamento_id possui UNIQUE na migration 001.
-- Portanto já existe índice automático para essa coluna.


-- FAVORITOS

-- UNIQUE(cliente_id, barbearia_id), criado na migration 001,
-- já atende consultas iniciadas por cliente_id.
--
-- Este índice atende o sentido inverso.

create index idx_favoritos_barbearia_id
  on public.favoritos (
    barbearia_id,
    cliente_id
  );


-- GASTOS

create index idx_gastos_barbearia_data
  on public.gastos (
    barbearia_id,
    data_gasto desc
  );

create index idx_gastos_barbearia_categoria_data
  on public.gastos (
    barbearia_id,
    categoria,
    data_gasto desc
  )
  where categoria is not null;


-- NOTIFICAÇÕES

create index idx_notificacoes_usuario_created_at
  on public.notificacoes (
    usuario_id,
    created_at desc
  );

create index idx_notificacoes_usuario_nao_lidas
  on public.notificacoes (
    usuario_id,
    created_at desc
  )
  where lida = false;

create index idx_notificacoes_barbearia_created_at
  on public.notificacoes (
    barbearia_id,
    created_at desc
  )
  where barbearia_id is not null;

create index idx_notificacoes_referencia_id
  on public.notificacoes (
    referencia_id
  )
  where referencia_id is not null;


-- PUSH SUBSCRIPTIONS

-- updated_at ajuda a localizar dispositivos ativos
-- priorizando assinaturas atualizadas recentemente.
--
-- Já deixamos a definição final aqui para evitar
-- conflito com a evolução posterior do Web Push.

create index idx_push_subscriptions_usuario_ativo
  on public.push_subscriptions (
    usuario_id,
    ativo,
    updated_at desc
  );


-- PREFERÊNCIAS DE NOTIFICAÇÃO

-- usuario_id possui UNIQUE na migration 001,
-- portanto já possui índice próprio.
-- BarberHub React
-- Migration 001: esquema base
-- Banco novo de desenvolvimento/homologação.
-- Não executar no banco atual de produção.

create extension if not exists pgcrypto;

-- Perfis autenticados
create table public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  nome text,
  telefone text,
  tipo text not null default 'cliente'
    check (tipo in ('dono', 'cliente')),
  created_at timestamptz not null default now()
);

-- Barbearias
create table public.barbearias (
  id uuid primary key default gen_random_uuid(),
  dono_id uuid not null references public.profiles(id) on delete restrict,
  nome text not null,
  cidade text not null,
  endereco text,
  telefone text,
  horario_abertura time,
  horario_fechamento time,
  dias_funcionamento text[] not null default '{}',
  logo_url text,
  created_at timestamptz not null default now(),

  constraint barbearias_horario_check
    check (
      horario_abertura is null
      or horario_fechamento is null
      or horario_abertura < horario_fechamento
    )
);

-- Clientes de negócio
-- profile_id é opcional porque a barbearia pode cadastrar cliente sem conta.
create table public.clientes (
  id uuid primary key default gen_random_uuid(),
  profile_id uuid unique references public.profiles(id) on delete set null,
  nome text not null,
  telefone text,
  email text,
  created_at timestamptz not null default now()
);

-- Relação N:N entre clientes e barbearias
create table public.clientes_barbearias (
  cliente_id uuid not null references public.clientes(id) on delete cascade,
  barbearia_id uuid not null references public.barbearias(id) on delete cascade,
  created_at timestamptz not null default now(),

  primary key (cliente_id, barbearia_id)
);

-- Serviços
create table public.servicos (
  id uuid primary key default gen_random_uuid(),
  barbearia_id uuid not null references public.barbearias(id) on delete cascade,
  nome text not null,
  preco numeric(10,2) not null check (preco >= 0),
  duracao integer not null default 30 check (duracao > 0),
  created_at timestamptz not null default now()
);

-- Profissionais
create table public.profissionais (
  id uuid primary key default gen_random_uuid(),
  barbearia_id uuid not null references public.barbearias(id) on delete cascade,
  nome text not null,
  telefone text,
  foto_url text,
  ativo boolean not null default true,
  created_at timestamptz not null default now()
);

-- Horário geral da barbearia
create table public.horarios_funcionamento (
  id uuid primary key default gen_random_uuid(),
  barbearia_id uuid not null references public.barbearias(id) on delete cascade,
  dia_semana integer not null check (dia_semana between 0 and 6),
  aberto boolean not null default true,
  hora_abertura time,
  hora_fechamento time,
  intervalo_inicio time,
  intervalo_fim time,

  constraint horarios_funcionamento_dia_unique
    unique (barbearia_id, dia_semana),

  constraint horarios_funcionamento_horario_check
    check (
      not aberto
      or hora_abertura is null
      or hora_fechamento is null
      or hora_abertura < hora_fechamento
    ),

  constraint horarios_funcionamento_intervalo_check
    check (
      intervalo_inicio is null
      or intervalo_fim is null
      or intervalo_inicio < intervalo_fim
    )
);

-- Horário por profissional
create table public.horarios_profissionais (
  id uuid primary key default gen_random_uuid(),
  profissional_id uuid not null references public.profissionais(id) on delete cascade,
  dia_semana integer not null check (dia_semana between 0 and 6),
  aberto boolean not null default true,
  hora_inicio time,
  hora_fim time,
  intervalo_inicio time,
  intervalo_fim time,

  constraint horarios_profissionais_dia_unique
    unique (profissional_id, dia_semana),

  constraint horarios_profissionais_horario_check
    check (
      not aberto
      or hora_inicio is null
      or hora_fim is null
      or hora_inicio < hora_fim
    ),

  constraint horarios_profissionais_intervalo_check
    check (
      intervalo_inicio is null
      or intervalo_fim is null
      or intervalo_inicio < intervalo_fim
    )
);

-- Produtos
create table public.produtos (
  id uuid primary key default gen_random_uuid(),
  barbearia_id uuid not null references public.barbearias(id) on delete cascade,
  nome text not null,
  preco numeric(10,2) not null check (preco >= 0),
  estoque integer not null default 0 check (estoque >= 0),
  foto_url text,
  created_at timestamptz not null default now()
);

-- Agendamentos
create table public.agendamentos (
  id uuid primary key default gen_random_uuid(),
  barbearia_id uuid not null references public.barbearias(id) on delete cascade,
  cliente_id uuid not null references public.clientes(id) on delete restrict,
  servico_id uuid not null references public.servicos(id) on delete restrict,
  profissional_id uuid references public.profissionais(id) on delete set null,
  data_hora timestamptz not null,
  status text not null default 'pendente'
    check (status in ('pendente', 'confirmado', 'concluido', 'cancelado')),
  cliente_nome text,
  cliente_telefone text,
  arquivado boolean not null default false,
  arquivado_at timestamptz,
  created_at timestamptz not null default now()
);

-- Pedidos
-- cliente_id agora referencia public.clientes, e não profiles.
create table public.pedidos (
  id uuid primary key default gen_random_uuid(),
  produto_id uuid not null references public.produtos(id) on delete restrict,
  cliente_id uuid not null references public.clientes(id) on delete restrict,
  barbearia_id uuid not null references public.barbearias(id) on delete cascade,
  quantidade integer not null default 1 check (quantidade > 0),
  status text not null default 'pendente'
    check (status in ('pendente', 'confirmado', 'concluido', 'cancelado')),
  preco_unitario numeric(10,2) not null default 0 check (preco_unitario >= 0),
  origem_pedido text not null default 'online'
    check (origem_pedido in ('online', 'presencial')),
  arquivado boolean not null default false,
  atualizado_at timestamptz not null default now(),
  confirmado_at timestamptz,
  concluido_at timestamptz,
  arquivado_at timestamptz,
  created_at timestamptz not null default now()
);

-- Avaliações
-- Uma avaliação por agendamento.
create table public.avaliacoes (
  id uuid primary key default gen_random_uuid(),
  cliente_id uuid not null references public.clientes(id) on delete restrict,
  barbearia_id uuid not null references public.barbearias(id) on delete cascade,
  agendamento_id uuid not null unique references public.agendamentos(id) on delete cascade,
  nota integer not null check (nota between 1 and 5),
  comentario text,
  created_at timestamptz not null default now()
);

-- Favoritos
create table public.favoritos (
  id uuid primary key default gen_random_uuid(),
  cliente_id uuid not null references public.clientes(id) on delete cascade,
  barbearia_id uuid not null references public.barbearias(id) on delete cascade,
  created_at timestamptz not null default now(),

  constraint favoritos_cliente_barbearia_unique
    unique (cliente_id, barbearia_id)
);

-- Gastos
create table public.gastos (
  id uuid primary key default gen_random_uuid(),
  barbearia_id uuid not null references public.barbearias(id) on delete cascade,
  descricao text not null,
  valor numeric(10,2) not null check (valor >= 0),
  categoria text,
  data_gasto date not null,
  pagamento text,
  observacao text,
  created_at timestamptz not null default now()
);

-- Notificações
-- usuario_id representa a conta autenticada destinatária.
create table public.notificacoes (
  id uuid primary key default gen_random_uuid(),
  usuario_id uuid not null references public.profiles(id) on delete cascade,
  barbearia_id uuid references public.barbearias(id) on delete cascade,
  tipo text,
  titulo text not null,
  mensagem text not null,
  referencia_id uuid,
  lida boolean not null default false,
  created_at timestamptz not null default now()
);

-- Dispositivos Web Push
create table public.push_subscriptions (
  id uuid primary key default gen_random_uuid(),
  usuario_id uuid not null references auth.users(id) on delete cascade,
  endpoint text not null unique,
  p256dh text not null,
  auth_key text not null,
  user_agent text,
  ativo boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- Preferências de notificações
create table public.preferencias_notificacoes (
  id uuid primary key default gen_random_uuid(),
  usuario_id uuid not null unique references auth.users(id) on delete cascade,
  novo_agendamento boolean not null default true,
  agendamento_cancelado boolean not null default true,
  agendamento_alterado boolean not null default true,
  agendamento_confirmado boolean not null default true,
  lembrete_agendamento boolean not null default true,
  novo_pedido boolean not null default true,
  pedido_atualizado boolean not null default true,
  estoque_baixo boolean not null default true,
  nova_avaliacao boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

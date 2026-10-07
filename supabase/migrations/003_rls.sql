-- BarberHub
-- Migration 003: Row Level Security (RLS)
-- Executar após 001_base_schema.sql e 002_indexes.sql.
--
-- Objetivos:
-- 1. Cliente autenticado acessa somente seus dados privados.
-- 2. Dono administra somente dados das próprias barbearias.
-- 3. Catálogo necessário ao usuário autenticado pode ser consultado.
-- 4. Operações sensíveis serão realizadas por RPCs controladas.
-- 5. O papel da conta (profiles.tipo) nunca pode ser alterado
--    diretamente pelo cliente/frontend.

-- =========================================================
-- 1. FUNÇÕES AUXILIARES DE AUTORIZAÇÃO
-- =========================================================

create or replace function public.eh_dono()
returns boolean
language sql
stable
security definer
set search_path = public, auth
as $$
  select exists (
    select 1
    from public.profiles p
    where p.id = auth.uid()
      and p.tipo = 'dono'
  );
$$;

create or replace function public.eh_dono_da_barbearia(
  p_barbearia_id uuid
)
returns boolean
language sql
stable
security definer
set search_path = public, auth
as $$
  select exists (
    select 1
    from public.barbearias b
    where b.id = p_barbearia_id
      and b.dono_id = auth.uid()
  );
$$;

create or replace function public.cliente_atual_id()
returns uuid
language sql
stable
security definer
set search_path = public, auth
as $$
  select c.id
  from public.clientes c
  where c.profile_id = auth.uid()
  limit 1;
$$;

create or replace function public.eh_cliente_atual(
  p_cliente_id uuid
)
returns boolean
language sql
stable
security definer
set search_path = public, auth
as $$
  select exists (
    select 1
    from public.clientes c
    where c.id = p_cliente_id
      and c.profile_id = auth.uid()
  );
$$;

create or replace function public.servico_pertence_barbearia(
  p_servico_id uuid,
  p_barbearia_id uuid
)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.servicos s
    where s.id = p_servico_id
      and s.barbearia_id = p_barbearia_id
  );
$$;

create or replace function public.profissional_pertence_barbearia(
  p_profissional_id uuid,
  p_barbearia_id uuid
)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select
    p_profissional_id is null
    or exists (
      select 1
      from public.profissionais p
      where p.id = p_profissional_id
        and p.barbearia_id = p_barbearia_id
    );
$$;

create or replace function public.produto_pertence_barbearia(
  p_produto_id uuid,
  p_barbearia_id uuid
)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.produtos p
    where p.id = p_produto_id
      and p.barbearia_id = p_barbearia_id
  );
$$;


-- =========================================================
-- 2. PROTEGER FUNÇÕES AUXILIARES
-- =========================================================

revoke all
on function public.eh_dono()
from public;

revoke all
on function public.eh_dono_da_barbearia(uuid)
from public;

revoke all
on function public.cliente_atual_id()
from public;

revoke all
on function public.eh_cliente_atual(uuid)
from public;

revoke all
on function public.servico_pertence_barbearia(uuid, uuid)
from public;

revoke all
on function public.profissional_pertence_barbearia(uuid, uuid)
from public;

revoke all
on function public.produto_pertence_barbearia(uuid, uuid)
from public;


grant execute
on function public.eh_dono()
to authenticated;

grant execute
on function public.eh_dono_da_barbearia(uuid)
to authenticated;

grant execute
on function public.cliente_atual_id()
to authenticated;

grant execute
on function public.eh_cliente_atual(uuid)
to authenticated;

grant execute
on function public.servico_pertence_barbearia(uuid, uuid)
to authenticated;

grant execute
on function public.profissional_pertence_barbearia(uuid, uuid)
to authenticated;

grant execute
on function public.produto_pertence_barbearia(uuid, uuid)
to authenticated;


-- =========================================================
-- 3. HABILITAR RLS
-- =========================================================

alter table public.profiles
  enable row level security;

alter table public.barbearias
  enable row level security;

alter table public.clientes
  enable row level security;

alter table public.clientes_barbearias
  enable row level security;

alter table public.servicos
  enable row level security;

alter table public.profissionais
  enable row level security;

alter table public.horarios_funcionamento
  enable row level security;

alter table public.horarios_profissionais
  enable row level security;

alter table public.produtos
  enable row level security;

alter table public.agendamentos
  enable row level security;

alter table public.pedidos
  enable row level security;

alter table public.avaliacoes
  enable row level security;

alter table public.favoritos
  enable row level security;

alter table public.gastos
  enable row level security;

alter table public.notificacoes
  enable row level security;

alter table public.push_subscriptions
  enable row level security;

alter table public.preferencias_notificacoes
  enable row level security;


-- =========================================================
-- 4. PROFILES
-- =========================================================
--
-- Cada usuário pode visualizar o próprio perfil.
--
-- UPDATE direto é permitido somente nas colunas liberadas
-- pelos GRANTs no final desta migration.
--
-- profiles.tipo NÃO será concedido ao usuário autenticado.
-- Mudança de papel será realizada futuramente por fluxo seguro.

create policy "profiles_select_proprio"
on public.profiles
for select
to authenticated
using (
  id = auth.uid()
);

create policy "profiles_update_proprio"
on public.profiles
for update
to authenticated
using (
  id = auth.uid()
)
with check (
  id = auth.uid()
);


-- =========================================================
-- 5. BARBEARIAS
-- =========================================================

create policy "barbearias_select_autenticado"
on public.barbearias
for select
to authenticated
using (
  true
);

create policy "barbearias_insert_dono"
on public.barbearias
for insert
to authenticated
with check (
  dono_id = auth.uid()
  and public.eh_dono()
);

create policy "barbearias_update_dono"
on public.barbearias
for update
to authenticated
using (
  public.eh_dono_da_barbearia(id)
)
with check (
  dono_id = auth.uid()
  and public.eh_dono()
);

create policy "barbearias_delete_dono"
on public.barbearias
for delete
to authenticated
using (
  public.eh_dono_da_barbearia(id)
);


-- =========================================================
-- 6. CLIENTES
-- =========================================================

create policy "clientes_select_proprio"
on public.clientes
for select
to authenticated
using (
  profile_id = auth.uid()
);

create policy "clientes_select_dono_vinculado"
on public.clientes
for select
to authenticated
using (
  exists (
    select 1
    from public.clientes_barbearias cb
    where cb.cliente_id = clientes.id
      and public.eh_dono_da_barbearia(cb.barbearia_id)
  )
);

create policy "clientes_insert_proprio"
on public.clientes
for insert
to authenticated
with check (
  profile_id = auth.uid()
);

create policy "clientes_insert_manual_dono"
on public.clientes
for insert
to authenticated
with check (
  profile_id is null
  and public.eh_dono()
);

create policy "clientes_update_proprio"
on public.clientes
for update
to authenticated
using (
  profile_id = auth.uid()
)
with check (
  profile_id = auth.uid()
);

create policy "clientes_update_dono_vinculado"
on public.clientes
for update
to authenticated
using (
  exists (
    select 1
    from public.clientes_barbearias cb
    where cb.cliente_id = clientes.id
      and public.eh_dono_da_barbearia(cb.barbearia_id)
  )
)
with check (
  profile_id is null
  or profile_id = (
    select c.profile_id
    from public.clientes c
    where c.id = clientes.id
  )
);

-- Não existe DELETE direto de clientes.
-- Exclusão/anonimização será tratada por fluxo específico.


-- =========================================================
-- 7. CLIENTES X BARBEARIAS
-- =========================================================

create policy "clientes_barbearias_select_cliente"
on public.clientes_barbearias
for select
to authenticated
using (
  public.eh_cliente_atual(cliente_id)
);

create policy "clientes_barbearias_select_dono"
on public.clientes_barbearias
for select
to authenticated
using (
  public.eh_dono_da_barbearia(barbearia_id)
);

create policy "clientes_barbearias_insert_cliente"
on public.clientes_barbearias
for insert
to authenticated
with check (
  public.eh_cliente_atual(cliente_id)
);

create policy "clientes_barbearias_insert_dono"
on public.clientes_barbearias
for insert
to authenticated
with check (
  public.eh_dono_da_barbearia(barbearia_id)
);

create policy "clientes_barbearias_delete_dono"
on public.clientes_barbearias
for delete
to authenticated
using (
  public.eh_dono_da_barbearia(barbearia_id)
);


-- =========================================================
-- 8. SERVIÇOS
-- =========================================================

create policy "servicos_select_autenticado"
on public.servicos
for select
to authenticated
using (
  true
);

create policy "servicos_insert_dono"
on public.servicos
for insert
to authenticated
with check (
  public.eh_dono_da_barbearia(barbearia_id)
);

create policy "servicos_update_dono"
on public.servicos
for update
to authenticated
using (
  public.eh_dono_da_barbearia(barbearia_id)
)
with check (
  public.eh_dono_da_barbearia(barbearia_id)
);

create policy "servicos_delete_dono"
on public.servicos
for delete
to authenticated
using (
  public.eh_dono_da_barbearia(barbearia_id)
);


-- =========================================================
-- 9. PROFISSIONAIS
-- =========================================================

create policy "profissionais_select_autenticado"
on public.profissionais
for select
to authenticated
using (
  true
);

create policy "profissionais_insert_dono"
on public.profissionais
for insert
to authenticated
with check (
  public.eh_dono_da_barbearia(barbearia_id)
);

create policy "profissionais_update_dono"
on public.profissionais
for update
to authenticated
using (
  public.eh_dono_da_barbearia(barbearia_id)
)
with check (
  public.eh_dono_da_barbearia(barbearia_id)
);

create policy "profissionais_delete_dono"
on public.profissionais
for delete
to authenticated
using (
  public.eh_dono_da_barbearia(barbearia_id)
);


-- =========================================================
-- 10. HORÁRIOS DA BARBEARIA
-- =========================================================

create policy "horarios_funcionamento_select_autenticado"
on public.horarios_funcionamento
for select
to authenticated
using (
  true
);

create policy "horarios_funcionamento_insert_dono"
on public.horarios_funcionamento
for insert
to authenticated
with check (
  public.eh_dono_da_barbearia(barbearia_id)
);

create policy "horarios_funcionamento_update_dono"
on public.horarios_funcionamento
for update
to authenticated
using (
  public.eh_dono_da_barbearia(barbearia_id)
)
with check (
  public.eh_dono_da_barbearia(barbearia_id)
);

create policy "horarios_funcionamento_delete_dono"
on public.horarios_funcionamento
for delete
to authenticated
using (
  public.eh_dono_da_barbearia(barbearia_id)
);


-- =========================================================
-- 11. HORÁRIOS DOS PROFISSIONAIS
-- =========================================================

create policy "horarios_profissionais_select_autenticado"
on public.horarios_profissionais
for select
to authenticated
using (
  true
);

create policy "horarios_profissionais_insert_dono"
on public.horarios_profissionais
for insert
to authenticated
with check (
  exists (
    select 1
    from public.profissionais p
    where p.id = horarios_profissionais.profissional_id
      and public.eh_dono_da_barbearia(p.barbearia_id)
  )
);

create policy "horarios_profissionais_update_dono"
on public.horarios_profissionais
for update
to authenticated
using (
  exists (
    select 1
    from public.profissionais p
    where p.id = horarios_profissionais.profissional_id
      and public.eh_dono_da_barbearia(p.barbearia_id)
  )
)
with check (
  exists (
    select 1
    from public.profissionais p
    where p.id = horarios_profissionais.profissional_id
      and public.eh_dono_da_barbearia(p.barbearia_id)
  )
);

create policy "horarios_profissionais_delete_dono"
on public.horarios_profissionais
for delete
to authenticated
using (
  exists (
    select 1
    from public.profissionais p
    where p.id = horarios_profissionais.profissional_id
      and public.eh_dono_da_barbearia(p.barbearia_id)
  )
);


-- =========================================================
-- 12. PRODUTOS
-- =========================================================

create policy "produtos_select_autenticado"
on public.produtos
for select
to authenticated
using (
  true
);

create policy "produtos_insert_dono"
on public.produtos
for insert
to authenticated
with check (
  public.eh_dono_da_barbearia(barbearia_id)
);

create policy "produtos_update_dono"
on public.produtos
for update
to authenticated
using (
  public.eh_dono_da_barbearia(barbearia_id)
)
with check (
  public.eh_dono_da_barbearia(barbearia_id)
);

create policy "produtos_delete_dono"
on public.produtos
for delete
to authenticated
using (
  public.eh_dono_da_barbearia(barbearia_id)
);


-- =========================================================
-- 13. AGENDAMENTOS
-- =========================================================

create policy "agendamentos_select_cliente"
on public.agendamentos
for select
to authenticated
using (
  public.eh_cliente_atual(cliente_id)
);

create policy "agendamentos_select_dono"
on public.agendamentos
for select
to authenticated
using (
  public.eh_dono_da_barbearia(barbearia_id)
);

create policy "agendamentos_insert_cliente"
on public.agendamentos
for insert
to authenticated
with check (
  public.eh_cliente_atual(cliente_id)
  and status = 'pendente'
  and arquivado = false
  and public.servico_pertence_barbearia(
    servico_id,
    barbearia_id
  )
  and public.profissional_pertence_barbearia(
    profissional_id,
    barbearia_id
  )
);

create policy "agendamentos_insert_dono"
on public.agendamentos
for insert
to authenticated
with check (
  public.eh_dono_da_barbearia(barbearia_id)
  and status = 'pendente'
  and arquivado = false
  and public.servico_pertence_barbearia(
    servico_id,
    barbearia_id
  )
  and public.profissional_pertence_barbearia(
    profissional_id,
    barbearia_id
  )
);

create policy "agendamentos_update_dono"
on public.agendamentos
for update
to authenticated
using (
  public.eh_dono_da_barbearia(barbearia_id)
)
with check (
  public.eh_dono_da_barbearia(barbearia_id)
  and public.servico_pertence_barbearia(
    servico_id,
    barbearia_id
  )
  and public.profissional_pertence_barbearia(
    profissional_id,
    barbearia_id
  )
);

-- Sem DELETE direto em agendamentos.


-- =========================================================
-- 14. PEDIDOS
-- =========================================================

create policy "pedidos_select_cliente"
on public.pedidos
for select
to authenticated
using (
  public.eh_cliente_atual(cliente_id)
);

create policy "pedidos_select_dono"
on public.pedidos
for select
to authenticated
using (
  public.eh_dono_da_barbearia(barbearia_id)
);

create policy "pedidos_update_dono"
on public.pedidos
for update
to authenticated
using (
  public.eh_dono_da_barbearia(barbearia_id)
)
with check (
  public.eh_dono_da_barbearia(barbearia_id)
  and public.produto_pertence_barbearia(
    produto_id,
    barbearia_id
  )
);

-- INSERT será feito por RPC segura.
-- Não existe DELETE direto em pedidos.


-- =========================================================
-- 15. AVALIAÇÕES
-- =========================================================

create policy "avaliacoes_select_autenticado"
on public.avaliacoes
for select
to authenticated
using (
  true
);

create policy "avaliacoes_insert_cliente"
on public.avaliacoes
for insert
to authenticated
with check (
  public.eh_cliente_atual(cliente_id)
  and exists (
    select 1
    from public.agendamentos a
    where a.id = avaliacoes.agendamento_id
      and a.cliente_id = avaliacoes.cliente_id
      and a.barbearia_id = avaliacoes.barbearia_id
      and a.status = 'concluido'
  )
);

-- Sem UPDATE/DELETE direto nesta etapa.


-- =========================================================
-- 16. FAVORITOS
-- =========================================================

create policy "favoritos_select_cliente"
on public.favoritos
for select
to authenticated
using (
  public.eh_cliente_atual(cliente_id)
);

create policy "favoritos_insert_cliente"
on public.favoritos
for insert
to authenticated
with check (
  public.eh_cliente_atual(cliente_id)
);

create policy "favoritos_delete_cliente"
on public.favoritos
for delete
to authenticated
using (
  public.eh_cliente_atual(cliente_id)
);


-- =========================================================
-- 17. GASTOS
-- =========================================================

create policy "gastos_select_dono"
on public.gastos
for select
to authenticated
using (
  public.eh_dono_da_barbearia(barbearia_id)
);

create policy "gastos_insert_dono"
on public.gastos
for insert
to authenticated
with check (
  public.eh_dono_da_barbearia(barbearia_id)
);

create policy "gastos_update_dono"
on public.gastos
for update
to authenticated
using (
  public.eh_dono_da_barbearia(barbearia_id)
)
with check (
  public.eh_dono_da_barbearia(barbearia_id)
);

create policy "gastos_delete_dono"
on public.gastos
for delete
to authenticated
using (
  public.eh_dono_da_barbearia(barbearia_id)
);


-- =========================================================
-- 18. NOTIFICAÇÕES
-- =========================================================

create policy "notificacoes_select_proprio"
on public.notificacoes
for select
to authenticated
using (
  usuario_id = auth.uid()
);

create policy "notificacoes_update_proprio"
on public.notificacoes
for update
to authenticated
using (
  usuario_id = auth.uid()
)
with check (
  usuario_id = auth.uid()
);

create policy "notificacoes_delete_proprio"
on public.notificacoes
for delete
to authenticated
using (
  usuario_id = auth.uid()
);

-- INSERT fica reservado ao backend/RPCs controladas.


-- =========================================================
-- 19. PUSH SUBSCRIPTIONS
-- =========================================================

create policy "push_subscriptions_select_proprio"
on public.push_subscriptions
for select
to authenticated
using (
  usuario_id = auth.uid()
);

create policy "push_subscriptions_insert_proprio"
on public.push_subscriptions
for insert
to authenticated
with check (
  usuario_id = auth.uid()
);

create policy "push_subscriptions_update_proprio"
on public.push_subscriptions
for update
to authenticated
using (
  usuario_id = auth.uid()
)
with check (
  usuario_id = auth.uid()
);

create policy "push_subscriptions_delete_proprio"
on public.push_subscriptions
for delete
to authenticated
using (
  usuario_id = auth.uid()
);


-- =========================================================
-- 20. PREFERÊNCIAS DE NOTIFICAÇÕES
-- =========================================================

create policy "preferencias_select_proprio"
on public.preferencias_notificacoes
for select
to authenticated
using (
  usuario_id = auth.uid()
);

create policy "preferencias_insert_proprio"
on public.preferencias_notificacoes
for insert
to authenticated
with check (
  usuario_id = auth.uid()
);

create policy "preferencias_update_proprio"
on public.preferencias_notificacoes
for update
to authenticated
using (
  usuario_id = auth.uid()
)
with check (
  usuario_id = auth.uid()
);

create policy "preferencias_delete_proprio"
on public.preferencias_notificacoes
for delete
to authenticated
using (
  usuario_id = auth.uid()
);


-- =========================================================
-- 21. PRIVILÉGIOS
-- =========================================================
--
-- Nenhuma tabela do BarberHub é exposta diretamente
-- para anon nesta etapa.
--
-- RLS e GRANT trabalham juntos:
-- GRANT define qual operação o papel pode tentar.
-- RLS define quais linhas ele pode acessar.

revoke all
on table public.profiles
from anon;

revoke all
on table public.barbearias
from anon;

revoke all
on table public.clientes
from anon;

revoke all
on table public.clientes_barbearias
from anon;

revoke all
on table public.servicos
from anon;

revoke all
on table public.profissionais
from anon;

revoke all
on table public.horarios_funcionamento
from anon;

revoke all
on table public.horarios_profissionais
from anon;

revoke all
on table public.produtos
from anon;

revoke all
on table public.agendamentos
from anon;

revoke all
on table public.pedidos
from anon;

revoke all
on table public.avaliacoes
from anon;

revoke all
on table public.favoritos
from anon;

revoke all
on table public.gastos
from anon;

revoke all
on table public.notificacoes
from anon;

revoke all
on table public.push_subscriptions
from anon;

revoke all
on table public.preferencias_notificacoes
from anon;


-- =========================================================
-- PROFILES
-- =========================================================
--
-- Não concedemos INSERT ou DELETE direto.
--
-- O perfil será criado pelo trigger de autenticação.
-- A exclusão será realizada pelo fluxo seguro de
-- exclusão de conta.
--
-- UPDATE fica limitado a nome e telefone.
-- O frontend NÃO recebe permissão para alterar "tipo".

revoke all
on table public.profiles
from authenticated;

grant select
on table public.profiles
to authenticated;

grant update (nome, telefone)
on table public.profiles
to authenticated;


-- =========================================================
-- DEMAIS TABELAS
-- =========================================================

grant select, insert, update, delete
on table public.barbearias
to authenticated;

grant select, insert, update, delete
on table public.clientes
to authenticated;

grant select, insert, update, delete
on table public.clientes_barbearias
to authenticated;

grant select, insert, update, delete
on table public.servicos
to authenticated;

grant select, insert, update, delete
on table public.profissionais
to authenticated;

grant select, insert, update, delete
on table public.horarios_funcionamento
to authenticated;

grant select, insert, update, delete
on table public.horarios_profissionais
to authenticated;

grant select, insert, update, delete
on table public.produtos
to authenticated;

grant select, insert, update, delete
on table public.agendamentos
to authenticated;

grant select, insert, update, delete
on table public.pedidos
to authenticated;

grant select, insert, update, delete
on table public.avaliacoes
to authenticated;

grant select, insert, update, delete
on table public.favoritos
to authenticated;

grant select, insert, update, delete
on table public.gastos
to authenticated;

grant select, insert, update, delete
on table public.notificacoes
to authenticated;

grant select, insert, update, delete
on table public.push_subscriptions
to authenticated;

grant select, insert, update, delete
on table public.preferencias_notificacoes
to authenticated;
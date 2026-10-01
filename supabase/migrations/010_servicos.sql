-- BarberHub React
-- Migration 010: módulo de serviços
-- Executar após 009_agendamentos.sql.

alter table public.servicos
add column if not exists ativo boolean not null default true;

create index if not exists idx_servicos_barbearia_ativos
on public.servicos (barbearia_id, nome)
where ativo = true;

-- BarberHub React
-- Migration 017 corrigida: contexto visual do painel profissional
-- Executar após 016_area_profissional.sql.

drop function if exists public.obter_contexto_profissional();

create function public.obter_contexto_profissional()
returns table (
  profissional_id uuid,
  barbearia_id uuid,
  profissional_nome text,
  profissional_foto_url text,
  barbearia_nome text,
  email_acesso text,
  primeiro_acesso_pendente boolean,
  comissao_percentual numeric,
  ver_agendamentos boolean,
  alterar_status boolean,
  ver_cliente_telefone boolean,
  ver_financeiro boolean,
  ver_comissao boolean,
  ver_agenda_equipe boolean,
  ver_clientes boolean,
  ver_produtos boolean
)
language sql
security definer
set search_path = public, auth
as $$
  select
    p.id,
    p.barbearia_id,
    p.nome,
    p.foto_url,
    b.nome,
    p.email_acesso,
    p.primeiro_acesso_pendente,
    p.comissao_percentual,
    coalesce(pp.ver_agendamentos, true),
    coalesce(pp.alterar_status, true),
    coalesce(pp.ver_cliente_telefone, true),
    coalesce(pp.ver_financeiro, false),
    coalesce(pp.ver_comissao, false),
    coalesce(pp.ver_agenda_equipe, false),
    coalesce(pp.ver_clientes, false),
    coalesce(pp.ver_produtos, false)
  from public.profissionais p
  join public.barbearias b
    on b.id = p.barbearia_id
  left join public.permissoes_profissionais pp
    on pp.profissional_id = p.id
  where p.usuario_id = auth.uid()
    and p.ativo = true
  limit 1;
$$;

revoke all on function public.obter_contexto_profissional()
from public;

grant execute on function public.obter_contexto_profissional()
to authenticated;

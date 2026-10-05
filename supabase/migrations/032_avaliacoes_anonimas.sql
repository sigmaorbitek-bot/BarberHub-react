-- BarberHub React
-- Migration 032: anonimizar nome do cliente nas avaliações do painel
-- Mantém nota, comentário, data, serviço, profissional, resposta e demais dados.
-- Altera apenas:
-- 1) nome exibido ao dono nas avaliações -> "Cliente BarberHub"
-- 2) mensagem de nova avaliação -> sem nome do cliente

create or replace function public.listar_avaliacoes_painel(
  p_barbearia_id uuid
)
returns table (
  avaliacao_id uuid,
  nota integer,
  comentario text,
  resposta_barbearia text,
  respondida_at timestamptz,
  created_at timestamptz,
  cliente_id uuid,
  cliente_nome text,
  cliente_telefone text,
  agendamento_id uuid,
  data_atendimento timestamptz,
  servico_nome text,
  profissional_nome text
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
    av.id,
    av.nota,
    av.comentario,
    av.resposta_barbearia,
    av.respondida_at,
    av.created_at,
    c.id,
    'Cliente BarberHub'::text,
    coalesce(
      nullif(trim(cb.telefone_local), ''),
      c.telefone
    )::text,
    a.id,
    a.data_hora,
    s.nome::text,
    coalesce(
      p.nome,
      'Não informado'
    )::text
  from public.avaliacoes av
  join public.clientes c
    on c.id = av.cliente_id
  join public.agendamentos a
    on a.id = av.agendamento_id
  join public.servicos s
    on s.id = a.servico_id
  left join public.profissionais p
    on p.id = a.profissional_id
  left join public.clientes_barbearias cb
    on cb.cliente_id = av.cliente_id
    and cb.barbearia_id = av.barbearia_id
  where av.barbearia_id = p_barbearia_id
  order by av.created_at desc;
end;
$$;

revoke all on function public.listar_avaliacoes_painel(uuid)
from public;

grant execute on function public.listar_avaliacoes_painel(uuid)
to authenticated;


create or replace function public.notificar_dono_avaliacao_insert()
returns trigger
language plpgsql
security definer
set search_path = public, auth
as $$
begin
  perform public.criar_notificacao_dono(
    new.barbearia_id,
    'nova_avaliacao',
    '⭐ Nova avaliação',
    'Sua barbearia recebeu uma avaliação de '
      || new.nota::text
      || case
        when new.nota = 1 then ' estrela.'
        else ' estrelas.'
      end,
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

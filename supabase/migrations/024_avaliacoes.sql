-- BarberHub React
-- Migration 024: módulo de avaliações
-- Executar após 023_financeiro_detalhado.sql.

alter table public.avaliacoes
add column if not exists resposta_barbearia text;

alter table public.avaliacoes
add column if not exists respondida_at timestamptz;

create index if not exists idx_avaliacoes_barbearia_created_at
on public.avaliacoes (
  barbearia_id,
  created_at desc
);

create index if not exists idx_avaliacoes_barbearia_nota
on public.avaliacoes (
  barbearia_id,
  nota,
  created_at desc
);


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
    coalesce(
      nullif(trim(cb.nome_local), ''),
      c.nome,
      'Cliente'
    )::text,
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


create or replace function public.responder_avaliacao_painel(
  p_barbearia_id uuid,
  p_avaliacao_id uuid,
  p_resposta text
)
returns void
language plpgsql
security definer
set search_path = public, auth
as $$
declare
  v_resposta text;
begin
  if auth.uid() is null then
    raise exception 'Usuário não autenticado.';
  end if;

  if not public.eh_dono_da_barbearia(
    p_barbearia_id
  ) then
    raise exception 'Você não possui acesso a esta barbearia.';
  end if;

  v_resposta :=
    nullif(
      trim(
        coalesce(
          p_resposta,
          ''
        )
      ),
      ''
    );

  if v_resposta is not null
    and char_length(v_resposta) > 1000 then
    raise exception 'A resposta deve ter no máximo 1000 caracteres.';
  end if;

  update public.avaliacoes
  set
    resposta_barbearia = v_resposta,
    respondida_at =
      case
        when v_resposta is null then null
        else now()
      end
  where id = p_avaliacao_id
    and barbearia_id = p_barbearia_id;

  if not found then
    raise exception 'Avaliação não encontrada.';
  end if;
end;
$$;

revoke all on function public.responder_avaliacao_painel(
  uuid,
  uuid,
  text
) from public;

grant execute on function public.responder_avaliacao_painel(
  uuid,
  uuid,
  text
) to authenticated;


create or replace function public.enviar_avaliacao_cliente(
  p_agendamento_id uuid,
  p_nota integer,
  p_comentario text default null
)
returns uuid
language plpgsql
security definer
set search_path = public, auth
as $$
declare
  v_cliente_id uuid;
  v_agendamento public.agendamentos%rowtype;
  v_id uuid;
  v_comentario text;
begin
  if auth.uid() is null then
    raise exception 'Usuário não autenticado.';
  end if;

  if p_nota is null
    or p_nota < 1
    or p_nota > 5 then
    raise exception 'A nota deve estar entre 1 e 5.';
  end if;

  v_cliente_id :=
    public.cliente_atual_id();

  if v_cliente_id is null then
    raise exception 'A conta autenticada não possui cadastro de cliente.';
  end if;

  select *
  into v_agendamento
  from public.agendamentos a
  where a.id = p_agendamento_id
    and a.cliente_id = v_cliente_id
    and a.status = 'concluido';

  if not found then
    raise exception 'Somente atendimentos concluídos podem ser avaliados.';
  end if;

  if exists (
    select 1
    from public.avaliacoes av
    where av.agendamento_id = p_agendamento_id
  ) then
    raise exception 'Este atendimento já possui uma avaliação.';
  end if;

  v_comentario :=
    nullif(
      trim(
        coalesce(
          p_comentario,
          ''
        )
      ),
      ''
    );

  if v_comentario is not null
    and char_length(v_comentario) > 500 then
    raise exception 'O comentário deve ter no máximo 500 caracteres.';
  end if;

  insert into public.avaliacoes (
    cliente_id,
    barbearia_id,
    agendamento_id,
    nota,
    comentario
  )
  values (
    v_cliente_id,
    v_agendamento.barbearia_id,
    v_agendamento.id,
    p_nota,
    v_comentario
  )
  returning id
  into v_id;

  return v_id;
end;
$$;

revoke all on function public.enviar_avaliacao_cliente(
  uuid,
  integer,
  text
) from public;

grant execute on function public.enviar_avaliacao_cliente(
  uuid,
  integer,
  text
) to authenticated;

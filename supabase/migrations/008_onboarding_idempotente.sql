-- BarberHub React
-- Migration 008: onboarding idempotente
-- Executar após 007_onboarding.sql.

alter table public.barbearias
add column if not exists chave_criacao uuid;

create unique index if not exists uq_barbearias_chave_criacao
on public.barbearias (chave_criacao)
where chave_criacao is not null;

drop function if exists public.criar_barbearia_com_horarios(
  text, text, text, text, time, time, integer[]
);

create or replace function public.criar_barbearia_com_horarios(
  p_nome text,
  p_cidade text,
  p_endereco text default null,
  p_telefone text default null,
  p_horario_abertura time default null,
  p_horario_fechamento time default null,
  p_dias integer[] default '{}'::integer[],
  p_chave_criacao uuid default null
)
returns public.barbearias
language plpgsql
security definer
set search_path = public, auth
as $$
declare
  v_barbearia public.barbearias%rowtype;
  v_dias integer[] := coalesce(p_dias, '{}'::integer[]);
  v_dias_texto text[];
  v_chave uuid := coalesce(p_chave_criacao, gen_random_uuid());
begin
  if auth.uid() is null then
    raise exception 'Usuário não autenticado.';
  end if;

  if not exists (
    select 1
    from public.profiles p
    where p.id = auth.uid()
      and p.tipo = 'dono'
  ) then
    raise exception 'A conta autenticada não é uma conta de barbearia.';
  end if;

  if nullif(trim(p_nome), '') is null then
    raise exception 'Digite o nome da barbearia.';
  end if;

  if nullif(trim(p_cidade), '') is null then
    raise exception 'Digite a cidade.';
  end if;

  if exists (
    select 1
    from unnest(v_dias) as d
    where d < 0 or d > 6
  ) then
    raise exception 'Dia de funcionamento inválido.';
  end if;

  select coalesce(array_agg(distinct d order by d), '{}'::integer[])
  into v_dias
  from unnest(v_dias) as d;

  if cardinality(v_dias) > 0 then
    if p_horario_abertura is null or p_horario_fechamento is null then
      raise exception 'Informe os horários de abertura e fechamento.';
    end if;

    if p_horario_abertura >= p_horario_fechamento then
      raise exception 'O horário de fechamento precisa ser depois da abertura.';
    end if;
  elsif p_horario_abertura is not null or p_horario_fechamento is not null then
    raise exception 'Selecione pelo menos um dia de funcionamento.';
  end if;

  select coalesce(
    array_agg(
      case d
        when 0 then 'dom'
        when 1 then 'seg'
        when 2 then 'ter'
        when 3 then 'qua'
        when 4 then 'qui'
        when 5 then 'sex'
        when 6 then 'sab'
      end
      order by d
    ),
    '{}'::text[]
  )
  into v_dias_texto
  from unnest(v_dias) as d;

  insert into public.barbearias (
    dono_id,
    nome,
    cidade,
    endereco,
    telefone,
    horario_abertura,
    horario_fechamento,
    dias_funcionamento,
    logo_url,
    chave_criacao
  )
  values (
    auth.uid(),
    trim(p_nome),
    trim(p_cidade),
    nullif(trim(coalesce(p_endereco, '')), ''),
    nullif(regexp_replace(coalesce(p_telefone, ''), '\D', '', 'g'), ''),
    p_horario_abertura,
    p_horario_fechamento,
    v_dias_texto,
    null,
    v_chave
  )
  on conflict (chave_criacao)
  where chave_criacao is not null
  do update set
    chave_criacao = excluded.chave_criacao
  returning *
  into v_barbearia;

  if v_barbearia.dono_id <> auth.uid() then
    raise exception 'Chave de criação inválida para este usuário.';
  end if;

  insert into public.horarios_funcionamento (
    barbearia_id,
    dia_semana,
    aberto,
    hora_abertura,
    hora_fechamento,
    intervalo_inicio,
    intervalo_fim
  )
  select
    v_barbearia.id,
    d,
    d = any(v_dias),
    p_horario_abertura,
    p_horario_fechamento,
    null,
    null
  from generate_series(0, 6) as d
  on conflict (barbearia_id, dia_semana)
  do nothing;

  return v_barbearia;
end;
$$;

revoke all on function public.criar_barbearia_com_horarios(
  text, text, text, text, time, time, integer[], uuid
) from public;

grant execute on function public.criar_barbearia_com_horarios(
  text, text, text, text, time, time, integer[], uuid
) to authenticated;

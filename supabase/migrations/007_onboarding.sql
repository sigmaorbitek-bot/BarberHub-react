-- BarberHub React
-- Migration 007: onboarding/cadastro
-- Executar após 001 a 006.

-- Cria barbearia + horários em uma única transação.
create or replace function public.criar_barbearia_com_horarios(
  p_nome text,
  p_cidade text,
  p_endereco text default null,
  p_telefone text default null,
  p_horario_abertura time default null,
  p_horario_fechamento time default null,
  p_dias integer[] default '{}'::integer[]
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
    logo_url
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
    null
  )
  returning *
  into v_barbearia;

  -- Criamos os sete dias.
  -- Dias fechados também recebem o horário padrão quando houver.
  -- Isso evita fallback incorreto nas funções de disponibilidade.
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
  from generate_series(0, 6) as d;

  return v_barbearia;
end;
$$;

revoke all on function public.criar_barbearia_com_horarios(
  text, text, text, text, time, time, integer[]
) from public;

grant execute on function public.criar_barbearia_com_horarios(
  text, text, text, text, time, time, integer[]
) to authenticated;

-- Bucket público de logos.
insert into storage.buckets (
  id,
  name,
  public,
  file_size_limit,
  allowed_mime_types
)
values (
  'barbearias',
  'barbearias',
  true,
  5242880,
  array['image/jpeg', 'image/png', 'image/webp']
)
on conflict (id)
do update set
  public = excluded.public,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists "barbearias_storage_insert_proprio"
on storage.objects;

create policy "barbearias_storage_insert_proprio"
on storage.objects
for insert
to authenticated
with check (
  bucket_id = 'barbearias'
  and (storage.foldername(name))[1] = auth.uid()::text
);

drop policy if exists "barbearias_storage_update_proprio"
on storage.objects;

create policy "barbearias_storage_update_proprio"
on storage.objects
for update
to authenticated
using (
  bucket_id = 'barbearias'
  and (storage.foldername(name))[1] = auth.uid()::text
)
with check (
  bucket_id = 'barbearias'
  and (storage.foldername(name))[1] = auth.uid()::text
);

drop policy if exists "barbearias_storage_delete_proprio"
on storage.objects;

create policy "barbearias_storage_delete_proprio"
on storage.objects
for delete
to authenticated
using (
  bucket_id = 'barbearias'
  and (storage.foldername(name))[1] = auth.uid()::text
);

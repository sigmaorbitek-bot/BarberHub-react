-- BarberHub React
-- Migration 013: horários
-- Salva a semana de forma transacional e segura.

create or replace function public.salvar_horarios_barbearia(
  p_barbearia_id uuid,
  p_horarios jsonb
)
returns void
language plpgsql
security definer
set search_path = public, auth
as $$
declare
  v_item jsonb;
  v_dia integer;
  v_aberto boolean;
  v_inicio time;
  v_fim time;
  v_intervalo_inicio time;
  v_intervalo_fim time;
begin
  if auth.uid() is null then
    raise exception 'Usuário não autenticado.';
  end if;

  if not public.eh_dono_da_barbearia(
    p_barbearia_id
  ) then
    raise exception 'Você não possui acesso a esta barbearia.';
  end if;

  if jsonb_typeof(p_horarios) <> 'array' then
    raise exception 'Horários inválidos.';
  end if;

  for v_item in
    select value
    from jsonb_array_elements(
      p_horarios
    )
  loop
    v_dia :=
      (v_item ->> 'dia_semana')::integer;

    v_aberto :=
      coalesce(
        (v_item ->> 'aberto')::boolean,
        false
      );

    if v_dia < 0 or v_dia > 6 then
      raise exception 'Dia da semana inválido.';
    end if;

    v_inicio :=
      nullif(
        v_item ->> 'hora_inicio',
        ''
      )::time;

    v_fim :=
      nullif(
        v_item ->> 'hora_fim',
        ''
      )::time;

    v_intervalo_inicio :=
      nullif(
        v_item ->> 'intervalo_inicio',
        ''
      )::time;

    v_intervalo_fim :=
      nullif(
        v_item ->> 'intervalo_fim',
        ''
      )::time;

    if v_aberto then
      if v_inicio is null
        or v_fim is null
        or v_inicio >= v_fim
      then
        raise exception 'Horário de funcionamento inválido.';
      end if;

      if
        (
          v_intervalo_inicio is null
        ) <> (
          v_intervalo_fim is null
        )
      then
        raise exception 'Preencha o intervalo completo.';
      end if;

      if v_intervalo_inicio is not null then
        if v_intervalo_inicio >=
            v_intervalo_fim
          or v_intervalo_inicio <=
            v_inicio
          or v_intervalo_fim >=
            v_fim
        then
          raise exception 'Intervalo inválido.';
        end if;
      end if;
    else
      v_inicio := null;
      v_fim := null;
      v_intervalo_inicio := null;
      v_intervalo_fim := null;
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
    values (
      p_barbearia_id,
      v_dia,
      v_aberto,
      v_inicio,
      v_fim,
      v_intervalo_inicio,
      v_intervalo_fim
    )
    on conflict (
      barbearia_id,
      dia_semana
    )
    do update set
      aberto =
        excluded.aberto,
      hora_abertura =
        excluded.hora_abertura,
      hora_fechamento =
        excluded.hora_fechamento,
      intervalo_inicio =
        excluded.intervalo_inicio,
      intervalo_fim =
        excluded.intervalo_fim;
  end loop;
end;
$$;

revoke all on function public.salvar_horarios_barbearia(
  uuid,
  jsonb
) from public;

grant execute on function public.salvar_horarios_barbearia(
  uuid,
  jsonb
) to authenticated;


create or replace function public.salvar_horarios_profissional(
  p_profissional_id uuid,
  p_horarios jsonb
)
returns void
language plpgsql
security definer
set search_path = public, auth
as $$
declare
  v_item jsonb;
  v_dia integer;
  v_aberto boolean;
  v_inicio time;
  v_fim time;
  v_intervalo_inicio time;
  v_intervalo_fim time;
  v_barbearia_id uuid;
begin
  if auth.uid() is null then
    raise exception 'Usuário não autenticado.';
  end if;

  select p.barbearia_id
  into v_barbearia_id
  from public.profissionais p
  where p.id = p_profissional_id;

  if v_barbearia_id is null
    or not public.eh_dono_da_barbearia(
      v_barbearia_id
    )
  then
    raise exception 'Você não possui acesso a este profissional.';
  end if;

  if jsonb_typeof(p_horarios) <> 'array' then
    raise exception 'Horários inválidos.';
  end if;

  for v_item in
    select value
    from jsonb_array_elements(
      p_horarios
    )
  loop
    v_dia :=
      (v_item ->> 'dia_semana')::integer;

    v_aberto :=
      coalesce(
        (v_item ->> 'aberto')::boolean,
        false
      );

    if v_dia < 0 or v_dia > 6 then
      raise exception 'Dia da semana inválido.';
    end if;

    v_inicio :=
      nullif(
        v_item ->> 'hora_inicio',
        ''
      )::time;

    v_fim :=
      nullif(
        v_item ->> 'hora_fim',
        ''
      )::time;

    v_intervalo_inicio :=
      nullif(
        v_item ->> 'intervalo_inicio',
        ''
      )::time;

    v_intervalo_fim :=
      nullif(
        v_item ->> 'intervalo_fim',
        ''
      )::time;

    if v_aberto then
      if v_inicio is null
        or v_fim is null
        or v_inicio >= v_fim
      then
        raise exception 'Horário do profissional inválido.';
      end if;

      if
        (
          v_intervalo_inicio is null
        ) <> (
          v_intervalo_fim is null
        )
      then
        raise exception 'Preencha o intervalo completo.';
      end if;

      if v_intervalo_inicio is not null then
        if v_intervalo_inicio >=
            v_intervalo_fim
          or v_intervalo_inicio <=
            v_inicio
          or v_intervalo_fim >=
            v_fim
        then
          raise exception 'Intervalo do profissional inválido.';
        end if;
      end if;
    else
      v_inicio := null;
      v_fim := null;
      v_intervalo_inicio := null;
      v_intervalo_fim := null;
    end if;

    insert into public.horarios_profissionais (
      profissional_id,
      dia_semana,
      aberto,
      hora_inicio,
      hora_fim,
      intervalo_inicio,
      intervalo_fim
    )
    values (
      p_profissional_id,
      v_dia,
      v_aberto,
      v_inicio,
      v_fim,
      v_intervalo_inicio,
      v_intervalo_fim
    )
    on conflict (
      profissional_id,
      dia_semana
    )
    do update set
      aberto =
        excluded.aberto,
      hora_inicio =
        excluded.hora_inicio,
      hora_fim =
        excluded.hora_fim,
      intervalo_inicio =
        excluded.intervalo_inicio,
      intervalo_fim =
        excluded.intervalo_fim;
  end loop;
end;
$$;

revoke all on function public.salvar_horarios_profissional(
  uuid,
  jsonb
) from public;

grant execute on function public.salvar_horarios_profissional(
  uuid,
  jsonb
) to authenticated;


create or replace function public.resetar_horarios_profissional(
  p_profissional_id uuid
)
returns void
language plpgsql
security definer
set search_path = public, auth
as $$
declare
  v_barbearia_id uuid;
begin
  if auth.uid() is null then
    raise exception 'Usuário não autenticado.';
  end if;

  select p.barbearia_id
  into v_barbearia_id
  from public.profissionais p
  where p.id = p_profissional_id;

  if v_barbearia_id is null
    or not public.eh_dono_da_barbearia(
      v_barbearia_id
    )
  then
    raise exception 'Você não possui acesso a este profissional.';
  end if;

  delete from public.horarios_profissionais
  where profissional_id =
    p_profissional_id;
end;
$$;

revoke all on function public.resetar_horarios_profissional(
  uuid
) from public;

grant execute on function public.resetar_horarios_profissional(
  uuid
) to authenticated;

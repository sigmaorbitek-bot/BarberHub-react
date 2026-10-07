-- BarberHub
-- Migration 013: horários
-- Executar após 012_profissionais.sql.
--
-- Responsabilidades:
-- - salvar a semana completa da barbearia;
-- - salvar horário personalizado do profissional;
-- - restaurar o profissional para o horário geral;
-- - validar os 7 dias da semana;
-- - impedir payload incompleto ou duplicado;
-- - manter compatibilidade com os campos antigos de barbearias.

-- =========================================================
-- 1. SALVAR HORÁRIO GERAL DA BARBEARIA
-- =========================================================

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

  v_total_dias integer;
  v_total_dias_distintos integer;

  v_dias_texto text[];

  v_primeira_abertura time;
  v_primeiro_fechamento time;

  v_horarios_iguais boolean;
begin

  -- =======================================================
  -- AUTENTICAÇÃO E ACESSO
  -- =======================================================

  if auth.uid() is null then
    raise exception
      'Usuário não autenticado.';
  end if;


  if not public.eh_dono_da_barbearia(
    p_barbearia_id
  ) then
    raise exception
      'Você não possui acesso a esta barbearia.';
  end if;


  -- =======================================================
  -- VALIDAR PAYLOAD
  -- =======================================================

  if p_horarios is null
     or jsonb_typeof(p_horarios) <> 'array' then

    raise exception
      'Horários inválidos.';

  end if;


  v_total_dias :=
    jsonb_array_length(
      p_horarios
    );


  if v_total_dias <> 7 then
    raise exception
      'A configuração deve conter os 7 dias da semana.';
  end if;


  select
    count(
      distinct (
        item ->> 'dia_semana'
      )::integer
    )
  into v_total_dias_distintos
  from jsonb_array_elements(
    p_horarios
  ) as item;


  if v_total_dias_distintos <> 7 then
    raise exception
      'Existem dias duplicados ou ausentes na configuração.';
  end if;


  if exists (
    select 1

    from jsonb_array_elements(
      p_horarios
    ) as item

    where (
      item ->> 'dia_semana'
    )::integer not between 0 and 6
  ) then

    raise exception
      'Dia da semana inválido.';

  end if;


  -- =======================================================
  -- SALVAR OS 7 DIAS
  -- =======================================================

  for v_item in
    select value

    from jsonb_array_elements(
      p_horarios
    )
  loop

    v_dia :=
      (
        v_item ->> 'dia_semana'
      )::integer;


    v_aberto :=
      coalesce(
        (
          v_item ->> 'aberto'
        )::boolean,
        false
      );


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


    -- =====================================================
    -- DIA ABERTO
    -- =====================================================

    if v_aberto then

      if v_inicio is null
         or v_fim is null then

        raise exception
          'Informe abertura e fechamento dos dias abertos.';

      end if;


      if v_inicio >= v_fim then
        raise exception
          'O horário de abertura precisa ser menor que o de fechamento.';
      end if;


      if (
        v_intervalo_inicio is null
      ) <> (
        v_intervalo_fim is null
      ) then

        raise exception
          'Preencha os dois horários do intervalo ou deixe ambos vazios.';

      end if;


      if v_intervalo_inicio is not null then

        if v_intervalo_inicio >=
             v_intervalo_fim then

          raise exception
            'O início do intervalo precisa ser menor que o fim.';

        end if;


        if v_intervalo_inicio <=
             v_inicio
           or v_intervalo_fim >=
             v_fim then

          raise exception
            'O intervalo precisa ficar dentro do período de atendimento.';

        end if;

      end if;


    -- =====================================================
    -- DIA FECHADO
    -- =====================================================

    else

      v_inicio := null;
      v_fim := null;

      v_intervalo_inicio := null;
      v_intervalo_fim := null;

    end if;


    -- =====================================================
    -- UPSERT
    -- =====================================================

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


  -- =======================================================
  -- CAMPOS DE COMPATIBILIDADE EM BARBEARIAS
  -- =======================================================
  --
  -- dias_funcionamento continua podendo ser representado
  -- corretamente.
  --
  -- horario_abertura / horario_fechamento só são mantidos
  -- quando todos os dias abertos possuem exatamente
  -- o mesmo horário.
  --
  -- Se os dias tiverem horários diferentes, ficam NULL
  -- para não guardar uma informação enganosa.

  select
    coalesce(
      array_agg(
        case h.dia_semana
          when 0 then 'dom'
          when 1 then 'seg'
          when 2 then 'ter'
          when 3 then 'qua'
          when 4 then 'qui'
          when 5 then 'sex'
          when 6 then 'sab'
        end
        order by h.dia_semana
      )
      filter (
        where h.aberto = true
      ),
      '{}'::text[]
    )
  into v_dias_texto
  from public.horarios_funcionamento h
  where h.barbearia_id =
    p_barbearia_id;


  select
    min(h.hora_abertura),
    min(h.hora_fechamento),

    count(
      distinct (
        h.hora_abertura,
        h.hora_fechamento
      )
    ) <= 1

  into
    v_primeira_abertura,
    v_primeiro_fechamento,
    v_horarios_iguais

  from public.horarios_funcionamento h

  where h.barbearia_id =
          p_barbearia_id

    and h.aberto = true;


  update public.barbearias
  set
    dias_funcionamento =
      v_dias_texto,

    horario_abertura =
      case
        when v_horarios_iguais
          then v_primeira_abertura
        else null
      end,

    horario_fechamento =
      case
        when v_horarios_iguais
          then v_primeiro_fechamento
        else null
      end

  where id =
    p_barbearia_id;

end;
$$;


revoke all
on function public.salvar_horarios_barbearia(
  uuid,
  jsonb
)
from public;


grant execute
on function public.salvar_horarios_barbearia(
  uuid,
  jsonb
)
to authenticated;


-- =========================================================
-- 2. SALVAR HORÁRIO DO PROFISSIONAL
-- =========================================================

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

  v_total_dias integer;
  v_total_dias_distintos integer;
begin

  -- =======================================================
  -- AUTENTICAÇÃO
  -- =======================================================

  if auth.uid() is null then
    raise exception
      'Usuário não autenticado.';
  end if;


  -- =======================================================
  -- PROFISSIONAL / BARBEARIA
  -- =======================================================

  select p.barbearia_id
  into v_barbearia_id

  from public.profissionais p

  where p.id =
          p_profissional_id

    and p.ativo = true;


  if not found then
    raise exception
      'Profissional não encontrado ou inativo.';
  end if;


  if not public.eh_dono_da_barbearia(
    v_barbearia_id
  ) then

    raise exception
      'Você não possui acesso a este profissional.';

  end if;


  -- =======================================================
  -- VALIDAR PAYLOAD
  -- =======================================================

  if p_horarios is null
     or jsonb_typeof(p_horarios) <> 'array' then

    raise exception
      'Horários inválidos.';

  end if;


  v_total_dias :=
    jsonb_array_length(
      p_horarios
    );


  if v_total_dias <> 7 then
    raise exception
      'A configuração deve conter os 7 dias da semana.';
  end if;


  select
    count(
      distinct (
        item ->> 'dia_semana'
      )::integer
    )

  into v_total_dias_distintos

  from jsonb_array_elements(
    p_horarios
  ) as item;


  if v_total_dias_distintos <> 7 then
    raise exception
      'Existem dias duplicados ou ausentes na configuração.';
  end if;


  if exists (
    select 1

    from jsonb_array_elements(
      p_horarios
    ) as item

    where (
      item ->> 'dia_semana'
    )::integer not between 0 and 6
  ) then

    raise exception
      'Dia da semana inválido.';

  end if;


  -- =======================================================
  -- SALVAR OS 7 DIAS
  -- =======================================================

  for v_item in
    select value

    from jsonb_array_elements(
      p_horarios
    )
  loop

    v_dia :=
      (
        v_item ->> 'dia_semana'
      )::integer;


    v_aberto :=
      coalesce(
        (
          v_item ->> 'aberto'
        )::boolean,
        false
      );


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


    -- =====================================================
    -- DIA ABERTO
    -- =====================================================

    if v_aberto then

      if v_inicio is null
         or v_fim is null then

        raise exception
          'Informe início e fim dos dias de atendimento do profissional.';

      end if;


      if v_inicio >= v_fim then

        raise exception
          'O horário inicial do profissional precisa ser menor que o final.';

      end if;


      if (
        v_intervalo_inicio is null
      ) <> (
        v_intervalo_fim is null
      ) then

        raise exception
          'Preencha o intervalo completo do profissional.';

      end if;


      if v_intervalo_inicio is not null then

        if v_intervalo_inicio >=
             v_intervalo_fim then

          raise exception
            'O início do intervalo do profissional precisa ser menor que o fim.';

        end if;


        if v_intervalo_inicio <=
             v_inicio
           or v_intervalo_fim >=
             v_fim then

          raise exception
            'O intervalo do profissional precisa ficar dentro do período de atendimento.';

        end if;

      end if;


    -- =====================================================
    -- DIA FECHADO
    -- =====================================================

    else

      v_inicio := null;
      v_fim := null;

      v_intervalo_inicio := null;
      v_intervalo_fim := null;

    end if;


    -- =====================================================
    -- UPSERT
    -- =====================================================

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


revoke all
on function public.salvar_horarios_profissional(
  uuid,
  jsonb
)
from public;


grant execute
on function public.salvar_horarios_profissional(
  uuid,
  jsonb
)
to authenticated;


-- =========================================================
-- 3. VOLTAR PROFISSIONAL AO HORÁRIO GERAL
-- =========================================================
--
-- A ausência de registros em horarios_profissionais
-- significa:
--
-- "este profissional herda o horário geral da barbearia".

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
    raise exception
      'Usuário não autenticado.';
  end if;


  select p.barbearia_id
  into v_barbearia_id

  from public.profissionais p

  where p.id =
    p_profissional_id;


  if not found then
    raise exception
      'Profissional não encontrado.';
  end if;


  if not public.eh_dono_da_barbearia(
    v_barbearia_id
  ) then

    raise exception
      'Você não possui acesso a este profissional.';

  end if;


  delete
  from public.horarios_profissionais

  where profissional_id =
    p_profissional_id;

end;
$$;


revoke all
on function public.resetar_horarios_profissional(
  uuid
)
from public;


grant execute
on function public.resetar_horarios_profissional(
  uuid
)
to authenticated;
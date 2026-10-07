-- BarberHub
-- Migration 011: finalização segura do Google OAuth
-- Executar após 010_servicos.sql.
--
-- Responsabilidades:
-- - finalizar autenticação Google;
-- - criar profile quando ainda não existir;
-- - suportar dono, cliente e profissional;
-- - não transformar silenciosamente um tipo em outro;
-- - não criar cadastro profissional automaticamente;
-- - informar ao frontend qual fluxo deve continuar.

create or replace function public.finalizar_login_google(
  p_tipo text
)
returns table (
  tipo text,
  tem_barbearia boolean,
  cliente_id uuid
)
language plpgsql
security definer
set search_path = public, auth
as $$
declare
  v_user auth.users%rowtype;
  v_profile public.profiles%rowtype;

  v_nome text;

  v_cliente_id uuid;
  v_tem_barbearia boolean := false;
begin

  -- =======================================================
  -- AUTENTICAÇÃO
  -- =======================================================

  if auth.uid() is null then
    raise exception
      'Usuário não autenticado.';
  end if;


  -- =======================================================
  -- VALIDAR TIPO SOLICITADO
  -- =======================================================

  if p_tipo not in (
    'dono',
    'cliente',
    'profissional'
  ) then
    raise exception
      'Tipo de conta inválido.';
  end if;


  -- =======================================================
  -- USUÁRIO AUTH
  -- =======================================================

  select *
  into v_user
  from auth.users
  where id = auth.uid();


  if not found then
    raise exception
      'Usuário autenticado não encontrado.';
  end if;


  -- =======================================================
  -- NOME DO GOOGLE
  -- =======================================================

  v_nome :=
    coalesce(

      nullif(
        trim(
          v_user.raw_user_meta_data ->> 'nome'
        ),
        ''
      ),

      nullif(
        trim(
          v_user.raw_user_meta_data ->> 'full_name'
        ),
        ''
      ),

      nullif(
        trim(
          v_user.raw_user_meta_data ->> 'name'
        ),
        ''
      ),

      nullif(
        trim(
          split_part(
            coalesce(
              v_user.email,
              ''
            ),
            '@',
            1
          )
        ),
        ''
      ),

      'Usuário'
    );


  -- =======================================================
  -- PROFILE
  -- =======================================================

  select *
  into v_profile
  from public.profiles p
  where p.id = auth.uid();


  -- Google pode ter criado somente auth.users.
  --
  -- Para dono e cliente podemos criar o profile aqui.
  --
  -- Profissional é diferente:
  -- ele precisa já ter sido previamente vinculado pela barbearia
  -- em uma etapa posterior do sistema.

  if not found then

    if p_tipo = 'profissional' then
      raise exception
        'Seu acesso profissional ainda não foi liberado por uma barbearia.';
    end if;


    insert into public.profiles (
      id,
      nome,
      telefone,
      tipo
    )
    values (
      auth.uid(),
      v_nome,
      null,
      p_tipo
    )
    returning *
    into v_profile;


  -- =======================================================
  -- PROFILE JÁ EXISTE COM OUTRO PAPEL
  -- =======================================================

  elsif v_profile.tipo <> p_tipo then

    raise exception
      'Esta conta já está cadastrada como %. Entre pela área correspondente.',
      case
        when v_profile.tipo = 'dono'
          then 'barbearia'

        when v_profile.tipo = 'cliente'
          then 'cliente'

        when v_profile.tipo = 'profissional'
          then 'profissional'

        else
          v_profile.tipo
      end;


  -- =======================================================
  -- MESMO PAPEL
  -- =======================================================

  else

    -- Só preenche o nome se ainda estiver vazio.
    --
    -- Não sobrescrevemos um nome que o próprio usuário
    -- já alterou posteriormente no BarberHub.

    update public.profiles p

    set nome =
      case
        when nullif(
          trim(
            coalesce(
              p.nome,
              ''
            )
          ),
          ''
        ) is null
        then v_nome

        else p.nome
      end

    where p.id =
      auth.uid()

    returning *
    into v_profile;

  end if;


  -- =======================================================
  -- DONO
  -- =======================================================

  if p_tipo = 'dono' then

    select exists (
      select 1

      from public.barbearias b

      where b.dono_id =
        auth.uid()
    )
    into v_tem_barbearia;


  -- =======================================================
  -- CLIENTE
  -- =======================================================

  elsif p_tipo = 'cliente' then

    -- Não criamos mais clientes diretamente aqui.
    --
    -- A criação/atualização do cadastro comercial é feita
    -- pela RPC finalizar_cadastro_cliente(), criada na 007.
    --
    -- Aqui apenas verificamos se já existe.

    select c.id
    into v_cliente_id

    from public.clientes c

    where c.profile_id =
      auth.uid()

    limit 1;


  -- =======================================================
  -- PROFISSIONAL
  -- =======================================================

  elsif p_tipo = 'profissional' then

    -- Neste ponto da cadeia ainda não existe a estrutura
    -- completa de vínculo profissional autenticado.
    --
    -- A migration 014 adicionará usuario_id e permissões.
    --
    -- Por isso a validação definitiva do profissional
    -- será reforçada naquela migration.

    v_tem_barbearia :=
      false;

  end if;


  -- =======================================================
  -- RESULTADO
  -- =======================================================

  return query
  select
    v_profile.tipo,
    v_tem_barbearia,
    v_cliente_id;

end;
$$;


revoke all
on function public.finalizar_login_google(text)
from public;


grant execute
on function public.finalizar_login_google(text)
to authenticated;
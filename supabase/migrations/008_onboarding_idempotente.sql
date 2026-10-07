-- BarberHub
-- Migration 008: validação da estrutura de onboarding
-- Executar após 007_onboarding.sql.
--
-- Esta migration não recria estruturas.
-- Ela valida os contratos essenciais criados na 007.
--
-- Se qualquer requisito estiver ausente, a migration falha
-- imediatamente para impedir que o restante do sistema seja
-- instalado sobre uma base incompleta.

do $$
begin

  -- =======================================================
  -- 1. CHAVE DE IDEMPOTÊNCIA DA BARBEARIA
  -- =======================================================

  if not exists (
    select 1
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'barbearias'
      and column_name = 'chave_criacao'
      and data_type = 'uuid'
  ) then
    raise exception
      'Migration 008: public.barbearias.chave_criacao não existe ou não é uuid.';
  end if;


  -- =======================================================
  -- 2. ÍNDICE UNIQUE DA CHAVE
  -- =======================================================

  if not exists (
    select 1
    from pg_indexes
    where schemaname = 'public'
      and tablename = 'barbearias'
      and indexname = 'uq_barbearias_chave_criacao'
      and indexdef ilike '%unique%'
  ) then
    raise exception
      'Migration 008: índice único uq_barbearias_chave_criacao não encontrado.';
  end if;


  -- =======================================================
  -- 3. RPC DE CRIAÇÃO DA BARBEARIA
  -- =======================================================
  --
  -- Assinatura esperada:
  --
  -- p_nome
  -- p_cidade
  -- p_endereco
  -- p_telefone
  -- p_horario_abertura
  -- p_horario_fechamento
  -- p_dias
  -- p_chave_criacao
  -- p_nome_responsavel

  if not exists (
    select 1
    from pg_proc p
    join pg_namespace n
      on n.oid = p.pronamespace
    where n.nspname = 'public'
      and p.proname = 'criar_barbearia_com_horarios'
      and p.pronargs = 9
  ) then
    raise exception
      'Migration 008: RPC criar_barbearia_com_horarios com 9 parâmetros não encontrada.';
  end if;


  -- =======================================================
  -- 4. RPC DE FINALIZAÇÃO DO CLIENTE
  -- =======================================================
  --
  -- Assinatura esperada:
  --
  -- p_nome
  -- p_telefone

  if not exists (
    select 1
    from pg_proc p
    join pg_namespace n
      on n.oid = p.pronamespace
    where n.nspname = 'public'
      and p.proname = 'finalizar_cadastro_cliente'
      and p.pronargs = 2
  ) then
    raise exception
      'Migration 008: RPC finalizar_cadastro_cliente com 2 parâmetros não encontrada.';
  end if;


  -- =======================================================
  -- 5. BUCKET DE LOGOS
  -- =======================================================

  if not exists (
    select 1
    from storage.buckets
    where id = 'barbearias'
      and public = true
  ) then
    raise exception
      'Migration 008: bucket público barbearias não encontrado.';
  end if;


  -- =======================================================
  -- 6. POLÍTICAS DE STORAGE
  -- =======================================================

  if not exists (
    select 1
    from pg_policies
    where schemaname = 'storage'
      and tablename = 'objects'
      and policyname = 'barbearias_storage_insert_proprio'
  ) then
    raise exception
      'Migration 008: policy de INSERT das logos não encontrada.';
  end if;


  if not exists (
    select 1
    from pg_policies
    where schemaname = 'storage'
      and tablename = 'objects'
      and policyname = 'barbearias_storage_update_proprio'
  ) then
    raise exception
      'Migration 008: policy de UPDATE das logos não encontrada.';
  end if;


  if not exists (
    select 1
    from pg_policies
    where schemaname = 'storage'
      and tablename = 'objects'
      and policyname = 'barbearias_storage_delete_proprio'
  ) then
    raise exception
      'Migration 008: policy de DELETE das logos não encontrada.';
  end if;


  raise notice
    'Migration 008 concluída: onboarding do BarberHub validado com sucesso.';

end
$$;
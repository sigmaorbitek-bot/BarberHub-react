# BarberHub React

Nova versão do BarberHub construída em paralelo ao sistema atual de produção.

## Requisitos

- Node.js 22.22 ou superior
- npm
- Novo projeto Supabase do BarberHub

## Instalação

```bash
npm install
```

Copie `.env.example` para `.env` e informe a URL e a chave publicável do NOVO Supabase:

```env
VITE_SUPABASE_URL=https://SEU-PROJETO.supabase.co
VITE_SUPABASE_PUBLISHABLE_KEY=sb_publishable_SUA_CHAVE
```

Depois:

```bash
npm run dev
```

## Banco

As migrations ficam em `supabase/migrations/`.

Ordem atual:

1. `001_base_schema.sql`
2. `002_indexes.sql`
3. `003_rls.sql`
4. `004_functions.sql`
5. `005_triggers.sql`
6. `006_seed_dev.sql`

## Rotas iniciais

- `/` redireciona conforme o tipo do usuário autenticado
- `/login/barbearia`
- `/login/cliente`
- `/painel`
- `/painel/:barbeariaId`
- `/cliente`

O frontend antigo continua sendo o sistema de produção. Este projeto deve apontar somente para o novo Supabase de desenvolvimento/homologação.

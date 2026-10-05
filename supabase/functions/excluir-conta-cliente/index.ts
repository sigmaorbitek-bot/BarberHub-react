import { createClient } from "jsr:@supabase/supabase-js@2";

const SUPABASE_URL =
  Deno.env.get("SUPABASE_URL") ?? "";

const SERVICE_ROLE_KEY =
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

function json(body: unknown, status = 200) {
  return new Response(
    JSON.stringify(body),
    {
      status,
      headers: {
        ...corsHeaders,
        "Content-Type": "application/json",
      },
    },
  );
}

async function excluirPorCliente(
  admin: ReturnType<typeof createClient>,
  tabela: string,
  clienteId: string,
) {
  const { error } = await admin
    .from(tabela)
    .delete()
    .eq("cliente_id", clienteId);

  if (error) {
    throw new Error(
      `Falha ao remover dados de ${tabela}: ${error.message}`,
    );
  }
}

Deno.serve(async (request) => {
  if (request.method === "OPTIONS") {
    return new Response("ok", {
      headers: corsHeaders,
    });
  }

  if (request.method !== "POST") {
    return json(
      {
        sucesso: false,
        erro: "Método não permitido.",
      },
      405,
    );
  }

  try {
    if (!SUPABASE_URL || !SERVICE_ROLE_KEY) {
      throw new Error(
        "Configuração do Supabase ausente na Edge Function.",
      );
    }

    const authorization =
      request.headers.get("Authorization") ?? "";

    const token = authorization.replace(
      /^Bearer\s+/i,
      "",
    ).trim();

    if (!token) {
      return json(
        {
          sucesso: false,
          erro: "Sessão não encontrada.",
        },
        401,
      );
    }

    const body = await request.json().catch(() => ({}));

    if (body?.confirmacao !== "APAGAR CONTA") {
      return json(
        {
          sucesso: false,
          erro: "Confirmação inválida.",
        },
        400,
      );
    }

    const admin = createClient(
      SUPABASE_URL,
      SERVICE_ROLE_KEY,
      {
        auth: {
          persistSession: false,
          autoRefreshToken: false,
        },
      },
    );

    const {
      data: userData,
      error: userError,
    } = await admin.auth.getUser(token);

    if (userError || !userData?.user) {
      return json(
        {
          sucesso: false,
          erro: "Sessão inválida ou expirada.",
        },
        401,
      );
    }

    const usuario = userData.user;

    const {
      data: perfil,
      error: perfilError,
    } = await admin
      .from("profiles")
      .select("id, tipo")
      .eq("id", usuario.id)
      .maybeSingle();

    if (perfilError) {
      throw perfilError;
    }

    if (!perfil || perfil.tipo !== "cliente") {
      return json(
        {
          sucesso: false,
          erro: "Esta função é exclusiva para contas de cliente.",
        },
        403,
      );
    }

    const {
      data: cliente,
      error: clienteError,
    } = await admin
      .from("clientes")
      .select("id, foto_path")
      .eq("profile_id", usuario.id)
      .maybeSingle();

    if (clienteError) {
      throw clienteError;
    }

    if (!cliente?.id) {
      return json(
        {
          sucesso: false,
          erro: "Cadastro de cliente não encontrado.",
        },
        404,
      );
    }

    const clienteId = cliente.id;

    const [
      agendamentosResult,
      pedidosResult,
      avaliacoesResult,
      contasResult,
      pagamentosResult,
    ] = await Promise.all([
      admin
        .from("agendamentos")
        .select("id")
        .eq("cliente_id", clienteId),
      admin
        .from("pedidos")
        .select("id")
        .eq("cliente_id", clienteId),
      admin
        .from("avaliacoes")
        .select("id")
        .eq("cliente_id", clienteId),
      admin
        .from("contas_receber")
        .select("id")
        .eq("cliente_id", clienteId),
      admin
        .from("pagamentos_contas_receber")
        .select("id")
        .eq("cliente_id", clienteId),
    ]);

    for (const resultado of [
      agendamentosResult,
      pedidosResult,
      avaliacoesResult,
      contasResult,
      pagamentosResult,
    ]) {
      if (resultado.error) {
        throw resultado.error;
      }
    }

    const referencias = [
      ...(agendamentosResult.data || []).map((item) => item.id),
      ...(pedidosResult.data || []).map((item) => item.id),
      ...(avaliacoesResult.data || []).map((item) => item.id),
      ...(contasResult.data || []).map((item) => item.id),
      ...(pagamentosResult.data || []).map((item) => item.id),
    ];

    if (referencias.length) {
      const { error } = await admin
        .from("notificacoes")
        .delete()
        .in("referencia_id", referencias);

      if (error) {
        throw new Error(
          `Falha ao remover notificações relacionadas: ${error.message}`,
        );
      }
    }

    await excluirPorCliente(
      admin,
      "pagamentos_contas_receber",
      clienteId,
    );

    await excluirPorCliente(
      admin,
      "contas_receber",
      clienteId,
    );

    await excluirPorCliente(
      admin,
      "avaliacoes",
      clienteId,
    );

    await excluirPorCliente(
      admin,
      "pedidos",
      clienteId,
    );

    await excluirPorCliente(
      admin,
      "agendamentos",
      clienteId,
    );

    await excluirPorCliente(
      admin,
      "favoritos",
      clienteId,
    );

    await excluirPorCliente(
      admin,
      "clientes_barbearias",
      clienteId,
    );

    const { error: notificacoesError } = await admin
      .from("notificacoes")
      .delete()
      .eq("usuario_id", usuario.id);

    if (notificacoesError) {
      throw notificacoesError;
    }

    const { error: pushError } = await admin
      .from("push_subscriptions")
      .delete()
      .eq("usuario_id", usuario.id);

    if (pushError) {
      throw pushError;
    }

    const { error: preferenciasError } = await admin
      .from("preferencias_notificacoes")
      .delete()
      .eq("usuario_id", usuario.id);

    if (preferenciasError) {
      throw preferenciasError;
    }

    if (cliente.foto_path) {
      const { error: fotoError } = await admin.storage
        .from("clientes")
        .remove([cliente.foto_path]);

      if (fotoError) {
        console.error(
          "[BarberHub] Não foi possível remover a foto principal:",
          fotoError,
        );
      }
    }

    const {
      data: arquivosFoto,
      error: listarFotosError,
    } = await admin.storage
      .from("clientes")
      .list(usuario.id, {
        limit: 100,
      });

    if (!listarFotosError && arquivosFoto?.length) {
      const caminhos = arquivosFoto
        .filter((arquivo) => arquivo.name)
        .map(
          (arquivo) =>
            `${usuario.id}/${arquivo.name}`,
        );

      if (caminhos.length) {
        const { error: removerFotosError } =
          await admin.storage
            .from("clientes")
            .remove(caminhos);

        if (removerFotosError) {
          console.error(
            "[BarberHub] Falha ao limpar fotos restantes:",
            removerFotosError,
          );
        }
      }
    }

    const { error: clienteDeleteError } = await admin
      .from("clientes")
      .delete()
      .eq("id", clienteId);

    if (clienteDeleteError) {
      throw clienteDeleteError;
    }

    const { error: authDeleteError } =
      await admin.auth.admin.deleteUser(
        usuario.id,
      );

    if (authDeleteError) {
      throw authDeleteError;
    }

    return json({
      sucesso: true,
    });
  } catch (error) {
    console.error(
      "[BarberHub] Erro ao excluir conta de cliente:",
      error,
    );

    return json(
      {
        sucesso: false,
        erro:
          error instanceof Error
            ? error.message
            : "Não foi possível excluir a conta.",
      },
      500,
    );
  }
});

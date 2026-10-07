import { createClient } from "jsr:@supabase/supabase-js@2";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL") ?? "";
const SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      ...corsHeaders,
      "Content-Type": "application/json",
    },
  });
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
      throw new Error("Configuração do Supabase ausente na Edge Function.");
    }

    const authorization = request.headers.get("Authorization") ?? "";
    const token = authorization.replace(/^Bearer\s+/i, "").trim();

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

    const admin = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, {
      auth: {
        persistSession: false,
        autoRefreshToken: false,
      },
    });

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

    const { data: perfil, error: perfilError } = await admin
      .from("profiles")
      .select("id, tipo")
      .eq("id", usuario.id)
      .maybeSingle();

    if (perfilError) {
      throw perfilError;
    }

    if (!perfil || perfil.tipo !== "profissional") {
      return json(
        {
          sucesso: false,
          erro: "Esta função é exclusiva para contas profissionais.",
        },
        403,
      );
    }

    const { data: profissional, error: profissionalError } = await admin
      .from("profissionais")
      .select("id, foto_path")
      .eq("usuario_id", usuario.id)
      .maybeSingle();

    if (profissionalError) {
      throw profissionalError;
    }

    if (!profissional?.id) {
      return json(
        {
          sucesso: false,
          erro: "Vínculo profissional não encontrado.",
        },
        404,
      );
    }

    if (profissional.foto_path) {
      const { error: fotoError } = await admin.storage
        .from("profissionais")
        .remove([profissional.foto_path]);

      if (fotoError) {
        throw new Error(`Não foi possível remover sua foto: ${fotoError.message}`);
      }
    }

    const { error: permissoesError } = await admin
      .from("permissoes_profissionais")
      .delete()
      .eq("profissional_id", profissional.id);

    if (permissoesError) {
      throw permissoesError;
    }

    const limpezaUsuario = await Promise.all([
      admin.from("notificacoes").delete().eq("usuario_id", usuario.id),
      admin.from("push_subscriptions").delete().eq("usuario_id", usuario.id),
      admin
        .from("preferencias_notificacoes")
        .delete()
        .eq("usuario_id", usuario.id),
    ]);

    for (const resultado of limpezaUsuario) {
      if (resultado.error && resultado.error.code !== "42P01") {
        throw resultado.error;
      }
    }

    const { error: desvincularError } = await admin
      .from("profissionais")
      .update({
        usuario_id: null,
        email_acesso: null,
        primeiro_acesso_pendente: false,
        foto_url: null,
        foto_path: null,
      })
      .eq("id", profissional.id)
      .eq("usuario_id", usuario.id);

    if (desvincularError) {
      throw desvincularError;
    }

    const { error: authDeleteError } = await admin.auth.admin.deleteUser(
      usuario.id,
    );

    if (authDeleteError) {
      throw authDeleteError;
    }

    return json({
      sucesso: true,
    });
  } catch (error) {
    console.error("[BarberHub] Erro ao excluir conta profissional:", error);

    return json(
      {
        sucesso: false,
        erro:
          error instanceof Error
            ? error.message
            : "Não foi possível excluir a conta profissional.",
      },
      500,
    );
  }
});

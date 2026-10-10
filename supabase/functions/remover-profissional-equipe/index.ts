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
    return new Response("ok", { headers: corsHeaders });
  }

  if (request.method !== "POST") {
    return json({ sucesso: false, erro: "Método não permitido." }, 405);
  }

  try {
    if (!SUPABASE_URL || !SERVICE_ROLE_KEY) {
      throw new Error("Configuração do Supabase ausente na Edge Function.");
    }

    const authorization = request.headers.get("Authorization") ?? "";
    const token = authorization.replace(/^Bearer\s+/i, "").trim();

    if (!token) {
      return json({ sucesso: false, erro: "Sessão não encontrada." }, 401);
    }

    const body = await request.json().catch(() => ({}));
    const profissionalId = String(body?.profissionalId ?? "").trim();

    if (!profissionalId) {
      return json({ sucesso: false, erro: "Profissional não informado." }, 400);
    }

    if (body?.confirmacao !== "REMOVER PROFISSIONAL") {
      return json({ sucesso: false, erro: "Confirmação inválida." }, 400);
    }

    const admin = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, {
      auth: {
        persistSession: false,
        autoRefreshToken: false,
      },
    });

    const { data: userData, error: userError } =
      await admin.auth.getUser(token);

    if (userError || !userData?.user) {
      return json(
        { sucesso: false, erro: "Sessão inválida ou expirada." },
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

    if (!perfil || perfil.tipo !== "dono") {
      return json(
        {
          sucesso: false,
          erro: "Somente o proprietário pode remover profissionais da equipe.",
        },
        403,
      );
    }

    const { data: profissional, error: profissionalError } = await admin
      .from("profissionais")
      .select("id, barbearia_id, usuario_id, nome, foto_path, removido_em")
      .eq("id", profissionalId)
      .maybeSingle();

    if (profissionalError) {
      throw profissionalError;
    }

    if (!profissional?.id) {
      return json(
        { sucesso: false, erro: "Profissional não encontrado." },
        404,
      );
    }

    if (profissional.removido_em) {
      return json({ sucesso: true, jaRemovido: true });
    }

    const { data: barbearia, error: barbeariaError } = await admin
      .from("barbearias")
      .select("id, dono_id")
      .eq("id", profissional.barbearia_id)
      .maybeSingle();

    if (barbeariaError) {
      throw barbeariaError;
    }

    if (!barbearia || barbearia.dono_id !== usuario.id) {
      return json(
        {
          sucesso: false,
          erro: "Você não possui acesso a este profissional.",
        },
        403,
      );
    }

    if (profissional.usuario_id) {
      return json(
        {
          sucesso: false,
          erro: "Este profissional ainda possui uma conta vinculada. A conta deve ser removida antes de excluí-lo da equipe.",
        },
        409,
      );
    }

    if (profissional.foto_path) {
      const { error: fotoError } = await admin.storage
        .from("profissionais")
        .remove([profissional.foto_path]);

      if (fotoError) {
        throw new Error(
          `Não foi possível remover a foto do profissional: ${fotoError.message}`,
        );
      }
    }

    const limpeza = await Promise.all([
      admin
        .from("permissoes_profissionais")
        .delete()
        .eq("profissional_id", profissional.id),
      admin
        .from("horarios_profissionais")
        .delete()
        .eq("profissional_id", profissional.id),
    ]);

    for (const resultado of limpeza) {
      if (resultado.error && resultado.error.code !== "42P01") {
        throw resultado.error;
      }
    }

    const { error: removerError } = await admin
      .from("profissionais")
      .update({
        ativo: false,
        removido_em: new Date().toISOString(),
        email_acesso: null,
        primeiro_acesso_pendente: false,
        telefone: null,
        foto_url: null,
        foto_path: null,
      })
      .eq("id", profissional.id)
      .is("usuario_id", null);

    if (removerError) {
      throw removerError;
    }

    return json({
      sucesso: true,
      profissionalId: profissional.id,
    });
  } catch (error) {
    console.error("[BarberHub] Erro ao remover profissional da equipe:", error);

    return json(
      {
        sucesso: false,
        erro:
          error instanceof Error
            ? error.message
            : "Não foi possível remover o profissional da equipe.",
      },
      500,
    );
  }
});

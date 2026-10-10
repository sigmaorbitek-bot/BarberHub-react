// BarberHub / AASORB - Edge Function excluir-conta (versao 043)
// Apaga todas as unidades DO DONO em uma unica transacao SQL autorizada.
// Storage e Auth sao limpos depois, usando checkpoint persistente.
import { createClient } from "jsr:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

type Arquivo = { bucket: string; name: string };
type ResultadoRpc = {
  unidades_removidas: number;
  arquivos: Arquivo[];
  pendente: boolean;
};

function responder(status: number, data: Record<string, unknown>): Response {
  return Response.json(data, { status, headers: corsHeaders });
}

function tokenDaRequisicao(request: Request): string | null {
  const valor = request.headers.get("Authorization") || "";
  return /^Bearer\s+(\S+)$/i.exec(valor)?.[1] || null;
}

function arquivosValidos(resultado: unknown): resultado is Arquivo[] {
  if (!Array.isArray(resultado)) return false;
  const bucketsPermitidos = new Set(["barbearias", "produtos", "profissionais"]);
  return resultado.every((item) =>
    item && typeof item === "object" &&
    bucketsPermitidos.has(item.bucket) &&
    typeof item.name === "string" &&
    item.name.length > 0 &&
    item.name.length <= 1024 &&
    !item.name.startsWith("/") &&
    !item.name.includes("\\") &&
    !item.name.split("/").includes("..")
  );
}

Deno.serve(async (request: Request) => {
  if (request.method === "OPTIONS") return responder(200, { ok: true });
  if (request.method !== "POST") {
    return responder(405, { ok: false, error: "Método não permitido." });
  }

  const url = Deno.env.get("SUPABASE_URL") || "";
  const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "";
  if (!url || !serviceRoleKey) {
    return responder(500, { ok: false, error: "Servidor não configurado." });
  }

  const token = tokenDaRequisicao(request);
  if (!token) return responder(401, { ok: false, error: "Sessão não encontrada." });

  const admin = createClient(url, serviceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  try {
    const { data: sessao, error: authError } = await admin.auth.getUser(token);
    const usuario = sessao?.user;
    if (authError || !usuario) {
      return responder(401, { ok: false, error: "Sessão inválida ou expirada." });
    }

    const corpo = await request.json().catch(() => ({}));
    if (corpo?.confirmacao !== "APAGAR CONTA") {
      return responder(400, { ok: false, error: 'Digite "APAGAR CONTA".' });
    }

    if (
      typeof corpo?.emailConfirmacao !== "string" ||
      corpo.emailConfirmacao.trim().toLowerCase() !== usuario.email?.toLowerCase()
    ) {
      return responder(400, {
        ok: false,
        error: "Confirme também o e-mail da conta proprietária.",
      });
    }

    const { data: perfil, error: perfilError } = await admin.from("profiles")
      .select("tipo").eq("id", usuario.id).maybeSingle();
    if (perfilError) throw perfilError;
    if (perfil?.tipo !== "dono") {
      return responder(403, { ok: false, error: "Operação exclusiva do proprietário." });
    }

    const { data, error: erroRpc } = await admin.rpc(
      "edge_excluir_conta_dono_definitiva", { p_ator_id: usuario.id },
    );
    if (erroRpc) {
      console.error("[BarberHub] Falha ao excluir unidades (transacao revertida):", {
        code: erroRpc.code, message: erroRpc.message,
      });
      return responder(409, {
        ok: false,
        error: "O banco impediu a exclusão para preservar a integridade. Nenhuma exclusão parcial de tabelas foi confirmada. Consulte os logs.",
      });
    }

    const resultado = data as ResultadoRpc | null;
    if (!resultado || !arquivosValidos(resultado.arquivos)) {
      console.error("[BarberHub] Manifesto de exclusao invalido.");
      return responder(202, {
        ok: false,
        pendente: true,
        error: "As unidades foram removidas, mas a limpeza dos arquivos precisa de suporte técnico.",
      });
    }

    // Nao aceitar rotas arbitrarias: o manifesto foi produzido no banco,
    // com os objetos fisicamente associados aos prefixos de unidades do dono.
    for (const bucket of ["barbearias", "produtos", "profissionais"]) {
      const nomes = resultado.arquivos.filter((a) => a.bucket === bucket)
        .map((a) => a.name);
      for (let i = 0; i < nomes.length; i += 100) {
        const lote = nomes.slice(i, i + 100);
        const { error } = await admin.storage.from(bucket).remove(lote);
        if (error) {
          console.error("[BarberHub] Pendencia de remocao Storage:", {
            bucket, quantidade: lote.length, message: error.message,
          });
          return responder(202, {
            ok: false,
            pendente: true,
            error: "As barbearias já foram removidas. Alguns arquivos ainda precisam ser limpos. Não crie outra conta; tente novamente ou contate o suporte.",
          });
        }
      }
    }

    const { data: objetosRestantes, error: erroConferencia } = await admin.rpc(
      "edge_conferir_arquivos_exclusao_dono", { p_ator_id: usuario.id },
    );
    if (erroConferencia || Number(objetosRestantes) !== 0) {
      console.error("[BarberHub] Limpeza do Storage ainda nao confirmada:", {
        restantes: objetosRestantes,
        code: erroConferencia?.code,
        message: erroConferencia?.message,
      });
      return responder(202, {
        ok: false,
        pendente: true,
        error: "A exclusão das unidades foi concluída, mas alguns arquivos ainda estão pendentes de remoção. Tente novamente ou contate o suporte.",
      });
    }

    // So depois de ter concluido a remocao do Storage excluimos a conta Auth.
    // O checkpoint pendente possui FK auth.users ON DELETE CASCADE.
    const { error: erroExcluirAuth } = await admin.auth.admin.deleteUser(
      usuario.id, false,
    );
    if (erroExcluirAuth) {
      console.error("[BarberHub] Pendencia de exclusao Auth:", {
        code: erroExcluirAuth.code, message: erroExcluirAuth.message,
      });
      return responder(202, {
        ok: false,
        pendente: true,
        error: "Barbearias e arquivos removidos. A exclusão da conta de acesso está pendente. Tente novamente ou contate o suporte.",
      });
    }

    return responder(200, {
      ok: true,
      barbearias_excluidas: resultado.unidades_removidas,
    });
  } catch (err) {
    console.error("[BarberHub] excluir-conta:", err);
    return responder(500, {
      ok: false,
      error: "Não foi possível concluir a exclusão. Verifique os registros do servidor antes de tentar novamente.",
    });
  }
});

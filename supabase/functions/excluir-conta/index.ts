import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY")!;
const SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

function json(
  body: Record<string, unknown>,
  status = 200,
) {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      ...corsHeaders,
      "Content-Type": "application/json",
    },
  });
}

function pathFromPublicUrl(
  url: string | null | undefined,
  bucket: string,
) {
  if (!url) {
    return null;
  }

  const marker = `/storage/v1/object/public/${bucket}/`;
  const index = url.indexOf(marker);

  if (index < 0) {
    return null;
  }

  return decodeURIComponent(
    url.slice(index + marker.length),
  );
}

async function removePaths(
  admin: ReturnType<typeof createClient>,
  bucket: string,
  paths: Array<string | null | undefined>,
) {
  const unique = [
    ...new Set(
      paths.filter(
        (value): value is string =>
          Boolean(value && value.trim()),
      ),
    ),
  ];

  if (!unique.length) {
    return;
  }

  for (let index = 0; index < unique.length; index += 100) {
    const chunk = unique.slice(index, index + 100);

    const { error } = await admin.storage
      .from(bucket)
      .remove(chunk);

    if (error) {
      throw new Error(
        `Não foi possível apagar arquivos do bucket ${bucket}: ${error.message}`,
      );
    }
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
        ok: false,
        error: "Método não permitido.",
      },
      405,
    );
  }

  try {
    const authorization =
      request.headers.get("Authorization");

    if (!authorization) {
      return json(
        {
          ok: false,
          error: "Sessão não encontrada.",
        },
        401,
      );
    }

    const client = createClient(
      SUPABASE_URL,
      SUPABASE_ANON_KEY,
      {
        global: {
          headers: {
            Authorization: authorization,
          },
        },
        auth: {
          persistSession: false,
        },
      },
    );

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
      data: { user },
      error: userError,
    } = await client.auth.getUser();

    if (userError || !user) {
      return json(
        {
          ok: false,
          error: "Sessão inválida ou expirada.",
        },
        401,
      );
    }

    const payload = await request.json().catch(
      () => ({}),
    );

    if (payload?.confirmacao !== "APAGAR CONTA") {
      return json(
        {
          ok: false,
          error:
            'Confirmação inválida. Digite "APAGAR CONTA".',
        },
        400,
      );
    }

    const { data: profile, error: profileError } =
      await admin
        .from("profiles")
        .select("id, tipo")
        .eq("id", user.id)
        .maybeSingle();

    if (profileError) {
      throw profileError;
    }

    if (!profile || profile.tipo !== "dono") {
      return json(
        {
          ok: false,
          error:
            "Esta operação é exclusiva da conta administradora.",
        },
        403,
      );
    }

    const {
      data: barbearias,
      error: barbeariasError,
    } = await admin
      .from("barbearias")
      .select("id, logo_url")
      .eq("dono_id", user.id);

    if (barbeariasError) {
      throw barbeariasError;
    }

    const ids = (barbearias || []).map(
      (item) => item.id,
    );

    let produtos: Array<{
      foto_path: string | null;
      foto_url: string | null;
    }> = [];

    let profissionais: Array<{
      foto_path: string | null;
      foto_url: string | null;
    }> = [];

    if (ids.length) {
      const [produtosResult, profissionaisResult] =
        await Promise.all([
          admin
            .from("produtos")
            .select("foto_path, foto_url")
            .in("barbearia_id", ids),
          admin
            .from("profissionais")
            .select("foto_path, foto_url")
            .in("barbearia_id", ids),
        ]);

      if (produtosResult.error) {
        throw produtosResult.error;
      }

      if (profissionaisResult.error) {
        throw profissionaisResult.error;
      }

      produtos = produtosResult.data || [];
      profissionais =
        profissionaisResult.data || [];

      await removePaths(
        admin,
        "produtos",
        produtos.flatMap((item) => [
          item.foto_path,
          pathFromPublicUrl(
            item.foto_url,
            "produtos",
          ),
        ]),
      );

      await removePaths(
        admin,
        "profissionais",
        profissionais.flatMap((item) => [
          item.foto_path,
          pathFromPublicUrl(
            item.foto_url,
            "profissionais",
          ),
        ]),
      );

      await removePaths(
        admin,
        "barbearias",
        (barbearias || []).map((item) =>
          pathFromPublicUrl(
            item.logo_url,
            "barbearias",
          ),
        ),
      );

      // A migration 027 usa RESTRICT em Contas a Receber.
      // Apagamos primeiro os registros financeiros dessa área.
      const { error: pagamentosError } =
        await admin
          .from("pagamentos_contas_receber")
          .delete()
          .in("barbearia_id", ids);

      if (
        pagamentosError &&
        pagamentosError.code !== "42P01"
      ) {
        throw pagamentosError;
      }

      const { error: contasError } = await admin
        .from("contas_receber")
        .delete()
        .in("barbearia_id", ids);

      if (
        contasError &&
        contasError.code !== "42P01"
      ) {
        throw contasError;
      }

      const { error: deleteBusinessError } =
        await admin
          .from("barbearias")
          .delete()
          .eq("dono_id", user.id);

      if (deleteBusinessError) {
        throw deleteBusinessError;
      }
    }

    const { error: deleteUserError } =
      await admin.auth.admin.deleteUser(
        user.id,
        false,
      );

    if (deleteUserError) {
      throw deleteUserError;
    }

    return json({
      ok: true,
      deleted_barbershops: ids.length,
    });
  } catch (error) {
    console.error(
      "[BarberHub] excluir-conta:",
      error,
    );

    return json(
      {
        ok: false,
        error:
          error instanceof Error
            ? error.message
            : "Erro interno ao excluir a conta.",
      },
      500,
    );
  }
});

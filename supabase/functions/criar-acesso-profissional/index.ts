import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", {
      headers: corsHeaders,
    });
  }

  if (req.method !== "POST") {
    return resposta(405, "Método não permitido.");
  }

  const supabaseUrl =
    Deno.env.get("SUPABASE_URL");

  const serviceRoleKey =
    Deno.env.get(
      "SUPABASE_SERVICE_ROLE_KEY",
    );

  const anonKey =
    Deno.env.get(
      "SUPABASE_ANON_KEY",
    );

  if (
    !supabaseUrl ||
    !serviceRoleKey ||
    !anonKey
  ) {
    return resposta(
      500,
      "Configuração do servidor incompleta.",
    );
  }

  const authorization =
    req.headers.get("Authorization");

  if (!authorization) {
    return resposta(
      401,
      "Usuário não autenticado.",
    );
  }

  const userClient = createClient(
    supabaseUrl,
    anonKey,
    {
      global: {
        headers: {
          Authorization:
            authorization,
        },
      },
      auth: {
        persistSession: false,
      },
    },
  );

  const admin = createClient(
    supabaseUrl,
    serviceRoleKey,
    {
      auth: {
        autoRefreshToken: false,
        persistSession: false,
      },
    },
  );

  let usuarioCriadoId: string | null = null;

  try {
    const {
      data: userData,
      error: userError,
    } =
      await userClient.auth.getUser();

    if (
      userError ||
      !userData?.user
    ) {
      return resposta(
        401,
        "Sessão inválida.",
      );
    }

    const body =
      await req.json();

    const profissionalId =
      String(
        body?.profissionalId || "",
      ).trim();

    const email =
      String(
        body?.email || "",
      )
        .trim()
        .toLowerCase();

    const senhaTemporaria =
      String(
        body?.senhaTemporaria || "",
      );

    const permissoes =
      body?.permissoes || {};

    const comissao =
      Number(
        body?.comissaoPercentual ?? 0,
      );

    if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(profissionalId)) {
      return resposta(
        400,
        "Profissional inválido.",
      );
    }

    if (
      !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) ||
      email.length > 254
    ) {
      return resposta(
        400,
        "Digite um e-mail válido.",
      );
    }

    if (
      senhaTemporaria.length < 8 ||
      senhaTemporaria.length > 128
    ) {
      return resposta(
        400,
        "A senha temporária precisa ter pelo menos 8 caracteres.",
      );
    }

    if (
      !Number.isFinite(comissao) ||
      comissao < 0 ||
      comissao > 100
    ) {
      return resposta(
        400,
        "Comissão inválida.",
      );
    }

    const {
      data: profissional,
      error: profissionalError,
    } = await admin
      .from("profissionais")
      .select(
        `
          id,
          nome,
          telefone,
          ativo,
          usuario_id,
          barbearia_id,
          barbearias!inner(
            id,
            dono_id,
            nome
          )
        `,
      )
      .eq("id", profissionalId)
      .maybeSingle();

    if (profissionalError) {
      throw profissionalError;
    }

    if (!profissional) {
      return resposta(
        404,
        "Profissional não encontrado.",
      );
    }

    if (
      profissional.barbearias
        ?.dono_id !==
      userData.user.id
    ) {
      return resposta(
        403,
        "Você não possui acesso a este profissional.",
      );
    }

    if (!profissional.ativo) {
      return resposta(
        400,
        "Reative o profissional antes de liberar o acesso.",
      );
    }

    if (
      profissional.usuario_id
    ) {
      return resposta(
        409,
        "Este profissional já possui uma conta vinculada.",
      );
    }

    const {
      data: criado,
      error: createError,
    } =
      await admin.auth.admin.createUser({
        email,
        password:
          senhaTemporaria,
        email_confirm: true,
        user_metadata: {
          nome:
            profissional.nome,
          telefone:
            profissional.telefone ||
            null,
          tipo: "profissional",
        },
      });

    if (
      createError ||
      !criado?.user
    ) {
      const texto =
        String(
          createError?.message || "",
        ).toLowerCase();

      if (
        texto.includes(
          "already registered",
        ) ||
        texto.includes(
          "already exists",
        ) ||
        texto.includes(
          "already been registered",
        ) ||
        createError?.code === "email_exists"
      ) {
        return resposta(
          409,
          "Este e-mail já possui uma conta no BarberHub.",
        );
      }

      // O erro técnico fica apenas no log do servidor.
      console.error("[BarberHub] Falha no Auth Admin ao criar profissional:", {
        codigo: createError?.code,
        status: createError?.status,
        mensagem: createError?.message,
      });
      return resposta(
        500,
        "Não foi possível criar a conta profissional. Confira os logs da Edge Function e do Auth no Supabase.",
      );
    }

    usuarioCriadoId =
      criado.user.id;

    const {
      error: profileError,
    } = await admin
      .from("profiles")
      .upsert(
        {
          id: usuarioCriadoId,
          nome:
            profissional.nome,
          telefone:
            profissional.telefone ||
            null,
          tipo:
            "profissional",
        },
        {
          onConflict: "id",
        },
      );

    if (profileError) {
      throw profileError;
    }

    const {
      data: profissionalVinculado,
      error: updateError,
    } = await admin
      .from("profissionais")
      .update({
        usuario_id:
          usuarioCriadoId,
        email_acesso: email,
        primeiro_acesso_pendente:
          true,
        comissao_percentual:
          comissao,
      })
      .eq("id", profissionalId)
      .eq("ativo", true)
      .is("usuario_id", null)
      .select("id")
      .maybeSingle();

    if (updateError) {
      throw updateError;
    }

    if (!profissionalVinculado) {
      const conflito = new Error(
        "Este profissional foi alterado durante o cadastro. Atualize a página e tente novamente.",
      );
      conflito.name = "ConflitoDeAcesso";
      throw conflito;
    }

    const {
      error: permissionError,
    } = await admin
      .from(
        "permissoes_profissionais",
      )
      .upsert(
        {
          profissional_id:
            profissionalId,
          ver_agendamentos:
            permissoes
              .ver_agendamentos ??
            true,
          alterar_status:
            permissoes
              .alterar_status ??
            true,
          ver_cliente_telefone:
            permissoes
              .ver_cliente_telefone ??
            true,
          ver_financeiro:
            permissoes
              .ver_financeiro ??
            false,
          ver_comissao:
            permissoes
              .ver_comissao ??
            false,
          ver_agenda_equipe:
            permissoes
              .ver_agenda_equipe ??
            false,
          ver_clientes:
            permissoes
              .ver_clientes ??
            false,
          ver_produtos:
            permissoes
              .ver_produtos ??
            false,
        },
        {
          onConflict:
            "profissional_id",
        },
      );

    if (permissionError) {
      throw permissionError;
    }

    return new Response(
      JSON.stringify({
        ok: true,
        email,
      }),
      {
        status: 200,
        headers: {
          ...corsHeaders,
          "Content-Type":
            "application/json",
        },
      },
    );
  } catch (error) {
    console.error(
      "[BarberHub] criar-acesso-profissional:",
      error,
    );

    if (usuarioCriadoId) {
      try {
        const { error: limparErro } = await admin.auth.admin.deleteUser(
          usuarioCriadoId,
        );
        if (limparErro) {
          console.error("[BarberHub] Falha na compensação Auth:", limparErro);
        }
      } catch (falhaLimpeza) {
        console.error("[BarberHub] Falha ao desfazer usuário criado:", falhaLimpeza);
      }
    }

    const conflito = error instanceof Error && error.name === "ConflitoDeAcesso";
    return resposta(
      conflito ? 409 : 500,
      conflito
        ? "Este profissional foi alterado durante o cadastro. Atualize a página e tente novamente."
        : "Não foi possível concluir o acesso profissional. Confira os logs da Edge Function no Supabase.",
    );
  }
});

function resposta(
  status,
  message,
) {
  return new Response(
    JSON.stringify({
      ok: false,
      message,
    }),
    {
      status,
      headers: {
        ...corsHeaders,
        "Content-Type":
          "application/json",
      },
    },
  );
}

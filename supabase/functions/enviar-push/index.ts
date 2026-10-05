import webpush from "npm:web-push@3.6.7";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL") ?? "";

const SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";

const VAPID_PUBLIC_KEY = Deno.env.get("VAPID_PUBLIC_KEY") ?? "";

const VAPID_PRIVATE_KEY = Deno.env.get("VAPID_PRIVATE_KEY") ?? "";

const VAPID_SUBJECT = Deno.env.get("VAPID_SUBJECT") ?? "";

const PUSH_WEBHOOK_SECRET = Deno.env.get("PUSH_WEBHOOK_SECRET") ?? "";

function validarConfiguracao() {
  const ausentes: string[] = [];

  if (!SUPABASE_URL) {
    ausentes.push("SUPABASE_URL");
  }

  if (!SERVICE_ROLE_KEY) {
    ausentes.push("SUPABASE_SERVICE_ROLE_KEY");
  }

  if (!VAPID_PUBLIC_KEY) {
    ausentes.push("VAPID_PUBLIC_KEY");
  }

  if (!VAPID_PRIVATE_KEY) {
    ausentes.push("VAPID_PRIVATE_KEY");
  }

  if (!VAPID_SUBJECT) {
    ausentes.push("VAPID_SUBJECT");
  }

  if (!PUSH_WEBHOOK_SECRET) {
    ausentes.push("PUSH_WEBHOOK_SECRET");
  }

  if (ausentes.length > 0) {
    throw new Error(`Secrets ausentes: ${ausentes.join(", ")}`);
  }

  if (
    !VAPID_SUBJECT.startsWith("mailto:") &&
    !VAPID_SUBJECT.startsWith("https://")
  ) {
    throw new Error("VAPID_SUBJECT deve começar com mailto: ou https://");
  }
}

validarConfiguracao();

const supabase = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, {
  auth: {
    persistSession: false,
    autoRefreshToken: false,
  },
});

webpush.setVapidDetails(VAPID_SUBJECT, VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY);

const PREFERENCE_BY_TYPE: Record<string, string> = {
  novo_agendamento: "novo_agendamento",

  agendamento_cancelado: "agendamento_cancelado",

  agendamento_alterado: "agendamento_alterado",

  agendamento_confirmado: "agendamento_confirmado",

  lembrete_agendamento: "lembrete_agendamento",

  novo_pedido: "novo_pedido",

  pedido_atualizado: "pedido_atualizado",

  estoque_baixo: "estoque_baixo",

  nova_avaliacao: "nova_avaliacao",

  conta_vencendo: "conta_vencendo",

  conta_vencida: "conta_vencida",

  pagamento_recebido: "pagamento_recebido",
};

function json(body: unknown, status = 200) {
  return Response.json(body, {
    status,
    headers: {
      "Content-Type": "application/json; charset=utf-8",
    },
  });
}

function obterCorpoErroPush(error: any) {
  const body = error?.body;

  if (!body) {
    return null;
  }

  if (typeof body === "string") {
    return body;
  }

  try {
    if (body instanceof Uint8Array || ArrayBuffer.isView(body)) {
      return new TextDecoder().decode(body);
    }
  } catch {
    // Continua abaixo.
  }

  try {
    return JSON.stringify(body);
  } catch {
    return String(body);
  }
}

function sanitizarHeaders(headers: unknown) {
  if (!headers) {
    return null;
  }

  try {
    if (headers instanceof Headers) {
      return Object.fromEntries(headers.entries());
    }

    return headers;
  } catch {
    return null;
  }
}

function obterEndpointHost(endpoint: string) {
  try {
    return new URL(endpoint).host;
  } catch {
    return "invalid-endpoint";
  }
}

async function registrarSucessoSubscription(subscriptionId: string) {
  const agora = new Date().toISOString();

  const { error } = await supabase
    .from("push_subscriptions")
    .update({
      last_success_at: agora,

      updated_at: agora,

      ativo: true,
    })
    .eq("id", subscriptionId);

  if (error) {
    console.error("[BarberSig] Falha ao registrar sucesso da subscription:", {
      subscription_id: subscriptionId,

      error,
    });

    return false;
  }

  return true;
}

async function desativarSubscription(subscriptionId: string) {
  const { error } = await supabase
    .from("push_subscriptions")
    .update({
      ativo: false,

      updated_at: new Date().toISOString(),
    })
    .eq("id", subscriptionId);

  if (error) {
    console.error("[BarberSig] Falha ao desativar subscription:", {
      subscription_id: subscriptionId,

      error,
    });

    return false;
  }

  return true;
}

Deno.serve(async (request) => {
  if (request.method !== "POST") {
    return json(
      {
        ok: false,
        error: "Method not allowed",
      },
      405,
    );
  }

  const webhookSecret = request.headers.get("x-webhook-secret");

  if (!PUSH_WEBHOOK_SECRET || webhookSecret !== PUSH_WEBHOOK_SECRET) {
    console.error("[BarberSig] Webhook não autorizado.");

    return json(
      {
        ok: false,
        error: "Unauthorized",
      },
      401,
    );
  }

  try {
    const payload = await request.json();

    const notification = payload?.record || payload?.notification || payload;

    if (!notification?.id || !notification?.usuario_id) {
      console.log("[BarberSig] Notificação ignorada: destinatário ausente.");

      return json({
        ok: true,

        ignored: true,

        reason: "notification_without_recipient",
      });
    }

    const preferenceColumn = PREFERENCE_BY_TYPE[notification.tipo];

    if (preferenceColumn) {
      const {
        data: preferences,

        error: preferencesError,
      } = await supabase
        .from("preferencias_notificacoes")
        .select("*")
        .eq("usuario_id", notification.usuario_id)
        .maybeSingle();

      if (preferencesError) {
        throw preferencesError;
      }

      if (preferences && preferences[preferenceColumn] === false) {
        console.log("[BarberSig] Push ignorado por preferência do usuário:", {
          usuario_id: notification.usuario_id,

          tipo: notification.tipo,
        });

        return json({
          ok: true,

          sent: 0,

          invalid: 0,

          failed: 0,

          skipped: "preference_disabled",
        });
      }
    }

    const {
      count: unreadCount,

      error: unreadError,
    } = await supabase
      .from("notificacoes")
      .select("id", {
        count: "exact",

        head: true,
      })
      .eq("usuario_id", notification.usuario_id)
      .eq("lida", false);

    if (unreadError) {
      throw unreadError;
    }

    const {
      data: subscriptions,

      error: subscriptionsError,
    } = await supabase
      .from("push_subscriptions")
      .select(
        `
          id,
          endpoint,
          p256dh,
          auth_key,
          dispositivo_nome,
          plataforma,
          navegador,
          ativo
        `,
      )
      .eq("usuario_id", notification.usuario_id)
      .eq("ativo", true);

    if (subscriptionsError) {
      throw subscriptionsError;
    }

    if (!subscriptions?.length) {
      console.log("[BarberSig] Nenhuma subscription ativa:", {
        usuario_id: notification.usuario_id,
      });

      return json({
        ok: true,

        sent: 0,

        invalid: 0,

        failed: 0,

        reason: "no_active_subscription",
      });
    }

    const pushPayload = JSON.stringify({
      notificacao_id: notification.id,

      title: notification.titulo || "BarberSig",

      body: notification.mensagem || "Você recebeu uma nova notificação.",

      url: notification.rota || "/",

      icon: "/icons/icon-192.png",

      badge: "/icons/badge-96.png",

      badge_count: Math.max(0, Number(unreadCount || 0)),

      tag: `${notification.tipo || "barbersig"}:${
        notification.referencia_id || notification.id
      }`,
    });

    let sent = 0;

    let invalid = 0;

    let failed = 0;

    const resultados: Array<{
      subscription_id: string;

      dispositivo: string | null;

      plataforma: string | null;

      navegador: string | null;

      status: string;
    }> = [];

    for (const subscription of subscriptions) {
      try {
        await webpush.sendNotification(
          {
            endpoint: subscription.endpoint,

            keys: {
              p256dh: subscription.p256dh,

              auth: subscription.auth_key,
            },
          },

          pushPayload,

          {
            TTL: 60 * 60,

            urgency: "high",
          },
        );

        sent += 1;

        await registrarSucessoSubscription(subscription.id);

        resultados.push({
          subscription_id: subscription.id,

          dispositivo: subscription.dispositivo_nome || null,

          plataforma: subscription.plataforma || null,

          navegador: subscription.navegador || null,

          status: "sent",
        });

        console.log("[BarberSig] Push enviado:", {
          subscription_id: subscription.id,

          dispositivo: subscription.dispositivo_nome || null,

          plataforma: subscription.plataforma || null,

          navegador: subscription.navegador || null,

          endpoint_host: obterEndpointHost(subscription.endpoint),

          notificacao_id: notification.id,
        });
      } catch (error: any) {
        const statusCode = Number(error?.statusCode || error?.status || 0);

        const responseBody = obterCorpoErroPush(error);

        const responseHeaders = sanitizarHeaders(error?.headers);

        if (statusCode === 404 || statusCode === 410) {
          invalid += 1;

          await desativarSubscription(subscription.id);

          resultados.push({
            subscription_id: subscription.id,

            dispositivo: subscription.dispositivo_nome || null,

            plataforma: subscription.plataforma || null,

            navegador: subscription.navegador || null,

            status: "invalid",
          });

          console.warn("[BarberSig] Subscription inválida desativada:", {
            subscription_id: subscription.id,

            dispositivo: subscription.dispositivo_nome || null,

            endpoint_host: obterEndpointHost(subscription.endpoint),

            statusCode,

            body: responseBody,
          });
        } else {
          failed += 1;

          resultados.push({
            subscription_id: subscription.id,

            dispositivo: subscription.dispositivo_nome || null,

            plataforma: subscription.plataforma || null,

            navegador: subscription.navegador || null,

            status: "failed",
          });

          console.error("[BarberSig] Push failed:", {
            subscription_id: subscription.id,

            dispositivo: subscription.dispositivo_nome || null,

            plataforma: subscription.plataforma || null,

            navegador: subscription.navegador || null,

            endpoint_host: obterEndpointHost(subscription.endpoint),

            statusCode,

            message: error?.message || null,

            body: responseBody,

            headers: responseHeaders,
          });
        }
      }
    }

    if (sent > 0) {
      const { error: updateError } = await supabase
        .from("notificacoes")
        .update({
          push_enviado_at: new Date().toISOString(),
        })
        .eq("id", notification.id);

      if (updateError) {
        console.error("[BarberSig] Falha ao registrar push_enviado_at:", {
          notificacao_id: notification.id,

          error: updateError,
        });
      }
    }

    const unread = Math.max(0, Number(unreadCount || 0));

    console.log("[BarberSig] Resultado do envio:", {
      notificacao_id: notification.id,

      usuario_id: notification.usuario_id,

      subscriptions: subscriptions.length,

      sent,

      invalid,

      failed,

      unread,

      resultados,
    });

    return json({
      ok: true,

      sent,

      invalid,

      failed,

      unread,

      subscriptions: subscriptions.length,

      resultados,
    });
  } catch (error) {
    console.error("[BarberSig] enviar-push:", error);

    return json(
      {
        ok: false,

        error: error instanceof Error ? error.message : "Erro interno",
      },
      500,
    );
  }
});

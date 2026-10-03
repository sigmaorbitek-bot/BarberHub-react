import webpush from "npm:web-push@3.6.7";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;

const SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

const VAPID_PUBLIC_KEY = Deno.env.get("VAPID_PUBLIC_KEY")!;

const VAPID_PRIVATE_KEY = Deno.env.get("VAPID_PRIVATE_KEY")!;

const VAPID_SUBJECT = Deno.env.get("VAPID_SUBJECT")!;

const PUSH_WEBHOOK_SECRET = Deno.env.get("PUSH_WEBHOOK_SECRET")!;

const supabase = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, {
  auth: {
    persistSession: false,
  },
});

webpush.setVapidDetails(VAPID_SUBJECT, VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY);

const PREFERENCE_BY_TYPE: Record<string, string> = {
  novo_agendamento: "novo_agendamento",
  agendamento_cancelado: "agendamento_cancelado",
  agendamento_confirmado: "agendamento_confirmado",
  novo_pedido: "novo_pedido",
  pedido_atualizado: "pedido_atualizado",
  estoque_baixo: "estoque_baixo",
  nova_avaliacao: "nova_avaliacao",
  conta_vencendo: "conta_vencendo",
  conta_vencida: "conta_vencida",
  pagamento_recebido: "pagamento_recebido",
};

Deno.serve(async (request) => {
  if (request.method !== "POST") {
    return new Response("Method not allowed", {
      status: 405,
    });
  }

  if (request.headers.get("x-webhook-secret") !== PUSH_WEBHOOK_SECRET) {
    return new Response("Unauthorized", {
      status: 401,
    });
  }

  try {
    const payload = await request.json();

    const notification = payload?.record || payload?.notification || payload;

    if (!notification?.id || !notification?.usuario_id) {
      return Response.json({
        ok: true,
        ignored: true,
      });
    }

    const preferenceColumn = PREFERENCE_BY_TYPE[notification.tipo];

    if (preferenceColumn) {
      const { data: preferences, error: preferencesError } = await supabase
        .from("preferencias_notificacoes")
        .select("*")
        .eq("usuario_id", notification.usuario_id)
        .maybeSingle();

      if (preferencesError) {
        throw preferencesError;
      }

      if (preferences && preferences[preferenceColumn] === false) {
        return Response.json({
          ok: true,
          skipped: "preference_disabled",
        });
      }
    }

    const { data: subscriptions, error: subscriptionsError } = await supabase
      .from("push_subscriptions")
      .select("id, endpoint, p256dh, auth_key")
      .eq("usuario_id", notification.usuario_id)
      .eq("ativo", true);

    if (subscriptionsError) {
      throw subscriptionsError;
    }

    if (!subscriptions?.length) {
      return Response.json({
        ok: true,
        sent: 0,
      });
    }

    const pushPayload = JSON.stringify({
      notificacao_id: notification.id,
      title: notification.titulo || "BarberHub",
      body: notification.mensagem || "Você recebeu uma nova notificação.",
      url: notification.rota || "/",
      icon: "/barber.png",
      badge: "/barber.png",
      tag: `${notification.tipo || "barberhub"}:${notification.referencia_id || notification.id}`,
    });

    let sent = 0;
    let invalid = 0;

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
      } catch (error: any) {
        const statusCode = Number(error?.statusCode || error?.status);

        if (statusCode === 404 || statusCode === 410) {
          invalid += 1;

          await supabase
            .from("push_subscriptions")
            .update({
              ativo: false,
            })
            .eq("id", subscription.id);
        } else {
          console.error("Push failed:", error);
        }
      }
    }

    if (sent > 0) {
      await supabase
        .from("notificacoes")
        .update({
          push_enviado_at: new Date().toISOString(),
        })
        .eq("id", notification.id);
    }

    return Response.json({
      ok: true,
      sent,
      invalid,
    });
  } catch (error) {
    console.error("enviar-push:", error);

    return Response.json(
      {
        ok: false,
        error: error instanceof Error ? error.message : "Erro interno",
      },
      {
        status: 500,
      },
    );
  }
});

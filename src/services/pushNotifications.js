import { supabase } from "./supabase";

const VAPID_PUBLIC_KEY =
  import.meta.env.VITE_VAPID_PUBLIC_KEY;

function urlBase64ToUint8Array(base64String) {
  const padding =
    "=".repeat(
      (4 -
        (base64String.length %
          4)) %
        4,
    );

  const base64 = (
    base64String + padding
  )
    .replace(/-/g, "+")
    .replace(/_/g, "/");

  const rawData =
    window.atob(base64);

  return Uint8Array.from(
    [...rawData].map(
      (char) =>
        char.charCodeAt(0),
    ),
  );
}

export function suportaPush() {
  return (
    "serviceWorker" in
      navigator &&
    "PushManager" in
      window &&
    "Notification" in
      window
  );
}

export function ehIOS() {
  return (
    /iPhone|iPad|iPod/i.test(
      navigator.userAgent,
    ) ||
    (
      navigator.platform ===
        "MacIntel" &&
      navigator.maxTouchPoints >
        1
    )
  );
}

export function estaStandalone() {
  return (
    window.matchMedia(
      "(display-mode: standalone)",
    ).matches ||
    window.navigator
      .standalone === true
  );
}

export async function registrarServiceWorker() {
  if (
    !(
      "serviceWorker" in
      navigator
    )
  ) {
    return null;
  }

  return navigator.serviceWorker.register(
    "/sw.js",
    {
      scope: "/",
    },
  );
}

export async function obterEstadoPush() {
  const supported =
    suportaPush();

  const ios =
    ehIOS();

  const standalone =
    estaStandalone();

  if (!supported) {
    return {
      supported: false,
      ios,
      standalone,
      permission:
        "unsupported",
      subscribed: false,
    };
  }

  const registro =
    await registrarServiceWorker();

  const subscription =
    registro
      ? await registro.pushManager.getSubscription()
      : null;

  return {
    supported: true,
    ios,
    standalone,
    permission:
      Notification.permission,
    subscribed:
      Boolean(subscription),
  };
}

export async function ativarPush() {
  if (!suportaPush()) {
    throw new Error(
      "Este navegador não oferece suporte a notificações push.",
    );
  }

  if (
    ehIOS() &&
    !estaStandalone()
  ) {
    throw new Error(
      "No iPhone/iPad, adicione o BarberHub à Tela de Início e abra pelo ícone antes de ativar notificações.",
    );
  }

  if (!VAPID_PUBLIC_KEY) {
    throw new Error(
      "VITE_VAPID_PUBLIC_KEY não foi configurada.",
    );
  }

  const permissao =
    await Notification.requestPermission();

  if (
    permissao !== "granted"
  ) {
    throw new Error(
      "A permissão de notificações não foi concedida.",
    );
  }

  const registro =
    await registrarServiceWorker();

  if (!registro) {
    throw new Error(
      "Não foi possível registrar o Service Worker.",
    );
  }

  let subscription =
    await registro.pushManager.getSubscription();

  if (!subscription) {
    subscription =
      await registro.pushManager.subscribe(
        {
          userVisibleOnly:
            true,
          applicationServerKey:
            urlBase64ToUint8Array(
              VAPID_PUBLIC_KEY,
            ),
        },
      );
  }

  const json =
    subscription.toJSON();

  const endpoint =
    json.endpoint;

  const p256dh =
    json.keys?.p256dh;

  const auth =
    json.keys?.auth;

  if (
    !endpoint ||
    !p256dh ||
    !auth
  ) {
    throw new Error(
      "A assinatura push retornada pelo navegador é inválida.",
    );
  }

  const { error } =
    await supabase.rpc(
      "salvar_push_subscription",
      {
        p_endpoint:
          endpoint,
        p_p256dh:
          p256dh,
        p_auth_key:
          auth,
        p_user_agent:
          navigator.userAgent,
      },
    );

  if (error) {
    throw error;
  }

  return subscription;
}

export async function desativarPush() {
  if (
    !(
      "serviceWorker" in
      navigator
    )
  ) {
    return;
  }

  const registro =
    await navigator.serviceWorker.ready;

  const subscription =
    await registro.pushManager.getSubscription();

  if (!subscription) {
    return;
  }

  await supabase.rpc(
    "desativar_push_subscription",
    {
      p_endpoint:
        subscription.endpoint,
    },
  );

  await subscription.unsubscribe();
}

import { supabase } from "./supabase";

const VAPID_PUBLIC_KEY = import.meta.env.VITE_VAPID_PUBLIC_KEY || "";

function base64ToUint8Array(base64String) {
  const padding = "=".repeat((4 - (base64String.length % 4)) % 4);

  const base64 = (base64String + padding).replace(/-/g, "+").replace(/_/g, "/");

  const rawData = window.atob(base64);

  return Uint8Array.from([...rawData].map((char) => char.charCodeAt(0)));
}

export function pushSupported() {
  return (
    "Notification" in window &&
    "serviceWorker" in navigator &&
    "PushManager" in window
  );
}

export function notificationPermission() {
  if (!("Notification" in window)) {
    return "unsupported";
  }

  return Notification.permission;
}

export async function registerBarberHubServiceWorker() {
  if (!("serviceWorker" in navigator)) {
    throw new Error("Este navegador não suporta Service Worker.");
  }

  const registration = await navigator.serviceWorker.register("/sw.js", {
    scope: "/",
  });

  await navigator.serviceWorker.ready;

  return registration;
}

async function saveSubscription(subscription) {
  if (!subscription) {
    throw new Error("Assinatura Web Push não encontrada.");
  }

  const json = subscription.toJSON();

  const endpoint = subscription.endpoint;

  const p256dh = json.keys?.p256dh;

  const authKey = json.keys?.auth;

  if (!endpoint || !p256dh || !authKey) {
    throw new Error("A inscrição de notificações está incompleta.");
  }

  const { error } = await supabase.rpc("salvar_push_subscription", {
    p_endpoint: endpoint,
    p_p256dh: p256dh,
    p_auth_key: authKey,
    p_user_agent: navigator.userAgent,
  });

  if (error) {
    throw error;
  }

  return subscription;
}

export async function getCurrentPushSubscription() {
  if (!pushSupported()) {
    return null;
  }

  const registration = await registerBarberHubServiceWorker();

  return registration.pushManager.getSubscription();
}

export async function enableWebPush() {
  if (!pushSupported()) {
    throw new Error("Web Push não é suportado neste navegador.");
  }

  if (!VAPID_PUBLIC_KEY) {
    throw new Error("A chave pública VAPID não está configurada.");
  }

  let permission = Notification.permission;

  if (permission === "default") {
    permission = await Notification.requestPermission();
  }

  if (permission === "denied") {
    throw new Error(
      "As notificações estão bloqueadas no navegador. Libere a permissão nas configurações do site.",
    );
  }

  if (permission !== "granted") {
    throw new Error("A permissão de notificações não foi concedida.");
  }

  const registration = await registerBarberHubServiceWorker();

  let subscription = await registration.pushManager.getSubscription();

  if (!subscription) {
    subscription = await registration.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey: base64ToUint8Array(VAPID_PUBLIC_KEY),
    });
  }

  await saveSubscription(subscription);

  return subscription;
}

export async function disableWebPush() {
  if (!pushSupported()) {
    return false;
  }

  const registration = await registerBarberHubServiceWorker();

  const subscription = await registration.pushManager.getSubscription();

  if (!subscription) {
    return true;
  }

  const endpoint = subscription.endpoint;

  const { error } = await supabase.rpc("desativar_push_subscription", {
    p_endpoint: endpoint,
  });

  if (error) {
    throw error;
  }

  await subscription.unsubscribe();

  return true;
}

export async function getWebPushStatus() {
  if (!pushSupported()) {
    return {
      supported: false,
      permission: "unsupported",
      active: false,
      subscription: null,
    };
  }

  const permission = Notification.permission;

  if (permission !== "granted") {
    return {
      supported: true,
      permission,
      active: false,
      subscription: null,
    };
  }

  try {
    const subscription = await getCurrentPushSubscription();

    return {
      supported: true,
      permission,
      active: Boolean(subscription),
      subscription: subscription || null,
    };
  } catch (error) {
    console.warn("[BarberHub] Não foi possível verificar o Web Push:", error);

    return {
      supported: true,
      permission,
      active: false,
      subscription: null,
    };
  }
}

/*
 * Compatibilidade com componentes antigos
 */

export async function ativarPush() {
  return enableWebPush();
}

export async function desativarPush() {
  return disableWebPush();
}

export async function verificarStatusPush() {
  return getWebPushStatus();
}

export async function obterEstadoPush() {
  return getWebPushStatus();
}

export async function obterPushSubscriptionAtual() {
  return getCurrentPushSubscription();
}

export async function registrarServiceWorker() {
  return registerBarberHubServiceWorker();
}

export async function registrarServiceWorkerPush() {
  return registerBarberHubServiceWorker();
}

export function suportaPush() {
  return pushSupported();
}

export function obterPermissaoPush() {
  return notificationPermission();
}

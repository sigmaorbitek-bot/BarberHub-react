import { supabase } from "./supabase";

const VAPID_PUBLIC_KEY = import.meta.env.VITE_VAPID_PUBLIC_KEY || "";

function base64ToUint8Array(base64String) {
  const padding = "=".repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, "+").replace(/_/g, "/");
  const rawData = window.atob(base64);

  return Uint8Array.from([...rawData].map((char) => char.charCodeAt(0)));
}

export function isIOS() {
  const ua = navigator.userAgent || "";
  const platform = navigator.platform || "";
  const touchPoints = Number(navigator.maxTouchPoints || 0);

  return (
    /iPad|iPhone|iPod/i.test(ua) ||
    (platform === "MacIntel" && touchPoints > 1)
  );
}

export function isStandaloneApp() {
  return (
    window.matchMedia?.("(display-mode: standalone)")?.matches === true ||
    window.matchMedia?.("(display-mode: fullscreen)")?.matches === true ||
    window.navigator.standalone === true
  );
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

function secureContextAvailable() {
  if (window.isSecureContext) {
    return true;
  }

  return ["localhost", "127.0.0.1", "::1"].includes(window.location.hostname);
}

export async function registerBarberHubServiceWorker() {
  if (!("serviceWorker" in navigator)) {
    throw new Error("Este navegador não suporta Service Worker.");
  }

  if (!secureContextAvailable()) {
    throw new Error("Notificações exigem HTTPS. Abra o BarberHub pelo endereço seguro.");
  }

  const registration = await navigator.serviceWorker.register("/sw.js", {
    scope: "/",
    updateViaCache: "none",
  });

  try {
    await registration.update();
  } catch (error) {
    console.warn("[BarberHub] Não foi possível verificar atualização do Service Worker:", error);
  }

  if (registration.waiting) {
    registration.waiting.postMessage({ type: "SKIP_WAITING" });
  }

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

export async function syncAppBadgeFromDatabase() {
  if (!("setAppBadge" in navigator) && !("clearAppBadge" in navigator)) {
    return;
  }

  try {
    const { count, error } = await supabase
      .from("notificacoes")
      .select("id", { count: "exact", head: true })
      .eq("lida", false);

    if (error) {
      throw error;
    }

    const unread = Math.max(0, Number(count || 0));

    if (unread > 0 && "setAppBadge" in navigator) {
      await navigator.setAppBadge(unread);
    } else if ("clearAppBadge" in navigator) {
      await navigator.clearAppBadge();
    }
  } catch (error) {
    console.warn("[BarberHub] Não foi possível sincronizar o badge do app:", error);
  }
}

export async function enableWebPush() {
  const ios = isIOS();
  const standalone = isStandaloneApp();

  if (ios && !standalone) {
    throw new Error(
      "No iPhone/iPad, adicione o BarberHub à Tela de Início, abra pelo ícone e tente novamente.",
    );
  }

  if (!pushSupported()) {
    throw new Error("Web Push não é suportado neste navegador ou dispositivo.");
  }

  if (!secureContextAvailable()) {
    throw new Error("Notificações exigem HTTPS.");
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
      "As notificações estão bloqueadas. Libere a permissão nas configurações do navegador ou do sistema.",
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
  await syncAppBadgeFromDatabase();

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
  const ios = isIOS();
  const standalone = isStandaloneApp();
  const supported = pushSupported();
  const permission = notificationPermission();

  const base = {
    ios,
    standalone,
    supported,
    permission,
    active: false,
    subscribed: false,
    subscription: null,
    canActivate: supported && (!ios || standalone),
  };

  if (!supported || permission !== "granted") {
    return base;
  }

  try {
    const subscription = await getCurrentPushSubscription();

    if (subscription) {
      // Mantém o endpoint associado ao usuário que está logado agora.
      await saveSubscription(subscription);
    }

    const active = Boolean(subscription);

    return {
      ...base,
      active,
      subscribed: active,
      subscription: subscription || null,
    };
  } catch (error) {
    console.warn("[BarberHub] Não foi possível verificar o Web Push:", error);
    return base;
  }
}

/* Compatibilidade com componentes antigos */
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

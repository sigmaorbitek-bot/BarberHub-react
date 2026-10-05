import { supabase } from "./supabase";

const VAPID_PUBLIC_KEY = import.meta.env.VITE_VAPID_PUBLIC_KEY || "";

function base64ToUint8Array(base64String) {
  const padding = "=".repeat((4 - (base64String.length % 4)) % 4);

  const base64 = (base64String + padding).replace(/-/g, "+").replace(/_/g, "/");

  const rawData = window.atob(base64);

  return Uint8Array.from([...rawData].map((char) => char.charCodeAt(0)));
}

function isIOS() {
  const userAgent = navigator.userAgent || "";

  const iOSNormal = /iPhone|iPad|iPod/i.test(userAgent);

  const iPadDesktopMode =
    navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1;

  return iOSNormal || iPadDesktopMode;
}

function isStandalone() {
  return (
    window.matchMedia?.("(display-mode: standalone)")?.matches === true ||
    window.navigator.standalone === true
  );
}

function detectarNavegador() {
  const userAgent = navigator.userAgent || "";

  if (/Edg\//i.test(userAgent)) {
    return "Microsoft Edge";
  }

  if (/OPR\//i.test(userAgent)) {
    return "Opera";
  }

  if (/Chrome\//i.test(userAgent) && !/Edg\//i.test(userAgent)) {
    return "Google Chrome";
  }

  if (/Safari\//i.test(userAgent) && !/Chrome\//i.test(userAgent)) {
    return "Safari";
  }

  if (/Firefox\//i.test(userAgent)) {
    return "Firefox";
  }

  return "Navegador";
}

function detectarPlataforma() {
  const userAgent = navigator.userAgent || "";

  if (/Android/i.test(userAgent)) {
    return "Android";
  }

  if (isIOS()) {
    return "iOS";
  }

  if (/Windows/i.test(userAgent)) {
    return "Windows";
  }

  if (/Macintosh|Mac OS X/i.test(userAgent)) {
    return "macOS";
  }

  if (/Linux/i.test(userAgent)) {
    return "Linux";
  }

  return "Outro";
}

function detectarTipoDispositivo() {
  const userAgent = navigator.userAgent || "";

  if (/iPad|Tablet/i.test(userAgent)) {
    return "Tablet";
  }

  if (/Android/i.test(userAgent) && !/Mobile/i.test(userAgent)) {
    return "Tablet";
  }

  if (/Mobile|iPhone|Android/i.test(userAgent)) {
    return "Celular";
  }

  return "Computador";
}

function obterNomeDispositivo() {
  const navegador = detectarNavegador();

  const plataforma = detectarPlataforma();

  const tipo = detectarTipoDispositivo();

  const pwa = isStandalone() ? " · PWA" : "";

  return `${tipo} · ${navegador} · ${plataforma}${pwa}`;
}

function obterDadosDispositivo() {
  return {
    nome: obterNomeDispositivo(),
    plataforma: detectarPlataforma(),
    navegador: detectarNavegador(),
  };
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

export async function registerBarberSigServiceWorker() {
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

  const dispositivo = obterDadosDispositivo();

  const { error } = await supabase.rpc("salvar_push_subscription_v2", {
    p_endpoint: endpoint,

    p_p256dh: p256dh,

    p_auth_key: authKey,

    p_user_agent: navigator.userAgent,

    p_dispositivo_nome: dispositivo.nome,

    p_plataforma: dispositivo.plataforma,

    p_navegador: dispositivo.navegador,
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

  const registration = await registerBarberSigServiceWorker();

  return registration.pushManager.getSubscription();
}

export async function enableWebPush() {
  if (!pushSupported()) {
    throw new Error("Web Push não é suportado neste navegador.");
  }

  if (!VAPID_PUBLIC_KEY) {
    throw new Error("A chave pública VAPID não está configurada.");
  }

  if (isIOS() && !isStandalone()) {
    throw new Error(
      "No iPhone ou iPad, adicione o BarberSig à Tela de Início antes de ativar as notificações.",
    );
  }

  let permission = Notification.permission;

  if (permission === "default") {
    permission = await Notification.requestPermission();
  }

  if (permission === "denied") {
    throw new Error(
      "As notificações estão bloqueadas neste dispositivo. Libere a permissão nas configurações do navegador.",
    );
  }

  if (permission !== "granted") {
    throw new Error("A permissão de notificações não foi concedida.");
  }

  const registration = await registerBarberSigServiceWorker();

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

  const registration = await registerBarberSigServiceWorker();

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

  const standalone = isStandalone();

  const dispositivo = obterDadosDispositivo();

  if (!pushSupported()) {
    return {
      supported: false,

      permission: "unsupported",

      active: false,

      subscribed: false,

      subscription: null,

      ios,

      standalone,

      device: dispositivo,
    };
  }

  const permission = Notification.permission;

  if (permission !== "granted") {
    return {
      supported: true,

      permission,

      active: false,

      subscribed: false,

      subscription: null,

      ios,

      standalone,

      device: dispositivo,
    };
  }

  try {
    const subscription = await getCurrentPushSubscription();

    const active = Boolean(subscription);

    if (subscription) {
      try {
        await saveSubscription(subscription);
      } catch (error) {
        console.warn(
          "[BarberSig] Não foi possível sincronizar a subscription:",
          error,
        );
      }
    }

    return {
      supported: true,

      permission,

      active,

      subscribed: active,

      subscription: subscription || null,

      ios,

      standalone,

      device: dispositivo,
    };
  } catch (error) {
    console.warn("[BarberSig] Não foi possível verificar o Web Push:", error);

    return {
      supported: true,

      permission,

      active: false,

      subscribed: false,

      subscription: null,

      ios,

      standalone,

      device: dispositivo,
    };
  }
}

export async function listarMeusDispositivosPush() {
  const { data, error } = await supabase.rpc("listar_meus_dispositivos_push");

  if (error) {
    throw error;
  }

  return data || [];
}

export async function syncAppBadgeFromDatabase() {
  try {
    const {
      data: { user },
      error: userError,
    } = await supabase.auth.getUser();

    if (userError) {
      throw userError;
    }

    if (!user?.id) {
      return 0;
    }

    const {
      count,
      error,
    } = await supabase
      .from("notificacoes")
      .select("id", {
        count: "exact",
        head: true,
      })
      .eq(
        "usuario_id",
        user.id,
      )
      .eq(
        "lida",
        false,
      );

    if (error) {
      throw error;
    }

    const total =
      Math.max(
        0,
        Number(count || 0),
      );

    try {
      if (
        total > 0 &&
        "setAppBadge" in navigator
      ) {
        await navigator.setAppBadge(
          total,
        );
      } else if (
        total === 0 &&
        "clearAppBadge" in navigator
      ) {
        await navigator.clearAppBadge();
      }
    } catch (badgeError) {
      console.warn(
        "[BarberSig] Não foi possível atualizar o badge do aplicativo:",
        badgeError,
      );
    }

    return total;
  } catch (error) {
    console.warn(
      "[BarberSig] Não foi possível sincronizar o badge:",
      error,
    );

    return 0;
  }
}

/*
 * Compatibilidade com componentes existentes.
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
  return registerBarberSigServiceWorker();
}

export async function registrarServiceWorkerPush() {
  return registerBarberSigServiceWorker();
}

export async function registerBarberHubServiceWorker() {
  return registerBarberSigServiceWorker();
}

export function suportaPush() {
  return pushSupported();
}

export function obterPermissaoPush() {
  return notificationPermission();
}

export function obterDadosDispositivoAtual() {
  return obterDadosDispositivo();
}

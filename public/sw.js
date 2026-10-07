const BARBERHUB_SW_VERSION = "2026-10-07.1";

self.addEventListener("install", () => {
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(self.clients.claim());
});

self.addEventListener("message", (event) => {
  if (event.data?.type === "SKIP_WAITING") {
    self.skipWaiting();
  }
});

self.addEventListener("push", (event) => {
  let payload = {};

  try {
    payload = event.data ? event.data.json() : {};
  } catch {
    payload = {
      title: "BarberHub",
      body: event.data
        ? event.data.text()
        : "Você recebeu uma nova notificação.",
    };
  }

  const title = payload.title || "BarberHub";
  const badgeCount = Math.max(0, Number(payload.badge_count || 0));

  const options = {
    body: payload.body || "Você recebeu uma nova notificação.",

    icon: payload.icon || "/icons/icon-192.png",
    badge: payload.badge || "/icons/badge-96.png",
    tag: payload.tag || `barberhub:${payload.notificacao_id || Date.now()}`,
    renotify: true,
    requireInteraction: false,
    data: {
      url: payload.url || "/",
      notificacao_id: payload.notificacao_id || null,
      sw_version: BARBERHUB_SW_VERSION,
    },
  };

  const tasks = [self.registration.showNotification(title, options)];

  if (badgeCount > 0 && "setAppBadge" in self.navigator) {
    tasks.push(self.navigator.setAppBadge(badgeCount));
  } else if (badgeCount === 0 && "clearAppBadge" in self.navigator) {
    tasks.push(self.navigator.clearAppBadge());
  }

  event.waitUntil(Promise.allSettled(tasks));
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();

  const rawTarget = event.notification?.data?.url || "/";

  const target = new URL(rawTarget, self.location.origin);

  if (target.origin !== self.location.origin) {
    target.href = self.location.origin;
  }

  event.waitUntil(
    self.clients
      .matchAll({
        type: "window",
        includeUncontrolled: true,
      })
      .then(async (clientList) => {
        for (const client of clientList) {
          const clientUrl = new URL(client.url);

          if (clientUrl.origin === self.location.origin) {
            if ("navigate" in client) {
              await client.navigate(target.href);
            }

            return client.focus();
          }
        }

        return self.clients.openWindow(target.href);
      }),
  );
});

const CACHE_VERSION = "barberhub-v1";
const DEFAULT_URL = "/";

self.addEventListener(
  "install",
  () => {
    self.skipWaiting();
  },
);

self.addEventListener(
  "activate",
  (event) => {
    event.waitUntil(
      self.clients.claim(),
    );
  },
);

self.addEventListener(
  "push",
  (event) => {
    let payload = {};

    try {
      payload =
        event.data
          ? event.data.json()
          : {};
    } catch {
      payload = {
        title: "BarberHub",
        body:
          event.data?.text() ||
          "Você recebeu uma nova notificação.",
      };
    }

    const title =
      payload.title ||
      "BarberHub";

    const options = {
      body:
        payload.body ||
        payload.mensagem ||
        "Você recebeu uma nova notificação.",
      icon:
        payload.icon ||
        "/barber.png",
      badge:
        payload.badge ||
        "/barber.png",
      tag:
        payload.tag ||
        payload.notificacao_id ||
        undefined,
      renotify: true,
      data: {
        url:
          payload.url ||
          DEFAULT_URL,
        notificacao_id:
          payload.notificacao_id ||
          null,
      },
    };

    event.waitUntil(
      self.registration.showNotification(
        title,
        options,
      ),
    );
  },
);

self.addEventListener(
  "notificationclick",
  (event) => {
    event.notification.close();

    const url =
      event.notification.data
        ?.url ||
      DEFAULT_URL;

    event.waitUntil(
      self.clients
        .matchAll({
          type: "window",
          includeUncontrolled:
            true,
        })
        .then(
          async (clients) => {
            for (
              const client
              of clients
            ) {
              const clientUrl =
                new URL(
                  client.url,
                );

              if (
                clientUrl.origin ===
                self.location
                  .origin
              ) {
                await client.focus();
                client.navigate(
                  url,
                );
                return;
              }
            }

            return self.clients.openWindow(
              url,
            );
          },
        ),
    );
  },
);

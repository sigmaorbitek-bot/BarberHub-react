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

  const options = {
    body: payload.body || "Você recebeu uma nova notificação.",
    icon: payload.icon || "/barber.png",
    badge: payload.badge || "/barber.png",
    tag: payload.tag || "barberhub",
    renotify: true,
    data: {
      url: payload.url || "/cliente/notificacoes",
      notificacao_id: payload.notificacao_id || null,
    },
  };

  event.waitUntil(self.registration.showNotification(title, options));
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();

  const targetUrl = event.notification?.data?.url || "/";

  event.waitUntil(
    clients
      .matchAll({
        type: "window",
        includeUncontrolled: true,
      })
      .then((clientList) => {
        for (const client of clientList) {
          const url = new URL(client.url);

          if (url.origin === self.location.origin) {
            client.navigate(targetUrl);

            return client.focus();
          }
        }

        return clients.openWindow(targetUrl);
      }),
  );
});

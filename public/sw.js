// Service worker voor Truck & Trailer — verwerkt push-meldingen zodat beheer/
// werkplaats een melding krijgt bij een nieuwe chauffeursmelding, ook als de
// app dicht is.

self.addEventListener("install", () => self.skipWaiting());
self.addEventListener("activate", (event) => event.waitUntil(self.clients.claim()));

// Bewust GEEN fetch-handler: we cachen niets, en een lege handler zou elk
// request (ook alle API-calls) nodeloos door de service-worker-dispatch sturen.
// Moderne browsers eisen geen fetch-handler meer voor installeerbaarheid.

self.addEventListener("push", (event) => {
  let data = {};
  try { data = event.data ? event.data.json() : {}; }
  catch { data = { body: event.data && event.data.text() }; }
  const title = data.title || "Truck & Trailer";
  const options = {
    body: data.body || "Nieuwe melding",
    icon: "/icon-192.png",
    badge: "/icon-192.png",
    data: { url: data.url || "/" },
    tag: "tt-melding",
    renotify: true,
  };
  event.waitUntil(self.registration.showNotification(title, options));
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const url = (event.notification.data && event.notification.data.url) || "/";
  event.waitUntil(
    self.clients.matchAll({ type: "window", includeUncontrolled: true }).then((list) => {
      for (const c of list) {
        if ("focus" in c) { try { c.navigate(url); } catch (e) { /* ignore */ } return c.focus(); }
      }
      if (self.clients.openWindow) return self.clients.openWindow(url);
    })
  );
});

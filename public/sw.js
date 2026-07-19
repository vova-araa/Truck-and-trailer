// Service worker voor Truck & Trailer — verwerkt push-meldingen zodat beheer/
// werkplaats een melding krijgt bij een nieuwe chauffeursmelding, ook als de
// app dicht is.

self.addEventListener("install", () => self.skipWaiting());
self.addEventListener("activate", (event) => event.waitUntil(self.clients.claim()));

// Pass-through fetch-handler. We cachen (nog) niets, maar de aanwezigheid van
// een fetch-handler is nodig zodat de browser de app als "installeerbaar" ziet.
self.addEventListener("fetch", () => { /* netwerk doet het werk */ });

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

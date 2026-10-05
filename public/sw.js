// Service worker da Agenda Inteligente — notificações (etapa 8C).
// Recebe o Web Push, mostra a notificação com as ações "Concluir" e "Adiar"
// e manda a ação de volta para /api/notifications/action (token assinado, sem depender da sessão).

self.addEventListener("install", () => self.skipWaiting());
self.addEventListener("activate", (event) => event.waitUntil(self.clients.claim()));

self.addEventListener("push", (event) => {
  let data = {};
  try {
    data = event.data ? event.data.json() : {};
  } catch {
    data = { title: "Agenda Inteligente", body: event.data ? event.data.text() : "" };
  }
  const title = data.title || "Agenda Inteligente";
  event.waitUntil(
    self.registration.showNotification(title, {
      body: data.body || "",
      tag: data.tag,
      renotify: !!data.tag,
      icon: "/icons/icon-192.png",
      badge: "/icons/badge-96.png",
      lang: "pt-BR",
      requireInteraction: data.priority === 1, // P1 fica na tela até você agir
      data: { url: data.url || "/agenda", token: data.token || null },
      actions: Array.isArray(data.actions) ? data.actions : [],
    }),
  );
});

async function openApp(url) {
  const target = new URL(url, self.location.origin).href;
  const all = await self.clients.matchAll({ type: "window", includeUncontrolled: true });
  for (const client of all) {
    if (new URL(client.url).origin === self.location.origin) {
      await client.focus();
      if ("navigate" in client) await client.navigate(target).catch(() => undefined);
      return;
    }
  }
  await self.clients.openWindow(target);
}

async function runAction(action, data) {
  try {
    const res = await fetch("/api/notifications/action", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ token: data.token, action }),
    });
    if (res.ok) return;
    // falhou (token expirado, série recorrente…): abre o app no item
    await openApp(data.url);
  } catch {
    await openApp(data.url);
  }
}

self.addEventListener("notificationclick", (event) => {
  const data = event.notification.data || {};
  event.notification.close();
  if ((event.action === "concluir" || event.action === "adiar") && data.token) {
    event.waitUntil(runAction(event.action, data));
    return;
  }
  event.waitUntil(openApp(data.url || "/agenda"));
});

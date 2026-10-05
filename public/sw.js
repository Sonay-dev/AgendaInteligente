// Service worker da Agenda Inteligente.
// - Etapa 9 (PWA): leitura offline — páginas e dados (GET) da rede primeiro, cópia salva quando a rede falha.
// - Etapa 8C: Web Push com as ações "Concluir" e "Adiar" (token assinado, sem depender da sessão).
// Escritas (POST/PATCH/DELETE) nunca passam pelo cache: a fila offline do app cuida delas.

const VERSION = "v1";
const PAGES = `agenda-pages-${VERSION}`;
const DATA = `agenda-data-${VERSION}`;
const ASSETS = `agenda-assets-${VERSION}`;
const KEEP = [PAGES, DATA, ASSETS];
const NETWORK_TIMEOUT_MS = 4000; // rede lenta: depois disso, responde com a cópia salva
// no `next dev` os arquivos mudam sem trocar de nome → sempre rede primeiro
const DEV = ["localhost", "127.0.0.1"].includes(self.location.hostname);

// dados que valem a leitura offline (só do próprio usuário; apagados ao sair da conta)
const CACHEABLE_API = /^\/api\/(events|tasks|inbox|categories|counts|google\/status)(\/|$)/;

self.addEventListener("install", () => self.skipWaiting());
self.addEventListener("activate", (event) => {
  event.waitUntil(
    (async () => {
      const keys = await caches.keys();
      await Promise.all(keys.filter((k) => k.startsWith("agenda-") && !KEEP.includes(k)).map((k) => caches.delete(k)));
      await self.clients.claim();
    })(),
  );
});

/** Rede primeiro (com tempo-limite); guarda só respostas 200 sem redirecionamento. */
async function networkFirst(request, cacheName) {
  const cache = await caches.open(cacheName);
  const network = fetch(request).then(async (res) => {
    if (res.ok && !res.redirected && res.type === "basic") await cache.put(request, res.clone());
    return res;
  });
  network.catch(() => undefined); // se a cópia salva já respondeu, a falha da rede não deve virar erro solto
  const timeout = new Promise((resolve) => setTimeout(resolve, NETWORK_TIMEOUT_MS, null));
  try {
    const first = await Promise.race([network, timeout]);
    if (first) return first;
    const cached = await cache.match(request);
    return cached ?? (await network);
  } catch {
    const cached = await cache.match(request);
    if (cached) return cached;
    throw new Error("offline");
  }
}

/**
 * Ao salvar uma página, salva também os arquivos do build que ela usa (scripts, CSS, fontes).
 * Sem isso, arquivos que o navegador reaproveitou da memória nunca passam pelo service worker
 * e a página salva não consegue iniciar offline.
 */
async function cachePageAssets(response) {
  const html = await response.text();
  const urls = new Set(html.match(/\/_next\/static\/[^"'\s)\\<>]+/g) ?? []);
  const cache = await caches.open(ASSETS);
  await Promise.all(
    [...urls].map(async (u) => {
      if (await cache.match(u)) return;
      try {
        const res = await fetch(u);
        if (res.ok) await cache.put(u, res);
      } catch {
        // sem rede no meio do caminho: fica para a próxima visita
      }
    }),
  );
}

async function cacheFirst(request, cacheName) {
  const cache = await caches.open(cacheName);
  const cached = await cache.match(request);
  if (cached) return cached;
  const res = await fetch(request);
  if (res.ok && res.type === "basic") await cache.put(request, res.clone());
  return res;
}

const OFFLINE_HTML = `<!doctype html><html lang="pt-BR"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>Sem conexão</title><style>body{font-family:system-ui,sans-serif;display:grid;place-items:center;min-height:100vh;margin:0;padding:24px;text-align:center;color:#0f172a;background:#fff}
@media(prefers-color-scheme:dark){body{color:#e2e8f0;background:#0a0a0a}}a{color:inherit}</style></head>
<body><main><h1>Sem conexão</h1><p>Esta tela ainda não foi aberta neste aparelho, então não há cópia salva.</p>
<p><a href="/agenda">Abrir a agenda</a> · <a href="/caixa-de-entrada">Caixa de entrada</a> · <a href="/tarefas">Tarefas</a></p></main></body></html>`;

self.addEventListener("fetch", (event) => {
  const req = event.request;
  if (req.method !== "GET") return; // escritas: direto para a rede
  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return;
  if (url.pathname.startsWith("/api/auth") || url.pathname.startsWith("/_next/webpack-hmr") || url.pathname.startsWith("/__nextjs")) return;
  if (req.headers.get("RSC")) return; // navegação interna do Next: se falhar, ele recarrega a página (e cai abaixo)

  if (req.mode === "navigate") {
    event.respondWith(
      networkFirst(req, PAGES)
        .then((res) => {
          if (res.ok && !res.redirected) event.waitUntil(cachePageAssets(res.clone()).catch(() => undefined));
          return res;
        })
        .catch(async () => {
        // sem cópia desta URL exata (ex.: outra data): tenta a mesma tela sem parâmetros
        const fallback = await caches.open(PAGES).then((c) => c.match(url.pathname, { ignoreSearch: true }));
        return fallback ?? new Response(OFFLINE_HTML, { headers: { "Content-Type": "text/html; charset=utf-8" } });
      }),
    );
    return;
  }
  if (CACHEABLE_API.test(url.pathname)) {
    event.respondWith(networkFirst(req, DATA).catch(() => Response.error()));
    return;
  }
  if (url.pathname.startsWith("/_next/static/") || url.pathname.startsWith("/icons/") || url.pathname === "/manifest.webmanifest") {
    event.respondWith((DEV ? networkFirst(req, ASSETS) : cacheFirst(req, ASSETS)).catch(() => Response.error()));
  }
});

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

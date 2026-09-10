/* QRguitar intentionally has no runtime data cache. Only this fixed, anonymous document is stored. */
const CACHE_NAME = "qrguitar-offline-v1";
const CACHE_PREFIX = "qrguitar-offline-";
const OFFLINE_URL = new URL("/offline.html", self.location.origin).href;

self.addEventListener("install", (event) => {
  event.waitUntil((async () => {
    const response = await fetch(new Request(OFFLINE_URL, { credentials: "omit", cache: "reload", redirect: "error" }));
    if (!response.ok || !response.headers.get("content-type")?.includes("text/html")) throw new Error("Offline document unavailable.");
    const html = await response.clone().text();
    if (!html.includes('<meta name="qrguitar-offline" content="v1">')) throw new Error("Unexpected offline document.");
    const cache = await caches.open(CACHE_NAME);
    await cache.put(OFFLINE_URL, response);
    await self.skipWaiting();
  })());
});

self.addEventListener("activate", (event) => {
  event.waitUntil((async () => {
    const names = await caches.keys();
    await Promise.all(names.filter((name) => name.startsWith(CACHE_PREFIX) && name !== CACHE_NAME).map((name) => caches.delete(name)));
    await self.clients.claim();
  })());
});

async function offlineDocument() {
  try {
    const cached = await (await caches.open(CACHE_NAME)).match(OFFLINE_URL);
    if (cached) return cached;
  } catch { /* Storage may be disabled or evicted; still return a truthful static fallback. */ }
  return new Response('<!doctype html><html lang="en"><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>Connect to QRguitar</title><body><main><h1>QRguitar can’t connect.</h1><p>Reconnect to view Profiles or confirm changes.</p><p><a href="">Try again</a></p></main></body></html>', {
    status: 503, headers: { "Content-Type": "text/html; charset=utf-8", "Cache-Control": "no-store" }
  });
}

self.addEventListener("fetch", (event) => {
  const request = event.request;
  const url = new URL(request.url);
  // Do not intercept APIs, POSTs, RSC/prefetch, photos, documents, auth fetches, or cross-origin traffic.
  if (request.method !== "GET" || request.mode !== "navigate" || url.origin !== self.location.origin || /^\/(api|_next)(\/|$)/.test(url.pathname)) return;
  event.respondWith(fetch(request, { cache: "no-store" }).catch(() => offlineDocument()));
});

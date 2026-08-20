// 369Labs service worker — network-first, never serve stale UI when online.
//
// Why: an earlier version used `fetch(e.request)` for navigations, which goes
// through the browser HTTP cache. When the host sends a long Cache-Control on
// index.html, the app kept showing the previous build until a hard refresh.
// Now navigations bypass the HTTP cache entirely (`cache: "no-store"`), so
// every visit gets the latest build. Cached copies are kept only as an
// offline fallback, and old cache versions are purged on activate.

const CACHE = "369labs-v3";

self.addEventListener("install", () => {
  self.skipWaiting();
});

self.addEventListener("activate", (e) => {
  e.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener("fetch", (e) => {
  const req = e.request;
  if (req.method !== "GET") return;

  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return;

  const isNav = req.mode === "navigate";
  const isApi = url.pathname.startsWith("/api") || url.pathname.startsWith("/trpc");

  e.respondWith(
    fetch(isNav ? new Request(req, { cache: "no-store" }) : req)
      .then((res) => {
        if (res && res.ok && !isApi) {
          const copy = res.clone();
          caches.open(CACHE).then((c) => c.put(req, copy));
        }
        return res;
      })
      .catch(() =>
        caches
          .match(req, { ignoreSearch: isNav })
          .then((hit) => hit || (isNav ? caches.match("/") : undefined))
          .then((hit) => hit || new Response("Offline", { status: 503, headers: { "Content-Type": "text/plain" } }))
      )
  );
});

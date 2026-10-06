const CACHE = "meritscholars-v3-200k";
const PRECACHE = [
  "./",
  "./index.html",
  "./styles.css",
  "./app.js",
  "./config.js",
  "./manifest.json",
  "./questions-free.js",
  "./icon-192.png",
  "./icon-512.png",
  "./logo.png"
];

self.addEventListener("install", (e) => {
  e.waitUntil(
    caches.open(CACHE).then((c) => c.addAll(PRECACHE)).catch(() => {})
  );
  self.skipWaiting();
});

self.addEventListener("activate", (e) => {
  e.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k)))
    ).then(() => self.clients.claim())
  );
});

function networkFirst(request) {
  return fetch(request)
    .then((res) => {
      if (res && res.ok) {
        const clone = res.clone();
        caches.open(CACHE).then((c) => c.put(request, clone)).catch(() => {});
      }
      return res;
    })
    .catch(() => caches.match(request));
}

self.addEventListener("fetch", (e) => {
  const url = e.request.url;
  // Always prefer network for app code + question bank so updates show quickly
  if (
    url.includes("/bank/") ||
    url.includes("questions-free.js") ||
    url.includes("questions-full.json") ||
    url.includes("app.js") ||
    url.includes("index.html") ||
    url.includes("styles.css") ||
    url.includes("config.js") ||
    url.includes("sw.js")
  ) {
    e.respondWith(networkFirst(e.request));
    return;
  }
  e.respondWith(
    caches.match(e.request).then((cached) => {
      if (cached) return cached;
      return fetch(e.request).catch(() => caches.match("./index.html"));
    })
  );
});

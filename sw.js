/* Service worker: rende l'app utilizzabile senza connessione.
   Ad ogni modifica dei file dell'app aumenta VERSION, così i telefoni scaricano la versione nuova. */
const VERSION = "qo-v1";
const SHELL = [
  "./",
  "./index.html",
  "./manifest.webmanifest",
  "./js/sync.js",
  "./js/config.js",
  "./icons/icon-192.png",
  "./icons/icon-512.png",
  "./icons/apple-touch-icon.png"
];
const CDN = ["www.gstatic.com", "fonts.googleapis.com", "fonts.gstatic.com"];

self.addEventListener("install", (e) => {
  e.waitUntil(caches.open(VERSION).then((c) => c.addAll(SHELL)).then(() => self.skipWaiting()));
});

self.addEventListener("activate", (e) => {
  e.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== VERSION).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener("fetch", (e) => {
  const req = e.request;
  if (req.method !== "GET") return;
  const url = new URL(req.url);

  // File dell'app: prima la rete (per avere gli aggiornamenti), poi la copia salvata.
  if (url.origin === self.location.origin) {
    e.respondWith(
      fetch(req)
        .then((res) => {
          const copy = res.clone();
          caches.open(VERSION).then((c) => c.put(req, copy));
          return res;
        })
        .catch(() => caches.match(req).then((r) => r || caches.match("./index.html")))
    );
    return;
  }

  // Librerie Firebase e font: la copia salvata, se c'è.
  // Le chiamate al database (firestore.googleapis.com) e al login non passano di qui.
  if (CDN.includes(url.hostname) && (url.hostname !== "www.gstatic.com" || url.pathname.startsWith("/firebasejs/"))) {
    e.respondWith(
      caches.match(req).then((hit) =>
        hit ||
        fetch(req).then((res) => {
          const copy = res.clone();
          caches.open(VERSION).then((c) => c.put(req, copy));
          return res;
        })
      )
    );
  }
});

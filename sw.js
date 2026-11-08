/* Service worker: rende l'app utilizzabile senza connessione.
   Ad ogni modifica dei file dell'app aumenta VERSION, così i telefoni scaricano la versione nuova. */
const VERSION = "qo-v26";
const TILES = "qo-tiles-v1";
const MAX_TILES = 4000;
const SHELL = [
  "./",
  "./index.html",
  "./manifest.webmanifest",
  "./js/sync.js",
  "./js/config.js",
  "./js/mappa.js",
  "./js/inventario.js",
  "./js/meteo.js",
  "./js/prodotti.js",
  "./js/voce.js",
  "./js/terreni.js",
  "./js/sfondo.js",
  "./js/filari.js",
  "./js/forma.js",
  "./js/bancali.js",
  "./js/colture.js",
  "./js/alberi.js",
  "./icons/icon-192.png",
  "./icons/icon-512.png",
  "./icons/apple-touch-icon.png"
];
// Librerie e font: si salvano la prima volta e poi si usano anche senza rete.
const LIB_HOSTS = ["www.gstatic.com", "fonts.googleapis.com", "fonts.gstatic.com", "unpkg.com", "cdn.jsdelivr.net", "cdnjs.cloudflare.com"];
// Riquadri della mappa: si conservano quelli già visti, per riaprire la mappa in vigna senza segnale.
const TILE_HOSTS = ["server.arcgisonline.com", "tile.openstreetmap.org"];

self.addEventListener("install", (e) => {
  e.waitUntil(caches.open(VERSION).then((c) => c.addAll(SHELL)).then(() => self.skipWaiting()));
});

self.addEventListener("activate", (e) => {
  e.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== VERSION && k !== TILES).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

function cacheFirst(req, cacheName, trim) {
  return caches.open(cacheName).then((c) =>
    c.match(req).then((hit) =>
      hit ||
      fetch(req).then((res) => {
        if (res.ok || res.type === "opaque") {
          c.put(req, res.clone()).then(() => trim && trimCache(c));
        }
        return res;
      })
    )
  );
}
let trimming = false;
function trimCache(c) {
  if (trimming) return;
  trimming = true;
  c.keys().then((keys) => {
    const extra = keys.length - MAX_TILES;
    return extra > 0 ? Promise.all(keys.slice(0, extra).map((k) => c.delete(k))) : null;
  }).finally(() => { trimming = false; });
}

self.addEventListener("fetch", (e) => {
  const req = e.request;
  if (req.method !== "GET") return;
  const url = new URL(req.url);

  // File dell'app: prima la rete (per avere gli aggiornamenti), poi la copia salvata.
  if (url.origin === self.location.origin) {
    e.respondWith(
      // "no-cache": chiede sempre a GitHub se il file è cambiato, invece di usare la copia del browser.
      fetch(req, { cache: "no-cache" })
        .then((res) => {
          const copy = res.clone();
          caches.open(VERSION).then((c) => c.put(req, copy));
          return res;
        })
        .catch(() => caches.match(req).then((r) => r || caches.match("./index.html")))
    );
    return;
  }

  if (TILE_HOSTS.includes(url.hostname)) { e.respondWith(cacheFirst(req, TILES, true)); return; }

  // Le chiamate al database (firestore.googleapis.com) e al login non passano di qui.
  if (LIB_HOSTS.includes(url.hostname) && (url.hostname !== "www.gstatic.com" || url.pathname.startsWith("/firebasejs/"))) {
    e.respondWith(cacheFirst(req, VERSION, false));
  }
});

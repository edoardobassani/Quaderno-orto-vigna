/* Sfondo fotografico per le schermate "Direzione dei filari" e "Modifica forma":
   foto satellitare (Esri World Imagery, come nella Mappa) oppure le vostre foto aeree importate nella Mappa.
   Le immagini si mettono dentro la SVG in metri locali, usando S.geo per passare da latitudine e longitudine ai metri.
   Senza S.geo (parcelle create solo con le misure) lo sfondo non c'è. Espone window.QOSfondo. */
(function () {
  "use strict";
  var Q = window.QO;
  if (!Q) return;
  var TILE = "https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/";
  var ATTR = "Immagini © Esri, Maxar, Earthstar Geographics";
  var photos = null, loading = false, onLoad = null;

  function geo() { return Q.getState().geo; }
  function pref(k, d) { try { var v = localStorage.getItem(k); return v == null ? d : v; } catch (e) { return d; } }
  function setPref(k, v) { try { localStorage.setItem(k, String(v)); } catch (e) {} }
  /* sfondo scelto: "sat", "foto" oppure "no" */
  function mode() { if (!geo()) return "no"; var m = pref("qo-sfondo", "sat"); if (m === "foto" && photos && !photos.length) return "sat"; return m; }
  /* quanto si vede il disegno dell'app sopra la foto (da 0,1 a 1) */
  function opacity() { var v = parseFloat(pref("qo-sfondo-op", "0.6")); return isFinite(v) ? Math.max(0.1, Math.min(1, v)) : 0.6; }

  /* ---------------- conversioni ---------------- */
  function kx(G) { return Math.cos(G.lat0 * Math.PI / 180) * 111320; }
  function toLL(G, x, y) { return [G.lat0 - (y - G.oy) / 110574, G.lon0 + (x - G.ox) / kx(G)]; }
  function toXY(G, lat, lon) { return [G.ox + (lon - G.lon0) * kx(G), G.oy + (G.lat0 - lat) * 110574]; }
  function lon2t(lon, z) { return (lon + 180) / 360 * Math.pow(2, z); }
  function lat2t(lat, z) { var r = lat * Math.PI / 180; return (1 - Math.log(Math.tan(r) + 1 / Math.cos(r)) / Math.PI) / 2 * Math.pow(2, z); }
  function t2lon(x, z) { return x / Math.pow(2, z) * 360 - 180; }
  function t2lat(y, z) { var n = Math.PI - 2 * Math.PI * y / Math.pow(2, z); return 180 / Math.PI * Math.atan(0.5 * (Math.exp(n) - Math.exp(-n))); }

  /* ---------------- foto aeree (stesso archivio della Mappa) ---------------- */
  function loadPhotos() {
    if (photos || loading || !window.indexedDB) { if (!window.indexedDB) photos = []; return; }
    loading = true;
    try {
      var r = indexedDB.open("qo-foto", 1);
      r.onupgradeneeded = function () { r.result.createObjectStore("img", { keyPath: "id" }); };
      r.onsuccess = function () {
        try {
          var t = r.result.transaction("img", "readonly"), q = t.objectStore("img").getAll();
          q.onsuccess = function () { photos = (q.result || []).filter(function (p) { return p.visible !== false && p.blob && p.c; }).map(function (p) { return { id: p.id, name: p.name, w: p.w, h: p.h, c: p.c, url: URL.createObjectURL(p.blob) }; }); loading = false; if (onLoad) onLoad(); };
          q.onerror = function () { photos = []; loading = false; };
        } catch (e) { photos = []; loading = false; }
      };
      r.onerror = function () { photos = []; loading = false; };
    } catch (e) { photos = []; loading = false; }
  }

  /* ---------------- immagini per la vista ---------------- */
  function tilesSvg(G, v, kk) {
    var c0 = toLL(G, v.x, v.y), c1 = toLL(G, v.x + v.w, v.y + v.h), lat = (c0[0] + c1[0]) / 2;
    var mpp = kk / Math.min(2, window.devicePixelRatio || 1), z = Math.floor(Math.log(156543.03 * Math.cos(lat * Math.PI / 180) / Math.max(mpp, 0.01)) / Math.LN2);
    z = Math.max(3, Math.min(19, z));
    var x0, x1, y0, y1;
    for (; z > 3; z--) { x0 = Math.floor(lon2t(c0[1], z)); x1 = Math.floor(lon2t(c1[1], z)); y0 = Math.floor(lat2t(c0[0], z)); y1 = Math.floor(lat2t(c1[0], z)); if ((x1 - x0 + 1) * (y1 - y0 + 1) <= 40) break; }
    var out = "", key = z + ":" + x0 + ":" + x1 + ":" + y0 + ":" + y1, ov = 0.02 * kk;
    for (var tx = x0; tx <= x1; tx++) for (var ty = y0; ty <= y1; ty++) {
      var a = toXY(G, t2lat(ty, z), t2lon(tx, z)), b = toXY(G, t2lat(ty + 1, z), t2lon(tx + 1, z));
      out += '<image href="' + TILE + z + "/" + ty + "/" + tx + '" x="' + (a[0] - ov).toFixed(2) + '" y="' + (a[1] - ov).toFixed(2) + '" width="' + (b[0] - a[0] + 2 * ov).toFixed(2) + '" height="' + (b[1] - a[1] + 2 * ov).toFixed(2) + '" preserveAspectRatio="none"/>';
    }
    return { key: key, svg: out };
  }
  function photosSvg(G) {
    var out = "";
    (photos || []).forEach(function (p) {
      var tl = toXY(G, p.c.tl[0], p.c.tl[1]), tr = toXY(G, p.c.tr[0], p.c.tr[1]), bl = toXY(G, p.c.bl[0], p.c.bl[1]);
      var m = [(tr[0] - tl[0]) / p.w, (tr[1] - tl[1]) / p.w, (bl[0] - tl[0]) / p.h, (bl[1] - tl[1]) / p.h, tl[0], tl[1]].map(function (n) { return +n.toFixed(6); });
      out += '<image href="' + p.url + '" x="0" y="0" width="' + p.w + '" height="' + p.h + '" preserveAspectRatio="none" transform="matrix(' + m.join(" ") + ')"/>';
    });
    return { key: "foto:" + (photos || []).map(function (p) { return p.id; }).join(","), svg: out };
  }
  /* disegna lo sfondo nel gruppo g, rifacendolo solo quando cambiano i riquadri (così non lampeggia mentre si trascina) */
  function paint(g, v, kk) {
    if (!g) return; var G = geo(), m = mode(), r = { key: "no", svg: "" };
    if (G && m === "sat") r = tilesSvg(G, v, kk);
    else if (G && m === "foto") { loadPhotos(); r = photos && photos.length ? photosSvg(G) : (photos ? tilesSvg(G, v, kk) : { key: "attesa", svg: "" }); }
    if (g.getAttribute("data-k") !== r.key) { g.innerHTML = r.svg; g.setAttribute("data-k", r.key); }
  }

  /* ---------------- comandi sotto la mappa ---------------- */
  function html() {
    if (!geo()) return '<span class="small muted">La foto satellitare compare per le parcelle con la posizione GPS (importate da file o disegnate sulla mappa satellitare).</span>';
    loadPhotos();
    var m = mode(), op = Math.round(opacity() * 100), hasPh = photos && photos.length;
    var b = function (v, lab) { return '<button class="btn sm" data-sf="mode" data-v="' + v + '" aria-pressed="' + (m === v) + '" style="flex:1">' + lab + '</button>'; };
    var h = '<div class="row" role="group" aria-label="Sfondo" style="flex-wrap:nowrap;gap:6px">' + b("sat", "Satellite") + (hasPh ? b("foto", "Foto aerea") : '') + b("no", "Nessuno") + '</div>';
    if (m !== "no") h += '<div class="row" style="flex-wrap:nowrap;gap:8px"><span class="small" style="white-space:nowrap">Disegno dell\'app</span><input id="sfOp" type="range" min="10" max="100" step="5" value="' + op + '" aria-label="Quanto si vede il disegno dell\'app sopra la foto" style="flex:1;min-height:36px"><span class="small mono" id="sfOpV" style="min-width:40px;text-align:right">' + op + '%</span></div>';
    if (m === "sat") h += '<span class="small muted">' + ATTR + '. Ingrandisci con due dita per vedere i filari.</span>';
    return h;
  }

  var redraw = null;
  document.addEventListener("click", function (e) {
    var b = e.target.closest("[data-sf]"); if (!b) return; e.preventDefault();
    if (b.getAttribute("data-sf") === "mode") { setPref("qo-sfondo", b.getAttribute("data-v")); Q.render(); }
  });
  document.addEventListener("input", function (e) {
    if (!e.target || e.target.id !== "sfOp") return; var v = +e.target.value; setPref("qo-sfondo-op", v / 100);
    var t = document.getElementById("sfOpV"); if (t) t.textContent = v + "%"; if (redraw) redraw();
  });

  window.QOSfondo = {
    /* on: c'è uno sfondo fotografico? (serve per scegliere colori chiari e niente riempimento) */
    on: function () { return mode() !== "no" && !!geo(); },
    opacity: function () { return mode() !== "no" && geo() ? opacity() : 1; },
    paint: paint, html: html,
    /* fn: ridisegno della schermata aperta, quando arrivano le foto o cambia la trasparenza */
    bind: function (fn) { redraw = fn; onLoad = function () { Q.render(); }; }
  };
})();

/* Mappa satellitare, posizione GPS dal vivo e foto aeree importate.
   Le parcelle restano salvate in metri; S.geo ne fissa la posizione reale (origine in lat/lon).
   Se Leaflet non si carica (es. primo avvio senza rete) l'app usa la mappa disegnata classica. */
(function () {
  "use strict";
  var L = window.L, Q = window.QO;
  if (!L || !Q) return;

  var M_LAT = 110574;
  var LIBS = {
    geotiff: { url: "https://cdn.jsdelivr.net/npm/geotiff@2.1.3/dist-browser/geotiff.js", ok: function () { return !!window.GeoTIFF; } },
    proj4: { url: "https://cdn.jsdelivr.net/npm/proj4@2.11.0/dist/proj4.js", ok: function () { return !!window.proj4; } },
    jszip: { url: "https://cdnjs.cloudflare.com/ajax/libs/jszip/3.10.1/jszip.min.js", ok: function () { return !!window.JSZip; } }
  };
  var EPSG = [
    [32632, "WGS84 / UTM 32N (Nord e Centro-Ovest)"], [32633, "WGS84 / UTM 33N (Centro-Est e Sud)"],
    [25832, "ETRS89 / UTM 32N"], [25833, "ETRS89 / UTM 33N"],
    [6707, "RDN2008 / UTM 32N"], [6708, "RDN2008 / UTM 33N"],
    [3003, "Monte Mario / Gauss-Boaga Ovest"], [3004, "Monte Mario / Gauss-Boaga Est"],
    [4326, "Latitudine e longitudine (WGS84)"], [3857, "Web Mercator"]
  ];

  var map = null, el = null, lay = {}, canvasR = null, fitted = false;
  var gps = { on: false, watch: null, fix: null, hist: [], sel: null, adjusted: false, follow: true };
  var rec = { on: false, pts: [] };
  var place = { on: false, step: 1 };
  var wake = null;
  var imgs = [], imgLayers = {}, imgMsg = "", imgOpen = false, imgConfirm = null, busy = false;

  /* ---------------- utilità ---------------- */
  function S() { return Q.getState(); }
  function $(s) { return document.querySelector(s); }
  function esc(s) { return String(s == null ? "" : s).replace(/[&<>"']/g, function (c) { return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]; }); }
  function kx(G) { return Math.cos(G.lat0 * Math.PI / 180) * 111320; }
  function toLL(p) { var G = S().geo; return [G.lat0 - (p[1] - G.oy) / M_LAT, G.lon0 + (p[0] - G.ox) / kx(G)]; }
  function fromLL(lat, lon) { var G = S().geo; return [G.ox + (lon - G.lon0) * kx(G), G.oy + (G.lat0 - lat) * M_LAT]; }
  function distM(a, b) { var dl = (b[0] - a[0]) * M_LAT, dn = (b[1] - a[1]) * Math.cos(a[0] * Math.PI / 180) * 111320; return Math.sqrt(dl * dl + dn * dn); }
  function cssVar(name) { return getComputedStyle(document.documentElement).getPropertyValue(name).trim() || "#2E6A3C"; }
  function tok(v) { var m = /var\((--[^)]+)\)/.exec(v || ""); return m ? cssVar(m[1]) : v || "#2E6A3C"; }
  function allPts() { var a = []; S().plots.forEach(function (p) { a = a.concat(p.pts); }); return a; }
  function loadLib(name) {
    var lib = LIBS[name];
    if (lib.ok()) return Promise.resolve();
    return new Promise(function (res, rej) {
      var s = document.createElement("script"); s.src = lib.url; s.async = true;
      s.onload = function () { lib.ok() ? res() : rej(new Error("libreria non disponibile")); };
      s.onerror = function () { rej(new Error("serve la connessione la prima volta per scaricare il lettore di questo formato")); };
      document.head.appendChild(s);
    });
  }

  /* ---------------- foto aeree: livello con 3 angoli (anche ruotato) ---------------- */
  var CornerOverlay = L.Layer.extend({
    initialize: function (url, c, opacity) { this._url = url; this._c = c; this._op = opacity == null ? 1 : opacity; },
    onAdd: function (m) {
      var i = this._img = L.DomUtil.create("img", "leaflet-zoom-hide");
      i.alt = ""; i.style.cssText = "position:absolute;left:0;top:0;transform-origin:0 0;pointer-events:none;max-width:none;user-select:none";
      i.style.opacity = this._op;
      var self = this; i.onload = function () { self._reset(); };
      i.src = this._url;
      m.getPane("foto").appendChild(i);
      m.on("zoomend viewreset resize", this._reset, this);
    },
    onRemove: function (m) { L.DomUtil.remove(this._img); m.off("zoomend viewreset resize", this._reset, this); },
    setOpacity: function (o) { this._op = o; if (this._img) this._img.style.opacity = o; },
    _reset: function () {
      var i = this._img, w = i.naturalWidth, h = i.naturalHeight, m = this._map; if (!w || !m) return;
      var p0 = m.latLngToLayerPoint(this._c.tl), p1 = m.latLngToLayerPoint(this._c.tr), p2 = m.latLngToLayerPoint(this._c.bl);
      i.style.transform = "matrix(" + [(p1.x - p0.x) / w, (p1.y - p0.y) / w, (p2.x - p0.x) / h, (p2.y - p0.y) / h, p0.x, p0.y].join(",") + ")";
    }
  });

  /* ---------------- creazione della mappa ---------------- */
  function createMap() {
    el = document.createElement("div"); el.className = "lmap";
    el.setAttribute("aria-label", "Mappa satellitare degli appezzamenti");
    map = L.map(el, { maxZoom: 22, zoomSnap: 0.5, attributionControl: true });
    var sat = L.tileLayer("https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}", { maxNativeZoom: 19, maxZoom: 22, attribution: "Immagini © Esri, Maxar, Earthstar Geographics" });
    var osm = L.tileLayer("https://tile.openstreetmap.org/{z}/{x}/{y}.png", { maxNativeZoom: 19, maxZoom: 22, attribution: "© OpenStreetMap" });
    sat.addTo(map);
    L.control.layers({ "Satellite": sat, "Mappa stradale": osm }, null, { position: "topright" }).addTo(map);
    L.control.scale({ imperial: false, position: "bottomleft" }).addTo(map);
    map.createPane("foto").style.zIndex = 250;
    canvasR = L.canvas({ padding: 0.3 });
    ["plots", "rows", "marks", "draw", "sel", "rec", "gps"].forEach(function (k) { lay[k] = L.layerGroup().addTo(map); });
    map.on("click", onMapClick);
    map.on("zoomend", function () { zoomClass(); drawRows(); });
    map.on("moveend", function () { if (map.getZoom() >= 17) drawRows(); });
    map.on("dragstart", function () { gps.follow = false; var c = $("#mpFollow"); if (c) c.checked = false; });
    map.setView([42.5, 12.5], 6);
    loadImages();
  }
  function zoomClass() { if (el) el.classList.toggle("nolabels", map.getZoom() < 14.5); }
  function fitAll() {
    var b = null;
    if (S().geo && S().plots.length) b = L.latLngBounds(allPts().map(toLL));
    else if (imgs.length) b = L.latLngBounds([imgs[0].c.tl, imgs[0].c.tr, imgs[0].c.bl]);
    if (b && b.isValid()) map.fitBounds(b.pad(0.15), { maxZoom: 19 });
  }
  function mount(slot) {
    if (!map) createMap();
    if (el.parentNode !== slot) slot.appendChild(el);
    map.invalidateSize();
    if (!fitted) { fitAll(); fitted = true; }
    refresh(); zoomClass();
  }

  /* ---------------- disegno dei livelli ---------------- */
  function refresh() {
    if (!map) return;
    ["plots", "marks", "draw", "sel"].forEach(function (k) { lay[k].clearLayers(); });
    var st = S();
    if (st.geo) {
      var bad = cssVar("--bad"), warn = cssVar("--warn"), surf = cssVar("--surface");
      st.plots.forEach(function (p) {
        var col = tok(Q.stroke[p.type]), on = st.sel === p.id && !Q.ui.draw;
        var pg = L.polygon(p.pts.map(toLL), { color: col, weight: on ? 4 : 2, fillColor: col, fillOpacity: on ? 0.22 : 0.12 });
        pg.bindTooltip(esc(p.name), { permanent: true, direction: "center", className: "qo-label" });
        pg.on("click", function () { if (Q.ui.draw || place.on) return; st.sel = p.id; Q.save(); Q.render(); });
        lay.plots.addLayer(pg);
        if (p.vine) {
          var g = Q.vineGeo(p);
          Object.keys(p.vine.marks || {}).forEach(function (key) {
            var a = key.split(":").map(Number);
            if (!g.rows[a[0]] || !g.rows[a[0]].segs[a[1]] || a[2] >= g.rows[a[0]].segs[a[1]].c) return;
            var mk = p.vine.marks[key], f = mk === "f", nw = mk === "n", acc = cssVar("--accent");
            lay.marks.addLayer(L.circleMarker(toLL(Q.ceppoXY(g, a[0], a[1], a[2])), { renderer: canvasR, radius: 5, weight: 2, color: f ? bad : surf, fillColor: f ? surf : nw ? acc : warn, fillOpacity: 1, interactive: false }));
          });
        }
      });
      drawDraft();
      drawSel();
    }
    drawRows(); drawRec(); drawGps();
  }
  function drawRows() {
    if (!map) return; lay.rows.clearLayers();
    var st = S(); if (!st.geo || map.getZoom() < 17) return;
    var vb = map.getBounds(), col = tok(Q.stroke.vigna), z = map.getZoom();
    var nw = fromLL(vb.getNorth(), vb.getWest()), se = fromLL(vb.getSouth(), vb.getEast());
    st.plots.forEach(function (p) {
      if (!p.vine) return;
      var bb = Q.bbox(p.pts); if (bb.x1 < nw[0] || bb.x0 > se[0] || bb.y1 < nw[1] || bb.y0 > se[1]) return;
      var g = Q.vineGeo(p), M = p.vine.marks || {};
      g.rows.forEach(function (r, ri) {
        r.segs.forEach(function (sg, k) {
          var a = [r.s * g.n[0] + sg.t0 * g.d[0], r.s * g.n[1] + sg.t0 * g.d[1]], b = [r.s * g.n[0] + sg.t1 * g.d[0], r.s * g.n[1] + sg.t1 * g.d[1]];
          lay.rows.addLayer(L.polyline([toLL(a), toLL(b)], { renderer: canvasR, color: col, weight: 1.5, opacity: 0.8, interactive: false }));
          if (z >= 20) for (var i = 0; i < sg.c; i++) {
            if (M[ri + ":" + k + ":" + i]) continue;
            var q = Q.ceppoXY(g, ri, k, i); if (q[0] < nw[0] || q[0] > se[0] || q[1] < nw[1] || q[1] > se[1]) continue;
            lay.rows.addLayer(L.circleMarker(toLL(q), { renderer: canvasR, radius: 2.5, weight: 0, fillColor: col, fillOpacity: 1, interactive: false }));
          }
        });
      });
    });
  }
  function drawDraft() {
    var d = Q.ui.draw; if (!d || !d.pts.length) return;
    var ll = d.pts.map(toLL), col = tok("var(--serra)");
    lay.draw.addLayer(d.closed ? L.polygon(ll, { color: col, weight: 3, fillOpacity: 0.2, interactive: false }) : L.polyline(ll, { color: col, weight: 3, interactive: false }));
    ll.forEach(function (q, i) { lay.draw.addLayer(L.circleMarker(q, { radius: i === 0 && !d.closed ? 9 : 6, color: col, weight: 2, fillColor: i === 0 ? col : "#fff", fillOpacity: 1, interactive: false })); });
  }
  function drawSel() {
    var s = gps.sel; if (!s || s.ri == null) return; var p = Q.plotById(s.plot); if (!p || !p.vine) return;
    var g = Q.vineGeo(p); if (!g.rows[s.ri] || !g.rows[s.ri].segs[s.k]) return;
    lay.sel.addLayer(L.circleMarker(toLL(Q.ceppoXY(g, s.ri, s.k, s.i)), { radius: 10, color: cssVar("--ink"), weight: 3, fill: false, interactive: false }));
  }
  function drawRec() {
    if (!map) return; lay.rec.clearLayers();
    if (rec.on && rec.pts.length) lay.rec.addLayer(L.polyline(rec.pts, { color: tok("var(--warn)"), weight: 4, dashArray: "6 6", interactive: false }));
  }
  function drawGps() {
    if (!map) return; lay.gps.clearLayers();
    var f = gps.fix; if (!gps.on || !f) return;
    lay.gps.addLayer(L.circle([f.lat, f.lon], { radius: f.acc, color: "#1A73E8", weight: 1, fillColor: "#1A73E8", fillOpacity: 0.12, interactive: false }));
    lay.gps.addLayer(L.circleMarker([f.lat, f.lon], { radius: 8, color: "#fff", weight: 3, fillColor: "#1A73E8", fillOpacity: 1, interactive: false }));
  }

  /* ---------------- tocchi sulla mappa ---------------- */
  function onMapClick(e) {
    var st = S(), lat = e.latlng.lat, lon = e.latlng.lng;
    if (place.on) { placeAt(lat, lon); return; }
    var d = Q.ui.draw; if (!d || d.closed) return;
    if (!st.geo) {
      if (st.plots.length) { Q.toast("Prima posiziona gli appezzamenti sulla mappa"); return; }
      st.geo = { lat0: lat, lon0: lon, ox: 0, oy: 0 }; Q.save();
    }
    if (d.pts.length > 2) {
      var first = map.latLngToContainerPoint(toLL(d.pts[0]));
      if (first.distanceTo(e.containerPoint) < 24) { d.closed = true; Q.render(); return; }
    }
    var p = fromLL(lat, lon); d.pts.push([Math.round(p[0] * 10) / 10, Math.round(p[1] * 10) / 10]);
    Q.render();
  }

  /* ---------------- posizionare gli appezzamenti già disegnati ---------------- */
  function placeAt(lat, lon) {
    var st = S(), b = Q.bbox(allPts()), cx = (b.x0 + b.x1) / 2, cy = (b.y0 + b.y1) / 2;
    st.geo = { lat0: lat, lon0: lon, ox: cx, oy: cy };
    Q.save(); Q.render();
  }
  function nudge(dx, dy) {
    var st = S(); if (!st.geo) return;
    st.geo.lon0 += dx * place.step / kx(st.geo); st.geo.lat0 += dy * place.step / M_LAT;
    Q.save(); Q.render();
  }

  /* ---------------- GPS ---------------- */
  function keepAwake() {
    if (!("wakeLock" in navigator) || wake) return;
    navigator.wakeLock.request("screen").then(function (w) { wake = w; w.addEventListener("release", function () { wake = null; }); }).catch(function () {});
  }
  function release() { if (wake) { wake.release().catch(function () {}); wake = null; } }
  document.addEventListener("visibilitychange", function () { if (document.visibilityState === "visible" && (gps.on || rec.on)) keepAwake(); });

  function gpsStart() {
    if (!navigator.geolocation) { Q.toast("Questo dispositivo non fornisce la posizione"); return; }
    gps.on = true; gps.hist = []; gps.fix = null; gps.adjusted = false; gps.follow = true;
    gps.watch = navigator.geolocation.watchPosition(onFix, onErr, { enableHighAccuracy: true, maximumAge: 0, timeout: 30000 });
    keepAwake(); Q.render();
  }
  function gpsStop() {
    if (gps.watch != null) navigator.geolocation.clearWatch(gps.watch);
    gps.watch = null; gps.on = false; gps.fix = null; gps.sel = null; rec.on = false; rec.pts = [];
    release(); Q.render();
  }
  function onErr(err) {
    if (err.code === 1) { Q.toast("Permesso di posizione negato: attivalo nelle impostazioni del browser per questo sito"); gpsStop(); return; }
    Q.toast(err.code === 3 ? "Segnale GPS debole: continuo a cercare" : "Posizione non disponibile al momento");
  }
  function onFix(pos) {
    var c = pos.coords, now = Date.now();
    if (c.accuracy <= 50) {
      gps.hist.push({ lat: c.latitude, lon: c.longitude, acc: Math.max(c.accuracy, 1), t: now });
      gps.hist = gps.hist.filter(function (h) { return now - h.t < 12000; }).slice(-6);
      var sw = 0, la = 0, lo = 0, mn = 1e9;
      gps.hist.forEach(function (h) { var w = 1 / (h.acc * h.acc); sw += w; la += h.lat * w; lo += h.lon * w; mn = Math.min(mn, h.acc); });
      gps.fix = { lat: la / sw, lon: lo / sw, acc: Math.round(mn), weak: false };
      if (rec.on && c.accuracy <= 15) { var last = rec.pts[rec.pts.length - 1], q = [c.latitude, c.longitude]; if (!last || distM(last, q) >= 1.5) rec.pts.push(q); }
    } else gps.fix = { lat: c.latitude, lon: c.longitude, acc: Math.round(c.accuracy), weak: true };
    if (!gps.adjusted) gps.sel = locate();
    if (gps.follow && map) map.panTo([gps.fix.lat, gps.fix.lon], { animate: true });
    drawGps(); drawRec(); lay.sel && (lay.sel.clearLayers(), S().geo && drawSel());
    var box = $("#mpLive"); if (box) box.innerHTML = liveHtml();
  }
  function locate() {
    var st = S(), f = gps.fix; if (!f || !st.geo) return null;
    var xy = fromLL(f.lat, f.lon), plot = st.plots.find(function (p) { return Q.pip(xy, p.pts); });
    if (!plot) return { plot: null };
    if (!plot.vine) return { plot: plot.id };
    var g = Q.vineGeo(plot), s = Q.vdot(xy, g.n), t = Q.vdot(xy, g.d), ri = Math.round((s - (g.smin + g.inter / 2)) / g.inter);
    ri = Math.max(0, Math.min(g.rows.length - 1, ri));
    return nearestOnRow(plot, g, ri, t);
  }
  function nearestOnRow(plot, g, ri, t) {
    var r = g.rows[ri]; if (!r || !r.segs.length) return { plot: plot.id, ri: null };
    var best = null;
    r.segs.forEach(function (sg, k) { var i = Math.max(0, Math.min(sg.c - 1, Math.round((t - sg.t0 - g.rw / 2) / g.rw))), tt = sg.t0 + g.rw / 2 + i * g.rw, d = Math.abs(tt - t); if (!best || d < best.d) best = { k: k, i: i, d: d }; });
    return { plot: plot.id, ri: ri, k: best.k, i: best.i };
  }
  function moveSel(dRow, dCep) {
    var s = gps.sel; if (!s || s.ri == null) return; var p = Q.plotById(s.plot), g = Q.vineGeo(p);
    if (dRow) {
      var t = g.rows[s.ri].segs[s.k].t0 + g.rw / 2 + s.i * g.rw, ri = s.ri + dRow;
      while (g.rows[ri] && !g.rows[ri].segs.length) ri += dRow;
      if (!g.rows[ri]) return; gps.sel = nearestOnRow(p, g, ri, t);
    }
    if (dCep) {
      var sg = g.rows[s.ri].segs[s.k], i = s.i + dCep;
      if (i < 0 && s.k > 0) { s.k--; s.i = g.rows[s.ri].segs[s.k].c - 1; }
      else if (i >= sg.c && s.k < g.rows[s.ri].segs.length - 1) { s.k++; s.i = 0; }
      else s.i = Math.max(0, Math.min(sg.c - 1, i));
    }
    gps.adjusted = true; Q.render();
  }

  /* ---------------- registrare un perimetro camminando ---------------- */
  function recStart() {
    var st = S();
    if (!st.geo && st.plots.length) { Q.toast("Prima posiziona gli appezzamenti sulla mappa"); return; }
    rec.on = true; rec.pts = []; if (!gps.on) gpsStart(); else { keepAwake(); Q.render(); }
  }
  function recFinish() {
    if (rec.pts.length < 3) { Q.toast("Servono almeno 3 punti: cammina ancora lungo il confine"); return; }
    var st = S();
    if (!st.geo) st.geo = { lat0: rec.pts[0][0], lon0: rec.pts[0][1], ox: 0, oy: 0 };
    var pts = [];
    rec.pts.forEach(function (q) { var p = fromLL(q[0], q[1]), l = pts[pts.length - 1]; p = [Math.round(p[0] * 10) / 10, Math.round(p[1] * 10) / 10]; if (!l || Math.hypot(l[0] - p[0], l[1] - p[1]) >= 1) pts.push(p); });
    rec.on = false; rec.pts = [];
    Q.ui.draw = { pts: pts, closed: true, name: "Nuova area " + (st.plots.length + 1), type: "vigna" };
    Q.save(); Q.toast("Perimetro registrato: " + Q.m2(Q.area(pts)) + ". Dai un nome e salva."); Q.render();
  }

  /* ---------------- pannelli ---------------- */
  function liveHtml() {
    var h = "";
    if (rec.on) {
      var len = 0; for (var i = 1; i < rec.pts.length; i++) len += distM(rec.pts[i - 1], rec.pts[i]);
      h += '<div class="panel stack" style="border:2px solid var(--warn)"><div class="row" style="justify-content:space-between"><b>Registrazione del perimetro</b><span class="mono small">' + rec.pts.length + ' punti · ' + Math.round(len) + ' m</span></div><span class="small">Cammina lungo il confine e tieni lo schermo acceso. Vengono usati solo i punti con precisione entro 15 m.</span><div class="row"><button class="btn primary" data-mp="recFinish">Fine, crea l\'area</button><button class="btn" data-mp="recCancel">Annulla</button></div></div>';
    }
    if (!gps.on) return h;
    var f = gps.fix;
    if (!f) return h + '<div class="panel small">Cerco il segnale GPS…</div>';
    var cls = f.weak || f.acc > 15 ? "b-bad" : f.acc > 5 ? "b-warn" : "b-ok";
    h += '<div class="panel stack"><div class="row" style="justify-content:space-between"><b>La tua posizione</b><span class="badge ' + cls + '">precisione ±' + f.acc + ' m' + (f.weak ? ', debole' : '') + '</span></div>';
    var st = S(), s = gps.sel;
    if (!st.geo) h += '<span class="small">Gli appezzamenti non sono ancora sulla mappa: posizionali per sapere dove sei.</span>';
    else if (!s || !s.plot) h += '<span class="small">Sei fuori dagli appezzamenti.</span>';
    else {
      var p = Q.plotById(s.plot);
      if (!p.vine || s.ri == null) h += '<span>Sei in <b>' + esc(p.name) + '</b>.</span>';
      else {
        var g = Q.vineGeo(p), key = s.ri + ":" + s.k + ":" + s.i, m = p.vine.marks[key], segs = g.rows[s.ri].segs.length;
        h += '<span>Sei in <b>' + esc(p.name) + '</b>, <b>filare ' + (s.ri + 1) + '</b>, <b>ceppo ' + (s.i + 1) + '</b>' + (segs > 1 ? ' (tratto ' + (s.k + 1) + ')' : '') + '</span>';
        h += '<span class="small muted">' + (gps.adjusted ? 'Ceppo scelto a mano. ' : 'Incertezza circa ±' + Math.ceil(f.acc / g.inter) + ' filari e ±' + Math.ceil(f.acc / g.rw) + ' ceppi: correggi con le frecce. ') + (m ? 'Ora: ' + (m === "f" ? 'fallanza' : m === "n" ? 'rimpiazzato' : 'sintomi') + '.' : '') + '</span>';
        h += '<div class="row" style="align-items:flex-start;gap:14px"><div class="mp-arrows"><span></span><button data-mp="sel" data-r="-1" aria-label="Filare precedente">▲</button><span></span><button data-mp="sel" data-c="-1" aria-label="Ceppo precedente">◀</button><button data-mp="selGps" aria-label="Torna alla posizione GPS" style="font-size:13px">GPS</button><button data-mp="sel" data-c="1" aria-label="Ceppo successivo">▶</button><span></span><button data-mp="sel" data-r="1" aria-label="Filare successivo">▼</button><span></span></div>';
        h += '<div class="stack" style="gap:6px;flex:1;min-width:140px"><button class="btn danger" data-mp="mark" data-v="f">Segna fallanza</button><button class="btn" data-mp="mark" data-v="s">Segna sintomi</button>' + (m === "f" ? '<button class="btn primary" data-mp="mark" data-v="n">Rimpiazzata</button>' : '') + (m ? '<button class="btn sm" data-mp="mark" data-v="">Togli segno</button>' : '') + '</div></div>';
      }
    }
    h += '<label class="row small" style="font-weight:600"><input id="mpFollow" type="checkbox"' + (gps.follow ? ' checked' : '') + '> Segui la mia posizione</label></div>';
    return h;
  }
  function panelHtml() {
    var st = S(), d = Q.ui.draw, h = '<div class="stack" style="margin-top:10px">';
    if (d && !d.closed) h += '<div class="panel small">Tocca sulla mappa per aggiungere i vertici. Tocca il primo punto per chiudere la forma.</div>';
    if (!d) {
      h += '<div class="row"><button class="btn' + (gps.on ? '' : ' primary') + '" data-mp="gps">' + (gps.on ? 'Ferma GPS' : 'Dove sono') + '</button>' + (rec.on ? '' : '<button class="btn" data-mp="rec">Registra perimetro</button>') + '<button class="btn" data-mp="fit">Centra</button></div>';
      if (!st.geo && st.plots.length) {
        h += place.on
          ? '<div class="panel stack" style="border:2px solid var(--serra)"><b>Posiziona gli appezzamenti</b><span class="small">Tocca sulla mappa il punto dove si trova il centro dei tuoi appezzamenti.</span><div class="row"><button class="btn" data-mp="placeEnd">Annulla</button></div></div>'
          : '<div class="panel stack"><b>Gli appezzamenti non sono ancora sulla mappa</b><span class="small">Sono stati disegnati senza coordinate. Posizionali una volta sulla foto satellitare. Le parcelle importate da file GPS invece hanno già la loro posizione.</span><div><button class="btn primary" data-mp="placeStart">Posiziona sulla mappa</button></div></div>';
      } else if (place.on) {
        h += '<div class="panel stack" style="border:2px solid var(--serra)"><b>Correggi la posizione</b><span class="small">Tocca la mappa per spostare il centro, oppure usa le frecce.</span><div class="row" style="align-items:flex-start;gap:14px"><div class="mp-arrows"><span></span><button data-mp="nudge" data-x="0" data-y="1" aria-label="Sposta a nord">▲</button><span></span><button data-mp="nudge" data-x="-1" data-y="0" aria-label="Sposta a ovest">◀</button><span></span><button data-mp="nudge" data-x="1" data-y="0" aria-label="Sposta a est">▶</button><span></span><button data-mp="nudge" data-x="0" data-y="-1" aria-label="Sposta a sud">▼</button><span></span></div><div class="stack" style="gap:6px"><span class="small muted">Passo</span><div class="row">' + [1, 5, 20].map(function (n) { return '<button class="btn sm" data-mp="step" data-v="' + n + '" aria-pressed="' + (place.step === n) + '">' + n + ' m</button>'; }).join("") + '</div></div></div><div><button class="btn primary" data-mp="placeEnd">Fatto</button></div></div>';
      } else if (st.geo && st.plots.length) {
        h += '<div class="row"><button class="btn sm" data-mp="placeStart">Correggi la posizione degli appezzamenti</button></div>';
      }
    }
    h += '<div id="mpLive" class="stack">' + liveHtml() + '</div>';
    h += imagesHtml();
    return h + '</div>';
  }
  function imagesHtml() {
    var h = '<details class="panel" id="mpImgBox"' + (imgOpen ? ' open' : '') + '><summary><span style="flex:1">Le vostre foto aeree</span><span class="badge b-n">' + imgs.length + '</span></summary><div class="stack" style="margin-top:8px">';
    h += '<span class="small">GeoTIFF da drone o da ortofoto, KMZ di Google Earth, oppure JPG o PNG insieme al file di georeferenziazione con lo stesso nome (.jgw, .pgw, .wld).</span>';
    h += '<label class="f">Sistema di coordinate, se il file non lo indica<select id="mpEpsg">' + EPSG.map(function (e) { return '<option value="' + e[0] + '"' + (e[0] === (S().epsgFoto || 32632) ? ' selected' : '') + '>' + e[1] + ' (EPSG ' + e[0] + ')</option>'; }).join("") + '</select></label>';
    h += '<div><label class="btn primary filebtn" for="mpFile">' + (busy ? 'Elaboro…' : 'Importa foto aerea') + '<input id="mpFile" type="file" multiple accept=".tif,.tiff,.kmz,.jpg,.jpeg,.png,.jgw,.pgw,.wld,.tfw"' + (busy ? ' disabled' : '') + '></label></div>';
    if (imgMsg) h += '<div class="small" role="status">' + esc(imgMsg) + '</div>';
    imgs.forEach(function (im) {
      h += '<div class="sep"></div><div class="stack" style="gap:6px"><div class="row" style="justify-content:space-between"><b style="min-width:0;overflow-wrap:anywhere">' + esc(im.name) + '</b><span class="small muted">' + im.w + '×' + im.h + ' px</span></div>';
      h += '<div class="row"><label class="row small" style="font-weight:600"><input type="checkbox" id="mpVis-' + im.id + '"' + (im.visible !== false ? ' checked' : '') + '> Visibile</label><label class="row small" style="flex:1;min-width:140px">Trasparenza<input type="range" id="mpOp-' + im.id + '" min="0.2" max="1" step="0.05" value="' + (im.opacity || 1) + '" style="flex:1;min-height:32px"></label></div>';
      h += '<div class="row"><button class="btn sm" data-mp="imgFit" data-id="' + im.id + '">Centra</button><button class="btn sm danger" data-mp="imgDel" data-id="' + im.id + '">' + (imgConfirm === im.id ? 'Tocca ancora' : 'Elimina') + '</button></div></div>';
    });
    h += '<span class="small muted">Le foto restano su questo dispositivo: ogni collega importa lo stesso file sul suo telefono.</span></div></details>';
    return h;
  }

  /* ---------------- archivio delle foto (IndexedDB) ---------------- */
  var dbp = null;
  function idb() {
    if (dbp) return dbp;
    dbp = new Promise(function (res, rej) {
      if (!window.indexedDB) return rej(new Error("archivio non disponibile"));
      var r = indexedDB.open("qo-foto", 1);
      r.onupgradeneeded = function () { r.result.createObjectStore("img", { keyPath: "id" }); };
      r.onsuccess = function () { res(r.result); }; r.onerror = function () { rej(r.error); };
    });
    return dbp;
  }
  function tx(mode, fn) { return idb().then(function (db) { return new Promise(function (res, rej) { var t = db.transaction("img", mode), st = t.objectStore("img"), out = fn(st); t.oncomplete = function () { res(out && out.result); }; t.onerror = function () { rej(t.error); }; }); }); }
  function loadImages() {
    tx("readonly", function (st) { return st.getAll(); }).then(function (list) {
      imgs = (list || []).sort(function (a, b) { return a.added - b.added; }).map(function (r) { return { id: r.id, name: r.name, w: r.w, h: r.h, c: r.c, opacity: r.opacity, visible: r.visible, blob: r.blob }; });
      imgs.forEach(addOverlay);
      if (!fitted && map) { fitAll(); }
      if (document.getElementById("mpImgBox")) Q.render();
    }).catch(function () {});
  }
  function addOverlay(im) {
    if (imgLayers[im.id]) { map.removeLayer(imgLayers[im.id]); }
    var url = URL.createObjectURL(im.blob), lyr = new CornerOverlay(url, im.c, im.opacity || 1);
    imgLayers[im.id] = lyr; if (im.visible !== false) lyr.addTo(map);
  }
  function saveImg(im) { return tx("readwrite", function (st) { st.put({ id: im.id, name: im.name, w: im.w, h: im.h, c: im.c, opacity: im.opacity, visible: im.visible, blob: im.blob, added: im.added || Date.now() }); }); }

  /* ---------------- conversione delle coordinate ---------------- */
  var GEOG = [4326, 4258, 6706, 4230];
  function projDef(code) {
    if (code === 3857 || code === 3785 || code === 900913) return "EPSG:3857";
    if (code === 3003) return "+proj=tmerc +lat_0=0 +lon_0=9 +k=0.9996 +x_0=1500000 +y_0=0 +ellps=intl +towgs84=-104.1,-49.1,-9.9,0.971,-2.917,0.714,-11.68 +units=m +no_defs";
    if (code === 3004) return "+proj=tmerc +lat_0=0 +lon_0=15 +k=0.9996 +x_0=2520000 +y_0=0 +ellps=intl +towgs84=-104.1,-49.1,-9.9,0.971,-2.917,0.714,-11.68 +units=m +no_defs";
    if (code >= 32601 && code <= 32660) return "+proj=utm +zone=" + (code - 32600) + " +datum=WGS84 +units=m +no_defs";
    if (code >= 32701 && code <= 32760) return "+proj=utm +zone=" + (code - 32700) + " +south +datum=WGS84 +units=m +no_defs";
    if (code >= 25828 && code <= 25838) return "+proj=utm +zone=" + (code - 25800) + " +ellps=GRS80 +towgs84=0,0,0,0,0,0,0 +units=m +no_defs";
    if (code >= 6707 && code <= 6709) return "+proj=utm +zone=" + (code - 6675) + " +ellps=GRS80 +towgs84=0,0,0,0,0,0,0 +units=m +no_defs";
    return null;
  }
  function converter(code) {
    if (GEOG.indexOf(code) >= 0) return Promise.resolve(function (p) { return [p[1], p[0]]; });
    var def = projDef(code);
    if (!def) return Promise.reject(new Error("il sistema di coordinate EPSG " + code + " non è tra quelli gestiti: scegline uno dall'elenco e riprova"));
    return loadLib("proj4").then(function () { return function (p) { var r = window.proj4(def, "WGS84", p); return [r[1], r[0]]; }; });
  }
  function checkCorners(c) {
    [c.tl, c.tr, c.bl].forEach(function (q) { if (!isFinite(q[0]) || !isFinite(q[1]) || Math.abs(q[0]) > 85 || Math.abs(q[1]) > 180) throw new Error("le coordinate non tornano: controlla il sistema di coordinate scelto"); });
    return c;
  }

  /* ---------------- immagini: ridimensionamento ---------------- */
  function maxSide() { return (navigator.deviceMemory && navigator.deviceMemory < 4) ? 2560 : 4096; }
  function canvasToBlob(cv, alpha) { return new Promise(function (res) { cv.toBlob(function (b) { res(b); }, alpha ? "image/png" : "image/jpeg", 0.86); }); }
  function rasterBlob(file) {
    return new Promise(function (res, rej) {
      var url = URL.createObjectURL(file), im = new Image();
      im.onload = function () {
        var W = im.naturalWidth, H = im.naturalHeight, s = Math.min(1, maxSide() / Math.max(W, H)), cv = document.createElement("canvas");
        cv.width = Math.round(W * s); cv.height = Math.round(H * s); cv.getContext("2d").drawImage(im, 0, 0, cv.width, cv.height);
        URL.revokeObjectURL(url);
        canvasToBlob(cv, /png$/i.test(file.type || file.name)).then(function (b) { res({ blob: b, W: W, H: H, w: cv.width, h: cv.height }); });
      };
      im.onerror = function () { URL.revokeObjectURL(url); rej(new Error("immagine non leggibile")); };
      im.src = url;
    });
  }

  /* ---------------- formati ---------------- */
  async function importTiff(file, epsg, worldFile) {
    await loadLib("geotiff");
    var tiff = await window.GeoTIFF.fromBlob(file), image = await tiff.getImage();
    var W = image.getWidth(), H = image.getHeight();
    var keys = (typeof image.getGeoKeys === "function" ? image.getGeoKeys() : image.geoKeys) || {};
    var code = keys.ProjectedCSTypeGeoKey || keys.GeographicTypeGeoKey || 0;
    if (!code || code === 32767) code = epsg;
    var tl, tr, bl;
    if (worldFile) {
      var a = await worldCorners(worldFile, W, H); tl = a.tl; tr = a.tr; bl = a.bl;
    } else {
      var o, r;
      try { o = image.getOrigin(); r = image.getResolution(); } catch (e) { throw new Error("il file non contiene la posizione: aggiungi il file .tfw con lo stesso nome"); }
      tl = [o[0], o[1]]; tr = [o[0] + W * r[0], o[1]]; bl = [o[0], o[1] + H * r[1]];
    }
    var s = Math.min(1, maxSide() / Math.max(W, H)), w = Math.max(1, Math.round(W * s)), h = Math.max(1, Math.round(H * s));
    var spp = image.getSamplesPerPixel(), data = await image.readRasters({ width: w, height: h, interleave: true, resampleMethod: "bilinear" });
    var nodata = typeof image.getGDALNoData === "function" ? image.getGDALNoData() : null;
    var n = w * h, ch = Math.max(1, Math.round(data.length / n)), mx = 0;
    for (var i = 0; i < data.length; i += Math.max(1, Math.floor(data.length / 20000))) if (data[i] > mx && data[i] !== nodata) mx = data[i];
    var k = mx > 255 ? 255 / mx : 1, px = new Uint8ClampedArray(n * 4), alpha = false;
    for (var j = 0; j < n; j++) {
      var b = j * ch, rr = data[b], gg = ch >= 3 ? data[b + 1] : rr, bb = ch >= 3 ? data[b + 2] : rr, aa = ch >= 4 ? data[b + 3] : 255;
      if (nodata != null && rr === nodata && gg === nodata && bb === nodata) aa = 0;
      if (ch >= 4 && mx > 255) aa = aa > 0 ? 255 : 0;
      if (aa < 255) alpha = true;
      px[j * 4] = rr * k; px[j * 4 + 1] = gg * k; px[j * 4 + 2] = bb * k; px[j * 4 + 3] = aa;
    }
    var cv = document.createElement("canvas"); cv.width = w; cv.height = h; cv.getContext("2d").putImageData(new ImageData(px, w, h), 0, 0);
    var blob = await canvasToBlob(cv, alpha), conv = await converter(code);
    return { blob: blob, w: w, h: h, c: checkCorners({ tl: conv(tl), tr: conv(tr), bl: conv(bl) }), spp: spp };
  }
  async function worldCorners(worldFile, W, H) {
    var v = (await worldFile.text()).trim().split(/\s+/).map(Number);
    if (v.length < 6 || v.some(function (x) { return !isFinite(x); })) throw new Error("il file di georeferenziazione non è valido");
    var A = v[0], D = v[1], B = v[2], E = v[3], C = v[4], F = v[5];
    var x0 = C - A / 2 - B / 2, y0 = F - D / 2 - E / 2;
    return { tl: [x0, y0], tr: [x0 + W * A, y0 + W * D], bl: [x0 + H * B, y0 + H * E] };
  }
  async function importWorld(file, worldFile, epsg) {
    var r = await rasterBlob(file), a = await worldCorners(worldFile, r.W, r.H), conv = await converter(epsg);
    return { blob: r.blob, w: r.w, h: r.h, c: checkCorners({ tl: conv(a.tl), tr: conv(a.tr), bl: conv(a.bl) }) };
  }
  async function importKmz(file) {
    await loadLib("jszip");
    var zip = await window.JSZip.loadAsync(file), kmlName = Object.keys(zip.files).find(function (n) { return /\.kml$/i.test(n); });
    if (!kmlName) throw new Error("nel KMZ non c'è il file KML");
    var doc = new DOMParser().parseFromString(await zip.file(kmlName).async("text"), "application/xml");
    var ovs = doc.getElementsByTagName("GroundOverlay"), out = [];
    if (!ovs.length) throw new Error("il KMZ non contiene una foto sovrapposta (GroundOverlay)");
    for (var i = 0; i < ovs.length; i++) {
      var ov = ovs[i], hrefEl = ov.getElementsByTagName("href")[0]; if (!hrefEl) continue;
      var href = hrefEl.textContent.trim(), entry = zip.file(href) || zip.file(decodeURIComponent(href));
      if (!entry) continue;
      var raw = await entry.async("blob"), nm = ov.getElementsByTagName("name")[0];
      raw = new File([raw], href, { type: /\.png$/i.test(href) ? "image/png" : "image/jpeg" });
      var r = await rasterBlob(raw), c;
      var quad = ov.getElementsByTagName("gx:LatLonQuad")[0] || ov.getElementsByTagName("LatLonQuad")[0];
      if (quad) {
        var q = quad.getElementsByTagName("coordinates")[0].textContent.trim().split(/\s+/).map(function (s) { var a = s.split(","); return [+a[1], +a[0]]; });
        c = { bl: q[0], tr: q[2], tl: q[3] };
      } else {
        var box = ov.getElementsByTagName("LatLonBox")[0]; if (!box) continue;
        var g = function (t) { var e = box.getElementsByTagName(t)[0]; return e ? +e.textContent : 0; };
        var N = g("north"), So = g("south"), Ea = g("east"), We = g("west"), rot = g("rotation") * Math.PI / 180;
        var clat = (N + So) / 2, clon = (Ea + We) / 2, mx = Math.cos(clat * Math.PI / 180) * 111320, hw = (Ea - We) / 2 * mx, hh = (N - So) / 2 * M_LAT;
        var corner = function (dx, dy) { var x = dx * Math.cos(rot) - dy * Math.sin(rot), y = dx * Math.sin(rot) + dy * Math.cos(rot); return [clat + y / M_LAT, clon + x / mx]; };
        c = { tl: corner(-hw, hh), tr: corner(hw, hh), bl: corner(-hw, -hh) };
      }
      out.push({ blob: r.blob, w: r.w, h: r.h, c: checkCorners(c), name: nm ? nm.textContent.trim() : null });
    }
    if (!out.length) throw new Error("non ho trovato l'immagine dentro il KMZ");
    return out;
  }
  async function importFiles(files) {
    var list = Array.prototype.slice.call(files), epsg = +(($("#mpEpsg") || {}).value) || 32632, worlds = {}, done = 0, errors = [];
    S().epsgFoto = epsg; Q.save();
    var base = function (n) { return n.replace(/\.[^.]+$/, "").toLowerCase(); };
    list.forEach(function (f) { if (/\.(jgw|pgw|wld|tfw|jpgw|pngw|tifw)$/i.test(f.name)) worlds[base(f.name)] = f; });
    busy = true; imgMsg = "Elaboro le immagini, può volerci qualche secondo…"; imgOpen = true; Q.render();
    for (var i = 0; i < list.length; i++) {
      var f = list[i], res = null;
      if (worlds[base(f.name)] === f) continue;
      try {
        if (/\.(tif|tiff)$/i.test(f.name)) res = [await importTiff(f, epsg, worlds[base(f.name)])];
        else if (/\.kmz$/i.test(f.name)) res = await importKmz(f);
        else if (/\.(jpe?g|png)$/i.test(f.name)) {
          var w = worlds[base(f.name)];
          if (!w) { errors.push(f.name + ": manca il file di georeferenziazione con lo stesso nome (.jgw, .pgw o .wld)"); continue; }
          res = [await importWorld(f, w, epsg)];
        } else { errors.push(f.name + ": formato non gestito"); continue; }
        for (var k = 0; k < res.length; k++) {
          var im = res[k]; im.id = "f" + Date.now().toString(36) + Math.random().toString(36).slice(2, 6); im.name = im.name || f.name + (res.length > 1 ? " (" + (k + 1) + ")" : ""); im.opacity = 1; im.visible = true; im.added = Date.now();
          await saveImg(im); imgs.push(im); addOverlay(im); done++;
          if (k === 0) map.fitBounds(L.latLngBounds([im.c.tl, im.c.tr, im.c.bl]).pad(0.1));
        }
      } catch (e) { errors.push(f.name + ": " + (e && e.message ? e.message : e)); }
    }
    busy = false;
    imgMsg = (done ? done + (done === 1 ? " foto importata. " : " foto importate. ") : "") + errors.join(" · ");
    Q.render();
  }

  /* ---------------- azioni ---------------- */
  document.addEventListener("click", function (e) {
    var b = e.target.closest("[data-mp]"); if (!b) return;
    var a = b.getAttribute("data-mp"), id = b.getAttribute("data-id");
    if (a !== "imgDel") imgConfirm = null;
    switch (a) {
      case "gps": gps.on ? gpsStop() : gpsStart(); return;
      case "rec": recStart(); return;
      case "recFinish": recFinish(); return;
      case "recCancel": rec.on = false; rec.pts = []; drawRec(); Q.render(); return;
      case "fit": if (gps.on && gps.fix) { gps.follow = true; map.setView([gps.fix.lat, gps.fix.lon], Math.max(map.getZoom(), 18)); } else fitAll(); return;
      case "sel": moveSel(+(b.getAttribute("data-r") || 0), +(b.getAttribute("data-c") || 0)); return;
      case "selGps": gps.adjusted = false; gps.sel = locate(); Q.render(); return;
      case "mark": {
        var s = gps.sel; if (!s || s.ri == null) return;
        var v = b.getAttribute("data-v");
        if (v === "n" && window.QOInv) { window.QOInv.replace(Q.plotById(s.plot), [s.ri + ":" + s.k + ":" + s.i]); return; }
        Q.setMark(s.plot, s.ri + ":" + s.k + ":" + s.i, v || null);
        Q.toast(v === "f" ? "Fallanza segnata: filare " + (s.ri + 1) + ", ceppo " + (s.i + 1) : v === "s" ? "Sintomi segnati: filare " + (s.ri + 1) + ", ceppo " + (s.i + 1) : "Segno tolto");
        return;
      }
      case "placeStart": place.on = true; Q.render(); return;
      case "placeEnd": place.on = false; Q.render(); if (S().geo) fitAll(); return;
      case "nudge": nudge(+b.getAttribute("data-x"), +b.getAttribute("data-y")); return;
      case "step": place.step = +b.getAttribute("data-v"); Q.render(); return;
      case "imgFit": { var im = imgs.find(function (x) { return x.id === id; }); if (im) map.fitBounds(L.latLngBounds([im.c.tl, im.c.tr, im.c.bl]).pad(0.05)); return; }
      case "imgDel": {
        if (imgConfirm !== id) { imgConfirm = id; Q.render(); return; }
        imgConfirm = null;
        tx("readwrite", function (st) { st.delete(id); }).catch(function () {});
        if (imgLayers[id]) { map.removeLayer(imgLayers[id]); delete imgLayers[id]; }
        imgs = imgs.filter(function (x) { return x.id !== id; }); imgMsg = "Foto eliminata da questo dispositivo."; Q.render(); return;
      }
    }
  });
  document.addEventListener("change", function (e) {
    var t = e.target, id = t.id || "";
    if (id === "mpFile") { if (t.files && t.files.length) importFiles(t.files); return; }
    if (id === "mpFollow") { gps.follow = t.checked; return; }
    if (id === "mpEpsg") { S().epsgFoto = +t.value; Q.save(); return; }
    if (id.indexOf("mpVis-") === 0) {
      var im = imgs.find(function (x) { return x.id === id.slice(6); }); if (!im) return;
      im.visible = t.checked; if (t.checked) imgLayers[im.id].addTo(map); else map.removeLayer(imgLayers[im.id]);
      saveImg(im).catch(function () {}); return;
    }
    if (id.indexOf("mpOp-") === 0) { var im2 = imgs.find(function (x) { return x.id === id.slice(5); }); if (im2) { im2.opacity = +t.value; saveImg(im2).catch(function () {}); } }
  });
  document.addEventListener("input", function (e) {
    var t = e.target; if (!t.id || t.id.indexOf("mpOp-") !== 0) return;
    var l = imgLayers[t.id.slice(5)]; if (l) l.setOpacity(+t.value);
  });
  document.addEventListener("toggle", function (e) { if (e.target && e.target.id === "mpImgBox") imgOpen = e.target.open; }, true);

  window.QOMap = {
    ok: function () { return true; },
    mount: mount,
    panelHtml: panelHtml
  };
  Q.render();
})();

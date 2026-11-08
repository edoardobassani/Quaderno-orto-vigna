/* Alberi nell'orto e nei frutteti: chioma sulla pianta dell'appezzamento, schedina dell'albero,
   schermata "Zona dell'albero" (cerchio, a punti, camminando, "Sono qui") e alberi singoli.
   Un albero è una pianta di p.plants con una coltura ad albero; i suoi dati stanno in pl.t:
   {v: varietà, port: portinnesto, anno, notes: [{d, txt}], zone: {r} oppure {pts: [{x, y}]}}.
   Un albero singolo è un appezzamento "frutteto" con single: true e un solo albero; la sua forma segue la chioma.
   Espone window.QOAlb; pulsanti con data-al. */
(function () {
  "use strict";
  var Q = window.QO;
  if (!Q) return;
  function S() { return Q.getState(); }
  function UI() { return Q.ui; }
  function esc(s) { return Q.esc(s == null ? "" : s); }
  function $(s) { return document.querySelector(s); }
  function C() { return Q.cropList(); }
  var ORANGE = "#E8590C";
  function r2(v) { return Math.round(v * 100) / 100; }

  /* ---------------- chioma ---------------- */
  function trees(p) { return (p.plants || []).filter(function (pl) { return Q.isTree(pl.c); }); }
  function zoneOf(pl) {
    var z = pl.t && pl.t.zone, c = C()[pl.c];
    if (z && z.pts && z.pts.length >= 3) return { pts: z.pts.map(function (q) { return [q.x, q.y]; }) };
    return { r: z && z.r > 0 ? z.r : (c ? c.row / 200 : 2) };
  }
  function inZone(pl, pt) { var z = zoneOf(pl); return z.pts ? Q.pip(pt, z.pts) : Math.hypot(pt[0] - pl.x, pt[1] - pl.y) <= z.r; }
  function zoneSize(pl) { var z = zoneOf(pl); if (z.r) return "chioma " + Q.num(z.r * 2, 1) + " m di diametro"; var b = Q.bbox(z.pts); return "chioma circa " + Q.num(b.x1 - b.x0, 1) + " × " + Q.num(b.y1 - b.y0, 1) + " m · " + Q.m2(Q.area(z.pts)); }
  function circlePts(x, y, r, n) { var out = []; for (var i = 0; i < (n || 20); i++) { var a = i / (n || 20) * Math.PI * 2; out.push([r2(x + r * Math.cos(a)), r2(y + r * Math.sin(a))]); } return out; }
  function hit(p, pt) { var best = null; trees(p).forEach(function (pl) { if (!inZone(pl, pt)) return; var d = Math.hypot(pl.x - pt[0], pl.y - pt[1]); if (!best || d < best.d) best = { pl: pl, d: d }; }); return best ? best.pl : null; }
  function treeNo(p, pl) { var n = 0; for (var i = 0; i < p.plants.length; i++) { if (p.plants[i].c === pl.c) n++; if (p.plants[i] === pl) return n; } return n; }
  function title(p, pl) { var c = C()[pl.c]; return (c ? c.n : "Albero") + (p.single ? "" : " n. " + treeNo(p, pl)); }

  /* chiome sulla pianta dell'Orto */
  function svg(p, v) {
    var out = "", sel = UI().treeSel;
    trees(p).forEach(function (pl) {
      var c = C()[pl.c] || { c: "#888780" }, z = zoneOf(pl), on = pl.id === sel, st = ' fill="' + c.c + '" fill-opacity="' + (on ? 0.32 : 0.22) + '" stroke="' + (on ? ORANGE : c.c) + '" stroke-width="' + (on ? 3 : 1.5) + '"' + (on ? '' : ' stroke-dasharray="4 3"') + ' vector-effect="non-scaling-stroke" pointer-events="none"';
      out += z.pts ? '<polygon points="' + z.pts.map(function (q) { return q.join(","); }).join(" ") + '"' + st + '/>' : '<circle cx="' + pl.x + '" cy="' + pl.y + '" r="' + z.r + '"' + st + '/>';
      out += '<circle cx="' + pl.x + '" cy="' + pl.y + '" r="' + Math.max(0.2, v.w / 110) + '" fill="' + c.c + '" stroke="var(--surface)" stroke-width="1.5" vector-effect="non-scaling-stroke" pointer-events="none"/>';
    });
    return out;
  }

  /* ---------------- schedina dell'albero ---------------- */
  function selTree(p) { var id = UI().treeSel; return id ? (p.plants || []).filter(function (pl) { return pl.id === id && Q.isTree(pl.c); })[0] || null : null; }
  function cardHtml(p) {
    var pl = selTree(p); if (!pl) return "";
    var c = C()[pl.c] || {}, t = pl.t || {}, notes = (t.notes || []).slice().reverse();
    var h = '<div class="panel stack" id="alCard" style="margin-top:12px;border:2px solid ' + ORANGE + '"><div class="row" style="justify-content:space-between"><h2>' + esc(title(p, pl)) + '</h2><span class="badge b-n">Albero</span></div>';
    h += '<div class="grid2"><label class="f">Varietà<input id="alVar" value="' + esc(t.v || "") + '" placeholder="es. Dottato"></label><label class="f">Portinnesto<input id="alPort" value="' + esc(t.port || "") + '" placeholder="es. franco"></label><label class="f">Anno d\'impianto<input id="alAnno" type="number" inputmode="numeric" value="' + esc(t.anno || "") + '"></label><div><div class="small muted">Raccolta</div><b class="small">' + esc(c.harv || "non indicata") + '</b></div></div>';
    h += '<div class="small">' + esc(zoneSize(pl)) + ' · distanza d\'impianto ' + Q.num((c.row || 0) / 100, 1) + ' × ' + Q.num((c.btw || 0) / 100, 1) + ' m</div>';
    h += '<div class="sep"></div><h3>Note</h3>';
    if (notes.length) h += '<div class="stack" style="gap:6px">' + notes.slice(0, 6).map(function (n) { return '<div class="small"><span class="muted">' + esc(n.d ? Q.fmt(Q.parse(n.d)) : "") + '</span> ' + esc(n.txt) + '</div>'; }).join("") + '</div>';
    h += '<div class="row" style="flex-wrap:nowrap;gap:6px"><input id="alNote" placeholder="es. da potare a fine inverno" style="flex:1;min-width:0"><button class="btn sm" data-al="note">Aggiungi</button></div>';
    h += '<div class="row"><button class="btn primary sm" data-al="zone">Zona dell\'albero</button><button class="btn sm" data-al="close">Chiudi</button><button class="btn sm danger" data-al="del">' + (UI().confirm === "alDel" ? (p.single ? 'Tocca ancora: tolgo albero e appezzamento' : 'Tocca ancora per togliere') : 'Togli albero') + '</button></div>';
    return h + '</div>';
  }

  /* ---------------- zona dell'albero ---------------- */
  function Z() { return UI().zedit; }
  var view = null, raf = 0, watchId = null, measTimer = null, wake = null;
  function openZone(p, pl) {
    var z = zoneOf(pl);
    UI().zedit = { pid: p.id, plid: pl.id, crop: pl.c, trunk: [pl.x, pl.y], mode: z.pts ? "punti" : "cerchio", r: z.r || (C()[pl.c].row / 200), pts: z.pts ? z.pts.map(function (q) { return q.slice(); }) : [], placing: false, rec: null, meas: null, single: !!p.single };
    view = null; window.scrollTo(0, 0);
  }
  function openSingle() {
    var ck = Q.isTree(S().cropSel) ? S().cropSel : "limone";
    UI().zedit = { pid: null, plid: null, crop: ck, trunk: null, mode: "cerchio", r: C()[ck].row / 200, pts: [], placing: false, rec: null, meas: null, single: true, isNew: true };
    view = null; window.scrollTo(0, 0);
  }
  function zoneClose() { stopGps(); UI().zedit = null; view = null; }

  function zoneHtml() {
    var e = Z(), c = C()[e.crop] || { n: "Albero" }, p = e.pid ? Q.plotById(e.pid) : null, h = '';
    h += '<div class="top"><div><div class="eyebrow">' + esc(e.isNew ? "Albero singolo" : (p ? title(p, p.plants.filter(function (q) { return q.id === e.plid; })[0]) : c.n)) + '</div><h1>Zona dell\'albero</h1></div></div><div class="panel stack">';
    if (e.isNew) h += '<label class="f">Albero<select id="alCrop">' + Object.keys(C()).filter(function (k) { return C()[k].tree; }).map(function (k) { return '<option value="' + k + '"' + (k === e.crop ? ' selected' : '') + '>' + esc(C()[k].n) + '</option>'; }).join("") + '</select></label>';
    h += '<div class="row" role="group" aria-label="Come disegnare la zona" style="flex-wrap:nowrap;gap:6px">' + [["cerchio", "Cerchio"], ["punti", "A punti"], ["cammina", "Camminando"]].map(function (m) { return '<button class="btn sm" data-al="mode" data-v="' + m[0] + '" aria-pressed="' + (e.mode === m[0]) + '" style="flex:1">' + m[1] + '</button>'; }).join("") + '</div>';
    h += '<div class="mapwrap"><svg id="zsvg" role="img" aria-label="Zona dell\'albero sulla foto"></svg><div class="zoom"><button data-al="zin" aria-label="Ingrandisci">+</button><button data-al="zout" aria-label="Rimpicciolisci">−</button><button data-al="zfit" aria-label="Adatta" style="font-size:13px">⤢</button></div></div>';
    h += '<span class="small muted">' + hint(e) + '</span>';
    h += modePanel(e);
    h += '<div class="sep"></div><div class="row"><button class="btn sm" data-al="here"' + (e.meas ? ' aria-pressed="true"' : '') + '>' + (e.meas ? 'Misuro…' : 'Sono qui (tronco)') + '</button><span class="small mono" id="zmeas">' + measText(e) + '</span></div>';
    if (window.QOSfondo) h += window.QOSfondo.html();
    h += '<div class="row"><button class="btn primary" data-al="zsave">Salva zona</button><button class="btn" data-al="zcancel">Annulla</button></div>';
    return h + '</div>';
  }
  function hint(e) {
    if (!e.trunk) return "Tocca il tronco sulla foto, oppure mettiti accanto al tronco e usa «Sono qui».";
    if (e.mode === "cerchio") return "Trascina il pallino sul bordo finché il cerchio coincide con la chioma. Il tronco si trascina.";
    if (e.mode === "punti") return e.placing ? "Tocca il contorno della chioma, un punto dopo l'altro." : "Trascina i punti per correggere il contorno.";
    return e.rec ? "Gira intorno alla chioma tenendo lo schermo acceso." : "Mettiti sotto il bordo della chioma e tocca «Inizia il giro».";
  }
  function modePanel(e) {
    var h = '<div class="stack" style="gap:8px">';
    if (e.mode === "cerchio") h += '<div class="row"><button class="btn sm" data-al="rStep" data-v="-0.25" aria-label="Chioma più piccola">−</button><b class="mono" id="zdiam">' + Q.num(e.r * 2, 1) + ' m</b><button class="btn sm" data-al="rStep" data-v="0.25" aria-label="Chioma più grande">+</button><span class="small muted">di diametro</span></div>';
    else if (e.mode === "punti") h += e.placing ? '<div class="row"><button class="btn primary sm" data-al="pEnd">Fine contorno</button><button class="btn sm" data-al="pUndo">Togli ultimo</button><span class="small muted">' + e.pts.length + ' punti</span></div>' : '<div class="row"><button class="btn sm" data-al="pNew">Ricomincia il contorno</button>' + (e.pts.length >= 3 ? '<span class="small">' + Q.m2(Q.area(e.pts)) + '</span>' : '') + '</div>';
    else {
      if (!S().geo) h += '<span class="small">Per camminare serve la posizione GPS dell\'azienda: importa o disegna prima un appezzamento sulla mappa satellitare.</span>';
      else h += e.rec ? '<div class="row"><button class="btn primary sm" data-al="recStop">Fine giro</button><button class="btn sm" data-al="recCancel">Annulla</button></div><span class="small mono" id="zrec">' + e.rec.pts.length + ' punti' + (e.rec.acc != null ? ' · precisione ±' + Math.round(e.rec.acc) + ' m' : ' · in attesa del GPS') + '</span>' : '<div class="row"><button class="btn sm" data-al="recStart">Inizia il giro</button></div>';
    }
    return h + '</div>';
  }
  function measText(e) {
    if (e.meas) { var left = Math.max(0, Math.ceil((e.meas.until - Date.now()) / 1000)); return left + " s · " + e.meas.n + " posizioni" + (e.meas.best != null ? " · ±" + Math.round(e.meas.best) + " m" : ""); }
    return e.lastAcc != null ? "tronco messo col GPS · ±" + Math.round(e.lastAcc) + " m" : "";
  }

  /* ---------------- disegno della zona ---------------- */
  function svgEl() { return $("#zsvg"); }
  function fit() {
    var e = Z(), b;
    if (e.trunk) { var R = Math.max(8, (e.mode === "cerchio" ? e.r : 3) * 3); b = { x0: e.trunk[0] - R, x1: e.trunk[0] + R, y0: e.trunk[1] - R, y1: e.trunk[1] + R }; if (e.pts.length >= 3) { var pb = Q.bbox(e.pts); b = { x0: Math.min(b.x0, pb.x0 - 3), x1: Math.max(b.x1, pb.x1 + 3), y0: Math.min(b.y0, pb.y0 - 3), y1: Math.max(b.y1, pb.y1 + 3) }; } }
    else { var all = []; S().plots.forEach(function (p) { all = all.concat(p.pts); }); b = all.length ? Q.bbox(all) : { x0: -50, x1: 50, y0: -50, y1: 50 }; }
    var w = b.x1 - b.x0, h = b.y1 - b.y0, asp = 0.85; if (h / w > asp) w = h / asp; else h = w * asp;
    view = { x: (b.x0 + b.x1) / 2 - w / 2, y: (b.y0 + b.y1) / 2 - h / 2, w: w, h: h };
  }
  function k() { var s = svgEl(), r = s && s.getBoundingClientRect(); return view.w / ((r && r.width) || 360); }
  function pl(pts) { return pts.map(function (q) { return q[0].toFixed(2) + "," + q[1].toFixed(2); }).join(" "); }
  function draw() {
    raf = 0; var e = Z(), s = svgEl(); if (!e || !s) return; if (!view) fit();
    s.setAttribute("viewBox", view.x + " " + view.y + " " + view.w + " " + view.h);
    var kk = k(), SF = window.QOSfondo, bg = !!(SF && SF.on()), out = '', c = C()[e.crop] || { c: "#888780" }, line = bg ? "#fff" : "var(--ink-2)";
    if (!s.querySelector("#zbg")) s.innerHTML = '<g id="zbg"></g><g id="zfg"></g>';
    if (SF) SF.paint(s.querySelector("#zbg"), view, kk);
    /* appezzamenti e altri alberi intorno, per orientarsi */
    S().plots.forEach(function (p) {
      var b = Q.bbox(p.pts); if (b.x1 < view.x || b.x0 > view.x + view.w || b.y1 < view.y || b.y0 > view.y + view.h) return;
      if (!p.single) out += '<polygon points="' + pl(p.pts) + '" fill="none" stroke="' + line + '" stroke-opacity=".7" stroke-width="1.2" vector-effect="non-scaling-stroke"/>';
      trees(p).forEach(function (t) { if (t.id === e.plid) return; var z = zoneOf(t); out += z.pts ? '<polygon points="' + pl(z.pts) + '" fill="none" stroke="' + line + '" stroke-dasharray="3 3" vector-effect="non-scaling-stroke"/>' : '<circle cx="' + t.x + '" cy="' + t.y + '" r="' + z.r + '" fill="none" stroke="' + line + '" stroke-dasharray="3 3" vector-effect="non-scaling-stroke"/>'; });
    });
    var zf = ' fill="' + c.c + '" fill-opacity=".22" stroke="' + (bg ? '#fff' : c.c) + '" stroke-width="2.5" vector-effect="non-scaling-stroke"';
    if (e.mode === "cerchio" && e.trunk) {
      out += '<circle cx="' + e.trunk[0] + '" cy="' + e.trunk[1] + '" r="' + e.r + '"' + zf + '/>';
      out += '<line x1="' + e.trunk[0] + '" y1="' + e.trunk[1] + '" x2="' + (e.trunk[0] + e.r) + '" y2="' + e.trunk[1] + '" stroke="' + (bg ? '#fff' : 'var(--ink)') + '" stroke-dasharray="4 3" vector-effect="non-scaling-stroke"/>';
      out += '<circle cx="' + (e.trunk[0] + e.r) + '" cy="' + e.trunk[1] + '" r="' + 10 * kk + '" fill="var(--surface)" stroke="' + ORANGE + '" stroke-width="3" vector-effect="non-scaling-stroke"/>';
    }
    if (e.mode !== "cerchio" && e.pts.length) {
      out += e.placing || e.pts.length < 3 ? '<polyline points="' + pl(e.pts) + '" fill="none" stroke="' + (bg ? '#fff' : c.c) + '" stroke-width="2.5" vector-effect="non-scaling-stroke"/>' : '<polygon points="' + pl(e.pts) + '"' + zf + '/>';
      e.pts.forEach(function (q) { out += '<circle cx="' + q[0] + '" cy="' + q[1] + '" r="' + (e.pts.length > 14 ? 5 : 8) * kk + '" fill="var(--surface)" stroke="' + ORANGE + '" stroke-width="3" vector-effect="non-scaling-stroke"/>'; });
    }
    if (e.mode === "cammina" && e.rec) {
      if (e.rec.pts.length > 1) out += '<polyline points="' + pl(e.rec.pts) + '" fill="none" stroke="' + ORANGE + '" stroke-width="4" stroke-linecap="round" vector-effect="non-scaling-stroke"/>';
      if (e.rec.here) out += '<circle cx="' + e.rec.here[0] + '" cy="' + e.rec.here[1] + '" r="' + 7 * kk + '" fill="#378ADD" stroke="#fff" stroke-width="2" vector-effect="non-scaling-stroke"/>';
    }
    if (e.trunk) out += '<circle cx="' + e.trunk[0] + '" cy="' + e.trunk[1] + '" r="' + 8 * kk + '" fill="' + ORANGE + '" stroke="#fff" stroke-width="2" vector-effect="non-scaling-stroke"/><text x="' + e.trunk[0] + '" y="' + (e.trunk[1] - 13 * kk) + '" font-size="' + 12 * kk + '" text-anchor="middle" font-weight="700" fill="var(--ink)" stroke="var(--surface)" stroke-width="' + 3 * kk + '" paint-order="stroke" pointer-events="none">tronco</text>';
    out += '<text x="' + (view.x + 12 * kk) + '" y="' + (view.y + 22 * kk) + '" font-size="' + 14 * kk + '" font-weight="700" fill="var(--ink)" stroke="var(--surface)" stroke-width="' + 3 * kk + '" paint-order="stroke" pointer-events="none">N ↑</text>';
    s.querySelector("#zfg").innerHTML = out;
    var d = $("#zdiam"); if (d) d.textContent = Q.num(e.r * 2, 1) + " m";
  }
  function redraw() { if (!raf) raf = requestAnimationFrame(draw); }

  function toM(ev) { var s = svgEl(), r = s.getBoundingClientRect(); return [view.x + (ev.clientX - r.left) / r.width * view.w, view.y + (ev.clientY - r.top) / r.height * view.h]; }
  function near(a, b, px) { return a && Math.hypot(a[0] - b[0], a[1] - b[1]) < px * k(); }
  function bind() {
    var s = svgEl(); if (!s) return; var P = {}, st = null, pz = null;
    function list() { return Object.keys(P).map(function (x) { return P[x]; }); }
    s.addEventListener("pointerdown", function (ev) {
      var e = Z(); P[ev.pointerId] = { x: ev.clientX, y: ev.clientY }; try { s.setPointerCapture(ev.pointerId); } catch (_) {}
      var a = list();
      if (a.length === 2) { st = null; pz = { d: Math.hypot(a[0].x - a[1].x, a[0].y - a[1].y) || 1, mx: (a[0].x + a[1].x) / 2, my: (a[0].y + a[1].y) / 2, v: Object.assign({}, view), r: s.getBoundingClientRect() }; return; }
      if (a.length !== 1) return; var pt = toM(ev), vi = -1;
      if (e.mode === "cerchio" && e.trunk && near([e.trunk[0] + e.r, e.trunk[1]], pt, 24)) st = { kind: "rad" };
      else if (e.trunk && near(e.trunk, pt, 22)) st = { kind: "trunk" };
      else if (e.mode !== "cerchio" && !e.placing && e.pts.some(function (q, i) { if (near(q, pt, 22)) { vi = i; return true; } return false; })) st = { kind: "vert", i: vi };
      else st = { kind: "pan", v: Object.assign({}, view) };
      st.x = ev.clientX; st.y = ev.clientY; st.moved = false;
    });
    s.addEventListener("pointermove", function (ev) {
      if (!P[ev.pointerId]) return; P[ev.pointerId] = { x: ev.clientX, y: ev.clientY }; var e = Z(), a = list();
      if (pz && a.length >= 2) { var d = Math.hypot(a[0].x - a[1].x, a[0].y - a[1].y) || 1, f = pz.d / d, w = Math.max(2, Math.min(5000, pz.v.w * f)); f = w / pz.v.w; var px = pz.v.x + (pz.mx - pz.r.left) / pz.r.width * pz.v.w, py = pz.v.y + (pz.my - pz.r.top) / pz.r.height * pz.v.h, kk = w / pz.r.width, mx = (a[0].x + a[1].x) / 2, my = (a[0].y + a[1].y) / 2; view = { x: px - (px - pz.v.x) * f - (mx - pz.mx) * kk, y: py - (py - pz.v.y) * f - (my - pz.my) * kk, w: w, h: pz.v.h * f }; redraw(); return; }
      if (!st) return; var dx = ev.clientX - st.x, dy = ev.clientY - st.y; if (!st.moved && Math.hypot(dx, dy) < 6) return; st.moved = true;
      var q = toM(ev);
      if (st.kind === "rad") { e.r = Math.max(0.3, r2(Math.hypot(q[0] - e.trunk[0], q[1] - e.trunk[1]))); redraw(); }
      else if (st.kind === "trunk") { e.trunk = [r2(q[0]), r2(q[1])]; e.lastAcc = null; redraw(); }
      else if (st.kind === "vert") { e.pts[st.i] = [r2(q[0]), r2(q[1])]; redraw(); }
      else { var kk2 = st.v.w / s.getBoundingClientRect().width; view = { x: st.v.x - dx * kk2, y: st.v.y - dy * kk2, w: st.v.w, h: st.v.h }; redraw(); }
    });
    function up(ev, cancel) {
      var was = list().length; delete P[ev.pointerId]; var e = Z(); if (!e) return;
      if (was >= 2) { pz = null; st = null; return; }
      if (!st) return; var cur = st; st = null; if (cancel) return;
      if (cur.moved) { if (cur.kind !== "pan") Q.render(); return; }
      if (cur.kind !== "pan") return;
      var pt = toM(ev).map(r2);
      if (!e.trunk) { e.trunk = pt; if (e.mode === "punti" && !e.pts.length) e.placing = true; Q.render(); return; }
      if (e.mode === "punti" && e.placing) { e.pts.push(pt); Q.render(); }
    }
    s.addEventListener("pointerup", function (ev) { up(ev, false); });
    s.addEventListener("pointercancel", function (ev) { up(ev, true); });
    s.addEventListener("wheel", function (ev) { ev.preventDefault(); var f = ev.deltaY > 0 ? 1.15 : 1 / 1.15, pt = toM(ev); view = { x: pt[0] - (pt[0] - view.x) * f, y: pt[1] - (pt[1] - view.y) * f, w: view.w * f, h: view.h * f }; redraw(); }, { passive: false });
  }

  /* ---------------- GPS: tronco e giro intorno alla chioma ---------------- */
  function stopGps() {
    if (watchId != null && navigator.geolocation) navigator.geolocation.clearWatch(watchId); watchId = null;
    if (measTimer) { clearInterval(measTimer); measTimer = null; }
    if (wake) { try { wake.release(); } catch (_) {} wake = null; }
  }
  function keepAwake() { try { if (navigator.wakeLock) navigator.wakeLock.request("screen").then(function (w) { wake = w; }, function () {}); } catch (_) {} }
  function gpsOk() { if (!navigator.geolocation) { Q.toast("Questo telefono non dà la posizione al browser"); return false; } if (!S().geo) { Q.toast("Serve la posizione GPS dell'azienda: importa o disegna prima un appezzamento sulla mappa satellitare"); return false; } return true; }
  function gpsErr(err) { var e = Z(); if (err.code !== 1 && e && ((e.meas && e.meas.n) || (e.rec && e.rec.acc != null))) return; Q.toast(err.code === 1 ? "Permesso di posizione negato: attivalo nelle impostazioni del browser" : "Posizione non trovata, riprova all'aperto"); }
  /* "Sono qui": media pesata delle posizioni per 20 secondi (le più precise contano di più) */
  function measure() {
    var e = Z(); if (!gpsOk()) return; stopGps();
    e.meas = { sx: 0, sy: 0, sw: 0, n: 0, best: null, until: Date.now() + 20000 }; keepAwake();
    watchId = navigator.geolocation.watchPosition(function (pos) {
      var e2 = Z(); if (!e2 || !e2.meas) return; var c = pos.coords; if (c.accuracy > 30) return;
      var q = Q.llToPts([[c.latitude, c.longitude]])[0]; if (!q) return; var w = 1 / Math.max(1, c.accuracy * c.accuracy);
      e2.meas.sx += q[0] * w; e2.meas.sy += q[1] * w; e2.meas.sw += w; e2.meas.n++; e2.meas.best = e2.meas.best == null ? c.accuracy : Math.min(e2.meas.best, c.accuracy);
    }, gpsErr, { enableHighAccuracy: true, maximumAge: 0, timeout: 30000 });
    measTimer = setInterval(function () {
      var e3 = Z(); if (!e3 || !e3.meas) { stopGps(); return; } var t = $("#zmeas"); if (t) t.textContent = measText(e3);
      if (Date.now() >= e3.meas.until) {
        var m = e3.meas; stopGps(); e3.meas = null;
        if (!m.n) { Q.toast("Nessuna posizione abbastanza precisa: riprova all'aperto"); Q.render(); return; }
        var nt = [r2(m.sx / m.sw), r2(m.sy / m.sw)];
        if (e3.trunk && e3.mode !== "cerchio") { var dx = nt[0] - e3.trunk[0], dy = nt[1] - e3.trunk[1]; e3.pts = e3.pts.map(function (q) { return [r2(q[0] + dx), r2(q[1] + dy)]; }); }
        e3.trunk = nt; e3.lastAcc = m.best / Math.sqrt(Math.max(1, m.n / 4)); view = null;
        Q.toast("Tronco messo col GPS (" + m.n + " posizioni)"); Q.render();
      }
    }, 1000);
  }
  function recStart() {
    var e = Z(); if (!gpsOk()) return; stopGps(); e.rec = { pts: [], acc: null, here: null }; keepAwake();
    watchId = navigator.geolocation.watchPosition(function (pos) {
      var e2 = Z(); if (!e2 || !e2.rec) return; var c = pos.coords, q = Q.llToPts([[c.latitude, c.longitude]])[0]; if (!q) return;
      e2.rec.acc = c.accuracy; e2.rec.here = q;
      if (c.accuracy <= 25) { var l = e2.rec.pts[e2.rec.pts.length - 1]; if (!l || Math.hypot(l[0] - q[0], l[1] - q[1]) >= 0.7) e2.rec.pts.push(q); }
      var t = $("#zrec"); if (t) t.textContent = e2.rec.pts.length + " punti · precisione ±" + Math.round(c.accuracy) + " m"; redraw();
    }, gpsErr, { enableHighAccuracy: true, maximumAge: 0, timeout: 30000 });
  }
  function recStop() {
    var e = Z(), pts = e.rec ? e.rec.pts : []; stopGps(); e.rec = null;
    if (pts.length < 4) { Q.toast("Troppo pochi punti: fai il giro completo intorno alla chioma"); return; }
    var sm = pts.map(function (q, i) { var x = 0, y = 0, n = 0; for (var j = Math.max(0, i - 2); j <= Math.min(pts.length - 1, i + 2); j++) { x += pts[j][0]; y += pts[j][1]; n++; } return [x / n, y / n]; });
    var poly = Q.simplifyLine(sm, 0.4); if (poly.length > 3 && Math.hypot(poly[0][0] - poly[poly.length - 1][0], poly[0][1] - poly[poly.length - 1][1]) < 1.5) poly.pop();
    if (poly.length < 3 || Q.area(poly) < 1) { Q.toast("Il giro è troppo piccolo: riprova girando sotto il bordo della chioma"); return; }
    e.pts = poly; e.mode = "punti"; e.placing = false;
    if (!e.trunk) { var cx = 0, cy = 0; poly.forEach(function (q) { cx += q[0] / poly.length; cy += q[1] / poly.length; }); e.trunk = [r2(cx), r2(cy)]; }
    Q.toast("Giro registrato: correggi i punti se il GPS ha sbagliato");
  }

  /* ---------------- salvataggio ---------------- */
  function zonePoly(e) { return e.mode === "cerchio" ? circlePts(e.trunk[0], e.trunk[1], e.r, 20) : e.pts; }
  function zsave() {
    var e = Z(), st = S();
    if (e.meas || e.rec) { Q.toast("Aspetta la fine della misura col GPS"); return false; }
    if (!e.trunk) { Q.toast("Tocca prima il tronco sulla foto, oppure usa «Sono qui»"); return false; }
    if (e.mode !== "cerchio" && e.pts.length < 3) { Q.toast("Il contorno ha bisogno di almeno tre punti"); return false; }
    var zone = e.mode === "cerchio" ? { r: r2(e.r) } : { pts: e.pts.map(function (q) { return { x: q[0], y: q[1] }; }) }, c = C()[e.crop];
    if (e.isNew) {
      var same = st.plots.filter(function (p) { return p.single && p.plants.some(function (q) { return q.c === e.crop; }); }).length;
      var tr = { id: Q.uid(), c: e.crop, x: e.trunk[0], y: e.trunk[1], t: { anno: Q.today().getFullYear(), zone: zone } };
      var np = { id: Q.uid(), name: c.n + " " + (same + 1), type: "frutteto", single: true, pts: zonePoly(e).map(function (q) { return [r2(q[0]), r2(q[1])]; }), plants: [tr] };
      Q.autoTer(np); st.plots.push(np); st.osel = np.id; UI().treeSel = tr.id; UI().tab = "impianto";
      zoneClose(); delete Q.views().map; Q.save(); Q.toast("Albero aggiunto: " + np.name);
    } else {
      var p = Q.plotById(e.pid), pl = p && p.plants.filter(function (q) { return q.id === e.plid; })[0]; if (!pl) { zoneClose(); return; }
      pl.x = e.trunk[0]; pl.y = e.trunk[1]; pl.t = pl.t || {}; pl.t.zone = zone;
      if (p.single) { p.pts = zonePoly(e).map(function (q) { return [r2(q[0]), r2(q[1])]; }); delete Q.views().map; }
      delete Q.views()["imp-" + p.id]; UI().treeSel = pl.id; zoneClose(); Q.save(); Q.toast("Zona salvata: " + zoneSize(pl));
    }
  }

  /* ---------------- pulsanti ---------------- */
  function act(a, b) {
    var ui = UI();
    if (a === "single") { openSingle(); Q.render(); return; }
    if (Z()) {
      var e = Z();
      if (a === "mode") { var m = b.getAttribute("data-v"); if (e.rec && m !== "cammina") { stopGps(); e.rec = null; } if (m === "punti" && !e.pts.length && e.trunk) { e.pts = circlePts(e.trunk[0], e.trunk[1], e.r, 8); } e.mode = m; e.placing = false; }
      else if (a === "rStep") { e.r = Math.max(0.3, r2(e.r + +b.getAttribute("data-v"))); redraw(); return; }
      else if (a === "pNew") { e.pts = []; e.placing = true; }
      else if (a === "pUndo") e.pts.pop();
      else if (a === "pEnd") { if (e.pts.length < 3) { Q.toast("Servono almeno tre punti"); return; } e.placing = false; }
      else if (a === "here") { if (e.meas) return; measure(); }
      else if (a === "recStart") recStart();
      else if (a === "recStop") recStop();
      else if (a === "recCancel") { stopGps(); e.rec = null; }
      else if (a === "zin" || a === "zout") { var f = a === "zin" ? 0.6 : 1.6, cx = view.x + view.w / 2, cy = view.y + view.h / 2; view = { x: cx - view.w * f / 2, y: cy - view.h * f / 2, w: view.w * f, h: view.h * f }; redraw(); return; }
      else if (a === "zfit") { fit(); redraw(); return; }
      else if (a === "zcancel") zoneClose();
      else if (a === "zsave") { if (zsave() === false) return; }
      Q.render(); return;
    }
    var p = Q.ortoSel(); if (!p) return; var pl = selTree(p); if (!pl) return;
    if (a !== "del") ui.confirm = null;
    if (a === "close") ui.treeSel = null;
    else if (a === "zone") openZone(p, pl);
    else if (a === "note") { var inp = $("#alNote"), txt = inp ? inp.value.trim() : ""; if (!txt) { Q.toast("Scrivi la nota"); return; } pl.t = pl.t || {}; pl.t.notes = pl.t.notes || []; pl.t.notes.push({ d: Q.iso(Q.today()), txt: txt }); Q.save(); }
    else if (a === "del") {
      if (ui.confirm !== "alDel") { ui.confirm = "alDel"; Q.render(); return; }
      ui.confirm = null; ui.treeSel = null;
      if (p.single) { S().plots = S().plots.filter(function (x) { return x.id !== p.id; }); S().plans = S().plans.filter(function (x) { return x.plot !== p.id; }); delete Q.views().map; }
      else p.plants = p.plants.filter(function (x) { return x !== pl; });
      Q.save(); Q.toast("Albero tolto");
    }
    Q.render();
  }
  document.addEventListener("click", function (e) { var b = e.target.closest("[data-al]"); if (!b) return; e.preventDefault(); act(b.getAttribute("data-al"), b); });
  document.addEventListener("change", function (e) {
    var id = e.target && e.target.id; if (!id) return;
    if (id === "alCrop" && Z()) { var z = Z(); z.crop = e.target.value; z.r = C()[z.crop].row / 200; Q.render(); return; }
    if (id === "alVar" || id === "alPort" || id === "alAnno") { var p = Q.ortoSel(), pl = p && selTree(p); if (!pl) return; pl.t = pl.t || {}; var k2 = { alVar: "v", alPort: "port", alAnno: "anno" }[id], v = e.target.value.trim(); pl.t[k2] = k2 === "anno" ? (parseInt(v, 10) || null) : v; Q.save(); }
  });

  window.QOAlb = {
    svg: svg, hit: hit, cardHtml: cardHtml,
    zoneHtml: zoneHtml, zoneClose: zoneClose,
    zoneAfter: function () { if (!Z()) return; if (window.QOSfondo) window.QOSfondo.bind(redraw); bind(); draw(); }
  };
})();

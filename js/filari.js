/* Direzione dei filari: il "filare guida" si disegna col dito, si cammina col GPS o si ruota a vista.
   Gli altri filari vengono copiati dal filare guida alla distanza tra filari (vedi vineGeoGuide in index.html).
   Lo stato della schermata è in QO.ui.gedit; la parcella si aggiorna solo con "Salva". */
(function () {
  "use strict";
  var Q = window.QO;
  if (!Q) return;
  function S() { return Q.getState(); }
  function UI() { return Q.ui; }
  function E() { return UI().gedit; }
  function esc(s) { return Q.esc(s == null ? "" : s); }
  function $(s) { return document.querySelector(s); }

  var ORANGE = "#E8590C";
  var view = null, watchId = null, wakeLock = null, raf = 0;

  /* ---------------- apertura e chiusura ---------------- */
  function source(e) { var f = UI().vedit; return e.form && f ? f : Q.plotById(e.id).vine; }
  function open(id) {
    var p = Q.plotById(id); if (!p || !p.vine) return;
    var f = UI().vedit, form = !!(f && f.id === id), src = form ? f : p.vine;
    var g = Q.guidePts({ guida: src.guida });
    if (g.length < 2) {
      if (src.rmode === "auto") g = Q.straightGuide(p.pts, src.oriAuto ? Q.longestEdgeAngle(p.pts) : +src.ori || 0);
      else g = Q.defaultGuide(p);
    }
    UI().gedit = { id: id, form: form, guide: g, orig: JSON.stringify([g, !!src.grev, src.rmode]), rev: !!src.grev, sel: -1, pmode: "free", placing: false, tool: g.length === 2 ? "gira" : "dito", tracing: false, rec: null, curve: null, confirm: false };
    view = null;
  }
  function close() { stopWatch(); UI().gedit = null; view = null; }

  /* ---------------- geometria per l'anteprima ---------------- */
  function tmpPlot(e) {
    var p = Q.plotById(e.id), src = source(e);
    return { id: "_g", pts: p.pts, vine: Object.assign({}, p.vine, { inter: src.inter, row: src.row, nrows: src.nrows, r0: src.r0, grev: e.rev }) };
  }
  function geo(e) { return Q.vineGeoGuide(tmpPlot(e), e.guide); }

  /* ---------------- schermata ---------------- */
  function toolBtn(e, v, lab) { return '<button class="btn sm" data-fi="tool" data-v="' + v + '" aria-pressed="' + (e.tool === v) + '" style="flex:1">' + lab + '</button>'; }
  function html() {
    var e = E(), p = Q.plotById(e.id); if (!p) { close(); return ""; }
    var src = source(e), nm = Object.keys(p.vine.marks || {}).length, h = '';
    h += '<div class="panel stack" style="border:2px solid var(--vigna)">';
    h += '<div><div class="eyebrow">' + esc(p.name) + '</div><h2>Direzione dei filari</h2></div>';
    h += '<div class="row" role="group" aria-label="Come indicare il filare guida" style="flex-wrap:nowrap;gap:6px">' + toolBtn(e, "dito", "Disegna") + toolBtn(e, "gps", "Cammina") + toolBtn(e, "gira", "Gira") + '</div>';
    h += '<div class="mapwrap"><svg id="gsvg" role="img" aria-label="Parcella con il filare guida e i filari copiati"></svg><div class="zoom"><button data-fi="zin" aria-label="Ingrandisci">+</button><button data-fi="zout" aria-label="Rimpicciolisci">−</button><button data-fi="zfit" aria-label="Adatta" style="font-size:13px">⤢</button></div></div><span class="small muted" id="ghint">' + hint(e) + '</span>';
    h += toolPanel(e);
    if (window.QOSfondo) h += window.QOSfondo.html();
    h += '<div class="row" style="justify-content:space-between;gap:6px"><span class="small" id="gsum"></span><button class="btn sm" data-fi="rev">Inverti numerazione</button></div>';
    if (nm && !e.form) h += '<span class="small" style="color:var(--warn)">Questa parcella ha ' + nm + (nm === 1 ? ' segno' : ' segni') + ' sui ceppi. Se cambi la direzione, i segni restano sugli stessi numeri di filare e di ceppo, ma finiscono su ceppi diversi.</span>';
    h += '<div class="row"><button class="btn primary" data-fi="save">' + (e.confirm ? 'Tocca ancora per salvare' : e.form ? 'Usa questa direzione' : 'Salva') + '</button><button class="btn" data-fi="cancel">Annulla</button></div>';
    if (src.rmode !== "guida") h += '<span class="small muted">Salvando, questa parcella passa ai filari copiati dal filare guida.</span>';
    return h + '</div>';
  }
  function hint(e) {
    if (e.tool === "gira") return "Ruota con la barra finché i filari combaciano. Con due dita ingrandisci.";
    if (e.tool === "gps" && e.rec) return "Cammina lungo il filare fino in fondo.";
    if (e.tracing) return "Traccia il filare col dito, da un capo all'altro.";
    if (e.placing) return "Tocca la mappa lungo il filare, un punto dopo l'altro. Metti un punto all'inizio e alla fine di ogni tratto dritto.";
    if (e.sel >= 0 && e.tool !== "gira") return "Punto scelto: decidi se è ad angolo o in curva, oppure trascinalo.";
    return "Trascina i punti arancioni per correggere. Tocca la linea per aggiungere un punto.";
  }
  function toolPanel(e) {
    var h = '<div class="stack" style="gap:8px">';
    if (e.tool === "dito") {
      h += '<div class="row" role="group" aria-label="Modo di disegno" style="flex-wrap:nowrap;gap:6px"><button class="btn sm" data-fi="pmode" data-v="free" aria-pressed="' + (e.pmode !== "punti") + '" style="flex:1">A mano libera</button><button class="btn sm" data-fi="pmode" data-v="punti" aria-pressed="' + (e.pmode === "punti") + '" style="flex:1">A punti</button></div>';
      if (e.pmode === "punti") h += e.placing
        ? '<div class="row"><button class="btn primary sm" data-fi="placeEnd">Fine</button><button class="btn sm" data-fi="placeUndo">Togli ultimo</button></div><span class="small muted">' + e.guide.length + (e.guide.length === 1 ? ' punto' : ' punti') + '. I punti nuovi sono ad angolo: quelli dove il filare gira, toccali dopo e scegli "In curva".</span>'
        : '<div class="row"><button class="btn sm" data-fi="placeNew">Nuova linea a punti</button><button class="btn sm" data-fi="straight">Raddrizza</button></div>';
      else h += e.tracing
        ? '<div class="row"><button class="btn sm" data-fi="traceStop">Annulla tracciatura</button></div>'
        : '<div class="row"><button class="btn sm" data-fi="trace">Traccia di nuovo</button><button class="btn sm" data-fi="straight">Raddrizza</button></div>';
    } else if (e.tool === "gps") {
      if (!S().geo) h += '<span class="small">Per camminare il filare, la parcella deve avere la posizione GPS: importala da un file o disegnala sulla mappa satellitare.</span>';
      else if (e.rec) h += '<div class="row"><button class="btn primary" data-fi="recStop">Fine filare</button><button class="btn sm" data-fi="recCancel">Annulla</button></div><span class="small mono" id="grec">' + recText(e) + '</span>';
      else h += '<span class="small muted">Mettiti all\'inizio di un filare, tocca il pulsante e percorrilo fino in fondo tenendo lo schermo acceso.</span><div class="row"><button class="btn sm" data-fi="recStart">Inizia a camminare</button></div>';
    }
    if (e.tool !== "gira" && !e.tracing && !e.placing && !e.rec && e.sel >= 0 && e.guide[e.sel]) {
      var sp = e.guide[e.sel];
      h += '<div class="row" style="gap:6px"><span class="small" style="font-weight:600">Punto ' + (e.sel + 1) + ':</span><button class="btn sm" data-fi="ptType" data-v="a" aria-pressed="' + !!sp[2] + '">Ad angolo</button><button class="btn sm" data-fi="ptType" data-v="c" aria-pressed="' + !sp[2] + '">In curva</button><button class="btn sm" data-fi="ptDel">Togli</button></div>';
    }
    if (e.tool === "gira") {
      var a = Q.guideAngle(e.guide);
      h += '<div class="row" style="flex-wrap:nowrap;gap:8px"><button class="btn sm" data-fi="angStep" data-v="-1" aria-label="Un grado in meno">−1°</button><input id="gAng" type="range" min="0" max="179" step="1" value="' + a + '" aria-label="Direzione dei filari in gradi da Nord" style="flex:1;min-height:36px"><button class="btn sm" data-fi="angStep" data-v="1" aria-label="Un grado in più">+1°</button></div>';
      h += '<div class="row" style="justify-content:space-between"><span class="mono" id="gAngV">' + a + '° da Nord</span><button class="btn sm" data-fi="longest">Lato più lungo</button></div>';
    }
    return h + '</div>';
  }
  function recText(e) { var r = e.rec; return r.pts.length + " punti" + (r.acc != null ? " · precisione ±" + Math.round(r.acc) + " m" : " · in attesa del GPS") + (r.acc > 25 ? " (troppo bassa, aspetta)" : ""); }

  /* ---------------- disegno ---------------- */
  function svgEl() { return $("#gsvg"); }
  function fit() {
    var p = Q.plotById(E().id), b = Q.bbox(p.pts), m = Math.max(3, (b.x1 - b.x0 + b.y1 - b.y0) * 0.06), w = b.x1 - b.x0 + 2 * m, h = b.y1 - b.y0 + 2 * m, asp = Math.max(0.6, Math.min(1.1, h / w));
    if (h / w > asp) w = h / asp; else h = w * asp;
    view = { x: (b.x0 + b.x1) / 2 - w / 2, y: (b.y0 + b.y1) / 2 - h / 2, w: w, h: h };
  }
  function k() { var s = svgEl(), r = s && s.getBoundingClientRect(); return view.w / ((r && r.width) || 360); }
  function pl(pts) { return pts.map(function (q) { return q[0].toFixed(2) + "," + q[1].toFixed(2); }).join(" "); }
  function draw() {
    raf = 0; var e = E(), s = svgEl(); if (!e || !s) return;
    if (!view) fit();
    s.setAttribute("viewBox", view.x + " " + view.y + " " + view.w + " " + view.h);
    var p = Q.plotById(e.id), g = geo(e), kk = k(), out = '';
    var SF = window.QOSfondo, bgOn = !!(SF && SF.on()), bop = SF ? SF.opacity() : 1;
    /* con la foto sotto: niente riempimento e colori chiari, con la trasparenza scelta */
    out += '<g opacity="' + bop + '"><polygon points="' + pl(p.pts) + '" fill="' + (bgOn ? 'none' : 'var(--vigna-fill)') + '" stroke="' + (bgOn ? '#fff' : 'var(--vigna)') + '" stroke-width="2.5" vector-effect="non-scaling-stroke"/>';
    var used = [], rc = bgOn ? '#FFD6E7' : 'var(--vigna)';
    g.rows.forEach(function (r, ri) { if (r.segs.length) used.push(ri); r.segs.forEach(function (sg) { out += '<polyline points="' + pl(sg.poly) + '" fill="none" stroke="' + rc + '" stroke-width="' + (ri === used[0] ? 3 : 1.5) + '" vector-effect="non-scaling-stroke"/>'; }); });
    out += '</g>';
    /* numero del primo e dell'ultimo filare, per capire da che parte si conta */
    var r0 = +source(e).r0 || 1, fs = 14 * kk;
    [used[0]].forEach(function (ri) {
      if (ri == null) return; var sg = g.rows[ri].segs[0], q0 = sg.poly[0], q1 = sg.poly[Math.min(sg.poly.length - 1, 3)], dl = Math.hypot(q1[0] - q0[0], q1[1] - q0[1]) || 1, q = [q0[0] - (q1[0] - q0[0]) / dl * 14 * kk, q0[1] - (q1[1] - q0[1]) / dl * 14 * kk];
      out += '<g pointer-events="none"><circle cx="' + q[0] + '" cy="' + q[1] + '" r="' + 11 * kk + '" fill="var(--surface)" stroke="var(--vigna)" stroke-width="2" vector-effect="non-scaling-stroke"/><text x="' + q[0] + '" y="' + (q[1] + fs * 0.35) + '" font-size="' + fs * 0.85 + '" text-anchor="middle" font-weight="700" fill="var(--ink)">' + (r0 + ri) + '</text></g>';
    });
    if (e.tool === "gps" && e.rec) {
      var rp = e.rec.pts;
      if (rp.length > 1) out += '<polyline points="' + pl(rp) + '" fill="none" stroke="' + ORANGE + '" stroke-width="4" stroke-linejoin="round" stroke-linecap="round" vector-effect="non-scaling-stroke"/>';
      if (e.rec.here) { var hq = e.rec.here; out += '<circle cx="' + hq[0] + '" cy="' + hq[1] + '" r="' + Math.max(e.rec.acc || 0, 4 * kk) + '" fill="#378ADD" fill-opacity=".2"/><circle cx="' + hq[0] + '" cy="' + hq[1] + '" r="' + 7 * kk + '" fill="#378ADD" stroke="#fff" stroke-width="2" vector-effect="non-scaling-stroke"/>'; }
    } else {
      out += '<polyline points="' + pl(Q.guideSmooth(e.guide)) + '" fill="none" stroke="' + ORANGE + '" stroke-width="4" stroke-linejoin="round" stroke-linecap="round" vector-effect="non-scaling-stroke"/>';
      if (e.stroke && e.stroke.length > 1) out += '<polyline points="' + pl(e.stroke) + '" fill="none" stroke="' + ORANGE + '" stroke-width="4" stroke-linecap="round" vector-effect="non-scaling-stroke"/>';
      if (e.tool !== "gira" && !e.tracing) e.guide.forEach(function (q, i) {
        var r = (i === e.sel ? 11 : e.guide.length > 8 ? 7 : 9) * kk, fl = i === e.sel ? ORANGE : 'var(--surface)';
        out += q[2] ? '<rect x="' + (q[0] - r) + '" y="' + (q[1] - r) + '" width="' + 2 * r + '" height="' + 2 * r + '" fill="' + fl + '" stroke="' + ORANGE + '" stroke-width="3" vector-effect="non-scaling-stroke"/>' : '<circle cx="' + q[0] + '" cy="' + q[1] + '" r="' + r + '" fill="' + fl + '" stroke="' + ORANGE + '" stroke-width="3" vector-effect="non-scaling-stroke"/>';
      });
    }
    out += '<text x="' + (view.x + 12 * kk) + '" y="' + (view.y + 22 * kk) + '" text-anchor="start" font-size="' + 14 * kk + '" font-weight="700" fill="var(--ink)" stroke="var(--surface)" stroke-width="3" paint-order="stroke" pointer-events="none">N ↑</text>';
    if (!s.querySelector("#gbg")) s.innerHTML = '<g id="gbg"></g><g id="gfg"></g>';
    if (SF) SF.paint(s.querySelector("#gbg"), view, kk); else s.querySelector("#gbg").innerHTML = "";
    s.querySelector("#gfg").innerHTML = out;
    var sum = $("#gsum"); if (sum) sum.textContent = used.length + (used.length === 1 ? " filare · " : " filari · ") + g.ceppi.toLocaleString("it-IT") + " ceppi · il filare " + r0 + " è quello spesso";
  }
  function redraw() { if (!raf) raf = requestAnimationFrame(draw); }

  /* ---------------- tocchi sulla mappa ---------------- */
  function toM(ev) { var s = svgEl(), r = s.getBoundingClientRect(); return [view.x + (ev.clientX - r.left) / r.width * view.w, view.y + (ev.clientY - r.top) / r.height * view.h]; }
  function nearHandle(pt) { var e = E(), lim = 26 * k(), best = -1, bd = lim; e.guide.forEach(function (q, i) { var d = Math.hypot(q[0] - pt[0], q[1] - pt[1]); if (d < bd) { bd = d; best = i; } }); return best; }
  /* tocco sulla linea: aggiunge un punto nel tratto giusto */
  function addPointAt(pt) {
    var e = E(), c = e.guide, lim = 18 * k(), best = null;
    for (var i = 0; i < c.length - 1; i++) { var a = c[i], b = c[i + 1], dx = b[0] - a[0], dy = b[1] - a[1], L2 = dx * dx + dy * dy || 1e-9, u = Math.max(0, Math.min(1, ((pt[0] - a[0]) * dx + (pt[1] - a[1]) * dy) / L2)), d = Math.hypot(pt[0] - a[0] - u * dx, pt[1] - a[1] - u * dy); if (d < lim && (!best || d < best.d)) best = { i: i, d: d }; }
    if (!best) return false;
    c.splice(best.i + 1, 0, [Math.round(pt[0] * 100) / 100, Math.round(pt[1] * 100) / 100]); e.curve = null; redraw(); return true;
  }
  function bind() {
    var s = svgEl(); if (!s) return;
    var P = {}, st = null, pz = null;
    function list() { return Object.keys(P).map(function (x) { return P[x]; }); }
    s.addEventListener("pointerdown", function (ev) {
      var e = E(); P[ev.pointerId] = { x: ev.clientX, y: ev.clientY }; try { s.setPointerCapture(ev.pointerId); } catch (_) {}
      var a = list();
      if (a.length === 2) { if (e.stroke) e.stroke = null; st = null; pz = { d: Math.hypot(a[0].x - a[1].x, a[0].y - a[1].y) || 1, mx: (a[0].x + a[1].x) / 2, my: (a[0].y + a[1].y) / 2, v: Object.assign({}, view), r: s.getBoundingClientRect() }; redraw(); return; }
      if (a.length !== 1) return;
      var pt = toM(ev);
      if (e.tracing) { e.stroke = [pt]; st = { kind: "stroke", x: ev.clientX, y: ev.clientY }; return; }
      var hi = e.tool !== "gira" && !e.rec && !e.placing ? nearHandle(pt) : -1;
      st = hi >= 0 ? { kind: "drag", i: hi, x: ev.clientX, y: ev.clientY, moved: false } : { kind: "pan", x: ev.clientX, y: ev.clientY, v: Object.assign({}, view), moved: false };
    });
    s.addEventListener("pointermove", function (ev) {
      if (!P[ev.pointerId]) return; P[ev.pointerId] = { x: ev.clientX, y: ev.clientY };
      var e = E(), a = list();
      if (pz && a.length >= 2) {
        var d = Math.hypot(a[0].x - a[1].x, a[0].y - a[1].y) || 1, f = pz.d / d, w = Math.max(3, Math.min(5000, pz.v.w * f)); f = w / pz.v.w;
        var px = pz.v.x + (pz.mx - pz.r.left) / pz.r.width * pz.v.w, py = pz.v.y + (pz.my - pz.r.top) / pz.r.height * pz.v.h, kk = w / pz.r.width, mx = (a[0].x + a[1].x) / 2, my = (a[0].y + a[1].y) / 2;
        view = { x: px - (px - pz.v.x) * f - (mx - pz.mx) * kk, y: py - (py - pz.v.y) * f - (my - pz.my) * kk, w: w, h: pz.v.h * f }; redraw(); return;
      }
      if (!st) return;
      if (st.kind === "stroke") { var pt = toM(ev), l = e.stroke[e.stroke.length - 1]; if (Math.hypot(pt[0] - l[0], pt[1] - l[1]) > 3 * k()) { e.stroke.push(pt); redraw(); } return; }
      var dx = ev.clientX - st.x, dy = ev.clientY - st.y; if (!st.moved && Math.hypot(dx, dy) < 7) return; st.moved = true;
      if (st.kind === "drag") { var q = toM(ev); var nq = [Math.round(q[0] * 100) / 100, Math.round(q[1] * 100) / 100]; if (e.guide[st.i][2]) nq.push(1); e.guide[st.i] = nq; e.curve = null; redraw(); }
      else { var kk2 = st.v.w / s.getBoundingClientRect().width; view = { x: st.v.x - dx * kk2, y: st.v.y - dy * kk2, w: st.v.w, h: st.v.h }; redraw(); }
    });
    function up(ev, cancel) {
      var was = list().length; delete P[ev.pointerId]; var e = E(); if (!e) return;
      if (was >= 2) { pz = null; st = null; return; }
      if (!st) return; var cur = st; st = null;
      if (cur.kind === "stroke") { if (!cancel) finishStroke(); return; }
      if (cancel || cur.moved || e.tool === "gira" || e.rec) return;
      if (e.placing) { var np = toM(ev); e.guide.push([Math.round(np[0] * 100) / 100, Math.round(np[1] * 100) / 100, 1]); Q.render(); return; }
      if (cur.kind === "drag") { e.sel = e.sel === cur.i ? -1 : cur.i; Q.render(); return; }
      if (cur.kind === "pan") { if (!addPointAt(toM(ev)) && e.sel >= 0) { e.sel = -1; Q.render(); } }
    }
    s.addEventListener("pointerup", function (ev) { up(ev, false); });
    s.addEventListener("pointercancel", function (ev) { up(ev, true); });
    s.addEventListener("wheel", function (ev) { ev.preventDefault(); var f = ev.deltaY > 0 ? 1.15 : 1 / 1.15, pt = toM(ev); view = { x: pt[0] - (pt[0] - view.x) * f, y: pt[1] - (pt[1] - view.y) * f, w: view.w * f, h: view.h * f }; redraw(); }, { passive: false });
  }
  function lineLen(a) { var L = 0; for (var i = 1; i < a.length; i++) L += Math.hypot(a[i][0] - a[i - 1][0], a[i][1] - a[i - 1][1]); return L; }
  /* media mobile: toglie il tremolio del dito o del GPS */
  function smoothPts(a, w) { if (a.length < 3) return a.slice(); return a.map(function (q, i) { if (!i || i === a.length - 1) return q; var x = 0, y = 0, n = 0; for (var j = Math.max(0, i - w); j <= Math.min(a.length - 1, i + w); j++) { x += a[j][0]; y += a[j][1]; n++; } return [x / n, y / n]; }); }
  function finishStroke() {
    var e = E(), st = e.stroke || []; e.stroke = null;
    if (st.length < 2 || lineLen(st) < 25 * k()) { Q.toast("Linea troppo corta: traccia il filare da un capo all'altro"); redraw(); return; }
    e.guide = Q.simplifyLine(smoothPts(st, 2), Math.max(0.2, 1.5 * k())); e.tracing = false; e.curve = null; Q.render();
  }

  /* ---------------- GPS ---------------- */
  function edgeDist(pt, P) { var best = 1e18; for (var i = 0; i < P.length; i++) { var a = P[i], c = P[(i + 1) % P.length], dx = c[0] - a[0], dy = c[1] - a[1], L2 = dx * dx + dy * dy || 1e-9, u = Math.max(0, Math.min(1, ((pt[0] - a[0]) * dx + (pt[1] - a[1]) * dy) / L2)); best = Math.min(best, Math.hypot(pt[0] - a[0] - u * dx, pt[1] - a[1] - u * dy)); } return best; }
  function stopWatch() {
    if (watchId != null && navigator.geolocation) navigator.geolocation.clearWatch(watchId); watchId = null;
    if (wakeLock) { try { wakeLock.release(); } catch (_) {} wakeLock = null; }
  }
  function recStart() {
    var e = E(); if (!navigator.geolocation) { Q.toast("Questo telefono non dà la posizione al browser"); return; }
    e.rec = { pts: [], acc: null, here: null };
    try { if (navigator.wakeLock) navigator.wakeLock.request("screen").then(function (w) { wakeLock = w; }, function () {}); } catch (_) {}
    watchId = navigator.geolocation.watchPosition(function (pos) {
      var e2 = E(); if (!e2 || !e2.rec) return; var c = pos.coords, pt = Q.llToPts([[c.latitude, c.longitude]])[0]; if (!pt) return;
      e2.rec.acc = c.accuracy; e2.rec.here = pt;
      if (c.accuracy <= 25) { var l = e2.rec.pts[e2.rec.pts.length - 1]; if (!l || Math.hypot(l[0] - pt[0], l[1] - pt[1]) >= 1) e2.rec.pts.push(pt); }
      var t = $("#grec"); if (t) t.textContent = recText(e2); redraw();
    }, function (err) { var e3 = E(); if (err.code !== 1 && e3 && e3.rec && e3.rec.acc != null) return; /* un'attesa lunga a metà filare non è un errore: si continua */ Q.toast(err.code === 1 ? "Permesso di posizione negato: attivalo nelle impostazioni del browser" : "Posizione non trovata, riprova all'aperto"); }, { enableHighAccuracy: true, maximumAge: 0, timeout: 30000 });
  }
  function recStop() {
    var e = E(), pts = e.rec ? e.rec.pts : [], P = Q.plotById(e.id).pts; stopWatch();
    /* i punti presi prima di arrivare al filare (o dopo esserne usciti) non contano: si tengono quelli dentro la parcella o a meno di 5 m */
    var near = pts.filter(function (q) { return Q.pip(q, P) || edgeDist(q, P) < 5; }); if (near.length >= 3) pts = near;
    if (pts.length < 3 || lineLen(pts) < 5) { Q.toast("Troppo pochi punti: cammina almeno qualche metro lungo il filare"); e.rec = null; return; }
    e.guide = Q.simplifyLine(smoothPts(pts, 3), 1); e.rec = null; e.curve = null;
    Q.toast("Filare registrato: trascina i punti se il GPS ha sbagliato in qualche tratto");
  }

  /* ---------------- pulsanti ---------------- */
  function setAngle(a) { var e = E(), p = Q.plotById(e.id); a = ((Math.round(a) % 180) + 180) % 180; e.guide = Q.straightGuide(p.pts, a); var v = $("#gAngV"), r = $("#gAng"); if (v) v.textContent = a + "° da Nord"; if (r) r.value = a; redraw(); }
  function act(a, b) {
    var e = E(); if (!e) return; if (a !== "save") e.confirm = false;
    if (a === "tool") {
      var t = b.getAttribute("data-v"); if (e.rec && t !== "gps") { stopWatch(); e.rec = null; }
      if (t === "gira" && e.guide.length > 2) { e.curve = e.guide; e.guide = Q.straightGuide(Q.plotById(e.id).pts, Q.guideAngle(e.guide)); }
      else if (t !== "gira" && e.curve && e.guide.length === 2) { e.guide = e.curve; e.curve = null; }
      if (e.placing && e.guide.length < 2 && e.prev) e.guide = e.prev;
      e.tool = t; e.tracing = false; e.placing = false; e.sel = -1;
    }
    else if (a === "trace") { e.tracing = true; e.sel = -1; }
    else if (a === "pmode") { e.pmode = b.getAttribute("data-v"); e.tracing = false; e.placing = false; e.sel = -1; }
    else if (a === "placeNew") { e.prev = e.guide; e.guide = []; e.placing = true; e.sel = -1; e.curve = null; }
    else if (a === "placeUndo") { e.guide.pop(); }
    else if (a === "placeEnd") { if (e.guide.length < 2) { Q.toast("Servono almeno due punti"); return; } e.placing = false; e.prev = null; }
    else if (a === "ptType") { var pq = e.guide[e.sel]; if (pq) { var nq2 = [pq[0], pq[1]]; if (b.getAttribute("data-v") === "a") nq2.push(1); e.guide[e.sel] = nq2; } }
    else if (a === "ptDel") { if (e.guide.length <= 2) { Q.toast("Il filare guida ha bisogno di almeno due punti"); return; } e.guide.splice(e.sel, 1); e.sel = -1; }
    else if (a === "traceStop") { e.tracing = false; e.stroke = null; }
    else if (a === "straight") { e.guide = Q.straightGuide(Q.plotById(e.id).pts, Q.guideAngle(e.guide)); e.tool = "gira"; e.curve = null; }
    else if (a === "angStep") { setAngle(Q.guideAngle(e.guide) + +b.getAttribute("data-v")); return; }
    else if (a === "longest") { setAngle(Q.longestEdgeAngle(Q.plotById(e.id).pts)); return; }
    else if (a === "rev") { e.rev = !e.rev; redraw(); return; }
    else if (a === "recStart") recStart();
    else if (a === "recStop") recStop();
    else if (a === "recCancel") { stopWatch(); e.rec = null; }
    else if (a === "zin" || a === "zout") { var f = a === "zin" ? 0.6 : 1.6, cx = view.x + view.w / 2, cy = view.y + view.h / 2; view = { x: cx - view.w * f / 2, y: cy - view.h * f / 2, w: view.w * f, h: view.h * f }; redraw(); return; }
    else if (a === "zfit") { fit(); redraw(); return; }
    else if (a === "cancel") { close(); }
    else if (a === "save") { if (save() === false) { Q.render(); return; } }
    Q.render();
  }
  function save() {
    var e = E(), p = Q.plotById(e.id), src = source(e), g = geo(e), n = g.rows.filter(function (r) { return r.segs.length; }).length;
    if (e.rec) { Q.toast("Prima tocca Fine filare"); return false; }
    var changed = JSON.stringify([e.guide, e.rev, "guida"]) !== e.orig, nm = Object.keys(p.vine.marks || {}).length;
    if (changed && nm && !e.confirm) { e.confirm = true; return false; }
    if (e.placing) { if (e.guide.length < 2) { Q.toast("Metti almeno due punti, poi tocca Fine"); return false; } e.placing = false; }
    var gd = e.guide.map(function (q) { var o = { x: q[0], y: q[1] }; if (q[2]) o.a = 1; return o; });
    src.guida = gd; src.grev = e.rev; src.rmode = "guida";
    if (!e.form) { delete Q.views()["vine-" + p.id]; Q.save(); Q.toast("Direzione salvata: " + n + (n === 1 ? " filare" : " filari") + ", " + g.ceppi.toLocaleString("it-IT") + " ceppi"); }
    else Q.toast("Direzione pronta: tocca Salva per confermare la parcella");
    close();
  }

  document.addEventListener("click", function (ev) { var b = ev.target.closest("[data-fi]"); if (!b) return; ev.preventDefault(); act(b.getAttribute("data-fi"), b); });
  document.addEventListener("input", function (ev) { if (ev.target && ev.target.id === "gAng" && E()) setAngle(+ev.target.value); });

  window.QOFil = {
    open: open, close: close, html: html,
    after: function () { if (!E()) return; if (window.QOSfondo) window.QOSfondo.bind(redraw); bind(); draw(); }
  };
})();

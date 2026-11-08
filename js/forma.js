/* Modifica della forma di una parcella già creata, con le dita:
   si trascinano i vertici, si aggiungono punti dai "+" a metà dei lati, si tolgono punti, si sposta tutta la forma.
   Lo stato è in QO.ui.fedit; la parcella cambia solo con "Salva". */
(function () {
  "use strict";
  var Q = window.QO;
  if (!Q) return;
  function S() { return Q.getState(); }
  function UI() { return Q.ui; }
  function E() { return UI().fedit; }
  function esc(s) { return Q.esc(s == null ? "" : s); }
  function $(s) { return document.querySelector(s); }

  var ORANGE = "#E8590C";
  var view = null, raf = 0;

  function open(id) {
    var p = Q.plotById(id); if (!p) return;
    UI().fedit = { id: id, pts: p.pts.map(function (q) { return q.slice(); }), undo: [], sel: -1, move: false, confirm: false };
    view = null;
  }
  function close() { UI().fedit = null; view = null; }

  /* ---------------- schermata ---------------- */
  function html() {
    var e = E(), p = Q.plotById(e.id); if (!p) { close(); return ""; }
    var nm = p.vine ? Object.keys(p.vine.marks || {}).length : 0, h = '';
    h += '<div class="top"><div><div class="eyebrow">' + esc(p.name) + '</div><h1>Modifica forma</h1></div></div>';
    h += '<div class="panel stack">';
    h += '<div class="mapwrap"><svg id="fsvg" role="img" aria-label="Forma della parcella con i punti da trascinare"></svg><div class="zoom"><button data-fo="zin" aria-label="Ingrandisci">+</button><button data-fo="zout" aria-label="Rimpicciolisci">−</button><button data-fo="zfit" aria-label="Adatta" style="font-size:13px">⤢</button></div></div>';
    h += '<span class="small muted" id="fhint">' + (e.move ? 'Trascina la forma per spostarla tutta insieme.' : 'Trascina i punti per spostarli. Trascina o tocca un “+” per aggiungere un punto. Tocca un punto per sceglierlo.') + '</span>';
    if (window.QOSfondo) h += window.QOSfondo.html();
    h += '<div class="row" style="gap:6px"><button class="btn sm" data-fo="del"' + (e.sel < 0 || e.pts.length <= 3 ? ' aria-disabled="true" style="opacity:.55"' : '') + '>Togli punto</button><button class="btn sm" data-fo="undo"' + (e.undo.length ? '' : ' aria-disabled="true" style="opacity:.55"') + '>Annulla ultima</button><button class="btn sm" data-fo="move" aria-pressed="' + e.move + '">Sposta tutta</button></div>';
    h += '<span class="small" id="fsum"></span>';
    if (nm) h += '<span class="small" style="color:var(--warn)">Questa parcella ha ' + nm + (nm === 1 ? ' segno' : ' segni') + ' sui ceppi. Se cambi la forma, i filari si ricalcolano e i segni possono finire su ceppi diversi.</span>';
    h += '<div class="row"><button class="btn primary" data-fo="save">' + (e.confirm ? 'Tocca ancora per salvare' : 'Salva') + '</button><button class="btn" data-fo="cancel">Annulla</button></div>';
    return h + '</div>';
  }

  /* ---------------- disegno ---------------- */
  function svgEl() { return $("#fsvg"); }
  function fit() {
    var b = Q.bbox(E().pts), m = Math.max(3, (b.x1 - b.x0 + b.y1 - b.y0) * 0.08), w = b.x1 - b.x0 + 2 * m, h = b.y1 - b.y0 + 2 * m, asp = Math.max(0.7, Math.min(1.15, h / w));
    if (h / w > asp) w = h / asp; else h = w * asp;
    /* spazio a destra per i pulsanti dello zoom */
    var ex = w * 0.18; view = { x: (b.x0 + b.x1) / 2 - w / 2, y: (b.y0 + b.y1) / 2 - h / 2, w: w + ex, h: h * (w + ex) / w };
    view.y -= (view.h - h) / 2;
  }
  function k() { var s = svgEl(), r = s && s.getBoundingClientRect(); return view.w / ((r && r.width) || 360); }
  function pl(pts) { return pts.map(function (q) { return q[0].toFixed(2) + "," + q[1].toFixed(2); }).join(" "); }
  function mids(pts) { return pts.map(function (q, i) { var n = pts[(i + 1) % pts.length]; return [(q[0] + n[0]) / 2, (q[1] + n[1]) / 2]; }); }
  /* i "+" si mostrano (e si toccano) solo sui lati abbastanza lunghi sullo schermo; gli altri valgono null */
  function midsShown(pts) { var kk = k(); return mids(pts).map(function (m, i) { var a = pts[i], b = pts[(i + 1) % pts.length]; return Math.hypot(b[0] - a[0], b[1] - a[1]) / kk > 46 ? m : null; }); }
  /* punti fitti sullo schermo (forme importate da GPS): punti piccoli finché non si ingrandisce */
  function dense(pts) { var L = pts.map(function (a, i) { var b = pts[(i + 1) % pts.length]; return Math.hypot(b[0] - a[0], b[1] - a[1]); }).sort(function (x, y) { return x - y; }); return L[Math.floor(L.length / 2)] / k() < 26; }
  function tmpPlot(e) { var p = Q.plotById(e.id); return { id: "_f", type: p.type, pts: e.pts, vine: p.vine }; }
  function draw() {
    raf = 0; var e = E(), s = svgEl(); if (!e || !s) return;
    if (!view) fit();
    s.setAttribute("viewBox", view.x + " " + view.y + " " + view.w + " " + view.h);
    var p = Q.plotById(e.id), kk = k(), out = '', col = p.vine ? "var(--vigna)" : Q.stroke[p.type], fill = p.vine ? "var(--vigna-fill)" : Q.fill[p.type];
    var SF = window.QOSfondo, bgOn = !!(SF && SF.on()), bop = SF ? SF.opacity() : 1;
    if (bgOn) { col = "#fff"; fill = "rgba(255,255,255,0.12)"; }
    out += '<g opacity="' + bop + '">';
    /* le parcelle vicine, in grigio, per allineare i bordi */
    S().plots.forEach(function (o) { if (o.id === p.id) return; var b = Q.bbox(o.pts); if (b.x1 < view.x || b.x0 > view.x + view.w || b.y1 < view.y || b.y0 > view.y + view.h) return; out += '<polygon points="' + pl(o.pts) + '" fill="' + (bgOn ? 'none' : 'var(--surface-2)') + '" stroke="' + (bgOn ? '#fff' : 'var(--ink-2)') + '" stroke-opacity=".5" stroke-width="1" vector-effect="non-scaling-stroke"/>'; });
    out += '<polygon points="' + pl(e.pts) + '" fill="' + fill + '" stroke="' + col + '" stroke-width="2.5" vector-effect="non-scaling-stroke"/>';
    /* forma di prima, tratteggiata sopra, per confronto */
    if (JSON.stringify(p.pts) !== JSON.stringify(e.pts)) out += '<polygon points="' + pl(p.pts) + '" fill="none" stroke="' + (bgOn ? '#FFE066' : 'var(--ink)') + '" stroke-dasharray="5 4" stroke-width="1.5" vector-effect="non-scaling-stroke" pointer-events="none"/>';
    var g = null;
    if (p.vine) { try { g = Q.vineGeo(tmpPlot(e)); } catch (_) { g = null; }
      if (g) g.rows.forEach(function (r, ri) { r.segs.forEach(function (sg, k2) { out += '<polyline points="' + pl(Q.rowLine(g, ri, k2)) + '" fill="none" stroke="' + (bgOn ? '#FFD6E7' : 'var(--vigna)') + '" stroke-opacity=".7" stroke-width="1.2" vector-effect="non-scaling-stroke"/>'; }); }); }
    out += '</g>';
    if (!e.move) {
      var dn = dense(e.pts);
      midsShown(e.pts).forEach(function (q) { if (!q) return; out += '<g><circle cx="' + q[0] + '" cy="' + q[1] + '" r="' + 8 * kk + '" fill="var(--surface)" stroke="' + ORANGE + '" stroke-width="1.5" stroke-dasharray="3 2" vector-effect="non-scaling-stroke"/><text x="' + q[0] + '" y="' + (q[1] + 4.5 * kk) + '" font-size="' + 14 * kk + '" text-anchor="middle" font-weight="700" fill="' + ORANGE + '">+</text></g>'; });
      e.pts.forEach(function (q, i) { out += '<circle cx="' + q[0] + '" cy="' + q[1] + '" r="' + (i === e.sel ? 11 : dn ? 4 : 8) * kk + '" fill="' + (i === e.sel ? ORANGE : 'var(--surface)') + '" stroke="' + ORANGE + '" stroke-width="' + (dn && i !== e.sel ? 2 : 3) + '" vector-effect="non-scaling-stroke"/>'; });
      var fh = document.getElementById("fhint"); if (fh) fh.textContent = dn ? "I punti sono fitti: ingrandisci con due dita per spostarli comodamente." : "Trascina i punti per spostarli. Trascina o tocca un “+” per aggiungere un punto. Tocca un punto per sceglierlo.";
    }
    out += '<text x="' + (view.x + 12 * kk) + '" y="' + (view.y + 22 * kk) + '" font-size="' + 14 * kk + '" font-weight="700" fill="var(--ink)" stroke="var(--surface)" stroke-width="3" paint-order="stroke" pointer-events="none">N ↑</text>';
    if (!s.querySelector("#fbg")) s.innerHTML = '<g id="fbg"></g><g id="ffg"></g>';
    if (SF) SF.paint(s.querySelector("#fbg"), view, kk); else s.querySelector("#fbg").innerHTML = "";
    s.querySelector("#ffg").innerHTML = out;
    var a0 = Q.area(p.pts), a1 = Q.area(e.pts), sum = $("#fsum");
    if (sum) sum.textContent = Q.num(a1 / 1e4, 2) + " ha (prima " + Q.num(a0 / 1e4, 2) + ") · " + e.pts.length + " punti" + (g ? " · " + g.rows.filter(function (r) { return r.segs.length; }).length + " filari, " + g.ceppi.toLocaleString("it-IT") + " ceppi" : "");
  }
  function redraw() { if (!raf) raf = requestAnimationFrame(draw); }

  /* ---------------- tocchi ---------------- */
  function toM(ev) { var s = svgEl(), r = s.getBoundingClientRect(); return [view.x + (ev.clientX - r.left) / r.width * view.w, view.y + (ev.clientY - r.top) / r.height * view.h]; }
  function nearest(list, pt, px) { var lim = px * k(), best = -1, bd = lim; list.forEach(function (q, i) { var d = Math.hypot(q[0] - pt[0], q[1] - pt[1]); if (d < bd) { bd = d; best = i; } }); return best; }
  function snap() { var e = E(); e.undo.push(e.pts.map(function (q) { return q.slice(); })); if (e.undo.length > 50) e.undo.shift(); }
  function r2(v) { return Math.round(v * 10) / 10; }
  function bind() {
    var s = svgEl(); if (!s) return;
    var P = {}, st = null, pz = null;
    function list() { return Object.keys(P).map(function (x) { return P[x]; }); }
    s.addEventListener("pointerdown", function (ev) {
      var e = E(); P[ev.pointerId] = { x: ev.clientX, y: ev.clientY }; try { s.setPointerCapture(ev.pointerId); } catch (_) {}
      var a = list();
      if (a.length === 2) { if (st && st.snapped) { e.undo.pop(); if (st.orig) e.pts = st.orig; } st = null; pz = { d: Math.hypot(a[0].x - a[1].x, a[0].y - a[1].y) || 1, mx: (a[0].x + a[1].x) / 2, my: (a[0].y + a[1].y) / 2, v: Object.assign({}, view), r: s.getBoundingClientRect() }; redraw(); return; }
      if (a.length !== 1) return;
      var pt = toM(ev);
      if (e.move) { st = { kind: "move", x: ev.clientX, y: ev.clientY, p0: pt, orig: e.pts.map(function (q) { return q.slice(); }), moved: false }; return; }
      var vi = nearest(e.pts, pt, 24), mi = vi < 0 ? nearest(midsShown(e.pts).map(function (m) { return m || [1e12, 1e12]; }), pt, 22) : -1;
      if (vi >= 0) st = { kind: "vert", i: vi, x: ev.clientX, y: ev.clientY, moved: false };
      else if (mi >= 0) st = { kind: "mid", i: mi, x: ev.clientX, y: ev.clientY, moved: false };
      else st = { kind: "pan", x: ev.clientX, y: ev.clientY, v: Object.assign({}, view), moved: false };
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
      var dx = ev.clientX - st.x, dy = ev.clientY - st.y; if (!st.moved && Math.hypot(dx, dy) < 6) return;
      if (!st.moved) {
        st.moved = true;
        if (st.kind === "vert" || st.kind === "mid" || st.kind === "move") { st.orig = st.orig || e.pts.map(function (q) { return q.slice(); }); snap(); st.snapped = true; }
        if (st.kind === "mid") { var m = mids(e.pts)[st.i]; e.pts.splice(st.i + 1, 0, [r2(m[0]), r2(m[1])]); st.kind = "vert"; st.i = st.i + 1; e.sel = st.i; }
        if (st.kind === "vert") e.sel = st.i;
      }
      var q = toM(ev);
      if (st.kind === "vert") { e.pts[st.i] = [r2(q[0]), r2(q[1])]; redraw(); }
      else if (st.kind === "move") { var ox = q[0] - st.p0[0], oy = q[1] - st.p0[1]; e.pts = st.orig.map(function (c) { return [r2(c[0] + ox), r2(c[1] + oy)]; }); redraw(); }
      else { var kk2 = st.v.w / s.getBoundingClientRect().width; view = { x: st.v.x - dx * kk2, y: st.v.y - dy * kk2, w: st.v.w, h: st.v.h }; redraw(); }
    });
    function up(ev, cancel) {
      var was = list().length; delete P[ev.pointerId]; var e = E(); if (!e) return;
      if (was >= 2) { pz = null; st = null; return; }
      if (!st) return; var cur = st; st = null;
      if (cancel) return;
      if (!cur.moved) {
        /* tocco senza trascinare: sceglie un punto, aggiunge un punto dal "+", oppure toglie la scelta */
        if (cur.kind === "vert") e.sel = e.sel === cur.i ? -1 : cur.i;
        else if (cur.kind === "mid") { snap(); var m = mids(e.pts)[cur.i]; e.pts.splice(cur.i + 1, 0, [r2(m[0]), r2(m[1])]); e.sel = cur.i + 1; }
        else e.sel = -1;
      }
      Q.render();
    }
    s.addEventListener("pointerup", function (ev) { up(ev, false); });
    s.addEventListener("pointercancel", function (ev) { up(ev, true); });
    s.addEventListener("wheel", function (ev) { ev.preventDefault(); var f = ev.deltaY > 0 ? 1.15 : 1 / 1.15, pt = toM(ev); view = { x: pt[0] - (pt[0] - view.x) * f, y: pt[1] - (pt[1] - view.y) * f, w: view.w * f, h: view.h * f }; redraw(); }, { passive: false });
  }

  /* lati che si incrociano: la forma non sarebbe valida */
  function selfCross(P) {
    function x(a, b, c, d) { var r = [b[0] - a[0], b[1] - a[1]], s = [d[0] - c[0], d[1] - c[1]], den = r[0] * s[1] - r[1] * s[0]; if (Math.abs(den) < 1e-12) return false; var t = ((c[0] - a[0]) * s[1] - (c[1] - a[1]) * s[0]) / den, u = ((c[0] - a[0]) * r[1] - (c[1] - a[1]) * r[0]) / den; return t > 1e-9 && t < 1 - 1e-9 && u > 1e-9 && u < 1 - 1e-9; }
    var n = P.length; for (var i = 0; i < n; i++) for (var j = i + 2; j < n; j++) { if (i === 0 && j === n - 1) continue; if (x(P[i], P[(i + 1) % n], P[j], P[(j + 1) % n])) return true; } return false;
  }

  /* ---------------- pulsanti ---------------- */
  function act(a) {
    var e = E(); if (!e) return; if (a !== "save") e.confirm = false;
    if (a === "del") { if (e.sel < 0) { Q.toast("Tocca prima il punto da togliere"); return; } if (e.pts.length <= 3) { Q.toast("Servono almeno tre punti"); return; } snap(); e.pts.splice(e.sel, 1); e.sel = -1; }
    else if (a === "undo") { if (!e.undo.length) { Q.toast("Niente da annullare"); return; } e.pts = e.undo.pop(); e.sel = -1; }
    else if (a === "move") { e.move = !e.move; e.sel = -1; }
    else if (a === "zin" || a === "zout") { var f = a === "zin" ? 0.6 : 1.6, cx = view.x + view.w / 2, cy = view.y + view.h / 2; view = { x: cx - view.w * f / 2, y: cy - view.h * f / 2, w: view.w * f, h: view.h * f }; redraw(); return; }
    else if (a === "zfit") { fit(); redraw(); return; }
    else if (a === "cancel") close();
    else if (a === "save") {
      var p = Q.plotById(e.id), changed = JSON.stringify(e.pts) !== JSON.stringify(p.pts), nm = p.vine ? Object.keys(p.vine.marks || {}).length : 0;
      if (selfCross(e.pts)) { Q.toast("Due lati si incrociano: sposta i punti per sistemare la forma"); return; }
      if (Q.area(e.pts) < 1) { Q.toast("La forma è troppo piccola"); return; }
      if (changed && nm && !e.confirm) { e.confirm = true; Q.render(); return; }
      if (changed) { p.pts = e.pts; var v = Q.views(); delete v["vine-" + p.id]; delete v["imp-" + p.id]; delete v.map; Q.save(); Q.toast("Forma salvata: " + Q.num(Q.area(p.pts) / 1e4, 2) + " ha"); }
      close();
    }
    Q.render();
  }

  document.addEventListener("click", function (ev) { var b = ev.target.closest("[data-fo]"); if (!b) return; ev.preventDefault(); act(b.getAttribute("data-fo")); });

  window.QOForma = {
    open: open, close: close, html: html,
    after: function () { if (!E()) return; if (window.QOSfondo) window.QOSfondo.bind(redraw); bind(); draw(); }
  };
})();

/* Bancali dentro un appezzamento dell'orto: si creano dividendo l'appezzamento in strisce,
   ognuno ha la sua coltura e si riempie da solo. Dati in p.beds = [{id, name, crop, pts: [{x, y}]}]
   (punti come oggetti, perché Firestore non accetta array dentro array). Espone window.QOBanc. */
(function () {
  "use strict";
  var Q = window.QO;
  if (!Q) return;
  function UI() { return Q.ui; }
  function esc(s) { return Q.esc(s == null ? "" : s); }
  function $(s) { return document.querySelector(s); }
  function P(b) { return b.pts.map(function (q) { return [q.x, q.y]; }); }
  function beds(p) { return p.beds || []; }
  function bedById(p, id) { return beds(p).filter(function (b) { return b.id === id; })[0] || null; }
  function selBed(p) { var b = bedById(p, UI().bedSel); if (!b && beds(p).length) { b = beds(p)[0]; UI().bedSel = b.id; } return b; }

  /* taglia il poligono tenendo la parte con vdot(q, n) fra a e b (Sutherland–Hodgman su due lati) */
  function clipHalf(poly, n, c, keepAbove) {
    var out = [];
    for (var i = 0; i < poly.length; i++) {
      var A = poly[i], B = poly[(i + 1) % poly.length], da = A[0] * n[0] + A[1] * n[1] - c, db = B[0] * n[0] + B[1] * n[1] - c;
      if (!keepAbove) { da = -da; db = -db; }
      if (da >= 0) out.push(A);
      if ((da >= 0) !== (db >= 0)) { var t = da / (da - db); out.push([A[0] + t * (B[0] - A[0]), A[1] + t * (B[1] - A[1])]); }
    }
    return out;
  }
  /* divide in N strisce larghe uguali, separate da un passaggio, parallele al lato più lungo (o di traverso) */
  function split(p, N, pass, across) {
    var deg = Q.longestEdgeAngle(p.pts) + (across ? 90 : 0), th = deg * Math.PI / 180, n = [Math.cos(th), Math.sin(th)];
    var ss = p.pts.map(function (q) { return q[0] * n[0] + q[1] * n[1]; }), s0 = Math.min.apply(null, ss), s1 = Math.max.apply(null, ss), W = s1 - s0;
    var bw = (W - (N - 1) * pass) / N; if (!(bw > 0.2)) return null;
    var out = [];
    for (var i = 0; i < N; i++) {
      var a = s0 + i * (bw + pass), b = a + bw, poly = clipHalf(clipHalf(p.pts, n, a, true), n, b, false);
      if (poly.length >= 3 && Q.area(poly) > 0.05) out.push({ id: Q.uid(), name: "Bancale " + (out.length + 1), crop: "", pts: poly.map(function (q) { return { x: Math.round(q[0] * 100) / 100, y: Math.round(q[1] * 100) / 100 }; }) });
    }
    return { beds: out, bw: bw };
  }
  function width(p) { var f = UI().bedForm, deg = Q.longestEdgeAngle(p.pts) + (f && f.across ? 90 : 0), th = deg * Math.PI / 180, n = [Math.cos(th), Math.sin(th)], ss = p.pts.map(function (q) { return q[0] * n[0] + q[1] * n[1]; }); return Math.max.apply(null, ss) - Math.min.apply(null, ss); }
  /* riempie un bancale a file lungo il bancale: se è più stretto della distanza tra le file, una fila sola al centro */
  function fillBed(p, b, c) {
    var C = Q.cropList()[c], pts = P(b), deg = Q.longestEdgeAngle(pts), th = deg * Math.PI / 180, d = [Math.sin(th), -Math.cos(th)], n = [Math.cos(th), Math.sin(th)];
    var dot = function (q, v) { return q[0] * v[0] + q[1] * v[1]; }, ss = pts.map(function (q) { return dot(q, n); }), tt = pts.map(function (q) { return dot(q, d); });
    var s0 = Math.min.apply(null, ss), W = Math.max.apply(null, ss) - s0, t0 = Math.min.apply(null, tt), t1 = Math.max.apply(null, tt);
    var btw = C.btw / 100, row = C.row / 100, R = Math.max(1, Math.floor(W / btw + 1e-6)), off = s0 + (W - (R - 1) * btw) / 2, added = 0;
    var cl = Q.cropList(), near = function (x, y) { return p.plants.some(function (q) { var o = cl[q.c], m = Math.max(row, o ? o.row / 100 : row) * 0.9; return Math.abs(q.x - x) < m && Math.abs(q.y - y) < m && Math.hypot(q.x - x, q.y - y) < m; }); };
    for (var j = 0; j < R; j++) { var sv = off + j * btw;
      for (var t = t0 + row / 2; t <= t1 - row / 2 + 1e-6; t += row) {
        var x = sv * n[0] + t * d[0], y = sv * n[1] + t * d[1];
        if (!Q.pip([x, y], pts) || near(x, y)) continue;
        if (p.plants.length >= 8000) return added;
        p.plants.push({ id: Q.uid(), c: c, x: Math.round(x * 100) / 100, y: Math.round(y * 100) / 100 }); added++;
      } }
    return added;
  }
  function plantsIn(p, b) { var poly = P(b); return p.plants.filter(function (pl) { return Q.pip([pl.x, pl.y], poly); }); }

  /* ---------------- schermata (dentro l'Orto) ---------------- */
  function html(p) {
    var C = Q.cropList(), h = '<div class="panel stack" style="margin-top:12px"><div class="row" style="justify-content:space-between"><h2>Bancali</h2>' + (beds(p).length ? '<span class="small muted">' + beds(p).length + ' bancali</span>' : '') + '</div>';
    var f = UI().bedForm;
    if (!beds(p).length || f) {
      if (!f) return h + '<span class="small muted">Dividi l\'appezzamento in bancali: ognuno avrà la sua coltura.</span><div><button class="btn sm" data-bk="form">Dividi in bancali</button></div></div>';
      var W = width(p), bw = (W - (f.n - 1) * f.pass) / f.n;
      h += '<div class="grid2"><label class="f">Quanti bancali<input id="bkN" type="number" inputmode="numeric" min="1" max="60" value="' + f.n + '"></label><label class="f">Passaggio fra bancali (m)<input id="bkPass" type="number" inputmode="decimal" step="0.05" min="0" value="' + f.pass + '"></label></div>';
      h += '<label class="row small" style="font-weight:600;gap:8px"><input type="checkbox" id="bkAcross"' + (f.across ? ' checked' : '') + '> Di traverso (paralleli al lato corto)</label>';
      h += '<span class="small' + (bw > 0.2 ? '' : '" style="color:var(--bad)') + '">' + (bw > 0.2 ? 'Ogni bancale sarà largo ' + Q.num(bw, 2) + ' m' : 'Troppi bancali o passaggio troppo largo per questo appezzamento') + '</span>';
      if (beds(p).length) h += '<span class="small" style="color:var(--warn)">I bancali che ci sono verranno sostituiti (le piante restano dove sono).</span>';
      return h + '<div class="row"><button class="btn primary sm" data-bk="make">Crea bancali</button><button class="btn sm" data-bk="formCancel">Annulla</button></div></div>';
    }
    var sb = selBed(p);
    h += '<div class="list">' + beds(p).map(function (b) {
      var c = C[b.crop], n = plantsIn(p, b).length;
      return '<button class="item" data-bk="sel" data-id="' + b.id + '"' + (sb && sb.id === b.id ? ' aria-current="true"' : '') + '><span class="dot" style="background:' + (c ? c.c : 'var(--line)') + '"></span><span class="grow"><b>' + esc(b.name) + '</b><br><span class="muted small">' + (c ? c.n : 'nessuna coltura') + ' · ' + Q.m2(Q.area(P(b))) + ' · ' + n + (n === 1 ? ' pianta' : ' piante') + '</span></span></button>';
    }).join("") + '</div>';
    if (sb) {
      var cc = C[sb.crop];
      h += '<div class="sep"></div><h3>' + esc(sb.name) + '</h3><span class="small muted">Coltura del bancale: si usa per "Riempi" e anche per piantare a mano con "Pianta"</span>';
      h += '<div class="row">' + Object.keys(C).filter(function (c) { return !C[c].vine; }).map(function (c) { return '<button class="chip" data-bk="crop" data-c="' + c + '" aria-pressed="' + (sb.crop === c) + '"><span class="dot" style="background:' + C[c].c + '"></span>' + C[c].n + '</button>'; }).join("") + '</div>';
      h += '<div class="row"><button class="btn primary sm" data-bk="fill"' + (cc ? '' : ' aria-disabled="true" style="opacity:.55"') + '>Riempi' + (cc ? ' di ' + cc.n.toLowerCase() : '') + '</button><button class="btn sm" data-bk="empty">' + (UI().confirm === "bkEmpty" ? 'Tocca ancora per svuotare' : 'Svuota bancale') + '</button></div>';
    }
    h += '<div class="row"><button class="btn sm" data-bk="form">Rifai i bancali</button><button class="btn sm danger" data-bk="clear">' + (UI().confirm === "bkClear" ? 'Tocca ancora per togliere i bancali' : 'Togli i bancali') + '</button></div>';
    return h + '</div>';
  }
  /* bancali sulla pianta dell'appezzamento (sotto le piante) */
  function svg(p, v) {
    var C = Q.cropList(), sb = beds(p).length ? selBed(p) : null, out = '';
    beds(p).forEach(function (b, i) {
      var c = C[b.crop], pts = P(b), on = sb && sb.id === b.id, lp = Q.labelPt ? Q.labelPt(pts) : pts[0];
      out += '<polygon points="' + pts.map(function (q) { return q.join(","); }).join(" ") + '" fill="' + (c ? c.c : 'var(--surface)') + '" fill-opacity="' + (c ? 0.28 : 0.12) + '" stroke="' + (on ? '#E8590C' : (c ? c.c : 'var(--ink-2)')) + '" stroke-width="' + (on ? 3 : 1.5) + '" vector-effect="non-scaling-stroke" pointer-events="none"/>';
      out += '<text x="' + lp[0] + '" y="' + lp[1] + '" font-size="' + v.w / 26 + '" text-anchor="middle" font-weight="700" fill="var(--ink)" stroke="var(--surface)" stroke-width="3" paint-order="stroke" vector-effect="non-scaling-stroke" pointer-events="none">' + (i + 1) + '</text>';
    });
    return out;
  }
  /* tocco sulla pianta in modalità "Scegli bancale" */
  function tap(p, pt) { var hit = beds(p).filter(function (b) { return Q.pip(pt, P(b)); })[0]; if (hit) { UI().bedSel = hit.id; Q.render(); } }

  function readForm() { var f = UI().bedForm; if (!f) return; var n = $("#bkN"), ps = $("#bkPass"), ac = $("#bkAcross"); if (n) f.n = Math.max(1, Math.min(60, parseInt(n.value, 10) || 1)); if (ps) f.pass = Math.max(0, parseFloat(String(ps.value).replace(",", ".")) || 0); if (ac) f.across = ac.checked; }
  function act(a, b) {
    var p = Q.ortoSel(); if (!p) return; var ui = UI(), C = Q.cropList();
    if (a !== "empty" && a !== "clear") ui.confirm = null;
    if (a === "form") ui.bedForm = { n: beds(p).length || 6, pass: 0.5, across: false };
    else if (a === "formCancel") ui.bedForm = null;
    else if (a === "make") {
      readForm(); var f = ui.bedForm, r = split(p, f.n, f.pass, f.across);
      if (!r || !r.beds.length) { Q.toast("Non ci stanno: prova con meno bancali o un passaggio più stretto"); Q.render(); return; }
      var old = beds(p); r.beds.forEach(function (nb, i) { if (old[i]) { nb.crop = old[i].crop; nb.name = old[i].name; } });
      p.beds = r.beds; ui.bedForm = null; ui.bedSel = r.beds[0].id; Q.save(); Q.toast(r.beds.length + " bancali larghi " + Q.num(r.bw, 2) + " m");
    }
    else if (a === "sel") { ui.bedSel = b.getAttribute("data-id"); var bs = bedById(p, ui.bedSel); if (bs && C[bs.crop]) Q.getState().cropSel = bs.crop; }
    /* la coltura del bancale è anche quella che si pianta a mano con "Pianta" */
    else if (a === "crop") { var sb = selBed(p); if (sb) { sb.crop = b.getAttribute("data-c"); Q.getState().cropSel = sb.crop; Q.save(); } }
    else if (a === "fill") {
      var s2 = selBed(p); if (!s2 || !C[s2.crop]) { Q.toast("Scegli prima la coltura del bancale"); return; }
      var n = fillBed(p, s2, s2.crop); Q.save(); Q.toast(n ? n.toLocaleString("it-IT") + " piante di " + C[s2.crop].n.toLowerCase() + " in " + s2.name : "Nessuno spazio libero nel bancale");
    }
    else if (a === "empty") {
      if (ui.confirm !== "bkEmpty") { ui.confirm = "bkEmpty"; Q.render(); return; }
      var s3 = selBed(p), poly = P(s3), before = p.plants.length; p.plants = p.plants.filter(function (pl) { return !Q.pip([pl.x, pl.y], poly); }); ui.confirm = null; Q.save(); Q.toast((before - p.plants.length) + " piante tolte da " + s3.name);
    }
    else if (a === "clear") { if (ui.confirm !== "bkClear") { ui.confirm = "bkClear"; Q.render(); return; } delete p.beds; ui.confirm = null; ui.bedSel = null; Q.save(); }
    Q.render();
  }

  document.addEventListener("click", function (e) { var b = e.target.closest("[data-bk]"); if (!b) return; e.preventDefault(); act(b.getAttribute("data-bk"), b); });
  document.addEventListener("change", function (e) { var id = e.target && e.target.id; if (id === "bkN" || id === "bkPass" || id === "bkAcross") { readForm(); Q.render(); } });

  window.QOBanc = { html: html, svg: svg, tap: tap, has: function (p) { return !!beds(p).length; } };
})();

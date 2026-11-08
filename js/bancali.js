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
  function axis(deg) { var th = deg * Math.PI / 180; return [Math.cos(th), Math.sin(th)]; }
  function range(pts, n) { var ss = pts.map(function (q) { return q[0] * n[0] + q[1] * n[1]; }); return [Math.min.apply(null, ss), Math.max.apply(null, ss)]; }
  /* quanti bancali ci stanno e dove: larghezza e passaggio li sceglie Edo; il numero lo scrive lui o lo calcola l'app; quello che avanza va metà per bordo */
  function plan(p, f) {
    var deg = Q.longestEdgeAngle(p.pts) + (f.across ? 90 : 0), n = axis(deg), r = range(p.pts, n), W = r[1] - r[0];
    var N = f.n > 0 ? f.n : Math.floor((W + f.pass) / (f.bw + f.pass) + 1e-6), used = N * f.bw + (N - 1) * f.pass;
    return { deg: deg, n: n, s0: r[0], W: W, N: N, used: used, ok: N >= 1 && f.bw >= 0.2 && used <= W + 1e-6, margin: (W - used) / 2 };
  }
  function strip(p, deg, a, b) { var n = axis(deg), poly = clipHalf(clipHalf(p.pts, n, a, true), n, b, false); return poly.length >= 3 && Q.area(poly) > 0.05 ? poly.map(function (q) { return { x: Math.round(q[0] * 100) / 100, y: Math.round(q[1] * 100) / 100 }; }) : null; }
  function split(p, f) {
    var pl = plan(p, f); if (!pl.ok) return null;
    var out = [];
    for (var i = 0; i < pl.N; i++) {
      var a = pl.s0 + pl.margin + i * (f.bw + f.pass), b = a + f.bw, pts = strip(p, pl.deg, a, b);
      if (pts) out.push({ id: Q.uid(), name: "Bancale " + (out.length + 1), crop: "", st: { deg: pl.deg, a: Math.round(a * 1000) / 1000, b: Math.round(b * 1000) / 1000 }, pts: pts });
    }
    return { beds: out, bw: f.bw };
  }
  /* striscia di un bancale: quella salvata, oppure ricavata dalla sua forma (bancali fatti prima) */
  function stripOf(b) { if (b.st) return b.st; var pts = P(b), deg = Q.longestEdgeAngle(pts) + 90, r = range(pts, axis(deg)); return { deg: deg, a: r[0], b: r[1] }; }
  /* cambia la larghezza di un bancale tenendo fermo il suo centro; non deve toccare i bancali vicini */
  function setWidth(p, bd, w) {
    var st = stripOf(bd), c = (st.a + st.b) / 2, a = c - w / 2, b = c + w / 2, hit = null;
    beds(p).forEach(function (o) { if (o === bd) return; var so = stripOf(o); if (Math.abs(((so.deg - st.deg) % 180 + 180) % 180) > 1 && Math.abs(((so.deg - st.deg) % 180 + 180) % 180 - 180) > 1) return; if (a < so.b - 1e-6 && b > so.a + 1e-6) hit = o; });
    if (hit) return "Così il bancale toccherebbe " + hit.name + ": stringi il bancale vicino o tieni questo più stretto";
    var pts = strip(p, st.deg, a, b); if (!pts) return "Larghezza non valida";
    bd.pts = pts; bd.st = { deg: st.deg, a: Math.round(a * 1000) / 1000, b: Math.round(b * 1000) / 1000 }; return null;
  }
  function bedWidth(b) { var st = stripOf(b); return st.b - st.a; }
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
      var pl = plan(p, f), fit = plan(p, { bw: f.bw, pass: f.pass, across: f.across, n: 0 }).N;
      h += '<div class="grid2"><label class="f">Larghezza bancale (m)<input id="bkBw" type="number" inputmode="decimal" step="0.05" min="0.2" value="' + f.bw + '"></label><label class="f">Passaggio fra bancali (m)<input id="bkPass" type="number" inputmode="decimal" step="0.05" min="0" value="' + f.pass + '"></label><label class="f">Quanti bancali<input id="bkN" type="number" inputmode="numeric" min="1" max="60" value="' + (f.n > 0 ? f.n : '') + '" placeholder="automatico (' + Math.max(0, fit) + ')"></label></div>';
      h += '<label class="row small" style="font-weight:600;gap:8px"><input type="checkbox" id="bkAcross"' + (f.across ? ' checked' : '') + '> Di traverso (paralleli al lato corto)</label>';
      h += '<span id="bkInfo">' + formInfo(p, f) + '</span>';
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
      h += '<div class="sep"></div><h3>' + esc(sb.name) + '</h3><div class="row" style="align-items:flex-end;gap:8px"><label class="f" style="width:150px">Larghezza (m)<input id="bkW" type="number" inputmode="decimal" step="0.05" min="0.2" value="' + Math.round(bedWidth(sb) * 100) / 100 + '"></label><span class="small muted" style="padding-bottom:12px">si allarga o si stringe dal centro</span></div><span class="small muted">Coltura del bancale: si usa per "Riempi" e anche per piantare a mano con "Pianta"</span>';
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
      out += '<polygon points="' + pts.map(function (q) { return q.join(","); }).join(" ") + '" fill="' + (c ? c.c : 'var(--surface)') + '" fill-opacity="' + (c ? 0.28 : 0.45) + '" stroke="' + (on ? '#E8590C' : (c ? c.c : 'var(--ink-2)')) + '" stroke-width="' + (on ? 3 : 1.5) + '" vector-effect="non-scaling-stroke" pointer-events="none"/>';
      out += '<text x="' + lp[0] + '" y="' + lp[1] + '" font-size="' + v.w / 26 + '" text-anchor="middle" font-weight="700" fill="var(--ink)" stroke="var(--surface)" stroke-width="3" paint-order="stroke" vector-effect="non-scaling-stroke" pointer-events="none">' + (i + 1) + '</text>';
    });
    return out;
  }
  /* tocco sulla pianta in modalità "Scegli bancale" */
  function tap(p, pt) { var hit = beds(p).filter(function (b) { return Q.pip(pt, P(b)); })[0]; if (hit) { UI().bedSel = hit.id; Q.render(); } }

  /* riepilogo sotto i campi: si aggiorna da solo mentre si scrive, senza ridisegnare la pagina (così il campo resta attivo) */
  function formInfo(p, f) {
    var pl = plan(p, f), fit = plan(p, { bw: f.bw, pass: f.pass, across: f.across, n: 0 }).N;
    return pl.ok ? '<span class="small">' + pl.N + (pl.N === 1 ? ' bancale largo ' : ' bancali larghi ') + Q.num(f.bw, 2) + ' m, passaggi da ' + Q.num(f.pass, 2) + ' m' + (pl.margin > 0.01 ? '; avanzano ' + Q.num(pl.margin, 2) + ' m per lato' : '') + ' (appezzamento largo ' + Q.num(pl.W, 2) + ' m)</span>' : '<span class="small" style="color:var(--bad)">' + (f.bw < 0.2 ? 'Bancale troppo stretto' : 'Non ci stanno: in ' + Q.num(pl.W, 2) + ' m entrano al massimo ' + Math.max(0, fit) + ' bancali così') + '</span>';
  }
  function num(v) { return parseFloat(String(v).replace(",", ".")); }
  function readForm() { var f = UI().bedForm; if (!f) return; var n = $("#bkN"), ps = $("#bkPass"), bw = $("#bkBw"), ac = $("#bkAcross"); if (n) f.n = Math.max(0, Math.min(60, parseInt(n.value, 10) || 0)); if (ps) f.pass = Math.max(0, num(ps.value) || 0); if (bw) f.bw = Math.max(0, num(bw.value) || 0); if (ac) f.across = ac.checked; }
  function act(a, b) {
    var p = Q.ortoSel(); if (!p) return; var ui = UI(), C = Q.cropList();
    if (a !== "empty" && a !== "clear") ui.confirm = null;
    if (a === "form") ui.bedForm = { n: 0, bw: beds(p).length ? Math.round(bedWidth(beds(p)[0]) * 100) / 100 : 1, pass: 0.5, across: false };
    else if (a === "formCancel") ui.bedForm = null;
    else if (a === "make") {
      readForm(); var f = ui.bedForm, r = split(p, f);
      if (!r || !r.beds.length) { Q.toast("Non ci stanno: prova con bancali più stretti, meno bancali o un passaggio più stretto"); Q.render(); return; }
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
  document.addEventListener("input", function (e) { var id = e.target && e.target.id; if (id === "bkN" || id === "bkPass" || id === "bkBw") { var ev = new Event("change", { bubbles: true }); e.target.dispatchEvent(ev); } });
  document.addEventListener("change", function (e) {
    var id = e.target && e.target.id;
    if (id === "bkN" || id === "bkPass" || id === "bkBw" || id === "bkAcross") { readForm(); var p0 = Q.ortoSel(), f0 = UI().bedForm, el = $("#bkInfo"), nEl = $("#bkN"); if (p0 && f0 && el) { el.innerHTML = formInfo(p0, f0); if (nEl) nEl.placeholder = "automatico (" + Math.max(0, plan(p0, { bw: f0.bw, pass: f0.pass, across: f0.across, n: 0 }).N) + ")"; } }
    if (id === "bkW") { var p = Q.ortoSel(), bd = p && selBed(p), w = num(e.target.value); if (!bd) return; if (!(w >= 0.2)) { Q.toast("Larghezza troppo piccola"); Q.render(); return; } var err = setWidth(p, bd, w); if (err) Q.toast(err); else { Q.save(); Q.toast(bd.name + " ora è largo " + Q.num(w, 2) + " m"); } Q.render(); }
  });

  window.QOBanc = { html: html, svg: svg, tap: tap, has: function (p) { return !!beds(p).length; } };
})();

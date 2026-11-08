/* Lavori in vigna: potatura e altri lavori sulla pianta, lavorazioni del terreno (rovescio, scasso, ripuntatura sotto fila…).
   Un lavoro: S.lavori = [{id, tipo, d: "AAAA-MM-GG", plots: [{p: idParcella, f0, f1}], dove, chi, ore, att, prof, note}]
   - plots: terrazze del lavoro; f0/f1 (facoltativi) = solo i filari da f0 a f1 (lavori sulla pianta, una terrazza alla volta);
   - dove (lavori sul terreno): "inter" (interfila, tutti i filari), "pari", "dispari" (interfila a filari alterni), "sotto" (sotto fila), "tutto".
   Tipi: quelli pronti (BASE) più quelli scritti a mano in S.lavTipi = {id: {n, g: "pianta"|"terreno"}} (chiave "u_<id>").
   Stagione: dal 1° novembre al 31 ottobre (la potatura d'inverno sta tutta in una stagione).
   Sincronizzati nella raccolta "lavori" (uno per documento) e in impostazioni/lavtipi. Espone window.QOLav; pulsanti con data-lv. */
(function () {
  "use strict";
  var Q = window.QO;
  if (!Q) return;
  function S() { return Q.getState(); }
  function UI() { return Q.ui; }
  function esc(s) { return Q.esc(s == null ? "" : s); }
  function $(s) { return document.querySelector(s); }
  function num(v) { return parseFloat(String(v == null ? "" : v).replace(",", ".")); }

  var BASE = [
    ["potatura", "Potatura", "pianta"], ["legatura", "Legatura", "pianta"], ["spollonatura", "Spollonatura", "pianta"], ["scacchiatura", "Scacchiatura", "pianta"],
    ["cimatura", "Cimatura", "pianta"], ["sfogliatura", "Sfogliatura", "pianta"], ["vendemmia", "Vendemmia", "pianta"],
    ["rovescio", "Rovescio", "terreno"], ["scalzatura", "Scalzatura", "terreno"], ["scasso", "Scasso", "terreno", "tutto"], ["ripuntatura", "Ripuntatura sotto fila", "terreno", "sotto"],
    ["fresatura", "Fresatura", "terreno"], ["erpicatura", "Erpicatura", "terreno"], ["trinciatura", "Trinciatura dell'erba", "terreno"],
    ["sovescio", "Semina del sovescio", "terreno"], ["interramento", "Interramento del sovescio", "terreno"]
  ];
  var DOVE = [["inter", "Interfila, tutti i filari"], ["pari", "Interfila, filari pari"], ["dispari", "Interfila, filari dispari"], ["sotto", "Sotto fila"], ["tutto", "Tutta la superficie"]];
  var DOVEN = {}; DOVE.forEach(function (d) { DOVEN[d[0]] = d[1]; });

  function lav() { return S().lavori || (S().lavori = []); }
  function tipi() {
    var out = {}; BASE.forEach(function (b) { out[b[0]] = { n: b[1], g: b[2], dove: b[3] || "inter" }; });
    var C = S().lavTipi || {}; Object.keys(C).forEach(function (id) { out["u_" + id] = { n: C[id].n, g: C[id].g === "terreno" ? "terreno" : "pianta", dove: "inter", custom: true }; });
    return out;
  }
  function tipo(k) { return tipi()[k] || { n: k, g: "pianta", dove: "inter" }; }
  function tipoSelect(id, cur, extra) {
    var T = tipi(), g = function (gr, lab) { return '<optgroup label="' + lab + '">' + Object.keys(T).filter(function (k) { return T[k].g === gr; }).map(function (k) { return '<option value="' + k + '"' + (k === cur ? ' selected' : '') + '>' + esc(T[k].n) + '</option>'; }).join("") + '</optgroup>'; };
    return '<select id="' + id + '">' + g("pianta", "Sulla pianta") + g("terreno", "Sul terreno") + (extra ? '<option value="_new">+ Nuovo tipo di lavoro…</option>' : '') + '</select>';
  }

  /* ---------------- stagioni e avanzamento ---------------- */
  function seasonOf(d) { var y = +d.slice(0, 4), m = +d.slice(5, 7); return m >= 11 ? y : y - 1; }
  function curSeason() { return seasonOf(Q.iso(Q.today())); }
  function seasonLabel(y) { return y + "–" + String((y + 1) % 100).padStart(2, "0"); }
  function recsFor(pid, k, season) { return lav().filter(function (r) { return r.tipo === k && (season == null || seasonOf(r.d) === season) && r.plots.some(function (x) { return x.p === pid; }); }); }
  function filariOf(p) { try { return Q.vineStats(p).filari || 0; } catch (e) { return 0; } }
  /* quanto della terrazza è fatto (da 0 a 1) per un tipo di lavoro in una stagione */
  function prog(p, k, season) {
    var rs = recsFor(p.id, k, season); if (!rs.length) return 0;
    if (tipo(k).g === "terreno") { var pari = false, disp = false; for (var i = 0; i < rs.length; i++) { var dv = rs[i].dove || "inter"; if (dv === "pari") pari = true; else if (dv === "dispari") disp = true; else return 1; } return (pari ? 0.5 : 0) + (disp ? 0.5 : 0); }
    var n = filariOf(p), done = {};
    for (var j = 0; j < rs.length; j++) { var e = rs[j].plots.filter(function (x) { return x.p === p.id; })[0]; if (!e.f0 || !n) return 1; for (var f = Math.max(1, +e.f0); f <= Math.min(n, +e.f1 || +e.f0); f++) done[f] = 1; }
    return n ? Math.min(1, Object.keys(done).length / n) : 1;
  }
  function filariText(p, k, season) {
    var rs = recsFor(p.id, k, season), n = filariOf(p), done = {}; rs.forEach(function (r) { var e = r.plots.filter(function (x) { return x.p === p.id; })[0]; if (e && e.f0) for (var f = +e.f0; f <= (+e.f1 || +e.f0); f++) done[f] = 1; });
    var ks = Object.keys(done).map(Number).sort(function (a, b) { return a - b; }); if (!ks.length) return "";
    var parts = [], a = ks[0], b = ks[0]; ks.slice(1).concat([null]).forEach(function (x) { if (x === b + 1) b = x; else { parts.push(a === b ? String(a) : a + "–" + b); a = b = x; } });
    return "filari " + parts.join(", ") + " su " + n;
  }
  function vigneTer() { return Q.vignes().filter(Q.inTer).sort(Q.natCmp); }
  function summary(k, season) {
    var vs = vigneTer(), tot = 0, done = 0, full = 0, part = 0;
    vs.forEach(function (p) { var a = Q.area(p.pts) / 1e4, f = prog(p, k, season); tot += a; done += a * f; if (f >= 0.999) full++; else if (f > 0) part++; });
    return { n: vs.length, full: full, part: part, ha: tot, haDone: done, pct: tot ? Math.round(done / tot * 100) : 0 };
  }
  function plotNames(r) { var ns = r.plots.map(function (x) { var p = Q.plotById(x.p); return p ? p.name + (x.f0 ? " (filari " + x.f0 + (x.f1 && x.f1 !== x.f0 ? "–" + x.f1 : "") + ")" : "") : null; }).filter(Boolean); return ns.length > 6 ? ns.slice(0, 6).join(", ") + " e altre " + (ns.length - 6) : ns.join(", "); }
  function short(p) { var k = Q.nameKey(p.name); return k ? (String(k.n).replace(".", ",") + (k.rest ? " " + k.rest : "")) : p.name; }

  /* ---------------- vista Lavori (Vigna → Lavori) ---------------- */
  function showKey() { var ui = UI(); if (!ui.lavShow) { try { ui.lavShow = localStorage.getItem("qo-lavshow") || "potatura"; } catch (e) { ui.lavShow = "potatura"; } } if (!tipi()[ui.lavShow]) ui.lavShow = "potatura"; return ui.lavShow; }
  function view() {
    var ui = UI(), f = ui.lavForm, k = showKey(), y = curSeason(), sm = summary(k, y), h = '';
    if (!Q.vignes().length) return '<div class="panel stack"><h2>Nessuna parcella</h2><span>Aggiungi prima le terrazze in Parcelle.</span></div>';
    if (!f) {
      h += '<div class="row" style="gap:8px;flex-wrap:nowrap"><label class="f" style="flex:1;min-width:0">Mostra sulla mappa' + tipoSelect("lvShow", k, false) + '</label></div>';
      h += '<div class="small"><b>' + esc(tipo(k).n) + ' ' + seasonLabel(y) + ':</b> ' + sm.full + (sm.full === 1 ? ' terrazza fatta' : ' terrazze fatte') + (sm.part ? ', ' + sm.part + ' a metà' : '') + ' su ' + sm.n + ' · ' + Q.num(sm.haDone, 2) + ' ha su ' + Q.num(sm.ha, 2) + ' · <b>' + sm.pct + '%</b></div>';
    } else h += '<div class="small" style="font-weight:700">Tocca le terrazze del lavoro sulla mappa</div>';
    h += '<div class="mapwrap"><svg id="lvmap" role="img" aria-label="Terrazze colorate secondo il lavoro"></svg><div class="zoom"><button data-act="zin" data-k="' + key() + '" aria-label="Ingrandisci">+</button><button data-act="zout" data-k="' + key() + '" aria-label="Rimpicciolisci">−</button><button data-act="zfit" data-k="' + key() + '" aria-label="Adatta" style="font-size:13px">⤢</button></div></div>';
    if (f) return h + formHtml(f);
    h += '<div class="row small" style="gap:12px"><span><span class="dot" style="background:#2E6B3E"></span> fatta</span><span><span class="dot" style="background:#97C459"></span> a metà</span><span><span class="dot" style="background:#B4B2A9"></span> da fare</span><span class="muted">Tocca una terrazza per segnare il lavoro.</span></div>';
    h += '<div class="row"><button class="btn primary" data-lv="new">+ Segna lavoro</button></div>';
    h += registroHtml(y);
    return h;
  }
  function key() { return Q.vmapKeyFor("lav"); }
  function registroHtml(y) {
    var rs = lav().filter(function (r) { return seasonOf(r.d) === y; }).sort(function (a, b) { return a.d < b.d ? 1 : -1; }), ui = UI();
    var h = '<div class="row" style="justify-content:space-between;margin-top:6px"><h2>Registro dei lavori ' + seasonLabel(y) + '</h2>' + (rs.length ? '<button class="btn sm" data-lv="copy">Copia come tabella</button>' : '') + '</div>';
    if (!rs.length) return h + '<div class="panel small muted">Nessun lavoro segnato in questa stagione.</div>';
    var ore = {}; rs.forEach(function (r) { if (+r.ore) ore[r.tipo] = (ore[r.tipo] || 0) + +r.ore; });
    if (Object.keys(ore).length) h += '<div class="small muted">Ore: ' + Object.keys(ore).map(function (t) { return esc(tipo(t).n) + ' ' + Q.num(ore[t], 1); }).join(" · ") + '</div>';
    h += '<div class="list">' + rs.map(function (r) {
      var T = tipo(r.tipo), det = [r.dove && T.g === "terreno" ? DOVEN[r.dove] : "", r.prof ? r.prof + " cm" : "", r.att, r.chi, +r.ore ? Q.num(+r.ore, 1) + " h" : ""].filter(Boolean).join(" · ");
      return '<div class="item" style="cursor:default;align-items:flex-start"><span class="grow"><b>' + esc(T.n) + '</b> <span class="muted small">' + Q.fmt(Q.parse(r.d)) + '</span><br><span class="small">' + esc(plotNames(r)) + '</span>' + (det ? '<br><span class="muted small">' + esc(det) + '</span>' : '') + (r.note ? '<br><span class="small">' + esc(r.note) + '</span>' : '') + '</span><button class="btn sm danger" data-lv="del" data-id="' + r.id + '">' + (ui.confirm === "lvDel:" + r.id ? 'Tocca ancora' : 'Togli') + '</button></div>';
    }).join("") + '</div>';
    return h;
  }

  /* ---------------- modulo "Segna lavoro" ---------------- */
  function selPlots(f) { return Q.vignes().filter(function (p) { return f.sel[p.id]; }).sort(Q.natCmp); }
  function lastDove(pid, k) { var rs = lav().filter(function (r) { return r.tipo === k && r.plots.some(function (x) { return x.p === pid; }); }).sort(function (a, b) { return a.d < b.d ? 1 : -1; }); return rs[0] || null; }
  function formHtml(f) {
    var T = tipo(f.tipo), ps = selPlots(f), one = ps.length === 1 ? ps[0] : null, h = '<div class="panel stack">';
    h += '<div class="row" style="justify-content:space-between"><h2>Segna lavoro</h2><span class="small muted">' + ps.length + (ps.length === 1 ? ' terrazza' : ' terrazze') + '</span></div>';
    h += '<div class="grid2"><label class="f">Lavoro' + tipoSelect("lfTipo", f.tipo, true) + '</label><label class="f">Data<input id="lfData" type="date" value="' + esc(f.d) + '"></label></div>';
    if (f.newTipo) h += '<div class="grid2"><label class="f">Nome del lavoro<input id="lfTn" value="' + esc(f.newTipo.n) + '" placeholder="es. Concimazione"></label><label class="f">Dove si fa<select id="lfTg"><option value="pianta"' + (f.newTipo.g === "pianta" ? ' selected' : '') + '>Sulla pianta</option><option value="terreno"' + (f.newTipo.g === "terreno" ? ' selected' : '') + '>Sul terreno</option></select></label></div><div class="row"><button class="btn sm" data-lv="tipoSave">Aggiungi il tipo</button><button class="btn sm" data-lv="tipoCancel">Annulla</button></div>';
    h += '<div class="small">' + (ps.length ? esc(ps.map(function (p) { return p.name; }).join(", ")) : '<span style="color:var(--warn)">Nessuna terrazza: toccale sulla mappa.</span>') + '</div>';
    h += '<div class="row"><button class="btn sm" data-lv="selAll">Tutte' + (Q.terSel() ? ' del terreno' : '') + '</button>' + (ps.length ? '<button class="btn sm" data-lv="selNone">Nessuna</button>' : '') + '</div>';
    if (T.g === "pianta") {
      if (one) { var n = filariOf(one); h += '<div class="row" role="group" aria-label="Quanto è fatto" style="gap:6px"><button class="btn sm" data-lv="whole" data-v="1" aria-pressed="' + !!f.whole + '">Tutta la terrazza</button><button class="btn sm" data-lv="whole" data-v="0" aria-pressed="' + !f.whole + '">Solo alcuni filari</button></div>';
        if (!f.whole) h += '<div class="row" style="gap:8px;align-items:flex-end"><label class="f" style="width:110px">Dal filare<input id="lfF0" type="number" inputmode="numeric" min="1" max="' + n + '" value="' + esc(f.f0) + '"></label><label class="f" style="width:110px">al filare<input id="lfF1" type="number" inputmode="numeric" min="1" max="' + n + '" value="' + esc(f.f1) + '"></label><span class="small muted" style="padding-bottom:12px">su ' + n + '</span></div>' + (filariText(one, f.tipo, curSeason()) ? '<span class="small muted">Già fatti: ' + filariText(one, f.tipo, curSeason()) + '</span>' : ''); }
      else if (ps.length > 1) h += '<span class="small muted">Con più terrazze il lavoro vale per le terrazze intere. Per segnare solo alcuni filari scegline una.</span>';
    } else {
      h += '<label class="f">Dove<select id="lfDove">' + DOVE.map(function (d) { return '<option value="' + d[0] + '"' + (f.dove === d[0] ? ' selected' : '') + '>' + d[1] + '</option>'; }).join("") + '</select></label>';
      if (one) { var ld = lastDove(one.id, f.tipo); if (ld && (ld.dove === "pari" || ld.dove === "dispari")) h += '<span class="small" style="color:var(--warn)">L\'ultima volta (' + Q.fmt(Q.parse(ld.d)) + ') qui: filari ' + ld.dove + '.</span>'; }
    }
    var names = {}, atts = {}; lav().forEach(function (r) { if (r.chi) names[r.chi] = 1; if (r.att) atts[r.att] = 1; }); (S().macchine || []).forEach(function (m) { atts[m.n] = 1; });
    h += '<details' + (f.more ? ' open' : '') + ' id="lfMore"><summary class="small" style="font-weight:700;cursor:pointer">Altri dati (facoltativi)</summary><div class="grid2" style="margin-top:8px">';
    h += '<label class="f">Chi<input id="lfChi" list="lfChiL" value="' + esc(f.chi) + '" placeholder="es. Marco"><datalist id="lfChiL">' + Object.keys(names).map(function (x) { return '<option value="' + esc(x) + '">'; }).join("") + '</datalist></label>';
    h += '<label class="f">Ore<input id="lfOre" type="number" inputmode="decimal" step="0.5" value="' + esc(f.ore) + '"></label>';
    h += '<label class="f">' + (T.g === "terreno" ? 'Attrezzo e trattore' : 'Attrezzo') + '<input id="lfAtt" list="lfAttL" value="' + esc(f.att) + '" placeholder="' + (T.g === "terreno" ? 'es. ripuntatore' : 'es. forbici elettriche') + '"><datalist id="lfAttL">' + Object.keys(atts).map(function (x) { return '<option value="' + esc(x) + '">'; }).join("") + '</datalist></label>';
    if (T.g === "terreno") h += '<label class="f">Profondità (cm)<input id="lfProf" type="number" inputmode="numeric" value="' + esc(f.prof) + '"></label>';
    h += '</div><label class="f" style="margin-top:8px">Nota<input id="lfNote" value="' + esc(f.note) + '"></label></details>';
    h += '<div class="row"><button class="btn primary" data-lv="save">Salva lavoro</button><button class="btn" data-lv="cancel">Annulla</button></div>';
    return h + '</div>';
  }
  function newForm(pid, k) {
    var t = k || showKey(), sel = {}; if (pid) sel[pid] = true;
    var f = { tipo: t, d: Q.iso(Q.today()), sel: sel, whole: true, f0: "", f1: "", dove: tipo(t).dove, chi: "", ore: "", att: "", prof: "", note: "", more: false, from: UI().vtab };
    if (pid) { var p = Q.plotById(pid); if (p && tipo(t).g === "pianta") { var n = filariOf(p), ft = filariText(p, t, curSeason()); if (ft && prog(p, t, curSeason()) < 1) { f.whole = false; f.f0 = ""; f.f1 = n; } } }
    return f;
  }
  function readForm() {
    var f = UI().lavForm; if (!f) return;
    var g = function (id) { var el = document.getElementById(id); return el ? el.value : null; };
    if (g("lfData")) f.d = g("lfData");
    if (g("lfDove") != null) f.dove = g("lfDove");
    if (g("lfF0") != null) f.f0 = g("lfF0"); if (g("lfF1") != null) f.f1 = g("lfF1");
    ["Chi", "Ore", "Att", "Prof", "Note"].forEach(function (x) { var v = g("lf" + x); if (v != null) f[x.toLowerCase()] = v.trim(); });
    if (f.newTipo) { if (g("lfTn") != null) f.newTipo.n = g("lfTn").trim(); if (g("lfTg") != null) f.newTipo.g = g("lfTg"); }
    var m = document.getElementById("lfMore"); if (m) f.more = m.open;
  }
  function save() {
    var f = UI().lavForm, ps = selPlots(f);
    if (!ps.length) { Q.toast("Tocca sulla mappa le terrazze del lavoro"); return false; }
    if (!f.d) { Q.toast("Manca la data"); return false; }
    var T = tipo(f.tipo), entries = ps.map(function (p) { return { p: p.id }; });
    if (T.g === "pianta" && ps.length === 1 && !f.whole) {
      var n = filariOf(ps[0]), a = parseInt(f.f0, 10), b = parseInt(f.f1, 10) || a;
      if (!(a >= 1) || !(b >= a) || b > n) { Q.toast("Controlla i filari: da 1 a " + n); return false; }
      entries[0].f0 = a; entries[0].f1 = b;
    }
    var r = { id: Q.uid(), tipo: f.tipo, d: f.d, plots: entries };
    if (T.g === "terreno") r.dove = f.dove || "inter";
    if (f.chi) r.chi = f.chi; if (num(f.ore) > 0) r.ore = num(f.ore); if (f.att) r.att = f.att; if (T.g === "terreno" && num(f.prof) > 0) r.prof = num(f.prof); if (f.note) r.note = f.note;
    lav().push(r); UI().lavShow = f.tipo; try { localStorage.setItem("qo-lavshow", f.tipo); } catch (e) {}
    Q.save(); Q.toast(T.n + " segnata: " + ps.length + (ps.length === 1 ? " terrazza" : " terrazze"));
    return true;
  }

  /* ---------------- mappa ---------------- */
  function after() {
    var svg = $("#lvmap"); if (!svg) return;
    var vs = Q.vignes().filter(Q.inTer), V = Q.views(), k = key(), f = UI().lavForm, t = showKey(), y = curSeason();
    if (!V[k] && vs.length) { var all = []; vs.forEach(function (p) { all = all.concat(p.pts); }); var b = Q.bbox(all); Q.fitView(k, b, Math.max(4, (b.x1 - b.x0 + b.y1 - b.y0) * 0.04)); }
    if (!V[k]) return;
    var v = Q.vbOf(k), kk = v.w / (svg.getBoundingClientRect().width || 360), out = '';
    svg.setAttribute("viewBox", v.x + " " + v.y + " " + v.w + " " + v.h);
    vs.forEach(function (p) {
      var c;
      if (f) c = f.sel[p.id] ? { f: "#E8590C", o: 0.6, s: "#E8590C", w: 2.5 } : { f: "#888780", o: 0.1, s: "#B4B2A9" };
      else { var pr = prog(p, t, y); c = pr >= 0.999 ? { f: "#2E6B3E", o: 0.6, s: "#2E6B3E", w: 1.5 } : pr > 0 ? { f: "#97C459", o: 0.55, s: "#639922", w: 1.5 } : { f: "#888780", o: 0.12, s: "#B4B2A9", d: 1 }; }
      out += '<polygon points="' + p.pts.map(function (q) { return q.join(","); }).join(" ") + '" fill="' + c.f + '" fill-opacity="' + c.o + '" stroke="' + c.s + '" stroke-width="' + (c.w || 1.2) + '"' + (c.d ? ' stroke-dasharray="4 3"' : '') + ' vector-effect="non-scaling-stroke"/>';
    });
    vs.forEach(function (p) { var b = Q.bbox(p.pts); if ((b.x1 - b.x0) / kk < 14 && (b.y1 - b.y0) / kk < 14) return; var lp = Q.labelPt(p.pts); out += '<text x="' + lp[0] + '" y="' + (lp[1] + 4 * kk) + '" font-size="' + 12 * kk + '" text-anchor="middle" font-weight="700" fill="var(--ink)" stroke="var(--surface)" stroke-width="' + 3 * kk + '" paint-order="stroke" pointer-events="none">' + esc(short(p)) + '</text>'; });
    svg.innerHTML = out;
    Q.bindPan(svg, k, function (pt) {
      var hit = null; for (var i = 0; i < vs.length; i++) if (Q.pip(pt, vs[i].pts)) { hit = vs[i]; break; } if (!hit) return;
      var ff = UI().lavForm; readForm();
      if (ff) { if (ff.sel[hit.id]) delete ff.sel[hit.id]; else ff.sel[hit.id] = true; if (selPlots(ff).length !== 1) ff.whole = true; }
      else UI().lavForm = newForm(hit.id, t);
      Q.render();
    });
  }

  /* ---------------- scheda della terrazza e Oggi ---------------- */
  function plotHtml(p) {
    var y = curSeason(), rs = lav().filter(function (r) { var s = seasonOf(r.d); return (s === y || s === y - 1) && r.plots.some(function (x) { return x.p === p.id; }); }).sort(function (a, b) { return a.d < b.d ? 1 : -1; });
    var h = '<div class="panel stack" style="margin-top:10px"><div class="row" style="justify-content:space-between"><h3>Lavori</h3><button class="btn sm" data-lv="newFor" data-id="' + p.id + '">+ Segna lavoro</button></div>';
    var pr = prog(p, "potatura", y); h += '<span class="small">Potatura ' + seasonLabel(y) + ': <b>' + (pr >= 0.999 ? 'fatta' : pr > 0 ? 'a metà (' + filariText(p, "potatura", y) + ')' : 'da fare') + '</b></span>';
    if (!rs.length) return h + '<span class="small muted">Nessun lavoro segnato nelle ultime due stagioni.</span></div>';
    h += '<div class="stack" style="gap:4px">' + rs.slice(0, 10).map(function (r) { var e = r.plots.filter(function (x) { return x.p === p.id; })[0], T = tipo(r.tipo); return '<div class="small"><span class="muted mono">' + Q.fmt(Q.parse(r.d)) + '</span> ' + esc(T.n) + (e && e.f0 ? ' (filari ' + e.f0 + (e.f1 !== e.f0 ? '–' + e.f1 : '') + ')' : '') + (T.g === "terreno" && r.dove ? ' · ' + esc(DOVEN[r.dove].toLowerCase()) : '') + (r.chi ? ' · ' + esc(r.chi) : '') + '</div>'; }).join("") + '</div>';
    return h + '</div>';
  }
  function oggiHtml() {
    var y = curSeason(), ks = {}; lav().forEach(function (r) { if (seasonOf(r.d) === y) ks[r.tipo] = 1; }); var list = Object.keys(ks); if (!list.length) return "";
    var h = '<h2 style="margin:16px 0 8px">Lavori ' + seasonLabel(y) + '</h2><div class="list">';
    list.forEach(function (k) { var sm = summary(k, y); h += '<button class="item" data-lv="goShow" data-k="' + k + '"><span class="grow"><b>' + esc(tipo(k).n) + ' ' + sm.pct + '%</b><br><span class="muted small">' + sm.full + ' su ' + sm.n + ' terrazze' + (sm.part ? ', ' + sm.part + ' a metà' : '') + ' · ' + Q.num(sm.haDone, 2) + ' ha su ' + Q.num(sm.ha, 2) + '</span></span></button>'; });
    return h + '</div>';
  }

  /* ---------------- pulsanti ---------------- */
  function act(a, b) {
    var ui = UI(); if (a.indexOf("del") !== 0) ui.confirm = null; readForm(); var f = ui.lavForm;
    if (a === "new") ui.lavForm = newForm(null);
    else if (a === "newFor") { ui.vtab = "lavori"; ui.lavForm = newForm(b.getAttribute("data-id")); window.scrollTo(0, 0); }
    else if (a === "goShow") { Q.ui.tab = "vigna"; ui.vtab = "lavori"; ui.lavShow = b.getAttribute("data-k"); ui.lavForm = null; window.scrollTo(0, 0); }
    else if (a === "cancel") ui.lavForm = null;
    else if (a === "save") { if (save() !== true) { Q.render(); return; } ui.lavForm = null; }
    else if (a === "selAll") Q.vignes().filter(Q.inTer).forEach(function (p) { f.sel[p.id] = true; }), f.whole = true;
    else if (a === "selNone") f.sel = {};
    else if (a === "whole") { f.whole = b.getAttribute("data-v") === "1"; if (!f.whole && !f.f1) { var one = selPlots(f)[0]; if (one) f.f1 = filariOf(one); } }
    else if (a === "tipoSave") {
      if (!f.newTipo.n) { Q.toast("Scrivi il nome del lavoro"); return; }
      var id = Q.uid(); S().lavTipi = S().lavTipi || {}; S().lavTipi[id] = { n: f.newTipo.n, g: f.newTipo.g }; f.tipo = "u_" + id; f.dove = "inter"; f.newTipo = null; Q.save(); Q.toast("Nuovo tipo di lavoro aggiunto");
    }
    else if (a === "tipoCancel") { f.newTipo = null; f.tipo = f.prevTipo || showKey(); }
    else if (a === "del") {
      var rid = b.getAttribute("data-id"); if (ui.confirm !== "lvDel:" + rid) { ui.confirm = "lvDel:" + rid; Q.render(); return; }
      S().lavori = lav().filter(function (r) { return r.id !== rid; }); ui.confirm = null; Q.save(); Q.toast("Lavoro tolto");
    }
    else if (a === "copy") {
      var rows = [["Data", "Lavoro", "Terrazze", "Dove", "Profondità cm", "Attrezzo", "Chi", "Ore", "Nota"]].concat(lav().filter(function (r) { return seasonOf(r.d) === curSeason(); }).sort(function (x, z) { return x.d < z.d ? -1 : 1; }).map(function (r) { var T = tipo(r.tipo); return [Q.fmt(Q.parse(r.d)), T.n, r.plots.map(function (x) { var p = Q.plotById(x.p); return p ? p.name + (x.f0 ? " (filari " + x.f0 + "-" + x.f1 + ")" : "") : ""; }).filter(Boolean).join(", "), T.g === "terreno" && r.dove ? DOVEN[r.dove] : "", r.prof || "", r.att || "", r.chi || "", r.ore ? String(r.ore).replace(".", ",") : "", r.note || ""]; }));
      var txt = rows.map(function (x) { return x.map(function (c) { return String(c).replace(/;/g, ","); }).join(";"); }).join("\n");
      try { navigator.clipboard.writeText(txt).then(function () { Q.toast("Registro copiato: incollalo in un foglio di calcolo"); }, function () { Q.toast("Copia non riuscita"); }); } catch (e) { Q.toast("Copia non riuscita"); }
      return;
    }
    Q.render();
  }
  document.addEventListener("click", function (e) { var b = e.target.closest("[data-lv]"); if (!b) return; e.preventDefault(); act(b.getAttribute("data-lv"), b); });
  document.addEventListener("change", function (e) {
    var id = e.target && e.target.id, ui = UI(); if (!id) return;
    if (id === "lvShow") { ui.lavShow = e.target.value; try { localStorage.setItem("qo-lavshow", ui.lavShow); } catch (x) {} Q.render(); }
    else if (id === "lfTipo" && ui.lavForm) { readForm(); var f = ui.lavForm; if (e.target.value === "_new") { f.prevTipo = f.tipo; f.newTipo = { n: "", g: "terreno" }; } else { f.tipo = e.target.value; f.newTipo = null; f.dove = tipo(f.tipo).dove; } Q.render(); }
    else if (id === "lfDove" || id === "lfF0" || id === "lfF1") readForm();
  });

  window.QOLav = {
    view: view, after: after, plotHtml: plotHtml, oggiHtml: oggiHtml,
    hasForm: function () { return !!UI().lavForm; }, closeForm: function () { UI().lavForm = null; }
  };
})();

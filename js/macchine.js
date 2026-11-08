/* Macchine per i trattamenti (trattore + atomizzatore): ognuna ha le sue terrazze, la capienza della botte e i litri d'acqua per ettaro.
   Dati in S.macchine = [{id, n, c, tank, water, plots: {idParcella: true}}], sincronizzati in impostazioni/macchine.
   Il Calcolo botte (vista "Botte" della Vigna) può partire da una macchina: terrazze, botte e acqua sono già quelle della macchina;
   le terrazze si possono aggiungere o togliere "solo per oggi" (S.botte.oggi = {d, mac, t: {idParcella: true}}, non cambia la macchina).
   Stato della schermata: UI.macSel (macchina a cui si assegnano le terrazze), UI.macForm (modulo), UI.botMac (macchina del calcolo).
   Espone window.QOMac; pulsanti con data-mc. */
(function () {
  "use strict";
  var Q = window.QO;
  if (!Q) return;
  function S() { return Q.getState(); }
  function UI() { return Q.ui; }
  function esc(s) { return Q.esc(s == null ? "" : s); }
  function $(s) { return document.querySelector(s); }
  function num(v) { return parseFloat(String(v == null ? "" : v).replace(",", ".")); }
  var COLORS = ["#185FA5", "#BA7517", "#0F6E56", "#993556", "#534AB7", "#5F5E5A"];

  function list() { return S().macchine || (S().macchine = []); }
  function byId(id) { return list().filter(function (m) { return m.id === id; })[0] || null; }
  function vigne() { return Q.vignes().slice().sort(Q.natCmp); }
  function macsOf(pid) { return list().filter(function (m) { return m.plots && m.plots[pid]; }); }
  function ha(p) { return Q.area(p.pts) / 1e4; }
  /* nome corto per la mappa: "T. 5 N" → "5 N" */
  function short(p) { var k = Q.nameKey(p.name); return k ? (String(k.n).replace(".", ",") + (k.rest ? " " + k.rest : "")) : p.name; }

  /* ---------------- calcolo della botte ---------------- */
  function today() { return Q.iso(Q.today()); }
  function oggi() {
    var B = S().botte, o = B.oggi, mac = UI().botMac || null;
    if (!o || o.d !== today() || o.mac !== mac) o = B.oggi = { d: today(), mac: mac, t: {} };
    return o;
  }
  function calcMac() { var m = byId(UI().botMac); if (!m && UI().botMac) UI().botMac = null; return m; }
  /* la terrazza è nel calcolo? con una macchina: assegnata alla macchina, salvo i cambi di oggi; senza: la scelta libera di sempre */
  function inCalc(p) { var m = calcMac(); if (!m) return !!S().botte.sel[p.id]; var base = !!(m.plots && m.plots[p.id]); return oggi().t[p.id] ? !base : base; }
  function toggleCalc(pid) { var m = calcMac(); if (!m) { S().botte.sel[pid] = !S().botte.sel[pid]; return; } var t = oggi().t; if (t[pid]) delete t[pid]; else t[pid] = true; }
  function setAll(on) { var m = calcMac(), vs = Q.vignes().filter(Q.inTer); vs.forEach(function (p) { if (!m) { if (on) S().botte.sel[p.id] = true; else delete S().botte.sel[p.id]; return; } var base = !!(m.plots && m.plots[p.id]), t = oggi().t; if (base !== on) t[p.id] = true; else delete t[p.id]; }); }
  function water() { var m = calcMac(); return m ? (+m.water || 0) : (+S().botte.water || 0); }
  function tank() { var m = calcMac(); return m ? (+m.tank || 0) : (+S().botte.tank || 0); }
  function changedToday() { var m = calcMac(); return m ? Object.keys(oggi().t).filter(function (k) { return Q.plotById(k); }).length : 0; }

  /* ---------------- controlli sulle assegnazioni ---------------- */
  function problems() {
    if (!list().length) return { none: [], both: [] };
    var none = [], both = [];
    vigne().forEach(function (p) { var n = macsOf(p.id).length; if (!n) none.push(p); else if (n > 1) both.push(p); });
    return { none: none, both: both };
  }
  function names(a) { var s = a.slice(0, 12).map(function (p) { return esc(p.name); }).join(", "); return s + (a.length > 12 ? " e altre " + (a.length - 12) : ""); }

  /* ---------------- riquadro Macchine ---------------- */
  function machinesHtml() {
    var ui = UI(), f = ui.macForm, h = '<div class="panel stack"><div class="row" style="justify-content:space-between"><h2>Macchine</h2>' + (list().length && !f ? '<button class="btn sm" data-mc="new">+ Nuova macchina</button>' : '') + '</div>';
    if (f) return h + formHtml(f) + '</div>';
    if (!list().length) return h + '<span class="small muted">Se tratti con più macchine (per esempio un trattore e un cingolato), aggiungile qui: per ognuna scegli le terrazze, la capienza della botte e i litri d\'acqua per ettaro. Il calcolo della botte userà i dati della macchina.</span><div><button class="btn sm" data-mc="new">+ Nuova macchina</button></div></div>';
    h += '<div class="list">' + list().map(function (m) {
      var ps = vigne().filter(function (p) { return m.plots && m.plots[p.id]; }), a = ps.reduce(function (s, p) { return s + ha(p); }, 0);
      return '<div class="item" style="cursor:default"><span class="swatch" style="background:' + m.c + ';border-color:' + m.c + '"></span><span class="grow"><b>' + esc(m.n) + '</b><br><span class="muted small">botte ' + Math.round(m.tank) + ' L · ' + Math.round(m.water) + ' L/ha · ' + ps.length + (ps.length === 1 ? ' terrazza' : ' terrazze') + ' · ' + Q.num(a, 2) + ' ha</span></span><button class="btn sm" data-mc="edit" data-id="' + m.id + '">Modifica</button></div>';
    }).join("") + '</div>';
    h += '<span class="small" style="font-weight:600">Assegna le terrazze: scegli la macchina, poi tocca le terrazze sulla mappa</span>';
    h += '<div class="row" role="group" aria-label="Macchina a cui assegnare" style="gap:6px">' + list().map(function (m) { return '<button class="btn sm" data-mc="assign" data-id="' + m.id + '" aria-pressed="' + (ui.macSel === m.id) + '"><span class="dot" style="background:' + m.c + '"></span>' + esc(m.n) + '</button>'; }).join("") + (ui.macSel ? '<button class="btn sm" data-mc="assignEnd">Fine</button>' : '') + '</div>';
    if (ui.macSel) h += mapHtml("macmap", Q.vmapKeyFor("mac")) + '<span class="small muted">Tocca una terrazza per darla a ' + esc((byId(ui.macSel) || {}).n || "") + ' o per togliergliela. Grigia tratteggiata: senza macchina; rossa: su più macchine.</span><div class="row"><button class="btn sm" data-mc="allTer">Tutte quelle senza macchina' + (Q.terSel() ? ' del terreno' : '') + '</button></div>';
    var pr = problems();
    if (pr.none.length) h += '<div class="small" style="background:var(--warn-bg,rgba(186,117,23,.14));border-radius:10px;padding:8px 10px"><b>Senza macchina (' + pr.none.length + '):</b> ' + names(pr.none) + '</div>';
    if (pr.both.length) h += '<div class="small" style="background:var(--bad-bg,rgba(200,50,50,.12));border-radius:10px;padding:8px 10px"><b>Su più macchine (' + pr.both.length + '):</b> ' + names(pr.both) + '</div>';
    if (!pr.none.length && !pr.both.length) h += '<span class="small" style="color:var(--ok,#2E6B3E)">Ogni terrazza ha la sua macchina.</span>';
    return h + '</div>';
  }
  function formHtml(f) {
    var h = '<div class="grid2"><label class="f">Nome<input id="mcN" value="' + esc(f.n) + '" placeholder="es. Cingolato"></label><label class="f">Capienza botte (L)<input id="mcTank" type="number" inputmode="numeric" value="' + esc(f.tank) + '"></label><label class="f">Acqua (L/ha)<input id="mcWater" type="number" inputmode="numeric" value="' + esc(f.water) + '"></label></div>';
    h += '<div class="row" role="group" aria-label="Colore" style="gap:8px"><span class="small muted">Colore</span>' + COLORS.map(function (c) { return '<button class="btn sm" data-mc="color" data-v="' + c + '" aria-label="Colore ' + c + '" aria-pressed="' + (f.c === c) + '" style="width:36px;min-height:36px;padding:0;border-radius:18px;background:' + c + ';' + (f.c === c ? 'outline:3px solid var(--ink);outline-offset:2px' : '') + '"></button>'; }).join("") + '</div>';
    h += '<div class="row"><button class="btn primary sm" data-mc="save">Salva macchina</button><button class="btn sm" data-mc="cancel">Annulla</button>' + (f.id ? '<button class="btn sm danger" data-mc="del">' + (UI().confirm === "mcDel" ? 'Tocca ancora per eliminare' : 'Elimina') + '</button>' : '') + '</div>';
    if (!f.id) h += '<span class="small muted">Dopo il salvataggio scegli le sue terrazze toccandole sulla mappa.</span>';
    return h;
  }
  function mapHtml(id, key) { return '<div class="mapwrap mac"><svg id="' + id + '" role="img" aria-label="Terrazze: tocca per scegliere"></svg><div class="zoom"><button data-act="zin" data-k="' + key + '" aria-label="Ingrandisci">+</button><button data-act="zout" data-k="' + key + '" aria-label="Rimpicciolisci">−</button><button data-act="zfit" data-k="' + key + '" aria-label="Adatta" style="font-size:13px">⤢</button></div></div>'; }

  /* ---------------- calcolo botte: parte alta (macchina e terrazze) ---------------- */
  function calcHeadHtml(vs) {
    var m = calcMac(), h = '';
    if (list().length) {
      h += '<div class="row" role="group" aria-label="Macchina del calcolo" style="gap:6px">' + list().map(function (x) { return '<button class="btn sm" data-mc="calc" data-id="' + x.id + '" aria-pressed="' + (UI().botMac === x.id) + '"><span class="dot" style="background:' + x.c + '"></span>' + esc(x.n) + '</button>'; }).join("") + '<button class="btn sm" data-mc="calc" data-id="" aria-pressed="' + !UI().botMac + '">Scelta libera</button></div>';
      if (m) {
        var ch = changedToday();
        h += '<span class="small">Botte da <b>' + Math.round(m.tank) + ' L</b> · <b>' + Math.round(m.water) + ' L/ha</b> (dati di ' + esc(m.n) + ', si cambiano in Macchine)</span>';
        if (ch) h += '<div class="row" style="gap:8px"><span class="small" style="color:var(--warn)">Scelta cambiata per oggi (' + ch + (ch === 1 ? ' terrazza' : ' terrazze') + '): le terrazze della macchina non cambiano.</span><button class="btn sm" data-mc="resetToday">Torna alle terrazze della macchina</button></div>';
        h += mapHtml("botmap", Q.vmapKeyFor("bot")) + '<span class="small muted">Tocca una terrazza per aggiungerla o toglierla solo per oggi.</span>';
      }
    }
    return h;
  }

  /* ---------------- mappe ---------------- */
  function drawMap(svg, key, colorOf) {
    var vs = Q.vignes().filter(Q.inTer), V = Q.views();
    if (!V[key] && vs.length) { var all = []; vs.forEach(function (p) { all = all.concat(p.pts); }); var b = Q.bbox(all); Q.fitView(key, b, Math.max(4, (b.x1 - b.x0 + b.y1 - b.y0) * 0.04)); }
    if (!V[key]) return;
    var v = Q.vbOf(key), k = v.w / ((svg.getBoundingClientRect().width) || 360), out = '';
    svg.setAttribute("viewBox", v.x + " " + v.y + " " + v.w + " " + v.h);
    vs.forEach(function (p) {
      var c = colorOf(p);
      out += '<polygon points="' + p.pts.map(function (q) { return q.join(","); }).join(" ") + '" fill="' + c.f + '" fill-opacity="' + c.o + '" stroke="' + c.s + '" stroke-width="' + (c.w || 1.2) + '"' + (c.d ? ' stroke-dasharray="4 3"' : '') + ' vector-effect="non-scaling-stroke"/>';
    });
    vs.forEach(function (p) { var b = Q.bbox(p.pts); if ((b.x1 - b.x0) / k < 14 && (b.y1 - b.y0) / k < 14) return; var lp = Q.labelPt(p.pts); out += '<text x="' + lp[0] + '" y="' + (lp[1] + 4 * k) + '" font-size="' + 12 * k + '" text-anchor="middle" font-weight="700" fill="var(--ink)" stroke="var(--surface)" stroke-width="' + 3 * k + '" paint-order="stroke" pointer-events="none">' + esc(short(p)) + '</text>'; });
    svg.innerHTML = out;
  }
  function hitPlot(pt) { var vs = Q.vignes().filter(Q.inTer); for (var i = 0; i < vs.length; i++) if (Q.pip(pt, vs[i].pts)) return vs[i]; return null; }
  function after() {
    var s1 = $("#macmap"), s2 = $("#botmap");
    if (s1 && UI().macSel) {
      var key = Q.vmapKeyFor("mac"), cur = byId(UI().macSel);
      drawMap(s1, key, function (p) { var ms = macsOf(p.id); if (!ms.length) return { f: "#888780", o: 0.12, s: "#888780", d: 1 }; if (ms.length > 1) return { f: "#E24B4A", o: 0.4, s: "#E24B4A", w: 2.5 }; var on = cur && ms[0].id === cur.id; return { f: ms[0].c, o: on ? 0.65 : 0.3, s: ms[0].c, w: on ? 2.5 : 1.2 }; });
      Q.bindPan(s1, key, function (pt) { var p = hitPlot(pt), m = byId(UI().macSel); if (!p || !m) return; m.plots = m.plots || {}; if (m.plots[p.id]) delete m.plots[p.id]; else m.plots[p.id] = true; Q.save(); Q.render(); });
    }
    if (s2 && calcMac()) {
      var key2 = Q.vmapKeyFor("bot"), m2 = calcMac();
      drawMap(s2, key2, function (p) { return inCalc(p) ? { f: m2.c, o: 0.6, s: m2.c, w: 2.5 } : { f: "#888780", o: 0.08, s: "#B4B2A9" }; });
      Q.bindPan(s2, key2, function (pt) { var p = hitPlot(pt); if (!p) return; toggleCalc(p.id); Q.save(); Q.render(); });
    }
  }

  /* ---------------- pulsanti ---------------- */
  function readForm() { var f = UI().macForm; if (!f) return; var n = $("#mcN"), t = $("#mcTank"), w = $("#mcWater"); if (n) f.n = n.value.trim(); if (t) f.tank = num(t.value) || 0; if (w) f.water = num(w.value) || 0; }
  function act(a, b) {
    var ui = UI(), id = b.getAttribute("data-id");
    if (a !== "del") ui.confirm = null;
    readForm();
    if (a === "new") ui.macForm = { id: null, n: "", tank: +S().botte.tank || 300, water: +S().botte.water || 1000, c: COLORS[list().length % COLORS.length] };
    else if (a === "edit") { var m = byId(id); if (m) ui.macForm = { id: m.id, n: m.n, tank: m.tank, water: m.water, c: m.c }; }
    else if (a === "color") ui.macForm.c = b.getAttribute("data-v");
    else if (a === "cancel") ui.macForm = null;
    else if (a === "save") {
      var f = ui.macForm;
      if (!f.n) { Q.toast("Scrivi il nome della macchina"); return; }
      if (!(f.tank > 0) || !(f.water > 0)) { Q.toast("Controlla capienza della botte e litri per ettaro"); return; }
      var m2 = f.id ? byId(f.id) : null;
      if (m2) { m2.n = f.n; m2.tank = f.tank; m2.water = f.water; m2.c = f.c; }
      else { m2 = { id: Q.uid(), n: f.n, tank: f.tank, water: f.water, c: f.c, plots: {} }; list().push(m2); ui.macSel = m2.id; }
      ui.macForm = null; Q.save(); Q.toast(f.id ? "Macchina salvata" : "Macchina aggiunta: ora tocca le sue terrazze sulla mappa");
    }
    else if (a === "del") {
      if (ui.confirm !== "mcDel") { ui.confirm = "mcDel"; Q.render(); return; }
      S().macchine = list().filter(function (x) { return x.id !== ui.macForm.id; }); if (ui.macSel === ui.macForm.id) ui.macSel = null; if (ui.botMac === ui.macForm.id) ui.botMac = null;
      ui.macForm = null; ui.confirm = null; Q.save(); Q.toast("Macchina eliminata");
    }
    else if (a === "assign") ui.macSel = ui.macSel === id ? null : id;
    else if (a === "assignEnd") ui.macSel = null;
    else if (a === "allTer") { var m3 = byId(ui.macSel); if (!m3) return; var n = 0; m3.plots = m3.plots || {}; Q.vignes().filter(Q.inTer).forEach(function (p) { if (!macsOf(p.id).length) { m3.plots[p.id] = true; n++; } }); Q.save(); Q.toast(n ? n + (n === 1 ? " terrazza data a " : " terrazze date a ") + m3.n : "Nessuna terrazza senza macchina"); }
    else if (a === "calc") { ui.botMac = id || null; try { localStorage.setItem("qo-botmac", ui.botMac || ""); } catch (e) {} }
    else if (a === "resetToday") oggi().t = {};
    Q.render();
  }
  document.addEventListener("click", function (e) { var b = e.target.closest("[data-mc]"); if (!b) return; e.preventDefault(); act(b.getAttribute("data-mc"), b); });

  /* macchina del calcolo ricordata sul dispositivo */
  try { var bm = localStorage.getItem("qo-botmac"); if (bm) UI().botMac = bm; } catch (e) {}

  window.QOMac = {
    machinesHtml: machinesHtml, calcHeadHtml: calcHeadHtml, after: after,
    inCalc: inCalc, toggleCalc: toggleCalc, setAll: setAll, water: water, tank: tank, calcMac: calcMac,
    hasForm: function () { return !!UI().macForm; }, closeForm: function () { UI().macForm = null; },
    assigning: function () { return !!UI().macSel; }, endAssign: function () { UI().macSel = null; }
  };
})();

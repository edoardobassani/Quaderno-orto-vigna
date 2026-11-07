/* Magazzino: articoli, lotti e movimenti.
   La giacenza non si scrive mai a mano: è la somma dei movimenti (acquisti, scarichi, rettifiche).
   Così più persone possono caricare e scaricare anche senza rete senza sovrascriversi. */
(function () {
  "use strict";
  var Q = window.QO;
  if (!Q) return;

  var CATS = [["difesa", "Difesa"], ["concimi", "Concimi"], ["sementi", "Sementi e piantine"], ["barbatelle", "Barbatelle"], ["materiali", "Materiali"], ["carburante", "Carburante"], ["cantina", "Cantina"]];
  var CATN = {}; CATS.forEach(function (c) { CATN[c[0]] = c[1]; });
  var UNITS = ["kg", "L", "pz", "m", "rotoli", "conf"];
  var KIND = { acquisto: "Acquisto", trattamento: "Trattamento", uso: "Scarico", rettifica: "Conteggio", reso: "Reso", rimpiazzo: "Rimpiazzo fallanze" };
  var NEED_DAYS = 14, EXP_DAYS = 60;
  var V = { cat: "", item: null, form: null, confirm: null, openShop: false, inv: null, unknown: null };

  /* ---------------- dati ---------------- */
  function S() { return Q.getState(); }
  function inv() { var s = S(); if (!s.inv) s.inv = { items: [], moves: [] }; return s.inv; }
  function item(id) { return inv().items.find(function (i) { return i.id === id; }); }
  function movesOf(id) { return inv().moves.filter(function (m) { return m.item === id; }); }
  function byDate(a, b) { return a.date < b.date ? -1 : a.date > b.date ? 1 : (a.at || 0) - (b.at || 0); }
  function stock(id) { return round(movesOf(id).reduce(function (s, m) { return s + (+m.qty || 0); }, 0)); }
  function round(x) { return Math.round(x * 1000) / 1000; }
  function avgPrice(id) { var q = 0, c = 0; movesOf(id).forEach(function (m) { if (m.kind === "acquisto" && m.qty > 0 && m.price > 0) { q += m.qty; c += m.qty * m.price; } }); return q ? c / q : 0; }
  function lots(id) {
    var ms = movesOf(id).slice().sort(byDate), L = {}, order = [], free = 0;
    ms.forEach(function (m) { if (m.qty > 0) { var k = m.lot || ""; if (!L[k]) { L[k] = { lot: m.lot || "", exp: m.exp || "", qty: 0, first: m.date }; order.push(k); } L[k].qty += m.qty; if (m.exp && !L[k].exp) L[k].exp = m.exp; } });
    ms.forEach(function (m) { if (m.qty < 0) { if (m.lot && L[m.lot]) L[m.lot].qty += m.qty; else free -= m.qty; } });
    var arr = order.map(function (k) { return L[k]; }).sort(function (a, b) { var ea = a.exp || "9999", eb = b.exp || "9999"; return ea < eb ? -1 : ea > eb ? 1 : a.first < b.first ? -1 : 1; });
    arr.forEach(function (l) { if (free <= 0) return; var t = Math.min(Math.max(l.qty, 0), free); l.qty -= t; free -= t; });
    return arr.filter(function (l) { return l.qty > 1e-6; }).map(function (l) { l.qty = round(l.qty); return l; });
  }
  function itemFor(prod) { return inv().items.find(function (i) { return i.prod === prod; }); }
  function doseFor(prod, it) { var b = S().botte; if (b && b.prod === prod && b.dose > 0 && (b.unit || "kg") === it.unit) return +b.dose; return +it.dose || 0; }
  function ha(plot) { return Q.area(plot.pts) / 1e4; }
  function fq(q, it) { return Q.num(q, 2) + " " + (it ? it.unit : ""); }
  function me() { return (window.QOSync && window.QOSync.userName && window.QOSync.userName()) || ""; }
  function addMove(m) { m.id = Q.uid(); m.at = Date.now(); m.da = me(); inv().moves.push(m); return m; }

  function planNeeds(days) {
    var out = {}, end = Q.addDays(Q.today(), days);
    S().plans.forEach(function (pl) {
      var it = itemFor(pl.prod), plot = Q.plotById(pl.plot); if (!it || !plot) return;
      var d = Q.nextDue(pl), left = pl.count - pl.done.length, n = 0;
      while (d && d <= end && n < left) { n++; d = Q.addDays(d, pl.every); }
      if (n) out[it.id] = (out[it.id] || 0) + n * doseFor(pl.prod, it) * ha(plot);
    });
    return out;
  }
  /* barbatelle che servono per le fallanze segnate, per articolo */
  function fallNeeds() {
    var out = {};
    S().plots.forEach(function (p) {
      if (!p.vine) return; var it = barbItemFor(p); if (!it) return;
      var f = Object.keys(p.vine.marks || {}).filter(function (k) { return p.vine.marks[k] === "f"; }).length;
      if (f) out[it.id] = (out[it.id] || 0) + f;
    });
    return out;
  }
  function allNeeds() { var a = planNeeds(NEED_DAYS), b = fallNeeds(), out = {}; Object.keys(a).forEach(function (k) { out[k] = { q: a[k], t: true }; }); Object.keys(b).forEach(function (k) { out[k] = out[k] || { q: 0 }; out[k].q += b[k]; out[k].f = b[k]; }); return out; }
  function needWhy(n) { return n.t && n.f ? "i trattamenti dei prossimi " + NEED_DAYS + " giorni e le fallanze da rimpiazzare" : n.f ? "le fallanze da rimpiazzare" : "i trattamenti dei prossimi " + NEED_DAYS + " giorni"; }
  function barbItemFor(p) {
    var list = inv().items.filter(function (i) { return i.cat === "barbatelle"; }); if (!list.length || !p.vine) return null;
    if (p.vine.barb) { var x = item(p.vine.barb); if (x) return x; }
    var v = (p.vine.varieta || "").toLowerCase().trim();
    return (v && list.find(function (i) { return i.name.toLowerCase().indexOf(v) >= 0; })) || list[0];
  }
  function alerts() {
    var a = [], need = allNeeds(), lim = Q.iso(Q.addDays(Q.today(), EXP_DAYS)), now = Q.iso(Q.today());
    inv().items.forEach(function (it) {
      var s = stock(it.id), nd = need[it.id], n = nd ? nd.q : 0;
      if (n > 0 && s < n) a.push({ lvl: 2, it: it, t: it.name + ": ne mancano " + fq(n - s, it), d: "Hai " + fq(s, it) + ", per " + needWhy(nd) + " ne servono " + fq(n, it) });
      else if (s < 0) a.push({ lvl: 2, it: it, t: it.name + ": giacenza negativa", d: "Registra l'acquisto mancante o fai un conteggio" });
      else if (it.min > 0 && s < it.min) a.push({ lvl: 1, it: it, t: it.name + ": sotto la scorta minima", d: "Hai " + fq(s, it) + ", minimo " + fq(it.min, it) });
      lots(it.id).forEach(function (l) {
        if (!l.exp || l.exp > lim) return;
        var past = l.exp < now;
        a.push({ lvl: past ? 2 : 1, it: it, t: it.name + (past ? " scaduto il " : " scade il ") + Q.fmt(Q.parse(l.exp)), d: (l.lot ? "Lotto " + l.lot + ", " : "") + fq(l.qty, it) + " rimasti" });
      });
    });
    return a.sort(function (x, y) { return y.lvl - x.lvl; });
  }
  function shopping() {
    var need = allNeeds(), out = [];
    inv().items.forEach(function (it) { var s = stock(it.id), target = Math.max(+it.min || 0, need[it.id] ? need[it.id].q : 0), q = round(target - s); if (q > 0) out.push({ it: it, q: q, cost: q * avgPrice(it.id) }); });
    return out;
  }
  function lastMove(id) { var m = movesOf(id).sort(byDate); return m[m.length - 1]; }
  function lastPurchase(id) { var m = movesOf(id).filter(function (x) { return x.kind === "acquisto"; }).sort(byDate); return m[m.length - 1]; }
  function value() { return inv().items.reduce(function (s, it) { return s + Math.max(0, stock(it.id)) * avgPrice(it.id); }, 0); }

  /* ---------------- vista elenco ---------------- */
  function esc(s) { return Q.esc(s == null ? "" : s); }
  function barHtml(it) {
    var s = stock(it.id), mn = +it.min || 0, max = Math.max(mn * 2, s, 1), pc = Math.max(0, Math.min(100, s / max * 100));
    var cls = s < mn || s < 0 ? "x" : s < mn * 1.5 ? "w" : "";
    return '<div class="bar" style="margin:6px 0"><span class="' + cls + '" style="width:' + pc + '%"></span></div>';
  }
  function viewList() {
    if (V.inv) return invoiceHtml();
    var items = inv().items, al = alerts(), sh = shopping();
    var h = '<div class="top"><div><div class="eyebrow">' + items.length + ' articoli · valore ' + Q.eur(value()) + '</div><h1>Magazzino</h1></div><button class="btn primary" data-iv="newItem">Nuovo articolo</button></div>';
    h += '<div class="row" style="margin-bottom:12px"><label class="btn filebtn" for="ivInvFile">Importa fattura<input id="ivInvFile" type="file" accept=".xml,.p7m,application/xml,text/xml,application/pkcs7-mime"></label><button class="btn" data-iv="scan">Scansiona codice</button></div>';
    if (V.unknown) h += unknownHtml();
    if (V.form && V.form.type === "item" && !V.form.id) h += itemForm();
    al.forEach(function (a) {
      h += '<button class="item" data-iv="open" data-id="' + a.it.id + '" style="background:' + (a.lvl === 2 ? 'var(--bad-bg)' : 'var(--warn-bg)') + ';color:' + (a.lvl === 2 ? 'var(--bad)' : 'var(--warn)') + ';margin-bottom:8px;display:block"><b>' + esc(a.t) + '</b><br><span class="small">' + esc(a.d) + '</span></button>';
    });
    if (sh.length) {
      var tot = sh.reduce(function (s, x) { return s + x.cost; }, 0);
      h += '<details class="panel" id="ivShop"' + (V.openShop ? ' open' : '') + ' style="margin-bottom:12px"><summary><span style="flex:1">Da comprare</span><span class="badge b-n">' + sh.length + '</span></summary><div class="stack" style="gap:6px;margin-top:8px">';
      sh.forEach(function (x) { h += '<div class="row" style="justify-content:space-between"><span>' + esc(x.it.name) + '</span><span class="mono small">' + fq(x.q, x.it) + (x.cost ? ' · ~' + Q.eur(x.cost) : '') + '</span></div>'; });
      h += (tot ? '<span class="small muted">Spesa stimata con i prezzi medi pagati: ' + Q.eur(tot) + '</span>' : '') + '<div><button class="btn sm" data-iv="copyShop">Copia la lista</button></div></div></details>';
    }
    if (!items.length) return h + '<div class="panel stack"><b>Il magazzino è vuoto</b><span>Aggiungi i prodotti che tieni in azienda: per quelli di difesa collega la scheda della Libreria, così i trattamenti fatti li scalano da soli.</span></div>';
    h += '<div class="row" style="margin-bottom:10px">' + [["", "Tutto"]].concat(CATS).filter(function (c) { return !c[0] || items.some(function (i) { return i.cat === c[0]; }); }).map(function (c) { return '<button class="chip" data-iv="cat" data-v="' + c[0] + '" aria-pressed="' + (V.cat === c[0]) + '">' + c[1] + '</button>'; }).join("") + '</div>';
    var list = items.filter(function (i) { return !V.cat || i.cat === V.cat; }).sort(function (a, b) { return a.name.localeCompare(b.name, "it"); });
    h += '<div class="list">';
    list.forEach(function (it) {
      var s = stock(it.id), lm = lastMove(it.id), pl = lm && lm.plot && Q.plotById(lm.plot), fn = it.cat === "barbatelle" ? (fallNeeds()[it.id] || 0) : 0;
      h += '<button class="item" data-iv="open" data-id="' + it.id + '" style="display:block"><div class="row" style="justify-content:space-between;flex-wrap:nowrap"><b style="min-width:0">' + esc(it.name) + '</b><span class="mono">' + fq(s, it) + '</span></div>' + barHtml(it) +
        '<span class="small muted">' + CATN[it.cat] + (it.min ? ' · scorta minima ' + fq(it.min, it) : '') + (fn ? ' · fallanze da rimpiazzare: ' + fn : '') + (lm ? ' · ultimo movimento ' + Q.fmt(Q.parse(lm.date)) + (pl ? ', ' + esc(pl.name) : '') : '') + '</span></button>';
    });
    return h + '</div>';
  }

  /* ---------------- vista articolo ---------------- */
  function viewItem(it) {
    var s = stock(it.id), ap = avgPrice(it.id), ls = lots(it.id), ms = movesOf(it.id).sort(byDate).reverse(), prod = it.prod && Q.products().find(function (p) { return p.id === it.prod; });
    var h = '<div class="top"><div style="min-width:0"><div class="eyebrow">' + CATN[it.cat] + '</div><h1 style="overflow-wrap:anywhere">' + esc(it.name) + '</h1></div><button class="btn sm" data-iv="back">Elenco</button></div>';
    h += '<div class="panel stack"><div class="kv"><div><span>Giacenza</span><b>' + fq(s, it) + '</b></div><div><span>Prezzo medio</span><b>' + (ap ? Q.eur(ap) + '/' + esc(it.unit) : '–') + '</b></div><div><span>Valore</span><b>' + (ap ? Q.eur(Math.max(0, s) * ap) : '–') + '</b></div></div>' + barHtml(it);
    if (prod) h += '<span class="small">Collegato a <b>' + esc(prod.name) + '</b>' + (it.dose ? ', dose di riferimento ' + Q.num(+it.dose, 2) + ' ' + esc(it.unit) + '/ha' : '') + (it.cu ? ', rame metallo ' + Q.num(+it.cu, 1) + '%' : '') + '. I trattamenti fatti lo scalano da soli.</span>';
    if (it.note) h += '<span class="small muted">' + esc(it.note) + '</span>';
    h += '<div class="row"><button class="btn primary" data-iv="form" data-v="acquisto">Acquisto</button><button class="btn" data-iv="form" data-v="uso">Scarico</button><button class="btn" data-iv="form" data-v="conta">Conteggio</button><button class="btn sm" data-iv="form" data-v="item">Modifica</button></div></div>';
    if (V.form) h += '<div style="margin-top:10px">' + (V.form.type === "item" ? itemForm() : moveForm(it)) + '</div>';
    if (ls.length) {
      h += '<h2 style="margin:16px 0 8px">Lotti in magazzino</h2><div class="panel tablebox"><table class="reg"><thead><tr><th>Lotto</th><th>Scadenza</th><th>Quantità</th></tr></thead><tbody>' +
        ls.map(function (l) { return '<tr><td>' + esc(l.lot || "senza lotto") + '</td><td class="mono">' + (l.exp ? Q.fmt(Q.parse(l.exp)) : '–') + '</td><td class="mono">' + fq(l.qty, it) + '</td></tr>'; }).join("") + '</tbody></table></div>';
    }
    h += '<h2 style="margin:16px 0 8px">Movimenti</h2>';
    if (!ms.length) h += '<div class="panel muted">Nessun movimento: registra il primo acquisto o un conteggio.</div>';
    else {
      h += '<div class="panel stack" style="gap:0;padding:4px 14px">';
      ms.forEach(function (m, i) {
        var plot = m.plot && Q.plotById(m.plot), up = m.qty > 0;
        var desc = KIND[m.kind] + (plot ? ' · ' + esc(plot.name) : '') + (m.supplier ? ' · ' + esc(m.supplier) : '') + (m.lot ? ' · lotto ' + esc(m.lot) : '') + (m.da ? ' · ' + esc(m.da) : '');
        h += '<div class="row" style="flex-wrap:nowrap;padding:9px 0;' + (i ? 'border-top:1px solid var(--line);' : '') + 'align-items:flex-start"><span aria-hidden="true" style="color:' + (up ? 'var(--accent)' : m.kind === "rettifica" ? 'var(--ink-2)' : 'var(--bad)') + ';font-weight:700;width:14px">' + (up ? '+' : '−') + '</span><div style="flex:1;min-width:0"><div class="small">' + desc + '</div><div class="small muted">' + Q.fmt(Q.parse(m.date)) + (m.price ? ' · ' + Q.eur(m.price) + '/' + esc(it.unit) : '') + (m.note ? ' · ' + esc(m.note) : '') + '</div></div><span class="mono small" style="white-space:nowrap">' + (up ? '+' : '') + Q.num(m.qty, 2) + '</span><button class="btn sm" data-iv="delMove" data-id="' + m.id + '" aria-label="Elimina movimento" style="min-height:32px;padding:0 8px">' + (V.confirm === m.id ? 'Elimina' : '×') + '</button></div>';
      });
      h += '</div><p class="small muted">Eliminare uno scarico da trattamento corregge il magazzino ma non toglie il trattamento: per quello usa "Annulla ultimo" nella sezione Trattamenti.</p>';
    }
    return h;
  }

  /* ---------------- moduli ---------------- */
  function opt(list, val) { return list.map(function (o) { var v = Array.isArray(o) ? o[0] : o, t = Array.isArray(o) ? o[1] : o; return '<option value="' + esc(v) + '"' + (String(v) === String(val) ? ' selected' : '') + '>' + esc(t) + '</option>'; }).join(""); }
  function itemForm() {
    var f = V.form, prods = Q.products(), cp = prods.find(function (p) { return p.id === f.prod; });
    var h = '<div class="panel stack" style="border:2px solid var(--accent)"><h2>' + (f.id ? 'Modifica articolo' : 'Nuovo articolo') + '</h2><div class="grid2">';
    h += '<label class="f" style="grid-column:1/-1">Nome<input id="ivName" value="' + esc(f.name) + '" placeholder="Rame ossicloruro 35% WG"></label>';
    h += '<label class="f">Categoria<select id="ivCat">' + opt(CATS, f.cat) + '</select></label><label class="f">Unità<select id="ivUnit">' + opt(UNITS, f.unit) + '</select></label>';
    h += '<label class="f">Scorta minima<input id="ivMin" type="number" inputmode="decimal" step="any" value="' + (f.min || "") + '"></label>';
    h += '<label class="f">Prodotto della Libreria<select id="ivProd">' + opt([["", "Nessuno"]].concat(prods.map(function (p) { return [p.id, p.name]; })), f.prod) + '</select></label>';
    if (f.prod) h += '<label class="f">Dose per ettaro (' + esc(f.unit) + '/ha)<input id="ivDose" type="number" inputmode="decimal" step="any" value="' + (f.dose || "") + '"></label>';
    if (cp && cp.copper) h += '<label class="f">Rame metallo nel prodotto (%)<input id="ivCu" type="number" inputmode="decimal" step="any" value="' + (f.cu || "") + '"></label>';
    h += '<label class="f" style="grid-column:1/-1">Codici a barre<span class="row" style="flex-wrap:nowrap;gap:6px"><input id="ivCodes" value="' + esc((f.codes || []).join(", ")) + '" placeholder="8001234567890" inputmode="numeric"><button class="btn sm" data-iv="scanForm" type="button">Scansiona</button></span></label>';
    h += '<label class="f" style="grid-column:1/-1">Note<input id="ivNote" value="' + esc(f.note || "") + '"></label></div>';
    if (f.prod) h += '<span class="small muted">La dose serve a precompilare lo scarico quando segni un trattamento come fatto. Se hai usato il calcolo della botte con lo stesso prodotto, vale quella dose.</span>';
    h += '<div class="row"><button class="btn primary" data-iv="saveItem">Salva</button><button class="btn" data-iv="cancel">Annulla</button>' + (f.id ? '<button class="btn danger" data-iv="delItem">' + (V.confirm === "item" ? 'Tocca ancora: elimina anche i movimenti' : 'Elimina articolo') + '</button>' : '') + '</div></div>';
    return h;
  }
  function plotOptions(val) { return opt([["", "Nessuno"]].concat(S().plots.map(function (p) { return [p.id, p.name]; })), val); }
  function lotOptions(it, val) { return opt([["", "Automatico (prima il più vecchio)"]].concat(lots(it.id).map(function (l) { return [l.lot, (l.lot || "senza lotto") + " · " + fq(l.qty, it) + (l.exp ? " · scade " + Q.fmt(Q.parse(l.exp)) : "")]; }).filter(function (o) { return o[0]; })), val); }
  function moveForm(it) {
    var f = V.form, h = '<div class="panel stack" style="border:2px solid var(--accent)">';
    if (f.type === "acquisto") {
      var lp = lastPurchase(it.id);
      h += '<div class="row" style="justify-content:space-between"><h2>Acquisto</h2>' + (lp ? '<span class="small muted">precompilato dall\'ultimo acquisto</span>' : '') + '</div><div class="grid2">';
      h += '<label class="f">Data<input id="ivDate" type="date" value="' + f.date + '"></label><label class="f">Quantità (' + esc(it.unit) + ')<input id="ivQty" type="number" inputmode="decimal" step="any" value="' + (f.qty || "") + '"></label>';
      h += '<label class="f">Prezzo per ' + esc(it.unit) + ' (€, IVA esclusa)<input id="ivPrice" type="number" inputmode="decimal" step="any" value="' + (f.price || "") + '"></label><label class="f">Fornitore<input id="ivSup" value="' + esc(f.supplier || "") + '"></label>';
      h += '<label class="f">Lotto<input id="ivLot" value="' + esc(f.lot || "") + '"></label><label class="f">Scadenza<input id="ivExp" type="date" value="' + esc(f.exp || "") + '"></label></div>';
      h += '<div class="row"><button class="btn primary" data-iv="saveMove">Registra acquisto</button><button class="btn" data-iv="cancel">Annulla</button></div>';
    } else if (f.type === "uso") {
      h += '<h2>Scarico</h2><span class="small muted">Per usi che non sono trattamenti: gasolio, legacci, materiali di cantina, concimazioni.</span><div class="grid2">';
      h += '<label class="f">Data<input id="ivDate" type="date" value="' + f.date + '"></label><label class="f">Quantità (' + esc(it.unit) + ')<input id="ivQty" type="number" inputmode="decimal" step="any"></label>';
      h += '<label class="f">Appezzamento<select id="ivPlot">' + plotOptions("") + '</select></label><label class="f">Lotto<select id="ivLotSel">' + lotOptions(it, "") + '</select></label>';
      h += '<label class="f" style="grid-column:1/-1">Nota<input id="ivNote2" placeholder="Imbottigliamento Sangiovese 2025"></label></div>';
      h += '<div class="row"><button class="btn primary" data-iv="saveMove">Registra scarico</button><button class="btn" data-iv="cancel">Annulla</button></div>';
    } else if (f.type === "conta") {
      h += '<h2>Conteggio</h2><span class="small">Scrivi quanto c\'è davvero in magazzino: l\'app registra la differenza con la giacenza calcolata (' + fq(stock(it.id), it) + ').</span><div class="grid2">';
      h += '<label class="f">Data<input id="ivDate" type="date" value="' + f.date + '"></label><label class="f">Quantità contata (' + esc(it.unit) + ')<input id="ivQty" type="number" inputmode="decimal" step="any"></label></div>';
      h += '<div class="row"><button class="btn primary" data-iv="saveMove">Registra conteggio</button><button class="btn" data-iv="cancel">Annulla</button></div>';
    }
    return h + '</div>';
  }

  /* ---------------- scarico al trattamento fatto ---------------- */
  function doneFormHtml(pl, plot) {
    var it = itemFor(pl.prod), d = doseFor(pl.prod, it), h_ = ha(plot), q = round(d * h_), s = stock(it.id), cands = inv().items.filter(function (i) { return i.prod === pl.prod; });
    var h = '<div class="panel stack" style="background:var(--surface-2);gap:8px"><b>Scarico dal magazzino</b><span class="small muted">' + Q.num(h_, 2) + ' ha' + (d ? ' · dose ' + Q.num(d, 2) + ' ' + esc(it.unit) + '/ha' : ' · dose non indicata nell\'articolo') + '</span><div class="grid2">';
    if (cands.length > 1) h += '<label class="f" style="grid-column:1/-1">Articolo<select id="ivDoneItem">' + opt(cands.map(function (c) { return [c.id, c.name + " (" + fq(stock(c.id), c) + ")"]; }), it.id) + '</select></label>';
    h += '<label class="f">Quantità usata (' + esc(it.unit) + ')<input id="ivDoneQty" type="number" inputmode="decimal" step="any" value="' + (q || "") + '"></label><label class="f">Lotto<select id="ivDoneLot">' + lotOptions(it, "") + '</select></label></div>';
    h += '<span class="small">In magazzino: ' + fq(s, it) + (q ? ', dopo lo scarico ' + fq(s - q, it) : '') + '.</span>';
    h += '<div class="row"><button class="btn sm primary" data-iv="doneOk" data-id="' + pl.id + '">Conferma e scarica</button><button class="btn sm" data-iv="doneSkip" data-id="' + pl.id + '">Solo registro</button><button class="btn sm" data-iv="doneCancel">Annulla</button></div></div>';
    return h;
  }
  function finishDone(pl, withMove) {
    var date = Q.iso(Q.today()), plot = Q.plotById(pl.plot);
    if (withMove) {
      var sel = document.getElementById("ivDoneItem"), it = sel ? item(sel.value) : itemFor(pl.prod), q = parseFloat(String(document.getElementById("ivDoneQty").value).replace(",", "."));
      if (!(q > 0)) { Q.toast("Scrivi la quantità usata"); return; }
      addMove({ item: it.id, kind: "trattamento", qty: -round(q), date: date, plan: pl.id, plot: pl.plot, lot: document.getElementById("ivDoneLot").value || "" });
    }
    pl.done.push(date); Q.ui.doneFor = null; Q.save();
    var c = Q.carenzaFor(pl.prod, plot).days;
    Q.toast((withMove ? "Registrato e scaricato." : "Registrato.") + (c ? " Non raccogliere fino a " + Q.fmt(Q.addDays(Q.today(), c)) : ""));
    Q.render();
  }

  /* ---------------- azioni ---------------- */
  function num(id) { var el = document.getElementById(id); return el ? parseFloat(String(el.value).replace(",", ".")) : NaN; }
  function str(id) { var el = document.getElementById(id); return el ? el.value.trim() : ""; }
  function readItemForm() { var f = V.form; f.name = str("ivName"); f.cat = str("ivCat") || f.cat; f.unit = str("ivUnit") || f.unit; f.min = num("ivMin") || 0; f.prod = str("ivProd"); if (document.getElementById("ivDose")) f.dose = num("ivDose") || 0; if (document.getElementById("ivCu")) f.cu = num("ivCu") || 0; f.note = str("ivNote"); if (document.getElementById("ivCodes")) f.codes = str("ivCodes").split(/[\s,;]+/).filter(Boolean); }
  function act(a, b) {
    var id = b.getAttribute("data-id"), v = b.getAttribute("data-v");
    if (a !== "delMove" && a !== "delItem" && a !== "replAll") V.confirm = null;
    switch (a) {
      case "newItem": V.item = null; V.form = { type: "item", name: "", cat: V.cat || "difesa", unit: "kg", min: 0, prod: "", dose: 0, cu: 0, note: "" }; break;
      case "open": V.item = id; V.form = null; window.scrollTo(0, 0); break;
      case "back": V.item = null; V.form = null; break;
      case "cat": V.cat = v || ""; break;
      case "cancel": V.form = null; break;
      case "form": {
        var it = item(V.item), t = v, today = Q.iso(Q.today());
        if (t === "item") V.form = Object.assign({ type: "item" }, it);
        else if (t === "acquisto") { var lp = lastPurchase(it.id); V.form = { type: t, date: today, qty: lp ? lp.qty : "", price: lp ? lp.price : "", supplier: lp ? lp.supplier : "" }; }
        else V.form = { type: t, date: today };
        break;
      }
      case "saveItem": {
        readItemForm(); var f = V.form;
        if (!f.name) { Q.toast("Dai un nome all'articolo"); return; }
        var data = { name: f.name, cat: f.cat, unit: f.unit, min: f.min, prod: f.prod, dose: f.prod ? f.dose : 0, cu: f.cu || 0, note: f.note, codes: f.codes || [] };
        if (f.id) Object.assign(item(f.id), data); else { data.id = Q.uid(); inv().items.push(data); V.item = data.id; }
        V.form = null; Q.save(); Q.toast("Articolo salvato"); break;
      }
      case "delItem": {
        if (V.confirm !== "item") { V.confirm = "item"; break; }
        var did = V.form.id; inv().items = inv().items.filter(function (x) { return x.id !== did; }); inv().moves = inv().moves.filter(function (m) { return m.item !== did; });
        V.form = null; V.item = null; V.confirm = null; Q.save(); Q.toast("Articolo eliminato"); break;
      }
      case "saveMove": {
        var it2 = item(V.item), f2 = V.form, q = num("ivQty"), date = str("ivDate") || Q.iso(Q.today());
        if (f2.type === "conta") {
          if (!isFinite(q) || q < 0) { Q.toast("Scrivi la quantità contata"); return; }
          var diff = round(q - stock(it2.id)); if (!diff) { Q.toast("Il conteggio coincide con la giacenza"); V.form = null; break; }
          addMove({ item: it2.id, kind: "rettifica", qty: diff, date: date, note: "Contati " + Q.num(q, 2) + " " + it2.unit });
        } else {
          if (!(q > 0)) { Q.toast("Scrivi una quantità maggiore di zero"); return; }
          if (f2.type === "acquisto") addMove({ item: it2.id, kind: "acquisto", qty: round(q), date: date, price: num("ivPrice") || 0, supplier: str("ivSup"), lot: str("ivLot"), exp: str("ivExp") });
          else addMove({ item: it2.id, kind: "uso", qty: -round(q), date: date, plot: str("ivPlot"), lot: str("ivLotSel"), note: str("ivNote2") });
        }
        V.form = null; Q.save(); Q.toast("Movimento registrato"); break;
      }
      case "delMove": {
        if (V.confirm !== id) { V.confirm = id; break; }
        inv().moves = inv().moves.filter(function (m) { return m.id !== id; }); V.confirm = null; Q.save(); break;
      }
      case "copyShop": {
        var t2 = "Da comprare:\n" + shopping().map(function (x) { return "- " + x.it.name + ": " + fq(x.q, x.it); }).join("\n");
        if (navigator.clipboard && navigator.clipboard.writeText) navigator.clipboard.writeText(t2).then(function () { Q.toast("Lista copiata"); }, function () { Q.toast("Copia non riuscita"); }); else Q.toast("Copia non disponibile qui");
        return;
      }
      case "doneOk": finishDone(S().plans.find(function (p) { return p.id === id; }), true); return;
      case "doneSkip": finishDone(S().plans.find(function (p) { return p.id === id; }), false); return;
      case "doneCancel": Q.ui.doneFor = null; break;
      case "replAll": {
        var vp = Q.plotById(id); if (!vp || !vp.vine) return;
        if (V.confirm !== "repl-" + id) { V.confirm = "repl-" + id; break; }
        V.confirm = null; replace(vp, Object.keys(vp.vine.marks).filter(function (k) { return vp.vine.marks[k] === "f"; })); return;
      }
      case "scan": scanCode(function (code) { var it3 = itemByCode(code); if (it3) { V.item = it3.id; V.unknown = null; V.form = null; Q.toast("Trovato: " + it3.name); } else { V.unknown = code; V.item = null; } Q.ui.tab = "magazzino"; Q.render(); }); return;
      case "scanForm": readItemForm(); scanCode(function (code) { V.form.codes = (V.form.codes || []).concat(code).filter(function (c, i, a) { return a.indexOf(c) === i; }); Q.render(); }); return;
      case "codeLink": { var sel = document.getElementById("ivCodeItem"), it4 = sel && item(sel.value); if (!it4) { Q.toast("Scegli l'articolo"); return; } it4.codes = (it4.codes || []).concat(V.unknown); V.unknown = null; V.item = it4.id; Q.save(); Q.toast("Codice associato a " + it4.name); break; }
      case "codeNew": V.form = { type: "item", name: "", cat: "difesa", unit: "kg", min: 0, prod: "", dose: 0, cu: 0, note: "", codes: [V.unknown] }; V.unknown = null; V.item = null; break;
      case "codeCancel": V.unknown = null; break;
      case "invCancel": V.inv = null; break;
      case "invOk": readInvForm(); commitInvoice(); return;
    }
    Q.render();
  }
  document.addEventListener("click", function (e) { var b = e.target.closest("[data-iv]"); if (!b) return; e.preventDefault(); act(b.getAttribute("data-iv"), b); });
  document.addEventListener("change", function (e) {
    var t = e.target;
    if (t.id === "ivProd" || t.id === "ivUnit") { readItemForm(); Q.render(); }
    if (t.id === "ivInvFile" && t.files && t.files[0]) { loadInvoice(t.files[0]); }
    if (V.inv && /^ivL-\d+$/.test(t.id)) { readInvForm(); var li = V.inv.lines[+t.id.slice(4)]; if (li.item && li.item !== "_new") li.factor = guessFactor(li, item(li.item)); Q.render(); }
    if (t.id === "ivDoneItem") { var pl = S().plans.find(function (p) { return p.id === Q.ui.doneFor; }), it = item(t.value), plot = pl && Q.plotById(pl.plot); if (it && plot) { var q = document.getElementById("ivDoneQty"); if (q) q.value = round(doseFor(pl.prod, it) * ha(plot)) || ""; } }
  });
  document.addEventListener("toggle", function (e) { if (e.target && e.target.id === "ivShop") V.openShop = e.target.open; }, true);

  /* ---------------- dati di esempio (solo in modalità locale) ---------------- */
  function seed() {
    var s = S();
    if (s.inv || !Q.isLocal() || !s.plots.some(function (p) { return p.id === "v1"; })) { inv(); return; }
    var t = Q.today(), d = function (n) { return Q.iso(Q.addDays(t, n)); }, NOTE = "Dati di esempio";
    var items = [
      { id: "ir", name: "Rame ossicloruro 35% WG", cat: "difesa", unit: "kg", min: 20, prod: "rame", dose: 3, cu: 35 },
      { id: "iz", name: "Zolfo bagnabile 80%", cat: "difesa", unit: "kg", min: 10, prod: "zolfo", dose: 5 },
      { id: "ib", name: "Bacillus thuringiensis", cat: "difesa", unit: "kg", min: 1, prod: "bt", dose: 1 },
      { id: "ik", name: "Bicarbonato di potassio", cat: "difesa", unit: "kg", min: 5, prod: "bicarb", dose: 5 },
      { id: "il", name: "Letame pellettato", cat: "concimi", unit: "kg", min: 100 },
      { id: "iv", name: "Barbatelle Sangiovese su 1103P", cat: "barbatelle", unit: "pz", min: 20 },
      { id: "ig", name: "Legacci biodegradabili", cat: "materiali", unit: "rotoli", min: 2 },
      { id: "id", name: "Gasolio agricolo", cat: "carburante", unit: "L", min: 50 },
      { id: "it", name: "Tappi in sughero 45 mm", cat: "cantina", unit: "pz", min: 500 },
      { id: "im", name: "Metabisolfito di potassio", cat: "cantina", unit: "kg", min: 1 }
    ];
    items.forEach(function (i) { i.note = NOTE; if (!i.prod) { i.prod = ""; i.dose = 0; } i.cu = i.cu || 0; });
    s.inv = { items: items, moves: [] };
    var A = function (it, n, q, price, sup, lot, exp) { addMove({ item: it, kind: "acquisto", qty: q, date: d(n), price: price, supplier: sup, lot: lot || "", exp: exp ? d(exp) : "" }); };
    A("ir", -200, 10, 9.5, "Consorzio agrario", "23F088", 500); A("ir", -120, 10, 9.8, "Consorzio agrario", "24C011", 620);
    A("iz", -190, 25, 2.2, "Consorzio agrario", "Z2311", 700);
    A("ib", -160, 3, 45, "Agrisementi", "24B117", 23);
    A("ik", -150, 5, 8, "Agrisementi", "BK07", 400);
    A("il", -210, 500, 0.35, "Consorzio agrario");
    A("iv", -40, 60, 1.6, "Vivai Rauscedo", "B25-118");
    A("ig", -180, 6, 6.5, "Ferramenta agricola");
    A("id", -60, 400, 1.15, "Distributore carburanti");
    A("it", -100, 3000, 0.18, "Enoforniture");
    A("im", -90, 2, 6, "Enoforniture", "MB25", 500);
    addMove({ item: "ig", kind: "uso", qty: -3, date: d(-170), note: "Legatura dopo potatura" });
    addMove({ item: "id", kind: "uso", qty: -330, date: d(-20), note: "Lavorazioni e trattamenti" });
    addMove({ item: "it", kind: "uso", qty: -2400, date: d(-30), note: "Imbottigliamento" });
    addMove({ item: "il", kind: "uso", qty: -350, plot: "v1", date: d(-150), note: "Concimazione di fondo" });
    s.plans.forEach(function (pl) {
      var it = itemFor(pl.prod), plot = Q.plotById(pl.plot); if (!it || !plot) return;
      pl.done.forEach(function (dt) { addMove({ item: it.id, kind: "trattamento", qty: -round(it.dose * ha(plot)), date: dt, plan: pl.id, plot: pl.plot }); });
    });
    s.inv.moves.forEach(function (m) { m.da = ""; });
    Q.save();
  }

  /* ---------------- rimpiazzo delle fallanze ---------------- */
  function replace(p, keys) {
    if (!keys.length) { Q.toast("Non ci sono fallanze da rimpiazzare"); return; }
    var it = barbItemFor(p);
    keys.forEach(function (k) { p.vine.marks[k] = "n"; });
    var note = keys.length === 1 ? (function (a) { return "Filare " + (+a[0] + 1) + ", ceppo " + (+a[2] + 1); })(keys[0].split(":")) : keys.length + " ceppi";
    if (it) addMove({ item: it.id, kind: "rimpiazzo", qty: -keys.length, date: Q.iso(Q.today()), plot: p.id, note: note });
    Q.save(); Q.render();
    Q.toast(keys.length === 1 ? note + ": rimpiazzato" + (it ? ", scalata 1 barbatella" : "") : keys.length + " ceppi rimpiazzati" + (it ? ", scalate " + keys.length + " barbatelle" : ""));
  }
  function barbHtml(p, st) {
    var it = barbItemFor(p), h = '<div class="sep"></div>';
    if (!it) return h + '<span class="small muted">Aggiungi le barbatelle in Magazzino (categoria Barbatelle): i rimpiazzi le scaleranno da sole.</span>';
    var s = stock(it.id);
    h += '<span class="small">Barbatelle per i rimpiazzi: <b>' + esc(it.name) + '</b>, in magazzino ' + fq(s, it) + (st.f > s ? ' <span style="color:var(--bad)">(non bastano per le ' + st.f + ' fallanze)</span>' : '') + '.</span>';
    if (st.f) h += '<div><button class="btn sm primary" data-iv="replAll" data-id="' + p.id + '">' + (V.confirm === "repl-" + p.id ? 'Tocca ancora: rimpiazza ' + st.f + ' e scala ' + st.f + ' barbatelle' : 'Rimpiazza tutte le fallanze (' + st.f + ')') + '</button></div>';
    return h;
  }
  function barbOptions(sel) {
    return opt([["", "Scegli in base alla varietà"]].concat(inv().items.filter(function (i) { return i.cat === "barbatelle"; }).map(function (i) { return [i.id, i.name + " (" + fq(stock(i.id), i) + ")"]; })), sel || "");
  }

  /* ---------------- codici a barre ---------------- */
  var ZXING = "https://unpkg.com/@zxing/library@0.21.3/umd/index.min.js";
  function itemByCode(code) { return inv().items.find(function (i) { return (i.codes || []).indexOf(code) >= 0; }); }
  function loadScript(url, ok) { return ok() ? Promise.resolve() : new Promise(function (res, rej) { var sc = document.createElement("script"); sc.src = url; sc.onload = function () { ok() ? res() : rej(new Error("lettore non disponibile")); }; sc.onerror = function () { rej(new Error("serve la connessione la prima volta per scaricare il lettore")); }; document.head.appendChild(sc); }); }
  function scanCode(cb) {
    var ov = document.createElement("div"); ov.className = "sheet"; ov.setAttribute("role", "dialog"); ov.setAttribute("aria-label", "Lettura del codice a barre");
    ov.innerHTML = '<div class="stack"><b>Inquadra il codice a barre</b><video id="ivVideo" playsinline muted autoplay style="width:100%;max-height:55vh;border-radius:12px;background:#000;object-fit:cover"></video><span class="small" id="ivScanMsg">Avvio la fotocamera…</span><button class="btn" type="button" id="ivScanClose">Annulla</button></div>';
    document.body.appendChild(ov);
    var video = ov.querySelector("video"), msgEl = ov.querySelector("#ivScanMsg"), stream = null, reader = null, done = false, timer = null;
    function stop() { done = true; clearTimeout(timer); if (reader) { try { reader.reset(); } catch (e) {} } if (stream) stream.getTracks().forEach(function (t) { t.stop(); }); ov.remove(); }
    function found(code) { if (done) return; stop(); if (navigator.vibrate) navigator.vibrate(60); cb(String(code).trim()); }
    function fail(e) { msgEl.textContent = e && e.name === "NotAllowedError" ? "Permesso della fotocamera negato: attivalo nelle impostazioni del browser per questo sito." : "Non riesco a usare la fotocamera: " + ((e && e.message) || e); }
    ov.querySelector("#ivScanClose").onclick = stop;
    var cons = { video: { facingMode: { ideal: "environment" } }, audio: false };
    if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) { fail(new Error("fotocamera non disponibile in questo browser")); return; }
    var native = "BarcodeDetector" in window ? window.BarcodeDetector.getSupportedFormats().catch(function () { return []; }) : Promise.resolve([]);
    native.then(function (fmts) {
      var want = ["ean_13", "ean_8", "upc_a", "upc_e", "code_128", "code_39", "itf", "qr_code", "data_matrix"].filter(function (f) { return fmts.indexOf(f) >= 0; });
      if (want.length) {
        var det = new window.BarcodeDetector({ formats: want });
        return navigator.mediaDevices.getUserMedia(cons).then(function (st) {
          stream = st; video.srcObject = st; return video.play();
        }).then(function () {
          msgEl.textContent = "Tieni il codice dentro l'inquadratura.";
          (function loop() { if (done) return; det.detect(video).then(function (c) { if (c.length) found(c[0].rawValue); else timer = setTimeout(loop, 200); }).catch(function () { timer = setTimeout(loop, 300); }); })();
        });
      }
      return loadScript(ZXING, function () { return !!window.ZXing; }).then(function () {
        if (done) return;
        reader = new window.ZXing.BrowserMultiFormatReader();
        msgEl.textContent = "Tieni il codice dentro l'inquadratura.";
        return reader.decodeFromConstraints(cons, video, function (res) { if (res) found(res.getText()); });
      });
    }).catch(fail);
  }
  function unknownHtml() {
    var items = inv().items.slice().sort(function (a, b) { return a.name.localeCompare(b.name, "it"); });
    var h = '<div class="panel stack" style="border:2px solid var(--serra);margin-bottom:12px"><b>Codice ' + esc(V.unknown) + ' non associato</b><span class="small">Associalo a un articolo: la prossima volta che lo scansioni, l\'app apre direttamente quell\'articolo.</span>';
    if (items.length) h += '<label class="f">Articolo<select id="ivCodeItem">' + opt(items.map(function (i) { return [i.id, i.name]; }), "") + '</select></label><div class="row"><button class="btn primary" data-iv="codeLink">Associa</button><button class="btn" data-iv="codeNew">Crea articolo</button><button class="btn sm" data-iv="codeCancel">Annulla</button></div>';
    else h += '<div class="row"><button class="btn primary" data-iv="codeNew">Crea articolo</button><button class="btn sm" data-iv="codeCancel">Annulla</button></div>';
    return h + '</div>';
  }

  /* ---------------- fattura elettronica (FatturaPA, .xml o .xml.p7m) ---------------- */
  function bytesToStr(b) { var s = "", CH = 8192; for (var i = 0; i < b.length; i += CH) s += String.fromCharCode.apply(null, b.subarray(i, i + CH)); return s; }
  function strToBytes(s) { var b = new Uint8Array(s.length); for (var i = 0; i < s.length; i++) b[i] = s.charCodeAt(i) & 255; return b; }
  function decodeXml(bin) {
    var enc = /encoding\s*=\s*["']([^"']+)["']/i.exec(bin.slice(0, 200)), name = enc ? enc[1].toLowerCase() : "utf-8";
    try { return new TextDecoder(/8859|1252|latin/.test(name) ? "windows-1252" : "utf-8").decode(strToBytes(bin)); } catch (e) { return bin; }
  }
  function extractXml(buf) {
    var bin = bytesToStr(new Uint8Array(buf)).replace(/^﻿|^\xEF\xBB\xBF/, "");
    if (/^\s*</.test(bin)) return decodeXml(bin);
    // p7m in base64 (testo)
    if (/^[\sA-Za-z0-9+\/=]+$/.test(bin.slice(0, 2000))) { try { bin = atob(bin.replace(/\s+/g, "")); } catch (e) {} }
    var start = bin.search(/<\?xml|<([\w-]+:)?FatturaElettronica[\s>]/), endRe = /<\/([\w-]+:)?FatturaElettronica\s*>/g, m, last = null;
    while ((m = endRe.exec(bin))) last = m;
    if (start < 0 || !last) throw new Error("nel file non c'è una fattura elettronica");
    var xml = bin.slice(start, last.index + last[0].length);
    // nei .p7m il contenuto può essere spezzato in blocchi con intestazioni binarie: si tolgono
    xml = xml.replace(/\x04\x82[\s\S][\s\S]|\x04\x81[\s\S]/g, "");
    return decodeXml(xml);
  }
  function tagIn(el, name) { if (!el) return null; var n = el.getElementsByTagNameNS("*", name); if (!n.length) n = el.getElementsByTagName(name); return n.length ? n[0] : null; }
  function tagsIn(el, name) { var n = el.getElementsByTagNameNS("*", name); if (!n.length) n = el.getElementsByTagName(name); return Array.prototype.slice.call(n); }
  function txt(el, name) { var t = tagIn(el, name); return t ? t.textContent.trim() : ""; }
  function normKey(s) { return String(s || "").toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_|_$/g, "").slice(0, 120); }
  function parseInvoice(xml) {
    var doc = new DOMParser().parseFromString(xml, "application/xml");
    if (doc.getElementsByTagName("parsererror").length) throw new Error("il file XML non è leggibile");
    var ced = tagIn(doc, "CedentePrestatore");
    if (!ced) throw new Error("il file non sembra una fattura elettronica");
    var sup = txt(ced, "Denominazione") || (txt(ced, "Nome") + " " + txt(ced, "Cognome")).trim(), piva = txt(tagIn(ced, "IdFiscaleIVA"), "IdCodice") || txt(ced, "CodiceFiscale");
    var out = [];
    tagsIn(doc, "FatturaElettronicaBody").forEach(function (body) {
      var dg = tagIn(body, "DatiGeneraliDocumento");
      var inv_ = { supplier: sup, piva: piva, date: txt(dg, "Data"), number: txt(dg, "Numero"), type: txt(dg, "TipoDocumento"), lines: [] };
      tagsIn(body, "DettaglioLinee").forEach(function (l) {
        var qs = txt(l, "Quantita"), q = qs ? parseFloat(qs) : 1, pt = parseFloat(txt(l, "PrezzoTotale")), pu = parseFloat(txt(l, "PrezzoUnitario")), code = "";
        tagsIn(l, "CodiceArticolo").forEach(function (c) { if (!code) code = txt(c, "CodiceValore"); });
        inv_.lines.push({ desc: txt(l, "Descrizione"), code: code, qty: isFinite(q) ? q : 1, um: txt(l, "UnitaMisura"), total: isFinite(pt) ? pt : (isFinite(pu) ? pu * q : 0), hasQty: !!qs, tipo: txt(l, "TipoCessionePrestazione") });
      });
      out.push(inv_);
    });
    if (!out.length) throw new Error("la fattura non contiene righe");
    return out;
  }
  function mapKey(inv_, l) { return normKey(inv_.piva || inv_.supplier) + "__" + normKey(l.code || l.desc); }
  function unitOf(um) { var u = (um || "").toLowerCase().replace(/\./g, ""); return /^(kg|kgm|chilogramm)/.test(u) ? "kg" : /^(l|lt|litr)/.test(u) ? "L" : /^(m|mt|metr)$/.test(u) ? "m" : /^(rot)/.test(u) ? "rotoli" : /^(conf|cf)/.test(u) ? "conf" : "pz"; }
  function guessFactor(l, it) {
    if (!it) return 1;
    var lu = unitOf(l.um); if (lu === it.unit) return 1;
    var m = /(\d+(?:[.,]\d+)?)\s*(kg|lt|l)\b/i.exec(l.desc);
    if (m) { var u = /^k/i.test(m[2]) ? "kg" : "L"; if (u === it.unit) return parseFloat(m[1].replace(",", ".")); }
    return 1;
  }
  function loadInvoice(file) {
    var r = new FileReader();
    r.onload = function () {
      try {
        var invs = parseInvoice(extractXml(r.result)), maps = inv().maps || {}, items = inv().items;
        var all = { files: [], lines: [] };
        invs.forEach(function (iv) {
          all.files.push({ supplier: iv.supplier, piva: iv.piva, date: iv.date, number: iv.number, type: iv.type, key: normKey(iv.piva + "_" + iv.number + "_" + iv.date) });
          iv.lines.forEach(function (l) {
            var k = mapKey(iv, l), mp = maps[k], it = mp && item(mp.item);
            l.key = k; l.date = iv.date; l.supplier = iv.supplier; l.number = iv.number; l.credit = iv.type === "TD04";
            if (it) { l.item = it.id; l.factor = mp.factor || 1; l.remembered = true; }
            else if (!l.hasQty || l.tipo || !(l.total > 0)) { l.item = ""; l.factor = 1; }
            else { l.item = "_new"; l.factor = 1; var gu = /(\d+(?:[.,]\d+)?)\s*(kg|lt|l)\b/i.exec(l.desc); l.newUnit = gu ? (/^k/i.test(gu[2]) ? "kg" : "L") : unitOf(l.um); if (gu && l.newUnit !== unitOf(l.um)) l.factor = parseFloat(gu[1].replace(",", ".")); l.newCat = "difesa"; l.newName = l.desc; }
            all.lines.push(l);
          });
        });
        var done_ = inv().fatture || [];
        all.dup = all.files.filter(function (f) { return done_.some(function (d) { return d.key === f.key; }); });
        V.inv = all; V.item = null; V.form = null; window.scrollTo(0, 0); Q.render();
      } catch (e) { Q.toast("Fattura non letta: " + (e.message || e)); }
    };
    r.onerror = function () { Q.toast("Non riesco a leggere il file"); };
    r.readAsArrayBuffer(file);
  }
  function invoiceHtml() {
    var I = V.inv, f0 = I.files[0], items = inv().items.slice().sort(function (a, b) { return a.name.localeCompare(b.name, "it"); });
    var h = '<div class="top"><div style="min-width:0"><div class="eyebrow">Fattura elettronica</div><h1 style="overflow-wrap:anywhere">' + esc(f0.supplier || "Fornitore") + '</h1></div><button class="btn sm" data-iv="invCancel">Annulla</button></div>';
    h += '<div class="panel stack" style="margin-bottom:12px"><span>' + I.files.map(function (f) { return 'Fattura n. ' + esc(f.number) + ' del ' + (f.date ? Q.fmt(Q.parse(f.date)) : '–') + (f.type === "TD04" ? ' (nota di credito)' : ''); }).join("<br>") + '</span><span class="small muted">Abbina ogni riga a un articolo del magazzino. L\'app si ricorda gli abbinamenti per le prossime fatture di questo fornitore.</span>';
    if (I.dup.length) h += '<span class="small" style="color:var(--bad)"><b>Attenzione:</b> questa fattura risulta già caricata. Se la carichi di nuovo, le quantità si sommano due volte.</span>';
    if (I.files.some(function (f) { return f.type === "TD04"; })) h += '<span class="small" style="color:var(--warn)">È una nota di credito: le righe abbinate vengono tolte dal magazzino come reso.</span>';
    h += '</div><div class="list">';
    I.lines.forEach(function (l, i) {
      var it = l.item && l.item !== "_new" ? item(l.item) : null, unitP = l.item ? (l.total / Math.max(1e-9, l.qty * (l.factor || 1))) : 0;
      h += '<div class="panel stack" style="gap:8px"><div class="row" style="justify-content:space-between;align-items:flex-start;flex-wrap:nowrap"><b style="min-width:0;overflow-wrap:anywhere">' + esc(l.desc) + '</b><span class="mono small" style="white-space:nowrap">' + Q.num(l.qty, 3) + ' ' + esc(l.um || "") + ' · ' + Q.eur(l.total) + '</span></div>';
      if (l.remembered) h += '<span class="badge b-ok" style="align-self:flex-start">abbinamento ricordato</span>';
      h += '<label class="f">Articolo del magazzino<select id="ivL-' + i + '">' + opt([["", "Non caricare (spese, trasporto, servizi)"], ["_new", "Nuovo articolo"]].concat(items.map(function (x) { return [x.id, x.name]; })), l.item) + '</select></label>';
      if (l.item === "_new") h += '<div class="grid2"><label class="f" style="grid-column:1/-1">Nome<input id="ivNN-' + i + '" value="' + esc(l.newName || l.desc) + '"></label><label class="f">Categoria<select id="ivNC-' + i + '">' + opt(CATS, l.newCat) + '</select></label><label class="f">Unità<select id="ivNU-' + i + '">' + opt(UNITS, l.newUnit) + '</select></label></div>';
      if (l.item) {
        var u = it ? it.unit : l.newUnit;
        h += '<div class="grid2"><label class="f">1 ' + esc(l.um || "unità") + ' in fattura = ' + esc(u) + '<input id="ivF-' + i + '" type="number" inputmode="decimal" step="any" value="' + (l.factor || 1) + '"></label><div class="small" style="align-self:end;padding-bottom:10px">Carico: <b class="mono">' + Q.num(l.qty * (l.factor || 1), 2) + ' ' + esc(u) + '</b><br>' + Q.eur(unitP) + '/' + esc(u) + '</div>';
        h += '<label class="f">Lotto<input id="ivLL-' + i + '" value="' + esc(l.lot || "") + '"></label><label class="f">Scadenza<input id="ivLE-' + i + '" type="date" value="' + esc(l.exp || "") + '"></label></div>';
      }
      h += '</div>';
    });
    h += '</div><div class="row" style="margin-top:12px"><button class="btn primary" data-iv="invOk">Carica in magazzino</button><button class="btn" data-iv="invCancel">Annulla</button></div><p class="small muted">I prezzi sono quelli della fattura, IVA esclusa, già scontati.</p>';
    return h;
  }
  function readInvForm() {
    if (!V.inv) return;
    V.inv.lines.forEach(function (l, i) {
      var g = function (id) { var el = document.getElementById(id); return el ? el.value : null; };
      if (g("ivL-" + i) != null) l.item = g("ivL-" + i);
      if (g("ivNN-" + i) != null) l.newName = g("ivNN-" + i).trim();
      if (g("ivNC-" + i) != null) l.newCat = g("ivNC-" + i);
      if (g("ivNU-" + i) != null) l.newUnit = g("ivNU-" + i);
      if (g("ivF-" + i) != null) { var fv = parseFloat(String(g("ivF-" + i)).replace(",", ".")); l.factor = fv > 0 ? fv : 1; }
      if (g("ivLL-" + i) != null) l.lot = g("ivLL-" + i).trim();
      if (g("ivLE-" + i) != null) l.exp = g("ivLE-" + i);
    });
  }
  function commitInvoice() {
    var I = V.inv, maps = inv().maps = inv().maps || {}, n = 0;
    I.lines.forEach(function (l) {
      if (!l.item) return;
      var it = l.item === "_new" ? null : item(l.item);
      if (!it) { it = { id: Q.uid(), name: l.newName || l.desc, cat: l.newCat || "difesa", unit: l.newUnit || "pz", min: 0, prod: "", dose: 0, cu: 0, note: "", codes: [] }; inv().items.push(it); }
      var q = round(l.qty * (l.factor || 1)); if (!(q > 0)) return;
      var credit = l.credit, price = l.total / q;
      addMove({ item: it.id, kind: credit ? "reso" : "acquisto", qty: credit ? -q : q, date: l.date || Q.iso(Q.today()), price: credit ? 0 : Math.round(price * 10000) / 10000, supplier: l.supplier, lot: credit ? "" : (l.lot || ""), exp: credit ? "" : (l.exp || ""), note: "Fattura n. " + l.number });
      maps[l.key] = { item: it.id, factor: l.factor || 1 }; n++;
    });
    inv().fatture = (inv().fatture || []).concat(I.files.map(function (f) { return { key: f.key, number: f.number, date: f.date, supplier: f.supplier, loaded: Q.iso(Q.today()) }; })).slice(-300);
    V.inv = null; Q.save(); Q.toast(n ? n + (n === 1 ? " riga caricata" : " righe caricate") + " in magazzino" : "Nessuna riga caricata"); Q.render();
  }

  /* ---------------- interfaccia per il resto dell'app ---------------- */
  window.QOInv = {
    view: function () { var it = V.item && item(V.item); if (V.item && !it) V.item = null; return it ? viewItem(it) : viewList(); },
    needsForm: function (pl) { return !!itemFor(pl.prod); },
    doneFormHtml: doneFormHtml,
    onUndo: function (pl, date) { var ms = inv().moves, i = ms.findIndex(function (m) { return m.plan === pl.id && m.date === date && m.kind === "trattamento"; }); if (i >= 0) ms.splice(i, 1); },
    moveFor: function (planId, date) {
      var m = inv().moves.find(function (x) { return x.plan === planId && x.date === date && x.kind === "trattamento"; }); if (!m) return null;
      var it = item(m.item); return { qty: -m.qty, unit: it ? it.unit : "", cost: it ? -m.qty * avgPrice(it.id) : 0 };
    },
    cuFor: function (pl, date, plot) {
      var m = inv().moves.find(function (x) { return x.plan === pl.id && x.date === date && x.kind === "trattamento"; }); if (!m) return null;
      var it = item(m.item); if (!it || !(it.cu > 0) || it.unit !== "kg") return null;
      var a = ha(plot); return a ? -m.qty * it.cu / 100 / a : null;
    },
    replace: replace, barbHtml: barbHtml, barbOptions: barbOptions, scanCode: scanCode,
    alertsList: function () { return alerts().map(function (a) { return { lvl: a.lvl, t: a.t, d: a.d, id: a.it.id }; }); },
    open: function (id) { V.item = id; V.form = null; V.inv = null; V.unknown = null; },
    alertsCount: function () { return alerts().filter(function (a) { return a.lvl === 2; }).length; }
  };
  seed();
  Q.render();
})();

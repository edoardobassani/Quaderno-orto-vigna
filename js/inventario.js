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
  var KIND = { acquisto: "Acquisto", trattamento: "Trattamento", uso: "Scarico", rettifica: "Conteggio", reso: "Reso" };
  var NEED_DAYS = 14, EXP_DAYS = 60;
  var V = { cat: "", item: null, form: null, confirm: null, openShop: false };

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
  function alerts() {
    var a = [], need = planNeeds(NEED_DAYS), lim = Q.iso(Q.addDays(Q.today(), EXP_DAYS)), now = Q.iso(Q.today());
    inv().items.forEach(function (it) {
      var s = stock(it.id), n = need[it.id] || 0;
      if (n > 0 && s < n) a.push({ lvl: 2, it: it, t: it.name + ": ne mancano " + fq(n - s, it), d: "Hai " + fq(s, it) + ", i trattamenti dei prossimi " + NEED_DAYS + " giorni ne useranno " + fq(n, it) });
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
    var need = planNeeds(NEED_DAYS), out = [];
    inv().items.forEach(function (it) { var s = stock(it.id), target = Math.max(+it.min || 0, need[it.id] || 0), q = round(target - s); if (q > 0) out.push({ it: it, q: q, cost: q * avgPrice(it.id) }); });
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
    var items = inv().items, al = alerts(), sh = shopping();
    var h = '<div class="top"><div><div class="eyebrow">' + items.length + ' articoli · valore ' + Q.eur(value()) + '</div><h1>Magazzino</h1></div><button class="btn primary" data-iv="newItem">Nuovo articolo</button></div>';
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
      var s = stock(it.id), lm = lastMove(it.id), pl = lm && lm.plot && Q.plotById(lm.plot);
      h += '<button class="item" data-iv="open" data-id="' + it.id + '" style="display:block"><div class="row" style="justify-content:space-between;flex-wrap:nowrap"><b style="min-width:0">' + esc(it.name) + '</b><span class="mono">' + fq(s, it) + '</span></div>' + barHtml(it) +
        '<span class="small muted">' + CATN[it.cat] + (it.min ? ' · scorta minima ' + fq(it.min, it) : '') + (lm ? ' · ultimo movimento ' + Q.fmt(Q.parse(lm.date)) + (pl ? ', ' + esc(pl.name) : '') : '') + '</span></button>';
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
  function readItemForm() { var f = V.form; f.name = str("ivName"); f.cat = str("ivCat") || f.cat; f.unit = str("ivUnit") || f.unit; f.min = num("ivMin") || 0; f.prod = str("ivProd"); if (document.getElementById("ivDose")) f.dose = num("ivDose") || 0; if (document.getElementById("ivCu")) f.cu = num("ivCu") || 0; f.note = str("ivNote"); }
  function act(a, b) {
    var id = b.getAttribute("data-id"), v = b.getAttribute("data-v");
    if (a !== "delMove" && a !== "delItem") V.confirm = null;
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
        var data = { name: f.name, cat: f.cat, unit: f.unit, min: f.min, prod: f.prod, dose: f.prod ? f.dose : 0, cu: f.cu || 0, note: f.note };
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
    }
    Q.render();
  }
  document.addEventListener("click", function (e) { var b = e.target.closest("[data-iv]"); if (!b) return; e.preventDefault(); act(b.getAttribute("data-iv"), b); });
  document.addEventListener("change", function (e) {
    var t = e.target;
    if (t.id === "ivProd" || t.id === "ivUnit") { readItemForm(); Q.render(); }
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
    alertsCount: function () { return alerts().filter(function (a) { return a.lvl === 2; }).length; }
  };
  seed();
  Q.render();
})();

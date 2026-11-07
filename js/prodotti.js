/* Prodotti inseriti a mano nella Libreria, anche partendo dal codice a barre.
   Si salvano in S.customProducts e diventano prodotti come gli altri (trattamenti, magazzino, registro).
   Le etichette dei fitosanitari non sono disponibili gratis in formato leggibile da un'app:
   dal codice a barre si prova a trovare il nome in Open Products Facts e si aprono le ricerche dell'etichetta. */
(function () {
  "use strict";
  var Q = window.QO;
  if (!Q) return;

  var KINDS = ["Fungicida", "Insetticida", "Acaricida", "Fungicida e insetticida", "Elicitore", "Corroborante", "Sostanza di base", "Biodinamico", "Concime fogliare", "Altro"];
  var DISEASES = [["peronospora", "Peronospora"], ["oidio", "Oidio"], ["botrite", "Botrite"]];
  var MINISTERO = "https://www.fitosanitari.salute.gov.it/fitosanitariws_new/FitosanitariServlet";
  var V = { form: null, confirm: null, open: null, msg: "" };

  function S() { return Q.getState(); }
  function C() { var s = S(); if (!s.customProducts) s.customProducts = {}; return s.customProducts; }
  function esc(x) { return Q.esc(x == null ? "" : x); }
  function str(id) { var el = document.getElementById(id); return el ? el.value.trim() : ""; }
  function numOrNull(id) { var v = str(id).replace(",", "."); if (v === "") return null; var n = parseFloat(v); return isFinite(n) && n >= 0 ? n : null; }
  function chk(id) { var el = document.getElementById(id); return !!(el && el.checked); }
  function searchUrl(q) { return "https://www.google.com/search?q=" + encodeURIComponent(q + " etichetta pdf"); }

  function blank() { return { id: null, n: "", kind: "Fungicida", bio: true, tgt: [], other: "", e1: 7, e2: 14, car: null, carV: null, copper: false, rainWash: true, maxAll: null, reg: "", maker: "", url: "", codes: [], notes: "" }; }
  function fromProduct(k) {
    var P = Q.product(k), f = blank();
    f.n = P.n + " (mia etichetta)"; f.kind = KINDS.find(function (x) { return P.kind && P.kind.indexOf(x) === 0; }) || "Altro";
    f.tgt = P.tgt.filter(function (t) { return DISEASES.some(function (d) { return d[0] === t; }); });
    f.other = P.tgt.filter(function (t) { return !DISEASES.some(function (d) { return d[0] === t; }); }).join(", ");
    f.e1 = P.every[0]; f.e2 = P.every[1]; f.copper = !!P.copper; f.rainWash = !!P.rainWash;
    if (typeof P.car === "number") f.car = P.car; else if (P.car) { f.car = P.car._ != null ? P.car._ : null; f.carV = P.car.vite != null ? P.car.vite : null; }
    f.notes = (P.notes || []).join("\n");
    return f;
  }
  function readForm() {
    var f = V.form; if (!f) return;
    f.n = str("prName"); f.kind = str("prKind") || f.kind; f.bio = chk("prBio");
    f.tgt = DISEASES.filter(function (d) { return chk("prT-" + d[0]); }).map(function (d) { return d[0]; });
    f.other = str("prOther"); f.e1 = numOrNull("prE1"); f.e2 = numOrNull("prE2");
    f.car = numOrNull("prCar"); f.carV = numOrNull("prCarV");
    f.copper = chk("prCu"); f.rainWash = chk("prRain"); f.maxAll = numOrNull("prMax");
    f.reg = str("prReg"); f.maker = str("prMaker"); f.url = str("prUrl");
    f.codes = str("prCodes").split(/[\s,;]+/).filter(Boolean); f.notes = (document.getElementById("prNotes") || {}).value || "";
  }

  /* ---------------- interfaccia ---------------- */
  function headHtml() {
    var h = '<div class="row" style="margin-bottom:12px"><button class="btn primary" data-pr="new">Nuovo prodotto</button><button class="btn" data-pr="scan">Scansiona codice</button></div>';
    if (V.msg) h += '<div class="panel small" role="status" style="margin-bottom:12px">' + V.msg + '</div>';
    if (V.form) h += formHtml();
    return h;
  }
  function formHtml() {
    var f = V.form, q = f.n || (f.codes[0] || "");
    var h = '<div class="panel stack" style="border:2px solid var(--accent);margin-bottom:12px"><h2>' + (f.id ? 'Modifica prodotto' : 'Nuovo prodotto') + '</h2>';
    h += '<span class="small muted">Copia i dati dall\'etichetta del tuo prodotto. Lascia vuota la carenza se non la conosci: l\'app scriverà "da etichetta".</span>';
    h += '<div class="grid2"><label class="f" style="grid-column:1/-1">Nome commerciale<input id="prName" value="' + esc(f.n) + '" placeholder="Nome sulla confezione"></label>';
    h += '<label class="f">Tipo<select id="prKind">' + KINDS.map(function (k) { return '<option' + (k === f.kind ? ' selected' : '') + '>' + k + '</option>'; }).join("") + '</select></label>';
    h += '<label class="f">Produttore<input id="prMaker" value="' + esc(f.maker) + '"></label>';
    h += '<label class="f">N. di registrazione<input id="prReg" value="' + esc(f.reg) + '" inputmode="numeric"></label>';
    h += '<label class="f">Massimo di passaggi l\'anno<input id="prMax" type="number" inputmode="numeric" value="' + (f.maxAll == null ? "" : f.maxAll) + '"></label>';
    h += '<label class="f">Intervallo minimo (gg)<input id="prE1" type="number" inputmode="numeric" value="' + (f.e1 == null ? "" : f.e1) + '"></label><label class="f">Intervallo massimo (gg)<input id="prE2" type="number" inputmode="numeric" value="' + (f.e2 == null ? "" : f.e2) + '"></label>';
    h += '<label class="f">Carenza vite (gg)<input id="prCarV" type="number" inputmode="numeric" value="' + (f.carV == null ? "" : f.carV) + '" placeholder="da etichetta"></label><label class="f">Carenza altre colture (gg)<input id="prCar" type="number" inputmode="numeric" value="' + (f.car == null ? "" : f.car) + '" placeholder="da etichetta"></label></div>';
    h += '<div class="stack" style="gap:6px"><span class="small" style="font-weight:600">Contro</span><div class="row">' + DISEASES.map(function (d) { return '<label class="row small"><input type="checkbox" id="prT-' + d[0] + '"' + (f.tgt.indexOf(d[0]) >= 0 ? ' checked' : '') + '> ' + d[1] + '</label>'; }).join("") + '</div>';
    h += '<label class="f">Altre avversità, separate da virgola<input id="prOther" value="' + esc(f.other) + '" placeholder="tignole, afidi, tripidi"></label></div>';
    h += '<div class="stack" style="gap:6px"><label class="row small"><input type="checkbox" id="prBio"' + (f.bio ? ' checked' : '') + '> Ammesso in agricoltura biologica</label><label class="row small"><input type="checkbox" id="prCu"' + (f.copper ? ' checked' : '') + '> Contiene rame (conta nel limite di 4 kg/ha l\'anno)</label><label class="row small"><input type="checkbox" id="prRain"' + (f.rainWash ? ' checked' : '') + '> Si dilava con la pioggia (avviso oltre 20 mm)</label></div>';
    h += '<label class="f">Codici a barre<span class="row" style="flex-wrap:nowrap;gap:6px"><input id="prCodes" value="' + esc(f.codes.join(", ")) + '" inputmode="numeric"><button class="btn sm" type="button" data-pr="scanForm">Scansiona</button></span></label>';
    h += '<label class="f">Link all\'etichetta o alla scheda tecnica<input id="prUrl" value="' + esc(f.url) + '" type="url" placeholder="https://…"></label>';
    h += '<label class="f">Note (una per riga)<textarea id="prNotes" rows="3" style="min-height:72px;border-radius:10px;border:1px solid var(--line);background:var(--surface);color:var(--ink);padding:8px 10px;font:15px var(--f-body);width:100%">' + esc(f.notes) + '</textarea></label>';
    h += '<div class="stack" style="gap:6px"><span class="small" style="font-weight:600">Trova l\'etichetta</span><div class="row"><a class="btn sm" href="' + searchUrl(q || "prodotto fitosanitario") + '" target="_blank" rel="noopener">Cerca online</a><a class="btn sm" href="' + MINISTERO + '" target="_blank" rel="noopener">Banca dati del Ministero</a></div><span class="small muted">La banca dati del Ministero della Salute elenca i prodotti autorizzati con numero di registrazione e scadenza dell\'autorizzazione.</span></div>';
    h += '<div class="row"><button class="btn primary" data-pr="save">Salva</button><button class="btn" data-pr="cancel">Annulla</button>' + (f.id ? '<button class="btn danger" data-pr="del">' + (V.confirm ? 'Tocca ancora per eliminare' : 'Elimina') + '</button>' : '') + '</div></div>';
    return h;
  }
  function cardExtra(k) {
    var P = Q.product(k), h = '';
    var info = [P.maker, P.reg ? 'reg. n. ' + P.reg : '', P.bio ? 'ammesso in bio' : 'non indicato come bio'].filter(Boolean).join(' · ');
    if (info) h += '<span class="small muted">' + esc(info) + '</span>';
    if (P.url) h += '<a class="src" href="' + esc(P.url) + '" target="_blank" rel="noopener">Etichetta o scheda tecnica</a>';
    if (P.codes && P.codes.length) h += '<span class="small muted">Codici: ' + esc(P.codes.join(", ")) + '</span>';
    return h + '<div class="row"><button class="btn sm" data-pr="edit" data-k="' + k + '">Modifica</button></div>';
  }

  /* ---------------- codice a barre ---------------- */
  function byCode(code) { var c = C(); return Object.keys(c).find(function (id) { return (c[id].codes || []).indexOf(code) >= 0; }); }
  function lookup(code) {
    var ctl = "AbortController" in window ? new AbortController() : null, t = setTimeout(function () { if (ctl) ctl.abort(); }, 8000);
    return fetch("https://world.openproductsfacts.org/api/v2/product/" + encodeURIComponent(code) + ".json?fields=product_name,product_name_it,brands", { signal: ctl ? ctl.signal : undefined })
      .then(function (r) { return r.ok ? r.json() : null; })
      .then(function (j) { clearTimeout(t); var p = j && j.status === 1 && j.product; return p ? { name: p.product_name_it || p.product_name || "", brand: p.brands || "" } : null; })
      .catch(function () { clearTimeout(t); return null; });
  }
  function afterScan(code) {
    var id = byCode(code);
    if (id) { V.form = Object.assign({ id: id }, blank(), C()[id], { notes: (C()[id].notes || []).join("\n") }); V.msg = "Codice già associato a <b>" + esc(C()[id].n) + "</b>."; Q.render(); return; }
    V.form = blank(); V.form.codes = [code]; V.msg = "Cerco il codice " + esc(code) + "…"; Q.render();
    if (!navigator.onLine) { V.msg = "Senza connessione non posso cercare il codice: inserisci i dati dall'etichetta."; Q.render(); return; }
    lookup(code).then(function (r) {
      if (r && r.name) { if (V.form && !V.form.n) V.form.n = r.name; if (V.form && !V.form.maker) V.form.maker = r.brand; V.msg = "Trovato in Open Products Facts: <b>" + esc(r.name) + "</b>" + (r.brand ? " (" + esc(r.brand) + ")" : "") + ". Completa carenze e intervalli dall'etichetta."; }
      else V.msg = "Il codice " + esc(code) + " non è in nessuna banca dati gratuita. Scrivi il nome e i dati dall'etichetta; usa \"Cerca online\" per trovare la scheda.";
      Q.render();
    });
  }

  /* ---------------- azioni ---------------- */
  document.addEventListener("click", function (e) {
    var b = e.target.closest("[data-pr]"); if (!b) return; e.preventDefault();
    var a = b.getAttribute("data-pr"), k = b.getAttribute("data-k");
    if (a !== "del") V.confirm = false;
    switch (a) {
      case "new": V.form = blank(); V.msg = ""; window.scrollTo(0, 0); break;
      case "dup": V.form = fromProduct(k); V.msg = "Partito da " + esc(Q.product(k).n) + ": correggi con i dati della tua etichetta."; window.scrollTo(0, 0); break;
      case "edit": { var id = k.slice(2), c = C()[id]; V.form = Object.assign(blank(), c, { id: id, notes: (c.notes || []).join("\n") }); V.msg = ""; V.open = k; window.scrollTo(0, 0); break; }
      case "cancel": V.form = null; V.msg = ""; break;
      case "scan": if (!window.QOInv || !window.QOInv.scanCode) { Q.toast("Lettore non disponibile"); return; } window.QOInv.scanCode(afterScan); return;
      case "scanForm": readForm(); window.QOInv.scanCode(function (code) { if (V.form.codes.indexOf(code) < 0) V.form.codes.push(code); Q.render(); }); return;
      case "save": {
        readForm(); var f = V.form;
        if (!f.n) { Q.toast("Scrivi il nome del prodotto"); return; }
        var other = f.other.split(",").map(function (x) { return x.trim().toLowerCase(); }).filter(Boolean);
        var data = { n: f.n, kind: f.kind, bio: f.bio, tgt: f.tgt.concat(other), e1: f.e1 || 7, e2: f.e2 || f.e1 || 14, car: f.car, carV: f.carV, copper: f.copper, rainWash: f.rainWash, maxAll: f.maxAll, reg: f.reg, maker: f.maker, url: f.url, codes: f.codes, notes: f.notes.split("\n").map(function (x) { return x.trim(); }).filter(Boolean) };
        var nid = f.id || Q.uid(); C()[nid] = data; V.form = null; V.open = "u_" + nid; V.msg = "";
        Q.save(); Q.toast("Prodotto salvato: lo trovi anche nei trattamenti e nel magazzino"); break;
      }
      case "del": {
        if (!V.confirm) { V.confirm = true; break; }
        var used = S().plans.some(function (p) { return p.prod === "u_" + V.form.id; });
        if (used) { Q.toast("Il prodotto è usato in un trattamento: eliminalo prima dal programma"); V.confirm = false; break; }
        delete C()[V.form.id]; V.form = null; V.confirm = false; Q.save(); Q.toast("Prodotto eliminato"); break;
      }
    }
    Q.render();
  });

  window.QOProd = {
    headHtml: headHtml, cardExtra: cardExtra,
    isOpen: function (k) { return V.open === k; }
  };
})();

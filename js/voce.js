/* Comandi vocali e note dettate.
   Riconoscimento vocale del browser (gratuito, senza chiavi; su Android con Chrome).
   L'interpretazione è a regole fisse (parole chiave e numeri), non usa AI.
   Nulla viene salvato senza conferma. Dove il riconoscimento non c'è, si scrive o si detta con la tastiera. */
(function () {
  "use strict";
  var Q = window.QO;
  if (!Q) return;

  var SR = window.SpeechRecognition || window.webkitSpeechRecognition;
  var V = { open: false, listening: false, heard: "", interim: "", act: null, edit: false, err: "" };
  var rec = null, sheet = null;

  var STAGE_WORDS = [
    ["riposo", /riposo/], ["germ", /germogliament|germogli(?!\s+\d)/], ["foglie", /foglie distese|foglia distesa/],
    ["grapp", /grappoli visibili|grappolini/], ["fior", /fioritura|fiori/], ["alleg", /allegagione/],
    ["chius", /chiusura (del )?grappolo/], ["invai", /invaiatura/], ["matur", /maturazione|maturità/], ["cadu", /caduta (delle )?foglie/]
  ];
  var STAGE_N = { riposo: "Riposo vegetativo", germ: "Germogliamento", foglie: "Foglie distese", grapp: "Grappoli visibili", fior: "Piena fioritura", alleg: "Allegagione", chius: "Chiusura grappolo", invai: "Invaiatura", matur: "Maturazione", cadu: "Caduta foglie" };
  var NUMW = { zero: 0, uno: 1, una: 1, un: 1, due: 2, tre: 3, quattro: 4, cinque: 5, sei: 6, sette: 7, otto: 8, nove: 9, dieci: 10, undici: 11, dodici: 12, tredici: 13, quattordici: 14, quindici: 15, sedici: 16, diciassette: 17, diciotto: 18, diciannove: 19, venti: 20, trenta: 30, quaranta: 40, cinquanta: 50, sessanta: 60, settanta: 70, ottanta: 80, novanta: 90, cento: 100 };

  function S() { return Q.getState(); }
  function esc(s) { return Q.esc(s == null ? "" : s); }
  function norm(s) { return String(s || "").toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/[’']/g, " ").replace(/\s+/g, " ").trim(); }
  /* "ventuno" → 21, "sei virgola cinque" → 6.5, "6,5" → 6.5 */
  function words2num(t) {
    t = t.replace(/\b(venti|trenta|quaranta|cinquanta|sessanta|settanta|ottanta|novanta)(uno|due|tre|quattro|cinque|sei|sette|otto|nove)\b/g, function (m, a, b) { return String(NUMW[a] + NUMW[b]); })
      .replace(/\b(vent|trent|quarant|cinquant|sessant|settant|ottant|novant)(uno|otto)\b/g, function (m, a, b) { return String(NUMW[a + (a === "vent" ? "i" : "a")] + NUMW[b]); });
    t = t.replace(/\b(zero|uno|una|un|due|tre|quattro|cinque|sei|sette|otto|nove|dieci|undici|dodici|tredici|quattordici|quindici|sedici|diciassette|diciotto|diciannove|venti|trenta|quaranta|cinquanta|sessanta|settanta|ottanta|novanta|cento)\b/g, function (w) { return String(NUMW[w]); });
    t = t.replace(/(\d+)\s*(virgola|punto)\s*(\d+)/g, "$1.$3").replace(/(\d),(\d)/g, "$1.$2");
    return t;
  }
  function numAfter(t, re) { var m = new RegExp("(?:" + re + ")\\s*(?:di|del|numero|n\\.?|=|:)?\\s*(\\d+(?:\\.\\d+)?)").exec(t); return m ? parseFloat(m[1]) : null; }
  function numBefore(t, re) { var m = new RegExp("(\\d+(?:\\.\\d+)?)\\s*(?:" + re + ")").exec(t); return m ? parseFloat(m[1]) : null; }

  /* parcella: nominata nella frase, altrimenti quella dove sei col GPS, altrimenti quella aperta */
  function plotWords(p) { return norm(p.name).replace(/\b(vigna|vigneto|campo|serra|orto|parcella|appezzamento|del|della|dei|di|la|il|lo|le|al|alla)\b/g, " ").split(" ").filter(function (w) { return w.length >= 3; }); }
  function findPlot(t, vineOnly) {
    var list = S().plots.filter(function (p) { return !vineOnly || p.vine; }), best = null, bs = 0;
    list.forEach(function (p) { var ws = plotWords(p), sc = ws.filter(function (w) { return t.indexOf(w) >= 0; }).length; if (ws.length && sc / ws.length > bs) { bs = sc / ws.length; best = p; } });
    if (best && bs >= 0.5) return { p: best, how: "nominata" };
    var g = window.QOMap && window.QOMap.currentPlot && window.QOMap.currentPlot();
    if (g) { var gp = Q.plotById(g.plot); if (gp && (!vineOnly || gp.vine)) return { p: gp, how: "GPS" + (g.acc ? " ±" + g.acc + " m" : ""), gps: g }; }
    var ui = Q.ui, id = (ui.tab === "vigna" && ui.vsel) || S().sel, op = id && Q.plotById(id);
    if (op && (!vineOnly || op.vine)) return { p: op, how: "aperta" };
    var vs = S().plots.filter(function (p) { return p.vine; });
    if (vineOnly && vs.length === 1) return { p: vs[0], how: "unica vigna" };
    return null;
  }
  function findProduct(t) {
    var ps = Q.products(), best = null, bs = 0;
    ps.forEach(function (p) {
      var name = norm(p.name.replace(/\(.*?\)/g, "")), ws = name.split(" ").filter(function (w) { return w.length >= 4; });
      var sc = ws.filter(function (w) { return t.indexOf(w) >= 0; }).length / (ws.length || 1);
      if (t.indexOf(name) >= 0) sc = 2;
      if (sc > bs) { bs = sc; best = p; }
    });
    return bs >= 0.5 ? best : null;
  }

  /* ---------------- interpretazione ---------------- */
  function parse(raw) {
    var t = words2num(norm(raw));
    if (!t) return null;
    if (/^(nota|annota|appunto)\b/.test(t)) return note(raw.replace(/^\s*(nota|annota|appunto)\s*[:,]?\s*/i, ""), t);
    var mark = /\b(fallanz|manca|mancante|ceppo morto|pianta morta)/.test(t) ? "f" : /\b(sintom|malat|esca|flavescenz|giallum)/.test(t) ? "s" : /\b(rimpiazz|ripiantat|sostituit)/.test(t) ? "n" : /\b(togli|cancella|rimuovi)( il)? segno/.test(t) ? "x" : null;
    var filare = numAfter(t, "filare|fila|riga"), ceppo = numAfter(t, "ceppo|pianta|vite"), tratto = numAfter(t, "tratto");
    /* "fallanza qui": il ceppo più vicino secondo il GPS */
    if (mark && (filare == null || ceppo == null) && /\b(qui|questo|questa|dove sono)\b/.test(t)) {
      var gq = window.QOMap && window.QOMap.currentPlot && window.QOMap.currentPlot();
      if (!gq || gq.ri == null || gq.i == null) return { type: "err", text: "Per dire \"qui\" accendi il GPS nella Mappa e mettiti dentro una vigna. Altrimenti dì filare e ceppo." };
      filare = gq.ri + 1; ceppo = gq.i + 1; tratto = gq.k + 1;
      t = t + " "; var gpl = Q.plotById(gq.plot);
      if (gpl) { var g0 = Q.vineGeo(gpl), lab0 = { f: "Fallanza", s: "Sintomi", n: "Rimpiazzo", x: "Togli segno" }[mark];
        return { type: "mark", mark: mark, plot: gpl, how: "GPS ±" + gq.acc + " m", key: gq.ri + ":" + gq.k + ":" + gq.i, label: lab0, desc: "Filare " + filare + ", ceppo " + ceppo + (g0.rows[gq.ri].segs.length > 1 ? ", tratto " + tratto : "") + " (il più vicino a te)" }; }
    }
    if (mark && filare != null && ceppo != null) {
      var fp = findPlot(t, true); if (!fp) return { type: "err", text: "Non so in quale vigna: dì il nome della parcella o apri la parcella prima di parlare." };
      var g = Q.vineGeo(fp.p), ri = Math.round(filare) - 1, k = tratto != null ? Math.round(tratto) - 1 : 0, i = Math.round(ceppo) - 1;
      if (!g.rows[ri] || !g.rows[ri].segs.length) return { type: "err", text: fp.p.name + " non ha il filare " + filare + " (i filari sono " + g.rows.filter(function (r) { return r.segs.length; }).length + ")." };
      if (!g.rows[ri].segs[k]) k = 0;
      if (i < 0 || i >= g.rows[ri].segs[k].c) return { type: "err", text: "Nel filare " + filare + " di " + fp.p.name + " i ceppi vanno da 1 a " + g.rows[ri].segs[k].c + "." };
      var label = { f: "Fallanza", s: "Sintomi", n: "Rimpiazzo", x: "Togli segno" }[mark];
      return { type: "mark", mark: mark, plot: fp.p, how: fp.how, key: ri + ":" + k + ":" + i, label: label, desc: "Filare " + (ri + 1) + ", ceppo " + (i + 1) + (g.rows[ri].segs.length > 1 ? ", tratto " + (k + 1) : "") };
    }
    if (/\b(campion|maturazion|brix|babo)\b/.test(t) && (/brix|grad|zucch/.test(t))) {
      var brix = numAfter(t, "brix|zuccheri|gradi") != null ? numAfter(t, "brix|zuccheri|gradi") : numBefore(t, "brix|gradi"), ac = numAfter(t, "acidita(?: totale)?|acido"), ph = numAfter(t, "ph|p h|piacca");
      var sp = findPlot(t, true); if (!sp) return { type: "err", text: "Non so in quale vigna: dì il nome della parcella." };
      if (brix == null) return { type: "err", text: "Non ho sentito i gradi Brix." };
      return { type: "sample", plot: sp.p, how: sp.how, brix: brix, ac: ac, ph: ph, label: "Campionamento", desc: Q.num(brix, 1) + " °Brix" + (ac != null ? ", acidità " + Q.num(ac, 1) + " g/L" : "") + (ph != null ? ", pH " + Q.num(ph, 2) : "") };
    }
    if (/\b(fase|stadio|e in|siamo in|inizio)\b/.test(t) || STAGE_WORDS.some(function (s) { return s[1].test(t) && /\b(fase|stadio|registra)\b/.test(t); })) {
      var st = STAGE_WORDS.find(function (s) { return s[1].test(t); });
      if (st) { var pp = findPlot(t, true); if (!pp) return { type: "err", text: "Non so in quale vigna: dì il nome della parcella." }; return { type: "phen", plot: pp.p, how: pp.how, st: st[0], label: "Fenologia", desc: STAGE_N[st[0]] + ", oggi" }; }
    }
    if (/\b(trattat|trattamento|fatto|dato|passato)\b/.test(t)) {
      var pr = findProduct(t), tp = findPlot(t, false);
      if (pr && tp) {
        var pl = S().plans.filter(function (x) { return x.prod === pr.id && x.plot === tp.p.id && Q.nextDue(x); })[0];
        return { type: "done", plot: tp.p, how: tp.how, prod: pr, plan: pl || null, label: "Trattamento fatto", desc: pr.name + (pl ? ", " + (pl.done.length + 1) + "° passaggio di " + pl.count : ": non è programmato, ne creo uno con un solo passaggio") };
      }
    }
    return null;
  }
  function note(text, t) {
    var np = findPlot(t || norm(text), false);
    return { type: "note", text: text.trim(), plot: np ? np.p : null, how: np ? np.how : "", label: "Nota", desc: text.trim() };
  }

  /* ---------------- esecuzione ---------------- */
  function position() {
    var g = window.QOMap && window.QOMap.currentPlot && window.QOMap.currentPlot();
    return g && g.lat != null ? { lat: g.lat, lon: g.lon, acc: g.acc } : null;
  }
  function run(a) {
    var s = S(), today = Q.iso(Q.today());
    if (a.type === "mark") {
      if (a.mark === "n" && window.QOInv) { window.QOInv.replace(a.plot, [a.key]); return; }
      Q.setMark(a.plot.id, a.key, a.mark === "x" ? null : a.mark);
      Q.toast(a.label + " · " + a.plot.name + " · " + a.desc); return;
    }
    if (a.type === "sample") { s.samples = s.samples || []; s.samples.push({ id: Q.uid(), plot: a.plot.id, date: today, brix: a.brix, ac: a.ac, ph: a.ph }); Q.save(); Q.toast("Campione salvato in " + a.plot.name); Q.render(); return; }
    if (a.type === "phen") { a.plot.vine.phen.push({ st: a.st, date: today }); a.plot.vine.phen.sort(function (x, y) { return x.date < y.date ? -1 : 1; }); Q.save(); Q.toast(STAGE_N[a.st] + " registrata in " + a.plot.name); Q.render(); return; }
    if (a.type === "done") {
      var pl = a.plan;
      if (!pl) { pl = { id: Q.uid(), prod: a.prod.id, plot: a.plot.id, start: today, every: (Q.product(a.prod.id).every || [7])[0], count: 1, rain: !!Q.product(a.prod.id).rainWash, cu: 0.6, done: [] }; s.plans.push(pl); Q.save(); }
      Q.ui.tab = "trattamenti";
      if (window.QOInv && window.QOInv.needsForm(pl)) { Q.ui.doneFor = pl.id; Q.render(); Q.toast("Controlla la quantità e conferma lo scarico"); return; }
      pl.done.push(today); Q.save(); Q.render(); Q.toast("Trattamento registrato"); return;
    }
    if (a.type === "note") {
      s.notes = s.notes || []; var pos = position();
      s.notes.push({ id: Q.uid(), at: new Date().toISOString(), text: a.text, plot: a.plot ? a.plot.id : "", lat: pos ? pos.lat : null, lon: pos ? pos.lon : null, da: (window.QOSync && window.QOSync.userName && window.QOSync.userName()) || "" });
      Q.save(); Q.toast("Nota salvata"); Q.render();
    }
  }

  /* ---------------- ascolto ---------------- */
  function start() {
    V.err = ""; V.heard = ""; V.interim = ""; V.act = null; V.edit = false;
    if (!SR) { V.edit = true; V.err = "Il riconoscimento vocale non è disponibile qui. Tocca il campo e usa il microfono della tastiera, poi \"Interpreta\"."; draw(); return; }
    try {
      rec = new SR(); rec.lang = "it-IT"; rec.interimResults = true; rec.continuous = false; rec.maxAlternatives = 1;
      rec.onresult = function (e) { var fin = "", tmp = ""; for (var i = e.resultIndex; i < e.results.length; i++) { if (e.results[i].isFinal) fin += e.results[i][0].transcript; else tmp += e.results[i][0].transcript; } if (fin) V.heard = (V.heard + " " + fin).trim(); V.interim = tmp; draw(); };
      rec.onerror = function (e) { V.listening = false; V.err = e.error === "not-allowed" || e.error === "service-not-allowed" ? "Permesso del microfono negato: attivalo nelle impostazioni del browser per questo sito." : e.error === "no-speech" ? "Non ho sentito niente. Riprova." : e.error === "network" ? "Il riconoscimento vocale ha bisogno della connessione. Puoi usare il microfono della tastiera." : "Riconoscimento non riuscito (" + e.error + ")."; if (e.error === "network" || /not-allowed/.test(e.error)) V.edit = true; draw(); };
      rec.onend = function () { V.listening = false; V.interim = ""; if (V.heard) interpret(V.heard); else draw(); };
      rec.start(); V.listening = true; draw();
    } catch (e) { V.listening = false; V.edit = true; V.err = "Non riesco ad avviare il microfono: scrivi o detta con la tastiera."; draw(); }
  }
  function stop() { if (rec) { try { rec.stop(); } catch (e) {} } }
  function interpret(text) {
    V.err = "";
    V.heard = text; var a = parse(text);
    V.act = a || note(text); if (!a) V.act.fallback = true;
    draw();
  }

  /* ---------------- pannello ---------------- */
  function ensureSheet() { if (sheet) return sheet; sheet = document.createElement("div"); sheet.className = "sheet"; sheet.id = "voiceSheet"; sheet.hidden = true; document.body.appendChild(sheet); return sheet; }
  var MIC = '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" aria-hidden="true"><rect x="9" y="3" width="6" height="11" rx="3"/><path d="M5 11a7 7 0 0 0 14 0M12 18v3"/></svg>';
  function draw() {
    var el = ensureSheet(); el.hidden = !V.open; if (!V.open) { el.innerHTML = ""; return; }
    var h = '<div role="dialog" aria-modal="true" aria-labelledby="voTitle"><div class="stack">';
    h += '<div class="row" style="flex-wrap:nowrap;gap:10px"><span style="width:40px;height:40px;border-radius:20px;display:flex;align-items:center;justify-content:center;background:' + (V.listening ? 'var(--bad-bg)' : 'var(--surface)') + ';color:' + (V.listening ? 'var(--bad)' : 'var(--ink)') + '">' + MIC + '</span><h2 id="voTitle" style="flex:1">' + (V.listening ? 'Ti ascolto…' : V.act ? 'Ho capito' : 'Comando vocale') + '</h2><button class="btn sm" data-vo="close">Chiudi</button></div>';
    if (V.listening || V.heard || V.interim) h += '<div class="panel" style="font-size:17px">«' + esc((V.heard + " " + V.interim).trim() || "…") + '»</div>';
    if (V.err) h += '<div class="small" style="color:var(--warn)">' + esc(V.err) + '</div>';
    if (V.act && !V.listening) {
      var a = V.act;
      if (a.type === "err") h += '<div class="panel" style="background:var(--warn-bg);color:var(--warn)"><b>Non posso farlo</b><br><span class="small">' + esc(a.text) + '</span></div>';
      else {
        var color = { f: "b-bad", s: "b-warn", n: "b-ok", x: "b-n" }[a.mark] || "b-n";
        h += '<div class="panel stack" style="gap:4px;border:2px solid var(--accent)">' + (a.fallback ? '<span class="small muted">Non ho riconosciuto un comando: lo salvo come nota.</span>' : '') + '<div class="row"><span class="badge ' + color + '">' + esc(a.label) + '</span>' + (a.plot ? '<b>' + esc(a.plot.name) + '</b>' : '') + '</div><span>' + esc(a.desc) + '</span>' + (a.how ? '<span class="small muted">Parcella: ' + esc(a.how) + '</span>' : '') + '</div>';
      }
      h += '<div class="row">' + (a.type !== "err" ? '<button class="btn primary" data-vo="ok" style="flex:1">Conferma</button>' : '') + '<button class="btn" data-vo="fix" style="flex:1">Correggi</button>' + (SR ? '<button class="btn" data-vo="again" aria-label="Riprova">Riprova</button>' : '') + '</div>';
    }
    if (V.edit) h += '<label class="f">Frase<input id="voText" value="' + esc(V.heard) + '" placeholder="fallanza filare 12 ceppo 40"></label><div class="row"><button class="btn primary" data-vo="parse">Interpreta</button>' + (SR ? '<button class="btn" data-vo="again">Parla di nuovo</button>' : '') + '</div>';
    if (V.listening) h += '<div><button class="btn" data-vo="stop">Ho finito</button></div>';
    if (!V.act && !V.listening) h += '<details class="small"><summary>Cosa posso dire</summary><ul style="margin:6px 0 0;padding-left:18px"><li>fallanza filare 12 ceppo 40 (anche: sintomi, rimpiazzato, togli segno)</li><li>campione Poggio 21 brix acidità 6,5 pH 3,3</li><li>trattamento fatto rame al Poggio</li><li>fase fioritura impianto nuovo</li><li>nota grandine sul filare 20</li></ul><span class="muted">La parcella è quella che nomini, quella dove sei col GPS o quella aperta.</span></details>';
    h += '</div></div>';
    el.innerHTML = h;
    var inp = document.getElementById("voText"); if (inp && V.edit && !V.listening) inp.focus();
  }

  document.addEventListener("click", function (e) {
    var b = e.target.closest("[data-vo]"); if (!b) { if (e.target.id === "voiceSheet") { stop(); V.open = false; draw(); } return; }
    e.preventDefault();
    switch (b.getAttribute("data-vo")) {
      case "mic": V.open = true; start(); return;
      case "close": stop(); V.open = false; draw(); return;
      case "stop": stop(); return;
      case "again": start(); return;
      case "fix": V.edit = true; V.act = null; draw(); return;
      case "parse": { var t = (document.getElementById("voText") || {}).value || ""; if (!t.trim()) { V.err = "Scrivi o detta la frase."; draw(); return; } V.edit = false; V.err = ""; interpret(t); return; }
      case "delnote": {
        var id = b.getAttribute("data-id"), s = S();
        if (b.getAttribute("data-sure") !== "1") { b.setAttribute("data-sure", "1"); b.textContent = "Elimina?"; return; }
        s.notes = (s.notes || []).filter(function (n) { return n.id !== id; }); Q.save(); Q.render(); return;
      }
      case "ok": { var a = V.act; V.open = false; draw(); if (a && a.type !== "err") run(a); return; }
    }
  });
  document.addEventListener("keydown", function (e) { if (e.key === "Enter" && e.target && e.target.id === "voText") { e.preventDefault(); var t = e.target.value; if (t.trim()) { V.edit = false; interpret(t); } } if (e.key === "Escape" && V.open) { stop(); V.open = false; draw(); } });

  /* elenco note: tutte (Oggi) o di una parcella */
  function notesHtml(plotId, n) {
    var all = (S().notes || []).filter(function (x) { return !plotId || x.plot === plotId; }).slice().sort(function (a, b) { return a.at < b.at ? 1 : -1; });
    if (!all.length) return plotId ? "" : "";
    var h = '<h2 style="margin:16px 0 8px">' + (plotId ? "Note" : "Note recenti") + '</h2><div class="panel stack" style="gap:8px">';
    all.slice(0, n).forEach(function (x) {
      var d = new Date(x.at), when = isNaN(d) ? "" : d.toLocaleString("it-IT", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" });
      var where = x.plot && !plotId ? Q.plotName(x.plot) : "", map = x.lat != null ? '<a class="small" href="https://www.openstreetmap.org/?mlat=' + x.lat + '&mlon=' + x.lon + '#map=19/' + x.lat + '/' + x.lon + '" target="_blank" rel="noopener">posizione</a>' : "";
      h += '<div class="row" style="flex-wrap:nowrap;align-items:flex-start;gap:8px"><div style="flex:1;min-width:0"><div>' + esc(x.text) + '</div><div class="small muted">' + [when, where, x.da].filter(Boolean).map(esc).join(" · ") + (map ? " · " + map : "") + '</div></div><button class="btn sm" data-vo="delnote" data-id="' + esc(x.id) + '">Elimina</button></div>';
    });
    if (all.length > n) h += '<div class="small muted">e altre ' + (all.length - n) + '</div>';
    return h + '</div>';
  }

  window.QOVoice = { parse: parse, notesHtml: notesHtml };
  Q.render();
})();

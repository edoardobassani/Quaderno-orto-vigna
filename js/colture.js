/* Colture scritte a mano (ortaggi o alberi) e correzioni a quelle già pronte.
   Dati in S.customCrops: {id: {n, tree, row, btw, fam, days, harv, c}} per le nuove (chiave in CROPS "u_<id>"),
   {chiave: {base: true, row, btw, days, harv}} per le correzioni. Distanze sempre in cm.
   Stato della schermata in QO.ui.cropForm. Espone window.QOColt; pulsanti con data-co. */
(function () {
  "use strict";
  var Q = window.QO;
  if (!Q) return;
  function S() { return Q.getState(); }
  function UI() { return Q.ui; }
  function esc(s) { return Q.esc(s == null ? "" : s); }
  function $(s) { return document.querySelector(s); }
  function val(id) { var el = document.getElementById(id); return el ? el.value : null; }
  function num(v) { return parseFloat(String(v == null ? "" : v).replace(",", ".")); }
  var COLORS = ["#7F77DD", "#1D9E75", "#D4537E", "#BA7517", "#378ADD", "#D85A30", "#639922", "#993556", "#E3B81C", "#5F5E5A"];

  function open(key) {
    var C = Q.cropList(), c = key ? C[key] : null;
    if (c) UI().cropForm = { key: key, custom: !!c.custom, cid: c.cid || null, n: c.n, tree: !!c.tree, row: c.row, btw: c.btw, fam: c.fam || "", days: c.days || "", harv: c.harv || "", c: c.c, base: !c.custom };
    else UI().cropForm = { key: null, custom: true, n: "", tree: false, row: 30, btw: 50, fam: "", days: "", harv: "", c: COLORS[0], base: false };
    window.scrollTo(0, 0);
  }
  function read() {
    var f = UI().cropForm; if (!f) return; var k = f.tree ? 100 : 1;
    if (val("coN") != null) f.n = val("coN").trim();
    if (val("coTipo") != null) { var nt = val("coTipo") === "albero"; if (nt !== f.tree) { f.tree = nt; if (nt && f.row < 150) { f.row = 400; f.btw = 400; } if (!nt && f.row >= 150) { f.row = 30; f.btw = 50; } return; } }
    if (val("coRow") != null) f.row = Math.round(num(val("coRow")) * k) || f.row;
    if (val("coBtw") != null) f.btw = Math.round(num(val("coBtw")) * k) || f.btw;
    if (val("coFam") != null) f.fam = val("coFam").trim().toLowerCase();
    if (val("coDays") != null) f.days = parseInt(val("coDays"), 10) || "";
    if (val("coHarv") != null) f.harv = val("coHarv").trim();
  }
  /* quante piante usano una coltura, in tutti gli appezzamenti */
  function uses(key) { var n = 0; S().plots.forEach(function (p) { (p.plants || []).forEach(function (pl) { if (pl.c === key) n++; }); (p.beds || []).forEach(function (b) { if (b.crop === key) n++; }); }); return n; }

  function html() {
    var f = UI().cropForm, C = Q.cropList(), u = f.tree ? "m" : "cm", sh = function (v) { return f.tree ? Math.round(v) / 100 : v; };
    var fams = {}; Object.keys(C).forEach(function (k) { if (C[k].fam) fams[C[k].fam] = 1; });
    var h = '<div class="top"><div><div class="eyebrow">Orto</div><h1>' + (f.base ? 'Correggi ' + esc(f.n) : f.key ? 'Modifica coltura' : 'Nuova coltura') + '</h1></div></div><div class="panel stack">';
    if (!f.base) h += '<div class="grid2"><label class="f">Nome<input id="coN" value="' + esc(f.n) + '" placeholder="es. Cavolo nero"></label><label class="f">Tipo<select id="coTipo"><option value="ortaggio"' + (f.tree ? '' : ' selected') + '>Ortaggio</option><option value="albero"' + (f.tree ? ' selected' : '') + '>Albero</option></select></label></div>';
    h += '<div class="grid2"><label class="f">' + (f.tree ? 'Distanza sulla fila' : 'Sulla fila') + ' (' + u + ')<input id="coRow" type="number" inputmode="decimal" step="' + (f.tree ? '0.1' : '1') + '" value="' + sh(f.row) + '"></label><label class="f">Tra le file (' + u + ')<input id="coBtw" type="number" inputmode="decimal" step="' + (f.tree ? '0.1' : '1') + '" value="' + sh(f.btw) + '"></label>';
    if (!f.base) h += '<label class="f">Famiglia<input id="coFam" list="coFams" value="' + esc(f.fam) + '" placeholder="es. brassicacee"><datalist id="coFams">' + Object.keys(fams).sort().map(function (x) { return '<option value="' + esc(x) + '">'; }).join("") + '</datalist></label>';
    h += f.tree ? '<label class="f">Periodo di raccolta<input id="coHarv" value="' + esc(f.harv) + '" placeholder="es. agosto–settembre"></label>' : '<label class="f">Giorni alla raccolta<input id="coDays" type="number" inputmode="numeric" value="' + esc(f.days) + '" placeholder="facoltativo"></label>';
    h += '</div>';
    if (!f.base) h += '<div class="row" role="group" aria-label="Colore" style="gap:8px"><span class="small muted">Colore</span>' + COLORS.map(function (c) { return '<button class="btn sm" data-co="color" data-v="' + c + '" aria-label="Colore ' + c + '" aria-pressed="' + (f.c === c) + '" style="width:36px;min-height:36px;padding:0;border-radius:18px;background:' + c + ';' + (f.c === c ? 'outline:3px solid var(--ink);outline-offset:2px' : '') + '"></button>'; }).join("") + '</div>';
    if (f.tree) h += '<span class="small muted">Gli alberi si piantano uno alla volta toccando la mappa, oppure a file per un frutteto regolare. La chioma parte larga quanto la distanza sulla fila e si può disegnare albero per albero.</span>';
    h += '<div class="row"><button class="btn primary" data-co="save">Salva</button><button class="btn" data-co="cancel">Annulla</button>';
    if (f.base && S().customCrops && S().customCrops[f.key]) h += '<button class="btn" data-co="reset">Torna ai valori di partenza</button>';
    if (f.key && !f.base) h += '<button class="btn danger" data-co="del">' + (UI().confirm === "coDel" ? 'Tocca ancora per eliminare' : 'Elimina coltura') + '</button>';
    return h + '</div></div>';
  }

  function act(a, b) {
    var f = UI().cropForm, st = S();
    if (a === "new") { open(null); Q.render(); return; }
    if (a === "edit") { open(b.getAttribute("data-c")); Q.render(); return; }
    if (!f) return;
    if (a !== "del") UI().confirm = null;
    read();
    if (a === "color") f.c = b.getAttribute("data-v");
    else if (a === "cancel") UI().cropForm = null;
    else if (a === "reset") { delete st.customCrops[f.key]; UI().cropForm = null; Q.save(); Q.toast("Distanze di partenza ripristinate"); }
    else if (a === "del") {
      var n = uses(f.key); if (n) { Q.toast("Questa coltura è usata (" + n + " fra piante e bancali): toglile prima"); Q.render(); return; }
      if (UI().confirm !== "coDel") { UI().confirm = "coDel"; Q.render(); return; }
      delete st.customCrops[f.cid]; UI().confirm = null; UI().cropForm = null; if (st.cropSel === f.key) st.cropSel = "lattuga"; Q.save(); Q.toast("Coltura eliminata");
    }
    else if (a === "save") {
      if (!f.base && !f.n) { Q.toast("Scrivi il nome della coltura"); return; }
      if (!(f.row > 0 && f.btw > 0)) { Q.toast("Controlla le distanze"); return; }
      st.customCrops = st.customCrops || {};
      if (f.base) st.customCrops[f.key] = { base: true, row: f.row, btw: f.btw, days: f.tree ? null : (f.days || null), harv: f.tree ? f.harv : null };
      else { var id = f.cid || Q.uid(); st.customCrops[id] = { n: f.n, tree: f.tree, row: f.row, btw: f.btw, fam: f.fam, days: f.tree ? 0 : (+f.days || 0), harv: f.tree ? f.harv : "", c: f.c }; st.cropSel = "u_" + id; }
      UI().cropForm = null; Q.save(); Q.toast(f.base ? "Distanze di " + f.n + " corrette" : "Coltura salvata: " + f.n);
    }
    Q.render();
  }
  document.addEventListener("click", function (e) { var b = e.target.closest("[data-co]"); if (!b) return; e.preventDefault(); act(b.getAttribute("data-co"), b); });
  document.addEventListener("change", function (e) { if (e.target && e.target.id === "coTipo" && UI().cropForm) { read(); Q.render(); } });

  window.QOColt = { html: html, open: open };
})();

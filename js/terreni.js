/* Terreni (corpi aziendali separati), confini e import di confine e terrazze da file GPS. */
(function () {
  "use strict";
  var Q = window.QO;
  if (!Q) return;
  function S() { return Q.getState(); }
  function UI() { return Q.ui; }
  function esc(s) { return Q.esc(s == null ? "" : s); }
  function $(s) { return document.querySelector(s); }
  function val(id) { var el = document.getElementById(id); return el ? el.value : null; }
  function ha(m2) { return Q.num(m2 / 1e4, 2) + " ha"; }
  function plotsOf(tid) { return S().plots.filter(function (p) { return (p.ter || "") === tid; }); }

  /* superficie approssimata di un poligono in gradi (per mostrare le forme prima di importarle) */
  function llArea(ll) {
    var lat0 = ll[0][0] * Math.PI / 180, kx = Math.cos(lat0) * 111320, a = 0;
    for (var i = 0; i < ll.length; i++) { var p = ll[i], q = ll[(i + 1) % ll.length]; a += p[1] * kx * q[0] * 110574 - q[1] * kx * p[0] * 110574; }
    return Math.abs(a / 2);
  }
  function llCenter(ll) { var la = 0, lo = 0; ll.forEach(function (q) { la += q[0]; lo += q[1]; }); return [la / ll.length, lo / ll.length]; }
  function llInside(pt, ll) { var c = false; for (var i = 0, j = ll.length - 1; i < ll.length; j = i++) { var a = ll[i], b = ll[j]; if ((a[0] > pt[0]) !== (b[0] > pt[0]) && pt[1] < (b[1] - a[1]) * (pt[0] - a[0]) / (b[0] - a[0]) + a[1]) c = !c; } return c; }

  /* ---------------- import guidato ---------------- */
  function startImport(polys, fname, fromTer) {
    var ps = polys.map(function (p) { return { name: p.name, ll: p.ll, m2: llArea(p.ll), role: "terrazza" }; });
    if (ps.length === 1) ps[0].role = fromTer && !(Q.terById(fromTer) || {}).pts ? "confine" : "terrazza";
    else {
      var big = ps.slice().sort(function (a, b) { return b.m2 - a.m2; })[0];
      var inside = ps.filter(function (p) { return p !== big && llInside(llCenter(p.ll), big.ll); }).length;
      if (inside >= (ps.length - 1) / 2) big.role = "confine";
    }
    var ts = Q.terreni(), def = fromTer || Q.terSel() || (ts.length ? ts[0].id : "new");
    UI().imp = { file: fname, polys: ps, ter: def, newName: ts.length ? "Terreno " + (ts.length + 1) : "Terreno principale", varieta: "", inter: 2.5, row: 0.9, rmode: "curva" };
    UI().tab = "vigna"; UI().vtab = "parcelle"; UI().vedit = null;
    window.scrollTo(0, 0); Q.render();
  }
  function readImp() {
    var I = UI().imp; if (!I) return;
    if (val("imTer") != null) I.ter = val("imTer");
    if (val("imNew") != null) I.newName = val("imNew").trim() || I.newName;
    if (val("imVar") != null) I.varieta = val("imVar");
    if (val("imInter") != null) I.inter = parseFloat(val("imInter")) || 2.5;
    if (val("imRow") != null) I.row = parseFloat(val("imRow")) || 0.9;
    if (val("imMode") != null) I.rmode = val("imMode");
    I.polys.forEach(function (p, j) { if (val("imN-" + j) != null) p.name = val("imN-" + j).trim() || p.name; if (val("imR-" + j) != null) p.role = val("imR-" + j); });
  }
  function sameName(a, b) { return String(a).trim().toLowerCase() === String(b).trim().toLowerCase(); }
  function wizardHtml() {
    var I = UI().imp, ts = Q.terreni(), conf = I.polys.filter(function (p) { return p.role === "confine"; }).length, terr = I.polys.filter(function (p) { return p.role === "terrazza"; });
    var tid = I.ter === "new" ? null : I.ter, upd = tid ? terr.filter(function (p) { return plotsOf(tid).some(function (x) { return x.vine && sameName(x.name, p.name); }); }).length : 0;
    var h = '<div class="panel stack" style="border:2px solid var(--vigna)"><h2>Importa da ' + esc(I.file) + '</h2><span class="small muted">' + I.polys.length + ' forme trovate. Controlla cosa è ciascuna: la più grande che contiene le altre è proposta come confine.</span>';
    h += '<div class="grid2"><label class="f">Terreno<select id="imTer">' + ts.map(function (t) { return '<option value="' + t.id + '"' + (I.ter === t.id ? ' selected' : '') + '>' + esc(t.name) + '</option>'; }).join("") + '<option value="new"' + (I.ter === "new" ? ' selected' : '') + '>+ Nuovo terreno</option></select></label>' + (I.ter === "new" ? '<label class="f">Nome del nuovo terreno<input id="imNew" value="' + esc(I.newName) + '"></label>' : '<span></span>') + '</div>';
    if (terr.length) h += '<div class="sep"></div><h3>Dati delle nuove terrazze</h3><div class="grid2"><label class="f">Varietà<input id="imVar" value="' + esc(I.varieta) + '" placeholder="si può cambiare dopo"></label><label class="f">Filari<select id="imMode">' + [["curva", "Lungo la terrazza (automatici)"], ["auto", "Dritti e paralleli"], ["man", "Inseriti a mano dopo"]].map(function (x) { return '<option value="' + x[0] + '"' + (I.rmode === x[0] ? ' selected' : '') + '>' + x[1] + '</option>'; }).join("") + '</select></label><label class="f">Distanza tra filari (m)<input id="imInter" type="number" inputmode="decimal" step="0.05" value="' + I.inter + '"></label><label class="f">Distanza sulla fila (m)<input id="imRow" type="number" inputmode="decimal" step="0.05" value="' + I.row + '"></label></div>';
    h += '<div class="sep"></div><div class="row" style="justify-content:space-between"><h3>Forme</h3><span class="small muted">' + conf + ' confine · ' + terr.length + ' terrazze</span></div>';
    h += '<div class="stack" style="gap:6px">' + I.polys.map(function (p, j) { return '<div class="row" style="flex-wrap:nowrap;gap:6px"><input id="imN-' + j + '" value="' + esc(p.name) + '" aria-label="Nome" style="flex:1;min-width:0"><span class="small muted mono" style="width:66px;text-align:right">' + (p.m2 >= 5000 ? ha(p.m2) : Math.round(p.m2) + ' m²') + '</span><select id="imR-' + j + '" aria-label="Tipo di ' + esc(p.name) + '" style="width:auto">' + [["terrazza", "Terrazza"], ["confine", "Confine"], ["ignora", "Ignora"]].map(function (x) { return '<option value="' + x[0] + '"' + (p.role === x[0] ? ' selected' : '') + '>' + x[1] + '</option>'; }).join("") + '</select></div>'; }).join("") + '</div>';
    if (upd) h += '<span class="small" style="color:var(--warn)">' + upd + ' terrazze hanno lo stesso nome di parcelle già presenti in questo terreno: ne aggiorno solo la forma, segni e dati restano.</span>';
    if (conf > 1) h += '<span class="small" style="color:var(--warn)">Hai indicato più confini: uso il più grande.</span>';
    h += '<div class="row"><button class="btn primary" data-te="impGo">Importa</button><button class="btn" data-te="impCancel">Annulla</button></div></div>';
    return h;
  }
  function doImport() {
    readImp(); var I = UI().imp, st = S();
    var use = I.polys.filter(function (p) { return p.role !== "ignora"; }); if (!use.length) { Q.toast("Non c'è niente da importare"); return; }
    var t = I.ter === "new" ? null : Q.terById(I.ter);
    if (!t) { t = { id: Q.uid(), name: I.newName || "Terreno", pts: null }; Q.terreni().push(t); }
    Q.ensureGeo(use.map(function (p) { return p.ll; }));
    var confs = use.filter(function (p) { return p.role === "confine"; }).sort(function (a, b) { return b.m2 - a.m2; });
    if (confs.length) t.pts = Q.llToPts(confs[0].ll);
    var made = 0, updated = 0, views = Q.views();
    use.filter(function (p) { return p.role === "terrazza"; }).forEach(function (pp) {
      var pts = Q.llToPts(pp.ll); if (pts.length < 3 || Q.area(pts) < 1) return;
      var ex = st.plots.find(function (x) { return x.vine && x.ter === t.id && sameName(x.name, pp.name); });
      if (ex) { ex.pts = pts; delete views["vine-" + ex.id]; updated++; return; }
      st.plots.push({ id: Q.uid(), name: pp.name, type: "vigna", pts: pts, plants: [], ter: t.id, vine: Q.vineDefaults({ varieta: I.varieta, inter: I.inter, row: I.row, rmode: I.rmode === "man" ? "curva" : I.rmode }) });
      made++;
    });
    if (I.rmode === "man") Q.toast("Le terrazze partono con i filari lungo la terrazza: in ognuna scegli \"Inseriti a mano\" per scriverli");
    UI().imp = null; UI().ter = t.id; try { localStorage.setItem("qo-ter", t.id); } catch (e) {}
    delete views.map; Q.save();
    Q.toast([confs.length ? "confine " + ha(Q.area(t.pts)) : "", made ? made + (made === 1 ? " terrazza nuova" : " terrazze nuove") : "", updated ? updated + (updated === 1 ? " aggiornata" : " aggiornate") : ""].filter(Boolean).join(", ") + " in " + t.name);
    Q.render();
  }

  /* ---------------- gestione dei terreni ---------------- */
  function managerHtml() {
    var ts = Q.terreni(), loose = S().plots.filter(function (p) { return !p.ter || !Q.terById(p.ter); });
    var h = '<div class="panel stack" style="margin-bottom:12px"><div class="row" style="justify-content:space-between"><h2>Terreni e confini</h2><button class="btn sm" data-te="add">Aggiungi terreno</button></div>';
    if (!ts.length) h += '<span class="small">Se l\'azienda è su più corpi separati, crea un terreno per ognuno. Il confine dà gli ettari aziendali; le parcelle e le terrazze dentro il confine vengono assegnate al terreno da sole.</span>';
    ts.forEach(function (t) {
      var ps = plotsOf(t.id), vs = ps.filter(function (p) { return p.vine; }), vit = vs.reduce(function (a, p) { return a + Q.area(p.pts); }, 0), ce = vs.reduce(function (a, p) { return a + Q.vineGeo(p).ceppi; }, 0);
      h += '<div class="panel stack" style="background:var(--surface);gap:8px"><label class="f">Nome<input id="teName-' + t.id + '" value="' + esc(t.name) + '"></label>';
      h += '<div class="kv"><div><span>Confine</span><b>' + (t.pts ? ha(Q.area(t.pts)) : 'da tracciare') + '</b></div><div><span>Vitata</span><b>' + ha(vit) + '</b></div><div><span>Appezzamenti</span><b>' + ps.length + '</b></div><div><span>Ceppi</span><b>' + ce.toLocaleString("it-IT") + '</b></div></div>';
      h += '<div class="row"><label class="btn sm filebtn" for="teFile-' + t.id + '">Importa file<input id="teFile-' + t.id + '" type="file" accept=".gpx,.kml,.geojson,.json"></label><button class="btn sm" data-te="draw" data-id="' + t.id + '">Disegna confine</button><button class="btn sm" data-te="walk" data-id="' + t.id + '">Cammina il confine</button></div>';
      h += '<div class="row">' + (t.pts ? '<button class="btn sm" data-te="assign" data-id="' + t.id + '">Assegna le parcelle dentro il confine</button>' : '') + '<button class="btn sm danger" data-te="del" data-id="' + t.id + '">' + (UI().teDel === t.id ? 'Tocca ancora: le parcelle restano' : 'Elimina terreno') + '</button></div></div>';
    });
    if (ts.length && loose.length) h += '<span class="small muted">' + loose.length + ' appezzamenti senza terreno: assegnali dal confine o da "Modifica dati".</span>';
    return h + '</div>';
  }
  function assign(tid) {
    var t = Q.terById(tid); if (!t || !t.pts) return 0; var n = 0;
    S().plots.forEach(function (p) { var b = Q.bbox(p.pts), c = [(b.x0 + b.x1) / 2, (b.y0 + b.y1) / 2]; if (Q.pip(c, t.pts) && p.ter !== tid) { p.ter = tid; n++; } });
    return n;
  }

  /* ---------------- riepilogo in Oggi ---------------- */
  function oggiHtml() {
    var ts = Q.terreni().slice(), vs = Q.vignes ? Q.vignes() : S().plots.filter(function (p) { return p.vine; }), t0 = Q.today();
    if (vs.some(function (p) { return !p.ter || !Q.terById(p.ter); })) ts.push({ id: "", name: "Senza terreno" });
    var h = '<h2 style="margin:16px 0 8px">Vigne</h2><div class="list">';
    ts.forEach(function (t) {
      var ps = vs.filter(function (p) { return (t.id ? p.ter === t.id : !p.ter || !Q.terById(p.ter)); }); if (!ps.length) return;
      var vit = ps.reduce(function (a, p) { return a + Q.area(p.pts); }, 0), fall = 0, stages = {};
      ps.forEach(function (p) { fall += Q.vineStats(p).f; var sg = Q.stageOf(p); if (sg) stages[sg.st] = (stages[sg.st] || 0) + 1; });
      var top = Object.keys(stages).sort(function (a, b) { return stages[b] - stages[a]; })[0];
      var ids = {}; ps.forEach(function (p) { ids[p.id] = 1; });
      var due = S().plans.filter(function (pl) { var d = Q.nextDue(pl); return ids[pl.plot] && d && d <= t0; }).length;
      h += '<button class="item" data-te="go" data-id="' + t.id + '"><span class="swatch" style="background:var(--vigna-fill);border-color:var(--vigna)"></span><span class="grow"><b>' + esc(t.name) + '</b><br><span class="small muted">' + ps.length + ' parcelle · ' + ha(vit) + (top ? ' · ' + esc(Q.stageName(top)) : '') + (fall ? ' · ' + fall + ' fallanze' : '') + '</span></span>' + (due ? '<span class="badge b-warn">' + due + ' da trattare</span>' : '') + '</button>';
    });
    return h + '</div>';
  }

  /* ---------------- eventi ---------------- */
  document.addEventListener("click", function (e) {
    var b = e.target.closest("[data-te]"); if (!b) return; e.preventDefault();
    var a = b.getAttribute("data-te"), id = b.getAttribute("data-id"), ts = Q.terreni(), U = UI();
    if (a !== "del") U.teDel = null;
    switch (a) {
      case "impGo": doImport(); return;
      case "impCancel": U.imp = null; break;
      case "add": ts.push({ id: Q.uid(), name: ts.length ? "Terreno " + (ts.length + 1) : "Terreno principale", pts: null }); if (!ts[1]) { S().plots.forEach(function (p) { if (!p.ter) p.ter = ts[0].id; }); } Q.save(); break;
      case "del": if (U.teDel !== id) { U.teDel = id; break; } S().terreni = ts.filter(function (t) { return t.id !== id; }); S().plots.forEach(function (p) { if (p.ter === id) delete p.ter; }); U.teDel = null; if (U.ter === id) U.ter = ""; Q.save(); break;
      case "assign": { var n = assign(id); Q.save(); Q.toast(n ? n + " parcelle assegnate a " + Q.terById(id).name : "Nessuna parcella nuova dentro il confine"); break; }
      case "draw": { var t = Q.terById(id); U.tab = "mappa"; U.draw = { pts: [], closed: false, name: t.name, type: "confine", ter: id }; U.ter = id; delete Q.views().map; Q.toast("Tocca i vertici del confine sulla mappa"); window.scrollTo(0, 0); break; }
      case "walk": { var t2 = Q.terById(id); U.tab = "mappa"; U.recFor = { type: "confine", ter: id, name: t2.name }; U.ter = id; Q.toast("Premi \"Registra perimetro\" e cammina lungo il confine"); window.scrollTo(0, 0); break; }
      case "go": U.ter = id || ""; try { localStorage.setItem("qo-ter", U.ter); } catch (e2) {} U.tab = "vigna"; U.vtab = "parcelle"; delete Q.views().map; window.scrollTo(0, 0); break;
    }
    Q.render();
  });
  document.addEventListener("change", function (e) {
    var t = e.target, id = t.id || ""; if (!id) return;
    if (id.indexOf("teName-") === 0) { var tt = Q.terById(id.slice(7)); if (tt) { tt.name = t.value.trim() || tt.name; Q.save(); Q.render(); } return; }
    if (id === "imTer" || id === "imMode" || id.indexOf("imR-") === 0) { readImp(); Q.render(); return; }
    if (id === "terFileAll" || id.indexOf("teFile-") === 0) {
      var f = t.files && t.files[0]; if (!f) return; var from = id === "terFileAll" ? null : id.slice(7);
      Q.readFileAsText(f, function (txt) {
        var polys; try { polys = Q.parseGeoFile(txt, f.name); } catch (err) { Q.toast("File non leggibile: usa GPX, KML o GeoJSON"); return; }
        if (!polys.length) { Q.toast("Nel file non ho trovato forme chiuse"); return; }
        startImport(polys, f.name, from);
      });
    }
  });

  window.QOTer = { wizardHtml: wizardHtml, managerHtml: managerHtml, oggiHtml: oggiHtml, startImport: startImport };
  Q.render();
})();

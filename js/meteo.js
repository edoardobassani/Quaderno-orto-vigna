/* Meteo automatico.
   Passato: dati della stazione aziendale importati (CSV/Excel, es. FieldClimate); dove mancano, stima Open-Meteo.
   Futuro: previsione MET Norway (gratuita anche per uso commerciale, senza chiavi) oppure Open-Meteo.
   Tutto è salvato per ora locale (chiavi "AAAA-MM-GGTHH"). */
(function () {
  "use strict";
  var Q = window.QO;
  if (!Q) return;

  var CACHE_KEY = "qo-meteo-cache-v1", MAX_AGE = 60 * 60 * 1000, WASH_MM = 20;
  var XLSX_URL = "https://cdnjs.cloudflare.com/ajax/libs/xlsx/0.18.5/xlsx.full.min.js";
  var FIELDS = [["date", "Data e ora"], ["T", "Temperatura (°C)"], ["RH", "Umidità relativa (%)"], ["P", "Pioggia (mm)"], ["LW", "Bagnatura fogliare"], ["W", "Vento (m/s)"]];
  var V = { open: false, busy: false, msg: "", imp: null, detail: null };
  var cache = null, loading = false;

  /* ---------------- utilità ---------------- */
  function S() { return Q.getState(); }
  function M() { var s = S(); if (!s.meteo) s.meteo = { fc: "met", estPast: true, manual: false, loc: null, st: null, months: {} }; if (!s.meteo.months) s.meteo.months = {}; return s.meteo; }
  function esc(s) { return Q.esc(s == null ? "" : s); }
  function pad(n) { return String(n).padStart(2, "0"); }
  function hk(d) { return d.getFullYear() + "-" + pad(d.getMonth() + 1) + "-" + pad(d.getDate()) + "T" + pad(d.getHours()); }
  function hkDate(k) { return new Date(+k.slice(0, 4), +k.slice(5, 7) - 1, +k.slice(8, 10), +k.slice(11, 13)); }
  function addH(d, h) { return new Date(d.getTime() + h * 3600e3); }
  function nowH() { var d = new Date(); d.setMinutes(0, 0, 0); return d; }
  function n1(x) { return Q.num(x, 1); }
  function lsGet() { try { return JSON.parse(localStorage.getItem(CACHE_KEY) || "null"); } catch (e) { return null; } }
  function lsSet(v) { try { localStorage.setItem(CACHE_KEY, JSON.stringify(v)); } catch (e) {} }

  /* posizione: centro delle parcelle (vigne se ci sono), oppure quella indicata a mano */
  function location() {
    var m = M(), st = S();
    if (m.loc) return m.loc;
    if (!st.geo || !st.plots.length) return null;
    var list = st.plots.filter(function (p) { return p.vine; }); if (!list.length) list = st.plots;
    var pts = []; list.forEach(function (p) { pts = pts.concat(p.pts); });
    var b = Q.bbox(pts), x = (b.x0 + b.x1) / 2, y = (b.y0 + b.y1) / 2, G = st.geo, kx = Math.cos(G.lat0 * Math.PI / 180) * 111320;
    return { lat: G.lat0 - (y - G.oy) / 110574, lon: G.lon0 + (x - G.ox) / kx };
  }

  /* ---------------- dati della stazione ---------------- */
  function stationRec(k) { var mo = M().months[k.slice(0, 7)]; return mo ? mo[k] : null; }
  function stationRange() {
    var ks = []; Object.keys(M().months).forEach(function (m) { ks = ks.concat(Object.keys(M().months[m])); });
    if (!ks.length) return null; ks.sort(); return { from: ks[0], to: ks[ks.length - 1], n: ks.length };
  }

  /* ---------------- scaricamento ---------------- */
  function fetchJson(url) { return fetch(url, { credentials: "omit" }).then(function (r) { if (!r.ok) throw new Error("risposta " + r.status); return r.json(); }); }
  function loadOpenMeteo(loc, pastDays, fcDays) {
    var u = "https://api.open-meteo.com/v1/forecast?latitude=" + loc.lat.toFixed(4) + "&longitude=" + loc.lon.toFixed(4) +
      "&hourly=temperature_2m,relative_humidity_2m,precipitation,wind_speed_10m&wind_speed_unit=ms&timezone=auto&past_days=" + pastDays + "&forecast_days=" + fcDays;
    return fetchJson(u).then(function (j) {
      var h = j.hourly, out = {};
      h.time.forEach(function (t, i) { out[t.slice(0, 13)] = [h.temperature_2m[i], h.relative_humidity_2m[i], h.precipitation[i], null, h.wind_speed_10m[i], 1]; });
      return out;
    });
  }
  function loadMet(loc) {
    var u = "https://api.met.no/weatherapi/locationforecast/2.0/compact?lat=" + loc.lat.toFixed(4) + "&lon=" + loc.lon.toFixed(4);
    return fetchJson(u).then(function (j) {
      var out = {}, ts = (j.properties && j.properties.timeseries) || [];
      ts.forEach(function (e, i) {
        var d = new Date(e.time), det = (e.data.instant || {}).details || {}, n1h = e.data.next_1_hours, n6h = e.data.next_6_hours;
        var dur = n1h ? 1 : n6h ? 6 : 0, p = n1h ? n1h.details.precipitation_amount : n6h ? n6h.details.precipitation_amount : null;
        if (!dur) return;
        for (var k = 0; k < dur; k++) {
          var dd = addH(d, k);
          out[hk(dd)] = [det.air_temperature, det.relative_humidity, p == null ? null : p / dur, null, det.wind_speed, dur];
        }
      });
      return out;
    });
  }
  function refresh(force) {
    var loc = location(), m = M();
    if (!loc) return Promise.resolve(false);
    var key = loc.lat.toFixed(3) + "," + loc.lon.toFixed(3) + "," + m.fc + "," + (m.estPast ? 1 : 0);
    if (!cache) cache = lsGet();
    if (!force && cache && cache.key === key && Date.now() - cache.at < MAX_AGE) return Promise.resolve(true);
    if (loading || !navigator.onLine) return Promise.resolve(!!cache);
    loading = true; V.msg = "";
    var jobs = [];
    var wantPast = m.estPast ? 31 : 0;
    if (m.fc === "openmeteo") jobs.push(loadOpenMeteo(loc, wantPast, 8).then(function (d) { return { past: d, fc: d, src: "Open-Meteo" }; }));
    else {
      jobs.push(loadMet(loc).then(function (fc) { return { fc: fc, src: "MET Norway" }; }));
      if (wantPast) jobs.push(loadOpenMeteo(loc, wantPast, 1).then(function (d) { return { past: d }; }).catch(function () { return {}; }));
    }
    return Promise.all(jobs).then(function (res) {
      var c = { key: key, at: Date.now(), past: {}, fc: {}, fcSrc: "", loc: loc };
      res.forEach(function (r) { if (r.past) c.past = r.past; if (r.fc) { c.fc = r.fc; c.fcSrc = r.src; } });
      cache = c; lsSet(c); loading = false; apply(); return true;
    }).catch(function (e) {
      loading = false; V.msg = "Meteo non aggiornato: " + (e && e.message ? e.message : e) + ". Riprovo più tardi.";
      return !!cache;
    });
  }

  /* ---------------- serie oraria unita ---------------- */
  function rec(k) {
    var now = hk(nowH()), st = stationRec(k);
    if (st) return { T: st[0], RH: st[1], P: st[2], LW: st[3], W: st[4], src: "stazione" };
    if (!cache) return null;
    if (k < now) { var p = cache.past[k] || cache.fc[k]; if (p && M().estPast) return { T: p[0], RH: p[1], P: p[2], LW: null, W: p[4], src: "stima" }; return null; }
    var f = cache.fc[k] || cache.past[k];
    return f ? { T: f[0], RH: f[1], P: f[2], LW: null, W: f[4], src: "previsione" } : null;
  }
  function range(from, hours) { var out = []; for (var i = 0; i < hours; i++) { var d = addH(from, i), k = hk(d); out.push({ k: k, d: d, r: rec(k) }); } return out; }
  function wet(r) { if (!r) return 0; if (r.LW != null) return Math.max(0, Math.min(1, r.LW)); return (r.RH != null && r.RH >= 90) || (r.P != null && r.P >= 0.2) ? 1 : 0; }
  function sum(list, f) { return list.reduce(function (s, x) { return s + (x.r && f(x.r) != null ? f(x.r) : 0); }, 0); }
  function hasData(list) { return list.some(function (x) { return x.r; }); }

  /* pioggia caduta da una data (dalle 12 del giorno del trattamento ad adesso) */
  function rainSince(date) {
    var d0 = typeof date === "string" ? Q.parse(date) : new Date(date); d0.setHours(12, 0, 0, 0);
    var now = nowH(), h = Math.round((now - d0) / 3600e3); if (h <= 0) return 0; if (h > 24 * 120) h = 24 * 120;
    var list = range(d0, h), have = list.filter(function (x) { return x.r && x.r.P != null; }).length;
    if (!have || have / list.length < 0.8) return null; // dati troppo incompleti per dirlo
    return Math.round(sum(list, function (r) { return r.P; }) * 10) / 10;
  }
  function last(hours) { return range(addH(nowH(), -hours), hours); }
  function summary() {
    var l24 = last(24), l48 = last(48);
    if (!hasData(l24)) return null;
    var ts = l24.filter(function (x) { return x.r && x.r.T != null; }), rh = l24.filter(function (x) { return x.r && x.r.RH != null; });
    return {
      t: ts.length ? Math.round(ts.reduce(function (s, x) { return s + x.r.T; }, 0) / ts.length * 10) / 10 : null,
      rh: rh.length ? Math.round(rh.reduce(function (s, x) { return s + x.r.RH; }, 0) / rh.length) : null,
      wet: Math.round(l24.reduce(function (s, x) { return s + wet(x.r); }, 0)),
      rain48: Math.round(sum(l48, function (r) { return r.P; }) * 10) / 10,
      lwReal: l24.some(function (x) { return x.r && x.r.LW != null; }),
      src: l24.some(function (x) { return x.r && x.r.src === "stazione"; }) ? "stazione" : "stima"
    };
  }
  /* lunghezza dei germogli stimata dalla fase fenologica (cm) */
  var SHOOT = { riposo: 0, germ: 3, foglie: 12, grapp: 25, fior: 60, alleg: 90, chius: 120, invai: 120, matur: 120, cadu: 0 };
  function shootEstimate() {
    var best = null;
    S().plots.forEach(function (p) { if (!p.vine || !p.vine.phen || !p.vine.phen.length) return; var s = SHOOT[p.vine.phen[p.vine.phen.length - 1].st]; if (s != null && (best == null || s > best)) best = s; });
    return best;
  }
  /* compila i valori usati da difesa e rischi, se non sono stati scritti a mano */
  function apply() {
    var m = M(), s = S(), sm = summary(); if (!sm || m.manual) return;
    if (!s.weather) s.weather = {}; if (!s.vw) s.vw = {};
    if (sm.t != null) { s.weather.t = sm.t; s.vw.t = sm.t; }
    if (sm.rh != null) s.weather.rh = sm.rh;
    s.weather.wet = sm.wet; s.weather.rain = sm.rain48; s.vw.rain = sm.rain48;
    var sh = shootEstimate(); if (sh != null) s.vw.shoot = sh;
    Q.saveLocal ? Q.saveLocal() : null;
    Q.render();
  }

  /* ---------------- previsione: giorni, finestra utile, avvisi ---------------- */
  function days(n) {
    var d0 = new Date(), out = []; d0.setHours(0, 0, 0, 0);
    for (var i = 0; i < n; i++) {
      var l = range(addH(d0, 24 * i), 24), t = l.filter(function (x) { return x.r && x.r.T != null; }).map(function (x) { return x.r.T; });
      out.push({ d: addH(d0, 24 * i), min: t.length ? Math.min.apply(null, t) : null, max: t.length ? Math.max.apply(null, t) : null, p: hasData(l) ? Math.round(sum(l, function (r) { return r.P; }) * 10) / 10 : null, src: l.some(function (x) { return x.r && x.r.src === "stazione"; }) ? "stazione" : l.some(function (x) { return x.r && x.r.src === "previsione"; }) ? "previsione" : "stima" });
    }
    return out;
  }
  /* primo periodo asciutto di almeno 6 ore di giorno, con vento sotto 3 m/s, nei prossimi 5 giorni */
  function windowToTreat() {
    var l = range(nowH(), 24 * 5); if (!l.some(function (x) { return x.r && x.r.src === "previsione"; })) return null;
    var best = null, cur = null;
    for (var i = 0; i < l.length && !best; i++) {
      var x = l[i], r = x.r, h = x.d.getHours(), day = h >= 6 && h < 20;
      if (!r || r.src !== "previsione") { cur = null; continue; }
      var dry = r.P == null || r.P < 0.1, calm = r.W == null || r.W < 3;
      if (!dry || (day && !calm)) { if (cur && cur.n >= 6) best = cur; cur = null; continue; }
      if (day) { if (!cur) cur = { a: x.d, b: addH(x.d, 1), n: 0 }; cur.b = addH(x.d, 1); cur.n++; }
    }
    if (!best && cur && cur.n >= 6) best = cur;
    if (!best) return { none: true };
    var after = range(best.b, 72), rainIdx = after.findIndex(function (x) { return x.r && x.r.P >= 1; });
    best.nextRain = rainIdx >= 0 ? { d: after[rainIdx].d, mm: Math.round(sum(after.slice(rainIdx, rainIdx + 24), function (r) { return r.P; })) } : null;
    return best;
  }
  function maxTNext(daysN) { var t = range(nowH(), 24 * daysN).filter(function (x) { return x.r && x.r.T != null; }).map(function (x) { return x.r.T; }); return t.length ? Math.max.apply(null, t) : null; }

  /* ---------------- interfaccia ---------------- */
  function fmtH(d) { return Q.fmt(d) + " " + pad(d.getHours()) + ":00"; }
  function cardHtml(ctx) {
    var m = M(), loc = location();
    var h = '<div class="panel stack" style="margin-top:12px"><div class="row" style="justify-content:space-between"><h2>Meteo</h2><div class="row"><button class="btn sm" data-me="refresh" aria-label="Aggiorna il meteo">Aggiorna</button><button class="btn sm" data-me="open">Impostazioni</button></div></div>';
    if (!loc) return h + '<span class="small">Per il meteo automatico serve la posizione: posiziona gli appezzamenti sulla mappa satellitare oppure usa la posizione del telefono.</span><div><button class="btn sm primary" data-me="here">Usa la mia posizione</button></div>' + (V.open ? settingsHtml() : '') + '</div>';
    if (!cache) { refresh(false).then(function (ok) { if (ok) Q.render(); }); }
    var ds = days(7);
    if (!ds.some(function (d) { return d.max != null; })) {
      h += '<span class="small muted">' + (navigator.onLine ? 'Scarico i dati meteo…' : 'Nessuna connessione: i dati meteo arriveranno quando torna la rete.') + '</span>';
    } else {
      h += '<div class="strip">' + ds.map(function (d, i) { return '<div class="day' + (i === 0 ? ' today' : '') + '"><span>' + ["dom", "lun", "mar", "mer", "gio", "ven", "sab"][d.d.getDay()] + '</span><b class="mono" style="font-size:14px">' + (d.max != null ? Math.round(d.max) + '°' : '–') + '</b><span class="mono" style="font-size:11px;opacity:.8">' + (d.min != null ? Math.round(d.min) + '°' : '') + '</span><span class="mono" style="font-size:11px;font-weight:700">' + (d.p == null ? '' : d.p >= 0.5 ? n1(d.p) + ' mm' : '0') + '</span></div>'; }).join("") + '</div>';
      var w = windowToTreat();
      if (w && !w.none) h += '<div class="panel" style="background:var(--ok-bg);color:var(--accent);padding:10px 12px"><b>Finestra utile per trattare: ' + fmtH(w.a) + ' – ' + fmtH(w.b) + '</b><br><span class="small">' + w.n + ' ore asciutte di giorno, vento sotto 3 m/s' + (w.nextRain ? ', poi pioggia ' + Q.fmt(w.nextRain.d) + ' (circa ' + w.nextRain.mm + ' mm)' : '') + '.</span></div>';
      else if (w && w.none) h += '<div class="panel" style="background:var(--warn-bg);color:var(--warn);padding:10px 12px"><b>Nessuna finestra asciutta di 6 ore nei prossimi 5 giorni</b></div>';
      var mx = maxTNext(3); if (mx != null && mx > 30) h += '<div class="panel small" style="background:var(--warn-bg);color:var(--warn);padding:10px 12px">Previste massime di ' + Math.round(mx) + ' °C: con lo zolfo tratta nelle ore fresche.</div>';
      h += detailHtml();
    }
    var sr = stationRange(), sm = summary();
    h += '<span class="small muted">' + (sr ? 'Passato: stazione fino a ' + fmtH(hkDate(sr.to)) + (m.estPast ? ', poi stima Open-Meteo. ' : '. ') : m.estPast ? 'Passato: stima Open-Meteo (nessun dato della stazione). ' : '') + 'Previsione: ' + (cache && cache.fcSrc ? cache.fcSrc : (m.fc === "openmeteo" ? "Open-Meteo" : "MET Norway")) + (cache ? ', aggiornata alle ' + pad(new Date(cache.at).getHours()) + ':' + pad(new Date(cache.at).getMinutes()) : '') + '.</span>';
    if (m.manual) h += '<div class="row"><span class="small">I valori di difesa sono scritti a mano.</span><button class="btn sm" data-me="auto">Usa i dati automatici</button></div>';
    else if (sm) h += '<span class="small muted">Difesa compilata in automatico: media ' + (sm.t != null ? n1(sm.t) + ' °C' : '–') + ', pioggia 48 h ' + n1(sm.rain48) + ' mm, foglia bagnata ' + sm.wet + ' h' + (sm.lwReal ? ' (sensore)' : ' (stimata dall\'umidità)') + '.</span>';
    if (V.msg) h += '<span class="small" style="color:var(--warn)">' + esc(V.msg) + '</span>';
    h += '<span class="small muted">Dati: <a href="https://www.met.no/en" target="_blank" rel="noopener">MET Norway</a> e <a href="https://open-meteo.com" target="_blank" rel="noopener">Open-Meteo.com</a>, licenza CC BY 4.0.</span>';
    if (ctx === "vigna") h += incHtml();
    if (V.open) h += settingsHtml();
    return h + '</div>';
  }
  function detailHtml() {
    var from = addH(nowH(), -24), l = range(from, 72), W = 340, H = 120, L = 28, R = 8, T = 10, B = 22, bw = (W - L - R) / 72;
    var pmax = Math.max(2, Math.max.apply(null, l.map(function (x) { return x.r && x.r.P ? x.r.P : 0; })));
    var s = '<details class="panel" style="padding:8px 10px"' + (V.detail ? ' open' : '') + ' id="meDetail"><summary class="small">Ora per ora: ultime 24 ore e prossime 48</summary><svg viewBox="0 0 ' + W + ' ' + H + '" role="img" aria-label="Pioggia oraria e umidità, dalle ultime 24 ore alle prossime 48" style="width:100%;height:auto;display:block;margin-top:6px">';
    var y90 = T + (100 - 90) / 100 * (H - T - B);
    s += '<line x1="' + L + '" x2="' + (W - R) + '" y1="' + (H - B) + '" y2="' + (H - B) + '" stroke="var(--line)"/><line x1="' + L + '" x2="' + (W - R) + '" y1="' + y90 + '" y2="' + y90 + '" stroke="var(--line)" stroke-dasharray="3 3"/><text x="' + (L - 4) + '" y="' + (y90 + 4) + '" text-anchor="end" font-size="10" fill="var(--ink-2)">90%</text>';
    var nowX = L + 24 * bw; s += '<line x1="' + nowX + '" x2="' + nowX + '" y1="' + T + '" y2="' + (H - B) + '" stroke="var(--ink)" stroke-width="1"/><text x="' + (nowX + 3) + '" y="' + (T + 8) + '" font-size="10" fill="var(--ink)">ora</text>';
    l.forEach(function (x, i) { if (x.r && x.r.P > 0.05) { var hh = x.r.P / pmax * (H - T - B); s += '<rect x="' + (L + i * bw + 0.5) + '" y="' + (H - B - hh) + '" width="' + Math.max(1, bw - 1) + '" height="' + hh + '" fill="var(--serra)"/>'; } });
    var pts = l.map(function (x, i) { return x.r && x.r.RH != null ? (L + (i + 0.5) * bw).toFixed(1) + "," + (T + (100 - x.r.RH) / 100 * (H - T - B)).toFixed(1) : null; });
    var seg = [], cur = []; pts.forEach(function (p) { if (p) cur.push(p); else if (cur.length) { seg.push(cur); cur = []; } }); if (cur.length) seg.push(cur);
    seg.forEach(function (c) { s += '<polyline points="' + c.join(" ") + '" fill="none" stroke="var(--vigna)" stroke-width="1.8"/>'; });
    [0, 24, 48].forEach(function (i) { var d = addH(from, i); s += '<text x="' + (L + i * bw) + '" y="' + (H - 6) + '" font-size="10" fill="var(--ink-2)">' + ["dom", "lun", "mar", "mer", "gio", "ven", "sab"][d.getDay()] + ' ' + pad(d.getHours()) + '</text>'; });
    s += '<text x="' + (W - R) + '" y="' + (H - 6) + '" text-anchor="end" font-size="10" fill="var(--ink-2)">max ' + n1(pmax) + ' mm/h</text></svg>';
    s += '<div class="row small" style="gap:14px"><span><span class="dot" style="background:var(--serra);border-radius:2px"></span> pioggia</span><span><span class="dot" style="background:var(--vigna);height:3px;border-radius:2px"></span> umidità</span></div></details>';
    return s;
  }
  function settingsHtml() {
    var m = M(), sr = stationRange(), loc = location();
    var h = '<div class="panel stack" style="border:2px solid var(--accent);background:var(--surface-2)"><h3>Impostazioni meteo</h3>';
    h += '<div class="stack" style="gap:6px"><span class="small" style="font-weight:600">Previsione</span>' +
      '<label class="row small"><input type="radio" name="meFc" id="meFcMet" ' + (m.fc !== "openmeteo" ? "checked" : "") + '> MET Norway: gratuita anche per uso commerciale</label>' +
      '<label class="row small"><input type="radio" name="meFc" id="meFcOm" ' + (m.fc === "openmeteo" ? "checked" : "") + '> Open-Meteo: gratuita per uso non commerciale</label></div>';
    h += '<label class="row small" style="font-weight:600"><input type="checkbox" id="meEst"' + (m.estPast ? ' checked' : '') + '> Stima il passato con Open-Meteo dove mancano i dati della stazione</label>';
    h += '<div class="sep"></div><span class="small" style="font-weight:600">Stazione dell\'azienda</span>';
    h += sr ? '<span class="small">' + sr.n.toLocaleString("it-IT") + ' ore di dati, dal ' + fmtH(hkDate(sr.from)) + ' al ' + fmtH(hkDate(sr.to)) + (m.st && m.st.name ? ' · ' + esc(m.st.name) : '') + '.</span>' : '<span class="small muted">Nessun dato importato.</span>';
    h += '<span class="small muted">Da FieldClimate esporta i dati della stazione in CSV o Excel (anche orari o ogni 30 minuti) e importali qui. L\'app unisce i file, ricorda le colonne e sostituisce le stime con i dati misurati.</span>';
    h += '<div class="row"><label class="btn sm primary filebtn" for="meFile">Importa dati stazione<input id="meFile" type="file" accept=".csv,.txt,.xlsx,.xls,text/csv"></label>' + (sr ? '<button class="btn sm danger" data-me="clearSt">' + (V.confirm ? 'Tocca ancora' : 'Cancella i dati') + '</button>' : '') + '</div>';
    if (V.imp) h += importHtml();
    h += '<div class="sep"></div><span class="small">Posizione usata: ' + (loc ? loc.lat.toFixed(4) + ', ' + loc.lon.toFixed(4) + (m.loc ? ' (dal telefono)' : ' (centro delle parcelle)') : 'nessuna') + '</span><div class="row"><button class="btn sm" data-me="here">Usa la mia posizione</button>' + (m.loc ? '<button class="btn sm" data-me="locPlots">Usa il centro delle parcelle</button>' : '') + '</div>';
    h += '<div><button class="btn sm" data-me="close">Chiudi</button></div></div>';
    return h;
  }

  /* ---------------- import dei dati della stazione ---------------- */
  function loadScript(url, ok) { return ok() ? Promise.resolve() : new Promise(function (res, rej) { var sc = document.createElement("script"); sc.src = url; sc.onload = function () { ok() ? res() : rej(new Error("lettore non disponibile")); }; sc.onerror = function () { rej(new Error("serve la connessione la prima volta per leggere i file Excel")); }; document.head.appendChild(sc); }); }
  function parseCsv(text) {
    var lines = text.replace(/\r/g, "").split("\n").filter(function (l) { return l.trim(); }); if (!lines.length) return [];
    var sample = lines.slice(0, 10).join("\n"), sep = [";", "\t", ","].map(function (c) { return [c, (sample.match(new RegExp(c === "\t" ? "\t" : "\\" + c, "g")) || []).length]; }).sort(function (a, b) { return b[1] - a[1]; })[0][0];
    return lines.map(function (l) {
      var out = [], cur = "", q = false;
      for (var i = 0; i < l.length; i++) { var ch = l[i]; if (ch === '"') { if (q && l[i + 1] === '"') { cur += '"'; i++; } else q = !q; } else if (ch === sep && !q) { out.push(cur.trim()); cur = ""; } else cur += ch; }
      out.push(cur.trim()); return out;
    });
  }
  function readRows(file) {
    if (/\.xlsx?$/i.test(file.name)) {
      return loadScript(XLSX_URL, function () { return !!window.XLSX; }).then(function () { return file.arrayBuffer(); }).then(function (buf) {
        var wb = window.XLSX.read(buf, { type: "array", cellDates: true }), ws = wb.Sheets[wb.SheetNames[0]];
        return window.XLSX.utils.sheet_to_json(ws, { header: 1, raw: true, defval: "" }).map(function (r) { return r.map(function (c) { return c instanceof Date ? c : String(c).trim(); }); });
      });
    }
    return file.text().then(parseCsv);
  }
  function parseDate(v) {
    if (v instanceof Date) return v;
    var s = String(v).trim(), m;
    if ((m = /^(\d{4})[-\/.](\d{1,2})[-\/.](\d{1,2})[ T]+(\d{1,2}):(\d{2})/.exec(s))) return new Date(+m[1], +m[2] - 1, +m[3], +m[4], +m[5]);
    if ((m = /^(\d{1,2})[-\/.](\d{1,2})[-\/.](\d{2,4})[ T]+(\d{1,2}):(\d{2})/.exec(s))) { var y = +m[3]; if (y < 100) y += 2000; return new Date(y, +m[2] - 1, +m[1], +m[4], +m[5]); }
    if (/^\d{5}(\.\d+)?$/.test(s)) { var ser = parseFloat(s); return new Date(Math.round((ser - 25569) * 864e5) + new Date().getTimezoneOffset() * 6e4); }
    return null;
  }
  function numv(v) { if (v == null || v === "") return null; var x = parseFloat(String(v).replace(/\s/g, "").replace(",", ".")); return isFinite(x) ? x : null; }
  function guessCols(head) {
    var low = head.map(function (h) { return String(h).toLowerCase(); }), find = function (re, not) { for (var i = 0; i < low.length; i++) if (re.test(low[i]) && !(not && not.test(low[i]))) return i; return -1; };
    return {
      date: find(/date|data|time|ora/),
      T: find(/(air )?temp|temperatura/, /dew|rugiada|soil|suolo|min|max/),
      RH: find(/humid|umidit|\brh\b/, /soil|suolo|min|max/),
      P: find(/precip|rain|piogg/),
      LW: find(/leaf|bagnat|wet/),
      W: find(/wind|vento/, /dir|max|gust|raffic/)
    };
  }
  function headerRow(rows) { for (var i = 0; i < Math.min(rows.length, 15); i++) { var g = guessCols(rows[i]); if (g.date >= 0 && (g.T >= 0 || g.P >= 0)) return i; } return 0; }
  function sigOf(head) { return head.map(function (h) { return String(h).toLowerCase().replace(/\s+/g, " "); }).join("|").slice(0, 400); }
  function startImport(file) {
    V.imp = { busy: true, name: file.name }; Q.render();
    readRows(file).then(function (rows) {
      if (rows.length < 2) throw new Error("il file è vuoto");
      var hi = headerRow(rows), head = rows[hi].map(function (h, i) { return String(h || "colonna " + (i + 1)); }), st = M().st, sig = sigOf(head);
      var cols = st && st.sig === sig && st.cols ? st.cols : guessCols(head);
      var lwUnit = st && st.sig === sig && st.lwUnit ? st.lwUnit : (cols.LW >= 0 && /min/.test(String(head[cols.LW]).toLowerCase()) ? "min" : cols.LW >= 0 && /%/.test(head[cols.LW]) ? "pct" : "min");
      V.imp = { name: file.name, head: head, rows: rows.slice(hi + 1), cols: cols, sig: sig, lwUnit: lwUnit, remembered: !!(st && st.sig === sig) };
      V.open = true; Q.render();
    }).catch(function (e) { V.imp = null; V.msg = "File della stazione non letto: " + (e.message || e); Q.render(); });
  }
  function importHtml() {
    var I = V.imp; if (I.busy) return '<span class="small">Leggo ' + esc(I.name) + '…</span>';
    var opts = function (sel) { return '<option value="-1">Nessuna</option>' + I.head.map(function (h, i) { return '<option value="' + i + '"' + (i === sel ? ' selected' : '') + '>' + esc(h) + '</option>'; }).join(""); };
    var h = '<div class="panel stack" style="gap:8px"><b class="small">' + esc(I.name) + ' · ' + I.rows.length.toLocaleString("it-IT") + ' righe</b>' + (I.remembered ? '<span class="badge b-ok" style="align-self:flex-start">colonne ricordate</span>' : '<span class="small muted">Controlla quale colonna corrisponde a ogni dato.</span>');
    h += '<div class="grid2">' + FIELDS.map(function (f) { return '<label class="f">' + f[1] + '<select id="meCol-' + f[0] + '">' + opts(I.cols[f[0]]) + '</select></label>'; }).join("") + '</div>';
    if (I.cols.LW >= 0) h += '<label class="f">La bagnatura fogliare è espressa in<select id="meLwU"><option value="min"' + (I.lwUnit === "min" ? ' selected' : '') + '>minuti bagnati nell\'intervallo</option><option value="pct"' + (I.lwUnit === "pct" ? ' selected' : '') + '>percentuale (0-100)</option><option value="h"' + (I.lwUnit === "h" ? ' selected' : '') + '>ore (0-1 per ora)</option></select></label>';
    var r0 = I.rows[0] || [], ok = I.cols.date >= 0 && parseDate(r0[I.cols.date]);
    h += '<span class="small ' + (ok ? 'muted' : '') + '" style="' + (ok ? '' : 'color:var(--bad)') + '">Prima riga: ' + (ok ? fmtH(parseDate(r0[I.cols.date])) + (I.cols.T >= 0 ? ', ' + esc(r0[I.cols.T]) + ' °C' : '') + (I.cols.P >= 0 ? ', ' + esc(r0[I.cols.P]) + ' mm' : '') : 'non riesco a leggere la data: scegli la colonna giusta') + '</span>';
    return h + '<div class="row"><button class="btn sm primary" data-me="impOk">Importa</button><button class="btn sm" data-me="impCancel">Annulla</button></div></div>';
  }
  function readImpForm() { var I = V.imp; if (!I || I.busy) return; FIELDS.forEach(function (f) { var el = document.getElementById("meCol-" + f[0]); if (el) I.cols[f[0]] = +el.value; }); var u = document.getElementById("meLwU"); if (u) I.lwUnit = u.value; }
  function commitImport() {
    readImpForm(); var I = V.imp, c = I.cols, m = M();
    if (c.date < 0) { Q.toast("Scegli la colonna della data"); return; }
    var acc = {}, bad = 0, steps = [], prev = null;
    I.rows.forEach(function (r) {
      var d = parseDate(r[c.date]); if (!d || isNaN(d)) { bad++; return; }
      if (prev) steps.push(Math.abs(d - prev) / 6e4); prev = d;
      var k = hk(d), a = acc[k] || (acc[k] = { T: [], RH: [], P: 0, Pn: 0, LW: [], W: [] });
      var t = c.T >= 0 ? numv(r[c.T]) : null, rh = c.RH >= 0 ? numv(r[c.RH]) : null, p = c.P >= 0 ? numv(r[c.P]) : null, lw = c.LW >= 0 ? numv(r[c.LW]) : null, w = c.W >= 0 ? numv(r[c.W]) : null;
      if (t != null) a.T.push(t); if (rh != null) a.RH.push(rh); if (p != null) { a.P += p; a.Pn++; } if (lw != null) a.LW.push(lw); if (w != null) a.W.push(w);
    });
    steps.sort(function (x, y) { return x - y; }); var stepMin = steps.length ? steps[Math.floor(steps.length / 2)] || 60 : 60;
    var avg = function (l) { return l.length ? Math.round(l.reduce(function (s, x) { return s + x; }, 0) / l.length * 10) / 10 : null; }, n = 0;
    Object.keys(acc).forEach(function (k) {
      var a = acc[k], lw = null;
      if (a.LW.length) { var s = a.LW.reduce(function (x, y) { return x + y; }, 0); lw = I.lwUnit === "min" ? Math.min(1, s / 60) : I.lwUnit === "pct" ? Math.min(1, s / a.LW.length / 100) : Math.min(1, s / a.LW.length); lw = Math.round(lw * 100) / 100; }
      var mo = m.months[k.slice(0, 7)] || (m.months[k.slice(0, 7)] = {});
      mo[k] = [avg(a.T), avg(a.RH), a.Pn ? Math.round(a.P * 10) / 10 : null, lw, avg(a.W)]; n++;
    });
    m.st = { sig: I.sig, cols: I.cols, lwUnit: I.lwUnit, name: I.name.replace(/\.[^.]+$/, ""), step: stepMin, at: Date.now() };
    m.manual = false; V.imp = null; Q.save(); apply();
    Q.toast(n.toLocaleString("it-IT") + " ore importate" + (bad ? " (" + bad + " righe senza data valida saltate)" : ""));
    Q.render();
  }

  /* ---------------- azioni ---------------- */
  document.addEventListener("click", function (e) {
    var b = e.target.closest("[data-me]"); if (!b) return; e.preventDefault();
    var a = b.getAttribute("data-me"), m = M();
    if (a !== "clearSt") V.confirm = false;
    switch (a) {
      case "open": V.open = true; break;
      case "close": V.open = false; V.imp = null; break;
      case "refresh": V.msg = ""; refresh(true).then(function () { Q.render(); }); Q.toast("Aggiorno il meteo"); return;
      case "auto": m.manual = false; Q.save(); apply(); break;
      case "here":
        if (!navigator.geolocation) { Q.toast("Posizione non disponibile su questo dispositivo"); return; }
        navigator.geolocation.getCurrentPosition(function (p) { m.loc = { lat: p.coords.latitude, lon: p.coords.longitude }; Q.save(); refresh(true).then(function () { Q.render(); }); Q.render(); }, function () { Q.toast("Permesso di posizione negato"); }, { enableHighAccuracy: false, timeout: 15000 });
        return;
      case "locPlots": m.loc = null; Q.save(); refresh(true).then(function () { Q.render(); }); break;
      case "impOk": commitImport(); return;
      case "impCancel": V.imp = null; break;
      case "incAdd": V.incForm = !V.incForm; break;
      case "incSave": {
        var dv = (document.getElementById("meIncDate") || {}).value, mm = parseFloat(String((document.getElementById("meIncMm") || {}).value || "").replace(",", "."));
        if (!dv) { Q.toast("Scegli la data"); return; }
        m.events = (m.events || []).concat({ id: Q.uid(), date: dv, mm: isFinite(mm) ? mm : 0 }); m.hidden = (m.hidden || []).filter(function (x) { return x !== dv; });
        V.incForm = false; Q.save(); Q.toast("Evento aggiunto"); break;
      }
      case "incRows": { var ii = +b.getAttribute("data-i"); V.incRows = V.incRows === ii ? null : ii; break; }
      case "incDel": {
        var eid = b.getAttribute("data-id"), dd = b.getAttribute("data-d");
        if (eid) m.events = (m.events || []).filter(function (x) { return x.id !== eid; });
        else m.hidden = (m.hidden || []).concat(dd);
        V.incRows = null; Q.save(); Q.toast("Evento ignorato"); break;
      }
      case "clearSt": if (!V.confirm) { V.confirm = true; break; } V.confirm = false; m.months = {}; m.st = null; Q.save(); apply(); Q.toast("Dati della stazione cancellati"); break;
    }
    Q.render();
  });
  document.addEventListener("change", function (e) {
    var t = e.target, m = M();
    if (t.id === "meFile" && t.files && t.files[0]) { startImport(t.files[0]); return; }
    if (t.id === "meFcMet" || t.id === "meFcOm") { m.fc = t.id === "meFcOm" ? "openmeteo" : "met"; Q.save(); refresh(true).then(function () { Q.render(); }); return; }
    if (t.id === "meEst") { m.estPast = t.checked; Q.save(); refresh(true).then(function () { apply(); Q.render(); }); return; }
    if (t.id && t.id.indexOf("meCol-") === 0) { readImpForm(); Q.render(); }
  });
  document.addEventListener("toggle", function (e) { if (e.target && e.target.id === "meDetail") V.detail = e.target.open; }, true);
  window.addEventListener("online", function () { refresh(false).then(function (ok) { if (ok) Q.render(); }); });
  setInterval(function () { if (document.visibilityState === "visible") refresh(false).then(function (ok) { if (ok) Q.render(); }); }, 15 * 60 * 1000);

  function briefHtml() {
    var loc = location();
    if (!loc) return '<div class="panel small" style="margin-top:4px">Per il meteo automatico posiziona gli appezzamenti sulla mappa, oppure tocca <button class="btn sm" data-me="here">Usa la mia posizione</button></div>';
    if (!cache) { refresh(false).then(function (ok) { if (ok) Q.render(); }); }
    var ds = days(4); if (!ds.some(function (d) { return d.max != null; })) return '<div class="panel small muted">' + (navigator.onLine ? 'Scarico i dati meteo…' : 'Meteo non disponibile senza connessione.') + '</div>';
    var d0 = ds[0], w = windowToTreat(), sm = summary();
    var h = '<button class="item" data-act="homeGo" data-v="vigna:difesa" style="display:block"><div class="row" style="justify-content:space-between;flex-wrap:nowrap"><span><b style="font-family:var(--f-display);font-size:26px">' + (d0.max != null ? Math.round(d0.max) + '°' : '–') + '</b> <span class="muted">/ ' + (d0.min != null ? Math.round(d0.min) + '°' : '–') + '</span></span><span class="mono small">' + (d0.p != null ? n1(d0.p) + ' mm oggi' : '') + '</span></div>';
    h += '<div class="row small" style="margin-top:4px;gap:12px">' + ds.slice(1).map(function (d) { return '<span>' + ["dom", "lun", "mar", "mer", "gio", "ven", "sab"][d.d.getDay()] + ' <b class="mono">' + (d.max != null ? Math.round(d.max) + '°' : '–') + '</b>' + (d.p >= 0.5 ? ' · ' + n1(d.p) + ' mm' : '') + '</span>'; }).join("") + '</div>';
    if (w && !w.none) h += '<div class="small" style="margin-top:6px;color:var(--accent)"><b>Finestra utile:</b> ' + fmtH(w.a) + ' – ' + fmtH(w.b) + (w.nextRain ? ', poi pioggia ' + Q.fmt(w.nextRain.d) : '') + '</div>';
    else if (w && w.none) h += '<div class="small" style="margin-top:6px;color:var(--warn)">Nessuna finestra asciutta di 6 ore nei prossimi 5 giorni</div>';
    if (sm) h += '<div class="small muted" style="margin-top:4px">Ultime 24 h: media ' + (sm.t != null ? n1(sm.t) + ' °C' : '–') + ', foglia bagnata ' + sm.wet + ' h, pioggia 48 h ' + n1(sm.rain48) + ' mm</div>';
    return h + '</button>';
  }


  /* ---------------- incubazione della peronospora (tabella di Goidanich) ----------------
     Quota giornaliera di incubazione (%) per temperatura media del giorno, a passi di 0,25 °C,
     con umidità media sotto il 75% e dal 75% in su. Valori come riportati in:
     Pérez-Expósito et al., "VineSens: An Eco-Smart Decision-Support Viticulture System", Sensors 2017, 17(3), 465, tabella 1.
     Due valori sembrano refusi (16,50 °C sotto 75% = 6,3; 18,25 °C dal 75% = 15,2): tenuti come nella fonte. */
  var GOID = {
    "12.00": [0, 5.25], "12.25": [4.4, 5.75], "12.50": [4.7, 6.2], "12.75": [5, 6.7],
    "13.00": [5.3, 7.1], "13.25": [5.7, 7.7], "13.50": [6, 8], "13.75": [6.4, 8.5],
    "14.00": [6.6, 9], "14.25": [6.8, 9.4], "14.50": [7.1, 9.7], "14.75": [7.3, 10.2],
    "15.00": [7.6, 10.6], "15.25": [7.8, 10.8], "15.50": [8.1, 11.1], "15.75": [8.3, 11.3],
    "16.00": [8.5, 11.7], "16.25": [9, 12], "16.50": [6.3, 12.5], "16.75": [9.6, 12.9],
    "17.00": [10, 13.25], "17.25": [10.3, 13.6], "17.50": [10.5, 14.3], "17.75": [10.75, 14.75],
    "18.00": [11.1, 15.3], "18.25": [11.48, 15.2], "18.50": [11.7, 16], "18.75": [12.1, 16.3],
    "19.00": [12.5, 16.6], "19.25": [12.9, 17.5], "19.50": [13.4, 18.3], "19.75": [13.7, 19.3],
    "20.00": [14.2, 20], "20.25": [14.5, 20.5], "20.50": [14.8, 21], "20.75": [15, 21.5],
    "21.00": [15.3, 22.2], "21.25": [15.7, 22.2], "21.50": [16, 22.2], "21.75": [16.3, 22.2],
    "22.00": [16.6, 22.2], "22.25": [17, 22.2], "22.50": [17.3, 23.5], "22.75": [17.7, 24.4],
    "23.00": [18.1, 25], "23.25": [18.1, 25], "23.50": [18.1, 25], "23.75": [18.1, 25],
    "24.00": [18.1, 25], "24.25": [17.7, 24.3], "24.50": [17.3, 23.5], "24.75": [17, 23.2],
    "25.00": [16.6, 22.2]
  };
  var INC_MIN_RAIN = 10, INC_MIN_T = 10, INC_LOOKBACK = 30;
  /* quota del giorno: sotto 10 °C sviluppo fermo; tra 10 e 12 °C valore dei 12 °C (prudenza); da 25 °C valore dei 25 °C */
  function goidShare(t, rh) {
    if (t == null || t < INC_MIN_T) return 0;
    var q = t >= 25 ? 25 : t < 12 ? 12 : Math.floor(t * 4) / 4, row = GOID[q.toFixed(2)];
    return row ? row[rh != null && rh >= 75 ? 1 : 0] : 0;
  }
  function dayStats(d) {
    var l = range(d, 24), withT = l.filter(function (x) { return x.r && x.r.T != null; }), withRH = l.filter(function (x) { return x.r && x.r.RH != null; });
    if (withT.length < 18) return null;
    return {
      t: withT.reduce(function (s, x) { return s + x.r.T; }, 0) / withT.length,
      rh: withRH.length ? withRH.reduce(function (s, x) { return s + x.r.RH; }, 0) / withRH.length : null,
      p: sum(l, function (r) { return r.P; }),
      fc: l.some(function (x) { return x.r && x.r.src === "previsione"; })
    };
  }
  /* la vigna è in vegetazione con germogli di almeno 10 cm? (dalla fenologia; senza dati, aprile-settembre) */
  var ACTIVE = { foglie: 1, grapp: 1, fior: 1, alleg: 1, chius: 1, invai: 1, matur: 1 };
  function vegetating(date) {
    var vines = S().plots.filter(function (p) { return p.vine; }), any = false, known = false;
    var di = Q.iso(date);
    vines.forEach(function (p) {
      var ph = (p.vine.phen || []).filter(function (x) { return x.date <= di; }); if (!ph.length) return;
      known = true; if (ACTIVE[ph[ph.length - 1].st]) any = true;
    });
    if (known) return any;
    var m = date.getMonth(); return m >= 3 && m <= 8;
  }
  function incubations() {
    if (!S().plots.some(function (p) { return p.vine; })) return [];
    var m = M(), today0 = new Date(); today0.setHours(0, 0, 0, 0);
    var starts = [];
    for (var i = INC_LOOKBACK; i >= 1; i--) {
      var d = addH(today0, -24 * i), ds = dayStats(d);
      if (ds && ds.p >= INC_MIN_RAIN && ds.t >= INC_MIN_T && vegetating(d)) starts.push({ d: d, mm: Math.round(ds.p), auto: true });
    }
    (m.events || []).forEach(function (e) { var d = Q.parse(e.date); d.setHours(0, 0, 0, 0); if (today0 - d <= INC_LOOKBACK * 864e5 && !starts.some(function (s) { return Q.iso(s.d) === e.date; })) starts.push({ d: d, mm: e.mm, auto: false, id: e.id }); });
    (m.hidden || []).forEach(function (h) { starts = starts.filter(function (s) { return !(s.auto && Q.iso(s.d) === h); }); });
    starts.sort(function (a, b) { return a.d - b.d; });
    return starts.map(function (s) {
      var tot = 0, rows = [], end = null, endFc = false, missing = 0;
      for (var k = 1; k <= 40 && !end; k++) {
        var day = addH(s.d, 24 * k), ds = dayStats(day);
        if (!ds) { if (day < today0) { missing++; continue; } break; }
        var q = goidShare(ds.t, ds.rh); tot += q;
        rows.push({ d: day, t: ds.t, rh: ds.rh, q: q, tot: tot, fc: ds.fc || day >= today0 });
        if (tot >= 100) { end = day; endFc = ds.fc || day >= today0; }
      }
      var now = rows.filter(function (r) { return r.d < today0; }), done = now.length ? now[now.length - 1].tot : 0;
      return { start: s.d, mm: s.mm, auto: s.auto, id: s.id, pct: Math.min(100, Math.round(done)), end: end, endFc: endFc, rows: rows, missing: missing };
    }).filter(function (e) { return !e.end || e.endFc || (today0 - e.end) / 864e5 <= 7; });
  }
  function incAlerts() {
    return incubations().map(function (e) {
      var label = "pioggia del " + Q.fmt(e.start) + (e.mm ? " (" + e.mm + " mm)" : "");
      if (e.end && !e.endFc) return { lvl: 2, t: "Peronospora: incubazione finita, " + label, d: "Macchie d'olio possibili dal " + Q.fmt(e.end) + ": controlla le vigne e proteggi prima della prossima pioggia" };
      if (e.pct >= 80) return { lvl: e.pct >= 90 ? 2 : 1, t: "Peronospora: incubazione al " + e.pct + "%, " + label, d: e.end ? "Macchie d'olio attese il " + Q.fmt(e.end) : "Fine incubazione nei prossimi giorni" };
      return null;
    }).filter(Boolean);
  }
  function incHtml() {
    var list = incubations(), m = M();
    var h = '<div class="sep"></div><div class="row" style="justify-content:space-between"><h3>Incubazione peronospora</h3><button class="btn sm" data-me="incAdd">' + (V.incForm ? 'Chiudi' : 'Aggiungi evento') + '</button></div>';
    if (V.incForm) h += '<div class="grid2"><label class="f">Data della pioggia<input id="meIncDate" type="date" value="' + Q.iso(Q.today()) + '"></label><label class="f">Pioggia (mm)<input id="meIncMm" type="number" inputmode="decimal" step="any"></label></div><div><button class="btn sm primary" data-me="incSave">Aggiungi</button></div>';
    if (!list.length) return h + '<span class="small muted">Nessuna incubazione in corso. Un evento parte da solo dopo una pioggia di almeno ' + INC_MIN_RAIN + ' mm in un giorno, con media di almeno ' + INC_MIN_T + ' °C e vigne in vegetazione.</span>';
    list.forEach(function (e, i) {
      var c = e.end && !e.endFc ? "x" : e.pct >= 80 ? (e.pct >= 90 ? "x" : "w") : "";
      h += '<div class="panel stack" style="gap:6px;padding:10px 12px;background:var(--surface-2)"><div class="row" style="justify-content:space-between;flex-wrap:nowrap"><b>Pioggia del ' + Q.fmt(e.start) + (e.mm ? ' · ' + e.mm + ' mm' : '') + '</b><span class="badge ' + (c === "x" ? "b-bad" : c === "w" ? "b-warn" : "b-n") + '">' + (e.end && !e.endFc ? 'finita' : e.pct + '%') + '</span></div><div class="bar"><span class="' + c + '" style="width:' + (e.end && !e.endFc ? 100 : e.pct) + '%"></span></div>';
      h += '<span class="small">' + (e.end ? (e.endFc ? 'Fine incubazione prevista il <b>' + Q.fmt(e.end) + '</b> (con la previsione meteo)' : 'Incubazione finita il <b>' + Q.fmt(e.end) + '</b>: possibili macchie d\'olio') : 'Fine non ancora stimabile con i dati disponibili') + (e.missing ? '. Mancano i dati di ' + e.missing + (e.missing === 1 ? ' giorno' : ' giorni') : '') + '.</span>';
      h += '<div class="row"><button class="btn sm" data-me="incRows" data-i="' + i + '">' + (V.incRows === i ? 'Nascondi il calcolo' : 'Calcolo giorno per giorno') + '</button><button class="btn sm" data-me="incDel" data-d="' + Q.iso(e.start) + '"' + (e.id ? ' data-id="' + e.id + '"' : '') + '>Ignora</button></div>';
      if (V.incRows === i) h += '<div class="tablebox"><table class="reg"><thead><tr><th>Giorno</th><th>T media</th><th>Umidità</th><th>Quota</th><th>Totale</th></tr></thead><tbody>' + e.rows.map(function (r) { return '<tr' + (r.fc ? ' style="color:var(--ink-2)"' : '') + '><td class="mono">' + Q.fmt(r.d) + (r.fc ? '*' : '') + '</td><td class="mono">' + Q.num(r.t, 1) + '°</td><td class="mono">' + (r.rh != null ? Math.round(r.rh) + '%' : '–') + '</td><td class="mono">' + Q.num(r.q, 2) + '</td><td class="mono">' + Q.num(r.tot, 1) + '%</td></tr>'; }).join("") + '</tbody></table><span class="small muted">* giorno di oggi o previsto</span></div>';
      h += '</div>';
    });
    return h + '<span class="small muted">Tabella di Goidanich (valori dell\'articolo VineSens, Sensors 2017). Sotto 10 °C lo sviluppo si considera fermo, tra 10 e 12 °C vale il valore dei 12 °C, da 25 °C quello dei 25 °C.</span>';
  }

  window.QOMeteo = {
    cardHtml: cardHtml,
    briefHtml: briefHtml,
    incubations: incubations,
    incAlerts: incAlerts,
    rainSince: rainSince,
    summary: summary,
    markManual: function () { M().manual = true; },
    ready: function () { return !!summary(); }
  };
  cache = lsGet();
  refresh(false).then(function (ok) { if (ok) { apply(); Q.render(); } });
})();

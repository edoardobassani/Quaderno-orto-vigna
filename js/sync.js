/* Condivisione con Firebase: account, aziende, inviti, ruoli e dati in comune tra dispositivi.
   I dati restano anche sul telefono e si sincronizzano da soli quando torna la connessione.
   Senza configurazione in js/config.js l'app lavora solo sul dispositivo. */
import { firebaseConfig } from "./config.js";

const FB = "https://www.gstatic.com/firebasejs/10.12.2/";
const COLS = ["parcelle", "piani", "campioni", "segni", "impostazioni", "articoli", "movimenti", "meteo", "prodotti", "note"];
const ROLES = { titolare: "Titolare", collaboratore: "Collaboratore", lettura: "Sola lettura" };
const AKEY = "qo-azienda";
const META = ["modificato", "modificatoDa"];

const Sync = (window.QOSync = { active: false, push: () => {}, userName: () => "", recent: () => [] });
let A, F, auth, db, user = null;
let aziende = [], inviti = [], invitiAzienda = [], attivita = [];
let current = null;
let userSubs = [], azSubs = [];
let remote = {}, ready = {}, meta = {}, baseline = null, uploadPending = null;
let pushTimer = null, needApply = false;
let sheetOpen = false, msg = "", authMode = "login", confirmKey = null, busy = false;

const $ = (s) => document.querySelector(s);
const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
const clean = (o) => JSON.parse(JSON.stringify(o));
// Confronto indipendente dall'ordine delle chiavi (Firestore non lo conserva).
const stable = (o) => JSON.stringify(o, (k, v) => (v && typeof v === "object" && !Array.isArray(v) ? Object.keys(v).sort().reduce((r, x) => { r[x] = v[x]; return r; }, {}) : v));
const lsGet = (k) => { try { return localStorage.getItem(k); } catch (e) { return null; } };
const lsSet = (k, v) => { try { localStorage.setItem(k, v); } catch (e) {} };
const role = () => (current && user ? (current.data.membri || {})[user.uid] || null : null);
const myName = () => (user ? user.displayName || (user.email || "").split("@")[0] : "");
Sync.userName = () => (Sync.active ? myName() : "");
Sync.recent = () => (Sync.active ? attivita : []);
const QO = () => window.QO;
const errText = (e) => {
  const c = (e && e.code) || "";
  const m = {
    "auth/invalid-credential": "Email o password non corretti.",
    "auth/wrong-password": "Password non corretta.",
    "auth/user-not-found": "Non esiste un account con questa email.",
    "auth/email-already-in-use": "Esiste già un account con questa email: usa Accedi.",
    "auth/weak-password": "La password deve avere almeno 6 caratteri.",
    "auth/invalid-email": "L'indirizzo email non è valido.",
    "auth/popup-closed-by-user": "Accesso con Google annullato.",
    "auth/network-request-failed": "Nessuna connessione: riprova quando c'è rete.",
    "auth/too-many-requests": "Troppi tentativi: aspetta qualche minuto.",
    "permission-denied": "Non hai i permessi per questa operazione."
  };
  return m[c] || (e && e.message) || "Errore sconosciuto.";
};

/* ---------------- barra di stato ---------------- */
let status = { text: "Solo su questo dispositivo", cls: "" };
const CLOUD = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linejoin="round" aria-hidden="true"><path d="M7 18h10a4 4 0 0 0 .6-7.95A6 6 0 0 0 6.1 9.2 4.5 4.5 0 0 0 7 18Z"/></svg>';
function setStatus(text, cls) { status = { text, cls }; const el = $("#syncbar"); if (el) el.innerHTML = `<button type="button" class="cloudbtn" data-sa="open" aria-haspopup="dialog" aria-label="${esc(text)}" title="${esc(text)}">${CLOUD}<span class="syncdot ${cls}"></span></button>`; }
function refreshStatus() {
  if (!firebaseConfig) return setStatus("Solo su questo dispositivo", "");
  if (!auth) return;
  if (!user) return setStatus("Solo su questo dispositivo · Accedi", "");
  if (!current) return inviti.length ? setStatus("Hai un invito: tocca per accettarlo", "wait") : setStatus("Solo su questo dispositivo · scegli l'azienda", "");
  const pend = COLS.some((c) => meta[c] && meta[c].hasPendingWrites);
  const off = !navigator.onLine || COLS.some((c) => meta[c] && meta[c].fromCache);
  const ro = role() === "lettura" ? " · sola lettura" : "";
  setStatus(`${current.data.nome || "Azienda"} · ${pend ? "modifiche in attesa di rete" : off ? "senza connessione" : "sincronizzato"}${ro}`, pend || off ? "wait" : "ok");
}
window.addEventListener("online", refreshStatus);
window.addEventListener("offline", refreshStatus);

/* ---------------- avvio ---------------- */
async function init() {
  refreshStatus();
  if (!firebaseConfig) return;
  setStatus("Collegamento in corso…", "wait");
  try {
    const [appM, authM, fsM] = await Promise.all([import(FB + "firebase-app.js"), import(FB + "firebase-auth.js"), import(FB + "firebase-firestore.js")]);
    A = authM; F = fsM;
    const app = appM.initializeApp(firebaseConfig);
    auth = A.getAuth(app);
    try { db = F.initializeFirestore(app, { localCache: F.persistentLocalCache({ tabManager: F.persistentMultipleTabManager() }) }); }
    catch (e) { db = F.getFirestore(app); }
    A.getRedirectResult(auth).catch((e) => { msg = errText(e); renderSheet(); });
    A.onAuthStateChanged(auth, onUser);
  } catch (e) {
    setStatus("Cloud non raggiungibile: dati solo su questo dispositivo", "off");
  }
}

function stop(list) { list.forEach((u) => { try { u(); } catch (e) {} }); list.length = 0; }

function onUser(u) {
  user = u; stop(userSubs);
  if (!u) { leave(true); aziende = []; inviti = []; refreshStatus(); renderSheet(); return; }
  const qA = F.query(F.collection(db, "aziende"), F.where(`membri.${u.uid}`, "in", Object.keys(ROLES)));
  userSubs.push(F.onSnapshot(qA, (snap) => {
    aziende = snap.docs.map((d) => ({ id: d.id, data: d.data() })).sort((a, b) => (a.data.nome || "").localeCompare(b.data.nome || "", "it"));
    if (current) {
      const c = aziende.find((a) => a.id === current.id);
      if (c) { const wasOwner = role() === "titolare"; current = c; if (!wasOwner && role() === "titolare") watchInvites(); }
      else { msg = "Non fai più parte di questa azienda."; leave(true); }
    } else {
      const saved = lsGet(AKEY), pick = aziende.find((a) => a.id === saved) || (aziende.length === 1 && saved !== "local" ? aziende[0] : null);
      if (pick) enter(pick);
    }
    refreshStatus(); renderSheet();
  }, (e) => { msg = "Non riesco a leggere le aziende: " + errText(e); renderSheet(); }));
  if (u.email) {
    const qI = F.query(F.collection(db, "inviti"), F.where("email", "==", u.email.toLowerCase()));
    userSubs.push(F.onSnapshot(qI, (snap) => { inviti = snap.docs.map((d) => ({ id: d.id, data: d.data() })); refreshStatus(); renderSheet(); }, () => {}));
  }
  refreshStatus(); renderSheet();
}

/* ---------------- entrare e uscire da un'azienda ---------------- */
function enter(az, upload) {
  stop(azSubs); current = az; lsSet(AKEY, az.id);
  remote = {}; ready = {}; meta = {}; baseline = null; uploadPending = upload || null; attivita = []; invitiAzienda = [];
  QO().useKey("quaderno-orto-cloud-" + az.id);
  Sync.active = true;
  COLS.forEach((col) => {
    azSubs.push(F.onSnapshot(F.collection(db, "aziende", az.id, col), { includeMetadataChanges: true }, (snap) => {
      remote[col] = {}; snap.forEach((d) => { remote[col][d.id] = d.data(); });
      ready[col] = true; meta[col] = snap.metadata;
      applyAll(); refreshStatus();
    }, (e) => { msg = "Accesso ai dati negato: " + errText(e); refreshStatus(); renderSheet(); }));
  });
  azSubs.push(F.onSnapshot(F.query(F.collection(db, "aziende", az.id, "attivita"), F.orderBy("quando", "desc"), F.limit(15)), (snap) => {
    attivita = snap.docs.map((d) => d.data()); if (sheetOpen) renderSheet(); else QO().render();
  }, () => {}));
  watchInvites();
  refreshStatus(); renderSheet();
}
function watchInvites() {
  if (!current || role() !== "titolare") return;
  azSubs.push(F.onSnapshot(F.query(F.collection(db, "inviti"), F.where("aid", "==", current.id)), (snap) => {
    invitiAzienda = snap.docs.map((d) => ({ id: d.id, data: d.data() })); if (sheetOpen) renderSheet();
  }, () => {}));
}
function leave(toLocal) {
  stop(azSubs); clearTimeout(pushTimer); pushTimer = null;
  const was = !!current; current = null; Sync.active = false; baseline = null; uploadPending = null;
  if (toLocal && was) QO().useKey(null);
}

/* ---------------- dal cloud all'app ---------------- */
function decode() {
  const plots = Object.entries(remote.parcelle || {}).map(([id, d]) => {
    const p = { id, name: d.name || "Area", type: d.type || "campo", pts: (d.pts || []).map((q) => [q.x, q.y]), plants: d.plants || [] };
    if (d.ter) p.ter = d.ter;
    if (d.vine) p.vine = Object.assign({ phen: [] }, d.vine, { marks: {} });
    return p;
  }).sort((a, b) => a.name.localeCompare(b.name, "it"));
  const byId = {}; plots.forEach((p) => { byId[p.id] = p; });
  const marksMeta = {};
  Object.values(remote.segni || {}).forEach((s) => {
    const p = byId[s.plot]; if (!p || !p.vine) return;
    p.vine.marks[s.key] = s.stato;
    (marksMeta[s.plot] = marksMeta[s.plot] || {})[s.key] = { da: s.da || "", quando: s.quando && s.quando.toMillis ? s.quando.toMillis() : null };
  });
  const strip = (id, d) => { const o = Object.assign({ id }, d); META.forEach((k) => delete o[k]); return o; };
  const plans = Object.entries(remote.piani || {}).map(([id, d]) => { const o = strip(id, d); o.done = o.done || []; return o; });
  const samples = Object.entries(remote.campioni || {}).map(([id, d]) => strip(id, d));
  const g = (remote.impostazioni || {}).geo;
  const mg = (remote.impostazioni || {}).magazzino || {};
  const inv = {
    items: Object.entries(remote.articoli || {}).map(([id, d]) => strip(id, d)),
    moves: Object.entries(remote.movimenti || {}).map(([id, d]) => strip(id, d)),
    maps: mg.maps || {},
    fatture: mg.fatture || []
  };
  const ms = (remote.impostazioni || {}).meteo || null, months = {};
  Object.entries(remote.meteo || {}).forEach(([id, d]) => { months[id] = d.ore ? JSON.parse(d.ore) : {}; });
  const meteo = ms ? Object.assign({}, ms.cfg || {}, { months }) : (Object.keys(months).length ? { months } : null);
  const customProducts = {};
  Object.entries(remote.prodotti || {}).forEach(([id, d]) => { const o = Object.assign({}, d); META.forEach((k) => delete o[k]); customProducts[id] = o; });
  const tl = (remote.impostazioni || {}).terreni;
  const terreni = tl && tl.list ? tl.list.map((t) => ({ id: t.id, name: t.name, pts: t.pts ? t.pts.map((q) => [q.x, q.y]) : null })) : null;
  const notes = Object.entries(remote.note || {}).map(([id, d]) => strip(id, d)).sort((a, b) => (a.at < b.at ? -1 : 1));
  return { plots, plans, samples, geo: g && g.geo ? g.geo : null, marksMeta, inv, meteo, customProducts, notes, terreni };
}
function encode(S) {
  const out = { parcelle: {}, piani: {}, campioni: {}, segni: {}, impostazioni: {}, articoli: {}, movimenti: {}, meteo: {}, prodotti: {}, note: {} };
  (S.plots || []).forEach((p) => {
    const d = { name: p.name, type: p.type, pts: p.pts.map((q) => ({ x: q[0], y: q[1] })), plants: p.plants || [] };
    if (p.ter) d.ter = p.ter;
    if (p.vine) {
      const v = Object.assign({}, p.vine); delete v.marks; d.vine = v;
      Object.keys(p.vine.marks || {}).forEach((k) => { out.segni[p.id + "__" + k.replace(/:/g, "-")] = { plot: p.id, key: k, stato: p.vine.marks[k] }; });
    }
    out.parcelle[p.id] = clean(d);
  });
  (S.plans || []).forEach((pl) => { const d = Object.assign({}, pl); delete d.id; out.piani[pl.id] = clean(d); });
  (S.samples || []).forEach((s) => { const d = Object.assign({}, s); delete d.id; out.campioni[s.id] = clean(d); });
  (S.notes || []).forEach((n) => { const d = Object.assign({}, n); delete d.id; out.note[n.id] = clean(d); });
  out.impostazioni.geo = { geo: S.geo ? clean(S.geo) : null };
  out.impostazioni.terreni = clean({ list: (S.terreni || []).map((t) => ({ id: t.id, name: t.name, pts: t.pts ? t.pts.map((q) => ({ x: q[0], y: q[1] })) : null })) });
  const inv = S.inv || { items: [], moves: [] };
  inv.items.forEach((it) => { const d = Object.assign({}, it); delete d.id; out.articoli[it.id] = clean(d); });
  inv.moves.forEach((m) => { const d = Object.assign({}, m); delete d.id; out.movimenti[m.id] = clean(d); });
  out.impostazioni.magazzino = clean({ maps: inv.maps || {}, fatture: inv.fatture || [] });
  out.prodotti = {};
  Object.keys(S.customProducts || {}).forEach((id) => { out.prodotti[id] = clean(S.customProducts[id]); });
  out.meteo = {};
  if (S.meteo) {
    const cfg = Object.assign({}, S.meteo); delete cfg.months; delete cfg.manual;
    out.impostazioni.meteo = clean({ cfg });
    // dati orari della stazione: un documento per mese (le ore come testo, per stare nei limiti del database)
    Object.keys(S.meteo.months || {}).forEach((mo) => { out.meteo[mo] = { ore: JSON.stringify(S.meteo.months[mo]) }; });
  }
  return out;
}
function applyAll() {
  if (!current || !COLS.every((c) => ready[c])) return;
  if (pushTimer) { needApply = true; return; }
  if (uploadPending) {
    const d = uploadPending; uploadPending = null;
    baseline = encode({ plots: [], plans: [], samples: [], geo: null, inv: { items: [], moves: [] } });
    QO().applyRemote({ plots: d.plots || [], plans: d.plans || [], samples: d.samples || [], geo: d.geo || null, marksMeta: {}, inv: d.inv || { items: [], moves: [] }, notes: d.notes || [], terreni: d.terreni || [] });
    doPush(QO().getState(), true);
    return;
  }
  QO().applyRemote(decode());
  baseline = encode(QO().getState());
}

/* ---------------- dall'app al cloud ---------------- */
Sync.push = () => { if (!Sync.active || !baseline) return; clearTimeout(pushTimer); pushTimer = setTimeout(flush, 350); };
function flush() {
  pushTimer = null;
  if (!current) return;
  if (role() === "lettura") { QO().toast("Hai accesso in sola lettura: la modifica non viene salvata"); needApply = false; applyAll(); return; }
  doPush(QO().getState(), false);
  if (needApply) { needApply = false; applyAll(); }
}
function doPush(S, silent) {
  const next = encode(S), ops = [];
  COLS.forEach((col) => {
    const a = (baseline && baseline[col]) || {}, b = next[col];
    Object.keys(b).forEach((id) => { if (!a[id] || stable(a[id]) !== stable(b[id])) ops.push({ op: "set", col, id, data: b[id], prev: a[id] }); });
    Object.keys(a).forEach((id) => { if (!b[id]) ops.push({ op: "del", col, id, prev: a[id] }); });
  });
  baseline = next;
  if (!ops.length) return;
  const ts = F.serverTimestamp();
  for (let i = 0; i < ops.length; i += 400) {
    const batch = F.writeBatch(db);
    ops.slice(i, i + 400).forEach((o) => {
      const ref = F.doc(db, "aziende", current.id, o.col, o.id);
      if (o.op === "del") batch.delete(ref);
      else if (o.col === "segni") batch.set(ref, Object.assign({}, o.data, { da: myName(), uid: user.uid, quando: ts }));
      else batch.set(ref, Object.assign({}, o.data, { modificato: ts, modificatoDa: myName() }));
    });
    batch.commit().catch((e) => { QO().toast("Salvataggio rifiutato: " + errText(e)); });
  }
  if (!silent) logActivity(ops);
}
function logActivity(ops) {
  const pn = (id) => QO().plotName(id), items = [];
  ops.forEach((o) => {
    const d = o.data || {}, p = o.prev;
    if (o.col === "segni" && o.op === "set") { const k = d.key.split(":"); items.push(`${d.stato === "f" ? "Fallanza" : "Sintomi"} su ${pn(d.plot)}, filare ${+k[0] + 1}, ceppo ${+k[2] + 1}`); }
    if (o.col === "segni" && o.op === "del") items.push(`Segno tolto su ${pn(p.plot)}`);
    if (o.col === "piani" && o.op === "set" && p && (d.done || []).length > (p.done || []).length) items.push(`Trattamento fatto: ${QO().productName(d.prod)} su ${pn(d.plot)}`);
    if (o.col === "piani" && o.op === "set" && !p) items.push(`Trattamento programmato: ${QO().productName(d.prod)} su ${pn(d.plot)}`);
    if (o.col === "campioni" && o.op === "set" && !p) items.push(`Campionamento su ${pn(d.plot)}: ${d.brix} °Brix`);
    if (o.col === "parcelle" && o.op === "set" && !p) items.push(`Nuovo appezzamento: ${d.name}`);
    if (o.col === "parcelle" && o.op === "del") items.push(`Appezzamento eliminato: ${p.name}`);
    if (o.col === "movimenti" && o.op === "set" && !p) {
      const art = ((QO().getState().inv || {}).items || []).find((x) => x.id === d.item), nm = art ? art.name : "articolo", u = art ? art.unit : "";
      if (d.kind === "acquisto") items.push(`Acquisto: ${nm}, ${d.qty} ${u}`);
      else if (d.kind === "rettifica") items.push(`Conteggio in magazzino: ${nm}`);
      else if (d.kind === "uso") items.push(`Scarico: ${nm}, ${-d.qty} ${u}`);
    }
  });
  items.slice(0, 10).forEach((t) => F.addDoc(F.collection(db, "aziende", current.id, "attivita"), { testo: t, da: myName(), uid: user.uid, quando: F.serverTimestamp() }).catch(() => {}));
}

/* ---------------- pannello account ---------------- */
function renderSheet() {
  const el = $("#acct"); if (!el) return;
  el.hidden = !sheetOpen;
  if (!sheetOpen) { el.innerHTML = ""; return; }
  let h = '<div role="dialog" aria-modal="true" aria-labelledby="acctTitle"><div class="stack">';
  h += `<div class="row" style="justify-content:space-between"><h2 id="acctTitle">Account e azienda</h2><button class="btn sm" data-sa="close">Chiudi</button></div>`;
  h += `<div class="row" style="flex-wrap:nowrap;gap:8px"><span class="syncdot ${status.cls || ""}"></span><span>${esc(status.text || "")}</span></div>`;
  if (msg) h += `<div class="panel small" role="status">${esc(msg)}</div>`;
  if (!firebaseConfig) {
    h += '<div class="panel stack"><b>La condivisione non è ancora attiva.</b><span class="small">Per usare l\'app in più persone serve un progetto Firebase. Segui la guida nel file README del repository, poi incolla la configurazione in js/config.js.</span><span class="small muted">Nel frattempo tutto funziona su questo dispositivo.</span></div>';
  } else if (!auth) {
    h += '<div class="panel small">Non riesco a raggiungere il servizio. Controlla la connessione e riapri l\'app.</div>';
  } else if (!user) {
    h += authForm();
  } else {
    h += signedIn();
  }
  h += "</div></div>";
  const keep = {}, focused = document.activeElement && el.contains(document.activeElement) ? document.activeElement.id : null;
  el.querySelectorAll("input[id]").forEach((i) => { if (i.type !== "file") keep[i.id] = i.type === "checkbox" ? i.checked : i.value; });
  el.innerHTML = h;
  Object.keys(keep).forEach((id) => { const i = document.getElementById(id); if (!i) return; if (i.type === "checkbox") i.checked = keep[id]; else if (!i.value) i.value = keep[id]; });
  if (focused) { const f = document.getElementById(focused); if (f) f.focus(); }
}
function authForm() {
  const reg = authMode === "register";
  let h = '<div class="seg" role="group" aria-label="Accesso"><button data-sa="mode" data-v="login" aria-pressed="' + !reg + '">Accedi</button><button data-sa="mode" data-v="register" aria-pressed="' + reg + '">Crea account</button></div>';
  h += '<div class="panel stack">';
  if (reg) h += '<label class="f">Nome<input id="saName" autocomplete="name" placeholder="Come ti vedranno i colleghi"></label>';
  h += '<label class="f">Email<input id="saEmail" type="email" autocomplete="email" inputmode="email"></label>';
  h += `<label class="f">Password<input id="saPass" type="password" autocomplete="${reg ? "new-password" : "current-password"}"></label>`;
  h += `<div class="row"><button class="btn primary" data-sa="${reg ? "register" : "login"}"${busy ? " disabled" : ""}>${reg ? "Crea account" : "Accedi"}</button>${reg ? "" : '<button class="btn sm" data-sa="reset">Password dimenticata</button>'}</div>`;
  h += '</div><div class="panel stack"><button class="btn" data-sa="google">Accedi con Google</button><span class="small muted">Su iPhone, con l\'app installata sulla schermata Home, email e password funzionano meglio.</span></div>';
  return h;
}
function signedIn() {
  let h = `<div class="panel stack"><div class="row" style="justify-content:space-between"><div style="min-width:0"><b>${esc(myName())}</b><br><span class="small muted">${esc(user.email || "")}</span></div><button class="btn sm" data-sa="logout">Esci</button></div>`;
  if (user.email && !user.emailVerified) h += '<div class="small" style="color:var(--warn)">Conferma la tua email con il link che ti abbiamo mandato: serve per accettare gli inviti.</div><div class="row"><button class="btn sm" data-sa="verifyCheck">Ho confermato</button><button class="btn sm" data-sa="verifySend">Rimanda il link</button></div>';
  h += "</div>";
  if (inviti.length) {
    h += '<h3>Inviti ricevuti</h3><div class="list">' + inviti.map((i) => `<div class="panel stack" style="gap:8px"><span><b>${esc(i.data.nomeAzienda || "Azienda")}</b> ti ha invitato come <b>${esc(ROLES[i.data.ruolo] || i.data.ruolo)}</b>${i.data.invitatoDa ? " (da " + esc(i.data.invitatoDa) + ")" : ""}.</span><div class="row"><button class="btn sm primary" data-sa="accept" data-id="${esc(i.id)}">Accetta</button><button class="btn sm" data-sa="decline" data-id="${esc(i.id)}">Rifiuta</button></div></div>`).join("") + "</div>";
  }
  h += '<h3>Le tue aziende</h3><div class="list">';
  aziende.forEach((a) => { const r = a.data.membri[user.uid]; h += `<button class="item" data-sa="select" data-id="${esc(a.id)}"${current && current.id === a.id ? ' aria-current="true"' : ""}><span class="grow"><b>${esc(a.data.nome)}</b><br><span class="small muted">${esc(ROLES[r] || r)} · ${Object.keys(a.data.membri || {}).length} persone</span></span>${current && current.id === a.id ? '<span class="badge b-ok">in uso</span>' : ""}</button>`; });
  h += `<button class="item" data-sa="local"${!current ? ' aria-current="true"' : ""}><span class="grow"><b>Solo su questo dispositivo</b><br><span class="small muted">I dati locali, non condivisi</span></span>${!current ? '<span class="badge b-n">in uso</span>' : ""}</button></div>`;
  h += '<details class="panel"><summary>Crea una nuova azienda</summary><div class="stack" style="margin-top:8px"><label class="f">Nome dell\'azienda<input id="saAz" placeholder="es. Azienda agricola …"></label><label class="row small" style="font-weight:600"><input id="saUp" type="checkbox"> Carica nell\'azienda i dati che ci sono ora su questo dispositivo</label><div><button class="btn primary" data-sa="create">Crea azienda</button></div></div></details>';
  if (current) {
    const owner = role() === "titolare", info = current.data.membriInfo || {};
    h += `<h3>Persone in ${esc(current.data.nome)}</h3><div class="panel stack">`;
    Object.keys(current.data.membri || {}).forEach((uid) => {
      const r = current.data.membri[uid], me = uid === user.uid, nm = (info[uid] && (info[uid].nome || info[uid].email)) || "Utente";
      h += `<div class="row" style="justify-content:space-between"><div style="min-width:0;flex:1"><b>${esc(nm)}${me ? " (tu)" : ""}</b><br><span class="small muted">${esc((info[uid] && info[uid].email) || "")}</span></div>`;
      if (owner && !me) h += `<select id="saRole-${esc(uid)}" aria-label="Ruolo di ${esc(nm)}" style="width:auto">${Object.keys(ROLES).map((k) => `<option value="${k}"${k === r ? " selected" : ""}>${ROLES[k]}</option>`).join("")}</select><button class="btn sm danger" data-sa="remove" data-id="${esc(uid)}">${confirmKey === "rm-" + uid ? "Conferma" : "Togli"}</button>`;
      else h += `<span class="badge b-n">${esc(ROLES[r] || r)}</span>`;
      h += "</div>";
    });
    h += "</div>";
    if (owner) {
      h += '<div class="panel stack"><h3>Invita un collega</h3><div class="grid2"><label class="f">Email<input id="saInvEmail" type="email" inputmode="email"></label><label class="f">Ruolo<select id="saInvRole"><option value="collaboratore">Collaboratore</option><option value="lettura">Sola lettura</option><option value="titolare">Titolare</option></select></label></div><div><button class="btn primary" data-sa="invite">Invita</button></div><span class="small muted">Il collega apre l\'app, crea l\'account con questa stessa email e trova l\'invito qui.</span>';
      if (invitiAzienda.length) h += '<div class="sep"></div>' + invitiAzienda.map((i) => `<div class="row" style="justify-content:space-between"><span class="small">${esc(i.data.email)} · ${esc(ROLES[i.data.ruolo])} · in attesa</span><button class="btn sm" data-sa="revoke" data-id="${esc(i.id)}">Annulla invito</button></div>`).join("");
      h += "</div>";
    }
    if (attivita.length) {
      h += '<h3>Attività recenti</h3><div class="panel stack" style="gap:6px">' + attivita.map((a) => `<div class="small"><b>${esc(a.da)}</b> · ${esc(a.testo)}${a.quando && a.quando.toDate ? ' <span class="muted">· ' + a.quando.toDate().toLocaleString("it-IT", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" }) + "</span>" : ""}</div>`).join("") + "</div>";
    }
  }
  return h;
}

/* ---------------- azioni del pannello ---------------- */
const val = (id) => { const el = document.getElementById(id); return el ? el.value.trim() : ""; };
async function act(a, id) {
  msg = ""; if (a !== "remove") confirmKey = null;
  try {
    switch (a) {
      case "open": sheetOpen = true; break;
      case "close": sheetOpen = false; break;
      case "mode": authMode = id; break;
      case "login": {
        const email = val("saEmail"), pass = (document.getElementById("saPass") || {}).value || "";
        if (!email || !pass) { msg = "Scrivi email e password."; break; }
        busy = true; renderSheet();
        await A.signInWithEmailAndPassword(auth, email, pass); break;
      }
      case "register": {
        const name = val("saName"), email = val("saEmail"), pass = (document.getElementById("saPass") || {}).value || "";
        if (!email || !pass) { msg = "Scrivi email e password."; break; }
        busy = true; renderSheet();
        const cred = await A.createUserWithEmailAndPassword(auth, email, pass);
        if (name) await A.updateProfile(cred.user, { displayName: name }).catch(() => {});
        try { await A.sendEmailVerification(cred.user); msg = "Account creato. Ti abbiamo mandato un'email per confermare l'indirizzo: controlla anche lo spam."; }
        catch (e) { msg = "Account creato, ma l'email di conferma non è partita (" + errText(e) + "). Riprova con Rimanda il link."; }
        user = auth.currentUser; break;
      }
      case "reset": if (!val("saEmail")) { msg = "Scrivi prima la tua email."; break; } await A.sendPasswordResetEmail(auth, val("saEmail")); msg = "Ti abbiamo mandato un'email per scegliere una nuova password."; break;
      case "google": {
        const prov = new A.GoogleAuthProvider();
        try { await A.signInWithPopup(auth, prov); }
        catch (e) { if (/popup-blocked|operation-not-supported|cancelled-popup/.test(e.code || "")) await A.signInWithRedirect(auth, prov); else throw e; }
        break;
      }
      case "logout": leave(true); lsSet(AKEY, ""); await A.signOut(auth); break;
      case "verifySend": await A.sendEmailVerification(user); msg = "Link mandato di nuovo."; break;
      case "verifyCheck": await user.reload(); await user.getIdToken(true); user = auth.currentUser; msg = user.emailVerified ? "Email confermata." : "Non risulta ancora confermata: apri il link nell'email."; break;
      case "select": { const az = aziende.find((x) => x.id === id); if (az && (!current || current.id !== az.id)) { enter(az); sheetOpen = false; } break; }
      case "local": lsSet(AKEY, "local"); leave(true); refreshStatus(); break;
      case "create": {
        const nome = val("saAz"); if (!nome) { msg = "Dai un nome all'azienda."; break; }
        const up = document.getElementById("saUp").checked, st = QO().getState();
        const copy = up ? clean({ plots: st.plots, plans: st.plans, samples: st.samples || [], geo: st.geo || null, inv: st.inv || { items: [], moves: [] }, notes: st.notes || [], terreni: st.terreni || [] }) : null;
        const ref = await F.addDoc(F.collection(db, "aziende"), { nome, membri: { [user.uid]: "titolare" }, membriInfo: { [user.uid]: { nome: myName(), email: user.email || "" } }, creata: F.serverTimestamp() });
        enter({ id: ref.id, data: { nome, membri: { [user.uid]: "titolare" }, membriInfo: { [user.uid]: { nome: myName(), email: user.email || "" } } } }, copy);
        msg = "Azienda creata" + (up ? ": sto caricando i dati del dispositivo." : "."); break;
      }
      case "accept": {
        const inv = inviti.find((x) => x.id === id); if (!inv) break;
        if (!user.emailVerified) { msg = "Prima conferma la tua email: trovi il link nella posta."; break; }
        await F.updateDoc(F.doc(db, "aziende", inv.data.aid), { [`membri.${user.uid}`]: inv.data.ruolo, [`membriInfo.${user.uid}`]: { nome: myName(), email: user.email || "" } });
        await F.deleteDoc(F.doc(db, "inviti", inv.id)).catch(() => {});
        lsSet(AKEY, inv.data.aid); msg = "Invito accettato."; break;
      }
      case "decline": await F.deleteDoc(F.doc(db, "inviti", id)); break;
      case "invite": {
        const email = val("saInvEmail").toLowerCase(), ruolo = document.getElementById("saInvRole").value;
        if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) { msg = "Scrivi un indirizzo email valido."; break; }
        await F.setDoc(F.doc(db, "inviti", current.id + "_" + email), { aid: current.id, email, ruolo, nomeAzienda: current.data.nome, invitatoDa: myName(), quando: F.serverTimestamp() });
        msg = `Invito creato per ${email}. Mandagli il link dell'app: lo troverà dopo aver creato l'account con questa email.`; break;
      }
      case "revoke": await F.deleteDoc(F.doc(db, "inviti", id)); break;
      case "remove":
        if (confirmKey !== "rm-" + id) { confirmKey = "rm-" + id; break; }
        confirmKey = null;
        await F.updateDoc(F.doc(db, "aziende", current.id), { [`membri.${id}`]: F.deleteField(), [`membriInfo.${id}`]: F.deleteField() });
        break;
    }
  } catch (e) { msg = errText(e); }
  busy = false; refreshStatus(); renderSheet();
}
document.addEventListener("click", (e) => {
  const b = e.target.closest("[data-sa]"); if (!b) { if (e.target.id === "acct") { sheetOpen = false; renderSheet(); } return; }
  e.preventDefault(); act(b.getAttribute("data-sa"), b.getAttribute("data-id") || b.getAttribute("data-v"));
});
document.addEventListener("change", (e) => {
  const t = e.target; if (!t.id || t.id.indexOf("saRole-") !== 0 || !current) return;
  const uid = t.id.slice(7);
  F.updateDoc(F.doc(db, "aziende", current.id), { [`membri.${uid}`]: t.value }).catch((err) => { msg = errText(err); renderSheet(); });
});
document.addEventListener("keydown", (e) => { if (e.key === "Escape" && sheetOpen) { sheetOpen = false; renderSheet(); } });

init();

# Guida per gli assistenti AI (e per chi programma)

Questo file serve a qualsiasi assistente AI (Claude, ChatGPT/Codex, Gemini, Copilot, Cursor…) che lavori su questo repository. Leggilo tutto prima di cambiare il codice. `CLAUDE.md` e `GEMINI.md` rimandano qui.

## Il progetto in breve

**Quaderno orto e vigna** è una PWA per un'azienda vitivinicola biologica italiana. Il proprietario è Edo, vignaiolo, e non è un programmatore. La usano lui e i colleghi in campo dal telefono: Android con Chrome, e iPhone con Safari. Gestisce:

- vigna su **terreni** separati (corpi aziendali lontani tra loro), ciascuno con un **confine** e molte **terrazze**;
- filari e ceppi, fallanze, sintomi e rimpiazzi;
- fenologia e campioni di maturazione;
- trattamenti **solo biologici o biodinamici** con richiami, calcolo della botte e registro;
- orto con serre e campi;
- magazzino con lotti FIFO e fatture elettroniche;
- meteo e incubazione della peronospora;
- comandi vocali e note.

I dati sono condivisi fra i colleghi tramite Firebase, separati per azienda.

Pubblicata su GitHub Pages: https://edoardobassani.github.io/Quaderno-orto-vigna/ (repository `edoardobassani/Quaderno-orto-vigna`, ramo `main`, cartella principale).

## Vincoli decisi dal proprietario (non cambiarli senza chiedere)

1. **Niente AI dentro l'app e nessuna chiave API a pagamento o segreta.** Tutto funziona con regole fisse e servizi gratuiti senza chiave. Anche i comandi vocali usano solo il riconoscimento vocale del browser e un interprete a regole (`js/voce.js`).
2. **Trattamenti solo biologici o biodinamici.** Il catalogo e i calcoli (rame, zolfo, carenze) restano in questo ambito.
3. **Tutta l'interfaccia è in italiano**, con parole semplici da campo, frasi complete e nessun gergo tecnico informatico. Anche i commenti nel codice sono in italiano.
4. **Nessun passaggio di build.** HTML, CSS e JavaScript "vanilla" serviti così come sono. Niente npm, bundler o framework. Le librerie esterne si caricano da CDN con versione fissata (vedi sotto).
5. **Funziona senza connessione** in vigna: service worker, cache locale, Firestore con cache persistente.
6. **Valori della tabella di Goidanich** (incubazione peronospora, `js/meteo.js`, costante `GOID`): sono stati tenuti come trovati nella fonte (VineSens, Sensors 2017, tabella 1), compresi due valori sospetti (`"16.50"` e `"18.25"`). Il proprietario ha deciso di tenerli per ora: non correggerli di tua iniziativa.
7. **Niente dati di esempio.** L'app parte vuota; `stripSamples()` in `index.html` toglie quelli delle vecchie versioni (id `s1 s2 cn ce oc v1 v2` e articoli con nota "Dati di esempio"). Non reintrodurli.
8. **Barra in basso solo con icone**, sempre tutte visibili, con `aria-label` e `title` per l'accessibilità. **In alto**: a sinistra la nuvola con lo stato del cloud (pallino verde/arancio/rosso); a destra il microfono e **Aa** (dimensione dei testi), presenti in tutte le sezioni.

## Struttura dei file

| File | Cosa contiene |
|---|---|
| `index.html` | Tutto il nucleo: CSS, stato, geometria, viste (Oggi, Mappa, Orto, Vigna, Trattamenti, Libreria), gestione dei clic, oggetto `window.QO`. Lo script principale è una IIFE. |
| `js/sync.js` | Modulo ES: accesso Firebase (email/password e Google), aziende, inviti, ruoli, sincronizzazione con Firestore, pannello "Account e azienda", icona del cloud. Espone `window.QOSync`. |
| `js/config.js` | `firebaseConfig` del progetto `quaderno-orto-vigna`. Questi valori non sono segreti: la sicurezza sta in `firestore.rules`. |
| `js/mappa.js` | Mappa satellitare Leaflet (Esri World Imagery e OSM), GPS con media pesata, registrazione del perimetro camminando, foto aeree vostre (GeoTIFF, KMZ, world file). Espone `window.QOMap`. |
| `js/inventario.js` | Magazzino: articoli, movimenti, lotti FIFO, scorte minime, fatture FatturaPA XML/p7m, codici a barre. Espone `window.QOInv`. |
| `js/meteo.js` | Previsioni (MET Norway oppure Open-Meteo), dati passati stimati, import CSV/XLSX della stazione meteo, finestre di trattamento, dilavamento, incubazione della peronospora. Espone `window.QOMeteo`. |
| `js/prodotti.js` | Prodotti personalizzati (`S.customProducts`), ricerca per codice a barre su Open Products Facts, link alla banca dati del Ministero. Espone `window.QOProd`. |
| `js/voce.js` | Comandi vocali e note dettate, interprete a regole italiano. Espone `window.QOVoice`. |
| `js/terreni.js` | Terreni, confini, import guidato di confine e terrazze, riepilogo in Oggi. Espone `window.QOTer`. |
| `js/sfondo.js` | Sfondo fotografico per Direzione e Forma: riquadri Esri World Imagery o foto aeree dell'archivio IndexedDB `qo-foto` (le stesse della Mappa), messi nella SVG in metri locali con `S.geo`. `paint(g, view, kk)` rifà le immagini solo quando cambia il gruppo di riquadri. Scelta e trasparenza in localStorage (`qo-sfondo`, `qo-sfondo-op`). Espone `window.QOSfondo`; pulsanti con `data-sf`. |
| `js/bancali.js` | Bancali dentro un appezzamento dell'orto: `p.beds = [{id, name, crop, pts: [{x, y}]}]` (punti come oggetti per Firestore; sincronizzati in `parcelle`), divisione in strisce di larghezza scelta (`st: {deg, a, b}` ricorda la striscia, così la larghezza di un bancale si cambia dal centro con `setWidth`), coltura per bancale, riempimento a file lungo il bancale. Espone `window.QOBanc`; pulsanti con `data-bk`. |
| `js/colture.js` | Colture scritte a mano e correzioni a quelle pronte (`S.customCrops`, sincronizzate in `impostazioni/colture`). `mergeCrops()` in `index.html` ricostruisce `CROPS` da `CROPS_BASE` a ogni `render()`; le nuove hanno chiave `u_<id>`. Espone `window.QOColt`; pulsanti con `data-co`. |
| `js/alberi.js` | Alberi: chiome sulla pianta dell'Orto, schedina (`pl.t = {v, port, anno, notes, zone}`), schermata "Zona dell'albero" (`QO.ui.zedit`: cerchio, a punti, camminando, "Sono qui" con media pesata di 20 s) e alberi singoli (appezzamento `frutteto` con `single: true`, sincronizzato). Espone `window.QOAlb`; pulsanti con `data-al`. |
| `js/macchine.js` | Macchine per i trattamenti: `S.macchine = [{id, n, c, tank, water, plots: {idParcella: true}}]` (sincronizzate in `impostazioni/macchine`), assegnazione delle terrazze sulla mappa (`UI.macSel`), controllo di terrazze senza macchina o su più macchine, calcolo botte per macchina (`UI.botMac`, ricordata in localStorage `qo-botmac`) con cambi "solo per oggi" in `S.botte.oggi = {d, mac, t}`. `vBotte()` usa `QOMac.inCalc/water/tank`. Espone `window.QOMac`; pulsanti con `data-mc`. |
| `js/forma.js` | Schermata "Modifica forma" di una parcella già creata (vertici da trascinare, "+" sui lati, togli punto, sposta tutta, annulla). Stato in `QO.ui.fedit`; quando è aperta, `render()` mostra solo questa schermata. Espone `window.QOForma`. Attributo dei pulsanti: `data-fo`. |
| `js/filari.js` | Schermata "Direzione dei filari": filare guida disegnato col dito, camminato col GPS o ruotato; anteprima dal vivo. Stato in `QO.ui.gedit`. Espone `window.QOFil`. Attributo dei pulsanti: `data-fi`. |
| `sw.js` | Service worker (vedi "Pubblicare una modifica"). |
| `firestore.rules` | Regole di sicurezza del database. Si incollano a mano nella console Firebase. |
| `README.md` | Guida per gli utenti (in italiano). Quando aggiungi una funzione visibile, aggiungi o aggiorna la sezione corrispondente. |

Ordine degli script in fondo a `index.html`: sync.js (modulo), Leaflet, mappa.js, inventario.js, meteo.js, prodotti.js, voce.js, terreni.js, sfondo.js, filari.js, forma.js, bancali.js, colture.js, alberi.js, macchine.js, poi la registrazione del service worker. I moduli leggono e scrivono solo attraverso `window.QO`, e alla fine chiamano `Q.render()`.

### Librerie da CDN (versioni fissate)

| Libreria | Versione | Dove |
|---|---|---|
| Firebase JS SDK | 10.12.2 | www.gstatic.com |
| Leaflet | 1.9.4 | unpkg |
| geotiff | 2.1.3 | |
| proj4 | 2.11.0 | |
| JSZip | 3.10.1 | |
| SheetJS | 0.18.5 | |
| @zxing/library | 0.21.3 | |

Se aggiungi un host nuovo, aggiungilo anche a `LIB_HOSTS` in `sw.js`.

## Come funziona il nucleo (`index.html`)

- **Stato**: `S` è un oggetto unico salvato in `localStorage` con chiave `quaderno-orto-v1`. Quando si usa un'azienda nel cloud, la chiave è un'altra: vedi `QO.useKey`.
  - `S.plots`: appezzamenti, ciascuno `{id, name, type: serra|tunnel|campo|vigna, pts:[[x,y]...], plants, vine?, ter?}`.
  - `S.plans`: trattamenti programmati, `{id, prod, plot, start, every, count, rain, cu, done:[date]}`.
  - Altri campi: `S.samples`, `S.notes`, `S.terreni`, `S.inv`, `S.meteo`, `S.customProducts`, `S.botte`, `S.geo`.
- **Navigazione** (in `index.html`, dopo `render()`): `navLoc()` descrive la schermata (sezione, `vtab`, `vsel`, `osel`, albero, articolo del magazzino via `QOInv.loc/setLoc`); `navTrack()` a ogni render mette nella pila la schermata di prima con lo scorrimento; tutto si salva in localStorage `qo-nav` e `navRestore()` la riapre all'avvio. `navEditor()` elenca le schermate di modifica che "indietro" chiude: una nuova schermata di modifica va aggiunta lì. Il tasto indietro del telefono passa da `popstate` (una voce in più nella cronologia, rimessa da `navArm()`). La barra in alto è `position: sticky`: per questo `body` non ha altezza fissa.
- **Ordine dei nomi**: `natCmp()` ordina per il primo numero nel nome (`nameKey()`: numero e poi il resto, spazi e punti ignorati), così "T.1", "T. 2", "T. 5 N", "T.6 E", "T. 43" vanno in ordine anche se scritti diversamente; i nomi senza numero vanno in fondo. Si usa in tutti gli elenchi. In Vigna → Parcelle `UI.vord` (`"num"` o `"var"`, salvato in localStorage `qo-vord`) sceglie fra ordine per numero e raggruppamento per varietà (`p.vine.varieta`, con riepilogo di parcelle, ettari e ceppi); con più terreni e nessuno scelto si raggruppa prima per terreno.
- **Trattamento diviso per macchina** (da fare): un trattamento su più terrazze che si segna "fatto" per macchina, con date separate; registro, carenze e scarico dal magazzino devono restare per terrazza.
- **Schermi grandi** (da 1024 px): CSS in fondo all'ultimo `<style>` (`@media (min-width:1024px)`, deve stare dopo le regole normali) e `dkLayout()` in `index.html`, chiamata dopo aver scritto la pagina e prima di `afterRender()`: sposta i blocchi in `.dk-grid` (`.dk-main` con la mappa, `.dk-side` con la scheda, da `#vdet` o dal blocco dopo la mappa) oppure in `.dk-cols` (un riquadro per ogni `h2`). Sul telefono non fa niente. Le mappe delle schermate di modifica usano `QO.mapMaxAspect(svg)` per non essere più alte dello schermo. Una vista nuova funziona da sola se ha la mappa come blocco di primo livello e titoli `h2`.
- **Orto e vigna sono separati**: la sezione Orto usa solo gli appezzamenti non di vigna (`orti()`) e una scelta propria, `S.osel` (`ortoSel()`). `S.sel` resta la scelta della Mappa; la Vigna usa `UI.vsel`. Non mostrare parcelle di vigna nell'Orto. Le colture con `tree: true` (alberi, `isTree()`) si disegnano e si toccano tramite `js/alberi.js`; il tipo di appezzamento `frutteto` sta nell'Orto. Nelle etichette SVG con contorno (`paint-order="stroke"`) lo spessore va dato in metri (es. `3 * kk`), non fisso: con le viste piccole un valore fisso copre tutto.
- **Coordinate**: le forme sono in **metri locali** (x verso est, y verso sud). `S.geo = {lat0, lon0, ox, oy}` le collega a latitudine e longitudine:
  - `x = ox + (lon - lon0) * cos(lat0) * 111320`
  - `y = oy + (lat0 - lat) * 110574`

  Usa `ensureGeo()` e `llToPts()` per convertire.
- **Rendering**: `render()` ricostruisce `#app` con `innerHTML` dalla vista della sezione `UI.tab`. Poi `afterRender()` disegna le SVG e collega trascinamento e zoom (`bindPan`: un dito sposta, due dita o la rotella ingrandiscono, il tocco singolo chiama `onTap`). Le viste SVG hanno lo stato in `VIEWS[chiave]`.
- **Azioni**: i pulsanti hanno `data-act="nome"`. Il gestore unico dei clic cerca prima in `VACT` (vigna), poi negli altri gestori, e dopo l'azione esegue `render()`. I moduli usano attributi propri, che non vanno mischiati:
  - `data-vo`: voce;
  - `data-te`: terreni;
  - `data-mp`: mappa;
  - `data-sa`: sync;
  - `data-pr`: prodotti;
  - `data-fi`: direzione dei filari;
  - `data-fo`: modifica della forma;
  - `data-sf`: sfondo fotografico;
  - `data-bk`: bancali dell'orto;
  - `data-co`: colture scritte a mano;
  - `data-al`: alberi;
  - `data-mc`: macchine e calcolo botte.
- **Salvataggio**: `save()` salva in locale e, se c'è il cloud, chiama `QOSync.push(S)`. Dopo `save()` serve un `render()` esplicito.
- **Testi dinamici**: passa sempre per `esc()` prima di metterli nell'HTML.
- **Conferme**: niente `alert` o `confirm`. Per le azioni distruttive si usa il "tocca ancora", con `UI.confirm` o variabili simili. Per gli esiti si usa `toast()`.
- **Dimensione dei testi**: `zoom` CSS sulla radice (`qo-zoom` in localStorage). La mappa Leaflet compensa con `--mapz`. Le coordinate del tocco sulle SVG usano `getBoundingClientRect()`, quindi restano giuste a ogni zoom.

### Vigna: filari e ceppi (attenzione)

- `vineGeo(p)` genera i filari ed è in cache in `VC[p.id]`. La chiave della cache comprende forma, sesto, orientamento, modalità, numero di filari e filari a mano. Tre modalità (`p.vine.rmode`):
  - `auto`: dritti e paralleli. Per l'orientamento, se `oriAuto` è vero si usano i gradi del lato più lungo, altrimenti `ori`. Con `nrows > 0` i filari vengono distribuiti sulla larghezza.
  - `curva`: seguono la forma della terrazza. Il numero viene da `nrows`, oppure da larghezza media diviso distanza tra filari.
  - `man`: elenco `mrows: [{c: ceppi, len}]` disposto lungo la terrazza.
  - `guida` (predefinita per le parcelle nuove, `vineGeoGuide`): i filari sono copie parallele del filare guida `p.vine.guida` (punti `{x, y}`, salvati così per Firestore), distanti `inter`, tagliate dalla forma (`clipLine`, che ignora uscite più brevi di 3 m). Ogni punto può essere ad angolo (`{x, y, a: 1}`, in memoria `[x, y, 1]`): fra due punti ad angolo la linea è dritta, e dove un tratto dritto entra in una curva la curva parte tangente. Il filare guida passa per i punti con una curva morbida (`guideSmooth`) e ai capi viene prolungato continuando la sua curvatura; conta la forma, non la posizione. Senza `guida` si usa `defaultGuide` (linea di mezzo della terrazza). `grev` inverte la numerazione. Pezzi con meno di 4 ceppi e filari vuoti ai bordi vengono tolti. Le modalità `auto` e `curva` restano per le parcelle vecchie finché non si salva una direzione.
- I segni sui ceppi sono in `p.vine.marks` con chiave **`"filare:tratto:ceppo"`**, tutti contati da 0, e valore `f` (fallanza), `s` (sintomi) oppure `n` (rimpiazzato). **Se cambi la geometria di una parcella che ha segni, i segni restano sugli stessi indici ma su ceppi diversi.** Per questo `oriAuto` viene deciso una volta sola: è vero per le parcelle nuove e per quelle senza segni.
- La numerazione mostrata parte da `p.vine.r0`: usa `rowNo(p, indice)`. Funzioni comuni: `ceppoXY`, `rowLine`, `nearestCeppo` (per tocco, GPS e voce). Valgono per tutte le modalità: non ricalcolare la geometria a mano altrove.

## Cloud: Firebase e Firestore (`js/sync.js`)

- Struttura:
  - `aziende/{aid}`: contiene `membri {uid: ruolo}` e `membriInfo`;
  - sottoraccolte (`COLS`): `parcelle, piani, campioni, segni, impostazioni, articoli, movimenti, meteo, prodotti, note`, più `attivita` (registro, solo aggiunte);
  - `inviti/{aid}_{email}`.
- Ruoli: `titolare`, `collaboratore`, `lettura`. Per accettare un invito serve l'email verificata.
- `encode(S)` trasforma lo stato in documenti, `decode(remote)` fa il contrario. Il push manda solo le differenze rispetto a una baseline (confronto con chiavi ordinate, `stable()`).
- **Firestore non accetta array dentro array.** Per questo i punti si salvano come `{x, y}`: vale per `pts` delle parcelle e per i confini in `impostazioni/terreni`. Si possono usare array di oggetti che contengono array.
- Altri formati:
  - i segni sono documenti singoli `plotId__r-k-i` con `{plot, key, stato, da, uid, quando}`;
  - il meteo è un documento al mese, `{ore: stringa JSON}`;
  - `impostazioni` contiene i documenti `geo`, `terreni`, `magazzino` e `meteo`.
- Se aggiungi un dato da sincronizzare:
  - aggiungilo a `encode` e a `decode`;
  - se serve una raccolta nuova, aggiungila a `COLS`;
  - gestiscilo in `QO.applyRemote` in `index.html`;
  - copialo nei due punti del primo caricamento (cerca `notes: d.notes` e `notes: st.notes`).
- Se cambi `firestore.rules`, dillo esplicitamente: il proprietario deve incollarle a mano nella console Firebase.

## Servizi esterni e licenze

- **MET Norway** (previsioni): CC BY 4.0, uso gratuito anche commerciale. Va citata, e l'attribuzione è già presente.
- **Open-Meteo**: il piano gratuito è **solo non commerciale**. L'app lo propone come alternativa, con l'avviso.
- **Mappe**: Esri World Imagery e OpenStreetMap, con le attribuzioni di Leaflet.
- **Open Products Facts**: ricerca per codice a barre. Per le etichette dei fitofarmaci non esiste un'API gratuita, quindi si usano solo link alla banca dati del Ministero della Salute.
- Non aggiungere servizi che richiedono chiavi o account a pagamento.

## Provare le modifiche

Non c'è una suite di test, quindi si prova nel browser.

1. Servi la cartella: `python3 -m http.server 8765`, poi apri `http://127.0.0.1:8765/index.html` con il telefono simulato a 390×844.
2. Controlla la sintassi:
   - lo script inline di `index.html`: estrailo in un file `.js` e usa `node --check`;
   - i moduli: `node --check js/nome.js`;
   - `sync.js`: copialo come `.mjs` e poi `node --check`.
3. Con Playwright (Chromium headless) si possono:
   - bloccare o simulare le richieste esterne;
   - caricare file KML o GPX di prova con `set_input_files`;
   - simulare il GPS (`context.set_geolocation`);
   - controllare lo stato con `QO.getState()` e fare screenshot.
4. Verifica sempre:
   - nessun errore in console;
   - la vista a 390 px di larghezza;
   - il funzionamento con testi grandi (**Aa** al 120%);
   - che i tocchi sui ceppi cadano sul ceppo giusto.

## Pubblicare una modifica

1. **Aumenta `VERSION` in `sw.js`** (es. `qo-v17` → `qo-v18`), altrimenti i telefoni continuano a usare la versione vecchia. Se aggiungi un file JS, aggiungilo a `SHELL` in `sw.js` e come `<script>` in `index.html`.
2. Aggiorna `README.md` se cambia qualcosa che l'utente vede.
3. **Lavora su un ramo e apri una pull request verso `main`**: Edo la guarda e la unisce. Un push su `main` pubblica subito l'app per tutti, tramite GitHub Pages ("pages build and deployment", circa un minuto).
4. Descrivi la modifica in italiano semplice, come la vedrà chi usa l'app.

## Cose da tenere a mente

- La stessa azienda può essere aperta da più telefoni insieme: le modifiche vanno fatte per documento, e non bisogna riscrivere tutto lo stato.
- Molti dati vengono da file reali dei fornitori e delle stazioni meteo: la lettura deve essere tollerante (separatori, decimali con la virgola, intestazioni diverse).
- `index.html` è grande (circa 1.200 righe dense). Cerca le funzioni per nome (`function vParcelle`, `function vineGeo`, `VACT`, `afterRender`, `window.QO=`) invece di leggerlo tutto.
- Accessibilità:
  - pulsanti veri (`<button>`), con `aria-label` sulle icone;
  - aree di tocco di almeno 44 px;
  - contrasto adeguato anche al sole.

## Lavori aperti (in ordine di priorità indicato dal proprietario)

1. **Meteo per terreno.** I due terreni sono a circa 10 km in linea d'aria e a quote molto diverse. Servono previsioni e incubazione della peronospora separate per ciascun terreno, e la stazione meteo va assegnata al terreno dove si trova. Oggi `js/meteo.js` ha un'unica posizione (`S.meteo.loc`) e una sola cache.
2. **Trattamenti per terreno o gruppo di terrazze**, invece che uno per terrazza. Oggi `plan.plot` è una sola parcella, e molte viste usano `plotById(plan.plot)`.
3. Idee di esperienza d'uso proposte e non ancora fatte:
   - scheda della parcella a pagina intera, con sezioni richiudibili;
   - segnare un ceppo toccandolo, con un pannello di azioni e "Annulla", invece delle modalità;
   - Oggi più decisa ("oggi si può trattare?" per ciascun terreno);
   - moduli più corti, con "Altri dati" richiudibile;
   - tema ad alto contrasto per il sole e tema scuro;
   - "cosa è cambiato da ieri" fra colleghi.
4. Filare guida: eventuale secondo filare guida (primo e ultimo filare, con sfumatura fra i due) per le terrazze larghe con curve diverse a monte e a valle. Il filare guida camminato col GPS c'è già (`qo-v18`).

# Diario di sviluppo: da dove ripartire

Questo file serve a riprendere lo sviluppo in una nuova conversazione con un assistente AI. Va letto **insieme ad [AGENTS.md](AGENTS.md)**, che descrive il progetto, i vincoli e l'architettura. Qui ci sono il modo di lavorare con Edo, cosa è stato fatto, le decisioni prese e cosa resta da fare.

Ultimo aggiornamento: 8 novembre 2026, versione `qo-v17`.

## Come iniziare una nuova conversazione

Messaggio da incollare all'inizio:

> Continuiamo lo sviluppo della mia app Quaderno orto e vigna. Il codice è nel repository GitHub `edoardobassani/Quaderno-orto-vigna`: aggiungilo alla sessione, leggi `AGENTS.md` e `SVILUPPO.md` e poi dimmi da cosa ripartiamo.

## Come lavorare con Edo

- **Parlare sempre in italiano**, in modo semplice. Edo è vignaiolo, non programmatore: spiegare cosa cambia per chi usa l'app, non come è fatto il codice.
- **Per le novità, prima far vedere e poi fare.** Di solito Edo chiede "fammi vedere come lo faresti" e preferisce vedere **come verrebbe nell'app vera**: modifiche fatte in locale, provate, e screenshot dell'app a 390 px. Solo dopo il suo "ok, pubblica" si pubblica. Quando invece dice "implementa" o "procedi", si implementa e si pubblica direttamente.
- Prima di pubblicare, provare sempre in Chrome headless con Playwright (vedi AGENTS.md, "Provare le modifiche").
- **Pubblicare** significa:
  1. aumentare `VERSION` in `sw.js`;
  2. aggiornare `README.md`;
  3. fare commit e push su `main`;
  4. aspettare che finisca il workflow "pages build and deployment";
  5. dire a Edo di chiudere e riaprire l'app.
- Commit a nome di Edo: `git -c user.name="Edoardo Bassani" -c user.email="1edoardo.bassani@gmail.com" commit`. Edo è il proprietario e può pubblicare direttamente su `main`; il collaboratore invece lavora con pull request.
- Alla fine di ogni lavoro, dire in breve: cosa è cambiato, cosa è stato provato e cosa **non** è stato possibile provare.
- Firebase: Edo è l'unico con accesso alla console (progetto `quaderno-orto-vigna`). Se cambiano le regole (`firestore.rules`), le deve incollare lui in **Firestore → Regole → Pubblica**. Tra i domini autorizzati c'è già `edoardobassani.github.io`.

## L'azienda di Edo (contesto utile)

- **Due terreni** separati, a circa 10 km in linea d'aria e a **quote molto diverse**.
- Nel terreno principale ci sono **43 terrazze**, ognuna con un numero di filari diverso (da 2 a 30) e con numerazioni proprie.
- Edo ha (o avrà) i file GPS del confine e delle terrazze, ma vuole poter fare tutto anche a mano.
- Ha una **stazione meteo** (FieldClimate), da cui può esportare i dati.
- Usa Android; i colleghi usano anche iPhone. Un amico potrebbe usare lo stesso progetto Firebase con la sua azienda.
- Un collaboratore potrà modificare il codice con la sua AI, tramite pull request.

## Cosa c'è già (per versione)

| Versione | Contenuto |
|---|---|
| fino a `qo-v12` | Orto (serre, campi, piante e sesti), vigna (parcelle, filari, ceppi, fallanze, sintomi, rimpiazzi, fenologia, maturazione, botte, registro), trattamenti biologici con richiami e carenze, libreria prodotti, mappa satellitare con GPS e foto aeree, cloud con aziende, inviti e ruoli, magazzino con fatture, meteo e peronospora, schermata Oggi. |
| `qo-v13` | Catalogo prodotti ampliato, prodotti personalizzati con codice a barre, dimensione di testi e riquadri (**Aa**, in alto a destra in tutte le sezioni). |
| `qo-v14` | Comandi vocali e note con posizione (microfono in alto accanto ad **Aa**). |
| `qo-v15` | Terreni con confine; import guidato di confine e terrazze; filari "lungo la terrazza" e "inseriti a mano"; numerazione del primo filare; filtro per terreno; Oggi riassunta per terreno. |
| `qo-v16` | Zoom con due dita sulle mappe SVG; numero di filari scritto a mano; filari paralleli al lato più lungo per impostazione predefinita. |
| `qo-v17` | Ricerca delle parcelle; mappa del terreno toccabile in Vigna; **Dove sono** col GPS; barra in basso solo con icone; nuvola dello stato del cloud in alto a sinistra; via i dati di esempio (anche dal cloud); guida "Per iniziare" al primo avvio. |

## Decisioni prese (con il perché)

- **Niente AI e niente chiavi API nell'app**: Edo non le vuole. Per questo il riconoscimento delle fatture è a regole e la voce usa solo il browser.
- **Meteo**: MET Norway come fonte predefinita, perché si può usare anche in un'attività commerciale. Open-Meteo resta come alternativa, con l'avviso che è solo per uso non commerciale. I dati della stazione si importano da CSV o XLSX, e le colonne riconosciute vengono ricordate.
- **Peronospora (Goidanich)**:
  - tabella tenuta come trovata, compresi due valori sospetti;
  - sotto i 10 °C l'incubazione non avanza;
  - fra 10 e 12 °C si usa la riga dei 12 °C;
  - da 25 °C in su si usa la riga dei 25 °C;
  - l'incubazione parte con almeno 10 mm di pioggia e temperatura media di almeno 10 °C, solo se le viti sono in vegetazione (non in riposo e non a caduta foglie).
- **Orientamento dei filari**:
  - le parcelle nuove li hanno paralleli al lato più lungo;
  - quelle esistenti mantengono il loro orientamento se hanno già segni sui ceppi, altrimenti i segni finirebbero su altri ceppi. Il campo `oriAuto` si decide una volta sola.
- **Terrazze curve**: i filari stanno alla stessa frazione della larghezza lungo tutta la terrazza. La larghezza media è calcolata come superficie divisa per la lunghezza della linea di mezzo.
- **Import di confine e terrazze**:
  - la forma più grande che contiene almeno metà delle altre è proposta come confine;
  - reimportando, le terrazze con lo stesso nome nello stesso terreno vengono solo aggiornate nella forma.
- **Voce**:
  - la parcella si riconosce dal nome (anche "terrazza 12", senza confonderla con "terrazza 1"), poi dal GPS, poi dalla parcella aperta;
  - niente viene salvato senza **Conferma**;
  - una frase non riconosciuta viene proposta come nota.
- **Barra in basso**: solo icone, tutte e sei visibili (Oggi, Mappa, Orto, Vigna, Trattamenti, Magazzino). La Libreria si apre da Trattamenti e da Oggi.

## Da verificare (non provato in automatico)

- La **mappa satellitare Leaflet** con le novità (confini dei terreni tratteggiati, nomi delle terrazze posizionati con `L.tooltip` a parte, centratura sul terreno scelto, "Cammina il confine"). Nel browser di prova Leaflet non si carica perché la CDN è bloccata, quindi va controllata sul telefono.
- Il **riconoscimento vocale** reale: Chrome su Android richiede la rete; su iPhone dipende dalla versione di iOS, e se manca resta il campo di testo con il microfono della tastiera.
- L'import dei **file GPS veri** di Edo: finora è stato provato solo con file KML inventati.

## Prossimi passi (in ordine)

1. **Meteo per terreno.** Ogni terreno avrà:
   - una sua posizione: il centro del confine o delle sue parcelle;
   - previsioni e dati passati con cache separata;
   - una sua incubazione della peronospora.

   La stazione meteo va assegnata a un terreno; per l'altro si usano le stime. In Oggi va mostrato il meteo di ogni terreno, e in Difesa i rischi devono usare il meteo del terreno della parcella. Punto di partenza: `js/meteo.js`, che oggi ha `S.meteo.loc` unico, `location()`, la cache e `rec()`.
2. **Trattamenti per terreno o gruppo di terrazze.** Un trattamento programmato deve poter valere per un intero terreno o per una selezione di terrazze, invece di 43 programmi separati. Bisogna toccare:
   - `plan.plot` (oggi un solo id);
   - le viste che usano `plotById(plan.plot)`;
   - `carenzaFor`;
   - registro;
   - botte;
   - scarico dal magazzino;
   - la voce ("trattamento fatto rame terreno principale").
3. Altre idee di esperienza d'uso già proposte a Edo (non ancora scelte):
   - scheda della parcella a pagina intera;
   - segnare un ceppo toccandolo, con un pannello di azioni e "Annulla" invece delle modalità;
   - Oggi più decisa;
   - moduli più corti;
   - temi ad alto contrasto e scuro;
   - "cosa è cambiato da ieri".
4. Filari registrati camminando col GPS, per terrazze molto irregolari.

## Strumenti di prova usati

- Server: `python3 -m http.server 8765` dalla cartella del repository.
- Playwright (Python) con Chrome headless a 390×844 e `device_scale_factor=2`.
- Le richieste a domini esterni vengono bloccate, oppure simulate con JSON di prova (es. le risposte di MET Norway e Open-Meteo).
- File KML di prova generati al momento con Python:
  - un confine più terrazze ad arco (archi di corona circolare larghi 3–20 m, divisi in 43 pezzi);
  - un secondo terreno a circa 10 km.
- Per simulare il GPS: `context.set_geolocation`, con la conversione inversa da `S.geo`.
- Per simulare le due dita: `PointerEvent` con due `pointerId` mandati alla SVG.

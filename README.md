# Quaderno dell'orto e della vigna

App per gestire orto e vigna dal telefono: appezzamenti disegnati o importati da GPS, filari e ceppi, trattamenti biologici con carenze e ricorrenze, calcolo della botte, registro dei trattamenti e curve di maturazione.

È una PWA: si apre dal browser e si installa sulla schermata Home, su Android e su iPhone. Funziona anche senza connessione.

## Come funziona la condivisione

- Senza configurazione l'app lavora **solo sul dispositivo**.
- Con Firebase configurato, ogni persona crea un account. Il titolare crea l'**azienda** e invita i colleghi via email.
- Solo i membri dell'azienda vedono i suoi dati. Chi apre l'app senza invito non vede nulla.
- I dati restano anche sul telefono: in vigna senza segnale si lavora lo stesso, e le modifiche partono quando torna la rete.
- Ogni segno sui ceppi registra chi l'ha messo e quando.

Ruoli:

| Ruolo | Cosa può fare |
|---|---|
| Titolare | Tutto, compresi inviti e ruoli |
| Collaboratore | Lavora sui dati: segni, trattamenti, campionamenti, parcelle |
| Sola lettura | Consulta e basta |

## Struttura

| File | Contenuto |
|---|---|
| `index.html` | L'app |
| `js/mappa.js` | Mappa satellitare, posizione GPS, foto aeree importate |
| `js/inventario.js` | Magazzino: articoli, lotti, movimenti, avvisi |
| `js/meteo.js` | Meteo: previsione, stima del passato, dati della stazione |
| `js/prodotti.js` | Prodotti inseriti a mano e da codice a barre |
| `js/sync.js` | Account, aziende, inviti e sincronizzazione con Firebase |
| `js/config.js` | Configurazione del progetto Firebase (da compilare) |
| `firestore.rules` | Regole di sicurezza del database |
| `sw.js` | Uso senza connessione |
| `manifest.webmanifest`, `icons/` | Installazione sulla schermata Home |

## Mappa satellitare e GPS

- **Sfondo**: foto satellitare (Esri) o mappa stradale (OpenStreetMap), con il selettore in alto a destra. I riquadri già visti restano salvati per l'uso senza rete.
- **Posizionare gli appezzamenti**: quelli disegnati a mano non hanno coordinate. Si posizionano una volta con "Posiziona sulla mappa", poi si corregge con le frecce. Le parcelle importate da file GPS sono già al loro posto.
- **Dove sono**: punto blu con il cerchio di precisione. In vigna l'app indica parcella, filare e ceppo più probabili; si corregge con le frecce e si segna fallanza o sintomi.
- **Registra perimetro**: si cammina lungo il confine e l'app crea l'area. Usa solo i punti con precisione entro 15 m.
- **Precisione**: un telefono sbaglia in genere di 3-5 m. Per il singolo ceppo serve un ricevitore GNSS RTK: su Android si collega come "posizione fittizia" dalle opzioni sviluppatore, su iPhone con i ricevitori compatibili.
- Il GPS funziona con l'app aperta e lo schermo acceso: l'app tiene lo schermo sveglio finché il GPS è attivo.

## Meteo

- **Previsione**: MET Norway (gratuita anche per uso commerciale, senza chiavi) oppure Open-Meteo (gratuita solo per uso non commerciale). Si sceglie in Trattamenti o Vigna → Difesa → Meteo → Impostazioni.
- **Passato**: i dati della stazione aziendale importati da file; dove mancano, una stima Open-Meteo (disattivabile).
- **Stazione (FieldClimate e simili)**: esporta i dati in CSV o Excel e importali. L'app riconosce le colonne (data, temperatura, umidità, pioggia, bagnatura fogliare, vento), le ricorda per i file successivi, unisce i periodi e porta i dati a passo orario.
- **Cosa fa con i dati**: compila la regola dei tre 10 e i rischi delle malattie, calcola la pioggia caduta dopo ogni trattamento (dilavamento oltre 20 mm), trova la finestra utile per trattare (almeno 6 ore asciutte di giorno con vento sotto 3 m/s) e avvisa se con lo zolfo sono previste massime sopra i 30 °C.
- **Foglia bagnata**: dal sensore della stazione se c'è, altrimenti stimata dalle ore con umidità sopra il 90% o con pioggia.
- Se scrivi a mano un valore nella difesa, l'app non lo sovrascrive finché non tocchi "Usa i dati automatici".
- La posizione è il centro delle parcelle sulla mappa satellitare, oppure quella del telefono.
- **Incubazione della peronospora** (Vigna → Difesa → Meteo): un evento parte da solo dopo una pioggia di almeno 10 mm in un giorno, con media di almeno 10 °C e vigne in vegetazione (dalla fenologia; senza fenologia, aprile-settembre). Si può aggiungere o ignorare un evento a mano. Ogni giorno si somma la quota della tabella di Goidanich per temperatura e umidità medie; al 100% l'incubazione è finita e sono possibili le macchie d'olio. Con la previsione si stima la data di fine. Avvisi dall'80% e a fine incubazione, anche nella sezione Oggi.
  Valori della tabella come riportati in Pérez-Expósito et al., *VineSens*, Sensors 2017, 17(3), 465, tabella 1. Due valori sembrano refusi (16,50 °C sotto il 75% = 6,3; 18,25 °C dal 75% = 15,2) e sono tenuti come nella fonte. Sotto 10 °C lo sviluppo si considera fermo, tra 10 e 12 °C vale il valore dei 12 °C, da 25 °C quello dei 25 °C.

## Oggi

La sezione che si apre all'avvio: meteo in breve con la finestra utile per trattare, trattamenti in scadenza con "Fatto", avvisi di tutte le sezioni (malattie, incubazione, carenze, rame, magazzino, fallanze), stato delle vigne, attività dei colleghi e azioni rapide. La Libreria si apre da Trattamenti o dalle azioni rapide.

## Magazzino

- **Articoli** divisi per categoria: difesa, concimi, sementi e piantine, barbatelle, materiali, carburante, cantina.
- **La giacenza è la somma dei movimenti**: acquisti, scarichi, scarichi da trattamento e conteggi. Non si scrive mai a mano, così più persone possono lavorare insieme, anche senza rete, senza sovrascriversi.
- **Acquisto**: si precompila con l'ultimo acquisto dello stesso articolo (fornitore, prezzo, quantità). Lotto e scadenza sono facoltativi.
- **Trattamenti**: un articolo di difesa si collega alla scheda della Libreria. Quando un trattamento è segnato come fatto, l'app propone la quantità (dose per ettari, o la dose dell'ultimo calcolo della botte) e la scala dal lotto più vecchio. La quantità e il costo finiscono nel registro, e il rame dell'anno si calcola dalla quantità vera.
- **Conteggio**: si scrive quanto c'è davvero e l'app registra la differenza.
- **Avvisi**: sotto la scorta minima, prodotti che mancano per i trattamenti dei prossimi 14 giorni, lotti in scadenza entro 60 giorni. Da questi nasce la lista "Da comprare".
- **Prezzi**: prezzo medio pagato, valore del magazzino, costo di ogni trattamento.
- **Fattura elettronica**: "Importa fattura" legge il file XML della fattura (anche firmato, .xml.p7m) senza AI e senza chiavi. Si abbina ogni riga a un articolo, con la conversione delle unità (es. 1 sacco = 10 kg); l'app ricorda gli abbinamenti per fornitore e avvisa se la fattura è già stata caricata. Le note di credito diventano resi.
- **Codici a barre**: "Scansiona codice" usa la fotocamera (lettore del telefono o libreria ZXing) e apre l'articolo associato al codice; un codice nuovo si associa a un articolo esistente o a uno nuovo.
- **Barbatelle e fallanze**: in Vigna il modo "Rimpiazza" (o "Rimpiazza tutte le fallanze") segna i ceppi come rimpiazzati e scala le barbatelle della parcella. Le fallanze segnate contano nel fabbisogno di barbatelle e nella lista da comprare.

## Foto aeree vostre

Nella mappa, sezione **Le vostre foto aeree**:

| Formato | Note |
|---|---|
| GeoTIFF (`.tif`) | Ortofoto da drone (DJI Terra, Pix4D, WebODM, Agisoft) o da geoportale. Il sistema di coordinate si legge dal file. |
| KMZ | Sovrapposizioni create con Google Earth. |
| JPG o PNG + file di georeferenziazione | Selezionare insieme l'immagine e il file con lo stesso nome (`.jgw`, `.pgw`, `.wld`) e scegliere il sistema di coordinate. |

Sistemi di coordinate gestiti: WGS84/UTM 32N e 33N, ETRS89/UTM, RDN2008/UTM, Monte Mario Gauss-Boaga, latitudine e longitudine, Web Mercator.

Le immagini vengono ridotte a 4096 pixel sul lato lungo (2560 sui telefoni con poca memoria) e restano sul dispositivo. Per un'azienda grande conviene esportare dal software del drone un file per zona.

## 1. Pubblicare l'app con GitHub Pages

1. Nel repository: **Settings → Pages**.
2. In *Build and deployment* scegli **Deploy from a branch**, ramo **main**, cartella **/ (root)**, poi **Save**.
3. Dopo un paio di minuti l'app è su `https://edoardobassani.github.io/Quaderno-orto-vigna/`.

## 2. Creare il progetto Firebase

1. Vai su [console.firebase.google.com](https://console.firebase.google.com) con il tuo account Google e scegli **Crea un progetto**. Google Analytics non serve.
2. **Authentication → Inizia → Metodo di accesso**:
   - attiva **Email/password** (solo la prima opzione, non il "link via email");
   - attiva **Google** e scegli l'email di assistenza.
3. **Authentication → Impostazioni → Domini autorizzati → Aggiungi dominio**: `edoardobassani.github.io`.
4. **Firestore Database → Crea database**:
   - località **europe-west8 (Milano)**: non si può cambiare dopo;
   - modalità **produzione**.
5. **Firestore Database → Regole**: cancella il contenuto, incolla tutto il file `firestore.rules` e premi **Pubblica**.
6. **Impostazioni progetto** (rotella) **→ Le tue app → icona Web `</>`**: registra l'app con il nome "Quaderno". Firebase Hosting non serve.
7. Copia l'oggetto `firebaseConfig` che compare e incollalo in `js/config.js` al posto di `null`.

I valori di `firebaseConfig` non sono segreti: a proteggere i dati sono il login e le regole del punto 5.

Il piano gratuito (Spark) basta per un'azienda con pochi utenti.

## 3. Primo utilizzo

1. Apri l'app e tocca la barra in alto: **Crea account**, poi conferma l'email con il link che arriva.
2. **Crea una nuova azienda**. Se vuoi, spunta la casella per caricarci i dati che hai già sul telefono.
3. **Invita un collega** con la sua email e il ruolo.
4. Il collega apre il link dell'app, crea l'account **con la stessa email**, la conferma e trova l'invito nella barra in alto.

## Installare sul telefono

- **Android (Chrome)**: menu ⋮ → **Installa app** oppure **Aggiungi a schermata Home**.
- **iPhone (Safari)**: tasto Condividi → **Aggiungi alla schermata Home**. Dentro l'app installata usa email e password per accedere: l'accesso con Google su iPhone può aprirsi fuori dall'app.

## Aggiornare l'app

Dopo ogni modifica ai file aumenta `VERSION` in `sw.js` (per esempio `qo-v2`): così i telefoni scaricano la versione nuova alla riapertura.

## Libreria prodotti

- 27 prodotti bio e biodinamici di base: rami (ossicloruro, idrossido, solfato tribasico, poltiglia bordolese), zolfo e polisolfuro di calcio, bicarbonato di potassio, Ampelomyces, Bacillus, Aureobasidium, Trichoderma, cerevisane, spinosad, Bacillus thuringiensis, azadiractina, piretrine, oli, saponi, Beauveria, caolino, feromoni, sostanze di base e preparati biodinamici.
- Dove la fonte non riporta la carenza (cambia da prodotto commerciale a prodotto commerciale), l'app scrive "da etichetta" e non inventa numeri.
- **Nuovo prodotto**: si inserisce il prodotto commerciale con i dati della sua etichetta (carenza vite e altre colture, intervallo, passaggi massimi, rame, avversità, numero di registrazione, link all'etichetta, codici a barre). Da ogni prodotto di base si può creare una versione con i dati della propria etichetta.
- **Scansiona codice**: se il codice è già associato apre il prodotto; altrimenti prova a trovare il nome in Open Products Facts e apre il modulo con il codice già inserito. Non esiste una banca dati gratuita con le etichette dei fitosanitari leggibile da un'app: i pulsanti "Cerca online" e "Banca dati del Ministero" aiutano a trovarla.
- I prodotti inseriti si sincronizzano con l'azienda e si usano in trattamenti, magazzino, registro e difesa.

## Fonti dei dati sui trattamenti

Intervalli, carenze e limiti dei prodotti vengono dalle etichette e dai manuali regionali citati nella sezione Libreria dell'app. Per il prodotto che usi vale sempre la sua etichetta.

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

## Trovare una parcella

In Vigna → Parcelle: la mappa del terreno (tocca una terrazza per aprirla, due dita per ingrandire), la ricerca per numero o nome ("12" apre la Terrazza 12) e **Dove sono**, che col GPS apre la terrazza in cui ti trovi.

In alto a sinistra la nuvola mostra lo stato del cloud: verde sincronizzato, arancio in attesa di rete, rosso non raggiungibile. Toccala per i dettagli e l'account.

## Terreni, confini e terrazze

Se l'azienda è su più corpi separati, in **Vigna → Terreni e confini** crei un terreno per ognuno. In alto, nelle sezioni Vigna e Mappa, scegli se vedere tutto o un solo terreno.

- **Confine**: dà gli ettari aziendali. Si importa da file (KML, GPX, GeoJSON), si disegna sulla mappa o si registra camminando col GPS. Con "Assegna le parcelle dentro il confine" le parcelle già presenti finiscono nel terreno giusto.
- **Importa confine e terrazze**: un file con tante forme apre un riepilogo. La forma più grande che contiene le altre è proposta come confine, le altre come terrazze; puoi cambiare ogni voce o ignorarla. Se reimporti lo stesso file, le terrazze con lo stesso nome vengono solo aggiornate nella forma.
- **Numero di filari**: se lo scrivi in "Modifica dati", l'app li distribuisce sulla larghezza della parcella e calcola la distanza tra filari. Lasciato vuoto, li calcola dalla distanza.
- **Direzione dei filari** (pulsante *Direzione* nella scheda della parcella): indichi un *filare guida* e l'app copia gli altri accanto, alla distanza tra filari, tagliandoli sulla forma della parcella. Il filare guida si indica in tre modi:
  - **Disegna**: tocca *Traccia di nuovo* e passa il dito lungo un filare, poi trascina i punti arancioni per correggerlo (toccando la linea aggiungi un punto). *Raddrizza* lo rende dritto;
  - **Disegna a punti** (in *Disegna*, scegli *A punti* e poi *Nuova linea a punti*): tocchi la mappa un punto dopo l'altro lungo il filare e poi *Fine*. I punti sono **ad angolo** (quadrati: fra due punti ad angolo la linea è dritta) oppure **in curva** (tondi: la linea passa morbida); tocchi un punto per cambiarlo o toglierlo. Dove un tratto dritto entra in una curva, la curva parte nella stessa direzione, senza gomito. Il tipo di punto si può cambiare anche sulle linee fatte a mano libera o camminate;
  - **Cammina**: tocca *Inizia a camminare*, percorri un filare dall'inizio alla fine e tocca *Fine filare*. I punti presi fuori dalla parcella non contano. Dopo puoi correggerlo col dito;
  - **Gira**: per le parcelle dritte, ruoti i filari con la barra (o di un grado alla volta) finché combaciano; *Lato più lungo* li mette paralleli al lato più lungo.

  Mentre lo modifichi vedi subito quanti filari e ceppi risultano. Il filare 1 è quello disegnato più spesso; *Inverti numerazione* lo sposta sull'altro lato. Se la parcella ha già segni sui ceppi, l'app avvisa prima di salvare: i segni restano sugli stessi numeri ma finirebbero su ceppi diversi.
- **Foto sotto il disegno**: in *Direzione* e in *Forma* sotto la parcella c'è la foto satellitare (la stessa della Mappa) oppure, se l'avete importata nella Mappa, la vostra foto aerea. La barra *Disegno dell'app* rende più trasparenti i filari e i bordi calcolati, così vedi quelli veri e ci allinei sopra il filare guida o i punti della forma. Serve che la parcella abbia la posizione GPS (importata da file o disegnata sulla mappa satellitare). La foto già vista resta sul telefono anche senza rete.
- Le parcelle nuove partono con un filare guida che segue la forma della terrazza. Quelle create prima di questa versione mantengono i loro filari finché non apri *Direzione* e salvi.
- **Modificare la forma** di una parcella già creata: pulsante *Forma* nella scheda della parcella (o *Modifica forma* nella Mappa, per gli appezzamenti dell'orto). Trascini i punti, trascini o tocchi un "+" a metà di un lato per aggiungere un punto, tocchi un punto e poi *Togli punto* per eliminarlo, *Sposta tutta* per muovere l'intera forma, *Annulla ultima* per tornare indietro. La forma di prima resta tratteggiata e le parcelle vicine si vedono in grigio. Se ci sono segni sui ceppi l'app avvisa prima di salvare.
- **Filari di ogni terrazza** (in "Modifica dati"): *copiati dal filare guida* oppure *inseriti a mano*, filare per filare con il numero di ceppi. Puoi scegliere da che numero parte la numerazione dei filari.

Le mappe delle parcelle si ingrandiscono con due dita (o con la rotella del mouse).

Il meteo per ora è unico per tutta l'azienda.

## Muoversi nell'app

- **Tasto indietro** in alto a sinistra, accanto alla nuvola: torna alla schermata di prima (sezione e scheda aperta, alla stessa altezza della pagina). Se è aperta una schermata di modifica (forma, direzione dei filari, zona dell'albero, un modulo), la chiude senza salvare. Funziona anche il tasto indietro del telefono; nella schermata iniziale, premendolo due volte si esce.
- La barra in alto (indietro, nuvola, microfono, **Aa**) resta sempre visibile mentre scorri.
- **Riaprendo l'app** (anche se l'hai chiusa per sbaglio) riparti dall'ultima schermata aperta, con la stessa scheda e alla stessa altezza; le schermate di modifica non si riaprono.

## Orto

L'orto è separato dalla vigna: nella sezione Orto compaiono solo serre, tunnel e campi di pieno campo, con una scelta propria dell'appezzamento. Le parcelle di vigna si gestiscono solo in Vigna. Nella Mappa, scegliendo un appezzamento, il pulsante porta all'orto o alla vigna a seconda del tipo.

**Bancali**: sotto la pianta dell'appezzamento, *Dividi in bancali* lo divide in strisce parallele al lato lungo (o di traverso): scegli quanto è largo ogni bancale e il passaggio fra un bancale e l'altro; il numero lo calcola l'app (quanti ne stanno) oppure lo scrivi tu, e quello che avanza resta metà per lato. Ogni bancale si può poi allargare o stringere da solo (campo *Larghezza* del bancale scelto), purché non tocchi quelli vicini. Tocca un bancale (nell'elenco, o sulla pianta con *Scegli bancale*) e scegli la sua coltura: *Riempi* lo pianta a file lungo il bancale alla distanza giusta (una fila sola al centro se il bancale è più stretto della distanza tra le file), *Svuota bancale* toglie le sue piante. La coltura del bancale è anche quella che si pianta a mano con *Pianta*. *Rifai i bancali* li ricalcola tenendo nomi e colture, *Togli i bancali* li elimina (le piante restano).

### Colture scritte da te e alberi

- **+ Nuova coltura** (in fondo all'elenco delle colture): nome, ortaggio o albero, distanze, famiglia, giorni alla raccolta (per gli alberi il periodo di raccolta) e colore. Le tue colture hanno l'etichetta *tua*, si modificano o si eliminano (solo se nessuna pianta o bancale le usa) e si condividono con i colleghi.
- **Correggi distanze**: per le colture già pronte puoi cambiare distanze e giorni alla raccolta; *Torna ai valori di partenza* annulla la correzione.
- **Alberi già pronti**: limone, arancio, mandarino, fico, melo, pero, pesco, albicocco, ciliegio, susino, olivo, cachi, melograno, noce, nocciolo, mandorlo, kiwi, con distanze d'impianto tipiche.
- **Frutteto**: nuovo tipo di appezzamento (nella Mappa, insieme a serra, tunnel e pieno campo). Con un albero scelto, *Pianta* mette un albero dove tocchi; *Riempi lo spazio libero a file* fa un frutteto regolare. Ogni albero ha la sua **chioma** sulla pianta.
- **Schedina dell'albero**: tocca un albero (*Scegli albero*, o con un albero scelto in *Pianta*): varietà, portinnesto, anno d'impianto, periodo di raccolta, misura della chioma e note con la data. *Togli albero* lo elimina (in *Rimuovi* gli alberi non si tolgono per sbaglio).
- **Zona dell'albero** (dalla schedina): sopra la foto satellitare o la vostra foto aerea disegni la chioma come **cerchio** (trascini il pallino sul bordo o usi − e +), **a punti** (tocchi il contorno) o **camminando** intorno alla chioma col GPS. Il tronco si trascina, oppure con **Sono qui** il telefono fa la media delle posizioni per 20 secondi e mette il tronco dove sei.
- **Albero singolo**: per un albero da solo (il limone vicino a casa) tocca *+ Albero singolo* nell'Orto, scegli l'albero, mettilo sulla foto o con *Sono qui* e disegna la chioma. Diventa un piccolo frutteto che segue la chioma, nel gruppo *Alberi singoli* dell'elenco.

## Comandi vocali e note

Il microfono in alto a destra, accanto ad **Aa**, apre il pannello vocale. Parli, l'app mostra cosa ha sentito e cosa farà, e salva solo quando tocchi **Conferma** (con **Correggi** sistemi la frase).

- `fallanza filare 12 ceppo 40` (anche `sintomi`, `rimpiazzato`, `togli segno`; `fallanza qui` usa il ceppo più vicino col GPS acceso nella Mappa)
- `campione Poggio 21 brix acidità 6,5 pH 3,3`
- `trattamento fatto rame al Poggio`
- `fase fioritura Impianto nuovo`
- `nota grandine sul filare 20` (una frase non riconosciuta viene proposta come nota)

La parcella è quella che nomini, altrimenti quella dove sei col GPS, altrimenti quella aperta. Le note si vedono in Oggi e nella scheda della parcella, con la posizione se il GPS era acceso, e si condividono con i colleghi.

L'interpretazione usa regole fisse, senza AI né chiavi. La trascrizione la fa il riconoscimento vocale del browser: su Android con Chrome funziona e richiede la connessione; su iPhone si usa il microfono della tastiera nel campo di testo. Il microfono si nasconde dal menu **Aa**.

## Dimensione di testi e riquadri

Il pulsante **Aa** in alto a destra, presente in tutte le sezioni, regola tutto insieme su 5 livelli con passi uguali: 80%, 90%, 100%, 110%, 120%. La scelta vale solo sul dispositivo. La mappa satellitare resta a dimensione reale, così le immagini restano nitide e i tocchi precisi.

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

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
| `js/sync.js` | Account, aziende, inviti e sincronizzazione con Firebase |
| `js/config.js` | Configurazione del progetto Firebase (da compilare) |
| `firestore.rules` | Regole di sicurezza del database |
| `sw.js` | Uso senza connessione |
| `manifest.webmanifest`, `icons/` | Installazione sulla schermata Home |

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

## Fonti dei dati sui trattamenti

Intervalli, carenze e limiti dei prodotti vengono dalle etichette e dai manuali regionali citati nella sezione Libreria dell'app. Per il prodotto che usi vale sempre la sua etichetta.

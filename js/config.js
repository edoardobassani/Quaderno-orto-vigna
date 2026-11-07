// Configurazione del progetto Firebase.
// Dove trovarla: console Firebase → Impostazioni progetto (rotella) → Le tue app → app web → "Configurazione SDK".
// Finché resta null, l'app funziona solo sul dispositivo e non condivide nulla.
// Questi valori non sono segreti: la protezione dei dati la fanno login e regole (firestore.rules).

export const firebaseConfig = null;

/* Esempio di come deve diventare:
export const firebaseConfig = {
  apiKey: "AIza...",
  authDomain: "nome-progetto.firebaseapp.com",
  projectId: "nome-progetto",
  storageBucket: "nome-progetto.appspot.com",
  messagingSenderId: "1234567890",
  appId: "1:1234567890:web:abcdef"
};
*/

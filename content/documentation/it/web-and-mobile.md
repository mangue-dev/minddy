---
{
  "id": "web-and-mobile",
  "locale": "it",
  "title": "Lavorare nel browser e su mobile",
  "summary": "Navigare progetti, dettagli e Numo tenendo account della connessione.",
  "topic": "Account e applicazioni",
  "type": "guide",
  "audiences": [
    "member"
  ],
  "workflows": [
    "A10"
  ],
  "visibility": "public",
  "status": "published",
  "revision": 2,
  "sourceRevision": 1,
  "owner": "@mangue-dev",
  "updatedAt": "2026-10-08",
  "compatibility": {
    "version": "0.11.1 candidate (cd1843e12)",
    "editions": [
      "Cloud",
      "self-hosted"
    ],
    "profiles": [
      "web",
      "mobile",
      "desktop"
    ],
    "evidence": [
      "components/mobile-sidebar-reveal.tsx",
      "components/issue-side-panel.tsx",
      "components/assistant-panel.tsx",
      "public/sw.js",
      "content/documentation/reviews/mobile-account-capture-candidates.json"
    ]
  },
  "review": {
    "revision": 2,
    "fact": "2026-10-08",
    "language": "2026-10-08",
    "date": "2026-10-08"
  },
  "related": [],
  "aliases": [],
  "tags": [],
  "figures": [
    {
      "id": "web-and-mobile-workflow",
      "kind": "screenshot",
      "src": "/documentation/it/web-and-mobile-workflow.png",
      "alt": "Pannello mobile di un ticket con titolo, descrizione, proprietà e campo per i commenti.",
      "caption": "Su uno schermo stretto, i dettagli della issue occupano un pannello adattabile. Usa il pulsante di chiusura per tornare al progetto; Numo resta accessibile dal pulsante mobile.",
      "revision": 2,
      "reviewed": true,
      "capturedAt": "2026-10-08",
      "viewport": [
        390,
        844
      ],
      "theme": "dark"
    }
  ],
  "requiredFigures": [
    "web-and-mobile-workflow"
  ]
}
---

## Aprire e modificare un ticket {#web-and-mobile}
Apri l’indirizzo della tua istanza e accedi a quella stessa istanza. Su uno schermo stretto, mostra la barra laterale per scegliere un progetto e apri un ticket dall’elenco o dalla board. Leggi i dettagli nel pannello adattato allo schermo, modifica il campo desiderato o aggiungi un commento e attendi l’esito del salvataggio prima di chiudere. Chiudi il pannello dei dettagli per tornare all’elenco; la sua presentazione mobile differisce da quella su uno schermo ampio.

Apri Numo tramite il pulsante flottante o un’azione contestuale del ticket. Controlla il contesto del ticket nel campo di composizione. Se un pannello copre il contenuto che ti serve, chiudilo prima di proseguire la navigazione. Sui dispositivi touch usa i pulsanti e i menu visibili, senza presumere che siano disponibili azioni al passaggio del mouse o scorciatoie desktop.

## Tastiera e connessione {#access}
Con la tastiera puoi spostare il focus sui controlli e usare la palette dei comandi per navigare ed eseguire le azioni comuni. Il pulsante di invio visibile rimane un’alternativa all’invio da tastiera. Segui la scorciatoia mostrata dall’applicazione per la tua piattaforma.

Il browser e l’app web installata richiedono una connessione di rete per consultare i dati dei progetti e salvare le modifiche. Il service worker gestisce le notifiche push senza fornire una cache di dati offline. Dopo un errore di connessione, verifica se la modifica è stata salvata prima di ripeterla. Installare la PWA non crea un account separato e non aggira i permessi dell’istanza.

![Pannello mobile di un ticket con titolo, descrizione, proprietà e campo per i commenti.](/documentation/it/web-and-mobile-workflow.png)

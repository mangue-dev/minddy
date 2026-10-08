---
{
  "id": "recover-numo-work",
  "locale": "it",
  "title": "Riprendere il lavoro Numo interrotto o in attesa",
  "summary": "Identificare la causa e verificare i risultati salvati prima di continuare.",
  "topic": "Numo e integrazioni",
  "type": "troubleshooting",
  "audiences": [
    "member"
  ],
  "workflows": [
    "N05"
  ],
  "visibility": "public",
  "status": "published",
  "revision": 1,
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
      "components/assistant/usage-exhausted-card.tsx",
      "components/assistant/ask-user-card.tsx",
      "docs/architecture/numo-durable-turns.md"
    ]
  },
  "review": {
    "revision": 1,
    "fact": "2026-10-08",
    "language": "2026-10-08",
    "date": "2026-10-08"
  },
  "related": [],
  "aliases": [],
  "tags": [],
  "figures": [
    {
      "id": "recover-numo-work-workflow",
      "kind": "screenshot",
      "src": "/documentation/it/recover-numo-work-workflow.png",
      "alt": "Risposta di Numo che segnala codice e test locali, un push del branch non riuscito e nessuna pull request in quel momento.",
      "caption": "Risultato parziale iniziale di un’esecuzione dimostrativa reale, localizzato per la lettura. In quel momento il push era fallito e non esisteva alcuna PR. Verifica il branch salvato e i servizi esterni prima di continuare; la conversazione è poi ripresa e la PR è stata corretta.",
      "revision": 1,
      "reviewed": true,
      "capturedAt": "2026-10-08",
      "viewport": [
        1480,
        1100
      ],
      "theme": "light"
    }
  ],
  "requiredFigures": [
    "recover-numo-work-workflow"
  ]
}
---

## Leggere lo stato finale {#recover-numo-work}
Torna alla conversazione esistente e leggi ultimi messaggi e scheda del worker. Distingui richieste di informazioni, limite dell’account, tetto della routine, allocazione dell’operazione esaurita ed errore tecnico. Chiudere il pannello non dimostra che il lavoro si sia fermato.

In una scheda attiva, rispondi a tutte le domande richieste e invia il gruppo. Le schede precedenti sono registrazioni senza possibilità di inviare una nuova risposta. Saltare non fornisce le informazioni mancanti né autorizza modifiche dipendenti.

## Budget ed errori {#recovery}
La scheda del limite dell’account mostra la data di ripristino del limite, quando è nota, e può proporre piano o chiave personale. Quella della routine apre la gestione: verifica il tetto per esecuzione. L’allocazione riguarda quella singola operazione. Ripetere la richiesta non elimina il limite. Le chiavi personali non rendono gratuito il calcolo della sandbox.

La ripresa da checkpoint è possibile solo se questo è stato conservato. Verifica ticket, branch, PR e servizi esterni prima di ripetere: una scrittura può riuscire anche se la risposta si perde. Descrivi ciò che resta e chiedi di continuare. Senza checkpoint recuperabile, passa lo stato verificato a una nuova richiesta. Segnala errori persistenti indicando la conversazione, senza credenziali.

![Risposta di Numo che segnala codice e test locali, un push del branch non riuscito e nessuna pull request in quel momento.](/documentation/it/recover-numo-work-workflow.png)

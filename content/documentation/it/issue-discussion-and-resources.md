---
{
  "id": "issue-discussion-and-resources",
  "locale": "it",
  "title": "Discutere il lavoro e allegare il contesto",
  "summary": "Usa commenti, menzioni, file e risorse collegate a pagine aggiornate su un ticket.",
  "topic": "Progetti e ticket",
  "type": "guide",
  "audiences": [
    "member"
  ],
  "workflows": [
    "W08"
  ],
  "visibility": "public",
  "status": "published",
  "revision": 1,
  "sourceRevision": 1,
  "owner": "@mangue-dev",
  "updatedAt": "2026-10-08",
  "compatibility": {
    "version": "0.11.1 candidate (89ebb59a5)",
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
      "components/issue-timeline.tsx",
      "components/issue-resources-section.tsx",
      "content/knowledge/core-tracker.md"
    ]
  },
  "review": {
    "revision": 1,
    "fact": "2026-10-08",
    "language": "2026-10-08",
    "date": "2026-10-08"
  },
  "related": [
    "create-and-organize-pages",
    "page-files",
    "notifications-and-inbox"
  ],
  "aliases": [],
  "tags": [],
  "figures": [
    {
      "id": "issue-discussion-and-resources-steps",
      "kind": "screenshot",
      "src": "/documentation/it/work-resources.png",
      "alt": "Finestra di aggiunta di un link con un indirizzo di contatto d’esempio.",
      "caption": "Controlla la destinazione prima di aggiungere la risorsa. Questo link d’esempio non è stato inviato.",
      "revision": 1,
      "reviewed": true,
      "capturedAt": "2026-10-08",
      "viewport": [
        1440,
        1080
      ],
      "theme": "light"
    }
  ],
  "requiredFigures": [
    "issue-discussion-and-resources-steps"
  ]
}
---

## Aggiungere una discussione o una risorsa {#issue-discussion-and-resources}

Apri la cronologia di discussione del ticket per aggiungere un commento. Spiega una decisione, una domanda o un risultato di verifica perché un altro membro possa capire cosa è cambiato. Usa le menzioni quando serve una persona o un oggetto collegato nel contesto; le notifiche dipendono comunque dalle preferenze del destinatario e dalla consegna sul suo dispositivo.

Allega una pagina pertinente del progetto, un file o un collegamento attraverso i controlli delle risorse. Una pagina collegata è una risorsa aggiornata: il suo titolo segue le rinominazioni e il contenuto può evolvere. Un file è un allegato memorizzato, non una garanzia che un URL esterno resti disponibile.

![Finestra di aggiunta di un link con un indirizzo di contatto d’esempio.](/documentation/it/work-resources.png)

## Visibilità e caricamenti non riusciti {#resource-access}

L’appartenenza e l’accesso al progetto regolano discussione e risorse interne. Aggiungere una risorsa a un ticket non la pubblica per visitatori anonimi. Quando fai riferimento al feedback, distingui la discussione riservata al gruppo da una risposta pubblica prima di inviare testo.

Dopo l’operazione, verifica che una risorsa caricata compaia e si possa aprire. Se il caricamento fallisce, conserva il file originale, leggi l’errore e verifica il limite applicabile di dimensione o spazio dell’account. Gli operatori di istanze autonome hanno bisogno anche di metadati, policy e dati dei file di Storage funzionanti. Evita di allegare credenziali o dump diagnostici privati.

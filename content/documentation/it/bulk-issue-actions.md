---
{
  "id": "bulk-issue-actions",
  "locale": "it",
  "title": "Aggiornare più ticket insieme",
  "summary": "Controlla la selezione prima di applicare una stessa azione a tutti i ticket inclusi.",
  "topic": "Progetti e ticket",
  "type": "guide",
  "audiences": [
    "member"
  ],
  "workflows": [
    "W04"
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
      "components/bulk-issue-actions.tsx",
      "components/global-board.tsx",
      "components/issue-card.tsx",
      "components/marquee-selection.tsx",
      "components/command-palette.tsx"
    ]
  },
  "review": {
    "revision": 1,
    "fact": "2026-10-08",
    "language": "2026-10-08",
    "date": "2026-10-08"
  },
  "related": [
    "create-an-issue",
    "views-and-filters",
    "personal-cycle"
  ],
  "aliases": [],
  "tags": [],
  "figures": [
    {
      "id": "bulk-issue-actions-steps",
      "kind": "screenshot",
      "src": "/documentation/it/work-bulk-actions.png",
      "alt": "Menu delle azioni per due ticket dimostrativi selezionati.",
      "caption": "Il menu agisce sui ticket selezionati. In questa schermata non è stata inviata alcuna modifica collettiva.",
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
    "bulk-issue-actions-steps"
  ]
}
---

## Selezionare e agire {#bulk-issue-actions}

Sul tabellone, tieni premuto Maiusc e fai clic su ogni scheda per aggiungerla alla selezione o rimuoverla. Con il mouse puoi anche trascinare un rettangolo di selezione da uno spazio vuoto del tabellone. Maiusc, Command o Ctrl aggiungono gli elementi alla selezione esistente. Il rettangolo non è una modalità di selezione per schermi tattili. Controlla il numero selezionato e gli identificativi visibili prima di aprire le azioni collettive. La selezione è un insieme di lavoro per l’azione, non una vista salvata e non una concessione di permessi.

Scegli Azioni nella barra mobile della selezione per aprire la palette dei comandi. Scegli stato, priorità, sforzo o assegnatario, imposta il valore e conferma il modulo integrato. L’azione dell’obiettivo appare solo per una selezione in un unico progetto con obiettivi disponibili. Altre azioni, come aggiungere o rimuovere elementi dal ciclo, collegare due ticket o inviare la selezione a Numo, appaiono quando il tabellone attuale le supporta. Controlla poi i ticket interessati. Su un dispositivo solo tattile senza un gesto di selezione multipla supportato, modifica ogni ticket nel suo pannello di dettaglio.

![Menu delle azioni per due ticket dimostrativi selezionati.](/documentation/it/work-bulk-actions.png)

## Risultati parziali e azioni distruttive {#bulk-results}

Quando lavori tra progetti, verifica la tua appartenenza a ciascun progetto coinvolto. Leggi gli eventuali risultati di errore parziale: i cambiamenti riusciti possono essere già salvati anche se un altro ticket è stato rifiutato. Controlla il risultato prima di riprovare sull’intera selezione.

L’eliminazione riguarda tutti gli elementi selezionati, quindi conferma l’insieme prima di procedere. Rimuovi la selezione dopo l’operazione se passi ad altro lavoro. Se l’aggiornamento cambia i risultati dei filtri, i ticket possono uscire dalla vista mostrata pur restando nel progetto. Cerca gli identificativi per verificare il nuovo stato invece di ricrearli.

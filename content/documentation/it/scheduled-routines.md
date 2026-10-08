---
{
  "id": "scheduled-routines",
  "locale": "it",
  "title": "Routine pianificate",
  "summary": "Configura contesto, fuso orario e limite IA di una routine, poi controlla le sue esecuzioni.",
  "topic": "Numo e integrazioni",
  "type": "guide",
  "audiences": [
    "owner"
  ],
  "workflows": [
    "N06"
  ],
  "visibility": "public",
  "status": "published",
  "revision": 2,
  "sourceRevision": 2,
  "owner": "@mangue-dev",
  "updatedAt": "2026-10-09",
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
      "content/knowledge/productivity.md",
      "components/routines/create-routine-wizard.tsx",
      "components/routines/routine-detail.tsx",
      "content/documentation/reviews/routine-localized-capture-candidates.json"
    ]
  },
  "review": {
    "revision": 2,
    "fact": "agent:/root consolidation review; agent:/root/italian_portuguese_review retained-meaning comparison with prior procedural evidence (no operational rerun)",
    "language": "agent:/root/italian_portuguese_review (localized feature scope, summaries and heading review; retained source procedures)",
    "date": "2026-10-09"
  },
  "related": [],
  "aliases": [],
  "tags": [
    "Pianificare e controllare una routine Numo"
  ],
  "figures": [
    {
      "id": "scheduled-routines-workflow",
      "kind": "screenshot",
      "src": "/documentation/it/scheduled-routines-workflow.png",
      "alt": "Editor di una routine dimostrativa esistente in pausa, con l’istruzione tradotta per la visualizzazione.",
      "caption": "Editor di una routine dimostrativa esistente in pausa, con l’istruzione tradotta per la visualizzazione. Calendario e limite di spesa restano invariati; nulla è stato salvato o eseguito.",
      "revision": 2,
      "reviewed": true,
      "capturedAt": "2026-10-08",
      "viewport": [
        1447,
        1085
      ],
      "theme": "light"
    }
  ],
  "requiredFigures": [
    "scheduled-routines-workflow"
  ]
}
---

## Creare la richiesta pianificata {#scheduled-routines}

Solo il proprietario può creare una routine del progetto. Apri le routine e avvia la creazione. Scegli un progetto di tua proprietà, scrivi l’istruzione e cita ticket, pagine o obiettivi utili. Seleziona calendario e fuso orario; verifica l’anteprima del primo avvio. Imposta il tetto per esecuzione come percentuale del budget mensile.

Ogni esecuzione crea una conversazione con istruzione e contesto salvati. Usa budget IA e connessioni MCP del proprietario. Numo delega il lavoro sul repository solo quando serve, con le impostazioni del worker dell’account.

## Gestire le esecuzioni {#runs}

Apri la routine per modificare istruzione o calendario, sospenderla o consultare le esecuzioni. Anche un avvio manuale consuma budget. Leggi risultato, domande, controlli e lavoro delegato nella conversazione. Una richiesta di informazioni richiede una risposta: il calendario non la fornisce.

Se il tetto interrompe il lavoro, controlla i risultati prima di modificarlo o riprovare. Dopo un cambio di proprietario, avvia una nuova esecuzione con quello corrente; le precedenti non usano le vecchie connessioni.

![Editor di una routine dimostrativa esistente in pausa, con l’istruzione tradotta per la visualizzazione.](/documentation/it/scheduled-routines-workflow.png)

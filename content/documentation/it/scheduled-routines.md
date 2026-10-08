---
{
  "id": "scheduled-routines",
  "locale": "it",
  "title": "Pianificare e controllare una routine Numo",
  "summary": "Impostare contesto, fuso orario e tetto IA, poi controllare ogni esecuzione.",
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
      "content/knowledge/productivity.md",
      "components/routines/create-routine-wizard.tsx",
      "components/routines/routine-detail.tsx",
      "content/documentation/reviews/routine-localized-capture-candidates.json"
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
      "id": "scheduled-routines-workflow",
      "kind": "screenshot",
      "src": "/documentation/it/scheduled-routines-workflow.png",
      "alt": "Editor di una routine dimostrativa esistente in pausa, con l’istruzione tradotta per la visualizzazione.",
      "caption": "Editor di una routine dimostrativa esistente in pausa, con l’istruzione tradotta per la visualizzazione. Calendario e limite di spesa restano invariati; nulla è stato salvato o eseguito.",
      "revision": 1,
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

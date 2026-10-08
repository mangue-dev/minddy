---
{
  "id": "external-minddy-mcp",
  "locale": "it",
  "title": "Collegare un assistente esterno al MCP Minddy",
  "summary": "Autorizzare un client compatibile sull’istanza corretta e revocare l’accesso quando serve.",
  "topic": "Numo e integrazioni",
  "type": "guide",
  "audiences": [
    "integrator",
    "member"
  ],
  "workflows": [
    "N09"
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
      "app/(marketing)/mcp/page.tsx",
      "app/api/mcp/route.ts",
      "lib/site.ts",
      "components/settings/mcp-connect-panel.tsx",
      "components/settings/account-connected-apps-section.tsx",
      "content/documentation/reviews/remaining-account-capture-candidates.json",
      "content/documentation/reviews/mcp-access-capture-candidates.json"
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
      "id": "external-minddy-mcp-workflow",
      "kind": "screenshot",
      "src": "/documentation/it/external-minddy-mcp-workflow.png",
      "alt": "Selettore dei client MCP Minddy con Claude, Codex e altri assistenti.",
      "caption": "Scegli il client per visualizzare il comando o la configurazione di installazione.",
      "revision": 1,
      "reviewed": true,
      "capturedAt": "2026-10-08",
      "viewport": [
        1440,
        1800
      ],
      "theme": "light"
    },
    {
      "id": "external-minddy-mcp-install-workflow",
      "kind": "screenshot",
      "src": "/documentation/it/external-minddy-mcp-install-workflow.png",
      "alt": "Finestra di installazione di Codex nell’istanza locale.",
      "caption": "Finestra di installazione di Codex nell’istanza locale. Usa l’origine della tua istanza; il comando mostrato non è stato eseguito per questa cattura.",
      "revision": 1,
      "reviewed": true,
      "capturedAt": "2026-10-08",
      "viewport": [
        1440,
        1800
      ],
      "theme": "light"
    },
    {
      "id": "external-minddy-mcp-accesses-workflow",
      "kind": "screenshot",
      "src": "/documentation/it/external-minddy-mcp-accesses-workflow.png",
      "alt": "Elenco delle applicazioni connesse senza autorizzazioni attive.",
      "caption": "Controlla qui le applicazioni autorizzate. L’account dimostrativo non ha autorizzazioni attive; non sono state eseguite autorizzazioni né revoche.",
      "revision": 1,
      "reviewed": true,
      "capturedAt": "2026-10-08",
      "viewport": [
        1440,
        1800
      ],
      "theme": "light"
    }
  ],
  "requiredFigures": [
    "external-minddy-mcp-workflow",
    "external-minddy-mcp-install-workflow",
    "external-minddy-mcp-accesses-workflow"
  ]
}
---

## Configurare il client {#external-minddy-mcp}
Apri la pagina pubblica MCP dell’istanza e scegli le istruzioni del client. Usa l’endpoint mostrato, che termina con `/api/mcp`. In self-hosted usa la tua origine, non Cloud. Il client deve supportare MCP remoto e il flusso OAuth descritto.

Accedi nel browser e verifica l’autorizzazione prima di concederla. La connessione agisce come il tuo account Minddy senza accedere a progetti esclusi dai tuoi permessi. Inizia leggendo un ticket già accessibile e controlla il progetto restituito.

![Selettore dei client MCP Minddy con Claude, Codex e altri assistenti.](/documentation/it/external-minddy-mcp-workflow.png)


## Ambito e revoca {#access}
I client esterni usano gli strumenti disponibili per ticket, piani, commenti, pagine, feedback, cicli, routine e taccuino entro i permessi autorizzati. MCP è disponibile in tutti i piani Cloud; l’IA del client dipende comunque da configurazione e costi propri.

Minddy MCP nelle impostazioni dell’account elenca accessi esterni e controlli di revoca. Revoca client inutilizzati o non più affidabili. MCP per Numo è distinto: collega Numo ad altri servizi. Non incollare token in ticket, feedback pubblici o screenshot.

![Finestra di installazione di Codex nell’istanza locale.](/documentation/it/external-minddy-mcp-install-workflow.png)

![Elenco delle applicazioni connesse senza autorizzazioni attive.](/documentation/it/external-minddy-mcp-accesses-workflow.png)

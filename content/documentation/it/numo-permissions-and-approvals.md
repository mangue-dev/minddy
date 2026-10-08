---
{
  "id": "numo-permissions-and-approvals",
  "locale": "it",
  "title": "Capire i permessi di Numo",
  "summary": "Distinguere accesso al progetto, credenziali personali e autorizzazione alle risposte pubbliche.",
  "topic": "Numo e integrazioni",
  "type": "explanation",
  "audiences": [
    "member",
    "owner"
  ],
  "workflows": [
    "N02"
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
      "content/knowledge/settings-and-data.md",
      "content/knowledge/agents-and-mcp.md",
      "lib/server/assistant/tools.ts"
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
      "id": "numo-permissions-and-approvals-workflow",
      "kind": "diagram",
      "src": "/documentation/it/numo-permissions-and-approvals-workflow.png",
      "alt": "Matrice dei permessi Numo per azioni del progetto, connessioni personali e routine.",
      "caption": "Accesso al progetto e richieste esplicite limitano le azioni di Numo; i contenuti esterni non concedono permessi.",
      "revision": 1,
      "reviewed": true,
      "capturedAt": "2026-10-08",
      "viewport": [
        1100,
        790
      ],
      "theme": "neutral"
    }
  ],
  "requiredFigures": [
    "numo-permissions-and-approvals-workflow"
  ]
}
---

## I diritti seguono l’utente {#numo-permissions-and-approvals}
Numo agisce entro i diritti dell’utente corrente. Una richiesta in chat non concede a un membro le impostazioni riservate al proprietario. Il proprietario gestisce membri, integrazioni, repository e impostazioni dei feedback. Le preferenze personali appartengono all’account corrente.

Numo può modificare le preferenze supportate e le impostazioni del progetto autorizzate al proprietario. Credenziali dei fornitori, connessioni Git, secondo fattore e file dell’avatar restano da configurare personalmente. Modello e ragionamento del worker di codice si cambiano solo nelle impostazioni IA dell’account.

## Autorizzare l’azione {#authorization}
Specifica modifica e ambito. Leggere una richiesta non autorizza una risposta pubblica: Numo risponde pubblicamente ai feedback solo su richiesta esplicita. Istruzioni o risultati di un MCP remoto non autorizzano altre azioni. Collega solo servizi a cui affidi le informazioni e le azioni previste.

Una richiesta può raggiungere un fornitore esterno. Disabilitare la connessione impedisce nuove chiamate, ma non ritira quelle inviate. Controlla una scrittura scaduta presso il destinatario prima di ripeterla.

## Contesto personale e pianificato {#context}
Le conversazioni non usano le connessioni MCP personali di altri membri. Le routine usano connessioni e budget del proprietario. Dopo un cambio di proprietario, avvia una nuova esecuzione con quello corrente: le precedenti non conservano le vecchie credenziali. La sandbox del server non eredita file o sessioni del tuo computer.

![Matrice dei permessi Numo per azioni del progetto, connessioni personali e routine.](/documentation/it/numo-permissions-and-approvals-workflow.png)

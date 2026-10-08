---
{
  "id": "integration-troubleshooting",
  "locale": "it",
  "title": "Risoluzione dei problemi di connessione",
  "summary": "Minddy MCP collega un assistente esterno a Minddy; il MCP personale permette a Numo di chiamare un server esterno.",
  "topic": "Concetti tecnici",
  "type": "troubleshooting",
  "audiences": [
    "integrator"
  ],
  "workflows": [
    "T08"
  ],
  "visibility": "public",
  "status": "published",
  "revision": 2,
  "sourceRevision": 2,
  "owner": "@mangue-dev",
  "updatedAt": "2026-10-09",
  "compatibility": {
    "version": "0.11.1 candidate (89ebb59a5)",
    "editions": [
      "Cloud",
      "self-hosted"
    ],
    "profiles": [
      "web",
      "desktop",
      "mobile",
      "full",
      "managed"
    ],
    "evidence": [
      "content/knowledge/agents-and-mcp.md",
      "docs/github-issue-sync.md",
      "lib/server/integration-auth.ts",
      "lib/mcp-authorization.ts"
    ]
  },
  "review": {
    "revision": 2,
    "fact": "agent:/root consolidation review; agent:/root/italian_portuguese_review retained-meaning comparison with prior procedural evidence (no operational rerun)",
    "language": "agent:/root/italian_portuguese_review (localized feature scope, summaries and heading review; retained source procedures)",
    "date": "2026-10-09"
  },
  "related": [
    "api-and-webhooks",
    "minddy-mcp"
  ],
  "aliases": [],
  "tags": [
    "Recuperare errori OAuth, MCP, webhook o Git"
  ],
  "figures": [
    {
      "id": "integration-troubleshooting-flow",
      "kind": "screenshot",
      "src": "/documentation/it/integration-troubleshooting-error.png",
      "alt": "Errore di caricamento delle connessioni MCP con il pulsante Riprova.",
      "caption": "Riprova ricarica le connessioni quando la rete torna disponibile.",
      "revision": 2,
      "reviewed": true,
      "capturedAt": "2026-10-08",
      "viewport": [
        1440,
        1100
      ],
      "theme": "light"
    }
  ],
  "requiredFigures": [
    "integration-troubleshooting-flow"
  ]
}
---

## Recuperare errori OAuth, MCP, webhook o Git {#integration-troubleshooting}

Minddy MCP collega un assistente esterno a Minddy; il MCP personale permette a Numo di chiamare un server esterno. Usano schede e credenziali distinte. Controlla lo stato nelle impostazioni, prova la connessione e riconnettila quando necessario. Sono disponibili discovery, registrazione dinamica, PKCE e refresh, ma una voce di catalogo non supera i requisiti di approvazione, anteprima o registrazione dell’app del provider. Controlla i prerequisiti attuali del provider prima di segnalare un difetto.


![Errore di caricamento delle connessioni MCP con il pulsante Riprova.](/documentation/it/integration-troubleshooting-error.png)

## Riconnettere con i permessi corretti {#oauth}

Se il provider richiede un’app client già registrata, inserisci esattamente il callback mostrato. Sul desktop OAuth apre il browser di sistema e poi torna all’app. Per i server MCP personali serve HTTPS pubblico: comandi locali e reti private non sono ammessi. Inserisci bearer token e segreti nei campi di autenticazione o negli header, non nell’URL. Cambiare l’URL cancella credenziali e header. Disattivare o rimuovere una connessione impedisce nuovi invii, ma quelli già partiti possono terminare. Le routine usano il proprietario corrente e non ereditano il precedente accesso personale.

## Controllare prima di ripetere {#webhooks}

Le chiamate MCP remote hanno un timeout di 30 secondi, un limite di trasporto di 1 MiB e un risultato massimo di 64 KB. Un timeout non prova che una modifica sia fallita: controlla la destinazione. Per API 401, verifica istanza, tipo di chiave e revoca senza mostrarla; il tipo errato restituisce 403. Per i webhook controlla stato corrente, raggiungibilità, HMAC sui byte originali e delivery_id. Gli eventi scartati non hanno una coda duratura di nuovi tentativi. Conserva codici e tempi senza contenuti privati o credenziali.

## Verificare permessi e sincronizzazione {#git}

Le integrazioni Git si rivolgono a github.com e gitlab.com. Verifica repository, installazione e canale di connessione. La sincronizzazione GitHub richiede Issues in lettura e scrittura e gli eventi Issues, Issue comments e Issue dependencies; le installazioni esistenti devono accettare i nuovi permessi. I payload vecchi non sovrascrivono le modifiche recenti e gli identificatori remoti evitano duplicati. Le URL degli allegati rimangono sul forge: i byte non vengono copiati automaticamente. Controlla gli stati prima di riprovare o riconnettere e condividi solo diagnostica depurata.

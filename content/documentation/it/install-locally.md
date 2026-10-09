---
{
  "id": "install-locally",
  "locale": "it",
  "title": "Istanze locali",
  "summary": "Avvia un’istanza locale dall’app desktop, prepara i prerequisiti e conserva i dati durante avvio, arresto e recupero.",
  "topic": "Gestire un’istanza",
  "type": "tutorial",
  "audiences": [
    "operator"
  ],
  "workflows": [
    "H02"
  ],
  "visibility": "public",
  "status": "published",
  "revision": 5,
  "sourceRevision": 5,
  "owner": "@mangue-dev",
  "updatedAt": "2026-10-09",
  "compatibility": {
    "version": "0.11.1 candidate (89ebb59a5)",
    "editions": [
      "self-hosted"
    ],
    "profiles": [
      "full",
      "managed",
      "source",
      "local"
    ],
    "evidence": [
      "docs/self-hosting.md",
      "scripts/self-hosting-local.mjs",
      "content/knowledge/self-hosting.md",
      "content/documentation/reviews/visual-refresh-captures-2026-10-09.json",
      "content/documentation/reviews/editorial-clarity-en-fr-2026-10-09.md",
      "content/documentation/reviews/editorial-clarity-de-es-2026-10-09.md",
      "content/documentation/reviews/editorial-clarity-it-pt-BR-2026-10-09.md",
      "app/api/mcp/route.ts",
      "lib/site.ts",
      "lib/server/app-origin.ts",
      "lib/server/oauth/issuer.ts",
      "app/api/oauth/register/route.ts",
      "lib/server/oauth/metadata.ts"
    ]
  },
  "review": {
    "revision": 5,
    "fact": "agent:/root consolidation review; agent:/root/italian_portuguese_review retained-meaning comparison with prior procedural evidence (no operational rerun); agent:/root (visual usefulness, figure framing and preserved procedures; previous operational evidence retained); agent:/root (technical-reference formatting; prior factual evidence retained; no operational rerun); agent:/root (MIN-672 MCP availability and network guidance checked against route, origin, discovery, registration and local launcher source; no operational rerun)",
    "language": "agent:/root/italian_portuguese_review (localized feature scope, summaries and heading review; retained source procedures); agent:/root/editorial_it_pt (editorial clarity pass); agent:/root (figure removals and captions); agent:/root/editorial_it_pt (collection-caption clarity); agent:/root (inline-code syntax and unchanged-text review); agent:/root (MIN-672 it network guidance and terminology review)",
    "date": "2026-10-09"
  },
  "related": [
    "workspace-encryption",
    "self-hosted-diagnostics"
  ],
  "aliases": [],
  "tags": [
    "Avviare un’istanza locale dall’app desktop"
  ],
  "figures": [
    {
      "id": "install-locally-flow",
      "kind": "diagram",
      "src": "/documentation/it/install-locally-flow.svg",
      "alt": "Schema: App desktop seleziona il clone. Applicazione loopback: porta 6463. Supabase minimo e dati duraturi. Uscire ferma app e backend.",
      "caption": "L’app desktop controlla avvio e arresto dell’istanza locale; i dati devono restare conservati tra un avvio e l’altro.",
      "revision": 5,
      "reviewed": true,
      "capturedAt": "2026-10-08",
      "viewport": [
        720,
        640
      ],
      "theme": "neutral",
      "diagram": {
        "layout": "collection",
        "items": [
          {
            "title": "App desktop seleziona il clone"
          },
          {
            "title": "Applicazione loopback: porta 6463"
          },
          {
            "title": "Supabase minimo e dati duraturi"
          },
          {
            "title": "Uscire ferma app e backend"
          }
        ]
      }
    },
    {
      "id": "install-locally-wizard",
      "kind": "screenshot",
      "src": "/documentation/it/install-locally-wizard.png",
      "alt": "Assistente pubblico di installazione con il profilo per questo computer selezionato.",
      "caption": "Scegli l’installazione personale quando l’applicazione desktop deve gestire i servizi locali.",
      "revision": 5,
      "reviewed": true,
      "capturedAt": "2026-10-09",
      "viewport": [
        944,
        504
      ],
      "theme": "light",
      "padding": 24,
      "deviceScaleFactor": 2
    }
  ],
  "requiredFigures": [
    "install-locally-flow"
  ]
}
---

## Avviare un’istanza locale dall’app desktop {#install-locally}

Usa un clone dedicato alla valutazione con Node.js 24, `pnpm` 10.28.0, Git, Supabase CLI e Docker attivo. Servono almeno 4 GB di RAM libera, due core e 10 GB di SSD libero; sono consigliati 8 GB, quattro core e 20 GB. Installa prima l’app firmata dalla pagina download. Windows usa Microsoft Store; macOS e Linux hanno download specifici. Seleziona nel clone la versione da valutare prima delle dipendenze.

```bash
git clone https://github.com/mangue-dev/minddy.git
cd minddy
git checkout v0.11.0
corepack enable
corepack prepare pnpm@10.28.0 --activate
pnpm install --frozen-lockfile
```


![Schema: App desktop seleziona il clone. Applicazione loopback: porta 6463. Supabase minimo e dati duraturi. Uscire ferma app e backend.](/documentation/it/install-locally-flow.svg)


![Assistente pubblico di installazione con il profilo per questo computer selezionato.](/documentation/it/install-locally-wizard.png)

## Affidare i servizi locali all’app {#launch}

Apri il menu nativo minddy. Windows e Linux mostrano la barra con Alt; macOS usa la barra globale. Apri il dialogo di connessione server, scegli l’istanza locale e la radice del clone. L’app esegue `self-host:local --no-open`, prepara Supabase minimo, applica migrazioni e Storage, compila quando necessario e attende `/api/health` prima della registrazione. Ascolta solo su loopback, porta 6463, ricorda la cartella e gestisce avvio e arresto.

## Disponibilità di MCP e accesso alla rete {#mcp-network-access}

MCP è incluso in minddy self-hosted e si avvia con l’applicazione. Funziona subito su `/api/mcp`, all’origine dell’istanza configurata con `MINDDY_PUBLIC_APP_URL`. Include il rilevamento OAuth e la registrazione dinamica dei client: non servono un server MCP separato, un’applicazione OAuth dedicata o un proxy di minddy Cloud. Collega il client MCP all’endpoint della tua istanza, accedi e concedi l’accesso tramite il consenso nel browser.

La disponibilità del servizio non ne garantisce la raggiungibilità in rete. Sia il client MCP sia il browser usato per l’autorizzazione devono poter raggiungere gli URL MCP e OAuth annunciati. Se imposti esplicitamente `OAUTH_ISSUER`, anche quell’origine deve essere raggiungibile. Il client deve supportare la connessione, il flusso OAuth e il percorso di rete scelto; alcuni client richiedono HTTPS anche nelle reti private.

Questo profilo gestito dall’app desktop ascolta solo sull’interfaccia di loopback. Un client MCP compatibile sullo stesso computer può usare `http://localhost:6463/api/mcp`; `localhost` e `127.0.0.1` indicano il computer che avvia la connessione. Un altro computer o un agente ospitato nel cloud non può raggiungere direttamente questo profilo. Per l’accesso LAN/VPN, usa un’installazione server con un’origine configurata raggiungibile, per esempio `http://192.168.1.50`, e consenti l’accesso alla porta dell’applicazione tramite indirizzo di ascolto, firewall e instradamento. Fuori da quella rete, il client deve avere un’origine HTTPS raggiungibile come `https://tickets.example.com`, o un altro percorso di rete supportato. L’installazione locale non consente automaticamente l’accesso da Internet.

[Leggi la guida all’accesso di rete di MCP prima di collegare un client remoto](/docs/minddy-mcp#network-access).

## Recuperare dopo un errore {#recover}

Chiudere una finestra lascia attiva l’app desktop; usa il comando per uscire dall’applicazione per arrestare anche i servizi locali. Se non parte, copia il rapporto diagnostico dal menu nativo di aiuto. Controlla Docker, CLI, spazio e altri processi sulla 6463.

`pnpm self-host:local` è un’alternativa diagnostica da terminale. Fermala con Ctrl+C prima di tornare all’app, che non prende processi altrui. Uscire dall’app arresta normalmente anche Supabase; `--keep-backend` cambia esplicitamente il comportamento.

Non usare `supabase db reset --local` per recuperare: distrugge i dati di valutazione. Verifica nuovo account, progetto, ticket e allegato prima di affidarti all’istanza.

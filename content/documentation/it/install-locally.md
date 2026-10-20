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
  "revision": 7,
  "sourceRevision": 7,
  "owner": "@mangue-dev",
  "updatedAt": "2026-10-20",
  "compatibility": {
    "version": "0.20.0 (MIN-747 release review)",
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
      "app/api/mcp/route.ts",
      "lib/site.ts",
      "lib/server/app-origin.ts",
      "lib/server/oauth/issuer.ts",
      "app/api/oauth/register/route.ts",
      "lib/server/oauth/metadata.ts"
    ]
  },
  "review": {
    "revision": 7,
    "fact": "agent:/root/min747 (0.20.0 release review: source audit against the v0.11.0..main delta, verified corrections applied; 1 screenshot(s) recaptured on 2026-10-20 from the local candidate and inspected; no browser walkthrough of the procedures or operator rehearsal; earlier evidence retained in git history)",
    "language": "agent:/root/min747 (it translation of the release corrections with catalog UI labels; equivalent meaning self-reviewed; agent review, not human acceptance)",
    "date": "2026-10-20"
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
      "revision": 7,
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
      "revision": 7,
      "reviewed": true,
      "capturedAt": "2026-10-20",
      "viewport": [
        944,
        692
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
git checkout v0.20.0
corepack enable
corepack prepare pnpm@10.28.0 --activate
pnpm install --frozen-lockfile
```


![Schema: App desktop seleziona il clone. Applicazione loopback: porta 6463. Supabase minimo e dati duraturi. Uscire ferma app e backend.](/documentation/it/install-locally-flow.svg)


![Assistente pubblico di installazione con il profilo per questo computer selezionato.](/documentation/it/install-locally-wizard.png)

Le nuove installazioni locali cifrano per impostazione predefinita i contenuti dello spazio di lavoro. Per registrare una scelta esplicita, esegui `pnpm bootstrap:supabase -- --minimal --app-url http://localhost:6463 --encryption enabled` (oppure `--encryption disabled`) nel clone prima di aprirlo nell’app; gli avvii successivi mantengono la scelta salvata. Consulta la [crittografia dello spazio di lavoro](/it/documentazione/workspace-encryption#workspace-encryption).

## Affidare i servizi locali all’app {#launch}

Apri il menu nativo minddy. Windows e Linux mostrano la barra con Alt; macOS usa la barra globale. Apri il dialogo di connessione server, scegli l’istanza locale e la radice del clone. L’app esegue `self-host:local --no-open`, prepara Supabase minimo, applica migrazioni e Storage, compila quando necessario e attende `/api/health` prima della registrazione. Ascolta solo su loopback, porta 6463, ricorda la cartella e gestisce avvio e arresto.

## Disponibilità di MCP e accesso alla rete {#mcp-network-access}

MCP è incluso in minddy self-hosted e si avvia con l’applicazione. Funziona subito su `/api/mcp`, all’origine dell’istanza configurata con `MINDDY_PUBLIC_APP_URL`. Include il rilevamento OAuth e la registrazione dinamica dei client: non servono un server MCP separato, un’applicazione OAuth dedicata o un proxy di minddy Cloud. Collega il client MCP all’endpoint della tua istanza, accedi e concedi l’accesso tramite il consenso nel browser.

La disponibilità del servizio non ne garantisce la raggiungibilità in rete. Sia il client MCP sia il browser usato per l’autorizzazione devono poter raggiungere gli URL MCP e OAuth annunciati. Se imposti esplicitamente `OAUTH_ISSUER`, anche quell’origine deve essere raggiungibile. Il client deve supportare la connessione, il flusso OAuth e il percorso di rete scelto; alcuni client richiedono HTTPS anche nelle reti private.

Questo profilo gestito dall’app desktop ascolta solo sull’interfaccia di loopback. Un client MCP compatibile sullo stesso computer può usare `http://localhost:6463/api/mcp`; `localhost` e `127.0.0.1` indicano il computer che avvia la connessione. Un altro computer o un agente ospitato nel cloud non può raggiungere direttamente questo profilo. Per l’accesso LAN/VPN, usa un’installazione server con un’origine configurata raggiungibile, per esempio `http://192.168.1.50`, e consenti l’accesso alla porta dell’applicazione tramite indirizzo di ascolto, firewall e instradamento. Fuori da quella rete, il client deve avere un’origine HTTPS raggiungibile come `https://tickets.example.com`, o un altro percorso di rete supportato. L’installazione locale non consente automaticamente l’accesso da Internet.

[Leggi la guida all’accesso di rete di MCP prima di collegare un client remoto](/docs/minddy-mcp#network-access).

## Recuperare dopo un errore {#recover}

Chiudere una finestra lascia attiva l’app desktop; usa il comando per uscire dall’applicazione per arrestare anche i servizi locali. Controlla Docker, CLI, spazio e altri processi sulla 6463.

`pnpm self-host:local` è un’alternativa diagnostica da terminale. Fermala con Ctrl+C prima di tornare all’app, che non prende processi altrui. Uscire dall’app arresta normalmente anche Supabase; `--keep-backend` cambia esplicitamente il comportamento.

Non usare `supabase db reset --local` per recuperare: distrugge i dati di valutazione. Verifica nuovo account, progetto, ticket e allegato prima di affidarti all’istanza.

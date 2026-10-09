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
  "revision": 3,
  "sourceRevision": 3,
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
      "content/documentation/reviews/editorial-clarity-it-pt-BR-2026-10-09.md"
    ]
  },
  "review": {
    "revision": 3,
    "fact": "agent:/root consolidation review; agent:/root/italian_portuguese_review retained-meaning comparison with prior procedural evidence (no operational rerun); agent:/root (visual usefulness, figure framing and preserved procedures; previous operational evidence retained)",
    "language": "agent:/root/italian_portuguese_review (localized feature scope, summaries and heading review; retained source procedures); agent:/root/editorial_it_pt (editorial clarity pass); agent:/root (figure removals and captions); agent:/root/editorial_it_pt (collection-caption clarity)",
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
      "revision": 3,
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
      "revision": 3,
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

Usa un clone dedicato alla valutazione con Node.js 24, pnpm 10.28.0, Git, Supabase CLI e Docker attivo. Servono almeno 4 GB di RAM libera, due core e 10 GB di SSD libero; sono consigliati 8 GB, quattro core e 20 GB. Installa prima l’app firmata dalla pagina download. Windows usa Microsoft Store; macOS e Linux hanno download specifici. Seleziona nel clone la versione da valutare prima delle dipendenze.

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

Apri il menu nativo minddy. Windows e Linux mostrano la barra con Alt; macOS usa la barra globale. Apri il dialogo di connessione server, scegli l’istanza locale e la radice del clone. L’app esegue self-host:local --no-open, prepara Supabase minimo, applica migrazioni e Storage, compila quando necessario e attende /api/health prima della registrazione. Ascolta solo su loopback, porta 6463, ricorda la cartella e gestisce avvio e arresto.

## Recuperare dopo un errore {#recover}

Chiudere una finestra lascia attiva l’app desktop; usa il comando per uscire dall’applicazione per arrestare anche i servizi locali. Se non parte, copia il rapporto diagnostico dal menu nativo di aiuto. Controlla Docker, CLI, spazio e altri processi sulla 6463.

pnpm self-host:local è un’alternativa diagnostica da terminale. Fermala con Ctrl+C prima di tornare all’app, che non prende processi altrui. Uscire dall’app arresta normalmente anche Supabase; --keep-backend cambia esplicitamente il comportamento.

Non usare supabase db reset --local per recuperare: distrugge i dati di valutazione. Verifica nuovo account, progetto, ticket e allegato prima di affidarti all’istanza.

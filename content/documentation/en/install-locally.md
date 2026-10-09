---
{
  "id": "install-locally",
  "locale": "en",
  "title": "Local instances",
  "summary": "Use a dedicated clone for evaluation with Node.js 24, pnpm 10.28.0, Git, Supabase CLI and a running Docker daemon.",
  "topic": "Operate an instance",
  "type": "tutorial",
  "audiences": [
    "operator"
  ],
  "workflows": [
    "H02"
  ],
  "visibility": "public",
  "status": "published",
  "revision": 4,
  "sourceRevision": 4,
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
    "revision": 4,
    "fact": "agent:/root/english_french_review with agent:/root (consolidation and retained-claim review; prior procedural evidence inherited; no operational rerun); agent:/root (visual usefulness, figure framing and preserved procedures; previous operational evidence retained); agent:/root (technical-reference formatting; prior factual evidence retained; no operational rerun)",
    "language": "agent:/root/english_french_review (en editorial, feature-scope and retained-meaning review); agent:/root/editorial_en_fr (collection-caption clarity); agent:/root (inline-code syntax and unchanged-text review)",
    "date": "2026-10-09"
  },
  "related": [
    "workspace-encryption",
    "self-hosted-diagnostics"
  ],
  "aliases": [],
  "tags": [
    "Run a local instance from the desktop app"
  ],
  "figures": [
    {
      "id": "install-locally-flow",
      "kind": "diagram",
      "src": "/documentation/en/install-locally-flow.svg",
      "alt": "Diagram: Desktop app selects the clone. Loopback application: port 6463. Minimal Supabase and durable data. Quitting stops app and backend.",
      "caption": "The desktop app manages startup and shutdown of local services while preserving their stored data.",
      "revision": 4,
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
            "title": "Desktop app selects the clone"
          },
          {
            "title": "Loopback application: port 6463"
          },
          {
            "title": "Minimal Supabase and durable data"
          },
          {
            "title": "Quitting stops app and backend"
          }
        ]
      }
    },
    {
      "id": "install-locally-wizard",
      "kind": "screenshot",
      "src": "/documentation/en/install-locally-wizard.png",
      "alt": "Public installation wizard with the local computer profile selected.",
      "caption": "Choose the personal installation when the desktop app will manage the local services.",
      "revision": 4,
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

## Prepare the computer {#install-locally}

Use a dedicated clone for evaluation with Node.js 24, `pnpm` 10.28.0, Git, Supabase CLI and a running Docker daemon. Allow at least 4 GB free RAM, two CPU cores and 10 GB free SSD; 8 GB, four cores and 20 GB are recommended. Install the signed desktop app from the download page first. Windows uses Microsoft Store; macOS and Linux use their platform downloads. Pin the clone to the release you intend to evaluate before installing its dependencies.

```bash
git clone https://github.com/mangue-dev/minddy.git
cd minddy
git checkout v0.11.0
corepack enable
corepack prepare pnpm@10.28.0 --activate
pnpm install --frozen-lockfile
```


![Diagram: Desktop app selects the clone. Loopback application: port 6463. Minimal Supabase and durable data. Quitting stops app and backend.](/documentation/en/install-locally-flow.svg)


![Public installation wizard with the local computer profile selected.](/documentation/en/install-locally-wizard.png)

## Let the app own the local services {#launch}

Open the native minddy menu. On Windows and Linux, press Alt to reveal the menu bar; macOS uses the global menu bar. Choose the server connection dialog, then its local-instance option and select the clone root. The app invokes `self-host:local --no-open`, prepares minimal Supabase, applies migrations and Storage configuration, builds when needed and waits for `/api/health` before opening sign-up. The app binds to loopback port 6463, remembers the folder and owns both startup and shutdown.

## Recover a failed launch {#recover}

Closing a window leaves the desktop application running; use the application’s Quit command to stop it and the local services. Use the native Help menu to copy the diagnostic report if startup fails. Check Docker, CLI availability, free space and whether port 6463 belongs to another process. `pnpm self-host:local` is a terminal troubleshooting fallback. Stop it with Ctrl+C before returning control to the app; the app refuses to claim another process. Quitting the app normally stops Supabase too. The `--keep-backend` option deliberately changes that behavior. Never use `supabase db reset --local` as recovery: it destroys evaluation data. Verify a new account, project, issue and attachment before relying on the instance.

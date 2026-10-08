---
{
  "id": "managed-or-source-installation",
  "locale": "it",
  "title": "Installare con Supabase gestito o dai sorgenti",
  "summary": "Supabase gestito indica chi opera il backend.",
  "topic": "Gestire un’istanza",
  "type": "guide",
  "audiences": [
    "operator"
  ],
  "workflows": [
    "H04"
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
      "docs/self-hosting-distribution.md",
      "deploy/self-hosted/compose.managed.yml"
    ]
  },
  "review": {
    "revision": 1,
    "fact": "agent:/root/automation_account_documentation (independent targeted primary-source review)",
    "language": "agent:/root/automation_account_documentation (complete independent article and caption review)",
    "date": "2026-10-08"
  },
  "related": [
    "instance-configuration",
    "logical-and-provider-backups",
    "proxy-network-and-jobs"
  ],
  "aliases": [],
  "tags": [],
  "figures": [
    {
      "id": "managed-or-source-installation-flow",
      "kind": "diagram",
      "src": "/documentation/it/managed-or-source-installation-flow.svg",
      "alt": "Schema: Il tuo progetto Supabase gestito. PostgreSQL, Auth, Storage, Realtime. Profilo OCI O applicazione dal tag. Job e backup specifici del profilo.",
      "caption": "Questi componenti hanno responsabilità distinte. Il tuo progetto Supabase gestito. PostgreSQL, Auth, Storage, Realtime. Profilo OCI O applicazione dal tag. Job e backup specifici del profilo.",
      "revision": 1,
      "reviewed": true,
      "capturedAt": "2026-10-08",
      "viewport": [
        720,
        640
      ],
      "theme": "neutral"
    }
  ],
  "requiredFigures": [
    "managed-or-source-installation-flow"
  ]
}
---

## Installare con Supabase gestito o dai sorgenti {#managed-or-source-installation}

Supabase gestito indica chi opera il backend. Può essere usato sia con l’immagine OCI ufficiale sia con un server compilato dai sorgenti. Distingui questi deployment nei registri di installazione e accettazione. Il backend deve fornire PostgreSQL, Auth, Storage e Realtime. Il percorso OCI managed guidato richiede un progetto su supabase.com, la sua URL pubblica, le chiavi anon e service-role e una connessione PostgreSQL raggiungibile dagli strumenti di bootstrap. Usa un progetto di tua proprietà, mai credenziali Minddy Cloud.

![Schema: Il tuo progetto Supabase gestito. PostgreSQL, Auth, Storage, Realtime. Profilo OCI O applicazione dal tag. Job e backup specifici del profilo.](/documentation/it/managed-or-source-installation-flow.svg)

## Configurare Supabase gestito {#managed}

Esegui il comando seguente dalla release verificata. IMAGE è il digest controllato nell’articolo sulla compatibilità; ... indica valori di esempio che devi sostituire. Recupera le credenziali reali in privato e tienile fuori dalla cronologia della shell e dai log condivisi. L’installer conserva l’ambiente esistente, include scheduler e runner e non attiva servizi opzionali senza configurazione. Configura separatamente SMTP Auth e i redirect esatti nel progetto Supabase.

```bash
pnpm self-host:install -- --non-interactive --mode managed \
  --app-url https://tickets.example.com --admin-email ops@example.com \
  --supabase-url https://project.supabase.co --anon-key '...' \
  --service-role-key '...' --db-url 'postgresql://postgres:...@db.example.com:5432/postgres' \
  --image "$IMAGE"
```

## Completare il deployment dai sorgenti {#source}

Per installare dai sorgenti, installa le dipendenze bloccate del tag, fornisci l’ambiente Minddy e Supabase, esegui bootstrap e build e avvia il server di produzione dietro un proxy. Imposta MINDDY_PUBLIC_* prima dell’avvio. Devi fornire uno scheduler persistente con le chiamate autenticate descritte nell’articolo sulla rete: un build non esegue i job. Verifica migrazioni e Storage, poi Auth, ticket, byte degli allegati e Realtime. Per il backup usa la procedura logica o del provider. Un server dai sorgenti non valida l’installazione OCI.

```bash
pnpm install --frozen-lockfile
pnpm bootstrap:supabase -- --db-url "$SUPABASE_DB_URL" --env-file .env.local
pnpm build
pnpm start
```

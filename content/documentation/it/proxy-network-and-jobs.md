---
{
  "id": "proxy-network-and-jobs",
  "locale": "it",
  "title": "Esporre origini e gestire i job pianificati",
  "summary": "Un servizio pubblico richiede un proxy TLS e il redirect da HTTP a HTTPS.",
  "topic": "Gestire un’istanza",
  "type": "guide",
  "audiences": [
    "operator"
  ],
  "workflows": [
    "H08"
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
      "docs/self-hosting-distribution.md",
      "vercel.json",
      "deploy/self-hosted/compose.full.yml",
      "deploy/self-hosted/scheduler.mjs"
    ]
  },
  "review": {
    "revision": 1,
    "fact": "agent:/root/automation_account_documentation (independent targeted primary-source review)",
    "language": "agent:/root/automation_account_documentation (complete independent article and caption review)",
    "date": "2026-10-08"
  },
  "related": [
    "update-an-instance",
    "numo-execution-model"
  ],
  "aliases": [],
  "tags": [],
  "figures": [
    {
      "id": "proxy-network-and-jobs-flow",
      "kind": "diagram",
      "src": "/documentation/it/proxy-network-and-jobs-flow.svg",
      "alt": "Schema: Proxy HTTPS pubblico. Origini app e Supabase pubbliche. Runner, database e porte private. Job autenticati; fermi in manutenzione.",
      "caption": "Questi componenti hanno responsabilità distinte. Proxy HTTPS pubblico. Origini app e Supabase pubbliche. Runner, database e porte private. Job autenticati; fermi in manutenzione.",
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
    "proxy-network-and-jobs-flow"
  ]
}
---

## Esporre origini e gestire i job pianificati {#proxy-network-and-jobs}

Un servizio pubblico richiede un proxy TLS e il redirect da HTTP a HTTPS. Le origini Minddy e Supabase, i redirect Auth, i callback OAuth e gli header devono concordare. Non esporre PostgreSQL, Studio, porte interne o runner. Nel profilo full il server usa http://kong:8000 internamente, mentre browser e link mantengono l’origine pubblica di Supabase. HTTP privato richiede localhost o una rete IPv4 privata affidabile, senza inoltro delle porte del router.

![Schema: Proxy HTTPS pubblico. Origini app e Supabase pubbliche. Runner, database e porte private. Job autenticati; fermi in manutenzione.](/documentation/it/proxy-network-and-jobs-flow.svg)

## Fornire pianificazione autenticata {#schedules}

I profili Compose di riferimento avviano lo scheduler e l’installer genera CRON_SECRET. Un deployment personalizzato dai sorgenti deve fornire uno scheduler HTTP equivalente. Ogni richiesta invia `Authorization: Bearer <CRON_SECRET>`; un valore vuoto o errato restituisce 401. Non registrare questo header. Gli orari del candidato elencati sotto sono in UTC. Usa le route della release installata, perché possono cambiare.


Lo scheduler pubblicato in v0.11.0 non include numo-turns. Quello del candidato è stato corretto per chiamarlo ogni minuto. La tabella descrive il candidato corretto: non presumere che questo job esista in un deployment v0.11.0 invariato.

| Endpoint | Orario (UTC) |
| --- | --- |
| `/api/cron/feedback-analysis` | `0 * * * *` |
| `/api/cron/agent-drain` | `*/2 * * * *` |
| `/api/cron/numo-turns` | `* * * * *` |
| `/api/cron/forge-relay-deliveries` | `* * * * *` |
| `/api/cron/forge-relay-maintenance` | `35 * * * *` |
| `/api/cron/automations` | `*/2 * * * *` |
| `/api/cron/smart-assign` | `*/5 * * * *` |
| `/api/cron/routines` | `*/5 * * * *` |
| `/api/cron/billing-sync` | `15 * * * *` |
| `/api/cron/fx-rate` | `30 15 * * *` |
| `/api/cron/encryption-maintenance` | `15 * * * *` |
| `/api/cron/data-retention` | `45 3 * * *` |


## Fermare i job in manutenzione {#maintenance}

Prima di un backup o di una migrazione, ferma scheduler, applicazione, worker e API pubblica. Fermare soltanto il server web lascia possibili scritture dirette. Verifica in manutenzione con ingressi e job chiusi, poi riapri solo dopo i controlli su database, Auth, Storage e applicazione. Se un job non parte, verifica in privato scheduler, origine e segreto. Le routine richiedono il server, non un desktop aperto.

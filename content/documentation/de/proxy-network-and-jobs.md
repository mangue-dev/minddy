---
{
  "id": "proxy-network-and-jobs",
  "locale": "de",
  "title": "Öffentliche Origins und geplante Aufgaben betreiben",
  "summary": "Öffentliche Installationen benötigen TLS-Proxy und HTTP-zu-HTTPS-Weiterleitung.",
  "topic": "Instanz betreiben",
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
      "src": "/documentation/de/proxy-network-and-jobs-flow.svg",
      "alt": "Diagramm: Öffentlicher HTTPS-Proxy. App und öffentlicher Supabase-Origin. Private Runner-, Datenbank- und interne Ports. Authentifizierte Jobs; Wartungsstopp.",
      "caption": "Diese Komponenten haben unterschiedliche Aufgaben. Öffentlicher HTTPS-Proxy. App und öffentlicher Supabase-Origin. Private Runner-, Datenbank- und interne Ports. Authentifizierte Jobs; Wartungsstopp.",
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

## Öffentliche Origins und geplante Aufgaben betreiben {#proxy-network-and-jobs}

Öffentliche Installationen benötigen TLS-Proxy und HTTP-zu-HTTPS-Weiterleitung. Anwendungs- und Supabase-Origin, Auth-Weiterleitungen, OAuth-Callbacks und weitergereichte Header müssen übereinstimmen. PostgreSQL, Studio, interne Ports und Runner bleiben vom Internet getrennt. Im full-Profil verwendet die Anwendung intern http://kong:8000, Browser und erzeugte Links behalten den öffentlichen Supabase-Origin. Privates HTTP verlangt localhost oder vertrauenswürdige private IPv4 ohne Router-Portweiterleitungen.


![Diagramm: Öffentlicher HTTPS-Proxy. App und öffentlicher Supabase-Origin. Private Runner-, Datenbank- und interne Ports. Authentifizierte Jobs; Wartungsstopp.](/documentation/de/proxy-network-and-jobs-flow.svg)

## Authentifizierte Zeitpläne bereitstellen {#schedules}

Referenz-Compose startet den Scheduler und erzeugt CRON_SECRET. Eigene Quellcodebereitstellungen brauchen einen gleichwertigen HTTP-Scheduler. Jede Anfrage sendet `Authorization: Bearer <CRON_SECRET>`; ein leeres oder falsches Geheimnis ergibt 401. Protokollieren Sie den Header nicht. Die folgenden Kandidatenzeitpläne verwenden UTC. Verwenden Sie den Satz der installierten Version, denn Pfade können sich ändern.


Der veröffentlichte Scheduler von v0.11.0 enthält numo-turns nicht. Im Kandidaten wurde der Scheduler um einen Aufruf pro Minute ergänzt. Die Tabelle beschreibt den korrigierten Kandidaten; nehmen Sie diesen Job bei einer unveränderten Installation von v0.11.0 nicht an.

| Endpunkt | Zeitplan (UTC) |
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


## Jobs während Wartung stoppen {#maintenance}

Stoppen Sie vor Backup oder Migration Scheduler, Anwendung, Worker und öffentlichen Supabase-Zugang. Das Stoppen allein der Webanwendung erlaubt weiterhin direkte API-Schreibzugriffe. Prüfen Sie Wartung bei geschlossenen Jobs und Zugängen und öffnen Sie erst nach Datenbank-, Auth-, Storage- und Anwendungstests. Prüfen Sie bei inaktiven Jobs Scheduler, kanonischen Origin und Geheimnis privat. Routinen benötigen den Serverscheduler, keine dauerhaft geöffnete Desktop-App.

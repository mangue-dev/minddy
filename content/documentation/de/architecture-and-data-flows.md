---
{
  "id": "architecture-and-data-flows",
  "locale": "de",
  "title": "Datenflüsse zwischen Anwendung, Datenbank und Anbietern",
  "summary": "Next.js liefert Oberfläche und autorisierte Server-APIs.",
  "topic": "Technische Grundlagen",
  "type": "explanation",
  "audiences": [
    "operator",
    "integrator"
  ],
  "workflows": [
    "T03"
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
      "docs/editions.md",
      "docs/self-hosting-distribution.md",
      "lib/server/capabilities.ts"
    ]
  },
  "review": {
    "revision": 1,
    "fact": "agent:/root/automation_account_documentation (independent targeted primary-source review)",
    "language": "agent:/root/automation_account_documentation (complete independent article and caption review)",
    "date": "2026-10-08"
  },
  "related": [
    "optional-providers",
    "storage-and-attachments",
    "numo-execution-model"
  ],
  "aliases": [],
  "tags": [],
  "figures": [
    {
      "id": "architecture-and-data-flows-flow",
      "kind": "diagram",
      "src": "/documentation/de/architecture-and-data-flows-flow.svg",
      "alt": "Diagramm: Browser und authentifizierte Anwendung. Supabase: PostgreSQL, Auth, Storage, Realtime. Unabhängiger Scheduler und vertrauenswürdiger Runner. Optionale Anbieter: getrennte Datenziele.",
      "caption": "Diese Komponenten haben unterschiedliche Aufgaben. Browser und authentifizierte Anwendung. Supabase: PostgreSQL, Auth, Storage, Realtime. Unabhängiger Scheduler und vertrauenswürdiger Runner. Optionale Anbieter: getrennte Datenziele.",
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
    "architecture-and-data-flows-flow"
  ]
}
---

## Datenflüsse zwischen Anwendung, Datenbank und Anbietern {#architecture-and-data-flows}

Next.js liefert Oberfläche und autorisierte Server-APIs. Supabase bietet PostgreSQL, Auth, Storage und Realtime. PostgreSQL hält Anwendungs-, Konto-/Plattformdaten und Storage-Metadaten; das Storage-Backend die Bytes. Geschützte Serverkonfiguration enthält Schlüssel und Anbieterzugänge. Appcontainer sind ersetzbar, Datenbankvolumes, Rohstorage und passende Schlüssel müssen bestehen bleiben. Vollständige Wiederherstellung braucht sie zusammen.


![Diagramm: Browser und authentifizierte Anwendung. Supabase: PostgreSQL, Auth, Storage, Realtime. Unabhängiger Scheduler und vertrauenswürdiger Runner. Optionale Anbieter: getrennte Datenziele.](/documentation/de/architecture-and-data-flows-flow.svg)

## Eine Anfrage verfolgen {#requests}

Der Browser verwendet öffentliche Anwendungs- und Supabase-Origins. Auth etabliert die Sitzung; Serverendpunkte prüfen Akteur und Objektzugriff vor Lesen oder Ändern. Realtime zeigt Updates in verbundenen Sitzungen. Bei full nutzen Serveraufrufe internes Kong ohne Browserorigins oder Kontolinkidentität zu ändern. Der Scheduler ruft authentifizierte HTTP-Jobs unabhängig von Browsern auf. Der vertrauenswürdige Runner eröffnet eingeschränkte Repository-Sandboxes nur bei Numo-Codebedarf; diese erhalten weder Instanzgeheimnisse noch Docker-Socket.

## Externe Ziele erkennen {#providers}

KI, E-Mail, Git, entferntes MCP, Push, Analytics und externe Objektbackends sind getrennte Ziele bei Aktivierung. Selbstbetrieb der App macht sie nicht lokal. Managed Supabase betreibt das ausgewählte Backend, full stellt den festgelegten Stack unter Ihre Kontrolle. Cloud betreibt Dienst und konfigurierte Anbieter; Selbsthosting liefert eigene Konten und Entscheidungen. Prüfen Sie Rechte, Kosten und Datenbedingungen jeder Integration. Leiten Sie Anbieter oder Cloud-Edition nie aus Hostname oder Plattform ab.

---
{
  "id": "architecture-and-data-flows",
  "locale": "de",
  "title": "Architektur und Datenflüsse",
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
  "revision": 7,
  "sourceRevision": 7,
  "owner": "@mangue-dev",
  "updatedAt": "2026-10-22",
  "compatibility": {
    "version": "0.20.0 (MIN-747 release review)",
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
    "revision": 7,
    "fact": "agent:/root/min747 (0.20.0 release review: source audit against the v0.11.0..main delta, no correction needed; no screenshot in scope; no browser walkthrough of the procedures or operator rehearsal; earlier evidence retained in git history); agent:claude-code (manual figures rebuilt on the Aurora demo, catalog review labels and informal register; figures recaptured on 2026-10-22 from a local candidate against the preview demo account and inspected; no form submitted)",
    "language": "agent:/root/min747 (de translation of the release corrections with catalog UI labels; equivalent meaning self-reviewed; agent review, not human acceptance); agent:claude-code (de manual figures rebuilt on the Aurora demo, catalog review labels and informal register; self-reviewed; agent review, not human acceptance)",
    "date": "2026-10-22"
  },
  "related": [
    "instance-configuration",
    "storage-and-attachments",
    "numo"
  ],
  "aliases": [],
  "tags": [
    "Datenflüsse zwischen Anwendung, Datenbank und Anbietern"
  ],
  "figures": [
    {
      "id": "architecture-and-data-flows-flow",
      "kind": "diagram",
      "src": "/documentation/de/architecture-and-data-flows-flow.svg",
      "alt": "Diagramm: Browser und authentifizierte Anwendung. Supabase: PostgreSQL, Auth, Storage, Realtime. Unabhängiger Scheduler für Hintergrundjobs. Optionale Anbieter: getrennte Datenziele.",
      "caption": "Die Infrastruktur trennt interaktive Anfragen, geplante Arbeit und externe Datenziele.",
      "revision": 7,
      "reviewed": true,
      "capturedAt": "2026-10-16",
      "viewport": [
        720,
        640
      ],
      "theme": "neutral",
      "diagram": {
        "layout": "collection",
        "items": [
          {
            "title": "Browser und authentifizierte Anwendung"
          },
          {
            "title": "Supabase: PostgreSQL, Auth, Storage, Realtime"
          },
          {
            "title": "Unabhängiger Scheduler für Hintergrundjobs"
          },
          {
            "title": "Optionale Anbieter: getrennte Datenziele"
          }
        ]
      }
    }
  ],
  "requiredFigures": [
    "architecture-and-data-flows-flow"
  ]
}
---

## Datenflüsse zwischen Anwendung, Datenbank und Anbietern {#architecture-and-data-flows}

`Next.js` liefert Oberfläche und autorisierte Server-APIs. Supabase bietet PostgreSQL, Auth, Storage und Realtime. PostgreSQL hält Anwendungs-, Konto-/Plattformdaten und Storage-Metadaten; das Storage-Backend die Bytes. Geschützte Serverkonfiguration enthält Schlüssel und Anbieterzugänge. Appcontainer sind ersetzbar, Datenbankvolumes, Rohstorage und passende Schlüssel müssen bestehen bleiben. Vollständige Wiederherstellung braucht sie zusammen.


![Diagramm: Browser und authentifizierte Anwendung. Supabase: PostgreSQL, Auth, Storage, Realtime. Unabhängiger Scheduler für Hintergrundjobs. Optionale Anbieter: getrennte Datenziele.](/documentation/de/architecture-and-data-flows-flow.svg)

## Eine Anfrage verfolgen {#requests}

Der Browser verwendet öffentliche Anwendungs- und Supabase-Origins. Auth etabliert die Sitzung; Serverendpunkte prüfen Akteur und Objektzugriff vor Lesen oder Ändern. Realtime zeigt Updates in verbundenen Sitzungen. Bei full nutzen Serveraufrufe internes Kong ohne Browserorigins oder Kontolinkidentität zu ändern. Der Scheduler ruft authentifizierte HTTP-Jobs unabhängig von Browsern auf.

## Externe Ziele erkennen {#providers}

KI, E-Mail, Git, entferntes MCP, Push, Analytics und externe Objektbackends sind getrennte Ziele bei Aktivierung. Selbstbetrieb der App macht sie nicht lokal. Managed Supabase betreibt das ausgewählte Backend, full stellt den festgelegten Stack unter deine Kontrolle. Cloud betreibt Dienst und konfigurierte Anbieter; Selbsthosting liefert eigene Konten und Entscheidungen. Prüfe Rechte, Kosten und Datenbedingungen jeder Integration. Leite Anbieter oder Cloud-Edition nie aus Hostname oder Plattform ab.

---
{
  "id": "encryption-and-data-boundaries",
  "locale": "de",
  "title": "Verschlüsselung und Datengrenzen",
  "summary": "Nach Konfiguration und Migration verschlüsselt minddy Arbeitsbereichsinhalte und Dateien vor dauerhaften Schreibvorgängen authentifiziert auf dem Server.",
  "topic": "Technische Grundlagen",
  "type": "explanation",
  "audiences": [
    "member",
    "operator"
  ],
  "workflows": [
    "T04"
  ],
  "visibility": "public",
  "status": "published",
  "revision": 6,
  "sourceRevision": 6,
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
      "docs/self-hosting.md",
      "lib/server/encryption/data-policy.json",
      "lib/server/encryption.ts",
      "docs/editions.md"
    ]
  },
  "review": {
    "revision": 6,
    "fact": "agent:/root/min747 (0.20.0 release review: source audit against the v0.11.0..main delta, no correction needed; no screenshot in scope; no browser walkthrough of the procedures or operator rehearsal; earlier evidence retained in git history); agent:claude-code (manual figures rebuilt on the Aurora demo, catalog review labels and informal register; figures recaptured on 2026-10-22 from a local candidate against the preview demo account and inspected; no form submitted)",
    "language": "agent:/root/min747 (de translation of the release corrections with catalog UI labels; equivalent meaning self-reviewed; agent review, not human acceptance); agent:claude-code (de manual figures rebuilt on the Aurora demo, catalog review labels and informal register; self-reviewed; agent review, not human acceptance)",
    "date": "2026-10-22"
  },
  "related": [
    "workspace-encryption",
    "backups-and-restoration",
    "permissions-and-public-links"
  ],
  "aliases": [],
  "tags": [
    "Verschlüsselung und verbleibende Datenzugriffe verstehen"
  ],
  "figures": [
    {
      "id": "encryption-and-data-boundaries-flow",
      "kind": "diagram",
      "src": "/documentation/de/encryption-and-data-boundaries-flow.svg",
      "alt": "Diagramm: Verschlüsselte Inhalte und umschlossene Schlüssel. Wurzelschlüssel in geschützter Serverkonfiguration. Autorisierte Laufzeit kann entschlüsseln. Exporte und externe Anbieter getrennt schützen.",
      "caption": "Gespeicherte Inhalte sind geschützt, doch die autorisierte Anwendung kann sie entschlüsseln und ausgegebene Daten brauchen eigenen Schutz.",
      "revision": 6,
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
            "title": "Verschlüsselte Inhalte und umschlossene Schlüssel"
          },
          {
            "title": "Wurzelschlüssel in geschützter Serverkonfiguration"
          },
          {
            "title": "Autorisierte Laufzeit kann entschlüsseln"
          },
          {
            "title": "Exporte und externe Anbieter getrennt schützen"
          }
        ]
      }
    }
  ],
  "requiredFigures": [
    "encryption-and-data-boundaries-flow"
  ]
}
---

## Verschlüsselung und verbleibende Datenzugriffe verstehen {#encryption-and-data-boundaries}

Nach Konfiguration und Migration verschlüsselt minddy Arbeitsbereichsinhalte und Dateien vor dauerhaften Schreibvorgängen authentifiziert auf dem Server. Projekt-, Benutzer- und Systemschlüssel sind versioniert und von einem Wurzelschlüssel außerhalb PostgreSQL umschlossen. Eine reine Datenbankextraktion liest geschützte Inhalte ohne Schlüssel nicht. Die Anwendung entschlüsselt für autorisierten Zugriff, Suche und unbeaufsichtigte KI. Kompromittierte Laufzeit oder gemeinsamer Zugriff auf Schlüssel und Daten überschreitet diese Grenze; Ende-zu-Ende-Geheimhaltung gegenüber dem Betreiber besteht nicht.


![Diagramm: Verschlüsselte Inhalte und umschlossene Schlüssel. Wurzelschlüssel in geschützter Serverkonfiguration. Autorisierte Laufzeit kann entschlüsseln. Exporte und externe Anbieter getrennt schützen.](/documentation/de/encryption-and-data-boundaries-flow.svg)

## Lesbare und exportierte Daten erkennen {#exceptions}

Auth hält Login-E-Mail als Identität. Routing-IDs, Projekt-/Ticketschlüssel, Zustände, Prioritäten, Zeitstempel und erlaubte Metadaten bleiben abfragbar. Veröffentlichte Inhalte sind für ihre Zielgruppe lesbar. Exporte, Downloads, Browserinhalte und an externe KI, E-Mail, Git oder MCP gesendete Informationen brauchen eigene Behandlung. Ein gesetztes Flag beweist keine Konvertierung oder Löschung historischer Kopien, Logs und beim Anbieter gespeicherter Daten. Repository-Code allein belegt keinen produktiven Cloud-Verschlüsselungsstatus.

## Wiederherstellbarkeit erhalten {#recovery}

Schütze `MINDDY_DATA_ROOT_KEY` außerhalb der Datenbank und behalte Wiederherstellungskopien für aktuelle und historische Backups. Stelle Datenbank, Storage-Bytes und passende Konfiguration konsistent zusammen wieder her. Verschlüssele die äußere Sicherung, wenn sie Daten und Schlüssel enthält. Ein neuer Wurzelschlüssel ohne Neuverpacken macht Inhalte unlesbar; Abschalten wandelt Geheimtext nicht in Klartext. Erprobe die Wiederherstellung vor Aktivierung auf Bestandsdaten und prüfe tatsächliche Entschlüsselung und Downloadbytes.

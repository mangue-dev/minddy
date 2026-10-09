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
  "revision": 4,
  "sourceRevision": 4,
  "owner": "@mangue-dev",
  "updatedAt": "2026-10-09",
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
      "docs/self-hosting.md",
      "lib/server/encryption/data-policy.json",
      "lib/server/encryption.ts",
      "docs/editions.md",
      "content/documentation/reviews/editorial-clarity-en-fr-2026-10-09.md",
      "content/documentation/reviews/editorial-clarity-de-es-2026-10-09.md",
      "content/documentation/reviews/editorial-clarity-it-pt-BR-2026-10-09.md",
      "content/documentation/reviews/premerge-de-es-2026-10-10.md",
      "content/documentation/reviews/premerge-light-review-2026-10-10.md"
    ]
  },
  "review": {
    "revision": 4,
    "fact": "agent:/root/german_spanish_review (structural consolidation review; prior procedural evidence retained; no operational rerun); agent:/root (visual usefulness, figure framing and preserved procedures; previous operational evidence retained); agent:/root (technical-reference formatting; prior factual evidence retained; no operational rerun)",
    "language": "agent:/root/german_spanish_review (de title, summary, lead and heading review; retained body comparison); agent:/root/editorial_de_es (collection-caption clarity); agent:/root (inline-code syntax and unchanged-text review)",
    "date": "2026-10-09"
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

Schützen Sie `MINDDY_DATA_ROOT_KEY` außerhalb der Datenbank und behalten Sie Wiederherstellungskopien für aktuelle und historische Backups. Restaurieren Sie Datenbank, Storage-Bytes und passende Konfiguration konsistent zusammen. Verschlüsseln Sie die äußere Sicherung, wenn sie Daten und Schlüssel enthält. Ein neuer Wurzelschlüssel ohne Neuverpacken macht Inhalte unlesbar; Abschalten wandelt Geheimtext nicht in Klartext. Erproben Sie Wiederherstellung vor Aktivierung auf Bestandsdaten und prüfen Sie tatsächliche Entschlüsselung und Downloadbytes.

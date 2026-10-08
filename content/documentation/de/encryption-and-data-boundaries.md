---
{
  "id": "encryption-and-data-boundaries",
  "locale": "de",
  "title": "Verschlüsselung und verbleibende Datenzugriffe verstehen",
  "summary": "Nach Konfiguration und Migration verschlüsselt Minddy Arbeitsbereichsinhalte und Dateien vor dauerhaften Schreibvorgängen authentifiziert auf dem Server.",
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
      "docs/self-hosting.md",
      "lib/server/encryption/data-policy.json",
      "lib/server/encryption.ts",
      "docs/editions.md"
    ]
  },
  "review": {
    "revision": 1,
    "fact": "agent:/root/automation_account_documentation (independent targeted primary-source review)",
    "language": "agent:/root/automation_account_documentation (complete independent article and caption review)",
    "date": "2026-10-08"
  },
  "related": [
    "workspace-encryption",
    "restore-and-roll-back",
    "permissions-and-public-links"
  ],
  "aliases": [],
  "tags": [],
  "figures": [
    {
      "id": "encryption-and-data-boundaries-flow",
      "kind": "diagram",
      "src": "/documentation/de/encryption-and-data-boundaries-flow.svg",
      "alt": "Diagramm: Verschlüsselte Inhalte und umschlossene Schlüssel. Wurzelschlüssel in geschützter Serverkonfiguration. Autorisierte Laufzeit kann entschlüsseln. Exporte und externe Anbieter getrennt schützen.",
      "caption": "Diese Komponenten haben unterschiedliche Aufgaben. Verschlüsselte Inhalte und umschlossene Schlüssel. Wurzelschlüssel in geschützter Serverkonfiguration. Autorisierte Laufzeit kann entschlüsseln. Exporte und externe Anbieter getrennt schützen.",
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
    "encryption-and-data-boundaries-flow"
  ]
}
---

## Verschlüsselung und verbleibende Datenzugriffe verstehen {#encryption-and-data-boundaries}

Nach Konfiguration und Migration verschlüsselt Minddy Arbeitsbereichsinhalte und Dateien vor dauerhaften Schreibvorgängen authentifiziert auf dem Server. Projekt-, Benutzer- und Systemschlüssel sind versioniert und von einem Wurzelschlüssel außerhalb PostgreSQL umschlossen. Eine reine Datenbankextraktion liest geschützte Inhalte ohne Schlüssel nicht. Die Anwendung entschlüsselt für autorisierten Zugriff, Suche und unbeaufsichtigte KI. Kompromittierte Laufzeit oder gemeinsamer Zugriff auf Schlüssel und Daten überschreitet diese Grenze; Ende-zu-Ende-Geheimhaltung gegenüber dem Betreiber besteht nicht.


![Diagramm: Verschlüsselte Inhalte und umschlossene Schlüssel. Wurzelschlüssel in geschützter Serverkonfiguration. Autorisierte Laufzeit kann entschlüsseln. Exporte und externe Anbieter getrennt schützen.](/documentation/de/encryption-and-data-boundaries-flow.svg)

## Lesbare und exportierte Daten erkennen {#exceptions}

Auth hält Login-E-Mail als Identität. Routing-IDs, Projekt-/Ticketschlüssel, Zustände, Prioritäten, Zeitstempel und erlaubte Metadaten bleiben abfragbar. Veröffentlichte Inhalte sind für ihre Zielgruppe lesbar. Exporte, Downloads, Browserinhalte und an externe KI, E-Mail, Git oder MCP gesendete Informationen brauchen eigene Behandlung. Ein gesetztes Flag beweist keine Konvertierung oder Löschung historischer Kopien, Logs und beim Anbieter gespeicherter Daten. Repository-Code allein belegt keinen produktiven Cloud-Verschlüsselungsstatus.

## Wiederherstellbarkeit erhalten {#recovery}

Schützen Sie MINDDY_DATA_ROOT_KEY außerhalb der Datenbank und behalten Sie Wiederherstellungskopien für aktuelle und historische Backups. Restaurieren Sie Datenbank, Storage-Bytes und passende Konfiguration konsistent zusammen. Verschlüsseln Sie die äußere Sicherung, wenn sie Daten und Schlüssel enthält. Ein neuer Wurzelschlüssel ohne Neuverpacken macht Inhalte unlesbar; Abschalten wandelt Geheimtext nicht in Klartext. Erproben Sie Wiederherstellung vor Aktivierung auf Bestandsdaten und prüfen Sie tatsächliche Entschlüsselung und Downloadbytes.

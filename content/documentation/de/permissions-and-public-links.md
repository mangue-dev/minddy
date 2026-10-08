---
{
  "id": "permissions-and-public-links",
  "locale": "de",
  "title": "Berechtigungen und öffentliche Links verstehen",
  "summary": "Der Server prüft Projektzugriff bei jedem zugeordneten Vorgang.",
  "topic": "Technische Grundlagen",
  "type": "explanation",
  "audiences": [
    "owner",
    "integrator"
  ],
  "workflows": [
    "T02"
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
      "lib/server/pages.ts",
      "lib/server/page-publication.ts",
      "lib/server/mcp/auth.ts",
      "proxy.ts",
      "content/knowledge/settings-and-data.md"
    ]
  },
  "review": {
    "revision": 1,
    "fact": "agent:/root/automation_account_documentation (independent targeted primary-source review)",
    "language": "agent:/root/automation_account_documentation (complete independent article and caption review)",
    "date": "2026-10-08"
  },
  "related": [
    "publish-a-page",
    "share-a-view",
    "encryption-and-data-boundaries"
  ],
  "aliases": [],
  "tags": [],
  "figures": [
    {
      "id": "permissions-and-public-links-flow",
      "kind": "diagram",
      "src": "/documentation/de/permissions-and-public-links-flow.svg",
      "alt": "Diagramm: Konto- und Projektberechtigungen. Privates Objekt oder bewusste Veröffentlichung. Nur veröffentlichter Satz; signierte Dateien. Link widerrufen; Dateilinks laufen später ab.",
      "caption": "Diese Komponenten haben unterschiedliche Aufgaben. Konto- und Projektberechtigungen. Privates Objekt oder bewusste Veröffentlichung. Nur veröffentlichter Satz; signierte Dateien. Link widerrufen; Dateilinks laufen später ab.",
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
    "permissions-and-public-links-flow"
  ]
}
---

## Berechtigungen und öffentliche Links verstehen {#permissions-and-public-links}

Der Server prüft Projektzugriff bei jedem zugeordneten Vorgang. Eigentümer verwalten reservierte Einstellungen, Mitglieder und Integrationen. Mitglieder arbeiten an Tickets und Seiten gemäß Berechtigungsprüfungen; ein ausgeblendetes Steuerelement ist keine Autorisierung. Persönliche Einstellungen, Aufgabenheft und private Numo-Chats werden durch Projektkontext nicht geteilt. MCP handelt als autorisiertes Konto und prüft Mitgliedschaft, ohne dem Agenten Instanzadministration zu geben.


![Diagramm: Konto- und Projektberechtigungen. Privates Objekt oder bewusste Veröffentlichung. Nur veröffentlichter Satz; signierte Dateien. Link widerrufen; Dateilinks laufen später ab.](/documentation/de/permissions-and-public-links-flow.svg)

## Veröffentlichungsumfang verstehen {#publication}

Veröffentlichte Seiten und geteilte Ansichten verwenden einen undurchsichtigen Zugriffslink, optional mit Passwort. Wer den Link und, sofern erforderlich, das Passwort besitzt, kann auf die veröffentlichten Inhalte zugreifen. Widerrufen Sie den Link, wenn er nicht mehr benötigt wird. Unterseiten werden nur innerhalb des veröffentlichten Satzes aufgelöst; ausgeschlossene Titel bleiben verborgen. Dateien erhalten Signaturen nur für veröffentlichte Seiten, private Buckets und authentifizierte Routen bleiben geschlossen. Erwähnungen können Text ohne private Profillinks bleiben. Eine veröffentlichte Datenbank zeigt nur Einträge ihres veröffentlichten Zweigs.

## Freigabe und Widerruf prüfen {#revocation}

Öffnen Sie das Ergebnis in einer eigenen abgemeldeten Sitzung und prüfen Sie Inhalte, Dateien und unzugängliche ausgeschlossene Objekte. Widerrufen Sie und testen Sie erneut. Kopierte Daten lassen sich nicht zurückholen; bereits signierte Dateilinks können bis Ablauf gültig bleiben, bei Seitendateien 24 Stunden. Geheime Nutzerlinks bleiben noindex, anders als indexierbare offizielle Dokumentation. noindex steuert Crawler, nicht Zugriff. Teilen Sie private Zugriffslinks nie in öffentlichen Berichten oder Beispielen.

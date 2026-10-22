---
{
  "id": "permissions-and-public-links",
  "locale": "de",
  "title": "Berechtigungen und öffentliche Links",
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
      "lib/server/pages.ts",
      "lib/server/page-publication.ts",
      "lib/server/mcp/auth.ts",
      "proxy.ts",
      "content/knowledge/settings-and-data.md",
      "docs/security/project-roles.md",
      "lib/project-roles.ts"
    ]
  },
  "review": {
    "revision": 7,
    "fact": "agent:/root/min747 (0.20.0 release review: source audit against the v0.11.0..main delta, verified corrections applied; no screenshot in scope; no browser walkthrough of the procedures or operator rehearsal; earlier evidence retained in git history); agent:claude-code (manual figures rebuilt on the Aurora demo, catalog review labels and informal register; figures recaptured on 2026-10-22 from a local candidate against the preview demo account and inspected; no form submitted)",
    "language": "agent:/root/min747 (de translation of the release corrections with catalog UI labels; equivalent meaning self-reviewed; agent review, not human acceptance); agent:claude-code (de manual figures rebuilt on the Aurora demo, catalog review labels and informal register; self-reviewed; agent review, not human acceptance)",
    "date": "2026-10-22"
  },
  "related": [
    "pages",
    "views",
    "encryption-and-data-boundaries"
  ],
  "aliases": [],
  "tags": [
    "Berechtigungen und öffentliche Links verstehen"
  ],
  "figures": [
    {
      "id": "permissions-and-public-links-flow",
      "kind": "diagram",
      "src": "/documentation/de/permissions-and-public-links-flow.svg",
      "alt": "Diagramm: Konto- und Projektberechtigungen. Privates Objekt oder bewusste Veröffentlichung. Nur veröffentlichter Satz; signierte Dateien. Link widerrufen; Dateilinks laufen später ab.",
      "caption": "Eine Freigabe betrifft nur ausgewählte Inhalte; bereits ausgestellte Dateilinks können nach dem Widerruf der Freigabe noch gültig bleiben.",
      "revision": 7,
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
            "title": "Konto- und Projektberechtigungen"
          },
          {
            "title": "Privates Objekt oder bewusste Veröffentlichung"
          },
          {
            "title": "Nur veröffentlichter Satz; signierte Dateien"
          },
          {
            "title": "Link widerrufen; Dateilinks laufen später ab"
          }
        ]
      }
    }
  ],
  "requiredFigures": [
    "permissions-and-public-links-flow"
  ]
}
---

## Berechtigungen und öffentliche Links verstehen {#permissions-and-public-links}

Der Server prüft Projektzugriff und deine Projektrolle bei jedem zugeordneten Vorgang. Jedes Projekt hat einen Eigentümer, der reservierte Einstellungen, Mitglieder, Rollen und Integrationen verwaltet. Mitglieder arbeiten an den Projektinhalten. Leser können sie lesen und, wenn der Eigentümer **Darf kommentieren** für sie aktiviert, kommentieren; sie können weder Inhalte bearbeiten noch Links veröffentlichen und sehen weder Integrationen noch Freigabe- und Board-Tokens. Die Tabelle der [Projektrollen](/docs/projects#member-permissions) zeigt den Zugriff jeder Rolle. Ein ausgeblendetes Steuerelement ist keine Autorisierung. Persönliche Einstellungen, Aufgabenheft und private Numo-Chats werden durch Projektkontext nicht geteilt. MCP handelt als autorisiertes Konto und folgt bei jedem Aufruf dessen aktueller Rolle im jeweiligen Projekt, ohne dem Agenten Instanzadministration zu geben. Projektintegrationen mit `mdy_`-Schlüsseln sind keine Personen: Sie behalten die festen Berechtigungen ihrer Art und erhalten keine Rolle.

Eine Rollenänderung oder Entfernung gilt ab der nächsten Anfrage. Bereits ausgelieferte Inhalte werden nicht zurückgeholt, und eine bereits ausgestellte signierte URL für eine private Datei bleibt bis zu ihrem Ablauf gültig, höchstens 10 Minuten lang.


![Diagramm: Konto- und Projektberechtigungen. Privates Objekt oder bewusste Veröffentlichung. Nur veröffentlichter Satz; signierte Dateien. Link widerrufen; Dateilinks laufen später ab.](/documentation/de/permissions-and-public-links-flow.svg)

## Veröffentlichungsumfang verstehen {#publication}

Veröffentlichte Seiten und geteilte Ansichten verwenden einen undurchsichtigen Zugriffslink, optional mit Passwort. Der Eigentümer und Mitglieder können diese Links veröffentlichen und widerrufen, Leser nicht. Wer den Link und, sofern erforderlich, das Passwort besitzt, kann auf die veröffentlichten Inhalte zugreifen. Widerrufe den Link, wenn er nicht mehr benötigt wird. Unterseiten werden nur innerhalb des veröffentlichten Satzes aufgelöst; ausgeschlossene Titel bleiben verborgen. Dateien erhalten Signaturen nur für veröffentlichte Seiten, private Buckets und authentifizierte Routen bleiben geschlossen. Erwähnungen können Text ohne private Profillinks bleiben. Eine veröffentlichte Datenbank zeigt nur Einträge ihres veröffentlichten Zweigs.

## Freigabe und Widerruf prüfen {#revocation}

Öffne das Ergebnis in einer eigenen abgemeldeten Sitzung und prüfe Inhalte, Dateien und unzugängliche ausgeschlossene Objekte. Widerrufe und teste erneut. Kopierte Daten lassen sich nicht zurückholen; bereits signierte Dateilinks können bis Ablauf gültig bleiben; für eine veröffentlichte Seite ausgegebene Dateilinks gelten 24 Stunden. Geheime Nutzerlinks bleiben `noindex`, anders als indexierbare offizielle Dokumentation. `noindex` steuert Crawler, nicht Zugriff. Teile private Zugriffslinks nie in öffentlichen Berichten oder Beispielen.

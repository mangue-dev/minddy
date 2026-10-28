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
  "revision": 8,
  "sourceRevision": 8,
  "owner": "@mangue-dev",
  "updatedAt": "2026-10-28",
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
      "lib/project-roles.ts",
      "components/public-page-body.tsx"
    ]
  },
  "review": {
    "revision": 8,
    "fact": "agent:claude-code (published-page mention sentence checked against components/public-page-body.tsx and app/p/[token]/published-page.tsx: a mention of a page in the published set shows its title and opens under the same link, any other page shows the Sub-page not published label, inert; rest of the article unchanged since the previous review; no figure recaptured, existing figures do not show the changed behavior)",
    "language": "agent:claude-code (de changed sentence with catalog UI labels; equivalent meaning to en revision 8; self-reviewed; agent review, not human acceptance)",
    "date": "2026-10-28"
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
      "revision": 8,
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

Veröffentlichte Seiten und geteilte Ansichten verwenden einen undurchsichtigen Zugriffslink, optional mit Passwort. Der Eigentümer und Mitglieder können diese Links veröffentlichen und widerrufen, Leser nicht. Wer den Link und, sofern erforderlich, das Passwort besitzt, kann auf die veröffentlichten Inhalte zugreifen. Widerrufe den Link, wenn er nicht mehr benötigt wird. Auf einer veröffentlichten Seite zeigt eine Erwähnung einer Seite aus dem veröffentlichten Satz ihren Titel und öffnet diese Seite unter demselben Link; eine Erwähnung jeder anderen Seite zeigt **Unterseite nicht veröffentlicht** und lässt sich nicht öffnen, sodass ausgeschlossene Titel verborgen bleiben. Dateien erhalten Signaturen nur für veröffentlichte Seiten, private Buckets und authentifizierte Routen bleiben geschlossen. Erwähnungen können Text ohne private Profillinks bleiben. Eine veröffentlichte Datenbank zeigt nur Einträge ihres veröffentlichten Zweigs.

## Freigabe und Widerruf prüfen {#revocation}

Öffne das Ergebnis in einer eigenen abgemeldeten Sitzung und prüfe Inhalte, Dateien und unzugängliche ausgeschlossene Objekte. Widerrufe und teste erneut. Kopierte Daten lassen sich nicht zurückholen; bereits signierte Dateilinks können bis Ablauf gültig bleiben; für eine veröffentlichte Seite ausgegebene Dateilinks gelten 24 Stunden. Geheime Nutzerlinks bleiben `noindex`, anders als indexierbare offizielle Dokumentation. `noindex` steuert Crawler, nicht Zugriff. Teile private Zugriffslinks nie in öffentlichen Berichten oder Beispielen.

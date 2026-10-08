---
{
  "id": "external-minddy-mcp",
  "locale": "de",
  "title": "Einen externen Assistenten mit Minddy MCP verbinden",
  "summary": "Einen kompatiblen Client auf der richtigen Instanz autorisieren und Zugriff widerrufen.",
  "topic": "Numo und Integrationen",
  "type": "guide",
  "audiences": [
    "integrator",
    "member"
  ],
  "workflows": [
    "N09"
  ],
  "visibility": "public",
  "status": "published",
  "revision": 1,
  "sourceRevision": 1,
  "owner": "@mangue-dev",
  "updatedAt": "2026-10-08",
  "compatibility": {
    "version": "0.11.1 candidate (cd1843e12)",
    "editions": [
      "Cloud",
      "self-hosted"
    ],
    "profiles": [
      "web",
      "mobile",
      "desktop"
    ],
    "evidence": [
      "app/(marketing)/mcp/page.tsx",
      "app/api/mcp/route.ts",
      "lib/site.ts",
      "components/settings/mcp-connect-panel.tsx",
      "components/settings/account-connected-apps-section.tsx",
      "content/documentation/reviews/remaining-account-capture-candidates.json",
      "content/documentation/reviews/mcp-access-capture-candidates.json"
    ]
  },
  "review": {
    "revision": 1,
    "fact": "2026-10-08",
    "language": "2026-10-08",
    "date": "2026-10-08"
  },
  "related": [],
  "aliases": [],
  "tags": [],
  "figures": [
    {
      "id": "external-minddy-mcp-workflow",
      "kind": "screenshot",
      "src": "/documentation/de/external-minddy-mcp-workflow.png",
      "alt": "Minddy-MCP-Clientauswahl mit Claude, Codex und weiteren Assistenten.",
      "caption": "Wähle deinen Client, um dessen Installationsbefehl oder Konfiguration anzuzeigen.",
      "revision": 1,
      "reviewed": true,
      "capturedAt": "2026-10-08",
      "viewport": [
        1440,
        1800
      ],
      "theme": "light"
    },
    {
      "id": "external-minddy-mcp-install-workflow",
      "kind": "screenshot",
      "src": "/documentation/de/external-minddy-mcp-install-workflow.png",
      "alt": "Codex-Installationsdialog auf der lokalen Instanz.",
      "caption": "Codex-Installationsdialog auf der lokalen Instanz. Verwende den Ursprung deiner eigenen Instanz; der angezeigte Befehl wurde für diese Aufnahme nicht ausgeführt.",
      "revision": 1,
      "reviewed": true,
      "capturedAt": "2026-10-08",
      "viewport": [
        1440,
        1800
      ],
      "theme": "light"
    },
    {
      "id": "external-minddy-mcp-accesses-workflow",
      "kind": "screenshot",
      "src": "/documentation/de/external-minddy-mcp-accesses-workflow.png",
      "alt": "Liste verbundener Anwendungen ohne aktive Freigabe.",
      "caption": "Prüfe hier die autorisierten Anwendungen. Das Demonstrationskonto hat keine aktive Freigabe; keine Autorisierung oder Widerruf wurde ausgeführt.",
      "revision": 1,
      "reviewed": true,
      "capturedAt": "2026-10-08",
      "viewport": [
        1440,
        1800
      ],
      "theme": "light"
    }
  ],
  "requiredFigures": [
    "external-minddy-mcp-workflow",
    "external-minddy-mcp-install-workflow",
    "external-minddy-mcp-accesses-workflow"
  ]
}
---

## Den Client einrichten {#external-minddy-mcp}
Öffnen Sie die öffentliche MCP-Einrichtungsseite Ihrer Instanz und wählen Sie die Client-Anleitung. Nutzen Sie den dort angezeigten Endpunkt mit `/api/mcp`. Bei Self-Hosting verwenden Sie Ihre Instanzadresse statt Cloud. Der Client muss die beschriebene entfernte MCP-Verbindung und OAuth unterstützen.

Melden Sie sich im Browser an und prüfen Sie die Freigabe. Die Verbindung handelt als Ihr Minddy-Konto und erhält keinen Zugriff auf gesperrte Projekte. Beginnen Sie mit dem Lesen eines bereits zugänglichen Tickets und prüfen Sie das zurückgegebene Projekt.

![Minddy-MCP-Clientauswahl mit Claude, Codex und weiteren Assistenten.](/documentation/de/external-minddy-mcp-workflow.png)


## Umfang und Widerruf {#access}
Externe Clients verwenden verfügbare Tools für Tickets, Pläne, Kommentare, Seiten, Feedback, Zyklen, Routinen und Notizbuch innerhalb ihrer Rechte. MCP ist in jedem Cloud-Tarif verfügbar; KI des Clients hängt weiterhin von dessen Einrichtung und Kosten ab.

Der Bereich Minddy MCP in den Kontoeinstellungen zeigt externe Zugriffe und Widerrufsmöglichkeiten. Widerrufen Sie ungenutzte oder nicht mehr vertrauenswürdige Clients. MCP für Numo verbindet dagegen Numo mit anderen Diensten. Kopieren Sie keine Zugriffstoken in Tickets, öffentliche Beiträge oder Screenshots.

![Codex-Installationsdialog auf der lokalen Instanz.](/documentation/de/external-minddy-mcp-install-workflow.png)

![Liste verbundener Anwendungen ohne aktive Freigabe.](/documentation/de/external-minddy-mcp-accesses-workflow.png)

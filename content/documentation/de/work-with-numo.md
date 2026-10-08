---
{
  "id": "work-with-numo",
  "locale": "de",
  "title": "Eine Projektaufgabe mit Numo erledigen",
  "summary": "Eine Unterhaltung mit Seitenkontext öffnen, ein Modell wählen und das Ergebnis prüfen.",
  "topic": "Numo und Integrationen",
  "type": "tutorial",
  "audiences": [
    "member"
  ],
  "workflows": [
    "N01"
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
      "content/knowledge/agents-and-mcp.md",
      "components/assistant-panel.tsx",
      "components/assistant/chat-input.tsx"
    ]
  },
  "review": {
    "revision": 1,
    "fact": "2026-10-08",
    "language": "2026-10-08",
    "date": "2026-10-08"
  },
  "related": [
    "numo-permissions-and-approvals",
    "delegate-code-work",
    "recover-numo-work",
    "numo-mcp-connections",
    "external-minddy-mcp"
  ],
  "aliases": [
    "agents-and-mcp"
  ],
  "tags": [],
  "figures": [
    {
      "id": "work-with-numo-workflow",
      "kind": "screenshot",
      "src": "/documentation/de/work-with-numo-workflow.png",
      "alt": "Numo-Demonstrationsgespräch mit Seitenkontext, Prioritätsänderung und gespeicherter Antwort.",
      "caption": "Vorhandener Demonstrationsverlauf, für die Anzeige übersetzt. Die gespeicherte Antwort nennt AUR-11 und AUR-7. Die Aufnahme belegt keine neue Ausführung.",
      "revision": 1,
      "reviewed": true,
      "capturedAt": "2026-10-08",
      "viewport": [
        1200,
        900
      ],
      "theme": "light"
    }
  ],
  "requiredFigures": [
    "work-with-numo-workflow"
  ]
}
---

## Bei der Aufgabe beginnen {#work-with-numo}
Öffnen Sie das betreffende Ticket oder Projekt und klicken Sie auf die schwebende Numo-Schaltfläche. Die aktuelle Seite wird zum Gesprächskontext. Kontextaktionen, die Arbeit an Numo übergeben, öffnen dasselbe Panel. Sie benötigen Projektzugriff und verfügbares KI-Budget oder einen kompatiblen eigenen Schlüssel.

1. Prüfen Sie den Kontext im Eingabebereich. Nennen Sie das Ticket ausdrücklich, wenn mehrere Einträge relevant sind.
2. Wählen Sie Gesprächsmodell und Denkintensität. Für den Code-Worker gelten separate Kontoeinstellungen.
3. Senden Sie einen begrenzten Auftrag, etwa: „Lies dieses Ticket und schlage Abnahmekriterien vor. Ändere seinen Status nicht.“
4. Lesen Sie die Antwort und öffnen Sie Ticket- oder Quellenlinks. Prüfen Sie nach einer Änderung das betroffene Objekt.

![Numo-Demonstrationsgespräch mit Seitenkontext, Prioritätsänderung und gespeicherter Antwort.](/documentation/de/work-with-numo-workflow.png)


## Fortsetzen oder delegieren {#continue}
Über die Gesprächsliste bleiben frühere Unterhaltungen erreichbar. Setzen Sie das Gespräch mit den relevanten Entscheidungen fort. Änderungen am Repository delegiert Numo an einen Worker in einer Server-Sandbox und zeigt Fortschritt, Dateien, Prüfungen und Pull Request. Der Worker arbeitet nicht in Ihrem lokalen Ordner.

Wenn Numo Eingaben anfordert, senden Sie Ihre Auswahl, bevor abhängige Arbeit weitergehen kann. Eine Verbrauchs- oder Fehlerkarte erklärt den Abbruch. Prüfen Sie externe Schreibaktionen, bevor Sie deren Wiederholung anfordern.

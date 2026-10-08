---
{
  "id": "import-issues",
  "locale": "de",
  "title": "CSV-Backlog nach Zuordnungsprüfung importieren",
  "summary": "Spalten, Personen, Status und Elternreferenzen vor der Erstellung prüfen.",
  "topic": "Konto und Apps",
  "type": "guide",
  "audiences": [
    "owner"
  ],
  "workflows": [
    "A06"
  ],
  "visibility": "public",
  "status": "published",
  "revision": 2,
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
      "components/settings/csv-import-panel.tsx",
      "components/settings/import-mapping-editor.tsx",
      "lib/use-csv-import.ts",
      "lib/import/types.ts",
      "lib/server/import-issues.ts",
      "content/documentation/reviews/csv-preview-capture-candidates.json"
    ]
  },
  "review": {
    "revision": 2,
    "fact": "2026-10-08",
    "language": "2026-10-08",
    "date": "2026-10-08"
  },
  "related": [],
  "aliases": [],
  "tags": [],
  "figures": [
    {
      "id": "import-issues-workflow",
      "kind": "screenshot",
      "src": "/documentation/de/import-issues-preview-workflow.png",
      "alt": "CSV-Vorschau mit zwei übersetzten Demonstrationszeilen und erkannten Spaltenzuordnungen.",
      "caption": "CSV-Vorschau mit zwei übersetzten Demonstrationszeilen und erkannten Spaltenzuordnungen. Es wurde nichts importiert; die optionale KI-Planung war für die Aufnahme gesperrt.",
      "revision": 2,
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
    "import-issues-workflow"
  ]
}
---

## Vorbereiten und prüfen {#import-issues}

Der Projektinhaber öffnet Import in den Projekteinstellungen und wählt einen CSV-Export aus. Formate von Linear und Jira werden erkannt; andere CSV-Dateien verwenden eine allgemeine Spaltenzuordnung. Pro Import gelten 5 MiB und 5.000 Tickets als Grenze. Teilen Sie größere Exporte gezielt auf und halten Sie Elternreferenzen möglichst im selben Stapel.

Ordnen Sie vor dem Import die Titelspalte zu. Prüfen Sie Beschreibung, Status, Priorität, Aufwand, Fälligkeit, Kategorien und zuständige Personen. Ordnen Sie Personen tatsächlichen Projektmitgliedern zu und prüfen Sie neue Kategorien. Elternreferenzen entsprechen externen Schlüsseln im Stapel und unterstützen eine Ebene. CSV-Dateien importieren keine Bytes angehängter Dateien.

Ein KI-Vorschlag wird nur bei Lücken in der Zuordnung angefordert. Er bleibt bearbeitbar. Fällt der Anbieter aus oder ist er nicht verfügbar, können Sie weiterhin manuell zuordnen. Eine manuelle Korrektur verhindert, dass ein später eintreffender Vorschlag Ihre Auswahl überschreibt.


## Importieren und kontrollieren {#result}

Lesen Sie nach jeder Zuordnungsänderung die Ticketanzahl, Statusverteilung und Warnungen. Korrigieren Sie übersprungene oder ungültige Zeilen vor der Bestätigung. Der Import erstellt neue Tickets; gehen Sie nicht davon aus, dass erneutes Hochladen bestehende Tickets ohne Duplikate aktualisiert. Prüfen Sie nach dem Erfolg repräsentative Tickets, Zuweisungen, Daten und Elternverknüpfungen. Geht die Antwort verloren, prüfen Sie das Projekt vor einem erneuten Import der gesamten Datei, um doppelte Arbeit zu vermeiden.

![CSV-Vorschau mit zwei übersetzten Demonstrationszeilen und erkannten Spaltenzuordnungen.](/documentation/de/import-issues-preview-workflow.png)

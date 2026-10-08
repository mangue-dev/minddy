---
{
  "id": "issue-statuses",
  "locale": "de",
  "title": "Ein Problem durch seinen Lebenszyklus führen",
  "summary": "Unterscheide Eingang, geplante Arbeit, Prüfung und Abschluss mit festen Statuswerten.",
  "topic": "Projekte und Probleme",
  "type": "guide",
  "audiences": [
    "member"
  ],
  "workflows": [
    "W02"
  ],
  "visibility": "public",
  "status": "published",
  "revision": 3,
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
      "mobile",
      "desktop"
    ],
    "evidence": [
      "content/knowledge/core-tracker.md",
      "components/kanban-board.tsx",
      "components/issue-context-menu.tsx"
    ]
  },
  "review": {
    "revision": 3,
    "fact": "2026-10-08",
    "language": "2026-10-08",
    "date": "2026-10-08"
  },
  "related": [
    "triage-incoming-work",
    "issue-dependencies",
    "trash-and-recovery"
  ],
  "aliases": [],
  "tags": [],
  "figures": [
    {
      "id": "issue-statuses-steps",
      "kind": "screenshot",
      "src": "/documentation/de/issue-statuses.png",
      "alt": "Die acht Ticketstatus im Auswahlmenü, mit ausgewähltem Backlog-Status.",
      "caption": "Das Häkchen zeigt den aktuellen Status. Wähle den Status, der dem tatsächlichen Arbeitsstand entspricht.",
      "revision": 3,
      "reviewed": true,
      "capturedAt": "2026-10-08",
      "viewport": [
        1440,
        1080
      ],
      "theme": "light"
    }
  ],
  "requiredFigures": [
    "issue-statuses-steps"
  ]
}
---

## Einen Status ändern {#issue-statuses}

Öffne die Statusauswahl des Problems oder verwende die Statusaktionen des Boards. In einer Kanban-Ansicht verändert das Verschieben zwischen Statusspalten das Problem selbst; ein anderer Filter verändert nur deine Ansicht. Prüfe den neuen Status nach dem Verschieben im Detailpanel.

| Status | Verwendung |
| --- | --- |
| Triage | Eingehende Arbeit, die geprüft werden muss. |
| Rückstand | Beibehaltene Arbeit, die noch nicht für den Beginn ausgewählt wurde. |
| Todo | Für die Umsetzung ausgewählte Arbeit. |
| In Bearbeitung | Laufende Arbeit. |
| In Überprüfung | Umsetzung, die auf eine Prüfung wartet. |
| Fertig | Das erwartete Ergebnis ist abgeschlossen. |
| Abgebrochen | Ohne Lieferung geschlossene Arbeit. |
| Duplikat | Arbeit, die ein anderes Problem bereits abbildet. |

Die Statuswerte sind fest und werden nicht je Projekt angepasst. Triage und Duplikat sind in Auswahllisten verfügbar, fehlen aber bewusst in normalen Kanban-Spalten. Eine fehlende Spalte beweist nicht, dass der Status oder das Problem nicht existiert.


![Die acht Ticketstatus im Auswahlmenü, mit ausgewähltem Backlog-Status.](/documentation/de/issue-statuses.png)

## Abschlusszustände und Prüfung {#closed-work}

Fertig, Abgebrochen und Duplikat sind Abschlusszustände für die Nachverfolgung: Sie blockieren abhängige Probleme nicht mehr und verlassen die aktiven Zählungen. Abgebrochen bedeutet nicht, dass die Aufgabe geliefert wurde. Benenne beim Markieren eines Duplikats das beibehaltene Problem, damit Diskussion und Fortschritt ein klares Ziel haben.

Prüfe Filter, wenn ein Problem nach dem Schließen verschwindet. Öffne es über die Kennung erneut, um das Ergebnis zu prüfen und den Status bei einem versehentlichen Abschluss zu ändern. Prüfe bei blockierter Arbeit auch die Richtung der Abhängigkeit: Ein Statuswechsel schreibt weder Beschreibung noch Plan eines Problems um.

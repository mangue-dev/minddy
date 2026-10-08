---
{
  "id": "scheduled-routines",
  "locale": "de",
  "title": "Eine Numo-Routine planen und prüfen",
  "summary": "Projektkontext, Zeitzone und KI-Limit festlegen und jeden Durchlauf kontrollieren.",
  "topic": "Numo und Integrationen",
  "type": "guide",
  "audiences": [
    "owner"
  ],
  "workflows": [
    "N06"
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
      "content/knowledge/productivity.md",
      "components/routines/create-routine-wizard.tsx",
      "components/routines/routine-detail.tsx",
      "content/documentation/reviews/routine-localized-capture-candidates.json"
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
      "id": "scheduled-routines-workflow",
      "kind": "screenshot",
      "src": "/documentation/de/scheduled-routines-workflow.png",
      "alt": "Editor einer vorhandenen pausierten Demonstrationsroutine mit für die Anzeige übersetzter Anweisung.",
      "caption": "Editor einer vorhandenen pausierten Demonstrationsroutine mit für die Anzeige übersetzter Anweisung. Zeitplan und Ausgabenlimit bleiben unverändert; nichts wurde gespeichert oder ausgeführt.",
      "revision": 1,
      "reviewed": true,
      "capturedAt": "2026-10-08",
      "viewport": [
        1447,
        1085
      ],
      "theme": "light"
    }
  ],
  "requiredFigures": [
    "scheduled-routines-workflow"
  ]
}
---

## Den geplanten Auftrag erstellen {#scheduled-routines}
Nur der Projekteigentümer kann seine Routine erstellen. Öffnen Sie Routinen und starten Sie die Erstellung. Wählen Sie ein eigenes Projekt, formulieren Sie die Anweisung und erwähnen Sie relevante Tickets, Seiten oder Ziele. Wählen Sie Zeitplan und Zeitzone; prüfen Sie die Vorschau des ersten Laufs. Legen Sie das Limit je Durchlauf als Prozentsatz des Monatsbudgets fest.

Jeder Durchlauf erstellt ein neues Gespräch mit gespeicherter Anweisung und Kontext. Es nutzt KI-Budget und persönliche MCP-Verbindungen des Eigentümers. Repository-Arbeit delegiert Numo bei Bedarf mit den Worker-Kontovorgaben.

## Durchläufe verwalten {#runs}
Öffnen Sie die Routine, um Anweisung oder Zeitplan zu ändern, sie zu pausieren oder Durchläufe einzusehen. Auch manuelle Läufe verbrauchen Budget. Lesen Sie Ergebnis, Fragen, Prüfungen und delegierte Arbeit im jeweiligen Gespräch. Fehlende Eingaben erfordern eine Antwort; der Zeitplan ersetzt sie nicht.

Prüfen Sie nach einem Limitstopp vorhandene Ergebnisse, bevor Sie Limit oder Auftrag ändern. Nach Eigentümerwechsel starten Sie einen neuen Lauf unter dem aktuellen Eigentümer; alte Läufe dürfen frühere Verbindungen nicht verwenden.

![Editor einer vorhandenen pausierten Demonstrationsroutine mit für die Anzeige übersetzter Anweisung.](/documentation/de/scheduled-routines-workflow.png)

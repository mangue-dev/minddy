---
{
  "id": "scheduled-routines",
  "locale": "de",
  "title": "Geplante Routinen",
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
  "revision": 2,
  "sourceRevision": 2,
  "owner": "@mangue-dev",
  "updatedAt": "2026-10-09",
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
    "revision": 2,
    "fact": "agent:/root/german_spanish_review (structural consolidation review; prior procedural evidence retained; no operational rerun)",
    "language": "agent:/root/german_spanish_review (de title, summary, lead and heading review; retained body comparison)",
    "date": "2026-10-09"
  },
  "related": [],
  "aliases": [],
  "tags": [
    "Eine Numo-Routine planen und prüfen"
  ],
  "figures": [
    {
      "id": "scheduled-routines-workflow",
      "kind": "screenshot",
      "src": "/documentation/de/scheduled-routines-workflow.png",
      "alt": "Editor einer vorhandenen pausierten Demonstrationsroutine mit für die Anzeige übersetzter Anweisung.",
      "caption": "Editor einer vorhandenen pausierten Demonstrationsroutine mit für die Anzeige übersetzter Anweisung. Zeitplan und Ausgabenlimit bleiben unverändert; nichts wurde gespeichert oder ausgeführt.",
      "revision": 2,
      "reviewed": true,
      "capturedAt": "2026-10-08",
      "viewport": [
        1161,
        1051
      ],
      "theme": "light",
      "padding": 24
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

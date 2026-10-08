---
{
  "id": "task-notebook",
  "locale": "de",
  "title": "Notizen im privaten Aufgabenheft festhalten",
  "summary": "Schreibe schnelle Notizen und überführe eine ausgewählte Aufgabe bei Bedarf in nachverfolgte Projektarbeit.",
  "topic": "Arbeit planen und finden",
  "type": "guide",
  "audiences": [
    "member"
  ],
  "workflows": [
    "W17"
  ],
  "visibility": "public",
  "status": "published",
  "revision": 2,
  "sourceRevision": 2,
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
      "content/knowledge/productivity.md",
      "components/scratchpad/scratchpad-modal.tsx",
      "components/scratchpad/start-tasks.ts",
      "components/scratchpad/scratchpad-task.tsx",
      "components/scratchpad/task-item-view.tsx",
      "lib/keyboard/shortcuts.ts",
      "lib/keyboard/keyboard-context.tsx",
      "components/scratchpad/scratchpad-trigger.tsx"
    ]
  },
  "review": {
    "revision": 2,
    "fact": "2026-10-08",
    "language": "2026-10-08",
    "date": "2026-10-08"
  },
  "related": [
    "create-an-issue",
    "work-with-numo",
    "create-and-organize-pages"
  ],
  "aliases": [],
  "tags": [],
  "figures": [
    {
      "id": "task-notebook-steps",
      "kind": "screenshot",
      "src": "/documentation/de/work-task-notebook.png",
      "alt": "Übersetzte persönliche Demo-Aufgaben im Notizbuch.",
      "caption": "Das Notizbuch hält persönliche Schritte außerhalb der Tickethierarchie des Projekts fest. Die Zustände der Beispielaufgaben bleiben unverändert.",
      "revision": 2,
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
    "task-notebook-steps"
  ]
}
---

## Gedanken festhalten {#task-notebook}

Öffne das Aufgabenheft über die persönlichen Bedienelemente der Anwendung oder mit Command+Umschalt+K unter macOS beziehungsweise Strg+Umschalt+K unter Windows/Linux, wenn der Fokus außerhalb bearbeitbarer Texte liegt. Dieser Notizbereich gehört deinem Konto und enthält Notizen und Kontrollkästchen. Halte den Kontext fest, gliedere ihn bei Bedarf in Abschnitte und verwende Aufgaben mit Kontrollkästchen für kleine persönliche Schritte, bevor daraus Projekttickets werden.

Das Aufgabenheft ist privat. Informationen, die Kollegen gemeinsam nutzen müssen, gehören auf eine Projektseite. Numo kann das Aufgabenheft auf deine Bitte lesen oder bearbeiten. Die Mitgliedschaft eines anderen Nutzers in deinem Projekt macht deine Notizen jedoch nicht zu einem gemeinsam genutzten Dokument.

![Übersetzte persönliche Demo-Aufgaben im Notizbuch.](/documentation/de/work-task-notebook.png)

## Eine Aufgabe ins Projekt übernehmen {#promote-note}

Öffne das Menü der Aufgabe und wähle die Aktion zum Übernehmen ins Projekt, wenn aus der Notiz Projektarbeit wird. Dadurch wird das Aufgabenheft geschlossen und Numo mit einer vorbereiteten Anfrage geöffnet, die die Aufgabe und ihre Unteraufgaben enthält. Wenn du gerade ein Projekt geöffnet hast, wird dieses verwendet. Gib auf einer projektübergreifenden Seite das Zielprojekt im Gespräch an. Prüfe die Anfrage vor dem Senden. Dafür benötigst du verfügbares KI-Kontingent oder einen kompatiblen persönlichen Schlüssel. Allein das Öffnen hat noch kein Ticket erstellt. Öffne nach Numos Bestätigung das neue Ticket und prüfe Kennung, Umfang und Eigenschaften. Ergänze fehlende Abnahmekriterien, damit der nötige Kontext erhalten bleibt.

Wenn die Erstellung fehlschlägt oder das Ergebnis nach einem Netzwerkfehler unklar bleibt, suche nach dem Ticket, bevor du die Aufgabe erneut übernimmst. Bitte Numo, nur die gewünschte Aufgabe zu ändern, und lasse andere Abschnitte unverändert. Prüfe anschließend, ob das richtige Kontrollkästchen geändert wurde und nicht das gesamte Aufgabenheft ersetzt wurde.

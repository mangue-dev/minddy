---
{
  "id": "task-notebook",
  "locale": "de",
  "title": "Aufgabennotizbuch",
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
  "revision": 6,
  "sourceRevision": 6,
  "owner": "@mangue-dev",
  "updatedAt": "2026-10-19",
  "compatibility": {
    "version": "0.11.1 candidate (89ebb59a5); MIN-728 one editor engine; MIN-725 notebook search in the command palette",
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
      "components/scratchpad/scratchpad-trigger.tsx",
      "components/editor/rich-editor.tsx",
      "components/editor/document-editor.tsx",
      "components/editor/comment-editor.tsx",
      "content/documentation/reviews/min-728-one-editor-engine.md",
      "components/scratchpad/scratchpad-editor.tsx",
      "lib/scratchpad-search.ts",
      "components/command-palette.tsx"
    ]
  },
  "review": {
    "revision": 6,
    "fact": "agent:/root/german_spanish_review (structural consolidation review; prior procedural evidence retained; no operational rerun); agent:/root (visual usefulness, figure framing and preserved procedures; previous operational evidence retained); agent:/root (MIN-728 one editor engine: source and unit-test review of the shared editor on this surface; no browser walkthrough, no new captures; unchanged evidence retained); agent:/root (MIN-725 notebook search in the command palette: source and unit-test review of lib/scratchpad-search.ts, the palette rows and the notebook focus; no browser walkthrough, no new captures; unchanged evidence retained)",
    "language": "agent:/root/german_spanish_review (de title, summary, lead and heading review; retained body comparison); agent:/root (de translation of the MIN-728 passage with catalog UI labels, equivalent meaning self-reviewed; agent review, not human acceptance); agent:/root (de MIN-725 added paragraph with catalog UI labels; agent review, not human acceptance)",
    "date": "2026-10-19"
  },
  "related": [
    "issues",
    "numo",
    "pages"
  ],
  "aliases": [],
  "tags": [
    "Notizen im privaten Aufgabenheft festhalten"
  ],
  "figures": [
    {
      "id": "task-notebook-steps",
      "kind": "screenshot",
      "src": "/documentation/de/work-task-notebook.png",
      "alt": "Übersetzte persönliche Demo-Aufgaben im Notizbuch.",
      "caption": "Das Notizbuch hält persönliche Schritte außerhalb der Tickethierarchie des Projekts fest. Die Zustände der Beispielaufgaben bleiben unverändert.",
      "revision": 6,
      "reviewed": true,
      "capturedAt": "2026-10-08",
      "viewport": [
        1156,
        1048
      ],
      "theme": "light",
      "padding": 24
    }
  ],
  "requiredFigures": [
    "task-notebook-steps"
  ]
}
---

## Gedanken festhalten {#task-notebook}

Öffne das Aufgabenheft über die persönlichen Bedienelemente der Anwendung oder mit Command+Umschalt+K unter macOS beziehungsweise Strg+Umschalt+K unter Windows/Linux, wenn der Fokus außerhalb bearbeitbarer Texte liegt. Dieser Notizbereich gehört deinem Konto und enthält Notizen und Kontrollkästchen. Halte den Kontext fest, gliedere ihn bei Bedarf in Abschnitte und verwende Aufgaben mit Kontrollkästchen für kleine persönliche Schritte, bevor daraus Projekttickets werden.

Um eine Aufgabe wiederzufinden, öffne die Befehlspalette mit Command+K unter macOS beziehungsweise Strg+K unter Windows/Linux und tippe Wörter daraus ein. Noch offene Aufgaben erscheinen unter **Aufgabennotizbuch**, mit ihrem Abschnitt; erledigte und abgebrochene Aufgaben sowie Fragen erscheinen dort nicht. Wähle eine aus, um das Notizbuch bei dieser Aufgabe zu öffnen. Solange du nichts eingibst, listet die Palette keine Aufgaben aus dem Notizbuch auf.

Das Aufgabenheft verwendet denselben Editor wie Projektseiten, mit denselben Blockgriffen: Fahre über einen Block, um ihn zu ziehen, sein Menü zu öffnen oder mit **+** einen Block hinzuzufügen. Tippe `/`, um eine Überschrift, Liste, Aufgabe, ein Zitat, einen **Hinweis**, einen Codeblock, ein **Umschalten**-Element oder einen Teiler einzufügen, oder wähle **Eine Aufgabe diktieren**, um Aufgaben zu sprechen. Das Heft wird weiterhin als Markdown gespeichert, sodass Numo und verbundene Agenten dieselben Aufgaben und Zustände lesen. Markiere Text, um ihn zu formatieren oder einen Link hinzuzufügen, und füge ein Bild ein oder ziehe es hinein, um es in eine Notiz einzufügen. Andere Dateitypen gehören in Seiten.

Das Aufgabenheft ist privat. Informationen, die Kollegen gemeinsam nutzen müssen, gehören auf eine Projektseite. Numo kann das Aufgabenheft auf deine Bitte lesen oder bearbeiten. Die Mitgliedschaft eines anderen Nutzers in deinem Projekt macht deine Notizen jedoch nicht zu einem gemeinsam genutzten Dokument.

![Übersetzte persönliche Demo-Aufgaben im Notizbuch.](/documentation/de/work-task-notebook.png)

## Eine Aufgabe ins Projekt übernehmen {#promote-note}

Öffne das Menü der Aufgabe und wähle die Aktion zum Übernehmen ins Projekt, wenn aus der Notiz Projektarbeit wird. Dadurch wird das Aufgabenheft geschlossen und Numo mit einer vorbereiteten Anfrage geöffnet, die die Aufgabe und ihre Unteraufgaben enthält. Wenn du gerade ein Projekt geöffnet hast, wird dieses verwendet. Gib auf einer projektübergreifenden Seite das Zielprojekt im Gespräch an. Prüfe die Anfrage vor dem Senden. Dafür benötigst du verfügbares KI-Kontingent oder einen kompatiblen persönlichen Schlüssel. Allein das Öffnen hat noch kein Ticket erstellt. Öffne nach Numos Bestätigung das neue Ticket und prüfe Kennung, Umfang und Eigenschaften. Ergänze fehlende Abnahmekriterien, damit der nötige Kontext erhalten bleibt.

Wenn die Erstellung fehlschlägt oder das Ergebnis nach einem Netzwerkfehler unklar bleibt, suche nach dem Ticket, bevor du die Aufgabe erneut übernimmst. Bitte Numo, nur die gewünschte Aufgabe zu ändern, und lasse andere Abschnitte unverändert. Prüfe anschließend, ob das richtige Kontrollkästchen geändert wurde und nicht das gesamte Aufgabenheft ersetzt wurde.

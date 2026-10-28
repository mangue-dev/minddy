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
  "revision": 12,
  "sourceRevision": 11,
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
      "components/scratchpad/scratchpad-editor.tsx",
      "lib/scratchpad-search.ts",
      "components/command-palette.tsx",
      "components/editor/mobile-editor-toolbar.tsx",
      "components/editor/find-bar.tsx",
      "lib/keyboard/find-shortcut.ts",
      "components/pages/blocks/math.ts",
      "components/editor/math-edit-menu.tsx"
    ]
  },
  "review": {
    "revision": 12,
    "fact": "agent:claude-code (Command/Ctrl+F find and replace bar in the open notebook checked against components/scratchpad/scratchpad-editor.tsx, components/editor/find-bar.tsx and lib/keyboard/find-shortcut.ts; equations (the `/` Equation entry, `$$…$$` typed in a line, click to edit the LaTeX with a live preview in a popover or phone sheet, red error, empty save removing it, `$…$` and `$$` fence Markdown with prices kept as text) checked against components/pages/blocks/math.ts, components/editor/math-edit-menu.tsx and lib/pages-math.test.ts; rest of the article unchanged since the previous review; no figure recaptured, the existing figure does not show the changed controls)",
    "language": "agent:claude-code (de changed passages with catalog UI labels; equivalent meaning to en revision 11; self-reviewed; agent review, not human acceptance)",
    "date": "2026-10-28"
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
      "revision": 12,
      "reviewed": true,
      "capturedAt": "2026-10-22",
      "viewport": [
        1156,
        1048
      ],
      "theme": "light",
      "padding": 24,
      "deviceScaleFactor": 2
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

Das Aufgabenheft verwendet denselben Editor wie Projektseiten, mit denselben Blockgriffen: Fahre über einen Block, um ihn zu ziehen, sein Menü zu öffnen oder mit **+** einen Block hinzuzufügen. Tippe `/`, um eine Aufgabe, die zuerst angeboten wird, oder eine Überschrift, Liste, ein Zitat, einen **Hinweis**, einen Codeblock, eine **Gleichung**, ein Element **Aufklappbarer Bereich** oder einen Teiler einzufügen, oder wähle **Eine Aufgabe diktieren**, um Aufgaben zu sprechen. Das Heft wird weiterhin als Markdown gespeichert, sodass Numo und verbundene Agenten dieselben Aufgaben und Zustände lesen. Markiere Text, um ihn zu formatieren oder einen Link hinzuzufügen. Füge ein Bild ein, ziehe es hinein oder wähle **Bild** im `/`-Menü, um es in eine Notiz einzufügen. Andere Dateitypen gehören in Seiten. Auf dem Smartphone ersetzt die Leiste über der Tastatur die Blockgriffe, die Auswahlleiste und das getippte `@`-Menü; die [Seitenanleitung](/de/dokumentation/pages#editor-formatting) beschreibt sie. Solange das Notizbuch geöffnet ist, öffnet Command+F unter macOS oder Strg+F unter Windows/Linux dieselbe [Leiste zum Suchen und Ersetzen](/de/dokumentation/pages#find-and-replace) wie auf einer Seite.

Das Menü **Notizbuchaktionen** (`…`) bietet **Alle als Prompt kopieren**, das das ganze Aufgabenheft für deinen eigenen Coding-Agenten kopiert, und **Erledigte und verworfene Aufgaben entfernen**. Das Entfernen verlangt eine Bestätigung, löscht erledigte und abgebrochene Aufgaben samt der Überschriften, die dadurch leer werden, und behält offene oder laufende Aufgaben. Um weniger zu kopieren, verwende bei einer Überschrift **Abschnitt als Prompt kopieren** oder bei einer Aufgabe **Als Prompt kopieren**. Ist **Ticket oder Aufgabe starten, wenn ich den Prompt kopiere** unter **Kontoeinstellungen** → **Tickets** aktiviert, setzt das Kopieren die kopierten offenen Aufgaben außerdem auf „In Bearbeitung“.

Das Aufgabenheft ist privat. Informationen, die Kollegen gemeinsam nutzen müssen, gehören auf eine Projektseite. Numo kann das Aufgabenheft auf deine Bitte lesen oder bearbeiten. Die Mitgliedschaft eines anderen Nutzers in deinem Projekt macht deine Notizen jedoch nicht zu einem gemeinsam genutzten Dokument.

![Übersetzte persönliche Demo-Aufgaben im Notizbuch.](/documentation/de/work-task-notebook.png)

## Eine Aufgabe ins Projekt übernehmen {#promote-note}

Öffne das Menü der Aufgabe und wähle **Zu Ticket hochstufen**, wenn aus der Notiz Projektarbeit wird. Dadurch wird das Aufgabenheft geschlossen und Numo mit einer vorbereiteten Anfrage geöffnet, die die Aufgabe und ihre Unteraufgaben enthält. Wenn du gerade ein Projekt geöffnet hast, wird dieses verwendet. Gib auf einer projektübergreifenden Seite das Zielprojekt im Gespräch an. Prüfe die Anfrage vor dem Senden. Dafür benötigst du verfügbares KI-Kontingent oder einen kompatiblen persönlichen Schlüssel. Allein das Öffnen hat noch kein Ticket erstellt. Öffne nach Numos Bestätigung das neue Ticket und prüfe Kennung, Umfang und Eigenschaften. Ergänze fehlende Abnahmekriterien, damit der nötige Kontext erhalten bleibt. Die vorbereitete Anfrage bittet Numo außerdem, die Aufgabe aus dem Aufgabenheft zu entfernen, sobald das Ticket existiert; suche sie daher im Ticket statt im Aufgabenheft.

Wenn die Erstellung fehlschlägt oder das Ergebnis nach einem Netzwerkfehler unklar bleibt, suche nach dem Ticket, bevor du die Aufgabe erneut übernimmst. Bitte Numo, nur die gewünschte Aufgabe zu ändern, und lasse andere Abschnitte unverändert. Prüfe anschließend, ob das richtige Kontrollkästchen geändert wurde und nicht das gesamte Aufgabenheft ersetzt wurde.

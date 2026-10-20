---
{
  "id": "issues",
  "locale": "de",
  "title": "Probleme",
  "summary": "Erstelle und organisiere Probleme, verfolge ihren Status und verwalte Abhängigkeiten, Pläne, Importe und Sammeländerungen.",
  "topic": "Projekte und Probleme",
  "type": "guide",
  "audiences": [
    "member",
    "owner"
  ],
  "workflows": [
    "W01",
    "W03",
    "W02",
    "W08",
    "W05",
    "W06",
    "W07",
    "W09",
    "W04",
    "A06",
    "A11"
  ],
  "visibility": "public",
  "status": "published",
  "revision": 25,
  "sourceRevision": 25,
  "owner": "@mangue-dev",
  "updatedAt": "2026-10-20",
  "compatibility": {
    "version": "0.11.1 candidate (MIN-680); MIN-721 removal of Numo code work; MIN-693 project roles; MIN-717 Smart Fill relations; MIN-718 hybrid issue search; MIN-728 one editor engine; MIN-733 always-on AI features; MIN-736 closed columns hidden by default; MIN-737 account settings reorganization; MIN-741 creation dialogs; MIN-742 resources; MIN-743 destructive-action confirmations; MIN-746 Smart Fill properties set by shortcut",
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
      "components/create-issue-dialog.tsx",
      "components/issue-fields.tsx",
      "components/issue-compact-fields.tsx",
      "lib/smart-fill.ts",
      "lib/smart-fill-fields.ts",
      "app/(app)/projects/[id]/triage/page.tsx",
      "components/triage/triage-page.tsx",
      "lib/smart-triage.ts",
      "lib/view-filter.ts",
      "components/kanban-board.tsx",
      "components/issue-context-menu.tsx",
      "components/issue-timeline.tsx",
      "components/issue-resources-section.tsx",
      "components/issue-side-panel.tsx",
      "components/issue-indicators.tsx",
      "captures/shots/relations/intent.md",
      "lib/server/issue-relations.ts",
      "lib/relation-constants.ts",
      "components/issue-parent-menu.tsx",
      "components/issue-family-banner.tsx",
      "lib/server/create-issue.ts",
      "lib/server/update-issue.ts",
      "content/knowledge/plans-and-agents.md",
      "components/issue-plan.tsx",
      "captures/shots/issue-plan/intent.md",
      "lib/plan.ts",
      "components/settings/project-recurrences-section.tsx",
      "lib/server/recurrence.ts",
      "components/bulk-issue-actions.tsx",
      "components/global-board.tsx",
      "components/issue-card.tsx",
      "components/marquee-selection.tsx",
      "components/command-palette.tsx",
      "components/settings/csv-import-panel.tsx",
      "components/settings/import-mapping-editor.tsx",
      "lib/use-csv-import.ts",
      "lib/import/types.ts",
      "lib/server/import-issues.ts",
      "content/documentation/reviews/csv-preview-capture-candidates.json",
      "content/documentation/reviews/visual-refresh-captures-2026-10-09.json",
      "components/export-issues-dialog.tsx",
      "components/app-shell-chrome.tsx",
      "app/api/me/issues/export/route.ts",
      "lib/export/issues-csv.ts",
      "lib/export-api.ts",
      "content/documentation/reviews/pr397-review-fixes-2026-10-09.md",
      "content/documentation/reviews/ui-refinements-2026-10-11.md",
      "content/documentation/reviews/min-677-routines.md",
      "content/documentation/reviews/min-680-file-preview.md",
      "components/file-viewer.tsx",
      "components/image-viewer.tsx",
      "lib/issue-prompt.ts",
      "lib/server/issue-prompt-context.ts",
      "content/documentation/reviews/min-721-code-work-removal-2026-10-16.md",
      "docs/security/project-roles.md",
      "lib/project-roles.ts",
      "content/documentation/reviews/min-693-project-roles.md",
      "lib/server/issue-relation-inference.ts",
      "lib/server/issue-relation-decision.ts",
      "lib/server/issue-embedding-store.ts",
      "components/settings/account-preferences-section.tsx",
      "content/documentation/reviews/min-717-smart-fill-relations.md",
      "lib/issue-semantic-query.ts",
      "lib/server/issue-semantic-search.ts",
      "components/relation-target-picker.tsx",
      "content/documentation/reviews/min-718-hybrid-issue-search.md",
      "components/editor/rich-editor.tsx",
      "components/editor/document-editor.tsx",
      "components/editor/comment-editor.tsx",
      "content/documentation/reviews/min-728-one-editor-engine.md",
      "lib/server/description-collaboration.ts",
      "lib/use-description-collaboration.ts",
      "docs/document-collaboration.md",
      "components/settings/account-smart-fill-section.tsx",
      "content/documentation/reviews/min-737-settings-reorganization.md",
      "components/creation-project-select.tsx",
      "content/documentation/reviews/min-741-creation-dialogs.md",
      "lib/use-resource-mentions.ts",
      "content/documentation/reviews/min-742-resources.md",
      "components/relations-section.tsx",
      "components/objective-relations-section.tsx",
      "content/documentation/reviews/min-743-destructive-confirmations.md"
    ]
  },
  "review": {
    "revision": 25,
    "fact": "agent:/root (MIN-719 prompt builders, prompt-context route and focused builder/caller tests; prior controls retain existing evidence); agent:/root/min721_docs (MIN-721 source review inherited from en revision 12; de translation of removal edits; no operational rerun); agent:/root (MIN-693 project roles: decision record, permission matrix and source review; no browser walkthrough, no new captures; unchanged evidence retained); agent:/root (MIN-717 Smart Fill relations source review inherited from en revision 14; de translation of added passages; no browser walkthrough); agent:/root (MIN-718 hybrid issue search source and unit-test review; no browser walkthrough, no new captures; unchanged evidence retained); agent:/root (MIN-728 one editor engine: source and unit-test review of the shared editor on this surface; no browser walkthrough, no new captures; unchanged evidence retained); agent:/root (MIN-734 typed mentions: source and unit-test review of the mention format, rendering and access rules; no browser walkthrough, no new captures; unchanged evidence retained); agent:/root (Command/Ctrl+K opens the selection actions: source and unit-test review of bulk-actions-context and use-command-palette-launcher; no browser walkthrough; unchanged evidence retained); agent:/root (MIN-733 removal of the instance AI switches: source and unit-test review of the admin registry and every former switch reader; no browser walkthrough, no new captures; unchanged evidence retained); agent:/root (MIN-736 default status columns: source and unit-test review of lib/view-filter.ts and the board status filter; no browser walkthrough, no new captures); agent:/root (MIN-737 account settings reorganization: source review of the Smart Fill tab and its cards in components/settings/account-smart-fill-section.tsx; unchanged evidence retained; no browser walkthrough, no new captures); agent:/root (MIN-741 creation dialogs: source and unit-test review of the Create in project control, the cleared project-scoped fields and the identifier create button with its copy menu; create-an-issue-steps recaptured on 2026-10-19 in all six locales from the local candidate (documentation-product screen new-issue) and inspected; no other browser walkthrough); agent:/root (MIN-742 resources: source and unit-test review of renaming, removal confirmation, resource cards with a click and right-click menu and og:image link previews, file mentions opening the reader, and resource mentions scoped to their surface; issue-file-preview recaptured on 2026-10-19 in all six locales with captures/shots/file-preview and inspected; no other browser walkthrough); agent:/root (MIN-743 destructive-action confirmations: source review of the confirmation dialogs for relation removal, record content/documentation/reviews/min-743-destructive-confirmations.md; no browser walkthrough, no new captures; unchanged evidence retained); agent:/root (MIN-746 Smart Fill properties set by shortcut: source and unit-test review of lib/smart-fill-fields.ts, the creation dialog and the server fill in lib/server/create-issue.ts, which only infers empty properties; no browser walkthrough, no new captures; unchanged evidence retained)",
    "language": "agent:/root (de new copied-prompt section, translation and retained-meaning self-review); agent:/root/min721_de (de translation of MIN-721 removal edits, equivalent meaning reviewed; agent review, not human acceptance); agent:/root/min693_de with agent:/root (de MIN-693 translation of the changed passages, localized labels and retained-meaning review; agent review, not human acceptance); agent:/root (de translation of MIN-717 added passages with catalog UI labels, equivalent meaning self-reviewed; agent review, not human acceptance); agent:/root (de translation of MIN-718 added passages with catalog UI labels, equivalent meaning self-reviewed; agent review, not human acceptance); agent:/root (de translation of the MIN-728 passage with catalog UI labels, equivalent meaning self-reviewed; agent review, not human acceptance); agent:/root (de added sentences, catalog UI labels and retained-meaning self-review; agent review, not human acceptance); agent:/root (de removal of the sentences describing instance AI switches; retained-meaning self-review; agent review, not human acceptance); agent:/root (de MIN-736 added sentences with catalog status labels; agent review, not human acceptance); agent:/root (de MIN-737 changed passages with catalog UI labels; retained-meaning self-review; agent review, not human acceptance); agent:/root (de MIN-741 Create in passages and figure alt text with catalog UI labels; retained-meaning self-review; agent review, not human acceptance); agent:/root (de MIN-742 changed passages and figure alt text with catalog UI labels; retained-meaning self-review; agent review, not human acceptance); agent:/root (de MIN-743 confirmation clauses with catalog UI labels; retained-meaning self-review; agent review, not human acceptance); agent:/root (de translation of the MIN-746 added sentences; retained-meaning self-review; agent review, not human acceptance)",
    "date": "2026-10-20"
  },
  "related": [
    "feedback",
    "trash-and-recovery",
    "pages",
    "notifications-and-inbox",
    "objectives",
    "code-work",
    "scheduled-routines",
    "projects",
    "views",
    "personal-cycle"
  ],
  "aliases": [
    "create-an-issue",
    "triage-incoming-work",
    "issue-statuses",
    "issue-discussion-and-resources",
    "issue-dependencies",
    "sub-issues",
    "implementation-plans",
    "recurring-issues",
    "bulk-issue-actions",
    "import-issues"
  ],
  "tags": [
    "Ein Problem erstellen und bearbeiten",
    "Eingehende Arbeit in der Triage prüfen",
    "Ein Problem durch seinen Lebenszyklus führen",
    "Arbeit besprechen und Kontext hinzufügen",
    "Abhängigkeiten und verwandte Probleme verknüpfen",
    "Ein Problem in Unterprobleme aufteilen",
    "Einen Umsetzungsplan pflegen",
    "Ein Problem nach Abschluss wiederholen",
    "Mehrere Probleme gemeinsam aktualisieren",
    "CSV-Backlog nach Zuordnungsprüfung importieren"
  ],
  "figures": [
    {
      "id": "create-an-issue-steps",
      "kind": "screenshot",
      "src": "/documentation/de/new-issue.png",
      "alt": "Noch nicht abgesendeter Ticketentwurf im Projekt Aurora mit Titel, Beschreibung, manuell wählbaren Eigenschaften und der Schaltfläche AUR-19 erstellen.",
      "caption": "Beschreibe das erwartete Ergebnis und wähle vor der Erstellung die passenden Eigenschaften.",
      "revision": 25,
      "reviewed": true,
      "capturedAt": "2026-10-19",
      "viewport": [
        720,
        396
      ],
      "theme": "light",
      "padding": 24
    },
    {
      "id": "triage-incoming-work-steps",
      "kind": "screenshot",
      "src": "/documentation/de/triage-incoming.png",
      "alt": "Eingegangenes Demoproblem DOC-11 mit Bericht, Eigenschaften und Funktionen für Duplikat, Ablehnen und Akzeptieren.",
      "caption": "Lies den eingegangenen Bericht, bevor du ihn akzeptierst, ablehnst oder mit einem Duplikat verknüpfst.",
      "revision": 25,
      "reviewed": true,
      "capturedAt": "2026-10-08",
      "viewport": [
        994,
        866
      ],
      "theme": "light",
      "padding": 24
    },
    {
      "id": "issue-statuses-steps",
      "kind": "screenshot",
      "src": "/documentation/de/issue-statuses.png",
      "alt": "Die acht Ticketstatus im Auswahlmenü, mit ausgewähltem Backlog-Status.",
      "caption": "Das Häkchen zeigt den aktuellen Status. Wähle den Status, der dem tatsächlichen Arbeitsstand entspricht.",
      "revision": 25,
      "reviewed": true,
      "capturedAt": "2026-10-09",
      "viewport": [
        288,
        357
      ],
      "theme": "light",
      "padding": 24
    },
    {
      "id": "issue-discussion-and-resources-steps",
      "kind": "screenshot",
      "src": "/documentation/de/work-resources.png",
      "alt": "Dialog zum Hinzufügen eines Links mit einer Beispiel-Kontaktadresse.",
      "caption": "Prüfe das Ziel, bevor du die Ressource hinzufügst. Dieser Beispiellink wurde nicht gesendet.",
      "revision": 25,
      "reviewed": true,
      "capturedAt": "2026-10-09",
      "viewport": [
        496,
        212
      ],
      "theme": "light",
      "padding": 24
    },
    {
      "id": "issue-dependencies-steps",
      "kind": "screenshot",
      "src": "/documentation/de/work-dependencies.png",
      "alt": "Suche nach einem blockierenden Ticket anhand seiner Kennung.",
      "caption": "Wähle zuerst die Richtung der Beziehung und dann ihr Ziel. Hier wurde keine Beziehung gespeichert.",
      "revision": 25,
      "reviewed": true,
      "capturedAt": "2026-10-09",
      "viewport": [
        368,
        152
      ],
      "theme": "light",
      "padding": 24
    },
    {
      "id": "sub-issues-steps",
      "kind": "screenshot",
      "src": "/documentation/de/work-sub-issues.png",
      "alt": "Eingabefeld für ein Unterticket in einem Demo-Elternticket.",
      "caption": "Das Feld erstellt ein Kind dieses Elterntickets; jedes Kind behält seinen eigenen Status und Diskussionsverlauf.",
      "revision": 25,
      "reviewed": true,
      "capturedAt": "2026-10-08",
      "viewport": [
        508,
        1096
      ],
      "theme": "light",
      "padding": 24
    },
    {
      "id": "implementation-plans-steps",
      "kind": "screenshot",
      "src": "/documentation/de/work-implementation-plan.png",
      "alt": "Demo-Plan mit zwei von sechs abgeschlossenen Arbeitsschritten.",
      "caption": "Der gespeicherte Demo-Plan unterscheidet abgeschlossene, laufende und ausstehende Schritte. Der Fortschritt belegt nicht, dass die fiktive Codeaufgabe ausgeführt wurde.",
      "revision": 25,
      "reviewed": true,
      "capturedAt": "2026-10-08",
      "viewport": [
        508,
        1416
      ],
      "theme": "light",
      "padding": 24
    },
    {
      "id": "recurring-issues-steps",
      "kind": "screenshot",
      "src": "/documentation/de/issue-date-recurrence.png",
      "alt": "Fälligkeitsauswahl im wiederkehrenden Modus mit Sonntagsvorschau und optionaler Uhrzeit.",
      "caption": "Der wiederkehrende Modus zeigt die wöchentliche Folge. Bestätige die erste Fälligkeit vor der Ticketerstellung.",
      "revision": 25,
      "reviewed": true,
      "capturedAt": "2026-10-09",
      "viewport": [
        324,
        544
      ],
      "theme": "light",
      "padding": 24
    },
    {
      "id": "import-issues-workflow",
      "kind": "screenshot",
      "src": "/documentation/de/import-issues-preview-workflow.png",
      "alt": "CSV-Vorschau mit zwei übersetzten Demonstrationszeilen und erkannten Spaltenzuordnungen.",
      "caption": "CSV-Vorschau mit zwei übersetzten Demonstrationszeilen und erkannten Spaltenzuordnungen. Es wurde nichts importiert; die optionale KI-Planung war für die Aufnahme gesperrt.",
      "revision": 25,
      "reviewed": true,
      "capturedAt": "2026-10-09",
      "viewport": [
        816,
        977
      ],
      "theme": "light",
      "padding": 24,
      "deviceScaleFactor": 2
    },
    {
      "id": "issue-file-preview",
      "kind": "screenshot",
      "src": "/documentation/de/file-preview.png",
      "alt": "Fensterfüllender CSV-Betrachter mit Beispielaufgaben, großer Schaltfläche Schließen und dem Menü Dateiaktionen mit Herunterladen, Umbenennen und Entfernen.",
      "caption": "Der gemeinsame Dateibetrachter zeigt Schließen unter der Vorschau. Das Menü Dateiaktionen bietet Herunterladen und bei entsprechender Berechtigung Umbenennen und Entfernen.",
      "revision": 25,
      "reviewed": true,
      "capturedAt": "2026-10-19",
      "viewport": [
        1168,
        808
      ],
      "theme": "light",
      "padding": 24,
      "deviceScaleFactor": 2
    }
  ],
  "requiredFigures": [
    "create-an-issue-steps",
    "triage-incoming-work-steps",
    "issue-statuses-steps",
    "issue-discussion-and-resources-steps",
    "issue-dependencies-steps",
    "sub-issues-steps",
    "implementation-plans-steps",
    "recurring-issues-steps",
    "import-issues-workflow",
    "issue-file-preview"
  ]
}
---

Ein Problem erfasst eine Arbeitseinheit im Projekt, von der ersten Anfrage bis zum Abschluss. Beginne mit Erstellung, Triage und Status. Für laufende Arbeit findest du Abschnitte zu Diskussionen, Abhängigkeiten, Unterproblemen und Plänen. Prüfe vor Wiederholungen, Sammelaktionen oder CSV-Import die jeweiligen Voraussetzungen; der Import ist dem Projekteigentümer vorbehalten.

## Ein Problem erstellen und bearbeiten {#create-an-issue}

Das Löschen eines gespeicherten Entwurfs erfordert eine Bestätigung. Abbrechen behält den Entwurf; Bestätigen entfernt diesen gespeicherten Entwurf. Dieselbe Bestätigung gibt es beim Erstellen eines Ziels.

Du musst Eigentümer oder Mitglied des Zielprojekts sein; Leser können Probleme öffnen, aber weder erstellen noch bearbeiten. Öffne das Projekt und seine Funktion zum Erstellen eines Problems. Gib einen Titel ein, der die Arbeit benennt, und ergänze Kontext, erwartetes Ergebnis und Einschränkungen in der Beschreibung. Das Formular öffnet sich im aktuellen Projekt; wähle unter **Erstellen in** oben links im Formular (auf dem Telefon neben dem Titel **Neues Problem**) ein anderes, besonders wenn du aus einer persönlichen oder projektübergreifenden Ansicht erstellst. Ein Projektwechsel entfernt die für das vorherige Projekt gewählten Kategorien, das Ziel und die Beziehungen. Die Erstellen-Schaltfläche nennt die Kennung, die das Problem erhält, etwa `MIN-42`, und berücksichtigt zwischenzeitlich erstellte Probleme; ihr Menü erstellt das Problem und kopiert diese Kennung.

Schalte für eine manuelle Erstellung Smart-Fill aus, wenn die Schaltfläche angezeigt wird und aktiviert ist. Dadurch kannst du Priorität, Aufwand, Kategorien, Ziel und Beziehungen selbst festlegen. Um nur einige dieser Eigenschaften festzulegen, lass Smart-Fill eingeschaltet und drücke außerhalb von Titel und Beschreibung die Taste der Eigenschaft: P für Priorität, E für Aufwand, L für Kategorien oder O für Ziel. Ihre Auswahl öffnet sich, und der gewählte Wert bleibt sichtbar. Smart-Fill ergänzt nur die Eigenschaften, die du leer gelassen hast. Die Auswahl gilt für dieses Ticket; beim erneuten Öffnen des Erstellungsformulars wird die Kontoeinstellung wiederhergestellt. Sie ist von Smart Assign und Routinen unabhängig. Solange Smart-Fill eingeschaltet ist, [verknüpft es das Problem nach dem Speichern auch mit verwandten Problemen](#smart-fill-relations), deshalb ist die Beziehungsauswahl ausgeblendet. Bereits gewählte Beziehungen bleiben über dem Titel sichtbar und werden mit dem Problem angelegt.

Setze vor der Bestätigung die hilfreichen Eigenschaften: Status, Priorität, Aufwand, zuständige Person, Ziel, Kategorien, Fälligkeitsdatum und Wiederholung. Zuständig ist der Projekteigentümer oder ein Mitglied, nie ein Leser; ein Ziel bündelt Probleme zu einem Projektergebnis. Optionale Eigenschaften kannst du offenlassen, statt Werte zu erraten. Die Priorität reicht von keiner über niedrig, mittel und hoch bis dringend; der Aufwand verwendet XS, S, M, L und XL.

Bestätige die Erstellung und öffne das neue Problem. Prüfe Kennung und Projekt. Öffne die Eigenschaftsauswahl erneut, um Werte zu ändern, sobald die Aufgabe klarer wird. Die Beschreibung erklärt die Arbeit; ein Umsetzungsplan wird gesondert im Plan-Tab gepflegt.


![Noch nicht abgesendeter Ticketentwurf im Projekt Aurora mit Titel, Beschreibung, manuell wählbaren Eigenschaften und der Schaltfläche AUR-19 erstellen.](/documentation/de/new-issue.png)

Beschreibung, Kommentare und der Dialog für neue Probleme verwenden denselben Editor wie Projektseiten, nur ohne Blockgriffe. Tippe `/`, um eine Überschrift, Liste, Aufgabe, ein Zitat, einen **Hinweis**, einen Codeblock, ein **Umschalten**-Element oder einen Teiler einzufügen, und `@`, um eine Person, ein Problem, ein Ziel oder eine Seite zu erwähnen. Das `@`-Menü listet auch die Ressourcen dessen auf, woran du schreibst: das Problem oder Ziel für seine Beschreibung und seinen Plan, ein Kommentar für seine eigenen Dateien oder ein Erstellungsdialog für die dort hinzugefügten Dateien. Eine Erwähnung einer Ressource von anderswo erscheint als **Nicht verfügbar**. Mehrere Personen können dieselbe Beschreibung gleichzeitig bearbeiten: Der Cursor jeder Person erscheint mit ihrem Namen und ihrer Farbe, und Änderungen von Numo oder einem verbundenen Agenten erscheinen, sobald sie gespeichert sind. Numo, verbundene Agenten und CSV-Exporte lesen den Text als Markdown, das wenige Sekunden nach dem Ende der Eingabe folgt. Markiere Text, um ihn fett, kursiv, durchgestrichen oder als Code zu formatieren oder einen Link hinzuzufügen. Füge ein Bild ein oder ziehe es hinein, um es in die Beschreibung einzufügen; andere Dateitypen gehören zu den Ressourcen des Problems. Eine Erwähnung verweist auf ihr Ziel, nicht auf dessen Namen: Sie folgt einer Umbenennung und übersteht Bearbeitungen sowie Kopieren und Einfügen in eine andere Beschreibung, einen Kommentar, eine Seite oder den Numo-Eingabebereich. Wer das Ziel nicht öffnen kann, sieht eine Erwähnung **Nicht verfügbar**, ohne Namen oder Projekt.

### Speichern und Sichtbarkeit prüfen {#issue-save}

Prüfe nach einer Eigenschaftsänderung den angezeigten Wert. Filter können ein Problem sofort aus der aktuellen Ansicht entfernen, wenn sich zuständige Person, Status oder Kategorie ändern. Suche seine Kennung oder öffne das Projekt ohne diese Filter, bevor du einen Ersatz erstellst.

Schlägt Erstellen oder Speichern fehl, bewahre deinen Text auf, lies den Fehler und prüfe, ob Mitgliedschaft und Ziel noch bestehen. Kontrolliere nach einem Netzwerkfehler zuerst, ob das Problem bereits erstellt wurde, bevor du erneut versuchst. Verknüpfe Projektseiten als aktuelle Ressourcen, wenn du deren jetzigen Inhalt brauchst, und verwende Kommentare für die Diskussion der Aufgabe.

### Festlegen, was Smart-Fill tut {#smart-fill-preferences}

Die Smart-Fill-Einstellungen gehören zu deinem Konto. Öffne **Kontoeinstellungen** → **Smart Fill**. Jede Option hat ihre eigene Karte:

- In der Karte **Smart Fill** schaltet **Smart Fill aktivieren** Smart-Fill für dein Konto ein oder aus. Es ergänzt fehlende Priorität, fehlenden Aufwand, fehlende Kategorien und ein fehlendes Ziel; Status, zuständige Person und Fälligkeitsdatum bleiben deine Sache. Die Schalter der beiden folgenden Karten hängen davon ab.
- In **Zu füllende Vorgänge** legen **Erstellte Vorgänge ausfüllen** und **Triage-Vorgänge ausfüllen** fest, welche neuen Probleme es ergänzt: die Probleme, die du erstellst, und die Triage-Probleme, für die du zuständig bist.
- In **Verwandte Vorgänge** ist **Verwandte Vorgänge verknüpfen** standardmäßig eingeschaltet und erlaubt Smart-Fill, nach dem Speichern eines Problems [Beziehungen hinzuzufügen](#smart-fill-relations).
- In **Vorgangsindexierung** ist **Vorgänge indexieren** standardmäßig eingeschaltet und von Smart-Fill unabhängig. Es wandelt Titel und Beschreibung der Probleme, die du erstellst oder bearbeitest, in private Vektoren um, mit denen verwandte Probleme gefunden und Probleme [inhaltlich gesucht](/docs/navigation#search-by-meaning) werden. Die Indexierung der bestehenden Probleme eines Projekts im Hintergrund folgt sowohl dem Schalter des Projekteigentümers als auch dem des Autors: Ein Problem, dessen Autor ihn ausgeschaltet hat, wird nie indexiert. Die Vektoren werden wie das Problem mit dem Projekt verschlüsselt; Vektoren, die gespeichert wurden, bevor das Projekt verschlüsselt wurde, wandelt der Hintergrundjob um. Ist der Schalter aus, entsteht für deine Probleme kein Vektor, auch wenn jemand anderes sie bearbeitet, und die Suche nach verwandten Problemen vergleicht nur Wörter. Deine eigenen Suchen nutzen dann nur den Text, ohne inhaltliche Suche. Bereits erstellte Vektoren bleiben, solange sich der Text nicht ändert; sie werden gelöscht, sobald sich der Text ändert, oder mit dem Problem.

Das Ausschalten eines Schalters bricht auch Durchläufe ab, die noch nicht ausgeführt wurden. Numo kann diese Einstellungen auf deine Bitte hin ändern.

## Eingehende Arbeit in der Triage prüfen {#triage-incoming-work}

Die Listenfilter grenzen eingehende Tickets nach Priorität, Aufwand, zugewiesener Person, Ziel, Kategorien oder Integration ein. Werte derselben Eigenschaft sind Alternativen, verschiedene Eigenschaften gelten gemeinsam. Setzen Sie die Filter zurück, um alle eingehenden Tickets wieder anzuzeigen.

Öffne den Triage-Bereich des Projekts. Lies das eingegangene Problem und seinen Ursprungskontext, bevor du es in die geplante Arbeit aufnimmst. Prüfe, ob ein bestehendes Problem die Anfrage bereits abbildet. Kläre bei Bedarf erwartetes Ergebnis, Projekt, zuständige Person, Priorität und Aufwand.

Wähle Akzeptieren und bestätige, um ein beibehaltenes Problem in den Rückstand zu verschieben. Wähle Ablehnen und bestätige, um es auf Abgebrochen zu setzen. Bei einem Duplikat wählst du mit der Duplikatauswahl das Problem aus, das beibehalten werden soll. Das eingegangene Problem erhält den Status Duplikat und verweist auf dieses Problem. Beschreibst du die Anfrage im Suchfeld der Auswahl, listet sie nach den Textübereinstimmungen auch ähnliche Probleme unter **Inhaltlich verwandt** auf; siehe [Probleme inhaltlich suchen](/docs/navigation#search-by-meaning). Sobald ein Eintrag die Triage verlässt, wird der nächste ausgewählt. Prüfe den entstandenen Status oder den Duplikatlink direkt im Problem. Der Wechsel zwischen Karten ohne eine dieser Aktionen schließt kein Problem ab.

### Sortierung und Grenzen {#triage-order}

Smart Triage verwendet deterministische Sortierregeln.

Innerhalb jeder Statusspalte stehen zunächst offene Probleme, die andere offene Arbeit blockieren, vor Problemen ohne Blockade. Probleme, die durch offene Arbeit blockiert werden, stehen zuletzt, auch wenn sie selbst andere Probleme blockieren. Abgeschlossene Endpunkte erzeugen diese Priorität nicht mehr. Innerhalb einer Stufe bringen höhere Priorität, kleinerer Aufwand und überfällige oder nahe Fälligkeitstermine die Arbeit nach vorn. Innerhalb derselben Blockadestufe bleiben Probleme mit demselben Ziel zusammen; ihre Gruppe wird nach ihrem bestplatzierten Problem eingeordnet. Bei Gleichstand entscheiden Fälligkeitsdatum, älteres Erstellungsdatum, manuelle Position und schließlich die Kennung als stabiler letzter Vergleich. Eine verwandte Beziehung beeinflusst diese Sortierung nicht. Es handelt sich nicht um einen experimentellen KI-Triage-Modus. Die Reihenfolge hilft zu entscheiden, welche Einträge du zuerst prüfst; sie bestätigt weder den Wahrheitsgehalt einer Beschreibung, noch löst sie Duplikate automatisch auf oder gewährt Berechtigungen.

Fehlt der erwartete Eintrag, prüfe aktives Projekt, Status und Filter und suche dann seine Kennung. Importierte oder extern synchronisierte Arbeit kann in der Triage landen. Prüfe die ursprüngliche Quelle und die Zuordnung der Integration, bevor du gespiegelte Felder änderst. Eine aus Feedback verknüpfte Anfrage bleibt ein gesondertes Feedback-Objekt mit eigener öffentlicher Diskussion.


![Eingegangenes Demoproblem DOC-11 mit Bericht, Eigenschaften und Funktionen für Duplikat, Ablehnen und Akzeptieren.](/documentation/de/triage-incoming.png)

## Ein Problem durch seinen Lebenszyklus führen {#issue-statuses}

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

Die Statuswerte sind fest und werden nicht je Projekt angepasst. Triage und Duplikat sind in Auswahllisten verfügbar, fehlen aber bewusst in normalen Kanban-Spalten. Standardmäßig blenden Boards außerdem die Spalten **Fertig** und **Abgebrochen** aus; wähle sie im Filter **Status**, um sie anzuzeigen. Eine fehlende Spalte beweist nicht, dass der Status oder das Problem nicht existiert.


![Die acht Ticketstatus im Auswahlmenü, mit ausgewähltem Backlog-Status.](/documentation/de/issue-statuses.png)

### Abschlusszustände und Prüfung {#closed-work}

Fertig, Abgebrochen und Duplikat sind Abschlusszustände für die Nachverfolgung: Sie blockieren abhängige Probleme nicht mehr und verlassen die aktiven Zählungen. Abgebrochen bedeutet nicht, dass die Aufgabe geliefert wurde. Benenne beim Markieren eines Duplikats das beibehaltene Problem, damit Diskussion und Fortschritt ein klares Ziel haben.

Prüfe Filter, wenn ein Problem nach dem Schließen verschwindet. Öffne es über die Kennung erneut, um das Ergebnis zu prüfen und den Status bei einem versehentlichen Abschluss zu ändern. Prüfe bei blockierter Arbeit auch die Richtung der Abhängigkeit: Ein Statuswechsel schreibt weder Beschreibung noch Plan eines Problems um.

## Arbeit besprechen und Kontext hinzufügen {#issue-discussion-and-resources}

Öffne den Diskussionsverlauf des Problems, um einen Kommentar hinzuzufügen. Erkläre eine Entscheidung, Frage oder ein Prüfergebnis, damit ein anderes Mitglied die Änderung verstehen kann. Verwende Erwähnungen, wenn du eine Person oder ein verknüpftes Objekt im Kontext brauchst; Benachrichtigungen hängen weiterhin von den Einstellungen der empfangenden Person und der Zustellung auf ihrem Gerät ab. Ein Leser kann nur kommentieren, wenn der Eigentümer **Darf kommentieren** für ihn aktiviert hat. Dann kann er antworten, Personen erwähnen, Dateien an seine eigenen Kommentare anhängen und seine eigenen Kommentare bearbeiten oder löschen.

Füge eine passende Projektseite, Datei oder einen Link über die Ressourcenfunktionen hinzu. Eine verknüpfte Seite ist eine aktuelle Ressource: Ihr Titel folgt einer Umbenennung und ihr Inhalt kann sich ändern. Eine Datei ist ein gespeicherter Anhang, keine Garantie für die Erreichbarkeit einer externen URL.

Ressourcen erscheinen als Karten: das Bild selbst oder das Symbol des Dateityps, der Name und die Größe. Ein Link zeigt das Vorschaubild seiner Seite, wenn die Website eines bereitstellt, sonst ihr Favicon. Klicken oder rechtsklicken Sie auf eine Karte, um ihr Menü zu öffnen: Vorschau, Link öffnen oder Seite öffnen, dann Umbenennen, Herunterladen und Entfernen, sofern zutreffend. Vorschau öffnet eine unterstützte Datei über das gesamte Fenster. Bilder, PDF-Dateien, Markdown (`.md`), Klartext (`.txt`, `.text`), CSV-Dateien sowie unterstützte Audio- und Videoformate verwenden denselben Betrachter. Markdown wird formatiert, Text bleibt unverändert und CSV erscheint als scrollbare Tabelle. Mit Schließen oder Escape kehren Sie zum Ticket zurück. Das Menü Dateiaktionen (`…`) bietet Herunterladen und, wenn Sie diese Ressource ändern dürfen, Umbenennen und Entfernen. Ein Klick auf die Erwähnung einer Datei in einem Text öffnet denselben Betrachter. Minddy fragt vor dem Entfernen nach einer Bestätigung; die Ressource wird dann aus diesem Kontext gelöst. Eine Seitenressource behält den Titel ihrer Seite und lässt sich nicht umbenennen. Nicht unterstützte Formate behalten ihre Download-Aktion.

![Fensterfüllender CSV-Betrachter mit Beispielaufgaben, großer Schaltfläche Schließen und dem Menü Dateiaktionen mit Herunterladen, Umbenennen und Entfernen.](/documentation/de/file-preview.png)

![Dialog zum Hinzufügen eines Links mit einer Beispiel-Kontaktadresse.](/documentation/de/work-resources.png)

### Sichtbarkeit und fehlgeschlagene Uploads {#resource-access}

Mitgliedschaft und Projektzugriff bestimmen den Zugang zu interner Diskussion und Ressourcen. Das Hinzufügen einer Ressource zu einem Problem veröffentlicht sie nicht anonym. Unterscheide beim Bezug auf Feedback zwischen teaminterner Diskussion und öffentlicher Antwort, bevor du Text sendest.

Prüfe nach dem Hochladen, ob die Ressource erscheint und sich öffnen lässt. Schlägt der Vorgang fehl, bewahre die Originaldatei auf, lies den Uploadfehler und prüfe die geltende Dateigrößen- oder Kontospeichergrenze. Selbsthosting benötigt außerdem funktionierende Storage-Metadaten, Richtlinien und Dateidaten. Veröffentliche keine Zugangsdaten oder privaten Diagnose-Dumps als Anhänge.

## Abhängigkeiten und verwandte Probleme verknüpfen {#issue-dependencies}

Öffne die Beziehungsfunktionen eines Problems und suche das andere anhand von Titel oder Kennung. Eine beschreibende Suchanfrage listet nach den Textübereinstimmungen auch [inhaltlich gefundene](/docs/navigation#search-by-meaning) Probleme desselben Projekts unter **Inhaltlich verwandt** auf. Wähle eine blockierende Beziehung, wenn eine Aufgabe abgeschlossen sein muss, bevor eine andere weitergehen kann. Blockiert A das Problem B, ist A die Voraussetzung und B wird von A blockiert. Eine verwandte Beziehung ergänzt Kontext ohne diese Reihenfolge vorzugeben.

Lies beide Kennungen und die angezeigte Richtung vor der Bestätigung. Beispielsweise blockiert „Endpunkt vorbereiten“ die Aufgabe „Client verbinden“, nicht umgekehrt. Eine Abhängigkeit macht keines der Probleme zu einem Unterproblem. Eine Eltern-Kind-Beziehung ersetzt keine blockierende Beziehung.

![Suche nach einem blockierenden Ticket anhand seiner Kennung.](/documentation/de/work-dependencies.png)

### Aufgelöste und geerbte Blockaden {#blocker-state}

Die Abschlusszustände Fertig, Abgebrochen und Duplikat beenden die blockierende Wirkung eines Problems. Beziehungen verbinden Probleme oder Ziele innerhalb desselben Projekts; beide Endpunkte müssen dort zugänglich sein. Sie verknüpfen keine beliebigen privaten Arbeiten über Projektgrenzen hinweg und veröffentlichen keinen der Endpunkte.

Ein offenes Problem kann über sein offenes Ziel eine Blockade erben. Wenn A das Ziel B blockiert, zeigen offene Probleme in B den Eintrag A als geerbte Blockade, auch ohne direkte Beziehung von A zum Problem. Die Anzeige nennt die tatsächliche Voraussetzung und das Ziel, über das die Blockade vererbt wird. Prüfe diese Zielbeziehung, bevor du versuchst, sie am Problem zu entfernen. Wird A oder B geschlossen oder das Problem aus B entfernt, entfällt die geerbte Blockade. Dieser Mechanismus folgt der Zielzuordnung und nicht der Hierarchie zwischen über- und untergeordneten Problemen.

Entferne eine Beziehung über ihre Steuerelemente, wenn sie nicht mehr zutrifft; eine Bestätigung nennt das andere Problem oder Ziel, und nur die Verknüpfung verschwindet. Prüfe anschließend sowohl die Beschriftung als auch die Blockadeanzeige. Das Markieren eines Duplikats beeinflusst den Lebenszyklus und verweist auf die beibehaltene Arbeit. Verwende es für doppelte Aufgaben, statt eine normale verwandte Beziehung anzulegen und anzunehmen, diese würde das Duplikat schließen.

Findet die Beziehungsauswahl ein Problem nicht, prüfe Projektzugriff und Kennung. Lege keine Inhalte eines anderen Projekts offen, indem du eine private Problem-URL in eine öffentliche Feedback-Antwort kopierst.

### Von Smart-Fill hinzugefügte Verknüpfungen {#smart-fill-relations}

Ist **Verwandte Vorgänge verknüpfen** eingeschaltet, sucht Smart-Fill nach verwandten Problemen, sobald ein Problem erstellt oder sein Titel oder seine Beschreibung geändert wurde. Das geschieht im Hintergrund nach dem Speichern: Erstellen und Bearbeiten warten nie darauf, und Verknüpfungen können einige Sekunden später erscheinen. Bei einem neuen Problem folgt es denselben Einstellungen wie die übrigen Felder; es läuft also nicht, wenn du Smart-Fill für dieses Problem ausgeschaltet hast. Es läuft nicht für Probleme, die aus einem verknüpften Repository importiert wurden, nicht für wiederkehrende Kopien und nicht für Änderungen, die aus dem Repository synchronisiert werden.

Smart-Fill vergleicht das Problem mit höchstens fünf Kandidaten aus demselben Projekt; abgebrochene, doppelte und gelöschte Probleme bleiben außen vor. Eine Entscheidung ordnet dann jeden Kandidaten ein: verwandt, blockierend, blockiert durch oder ohne Beziehung. Ähnlichkeit allein erzeugt nie eine Verknüpfung, eine Abhängigkeit braucht stärkere Anhaltspunkte als eine verwandte Beziehung, und im Zweifel fügt Smart-Fill nichts hinzu. Ein einzelner Durchlauf fügt höchstens drei Beziehungen hinzu. Er rührt kein Paar an, das bereits eine Beziehung hat, fügt nie eine Blockade hinzu, die einen Zyklus schließen würde, und verwirft sein Ergebnis, wenn sich der Text des Problems während der Entscheidung geändert hat. Er markiert nie ein Duplikat und ändert nie einen Status.

So hinzugefügte Verknüpfungen erscheinen wie alle anderen in den Beziehungen des Problems, und der Verlauf nennt Smart-Fill als Urheber. Prüfe die Richtung einer Abhängigkeit wie bei deinen eigenen. Entferne eine Verknüpfung über die Beziehungssteuerelemente: Smart-Fill fügt eine entfernte Verknüpfung für dieses Paar nicht erneut hinzu. Um keine neuen Verknüpfungen mehr zu erhalten, schalte **Verwandte Vorgänge verknüpfen** in [deinen Einstellungen](#smart-fill-preferences) aus. Probleme, die vor dieser Funktion erstellt, importiert oder aus einem Repository synchronisiert wurden, werden nach und nach im Hintergrund indexiert, erhalten aber nie automatisch Verknüpfungen.

Indexierung und Beziehungsentscheidungen nutzen KI. Sie zählen zum Anteil **Automatisierungen** des Kontos, dem der Durchlauf zugerechnet wird: dem Konto, das für das Smart-Fill des neuen Problems belastet wird, meist seinem Ersteller; der bearbeitenden Person bei einer Bearbeitung; dem Projekteigentümer bei der Indexierung im Hintergrund. Der Nutzungsverlauf führt die Indexierung als **Smart-fill · Problemindex**. Eine Beziehungsentscheidung erscheint als **KI-Entscheidung**, wenn das Entscheidungsmodell sie trifft, und als **Smart-fill · Beziehungen**, wenn das Ersatzmodell sie trifft. Ist dieses Budget erschöpft oder schlägt der Anbieter fehl, wird der Durchlauf übersprungen und das Problem bleibt unverändert. Die [inhaltliche Problemsuche](/docs/navigation#search-by-meaning) nutzt denselben Index: Jede neue Suchanfrage zählt zum Anteil **Automatisierungen** des suchenden Kontos und erscheint als **Problemsuche**.

## Ein Problem in Unterprobleme aufteilen {#sub-issues}

Öffne das übergeordnete Problem und verwende seine Unterproblem-Funktionen, um kleinere Arbeitsschritte zu erstellen. Gib jedem Unterproblem ein eigenes Ergebnis. Prüfe nach der Erstellung sein Projekt, seine Eigenschaften und die Kennung des übergeordneten Problems. Die Hierarchie soll die Nachverfolgung erleichtern, nicht die Beschreibung der Ergebnisse jedes Unterproblems ersetzen.

Die Hierarchie erlaubt eine Ebene: Das übergeordnete Problem muss ein Problem der obersten Ebene im selben Projekt sein, und ein Unterproblem kann selbst keine Unterprobleme haben. Wird bei der Erstellung kein Ziel ausdrücklich gewählt, übernimmt das Unterproblem das Ziel seines übergeordneten Problems. Prüfe die entstandenen Eigenschaften, statt anzunehmen, dass spätere Änderungen am übergeordneten Problem automatisch übertragen werden.

Ein Unterproblem bleibt ein Problem mit eigenem Status und eigener Diskussion. Die Fortschrittsanzeige des übergeordneten Problems gewichtet den Aufwand der Unterprobleme und den ihrem Status zugeordneten Abschlussanteil. Der Zähler für abgeschlossene und insgesamt vorhandene Unterprobleme in der Liste ist dagegen eine einfache Anzahl. Lies die Zustände der Unterprobleme zusammen mit beiden Werten. Verwende eine Abhängigkeit für „muss vorher fertig sein“ und ein übergeordnetes Problem für „Teil dieser größeren Aufgabe“.

![Eingabefeld für ein Unterticket in einem Demo-Elternticket.](/documentation/de/work-sub-issues.png)

### Die übergeordnete Beziehung öffnen oder entfernen {#change-parent}

Die Kennung des übergeordneten Problems neben dem Titel des Unterproblems öffnet ein Menü. Öffne darüber das übergeordnete Problem, um die größere Aufgabe zu prüfen. Um das Unterproblem zu lösen, wähle die Aktion zum Entfernen der übergeordneten Beziehung und lies die Bestätigung vor dem Anwenden. Bei Erfolg verschwindet die Beziehung, das Problem bleibt erhalten.

Lösche kein Unterproblem nur zur Neuordnung der Hierarchie. Prüfe bestehende über- und untergeordnete Beziehungen vor einem Wechsel und kläre eine abgewiesene Beziehung, statt eine kreisförmige Hierarchie zu erzwingen. Schlägt Speichern fehl, öffne das Unterproblem erneut und prüfe, ob die Änderung bereits übernommen wurde, bevor du erneut versuchst. Bewahre abgeschlossene Unterprobleme, wenn du den Gesamtplan überarbeitest.

## Einen Umsetzungsplan pflegen {#implementation-plans}

Öffne den Plan-Tab des Problems. Seine Beschreibung sollte bereits das Problem und das erwartete Ergebnis benennen. Ergänze die Umsetzungsschritte selbst oder bitte Numo, das verknüpfte Repository zu lesen, bevor es einen Plan auf Code-Ebene vorschlägt. Ein von KI genannter Pfad oder eine Funktion sind ohne tatsächliches Lesen des Repositorys kein Beleg.

Der Plan wird direkt bearbeitet, wie die Beschreibung: Klicke hinein und schreibe, ohne Bearbeitungsmodus oder Speichern-Schaltfläche. Ein leerer Plan zeigt einen Platzhaltertext. Mehrere Mitglieder, Numo und verbundene Agenten können denselben Plan gleichzeitig bearbeiten, jeweils mit einem benannten Cursor, und eine Aufgabe, die ein Agent abhakt, erscheint in deinem Editor, während du an anderer Stelle schreibst. Tippe am Zeilenanfang `- [ ]` gefolgt von einem Leerzeichen oder wähle **Aufgabenliste** im `/`-Menü, um eine Aufgabe hinzuzufügen. Klicke auf das Kästchen einer Aufgabe, um sie abzuschließen, oder öffne ihr Menü für die anderen Zustände.

Drücke Tab in einer Aufgabe, um sie unter die vorherige zu verschachteln, und Umschalt+Tab, um sie zurückzuholen; im gespeicherten Markdown wird jede Ebene um zwei Leerzeichen eingerückt. Die Verschachtelung ordnet Schritte im Plan und erstellt keine Eltern-Kind-Beziehungen zwischen Problemen. Jede nicht abgebrochene Arbeitsaufgabe zählt weiterhin zum Fortschritt, auch verschachtelte Aufgaben.

Der Plan verwendet Markdown-Aufgabenzeilen: `- [ ]` für ausstehend, `- [~]` für in Bearbeitung, `- [x]` für abgeschlossen und `- [-]` für abgebrochen. Schreibe den Aufgabentext hinter die Markierung, etwa `- [ ] Den Kontaktlink auf Mobilgeräten prüfen`. Abgebrochene Aufgaben zählen nicht zur Abschlussquote. Aufgaben unter einer erkannten Questions-Überschrift werden als Fragen behandelt und ebenfalls nicht im Fortschritt berücksichtigt. Halte Arbeitsschritte deshalb in einem eigenen Abschnitt auf derselben Überschriftenebene. Die erkannte Überschrift heißt `Questions`; die Erkennung verwendet dieses englische Wort. Der Editor zeigt diese Zeilen als Aufgaben an und schreibt sie im selben Format zurück, das Numo und verbundene Agenten lesen. Nutze ausstehend, in Bearbeitung, abgeschlossen und abgebrochen, um den tatsächlichen Verlauf zu beschreiben, ohne ungeprüfte Verifikation anzudeuten.

![Demo-Plan mit zwei von sechs abgeschlossenen Arbeitsschritten.](/documentation/de/work-implementation-plan.png)

### Fortschritt und gleichzeitige Änderungen erhalten {#plan-progress}

Erweitere oder ändere den bestehenden Plan gezielt, statt ihn durch eine neue unabgehakte Kopie zu ersetzen. Bewahre abgeschlossene Schritte und Erklärungen für geänderten Umfang. Änderungen anderer Mitglieder und Agenten erscheinen im Plan, sobald sie vorgenommen werden. Ein Werkzeug, das den ganzen Plan ersetzt, ersetzt trotzdem die Passagen, die es neu schreibt; bitte Agenten daher, nur den Teil zu bearbeiten, den sie ändern.

Um den Plan umsetzen zu lassen, kopieren Sie die Eingabeaufforderung des Tickets für Ihren eigenen Coding-Agenten, wie unten beschrieben. Eine abgehakte Aufgabe beweist nicht, dass der Code Tests besteht. Lies Ergebnis, Änderungen und Prüfungen, bevor du das Problem als fertig markierst.

### Eine Eingabeaufforderung für einen anderen Coding-Agenten kopieren {#copy-issue-prompt}

Um ein Problem an einen Coding-Agenten außerhalb von Minddy zu übergeben, etwa Claude Code, Codex oder Cursor, öffnen Sie das Aktionsmenü des Problems, wählen **Als Eingabeaufforderung kopieren** und dann **Plan erstellen** (oder **Plan überprüfen**, wenn bereits einer existiert), **Problem umsetzen**, **Überprüfen Sie die Implementierung** oder **Benutzerdefiniert…**. Bei mehreren ausgewählten Problemen fasst **Kombinierte Eingabeaufforderung kopieren** sie in einer Eingabeaufforderung zusammen. Das Kopieren führt kein KI-Modell aus und verbraucht kein KI-Kontingent: Minddy stellt zusammen, was es bereits gespeichert hat, und der Agent erkundet das Repository selbst. Ist in den Kontoeinstellungen **Starten Sie das Problem oder die Aufgabe, wenn ich die Eingabeaufforderung kopiere.** aktiviert, startet das Kopieren außerdem ein noch nicht begonnenes Ticket. Den vollständigen Ablauf und die Prüfung von Pull Requests beschreibt [Code-Arbeit und Pull Requests](/docs/code-work).

Die Eingabeaufforderung enthält die Felder des Problems, seine Kategorien, Beziehungen, die Anzahl angehängter Ressourcen und den Fortschritt des Plans, aber nicht den Plantext. Diesen liest der Agent über den MCP-Server von Minddy oder fragt Sie danach. Sie nennt außerdem das mit dem Projekt verknüpfte Repository und jeden mit dem Problem verknüpften Pull Request mit seinem Status und seinen Branches, sofern bekannt. Der Agent setzt einen offenen Pull Request auf dessen Branch fort und behandelt zusammengeführte oder geschlossene als Verlauf. Ohne offenen Pull Request schlägt die Eingabeaufforderung einen Branchnamen aus der Kennung des Problems und einem kurzen Titel vor, zum Beispiel `min-42-keyboard-navigation`. Das ist nur ein Vorschlag: Der Agent prüft zuerst vorhandene Branches und folgt der Namenskonvention des Repositorys. Bleibt die Kennung im Branchnamen, im Titel des Pull Requests oder in einer Zeile `Fixes MIN-42` erhalten, kann Minddy den Pull Request dem Problem zuordnen, wenn das Repository verknüpft ist.

Können die Pull-Request-Informationen nicht geladen werden, sagt die Eingabeaufforderung das, statt zu behaupten, es gebe keinen. Eingabeaufforderungen zum Erstellen und Überprüfen eines Plans bitten den Agenten, vor der Umsetzung aufzuhören. Eine benutzerdefinierte Eingabeaufforderung übernimmt Ihre Anfrage und deren Umfang wie geschrieben. Der Inhalt des Problems und Ihre Anfrage behalten ihre ursprüngliche Sprache; die umgebenden Anweisungen sind auf Englisch.

## Ein Problem nach Abschluss wiederholen {#recurring-issues}

Erstelle oder öffne ein Problem, das bei jeder Wiederholung sinnvoll bleibt, etwa eine regelmäßige Prüfung der Abhängigkeiten. Setze ein Fälligkeitsdatum und wähle in der Datumsfunktion eine tägliche, wöchentliche, monatliche oder jährliche Wiederholung. Eine Wiederholung ohne Fälligkeitsdatum wird abgewiesen. Prüfe Eigenschaften und zuständige Person vor dem Speichern. Die Wiederholungseinstellungen des Projekts zeigen aktive Serien; dort kannst du den Rhythmus ändern oder die Wiederholung stoppen.

Wiederkehrende Probleme erzeugen sich nach dem Abschluss als „Fertig“ neu; das nächste Problem entsteht im Rückstand. Prüfe nach dem Abschließen Kennung und Eigenschaften des nächsten Problems.

Der nächste Fälligkeitstermin ergibt sich aus dem bisherigen Fälligkeitsdatum plus einem Wiederholungsintervall, nicht aus dem Tag des Abschlusses. Das Nachfolgeproblem übernimmt Titel, Beschreibung, Priorität, Aufwand, zuständige Person, Ziel und Kategorien. Umsetzungsplan, übergeordnete Beziehung, Ressourcen und Kommentare werden nicht übernommen. Die Wiederholung geht auf das Nachfolgeproblem über; das erneute Öffnen und Abschließen des alten Problems erzeugt keine weitere Wiederholung. Scheitert die Erstellung des Nachfolgeproblems, stoppt die Serie, statt am abgeschlossenen Problem wiederholt neue Versuche auszuführen. Prüfe das Ergebnis und richte nach Behebung des Fehlers die Wiederholung an der passenden nächsten Aufgabe ein. Gehe nicht davon aus, dass ein Kalenderplan Code ausführt oder das neue Problem für dich erledigt.


![Fälligkeitsauswahl im wiederkehrenden Modus mit Sonntagsvorschau und optionaler Uhrzeit.](/documentation/de/issue-date-recurrence.png)

### Die Wiederholung ändern oder stoppen {#recurrence-change}

Bearbeite oder deaktiviere künftige Wiederholungen in den Wiederholungseinstellungen. Prüfe bereits erstellte Probleme gesondert: Das Stoppen weiterer Erstellung bedeutet nicht, dass bestehende Arbeit abgeschlossen oder entfernt wurde.

Eine Numo-Routine ist ein anderes Objekt: Sie plant ein Gespräch und kann das KI-Budget des Eigentümers und eingerichtete Anbieter verwenden. Wähle wiederkehrende Probleme für eine wiederholte nachverfolgte Aufgabe und eine Routine für Anweisungen, die nach Zeitplan ausgeführt werden sollen. Fehlt das nächste Problem, prüfe, ob das vorherige als fertig markiert wurde, die Wiederholung noch aktiv ist und du den Rückstand ohne einschränkende Filter ansiehst.

## Mehrere Probleme gemeinsam aktualisieren {#bulk-issue-actions}

Halte auf einem Board die Umschalttaste gedrückt und klicke auf jede Problemkarte, um sie aus- oder abzuwählen. Mit einer Maus kannst du außerdem von einer freien Boardfläche aus ein Auswahlrechteck ziehen. Umschalt, Command oder Strg ergänzt dabei die bestehende Auswahl. Das Auswahlrechteck ist kein Auswahlverfahren für Touchscreens. Prüfe die Anzahl und die sichtbaren Kennungen, bevor du die Sammelaktionen öffnest. Die Auswahl ist eine Arbeitsmenge für die Aktion, keine gespeicherte Ansicht und keine Berechtigungserteilung. Öffne sie mit **Aktionen** in der Auswahlleiste oder drücke Befehl+K unter macOS bzw. Strg+K unter Windows/Linux, während Probleme ausgewählt sind.

Wähle Aktionen in der schwebenden Auswahlleiste, um die Befehlspalette zu öffnen. Wähle Status, Priorität, Aufwand oder zuständige Person, setze den Wert und bestätige das Inline-Formular. Die Zielaktion erscheint nur, wenn die Auswahl zu einem einzigen Projekt mit verfügbaren Zielen gehört. Andere Aktionen, etwa das Hinzufügen zu oder Entfernen aus einem Zyklus, das Verknüpfen zweier Probleme oder das Senden der Auswahl an Numo, erscheinen nur, wenn das aktuelle Board sie unterstützt. Prüfe anschließend die betroffenen Probleme. Auf einem reinen Touchgerät ohne unterstützte Mehrfachauswahl bearbeitest du jedes Problem im Detailpanel.

### Teilergebnisse und destruktive Aktionen {#bulk-results}

Prüfe bei projektübergreifender Arbeit deine Mitgliedschaft in jedem betroffenen Projekt. Lies Ergebnisse mit Teilfehlern: Erfolgreiche Änderungen können bereits gespeichert sein, obwohl ein anderes Problem abgewiesen wurde. Prüfe das Ergebnis, bevor du die gesamte Auswahl erneut bearbeitest.

Das Löschen betrifft jeden ausgewählten Eintrag. Bestätige deshalb die Auswahl, bevor du fortfährst. Hebe sie nach dem Vorgang auf, wenn du zu anderer Arbeit wechselst. Verändern sich durch dein Update die Filterergebnisse, können Probleme aus der sichtbaren Ansicht verschwinden und trotzdem im Projekt bleiben. Suche ihre Kennungen, um den neuen Zustand zu prüfen, statt sie neu anzulegen.

## CSV-Backlog nach Zuordnungsprüfung importieren {#import-issues}

Der Projektinhaber öffnet Import in den Projekteinstellungen und wählt einen CSV-Export aus. Formate von Linear und Jira werden erkannt; andere CSV-Dateien verwenden eine allgemeine Spaltenzuordnung. Pro Import gelten 5 MiB und 5.000 Tickets als Grenze. Teilen Sie größere Exporte gezielt auf und halten Sie Elternreferenzen möglichst im selben Stapel.

Ordnen Sie vor dem Import die Titelspalte zu. Prüfen Sie Beschreibung, Status, Priorität, Aufwand, Fälligkeit, Kategorien und zuständige Personen. Ordnen Sie Personen tatsächlichen Projektmitgliedern zu und prüfen Sie neue Kategorien. Elternreferenzen entsprechen externen Schlüsseln im Stapel und unterstützen eine Ebene. CSV-Dateien importieren keine Bytes angehängter Dateien.

Ein KI-Vorschlag wird nur bei Lücken in der Zuordnung angefordert. Er bleibt bearbeitbar. Fällt der Anbieter aus oder ist er nicht verfügbar, können Sie weiterhin manuell zuordnen. Eine manuelle Korrektur verhindert, dass ein später eintreffender Vorschlag Ihre Auswahl überschreibt.

### Importieren und kontrollieren {#result}

Lesen Sie nach jeder Zuordnungsänderung die Ticketanzahl, Statusverteilung und Warnungen. Korrigieren Sie übersprungene oder ungültige Zeilen vor der Bestätigung. Der Import erstellt neue Tickets; gehen Sie nicht davon aus, dass erneutes Hochladen bestehende Tickets ohne Duplikate aktualisiert. Prüfen Sie nach dem Erfolg repräsentative Tickets, Zuweisungen, Daten und Elternverknüpfungen. Geht die Antwort verloren, prüfen Sie das Projekt vor einem erneuten Import der gesamten Datei, um doppelte Arbeit zu vermeiden.

![CSV-Vorschau mit zwei übersetzten Demonstrationszeilen und erkannten Spaltenzuordnungen.](/documentation/de/import-issues-preview-workflow.png)

## Issues als CSV exportieren {#export-issues}

Öffnen Sie als angemeldetes Projektmitglied die Befehlspalette mit Command+K unter macOS oder Strg+K auf anderen Systemen und suchen Sie nach „Probleme als CSV exportieren“. Wählen Sie den Befehl, ein Projekt oder alle zugänglichen Projekte und prüfen Sie die Status-Kontrollkästchen. Auf einer Projektseite ist das aktuelle Projekt vorausgewählt. Erledigte, abgebrochene und als Duplikat markierte Issues sind standardmäßig ausgeschlossen; schließen Sie sie für einen vollständigen Verlauf ein. Mindestens ein Status muss ausgewählt bleiben. Board-Filter und ausgewählte Karten bestimmen diesen Export nicht.

Wählen Sie Exportieren und prüfen Sie die Downloadbestätigung und die gemeldete Anzahl. Die UTF-8-CSV enthält Kennungen, Titel, Markdown-Beschreibungen, Status, Prioritäten, Aufwand, Kategorien, Zuständige, Ziele, Projektnamen, Datumsangaben und übergeordnete Kennungen. Der Zugriff bleibt auf Ihre zugänglichen Projekte beschränkt. Eine Datei nur mit Spaltenüberschriften kann bedeuten, dass keine zugänglichen Issues passen. Berücksichtigen Sie beim Teilen, dass Beschreibungen und Namen Projektdaten sind.

### Vollständigkeit und erneuten Import prüfen {#export-issues-limits}

Der Export ist auf 20.000 Issues begrenzt. Eine Kürzungswarnung bedeutet, dass die Datei unvollständig sein kann. Grenzen Sie Projekt und Status ein, exportieren Sie getrennte Gruppen und vergleichen Sie die Anzahlen. Eine Wiederholung desselben Umfangs lädt keine Folgeseite. Prüfen Sie bei Downloadfehlern Fehlermeldung, Sitzung und Projektzugriff, bevor Sie es erneut versuchen.

Das Format lässt sich [in minddy importieren](#import-issues), mit der Berechtigung des Zielprojektinhabers und nach Prüfung der Feldzuordnung. Ein Import erstellt neue Issues; er stellt ursprüngliche Kennungen nicht wieder her und aktualisiert bestehende Issues nicht. Halten Sie übergeordnete Zeilen im selben Importstapel. CSV enthält Issue-Daten, keine Sicherung von Anhängen, Kommentaren, Kontoeinstellungen oder Zugangsdaten. Für einen Kontotransfer verwenden Sie den [Leitfaden zum Instanzwechsel](/docs/transfer-between-instances).

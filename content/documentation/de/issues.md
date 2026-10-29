---
{
  "id": "issues",
  "locale": "de",
  "title": "Tickets",
  "summary": "Erstelle und organisiere Tickets, verfolge ihren Status und verwalte Abhängigkeiten, Pläne, Importe und Sammeländerungen.",
  "topic": "Projekte und Tickets",
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
  "revision": 42,
  "sourceRevision": 42,
  "owner": "@mangue-dev",
  "updatedAt": "2026-10-29",
  "compatibility": {
    "version": "0.20.0 (MIN-747 release review); MIN-753 drafts tray; MIN-750 Smart Fill re-evaluation; MIN-804 parent and sub-issue relations; MIN-798 Smart Fill titles; MIN-809 Smart Fill split button; MIN-813 Smart Fill title on request; MIN-833 selection right-click menu",
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
      "lib/server/smart-fill-reevaluation.ts",
      "lib/server/smart-fill-ownership.ts",
      "lib/server/smart-fill-title.ts",
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
      "components/export-issues-dialog.tsx",
      "components/app-shell-chrome.tsx",
      "app/api/me/issues/export/route.ts",
      "lib/export/issues-csv.ts",
      "lib/export-api.ts",
      "components/file-viewer.tsx",
      "components/image-viewer.tsx",
      "lib/issue-prompt.ts",
      "lib/server/issue-prompt-context.ts",
      "docs/security/project-roles.md",
      "lib/project-roles.ts",
      "lib/server/issue-relation-inference.ts",
      "lib/server/issue-relation-decision.ts",
      "lib/server/issue-embedding-store.ts",
      "components/settings/account-preferences-section.tsx",
      "lib/issue-semantic-query.ts",
      "lib/server/issue-semantic-search.ts",
      "components/palette-picker-rows.tsx",
      "components/editor/rich-editor.tsx",
      "components/editor/document-editor.tsx",
      "components/editor/comment-editor.tsx",
      "lib/server/description-collaboration.ts",
      "lib/use-description-collaboration.ts",
      "docs/document-collaboration.md",
      "components/settings/account-smart-fill-section.tsx",
      "components/creation-project-select.tsx",
      "lib/use-resource-mentions.ts",
      "components/relations-section.tsx",
      "components/objective-relations-section.tsx",
      "components/issue-field-shortcuts.tsx",
      "components/creation-relations.tsx",
      "lib/keyboard/shortcuts.ts",
      "lib/server/assistant/prompt.ts",
      "components/drafts-tray.tsx",
      "lib/use-all-drafts.ts",
      "lib/use-held-draft.ts",
      "lib/issue-hierarchy.ts",
      "components/editor/mobile-editor-toolbar.tsx",
      "lib/palette-picker.ts",
      "lib/creation-relations.ts",
      "lib/action-menu-search.ts",
      "components/use-issue-menu-actions.tsx",
      "lib/use-bulk-selection-actions.ts"
    ]
  },
  "review": {
    "revision": 42,
    "fact": "agent:claude-code (right-clicking a card of a multi-issue selection acts on the selection: combined plan, implement, verify and custom prompts, the identifier list sorted by number, and the relation, objective and due-date pickers (MIN-833), checked against components/use-issue-menu-actions.tsx, components/issue-card.tsx, lib/use-bulk-selection-actions.ts and lib/issue-prompt.ts; rest of the article unchanged since the previous review; no figure recaptured, existing figures do not show the changed controls)",
    "language": "agent:claude-code (de changed passages with catalog UI labels; equivalent meaning to en revision 42; self-reviewed; agent review, not human acceptance)",
    "date": "2026-10-29"
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
    "Ein Ticket erstellen und bearbeiten",
    "Eingehende Arbeit in der Triage prüfen",
    "Ein Ticket durch seinen Lebenszyklus führen",
    "Arbeit besprechen und Kontext hinzufügen",
    "Abhängigkeiten und verwandte Tickets verknüpfen",
    "Ein Ticket in Untertickets aufteilen",
    "Einen Umsetzungsplan pflegen",
    "Ein Ticket nach Abschluss wiederholen",
    "Mehrere Tickets gemeinsam aktualisieren",
    "CSV-Backlog nach Zuordnungsprüfung importieren"
  ],
  "figures": [
    {
      "id": "create-an-issue-steps",
      "kind": "screenshot",
      "src": "/documentation/de/new-issue.png",
      "alt": "Noch nicht abgesendeter Ticketentwurf im Projekt Aurora mit Titel, Beschreibung, manuell wählbaren Eigenschaften und der Schaltfläche AUR-21 erstellen.",
      "caption": "Beschreibe das erwartete Ergebnis und wähle vor der Erstellung die passenden Eigenschaften.",
      "revision": 42,
      "reviewed": true,
      "capturedAt": "2026-10-27",
      "viewport": [
        720,
        396
      ],
      "theme": "light",
      "padding": 24,
      "deviceScaleFactor": 2
    },
    {
      "id": "triage-incoming-work-steps",
      "kind": "screenshot",
      "src": "/documentation/de/triage-incoming.png",
      "alt": "Eingegangenes Demoticket AUR-19 mit Bericht, Eigenschaften und Funktionen für Duplikat, Ablehnen und Akzeptieren.",
      "caption": "Lies den eingegangenen Bericht, bevor du ihn akzeptierst, ablehnst oder mit einem Duplikat verknüpfst.",
      "revision": 42,
      "reviewed": true,
      "capturedAt": "2026-10-22",
      "viewport": [
        1154,
        786
      ],
      "theme": "light",
      "padding": 24,
      "deviceScaleFactor": 2
    },
    {
      "id": "issue-statuses-steps",
      "kind": "screenshot",
      "src": "/documentation/de/issue-statuses.png",
      "alt": "Die acht Ticketstatus im Auswahlmenü, mit ausgewähltem Backlog-Status.",
      "caption": "Das Häkchen zeigt den aktuellen Status. Wähle den Status, der dem tatsächlichen Arbeitsstand entspricht.",
      "revision": 42,
      "reviewed": true,
      "capturedAt": "2026-10-22",
      "viewport": [
        288,
        358
      ],
      "theme": "light",
      "padding": 24,
      "deviceScaleFactor": 2
    },
    {
      "id": "issue-discussion-and-resources-steps",
      "kind": "screenshot",
      "src": "/documentation/de/work-resources.png",
      "alt": "Dialog zum Hinzufügen eines Links mit einer Beispiel-Kontaktadresse.",
      "caption": "Prüfe das Ziel, bevor du die Ressource hinzufügst. Dieser Beispiellink wurde nicht gesendet.",
      "revision": 42,
      "reviewed": true,
      "capturedAt": "2026-10-20",
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
      "alt": "Die Befehlspalette zeigt die Tickets, die dieses blockieren können, mit der Frage der Beziehung im Suchfeld.",
      "caption": "Wähle zuerst die Richtung der Beziehung und dann ihr Ziel. Hier wurde keine Beziehung gespeichert.",
      "revision": 42,
      "reviewed": true,
      "capturedAt": "2026-10-29",
      "viewport": [
        788,
        506
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
      "revision": 42,
      "reviewed": true,
      "capturedAt": "2026-10-22",
      "viewport": [
        508,
        1096
      ],
      "theme": "light",
      "padding": 24,
      "deviceScaleFactor": 2
    },
    {
      "id": "implementation-plans-steps",
      "kind": "screenshot",
      "src": "/documentation/de/work-implementation-plan.png",
      "alt": "Demo-Plan mit zwei von sechs abgeschlossenen Arbeitsschritten.",
      "caption": "Der gespeicherte Demo-Plan unterscheidet abgeschlossene, laufende und ausstehende Schritte. Der Fortschritt belegt nicht, dass die fiktive Codeaufgabe ausgeführt wurde.",
      "revision": 42,
      "reviewed": true,
      "capturedAt": "2026-10-22",
      "viewport": [
        508,
        1416
      ],
      "theme": "light",
      "padding": 24,
      "deviceScaleFactor": 2
    },
    {
      "id": "recurring-issues-steps",
      "kind": "screenshot",
      "src": "/documentation/de/issue-date-recurrence.png",
      "alt": "Fälligkeitsauswahl im wiederkehrenden Modus mit Sonntagsvorschau und optionaler Uhrzeit.",
      "caption": "Der wiederkehrende Modus zeigt die wöchentliche Folge. Bestätige die erste Fälligkeit vor der Ticketerstellung.",
      "revision": 42,
      "reviewed": true,
      "capturedAt": "2026-10-22",
      "viewport": [
        324,
        540
      ],
      "theme": "light",
      "padding": 24,
      "deviceScaleFactor": 2
    },
    {
      "id": "import-issues-workflow",
      "kind": "screenshot",
      "src": "/documentation/de/import-issues-preview-workflow.png",
      "alt": "CSV-Vorschau mit zwei übersetzten Demonstrationszeilen und erkannten Spaltenzuordnungen.",
      "caption": "CSV-Vorschau mit zwei übersetzten Demonstrationszeilen und erkannten Spaltenzuordnungen. Es wurde nichts importiert; die optionale KI-Planung war für die Aufnahme gesperrt.",
      "revision": 42,
      "reviewed": true,
      "capturedAt": "2026-10-22",
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
      "revision": 42,
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

Ein Ticket erfasst eine Arbeitseinheit im Projekt, von der ersten Anfrage bis zum Abschluss. Beginne mit Erstellung, Triage und Status. Für laufende Arbeit findest du Abschnitte zu Diskussionen, Abhängigkeiten, Untertickets und Plänen. Prüfe vor Wiederholungen, Sammelaktionen oder CSV-Import die jeweiligen Voraussetzungen; der Import ist dem Projekteigentümer vorbehalten.

## Ein Ticket erstellen und bearbeiten {#create-an-issue}

Du musst Eigentümer oder Mitglied des Zielprojekts sein; Leser können Tickets öffnen, aber weder erstellen noch bearbeiten. Öffne das Projekt und seine Funktion zum Erstellen eines Tickets. Gib einen Titel ein, der die Arbeit benennt, und ergänze Kontext, erwartetes Ergebnis und Einschränkungen in der Beschreibung. Titel und Beschreibung verhalten sich wie ein einziger Text: Am Computer wechselt die Abwärtspfeiltaste in der letzten Zeile des Titels in die erste Zeile der Beschreibung, die Aufwärtspfeiltaste zurück, und der Cursor behält ungefähr seine Position in der Zeile. Umschalt+Eingabetaste im Titel wechselt zur Beschreibung; die Eingabetaste ebenfalls, außer du hast die Eingabetaste als Sendekürzel gewählt – dann erstellt sie das Ticket. Command/Strg+Eingabetaste erstellt es aus beiden Feldern. Dieselben Pfeiltasten und die Eingabetaste verbinden auch Titel und Beschreibung eines geöffneten Tickets, Ziels, einer Seite oder eines Feedbacks. Das Formular öffnet sich im aktuellen Projekt; wähle unter **Erstellen in** oben links im Formular (auf dem Telefon neben dem Titel **Neues Ticket**) ein anderes, besonders wenn du aus einer persönlichen oder projektübergreifenden Ansicht erstellst. Am Computer öffnet Command/Strg+Umschalt+P dieses Menü, auch während du Titel oder Beschreibung eingibst; sobald du ein Projekt wählst oder das Menü schließt, steht der Cursor wieder genau dort, wo er war. Die Schaltfläche zeigt dieses Kürzel an, das es nur gibt, wenn mehr als ein Projekt zur Wahl steht; auf dem Telefon wird kein Kürzel angezeigt. Ein Projektwechsel entfernt die für das vorherige Projekt gewählten Kategorien, das Ziel und die Beziehungen. Die Erstellen-Schaltfläche nennt die Kennung, die das Ticket erhält, etwa `MIN-42`, und berücksichtigt zwischenzeitlich erstellte Tickets; ihr Menü erstellt das Ticket und kopiert diese Kennung.

Schalte für eine manuelle Erstellung Smart Fill aus, wenn die Schaltfläche angezeigt wird und aktiviert ist. Dadurch kannst du Priorität, Aufwand, Kategorien, Ziel und Beziehungen selbst festlegen. Um nur einige dieser Eigenschaften festzulegen, lass Smart Fill eingeschaltet und öffne den Pfeil neben seiner Schaltfläche: Wähle eine Eigenschaft und dann ihren Wert. Außerhalb von Titel und Beschreibung öffnet die Taste der Eigenschaft ihre Auswahl direkt: P für Priorität, E für Aufwand, L für Kategorien oder O für Ziel. Der gewählte Wert bleibt im Formular sichtbar. Smart Fill ergänzt nur die Eigenschaften, die du leer gelassen hast. Die Auswahl gilt für dieses Ticket; beim erneuten Öffnen des Erstellungsformulars wird die Kontoeinstellung wiederhergestellt. Sie ist von Smart Assign und Routinen unabhängig. Solange Smart Fill eingeschaltet ist, [verknüpft es das Ticket nach dem Speichern auch mit verwandten Tickets](#smart-fill-relations), deshalb ist die Beziehungsauswahl ausgeblendet; R öffnet sie trotzdem. Bereits gewählte Beziehungen bleiben über dem Titel sichtbar und werden mit dem Ticket angelegt.

Setze vor der Bestätigung die hilfreichen Eigenschaften: Status, Priorität, Aufwand, zuständige Person, Ziel, Kategorien, Fälligkeitsdatum und Wiederholung. Zuständig ist der Projekteigentümer oder ein Mitglied, nie ein Leser; ein Ziel bündelt Tickets zu einem Projektergebnis. Optionale Eigenschaften kannst du offenlassen, statt Werte zu erraten. Die Priorität ist **Nicht festgelegt** oder reicht von niedrig über mittel und hoch bis dringend; der Aufwand ist **Nicht festgelegt** oder verwendet XS, S, M, L und XL.

Ist Smart Assign im Projekt aktiviert, zeigt die Auswahl der zuständigen Person **Smart Assign** statt **Nicht zugewiesen**. Ticketkarten und die Befehlspalette folgen derselben Regel, und eine Karte ohne zuständige Person zeigt das Smart-Assign-Symbol. Lass diese Wahl stehen, und Smart Assign bestimmt die zuständige Person, sobald das Ticket die Triage verlassen hat. Im Ticketbereich entfernt **Smart Assign** die aktuelle zuständige Person und lässt Smart Assign neu wählen. Tickets mit dem Status **Abgebrochen** oder **Duplikat** behalten **Nicht zugewiesen**.

Bestätige die Erstellung und öffne das neue Ticket. Prüfe Kennung und Projekt. Öffne die Eigenschaftsauswahl erneut, um Werte zu ändern, sobald die Aufgabe klarer wird. Die Beschreibung erklärt die Arbeit; ein Umsetzungsplan wird gesondert im Plan-Tab gepflegt.

Wenn du das Formular schließt, bleibt das Geschriebene erhalten: Öffne es wieder, um dort weiterzumachen, wo du aufgehört hast. Öffnest du es nicht innerhalb von zwei Minuten wieder, wird sein Inhalt als Entwurf gespeichert und das nächste Formular beginnt leer; bis dahin existiert er nur in diesem Fenster, und Neuladen oder Schließen des Fensters verwirft ihn. Wenn du einen Entwurf oder ein von anderer Stelle vorausgefülltes Formular öffnest, wird das Zurückgelassene zuerst als Entwurf gespeichert. Um selbst zu speichern, öffne das Menü neben der Erstellen-Schaltfläche und wähle **Als Entwurf speichern**. Gespeicherte Entwürfe von Tickets und Zielen sammeln sich unter **Entwürfe**, unten rechts im Fenster zwischen Numo und dem Aufgabennotizbuch; die Schaltfläche erscheint nur, solange du einen Entwurf hast, und zeigt deren Anzahl. Ihre Liste zeigt Titel und erste Beschreibungszeile jedes Entwurfs. Wähle einen Entwurf, um ihn in seinem Erstellungsformular wieder zu öffnen und fertigzustellen; das Erstellen des Tickets entfernt den Entwurf. Die Löschschaltfläche neben einem Entwurf fragt zuerst nach einer Bestätigung, und das Löschen lässt sich nicht rückgängig machen. Auf einem Telefon öffne die Befehlspalette und suche nach dem Titel des Entwurfs. Entwürfe bleiben 30 Tage auf diesem Gerät, höchstens zehn je Art; die Liste zeigt nur Entwürfe aus Projekten, in denen du noch Tickets erstellen kannst.


![Noch nicht abgesendeter Ticketentwurf im Projekt Aurora mit Titel, Beschreibung, manuell wählbaren Eigenschaften und der Schaltfläche AUR-21 erstellen.](/documentation/de/new-issue.png)

Beschreibung, Kommentare und der Dialog für neue Tickets verwenden denselben Editor wie Projektseiten, nur ohne Blockgriffe. Tippe `/`, um eine Überschrift, Liste, Aufgabe, ein Zitat, einen **Hinweis**, einen Codeblock, ein Element **Aufklappbarer Bereich** oder einen Teiler einzufügen, und `@`, um eine Person, ein Ticket, ein Ziel oder eine Seite zu erwähnen. Das `@`-Menü listet auch die Ressourcen dessen auf, woran du schreibst: das Ticket oder Ziel für seine Beschreibung und seinen Plan, ein Kommentar für seine eigenen Dateien oder ein Erstellungsdialog für die dort hinzugefügten Dateien. Eine Erwähnung einer Ressource von anderswo erscheint als **Nicht verfügbar**. Mehrere Personen können dieselbe Beschreibung gleichzeitig bearbeiten: Der Cursor jeder Person erscheint mit ihrem Namen und ihrer Farbe, und Änderungen von Numo oder einem verbundenen Agenten erscheinen, sobald sie gespeichert sind. Numo, verbundene Agenten und CSV-Exporte lesen den Text als Markdown, das wenige Sekunden nach dem Ende der Eingabe folgt. Markiere Text, um ihn fett, kursiv, durchgestrichen oder als Code zu formatieren oder einen Link hinzuzufügen. Füge ein Bild ein, ziehe es hinein oder wähle **Bild** im `/`-Menü, um es in die Beschreibung einzufügen; andere Dateitypen gehören zu den Ressourcen des Tickets. Eine Erwähnung verweist auf ihr Ziel, nicht auf dessen Namen: Sie folgt einer Umbenennung und übersteht Bearbeitungen sowie Kopieren und Einfügen in eine andere Beschreibung, einen Kommentar, eine Seite oder den Numo-Eingabebereich. Wer das Ziel nicht öffnen kann, sieht eine Erwähnung **Nicht verfügbar**, ohne Namen oder Projekt. Auf dem Smartphone ersetzt die Leiste über der Tastatur die Auswahlleiste und das getippte `@`-Menü; die [Seitenanleitung](/de/dokumentation/pages#editor-formatting) beschreibt sie.

### Speichern und Sichtbarkeit prüfen {#issue-save}

Prüfe nach einer Eigenschaftsänderung den angezeigten Wert. Filter können ein Ticket sofort aus der aktuellen Ansicht entfernen, wenn sich zuständige Person, Status oder Kategorie ändern. Suche seine Kennung oder öffne das Projekt ohne diese Filter, bevor du einen Ersatz erstellst.

Schlägt Erstellen oder Speichern fehl, bewahre deinen Text auf, lies den Fehler und prüfe, ob Mitgliedschaft und Ziel noch bestehen. Kontrolliere nach einem Netzwerkfehler zuerst, ob das Ticket bereits erstellt wurde, bevor du erneut versuchst. Verknüpfe Projektseiten als aktuelle Ressourcen, wenn du deren jetzigen Inhalt brauchst, und verwende Kommentare für die Diskussion der Aufgabe.

### Festlegen, was Smart Fill tut {#smart-fill-preferences}

Die Smart-Fill-Einstellungen gehören zu deinem Konto. Öffne **Kontoeinstellungen** → **Smart Fill**. Jede Option hat ihre eigene Karte:

- In der Karte **Smart Fill** schaltet **Smart Fill aktivieren** Smart Fill für dein Konto ein oder aus. Es ergänzt fehlende Priorität, fehlenden Aufwand, fehlende Kategorien und ein fehlendes Ziel; Status, zuständige Person und Fälligkeitsdatum bleiben deine Sache. Die Schalter der beiden folgenden Karten hängen davon ab.
- In **Zu füllende Tickets** legen **Erstellte Tickets ausfüllen** und **Triage-Tickets ausfüllen** fest, welche neuen Tickets es ergänzt: die Tickets, die du erstellst, und die Triage-Tickets, für die du zuständig bist. **Bearbeitete Tickets neu bewerten** ist standardmäßig eingeschaltet und lässt Smart Fill ein Ticket [erneut lesen](#smart-fill-reevaluation), nachdem sich sein Titel oder seine Beschreibung geändert hat. **Fehlende Titel schreiben** ist standardmäßig eingeschaltet und lässt Smart Fill den [Titel eines Tickets schreiben](#smart-fill-title), das du nur beschreibst.
- In **Verwandte Tickets** ist **Verwandte Tickets verknüpfen** standardmäßig eingeschaltet und erlaubt Smart Fill, nach dem Speichern eines Tickets [Beziehungen hinzuzufügen](#smart-fill-relations).
- In **Ticketindexierung** ist **Tickets indexieren** standardmäßig eingeschaltet und von Smart Fill unabhängig. Es wandelt Titel und Beschreibung der Tickets, die du erstellst oder bearbeitest, in private Vektoren um, mit denen verwandte Tickets gefunden und Tickets [inhaltlich gesucht](/docs/navigation#search-by-meaning) werden. Die Indexierung der bestehenden Tickets eines Projekts im Hintergrund folgt sowohl dem Schalter des Projekteigentümers als auch dem des Autors: Ein Ticket, dessen Autor ihn ausgeschaltet hat, wird nie indexiert. Die Vektoren werden wie das Ticket mit dem Projekt verschlüsselt; Vektoren, die gespeichert wurden, bevor das Projekt verschlüsselt wurde, wandelt der Hintergrundjob um. Ist der Schalter aus, entsteht für deine Tickets kein Vektor, auch wenn jemand anderes sie bearbeitet, und die Suche nach verwandten Tickets vergleicht nur Wörter. Deine eigenen Suchen nutzen dann nur den Text, ohne inhaltliche Suche. Bereits erstellte Vektoren bleiben, solange sich der Text nicht ändert; sie werden gelöscht, sobald sich der Text ändert, oder mit dem Ticket.

Das Ausschalten eines Schalters bricht auch Durchläufe ab, die noch nicht ausgeführt wurden. Numo kann diese Einstellungen auf deine Bitte hin ändern.

### Wenn Smart Fill ein Ticket erneut liest {#smart-fill-reevaluation}

Mit eingeschaltetem **Bearbeitete Tickets neu bewerten** wird ein Ticket, das mit aktivem Smart Fill erstellt wurde, erneut gelesen, nachdem sich sein Titel oder seine Beschreibung geändert hat. Smart Fill wartet, bis sich der Text fünf Minuten lang nicht mehr geändert hat, sodass eine Reihe von Änderungen nur einmal gelesen wird; der Durchlauf kann bis zu einer Minute später starten. Danach setzt es Priorität, Aufwand, Kategorien und Ziel anhand des neuen Textes neu.

Es ändert nur Eigenschaften, die niemand von Hand gewählt hat: die beim Erstellen leer gelassenen, die seitdem niemand geändert hat. Sobald du, Numo oder ein verbundener Agent eine davon ändert, lässt Smart Fill sie dauerhaft in Ruhe. Es entfernt nie das Ziel oder alle Kategorien; den Aufwand kann es leeren, wenn der Text keine schätzbare Arbeit mehr beschreibt. Tickets, die vor dieser Funktion, mit ausgeschaltetem Smart Fill oder mit bereits gesetzten Eigenschaften erstellt wurden, werden nie erneut gelesen.

Jede Änderung erscheint in der Aktivität des Tickets mit Smart Fill als Urheber, und ein Ticket, das einem anderen Ziel zugeordnet wird, erscheint auch in der Aktivität beider Ziele. Ein Durchlauf, der nichts zu ändern findet, schreibt nichts. Der Durchlauf zählt zum Anteil **Automatisierungen** der Person, die zuletzt geändert hat, folgt deren Einstellung **Bearbeitete Tickets neu bewerten** und entfällt, wenn ihr Budget aufgebraucht ist oder der Anbieter ausfällt.

### Smart Fill den Titel schreiben lassen {#smart-fill-title}

Mit eingeschaltetem **Fehlende Titel schreiben** erstellst du ein Ticket, indem du es beschreibst. Die Option ist standardmäßig eingeschaltet und hängt von **Smart Fill aktivieren** ab. Solange Smart Fill für das Ticket aktiv ist, zeigt das Erstellungsformular nur die Beschreibung, mit dem Cursor darin. Beschreibe die Arbeit und erstelle das Ticket. Um den Titel selbst zu schreiben, öffne den Pfeil neben der Smart-Fill-Schaltfläche und wähle **Manuell festlegen** → **Titel**: Das Titelfeld erscheint über der Beschreibung, und ein Titel, den du eingibst, wird unverändert übernommen. Lässt du das Feld leer und wechselst woandershin, verschwindet es wieder. Schaltest du Smart Fill für das Ticket aus, kehrt der Titel ebenfalls zurück. Das gilt für das Erstellungsformular; Numo, der MCP-Server und der CSV-Import schreiben ihre eigenen Titel.

Smart Fill schreibt einen kurzen Titel, der die Beschreibung zusammenfasst und das Ticket von ähnlichen unterscheidet, in der Sprache der Beschreibung. Das Ticket erscheint, sobald Titel und Eigenschaften ausgefüllt sind, und seine Aktivität nennt Smart Fill. Kann kein Titel geschrieben werden, weil der Anbieter ausfällt oder dein Budget für **Automatisierungen** aufgebraucht ist, erhält das Ticket stattdessen die erste Zeile seiner Beschreibung. Eine Beschreibung, die nur ein Bild enthält, braucht weiterhin einen Titel.

Ein so geschriebener Titel gehört Smart Fill, bis jemand ihn ändert. Mit eingeschaltetem **Bearbeitete Tickets neu bewerten** kann ein späteres [erneutes Lesen](#smart-fill-reevaluation) ihn ersetzen, wenn die Beschreibung inzwischen eine andere Arbeit beschreibt, und behält ihn, solange er passt. Dieser Durchlauf schreibt den Titel nur neu, wenn die Person, die zuletzt geändert hat, **Fehlende Titel schreiben** nicht ausgeschaltet hat. Sobald du, Numo oder ein verbundener Agent den Titel ändert, lässt Smart Fill ihn dauerhaft in Ruhe.

## Eingehende Arbeit in der Triage prüfen {#triage-incoming-work}

Öffne den Triage-Bereich des Projekts. Lies das eingegangene Ticket und seinen Ursprungskontext, bevor du es in die geplante Arbeit aufnimmst. Prüfe, ob ein bestehendes Ticket die Anfrage bereits abbildet. Kläre bei Bedarf erwartetes Ergebnis, Projekt, zuständige Person, Priorität und Aufwand.

Die Listenfilter grenzen eingehende Tickets nach Priorität, Aufwand, zugewiesener Person, Ziel, Kategorien oder Integration ein. **Nicht festgelegt** unter Priorität oder Aufwand behält die Tickets, die noch keinen Wert haben. Werte derselben Eigenschaft sind Alternativen, verschiedene Eigenschaften gelten gemeinsam. Setze die Filter zurück, um alle eingehenden Tickets wieder anzuzeigen.

Wähle Akzeptieren und bestätige, um ein beibehaltenes Ticket ins Backlog zu verschieben. Wähle Ablehnen und bestätige, um es auf Abgebrochen zu setzen. Bei einem Duplikat wählst du mit der Duplikatauswahl das Ticket aus, das beibehalten werden soll. Das eingegangene Ticket erhält den Status Duplikat und verweist auf dieses Ticket. Beschreibst du die Anfrage im Suchfeld der Auswahl, listet sie nach den Textübereinstimmungen auch ähnliche Tickets unter **Inhaltlich verwandt** auf; siehe [Tickets inhaltlich suchen](/docs/navigation#search-by-meaning). Sobald ein Eintrag die Triage verlässt, wird der nächste ausgewählt. Prüfe den entstandenen Status oder den Duplikatlink direkt im Ticket. Der Wechsel zwischen Karten ohne eine dieser Aktionen schließt kein Ticket ab.

### Sortierung und Grenzen {#triage-order}

Smart Triage verwendet deterministische Sortierregeln.

Innerhalb jeder Statusspalte stehen zunächst offene Tickets, die andere offene Arbeit blockieren, vor Tickets ohne Blockade. Tickets, die durch offene Arbeit blockiert werden, stehen zuletzt, auch wenn sie selbst andere Tickets blockieren. Abgeschlossene Endpunkte erzeugen diese Priorität nicht mehr. Innerhalb einer Stufe bringen höhere Priorität, kleinerer Aufwand und überfällige oder nahe Fälligkeitstermine die Arbeit nach vorn. Innerhalb derselben Blockadestufe bleiben Tickets mit demselben Ziel zusammen; ihre Gruppe wird nach ihrem bestplatzierten Ticket eingeordnet. Bei Gleichstand entscheiden Fälligkeitsdatum, älteres Erstellungsdatum, manuelle Position und schließlich die Kennung als stabiler letzter Vergleich. Eine verwandte Beziehung beeinflusst diese Sortierung nicht. Es handelt sich nicht um einen experimentellen KI-Triage-Modus. Die Reihenfolge hilft zu entscheiden, welche Einträge du zuerst prüfst; sie bestätigt weder den Wahrheitsgehalt einer Beschreibung, noch löst sie Duplikate automatisch auf oder gewährt Berechtigungen.

Fehlt der erwartete Eintrag, prüfe aktives Projekt, Status und Filter und suche dann seine Kennung. Importierte oder extern synchronisierte Arbeit kann in der Triage landen. Prüfe die ursprüngliche Quelle und die Zuordnung der Integration, bevor du gespiegelte Felder änderst. Eine aus Feedback verknüpfte Anfrage bleibt ein gesondertes Feedback-Objekt mit eigener öffentlicher Diskussion.


![Eingegangenes Demoticket AUR-19 mit Bericht, Eigenschaften und Funktionen für Duplikat, Ablehnen und Akzeptieren.](/documentation/de/triage-incoming.png)

## Ein Ticket durch seinen Lebenszyklus führen {#issue-statuses}

Öffne die Statusauswahl des Tickets oder verwende die Statusaktionen des Boards. In einer Kanban-Ansicht verändert das Verschieben zwischen Statusspalten das Ticket selbst; ein anderer Filter verändert nur deine Ansicht. Prüfe den neuen Status nach dem Verschieben im Detailpanel.

| Status | Verwendung |
| --- | --- |
| Triage | Eingehende Arbeit, die geprüft werden muss. |
| Backlog | Beibehaltene Arbeit, die noch nicht für den Beginn ausgewählt wurde. |
| Zu erledigen | Für die Umsetzung ausgewählte Arbeit. |
| In Bearbeitung | Laufende Arbeit. |
| In Prüfung | Umsetzung, die auf eine Prüfung wartet. |
| Erledigt | Das erwartete Ergebnis ist abgeschlossen. |
| Abgebrochen | Ohne Lieferung geschlossene Arbeit. |
| Duplikat | Arbeit, die ein anderes Ticket bereits abbildet. |

Die Statuswerte sind fest und werden nicht je Projekt angepasst. Triage und Duplikat sind in Auswahllisten verfügbar, fehlen aber bewusst in normalen Kanban-Spalten. Standardmäßig blenden Boards außerdem die Spalten **Erledigt** und **Abgebrochen** aus; wähle sie im Filter **Status**, um sie anzuzeigen. Eine fehlende Spalte beweist nicht, dass der Status oder das Ticket nicht existiert.


![Die acht Ticketstatus im Auswahlmenü, mit ausgewähltem Backlog-Status.](/documentation/de/issue-statuses.png)

### Abschlusszustände und Prüfung {#closed-work}

Erledigt, Abgebrochen und Duplikat sind Abschlusszustände für die Nachverfolgung: Sie blockieren abhängige Tickets nicht mehr und verlassen die aktiven Zählungen. Abgebrochen bedeutet nicht, dass die Aufgabe geliefert wurde. Benenne beim Markieren eines Duplikats das beibehaltene Ticket, damit Diskussion und Fortschritt ein klares Ziel haben.

Prüfe Filter, wenn ein Ticket nach dem Schließen verschwindet. Öffne es über die Kennung erneut, um das Ergebnis zu prüfen und den Status bei einem versehentlichen Abschluss zu ändern. Prüfe bei blockierter Arbeit auch die Richtung der Abhängigkeit: Ein Statuswechsel schreibt weder Beschreibung noch Plan eines Tickets um.

## Arbeit besprechen und Kontext hinzufügen {#issue-discussion-and-resources}

Öffne den Diskussionsverlauf des Tickets, um einen Kommentar hinzuzufügen. Erkläre eine Entscheidung, Frage oder ein Prüfergebnis, damit ein anderes Mitglied die Änderung verstehen kann. Verwende Erwähnungen, wenn du eine Person oder ein verknüpftes Objekt im Kontext brauchst; Benachrichtigungen hängen weiterhin von den Einstellungen der empfangenden Person und der Zustellung auf ihrem Gerät ab. Ein Leser kann nur kommentieren, wenn der Eigentümer **Darf kommentieren** für ihn aktiviert hat. Dann kann er antworten, Personen erwähnen, Dateien an seine eigenen Kommentare anhängen und seine eigenen Kommentare bearbeiten oder löschen.

Füge eine passende Projektseite, Datei oder einen Link über die Ressourcenfunktionen hinzu. Eine verknüpfte Seite ist eine aktuelle Ressource: Ihr Titel folgt einer Umbenennung und ihr Inhalt kann sich ändern. Eine Datei ist ein gespeicherter Anhang, keine Garantie für die Erreichbarkeit einer externen URL. **Seite** öffnet die Befehlspalette mit den Seiten des Projekts in der Reihenfolge der Seitenleiste; wähle eine, um sie anzuhängen. Um eine Seite zu schreiben, die es noch nicht gibt, wähle **Neue Seite** am Ende der Liste; ein zuvor in die Suche getippter Titel wird ihr Titel. Die Seite wird im Projekt erstellt, dem Ticket angehängt und in einem Seitenbereich geöffnet, in dem **Erweitern** die ganze Seite öffnet.

Ressourcen erscheinen als Karten: das Bild selbst oder das Symbol des Dateityps, der Name und die Größe. Ein Link zeigt das Vorschaubild seiner Seite, wenn die Website eines bereitstellt, sonst ihr Favicon. Klicke oder rechtsklicke auf eine Karte, um ihr Menü zu öffnen: Vorschau, Link öffnen oder Seite öffnen, dann Umbenennen, Herunterladen und Entfernen, sofern zutreffend. Vorschau öffnet eine unterstützte Datei über das gesamte Fenster. Bilder, PDF-Dateien, Markdown (`.md`), Klartext (`.txt`, `.text`), CSV-Dateien sowie unterstützte Audio- und Videoformate verwenden denselben Betrachter. Markdown wird formatiert, Text bleibt unverändert und CSV erscheint als scrollbare Tabelle. Mit Schließen oder Escape kehrst du zum Ticket zurück. Das Menü Dateiaktionen (`…`) bietet Herunterladen und, wenn du diese Ressource ändern darfst, Umbenennen und Entfernen. Ein Klick auf die Erwähnung einer Datei in einem Text öffnet denselben Betrachter. Minddy fragt vor dem Entfernen nach einer Bestätigung; die Ressource wird dann aus diesem Kontext gelöst. Eine Seitenressource behält den Titel ihrer Seite und lässt sich nicht umbenennen. Nicht unterstützte Formate behalten ihre Download-Aktion. **Seite öffnen** zeigt die Seite in einem Seitenpanel, in dem **Vergrößern** die ganze Seite öffnet; eine Datenbank öffnet sich direkt als ganze Seite.

![Fensterfüllender CSV-Betrachter mit Beispielaufgaben, großer Schaltfläche Schließen und dem Menü Dateiaktionen mit Herunterladen, Umbenennen und Entfernen.](/documentation/de/file-preview.png)

![Dialog zum Hinzufügen eines Links mit einer Beispiel-Kontaktadresse.](/documentation/de/work-resources.png)

### Sichtbarkeit und fehlgeschlagene Uploads {#resource-access}

Mitgliedschaft und Projektzugriff bestimmen den Zugang zu interner Diskussion und Ressourcen. Das Hinzufügen einer Ressource zu einem Ticket veröffentlicht sie nicht anonym. Unterscheide beim Bezug auf Feedback zwischen teaminterner Diskussion und öffentlicher Antwort, bevor du Text sendest.

Prüfe nach dem Hochladen, ob die Ressource erscheint und sich öffnen lässt. Schlägt der Vorgang fehl, bewahre die Originaldatei auf, lies den Uploadfehler und prüfe die geltende Dateigrößen- oder Kontospeichergrenze. Selbsthosting benötigt außerdem funktionierende Storage-Metadaten, Richtlinien und Dateidaten. Veröffentliche keine Zugangsdaten oder privaten Diagnose-Dumps als Anhänge.

## Abhängigkeiten und verwandte Tickets verknüpfen {#issue-dependencies}

Öffne die Beziehungsfunktionen eines Tickets und suche das andere anhand von Titel oder Kennung. Außerhalb eines Textfelds öffnet R die Auswahl der Beziehungsart auf einer Karte unter dem Mauszeiger oder im Seitenbereich des Tickets. Ist die Art gewählt, wählst du das andere Ende in der [Befehlspalette](/docs/navigation#search-and-shortcuts), die nur Tickets und Ziele zeigt, die diese Beziehung annehmen können. Eine beschreibende Suchanfrage listet nach den Textübereinstimmungen auch [inhaltlich gefundene](/docs/navigation#search-by-meaning) Tickets desselben Projekts unter **Inhaltlich verwandt** auf. Wähle eine blockierende Beziehung, wenn eine Aufgabe abgeschlossen sein muss, bevor eine andere weitergehen kann. Blockiert A das Ticket B, ist A die Voraussetzung und B wird von A blockiert. Eine verwandte Beziehung ergänzt Kontext ohne diese Reihenfolge vorzugeben.

Lies beide Kennungen und die angezeigte Richtung vor der Bestätigung. Beispielsweise blockiert „Endpunkt vorbereiten“ die Aufgabe „Client verbinden“, nicht umgekehrt. Eine Abhängigkeit macht keines der Tickets zu einem Unterticket. Eine Eltern-Kind-Beziehung ersetzt keine blockierende Beziehung.

![Die Befehlspalette zeigt die Tickets, die dieses blockieren können, mit der Frage der Beziehung im Suchfeld.](/documentation/de/work-dependencies.png)

### Aufgelöste und geerbte Blockaden {#blocker-state}

Die Abschlusszustände Erledigt, Abgebrochen und Duplikat beenden die blockierende Wirkung eines Tickets. Beziehungen verbinden Tickets oder Ziele innerhalb desselben Projekts; beide Endpunkte müssen dort zugänglich sein. Sie verknüpfen keine beliebigen privaten Arbeiten über Projektgrenzen hinweg und veröffentlichen keinen der Endpunkte.

Ein offenes Ticket kann über sein offenes Ziel eine Blockade erben. Wenn A das Ziel B blockiert, zeigen offene Tickets in B den Eintrag A als geerbte Blockade, auch ohne direkte Beziehung von A zum Ticket. Die Anzeige nennt die tatsächliche Voraussetzung und das Ziel, über das die Blockade vererbt wird. Prüfe diese Zielbeziehung, bevor du versuchst, sie am Ticket zu entfernen. Wird A oder B geschlossen oder das Ticket aus B entfernt, entfällt die geerbte Blockade. Dieser Mechanismus folgt der Zielzuordnung und nicht der Hierarchie zwischen über- und untergeordneten Tickets.

Entferne eine Beziehung über ihre Steuerelemente, wenn sie nicht mehr zutrifft; eine Bestätigung nennt das andere Ticket oder Ziel, und nur die Verknüpfung verschwindet. Prüfe anschließend sowohl die Beschriftung als auch die Blockadeanzeige. Das Markieren eines Duplikats beeinflusst den Lebenszyklus und verweist auf die beibehaltene Arbeit. Verwende es für doppelte Aufgaben, statt eine normale verwandte Beziehung anzulegen und anzunehmen, diese würde das Duplikat schließen.

Findet die Beziehungsauswahl ein Ticket nicht, prüfe Projektzugriff und Kennung. Lege keine Inhalte eines anderen Projekts offen, indem du eine private Ticket-URL in eine öffentliche Feedback-Antwort kopierst.

### Von Smart Fill hinzugefügte Verknüpfungen {#smart-fill-relations}

Ist **Verwandte Tickets verknüpfen** eingeschaltet, sucht Smart Fill nach verwandten Tickets, sobald ein Ticket erstellt oder sein Titel oder seine Beschreibung geändert wurde. Das geschieht im Hintergrund nach dem Speichern: Erstellen und Bearbeiten warten nie darauf, und Verknüpfungen können einige Sekunden später erscheinen. Bei einem neuen Ticket folgt es denselben Einstellungen wie die übrigen Felder; es läuft also nicht, wenn du Smart Fill für dieses Ticket ausgeschaltet hast. Es läuft nicht für Tickets, die aus einem verknüpften Repository importiert wurden, nicht für wiederkehrende Kopien und nicht für Änderungen, die aus dem Repository synchronisiert werden.

Smart Fill vergleicht das Ticket mit höchstens fünf Kandidaten aus demselben Projekt; abgebrochene, doppelte und gelöschte Tickets bleiben außen vor. Eine Entscheidung ordnet dann jeden Kandidaten ein: verwandt, blockierend, blockiert durch oder ohne Beziehung. Ähnlichkeit allein erzeugt nie eine Verknüpfung, eine Abhängigkeit braucht stärkere Anhaltspunkte als eine verwandte Beziehung, und im Zweifel fügt Smart Fill nichts hinzu. Eine verwandte Beziehung braucht einen offensichtlichen Zusammenhang, etwa denselben Fehler, eine direkte Fortsetzung oder eine Rücknahme: Zwei Tickets, die nur eine Funktion oder ein Thema teilen, bleiben unverknüpft. Die meisten Tickets erhalten daher keine Verknüpfung. Ein einzelner Durchlauf fügt höchstens zwei Beziehungen hinzu. Er rührt kein Paar an, das bereits eine Beziehung hat, fügt nie eine Blockade hinzu, die einen Zyklus schließen würde, und verwirft sein Ergebnis, wenn sich der Text des Tickets während der Entscheidung geändert hat. Er markiert nie ein Duplikat und ändert nie einen Status.

So hinzugefügte Verknüpfungen erscheinen wie alle anderen in den Beziehungen des Tickets, und der Verlauf nennt Smart Fill als Urheber. Prüfe die Richtung einer Abhängigkeit wie bei deinen eigenen. Entferne eine Verknüpfung über die Beziehungssteuerelemente: Smart Fill fügt eine entfernte Verknüpfung für dieses Paar nicht erneut hinzu. Um keine neuen Verknüpfungen mehr zu erhalten, schalte **Verwandte Tickets verknüpfen** in [deinen Einstellungen](#smart-fill-preferences) aus. Tickets, die vor dieser Funktion erstellt, importiert oder aus einem Repository synchronisiert wurden, werden nach und nach im Hintergrund indexiert, erhalten aber nie automatisch Verknüpfungen.

Indexierung und Beziehungsentscheidungen nutzen KI. Sie zählen zum Anteil **Automatisierungen** des Kontos, dem der Durchlauf zugerechnet wird: dem Konto, das für das Smart Fill des neuen Tickets belastet wird, meist seinem Ersteller; der bearbeitenden Person bei einer Bearbeitung; dem Projekteigentümer bei der Indexierung im Hintergrund. Der Nutzungsverlauf führt die Indexierung als **Smart Fill · Ticketindex**. Eine Beziehungsentscheidung erscheint als **KI-Entscheidung**, wenn das Entscheidungsmodell sie trifft, und als **Smart Fill · Beziehungen**, wenn das Ersatzmodell sie trifft. Ist dieses Budget erschöpft oder schlägt der Anbieter fehl, wird der Durchlauf übersprungen und das Ticket bleibt unverändert. Die [inhaltliche Ticketsuche](/docs/navigation#search-by-meaning) nutzt denselben Index: Jede neue Suchanfrage zählt zum Anteil **Automatisierungen** des suchenden Kontos und erscheint als **Ticketsuche**.

## Ein Ticket in Untertickets aufteilen {#sub-issues}

Öffne das übergeordnete Ticket und verwende seine Unterticket-Funktionen, um kleinere Arbeitsschritte zu erstellen. Gib jedem Unterticket ein eigenes Ergebnis. Prüfe nach der Erstellung sein Projekt, seine Eigenschaften und die Kennung des übergeordneten Tickets. Die Hierarchie soll die Nachverfolgung erleichtern, nicht die Beschreibung der Ergebnisse jedes Untertickets ersetzen.

Um bestehende Tickets zuzuordnen, drücke R auf einer Karte unter dem Mauszeiger oder im Seitenbereich des Tickets, oder öffne **Beziehungen** über das Kontextmenü einer Karte. **Übergeordnet zu** listet die Tickets, die ein Unterticket dieses Tickets werden können; **Unterticket von** listet die Tickets der obersten Ebene, die sein übergeordnetes Ticket werden können. Jede Liste bietet nur an, was die Regel einer einzigen Ebene erlaubt: Ein Unterticket hat keinen Eintrag **Übergeordnet zu**, und ein Ticket mit Untertickets hat keinen Eintrag **Unterticket von**. Wählst du ein Ticket, das bereits ein anderes übergeordnetes Ticket hat, wird es unter das neue verschoben. Bei einer Auswahl von Karten ordnet **Unterticket von** jedes geeignete ausgewählte Ticket dem gewählten übergeordneten Ticket unter. Im Formular für ein neues Ticket bietet **Beziehungen** dieselben beiden Einträge: **Unterticket von** erstellt das Ticket unter dem gewählten übergeordneten Ticket, und **Übergeordnet zu** ordnet die gewählten Tickets nach dem Erstellen darunter ein. Ein neues Ticket erhält ein übergeordnetes Ticket oder Untertickets, nicht beides. Wenn du im Suchfeld des Kontextmenüs einer Karte oder des `…`-Menüs im Seitenbereich des Tickets tippst, findest du auch die Einträge seiner Untermenüs, jeweils mit ihrem Pfad, etwa **Beziehungen** › **Als blockiert durch… markieren**.

Die Hierarchie erlaubt eine Ebene: Das übergeordnete Ticket muss ein Ticket der obersten Ebene im selben Projekt sein, und ein Unterticket kann selbst keine Untertickets haben. Wird bei der Erstellung kein Ziel ausdrücklich gewählt, übernimmt das Unterticket das Ziel seines übergeordneten Tickets. Prüfe die entstandenen Eigenschaften, statt anzunehmen, dass spätere Änderungen am übergeordneten Ticket automatisch übertragen werden.

Ein Unterticket bleibt ein Ticket mit eigenem Status und eigener Diskussion. Die Fortschrittsanzeige des übergeordneten Tickets gewichtet den Aufwand der Untertickets und den ihrem Status zugeordneten Abschlussanteil. Der Zähler für abgeschlossene und insgesamt vorhandene Untertickets in der Liste ist dagegen eine einfache Anzahl. Lies die Zustände der Untertickets zusammen mit beiden Werten. Verwende eine Abhängigkeit für „muss vorher fertig sein“ und ein übergeordnetes Ticket für „Teil dieser größeren Aufgabe“.

![Eingabefeld für ein Unterticket in einem Demo-Elternticket.](/documentation/de/work-sub-issues.png)

### Die übergeordnete Beziehung öffnen oder entfernen {#change-parent}

Die Kennung des übergeordneten Tickets neben dem Titel des Untertickets öffnet ein Menü. Öffne darüber das übergeordnete Ticket, um die größere Aufgabe zu prüfen. Um das Unterticket zu lösen, wähle die Aktion zum Entfernen der übergeordneten Beziehung und lies die Bestätigung vor dem Anwenden. Bei Erfolg verschwindet die Beziehung, das Ticket bleibt erhalten.

Lösche kein Unterticket nur zur Neuordnung der Hierarchie. Prüfe bestehende über- und untergeordnete Beziehungen vor einem Wechsel und kläre eine abgewiesene Beziehung, statt eine kreisförmige Hierarchie zu erzwingen. Schlägt Speichern fehl, öffne das Unterticket erneut und prüfe, ob die Änderung bereits übernommen wurde, bevor du erneut versuchst. Bewahre abgeschlossene Untertickets, wenn du den Gesamtplan überarbeitest.

## Einen Umsetzungsplan pflegen {#implementation-plans}

Öffne den Plan-Tab des Tickets. Seine Beschreibung sollte bereits das Problem und das erwartete Ergebnis benennen. Ergänze die Umsetzungsschritte selbst oder [kopiere den Prompt **Plan erstellen**](#copy-issue-prompt) für deinen eigenen Coding-Agenten, der das Repository selbst erkundet. Numo kann das Repository nicht lesen: Es kann die Beschreibung schärfen und auf Wunsch einen einfachen Plan schreiben, aber jeder Dateipfad und jede Funktion, die es nennt, ist eine Vermutung. Ein Pfad oder eine Funktion in einem Plan ist nur dann ein Beleg, wenn das Repository tatsächlich gelesen wurde.

Der Plan wird direkt bearbeitet, wie die Beschreibung: Klicke hinein und schreibe, ohne Bearbeitungsmodus oder Speichern-Schaltfläche. Ein leerer Plan zeigt einen Platzhaltertext. Mehrere Mitglieder, Numo und verbundene Agenten können denselben Plan gleichzeitig bearbeiten, jeweils mit einem benannten Cursor, und eine Aufgabe, die ein Agent abhakt, erscheint in deinem Editor, während du an anderer Stelle schreibst. Tippe am Zeilenanfang `- [ ]` gefolgt von einem Leerzeichen oder wähle **Aufgabenliste** im `/`-Menü, um eine Aufgabe hinzuzufügen. Klicke auf das Kästchen einer Aufgabe, um sie abzuschließen, oder öffne ihr Menü für die anderen Zustände.

Drücke Tab in einer Aufgabe, um sie unter die vorherige zu verschachteln, und Umschalt+Tab, um sie zurückzuholen; im gespeicherten Markdown wird jede Ebene um zwei Leerzeichen eingerückt. Die Verschachtelung ordnet Schritte im Plan und erstellt keine Eltern-Kind-Beziehungen zwischen Tickets. Jede nicht abgebrochene Arbeitsaufgabe zählt weiterhin zum Fortschritt, auch verschachtelte Aufgaben.

Der Plan verwendet Markdown-Aufgabenzeilen: `- [ ]` für ausstehend, `- [~]` für in Bearbeitung, `- [x]` für abgeschlossen und `- [-]` für abgebrochen. Schreibe den Aufgabentext hinter die Markierung, etwa `- [ ] Den Kontaktlink auf Mobilgeräten prüfen`. Abgebrochene Aufgaben zählen nicht zur Abschlussquote. Aufgaben unter einer erkannten Questions-Überschrift werden als Fragen behandelt und ebenfalls nicht im Fortschritt berücksichtigt. Halte Arbeitsschritte deshalb in einem eigenen Abschnitt auf derselben Überschriftenebene. Die erkannte Überschrift heißt `Questions`; die Erkennung verwendet dieses englische Wort. Der Editor zeigt diese Zeilen als Aufgaben an und schreibt sie im selben Format zurück, das Numo und verbundene Agenten lesen. Nutze ausstehend, in Bearbeitung, abgeschlossen und abgebrochen, um den tatsächlichen Verlauf zu beschreiben, ohne ungeprüfte Verifikation anzudeuten.

![Demo-Plan mit zwei von sechs abgeschlossenen Arbeitsschritten.](/documentation/de/work-implementation-plan.png)

### Fortschritt und gleichzeitige Änderungen erhalten {#plan-progress}

Erweitere oder ändere den bestehenden Plan gezielt, statt ihn durch eine neue unabgehakte Kopie zu ersetzen. Bewahre abgeschlossene Schritte und Erklärungen für geänderten Umfang. Änderungen anderer Mitglieder und Agenten erscheinen im Plan, sobald sie vorgenommen werden. Ein Werkzeug, das den ganzen Plan ersetzt, ersetzt trotzdem die Passagen, die es neu schreibt; bitte Agenten daher, nur den Teil zu bearbeiten, den sie ändern.

Um den Plan umsetzen zu lassen, kopiere den Prompt des Tickets für deinen eigenen Coding-Agenten, wie unten beschrieben. Eine abgehakte Aufgabe beweist nicht, dass der Code Tests besteht. Lies Ergebnis, Änderungen und Prüfungen, bevor du das Ticket als fertig markierst.

### Einen Prompt für einen anderen Coding-Agenten kopieren {#copy-issue-prompt}

Um ein Ticket an einen Coding-Agenten außerhalb von Minddy zu übergeben, etwa Claude Code, Codex oder Cursor, öffne das Aktionsmenü des Tickets, wähle **Als Prompt kopieren** und dann **Plan erstellen** (oder **Plan überprüfen**, wenn bereits einer existiert), **Ticket umsetzen**, **Implementierung überprüfen** oder **Benutzerdefiniert…**. Bei mehreren ausgewählten Tickets fasst **Kombinierten Prompt kopieren** sie in einem Prompt zusammen. Das Kopieren führt kein KI-Modell aus und verbraucht kein KI-Kontingent: Minddy stellt zusammen, was es bereits gespeichert hat, und der Agent erkundet das Repository selbst. Ist in den Kontoeinstellungen **Ticket oder Aufgabe starten, wenn ich den Prompt kopiere** aktiviert, startet das Kopieren außerdem ein noch nicht begonnenes Ticket. Den vollständigen Ablauf und die Prüfung von Pull Requests beschreibt [Code-Arbeit und Pull Requests](/docs/code-work).

Der Prompt enthält die Felder des Tickets, seine Kategorien, Beziehungen, die Anzahl angehängter Ressourcen und den Fortschritt des Plans, aber nicht den Plantext. Diesen liest der Agent über den MCP-Server von Minddy oder fragt dich danach. Er nennt außerdem das mit dem Projekt verknüpfte Repository und jeden mit dem Ticket verknüpften Pull Request mit seinem Status und seinen Branches, sofern bekannt. Der Agent setzt einen offenen Pull Request auf dessen Branch fort und behandelt zusammengeführte oder geschlossene als Verlauf. Ohne offenen Pull Request schlägt der Prompt einen Branchnamen aus der Kennung des Tickets und einem kurzen Titel vor, zum Beispiel `min-42-keyboard-navigation`. Das ist nur ein Vorschlag: Der Agent prüft zuerst vorhandene Branches und folgt der Namenskonvention des Repositorys. Bleibt die Kennung im Branchnamen, im Titel des Pull Requests oder in einer Zeile `Fixes MIN-42` erhalten, kann Minddy den Pull Request dem Ticket zuordnen, wenn das Repository verknüpft ist.

Können die Pull-Request-Informationen nicht geladen werden, sagt der Prompt das, statt zu behaupten, es gebe keinen. Prompts zum Erstellen und Überprüfen eines Plans bitten den Agenten, vor der Umsetzung aufzuhören. Ein benutzerdefinierter Prompt übernimmt deine Anfrage und deren Umfang wie geschrieben. Der Inhalt des Tickets und deine Anfrage behalten ihre ursprüngliche Sprache; die umgebenden Anweisungen sind auf Englisch.

## Ein Ticket nach Abschluss wiederholen {#recurring-issues}

Erstelle oder öffne ein Ticket, das bei jeder Wiederholung sinnvoll bleibt, etwa eine regelmäßige Prüfung der Abhängigkeiten. Setze ein Fälligkeitsdatum und wähle in der Datumsfunktion eine tägliche, wöchentliche, monatliche oder jährliche Wiederholung. Eine Wiederholung ohne Fälligkeitsdatum wird abgewiesen. Prüfe Eigenschaften und zuständige Person vor dem Speichern. Die Wiederholungseinstellungen des Projekts zeigen aktive Serien; dort kannst du den Rhythmus ändern oder die Wiederholung stoppen.

Wiederkehrende Tickets erzeugen sich nach dem Abschluss als „Erledigt“ neu; das nächste Ticket entsteht im Backlog. Prüfe nach dem Abschließen Kennung und Eigenschaften des nächsten Tickets.

Der nächste Fälligkeitstermin ergibt sich aus dem bisherigen Fälligkeitsdatum plus einem Wiederholungsintervall, nicht aus dem Tag des Abschlusses. Das Nachfolgeticket übernimmt Titel, Beschreibung, Priorität, Aufwand, zuständige Person, Ziel und Kategorien. Umsetzungsplan, übergeordnete Beziehung, Ressourcen und Kommentare werden nicht übernommen. Die Wiederholung geht auf das Nachfolgeticket über; das erneute Öffnen und Abschließen des alten Tickets erzeugt keine weitere Wiederholung. Scheitert die Erstellung des Nachfolgetickets, stoppt die Serie, statt am abgeschlossenen Ticket wiederholt neue Versuche auszuführen. Prüfe das Ergebnis und richte nach Behebung des Fehlers die Wiederholung an der passenden nächsten Aufgabe ein. Gehe nicht davon aus, dass ein Kalenderplan Code ausführt oder das neue Ticket für dich erledigt.


![Fälligkeitsauswahl im wiederkehrenden Modus mit Sonntagsvorschau und optionaler Uhrzeit.](/documentation/de/issue-date-recurrence.png)

### Die Wiederholung ändern oder stoppen {#recurrence-change}

Bearbeite oder deaktiviere künftige Wiederholungen in den Wiederholungseinstellungen. Prüfe bereits erstellte Tickets gesondert: Das Stoppen weiterer Erstellung bedeutet nicht, dass bestehende Arbeit abgeschlossen oder entfernt wurde.

Eine Numo-Routine ist ein anderes Objekt: Sie plant ein Gespräch und kann das KI-Budget des Eigentümers und eingerichtete Anbieter verwenden. Wähle wiederkehrende Tickets für eine wiederholte nachverfolgte Aufgabe und eine Routine für Anweisungen, die nach Zeitplan ausgeführt werden sollen. Fehlt das nächste Ticket, prüfe, ob das vorherige als erledigt markiert wurde, die Wiederholung noch aktiv ist und du das Backlog ohne einschränkende Filter ansiehst.

## Mehrere Tickets gemeinsam aktualisieren {#bulk-issue-actions}

Halte auf einem Board die Umschalttaste gedrückt und klicke auf jede Ticketkarte, um sie aus- oder abzuwählen. Mit einer Maus kannst du außerdem von einer freien Boardfläche aus ein Auswahlrechteck ziehen. Umschalt, Command oder Strg ergänzt dabei die bestehende Auswahl. Nahe einem Rand scrollt das Board, und die Karten, die das Rechteck überstrichen hat, bleiben ausgewählt, auch wenn sie aus dem sichtbaren Bereich scrollen. Das Auswahlrechteck ist kein Auswahlverfahren für Touchscreens. Prüfe die Anzahl und die sichtbaren Kennungen, bevor du die Sammelaktionen öffnest. Die Auswahl ist eine Arbeitsmenge für die Aktion, keine gespeicherte Ansicht und keine Berechtigungserteilung. Öffne sie mit **Aktionen** in der Auswahlleiste oder drücke Befehl+K unter macOS bzw. Strg+K unter Windows/Linux, während Tickets ausgewählt sind.

Wähle Aktionen in der schwebenden Auswahlleiste, um die Befehlspalette zu öffnen. Wähle Status, Priorität, Aufwand oder zuständige Person, setze den Wert und bestätige das Inline-Formular. Die Zielaktion erscheint nur, wenn die Auswahl zu einem einzigen Projekt mit verfügbaren Zielen gehört. Andere Aktionen, etwa das Hinzufügen zu oder Entfernen aus einem Zyklus, das Verknüpfen zweier Tickets oder das Senden der Auswahl an Numo, erscheinen nur, wenn das aktuelle Board sie unterstützt. Mit der Maus kannst du auch auf eine ausgewählte Karte zeigen und S, P, E, A, L, D, O oder R drücken: Das geöffnete Menü gilt für alle ausgewählten Tickets, für zuständige Person, Ziel, Kategorien und Beziehungen für die ausgewählten Tickets aus dem Projekt dieser Karte. Klicke mit der rechten Maustaste auf eine ausgewählte Karte, um auf die ganze Auswahl zu wirken: **Kombinierten Prompt kopieren** bietet **Pläne erstellen** (**Pläne überprüfen**, wenn jedes ausgewählte Ticket einen hat, **Pläne erstellen oder überprüfen**, wenn nur einige einen haben), **Tickets umsetzen**, **Implementierungen überprüfen** und **Benutzerdefiniert…**; jeder Eintrag kopiert einen einzigen Prompt für alle ausgewählten Tickets. **Die 3 Kennungen kopieren** kopiert bei drei ausgewählten Tickets ihre Kennungen, durch Kommas getrennt und mit der kleinsten Nummer zuerst. **Beziehungen**, **Ziel verknüpfen** und **Fälligkeitsdatum hinzufügen** öffnen dieselben Menüs wie R, O und D. Prüfe anschließend die betroffenen Tickets. Auf einem reinen Touchgerät ohne unterstützte Mehrfachauswahl bearbeitest du jedes Ticket im Detailpanel.

### Teilergebnisse und destruktive Aktionen {#bulk-results}

Prüfe bei projektübergreifender Arbeit deine Mitgliedschaft in jedem betroffenen Projekt. Lies Ergebnisse mit Teilfehlern: Erfolgreiche Änderungen können bereits gespeichert sein, obwohl ein anderes Ticket abgewiesen wurde. Prüfe das Ergebnis, bevor du die gesamte Auswahl erneut bearbeitest.

Das Löschen betrifft jeden ausgewählten Eintrag. Bestätige deshalb die Auswahl, bevor du fortfährst. **Tickets in den Papierkorb verschieben** verlangt eine Bestätigung; die Tickets lassen sich mit ihren Kommentaren, Dateien und Links 30 Tage lang aus dem [Papierkorb](/docs/trash-and-recovery) wiederherstellen. Hebe sie nach dem Vorgang auf, wenn du zu anderer Arbeit wechselst. Verändern sich durch dein Update die Filterergebnisse, können Tickets aus der sichtbaren Ansicht verschwinden und trotzdem im Projekt bleiben. Suche ihre Kennungen, um den neuen Zustand zu prüfen, statt sie neu anzulegen.

## CSV-Backlog nach Zuordnungsprüfung importieren {#import-issues}

Der Projektinhaber öffnet Import in den Projekteinstellungen und wählt einen CSV-Export aus. Formate von Linear und Jira werden erkannt; andere CSV-Dateien verwenden eine allgemeine Spaltenzuordnung. Pro Import gelten 5 MiB und 5.000 Tickets als Grenze. Teile größere Exporte gezielt auf und halte Elternreferenzen möglichst im selben Stapel.

Ordne vor dem Import die Titelspalte zu. Prüfe Beschreibung, Status, Priorität, Aufwand, Fälligkeit, Kategorien und zuständige Personen. Ordne Personen tatsächlichen Projektmitgliedern zu und prüfe neue Kategorien. Elternreferenzen entsprechen externen Schlüsseln im Stapel und unterstützen eine Ebene. CSV-Dateien importieren keine Bytes angehängter Dateien.

Ein KI-Vorschlag wird nur bei Lücken in der Zuordnung angefordert. Er bleibt bearbeitbar. Fällt der Anbieter aus oder ist er nicht verfügbar, kannst du weiterhin manuell zuordnen. Eine manuelle Korrektur verhindert, dass ein später eintreffender Vorschlag deine Auswahl überschreibt.

### Importieren und kontrollieren {#result}

Lies nach jeder Zuordnungsänderung die Ticketanzahl, Statusverteilung und Warnungen. Korrigiere übersprungene oder ungültige Zeilen vor der Bestätigung. Der Import erstellt neue Tickets; geh nicht davon aus, dass erneutes Hochladen bestehende Tickets ohne Duplikate aktualisiert. Prüfe nach dem Erfolg repräsentative Tickets, Zuweisungen, Daten und Elternverknüpfungen. Geht die Antwort verloren, prüfe das Projekt vor einem erneuten Import der gesamten Datei, um doppelte Arbeit zu vermeiden.

![CSV-Vorschau mit zwei übersetzten Demonstrationszeilen und erkannten Spaltenzuordnungen.](/documentation/de/import-issues-preview-workflow.png)

## Tickets als CSV exportieren {#export-issues}

Öffne als angemeldetes Projektmitglied die Befehlspalette mit Command+K unter macOS oder Strg+K auf anderen Systemen und suche nach „Tickets als CSV exportieren“. Wähle den Befehl, ein Projekt oder alle zugänglichen Projekte und prüfe die Status-Kontrollkästchen. Auf einer Projektseite ist das aktuelle Projekt vorausgewählt. Erledigte, abgebrochene und als Duplikat markierte Issues sind standardmäßig ausgeschlossen; schließe sie für einen vollständigen Verlauf ein. Mindestens ein Status muss ausgewählt bleiben. Board-Filter und ausgewählte Karten bestimmen diesen Export nicht.

Wähle Exportieren und prüfe die Downloadbestätigung und die gemeldete Anzahl. Die UTF-8-CSV enthält Kennungen, Titel, Markdown-Beschreibungen, Status, Prioritäten, Aufwand, Kategorien, Zuständige, Ziele, Projektnamen, Datumsangaben und übergeordnete Kennungen. Der Zugriff bleibt auf deine zugänglichen Projekte beschränkt. Eine Datei nur mit Spaltenüberschriften kann bedeuten, dass keine zugänglichen Issues passen. Berücksichtige beim Teilen, dass Beschreibungen und Namen Projektdaten sind.

### Vollständigkeit und erneuten Import prüfen {#export-issues-limits}

Der Export ist auf 20.000 Tickets begrenzt. Eine Kürzungswarnung bedeutet, dass die Datei unvollständig sein kann. Grenze Projekt und Status ein, exportiere getrennte Gruppen und vergleiche die Anzahlen. Eine Wiederholung desselben Umfangs lädt keine Folgeseite. Prüfe bei Downloadfehlern Fehlermeldung, Sitzung und Projektzugriff, bevor du es erneut versuchst.

Das Format lässt sich [in minddy importieren](#import-issues), mit der Berechtigung des Zielprojektinhabers und nach Prüfung der Feldzuordnung. Ein Import erstellt neue Tickets; er stellt ursprüngliche Kennungen nicht wieder her und aktualisiert bestehende Tickets nicht. Halte übergeordnete Zeilen im selben Importstapel. CSV enthält Ticketdaten, keine Sicherung von Anhängen, Kommentaren, Kontoeinstellungen oder Zugangsdaten. Für einen Kontotransfer verwende den [Leitfaden zum Instanzwechsel](/docs/transfer-between-instances).

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
    "A06"
  ],
  "visibility": "public",
  "status": "published",
  "revision": 6,
  "sourceRevision": 6,
  "owner": "@mangue-dev",
  "updatedAt": "2026-10-09",
  "compatibility": {
    "version": "0.11.1 candidate (89ebb59a5); 0.11.1 candidate (cd1843e12)",
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
      "content/documentation/reviews/visual-refresh-captures-2026-10-09.json"
    ]
  },
  "review": {
    "revision": 6,
    "fact": "agent:/root/german_spanish_review (structural consolidation review; prior procedural evidence retained; no operational rerun); agent:/root (visual usefulness, figure framing and preserved procedures; previous operational evidence retained)",
    "language": "agent:/root/german_spanish_review (de title, summary, lead and heading review; retained body comparison); agent:/root/editorial_de_es (editorial clarity pass); agent:/root (figure removals and captions)",
    "date": "2026-10-09"
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
      "alt": "Noch nicht abgesendeter Ticketentwurf mit Titel, Beschreibung und manuell wählbaren Eigenschaften.",
      "caption": "Beschreibe das erwartete Ergebnis und wähle vor der Erstellung die passenden Eigenschaften.",
      "revision": 6,
      "reviewed": true,
      "capturedAt": "2026-10-09",
      "viewport": [
        720,
        368
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
      "revision": 6,
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
      "revision": 6,
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
      "revision": 6,
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
      "revision": 6,
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
      "revision": 6,
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
      "revision": 6,
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
      "revision": 6,
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
      "id": "bulk-issue-actions-steps",
      "kind": "screenshot",
      "src": "/documentation/de/work-bulk-actions.png",
      "alt": "Aktionsmenü für zwei ausgewählte Demo-Tickets.",
      "caption": "Das Menü wirkt auf die ausgewählten Tickets. In dieser Aufnahme wurde keine Sammeländerung gesendet.",
      "revision": 6,
      "reviewed": true,
      "capturedAt": "2026-10-08",
      "viewport": [
        788,
        506
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
      "revision": 6,
      "reviewed": true,
      "capturedAt": "2026-10-09",
      "viewport": [
        816,
        977
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
    "bulk-issue-actions-steps",
    "import-issues-workflow"
  ]
}
---

Ein Problem erfasst eine Arbeitseinheit im Projekt, von der ersten Anfrage bis zum Abschluss. Beginne mit Erstellung, Triage und Status. Für laufende Arbeit findest du Abschnitte zu Diskussionen, Abhängigkeiten, Unterproblemen und Plänen. Prüfe vor Wiederholungen, Sammelaktionen oder CSV-Import die jeweiligen Voraussetzungen; der Import ist dem Projekteigentümer vorbehalten.

## Ein Problem erstellen und bearbeiten {#create-an-issue}

Du musst Mitglied des Zielprojekts sein. Öffne das Projekt und seine Funktion zum Erstellen eines Problems. Gib einen Titel ein, der die Arbeit benennt, und ergänze Kontext, erwartetes Ergebnis und Einschränkungen in der Beschreibung. Wähle das Projekt bewusst, wenn du aus einer persönlichen oder projektübergreifenden Ansicht erstellst.

Schalte für eine manuelle Erstellung Smart-Fill aus, wenn die Schaltfläche angezeigt wird und aktiviert ist. Dadurch kannst du Priorität, Aufwand, Kategorien und Ziel selbst festlegen. Die Auswahl gilt für dieses Ticket; beim erneuten Öffnen des Erstellungsformulars wird die Kontoeinstellung wiederhergestellt. Sie ist von den Automatisierungs- und Smart-Assign-Schaltern des Projekts unabhängig.

Setze vor der Bestätigung die hilfreichen Eigenschaften: Status, Priorität, Aufwand, zuständige Person, Ziel, Kategorien, Fälligkeitsdatum und Wiederholung. Zuständige Personen sind Projektmitglieder; ein Ziel bündelt Probleme zu einem Projektergebnis. Optionale Eigenschaften kannst du offenlassen, statt Werte zu erraten. Die Priorität reicht von keiner über niedrig, mittel und hoch bis dringend; der Aufwand verwendet XS, S, M, L und XL.

Bestätige die Erstellung und öffne das neue Problem. Prüfe Kennung und Projekt. Öffne die Eigenschaftsauswahl erneut, um Werte zu ändern, sobald die Aufgabe klarer wird. Die Beschreibung erklärt die Arbeit; ein Umsetzungsplan wird gesondert im Plan-Tab gepflegt.


![Noch nicht abgesendeter Ticketentwurf mit Titel, Beschreibung und manuell wählbaren Eigenschaften.](/documentation/de/new-issue.png)

### Speichern und Sichtbarkeit prüfen {#issue-save}

Prüfe nach einer Eigenschaftsänderung den angezeigten Wert. Filter können ein Problem sofort aus der aktuellen Ansicht entfernen, wenn sich zuständige Person, Status oder Kategorie ändern. Suche seine Kennung oder öffne das Projekt ohne diese Filter, bevor du einen Ersatz erstellst.

Schlägt Erstellen oder Speichern fehl, bewahre deinen Text auf, lies den Fehler und prüfe, ob Mitgliedschaft und Ziel noch bestehen. Kontrolliere nach einem Netzwerkfehler zuerst, ob das Problem bereits erstellt wurde, bevor du erneut versuchst. Verknüpfe Projektseiten als aktuelle Ressourcen, wenn du deren jetzigen Inhalt brauchst, und verwende Kommentare für die Diskussion der Aufgabe.

## Eingehende Arbeit in der Triage prüfen {#triage-incoming-work}

Öffne den Triage-Bereich des Projekts. Lies das eingegangene Problem und seinen Ursprungskontext, bevor du es in die geplante Arbeit aufnimmst. Prüfe, ob ein bestehendes Problem die Anfrage bereits abbildet. Kläre bei Bedarf erwartetes Ergebnis, Projekt, zuständige Person, Priorität und Aufwand.

Wähle Akzeptieren und bestätige, um ein beibehaltenes Problem in den Rückstand zu verschieben. Wähle Ablehnen und bestätige, um es auf Abgebrochen zu setzen. Bei einem Duplikat wählst du mit der Duplikatauswahl das Problem aus, das beibehalten werden soll. Das eingegangene Problem erhält den Status Duplikat und verweist auf dieses Problem. Sobald ein Eintrag die Triage verlässt, wird der nächste ausgewählt. Prüfe den entstandenen Status oder den Duplikatlink direkt im Problem. Der Wechsel zwischen Karten ohne eine dieser Aktionen schließt kein Problem ab.

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

Die Statuswerte sind fest und werden nicht je Projekt angepasst. Triage und Duplikat sind in Auswahllisten verfügbar, fehlen aber bewusst in normalen Kanban-Spalten. Eine fehlende Spalte beweist nicht, dass der Status oder das Problem nicht existiert.


![Die acht Ticketstatus im Auswahlmenü, mit ausgewähltem Backlog-Status.](/documentation/de/issue-statuses.png)

### Abschlusszustände und Prüfung {#closed-work}

Fertig, Abgebrochen und Duplikat sind Abschlusszustände für die Nachverfolgung: Sie blockieren abhängige Probleme nicht mehr und verlassen die aktiven Zählungen. Abgebrochen bedeutet nicht, dass die Aufgabe geliefert wurde. Benenne beim Markieren eines Duplikats das beibehaltene Problem, damit Diskussion und Fortschritt ein klares Ziel haben.

Prüfe Filter, wenn ein Problem nach dem Schließen verschwindet. Öffne es über die Kennung erneut, um das Ergebnis zu prüfen und den Status bei einem versehentlichen Abschluss zu ändern. Prüfe bei blockierter Arbeit auch die Richtung der Abhängigkeit: Ein Statuswechsel schreibt weder Beschreibung noch Plan eines Problems um.

## Arbeit besprechen und Kontext hinzufügen {#issue-discussion-and-resources}

Öffne den Diskussionsverlauf des Problems, um einen Kommentar hinzuzufügen. Erkläre eine Entscheidung, Frage oder ein Prüfergebnis, damit ein anderes Mitglied die Änderung verstehen kann. Verwende Erwähnungen, wenn du eine Person oder ein verknüpftes Objekt im Kontext brauchst; Benachrichtigungen hängen weiterhin von den Einstellungen der empfangenden Person und der Zustellung auf ihrem Gerät ab.

Füge eine passende Projektseite, Datei oder einen Link über die Ressourcenfunktionen hinzu. Eine verknüpfte Seite ist eine aktuelle Ressource: Ihr Titel folgt einer Umbenennung und ihr Inhalt kann sich ändern. Eine Datei ist ein gespeicherter Anhang, keine Garantie für die Erreichbarkeit einer externen URL.

![Dialog zum Hinzufügen eines Links mit einer Beispiel-Kontaktadresse.](/documentation/de/work-resources.png)

### Sichtbarkeit und fehlgeschlagene Uploads {#resource-access}

Mitgliedschaft und Projektzugriff bestimmen den Zugang zu interner Diskussion und Ressourcen. Das Hinzufügen einer Ressource zu einem Problem veröffentlicht sie nicht anonym. Unterscheide beim Bezug auf Feedback zwischen teaminterner Diskussion und öffentlicher Antwort, bevor du Text sendest.

Prüfe nach dem Hochladen, ob die Ressource erscheint und sich öffnen lässt. Schlägt der Vorgang fehl, bewahre die Originaldatei auf, lies den Uploadfehler und prüfe die geltende Dateigrößen- oder Kontospeichergrenze. Selbsthosting benötigt außerdem funktionierende Storage-Metadaten, Richtlinien und Dateidaten. Veröffentliche keine Zugangsdaten oder privaten Diagnose-Dumps als Anhänge.

## Abhängigkeiten und verwandte Probleme verknüpfen {#issue-dependencies}

Öffne die Beziehungsfunktionen eines Problems und suche das andere anhand von Titel oder Kennung. Wähle eine blockierende Beziehung, wenn eine Aufgabe abgeschlossen sein muss, bevor eine andere weitergehen kann. Blockiert A das Problem B, ist A die Voraussetzung und B wird von A blockiert. Eine verwandte Beziehung ergänzt Kontext ohne diese Reihenfolge vorzugeben.

Lies beide Kennungen und die angezeigte Richtung vor der Bestätigung. Beispielsweise blockiert „Endpunkt vorbereiten“ die Aufgabe „Client verbinden“, nicht umgekehrt. Eine Abhängigkeit macht keines der Probleme zu einem Unterproblem. Eine Eltern-Kind-Beziehung ersetzt keine blockierende Beziehung.

![Suche nach einem blockierenden Ticket anhand seiner Kennung.](/documentation/de/work-dependencies.png)

### Aufgelöste und geerbte Blockaden {#blocker-state}

Die Abschlusszustände Fertig, Abgebrochen und Duplikat beenden die blockierende Wirkung eines Problems. Beziehungen verbinden Probleme oder Ziele innerhalb desselben Projekts; beide Endpunkte müssen dort zugänglich sein. Sie verknüpfen keine beliebigen privaten Arbeiten über Projektgrenzen hinweg und veröffentlichen keinen der Endpunkte.

Ein offenes Problem kann über sein offenes Ziel eine Blockade erben. Wenn A das Ziel B blockiert, zeigen offene Probleme in B den Eintrag A als geerbte Blockade, auch ohne direkte Beziehung von A zum Problem. Die Anzeige nennt die tatsächliche Voraussetzung und das Ziel, über das die Blockade vererbt wird. Prüfe diese Zielbeziehung, bevor du versuchst, sie am Problem zu entfernen. Wird A oder B geschlossen oder das Problem aus B entfernt, entfällt die geerbte Blockade. Dieser Mechanismus folgt der Zielzuordnung und nicht der Hierarchie zwischen über- und untergeordneten Problemen.

Entferne eine Beziehung über ihre Steuerelemente, wenn sie nicht mehr zutrifft, und prüfe anschließend sowohl die Beschriftung als auch die Blockadeanzeige. Das Markieren eines Duplikats beeinflusst den Lebenszyklus und verweist auf die beibehaltene Arbeit. Verwende es für doppelte Aufgaben, statt eine normale verwandte Beziehung anzulegen und anzunehmen, diese würde das Duplikat schließen.

Findet die Beziehungsauswahl ein Problem nicht, prüfe Projektzugriff und Kennung. Lege keine Inhalte eines anderen Projekts offen, indem du eine private Problem-URL in eine öffentliche Feedback-Antwort kopierst.

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

Rücke eine Aufgabenzeile je Verschachtelungsebene um zwei Leerzeichen ein; ein Tab zählt als vier Leerzeichen. Die Verschachtelung ordnet Schritte im Plan und erstellt keine Eltern-Kind-Beziehungen zwischen Problemen. Jede nicht abgebrochene Arbeitsaufgabe zählt weiterhin zum Fortschritt, auch verschachtelte Aufgaben.

Der Plan verwendet Markdown-Aufgabenzeilen: `- [ ]` für ausstehend, `- [~]` für in Bearbeitung, `- [x]` für abgeschlossen und `- [-]` für abgebrochen. Schreibe den Aufgabentext hinter die Markierung, etwa `- [ ] Den Kontaktlink auf Mobilgeräten prüfen`. Abgebrochene Aufgaben zählen nicht zur Abschlussquote. Aufgaben unter einer erkannten Questions-Überschrift werden als Fragen behandelt und ebenfalls nicht im Fortschritt berücksichtigt. Halte Arbeitsschritte deshalb in einem eigenen Abschnitt auf derselben Überschriftenebene. Die erkannte Überschrift heißt `Questions`; die Erkennung verwendet dieses englische Wort. Speichere ausdrückliche Änderungen mit der Speichern-Schaltfläche. Abbrechen verwirft den Entwurf. Das Ankreuzen einer dargestellten Aufgabe aktualisiert ihren Zustand. Nutze ausstehend, in Bearbeitung, abgeschlossen und abgebrochen, um den tatsächlichen Verlauf zu beschreiben, ohne ungeprüfte Verifikation anzudeuten.

![Demo-Plan mit zwei von sechs abgeschlossenen Arbeitsschritten.](/documentation/de/work-implementation-plan.png)

### Fortschritt und gleichzeitige Änderungen erhalten {#plan-progress}

Erweitere oder ändere den bestehenden Plan gezielt, statt ihn durch eine neue unabgehakte Kopie zu ersetzen. Bewahre abgeschlossene Schritte und Erklärungen für geänderten Umfang. Vergleiche einen größeren Umbau vor dem Speichern mit dem neuesten Plan, wenn ein anderes Mitglied oder ein Agent am Problem gearbeitet hat.

Ein geschriebener Plan lässt sich Numo zur Umsetzung übergeben, wenn Repository-Arbeit und die eingerichtete Sandbox verfügbar sind. Sobald abgeschlossene Arbeit vorliegt, bietet die Oberfläche außerdem eine Umsetzungsprüfung. Diese Aktionen starten Arbeit; ein abgehaktes Kontrollkästchen beweist nicht, dass der Code Tests besteht. Lies Ergebnis, Änderungen und Prüfungen, bevor du das Problem als fertig markierst.

## Ein Problem nach Abschluss wiederholen {#recurring-issues}

Erstelle oder öffne ein Problem, das bei jeder Wiederholung sinnvoll bleibt, etwa eine regelmäßige Prüfung der Abhängigkeiten. Setze ein Fälligkeitsdatum und wähle in der Datumsfunktion eine tägliche, wöchentliche, monatliche oder jährliche Wiederholung. Eine Wiederholung ohne Fälligkeitsdatum wird abgewiesen. Prüfe Eigenschaften und zuständige Person vor dem Speichern. Die Wiederholungseinstellungen des Projekts zeigen aktive Serien; dort kannst du den Rhythmus ändern oder die Wiederholung stoppen.

Wiederkehrende Probleme erzeugen sich nach dem Abschluss als „Fertig“ neu; das nächste Problem entsteht im Rückstand. Prüfe nach dem Abschließen Kennung und Eigenschaften des nächsten Problems.

Der nächste Fälligkeitstermin ergibt sich aus dem bisherigen Fälligkeitsdatum plus einem Wiederholungsintervall, nicht aus dem Tag des Abschlusses. Das Nachfolgeproblem übernimmt Titel, Beschreibung, Priorität, Aufwand, zuständige Person, Ziel und Kategorien. Umsetzungsplan, übergeordnete Beziehung, Ressourcen und Kommentare werden nicht übernommen. Die Wiederholung geht auf das Nachfolgeproblem über; das erneute Öffnen und Abschließen des alten Problems erzeugt keine weitere Wiederholung. Scheitert die Erstellung des Nachfolgeproblems, stoppt die Serie, statt am abgeschlossenen Problem wiederholt neue Versuche auszuführen. Prüfe das Ergebnis und richte nach Behebung des Fehlers die Wiederholung an der passenden nächsten Aufgabe ein. Gehe nicht davon aus, dass ein Kalenderplan Code ausführt oder das neue Problem für dich erledigt.


![Fälligkeitsauswahl im wiederkehrenden Modus mit Sonntagsvorschau und optionaler Uhrzeit.](/documentation/de/issue-date-recurrence.png)

### Die Wiederholung ändern oder stoppen {#recurrence-change}

Bearbeite oder deaktiviere künftige Wiederholungen in den Wiederholungseinstellungen. Prüfe bereits erstellte Probleme gesondert: Das Stoppen weiterer Erstellung bedeutet nicht, dass bestehende Arbeit abgeschlossen oder entfernt wurde.

Eine Numo-Routine ist ein anderes Objekt: Sie plant ein Gespräch und kann das KI-Budget des Eigentümers und eingerichtete Anbieter verwenden. Wähle wiederkehrende Probleme für eine wiederholte nachverfolgte Aufgabe und eine Routine für Anweisungen, die nach Zeitplan ausgeführt werden sollen. Fehlt das nächste Problem, prüfe, ob das vorherige als fertig markiert wurde, die Wiederholung noch aktiv ist und du den Rückstand ohne einschränkende Filter ansiehst.

## Mehrere Probleme gemeinsam aktualisieren {#bulk-issue-actions}

Halte auf einem Board die Umschalttaste gedrückt und klicke auf jede Problemkarte, um sie aus- oder abzuwählen. Mit einer Maus kannst du außerdem von einer freien Boardfläche aus ein Auswahlrechteck ziehen. Umschalt, Command oder Strg ergänzt dabei die bestehende Auswahl. Das Auswahlrechteck ist kein Auswahlverfahren für Touchscreens. Prüfe die Anzahl und die sichtbaren Kennungen, bevor du die Sammelaktionen öffnest. Die Auswahl ist eine Arbeitsmenge für die Aktion, keine gespeicherte Ansicht und keine Berechtigungserteilung.

Wähle Aktionen in der schwebenden Auswahlleiste, um die Befehlspalette zu öffnen. Wähle Status, Priorität, Aufwand oder zuständige Person, setze den Wert und bestätige das Inline-Formular. Die Zielaktion erscheint nur, wenn die Auswahl zu einem einzigen Projekt mit verfügbaren Zielen gehört. Andere Aktionen, etwa das Hinzufügen zu oder Entfernen aus einem Zyklus, das Verknüpfen zweier Probleme oder das Senden der Auswahl an Numo, erscheinen nur, wenn das aktuelle Board sie unterstützt. Prüfe anschließend die betroffenen Probleme. Auf einem reinen Touchgerät ohne unterstützte Mehrfachauswahl bearbeitest du jedes Problem im Detailpanel.

![Aktionsmenü für zwei ausgewählte Demo-Tickets.](/documentation/de/work-bulk-actions.png)

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

---
{
  "id": "objectives",
  "locale": "de",
  "title": "Ziele",
  "summary": "Definiere ein Projektergebnis, ordne Arbeit zu und interpretiere Fortschritt, Abhängigkeiten und Momentum.",
  "topic": "Projekte und Probleme",
  "type": "guide",
  "audiences": [
    "member"
  ],
  "workflows": [
    "W10",
    "W11"
  ],
  "visibility": "public",
  "status": "published",
  "revision": 16,
  "sourceRevision": 16,
  "owner": "@mangue-dev",
  "updatedAt": "2026-10-20",
  "compatibility": {
    "version": "0.11.1 development (UI refinements); MIN-693 project roles; MIN-728 one editor engine; MIN-736 closed columns hidden by default; MIN-741 creation dialogs; MIN-742 resources; MIN-749 relation shortcut R; UI/UX refinements batch: Create in project shortcut",
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
      "components/objective-dialog.tsx",
      "components/objective-detail.tsx",
      "components/objective-relations-section.tsx",
      "components/objective-momentum.tsx",
      "lib/relation-constants.ts",
      "lib/server/issue-relations.ts",
      "lib/objective-momentum.ts",
      "content/documentation/reviews/min-671-objective-momentum-2026-10-10.md",
      "content/documentation/reviews/min-670-feedback-objectives.md",
      "content/documentation/reviews/ui-refinements-2026-10-11.md",
      "docs/security/project-roles.md",
      "lib/project-roles.ts",
      "content/documentation/reviews/min-693-project-roles.md",
      "components/editor/rich-editor.tsx",
      "components/editor/document-editor.tsx",
      "components/editor/comment-editor.tsx",
      "content/documentation/reviews/min-728-one-editor-engine.md",
      "lib/server/description-collaboration.ts",
      "lib/use-description-collaboration.ts",
      "docs/document-collaboration.md",
      "components/creation-project-select.tsx",
      "content/documentation/reviews/min-741-creation-dialogs.md",
      "lib/use-resource-mentions.ts",
      "content/documentation/reviews/min-742-resources.md",
      "lib/keyboard/shortcuts.ts"
    ]
  },
  "review": {
    "revision": 16,
    "fact": "agent:/root (MIN-671 target-date condition and retained calculation claims checked against source and render tests; earlier procedural evidence retained); agent:/root (MIN-670 source, de wording and new-control review; existing procedural evidence retained); agent:/root (UI refinements source and control review; unchanged procedural evidence retained); agent:/root (MIN-693 project roles: decision record, permission matrix and source review; no browser walkthrough, no new captures; unchanged evidence retained); agent:/root (MIN-728 one editor engine: source and unit-test review of the shared editor on this surface; no browser walkthrough, no new captures; unchanged evidence retained); agent:/root (MIN-736 objective board status filter: source review of the project page and objective header; no browser walkthrough, no new captures); agent:/root (MIN-741 creation dialogs: source and unit-test review of the Create in project control, the cleared lead and relations and the Create objective button; objectives-steps recaptured on 2026-10-19 in all six locales from the local candidate (documentation-product screen reader-objectives) and inspected; no other browser walkthrough); agent:/root (MIN-742 resources: source and unit-test review of resource mentions scoped to their surface; no browser walkthrough, no new captures; unchanged evidence retained); agent:/root (MIN-749 relation shortcut R: source and unit-test review of components/issue-field-shortcuts.tsx, the board card, issue panel, objective page and new-issue dialog relation pickers and lib/keyboard/shortcuts.ts; no browser walkthrough, no new captures; unchanged evidence retained); agent:/root (UI/UX refinements batch: source review of the Command/Ctrl+Shift+P Create in shortcut, its caret restoration and key hint in components/creation-project-select.tsx and the create.changeProject entry in lib/keyboard/shortcuts.ts; no browser walkthrough, no new captures; unchanged evidence retained)",
    "language": "agent:/root (de changed-passage review against English revision 7; earlier unchanged prose reviews retained); agent:/root (MIN-670 source, de wording and new-control review; existing procedural evidence retained); agent:/root (de changed-passage parity and localized-label review); agent:/root/min693_de with agent:/root (de MIN-693 translation of the changed passages, localized labels and retained-meaning review; agent review, not human acceptance); agent:/root (de translation of the MIN-728 passage with catalog UI labels, equivalent meaning self-reviewed; agent review, not human acceptance); agent:/root (de MIN-736 added sentence with catalog status labels; agent review, not human acceptance); agent:/root (de MIN-741 Create in passages and figure alt text with catalog UI labels; retained-meaning self-review; agent review, not human acceptance); agent:/root (de MIN-742 added sentence with catalog UI labels; retained-meaning self-review; agent review, not human acceptance); agent:/root (de translation of MIN-749 added sentences, equivalent meaning self-reviewed; agent review, not human acceptance); agent:/root (de translation of the Create in shortcut changed passage with catalog UI labels, equivalent meaning self-reviewed; agent review, not human acceptance)",
    "date": "2026-10-20"
  },
  "related": [
    "issues",
    "personal-cycle",
    "personal-statistics"
  ],
  "aliases": [
    "objective-dependencies-and-momentum"
  ],
  "tags": [
    "Ein Ergebnis mit einem Ziel verfolgen",
    "Zielabhängigkeiten und Momentum verstehen"
  ],
  "figures": [
    {
      "id": "objectives-steps",
      "kind": "screenshot",
      "src": "/documentation/de/reader-objectives.png",
      "alt": "Noch nicht gesendeter Zieldialog im Projekt Aurora mit einem Beispielnamen und der Schaltfläche Ziel erstellen.",
      "caption": "Benenne das Ergebnis, bevor du Verantwortung, Zieldatum und Status festlegst. Dieser Dialog hat kein zweites Ziel erstellt.",
      "revision": 16,
      "reviewed": true,
      "capturedAt": "2026-10-19",
      "viewport": [
        720,
        358
      ],
      "theme": "light",
      "padding": 24
    }
  ],
  "requiredFigures": [
    "objectives-steps"
  ]
}
---

Ein Ziel bündelt die Probleme eines Projekts um ein Ergebnis. Erstelle es und ordne die zugehörige Arbeit zu. Prüfe anschließend Fortschritt, blockierende Abhängigkeiten und Momentum, bevor du das Ziel anpasst oder abschließt.

## Ein Ergebnis mit einem Ziel verfolgen {#objectives}

Öffne den Zielbereich des Projekts und erstelle ein Ziel. Erstellst du es an einer anderen Stelle der App, wähle sein Projekt unter **Erstellen in** oben links im Formular (auf dem Telefon neben dem Titel **Neues Ziel**); ein Projektwechsel entfernt die für das vorherige Projekt gewählte verantwortliche Person und die Beziehungen. Am Computer öffnet Command/Strg+Umschalt+P dieses Menü, auch während du Namen oder Beschreibung eingibst; sobald du ein Projekt wählst oder das Menü schließt, steht der Cursor wieder genau dort, wo er war. Die Schaltfläche zeigt dieses Kürzel an, das es nur gibt, wenn mehr als ein Projekt zur Wahl steht; auf dem Telefon wird kein Kürzel angezeigt. Benenne das gewünschte Ergebnis, ergänze hilfreichen Kontext und setze die verfügbaren Felder für verantwortliche Person, Zieldatum, Farbe und Status. Ein Ziel gehört zu einem Projekt und ist von einem persönlichen Zyklus über mehrere Projekte zu unterscheiden. Die verantwortliche Person betreut das Ergebnis; ihre Auswahl überträgt nicht das Eigentum am Projekt. Nur der Eigentümer oder ein Mitglied kann ein Ziel verantworten, und eine verantwortliche Person, deren Rolle zu Leser wechselt, wird vom Ziel entfernt.

Die Zielbeschreibung und ihre Kommentare verwenden denselben Editor wie Projektseiten, nur ohne Blockgriffe: Tippe `/`, um Blöcke einzufügen, und `@`, um eine Person, ein Problem, ein Ziel oder eine Seite zu erwähnen. Das `@`-Menü listet auch die Ressourcen dessen auf, woran du schreibst: das Problem oder Ziel für seine Beschreibung und seinen Plan, ein Kommentar für seine eigenen Dateien oder ein Erstellungsdialog für die dort hinzugefügten Dateien. Eine Erwähnung einer Ressource von anderswo erscheint als **Nicht verfügbar**. Mehrere Personen können die Beschreibung gleichzeitig bearbeiten; der Cursor jeder Person erscheint mit ihrem Namen und ihrer Farbe. Markiere Text, um ihn zu formatieren oder einen Link hinzuzufügen, und füge ein Bild ein oder ziehe es hinein, um es in die Beschreibung einzufügen.

Öffne jedes passende Problem und wähle das Ziel in seinen Eigenschaften oder verwende die Problemfunktionen des Ziels. Prüfe, ob die vorgesehene Arbeit beim Ziel erscheint. Nutze dessen Diskussion und Ressourcen für Entscheidungen und Referenzseiten, die für das gesamte Ergebnis gelten.

![Noch nicht gesendeter Zieldialog im Projekt Aurora mit einem Beispielnamen und der Schaltfläche Ziel erstellen.](/documentation/de/reader-objectives.png)

### Den Fortschritt vor dem Abschluss prüfen {#objective-progress}

Prüfe abgeschlossene und aktive Probleme zusammen mit dem Fortschritt des Ziels. Eine Fortschrittsanzeige fasst zugeordnete Arbeit zusammen; sie kann nicht beurteilen, ob ein Produktergebnis akzeptabel ist. Prüfe fehlende Aufgaben sowie abgebrochene oder doppelte Arbeit, bevor du das Ziel abschließt. Das Board des Ziels zeigt zuerst offene Arbeit: Wähle **Fertig** und **Abgebrochen** in seinem Filter **Status**, um dort geschlossene Probleme zu prüfen.

Unterscheide im Lebenszyklus des Ziels geplante, laufende, abgeschlossene und abgebrochene Ergebnisse. Ein Zieldatum ist ein Vorhaben, eine Prognose eine Schätzung anhand von Aktivität. Erscheint das Ziel leer, prüfe Problemzuordnung und Ansichtsfilter, statt es neu anzulegen. Das Löschen eines Ziels verwendet den wiederherstellbaren Papierkorb und ist kein gewöhnlicher Statuswechsel.

## Zielabhängigkeiten und Momentum verstehen {#objective-dependencies-and-momentum}

Öffne das Ziel und seine Beziehungen. Auf der Seite des Ziels öffnet R außerhalb eines Textfelds die Auswahl der Beziehungsart. Prüfe, welches Ergebnis von einem anderen abhängt, und lies blockierende Problembeziehungen, wenn sie die Einschränkung erklären. Über- und Unterordnung, ein verwandter Link und eine blockierende Abhängigkeit beantworten verschiedene Fragen. Prüfe die Richtung, bevor du eine Beziehung änderst.

Eine blockierende Beziehung kann ein Problem oder ein anderes Ziel mit diesem Ziel verbinden, innerhalb desselben Projekts. Seine offenen Probleme erben die ungelöste Blockade: Die angezeigte Beziehung nennt sowohl die tatsächliche Voraussetzung als auch das Ziel, das sie weitergibt. Dabei wird nicht an jedem Problem eine neue direkte Beziehung gespeichert. Das Schließen der Voraussetzung oder des blockierten Ziels sowie das Entfernen eines Problems aus diesem Ziel beseitigen die jeweilige geerbte Blockade. Erfülle die tatsächliche Voraussetzung oder korrigiere eine überholte Beziehung. Allein die Änderung des Zieldatums schließt blockierende Probleme nicht ab.

### Das Momentum-Signal verstehen {#momentum}

Der Bereich Dynamik erscheint nur, wenn das Ziel ein Zieldatum hat. Wenn du dieses Datum entfernst, werden der Bereich, sein Verlauf, die Tempoangaben und das geschätzte Abschlussdatum ausgeblendet. Füge ein Zieldatum hinzu, um ihn wieder anzuzeigen. Die allgemeine Fortschrittsanzeige bleibt auch ohne Zieldatum verfügbar.

Momentum fasst kürzlich abgeschlossene Arbeit zusammen. Es kann beschleunigend, gleichmäßig, langsamer oder stockend sein; für noch nicht begonnene, abgeschlossene und abgebrochene Ziele gibt es eigene Zustände. Nutze es, um Ergebnisse mit Handlungsbedarf zu erkennen, und lies dann die zugrunde liegenden Probleme und Aktivitäten.

Ein geschätztes Abschlussdatum setzt mindestens zwei Abschlüsse, eine volle beobachtete Woche, positiven gelieferten Aufwand und verbleibende Arbeit voraus. Nur aktuell zugeordnete Probleme zählen; ein Abschluss vor der Erstellung des Ziels erzeugt kein künstliches jüngstes Momentum. Bei einem gültigen Zieldatum reicht der Verlauf von der Erstellung bis zu diesem Datum. Der Durchsatz verwendet die beobachtete Zeit seit der Erstellung, einschließlich der Zeit nach einem verpassten Zieltermin. Wenn ein Zieldatum eingetragen ist, aber keinen gültigen Zeitraum nach der Erstellung definiert, verwendet die Berechnung einen gleitenden Verlauf von acht Wochen und ein Vorhersagefenster von 28 Tagen. Wenig Verlauf oder eine kürzliche Änderung des Umfangs verringern den Nutzen. Die Schätzung ist kein zugesagter Termin und enthält keine noch nicht zugeordnete, unsichtbare Arbeit. Vergleiche Zieldatum, verbleibende Arbeit und tatsächliche Einschränkungen, bevor du Zusagen änderst.


## Ein Ziel für Feedback wählen {#objective-feedback}

In den Zieleigenschaften öffnet die Feedbackzahl den Feedbackbereich des Projekts mit einem Filter für dieses Ziel, einschließlich erledigter Anfragen. Auch null wird angezeigt. Feedback bleibt von Ticketfortschritt und Momentum getrennt.

Feedback kann einem Ziel zugeordnet sein, ohne ein Ticket zu werden. Wählen Sie das Ziel in den Eigenschaften einer Rückmeldung unter Feedback im Projekt. Diese Anfragen zählen weder zum Ticketfortschritt noch zur Dynamik. Bei der Umwandlung übernimmt das Ticket Ziel und Kategorien, sofern Sie sie im Erstellungsformular nicht ändern.

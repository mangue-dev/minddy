---
{
  "id": "objectives",
  "locale": "de",
  "title": "Ziele",
  "summary": "Definiere ein Projektergebnis, ordne Arbeit zu und interpretiere Fortschritt, Abhängigkeiten und Momentum.",
  "topic": "Projekte und Tickets",
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
  "revision": 26,
  "sourceRevision": 24,
  "owner": "@mangue-dev",
  "updatedAt": "2026-11-09",
  "compatibility": {
    "version": "0.30.0 (MIN-794 release review)",
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
      "components/objective-field-shortcuts.ts",
      "components/objective-detail.tsx",
      "components/objective-relations-section.tsx",
      "components/objective-momentum.tsx",
      "lib/relation-constants.ts",
      "lib/server/issue-relations.ts",
      "lib/objective-momentum.ts",
      "docs/security/project-roles.md",
      "lib/project-roles.ts",
      "components/editor/rich-editor.tsx",
      "components/editor/document-editor.tsx",
      "components/editor/comment-editor.tsx",
      "lib/server/description-collaboration.ts",
      "lib/use-description-collaboration.ts",
      "docs/document-collaboration.md",
      "components/creation-project-select.tsx",
      "lib/use-resource-mentions.ts",
      "lib/keyboard/shortcuts.ts",
      "lib/objective-order.ts",
      "components/objective-label.tsx",
      "components/editor/mobile-editor-toolbar.tsx",
      "lib/palette-picker.ts",
      "components/palette-picker-rows.tsx",
      "app/(app)/projects/[id]/page.tsx",
      "components/objectives/objectives-page.tsx",
      "components/app-sidebar.tsx",
      "lib/objective-forecast.ts",
      "lib/server/objective-forecast.ts",
      "app/api/objectives/[id]/forecast/route.ts",
      "lib/server/smart-fill-objective.ts",
      "lib/server/smart-assign-objective.ts",
      "lib/server/objectives.ts",
      "lib/smart-assign-config.ts",
      "components/settings/account-smart-fill-section.tsx",
      "lib/smart-fill.ts"
    ]
  },
  "review": {
    "revision": 26,
    "fact": "agent:claude-code (new section on Smart Fill and Smart Assign for objectives, MIN-919: Smart Fill button and arrow menu in the new-objective form, name/color/target date filled only when empty, Smart Assign in place of an empty lead in every lead picker, lead chosen from the closest assigned issues or the owner; checked against components/objective-dialog.tsx, lib/server/objectives.ts, lib/server/smart-fill-objective.ts, lib/server/smart-assign-objective.ts, components/objective-detail.tsx and components/objectives/objectives-page.tsx; not checked in the running app; rest of the article unchanged since the previous review; no figure recaptured, the existing figure does not show the Smart Fill button; Follow-up: the target date keeps the time the text gives, resolved in the author's time zone, and the new Fill created objectives switch; checked against lib/server/smart-fill-objective.ts, components/settings/account-smart-fill-section.tsx and lib/smart-fill.ts; the objective name follows its own Write missing names switch)",
    "language": "agent:claude-code (de translation of the changed passages with catalog UI labels, reviewed against en revision 24; agent review, not human acceptance)",
    "date": "2026-11-09"
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
      "revision": 26,
      "reviewed": true,
      "capturedAt": "2026-11-04",
      "viewport": [
        720,
        342
      ],
      "theme": "light",
      "padding": 24,
      "deviceScaleFactor": 2
    }
  ],
  "requiredFigures": [
    "objectives-steps"
  ]
}
---

Ein Ziel bündelt die Tickets eines Projekts um ein Ergebnis. Erstelle es und ordne die zugehörige Arbeit zu. Prüfe anschließend Fortschritt, blockierende Abhängigkeiten und Momentum, bevor du das Ziel anpasst oder abschließt.

## Ein Ergebnis mit einem Ziel verfolgen {#objectives}

Öffne den Zielbereich des Projekts und erstelle ein Ziel. Erstellst du es an einer anderen Stelle der App, wähle sein Projekt unter **Erstellen in** oben links im Formular (auf dem Telefon neben dem Titel **Neues Ziel**); ein Projektwechsel entfernt die für das vorherige Projekt gewählte verantwortliche Person und die Beziehungen. Am Computer öffnet Command/Strg+Umschalt+P dieses Menü, auch während du Namen oder Beschreibung eingibst; sobald du ein Projekt wählst oder das Menü schließt, steht der Cursor wieder genau dort, wo er war. Die Schaltfläche zeigt dieses Kürzel an, das es nur gibt, wenn mehr als ein Projekt zur Wahl steht; auf dem Telefon wird kein Kürzel angezeigt. Benenne das gewünschte Ergebnis, ergänze hilfreichen Kontext und setze die verfügbaren Felder für verantwortliche Person, Zieldatum, Farbe und Status. Am Computer öffnen dieselben Tasten wie bei den Feldern eines Tickets diese Felder, sobald der Cursor Name und Beschreibung verlässt: S den Status, A die verantwortliche Person, D das Zieldatum, R eine Beziehung und C die Farbe; der Tooltip jeder Auswahl zeigt ihre Taste. Ein Ziel gehört zu einem Projekt und ist von einem persönlichen Zyklus über mehrere Projekte zu unterscheiden. Die verantwortliche Person betreut das Ergebnis; ihre Auswahl überträgt nicht das Eigentum am Projekt. Nur der Eigentümer oder ein Mitglied kann ein Ziel verantworten, und eine verantwortliche Person, deren Rolle zu Leser wechselt, wird vom Ziel entfernt.

Die Zielbeschreibung und ihre Kommentare verwenden denselben Editor wie Projektseiten, nur ohne Blockgriffe: Tippe `/`, um Blöcke einzufügen, und `@`, um eine Person, ein Ticket, ein Ziel oder eine Seite zu erwähnen. Das `@`-Menü listet auch die Ressourcen dessen auf, woran du schreibst: das Ticket oder Ziel für seine Beschreibung und seinen Plan, ein Kommentar für seine eigenen Dateien oder ein Erstellungsdialog für die dort hinzugefügten Dateien. Eine Erwähnung einer Ressource von anderswo erscheint als **Nicht verfügbar**. Mehrere Personen können die Beschreibung gleichzeitig bearbeiten; der Cursor jeder Person erscheint mit ihrem Namen und ihrer Farbe. Markiere Text, um ihn zu formatieren oder einen Link hinzuzufügen. Füge ein Bild ein, ziehe es hinein oder wähle **Bild** im `/`-Menü, um es in die Beschreibung einzufügen. Auf dem Smartphone ersetzt die Leiste über der Tastatur die Auswahlleiste und das getippte `@`-Menü; die [Seitenanleitung](/de/dokumentation/pages#editor-formatting) beschreibt sie.

Öffne jedes passende Ticket und wähle das Ziel in seinen Eigenschaften oder verwende die Ticketfunktionen des Ziels. Die Zielauswahl zeigt offene Ziele vor erledigten und abgebrochenen; innerhalb jeder Gruppe stehen die Ziele vorn, die in den letzten 30 Tagen die meisten Tickets erhalten haben. Jedes Ziel zeigt seinen Status und seinen Namen in seiner Farbe. Prüfe, ob die vorgesehene Arbeit beim Ziel erscheint. Nutze dessen Diskussion und Ressourcen für Entscheidungen und Referenzseiten, die für das gesamte Ergebnis gelten.

![Noch nicht gesendeter Zieldialog im Projekt Aurora mit einem Beispielnamen und der Schaltfläche Ziel erstellen.](/documentation/de/reader-objectives.png)

Halte auf der Zielseite die Umschalttaste gedrückt und klicke auf Ziele, um mehrere auszuwählen; ein Klick auf eine leere Stelle der Liste hebt die Auswahl auf. **Aktionen** in der schwebenden Leiste oder Command+K unter macOS bzw. Strg+K auf anderen Systemen bietet **Status ändern**, **Lead ändern**, **Farbe ändern** und **In den Papierkorb verschieben**, das vorher eine Bestätigung verlangt. **Numo fragen** öffnet Numo mit allen ausgewählten Zielen im Kontext.

### Smart Fill und Smart Assign ein Ziel vervollständigen lassen {#objective-smart-fill}

Wenn Smart Fill für dein Konto eingeschaltet ist, zeigt das Formular **Neues Ziel** wie das Formular für ein neues Ticket die Schaltfläche **Smart Fill**; **Erstellte Ziele ausfüllen** unter **Kontoeinstellungen** → **Smart Fill** bestimmt, ob sie eingeschaltet startet. Solange sie eingeschaltet ist, beschreibst du das Ziel: Smart Fill wählt seine Farbe nach der Bedeutung der Farben, legt das Zieldatum fest, wenn Name oder Beschreibung eines nennen, etwa „Auslieferung Ende Januar“, mit Uhrzeit, wenn der Text eine nennt, etwa „30. November um 19:30 Uhr“, und schreibt mit eingeschaltetem **Fehlende Namen schreiben** einen kurzen Namen, wenn du den Namen leer lässt. Farbe und Zieldatum verschwinden aus der Formularzeile. Um einen Wert selbst festzulegen, öffne den Pfeil neben der Schaltfläche und wähle ihn aus; **Titel** im selben Menü holt das Namensfeld zurück. Am Computer öffnet Befehl/Strg+Umschalt+F dieses Menü. Smart Fill füllt nur aus, was du leer gelassen hast, setzt nie ein Datum, das der Text nicht nennt, und überlässt dir den Status. Das Ziel erscheint, sobald es ausgefüllt ist, und seine Aktivität nennt Smart Fill. Der Durchlauf zählt zu deinem Anteil **Automatisierungen**. Ist dein Budget aufgebraucht oder fällt der Anbieter aus, wird das Ziel so erstellt, wie du es geschrieben hast, und nach der ersten Zeile seiner Beschreibung benannt, wenn du den Namen leer gelassen hast. Schaltest du Smart Fill für das Ziel aus, kehren alle Felder zurück. Aus einem Briefing erstellte Ziele werden nicht ausgefüllt.

Wenn Smart Assign im Projekt eingeschaltet ist, zeigen die Lead-Auswahlen **Smart Assign** anstelle eines leeren Leads: im Erstellungsformular, im Zielbereich, im Menü des Ziels in der Liste und unter **Lead ändern**. Ein ohne Lead erstelltes Ziel erhält einen: das Mitglied, dessen zugewiesene Tickets Name und Beschreibung des Ziels am nächsten sind, oder den Projektinhaber, wenn kein solches Ticket existiert. Wählst du **Smart Assign** für ein bestehendes Ziel, wird sein Lead entfernt und Smart Assign wählt erneut. Ziele mit **Erledigt** und **Abgebrochen** behalten **Kein Lead**. Die Aktivität nennt Smart Assign. Die Suche nach den nächsten Tickets zählt zum Anteil **Automatisierungen** des Projektinhabers und nutzt den Ticketindex, wenn der Inhaber das erlaubt; sonst vergleicht sie Wörter, ohne Kosten.

### Den Fortschritt vor dem Abschluss prüfen {#objective-progress}

Prüfe abgeschlossene und aktive Tickets zusammen mit dem Fortschritt des Ziels. Eine Fortschrittsanzeige fasst zugeordnete Arbeit zusammen; sie kann nicht beurteilen, ob ein Produktergebnis akzeptabel ist. Prüfe fehlende Aufgaben sowie abgebrochene oder doppelte Arbeit, bevor du das Ziel abschließt. Das Board des Ziels zeigt zuerst offene Arbeit: Wähle **Erledigt** und **Abgebrochen** in seinem Filter **Status**, um dort geschlossene Tickets zu prüfen. Auf einem Computer bleibt die Seitenleiste, solange das Board die Tickets eines Ziels zeigt, auf der Liste der Ziele, unter der Zurück-Zeile **Ziele**, mit diesem Ziel hervorgehoben; wähle dort ein anderes Ziel, um das Board darauf umzuschalten.

Unterscheide im Lebenszyklus des Ziels geplante, laufende, abgeschlossene und abgebrochene Ergebnisse. Ein Zieldatum ist ein Vorhaben, eine Prognose eine Schätzung anhand von Aktivität. Erscheint das Ziel leer, prüfe Ticketzuordnung und Ansichtsfilter, statt es neu anzulegen. Das Löschen eines Ziels verwendet den wiederherstellbaren Papierkorb und ist kein gewöhnlicher Statuswechsel.

## Zielabhängigkeiten und Momentum verstehen {#objective-dependencies-and-momentum}

Öffne das Ziel und seine Beziehungen. Auf der Seite des Ziels öffnet R außerhalb eines Textfelds die Auswahl der Beziehungsart. Ist die Art gewählt, wählst du Ticket oder Ziel wie bei einem Ticket in der Befehlspalette. Prüfe, welches Ergebnis von einem anderen abhängt, und lies blockierende Ticketbeziehungen, wenn sie die Einschränkung erklären. Über- und Unterordnung, ein verwandter Link und eine blockierende Abhängigkeit beantworten verschiedene Fragen. Prüfe die Richtung, bevor du eine Beziehung änderst.

Eine blockierende Beziehung kann ein Ticket oder ein anderes Ziel mit diesem Ziel verbinden, innerhalb desselben Projekts. Seine offenen Tickets erben die ungelöste Blockade: Die angezeigte Beziehung nennt sowohl die tatsächliche Voraussetzung als auch das Ziel, das sie weitergibt. Dabei wird nicht an jedem Ticket eine neue direkte Beziehung gespeichert. Das Schließen der Voraussetzung oder des blockierten Ziels sowie das Entfernen eines Tickets aus diesem Ziel beseitigen die jeweilige geerbte Blockade. Erfülle die tatsächliche Voraussetzung oder korrigiere eine überholte Beziehung. Allein die Änderung des Zieldatums schließt blockierende Tickets nicht ab.

### Das Momentum-Signal verstehen {#momentum}

Der Bereich Dynamik erscheint nur, wenn das Ziel ein Zieldatum hat. Wenn du dieses Datum entfernst, werden der Bereich, sein Verlauf, die Tempoangaben und das geschätzte Abschlussdatum ausgeblendet. Füge ein Zieldatum hinzu, um ihn wieder anzuzeigen. Die allgemeine Fortschrittsanzeige bleibt auch ohne Zieldatum verfügbar.

Momentum fasst kürzlich abgeschlossene Arbeit zusammen. Es kann beschleunigend, gleichmäßig, langsamer oder stockend sein; für noch nicht begonnene, abgeschlossene und abgebrochene Ziele gibt es eigene Zustände. Nutze es, um Ergebnisse mit Handlungsbedarf zu erkennen, und lies dann die zugrunde liegenden Tickets und Aktivitäten.

Das geschätzte Abschlussdatum geht von den Personen aus, die die Arbeit erledigen. Für jede Person, der zugeordnete Tickets zugewiesen sind, leitet minddy ihre üblichen Aktivitätszeiten aus den Zeitpunkten ab, zu denen sie Tickets abschließt, misst den Aufwand, den sie über alle ihre Projekte hinweg liefert, und schätzt anhand ihrer jüngsten Abschlüsse und ihrer offenen Arbeit, welcher Anteil dieses Aufwands auf dieses Ziel entfällt. Die Schätzung schreitet nur während dieser Aktivitätszeiten voran: Nächte und Wochenenden bringen keinen Fortschritt, und nicht zugewiesene Arbeit wird auf die Mitwirkenden verteilt. Die Berechnung erfolgt auf dem Server: Tickets anderer Projekte und die Werte einzelner Personen werden nie angezeigt, nur das daraus resultierende Datum. Eine Person zählt, sobald sie in den letzten sechs Wochen mindestens zwei Tickets abgeschlossen hat. Ohne eine solche Person greift die Schätzung auf das eigene Tempo des Ziels zurück, das mindestens zwei Abschlüsse, eine volle beobachtete Woche, positiven gelieferten Aufwand und verbleibende Arbeit voraussetzt. Nur aktuell zugeordnete Tickets zählen zum Momentum; ein Abschluss vor der Erstellung des Ziels erzeugt kein künstliches jüngstes Momentum. Bei einem gültigen Zieldatum reicht der Verlauf von der Erstellung bis zu diesem Datum. Der Durchsatz verwendet die beobachtete Zeit seit der Erstellung, einschließlich der Zeit nach einem verpassten Zieltermin. Wenn ein Zieldatum eingetragen ist, aber keinen gültigen Zeitraum nach der Erstellung definiert, verwendet die Berechnung einen gleitenden Verlauf von acht Wochen und ein Vorhersagefenster von 28 Tagen. Wenig Verlauf oder eine kürzliche Änderung des Umfangs verringern den Nutzen. Die Schätzung ist kein zugesagter Termin und enthält keine noch nicht zugeordnete, unsichtbare Arbeit. Vergleiche Zieldatum, verbleibende Arbeit und tatsächliche Einschränkungen, bevor du Zusagen änderst.


## Ein Ziel für Feedback wählen {#objective-feedback}

In den Zieleigenschaften öffnet die Feedbackzahl den Feedbackbereich des Projekts mit einem Filter für dieses Ziel, einschließlich erledigter Anfragen. Die Zeile ist ausgeblendet, solange keine Anfrage zum Ziel gehört. Feedback bleibt von Ticketfortschritt und Momentum getrennt.

Feedback kann einem Ziel zugeordnet sein, ohne ein Ticket zu werden. Wähle das Ziel in den Eigenschaften einer Rückmeldung unter Feedback im Projekt. Diese Anfragen zählen weder zum Ticketfortschritt noch zur Dynamik. Bei der Umwandlung übernimmt das Ticket Ziel und Kategorien, sofern du sie im Erstellungsformular nicht änderst.

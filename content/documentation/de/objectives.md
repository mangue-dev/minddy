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
  "revision": 8,
  "sourceRevision": 8,
  "owner": "@mangue-dev",
  "updatedAt": "2026-10-10",
  "compatibility": {
    "version": "0.11.1 development (MIN-671)",
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
      "content/documentation/reviews/min-670-feedback-objectives.md"
    ]
  },
  "review": {
    "revision": 8,
    "fact": "agent:/root (MIN-671 target-date condition and retained calculation claims checked against source and render tests; earlier procedural evidence retained); agent:/root (MIN-670 source, de wording and new-control review; existing procedural evidence retained)",
    "language": "agent:/root (de changed-passage review against English revision 7; earlier unchanged prose reviews retained); agent:/root (MIN-670 source, de wording and new-control review; existing procedural evidence retained)",
    "date": "2026-10-10"
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
      "alt": "Noch nicht gesendeter Zieldialog mit einem Beispielnamen.",
      "caption": "Benenne das Ergebnis, bevor du Verantwortung, Zieldatum und Status festlegst. Dieser Dialog hat kein zweites Ziel erstellt.",
      "revision": 8,
      "reviewed": true,
      "capturedAt": "2026-10-08",
      "viewport": [
        720,
        330
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

Öffne den Zielbereich des Projekts und erstelle ein Ziel. Benenne das gewünschte Ergebnis, ergänze hilfreichen Kontext und setze die verfügbaren Felder für verantwortliche Person, Zieldatum, Farbe und Status. Ein Ziel gehört zu einem Projekt und ist von einem persönlichen Zyklus über mehrere Projekte zu unterscheiden. Die verantwortliche Person betreut das Ergebnis; ihre Auswahl überträgt nicht das Eigentum am Projekt.

Öffne jedes passende Problem und wähle das Ziel in seinen Eigenschaften oder verwende die Problemfunktionen des Ziels. Prüfe, ob die vorgesehene Arbeit beim Ziel erscheint. Nutze dessen Diskussion und Ressourcen für Entscheidungen und Referenzseiten, die für das gesamte Ergebnis gelten.

![Noch nicht gesendeter Zieldialog mit einem Beispielnamen.](/documentation/de/reader-objectives.png)

### Den Fortschritt vor dem Abschluss prüfen {#objective-progress}

Prüfe abgeschlossene und aktive Probleme zusammen mit dem Fortschritt des Ziels. Eine Fortschrittsanzeige fasst zugeordnete Arbeit zusammen; sie kann nicht beurteilen, ob ein Produktergebnis akzeptabel ist. Prüfe fehlende Aufgaben sowie abgebrochene oder doppelte Arbeit, bevor du das Ziel abschließt.

Unterscheide im Lebenszyklus des Ziels geplante, laufende, abgeschlossene und abgebrochene Ergebnisse. Ein Zieldatum ist ein Vorhaben, eine Prognose eine Schätzung anhand von Aktivität. Erscheint das Ziel leer, prüfe Problemzuordnung und Ansichtsfilter, statt es neu anzulegen. Das Löschen eines Ziels verwendet den wiederherstellbaren Papierkorb und ist kein gewöhnlicher Statuswechsel.

## Zielabhängigkeiten und Momentum verstehen {#objective-dependencies-and-momentum}

Öffne das Ziel und seine Beziehungen. Prüfe, welches Ergebnis von einem anderen abhängt, und lies blockierende Problembeziehungen, wenn sie die Einschränkung erklären. Über- und Unterordnung, ein verwandter Link und eine blockierende Abhängigkeit beantworten verschiedene Fragen. Prüfe die Richtung, bevor du eine Beziehung änderst.

Eine blockierende Beziehung kann ein Problem oder ein anderes Ziel mit diesem Ziel verbinden, innerhalb desselben Projekts. Seine offenen Probleme erben die ungelöste Blockade: Die angezeigte Beziehung nennt sowohl die tatsächliche Voraussetzung als auch das Ziel, das sie weitergibt. Dabei wird nicht an jedem Problem eine neue direkte Beziehung gespeichert. Das Schließen der Voraussetzung oder des blockierten Ziels sowie das Entfernen eines Problems aus diesem Ziel beseitigen die jeweilige geerbte Blockade. Erfülle die tatsächliche Voraussetzung oder korrigiere eine überholte Beziehung. Allein die Änderung des Zieldatums schließt blockierende Probleme nicht ab.

### Das Momentum-Signal verstehen {#momentum}

Der Bereich Dynamik erscheint nur, wenn das Ziel ein Zieldatum hat. Wenn du dieses Datum entfernst, werden der Bereich, sein Verlauf, die Tempoangaben und das geschätzte Abschlussdatum ausgeblendet. Füge ein Zieldatum hinzu, um ihn wieder anzuzeigen. Die allgemeine Fortschrittsanzeige bleibt auch ohne Zieldatum verfügbar.

Momentum fasst kürzlich abgeschlossene Arbeit zusammen. Es kann beschleunigend, gleichmäßig, langsamer oder stockend sein; für noch nicht begonnene, abgeschlossene und abgebrochene Ziele gibt es eigene Zustände. Nutze es, um Ergebnisse mit Handlungsbedarf zu erkennen, und lies dann die zugrunde liegenden Probleme und Aktivitäten.

Ein geschätztes Abschlussdatum setzt mindestens zwei Abschlüsse, eine volle beobachtete Woche, positiven gelieferten Aufwand und verbleibende Arbeit voraus. Nur aktuell zugeordnete Probleme zählen; ein Abschluss vor der Erstellung des Ziels erzeugt kein künstliches jüngstes Momentum. Bei einem gültigen Zieldatum reicht der Verlauf von der Erstellung bis zu diesem Datum. Der Durchsatz verwendet die beobachtete Zeit seit der Erstellung, einschließlich der Zeit nach einem verpassten Zieltermin. Wenn ein Zieldatum eingetragen ist, aber keinen gültigen Zeitraum nach der Erstellung definiert, verwendet die Berechnung einen gleitenden Verlauf von acht Wochen und ein Vorhersagefenster von 28 Tagen. Wenig Verlauf oder eine kürzliche Änderung des Umfangs verringern den Nutzen. Die Schätzung ist kein zugesagter Termin und enthält keine noch nicht zugeordnete, unsichtbare Arbeit. Vergleiche Zieldatum, verbleibende Arbeit und tatsächliche Einschränkungen, bevor du Zusagen änderst.


## Ein Ziel für Feedback wählen {#objective-feedback}

Feedback kann einem Ziel zugeordnet sein, ohne ein Ticket zu werden. Wählen Sie das Ziel in den Eigenschaften einer Rückmeldung unter Feedback im Projekt. Die Zielansicht zeigt verknüpfte Rückmeldungen, Stimmen und öffentlichen Status; wählen Sie eine Rückmeldung, um ihre Diskussion zu lesen. Diese Anfragen zählen weder zum Ticketfortschritt noch zur Dynamik. Bei der Umwandlung übernimmt das Ticket Ziel und Kategorien, sofern Sie sie im Erstellungsformular nicht ändern.

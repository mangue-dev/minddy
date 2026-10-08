---
{
  "id": "objective-dependencies-and-momentum",
  "locale": "de",
  "title": "Zielabhängigkeiten und Momentum verstehen",
  "summary": "Lies Blockaden und Aktivitätssignale, ohne Schätzungen als Liefergarantien zu behandeln.",
  "topic": "Projekte und Probleme",
  "type": "explanation",
  "audiences": [
    "member"
  ],
  "workflows": [
    "W11"
  ],
  "visibility": "public",
  "status": "published",
  "revision": 4,
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
      "components/objective-relations-section.tsx",
      "components/objective-momentum.tsx",
      "content/knowledge/core-tracker.md",
      "lib/relation-constants.ts",
      "lib/server/issue-relations.ts",
      "lib/objective-momentum.ts"
    ]
  },
  "review": {
    "revision": 4,
    "fact": "2026-10-08",
    "language": "2026-10-08",
    "date": "2026-10-08"
  },
  "related": [
    "objectives",
    "issue-dependencies",
    "personal-statistics"
  ],
  "aliases": [],
  "tags": [],
  "figures": [
    {
      "id": "objective-dependencies-and-momentum-steps",
      "kind": "screenshot",
      "src": "/documentation/de/reader-objective-momentum.png",
      "alt": "Zieldynamik nach einem tatsächlich abgeschlossenen Demo-Ticket.",
      "caption": "Lies die Dynamik zusammen mit der verknüpften Arbeit. Die verfügbare Historie reicht für ein geschätztes Abschlussdatum noch nicht aus.",
      "revision": 4,
      "reviewed": true,
      "capturedAt": "2026-10-08",
      "viewport": [
        1280,
        1080
      ],
      "theme": "light"
    }
  ],
  "requiredFigures": [
    "objective-dependencies-and-momentum-steps"
  ]
}
---

## Beziehungen und Blockaden prüfen {#objective-dependencies-and-momentum}

Öffne das Ziel und seine Beziehungen. Prüfe, welches Ergebnis von einem anderen abhängt, und lies blockierende Problembeziehungen, wenn sie die Einschränkung erklären. Über- und Unterordnung, ein verwandter Link und eine blockierende Abhängigkeit beantworten verschiedene Fragen. Prüfe die Richtung, bevor du eine Beziehung änderst.

Eine blockierende Beziehung kann ein Problem oder ein anderes Ziel mit diesem Ziel verbinden, innerhalb desselben Projekts. Seine offenen Probleme erben die ungelöste Blockade: Die angezeigte Beziehung nennt sowohl die tatsächliche Voraussetzung als auch das Ziel, das sie weitergibt. Dabei wird nicht an jedem Problem eine neue direkte Beziehung gespeichert. Das Schließen der Voraussetzung oder des blockierten Ziels sowie das Entfernen eines Problems aus diesem Ziel beseitigen die jeweilige geerbte Blockade. Erfülle die tatsächliche Voraussetzung oder korrigiere eine überholte Beziehung. Allein die Änderung des Zieldatums schließt blockierende Probleme nicht ab.

## Das Momentum-Signal verstehen {#momentum}

Momentum fasst kürzlich abgeschlossene Arbeit zusammen. Es kann beschleunigend, gleichmäßig, langsamer oder stockend sein; für noch nicht begonnene, abgeschlossene und abgebrochene Ziele gibt es eigene Zustände. Nutze es, um Ergebnisse mit Handlungsbedarf zu erkennen, und lies dann die zugrunde liegenden Probleme und Aktivitäten.

Ein geschätztes Abschlussdatum setzt mindestens zwei Abschlüsse, eine volle beobachtete Woche, positiven gelieferten Aufwand und verbleibende Arbeit voraus. Nur aktuell zugeordnete Probleme zählen; ein Abschluss vor der Erstellung des Ziels erzeugt kein künstliches jüngstes Momentum. Bei einem gültigen Zieldatum reicht der Verlauf von der Erstellung bis zu diesem Datum. Der Durchsatz verwendet die beobachtete Zeit seit der Erstellung, einschließlich der Zeit nach einem verpassten Zieltermin. Ohne gültigen Zieltermin verwendet die Berechnung einen gleitenden Verlauf von acht Wochen und ein Vorhersagefenster von 28 Tagen. Wenig Verlauf oder eine kürzliche Änderung des Umfangs verringern den Nutzen. Die Schätzung ist kein zugesagter Termin und enthält keine noch nicht zugeordnete, unsichtbare Arbeit. Vergleiche Zieldatum, verbleibende Arbeit und tatsächliche Einschränkungen, bevor du Zusagen änderst.

![Zieldynamik nach einem tatsächlich abgeschlossenen Demo-Ticket.](/documentation/de/reader-objective-momentum.png)

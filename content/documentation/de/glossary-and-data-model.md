---
{
  "id": "glossary-and-data-model",
  "locale": "de",
  "title": "Glossar und Datenmodell",
  "summary": "Ein Projekt ist der gemeinsame Bereich für Mitglieder, Tickets, Kategorien, gespeicherte Ansichten, Seiten, Integrationen und Feedbackboard.",
  "topic": "Technische Grundlagen",
  "type": "explanation",
  "audiences": [
    "member",
    "integrator"
  ],
  "workflows": [
    "T01"
  ],
  "visibility": "public",
  "status": "published",
  "revision": 2,
  "sourceRevision": 2,
  "owner": "@mangue-dev",
  "updatedAt": "2026-10-09",
  "compatibility": {
    "version": "0.11.1 candidate (89ebb59a5)",
    "editions": [
      "Cloud",
      "self-hosted"
    ],
    "profiles": [
      "web",
      "desktop",
      "mobile",
      "full",
      "managed"
    ],
    "evidence": [
      "content/knowledge/core-tracker.md",
      "content/knowledge/productivity.md",
      "content/knowledge/pages.md",
      "content/knowledge/feedback.md"
    ]
  },
  "review": {
    "revision": 2,
    "fact": "agent:/root/german_spanish_review (structural consolidation review; prior procedural evidence retained; no operational rerun)",
    "language": "agent:/root/german_spanish_review (de title, summary, lead and heading review; retained body comparison)",
    "date": "2026-10-09"
  },
  "related": [
    "permissions-and-public-links",
    "numo"
  ],
  "aliases": [],
  "tags": [
    "Projekte, Tickets, Ziele und persönliche Arbeit verstehen"
  ],
  "figures": [
    {
      "id": "glossary-and-data-model-flow",
      "kind": "diagram",
      "src": "/documentation/de/glossary-and-data-model-flow.svg",
      "alt": "Diagramm: Projekt: gemeinsame Arbeit und Wissen. Ticket: Arbeit; Ziel: Ergebnis. Persönlicher Zyklus: projektübergreifende Arbeit. Seite: dauerhafter Kontext; Feedback: Bedarf.",
      "caption": "Diese Komponenten haben unterschiedliche Aufgaben. Projekt: gemeinsame Arbeit und Wissen. Ticket: Arbeit; Ziel: Ergebnis. Persönlicher Zyklus: projektübergreifende Arbeit. Seite: dauerhafter Kontext; Feedback: Bedarf.",
      "revision": 2,
      "reviewed": true,
      "capturedAt": "2026-10-08",
      "viewport": [
        720,
        640
      ],
      "theme": "neutral"
    }
  ],
  "requiredFigures": [
    "glossary-and-data-model-flow"
  ]
}
---

## Projekte, Tickets, Ziele und persönliche Arbeit verstehen {#glossary-and-data-model}

Ein Projekt ist der gemeinsame Bereich für Mitglieder, Tickets, Kategorien, gespeicherte Ansichten, Seiten, Integrationen und Feedbackboard. Ein Ticket ist eine Arbeitseinheit mit Status, Zuständigkeit und optional Plan, Frist, Ziel, Kategorien, Beziehungen, Kommentaren und Ressourcen. Ein Ziel bündelt Projekttickets um ein Ergebnis und verfolgt Fortschritt. Ein persönlicher Zyklus wählt wöchentliche oder zweiwöchentliche Arbeit eines Nutzers projektübergreifend. Er ist weder gemeinsamer Sprint noch Projektziel.


![Diagramm: Projekt: gemeinsame Arbeit und Wissen. Ticket: Arbeit; Ziel: Ergebnis. Persönlicher Zyklus: projektübergreifende Arbeit. Seite: dauerhafter Kontext; Feedback: Bedarf.](/documentation/de/glossary-and-data-model-flow.svg)

## Wissen und Anfragen unterscheiden {#knowledge-and-feedback}

Eine Seite bewahrt dauerhaft Kontext wie Spezifikation, Entscheidung oder Ablauf mit Unterseiten, Dateien und Diskussion. Eine Seitendatenbank enthält Eigenschaften; jeder Eintrag ist eine vollständige Seite. Feedback beschreibt einen Nutzerbedarf mit Stimmen und öffentlichem Status getrennt vom internen Ticket. Ein verknüpfter Beitrag folgt dem Ticketstatus. Gespeicherte Ansichten filtern und sortieren Tickets ohne Änderung. Das Aufgabenheft enthält private Notizen und Checkboxen; wandeln Sie einen Punkt um, wenn das Projekt ihn verfolgen soll.

## Mit einem Beispiel überprüfen {#example}

Legen Sie für eine Release ein Projektziel an, dokumentieren Sie die Entscheidung auf einer Seite und hängen Sie diese an Umsetzungstickets. Mitglieder können ausgewählte Tickets in ihren persönlichen Zyklus aufnehmen. Kundenfeedback kann verknüpft werden, ohne private Ticketdiskussion zu veröffentlichen. Eine Routine startet eine neue geplante Numo-Konversation mit Projektkontext, kein wiederkehrendes Ticket und keinen Auslöser bei jeder Projektänderung. Bewahren Sie bei Integrationen IDs und Eigentum: verwandter Kontext bedeutet nicht gleiche Zugriffsrechte.

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
  "revision": 3,
  "sourceRevision": 3,
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
      "content/knowledge/feedback.md",
      "content/documentation/reviews/editorial-clarity-en-fr-2026-10-09.md",
      "content/documentation/reviews/editorial-clarity-de-es-2026-10-09.md",
      "content/documentation/reviews/editorial-clarity-it-pt-BR-2026-10-09.md"
    ]
  },
  "review": {
    "revision": 3,
    "fact": "agent:/root/german_spanish_review (structural consolidation review; prior procedural evidence retained; no operational rerun); agent:/root (visual usefulness, figure framing and preserved procedures; previous operational evidence retained)",
    "language": "agent:/root/german_spanish_review (de title, summary, lead and heading review; retained body comparison); agent:/root/editorial_de_es (editorial clarity pass); agent:/root (figure removals and captions); agent:/root/editorial_de_es (collection-caption clarity)",
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
      "caption": "Die Objekte verbinden Aufgaben, Ergebnisse und dauerhaften Kontext, während der persönliche Zyklus die eigene Arbeit über Projekte hinweg ordnet.",
      "revision": 3,
      "reviewed": true,
      "capturedAt": "2026-10-08",
      "viewport": [
        720,
        640
      ],
      "theme": "neutral",
      "diagram": {
        "layout": "collection",
        "items": [
          {
            "title": "Projekt: gemeinsame Arbeit und Wissen"
          },
          {
            "title": "Ticket: Arbeit; Ziel: Ergebnis"
          },
          {
            "title": "Persönlicher Zyklus: projektübergreifende Arbeit"
          },
          {
            "title": "Seite: dauerhafter Kontext; Feedback: Bedarf"
          }
        ]
      }
    }
  ],
  "requiredFigures": [
    "glossary-and-data-model-flow"
  ]
}
---

## Projekte, Tickets, Ziele und persönliche Arbeit verstehen {#glossary-and-data-model}

| Begriff | Bedeutung |
| --- | --- |
| Projekt | Gemeinsamer Bereich für Mitglieder, Tickets, Kategorien, gespeicherte Ansichten, Seiten, Integrationen und das Feedbackboard. |
| Ticket | Arbeitseinheit mit Status und Zuständigkeit. Optional gehören Plan, Frist, Ziel, Kategorien, Beziehungen, Kommentare und Ressourcen dazu. |
| Ziel | Bündelt Projekttickets um ein Ergebnis und verfolgt dessen Fortschritt. |
| Persönlicher Zyklus | Wählt die Arbeit eines Nutzers für eine oder zwei Wochen aus, auch über mehrere Projekte hinweg. Er ist weder ein gemeinsamer Sprint noch ein Projektziel. |

![Diagramm: Projekt: gemeinsame Arbeit und Wissen. Ticket: Arbeit; Ziel: Ergebnis. Persönlicher Zyklus: projektübergreifende Arbeit. Seite: dauerhafter Kontext; Feedback: Bedarf.](/documentation/de/glossary-and-data-model-flow.svg)

## Wissen und Anfragen unterscheiden {#knowledge-and-feedback}

Eine Seite bewahrt dauerhaft Kontext wie Spezifikation, Entscheidung oder Ablauf mit Unterseiten, Dateien und Diskussion. Eine Seitendatenbank enthält Eigenschaften; jeder Eintrag ist eine vollständige Seite. Feedback beschreibt einen Nutzerbedarf mit Stimmen und öffentlichem Status getrennt vom internen Ticket. Ein verknüpfter Beitrag folgt dem Ticketstatus. Gespeicherte Ansichten filtern und sortieren Tickets ohne Änderung. Das Aufgabenheft enthält private Notizen und Checkboxen; wandeln Sie einen Punkt um, wenn das Projekt ihn verfolgen soll.

## Mit einem Beispiel überprüfen {#example}

Legen Sie für eine Veröffentlichung ein Projektziel an, dokumentieren Sie die Entscheidung auf einer Seite und hängen Sie diese an Umsetzungstickets. Mitglieder können ausgewählte Tickets in ihren persönlichen Zyklus aufnehmen. Kundenfeedback kann verknüpft werden, ohne private Ticketdiskussion zu veröffentlichen. Eine Routine startet eine neue geplante Numo-Konversation mit Projektkontext. Sie erstellt kein wiederkehrendes Ticket und wird nicht bei jeder Projektänderung ausgelöst. Bewahren Sie bei Integrationen IDs und Eigentum: verwandter Kontext bedeutet nicht gleiche Zugriffsrechte.

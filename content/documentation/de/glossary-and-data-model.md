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
  "revision": 5,
  "sourceRevision": 5,
  "owner": "@mangue-dev",
  "updatedAt": "2026-10-20",
  "compatibility": {
    "version": "0.20.0 (MIN-747 release review)",
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
      "docs/security/project-roles.md",
      "lib/project-roles.ts"
    ]
  },
  "review": {
    "revision": 5,
    "fact": "agent:/root/min747 (0.20.0 release review: source audit against the v0.11.0..main delta, verified corrections applied; no screenshot in scope; no browser walkthrough of the procedures or operator rehearsal; earlier evidence retained in git history)",
    "language": "agent:/root/min747 (de translation of the release corrections with catalog UI labels; equivalent meaning self-reviewed; agent review, not human acceptance)",
    "date": "2026-10-20"
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
      "revision": 5,
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
| Projekt | Gemeinsamer Bereich für Mitglieder, Tickets, Kategorien, gespeicherte Ansichten, Seiten, Integrationen und das Feedbackboard. Jede Person darin hat eine Rolle: ein Eigentümer, Mitglieder, die an den Inhalten arbeiten, und Leser, die sie verfolgen. |
| Ticket | Arbeitseinheit mit Status und Zuständigkeit. Optional gehören Plan, Frist, Ziel, Kategorien, Beziehungen, Kommentare und Ressourcen dazu. |
| Ziel | Bündelt Projekttickets um ein Ergebnis und verfolgt dessen Fortschritt. |
| Persönlicher Zyklus | Wählt die Arbeit eines Nutzers für eine oder zwei Wochen aus, auch über mehrere Projekte hinweg. Er ist weder ein gemeinsamer Sprint noch ein Projektziel. |

![Diagramm: Projekt: gemeinsame Arbeit und Wissen. Ticket: Arbeit; Ziel: Ergebnis. Persönlicher Zyklus: projektübergreifende Arbeit. Seite: dauerhafter Kontext; Feedback: Bedarf.](/documentation/de/glossary-and-data-model-flow.svg)

## Wissen und Anfragen unterscheiden {#knowledge-and-feedback}

Eine Seite bewahrt dauerhaft Kontext wie Spezifikation, Entscheidung oder Ablauf mit Unterseiten, Dateien und Diskussion. Eine Seitendatenbank enthält Eigenschaften; jeder Eintrag ist eine vollständige Seite. Feedback beschreibt einen Nutzerbedarf mit Stimmen und öffentlichem Status getrennt vom internen Ticket. Ein verknüpfter Beitrag folgt dem Ticketstatus. Gespeicherte Ansichten filtern und sortieren Tickets ohne Änderung. Das Aufgabenheft enthält private Notizen und Checkboxen; wandeln Sie einen Punkt um, wenn das Projekt ihn verfolgen soll.

## Mit einem Beispiel überprüfen {#example}

Legen Sie für eine Veröffentlichung ein Projektziel an, dokumentieren Sie die Entscheidung auf einer Seite und hängen Sie diese an Umsetzungstickets. Mitglieder können ausgewählte Tickets in ihren persönlichen Zyklus aufnehmen. Kundenfeedback kann verknüpft werden, ohne private Ticketdiskussion zu veröffentlichen. Eine Routine startet eine neue Numo-Konversation mit Projektkontext nach Zeitplan oder wenn ein gewähltes Ereignis ihre Bedingungen erfüllt, etwa wenn ein Ticket einen Status erreicht oder ein neuer Datenbankeintrag entsteht. Sie ist kein wiederkehrendes Ticket und ändert keinen Repository-Code. Bewahren Sie bei Integrationen IDs und Eigentum: verwandter Kontext bedeutet nicht gleiche Zugriffsrechte.

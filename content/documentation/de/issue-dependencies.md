---
{
  "id": "issue-dependencies",
  "locale": "de",
  "title": "Abhängigkeiten und verwandte Probleme verknüpfen",
  "summary": "Drücke aus, welche Arbeit eine andere Aufgabe blockiert, und unterscheide Beziehungen von Hierarchie.",
  "topic": "Projekte und Probleme",
  "type": "guide",
  "audiences": [
    "member"
  ],
  "workflows": [
    "W05"
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
      "content/knowledge/core-tracker.md",
      "components/issue-side-panel.tsx",
      "components/issue-indicators.tsx",
      "captures/shots/relations/intent.md",
      "lib/server/issue-relations.ts",
      "lib/relation-constants.ts"
    ]
  },
  "review": {
    "revision": 4,
    "fact": "2026-10-08",
    "language": "2026-10-08",
    "date": "2026-10-08"
  },
  "related": [
    "sub-issues",
    "issue-statuses",
    "objective-dependencies-and-momentum"
  ],
  "aliases": [],
  "tags": [],
  "figures": [
    {
      "id": "issue-dependencies-steps",
      "kind": "screenshot",
      "src": "/documentation/de/work-dependencies.png",
      "alt": "Suche nach einem blockierenden Ticket anhand seiner Kennung.",
      "caption": "Wähle zuerst die Richtung der Beziehung und dann ihr Ziel. Hier wurde keine Beziehung gespeichert.",
      "revision": 4,
      "reviewed": true,
      "capturedAt": "2026-10-08",
      "viewport": [
        1440,
        1080
      ],
      "theme": "light"
    }
  ],
  "requiredFigures": [
    "issue-dependencies-steps"
  ]
}
---

## Beziehung und Richtung wählen {#issue-dependencies}

Öffne die Beziehungsfunktionen eines Problems und suche das andere anhand von Titel oder Kennung. Wähle eine blockierende Beziehung, wenn eine Aufgabe abgeschlossen sein muss, bevor eine andere weitergehen kann. Blockiert A das Problem B, ist A die Voraussetzung und B wird von A blockiert. Eine verwandte Beziehung ergänzt Kontext ohne diese Reihenfolge vorzugeben.

Lies beide Kennungen und die angezeigte Richtung vor der Bestätigung. Beispielsweise blockiert „Endpunkt vorbereiten“ die Aufgabe „Client verbinden“, nicht umgekehrt. Eine Abhängigkeit macht keines der Probleme zu einem Unterproblem. Eine Eltern-Kind-Beziehung ersetzt keine blockierende Beziehung.

![Suche nach einem blockierenden Ticket anhand seiner Kennung.](/documentation/de/work-dependencies.png)

## Aufgelöste und geerbte Blockaden {#blocker-state}

Die Abschlusszustände Fertig, Abgebrochen und Duplikat beenden die blockierende Wirkung eines Problems. Beziehungen verbinden Probleme oder Ziele innerhalb desselben Projekts; beide Endpunkte müssen dort zugänglich sein. Sie verknüpfen keine beliebigen privaten Arbeiten über Projektgrenzen hinweg und veröffentlichen keinen der Endpunkte.

Ein offenes Problem kann über sein offenes Ziel eine Blockade erben. Wenn A das Ziel B blockiert, zeigen offene Probleme in B den Eintrag A als geerbte Blockade, auch ohne direkte Beziehung von A zum Problem. Die Anzeige nennt die tatsächliche Voraussetzung und das Ziel, über das die Blockade vererbt wird. Prüfe diese Zielbeziehung, bevor du versuchst, sie am Problem zu entfernen. Wird A oder B geschlossen oder das Problem aus B entfernt, entfällt die geerbte Blockade. Dieser Mechanismus folgt der Zielzuordnung und nicht der Hierarchie zwischen über- und untergeordneten Problemen.

Entferne eine Beziehung über ihre Steuerelemente, wenn sie nicht mehr zutrifft, und prüfe anschließend sowohl die Beschriftung als auch die Blockadeanzeige. Das Markieren eines Duplikats beeinflusst den Lebenszyklus und verweist auf die beibehaltene Arbeit. Verwende es für doppelte Aufgaben, statt eine normale verwandte Beziehung anzulegen und anzunehmen, diese würde das Duplikat schließen.

Findet die Beziehungsauswahl ein Problem nicht, prüfe Projektzugriff und Kennung. Lege keine Inhalte eines anderen Projekts offen, indem du eine private Problem-URL in eine öffentliche Feedback-Antwort kopierst.

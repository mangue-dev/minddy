---
{
  "id": "recover-numo-work",
  "locale": "de",
  "title": "Gestoppte oder wartende Numo-Arbeit fortsetzen",
  "summary": "Den Abbruchgrund erkennen und gespeicherte Ergebnisse vor der Fortsetzung prüfen.",
  "topic": "Numo und Integrationen",
  "type": "troubleshooting",
  "audiences": [
    "member"
  ],
  "workflows": [
    "N05"
  ],
  "visibility": "public",
  "status": "published",
  "revision": 1,
  "sourceRevision": 1,
  "owner": "@mangue-dev",
  "updatedAt": "2026-10-08",
  "compatibility": {
    "version": "0.11.1 candidate (cd1843e12)",
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
      "components/assistant/usage-exhausted-card.tsx",
      "components/assistant/ask-user-card.tsx",
      "docs/architecture/numo-durable-turns.md"
    ]
  },
  "review": {
    "revision": 1,
    "fact": "2026-10-08",
    "language": "2026-10-08",
    "date": "2026-10-08"
  },
  "related": [],
  "aliases": [],
  "tags": [],
  "figures": [
    {
      "id": "recover-numo-work-workflow",
      "kind": "screenshot",
      "src": "/documentation/de/recover-numo-work-workflow.png",
      "alt": "Numo-Antwort mit lokalem Code und Tests, fehlgeschlagenem Branch-Push und noch nicht erstelltem Pull Request.",
      "caption": "Anfängliches Teilergebnis eines tatsächlich ausgeführten Demonstrationslaufs, für die Anzeige lokalisiert. Zu diesem Zeitpunkt schlug der Push fehl und es gab noch keinen PR. Prüfen Sie gespeicherten Branch und externe Dienste vor der Fortsetzung; später wurde die Arbeit im Gespräch wiederaufgenommen und der PR korrigiert.",
      "revision": 1,
      "reviewed": true,
      "capturedAt": "2026-10-08",
      "viewport": [
        1480,
        1100
      ],
      "theme": "light"
    }
  ],
  "requiredFigures": [
    "recover-numo-work-workflow"
  ]
}
---

## Den letzten Zustand lesen {#recover-numo-work}
Öffnen Sie das bestehende Gespräch und lesen Sie letzte Nachrichten und Worker-Karte. Unterscheiden Sie ausstehende Eingaben, Kontobudget, Routinenlimit, ausgeschöpfte Operationszuteilung und technische Fehler. Ein geschlossenes Panel beweist keinen Arbeitsabbruch.

Beantworten Sie auf einer aktiven Fragekarte alle erforderlichen Fragen und senden Sie die Antworten gemeinsam. Frühere Karten sind Aufzeichnungen ohne neue Eingabefunktion. Überspringen ersetzt keine fehlenden Informationen und erlaubt keine davon abhängigen Änderungen.

## Budget und Fehler {#recovery}
Die Kontolimit-Karte zeigt gegebenenfalls das Rücksetzdatum sowie Tarif- oder Schlüsseloptionen. Die Routinenkarte führt zur Verwaltung; prüfen Sie das Limit pro Durchlauf. Eine Operationszuteilung betrifft diese Operation. Wiederholen hebt das Limit nicht auf. Eigene Modellschlüssel machen Sandbox-Rechenleistung nicht kostenlos.

Ein fehlgeschlagener Lauf kann nur mit einem erhaltenen Checkpoint fortgesetzt werden. Prüfen Sie Ticketänderungen, Branch, PR und externe Dienste vor dem Wiederholen: Eine Schreibaktion kann trotz verlorener Antwort erfolgreich gewesen sein. Beschreiben Sie den Rest und bitten Sie um Fortsetzung. Ohne nutzbaren Checkpoint übergeben Sie den geprüften Zustand in einem neuen Auftrag. Melden Sie anhaltende Fehler mit Gesprächsbezug, aber ohne Zugangsdaten.

![Numo-Antwort mit lokalem Code und Tests, fehlgeschlagenem Branch-Push und noch nicht erstelltem Pull Request.](/documentation/de/recover-numo-work-workflow.png)

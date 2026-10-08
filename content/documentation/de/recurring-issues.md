---
{
  "id": "recurring-issues",
  "locale": "de",
  "title": "Ein Problem nach Abschluss wiederholen",
  "summary": "Richte wiederkehrende Arbeit ein und unterscheide sie von einer geplanten Numo-Anfrage.",
  "topic": "Projekte und Probleme",
  "type": "guide",
  "audiences": [
    "owner"
  ],
  "workflows": [
    "W09"
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
      "components/settings/project-recurrences-section.tsx",
      "content/knowledge/core-tracker.md",
      "lib/server/recurrence.ts"
    ]
  },
  "review": {
    "revision": 4,
    "fact": "2026-10-08",
    "language": "2026-10-08",
    "date": "2026-10-08"
  },
  "related": [
    "create-an-issue",
    "scheduled-routines",
    "project-settings"
  ],
  "aliases": [],
  "tags": [],
  "figures": [
    {
      "id": "recurring-issues-steps",
      "kind": "screenshot",
      "src": "/documentation/de/issue-date-recurrence.png",
      "alt": "Fälligkeitsauswahl im wiederkehrenden Modus mit Sonntagsvorschau und optionaler Uhrzeit.",
      "caption": "Der wiederkehrende Modus zeigt die wöchentliche Folge. Bestätige die erste Fälligkeit vor der Ticketerstellung.",
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
    "recurring-issues-steps"
  ]
}
---

## Die wiederholte Aufgabe einrichten {#recurring-issues}

Erstelle oder öffne ein Problem, das bei jeder Wiederholung sinnvoll bleibt, etwa eine regelmäßige Prüfung der Abhängigkeiten. Setze ein Fälligkeitsdatum und wähle in der Datumsfunktion eine tägliche, wöchentliche, monatliche oder jährliche Wiederholung. Eine Wiederholung ohne Fälligkeitsdatum wird abgewiesen. Prüfe Eigenschaften und zuständige Person vor dem Speichern. Die Wiederholungseinstellungen des Projekts zeigen aktive Serien; dort kannst du den Rhythmus ändern oder die Wiederholung stoppen.

Wiederkehrende Probleme erzeugen sich nach dem Abschluss als „Fertig“ neu; das nächste Problem entsteht im Rückstand. Prüfe nach dem Abschließen Kennung und Eigenschaften des nächsten Problems.

Der nächste Fälligkeitstermin ergibt sich aus dem bisherigen Fälligkeitsdatum plus einem Wiederholungsintervall, nicht aus dem Tag des Abschlusses. Das Nachfolgeproblem übernimmt Titel, Beschreibung, Priorität, Aufwand, zuständige Person, Ziel und Kategorien. Umsetzungsplan, übergeordnete Beziehung, Ressourcen und Kommentare werden nicht übernommen. Die Wiederholung geht auf das Nachfolgeproblem über; das erneute Öffnen und Abschließen des alten Problems erzeugt keine weitere Wiederholung. Scheitert die Erstellung des Nachfolgeproblems, stoppt die Serie, statt am abgeschlossenen Problem wiederholt neue Versuche auszuführen. Prüfe das Ergebnis und richte nach Behebung des Fehlers die Wiederholung an der passenden nächsten Aufgabe ein. Gehe nicht davon aus, dass ein Kalenderplan Code ausführt oder das neue Problem für dich erledigt.


![Fälligkeitsauswahl im wiederkehrenden Modus mit Sonntagsvorschau und optionaler Uhrzeit.](/documentation/de/issue-date-recurrence.png)

## Die Wiederholung ändern oder stoppen {#recurrence-change}

Bearbeite oder deaktiviere künftige Wiederholungen in den Wiederholungseinstellungen. Prüfe bereits erstellte Probleme gesondert: Das Stoppen weiterer Erstellung bedeutet nicht, dass bestehende Arbeit abgeschlossen oder entfernt wurde.

Eine Numo-Routine ist ein anderes Objekt: Sie plant ein Gespräch und kann das KI-Budget des Eigentümers und eingerichtete Anbieter verwenden. Wähle wiederkehrende Probleme für eine wiederholte nachverfolgte Aufgabe und eine Routine für Anweisungen, die nach Zeitplan ausgeführt werden sollen. Fehlt das nächste Problem, prüfe, ob das vorherige als fertig markiert wurde, die Wiederholung noch aktiv ist und du den Rückstand ohne einschränkende Filter ansiehst.

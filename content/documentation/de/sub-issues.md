---
{
  "id": "sub-issues",
  "locale": "de",
  "title": "Ein Problem in Unterprobleme aufteilen",
  "summary": "Verfolge kleinere Aufgaben unter einem übergeordneten Problem und löse ein Unterproblem, ohne es zu löschen.",
  "topic": "Projekte und Probleme",
  "type": "guide",
  "audiences": [
    "member"
  ],
  "workflows": [
    "W06"
  ],
  "visibility": "public",
  "status": "published",
  "revision": 2,
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
      "components/issue-parent-menu.tsx",
      "components/issue-family-banner.tsx",
      "lib/server/create-issue.ts",
      "lib/server/update-issue.ts"
    ]
  },
  "review": {
    "revision": 2,
    "fact": "2026-10-08",
    "language": "2026-10-08",
    "date": "2026-10-08"
  },
  "related": [
    "create-an-issue",
    "issue-dependencies",
    "implementation-plans"
  ],
  "aliases": [],
  "tags": [],
  "figures": [
    {
      "id": "sub-issues-steps",
      "kind": "screenshot",
      "src": "/documentation/de/work-sub-issues.png",
      "alt": "Eingabefeld für ein Unterticket in einem Demo-Elternticket.",
      "caption": "Das Feld erstellt ein Kind dieses Elterntickets; jedes Kind behält seinen eigenen Status und Diskussionsverlauf.",
      "revision": 2,
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
    "sub-issues-steps"
  ]
}
---

## Die Hierarchie aufbauen {#sub-issues}

Öffne das übergeordnete Problem und verwende seine Unterproblem-Funktionen, um kleinere Arbeitsschritte zu erstellen. Gib jedem Unterproblem ein eigenes Ergebnis. Prüfe nach der Erstellung sein Projekt, seine Eigenschaften und die Kennung des übergeordneten Problems. Die Hierarchie soll die Nachverfolgung erleichtern, nicht die Beschreibung der Ergebnisse jedes Unterproblems ersetzen.

Die Hierarchie erlaubt eine Ebene: Das übergeordnete Problem muss ein Problem der obersten Ebene im selben Projekt sein, und ein Unterproblem kann selbst keine Unterprobleme haben. Wird bei der Erstellung kein Ziel ausdrücklich gewählt, übernimmt das Unterproblem das Ziel seines übergeordneten Problems. Prüfe die entstandenen Eigenschaften, statt anzunehmen, dass spätere Änderungen am übergeordneten Problem automatisch übertragen werden.

Ein Unterproblem bleibt ein Problem mit eigenem Status und eigener Diskussion. Die Fortschrittsanzeige des übergeordneten Problems gewichtet den Aufwand der Unterprobleme und den ihrem Status zugeordneten Abschlussanteil. Der Zähler für abgeschlossene und insgesamt vorhandene Unterprobleme in der Liste ist dagegen eine einfache Anzahl. Lies die Zustände der Unterprobleme zusammen mit beiden Werten. Verwende eine Abhängigkeit für „muss vorher fertig sein“ und ein übergeordnetes Problem für „Teil dieser größeren Aufgabe“.

![Eingabefeld für ein Unterticket in einem Demo-Elternticket.](/documentation/de/work-sub-issues.png)

## Die übergeordnete Beziehung öffnen oder entfernen {#change-parent}

Die Kennung des übergeordneten Problems neben dem Titel des Unterproblems öffnet ein Menü. Öffne darüber das übergeordnete Problem, um die größere Aufgabe zu prüfen. Um das Unterproblem zu lösen, wähle die Aktion zum Entfernen der übergeordneten Beziehung und lies die Bestätigung vor dem Anwenden. Bei Erfolg verschwindet die Beziehung, das Problem bleibt erhalten.

Lösche kein Unterproblem nur zur Neuordnung der Hierarchie. Prüfe bestehende über- und untergeordnete Beziehungen vor einem Wechsel und kläre eine abgewiesene Beziehung, statt eine kreisförmige Hierarchie zu erzwingen. Schlägt Speichern fehl, öffne das Unterproblem erneut und prüfe, ob die Änderung bereits übernommen wurde, bevor du erneut versuchst. Bewahre abgeschlossene Unterprobleme, wenn du den Gesamtplan überarbeitest.

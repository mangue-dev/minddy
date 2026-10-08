---
{
  "id": "page-comments-and-collaboration",
  "locale": "de",
  "title": "Eine Seite besprechen und Konflikte lösen",
  "summary": "Verwende verankerte Kommentarverläufe und unterscheide Anwesenheit von gespeicherten Änderungen.",
  "topic": "Seiten und Datenbanken",
  "type": "guide",
  "audiences": [
    "member"
  ],
  "workflows": [
    "P03"
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
      "components/pages/page-comment-popover.tsx",
      "components/pages/page-presence.tsx",
      "components/pages/page-conflict-banner.tsx",
      "lib/pages-merge.ts",
      "components/pages/page-view.tsx"
    ]
  },
  "review": {
    "revision": 4,
    "fact": "2026-10-08",
    "language": "2026-10-08",
    "date": "2026-10-08"
  },
  "related": [
    "page-history",
    "page-editor",
    "notifications-and-inbox"
  ],
  "aliases": [],
  "tags": [],
  "figures": [
    {
      "id": "page-comments-and-collaboration-steps",
      "kind": "screenshot",
      "src": "/documentation/de/page-comments.png",
      "alt": "Seitenaktivität mit einer Demoänderung und einem leeren Kommentarfeld.",
      "caption": "Lies die Seitenaktivität und verfasse einen Kommentar im Eingabefeld. In diesem Beispiel wurde keiner abgesendet.",
      "revision": 4,
      "reviewed": true,
      "capturedAt": "2026-10-08",
      "viewport": [
        1440,
        600
      ],
      "theme": "light"
    }
  ],
  "requiredFigures": [
    "page-comments-and-collaboration-steps"
  ]
}
---

## Einen Kommentarverlauf beginnen und abschließen {#page-comments-and-collaboration}

Öffne eine Projektseite und ihre Kommentarfunktionen. Wähle passende Inhalte aus, wenn du einen verankerten Kommentar erstellst, erkläre die Frage oder Änderung und erwähne bei Bedarf ein Projektmitglied. Antworte im Verlauf, damit die Entscheidung bei ihrem Kontext bleibt. Markiere den Verlauf erst als erledigt, wenn seine Frage tatsächlich beantwortet wurde.

Anwesenheitsavatare zeigen Personen, die die Seite ansehen. Sie beweisen nicht, dass der ungespeicherte Text einer anderen Person den Server erreicht hat oder gleichzeitige Bearbeitungen automatisch zusammengeführt werden. Prüfe den aktuellen Speicherzustand vor dem Wegnavigieren.


![Seitenaktivität mit einer Demoänderung und einem leeren Kommentarfeld.](/documentation/de/page-comments.png)

## Einen Speicherkonflikt lösen {#page-conflict}

Minddy führt Änderungen an unterschiedlichen Blöcken auf der obersten Dokumentebene zusammen, wenn sich beide Änderungen erhalten lassen. Gleichzeitige Textänderungen innerhalb desselben Blocks werden nicht Zeichen für Zeichen zusammengeführt. Haben beide Personen diesen Block geändert, übernimmt das Dokument die entfernte Version und ein Hinweis bietet deinen bisherigen Block zur Prüfung an.

Vergleiche den genannten Block mit dem aktuellen Dokument. Wähle die Aktion zum Wiederherstellen deiner Fassung nur dann, wenn du diesen Block wirklich durch deine Version ersetzen möchtest. War deine kollidierende Aktion eine Löschung, wendet die Aktion zum erneuten Löschen sie ausdrücklich an. Das Verwerfen des Hinweises behält das übernommene Dokument bei und schließt die Warnung; es stellt deine Fassung nicht wieder her. Sichere gewünschten Text vor dem Schließen und prüfe gespeicherte Versionen im Verlauf, wenn du mehr wiederherstellen musst. Diese Entscheidungen betreffen den bezeichneten Block, statt ungeprüft die ganze Seite zu ersetzen.

Ein fehlender Kommentaranker kann durch Dokumentänderungen entstehen. Lies die Diskussion vor dem Verschieben oder Löschen des referenzierten Blocks. Kommentare und Aktivität sind projektintern, sofern Inhalte nicht ausdrücklich über eine unterstützte Freigabe veröffentlicht werden. Prüfe die tatsächliche Besuchersicht an einer veröffentlichten Seite, statt anzunehmen, dass Zusammenarbeitsfunktionen des Projekts öffentlich werden.

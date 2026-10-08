---
{
  "id": "page-history",
  "locale": "de",
  "title": "Eine Seitenversion prüfen und wiederherstellen",
  "summary": "Sieh gespeicherten Verlauf an, bevor du das aktuelle Dokument ersetzt.",
  "topic": "Seiten und Datenbanken",
  "type": "guide",
  "audiences": [
    "member"
  ],
  "workflows": [
    "P05"
  ],
  "visibility": "public",
  "status": "published",
  "revision": 3,
  "sourceRevision": 1,
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
      "components/pages/page-history.tsx",
      "lib/server/page-versions.ts"
    ]
  },
  "review": {
    "revision": 3,
    "fact": "2026-10-08",
    "language": "2026-10-08",
    "date": "2026-10-08"
  },
  "related": [
    "page-editor",
    "create-and-organize-pages",
    "trash-and-recovery"
  ],
  "aliases": [],
  "tags": [],
  "figures": [
    {
      "id": "page-history-steps",
      "kind": "screenshot",
      "src": "/documentation/de/page-history-preview.png",
      "alt": "Versionen-Tab mit aufgeklapptem früherem Zustand, Autor, Wiederherstellen und Hinweis auf 30 Tage Aufbewahrung.",
      "caption": "Prüfe einen gespeicherten Zustand in der Vorschau und vergleiche ihn vor dem Wiederherstellen mit der aktuellen Seite.",
      "revision": 3,
      "reviewed": true,
      "capturedAt": "2026-10-08",
      "viewport": [
        1440,
        900
      ],
      "theme": "light"
    }
  ],
  "requiredFigures": [
    "page-history-steps"
  ]
}
---

## Gespeicherte Versionen prüfen {#page-history}

Öffne die Speicher- oder Verlaufsanzeige der Seite, um Versionen anzusehen, oder ihre Kommentar- beziehungsweise Aktivitätsfunktion, um Aktionen zu prüfen. Die Tabs beantworten verschiedene Fragen: Eine gespeicherte Version ist ein Dokumentzustand; Aktivität kann Umbenennungen, Löschungen oder Wiederherstellungen ohne dieselbe Inhaltsaufnahme enthalten.

Wähle eine Version zur Vorschau vor der Wiederherstellung. Der Verlauf zeigt Autoren und Agentenaktivität. Vergleiche den Inhalt daher mit der Änderung, die du rückgängig machen möchtest. Die Oberfläche nennt ein Verlaufsfenster von 30 Tagen; betrachte den Verlauf nicht als dauerhafte externe Sicherung.

## Wiederherstellen und prüfen {#restore-page-version}

Stelle als berechtigtes Projektmitglied die gewählte Version erst wieder her, nachdem du den aktuellen Inhalt geprüft hast, den sie ersetzen wird. Der Zustand vor der Wiederherstellung geht selbst in den Verlauf ein und kann später wiederhergestellt werden, solange er aufbewahrt wird.

Öffne oder aktualisiere nach der Wiederherstellung den Seiteneditor und prüfe den tatsächlichen Inhalt. Ein zuvor offener Editor hält eine veraltete Version und darf den wiederhergestellten Zustand nicht blind überschreiben. Seitenversionen sind keine vollständigen Instanzsicherungen: Dateidaten von Anhängen, gelöschte Dateien oder verbundene Objekte können eigene Lebenszyklen haben. Verwende die Datei- und Betreiber-Wiederherstellungsanleitungen, wenn Informationen außerhalb des gespeicherten Dokumentinhalts fehlen.


![Versionen-Tab mit aufgeklapptem früherem Zustand, Autor, Wiederherstellen und Hinweis auf 30 Tage Aufbewahrung.](/documentation/de/page-history-preview.png)

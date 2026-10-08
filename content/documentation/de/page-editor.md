---
{
  "id": "page-editor",
  "locale": "de",
  "title": "Eine Seite mit Blöcken und Erwähnungen schreiben",
  "summary": "Verwende strukturierte Inhalte, Hinweisblöcke und Links und prüfe, ob Änderungen gespeichert sind.",
  "topic": "Seiten und Datenbanken",
  "type": "guide",
  "audiences": [
    "member"
  ],
  "workflows": [
    "P02"
  ],
  "visibility": "public",
  "status": "published",
  "revision": 1,
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
      "components/pages/page-editor.tsx",
      "components/pages/page-slash-command.tsx",
      "content/knowledge/pages.md"
    ]
  },
  "review": {
    "revision": 1,
    "fact": "2026-10-08",
    "language": "2026-10-08",
    "date": "2026-10-08"
  },
  "related": [
    "page-history",
    "page-files",
    "page-comments-and-collaboration"
  ],
  "aliases": [],
  "tags": [],
  "figures": [
    {
      "id": "page-editor-steps",
      "kind": "screenshot",
      "src": "/documentation/de/page-editor.png",
      "alt": "Demoseite mit Überschriften, Absätzen, Aufgaben mit Kontrollkästchen und einer Ticketreferenz.",
      "caption": "Überschriften, Aufgabenblöcke und die Referenz AUR-2 gliedern die Seite. Der Inhalt dient als Demobeispiel.",
      "revision": 1,
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
    "page-editor-steps"
  ]
}
---

## Das Dokument schreiben {#page-editor}

Öffne die Seite und bearbeite als Projektmitglied Titel oder Inhalt. Verwende das Slash-Befehlsmenü und die Formatierungsfunktionen für Überschriften, Absätze, Listen, Aufgaben, Code, aufklappbare Abschnitte und Hinweisblöcke. Ein Hinweisblock kann ein Emoji-Symbol und eine Palettenfarbe haben. Unterscheide damit hilfreiche Informationen, ohne eine Warnung allein durch Symbol oder Farbe auszudrücken.

Verwende Erwähnungen, um passende Probleme, Ziele, Personen oder Seiten zu verknüpfen. Rückverweise helfen Lesern, Seiten zu finden, die auf die aktuelle Seite verweisen. Ein Link liefert Kontext, gewährt aber keinen Zugriff auf private Objekte eines anderen Projekts.


![Demoseite mit Überschriften, Absätzen, Aufgaben mit Kontrollkästchen und einer Ticketreferenz.](/documentation/de/page-editor.png)

## Speichern und Übertragbarkeit {#editor-save}

Beobachte die Speicheranzeige, bevor du nach einer größeren Bearbeitung wegnavigierst. Erzeugt eine andere Änderung einen Konflikt, nutze die angezeigten Wiederherstellungsfunktionen und bewahre deinen Text; gehe nicht davon aus, dass beide Änderungen zusammengeführt wurden. Der Seitenverlauf hilft, früher gespeicherte Versionen zu prüfen.

Markdown-Exporte und Seitenzugriffe durch Agenten erhalten Symbole und Farben von Hinweisblöcken in der unterstützten Darstellung. Exportformate unterscheiden sich in Wiedergabetreue und Anhangsbehandlung. Prüfe das entstandene Dokument, bevor du eine Originalquelle ersetzt. Verwende Codeblöcke für wörtliche Befehle und bewahre Voraussetzungen und Warnungen im umgebenden Text.

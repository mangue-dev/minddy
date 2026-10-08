---
{
  "id": "database-cells-and-entries",
  "locale": "de",
  "title": "Datenbankwerte und Eintragsseiten bearbeiten",
  "summary": "Speichere Zellen, wähle Zeilen aus und vergrößere einen Eintrag, ohne ausstehende Änderungen zu verlieren.",
  "topic": "Seiten und Datenbanken",
  "type": "guide",
  "audiences": [
    "member"
  ],
  "workflows": [
    "P09"
  ],
  "visibility": "public",
  "status": "published",
  "revision": 2,
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
      "components/pages/page-database-view.tsx",
      "components/pages/database-cell-editor.tsx",
      "content/knowledge/pages.md"
    ]
  },
  "review": {
    "revision": 2,
    "fact": "2026-10-08",
    "language": "2026-10-08",
    "date": "2026-10-08"
  },
  "related": [
    "change-a-database-schema",
    "create-a-database",
    "page-history"
  ],
  "aliases": [],
  "tags": [],
  "figures": [
    {
      "id": "database-cells-and-entries-steps",
      "kind": "screenshot",
      "src": "/documentation/de/database-entry.png",
      "alt": "Demoeintrag mit Beschreibung, Dauer 2.5, aktiviertem Kontrollkästchen und leerer Auswahl.",
      "caption": "Öffne einen Eintrag, um den vollständigen Text zu lesen und typisierte Werte zu bearbeiten.",
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
    "database-cells-and-entries-steps"
  ]
}
---

## Einen Wert bearbeiten {#database-cells-and-entries}

Klicke eine Tabellenzelle oder die Eigenschaft über dem Inhalt einer Eintragsseite an. Enter speichert, Escape bricht ab und Shift+Enter fügt eine Textzeile ein. Das Verlassen des Editors speichert. Eine ungültige Zahl hält den Editor bis zur Korrektur offen; bei einem Speicherfehler wird der Wert zurückgesetzt und ein Fehler angezeigt.

Verwende eine Auswahl-Zelle für eine Option oder Mehrfachauswahl für mehrere. Suche bestehende Optionen oder erstelle eine neue im Menü. Öffne „Optionen bearbeiten“, um Namen oder Farben zu ändern, und speichere gemeinsam oder brich ab. Datum, Personen und Kontrollkästchen verwenden passende Steuerelemente; Erstellt am bleibt schreibgeschützt.

## Einträge öffnen, auswählen und einfügen {#entry-actions}

Öffne einen Eintrag, um seine vollständige Seite in einem schwebenden Panel zu bearbeiten. „Vergrößern“ öffnet ihn als vollständige Seite, nachdem ausstehendes Speichern des Dokuments beendet ist. Schlägt Speichern fehl, bleibt das Panel zur Fehlerbehebung offen. Ein leerer Eintrag bleibt bis zum Löschen in der Datenbank.

Verwende Zeilen-Kontrollkästchen für die Auswahl und Shift-Klick für einen Bereich. Der Griff öffnet Aktionen und kann Einträge in manueller Reihenfolge umordnen. Das + am Zeilenrand fügt unter dem Eintrag ein; Option/Alt fügt oberhalb ein. Benachbartes Einfügen wechselt zurück zur manuellen Reihenfolge und entfernt Filter, damit der neue Eintrag sichtbar ist.

## Darstellungseinstellungen {#database-display}

Suche, filtere, sortiere und blende Spalten in der einzigen Listenansicht aus. Diese Einstellungen werden auf deinem Gerät gespeichert; die manuelle Reihenfolge wird mit dem Seitenbaum geteilt. Scrolle horizontal per Trackpad-Geste, Shift und Mausrad, Touch oder unterer Bildlaufleiste. Eine abgeschnittene Textvorschau kürzt den gespeicherten Wert nicht. Einträge mit Spaltenwerten lassen sich innerhalb ihrer Datenbank umordnen, aber nicht aus ihr heraus verschieben.


![Demoeintrag mit Beschreibung, Dauer 2.5, aktiviertem Kontrollkästchen und leerer Auswahl.](/documentation/de/database-entry.png)

---
{
  "id": "change-a-database-schema",
  "locale": "de",
  "title": "Das Datenbankschema sicher ändern",
  "summary": "Spalten umbenennen, neu anordnen oder umwandeln und mögliche Datenverluste prüfen.",
  "topic": "Seiten und Datenbanken",
  "type": "guide",
  "audiences": [
    "member"
  ],
  "workflows": [
    "P10"
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
      "components/pages/database-property-dialogs.tsx",
      "components/pages/database-column-name.tsx",
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
    "create-a-database",
    "database-cells-and-entries",
    "import-a-database"
  ],
  "aliases": [],
  "tags": [],
  "figures": [
    {
      "id": "change-a-database-schema-steps",
      "kind": "screenshot",
      "src": "/documentation/de/database-conversion-warning.png",
      "alt": "Umwandlungswarnung: Der Wechsel von Text zu Zahl leert eine inkompatible Zelle; Abbrechen und Bestätigen sind verfügbar.",
      "caption": "Prüfe die tatsächliche Zahl inkompatibler Zellen vor der Bestätigung. Abbrechen erhält die bisherigen Werte.",
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
    "change-a-database-schema-steps"
  ]
}
---

## Darstellung oder Optionen ändern {#change-a-database-schema}

Unter Spalten kannst du Eigenschaften mit dem Augensymbol ein- oder ausblenden. Klicke auf eine Spaltenüberschrift, um sie umzubenennen, oder ziehe die Überschriften, um ihre Reihenfolge zu ändern. Die Namensspalte der Einträge bleibt an erster Stelle. Optionen für Auswahl und Mehrfachauswahl lassen sich im Zellenmenü oder unter Spalten bearbeiten. Namen und Farben werden zusammen gespeichert.

Eine ausgeblendete Spalte ändert nur die Anzeigeeinstellungen; ihre Werte bleiben erhalten. Wenn du eine benutzerdefinierte Spalte löschst, gehen ihre Werte in allen Einträgen unwiderruflich verloren. Beachte diese Folge, bevor du das Löschen bestätigst.

## Den Eigenschaftstyp umwandeln {#convert-column}

Wähle für eine benutzerdefinierte Eigenschaft Spalte bearbeiten und anschließend den neuen Typ. Beim Speichern wandelt der Dialog die vorhandenen Werte um. Sind manche Werte nicht kompatibel, nennt die Warnung die Anzahl der Zellen, deren Inhalt gelöscht wird. Fahre nur fort, wenn dieser Verlust für dich akzeptabel ist. Mit Abbrechen behältst du den bisherigen Typ und alle Werte.

Beim Wechsel zu Erstellt am wird das ursprüngliche Erstellungsdatum jedes Eintrags verwendet. Vor dem Ersetzen vorhandener Werte erscheint eine Warnung. Prüfe nach der Umwandlung einige repräsentative Einträge, insbesondere Zahlen, Auswahlwerte und Datumsangaben, die anders interpretiert werden könnten.

Schemaänderungen durch einen Agenten verwenden die aktuelle Datenbankrevision und ein Token für die Umwandlungsvorschau. Gleichzeitige Änderungen machen diese Vorschau ungültig. Lies den aktuellen Stand erneut ein und erstelle eine neue Vorschau, statt eine veraltete Umwandlung zu erzwingen. Das Löschen inkompatibler Werte erfordert eine ausdrückliche Bestätigung.


![Umwandlungswarnung: Der Wechsel von Text zu Zahl leert eine inkompatible Zelle; Abbrechen und Bestätigen sind verfügbar.](/documentation/de/database-conversion-warning.png)

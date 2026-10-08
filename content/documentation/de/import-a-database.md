---
{
  "id": "import-a-database",
  "locale": "de",
  "title": "Eine Datenbank samt Eintragsinhalten importieren",
  "summary": "Prüfe Spaltenzuordnung und Seitenanzahl, bevor du Daten in eine leere Datenbank lädst.",
  "topic": "Seiten und Datenbanken",
  "type": "guide",
  "audiences": [
    "member"
  ],
  "workflows": [
    "P11"
  ],
  "visibility": "public",
  "status": "published",
  "revision": 3,
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
      "components/pages/database-import-dialog.tsx",
      "lib/server/database-import.ts",
      "content/knowledge/pages.md"
    ]
  },
  "review": {
    "revision": 3,
    "fact": "2026-10-08",
    "language": "2026-10-08",
    "date": "2026-10-08"
  },
  "related": [
    "create-a-database",
    "change-a-database-schema",
    "import-export-and-print-pages"
  ],
  "aliases": [],
  "tags": [],
  "figures": [
    {
      "id": "import-a-database-steps",
      "kind": "screenshot",
      "src": "/documentation/de/database-import-review.png",
      "alt": "Importprüfung einer lokalen CSV-Datei: zwei Eintragsseiten und zwei Eigenschaftsspalten mit der Importschaltfläche.",
      "caption": "Prüfe die eingelesenen Einträge und die Spaltenzahl vor dem Import in die leere Datenbank.",
      "revision": 3,
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
    "import-a-database-steps"
  ]
}
---

## Den Import auswählen {#import-a-database}

Erstelle eine Datenbank ohne optionale Spalten und ohne vorhandene Einträge. Wähle im Hinweisbanner der neuen Datenbank Vorhandene Datenbank importieren. Lade einen Notion-Export im Format Markdown & CSV als ZIP mit Unterseiten, eine Datenbank-CSV oder ein Minddy-Datenbankarchiv hoch. Enthält das Archiv mehrere Datenbanken, wähle die gewünschte aus.

Prüfe vor dem Bestätigen die vorgeschlagenen Spaltennamen und Typen sowie die Seitenanzahl. Wenn die Importhilfe eingerichtet ist, kann Numo anhand einer kleinen Stichprobe Typen vorschlagen. Die manuelle Zuordnung bleibt verfügbar. Nicht unterstützte Quelleigenschaften werden als Text übernommen. Inkompatible Werte verhindern den Import; sie werden nicht stillschweigend gelöscht.

## Was erhalten bleibt und was du prüfen solltest {#database-import-result}

Der Import übernimmt die Inhalte der Einträge, verschachtelte Dokumente und lokale Dateien, die im Archiv enthalten sind. Ein Minddy-Archiv erhält außerdem das genaue Schema und die Optionsfarben und ordnet interne Seiten- und Dateilinks neu zu. Personen können Mitgliedern des Zielprojekts zugeordnet werden. Ein Notion-Export enthält weder das ursprüngliche Schema noch Optionsfarben oder Formeldefinitionen. Diese Angaben lassen sich deshalb nicht aus dem Export wiederherstellen.

Die Grenzen für Archive liegen bei 20 MB komprimiert, 50 MB entpackt und 1.000 Seiten. Für jeden Anhang gilt weiterhin die Grenze von 10 MB für Seitendateien. Der Schreibvorgang der Datenbank ist transaktional. Ein erneuter Versuch derselben laufenden Importaktion im geöffneten Dialog behält ihre Anfragekennung. Eine bereits abgeschlossene Aktion wird dadurch ohne doppelte Zeilen zurückgegeben. Das Laden einer anderen Datei oder das erneute Öffnen eines neuen Dialogs kann eine neue Aktion erzeugen. Prüfe nach einem unklaren Netzwerkergebnis das Ziel vor einem Neustart; eine bereits gefüllte Datenbank erfüllt die Voraussetzung eines leeren Ziels nicht mehr.

Prüfe nach einem erfolgreichen Import einige Einträge, Werte, verschachtelte Seiten und Anhänge. Bewahre das ursprüngliche Archiv auf, bis diese Prüfung abgeschlossen ist. Lies bei einem Fehler zuerst die erste Fehlermeldung und korrigiere Format oder Zuordnung, bevor du es erneut versuchst. Fülle die Zieldatenbank nicht manuell und gehe danach davon aus, dass sie weiterhin die Voraussetzung einer leeren Datenbank erfüllt.


![Importprüfung einer lokalen CSV-Datei: zwei Eintragsseiten und zwei Eigenschaftsspalten mit der Importschaltfläche.](/documentation/de/database-import-review.png)

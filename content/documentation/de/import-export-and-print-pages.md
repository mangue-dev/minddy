---
{
  "id": "import-export-and-print-pages",
  "locale": "de",
  "title": "Eine Seite importieren, exportieren oder drucken",
  "summary": "Wähle das Ausgabeformat und prüfe Inhalt, Seitenhierarchie und Anhänge.",
  "topic": "Seiten und Datenbanken",
  "type": "guide",
  "audiences": [
    "member"
  ],
  "workflows": [
    "P07"
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
      "components/pages/page-document-actions.tsx",
      "lib/server/pages-export.ts",
      "components/pages/page-print-view.tsx"
    ]
  },
  "review": {
    "revision": 2,
    "fact": "2026-10-08",
    "language": "2026-10-08",
    "date": "2026-10-08"
  },
  "related": [
    "publish-a-page",
    "import-a-database",
    "page-history"
  ],
  "aliases": [],
  "tags": [],
  "figures": [
    {
      "id": "import-export-and-print-pages-steps",
      "kind": "screenshot",
      "src": "/documentation/de/page-export.png",
      "alt": "Exportmenü des Dokuments mit Markdown (.md) und Drucken / PDF.",
      "caption": "Wähle Markdown zum Herunterladen oder Drucken / PDF für die Druckansicht.",
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
    "import-export-and-print-pages-steps"
  ]
}
---

## Die Dokumentaktion auswählen {#import-export-and-print-pages}

Öffne das Dokumentmenü der Seite und wähle Exportieren. Wähle Markdown für eine Seite (.md) oder einen Zweig (.zip), PDF für die Druckansicht oder das Datenbankarchiv, wenn die Seite eine Datenbank ist. Prüfe vor dem Bestätigen den angebotenen Umfang: Eine einzelne Seite, ihr Zweig und ein Datenbankarchiv enthalten unterschiedliche Inhalte.

Öffne den Export und prüfe die Überschriften, Hinweisblöcke, Links und Anhänge, die die Leser benötigen. Die PDF-Aktion öffnet eine lesbare Druckansicht ohne die gesamte Anwendungsnavigation. Verwende die Druckfunktionen deines Browsers zum Drucken oder Speichern als PDF. Im Dokumentmenü gibt es keine allgemeine Importaktion. Unterstützte Importe starten von einer leeren Datenbank aus, wie im Leitfaden zum Datenbankimport beschrieben.


![Exportmenü des Dokuments mit Markdown (.md) und Drucken / PDF.](/documentation/de/page-export.png)

## Datenbankarchive und Grenzen {#export-fidelity}

Ein Datenbankarchiv (.zip) enthält den zugehörigen Zweig: Markdown und CSV, das genaue Schema und die Optionsfarben, Werte, Inhalte, Zeitstempel, verschachtelte Seiten und die Dateiinhalte. Importiere es in eine neue, leere Datenbank, um diese Struktur wiederherzustellen. Gerätespezifische Filter, Sortierungen und Einstellungen für ausgeblendete Spalten bleiben auf dem ursprünglichen Gerät.

Ein Export überträgt keine Passwörter, Zugangsdaten von Kontoanbietern oder Abonnements. Zum Übertragen deiner Arbeit zwischen Instanzen verwende den Leitfaden zum Kontodatentransfer. Kann ein importiertes Format einen Block oder eine externe Eigenschaft nicht erhalten, prüfe das Ergebnis, bevor du es als Ersatz verwendest. Lösche das Original nicht allein deshalb, weil eine Datei heruntergeladen wurde.

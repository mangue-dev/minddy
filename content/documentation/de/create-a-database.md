---
{
  "id": "create-a-database",
  "locale": "de",
  "title": "Eine Datenbank und ihre Spalten erstellen",
  "summary": "Beginne mit einer leeren Liste, wähle Eigenschaftstypen und füge einen ersten Eintrag hinzu.",
  "topic": "Seiten und Datenbanken",
  "type": "tutorial",
  "audiences": [
    "member"
  ],
  "workflows": [
    "P08"
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
      "content/knowledge/pages.md",
      "components/pages/database-setup-banner.tsx",
      "components/pages/database-property-dialogs.tsx",
      "lib/page-creation-settlement.ts"
    ]
  },
  "review": {
    "revision": 3,
    "fact": "2026-10-08",
    "language": "2026-10-08",
    "date": "2026-10-08"
  },
  "related": [
    "change-a-database-schema",
    "database-cells-and-entries",
    "import-a-database"
  ],
  "aliases": [],
  "tags": [],
  "figures": [
    {
      "id": "create-a-database-steps",
      "kind": "screenshot",
      "src": "/documentation/de/database-property-types.png",
      "alt": "Auswahl des Spaltentyps mit Text, Zahl, Auswahl, Datum, Personen und Kontrollkästchen.",
      "caption": "Wähle einen Typ, der zu den gespeicherten Werten passt.",
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
    "create-a-database-steps"
  ]
}
---

## Die Liste erstellen {#create-a-database}

Öffne als Projektmitglied den Seitenbereich, verwende + und wähle eine Datenbank. Eine neue Datenbank hat den Namen ihrer Einträge und keine optionalen Spalten. Ihr Hinweis „Neue Datenbank“ bietet die Einrichtung mit Numo oder den Import einer vorhandenen Datenbank. Manuelle Einrichtung bleibt ohne KI verfügbar. Die Einrichtung mit Numo öffnet eine vorbereitete Anfrage mit dieser Datenbank als Seitenkontext, nachdem ihre Erstellung abgeschlossen ist. Prüfe und sende diese Anfrage, um die benötigte Struktur anzufordern; allein das Öffnen des Gesprächs schließt die Einrichtung nicht ab. Tatsächliche KI-Arbeit braucht einen eingerichteten Anbieter sowie verfügbares Kontingent oder einen kompatiblen persönlichen Schlüssel. Prüfe das entstandene Schema und die Einträge, bevor du dich darauf verlässt.

Öffne „Spalten“ und wähle „Spalte hinzufügen“ oder verwende die +-Spalte am rechten Tabellenrand. Benenne die Spalte und wähle Text, Zahl, Auswahl, Mehrfachauswahl, Erstellt am, Datum, Personen oder Kontrollkästchen. Finde den Typ über die durchsuchbare Auswahl. Speichere, füge einen Eintrag hinzu und prüfe, ob die Spalte in Tabelle und Eintragsseite erscheint.

## Typen wählen und Grenzen beachten {#database-types}

Eine Datenbank unterstützt bis zu 30 Eigenschaftsspalten zusätzlich zum Eintragsnamen. Auswahl erlaubt eine Option; Mehrfachauswahl mehrere, mit bis zu 100 Optionen je Spalte. Textzellen unterstützen 2.000 Zeichen. Zahl akzeptiert vorzeichenbehaftete Dezimalzahlen mit Punkt oder Komma und weist Buchstaben ab. Erstellt am zeigt den ursprünglichen Zeitstempel des Eintrags und lässt sich nicht bearbeiten.

Personen wählt Projektmitglieder statt beliebiger Konto-E-Mail-Adressen aus. Neu erwähnte Mitglieder können Benachrichtigungen erhalten. Ein Datenbankeintrag ist außerdem eine vollständige Seite mit normalen Inhalten, Kommentaren und Anhängen.

Erweiterte Formeln, Automatisierungen und zusätzliche Datenbankansichten sind nicht verfügbar. Wähle eine Texteigenschaft oder ein verknüpftes Dokument, wenn die Daten nicht in einen unterstützten Typ passen. Beschreibe keine nicht unterstützte Formel als funktionierende Spalte.


![Auswahl des Spaltentyps mit Text, Zahl, Auswahl, Datum, Personen und Kontrollkästchen.](/documentation/de/database-property-types.png)

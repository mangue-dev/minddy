---
{
  "id": "databases",
  "locale": "de",
  "title": "Datenbanken",
  "summary": "Erstelle eine Datenbank, bearbeite Werte und Eintragsseiten, ändere das Schema und importiere eine vollständige Datenbank mit den nötigen Prüfungen.",
  "topic": "Seiten und Datenbanken",
  "type": "guide",
  "audiences": [
    "member"
  ],
  "workflows": [
    "P08",
    "P09",
    "P10",
    "P11"
  ],
  "visibility": "public",
  "status": "published",
  "revision": 6,
  "sourceRevision": 6,
  "owner": "@mangue-dev",
  "updatedAt": "2026-10-09",
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
      "lib/page-creation-settlement.ts",
      "components/pages/page-database-view.tsx",
      "components/pages/database-cell-editor.tsx",
      "components/pages/database-column-name.tsx",
      "components/pages/database-import-dialog.tsx",
      "lib/server/database-import.ts"
    ]
  },
  "review": {
    "revision": 6,
    "fact": "agent:/root/german_spanish_review (structural consolidation review; prior procedural evidence retained; no operational rerun); agent:/root (visual usefulness, figure framing and preserved procedures; previous operational evidence retained)",
    "language": "agent:/root/german_spanish_review (de title, summary, lead and heading review; retained body comparison); agent:/root/editorial_de_es (editorial clarity pass); agent:/root (figure removals and captions)",
    "date": "2026-10-09"
  },
  "related": [
    "pages"
  ],
  "aliases": [
    "create-a-database",
    "database-cells-and-entries",
    "change-a-database-schema",
    "import-a-database"
  ],
  "tags": [
    "Eine Datenbank und ihre Spalten erstellen",
    "Datenbankwerte und Eintragsseiten bearbeiten",
    "Das Datenbankschema sicher ändern",
    "Eine Datenbank samt Eintragsinhalten importieren"
  ],
  "figures": [
    {
      "id": "create-a-database-steps",
      "kind": "screenshot",
      "src": "/documentation/de/database-property-types.png",
      "alt": "Auswahl des Spaltentyps mit Text, Zahl, Auswahl, Datum, Personen und Kontrollkästchen.",
      "caption": "Wähle einen Typ, der zu den gespeicherten Werten passt.",
      "revision": 6,
      "reviewed": true,
      "capturedAt": "2026-10-08",
      "viewport": [
        464,
        336
      ],
      "theme": "light",
      "padding": 24
    },
    {
      "id": "database-cells-and-entries-steps",
      "kind": "screenshot",
      "src": "/documentation/de/database-entry.png",
      "alt": "Demoeintrag mit Beschreibung, Dauer 2.5, aktiviertem Kontrollkästchen und leerer Auswahl.",
      "caption": "Öffne einen Eintrag, um den vollständigen Text zu lesen und typisierte Werte zu bearbeiten.",
      "revision": 6,
      "reviewed": true,
      "capturedAt": "2026-10-08",
      "viewport": [
        1178,
        429
      ],
      "theme": "light",
      "padding": 24
    },
    {
      "id": "change-a-database-schema-steps",
      "kind": "screenshot",
      "src": "/documentation/de/database-conversion-warning.png",
      "alt": "Umwandlungswarnung: Der Wechsel von Text zu Zahl leert eine inkompatible Zelle; Abbrechen und Bestätigen sind verfügbar.",
      "caption": "Prüfe die tatsächliche Zahl inkompatibler Zellen vor der Bestätigung. Abbrechen erhält die bisherigen Werte.",
      "revision": 6,
      "reviewed": true,
      "capturedAt": "2026-10-08",
      "viewport": [
        456,
        306
      ],
      "theme": "light",
      "padding": 24
    },
    {
      "id": "import-a-database-steps",
      "kind": "screenshot",
      "src": "/documentation/de/database-import-review.png",
      "alt": "Importprüfung einer lokalen CSV-Datei: zwei Eintragsseiten und zwei Eigenschaftsspalten mit der Importschaltfläche.",
      "caption": "Prüfe die eingelesenen Einträge und die Spaltenzahl vor dem Import in die leere Datenbank.",
      "revision": 6,
      "reviewed": true,
      "capturedAt": "2026-10-08",
      "viewport": [
        744,
        511
      ],
      "theme": "light",
      "padding": 24
    }
  ],
  "requiredFigures": [
    "create-a-database-steps",
    "database-cells-and-entries-steps",
    "change-a-database-schema-steps",
    "import-a-database-steps"
  ]
}
---

Eine Datenbank verbindet eine Tabelle mit typisierten Eigenschaften und einer vollständigen Seite je Eintrag. Du kannst Spalten und Einträge selbst anlegen oder eine vorhandene Datenbank in ein leeres Ziel importieren. Prüfe vor einer Typänderung oder dem Löschen einer Spalte, welche gespeicherten Werte ersetzt werden oder verloren gehen.

## Eine Datenbank und ihre Spalten erstellen {#create-a-database}

Öffne als Projektmitglied den Seitenbereich, verwende + und wähle eine Datenbank. Eine neue Datenbank hat den Namen ihrer Einträge und keine optionalen Spalten. Ihr Hinweis „Neue Datenbank“ bietet die Einrichtung mit Numo oder den Import einer vorhandenen Datenbank. Manuelle Einrichtung bleibt ohne KI verfügbar. Die Einrichtung mit Numo öffnet eine vorbereitete Anfrage mit dieser Datenbank als Seitenkontext, nachdem ihre Erstellung abgeschlossen ist. Prüfe und sende diese Anfrage, um die benötigte Struktur anzufordern; allein das Öffnen des Gesprächs schließt die Einrichtung nicht ab. Tatsächliche KI-Arbeit braucht einen eingerichteten Anbieter sowie verfügbares Kontingent oder einen kompatiblen persönlichen Schlüssel. Prüfe das entstandene Schema und die Einträge, bevor du dich darauf verlässt.

Öffne „Spalten“ und wähle „Spalte hinzufügen“ oder verwende die +-Spalte am rechten Tabellenrand. Benenne die Spalte und wähle Text, Zahl, Auswahl, Mehrfachauswahl, Erstellt am, Datum, Personen oder Kontrollkästchen. Finde den Typ über die durchsuchbare Auswahl. Speichere, füge einen Eintrag hinzu und prüfe, ob die Spalte in Tabelle und Eintragsseite erscheint.

### Typen wählen und Grenzen beachten {#database-types}

Eine Datenbank unterstützt bis zu 30 Eigenschaftsspalten zusätzlich zum Eintragsnamen. Auswahl erlaubt eine Option; Mehrfachauswahl mehrere, mit bis zu 100 Optionen je Spalte. Textzellen unterstützen 2.000 Zeichen. Zahl akzeptiert vorzeichenbehaftete Dezimalzahlen mit Punkt oder Komma und weist Buchstaben ab. Erstellt am zeigt den ursprünglichen Zeitstempel des Eintrags und lässt sich nicht bearbeiten.

Personen wählt Projektmitglieder statt beliebiger Konto-E-Mail-Adressen aus. Neu erwähnte Mitglieder können Benachrichtigungen erhalten. Ein Datenbankeintrag ist außerdem eine vollständige Seite mit normalen Inhalten, Kommentaren und Anhängen.

Erweiterte Formeln, Automatisierungen und zusätzliche Datenbankansichten sind nicht verfügbar. Wähle eine Texteigenschaft oder ein verknüpftes Dokument, wenn die Daten nicht in einen unterstützten Typ passen. Beschreibe keine nicht unterstützte Formel als funktionierende Spalte.


![Auswahl des Spaltentyps mit Text, Zahl, Auswahl, Datum, Personen und Kontrollkästchen.](/documentation/de/database-property-types.png)

## Datenbankwerte und Eintragsseiten bearbeiten {#database-cells-and-entries}

Klicke eine Tabellenzelle oder die Eigenschaft über dem Inhalt einer Eintragsseite an. Enter speichert, Escape bricht ab und Shift+Enter fügt eine Textzeile ein. Das Verlassen des Editors speichert. Eine ungültige Zahl hält den Editor bis zur Korrektur offen; bei einem Speicherfehler wird der Wert zurückgesetzt und ein Fehler angezeigt.

Verwende eine Auswahl-Zelle für eine Option oder Mehrfachauswahl für mehrere. Suche bestehende Optionen oder erstelle eine neue im Menü. Öffne „Optionen bearbeiten“, um Namen oder Farben zu ändern, und speichere gemeinsam oder brich ab. Datum, Personen und Kontrollkästchen verwenden passende Steuerelemente; Erstellt am bleibt schreibgeschützt.

### Einträge öffnen, auswählen und einfügen {#entry-actions}

Öffne einen Eintrag, um seine vollständige Seite in einem schwebenden Panel zu bearbeiten. „Vergrößern“ öffnet ihn als vollständige Seite, nachdem ausstehendes Speichern des Dokuments beendet ist. Schlägt Speichern fehl, bleibt das Panel zur Fehlerbehebung offen. Ein leerer Eintrag bleibt bis zum Löschen in der Datenbank.

Verwende Zeilen-Kontrollkästchen für die Auswahl und Shift-Klick für einen Bereich. Der Griff öffnet Aktionen und kann Einträge in manueller Reihenfolge umordnen. Das + am Zeilenrand fügt unter dem Eintrag ein; Option/Alt fügt oberhalb ein. Benachbartes Einfügen wechselt zurück zur manuellen Reihenfolge und entfernt Filter, damit der neue Eintrag sichtbar ist.

### Darstellungseinstellungen {#database-display}

Suche, filtere, sortiere und blende Spalten in der einzigen Listenansicht aus. Diese Einstellungen werden auf deinem Gerät gespeichert; die manuelle Reihenfolge wird mit dem Seitenbaum geteilt. Scrolle horizontal per Trackpad-Geste, Shift und Mausrad, Touch oder unterer Bildlaufleiste. Eine abgeschnittene Textvorschau kürzt den gespeicherten Wert nicht. Einträge mit Spaltenwerten lassen sich innerhalb ihrer Datenbank umordnen, aber nicht aus ihr heraus verschieben.


![Demoeintrag mit Beschreibung, Dauer 2.5, aktiviertem Kontrollkästchen und leerer Auswahl.](/documentation/de/database-entry.png)

## Das Datenbankschema sicher ändern {#change-a-database-schema}

Unter Spalten kannst du Eigenschaften mit dem Augensymbol ein- oder ausblenden. Klicke auf eine Spaltenüberschrift, um sie umzubenennen, oder ziehe die Überschriften, um ihre Reihenfolge zu ändern. Die Namensspalte der Einträge bleibt an erster Stelle. Optionen für Auswahl und Mehrfachauswahl lassen sich im Zellenmenü oder unter Spalten bearbeiten. Namen und Farben werden zusammen gespeichert.

Eine ausgeblendete Spalte ändert nur die Anzeigeeinstellungen; ihre Werte bleiben erhalten. Wenn du eine benutzerdefinierte Spalte löschst, gehen ihre Werte in allen Einträgen unwiderruflich verloren. Beachte diese Folge, bevor du das Löschen bestätigst.

### Den Eigenschaftstyp umwandeln {#convert-column}

Wähle für eine benutzerdefinierte Eigenschaft Spalte bearbeiten und anschließend den neuen Typ. Beim Speichern wandelt der Dialog die vorhandenen Werte um. Sind manche Werte nicht kompatibel, nennt die Warnung die Anzahl der Zellen, deren Inhalt gelöscht wird. Fahre nur fort, wenn dieser Verlust für dich akzeptabel ist. Mit Abbrechen behältst du den bisherigen Typ und alle Werte.

Beim Wechsel zu Erstellt am wird das ursprüngliche Erstellungsdatum jedes Eintrags verwendet. Vor dem Ersetzen vorhandener Werte erscheint eine Warnung. Prüfe nach der Umwandlung einige repräsentative Einträge, insbesondere Zahlen, Auswahlwerte und Datumsangaben, die anders interpretiert werden könnten.

Schemaänderungen durch einen Agenten verwenden die aktuelle Datenbankrevision und ein Token für die Umwandlungsvorschau. Gleichzeitige Änderungen machen diese Vorschau ungültig. Lies den aktuellen Stand erneut ein und erstelle eine neue Vorschau, statt eine veraltete Umwandlung zu erzwingen. Das Löschen inkompatibler Werte erfordert eine ausdrückliche Bestätigung.


![Umwandlungswarnung: Der Wechsel von Text zu Zahl leert eine inkompatible Zelle; Abbrechen und Bestätigen sind verfügbar.](/documentation/de/database-conversion-warning.png)

## Eine Datenbank samt Eintragsinhalten importieren {#import-a-database}

Erstelle eine Datenbank ohne optionale Spalten und ohne vorhandene Einträge. Wähle im Hinweisbanner der neuen Datenbank Vorhandene Datenbank importieren. Lade einen Notion-Export im Format Markdown & CSV als ZIP mit Unterseiten, eine Datenbank-CSV oder ein minddy-Datenbankarchiv hoch. Enthält das Archiv mehrere Datenbanken, wähle die gewünschte aus.

Prüfe vor dem Bestätigen die vorgeschlagenen Spaltennamen und Typen sowie die Seitenanzahl. Wenn die Importhilfe eingerichtet ist, kann Numo anhand einer kleinen Stichprobe Typen vorschlagen. Die manuelle Zuordnung bleibt verfügbar. Nicht unterstützte Quelleigenschaften werden als Text übernommen. Inkompatible Werte verhindern den Import; sie werden nicht stillschweigend gelöscht.

### Was erhalten bleibt und was du prüfen solltest {#database-import-result}

Der Import übernimmt die Inhalte der Einträge, verschachtelte Dokumente und lokale Dateien, die im Archiv enthalten sind. Ein minddy-Archiv erhält außerdem das genaue Schema und die Optionsfarben und ordnet interne Seiten- und Dateilinks neu zu. Personen können Mitgliedern des Zielprojekts zugeordnet werden. Ein Notion-Export enthält weder das ursprüngliche Schema noch Optionsfarben oder Formeldefinitionen. Diese Angaben lassen sich deshalb nicht aus dem Export wiederherstellen.

Die Grenzen für Archive liegen bei 20 MB komprimiert, 50 MB entpackt und 1.000 Seiten. Für jeden Anhang gilt weiterhin die Grenze von 10 MB für Seitendateien. Der Schreibvorgang der Datenbank ist transaktional. Ein erneuter Versuch derselben laufenden Importaktion im geöffneten Dialog behält ihre Anfragekennung. Eine bereits abgeschlossene Aktion wird dadurch ohne doppelte Zeilen zurückgegeben. Das Laden einer anderen Datei oder das erneute Öffnen eines neuen Dialogs kann eine neue Aktion erzeugen. Prüfe nach einem unklaren Netzwerkergebnis das Ziel vor einem Neustart; eine bereits gefüllte Datenbank erfüllt die Voraussetzung eines leeren Ziels nicht mehr.

Prüfe nach einem erfolgreichen Import einige Einträge, Werte, verschachtelte Seiten und Anhänge. Bewahre das ursprüngliche Archiv auf, bis diese Prüfung abgeschlossen ist. Lies bei einem Fehler zuerst die erste Fehlermeldung und korrigiere Format oder Zuordnung, bevor du es erneut versuchst. Fülle die Zieldatenbank nicht manuell und gehe danach davon aus, dass sie weiterhin die Voraussetzung einer leeren Datenbank erfüllt.


![Importprüfung einer lokalen CSV-Datei: zwei Eintragsseiten und zwei Eigenschaftsspalten mit der Importschaltfläche.](/documentation/de/database-import-review.png)

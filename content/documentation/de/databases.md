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
  "revision": 20,
  "sourceRevision": 19,
  "owner": "@mangue-dev",
  "updatedAt": "2026-10-28",
  "compatibility": {
    "version": "0.20.0 (MIN-747 release review)",
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
      "lib/server/database-import.ts",
      "lib/database-import/types.ts",
      "lib/database-import/archive.ts",
      "components/pages/page-database-properties.tsx",
      "components/date-time-picker.tsx",
      "lib/page-databases.ts",
      "scripts/page-database-date-times.integration.test.mjs",
      "components/pages/page-promotion-context.tsx",
      "components/pages/page-promotion-context.test.tsx",
      "components/pages/database-view-strip.tsx",
      "lib/use-page-database-views.ts",
      "lib/server/page-database-views.ts",
      "components/pages/database-table-scroll.tsx",
      "components/ui/checkbox.tsx",
      "lib/server/database-view-tools.ts",
      "lib/page-database-filters.ts",
      "components/pages/database-filter-editor.tsx",
      "supabase/migrations/20270109200092_page_database_views_realtime.sql"
    ]
  },
  "review": {
    "revision": 20,
    "fact": "agent:claude-code (column header menu Delete column with confirmation and right-click opening, hover-only row gutter, touch-screen rows without gutter, checkbox tooltips and partial header state, bottom scrollbar hidden on touch screens, view rename/delete by right-click, column reordering by handle in Columns, Numo view tools and no MCP view tools checked against components/pages/database-column-name.tsx, page-database-view.tsx, database-view-strip.tsx, database-table-scroll.tsx, components/ui/checkbox.tsx, lib/server/assistant/tools.ts and lib/server/database-view-tools.ts; several filter conditions with All/Any match, operators per column type, up to 10 conditions, single filters kept, live view updates, default view rename, phone view dropdown, View settings sheets, search field and cell sheets checked against lib/page-database-filters.ts, components/pages/database-filter-editor.tsx, lib/use-page-database-views.ts, supabase/migrations/20270109200092_page_database_views_realtime.sql, components/pages/database-view-strip.tsx, components/pages/page-database-view.tsx and components/pages/database-cell-editor.tsx; rest of the article unchanged since the previous review; no figure recaptured, existing figures do not show the changed controls)",
    "language": "agent:claude-code (de changed passages with catalog UI labels; equivalent meaning to en revision 19; self-reviewed; agent review, not human acceptance)",
    "date": "2026-10-28"
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
      "id": "database-setup-cards-preview",
      "kind": "screenshot",
      "src": "/documentation/de/database-setup-cards.png",
      "alt": "Komponentenvorschau der Karten zur Einrichtung einer neuen Datenbank mit Numo oder zum Import einer vorhandenen Datenbank.",
      "caption": "Vorschläge für eine neue Datenbank mit Demonstrationsdaten. Wähle Numo oder Import, oder schließe die Karten, um manuell fortzufahren.",
      "revision": 20,
      "reviewed": true,
      "capturedAt": "2026-10-11",
      "viewport": [
        712,
        240
      ],
      "deviceScaleFactor": 2,
      "theme": "light",
      "padding": 24
    },
    {
      "id": "create-a-database-steps",
      "kind": "screenshot",
      "src": "/documentation/de/database-property-types.png",
      "alt": "Auswahl des Spaltentyps mit Suchfeld sowie Text, Zahl, Auswahl, Datum, Personen und Kontrollkästchen.",
      "caption": "Wähle einen Typ, der zu den gespeicherten Werten passt.",
      "revision": 20,
      "reviewed": true,
      "capturedAt": "2026-10-18",
      "viewport": [
        448,
        357
      ],
      "theme": "light",
      "padding": 24,
      "deviceScaleFactor": 2
    },
    {
      "id": "database-cells-and-entries-steps",
      "kind": "screenshot",
      "src": "/documentation/de/database-entry.png",
      "alt": "Demoeintrag mit Beschreibung, Dauer 2.5, aktiviertem Kontrollkästchen und leerer Auswahl.",
      "caption": "Öffne einen Eintrag, um den vollständigen Text zu lesen und typisierte Werte zu bearbeiten.",
      "revision": 20,
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
      "revision": 20,
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
      "revision": 20,
      "reviewed": true,
      "capturedAt": "2026-10-08",
      "viewport": [
        744,
        511
      ],
      "theme": "light",
      "padding": 24
    },
    {
      "id": "database-options-preview",
      "kind": "screenshot",
      "src": "/documentation/de/database-options.png",
      "alt": "Komponentenvorschau von Optionen bearbeiten mit deutschen Statusoptionen, Pfeilen nach oben und unten, Papierkörben und einer Erklärung zum Löschen.",
      "caption": "Bearbeite Namen, Farben und Reihenfolge der Optionen gemeinsam. Der Papierkorb entfernt eine Option aus dem Entwurf; Speichern übernimmt die Änderungen. Mit Demonstrationsdaten.",
      "revision": 20,
      "reviewed": true,
      "capturedAt": "2026-10-12",
      "viewport": [
        560,
        448
      ],
      "deviceScaleFactor": 2,
      "theme": "light",
      "padding": 24
    },
    {
      "id": "database-date-time-preview",
      "kind": "screenshot",
      "src": "/documentation/de/database-date-time.png",
      "alt": "Komponentenvorschau der Datumsauswahl mit dem ausgewählten 24. Juli 2026, aktivierter Uhrzeit und Zeit auf 02:00 AM.",
      "caption": "Aktiviere „Uhrzeit hinzufügen“, um eine Uhrzeit einzugeben. Diese Komponentenvorschau verwendet Demonstrationsdaten und die Zeitzone des Geräts.",
      "revision": 20,
      "reviewed": true,
      "capturedAt": "2026-10-22",
      "viewport": [
        324,
        498
      ],
      "deviceScaleFactor": 2,
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

Der Einrichtungsbereich einer neuen Datenbank bietet zwei Karten: **Mit Numo erstellen**, um die Struktur vorzubereiten, und **Vorhandene Datenbank importieren**. Die Schließen-Schaltfläche mit der Beschriftung **Einrichtungshilfe ausblenden** blendet diese Vorschläge aus; manuelle Bearbeitung bleibt möglich.

Öffne als Eigentümer oder Mitglied des Projekts den Seitenbereich, verwende + und wähle eine Datenbank. Eine neue Datenbank hat den Namen ihrer Einträge und keine optionalen Spalten. Ihr Hinweis „Neue Datenbank“ bietet die Einrichtung mit Numo oder den Import einer vorhandenen Datenbank. Manuelle Einrichtung bleibt ohne KI verfügbar. **Mit Numo erstellen** öffnet eine vorbereitete Anfrage mit dieser Datenbank als Seitenkontext, nachdem ihre Erstellung abgeschlossen ist. Prüfe und sende diese Anfrage, um die benötigte Struktur anzufordern; allein das Öffnen des Gesprächs schließt die Einrichtung nicht ab. Tatsächliche KI-Arbeit braucht einen eingerichteten Anbieter sowie verfügbares Kontingent oder einen kompatiblen persönlichen Schlüssel. Prüfe das entstandene Schema und die Einträge, bevor du dich darauf verlässt.

Öffne „Spalten“ und wähle „Spalte hinzufügen“ oder verwende die +-Spalte am rechten Tabellenrand. Benenne die Spalte und wähle Text, Zahl, Auswahl, Mehrfachauswahl, Erstellt am, Datum, Personen oder Kontrollkästchen. Finde den Typ über die durchsuchbare Auswahl. Speichere, füge einen Eintrag hinzu und prüfe, ob die Spalte in Tabelle und Eintragsseite erscheint.


![Komponentenvorschau der Karten zur Einrichtung einer neuen Datenbank mit Numo oder zum Import einer vorhandenen Datenbank.](/documentation/de/database-setup-cards.png)

### Typen wählen und Grenzen beachten {#database-types}

Eine Datenbank unterstützt bis zu 30 Eigenschaftsspalten zusätzlich zum Eintragsnamen. Auswahl erlaubt eine Option; Mehrfachauswahl mehrere, mit bis zu 100 Optionen je Spalte. Textzellen unterstützen 2.000 Zeichen. Zahl akzeptiert vorzeichenbehaftete Dezimalzahlen mit Punkt oder Komma und weist Buchstaben ab. Erstellt am zeigt den ursprünglichen Zeitstempel des Eintrags und lässt sich nicht bearbeiten.

Personen wählt Projektmitglieder statt beliebiger Konto-E-Mail-Adressen aus. Neu erwähnte Mitglieder können Benachrichtigungen erhalten. Ein Datenbankeintrag ist außerdem eine vollständige Seite mit normalen Inhalten, Kommentaren und Anhängen.

Erweiterte Formeln sind nicht verfügbar. Wähle eine Texteigenschaft oder ein verknüpftes Dokument, wenn die Daten nicht in einen unterstützten Typ passen. Beschreibe keine nicht unterstützte Formel als funktionierende Spalte.


![Auswahl des Spaltentyps mit Suchfeld sowie Text, Zahl, Auswahl, Datum, Personen und Kontrollkästchen.](/documentation/de/database-property-types.png)

## Datenbankwerte und Eintragsseiten bearbeiten {#database-cells-and-entries}

Füge im Optionseditor unter den vorhandenen Zeilen eine Option hinzu, auch bei leerer Liste. Gib jeder Option einen eindeutigen, nicht leeren Namen und speichere. Das funktioniert für Auswahl und Mehrfachauswahl.

Klicke eine Tabellenzelle oder die Eigenschaft über dem Inhalt einer Eintragsseite an. Enter speichert, Escape bricht ab und Shift+Enter fügt eine Textzeile ein. Das Verlassen des Editors speichert. Eine ungültige Zahl hält den Editor bis zur Korrektur offen; bei einem Speicherfehler wird der Wert zurückgesetzt und ein Fehler angezeigt.

Verwende eine Auswahl-Zelle für eine Option oder Mehrfachauswahl für mehrere. Suche bestehende Optionen oder erstelle eine neue im Menü. Öffne „Optionen bearbeiten“ in einer Zelle oder im Menü des Spaltenkopfs einer Auswahl- oder Mehrfachauswahl-Spalte (klicke auf den Spaltennamen), um Namen oder Farben zu ändern, und speichere gemeinsam oder brich ab. Datum, Personen und Kontrollkästchen verwenden passende Steuerelemente; Erstellt am bleibt schreibgeschützt.

Neue Optionen erhalten eine zufällige Palettenfarbe, die in der Spalte noch nicht verwendet wird. Das gilt sowohl beim Erstellen in einer Zelle als auch im Optionsdialog. Sobald alle zehn Farben verwendet werden, können sie sich wiederholen. Du kannst die Farbe weiterhin selbst wählen.

Verwende unter „Optionen bearbeiten“ die Pfeile nach oben und unten neben einer Zeile, um Optionen neu anzuordnen. Mit dem Papierkorb entfernst du eine Option. Speichern übernimmt Namen, Farben, Reihenfolge und Löschungen gemeinsam; hast du Optionen gelöscht, listet es sie zuerst auf und fragt mit **Löschen und speichern** nach, weil sich das Löschen nicht rückgängig machen lässt. Eine gelöschte Option wird aus allen Einträgen entfernt, die sie verwenden, auch aus Einträgen im Papierkorb. Andere ausgewählte Optionen bleiben erhalten. Abbrechen verwirft die Änderungen im Entwurf.

Wähle unter Datum einen Tag. Aktiviere „Uhrzeit hinzufügen“ und fülle Zeit aus, um eine Uhrzeit anzugeben. Der Wert wird beim Bearbeiten gespeichert und die Auswahl bleibt geöffnet. Werte mit Uhrzeit werden in der Zeitzone deines Geräts angezeigt, auch Mitternacht. Wenn du „Uhrzeit hinzufügen“ deaktivierst, bleibt der angezeigte Tag als Datum ohne Uhrzeit erhalten. Datumsfilter berücksichtigen den angezeigten Kalendertag.

![Komponentenvorschau von Optionen bearbeiten mit deutschen Statusoptionen, Pfeilen nach oben und unten, Papierkörben und einer Erklärung zum Löschen.](/documentation/de/database-options.png)

![Komponentenvorschau der Datumsauswahl mit dem ausgewählten 24. Juli 2026, aktivierter Uhrzeit und Zeit auf 02:00 AM.](/documentation/de/database-date-time.png)

### Einträge öffnen, auswählen und einfügen {#entry-actions}

Ein leerer Eintrag zeigt im Inhalt einen Platzhalter für den Schreibbereich. Beim Duplizieren über die Zeilenaktionen oder eine Mehrfachauswahl musst du die Erstellung der Kopien bestätigen. Auch das Verschieben in den Papierkorb erfordert eine Bestätigung und bleibt wiederherstellbar; es löscht die Einträge nicht endgültig.

Öffne einen Eintrag, um seine vollständige Seite in einem schwebenden Panel zu bearbeiten. „Vergrößern“ öffnet ihn als vollständige Seite, nachdem ausstehendes Speichern des Dokuments beendet ist. Schlägt Speichern fehl, bleibt das Panel zur Fehlerbehebung offen. Ein leerer Eintrag bleibt bis zum Löschen in der Datenbank.

Verwende Zeilen-Kontrollkästchen für die Auswahl und Shift-Klick für einen Bereich. Der Tooltip jedes Kontrollkästchens lautet **Auswählen** oder **Auswahl aufheben**. Das Kontrollkästchen in der Kopfzeile (**Alle Einträge auswählen** oder, wenn alle ausgewählt sind, **Alle abwählen**) zeigt einen Strich, solange nur ein Teil der Einträge ausgewählt ist, und ein Häkchen, wenn alle ausgewählt sind; ein Klick darauf bei einer Teilauswahl wählt alle Einträge aus. Fahre mit dem Zeiger über eine Zeile, um ihren Rand anzuzeigen: Der Griff öffnet Aktionen und kann Einträge in manueller Reihenfolge umordnen, und das + fügt unter dem Eintrag ein; Option/Alt fügt oberhalb ein. Benachbartes Einfügen entfernt die Filter der aktiven Ansicht, damit der neue Eintrag sichtbar ist. Auf einem Touchscreen haben Zeilen keinen Rand, und ihre Kontrollkästchen bleiben sichtbar: Wähle Einträge aus und verwende dann **Duplizieren** oder **In den Papierkorb verschieben** in der Auswahlleiste. **Zu Ticket hochstufen** und das Verschieben eines Eintrags nach oben oder unten sind dort nicht verfügbar.

Im Griffmenü eines einzelnen Eintrags kann der Eigentümer oder ein Mitglied **Zu Ticket hochstufen** wählen, damit Numo diesen Eintrag mit Inhalt und Eigenschaften in ein Ticket umwandelt. Der Eintrag bleibt in der Datenbank. Bezieht sich das Menü auf mehrere ausgewählte Zeilen, fehlt die Aktion; eine Sammel-Hochstufung gibt es nicht, also stufe jeden Eintrag einzeln hoch. Die [Seitenanleitung](/de/dokumentation/pages#promote-page-to-issue) beschreibt die Rückfragen von Numo und was zu tun ist, wenn der Eintrag vorher nicht gespeichert werden kann.

### Datenbankansichten {#database-display}

Eine Datenbank zeigt ihre Einträge in Ansichten, die über der Tabelle aufgelistet sind. Jede Ansicht hat ihre eigene Sortierung, ihren Filter und ihre ausgeblendeten Spalten, und alle Projektmitglieder sehen dieselben Ansichten. Der Projektinhaber oder ein Mitglied fügt mit **Neue Ansicht** (+) eine Ansicht hinzu, die von der angezeigten Ansicht ausgeht, benennt eine Ansicht per Rechtsklick mit **Ansicht umbenennen** um oder löscht sie mit **Ansicht löschen** und ordnet Ansichten per Ziehen neu an. Änderungen an Sortierung, Filter und Spalten werden für alle in der aktiven Ansicht gespeichert. Eine Datenbank behält mindestens eine Ansicht; vor ihrer ersten Änderung zeigt sie die Standardansicht **Tabelle**. Leser wechseln zwischen Ansichten und können eine Ansicht für sich anpassen, bis sie die Seite verlassen. Dein Browser merkt sich die zuletzt geöffnete Ansicht; die Suche wird nie gespeichert. Die manuelle Reihenfolge wird mit dem Seitenbaum geteilt. Scrolle horizontal per Trackpad-Geste, Shift und Mausrad oder mit der Bildlaufleiste am unteren Fensterrand. Ein Touchscreen zeigt diese Leiste nicht: Wische dort über die Tabelle. Eine abgeschnittene Textvorschau kürzt den gespeicherten Wert nicht. Einträge mit Spaltenwerten lassen sich innerhalb ihrer Datenbank umordnen, aber nicht aus ihr heraus verschieben. Numo kann die Ansichten einer Datenbank auflisten und sie auf deine Bitte erstellen, umbenennen, umordnen oder löschen (nie die letzte) oder ihre Sortierung, ihre Filter (alle oder mindestens einer) und ihre ausgeblendeten Spalten ändern. Auf einer Datenbankseite versteht Numo unter „einer Ansicht“ die Ansichten der Datenbank, nicht die des Ticketboards. Die Spaltenreihenfolge gehört nicht zu einer Ansicht, sondern zum Datenbankschema. minddy-MCP-Clients können keine Ansichten verwalten.

Öffne **Filtern**, um mit **Filter hinzufügen** eine Liste von Bedingungen aufzubauen; **Diesen Filter entfernen** löscht eine davon. Jede Bedingung wählt eine Spalte, eine Bedingung und einen Wert, und die Bedingungen hängen vom Spaltentyp ab. Text bietet enthält, enthält nicht, ist, ist nicht, ist leer und ist nicht leer. Zahl bietet ist, ist nicht, größer als, kleiner als, ist leer und ist nicht leer. Auswahl bietet ist, ist nicht, ist leer und ist nicht leer. Mehrfachauswahl und Personen bieten enthält, enthält nicht, ist leer und ist nicht leer. Datum und Erstellt am bieten ist am, ist nach, ist vor, ist leer und ist nicht leer. Kontrollkästchen entspricht **Aktiviert** oder **Deaktiviert**. Eine Bedingung ohne Wert filtert noch nicht. Ab zwei Bedingungen wählst du **Alle Filter**, um die Einträge zu behalten, die jede Bedingung erfüllen, oder **Mindestens ein Filter** für die, die mindestens eine erfüllen. Eine Ansicht enthält bis zu 10 Bedingungen; eine früher mit einem einzelnen Filter gespeicherte Ansicht behält ihn.

Ansichten aktualisieren sich live: Eine Ansicht, die ein Teammitglied oder Numo erstellt oder ändert, erscheint ohne Neuladen der Seite. Solange eine Datenbank keine gespeicherte Ansicht hat, klicke mit der rechten Maustaste auf ihre Standardansicht und wähle **Ansicht umbenennen**: Das Umbenennen speichert sie als benannte Ansicht mit den aktuellen Einstellungen, und **Ansicht löschen** bleibt nicht verfügbar.

Auf dem Smartphone wählst du eine Ansicht aus dem Dropdown über der Tabelle; sein Menü bietet **Neue Ansicht**, **Ansicht umbenennen** und **Ansicht löschen**. Die Symbolleiste zeigt nur die Suche, **Ansichtseinstellungen** und **Neu**. **Ansichtseinstellungen** öffnet ein Blatt mit **Sortieren nach**, **Filtern** und **Spalten**, die jeweils ihr eigenes Blatt öffnen. Die Suche klappt unter der Symbolleiste ein Feld mit einer Schaltfläche zum Schließen auf. Die Tabelle reicht von Rand zu Rand, mit höheren Zeilen und immer sichtbaren Kontrollkästchen. Text- und Zahlenzellen öffnen sich in einem unteren Blatt mit einer Schaltfläche **Speichern**, wie es Auswahl, Personen und Datum bereits tun.


![Demoeintrag mit Beschreibung, Dauer 2.5, aktiviertem Kontrollkästchen und leerer Auswahl.](/documentation/de/database-entry.png)

## Das Datenbankschema sicher ändern {#change-a-database-schema}

Das Verschieben einer Spalte beginnt nach einer Zeigerbewegung und bleibt horizontal. Der Greifcursor erscheint nur während des Ziehens; ein normaler Klick öffnet weiterhin die Spaltenaktionen. Wenn eine Spaltenüberschrift fokussiert ist, öffnet Eingabe oder Leertaste ihre Aktionen. Starte das Umordnen mit F8, verwende Links oder Rechts und bestätige mit Eingabe oder brich mit Escape ab.

Unter Spalten kannst du Eigenschaften mit dem Augensymbol ein- oder ausblenden und Spalten umordnen, indem du den Griff einer Zeile in dieser Liste ziehst. Mit der Tastatur fokussierst du den Griff, drückst die Leertaste, verschiebst die Spalte mit den Pfeiltasten nach oben oder unten und drückst erneut die Leertaste, um sie abzulegen; Escape bricht ab. Klicke auf eine Spaltenüberschrift oder klicke sie mit der rechten Maustaste an, um ihr Menü zu öffnen, etwa um die Spalte umzubenennen, oder ziehe die Überschriften, um ihre Reihenfolge zu ändern. Die Namensspalte der Einträge bleibt an erster Stelle. Optionen für Auswahl und Mehrfachauswahl lassen sich im Zellenmenü oder unter Spalten bearbeiten. Namen und Farben werden zusammen gespeichert.

Eine ausgeblendete Spalte ändert nur die Anzeigeeinstellungen; ihre Werte bleiben erhalten. Um eine benutzerdefinierte Spalte zu löschen, wähle **Spalte löschen** im Menü ihrer Überschrift oder ihre Papierkorb-Schaltfläche unter Spalten; beide fragen nach einer Bestätigung. Dabei gehen ihre Werte in allen Einträgen unwiderruflich verloren. Beachte diese Folge, bevor du das Löschen bestätigst.

### Den Eigenschaftstyp umwandeln {#convert-column}

Wähle für eine benutzerdefinierte Eigenschaft Spalte bearbeiten und anschließend den neuen Typ. Beim Speichern wandelt der Dialog die vorhandenen Werte um. Sind manche Werte nicht kompatibel, nennt die Warnung die Anzahl der Zellen, deren Inhalt gelöscht wird. Fahre nur fort, wenn dieser Verlust für dich akzeptabel ist. Mit Abbrechen behältst du den bisherigen Typ und alle Werte.

Beim Wechsel zu Erstellt am wird das ursprüngliche Erstellungsdatum jedes Eintrags verwendet. Vor dem Ersetzen vorhandener Werte erscheint eine Warnung. Prüfe nach der Umwandlung einige repräsentative Einträge, insbesondere Zahlen, Auswahlwerte und Datumsangaben, die anders interpretiert werden könnten.

Schemaänderungen durch einen Agenten verwenden die aktuelle Datenbankrevision und ein Token für die Umwandlungsvorschau. Gleichzeitige Änderungen machen diese Vorschau ungültig. Lies den aktuellen Stand erneut ein und erstelle eine neue Vorschau, statt eine veraltete Umwandlung zu erzwingen. Das Löschen inkompatibler Werte erfordert eine ausdrückliche Bestätigung.


![Umwandlungswarnung: Der Wechsel von Text zu Zahl leert eine inkompatible Zelle; Abbrechen und Bestätigen sind verfügbar.](/documentation/de/database-conversion-warning.png)

## Eine Datenbank samt Eintragsinhalten importieren {#import-a-database}

Erstelle eine Datenbank ohne optionale Spalten und ohne vorhandene Einträge. Wähle im Hinweisbanner der neuen Datenbank **Vorhandene Datenbank importieren**. Lade einen Notion-Export im Format Markdown & CSV als ZIP mit Unterseiten, eine Datenbank-CSV oder ein minddy-Datenbankarchiv hoch. Enthält das Archiv mehrere Datenbanken, wähle die gewünschte aus.

Prüfe vor dem Bestätigen die vorgeschlagenen Spaltennamen und Typen sowie die Seitenanzahl. Wenn die Importhilfe eingerichtet ist, kann Numo anhand einer kleinen Stichprobe Typen vorschlagen. Die manuelle Zuordnung bleibt verfügbar. Nicht unterstützte Quelleigenschaften werden als Text übernommen. Inkompatible Werte verhindern den Import; sie werden nicht stillschweigend gelöscht.

### Was erhalten bleibt und was du prüfen solltest {#database-import-result}

Der Import übernimmt die Inhalte der Einträge, verschachtelte Dokumente und lokale Dateien, die im Archiv enthalten sind. Ein minddy-Archiv erhält außerdem das genaue Schema und die Optionsfarben und ordnet interne Seiten- und Dateilinks neu zu. Personen können Mitgliedern des Zielprojekts zugeordnet werden. Ein Notion-Export enthält weder das ursprüngliche Schema noch Optionsfarben oder Formeldefinitionen. Diese Angaben lassen sich deshalb nicht aus dem Export wiederherstellen.

Die Grenzen für Archive liegen bei 20 MB komprimiert, 50 MB entpackt, 1.000 Seiten und 100 Anhängen. Für jeden Anhang gilt weiterhin die Grenze von 10 MB für Seitendateien. Der Schreibvorgang der Datenbank ist transaktional. Ein erneuter Versuch derselben laufenden Importaktion im geöffneten Dialog behält ihre Anfragekennung. Eine bereits abgeschlossene Aktion wird dadurch ohne doppelte Zeilen zurückgegeben. Das Laden einer anderen Datei oder das erneute Öffnen eines neuen Dialogs kann eine neue Aktion erzeugen. Prüfe nach einem unklaren Netzwerkergebnis das Ziel vor einem Neustart; eine bereits gefüllte Datenbank erfüllt die Voraussetzung eines leeren Ziels nicht mehr.

Prüfe nach einem erfolgreichen Import einige Einträge, Werte, verschachtelte Seiten und Anhänge. Bewahre das ursprüngliche Archiv auf, bis diese Prüfung abgeschlossen ist. Lies bei einem Fehler zuerst die erste Fehlermeldung und korrigiere Format oder Zuordnung, bevor du es erneut versuchst. Fülle die Zieldatenbank nicht manuell und gehe danach davon aus, dass sie weiterhin die Voraussetzung einer leeren Datenbank erfüllt.


![Importprüfung einer lokalen CSV-Datei: zwei Eintragsseiten und zwei Eigenschaftsspalten mit der Importschaltfläche.](/documentation/de/database-import-review.png)


## Routinen für neue Einträge {#entry-routines}

Der Projekteigentümer kann diese Datenbank in [Routinen](/docs/scheduled-routines#conditions) als Auslöser wählen. Bedingungen verwenden die typisierten Eigenschaften des Eintrags. Ein leerer Eintrag kann bis zum Ausfüllen seiner Eigenschaften warten. Erstellung, Duplizierung, Datenbankimport und erlaubtes Verschieben in die Datenbank gelten als Eingänge; Wiederherstellung nicht. Bei Entfernung einer referenzierten Eigenschaft oder Änderung ihres Typs muss der Routinenfilter korrigiert werden.

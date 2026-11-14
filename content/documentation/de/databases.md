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
  "revision": 22,
  "sourceRevision": 20,
  "owner": "@mangue-dev",
  "updatedAt": "2026-11-14",
  "compatibility": {
    "version": "0.30.0 (MIN-794 release review)",
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
      "supabase/migrations/20270109200092_page_database_views_realtime.sql",
      "components/pages/page-peek-panel.tsx",
      "components/pages/pages-shell.tsx",
      "components/global-page-panel.tsx",
      "lib/page-database-number.ts",
      "lib/page-database-schema-patch.ts",
      "lib/use-page-database.ts",
      "lib/undo/undo-context.tsx",
      "components/pages/database-choice.tsx",
      "components/pages/page-document-actions.tsx",
      "lib/server/database-tool-schema.ts",
      "supabase/migrations/20270109200126_page_database_metadata_recurrence_formats.sql"
    ]
  },
  "review": {
    "revision": 22,
    "fact": "agent:claude-code (MIN-990 changes mirrored from en revision 20; labels checked against messages/de.json; agent review, not human acceptance)",
    "language": "agent:claude-code (de translation of the changed passages with catalog UI labels; self-reviewed; agent review, not human acceptance)",
    "date": "2026-11-14"
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
      "revision": 22,
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
      "alt": "Auswahl des Spaltentyps mit Suchfeld sowie Text, Zahl, Auswahl, Datum, Personen, Kontrollkästchen und den vier schreibgeschützten Typen.",
      "caption": "Wähle einen Typ, der zu den gespeicherten Werten passt.",
      "revision": 22,
      "reviewed": true,
      "capturedAt": "2026-11-14",
      "viewport": [
        448,
        453
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
      "revision": 22,
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
      "revision": 22,
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
      "revision": 22,
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
      "alt": "Komponentenvorschau von Optionen bearbeiten mit deutschen Statusoptionen, Ziehgriffen, Papierkörben und einer Erklärung zum Löschen.",
      "caption": "Bearbeite Namen, Farben und Reihenfolge der Optionen gemeinsam. Ziehe einen Griff, um die Reihenfolge zu ändern; der Papierkorb entfernt eine Option aus dem Entwurf; Speichern übernimmt die Änderungen. Mit Demonstrationsdaten.",
      "revision": 22,
      "reviewed": true,
      "capturedAt": "2026-11-14",
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
      "revision": 22,
      "reviewed": true,
      "capturedAt": "2026-11-04",
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

Öffne „Spalten“ und wähle „Spalte hinzufügen“ oder verwende die +-Spalte am rechten Tabellenrand. Benenne die Spalte und wähle Text, Zahl, Auswahl, Mehrfachauswahl, Datum, Personen, Kontrollkästchen, Erstellt am, Zuletzt bearbeitet, Erstellt von oder Zuletzt bearbeitet von. Finde den Typ über die durchsuchbare Auswahl. Speichere, füge einen Eintrag hinzu und prüfe, ob die Spalte in Tabelle und Eintragsseite erscheint.


![Komponentenvorschau der Karten zur Einrichtung einer neuen Datenbank mit Numo oder zum Import einer vorhandenen Datenbank.](/documentation/de/database-setup-cards.png)

### Typen wählen und Grenzen beachten {#database-types}

Eine Datenbank unterstützt bis zu 30 Eigenschaftsspalten zusätzlich zum Eintragsnamen. Auswahl erlaubt eine Option; Mehrfachauswahl mehrere, mit bis zu 100 Optionen je Spalte. Textzellen unterstützen 2.000 Zeichen. Zahl akzeptiert eine Zahl mit Punkt oder Komma, mit Tausendertrennzeichen, einem Währungszeichen oder einem Prozentzeichen, und weist Buchstaben ab. Auch eine Rechnung ist möglich: Gib `14 + 2` ein, und die Zelle speichert 16. Rechnungen verstehen `+`, `-`, `*`, `/`, `^` und Klammern, und ein Prozentwert darin bezieht sich auf das, was davor steht: `80 + 20 %` ergibt 96.

Eine Zahl-Spalte richtet ihre Anzeige nach dem, was du eingibst. Gib einen Betrag mit Währungszeichen oder Währungscode ein, zum Beispiel `12 €`, `$40` oder `40 CHF`, und die ganze Spalte zeigt Beträge in dieser Währung. Gib eine Zahl mit Prozentzeichen ein, zum Beispiel `25 %`, und die Spalte zeigt Prozentwerte. Eine einfache Zahl oder eine Rechnung lässt die Spalte, wie sie ist. Um zu einfachen Zahlen zurückzukehren, öffne das Menü der Spaltenüberschrift und wähle **Als einfache Zahl anzeigen**. Das Format ändert nur, wie Werte angezeigt werden, und nie die gespeicherte Zahl. Eine einfache Zahl wird ab fünf Stellen mit Tausendertrennzeichen angezeigt, eine Jahreszahl bleibt also 2026.

Vier Spaltentypen füllen sich aus jedem Eintrag selbst und lassen sich nicht bearbeiten: Erstellt am und Zuletzt bearbeitet zeigen, wann der Eintrag erstellt und zuletzt geändert wurde, Erstellt von und Zuletzt bearbeitet von zeigen, wer das getan hat. Eine Änderung durch Numo oder einen MCP-Agenten wird als von minddy vorgenommen angezeigt.

Personen wählt Projektmitglieder statt beliebiger Konto-E-Mail-Adressen aus. Neu erwähnte Mitglieder können Benachrichtigungen erhalten. Ein Datenbankeintrag ist außerdem eine vollständige Seite mit normalen Inhalten, Kommentaren und Anhängen.

Erweiterte Formeln sind nicht verfügbar. Wähle eine Texteigenschaft oder ein verknüpftes Dokument, wenn die Daten nicht in einen unterstützten Typ passen. Beschreibe keine nicht unterstützte Formel als funktionierende Spalte.


![Auswahl des Spaltentyps mit Suchfeld sowie Text, Zahl, Auswahl, Datum, Personen, Kontrollkästchen und den vier schreibgeschützten Typen.](/documentation/de/database-property-types.png)

## Datenbankwerte und Eintragsseiten bearbeiten {#database-cells-and-entries}

Füge im Optionseditor unter den vorhandenen Zeilen eine Option hinzu, auch bei leerer Liste. Gib jeder Option einen eindeutigen, nicht leeren Namen und speichere. Das funktioniert für Auswahl und Mehrfachauswahl.

Klicke eine Tabellenzelle oder die Eigenschaft über dem Inhalt einer Eintragsseite an. Enter speichert, Escape bricht ab und Shift+Enter fügt eine Textzeile ein. Das Verlassen des Editors speichert. Eine ungültige Zahl hält den Editor bis zur Korrektur offen; bei einem Speicherfehler wird der Wert zurückgesetzt und ein Fehler angezeigt.

Verwende eine Auswahl-Zelle für eine Option oder Mehrfachauswahl für mehrere. Suche bestehende Optionen oder erstelle eine neue im Menü. Öffne „Optionen bearbeiten“ in einer Zelle oder im Menü des Spaltenkopfs einer Auswahl- oder Mehrfachauswahl-Spalte (klicke auf den Spaltennamen), um Namen oder Farben zu ändern, und speichere gemeinsam oder brich ab. Datum, Personen und Kontrollkästchen verwenden passende Steuerelemente; Erstellt am, Zuletzt bearbeitet, Erstellt von und Zuletzt bearbeitet von bleiben schreibgeschützt.

Neue Optionen erhalten eine zufällige Palettenfarbe, die in der Spalte noch nicht verwendet wird. Das gilt sowohl beim Erstellen in einer Zelle als auch im Optionsdialog. Sobald alle zehn Farben verwendet werden, können sie sich wiederholen. Du kannst die Farbe weiterhin selbst wählen.

Ziehe unter „Optionen bearbeiten“ den Griff am Anfang einer Zeile, um Optionen neu anzuordnen. Mit der Tastatur fokussierst du den Griff, drückst die Leertaste, verschiebst die Option mit den Pfeiltasten nach oben oder unten und drückst erneut die Leertaste, um sie abzulegen; Escape bricht ab. Mit dem Papierkorb der Zeile entfernst du eine Option. Speichern übernimmt Namen, Farben, Reihenfolge und Löschungen gemeinsam; hast du Optionen gelöscht, listet es sie zuerst auf und fragt mit **Löschen und speichern** nach. Danach bietet eine Benachrichtigung **Rückgängig** an; damit kommen die Optionen mit den Werten zurück, die sie verwendet haben. Eine gelöschte Option wird aus allen Einträgen entfernt, die sie verwenden, auch aus Einträgen im Papierkorb. Andere ausgewählte Optionen bleiben erhalten. Abbrechen verwirft die Änderungen im Entwurf.

Wähle unter Datum einen Tag. Aktiviere „Uhrzeit hinzufügen“ und fülle Zeit aus, um eine Uhrzeit anzugeben. Der Wert wird beim Bearbeiten gespeichert und die Auswahl bleibt geöffnet. Werte mit Uhrzeit werden in der Zeitzone deines Geräts angezeigt, auch Mitternacht. Wenn du „Uhrzeit hinzufügen“ deaktivierst, bleibt der angezeigte Tag als Datum ohne Uhrzeit erhalten. Datumsfilter berücksichtigen den angezeigten Kalendertag.

Ein Datum kann sich wiederholen, wie das Fälligkeitsdatum eines Tickets. Wähle in der Datumsauswahl **Wiederkehrend** statt **Einmal** und dann einen Rhythmus: jeden Tag, jede Woche, jeden Monat oder jedes Jahr. Die Zelle zeigt ein Wiederholungssymbol und den nächsten Termin, der von selbst weiterrückt, sobald der Tag vorbei ist; Sortierung und Filter verwenden diesen Termin. Wähle **Einmal**, um wieder ein einzelnes Datum zu behalten.

![Komponentenvorschau von Optionen bearbeiten mit deutschen Statusoptionen, Ziehgriffen, Papierkörben und einer Erklärung zum Löschen.](/documentation/de/database-options.png)

![Komponentenvorschau der Datumsauswahl mit dem ausgewählten 24. Juli 2026, aktivierter Uhrzeit und Zeit auf 02:00 AM.](/documentation/de/database-date-time.png)

### Einträge öffnen, auswählen und einfügen {#entry-actions}

Ein leerer Eintrag zeigt im Inhalt einen Platzhalter für den Schreibbereich. Beim Duplizieren über die Zeilenaktionen oder eine Mehrfachauswahl musst du die Erstellung der Kopien bestätigen. Auch das Verschieben in den Papierkorb erfordert eine Bestätigung und bleibt wiederherstellbar; es löscht die Einträge nicht endgültig.

Öffne einen Eintrag, um seine vollständige Seite in einem schwebenden Panel zu bearbeiten. „Vergrößern“ öffnet ihn als vollständige Seite, nachdem ausstehendes Speichern des Dokuments beendet ist. Schlägt Speichern fehl, bleibt das Panel zur Fehlerbehebung offen. Der Kopf des Panels enthält außerdem das Menü **Seitenoptionen** (`…`) des Eintrags zwischen „Vergrößern“ und Schließen; wenn du den Eintrag dort in den Papierkorb verschiebst, schließt sich das Panel und die Tabelle bleibt stehen. Ein leerer Eintrag bleibt bis zum Löschen in der Datenbank.

Verwende Zeilen-Kontrollkästchen für die Auswahl und Shift-Klick für einen Bereich. Der Tooltip jedes Kontrollkästchens lautet **Auswählen** oder **Auswahl aufheben**. Das Kontrollkästchen in der Kopfzeile (**Alle Einträge auswählen** oder, wenn alle ausgewählt sind, **Alle abwählen**) zeigt einen Strich, solange nur ein Teil der Einträge ausgewählt ist, und ein Häkchen, wenn alle ausgewählt sind; ein Klick darauf bei einer Teilauswahl wählt alle Einträge aus. Fahre mit dem Zeiger über eine Zeile, um ihren Rand anzuzeigen: Der Griff öffnet das Menü des Eintrags und kann Einträge in manueller Reihenfolge umordnen, und das + fügt unter dem Eintrag ein; Option/Alt fügt oberhalb ein. Benachbartes Einfügen entfernt die Filter der aktiven Ansicht, damit der neue Eintrag sichtbar ist. Angehakte Einträge öffnen die schwebende Auswahlleiste: Wähle **Aktionen** oder drücke Command+K unter macOS bzw. Strg+K auf anderen Systemen, um sie zu Tickets hochzustufen, zu **Duplizieren** oder **In den Papierkorb verschieben**, jeweils nach ihrer Bestätigung, und **Numo fragen** öffnet Numo mit allen angehakten Einträgen im Kontext. Auf einem Touchscreen haben Zeilen keinen Rand, und ihre Kontrollkästchen bleiben sichtbar; dieselbe Auswahlleiste wirkt auf die angehakten Einträge, und das Verschieben eines Eintrags nach oben oder unten ist dort nicht verfügbar.

Das Griffmenü eines einzelnen Eintrags beginnt mit **Seite öffnen** und bietet dann, was die Seitenleiste für jede Seite bietet: **Eine Unterseite hinzufügen**, **Zu Favoriten hinzufügen**, **Kopieren**, **In ein Ticket umwandeln**, **Veröffentlichen…** und **Exportieren**, gefolgt von **Duplizieren** und **In den Papierkorb verschieben**. Ein Leser sieht **Seite öffnen**, **Kopieren** und **Exportieren**. Bezieht sich das Menü auf mehrere ausgewählte Zeilen, behält es **Duplizieren** und **In den Papierkorb verschieben**.

In diesem Menü kann der Eigentümer oder ein Mitglied **In ein Ticket umwandeln** wählen, damit Numo diesen Eintrag mit Inhalt und Eigenschaften in ein Ticket umwandelt. Der Eintrag bleibt in der Datenbank. Bezieht sich das Menü auf mehrere ausgewählte Zeilen, stufe sie stattdessen über **Aktionen** in der Auswahlleiste hoch: Eine einzige Numo-Konversation erstellt ein Ticket pro Eintrag. Die [Seitenanleitung](/de/dokumentation/pages#promote-page-to-issue) beschreibt die Rückfragen von Numo und was zu tun ist, wenn der Eintrag vorher nicht gespeichert werden kann.

### Datenbankansichten {#database-display}

Eine Datenbank zeigt ihre Einträge in Ansichten, die über der Tabelle aufgelistet sind. Jede Ansicht hat ihre eigene Sortierung, ihren Filter und ihre ausgeblendeten Spalten, und alle Projektmitglieder sehen dieselben Ansichten. Der Projektinhaber oder ein Mitglied fügt mit **Neue Ansicht** (+) eine Ansicht hinzu, die von der angezeigten Ansicht ausgeht, benennt eine Ansicht per Rechtsklick mit **Ansicht umbenennen** um oder löscht sie mit **Ansicht löschen** und ordnet Ansichten per Ziehen neu an. Änderungen an Sortierung, Filter und Spalten werden für alle in der aktiven Ansicht gespeichert. Eine Datenbank behält mindestens eine Ansicht; vor ihrer ersten Änderung zeigt sie die Standardansicht **Tabelle**. Leser wechseln zwischen Ansichten und können eine Ansicht für sich anpassen, bis sie die Seite verlassen. Dein Browser merkt sich die zuletzt geöffnete Ansicht; die Suche wird nie gespeichert. Die manuelle Reihenfolge wird mit dem Seitenbaum geteilt. Scrolle horizontal per Trackpad-Geste, Shift und Mausrad oder mit der Bildlaufleiste am unteren Fensterrand. Ein Touchscreen zeigt diese Leiste nicht: Wische dort über die Tabelle. Eine abgeschnittene Textvorschau kürzt den gespeicherten Wert nicht. Einträge mit Spaltenwerten lassen sich innerhalb ihrer Datenbank umordnen, aber nicht aus ihr heraus verschieben. Numo kann die Ansichten einer Datenbank auflisten und sie auf deine Bitte erstellen, umbenennen, umordnen oder löschen (nie die letzte) oder ihre Sortierung, ihre Filter (alle oder mindestens einer) und ihre ausgeblendeten Spalten ändern. Auf einer Datenbankseite versteht Numo unter „einer Ansicht“ die Ansichten der Datenbank, nicht die des Ticketboards. Die Spaltenreihenfolge gehört nicht zu einer Ansicht, sondern zum Datenbankschema. minddy-MCP-Clients können keine Ansichten verwalten.

Öffne **Sortieren nach**, um eine Spalte zu wählen und dann eine Richtung, die nach dem Inhalt der Spalte benannt ist: **A bis Z** oder **Z bis A** für Text und Personen, **Erste Option zuerst** oder **Letzte Option zuerst** für eine Spalte vom Typ Auswahl oder Mehrfachauswahl, die in der Reihenfolge ihrer Optionen sortiert, **Kleinste zuerst** oder **Größte zuerst** für eine Zahl, **Älteste zuerst** oder **Neueste zuerst** für ein Datum, **Deaktivierte zuerst** oder **Aktivierte zuerst** für ein Kontrollkästchen und **Von oben nach unten** oder **Von unten nach oben** für die manuelle Reihenfolge. Die Spaltenlisten von **Sortieren nach** und **Filtern** zeigen das Typsymbol jeder Spalte.

Ziehe den rechten Rand einer Spaltenüberschrift, um die Breite der Spalte festzulegen; mit einem Doppelklick auf diesen Rand kehrst du zur Standardbreite zurück. Bewege den Mauszeiger unter einer Zahl-Spalte über den unteren Rand der Tabelle und wähle **Berechnen**, um **Summe**, **Durchschnitt**, **Minimum**, **Maximum** oder **Anzahl** der Einträge anzuzeigen, die die Ansicht behält. Breiten und Berechnungen werden mit der Ansicht gespeichert, wie ihre Sortierung und ihre Filter.

Öffne **Filtern**, um mit **Filter hinzufügen** eine Liste von Bedingungen aufzubauen; **Diesen Filter entfernen** löscht eine davon. Jede Bedingung wählt eine Spalte, eine Bedingung und einen Wert, und die Bedingungen hängen vom Spaltentyp ab. Text bietet enthält, enthält nicht, ist, ist nicht, ist leer und ist nicht leer. Zahl bietet ist, ist nicht, größer als, kleiner als, ist leer und ist nicht leer. Auswahl bietet ist, ist nicht, ist leer und ist nicht leer. Mehrfachauswahl und Personen bieten enthält, enthält nicht, ist leer und ist nicht leer. Datum, Erstellt am und Zuletzt bearbeitet bieten ist am, ist nach, ist vor, ist leer und ist nicht leer. Erstellt von und Zuletzt bearbeitet von bieten ist und ist nicht, mit einem Projektmitglied. Kontrollkästchen entspricht **Aktiviert** oder **Deaktiviert**. Eine Bedingung ohne Wert filtert noch nicht. Ab zwei Bedingungen wählst du **Alle Filter**, um die Einträge zu behalten, die jede Bedingung erfüllen, oder **Mindestens ein Filter** für die, die mindestens eine erfüllen. Eine Ansicht enthält bis zu 10 Bedingungen; eine früher mit einem einzelnen Filter gespeicherte Ansicht behält ihn.

Ansichten aktualisieren sich live: Eine Ansicht, die ein Teammitglied oder Numo erstellt oder ändert, erscheint ohne Neuladen der Seite. Solange eine Datenbank keine gespeicherte Ansicht hat, klicke mit der rechten Maustaste auf ihre Standardansicht und wähle **Ansicht umbenennen**: Das Umbenennen speichert sie als benannte Ansicht mit den aktuellen Einstellungen, und **Ansicht löschen** bleibt nicht verfügbar.

Auf dem Smartphone wählst du eine Ansicht aus dem Dropdown über der Tabelle; sein Menü bietet **Neue Ansicht**, **Ansicht umbenennen** und **Ansicht löschen**. Die Symbolleiste zeigt nur die Suche, **Ansichtseinstellungen** und **Neu**. **Ansichtseinstellungen** öffnet ein Blatt mit **Sortieren nach**, **Filtern** und **Spalten**, die jeweils ihr eigenes Blatt öffnen. Die Suche klappt unter der Symbolleiste ein Feld mit einer Schaltfläche zum Schließen auf. Die Tabelle reicht von Rand zu Rand, mit höheren Zeilen und immer sichtbaren Kontrollkästchen. Text- und Zahlenzellen öffnen sich in einem unteren Blatt mit einer Schaltfläche **Speichern**, wie es Auswahl, Personen und Datum bereits tun.

Eine im Seitenpanel geöffnete Datenbank, etwa über eine Erwähnung, einen Rückverweis, eine an ein Ticket angehängte Seite oder einen Link in einem Kommentar, nutzt diese kompakte Symbolleiste auch am Computer: das Dropdown der Ansichten, dessen Menü **Neue Ansicht**, **Ansicht umbenennen** und **Ansicht löschen** bietet, dann die Suche, **Ansichtseinstellungen** und **Neu**. Die Suche öffnet ein Feld in einem Popover. **Ansichtseinstellungen** öffnet ein Menü: **Sortieren nach** zeigt die Spalten und die Sortierrichtung in einem Untermenü, während **Filtern** und **Spalten** jeweils ihr Popover unter der Schaltfläche öffnen. Die Tabelle scrollt im Panel seitlich, mit einer eigenen Bildlaufleiste. Ein aus dieser Tabelle geöffneter Eintrag tritt im Panel an ihre Stelle; **Zurück** oben links im Panel führt zur Tabelle zurück, und **Vergrößern** öffnet das, was das Panel zeigt, als ganze Seite.


![Demoeintrag mit Beschreibung, Dauer 2.5, aktiviertem Kontrollkästchen und leerer Auswahl.](/documentation/de/database-entry.png)

### Rückgängig machen und wiederholen {#database-undo}

Drücke ⌘Z (Ctrl+Z unter Windows und Linux), um deine letzte Änderung in einer Datenbank rückgängig zu machen, und ⌘⇧Z (Ctrl+Shift+Z), um sie zu wiederholen. Das gilt für einen Zellenwert, eine hinzugefügte, umbenannte, umgeordnete, in einen anderen Typ umgewandelte oder gelöschte Spalte, bearbeitete Optionen, einen erstellten, duplizierten, umgeordneten oder in den Papierkorb verschobenen Eintrag und die Einstellungen einer Ansicht: Sortierung, Filter, ausgeblendete Spalten, Spaltenbreiten und Berechnungen. Machst du das Löschen einer Spalte oder Option rückgängig, kommen die dabei entfernten Werte zurück. Eine Änderung an mehreren ausgewählten Einträgen wird in einem Schritt rückgängig gemacht.

Der Verlauf gehört zum geöffneten Tab und enthält deine eigenen Änderungen: Er geht verloren, wenn du die Seite neu lädst, und er lässt Änderungen von Teammitgliedern, Numo oder einem MCP-Agenten aus. Solange der Cursor in einem Textfeld oder im Inhalt einer Seite steht, machen dieselben Tasten stattdessen die Texteingabe rückgängig. Hat inzwischen jemand anderes denselben Wert geändert, wird das Rückgängigmachen abgelehnt, und die Tabelle zeigt den aktuellen Wert.

## Das Datenbankschema sicher ändern {#change-a-database-schema}

Das Verschieben einer Spalte beginnt nach einer Zeigerbewegung und bleibt horizontal. Der Greifcursor erscheint nur während des Ziehens; ein normaler Klick öffnet weiterhin die Spaltenaktionen. Wenn eine Spaltenüberschrift fokussiert ist, öffnet Eingabe oder Leertaste ihre Aktionen. Starte das Umordnen mit F8, verwende Links oder Rechts und bestätige mit Eingabe oder brich mit Escape ab.

Unter Spalten kannst du Eigenschaften mit dem Augensymbol ein- oder ausblenden und Spalten umordnen, indem du den Griff einer Zeile in dieser Liste ziehst. Mit der Tastatur fokussierst du den Griff, drückst die Leertaste, verschiebst die Spalte mit den Pfeiltasten nach oben oder unten und drückst erneut die Leertaste, um sie abzulegen; Escape bricht ab. Klicke auf eine Spaltenüberschrift oder klicke sie mit der rechten Maustaste an, um ihr Menü zu öffnen, etwa um die Spalte umzubenennen, oder ziehe die Überschriften, um ihre Reihenfolge zu ändern. Die Namensspalte der Einträge bleibt an erster Stelle. Optionen für Auswahl und Mehrfachauswahl lassen sich im Zellenmenü oder unter Spalten bearbeiten. Namen und Farben werden zusammen gespeichert.

Eine ausgeblendete Spalte ändert nur die Anzeigeeinstellungen; ihre Werte bleiben erhalten. Um eine benutzerdefinierte Spalte zu löschen, wähle **Spalte löschen** im Menü ihrer Überschrift oder ihre Papierkorb-Schaltfläche unter Spalten; beide fragen nach einer Bestätigung. Dabei werden ihre Werte aus allen Einträgen entfernt. Anschließend bietet eine Benachrichtigung **Rückgängig** an, und [Rückgängig machen](#database-undo) bringt die Spalte und ihre Werte zurück, solange die Seite geöffnet bleibt; danach ist das Löschen endgültig.

### Den Eigenschaftstyp umwandeln {#convert-column}

Wähle für eine benutzerdefinierte Eigenschaft Spalte bearbeiten und anschließend den neuen Typ. Beim Speichern wandelt der Dialog die vorhandenen Werte um. Sind manche Werte nicht kompatibel, nennt die Warnung die Anzahl der Zellen, deren Inhalt gelöscht wird. Fahre nur fort, wenn dieser Verlust für dich akzeptabel ist. Mit Abbrechen behältst du den bisherigen Typ und alle Werte.

Der Wechsel zu Erstellt am, Zuletzt bearbeitet, Erstellt von oder Zuletzt bearbeitet von ersetzt vorhandene Werte durch das, was minddy für jeden Eintrag aufzeichnet, und warnt vorher. Prüfe nach der Umwandlung einige repräsentative Einträge, insbesondere Zahlen, Auswahlwerte und Datumsangaben, die anders interpretiert werden könnten.

Numo und MCP-Agenten lesen und schreiben dieselben Spalten: Sie können die schreibgeschützten Spalten hinzufügen, ein Zahlenformat festlegen und ein wiederkehrendes Datum schreiben. Schemaänderungen durch einen Agenten verwenden die aktuelle Datenbankrevision und ein Token für die Umwandlungsvorschau. Gleichzeitige Änderungen machen diese Vorschau ungültig. Lies den aktuellen Stand erneut ein und erstelle eine neue Vorschau, statt eine veraltete Umwandlung zu erzwingen. Das Löschen inkompatibler Werte erfordert eine ausdrückliche Bestätigung.


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

---
{
  "id": "pages",
  "locale": "de",
  "title": "Seiten",
  "summary": "Erstelle und bearbeite Projektseiten, verwalte Zusammenarbeit, Dateien und Verlauf und veröffentliche, exportiere oder drucke Dokumente.",
  "topic": "Seiten und Datenbanken",
  "type": "guide",
  "audiences": [
    "member",
    "visitor"
  ],
  "workflows": [
    "P01",
    "P02",
    "P03",
    "P04",
    "P05",
    "P06",
    "P07"
  ],
  "visibility": "public",
  "status": "published",
  "revision": 5,
  "sourceRevision": 5,
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
      "components/pages/page-create-menu.tsx",
      "components/pages/page-tree.tsx",
      "components/pages/page-editor.tsx",
      "components/pages/page-slash-command.tsx",
      "components/pages/page-comment-popover.tsx",
      "components/pages/page-presence.tsx",
      "components/pages/page-conflict-banner.tsx",
      "lib/pages-merge.ts",
      "components/pages/page-view.tsx",
      "components/pages/page-uploads.tsx",
      "lib/server/page-files.ts",
      "lib/server/page-publication.ts",
      "components/pages/page-history.tsx",
      "lib/server/page-versions.ts",
      "components/pages/page-publish-dialog.tsx",
      "app/p/[token]/page.tsx",
      "components/pages/page-document-actions.tsx",
      "lib/server/pages-export.ts",
      "components/pages/page-print-view.tsx"
    ]
  },
  "review": {
    "revision": 5,
    "fact": "agent:/root/german_spanish_review (structural consolidation review; prior procedural evidence retained; no operational rerun)",
    "language": "agent:/root/german_spanish_review (de title, summary, lead and heading review; retained body comparison)",
    "date": "2026-10-09"
  },
  "related": [
    "notifications-and-inbox",
    "storage-and-attachments",
    "trash-and-recovery",
    "views",
    "permissions-and-public-links",
    "databases"
  ],
  "aliases": [
    "create-and-organize-pages",
    "page-editor",
    "page-comments-and-collaboration",
    "page-files",
    "page-history",
    "publish-a-page",
    "import-export-and-print-pages"
  ],
  "tags": [
    "Ein Projektwiki aufbauen",
    "Eine Seite mit Blöcken und Erwähnungen schreiben",
    "Eine Seite besprechen und Konflikte lösen",
    "Seitendateien anhängen und abrufen",
    "Eine Seitenversion prüfen und wiederherstellen",
    "Eine Seite veröffentlichen und ihren Link widerrufen",
    "Eine Seite exportieren oder drucken"
  ],
  "figures": [
    {
      "id": "create-and-organize-pages-steps",
      "kind": "screenshot",
      "src": "/documentation/de/page-create-menu.png",
      "alt": "Erstellungsmenü mit Neue Seite und Neue Datenbank.",
      "caption": "Wähle über die Seitenfunktionen des Projekts ein Dokument oder eine Datenbank.",
      "revision": 5,
      "reviewed": true,
      "capturedAt": "2026-10-08",
      "viewport": [
        264,
        152
      ],
      "theme": "light",
      "padding": 24
    },
    {
      "id": "page-editor-steps",
      "kind": "screenshot",
      "src": "/documentation/de/page-editor.png",
      "alt": "Demoseite mit Überschriften, Absätzen, Aufgaben mit Kontrollkästchen und einer Ticketreferenz.",
      "caption": "Überschriften, Aufgabenblöcke und die Referenz AUR-2 gliedern die Seite. Der Inhalt dient als Demobeispiel.",
      "revision": 5,
      "reviewed": true,
      "capturedAt": "2026-10-08",
      "viewport": [
        1178,
        1026
      ],
      "theme": "light",
      "padding": 24
    },
    {
      "id": "page-comments-and-collaboration-steps",
      "kind": "screenshot",
      "src": "/documentation/de/page-comments.png",
      "alt": "Seitenaktivität mit einer Demoänderung und einem leeren Kommentarfeld.",
      "caption": "Lies die Seitenaktivität und verfasse einen Kommentar im Eingabefeld. In diesem Beispiel wurde keiner abgesendet.",
      "revision": 5,
      "reviewed": true,
      "capturedAt": "2026-10-08",
      "viewport": [
        632,
        625
      ],
      "theme": "light",
      "padding": 24
    },
    {
      "id": "page-files-steps",
      "kind": "screenshot",
      "src": "/documentation/de/page-file-states.png",
      "alt": "Demoseite mit einem unvollständigen Upload und einer gespeicherten Datei von 67 Byte mit Downloadfunktion.",
      "caption": "Prüfe den tatsächlichen Dateizustand: Der zweite Anhang ist verfügbar, der erste unvollständige Upload nicht.",
      "revision": 5,
      "reviewed": true,
      "capturedAt": "2026-10-08",
      "viewport": [
        1178,
        466
      ],
      "theme": "light",
      "padding": 24
    },
    {
      "id": "page-history-steps",
      "kind": "screenshot",
      "src": "/documentation/de/page-history-preview.png",
      "alt": "Versionen-Tab mit aufgeklapptem früherem Zustand, Autor, Wiederherstellen und Hinweis auf 30 Tage Aufbewahrung.",
      "caption": "Prüfe einen gespeicherten Zustand in der Vorschau und vergleiche ihn vor dem Wiederherstellen mit der aktuellen Seite.",
      "revision": 5,
      "reviewed": true,
      "capturedAt": "2026-10-08",
      "viewport": [
        632,
        538
      ],
      "theme": "light",
      "padding": 24
    },
    {
      "id": "publish-a-page-steps",
      "kind": "screenshot",
      "src": "/documentation/de/page-publish.png",
      "alt": "Veröffentlichungsdialog mit ausgewähltem Privat und Alternativen für Passwort oder Link.",
      "caption": "Privat hält die Seite im Projekt. Prüfe die vorgesehene Zielgruppe vor einer Änderung der Freigabe.",
      "revision": 5,
      "reviewed": true,
      "capturedAt": "2026-10-09",
      "viewport": [
        496,
        230
      ],
      "theme": "light",
      "padding": 24
    },
    {
      "id": "import-export-and-print-pages-steps",
      "kind": "screenshot",
      "src": "/documentation/de/page-export.png",
      "alt": "Exportmenü des Dokuments mit Markdown (.md) und Drucken / PDF.",
      "caption": "Wähle Markdown zum Herunterladen oder Drucken / PDF für die Druckansicht.",
      "revision": 5,
      "reviewed": true,
      "capturedAt": "2026-10-09",
      "viewport": [
        211,
        128
      ],
      "theme": "light",
      "padding": 24
    }
  ],
  "requiredFigures": [
    "create-and-organize-pages-steps",
    "page-editor-steps",
    "page-comments-and-collaboration-steps",
    "page-files-steps",
    "page-history-steps",
    "publish-a-page-steps",
    "import-export-and-print-pages-steps"
  ]
}
---

Seiten enthalten das Wissen eines Projekts als Dokumente und Unterseiten. Hier findest du Organisation, Bearbeitung, Zusammenarbeit, Anhänge, Versionsverlauf, Veröffentlichung und Export. Einen allgemeinen Dokumentimport bietet das Seitenmenü nicht; unterstützte Importe beginnen in einer leeren Datenbank.

## Ein Projektwiki aufbauen {#create-and-organize-pages}

Öffne den Seitenbereich eines Projekts, dessen Mitglied du bist. Wähle im +-Menü eine Seite für ein Dokument oder eine Datenbank für eine strukturierte Liste. Gib der Seite einen hilfreichen Titel und schreibe die Spezifikation, Entscheidung oder Vorgehensweise, die sie bewahren soll.

Erstelle Unterseiten für zusammengehörige Dokumente und verschiebe oder ordne sie mit den Baumfunktionen. Eine Seite darf nicht unter sich selbst eingeordnet werden. Das Duplizieren erzeugt neue Inhalte statt eines aktuellen Verweises auf das Original. Prüfe den Zweig der Kopie vor Bearbeitung oder Freigabe.

### Favoriten und Löschen {#page-tree}

Markiere eine Seite als Favorit, damit sie oben im Seitenbaum des Projekts erscheint. Diese Favoriten werden im Projekt geteilt, anders als eine private Notiz im Aufgabenheft. Verknüpfe eine Seite mit einem Ticket, wenn das aktuelle Dokument den Aufgabenkontext liefert; der Ressourcentitel folgt einer Umbenennung der Seite.

Das Löschen verschiebt Seiten, für die eine Wiederherstellung vorgesehen ist in den Papierkorb. Prüfe den ausgewählten Zweig vor dem Löschen und verwende die Wiederherstellung statt einer Neuerstellung, wenn der Inhalt einer verlorenen Seite erhalten bleiben soll. Einträge mit gespeicherten Datenbankwerten lassen sich innerhalb ihrer Datenbank umordnen, aber nicht aus ihr heraus verschieben. Prüfe bei einem abgewiesenen Verschieben Hierarchie und Eintragstyp, statt es wiederholt zu erzwingen.


![Erstellungsmenü mit Neue Seite und Neue Datenbank.](/documentation/de/page-create-menu.png)

## Eine Seite mit Blöcken und Erwähnungen schreiben {#page-editor}

Öffne die Seite und bearbeite als Projektmitglied Titel oder Inhalt. Verwende das Slash-Befehlsmenü und die Formatierungsfunktionen für Überschriften, Absätze, Listen, Aufgaben, Code, aufklappbare Abschnitte und Hinweisblöcke. Ein Hinweisblock kann ein Emoji-Symbol und eine Palettenfarbe haben. Unterscheide damit hilfreiche Informationen, ohne eine Warnung allein durch Symbol oder Farbe auszudrücken.

Verwende Erwähnungen, um passende Probleme, Ziele, Personen oder Seiten zu verknüpfen. Rückverweise helfen Lesern, Seiten zu finden, die auf die aktuelle Seite verweisen. Ein Link liefert Kontext, gewährt aber keinen Zugriff auf private Objekte eines anderen Projekts.


![Demoseite mit Überschriften, Absätzen, Aufgaben mit Kontrollkästchen und einer Ticketreferenz.](/documentation/de/page-editor.png)

### Speichern und Übertragbarkeit {#editor-save}

Beobachte die Speicheranzeige, bevor du nach einer größeren Bearbeitung wegnavigierst. Erzeugt eine andere Änderung einen Konflikt, nutze die angezeigten Wiederherstellungsfunktionen und bewahre deinen Text; gehe nicht davon aus, dass beide Änderungen zusammengeführt wurden. Der Seitenverlauf hilft, früher gespeicherte Versionen zu prüfen.

Markdown-Exporte und Seitenzugriffe durch Agenten erhalten Symbole und Farben von Hinweisblöcken in der unterstützten Darstellung. Exportformate unterscheiden sich in Wiedergabetreue und Anhangsbehandlung. Prüfe das entstandene Dokument, bevor du eine Originalquelle ersetzt. Verwende Codeblöcke für wörtliche Befehle und bewahre Voraussetzungen und Warnungen im umgebenden Text.

## Eine Seite besprechen und Konflikte lösen {#page-comments-and-collaboration}

Öffne eine Projektseite und ihre Kommentarfunktionen. Wähle passende Inhalte aus, wenn du einen verankerten Kommentar erstellst, erkläre die Frage oder Änderung und erwähne bei Bedarf ein Projektmitglied. Antworte im Verlauf, damit die Entscheidung bei ihrem Kontext bleibt. Markiere den Verlauf erst als erledigt, wenn seine Frage tatsächlich beantwortet wurde.

Anwesenheitsavatare zeigen Personen, die die Seite ansehen. Sie beweisen nicht, dass der ungespeicherte Text einer anderen Person den Server erreicht hat oder gleichzeitige Bearbeitungen automatisch zusammengeführt werden. Prüfe den aktuellen Speicherzustand vor dem Wegnavigieren.


![Seitenaktivität mit einer Demoänderung und einem leeren Kommentarfeld.](/documentation/de/page-comments.png)

### Einen Speicherkonflikt lösen {#page-conflict}

minddy führt Änderungen an unterschiedlichen Blöcken auf der obersten Dokumentebene zusammen, wenn sich beide Änderungen erhalten lassen. Gleichzeitige Textänderungen innerhalb desselben Blocks werden nicht Zeichen für Zeichen zusammengeführt. Haben beide Personen diesen Block geändert, übernimmt das Dokument die entfernte Version und ein Hinweis bietet deinen bisherigen Block zur Prüfung an.

Vergleiche den genannten Block mit dem aktuellen Dokument. Wähle die Aktion zum Wiederherstellen deiner Fassung nur dann, wenn du diesen Block wirklich durch deine Version ersetzen möchtest. War deine kollidierende Aktion eine Löschung, wendet die Aktion zum erneuten Löschen sie ausdrücklich an. Das Verwerfen des Hinweises behält das übernommene Dokument bei und schließt die Warnung; es stellt deine Fassung nicht wieder her. Sichere gewünschten Text vor dem Schließen und prüfe gespeicherte Versionen im Verlauf, wenn du mehr wiederherstellen musst. Diese Entscheidungen betreffen den bezeichneten Block, statt ungeprüft die ganze Seite zu ersetzen.

Ein fehlender Kommentaranker kann durch Dokumentänderungen entstehen. Lies die Diskussion vor dem Verschieben oder Löschen des referenzierten Blocks. Kommentare und Aktivität sind projektintern, sofern Inhalte nicht ausdrücklich über eine unterstützte Freigabe veröffentlicht werden. Prüfe die tatsächliche Besuchersicht an einer veröffentlichten Seite, statt anzunehmen, dass Zusammenarbeitsfunktionen des Projekts öffentlich werden.

## Seitendateien anhängen und abrufen {#page-files}

Öffne die Seite als Projektmitglied und verwende die Anhangs- oder Uploadfunktionen. Wähle eine nicht leere Datei innerhalb der Grenze von 10 MB je Datei. Die Speicherquote deines Kontos oder deiner Instanz kann zusätzlich begrenzen. Bewahre das Original auf, bis das Hochladen erfolgreich ist.

Bilder lassen sich als Bildblöcke einfügen, andere Dokumente als Dateiblöcke anhängen. Der Server ermittelt den gespeicherten Medientyp aus den Dateibytes, statt dem Dateinamen oder der Browserangabe zu vertrauen. Eine akzeptierte Datei hat nicht zwingend eine Vorschau innerhalb der Seite. Lade sie herunter, wenn keine Vorschau verfügbar ist.

Prüfe, ob die Datei auf der Seite erscheint, und öffne sie oder lade sie herunter. Die Dateidaten liegen in Storage; Seiten- und Dateimetadaten bestimmen den Zugriff. Ein erfolgreiches Speichern der Seite beweist allein nicht, dass die Dateidaten verfügbar sind.

### Geteilte Dateien und Fehler {#file-access}

Eine auf einer veröffentlichten Seite referenzierte Datei kann deren Besuchern zugänglich gemacht werden. Dateien von Seiten außerhalb des veröffentlichten Zweigs werden nicht allein durch einen Verweis auf einer anderen Seite verfügbar. Prüfe vor der Freigabe die enthaltene Seite und ihre Unterseiten.

Schlägt Hochladen fehl, prüfe Größe, Speicherquote und Fehlermeldung. Bei Selbsthosting sollte der Betreiber außerdem Storage-Konfiguration und Richtlinien prüfen. Fehlt eine Datei nach einer Wiederherstellung, stelle die passenden Storage-Dateidaten und Metadaten wieder her; eine reine Datenbankwiederherstellung kann die Datei nicht rekonstruieren. Veröffentlichte Datei-URLs werden beim Rendern der Seite für bis zu 24 Stunden signiert. Der Widerruf einer Freigabe beendet neue autorisierte Seitenbesuche, macht aber bereits ausgegebene Datei-URLs nicht sofort ungültig. Sie können bis zu ihrem Ablauf weiterhin nutzbar sein. Bereits heruntergeladene Kopien lassen sich nicht zurückholen.


![Demoseite mit einem unvollständigen Upload und einer gespeicherten Datei von 67 Byte mit Downloadfunktion.](/documentation/de/page-file-states.png)

## Eine Seitenversion prüfen und wiederherstellen {#page-history}

Öffne die Speicher- oder Verlaufsanzeige der Seite, um Versionen anzusehen, oder ihre Kommentar- beziehungsweise Aktivitätsfunktion, um Aktionen zu prüfen. Die Tabs beantworten verschiedene Fragen: Eine gespeicherte Version ist ein Dokumentzustand; Aktivität kann Umbenennungen, Löschungen oder Wiederherstellungen ohne dieselbe Inhaltsaufnahme enthalten.

Wähle eine Version zur Vorschau vor der Wiederherstellung. Der Verlauf zeigt Autoren und Agentenaktivität. Vergleiche den Inhalt daher mit der Änderung, die du rückgängig machen möchtest. Die Oberfläche nennt ein Verlaufsfenster von 30 Tagen; betrachte den Verlauf nicht als dauerhafte externe Sicherung.

### Wiederherstellen und prüfen {#restore-page-version}

Stelle als berechtigtes Projektmitglied die gewählte Version erst wieder her, nachdem du den aktuellen Inhalt geprüft hast, den sie ersetzen wird. Der Zustand vor der Wiederherstellung geht selbst in den Verlauf ein und kann später wiederhergestellt werden, solange er aufbewahrt wird.

Öffne oder aktualisiere nach der Wiederherstellung den Seiteneditor und prüfe den tatsächlichen Inhalt. Ein zuvor offener Editor hält eine veraltete Version und darf den wiederhergestellten Zustand nicht blind überschreiben. Seitenversionen sind keine vollständigen Instanzsicherungen: Dateidaten von Anhängen, gelöschte Dateien oder verbundene Objekte können eigene Lebenszyklen haben. Verwende die Datei- und Betreiber-Wiederherstellungsanleitungen, wenn Informationen außerhalb des gespeicherten Dokumentinhalts fehlen.


![Versionen-Tab mit aufgeklapptem früherem Zustand, Autor, Wiederherstellen und Hinweis auf 30 Tage Aufbewahrung.](/documentation/de/page-history-preview.png)

## Eine Seite veröffentlichen und ihren Link widerrufen {#publish-a-page}

Öffne als Mitglied eine Projektseite und verwende ihre Veröffentlichungsfunktionen. Prüfe zuerst Inhalte und Anhänge. Wähle privaten, passwortgeschützten oder öffentlichen Zugriff. Der Passwortschutz benötigt mindestens acht Zeichen und wird erst nach Absenden des Passworts angewendet; die Modusauswahl allein erzeugt keinen geschützten Link.

Kopiere den erzeugten /p/-Link nach erfolgreicher Veröffentlichung. Hat die Seite Unterseiten, prüfe die Option zum Einschließen und deren Anzahl. Das Einschließen veröffentlicht den gewählten Zweig; ohne Einschließen bleiben die Inhalte außerhalb dieser Veröffentlichung. Eine Datenbank ohne veröffentlichte Unterseiten legt nicht automatisch alle Eintragsinhalte offen.

Öffne den Link in einer gesonderten Browsersitzung ohne dein Konto. Prüfe ein aktiviertes Passwort, Seiteninhalt, vorgesehene Unterseiten und Dateidownloads. So prüfst du den Lesezugriff von Besuchern statt deiner weitergehenden Mitgliedsrechte.


![Veröffentlichungsdialog mit ausgewähltem Privat und Alternativen für Passwort oder Link.](/documentation/de/page-publish.png)

### Widerrufen und prüfen {#revoke-page}

Kehre zu den Veröffentlichungsfunktionen zurück und wähle privat. Öffne nach erfolgreichem Widerruf den alten Link anonym und prüfe die Zugriffsverweigerung. Bereits empfangene Kopien oder Bildschirmaufnahmen lassen sich nicht zurückholen. Dateidownload-URLs, die eine veröffentlichte Seite bereits ausgegeben hat, werden für bis zu 24 Stunden signiert. Ein Widerruf verhindert neue Seitenbesuche, doch diese schon ausgegebenen Datei-URLs können bis zu ihrem Ablauf gültig bleiben.

Benutzerseitenlinks bleiben auf noindex und sind von der indexierten offiziellen Anleitung getrennt. Noindex ist eine Auffindbarkeitsregel, kein Zugriffspasswort. Ist eine Unterseite oder Datei unerwartet lesbar, widerrufe zuerst, prüfe den veröffentlichten Zweig und teste erneut, bevor du einen korrigierten Link weiterleitest. Dateien unveröffentlichter Seiten erhalten durch einen internen Verweis keinen Zugriff.

## Eine Seite exportieren oder drucken {#import-export-and-print-pages}

Öffne das Dokumentmenü der Seite und wähle Exportieren. Wähle Markdown für eine Seite (.md) oder einen Zweig (.zip), PDF für die Druckansicht oder das Datenbankarchiv, wenn die Seite eine Datenbank ist. Prüfe vor dem Bestätigen den angebotenen Umfang: Eine einzelne Seite, ihr Zweig und ein Datenbankarchiv enthalten unterschiedliche Inhalte.

Öffne den Export und prüfe die Überschriften, Hinweisblöcke, Links und Anhänge, die die Leser benötigen. Die PDF-Aktion öffnet eine lesbare Druckansicht ohne die gesamte Anwendungsnavigation. Verwende die Druckfunktionen deines Browsers zum Drucken oder Speichern als PDF. Im Dokumentmenü gibt es keine allgemeine Importaktion. Unterstützte Importe starten von einer leeren Datenbank aus, wie im Leitfaden zum Datenbankimport beschrieben.


![Exportmenü des Dokuments mit Markdown (.md) und Drucken / PDF.](/documentation/de/page-export.png)

### Datenbankarchive und Grenzen {#export-fidelity}

Ein Datenbankarchiv (.zip) enthält den zugehörigen Zweig: Markdown und CSV, das genaue Schema und die Optionsfarben, Werte, Inhalte, Zeitstempel, verschachtelte Seiten und die Dateiinhalte. Importiere es in eine neue, leere Datenbank, um diese Struktur wiederherzustellen. Gerätespezifische Filter, Sortierungen und Einstellungen für ausgeblendete Spalten bleiben auf dem ursprünglichen Gerät.

Ein Export überträgt keine Passwörter, Zugangsdaten von Kontoanbietern oder Abonnements. Zum Übertragen deiner Arbeit zwischen Instanzen verwende den Leitfaden zum Kontodatentransfer. Kann ein importiertes Format einen Block oder eine externe Eigenschaft nicht erhalten, prüfe das Ergebnis, bevor du es als Ersatz verwendest. Lösche das Original nicht allein deshalb, weil eine Datei heruntergeladen wurde.

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
  "revision": 24,
  "sourceRevision": 22,
  "owner": "@mangue-dev",
  "updatedAt": "2026-10-29",
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
      "components/pages/page-create-menu.tsx",
      "components/pages/page-tree.tsx",
      "components/pages/page-editor.tsx",
      "components/pages/page-slash-command.tsx",
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
      "components/pages/page-print-view.tsx",
      "components/file-viewer.tsx",
      "components/image-viewer.tsx",
      "docs/security/project-roles.md",
      "lib/project-roles.ts",
      "lib/use-semantic-mentions.ts",
      "components/markdown-mention.tsx",
      "components/editor/comment-editor.tsx",
      "docs/page-collaboration.md",
      "lib/use-page-collaboration.ts",
      "lib/page-collaboration-stream.ts",
      "components/pages/page-promotion-context.tsx",
      "components/pages/page-promotion-context.test.tsx",
      "components/pages/page-database-view.tsx",
      "lib/server/page-database-views.ts",
      "components/pages/page-comment-bubble.tsx",
      "components/editor/mobile-editor-toolbar.tsx",
      "components/editor/rich-editor.tsx",
      "components/pages/page-extensions.ts",
      "components/pages/blocks/image.ts",
      "lib/pages-markdown.ts",
      "components/pages/blocks/subpage.ts",
      "lib/server/pages.ts",
      "lib/pages-subpage.ts",
      "lib/pages-export.ts",
      "components/public-page-body.tsx",
      "components/pages/page-comment-dialog.tsx",
      "lib/keyboard/shortcuts.ts",
      "components/editor/find-bar.tsx",
      "components/editor/find-replace.ts",
      "lib/keyboard/find-shortcut.ts",
      "components/pages/blocks/math.ts",
      "components/editor/math-edit-menu.tsx",
      "components/code-block-lowlight.ts",
      "app/globals.css",
      "components/pages/page-peek-panel.tsx",
      "components/global-page-panel.tsx",
      "components/pages/pages-shell.tsx",
      "components/pages/block-gutter.tsx",
      "components/editor/suggestion-menu.tsx",
      "components/editor/suggestion-chip.ts",
      "components/editor/suggestion-menu.test.tsx",
      "components/editor/block-selection.ts",
      "components/editor/document-editor.tsx",
      "app/tokens.css",
      "components/pages/block-actions.ts",
      "lib/selection-menu-visibility.test.ts",
      "lib/mention-menu.ts",
      "components/pages/block-menu.tsx",
      "lib/action-menu-search.ts",
      "components/pages/block-drag.ts"
    ]
  },
  "review": {
    "revision": 24,
    "fact": "agent:claude-code (list items as blocks with their own handle: handle left of the list, + adding an item of the same kind below or above with Alt/Option-click and the / menu open, dragging among lists of the same kind of item including nested lists, emptied lists removed, handle menu acting on the item or the selection; checked against components/pages/block-gutter.tsx, components/pages/block-actions.ts and components/pages/block-drag.ts; not checked in the running app; rest of the article unchanged since the previous review; no figure recaptured, existing figures do not show list item handles)",
    "language": "agent:claude-code (de changed passages with catalog UI labels; self-reviewed; agent review, not human acceptance)",
    "date": "2026-10-29"
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
      "revision": 24,
      "reviewed": true,
      "capturedAt": "2026-10-20",
      "viewport": [
        240,
        129
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
      "revision": 24,
      "reviewed": true,
      "capturedAt": "2026-10-22",
      "viewport": [
        1154,
        1046
      ],
      "theme": "light",
      "padding": 24,
      "deviceScaleFactor": 2
    },
    {
      "id": "page-comments-and-collaboration-steps",
      "kind": "screenshot",
      "src": "/documentation/de/page-comments.png",
      "alt": "Seitenaktivität ohne bisherige Einträge und ein leeres Kommentarfeld.",
      "caption": "Lies die Seitenaktivität und verfasse einen Kommentar im Eingabefeld. In diesem Beispiel wurde keiner abgesendet.",
      "revision": 24,
      "reviewed": true,
      "capturedAt": "2026-10-22",
      "viewport": [
        608,
        616
      ],
      "theme": "light",
      "padding": 24,
      "deviceScaleFactor": 2
    },
    {
      "id": "page-files-steps",
      "kind": "screenshot",
      "src": "/documentation/de/page-file-states.png",
      "alt": "Demoseite mit einem unvollständigen Upload und einer gespeicherten Datei von 67 Byte mit Downloadfunktion.",
      "caption": "Prüfe den tatsächlichen Dateizustand: Der zweite Anhang ist verfügbar, der erste unvollständige Upload nicht.",
      "revision": 24,
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
      "revision": 24,
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
      "revision": 24,
      "reviewed": true,
      "capturedAt": "2026-10-20",
      "viewport": [
        496,
        234
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
      "revision": 24,
      "reviewed": true,
      "capturedAt": "2026-10-20",
      "viewport": [
        212,
        128
      ],
      "theme": "light",
      "padding": 24
    },
    {
      "id": "page-file-preview",
      "kind": "screenshot",
      "src": "/documentation/de/file-preview.png",
      "alt": "Fensterfüllender CSV-Betrachter mit Beispielaufgaben, großer Schaltfläche Schließen und dem Menü Dateiaktionen mit Herunterladen, Umbenennen und Entfernen.",
      "caption": "Der gemeinsame Dateibetrachter zeigt Schließen unter der Vorschau. Das Menü Dateiaktionen bietet Herunterladen und bei entsprechender Berechtigung Umbenennen und Entfernen.",
      "revision": 24,
      "reviewed": true,
      "capturedAt": "2026-10-12",
      "viewport": [
        1168,
        808
      ],
      "theme": "light",
      "padding": 24,
      "deviceScaleFactor": 2
    }
  ],
  "requiredFigures": [
    "create-and-organize-pages-steps",
    "page-editor-steps",
    "page-comments-and-collaboration-steps",
    "page-files-steps",
    "page-history-steps",
    "publish-a-page-steps",
    "import-export-and-print-pages-steps",
    "page-file-preview"
  ]
}
---

Seiten bilden das Wiki eines Projekts mit Dokumenten, Unterseiten und Datenbankeinträgen. Du kannst Inhalte organisieren und bearbeiten, zusammenarbeiten, Dateien und Versionen verwalten und einen Zweig veröffentlichen oder exportieren. Importe beginnen in einer leeren Datenbank; folge dafür der [Datenbankanleitung](/de/dokumentation/databases#import-a-database).

## Ein Projektwiki aufbauen {#create-and-organize-pages}

Öffne den Seitenbereich eines Projekts als Eigentümer oder Mitglied; Leser können Seiten öffnen, aber keine erstellen. Wähle im +-Menü eine Seite für ein Dokument oder eine Datenbank für eine strukturierte Liste. Gib der Seite einen hilfreichen Titel und schreibe die Spezifikation, Entscheidung oder Vorgehensweise, die sie bewahren soll.

Erstelle Unterseiten für zusammengehörige Dokumente und verschiebe oder ordne sie mit den Baumfunktionen. Eine Seite darf nicht unter sich selbst eingeordnet werden. Das Duplizieren erzeugt neue Inhalte statt eines aktuellen Verweises auf das Original. Prüfe den Zweig der Kopie vor Bearbeitung oder Freigabe. Um beim Schreiben eine Unterseite zu erstellen, tippe `/` und wähle **Unterseite**: minddy erstellt die untergeordnete Seite unter der aktuellen, fügt ihre Erwähnung an der Cursorposition mit einem folgenden Leerzeichen ein und öffnet die neue Seite dann im Seitenpanel neben der Seite, an der du schreibst; mit **Vergrößern** öffnest du sie vollständig. Du kannst in derselben Zeile nach der Erwähnung weiterschreiben, wie nach jeder Erwähnung. Eine in der Seitenleiste erstellte Seite öffnet sich vollständig. Eine ältere Seite kann noch Unterseitenblöcke zeigen: Wenn sie zum ersten Mal von jemandem mit Bearbeitungsrecht geöffnet wird, wird jeder Block zu einer Zeile, die nur die Erwähnung der Unterseite enthält, und Kommentare und Blocklinks verweisen weiterhin darauf. Das Öffnen durch Leser wandelt nichts um. Wenn du eine Seite mit ihren Unterseiten duplizierst, verweisen Erwähnungen der kopierten Seiten auf die Kopien, auch innerhalb von Sätzen.

### Favoriten und Löschen {#page-tree}

Markiere eine Seite als Favorit, damit sie oben im Seitenbaum des Projekts erscheint. Diese Favoriten werden im Projekt geteilt, anders als eine private Notiz im Aufgabennotizbuch. Verknüpfe eine Seite mit einem Ticket, wenn das aktuelle Dokument den Aufgabenkontext liefert; der Ressourcentitel folgt einer Umbenennung der Seite. Im `…`-Menü der geöffneten Seite bietet **Kopieren** die Einträge **Link kopieren** und **Seiteninhalt kopieren**; Letzteres kopiert Titel und Inhalt als Markdown (bei einer Datenbank nicht angeboten). Command+Umschalt+L unter macOS oder Strg+Umschalt+L unter Windows/Linux kopiert den Link der geöffneten Seite.

Das Löschen verschiebt Seiten, für die eine Wiederherstellung vorgesehen ist, in den Papierkorb. In einem Seitenmenü fragt **In den Papierkorb verschieben** zuerst nach und nennt die Seite und wie viele Unterseiten mitgehen; sie lassen sich 30 Tage lang aus dem Papierkorb wiederherstellen. Das Löschen einer Erwähnung verschiebt nie eine Seite in den Papierkorb. Wenn du eine Unterseite im Seitenbaum in den Papierkorb verschiebst, wird die Zeile der übergeordneten Seite entfernt, die nur ihre Erwähnung enthält; beim Wiederherstellen wird diese Zeile am Ende der übergeordneten Seite wieder angefügt, außer die übergeordnete Seite erwähnt sie noch an anderer Stelle. Eine Erwähnung innerhalb eines Satzes wird nie entfernt. Prüfe den ausgewählten Zweig vor dem Löschen und verwende die Wiederherstellung statt einer Neuerstellung, wenn der Inhalt einer verlorenen Seite erhalten bleiben soll. Einträge mit gespeicherten Datenbankwerten lassen sich innerhalb ihrer Datenbank umordnen, aber nicht aus ihr heraus verschieben. Prüfe bei einem abgewiesenen Verschieben Hierarchie und Eintragstyp, statt es wiederholt zu erzwingen.


![Erstellungsmenü mit Neue Seite und Neue Datenbank.](/documentation/de/page-create-menu.png)

Halte die Umschalttaste gedrückt und klicke auf Seiten im Baum, um mehrere auszuwählen; der Klick wählt sie aus, statt sie in einem neuen Fenster zu öffnen, und ein Klick auf eine leere Stelle des Baums hebt die Auswahl auf. **Aktionen** in der schwebenden Leiste oder Command+K unter macOS bzw. Strg+K auf anderen Systemen stuft sie in einer einzigen Numo-Konversation zu Tickets hoch, die ein Ticket pro Seite erstellt, fügt sie den Favoriten hinzu, entfernt sie daraus oder verschiebt sie nach einer Bestätigung samt Unterseiten in den Papierkorb. **Numo fragen** öffnet Numo mit allen ausgewählten Seiten im Kontext.

## Eine Seite zum Ticket hochstufen {#promote-page-to-issue}

Wenn eine Seite anstehende Arbeit beschreibt, kann der Eigentümer oder ein Mitglied sie mit Numo in ein Ticket umwandeln. Leser sehen diese Aktion nicht. Dafür benötigst du verfügbares KI-Kontingent oder einen kompatiblen persönlichen Schlüssel.

1. Wähle **Zu Ticket hochstufen** im Menü der Seite im Seitenbaum (`…` oder Rechtsklick auf die Zeile) oder im `…`-Menü der geöffneten Seite (**Seitenoptionen**). Dieselbe Aktion gibt es für einen Datenbankeintrag, der im Seitenpanel geöffnet ist, und im Griffmenü eines einzelnen Eintrags, wie in der [Datenbankanleitung](/de/dokumentation/databases#entry-actions) beschrieben.
2. Hat die geöffnete Seite ungespeicherte Änderungen, speichert minddy sie zuerst. Schlägt das Speichern fehl, meldet minddy, dass die Seite nicht gespeichert werden konnte, und Numo öffnet sich nicht. Stufe die Seite erneut hoch, sobald sie gespeichert ist.
3. Numo öffnet sich im Projekt der Seite mit der Seite als Kontext und erhält die Anfrage, ihren Titel, ihren Inhalt und bei einem Datenbankeintrag dessen Eigenschaften zu lesen. Ist die Seite unklar oder lässt eine Datenbank offen, was das Ticket umfassen soll, stellt Numo zuerst Fragen. Beantworte sie im Gespräch.
4. Numo erstellt ein einziges Ticket und hängt die Seite daran an. Öffne das Ticket und prüfe Kennung, Umfang, Eigenschaften und die angehängte Seite.

Anders als eine übernommene Aufgabe aus dem Aufgabennotizbuch wird die Seite nicht entfernt: Sie bleibt mit Inhalt und Unterseiten an ihrem Platz im Baum. Wenn die Erstellung fehlschlägt oder das Ergebnis nach einem Netzwerkfehler unklar bleibt, suche nach dem Ticket, bevor du die Seite erneut hochstufst.

## Eine Seite mit Blöcken und Erwähnungen schreiben {#page-editor}

Öffne die Seite und bearbeite als Eigentümer oder Mitglied Titel oder Inhalt. Leser können Seiten öffnen und lesen, sie aber weder bearbeiten, importieren, duplizieren, zu Favoriten hinzufügen oder veröffentlichen noch eine Version wiederherstellen. Verwende das Slash-Befehlsmenü und die Formatierungsfunktionen für Überschriften, Text, Aufzählungs-, nummerierte und Aufgabenlisten, Zitate, Hinweisblöcke, Codeblöcke, Gleichungen, Teiler, Umschalter (aufklappbare Abschnitte), Unterseiten, Bilder und Dateien. Ein Hinweisblock kann ein Emoji-Symbol und eine Palettenfarbe haben. Unterscheide damit hilfreiche Informationen, ohne eine Warnung allein durch Symbol oder Farbe auszudrücken. Eine **Gleichung** wird in LaTeX geschrieben und mit KaTeX dargestellt. Wähle sie im `/`-Menü für eine Gleichung in eigener Zeile, oder tippe LaTeX in einem Satz zwischen `$$`, etwa `$$x^2$$`, für eine Gleichung im Text. Klicke auf eine Gleichung, um ihr LaTeX mit Live-Vorschau zu bearbeiten, am Computer in einem Popover, auf dem Telefon in einem Bereich am unteren Rand. LaTeX, das nicht dargestellt werden kann, erscheint rot mit einem Hinweis, und eine leer gespeicherte Gleichung wird entfernt.

Das Menü `/` ordnet die Blöcke unter **Grundblöcke**, **Listen** und **Erweiterte Blöcke** an, und das Menü `@` gruppiert nach Typ, was du erwähnen kannst, etwa **Personen**, **Tickets** oder **Seiten**. Solange ein Menü offen ist, erscheinen `/` oder `@` und das, was du danach tippst, als hervorgehobener Chip im Text, mit **Tippe, um zu suchen**, bis du einen Buchstaben eingibst. Mit den Pfeiltasten gehst du durch alle Abschnitte, mit Enter oder Tab wählst du aus. Drücke Escape, tippe zwei Leerzeichen hintereinander oder wähle **Menü schließen** unten im Menü, um es zu schließen: Was du getippt hast, bleibt normaler Text. Ein Leerzeichen direkt nach dem alleinstehenden `/` oder `@` schließt das Menü ebenfalls. Sobald du einen Suchbegriff getippt hast, bleibt ein einzelnes Leerzeichen Teil der Suche, sodass `/Nummerierte Liste` oder `@Camille Roy` so gesucht wird, wie du es tippst. Das Menü schließt sich auch, wenn die Suche nichts findet, außer eine inhaltliche Suche läuft noch.

Verwende Erwähnungen, um passende Tickets, Ziele, Personen oder Seiten zu verknüpfen. Tippe `@` gefolgt von einer Kennung, einem Namen oder einem Titel, auch mit einzelnen Leerzeichen; das Menü schließt sich auf dieselben Weisen wie das Menü `/` und bei der Wahl eines Eintrags. Ein Wort, das die Arbeit beschreibt, statt sie zu benennen, listet nach den Textübereinstimmungen auch [inhaltlich gefundene](/docs/navigation#search-by-meaning) Tickets unter **Inhaltlich verwandt** auf. Rückverweise helfen Lesern, Seiten zu finden, die auf die aktuelle Seite verweisen. Ein Link liefert Kontext, gewährt aber keinen Zugriff auf private Objekte eines anderen Projekts. Die Erwähnung einer Seite, die noch keinen Titel hat, lautet **Ohne Titel**.

Sobald du `@` tippst, zeigt das Menü auch das Aufgabennotizbuch und deinen aktuellen und kommende Zyklen unter **Planung** (Zyklen nur, wenn sie aktiviert sind), deine Routinen, die Repository-Skills des Projekts, deine verbundenen MCP-Server und Pull Requests, offene zuerst. Eine Erwähnung speichert nur, worauf sie zeigt, nie einen Namen: Alle Lesenden sehen den aktuellen Namen des Ziels, und ein Ziel, das sie nicht öffnen können, erscheint als **Nicht verfügbar**. Tippe nach `@` ein Datum, etwa `@heute`, `@morgen`, `@nächster Montag`, `@in 3 Wochen`, `@15 November` oder `@morgen 9:00`, und wähle es unter **Daten**. Das Datum steht fest, sobald du es schreibst: Es lautet **Heute**, **Morgen** oder **Gestern**, solange es so nah ist, danach das vollständige Datum. Klicke in einem Editor auf ein Datum, um es zu ändern oder eine Uhrzeit hinzuzufügen. Eine Datumserwähnung sendet keine Erinnerung. Akzente und ausgeschriebene Wörter sind optional: `@Donnerstag in 2 Wochen`, `@übermorgen`, `@naechsten montag` oder `@15 Nov` funktionieren auch, ebenso ausgeschriebene Uhrzeiten wie `@morgen um halb 9` oder `@Freitag um viertel vor 9`. Ein Tippfehler pro Wort wird verziehen, zwei in einem langen Wort: `@morgn um halb 9` wird trotzdem gelesen. Tippe `@datum`, um die Datumsauswahl mit dem aktuellen Datum und der aktuellen Uhrzeit zu öffnen. Zeigt eine Erwähnung ein vollständiges Datum, verrät das Darüberfahren, wie weit es von jetzt entfernt ist, etwa „in 3 Wochen“. Der Numo-Composer und die Anweisung einer Routine bieten dieselben Erwähnungen an, Daten eingeschlossen.

Ein Klick auf die Erwähnung einer Seite, einen Rückverweis, eine an ein Ticket oder Ziel angehängte Seite oder einen Link auf eine Seite in einem Kommentar oder einer Antwort von Numo öffnet diese Seite in einem Seitenpanel über dem, was du gerade gelesen hast. Lies oder bearbeite sie dort, wähle **Vergrößern**, um die ganze Seite zu öffnen, oder schließe das Panel, um zurückzukehren. Zwischen **Vergrößern** und Schließen bietet das Menü **Seitenoptionen** (`…`) des Panels dieselben Aktionen wie auf der ganzen Seite; wenn du die Seite dort in den Papierkorb verschiebst, schließt sich das Panel und du bleibst auf der Seite darunter. Auch eine Datenbank öffnet sich im Panel, mit der kompakten Symbolleiste, die der [Leitfaden zu Datenbanken](/docs/databases#database-display) beschreibt; ein aus ihrer Tabelle geöffneter Eintrag tritt an ihre Stelle, und **Zurück** oben links im Panel führt zur Tabelle zurück.


![Demoseite mit Überschriften, Absätzen, Aufgaben mit Kontrollkästchen und einer Ticketreferenz.](/documentation/de/page-editor.png)

### Text formatieren und auf dem Smartphone schreiben {#editor-formatting}

Seiten, Beschreibungen, Kommentare und das Aufgabennotizbuch verwenden denselben Editor. Markiere Text oder, wie weiter unten beschrieben, ganze Blöcke, um die Auswahlleiste zu öffnen. Ihre erste Zeile zeigt den aktuellen Blocktyp: Wähle sie, um **Umwandeln in** zu öffnen und den Block zu ändern. Danach folgen **Farbe** für Text oder Hintergrund, **Fett**, **Kursiv**, **Unterstrichen**, **Durchgestrichen**, **Code**, **Link hinzufügen** (oder **Link entfernen** auf einem Link), **Inline-Gleichung**, das den markierten Text in eine Inline-Gleichung umwandelt oder zurück, **Formatierung entfernen** und **Kopieren**, das die Auswahl kopiert. Am Computer sendet eine Zeile **Numo fragen** die Passage an Numo, wie in der [Numo-Anleitung](/de/dokumentation/numo#work-with-numo) beschrieben, und auf einer Seite verankert eine Zeile **Kommentieren** einen Kommentar an der Auswahl. **Umwandeln in** markiert nur den Typ des Blocks, in dem die Auswahl liegt. In den Farblisten, hier und im Blockmenü, erscheint jede Farbe mit ihrem Namen, in dieser Farbe oder auf diesem Hintergrund geschrieben. Ein Klick außerhalb des Editors beendet die Auswahl und blendet die Leiste aus, ebenso die Wahl von **Kommentieren**. Die Tooltips zeigen die Tastenkürzel: Command+B, Command+I, Command+U, Command+Umschalt+S und Command+E unter macOS oder Strg mit denselben Tasten unter Windows/Linux. In einem Editor formatiert Command/Strg+B den Text fett; außerhalb blendet das Kürzel weiterhin die Seitenleiste ein oder aus. In einem Codeblock zeigt die Leiste nur den Blocktyp, **Farbe**, **Kopieren**, **Numo fragen** und **Kommentieren**: Eine Textfarbe ersetzt die Syntaxhervorhebung des Codes, eine Hintergrundfarbe behält sie bei, und die Standardfarbe stellt sie wieder her. Text- und Hintergrundfarben bleiben in Markdown nicht erhalten. Die Leiste folgt der markierten Passage, während die Seite scrollt, und schließt sich, sobald die Passage aus dem sichtbaren Bereich scrollt.

Umschalt+Eingabetaste beginnt eine neue Zeile im selben Block. Command/Strg+Eingabetaste fügt keinen Zeilenumbruch ein: In einem Kommentar oder einem anderen Eingabebereich sendet es, unabhängig vom Sende-Kürzel in deinen [Einstellungen](/de/dokumentation/accounts#preferences), und wenn du die Eingabetaste als Sende-Kürzel gewählt hast, sendet auch die Eingabetaste.

Um ganze Blöcke auszuwählen, ziehe von einem Block in einen anderen oder ziehe ein Auswahlrechteck von außerhalb des Textes auf: Drücke im Rand daneben oder im leeren Bereich unter der Seite und ziehe dann über die Blöcke. Jeder Block, den das Rechteck berührt, wird ausgewählt; ein Klick dort ohne Ziehen setzt den Cursor weiterhin auf diese Zeile, und Escape bricht das Rechteck ab. Jeder erreichte Block wird mit abgerundeten Ecken in der Farbe von markiertem Text hervorgehoben. Ist nur ein Block ausgewählt, öffnet sich die Auswahlleiste darüber: Ihre Aktionen (**Umwandeln in**, **Farbe**, **Fett** und die anderen Formate, **Kopieren**, **Numo fragen**, **Kommentieren**) gelten für den Block, und nach **Umwandeln in** bleibt er ausgewählt, damit eine weitere Aktion folgen kann. Sind mehrere Blöcke ausgewählt, bleibt die Leiste ausgeblendet: Öffne das Menü am Griff eines ausgewählten Blocks, das auf alle wirkt. Umschalt+Klick auf einen anderen Block oder Umschalt+Aufwärtspfeil und Umschalt+Abwärtspfeil am Rand eines Blocks erweitern die Auswahl um ganze Blöcke. Escape wählt den Block aus, in dem du schreibst, und ein weiteres Escape hebt die Auswahl auf. Command+A unter macOS oder Strg+A unter Windows/Linux markiert zuerst den Text des Blocks, in dem du bist, auch in einem Codeblock, und beim zweiten Drücken alle Blöcke. Sind Blöcke ausgewählt, wählen die Aufwärts- und die Abwärtspfeiltaste den Block darüber oder darunter, Umschalt+Aufwärtspfeil und Umschalt+Abwärtspfeil fügen Blöcke hinzu oder entfernen sie, die Rücktaste oder Entf löscht sie, Command/Strg+C kopiert sie, Command/Strg+X schneidet sie aus, und die Eingabetaste auf einem einzelnen Block setzt den Cursor an sein Ende; Tippen bewirkt nichts. Das Blockmenü wirkt auf alle ausgewählten Blöcke. Tippe in das Suchfeld des Blockmenüs, um jede seiner Aktionen zu erreichen, auch Blocktypen und Farben: Ein Eintrag aus einem Untermenü zeigt seinen Pfad, etwa **Umwandeln in** › **Überschrift 1**. Bilder, Dateien, Codeblöcke, Gleichungen, Teiler, Erwähnungen und Inline-Code zeigen dieselbe Hervorhebung, wenn sie ausgewählt sind, allein oder innerhalb einer Auswahl. Während du einen Kommentar schreibst oder bearbeitest, schließt oder verwirft Escape ihn weiterhin. Auf einem Touchscreen markiert langes Drücken weiterhin Text, und Ziehen wählt keine Blöcke aus.

In einer Aufzählung, nummerierten Liste oder Aufgabenliste ist jeder Eintrag ein Block mit eigenem Griff, der links neben seiner Liste erscheint, wenn du über den Eintrag fährst; eine Liste hat keinen eigenen Griff mehr, also wähle ihre Einträge aus, um auf alle zu wirken, denn das Menü am Griff wirkt auf den Eintrag oder auf alle ausgewählten Einträge. Das + am Griff fügt darunter einen Eintrag derselben Art ein, mit Alt/Option-Klick darüber, und öffnet dabei das `/`-Menü. Ziehen am Griff verschiebt den Eintrag oder die ausgewählten Einträge in jede Liste, die diese Art von Eintrag aufnimmt, verschachtelte Listen eingeschlossen: Ein Aufzählungspunkt kann in eine nummerierte Liste wandern, eine Aufgabe nur zwischen Aufgaben, und eine so geleerte Liste wird entfernt.

Auf dem Smartphone zeigt der Editor weder Blockgriffe noch Auswahlleiste, und ein getipptes `@` bleibt ein normales Zeichen. Solange ein Editor den Fokus hat, schwebt eine Leiste über der Tastatur, die sich beim Schließen der Tastatur ausblendet: **Block einfügen** (+) listet die Blöcke dieses Editors in denselben Abschnitten wie das Menü `/` auf und fügt den gewählten an der Cursorposition ein, wie `/`; **Erwähnen** (@) listet nach Typ gruppiert auf, was du erwähnen kannst, dazu die Daten, die deine Suche meint; danach folgen **Fett**, **Kursiv**, **Durchgestrichen**, **Code**, **Farbe** (ein Blatt für Text- oder Hintergrundfarbe), **Link hinzufügen**, **Ausrücken** und **Einrücken** in einer Liste, **Kommentieren** auf einer Seite sowie **Tastatur ausblenden**, das fest am rechten Ende bleibt. Ein unteres Blatt, in dem du schreibst, wächst auf die volle Bildschirmhöhe, und die Zeile, die du gerade tippst, bleibt über der Tastatur. Langes Drücken markiert Text in einem Editor, und die Leiste mit ihren Blättern funktioniert auch im Aufgabennotizbuch. Die untere Navigation wird ausgeblendet, solange ein Textfeld den Fokus hat, etwa ein Seitentitel oder ein Kommentar. Auf einem Touchscreen ist **Symbol hinzufügen** auf einer Seite immer sichtbar.

### Auf einer Seite suchen und ersetzen {#find-and-replace}

Solange eine Seite auf dem Bildschirm ist, öffnet Command+F unter macOS oder Strg+F unter Windows/Linux oben rechts im Dokument eine Suchleiste, egal wo der Cursor steht; bei einer Seite im Seitenpanel durchsucht sie diese Seite. Markierter Text wird zum Suchbegriff. Jeder Treffer wird hervorgehoben, der aktuelle stärker, und die Leiste zeigt seine Position, etwa 2 von 7. Die Eingabetaste springt zum nächsten Treffer, Umschalt+Eingabetaste zum vorherigen; ein erneutes Command/Strg+F markiert den Suchtext. **Groß-/Kleinschreibung beachten**, **Ganzes Wort** und **Regulärer Ausdruck** verfeinern die Suche; ein ungültiger Ausdruck wird gemeldet und hebt nichts hervor. Gesucht wird im Text der Seite, nicht in ihrem Titel.

Wenn du die Seite bearbeiten darfst, fügt **Ersetzen einblenden** ein Feld für den Ersatztext hinzu, mit **Ersetzen**, das den aktuellen Treffer ersetzt und zum nächsten springt, und **Alle ersetzen**. In einem regulären Ausdruck fügen `$1` bis `$9` die gefundenen Gruppen ein und `$&` den ganzen Treffer; eine einfache Suche fügt den Text genau so ein, wie du ihn getippt hast. Ein Ersetzen ist eine normale Bearbeitung: Es wird gespeichert und erreicht die anderen Bearbeitenden wie Tippen, und Command/Strg+Z macht es rückgängig, **Alle ersetzen** in einem Schritt. Escape schließt die Leiste und kehrt zum Text zurück. Das Aufgabennotizbuch hat dieselbe Leiste. Anderswo in minddy und wenn ein anderer Dialog über der Seite geöffnet ist, öffnet Command/Strg+F die Suche des Browsers.

### Speichern und Übertragbarkeit {#editor-save}

Eine Seite speichert, während du tippst: Jede Änderung erreicht den Server nach einem kurzen Moment, und die Speicheranzeige zeigt das Speichern an, bis der Server sie angenommen hat. Mehrere Personen können dieselbe Seite gleichzeitig bearbeiten, auch denselben Absatz oder den Titel. Die Änderungen jeder Person erscheinen bei den anderen schon beim Tippen, ebenso die Bearbeitungen, die Numo oder ein über MCP verbundener Agent an der Seite vornimmt.

Bricht die Verbindung ab, lass die Seite geöffnet. Ungespeicherte Änderungen bleiben auf der Seite und werden gesendet, sobald die Verbindung zurückkehrt; Änderungen anderer treffen gleichzeitig ein und werden mit deinen zusammengeführt. minddy öffnet eine andere Seite erst, wenn deine Änderungen gespeichert sind: Solange sie nicht gesendet werden können, bleibst du auf der Seite und minddy meldet, dass das Speichern fehlgeschlagen ist. Schließt du einen Browser-Tab mit ungespeicherten Änderungen, bittet dich der Browser vorher um Bestätigung; beim Beenden der Desktop-App gibt es keine Rückfrage, und ungespeicherte Änderungen gehen verloren. Verlierst du den Zugriff auf die Seite oder das Recht, sie zu bearbeiten, während Änderungen ungespeichert sind, macht minddy sie rückgängig und zeigt eine Meldung an. Lehnt der Server eine Änderung ab, etwa einen Titel mit mehr als 500 Zeichen oder einen Link mit einem nicht zulässigen Protokoll, macht minddy diese Änderung rückgängig und zeigt eine Meldung an. Der Seitenverlauf hilft, früher gespeicherte Versionen zu prüfen.

Markdown-Exporte und Seitenzugriffe durch Agenten erhalten Symbole und Farben von Hinweisblöcken in der unterstützten Darstellung. Auch ein in der Größe angepasstes Bild behält seine Breite, die als Bildtitel geschrieben wird (`![alt](src "width=60%")`), sodass Änderungen durch Numo, MCP-Agenten oder das Aufgabennotizbuch sie nicht zurücksetzen. Agenten lesen eine Seitenerwähnung als `[@Title](mention:page/<id>)` und können sie mit oder ohne Titel schreiben: minddy speichert `[@](mention:page/<id>)` und zeigt allen Lesenden den aktuellen Titel der Seite; die ältere Form `[[page:<id>]]` wird weiterhin akzeptiert und als dieselbe Erwähnung gelesen, auch innerhalb einer Zeile. Gleichungen werden als LaTeX übertragen: `$E = mc^2$` innerhalb einer Zeile und ein Block zwischen zwei Zeilen `$$`. Ein Betrag wie `$5` bleibt Text. Exportformate unterscheiden sich in Wiedergabetreue und Anhangsbehandlung. Prüfe das entstandene Dokument, bevor du eine Originalquelle ersetzt. Verwende Codeblöcke für wörtliche Befehle und bewahre Voraussetzungen und Warnungen im umgebenden Text.

## Eine Seite besprechen und Konflikte lösen {#page-comments-and-collaboration}

Öffne eine Projektseite und ihre Kommentarfunktionen. Wähle passende Inhalte aus, wenn du einen verankerten Kommentar erstellst, erkläre die Frage oder Änderung und erwähne bei Bedarf ein Projektmitglied. Ein Leser kann kommentieren, wenn der Eigentümer **Darf kommentieren** für ihn aktiviert hat. Antworte im Verlauf, damit die Entscheidung bei ihrem Kontext bleibt. Markiere den Verlauf erst als erledigt, wenn seine Frage tatsächlich beantwortet wurde. Der Verlauf eines Blocks öffnet sich am Computer in einem Dialog und auf dem Smartphone in einem unteren Blatt statt neben dem Block: Er zeigt die zitierte Passage, die vorhandenen Diskussionen mit ihren Antworten und ein Feld für einen neuen Kommentar. Öffne ihn über das Kommentar-Abzeichen des Blocks, **Kommentieren** in der Auswahlleiste oder das Blockmenü. Am Computer zeigt ein Block ohne Kommentare beim Darüberfahren rechts eine Schaltfläche **Diesen Block kommentieren** auf Höhe des Blockgriffs; ein kommentierter Block zeigt dort stattdessen sein Kommentar-Abzeichen. Fährst du mit dem Zeiger über diese Schaltfläche, wird ihr Block wie eine Auswahl hervorgehoben. Auf dem Smartphone erscheint diese Schaltfläche nicht.

Anwesenheitsavatare zeigen Personen, die die Seite ansehen. Während jemand bearbeitet, erscheinen sein Cursor und seine Auswahl im Inhalt und im Titel, in einer eigenen Farbe und mit seinem Namen beschriftet. Der Cursor eines Lesers wird nicht angezeigt. Ein Cursor zeigt, wo jemand arbeitet, nicht dass sein Text gespeichert ist: Die Speicheranzeige spiegelt nur deine eigenen Änderungen wider.


![Seitenaktivität ohne bisherige Einträge und ein leeres Kommentarfeld.](/documentation/de/page-comments.png)

### Einen Speicherkonflikt lösen {#page-conflict}

Gleichzeitige Bearbeitungen werden automatisch Zeichen für Zeichen zusammengeführt, auch innerhalb desselben Absatzes. Ein Konflikthinweis kann dennoch erscheinen, wenn minddy die Seite neu laden muss, während du ungespeicherte Änderungen hast: nach einem Verbindungsabbruch, während dessen viele Änderungen vorgenommen wurden, oder nach einer Änderung ohne Live-Bearbeitung, etwa einem Import in eine Datenbank. Haben deine Änderungen und die neu geladene Version denselben Block auf der obersten Dokumentebene verändert, behält das Dokument die neu geladene Fassung dieses Blocks und der Hinweis bietet deine zur Prüfung an.

Vergleiche den genannten Block mit dem aktuellen Dokument. Wähle die Aktion zum Wiederherstellen deiner Fassung nur dann, wenn du diesen Block wirklich durch deine Version ersetzen möchtest. War deine kollidierende Aktion eine Löschung, wendet die Aktion zum erneuten Löschen sie ausdrücklich an. Das Verwerfen des Hinweises behält das übernommene Dokument bei und schließt die Warnung; es stellt deine Fassung nicht wieder her. Sichere gewünschten Text vor dem Schließen und prüfe gespeicherte Versionen im Verlauf, wenn du mehr wiederherstellen musst. Diese Entscheidungen betreffen den bezeichneten Block, statt ungeprüft die ganze Seite zu ersetzen.

Ein fehlender Kommentaranker kann durch Dokumentänderungen entstehen. Lies die Diskussion vor dem Verschieben oder Löschen des referenzierten Blocks. Kommentare und Aktivität sind projektintern, sofern Inhalte nicht ausdrücklich über eine unterstützte Freigabe veröffentlicht werden. Prüfe die tatsächliche Besuchersicht an einer veröffentlichten Seite, statt anzunehmen, dass Zusammenarbeitsfunktionen des Projekts öffentlich werden.

## Seitendateien anhängen und abrufen {#page-files}

Öffne die Seite als Projektmitglied und verwende die Anhangs- oder Uploadfunktionen. Wähle eine nicht leere Datei innerhalb der Grenze von 10 MB je Datei. Die Speicherquote deines Kontos oder deiner Instanz kann zusätzlich begrenzen. Bewahre das Original auf, bis das Hochladen erfolgreich ist.

Bilder lassen sich als Bildblöcke einfügen, andere Dokumente als Dateiblöcke anhängen. Der Server ermittelt den gespeicherten Medientyp aus den Dateibytes, statt dem Dateinamen oder der Browserangabe zu vertrauen. Eine akzeptierte Datei hat nicht zwingend eine Vorschau innerhalb der Seite. Lade sie herunter, wenn keine Vorschau verfügbar ist.

Klicke im Projekteditor auf ein Bild oder den Namen eines unterstützten Dateiblocks. Es öffnet sich derselbe fensterfüllende Betrachter wie für Ticketanhänge. Markdown (`.md`), Klartext (`.txt`, `.text`), CSV, PDF sowie unterstützte Audio- und Videoformate werden in eigenen Bereichen angezeigt. Mit Schließen oder Escape kehrst du zur Seite zurück. Das Menü Dateiaktionen (`…`) bietet Herunterladen. Auf einer bearbeitbaren Seite bietet ein Dateiblock außerdem Umbenennen, das den auf der Seite angezeigten Namen ändert, und Bilder wie Dateien bieten Entfernen: Nach einer Bestätigung wird der Block aus dem Dokument entfernt, und du kannst das im Editor rückgängig machen. Der Dateiblock behält außerdem seine direkte Schaltfläche Herunterladen. Nicht unterstützte Formate, externe Dateilinks und Dateiblöcke auf veröffentlichten Seiten behalten ihr Download-Verhalten. Veröffentlichte Bilder verwenden den Betrachter ohne Entfernen-Aktion.

![Fensterfüllender CSV-Betrachter mit Beispielaufgaben, großer Schaltfläche Schließen und dem Menü Dateiaktionen mit Herunterladen, Umbenennen und Entfernen.](/documentation/de/file-preview.png)

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

Öffne als Eigentümer oder Mitglied eine Projektseite und verwende ihre Veröffentlichungsfunktionen. Prüfe zuerst Inhalte und Anhänge. Wähle privaten, passwortgeschützten oder öffentlichen Zugriff. Der Passwortschutz benötigt mindestens acht Zeichen und wird erst nach Absenden des Passworts angewendet; die Modusauswahl allein erzeugt keinen geschützten Link.

Kopiere den erzeugten /p/-Link nach erfolgreicher Veröffentlichung. Hat die Seite Unterseiten, prüfe die Option zum Einschließen und deren Anzahl. Das Einschließen veröffentlicht den gewählten Zweig; ohne Einschließen bleiben die Inhalte außerhalb dieser Veröffentlichung. Eine Datenbank ohne veröffentlichte Unterseiten legt nicht automatisch alle Eintragsinhalte offen.

Öffne den Link in einer gesonderten Browsersitzung ohne dein Konto. Prüfe ein aktiviertes Passwort, Seiteninhalt, vorgesehene Unterseiten und Dateidownloads. Eine Erwähnung einer Seite aus dem veröffentlichten Satz zeigt ihren Titel und öffnet sie unter demselben Link; eine Erwähnung jeder anderen Seite zeigt **Unterseite nicht veröffentlicht** und lässt sich nicht öffnen. So prüfst du den Lesezugriff von Besuchern statt deiner weitergehenden Mitgliedsrechte.


![Veröffentlichungsdialog mit ausgewähltem Privat und Alternativen für Passwort oder Link.](/documentation/de/page-publish.png)

### Widerrufen und prüfen {#revoke-page}

Kehre zu den Veröffentlichungsfunktionen zurück, wähle privat und bestätige mit **Veröffentlichung beenden**: Der alte Link funktioniert nicht mehr, und eine erneute Veröffentlichung erzeugt einen neuen Link. Öffne nach erfolgreichem Widerruf den alten Link anonym und prüfe die Zugriffsverweigerung. Bereits empfangene Kopien oder Bildschirmaufnahmen lassen sich nicht zurückholen. Dateidownload-URLs, die eine veröffentlichte Seite bereits ausgegeben hat, werden für bis zu 24 Stunden signiert. Ein Widerruf verhindert neue Seitenbesuche, doch diese schon ausgegebenen Datei-URLs können bis zu ihrem Ablauf gültig bleiben.

Benutzerseitenlinks bleiben auf `noindex` und sind von der indexierten offiziellen Anleitung getrennt. Noindex ist eine Auffindbarkeitsregel, kein Zugriffspasswort. Ist eine Unterseite oder Datei unerwartet lesbar, widerrufe zuerst, prüfe den veröffentlichten Zweig und teste erneut, bevor du einen korrigierten Link weiterleitest. Dateien unveröffentlichter Seiten erhalten durch einen internen Verweis keinen Zugriff.

## Eine Seite exportieren oder drucken {#import-export-and-print-pages}

Öffne das Dokumentmenü der Seite und wähle Exportieren. Wähle Markdown für eine Seite (.md) oder einen Zweig (.zip), PDF für die Druckansicht oder das Datenbankarchiv, wenn die Seite eine Datenbank ist. Prüfe vor dem Bestätigen den angebotenen Umfang: Eine einzelne Seite, ihr Zweig und ein Datenbankarchiv enthalten unterschiedliche Inhalte.

Öffne den Export und prüfe die Überschriften, Hinweisblöcke, Links und Anhänge, die die Leser benötigen. Im Export zeigen Erwähnungen die aktuellen Seitentitel, und Erwähnungen von Seiten, die im Export enthalten sind, werden zu relativen Links. Die PDF-Aktion öffnet eine lesbare Druckansicht ohne die gesamte Anwendungsnavigation. Verwende die Druckfunktionen deines Browsers zum Drucken oder Speichern als PDF. Im Dokumentmenü gibt es keine allgemeine Importaktion. Unterstützte Importe starten von einer leeren Datenbank aus, wie im Leitfaden zum Datenbankimport beschrieben.


![Exportmenü des Dokuments mit Markdown (.md) und Drucken / PDF.](/documentation/de/page-export.png)

### Datenbankarchive und Grenzen {#export-fidelity}

Ein Datenbankarchiv (.zip) enthält den zugehörigen Zweig: Markdown und CSV, das genaue Schema und die Optionsfarben, Werte, Inhalte, Zeitstempel, verschachtelte Seiten und die Dateiinhalte. Importiere es in eine neue, leere Datenbank, um diese Struktur wiederherzustellen. Gespeicherte Datenbankansichten gehören nicht zum Archiv: Lege sie nach dem Import neu an. Beim Duplizieren einer Datenbank bleiben ihre Ansichten erhalten.

Ein Export überträgt keine Passwörter, Zugangsdaten von Kontoanbietern oder Abonnements. Zum Übertragen deiner Arbeit zwischen Instanzen verwende den Leitfaden zum Kontodatentransfer. Kann ein importiertes Format einen Block oder eine externe Eigenschaft nicht erhalten, prüfe das Ergebnis, bevor du es als Ersatz verwendest. Lösche das Original nicht allein deshalb, weil eine Datei heruntergeladen wurde.


## Routinen für neue Einträge {#entry-routines}

Der Projekteigentümer kann diese Datenbank in [Routinen](/docs/scheduled-routines#conditions) als Auslöser wählen. Bedingungen verwenden die typisierten Eigenschaften des Eintrags. Ein leerer Eintrag kann bis zum Ausfüllen seiner Eigenschaften warten. Erstellung, Duplizierung, Datenbankimport und erlaubtes Verschieben in die Datenbank gelten als Eingänge; Wiederherstellung nicht. Bei Entfernung einer referenzierten Eigenschaft oder Änderung ihres Typs muss der Routinenfilter korrigiert werden.

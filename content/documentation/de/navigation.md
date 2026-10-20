---
{
  "id": "navigation",
  "locale": "de",
  "title": "Navigation und Suche",
  "summary": "Navigiere durch persönliche Arbeit und Projekte, nutze Tabs und Panels und finde zugängliche Inhalte mit Suche und Tastenkürzeln.",
  "topic": "Erste Schritte",
  "type": "guide",
  "audiences": [
    "member"
  ],
  "workflows": [
    "S04",
    "W15"
  ],
  "visibility": "public",
  "status": "published",
  "revision": 13,
  "sourceRevision": 13,
  "owner": "@mangue-dev",
  "updatedAt": "2026-10-20",
  "compatibility": {
    "version": "0.11.1 development (UI refinements); MIN-685 sidebar context menus; MIN-692 hidden projects; MIN-718 hybrid issue search; MIN-726 issue search order; MIN-733 always-on AI features; MIN-737 account settings reorganization; MIN-749 relation shortcut R",
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
      "components/app-sidebar.tsx",
      "components/secondary-sidebar.tsx",
      "content/knowledge/agents-and-mcp.md",
      "content/knowledge/productivity.md",
      "components/command-palette.tsx",
      "components/keyboard-cheatsheet.tsx",
      "components/issue-field-shortcuts.tsx",
      "lib/keyboard/shortcuts.ts",
      "lib/keyboard/keyboard-context.tsx",
      "components/project-context-actions.tsx",
      "lib/sidebar-context-actions.ts",
      "components/routines/routines-panel.tsx",
      "components/pull-requests/pr-context-actions.tsx",
      "lib/use-hidden-projects.ts",
      "lib/issue-semantic-query.ts",
      "lib/use-semantic-issue-search.ts",
      "lib/server/issue-semantic-search.ts",
      "app/api/issues/semantic-search/route.ts",
      "lib/use-semantic-mentions.ts",
      "lib/issue-search-order.ts",
      "components/app-tab-strip.tsx",
      "lib/app-tab-indicators.ts",
      "lib/settings-sections.ts",
      "lib/settings-section-focus.ts",
      "components/settings-shell.tsx",
      "components/settings/account-smart-fill-section.tsx",
      "components/objective-relations-section.tsx",
      "components/create-issue-dialog.tsx"
    ]
  },
  "review": {
    "revision": 13,
    "fact": "agent:/root/german_spanish_review (structural consolidation review; prior procedural evidence retained; no operational rerun); agent:/root (visual usefulness, figure framing and preserved procedures; previous operational evidence retained); agent:/root (Documentation command and mobile transition source review; unchanged evidence retained); agent:/root (MIN-685 sidebar context menu source review inherited from en revision 7; de translation of added passages; no operational rerun); agent:/root (MIN-692 hidden-project source, route and unit-test review; no browser walkthrough; unchanged evidence retained); agent:/root (MIN-718 hybrid issue search source and unit-test review; no browser walkthrough, no new captures; unchanged evidence retained); agent:/root (MIN-695 badge propagation: source and unit-test review of app-shell-chrome, app-sidebar, mobile-navigation, app-tab-strip and lib/app-tab-indicators; no browser walkthrough, no new captures; unchanged evidence retained); agent:/root (MIN-733 removal of the instance AI switches: source and unit-test review of the admin registry and every former switch reader; no browser walkthrough, no new captures; unchanged evidence retained); agent:/root (MIN-737 account settings reorganization: source review of the Issue indexing card, the settings section catalog, the settings filter and the new-tab palette hand-off in lib/settings-sections.ts and lib/settings-section-focus.ts; unchanged evidence retained; no browser walkthrough, no new captures); agent:/root (MIN-749 relation shortcut R: source and unit-test review of components/issue-field-shortcuts.tsx, the board card, issue panel, objective page and new-issue dialog relation pickers and lib/keyboard/shortcuts.ts; no browser walkthrough, no new captures; unchanged evidence retained)",
    "language": "agent:/root/german_spanish_review (de title, summary, lead and heading review; retained body comparison); agent:/root/editorial_de_es (editorial clarity pass); agent:/root (figure removals and captions); agent:/root (de changed-passage parity and label review); agent:/root (de translation of MIN-685 added passages with catalog UI labels, equivalent meaning self-reviewed; agent review, not human acceptance); agent:/root (de MIN-692 added passages, label and retained-meaning self-review; agent review, not human acceptance); agent:/root (de translation of MIN-718 added passages with catalog UI labels, equivalent meaning self-reviewed; agent review, not human acceptance); agent:/root (de MIN-695 badge paragraph, catalog UI labels and retained-meaning self-review; agent review, not human acceptance); agent:/root (de removal of the sentences describing instance AI switches; retained-meaning self-review; agent review, not human acceptance); agent:/root (de MIN-737 changed passages with catalog UI labels; retained-meaning self-review; agent review, not human acceptance); agent:/root (de translation of MIN-749 added sentences, equivalent meaning self-reviewed; agent review, not human acceptance)",
    "date": "2026-10-20"
  },
  "related": [
    "views",
    "applications"
  ],
  "aliases": [
    "productivity",
    "search-and-shortcuts"
  ],
  "tags": [
    "Persönliche Arbeit finden und Projekte wechseln",
    "Arbeit finden und Tastaturaktionen verwenden"
  ],
  "figures": [
    {
      "id": "navigation-steps",
      "kind": "screenshot",
      "src": "/documentation/de/work-navigation.png",
      "alt": "Projektnavigation neben dem Demo-Ticketboard.",
      "caption": "Über die Projektseitenleiste erreichst du Tickets, Ziele, Seiten und Triage.",
      "revision": 13,
      "reviewed": true,
      "capturedAt": "2026-10-08",
      "viewport": [
        1488,
        1128
      ],
      "theme": "light",
      "padding": 24
    },
    {
      "id": "search-and-shortcuts-steps",
      "kind": "screenshot",
      "src": "/documentation/de/work-search.png",
      "alt": "Suchergebnisse für die Kennung eines Demo-Tickets.",
      "caption": "Die Palette findet das Ticket über seine Kennung neben Projektseiten; beim Öffnen bleiben die Zugriffsregeln bestehen.",
      "revision": 13,
      "reviewed": true,
      "capturedAt": "2026-10-08",
      "viewport": [
        788,
        364
      ],
      "theme": "light",
      "padding": 24
    }
  ],
  "requiredFigures": [
    "navigation-steps",
    "search-and-shortcuts-steps"
  ]
}
---

Über die Navigation erreichst du deine persönliche Arbeit oder ein Projekt. Mit der Befehlspalette findest du ein bestimmtes Problem oder eine Aktion. Panels, mobile Navigation und Desktop-Tabs bieten unterschiedliche Zugänge. Prüfe vor Änderungen das ausgewählte Projekt und die Instanz.

## Persönliche Arbeit finden und Projekte wechseln {#navigation}

Die Hauptnavigation führt zu deiner persönlichen Arbeit und deinen Projekten. Wähle ein Projekt, um dessen Probleme und weitere Bereiche zu sehen, darunter Triage, Ziele, Seiten und Projekteinstellungen. Die Zurück-Zeile führt eine Navigationsebene nach oben; dabei kann sich der Inhalt der Seitenleiste ändern, während die Hauptseite geöffnet bleibt. Wähle ein Ziel, um dorthin zu navigieren.

Zähler und Warnungen begleiten dich zwischen den Ebenen. Das Element, das zur **Startseite** zurückführt, zeigt die Gesamtzahl der Elemente zur Triage in den Projekten, die die **Startseite** auflistet, einschließlich des aktuellen, sowie die Smart-Assign-Warnung, wenn einem deiner Projekte Regeln fehlen. Eine Zurück-Zeile zeigt den Zähler der Ebene, zu der sie zurückführt. Innerhalb eines Projekts behalten **Triage** und **Feedback** die Zähler dieses Projekts. Die Tabs der Desktop-App tragen dasselbe Badge wie ihr Eintrag in der Seitenleiste: die Warnung auf der **Startseite** und die Zähler auf **Posteingang**, **Code-Review** sowie **Triage** und **Feedback** eines Projekts, auch wenn der Tab im Hintergrund ist.

Persönliche Zyklen und projektübergreifende Ansichten umfassen Projekte, auf die du zugreifen kannst. Ziele, Wiki und Feedback eines Projekts gehören zu einem einzelnen Projekt. Prüfe das aktive Projekt, bevor du Arbeit erstellst oder Einstellungen änderst.

![Projektnavigation neben dem Demo-Ticketboard.](/documentation/de/work-navigation.png)

### Aus einer Zeile der Seitenleiste handeln {#sidebar-menus}

Klicke mit der rechten Maustaste auf eine Zeile der Seitenleiste, um auf das dargestellte Element zu wirken, ohne es zuerst zu öffnen. Linkzeilen bieten außerdem **In neuem Tab öffnen** und **Link kopieren**. Eine Aktion, die etwas in den Papierkorb verschiebt, steht immer zuletzt, nach einem Trennstrich.

- Die Zeile **Alle Probleme** bietet **Neues Problem**, und die Zeile **Routinen** bietet **Neue Routine**, wenn Sie Eigentümer eines Projekts sind.
- Eine Projektzeile oder der Projektname oben im Panel des Projekts bietet **Neu** (ein Problem, ein Ziel oder eine Seite in diesem Projekt) und **Projekteinstellungen**. Der Projekteigentümer sieht außerdem **In den Papierkorb verschieben**; dabei erscheint dieselbe Bestätigung wie in den Projekteinstellungen. Dasselbe Menü bietet außerdem **Projekt ausblenden** oder, für ein ausgeblendetes Projekt, **Projekt einblenden**; siehe [Ein Projekt für dich ausblenden](/docs/projects#hide-project).
- Ein Projekt-Tab bietet seinen eigenen Erstellungseintrag: **Neues Problem** unter Probleme, **Neues Ziel** unter Ziele, **Neue Seite** unter Seiten und **Neues Feedback** unter Feedback, das das interne Feedback-Formular öffnet.
- Eine Routinezeile bietet **Letzte Ausführung öffnen** und dem Projekteigentümer zusätzlich **Jetzt ausführen**, **Pausieren** oder **Fortsetzen**, **Bearbeiten** und **In den Papierkorb verschieben**. Siehe [Ausführungen verwalten und prüfen](/de/dokumentation/scheduled-routines#runs).
- Eine Pull-Request-Zeile bietet die Statusänderungen, die ihr aktueller Status erlaubt, **Zusammenführen**, wenn sie bereit ist, und Korrekturaktionen, wenn etwas sie blockiert. Siehe [Review und Merge](/de/dokumentation/code-work#decision).

Die Aktion gilt für die Zeile, auf die du geklickt hast, auch wenn gerade ein anderes Projekt oder Element geöffnet ist.

### Panels und mobile Navigation {#panels}

Auf Mobilgeräten zeigt eine Ladeleiste am oberen Rand die laufende Navigation an, auch während ausstehende Seitenspeicherungen abgeschlossen werden.

Ein Problem öffnet sich in einem Detailpanel, damit das darunterliegende Board verfügbar bleibt. Numo öffnet über seine schwebende Schaltfläche ein gemeinsames Gesprächspanel. Der Posteingang öffnet sich als Navigations-Popover mit Benachrichtigungen und Einladungen. Ältere eigene Posteingangs- und Numo-Links führen zu den aktuellen Einstiegspunkten; sie bezeichnen keine gesonderten aktuellen Bildschirme.

Öffne auf dem Smartphone die Navigationsleiste, um dieselben Ziele auszuwählen. Panels nutzen die verfügbare Bildschirmbreite. Schließe das aktuelle Panel oder gehe zurück, um wieder die Liste zu sehen. Verwende sichtbare Schaltflächen, wenn ein Tastenkürzel nicht verfügbar ist.

### Desktop-Tabs {#tabs}

Die Desktop-App ergänzt die Anwendung um native Tabs und eine Serverauswahl. Ein Tab ist eine Navigationsfläche, keine andere Projektmitgliedschaft und kein anderes Konto. Prüfe die gewählte Instanz beim Serverwechsel. Die Desktop-Anleitung beschreibt Installation, native Tastenkürzel und Updates; die Berechtigungen für Seiten und Probleme gelten weiterhin.

## Arbeit finden und Tastaturaktionen verwenden {#search-and-shortcuts}

Der Befehl Dokumentation öffnet das öffentliche Handbuch in Ihrer aktuellen Sprache.

Öffne die Befehlspalette über die Suchfunktion der Navigation. Suche nach einem eindeutigen Titel oder einer Problemkennung und wähle ein Ergebnis. Ergebnisse sind auf Arbeit beschränkt, auf die dein Konto zugreifen kann; eine bekannte Kennung gewährt keinen Zugriff auf ein anderes Projekt.

Drücke Command+K unter macOS oder Strg+K unter Windows/Linux, um die Befehlspalette zu öffnen; Command/Strg+P ist ein alternatives Anwendungskürzel. Außerhalb bearbeitbarer Texte öffnet ? die Kürzelhilfe und C die Problemerstellung. Auf einer Problemkarte unter dem Mauszeiger oder an den unterstützten Detailfunktionen öffnet S den Status, P die Priorität, E den Aufwand, A die zuständige Person, L die Kategorien, D das Fälligkeitsdatum und O das Ziel. R fügt an denselben Stellen, auf der Seite eines Ziels und im Formular für ein neues Problem eine Beziehung hinzu: Wähle die Beziehungsart und dann das andere Problem oder Ziel. Diese Einzelbuchstaben unterbrechen keine Eingabe in einem Eingabefeld, Textbereich oder Inhaltseditor. Navigationsfolgen wie G, dann H (Startseite) und G, dann I (Posteingang) verwenden zwei nacheinander gedrückte Tasten. G, dann W führt nur innerhalb eines Projekts zu den Seiten.

Um eine Einstellung zu erreichen, gib ihren Namen in der Befehlspalette oder im Filterfeld oben in der Seitenleiste der Einstellungen ein. Beide finden jede Einstellungskarte und einzelne Einstellungen wie Sprache, Design, jede Palette, Transparenz und die beiden Schalter von **Vorgang starten**. Ein gewähltes Ergebnis öffnet den passenden Einstellungstab, scrollt zur Karte oder Zeile und hebt sie hervor. Command+T unter macOS oder Strg+T unter Windows/Linux öffnet die Palette für einen neuen Tab; eine dort gewählte Einstellung öffnet sich in einem neuen App-Tab. Englische und französische Suchbegriffe funktionieren unabhängig von der Sprache der Oberfläche.

Lies in der Tastenkürzelhilfe die Befehle für deine Plattform. minddy unterscheidet Anwendungskürzel, Aktionen für Problemeigenschaften und native Desktop-Kürzel für Tabs oder Fenster. Prüfe vor einem Befehl den Fokus: Schreiben im Editor und Handeln am umgebenden Problem sind verschiedene Kontexte.

![Suchergebnisse für die Kennung eines Demo-Tickets.](/documentation/de/work-search.png)

### Reihenfolge der Probleme in der Suche {#issue-search-order}

Jede Problemsuche listet Probleme in derselben Reihenfolge: die Befehlspalette, `@`-Erwähnungen, die Auswahl für Beziehungen, Duplikate und Pull Requests, der Feedback-Dialog **Link zu einem bestehenden Problem** und die Suche, die Numo und MCP-Agenten nutzen. Probleme **In Bearbeitung** und **In Überprüfung** kommen zuerst, dann Probleme im **Rückstand** und **Todo**. Probleme in **Triage**, **Fertig**, **Abgebrochen** und **Duplikat** stehen immer am Ende und bleiben auswählbar. Innerhalb jeder Gruppe kommt der beste Texttreffer zuerst. Eine vollständig eingegebene Kennung wie `MIN-42` stellt dieses Problem an den Anfang, unabhängig von seinem Status.

### Probleme inhaltlich suchen {#search-by-meaning}

Beschreibt eine Suchanfrage die Arbeit, statt sie zu benennen, findet die Problemsuche auch inhaltlich ähnliche Probleme, selbst wenn sie andere Wörter verwenden. So kann „Anmeldung scheitert nach dem Zurücksetzen des Passworts“ ein Problem mit dem Titel „Sitzung geht bei Passwortänderung verloren“ finden. Das gilt für die Befehlspalette, `@`-Erwähnungen in Beschreibungen, Seiten, Kommentaren und im Eingabefeld von Numo, die Beziehungsauswahl, **Als Duplikat markieren…** in der Triage, **Ein Problem verknüpfen** an einer Pull-Anfrage, das Menü **Kontext hinzufügen** → **Problem** von Numo und **Link zu einem bestehenden Problem** bei Feedback.

Textübereinstimmungen und exakte Kennungen stehen immer zuerst und behalten ihre Reihenfolge. Kurz nachdem du aufgehört hast zu tippen, werden höchstens fünf inhaltlich gefundene Probleme unter **Inhaltlich verwandt** dahinter angefügt. Ein bereits angezeigtes Problem wird nicht wiederholt, und die hervorgehobene Zeile verschiebt sich nicht. Jede Auswahl behält ihre eigenen Regeln, daher erscheinen nur Probleme, die sie ohnehin anbieten konnte: Die Beziehungsauswahl bietet zum Beispiel weiterhin nur noch nicht verknüpfte Probleme desselben Projekts an. Die Befehlspalette durchsucht die Projekte, die du lesen kannst, bis zu den 25 zuletzt aktualisierten; ihre Aktionen für Mehrfachauswahl nutzen die inhaltliche Suche nicht.

Für die inhaltliche Suche gelten diese Grenzen:

- Die Suchanfrage braucht mindestens zwei Wörter oder ein Wort mit mindestens sechs Buchstaben. Kennungen wie `MIN-42`, `#42` oder `42` sowie sehr kurze Anfragen nutzen nur die Textsuche.
- Sie stützt sich auf den Index, den Smart-Fill aus Titel und Beschreibung der Probleme aufbaut. Ein noch nicht indexiertes Problem oder eines, dessen Autor [**Vorgänge indexieren**](/docs/issues#smart-fill-preferences) ausgeschaltet hat, wird nur über seine Wörter gefunden. Probleme im Papierkorb erscheinen nie.
- Hast du **Vorgänge indexieren** unter **Kontoeinstellungen** → **Smart Fill** → **Vorgangsindexierung** ausgeschaltet, vergleichen deine Suchen nur Wörter. Dasselbe gilt, wenn dein KI-Budget erschöpft ist oder wenn der Anbieter nicht innerhalb weniger Sekunden antwortet. Die Textergebnisse bleiben, und es wird kein Fehler angezeigt.
- Eine `@`-Suche, deren Text bereits zu einer Person, einem Projekt oder einer Seite passt, wird nicht inhaltlich gesucht. In einem Projekt mit mehr als 3.000 indexierten Problemen werden nur die 3.000 zuletzt indexierten verglichen; die übrigen werden über ihre Wörter gefunden.

Jede neue Suchanfrage nutzt einen KI-Aufruf, der zu deinem Anteil **Automatisierungen** zählt und im Nutzungsverlauf als **Problemsuche** erscheint. Eine innerhalb von etwa 15 Minuten wiederholte Anfrage wird normalerweise nicht erneut berechnet.

### Ein entsprechendes sichtbares Steuerelement verwenden {#shortcut-alternatives}

Problemfelder bieten neben Tastaturaktionen sichtbare Eigenschaftsauswahlen. Verwende diese auf mobilen Geräten oder wenn Browser beziehungsweise Betriebssystem ein Kürzel abfangen. Schließe ein Overlay oder setze den Fokus auf die vorgesehene Fläche zurück, bevor du eine andere Aktion versuchst.

Die Suche kann ein Problem finden, das in der aktuell gefilterten Ansicht fehlt. Fehlt ein Ergebnis, prüfe Projekt, Konto und Instanz und verwende eine eindeutigere Suchanfrage. Erstelle kein Duplikat, nur weil das aktuelle Board die Aufgabe ausblendet. Die öffentliche Dokumentation hat eine eigene lokalisierte Textsuche, unabhängig von Numo und der Anbieterkonfiguration.

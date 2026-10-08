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
  "revision": 4,
  "sourceRevision": 4,
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
      "components/app-sidebar.tsx",
      "components/secondary-sidebar.tsx",
      "content/knowledge/agents-and-mcp.md",
      "content/knowledge/productivity.md",
      "components/command-palette.tsx",
      "components/keyboard-cheatsheet.tsx",
      "components/issue-field-shortcuts.tsx",
      "lib/keyboard/shortcuts.ts",
      "lib/keyboard/keyboard-context.tsx"
    ]
  },
  "review": {
    "revision": 4,
    "fact": "agent:/root/german_spanish_review (structural consolidation review; prior procedural evidence retained; no operational rerun)",
    "language": "agent:/root/german_spanish_review (de title, summary, lead and heading review; retained body comparison)",
    "date": "2026-10-09"
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
      "revision": 4,
      "reviewed": true,
      "capturedAt": "2026-10-08",
      "viewport": [
        1440,
        1080
      ],
      "theme": "light"
    },
    {
      "id": "search-and-shortcuts-steps",
      "kind": "screenshot",
      "src": "/documentation/de/work-search.png",
      "alt": "Suchergebnisse für die Kennung eines Demo-Tickets.",
      "caption": "Die Palette findet das Ticket über seine Kennung neben Projektseiten; beim Öffnen bleiben die Zugriffsregeln bestehen.",
      "revision": 4,
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
    "navigation-steps",
    "search-and-shortcuts-steps"
  ]
}
---

Die Navigation verbindet persönliche Arbeit, Projekte und deren einzelne Bereiche. Dieser Leitfaden erklärt Panels, mobile Navigation und Desktop-Tabs sowie Suche und Tastaturaktionen für Inhalte, auf die dein Konto Zugriff hat.

## Persönliche Arbeit finden und Projekte wechseln {#navigation}

Die Hauptnavigation führt zu deiner persönlichen Arbeit und deinen Projekten. Wähle ein Projekt, um dessen Probleme und weitere Bereiche zu sehen, darunter Triage, Ziele, Seiten und Projekteinstellungen. Die Zurück-Zeile führt eine Navigationsebene nach oben; dabei kann sich der Inhalt der Seitenleiste ändern, während die Hauptseite geöffnet bleibt. Wähle ein Ziel, um dorthin zu navigieren.

Persönliche Zyklen und projektübergreifende Ansichten umfassen Projekte, auf die du zugreifen kannst. Ziele, Wiki und Feedback eines Projekts gehören zu einem einzelnen Projekt. Prüfe das aktive Projekt, bevor du Arbeit erstellst oder Einstellungen änderst.

![Projektnavigation neben dem Demo-Ticketboard.](/documentation/de/work-navigation.png)

### Panels und mobile Navigation {#panels}

Ein Problem öffnet sich in einem Detailpanel, damit das darunterliegende Board verfügbar bleibt. Numo öffnet über seine schwebende Schaltfläche ein gemeinsames Gesprächspanel. Der Posteingang öffnet sich als Navigations-Popover mit Benachrichtigungen und Einladungen. Ältere eigene Posteingangs- und Numo-Links führen zu den aktuellen Einstiegspunkten; sie bezeichnen keine gesonderten aktuellen Bildschirme.

Öffne auf dem Smartphone die Navigationsleiste, um dieselben Ziele auszuwählen. Panels nutzen die verfügbare Bildschirmbreite. Schließe das aktuelle Panel oder gehe zurück, um wieder die Liste zu sehen. Verwende sichtbare Schaltflächen, wenn ein Tastenkürzel nicht verfügbar ist.

### Desktop-Tabs {#tabs}

Die Desktop-App ergänzt die Anwendung um native Tabs und eine Serverauswahl. Ein Tab ist eine Navigationsfläche, keine andere Projektmitgliedschaft und kein anderes Konto. Prüfe die gewählte Instanz beim Serverwechsel. Die Desktop-Anleitung beschreibt Installation, native Tastenkürzel und Updates; die Berechtigungen für Seiten und Probleme gelten weiterhin.

## Arbeit finden und Tastaturaktionen verwenden {#search-and-shortcuts}

Öffne die Befehlspalette über die Suchfunktion der Navigation. Suche nach einem eindeutigen Titel oder einer Problemkennung und wähle ein Ergebnis. Ergebnisse sind auf Arbeit beschränkt, auf die dein Konto zugreifen kann; eine bekannte Kennung gewährt keinen Zugriff auf ein anderes Projekt.

Drücke Command+K unter macOS oder Strg+K unter Windows/Linux, um die Befehlspalette zu öffnen; Command/Strg+P ist ein alternatives Anwendungskürzel. Außerhalb bearbeitbarer Texte öffnet ? die Kürzelhilfe und C die Problemerstellung. Auf einer Problemkarte unter dem Mauszeiger oder an den unterstützten Detailfunktionen öffnet S den Status, P die Priorität, E den Aufwand, A die zuständige Person, L die Kategorien, D das Fälligkeitsdatum und O das Ziel. Diese Einzelbuchstaben unterbrechen keine Eingabe in einem Eingabefeld, Textbereich oder Inhaltseditor. Navigationsfolgen wie G, dann H (Startseite) und G, dann I (Posteingang) verwenden zwei nacheinander gedrückte Tasten. G, dann W führt nur innerhalb eines Projekts zu den Seiten.

Lies in der Tastenkürzelhilfe die Befehle für deine Plattform. minddy unterscheidet Anwendungskürzel, Aktionen für Problemeigenschaften und native Desktop-Kürzel für Tabs oder Fenster. Prüfe vor einem Befehl den Fokus: Schreiben im Editor und Handeln am umgebenden Problem sind verschiedene Kontexte.

![Suchergebnisse für die Kennung eines Demo-Tickets.](/documentation/de/work-search.png)

### Ein entsprechendes sichtbares Steuerelement verwenden {#shortcut-alternatives}

Problemfelder bieten neben Tastaturaktionen sichtbare Eigenschaftsauswahlen. Verwende diese auf mobilen Geräten oder wenn Browser beziehungsweise Betriebssystem ein Kürzel abfangen. Schließe ein Overlay oder setze den Fokus auf die vorgesehene Fläche zurück, bevor du eine andere Aktion versuchst.

Die Suche kann ein Problem finden, das in der aktuell gefilterten Ansicht fehlt. Fehlt ein Ergebnis, prüfe Projekt, Konto und Instanz und verwende eine eindeutigere Suchanfrage. Erstelle kein Duplikat, nur weil das aktuelle Board die Aufgabe ausblendet. Die öffentliche Dokumentation hat eine eigene lokalisierte Textsuche, unabhängig von Numo und der Anbieterkonfiguration.

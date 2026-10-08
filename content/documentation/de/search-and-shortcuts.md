---
{
  "id": "search-and-shortcuts",
  "locale": "de",
  "title": "Arbeit finden und Tastaturaktionen verwenden",
  "summary": "Suche zugängliche Arbeit, lies die Kürzelhilfe und halte den Fokus auf dem vorgesehenen Objekt.",
  "topic": "Arbeit planen und finden",
  "type": "guide",
  "audiences": [
    "member"
  ],
  "workflows": [
    "W15"
  ],
  "visibility": "public",
  "status": "published",
  "revision": 2,
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
      "components/command-palette.tsx",
      "components/keyboard-cheatsheet.tsx",
      "components/issue-field-shortcuts.tsx",
      "lib/keyboard/shortcuts.ts",
      "lib/keyboard/keyboard-context.tsx"
    ]
  },
  "review": {
    "revision": 2,
    "fact": "2026-10-08",
    "language": "2026-10-08",
    "date": "2026-10-08"
  },
  "related": [
    "navigation",
    "views-and-filters",
    "desktop-app"
  ],
  "aliases": [],
  "tags": [],
  "figures": [
    {
      "id": "search-and-shortcuts-steps",
      "kind": "screenshot",
      "src": "/documentation/de/work-search.png",
      "alt": "Suchergebnisse für die Kennung eines Demo-Tickets.",
      "caption": "Die Palette findet das Ticket über seine Kennung neben Projektseiten; beim Öffnen bleiben die Zugriffsregeln bestehen.",
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
    "search-and-shortcuts-steps"
  ]
}
---

## Nach einem Objekt suchen {#search-and-shortcuts}

Öffne die Befehlspalette über die Suchfunktion der Navigation. Suche nach einem eindeutigen Titel oder einer Problemkennung und wähle ein Ergebnis. Ergebnisse sind auf Arbeit beschränkt, auf die dein Konto zugreifen kann; eine bekannte Kennung gewährt keinen Zugriff auf ein anderes Projekt.

Drücke Command+K unter macOS oder Strg+K unter Windows/Linux, um die Befehlspalette zu öffnen; Command/Strg+P ist ein alternatives Anwendungskürzel. Außerhalb bearbeitbarer Texte öffnet ? die Kürzelhilfe und C die Problemerstellung. Auf einer Problemkarte unter dem Mauszeiger oder an den unterstützten Detailfunktionen öffnet S den Status, P die Priorität, E den Aufwand, A die zuständige Person, L die Kategorien, D das Fälligkeitsdatum und O das Ziel. Diese Einzelbuchstaben unterbrechen keine Eingabe in einem Eingabefeld, Textbereich oder Inhaltseditor. Navigationsfolgen wie G, dann H (Startseite) und G, dann I (Posteingang) verwenden zwei nacheinander gedrückte Tasten. G, dann W führt nur innerhalb eines Projekts zu den Seiten.

Lies in der Tastenkürzelhilfe die Befehle für deine Plattform. Minddy unterscheidet Anwendungskürzel, Aktionen für Problemeigenschaften und native Desktop-Kürzel für Tabs oder Fenster. Prüfe vor einem Befehl den Fokus: Schreiben im Editor und Handeln am umgebenden Problem sind verschiedene Kontexte.

![Suchergebnisse für die Kennung eines Demo-Tickets.](/documentation/de/work-search.png)

## Ein entsprechendes sichtbares Steuerelement verwenden {#shortcut-alternatives}

Problemfelder bieten neben Tastaturaktionen sichtbare Eigenschaftsauswahlen. Verwende diese auf mobilen Geräten oder wenn Browser beziehungsweise Betriebssystem ein Kürzel abfangen. Schließe ein Overlay oder setze den Fokus auf die vorgesehene Fläche zurück, bevor du eine andere Aktion versuchst.

Die Suche kann ein Problem finden, das in der aktuell gefilterten Ansicht fehlt. Fehlt ein Ergebnis, prüfe Projekt, Konto und Instanz und verwende eine eindeutigere Suchanfrage. Erstelle kein Duplikat, nur weil das aktuelle Board die Aufgabe ausblendet. Die öffentliche Dokumentation hat eine eigene lokalisierte Textsuche, unabhängig von Numo und der Anbieterkonfiguration.

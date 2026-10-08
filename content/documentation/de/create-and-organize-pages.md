---
{
  "id": "create-and-organize-pages",
  "locale": "de",
  "title": "Ein Projektwiki aufbauen",
  "summary": "Erstelle Seiten und Unterseiten, ordne ihre Hierarchie und hebe gemeinsame Favoriten hervor.",
  "topic": "Seiten und Datenbanken",
  "type": "guide",
  "audiences": [
    "member"
  ],
  "workflows": [
    "P01"
  ],
  "visibility": "public",
  "status": "published",
  "revision": 4,
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
      "content/knowledge/pages.md",
      "components/pages/page-create-menu.tsx",
      "components/pages/page-tree.tsx"
    ]
  },
  "review": {
    "revision": 4,
    "fact": "2026-10-08",
    "language": "2026-10-08",
    "date": "2026-10-08"
  },
  "related": [
    "page-editor",
    "page-comments-and-collaboration",
    "publish-a-page"
  ],
  "aliases": [
    "pages"
  ],
  "tags": [],
  "figures": [
    {
      "id": "create-and-organize-pages-steps",
      "kind": "screenshot",
      "src": "/documentation/de/page-create-menu.png",
      "alt": "Erstellungsmenü mit Neue Seite und Neue Datenbank.",
      "caption": "Wähle über die Seitenfunktionen des Projekts ein Dokument oder eine Datenbank.",
      "revision": 4,
      "reviewed": true,
      "capturedAt": "2026-10-08",
      "viewport": [
        1440,
        900
      ],
      "theme": "light"
    }
  ],
  "requiredFigures": [
    "create-and-organize-pages-steps"
  ]
}
---

## Seiten erstellen und ordnen {#create-and-organize-pages}

Öffne den Seitenbereich eines Projekts, dessen Mitglied du bist. Wähle im +-Menü eine Seite für ein Dokument oder eine Datenbank für eine strukturierte Liste. Gib der Seite einen hilfreichen Titel und schreibe die Spezifikation, Entscheidung oder Vorgehensweise, die sie bewahren soll.

Erstelle Unterseiten für zusammengehörige Dokumente und verschiebe oder ordne sie mit den Baumfunktionen. Eine Seite darf nicht unter sich selbst eingeordnet werden. Das Duplizieren erzeugt neue Inhalte statt eines aktuellen Verweises auf das Original. Prüfe den Zweig der Kopie vor Bearbeitung oder Freigabe.

## Favoriten und Löschen {#page-tree}

Markiere eine Seite als Favorit, damit sie oben im Seitenbaum des Projekts erscheint. Diese Favoriten werden im Projekt geteilt, anders als eine private Notiz im Aufgabenheft. Verknüpfe eine Seite mit einem Ticket, wenn das aktuelle Dokument den Aufgabenkontext liefert; der Ressourcentitel folgt einer Umbenennung der Seite.

Das Löschen verschiebt Seiten, für die eine Wiederherstellung vorgesehen ist in den Papierkorb. Prüfe den ausgewählten Zweig vor dem Löschen und verwende die Wiederherstellung statt einer Neuerstellung, wenn der Inhalt einer verlorenen Seite erhalten bleiben soll. Einträge mit gespeicherten Datenbankwerten lassen sich innerhalb ihrer Datenbank umordnen, aber nicht aus ihr heraus verschieben. Prüfe bei einem abgewiesenen Verschieben Hierarchie und Eintragstyp, statt es wiederholt zu erzwingen.


![Erstellungsmenü mit Neue Seite und Neue Datenbank.](/documentation/de/page-create-menu.png)

---
{
  "id": "page-files",
  "locale": "de",
  "title": "Seitendateien anhängen und abrufen",
  "summary": "Lade eine Datei hoch, prüfe den Zugriff und verstehe, was eine Veröffentlichung lesbar macht.",
  "topic": "Seiten und Datenbanken",
  "type": "guide",
  "audiences": [
    "member"
  ],
  "workflows": [
    "P04"
  ],
  "visibility": "public",
  "status": "published",
  "revision": 4,
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
      "components/pages/page-uploads.tsx",
      "lib/server/page-files.ts",
      "content/knowledge/pages.md",
      "lib/server/page-publication.ts"
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
    "publish-a-page",
    "storage-and-attachments"
  ],
  "aliases": [],
  "tags": [],
  "figures": [
    {
      "id": "page-files-steps",
      "kind": "screenshot",
      "src": "/documentation/de/page-file-states.png",
      "alt": "Demoseite mit einem unvollständigen Upload und einer gespeicherten Datei von 67 Byte mit Downloadfunktion.",
      "caption": "Prüfe den tatsächlichen Dateizustand: Der zweite Anhang ist verfügbar, der erste unvollständige Upload nicht.",
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
    "page-files-steps"
  ]
}
---

## Eine Datei hochladen und prüfen {#page-files}

Öffne die Seite als Projektmitglied und verwende die Anhangs- oder Uploadfunktionen. Wähle eine nicht leere Datei innerhalb der Grenze von 10 MB je Datei. Die Speicherquote deines Kontos oder deiner Instanz kann zusätzlich begrenzen. Bewahre das Original auf, bis das Hochladen erfolgreich ist.

Bilder lassen sich als Bildblöcke einfügen, andere Dokumente als Dateiblöcke anhängen. Der Server ermittelt den gespeicherten Medientyp aus den Dateibytes, statt dem Dateinamen oder der Browserangabe zu vertrauen. Eine akzeptierte Datei hat nicht zwingend eine Vorschau innerhalb der Seite. Lade sie herunter, wenn keine Vorschau verfügbar ist.

Prüfe, ob die Datei auf der Seite erscheint, und öffne sie oder lade sie herunter. Die Dateidaten liegen in Storage; Seiten- und Dateimetadaten bestimmen den Zugriff. Ein erfolgreiches Speichern der Seite beweist allein nicht, dass die Dateidaten verfügbar sind.

## Geteilte Dateien und Fehler {#file-access}

Eine auf einer veröffentlichten Seite referenzierte Datei kann deren Besuchern zugänglich gemacht werden. Dateien von Seiten außerhalb des veröffentlichten Zweigs werden nicht allein durch einen Verweis auf einer anderen Seite verfügbar. Prüfe vor der Freigabe die enthaltene Seite und ihre Unterseiten.

Schlägt Hochladen fehl, prüfe Größe, Speicherquote und Fehlermeldung. Bei Selbsthosting sollte der Betreiber außerdem Storage-Konfiguration und Richtlinien prüfen. Fehlt eine Datei nach einer Wiederherstellung, stelle die passenden Storage-Dateidaten und Metadaten wieder her; eine reine Datenbankwiederherstellung kann die Datei nicht rekonstruieren. Veröffentlichte Datei-URLs werden beim Rendern der Seite für bis zu 24 Stunden signiert. Der Widerruf einer Freigabe beendet neue autorisierte Seitenbesuche, macht aber bereits ausgegebene Datei-URLs nicht sofort ungültig. Sie können bis zu ihrem Ablauf weiterhin nutzbar sein. Bereits heruntergeladene Kopien lassen sich nicht zurückholen.


![Demoseite mit einem unvollständigen Upload und einer gespeicherten Datei von 67 Byte mit Downloadfunktion.](/documentation/de/page-file-states.png)

---
{
  "id": "publish-a-page",
  "locale": "de",
  "title": "Eine Seite veröffentlichen und ihren Link widerrufen",
  "summary": "Prüfe die Besuchersicht, wähle Unterseitenzugriff bewusst und widerrufe die Veröffentlichung.",
  "topic": "Seiten und Datenbanken",
  "type": "tutorial",
  "audiences": [
    "member",
    "visitor"
  ],
  "workflows": [
    "P06"
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
      "components/pages/page-publish-dialog.tsx",
      "lib/server/page-publication.ts",
      "app/p/[token]/page.tsx"
    ]
  },
  "review": {
    "revision": 4,
    "fact": "2026-10-08",
    "language": "2026-10-08",
    "date": "2026-10-08"
  },
  "related": [
    "share-a-view",
    "page-files",
    "permissions-and-public-links"
  ],
  "aliases": [],
  "tags": [],
  "figures": [
    {
      "id": "publish-a-page-steps",
      "kind": "screenshot",
      "src": "/documentation/de/page-publish.png",
      "alt": "Veröffentlichungsdialog mit ausgewähltem Privat und Alternativen für Passwort oder Link.",
      "caption": "Privat hält die Seite im Projekt. Prüfe die vorgesehene Zielgruppe vor einer Änderung der Freigabe.",
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
    "publish-a-page-steps"
  ]
}
---

## Die vorgesehenen Inhalte veröffentlichen {#publish-a-page}

Öffne als Mitglied eine Projektseite und verwende ihre Veröffentlichungsfunktionen. Prüfe zuerst Inhalte und Anhänge. Wähle privaten, passwortgeschützten oder öffentlichen Zugriff. Der Passwortschutz benötigt mindestens acht Zeichen und wird erst nach Absenden des Passworts angewendet; die Modusauswahl allein erzeugt keinen geschützten Link.

Kopiere den erzeugten /p/-Link nach erfolgreicher Veröffentlichung. Hat die Seite Unterseiten, prüfe die Option zum Einschließen und deren Anzahl. Das Einschließen veröffentlicht den gewählten Zweig; ohne Einschließen bleiben die Inhalte außerhalb dieser Veröffentlichung. Eine Datenbank ohne veröffentlichte Unterseiten legt nicht automatisch alle Eintragsinhalte offen.

Öffne den Link in einer gesonderten Browsersitzung ohne dein Konto. Prüfe ein aktiviertes Passwort, Seiteninhalt, vorgesehene Unterseiten und Dateidownloads. So prüfst du den Lesezugriff von Besuchern statt deiner weitergehenden Mitgliedsrechte.


![Veröffentlichungsdialog mit ausgewähltem Privat und Alternativen für Passwort oder Link.](/documentation/de/page-publish.png)

## Widerrufen und prüfen {#revoke-page}

Kehre zu den Veröffentlichungsfunktionen zurück und wähle privat. Öffne nach erfolgreichem Widerruf den alten Link anonym und prüfe die Zugriffsverweigerung. Bereits empfangene Kopien oder Bildschirmaufnahmen lassen sich nicht zurückholen. Dateidownload-URLs, die eine veröffentlichte Seite bereits ausgegeben hat, werden für bis zu 24 Stunden signiert. Ein Widerruf verhindert neue Seitenbesuche, doch diese schon ausgegebenen Datei-URLs können bis zu ihrem Ablauf gültig bleiben.

Benutzerseitenlinks bleiben auf noindex und sind von der indexierten offiziellen Anleitung getrennt. Noindex ist eine Auffindbarkeitsregel, kein Zugriffspasswort. Ist eine Unterseite oder Datei unerwartet lesbar, widerrufe zuerst, prüfe den veröffentlichten Zweig und teste erneut, bevor du einen korrigierten Link weiterleitest. Dateien unveröffentlichter Seiten erhalten durch einen internen Verweis keinen Zugriff.

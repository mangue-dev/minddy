---
{
  "id": "profile-and-preferences",
  "locale": "de",
  "title": "Profil und Oberflächenpräferenzen ändern",
  "summary": "Name, Avatar, Sprache, Design und Sendetastenkürzel für Ihr Konto einstellen.",
  "topic": "Konto und Apps",
  "type": "guide",
  "audiences": [
    "member"
  ],
  "workflows": [
    "A01"
  ],
  "visibility": "public",
  "status": "published",
  "revision": 2,
  "sourceRevision": 1,
  "owner": "@mangue-dev",
  "updatedAt": "2026-10-08",
  "compatibility": {
    "version": "0.11.1 candidate (cd1843e12)",
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
      "content/knowledge/settings-and-data.md",
      "components/settings/account-profile-section.tsx",
      "components/settings/account-preferences-section.tsx",
      "app/api/me/avatar/route.ts",
      "lib/server/avatar-seeds.ts"
    ]
  },
  "review": {
    "revision": 2,
    "fact": "2026-10-08",
    "language": "2026-10-08",
    "date": "2026-10-08"
  },
  "related": [
    "account-security",
    "devices-and-notifications",
    "automation-settings",
    "transfer-between-instances",
    "privacy-and-account-deletion"
  ],
  "aliases": [
    "settings-and-data"
  ],
  "tags": [],
  "figures": [
    {
      "id": "profile-and-preferences-workflow",
      "kind": "screenshot",
      "src": "/documentation/de/profile-and-preferences-workflow.png",
      "alt": "Profileinstellungen mit Avatar, Benutzername und schreibgeschützter E-Mail-Adresse.",
      "caption": "Speichere die geprüften Profiländerungen. Die E-Mail-Adresse bleibt schreibgeschützt.",
      "revision": 2,
      "reviewed": true,
      "capturedAt": "2026-10-08",
      "viewport": [
        1440,
        1800
      ],
      "theme": "light"
    },
    {
      "id": "profile-and-preferences-preferences-workflow",
      "kind": "screenshot",
      "src": "/documentation/de/profile-and-preferences-preferences-workflow.png",
      "alt": "Sprachauswahl und Schalter für helles, dunkles und Systemdesign.",
      "caption": "Die Kontosprache und die Sprache der öffentlichen Website werden getrennt eingestellt.",
      "revision": 2,
      "reviewed": true,
      "capturedAt": "2026-10-08",
      "viewport": [
        1440,
        1800
      ],
      "theme": "light"
    }
  ],
  "requiredFigures": [
    "profile-and-preferences-workflow",
    "profile-and-preferences-preferences-workflow"
  ]
}
---

## Identität aktualisieren {#profile-and-preferences}
Öffnen Sie die Kontoeinstellungen im Kontomenü. Tragen Sie im Profil einen nicht leeren Anzeigenamen ein und speichern Sie. Die E-Mail-Adresse ist schreibgeschützt. Erzeugen Sie einen Avatar oder laden Sie ein Bild über die Avatar-Steuerung hoch. Warten Sie auf das Ergebnis und prüfen Sie ihn in einem Kommentar oder in der Mitgliederliste; derselbe Avatar gilt projekt- und gesprächsübergreifend. Folgen Sie bei abgewiesenen Dateien der Validierungsmeldung, statt sie wiederholt hochzuladen.

Das Quellbild darf höchstens 10 MiB groß sein. Der Server prüft lesbare Bilddaten, berücksichtigt die Orientierung und schneidet mittig auf einen WebP-Avatar mit 256 × 256 Pixeln zu.

![Profileinstellungen mit Avatar, Benutzername und schreibgeschützter E-Mail-Adresse.](/documentation/de/profile-and-preferences-workflow.png)


## Die Oberfläche einstellen {#preferences}
Wählen Sie in den Präferenzen Sprache und Design und prüfen Sie eine andere Seite. Die Kontosprache betrifft das angemeldete Produkt; die öffentliche Website besitzt eine eigene Sprachauswahl. Das Design wird im Konto geräteübergreifend gespeichert.

Wählen Sie das Sendetastenkürzel unter Tastatur. Es gilt für Kommentare und Numo. Nutzen Sie die Sendeschaltfläche, wenn das Betriebssystem das Kürzel abfängt; Modifikatortasten unterscheiden sich je Plattform. Ticketpräferenzen wie automatische Zuweisung und Status von Numo-Tickets gehören ebenfalls zum Konto und ändern keine Einstellungen anderer Mitglieder.

![Sprachauswahl und Schalter für helles, dunkles und Systemdesign.](/documentation/de/profile-and-preferences-preferences-workflow.png)

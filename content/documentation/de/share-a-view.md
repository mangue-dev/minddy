---
{
  "id": "share-a-view",
  "locale": "de",
  "title": "Eine schreibgeschützte Ansicht teilen und widerrufen",
  "summary": "Veröffentliche die vorgesehene Problemauswahl, ohne Besuchern eine Projektmitgliedschaft zu geben.",
  "topic": "Arbeit planen und finden",
  "type": "guide",
  "audiences": [
    "member"
  ],
  "workflows": [
    "W14"
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
      "app/api/views/[id]/share/route.ts",
      "app/share/[token]/page.tsx",
      "content/knowledge/feedback.md",
      "lib/server/view-shares.ts",
      "components/board-toolbar.tsx",
      "lib/public-board-projection.ts"
    ]
  },
  "review": {
    "revision": 2,
    "fact": "2026-10-08",
    "language": "2026-10-08",
    "date": "2026-10-08"
  },
  "related": [
    "views-and-filters",
    "publish-a-page",
    "permissions-and-public-links"
  ],
  "aliases": [],
  "tags": [],
  "figures": [
    {
      "id": "share-a-view-steps",
      "kind": "screenshot",
      "src": "/documentation/de/work-share-view.png",
      "alt": "Freigabedialog einer Ansicht mit ausgewähltem privatem Zugriff.",
      "caption": "Privater, passwortgeschützter und öffentlicher Zugriff sind unterschiedliche Optionen. Die Ansicht bleibt hier privat.",
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
    "share-a-view-steps"
  ]
}
---

## Die Ansicht veröffentlichen {#share-a-view}

Öffne das Ansichtsmenü auf einem geeigneten Projektboard und wähle die Aktion zum Teilen der Ansicht. Du brauchst Projektzugriff; eine persönliche Ansicht innerhalb des Projekts kann nur ihr eigener Benutzer teilen. Globale projektübergreifende Ansichten lassen sich nicht teilen. Prüfe Filter und sichtbare Inhalte vor der Veröffentlichung. Wähle einen öffentlichen geheimen Link oder einen Passwortschutz, sofern angeboten. Passwörter benötigen mindestens acht Zeichen. Kopiere den erzeugten Link erst, wenn die Änderung erfolgreich gespeichert wurde.

Öffne den Link in einer separaten Browsersitzung ohne dein Konto. Prüfe die Problemauswahl, Felder und verknüpften Inhalte, die Besucher sehen können. Der öffentliche Link gewährt schreibgeschützten Zugriff auf die Ansicht, keine Mitgliedschaft oder Bearbeitungsrechte im Projekt.

Geteilte Karten zeigen Titel, Beschreibungen und eingeblendete Eigenschaften, darunter Namen zuständiger Personen, Kategorien, Zielnamen, Fälligkeitstermine, Wiederholung und vorhandene Links zur entfernten Git-Plattform. Die veröffentlichte Darstellung enthält keine Inhalte von Umsetzungsplänen und keine E-Mail-Adressen der Mitglieder. Kennzeichnungen übergeordneter Probleme und Beziehungen können Kennungen von Projektproblemen außerhalb des Ansichtsfilters zeigen. Prüfe diese Beschreibungen, Namen und Kennungen ebenso wie die sichtbaren Spalten. Das Ausblenden einer Karteneigenschaft ist keine allgemeine Schwärzung vertraulicher Inhalte.

![Freigabedialog einer Ansicht mit ausgewähltem privatem Zugriff.](/documentation/de/work-share-view.png)

## Widerrufen und prüfen {#revoke-view}

Kehre zu den Freigabesteuerungen der Ansicht zurück und stelle sie auf privat, um die Veröffentlichung zu widerrufen. Öffne den alten Link erneut anonym und prüfe, ob der Zugriff verweigert wird. Der Widerruf kann gespeicherte Kopien oder Screenshots der Besucher nicht zurückholen.

Geheime Ansichtslinks verwenden den Veröffentlichungsweg für private Links und bleiben noindex. Diese Indexierungsregel begrenzt die Auffindbarkeit durch Suchmaschinen, ersetzt aber kein Passwort. Halte den Link bei sensiblen Inhalten privat und verwende gegebenenfalls Passwortschutz. Verwechsle die geteilte Ansicht eines Benutzers nicht mit der indexierten offiziellen Dokumentation.

Weicht das anonyme Ergebnis von deiner Erwartung ab, prüfe die gespeicherte Ansicht und Freigabekonfiguration, bevor du den Link weitergibst. Kontrolliere den Umfang nach Änderungen an Filtern oder verknüpften Inhalten erneut.

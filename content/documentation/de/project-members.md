---
{
  "id": "project-members",
  "locale": "de",
  "title": "Personen zu einem Projekt einladen",
  "summary": "Verwende die vorgesehene Konto-E-Mail-Adresse, nimm Einladungen an und verwalte den Projektzugriff.",
  "topic": "Erste Schritte",
  "type": "guide",
  "audiences": [
    "owner",
    "member"
  ],
  "workflows": [
    "S06"
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
      "components/inbox-content.tsx",
      "components/home/onboarding-join-dialog.tsx",
      "content/knowledge/settings-and-data.md",
      "components/project-members.tsx",
      "lib/server/update-project.ts"
    ]
  },
  "review": {
    "revision": 4,
    "fact": "2026-10-08",
    "language": "2026-10-08",
    "date": "2026-10-08"
  },
  "related": [
    "project-settings",
    "notifications-and-inbox",
    "permissions-and-public-links"
  ],
  "aliases": [],
  "tags": [],
  "figures": [
    {
      "id": "project-members-steps",
      "kind": "screenshot",
      "src": "/documentation/de/project-members.png",
      "alt": "E-Mail-Einladung und drei Demomitglieder mit Kennzeichnung des Eigentümers.",
      "caption": "Lade Mitglieder über ihre Konto-E-Mail ein und prüfe den Eigentümer, bevor du einen Zugang entfernst.",
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
    "project-members-steps"
  ]
}
---

## Eine Einladung senden und annehmen {#project-members}

Der Projekteigentümer verwaltet die Mitgliedschaft in den Mitgliedereinstellungen des Projekts. Frage die mitwirkende Person nach ihrer E-Mail-Adresse auf dieser Instanz, sende die Einladung und prüfe, ob sie als ausstehend angezeigt wird. Dieselbe E-Mail-Adresse auf einer anderen Instanz gewährt hier keinen Zugriff.

Die eingeladene Person meldet sich mit diesem Konto an und öffnet den Posteingang. Nimm die ausstehende Einladung an, um beizutreten, oder lehne sie ab, wenn das Projekt unerwartet ist. Der Beitrittsdialog beim ersten Einstieg hilft, deine E-Mail-Adresse an den Eigentümer weiterzugeben; ohne Einladung kannst du damit keinem Projekt beitreten.


![E-Mail-Einladung und drei Demomitglieder mit Kennzeichnung des Eigentümers.](/documentation/de/project-members.png)

## Zuständigkeiten von Eigentümer und Mitglied {#member-permissions}

| Akteur | Typischer Projektzugriff |
| --- | --- |
| Mitglied | Mit Problemen, Seiten und den Zusammenarbeitsbereichen des Projekts arbeiten; eigene Kontoeinstellungen verwalten. |
| Eigentümer | Abläufe für Mitglieder sowie Projekteinstellungen, Einladungen und Eigentümern vorbehaltene Integrations- oder Automatisierungseinstellungen. |
| Besucher über einen öffentlichen Link | Nur die ausdrücklich über diesen Link veröffentlichten Inhalte; keine Projektmitgliedschaft. |

Prüfe die Mitgliederliste, bevor du jemanden entfernst. Die Eigentümerzeile bietet keine Entfernung an und diese Mitgliederfunktionen übertragen die Projekteigentümerschaft nicht. Der Eigentümer kann eine ausstehende Einladung vor ihrer Annahme widerrufen; der ausstehende Zustand verrät nicht, ob diese Adresse bereits ein Konto hat. Das Entfernen beendet den Zugriff über die Mitgliedschaft; bereits empfangene Exporte, Bildschirmaufnahmen oder Kopien lassen sich damit nicht zurückholen. Persönliche Git-, KI- und MCP-Zugangsdaten gehören weiterhin zum Konto und werden durch einen Eigentümerwechsel nicht übertragen.

## Fehlenden Zugriff klären {#invitation-recovery}

Fehlt eine Einladung, vergleiche die eingeladene E-Mail-Adresse mit dem angemeldeten Konto und prüfe die Instanz-URL. Bitte den Eigentümer, ausstehende Einladungen zu prüfen, statt wiederholt Konten anzulegen. Ändern sich Projektberechtigungen während einer geöffneten Sitzung, lade das Ziel neu und prüfe die Mitgliedschaft, bevor du Schreibaktionen wiederholst. Nutze nicht die Sitzung einer anderen Person, um einen Zugriffsfehler zu umgehen.

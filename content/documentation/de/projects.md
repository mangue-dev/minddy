---
{
  "id": "projects",
  "locale": "de",
  "title": "Projekte und Mitglieder",
  "summary": "Richte ein Projekt ein, lade andere Personen ein und verwalte Mitgliedschaften mit den erforderlichen Berechtigungen.",
  "topic": "Erste Schritte",
  "type": "guide",
  "audiences": [
    "owner",
    "member"
  ],
  "workflows": [
    "S05",
    "S06"
  ],
  "visibility": "public",
  "status": "published",
  "revision": 5,
  "sourceRevision": 5,
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
      "content/knowledge/settings-and-data.md",
      "components/settings/project-general-section.tsx",
      "components/inbox-content.tsx",
      "components/home/onboarding-join-dialog.tsx",
      "components/project-members.tsx",
      "lib/server/update-project.ts"
    ]
  },
  "review": {
    "revision": 5,
    "fact": "agent:/root/german_spanish_review (structural consolidation review; prior procedural evidence retained; no operational rerun)",
    "language": "agent:/root/german_spanish_review (de title, summary, lead and heading review; retained body comparison)",
    "date": "2026-10-09"
  },
  "related": [
    "issues",
    "git",
    "trash-and-recovery",
    "notifications-and-inbox",
    "permissions-and-public-links"
  ],
  "aliases": [
    "project-settings",
    "project-members"
  ],
  "tags": [
    "Ein Projekt einrichten",
    "Personen zu einem Projekt einladen"
  ],
  "figures": [
    {
      "id": "project-settings-steps",
      "kind": "screenshot",
      "src": "/documentation/de/project-general.png",
      "alt": "Allgemeine Projekteinstellungen mit Name, Schlüssel, Symbol und eigener Papierkorbaktion.",
      "caption": "Prüfe Namen und Schlüssel vor dem Speichern. Das Verschieben in den Papierkorb ist eine eigene Aktion.",
      "revision": 5,
      "reviewed": true,
      "capturedAt": "2026-10-08",
      "viewport": [
        1440,
        1080
      ],
      "theme": "light"
    },
    {
      "id": "project-members-steps",
      "kind": "screenshot",
      "src": "/documentation/de/project-members.png",
      "alt": "E-Mail-Einladung und drei Demomitglieder mit Kennzeichnung des Eigentümers.",
      "caption": "Lade Mitglieder über ihre Konto-E-Mail ein und prüfe den Eigentümer, bevor du einen Zugang entfernst.",
      "revision": 5,
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
    "project-settings-steps",
    "project-members-steps"
  ]
}
---

Ein Projekt verbindet gemeinsame Arbeit mit dem Zugriff seiner Mitglieder. Die folgenden Abschnitte behandeln Einstellungen und Einladungen und unterscheiden die Funktionen des Projekteigentümers von denen der Mitglieder.

## Ein Projekt einrichten {#project-settings}

Öffne das Projekt und anschließend seine Einstellungen. Administrative Einstellungen unterliegen der Projekteigentümerschaft. Mitglieder können den allgemeinen Bereich ansehen und das Projekt verlassen, erhalten aber nicht die Bearbeitungsfunktionen des Eigentümers.

Gib als Eigentümer einen nicht leeren Namen und einen gültigen Projektschlüssel ein und speichere. Der Schlüssel wird in Großbuchstaben umgewandelt und besteht aus 2 bis 5 Buchstaben oder Ziffern. Prüfe nach einer Änderung die entstandenen Kennungen. Verwende Symbol- und Darstellungsfunktionen, um das Projekt in der Navigation zu unterscheiden; diese visuellen Entscheidungen verändern die Mitgliedschaft nicht.

Weitere Bereiche verwalten Mitwirkende, wiederkehrende Probleme, Git, Import, Integrationen, Automatisierung und Feedback. Lies die jeweilige Aufgabenanleitung, bevor du einen Anbieter oder automatische Arbeit aktivierst. Kontoeinstellungen wie deine Oberflächensprache sind von der Projektkonfiguration getrennt.


![Allgemeine Projekteinstellungen mit Name, Schlüssel, Symbol und eigener Papierkorbaktion.](/documentation/de/project-general.png)

### Verlassen und löschen {#project-removal}

Ein Mitglied kann das Projekt über die entsprechende Aktion verlassen und damit seinen eigenen Zugriff entfernen. Bitte den Eigentümer um eine erneute Einladung, wenn du später wieder Zugriff brauchst. Das Verlassen löscht das Projekt nicht für alle.

Das Löschen eines Projekts ist eine Eigentümeraktion im Gefahrenbereich. Lies die Folgen und die Bestätigung, bevor du sie ausführst, besonders wenn das Projekt Probleme, Seiten, Dateien oder Integrationen enthält. Schlägt ein normales Speichern fehl, bewahre die gewünschten Werte auf, lies die Fehlermeldung und aktualisiere das Projekt vor einem neuen Versuch. Sende eine destruktive Aktion nicht wiederholt ab, solange ihr erstes Ergebnis unklar ist.

## Personen zu einem Projekt einladen {#project-members}

Der Projekteigentümer verwaltet die Mitgliedschaft in den Mitgliedereinstellungen des Projekts. Frage die mitwirkende Person nach ihrer E-Mail-Adresse auf dieser Instanz, sende die Einladung und prüfe, ob sie als ausstehend angezeigt wird. Dieselbe E-Mail-Adresse auf einer anderen Instanz gewährt hier keinen Zugriff.

Die eingeladene Person meldet sich mit diesem Konto an und öffnet den Posteingang. Nimm die ausstehende Einladung an, um beizutreten, oder lehne sie ab, wenn das Projekt unerwartet ist. Der Beitrittsdialog beim ersten Einstieg hilft, deine E-Mail-Adresse an den Eigentümer weiterzugeben; ohne Einladung kannst du damit keinem Projekt beitreten.


![E-Mail-Einladung und drei Demomitglieder mit Kennzeichnung des Eigentümers.](/documentation/de/project-members.png)

### Zuständigkeiten von Eigentümer und Mitglied {#member-permissions}

| Akteur | Typischer Projektzugriff |
| --- | --- |
| Mitglied | Mit Problemen, Seiten und den Zusammenarbeitsbereichen des Projekts arbeiten; eigene Kontoeinstellungen verwalten. |
| Eigentümer | Abläufe für Mitglieder sowie Projekteinstellungen, Einladungen und Eigentümern vorbehaltene Integrations- oder Automatisierungseinstellungen. |
| Besucher über einen öffentlichen Link | Nur die ausdrücklich über diesen Link veröffentlichten Inhalte; keine Projektmitgliedschaft. |

Prüfe die Mitgliederliste, bevor du jemanden entfernst. Die Eigentümerzeile bietet keine Entfernung an und diese Mitgliederfunktionen übertragen die Projekteigentümerschaft nicht. Der Eigentümer kann eine ausstehende Einladung vor ihrer Annahme widerrufen; der ausstehende Zustand verrät nicht, ob diese Adresse bereits ein Konto hat. Das Entfernen beendet den Zugriff über die Mitgliedschaft; bereits empfangene Exporte, Bildschirmaufnahmen oder Kopien lassen sich damit nicht zurückholen. Persönliche Git-, KI- und MCP-Zugangsdaten gehören weiterhin zum Konto und werden durch einen Eigentümerwechsel nicht übertragen.

### Fehlenden Zugriff klären {#invitation-recovery}

Fehlt eine Einladung, vergleiche die eingeladene E-Mail-Adresse mit dem angemeldeten Konto und prüfe die Instanz-URL. Bitte den Eigentümer, ausstehende Einladungen zu prüfen, statt wiederholt Konten anzulegen. Ändern sich Projektberechtigungen während einer geöffneten Sitzung, lade das Ziel neu und prüfe die Mitgliedschaft, bevor du Schreibaktionen wiederholst. Nutze nicht die Sitzung einer anderen Person, um einen Zugriffsfehler zu umgehen.

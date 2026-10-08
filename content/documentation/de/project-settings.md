---
{
  "id": "project-settings",
  "locale": "de",
  "title": "Ein Projekt einrichten",
  "summary": "Ändere als Eigentümer Name, Schlüssel und Darstellung und verstehe den Zugriff von Mitgliedern.",
  "topic": "Erste Schritte",
  "type": "guide",
  "audiences": [
    "owner"
  ],
  "workflows": [
    "S05"
  ],
  "visibility": "public",
  "status": "published",
  "revision": 3,
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
      "content/knowledge/settings-and-data.md",
      "components/settings/project-general-section.tsx"
    ]
  },
  "review": {
    "revision": 3,
    "fact": "2026-10-08",
    "language": "2026-10-08",
    "date": "2026-10-08"
  },
  "related": [
    "project-members",
    "recurring-issues",
    "git-accounts-and-repositories",
    "trash-and-recovery"
  ],
  "aliases": [],
  "tags": [],
  "figures": [
    {
      "id": "project-settings-steps",
      "kind": "screenshot",
      "src": "/documentation/de/project-general.png",
      "alt": "Allgemeine Projekteinstellungen mit Name, Schlüssel, Symbol und eigener Papierkorbaktion.",
      "caption": "Prüfe Namen und Schlüssel vor dem Speichern. Das Verschieben in den Papierkorb ist eine eigene Aktion.",
      "revision": 3,
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
    "project-settings-steps"
  ]
}
---

## Die Projekteinstellungen öffnen {#project-settings}

Öffne das Projekt und anschließend seine Einstellungen. Administrative Einstellungen unterliegen der Projekteigentümerschaft. Mitglieder können den allgemeinen Bereich ansehen und das Projekt verlassen, erhalten aber nicht die Bearbeitungsfunktionen des Eigentümers.

Gib als Eigentümer einen nicht leeren Namen und einen gültigen Projektschlüssel ein und speichere. Der Schlüssel wird in Großbuchstaben umgewandelt und besteht aus 2 bis 5 Buchstaben oder Ziffern. Prüfe nach einer Änderung die entstandenen Kennungen. Verwende Symbol- und Darstellungsfunktionen, um das Projekt in der Navigation zu unterscheiden; diese visuellen Entscheidungen verändern die Mitgliedschaft nicht.

Weitere Bereiche verwalten Mitwirkende, wiederkehrende Probleme, Git, Import, Integrationen, Automatisierung und Feedback. Lies die jeweilige Aufgabenanleitung, bevor du einen Anbieter oder automatische Arbeit aktivierst. Kontoeinstellungen wie deine Oberflächensprache sind von der Projektkonfiguration getrennt.


![Allgemeine Projekteinstellungen mit Name, Schlüssel, Symbol und eigener Papierkorbaktion.](/documentation/de/project-general.png)

## Verlassen und löschen {#project-removal}

Ein Mitglied kann das Projekt über die entsprechende Aktion verlassen und damit seinen eigenen Zugriff entfernen. Bitte den Eigentümer um eine erneute Einladung, wenn du später wieder Zugriff brauchst. Das Verlassen löscht das Projekt nicht für alle.

Das Löschen eines Projekts ist eine Eigentümeraktion im Gefahrenbereich. Lies die Folgen und die Bestätigung, bevor du sie ausführst, besonders wenn das Projekt Probleme, Seiten, Dateien oder Integrationen enthält. Schlägt ein normales Speichern fehl, bewahre die gewünschten Werte auf, lies die Fehlermeldung und aktualisiere das Projekt vor einem neuen Versuch. Sende eine destruktive Aktion nicht wiederholt ab, solange ihr erstes Ergebnis unklar ist.

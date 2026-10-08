---
{
  "id": "privacy-and-account-deletion",
  "locale": "de",
  "title": "Analyse steuern und Konto sorgfältig löschen",
  "summary": "Datenziele und Löschfolgen vor einem unumkehrbaren Auftrag prüfen.",
  "topic": "Konto und Apps",
  "type": "guide",
  "audiences": [
    "member"
  ],
  "workflows": [
    "A09"
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
      "components/settings/account-analytics-section.tsx",
      "components/settings/account-data-section.tsx",
      "app/api/account/deletion-preview/route.ts",
      "app/api/account/route.ts"
    ]
  },
  "review": {
    "revision": 2,
    "fact": "2026-10-08",
    "language": "2026-10-08",
    "date": "2026-10-08"
  },
  "related": [],
  "aliases": [],
  "tags": [],
  "figures": [
    {
      "id": "privacy-and-account-deletion-workflow",
      "kind": "screenshot",
      "src": "/documentation/de/privacy-and-account-deletion-workflow.png",
      "alt": "Löschvorschau mit eigenen Projekten, Tickets und Mitgliedern, die Zugriff verlieren.",
      "caption": "Lies die Vorschau und exportiere gewünschte Daten, bevor du die Löschbestätigung öffnest.",
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
    "privacy-and-account-deletion-workflow"
  ]
}
---

## Analysezustimmung {#privacy-and-account-deletion}

Wenn Analytics konfiguriert ist, zeigen die Kontoeinstellungen einen Zustimmungsschalter und einen Link zur Cookie-Richtlinie. Das Abschalten ändert die Zustimmung zur Messung auf diesem Gerät sofort und speichert die Auswahl im Konto. Eine bereits vorhandene lokale Entscheidung auf einem anderen Gerät kann dort weiterhin gelten. Ist kein Analytics-Dienst konfiguriert, fehlt der Bereich.

Die Zustimmung ist von den für den Kontobetrieb erforderlichen Daten getrennt. Lesen Sie die Datenschutzrichtlinie der Instanz und prüfen Sie aktivierte externe Anbieter. Beim selbst betriebenen Minddy bestimmen Konfiguration und Richtlinien des Betreibers die Dienstziele. Analytics abzuschalten entfernt keine KI- oder Git-Integrationen.

![Löschvorschau mit eigenen Projekten, Tickets und Mitgliedern, die Zugriff verlieren.](/documentation/de/privacy-and-account-deletion-workflow.png)


## Löschvorschau prüfen {#deletion}

Exportieren Sie vor der Kontolöschung benötigte Daten im Bereich Daten. Lesen Sie die Vorschau der von Ihnen besessenen Projekte, betroffenen Mitglieder, Tickets, Kommentare und des aktiven Abonnements. Folgen für eigene Projekte betreffen andere Menschen; klären Sie diese vor der Bestätigung.

Öffnen Sie die Löschbestätigung erst, wenn Sie bereit sind. Geben Sie Ihre Konto-E-Mail-Adresse und bei Passwortkonten das Passwort ein. Konten ohne Passwort benötigen eine kürzlich erfolgte Anmeldung. Befolgen Sie Hinweise auf eine abgelehnte erneute Authentifizierung, statt blind erneut zu versuchen. Eine erfolgreiche Löschung meldet das Konto ab und führt zur öffentlichen Website zurück. Dies ist kein wiederherstellbarer Papierkorb. Halten Sie Exporte privat und bearbeiten Sie verbleibende Abonnement- oder Anbieterfragen über die jeweiligen Abrechnungs- und Anbieterfunktionen.

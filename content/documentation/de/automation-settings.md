---
{
  "id": "automation-settings",
  "locale": "de",
  "title": "Automatische Ticketarbeit konfigurieren",
  "summary": "Kontopräferenzen von Projekteigentümerregeln unterscheiden.",
  "topic": "Konto und Apps",
  "type": "guide",
  "audiences": [
    "owner"
  ],
  "workflows": [
    "A05"
  ],
  "visibility": "public",
  "status": "published",
  "revision": 3,
  "sourceRevision": 2,
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
      "components/settings/account-automations-section.tsx",
      "components/settings/smart-assign-section.tsx",
      "content/knowledge/settings-and-data.md",
      "content/documentation/reviews/remaining-account-capture-candidates.json",
      "lib/server/agent/quota.ts",
      "lib/server/usage.ts",
      "lib/server/agent/execute.ts"
    ]
  },
  "review": {
    "revision": 3,
    "fact": "2026-10-08",
    "language": "2026-10-08",
    "date": "2026-10-08"
  },
  "related": [],
  "aliases": [],
  "tags": [],
  "figures": [
    {
      "id": "automation-settings-workflow",
      "kind": "screenshot",
      "src": "/documentation/de/automation-settings-workflow.png",
      "alt": "Automatisierungsvoreinstellung ohne ausgewähltes Preset.",
      "caption": "Ohne Voreinstellung startet dieses Konto keine automatischen Arbeiten.",
      "revision": 3,
      "reviewed": true,
      "capturedAt": "2026-10-08",
      "viewport": [
        1440,
        1800
      ],
      "theme": "light"
    },
    {
      "id": "automation-settings-projects-workflow",
      "kind": "screenshot",
      "src": "/documentation/de/automation-settings-projects-workflow.png",
      "alt": "Projektauswahl für Kontoautomatisierungen.",
      "caption": "Projektauswahl für Kontoautomatisierungen. Beide Demonstrationsprojekte sind hier deaktiviert; keine Automatisierung wird gestartet.",
      "revision": 3,
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
    "automation-settings-workflow",
    "automation-settings-projects-workflow"
  ]
}
---

## Automatisierung im Konto {#automation-settings}

Öffnen Sie Automatisierungen in den Kontoeinstellungen. Wählen Sie eine Voreinstellung, lesen Sie ihre Erklärung und den geschätzten Verbrauch, legen Sie die Startverzögerung fest und wählen Sie die Aufwandsgrößen für automatische Schritte. Schätzungen hängen vom verfügbaren Kontingent ab und sind keine festen Preise. Prüfen Sie das Worker-Modell in den KI-Einstellungen des Kontos, bevor Sie Codearbeit aktivieren. Dieselbe Seite zeigt Automatisierungsschalter für Projekte, deren Inhaber Sie sind. Mitglieder können nicht das Projekt eines anderen Inhabers aktivieren.

![Automatisierungsvoreinstellung ohne ausgewähltes Preset.](/documentation/de/automation-settings-workflow.png)


## Mechanismen unterscheiden {#mechanisms}

Smart Fill ergänzt fehlende Priorität, Aufwand, Kategorien und Ziel. Es wählt weder Status noch zuständige Person oder Fälligkeit. Die Kontoeinstellungen unterscheiden zwischen dem Ergänzen bei der Erstellung und dem Ergänzen geeigneter Triage-Tickets in Projekten, deren Inhaber Sie sind. Automatische Selbstzuweisung bei Erstellung oder Arbeitsbeginn ist eine separate Einstellung; bei Arbeitsbeginn betrifft sie nur nicht zugewiesene Tickets.

Smart Assign ist eine Projekteinstellung des Inhabers mit Regeln je Mitglied. Smart Triage verwendet statische Projektregeln und unterscheidet sich von KI-Ergänzungen und Codeausführung. Prüfen Sie für jede Regel die vorgesehenen Empfänger und Auslöser, bevor Sie speichern.

Aktivieren Sie nur Schritte, die ohne weitere manuelle Aufforderung laufen sollen. KI-Schritte benötigen einen nutzbaren konfigurierten Anbieter und müssen die Budgetprüfungen bestehen, die für den jeweiligen Aufruf gelten. Kompatible validierte persönliche Schlüssel können ihre Aufrufe vom enthaltenen KI-Kontingent des Kontos ausnehmen und die Modellabrechnung zum Anbieter verlagern. Die Sandbox-Rechenleistung wird dadurch nicht kostenlos: Ihre Kosten werden weiterhin separat erfasst, und das Budget pro Routinenlauf bleibt eine eigene Grenze. Beginnt unerwartete Arbeit, prüfen Sie die Ticketaktivität und Konversation. Deaktivieren Sie dann den betreffenden Konto- oder Projektschalter, bevor Sie weitere Testtickets erstellen.

![Projektauswahl für Kontoautomatisierungen.](/documentation/de/automation-settings-projects-workflow.png)

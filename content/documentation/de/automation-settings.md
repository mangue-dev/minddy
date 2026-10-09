---
{
  "id": "automation-settings",
  "locale": "de",
  "title": "Ticket-Automatisierung",
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
  "revision": 5,
  "sourceRevision": 5,
  "owner": "@mangue-dev",
  "updatedAt": "2026-10-09",
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
      "lib/server/agent/execute.ts",
      "content/documentation/reviews/visual-refresh-captures-2026-10-09.json"
    ]
  },
  "review": {
    "revision": 5,
    "fact": "agent:/root/german_spanish_review (structural consolidation review; prior procedural evidence retained; no operational rerun); agent:/root (visual usefulness, figure framing and preserved procedures; previous operational evidence retained)",
    "language": "agent:/root/german_spanish_review (de title, summary, lead and heading review; retained body comparison)",
    "date": "2026-10-09"
  },
  "related": [],
  "aliases": [],
  "tags": [
    "Automatische Ticketarbeit konfigurieren"
  ],
  "figures": [
    {
      "id": "automation-settings-workflow",
      "kind": "screenshot",
      "src": "/documentation/de/automation-settings-workflow.png",
      "alt": "Automatisierungsvoreinstellung ohne ausgewähltes Preset.",
      "caption": "Ohne Voreinstellung startet dieses Konto keine automatischen Arbeiten.",
      "revision": 5,
      "reviewed": true,
      "capturedAt": "2026-10-09",
      "viewport": [
        816,
        201
      ],
      "theme": "light",
      "padding": 24,
      "deviceScaleFactor": 2
    },
    {
      "id": "automation-settings-projects-workflow",
      "kind": "screenshot",
      "src": "/documentation/de/automation-settings-projects-workflow.png",
      "alt": "Projektauswahl für Kontoautomatisierungen.",
      "caption": "Projektauswahl für Kontoautomatisierungen. Beide Demonstrationsprojekte sind hier deaktiviert; keine Automatisierung wird gestartet.",
      "revision": 5,
      "reviewed": true,
      "capturedAt": "2026-10-09",
      "viewport": [
        816,
        176
      ],
      "theme": "light",
      "padding": 24,
      "deviceScaleFactor": 2
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

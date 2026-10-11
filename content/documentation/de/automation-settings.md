---
{
  "id": "automation-settings",
  "locale": "de",
  "title": "Von Automatisierungen zu Routinen",
  "summary": "Prüfen Sie pausierte Migrationsvorschläge vor der Aktivierung ereignisgesteuerter Numo-Arbeit.",
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
  "revision": 6,
  "sourceRevision": 6,
  "owner": "@mangue-dev",
  "updatedAt": "2026-10-11",
  "compatibility": {
    "version": "0.11.1 candidate (MIN-677)",
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
      "components/settings/smart-assign-section.tsx",
      "content/knowledge/settings-and-data.md",
      "content/documentation/reviews/remaining-account-capture-candidates.json",
      "lib/server/agent/quota.ts",
      "lib/server/usage.ts",
      "lib/server/agent/execute.ts",
      "content/documentation/reviews/visual-refresh-captures-2026-10-09.json",
      "content/documentation/reviews/min-677-routines.md"
    ]
  },
  "review": {
    "revision": 6,
    "fact": "agent:/root (MIN-677 source review and isolated PostgreSQL regressions; unchanged procedures retain prior evidence)",
    "language": "agent:/root (de translation, label and retained-meaning self-review)",
    "date": "2026-10-11"
  },
  "related": [],
  "aliases": [],
  "tags": [
    "Automatische Ticketarbeit konfigurieren"
  ],
  "figures": [],
  "requiredFigures": []
}
---

## Migrierte Arbeit prüfen {#automation-settings}

Die Automatisierungsschalter des Projekts sowie Kontovoreinstellungen, Aufwandsfilter und Startverzögerungen wurden durch [Routinen](/docs/scheduled-routines) ersetzt. Öffnen Sie Routinen als Projekteigentümer. Aktivierte archivierte Regeln werden einmalig als pausierte Routinen vorgeschlagen; das Öffnen der Liste aktiviert sie nicht und verbraucht kein Ausführungsbudget.

Prüfen Sie Anweisung, Statusauslöser, Bedingungen, Verzögerung und Ausgabenlimit jedes Vorschlags. Der ursprüngliche Workflow bleibt zum Vergleich in der Anweisung erhalten. Prüfen Sie menschliche Freigaben und nicht verfügbare Referenzen vor der Aktivierung. Vorschläge fordern bei menschlichen Freigaben die Eingabe des Eigentümers und begrenzen jede Ausführung standardmäßig auf 15 % des Monatsbudgets. Sie setzen die alte Kette nicht stillschweigend fort. Ausstehende und auf Menschen wartende Ketten werden beendet; laufende Codearbeit kann fertig werden oder in ihrer Konversation gestoppt werden, ohne einen folgenden Kettenschritt. Historische Aktivitäten und Kontosicherungen bewahren das Archiv.

## Andere Projekthilfen unterscheiden {#mechanisms}

Smart Fill ergänzt weiterhin fehlende Priorität, Aufwand, Kategorien und Ziel. Smart Assign bleibt eine Eigentümereinstellung mit Regeln je Mitglied. Smart Triage bleibt eine statische Regelverwaltung. Automatische Selbstzuweisung bleibt eine separate Einstellung. Diese Hilfen aktivieren keine migrierten Vorschläge.

Testen Sie eine geprüfte Routine manuell, lesen Sie ihre private Konversation und ihr Budget und aktivieren Sie sie für künftige Ereignisse. Pausieren Sie bei unerwarteter Arbeit die Routine und prüfen Sie die Ausführung vor einem erneuten Versuch. Der [Routinenleitfaden](/docs/scheduled-routines#conditions) erklärt Wartezustände und deren Verwerfung.

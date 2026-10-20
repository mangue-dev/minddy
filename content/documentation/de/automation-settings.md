---
{
  "id": "automation-settings",
  "locale": "de",
  "title": "Von Automatisierungen zu Routinen",
  "summary": "Erfahren Sie, was aus den Projektautomatisierungen geworden ist, und bilden Sie einen Workflow als vom Eigentümer gesteuerte Routine neu ab.",
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
  "revision": 8,
  "sourceRevision": 8,
  "owner": "@mangue-dev",
  "updatedAt": "2026-10-20",
  "compatibility": {
    "version": "0.20.0 (MIN-747 release review)",
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
      "lib/server/usage.ts"
    ]
  },
  "review": {
    "revision": 8,
    "fact": "agent:/root/min747 (0.20.0 release review: source audit against the v0.11.0..main delta, verified corrections applied; no screenshot in scope; no browser walkthrough of the procedures or operator rehearsal; earlier evidence retained in git history)",
    "language": "agent:/root/min747 (de translation of the release corrections with catalog UI labels; equivalent meaning self-reviewed; agent review, not human acceptance)",
    "date": "2026-10-20"
  },
  "related": [],
  "aliases": [],
  "tags": [
    "Eine Projektautomatisierung als Routine neu erstellen"
  ],
  "figures": [],
  "requiredFigures": []
}
---

## Was aus den Projektautomatisierungen wurde {#automation-settings}

Die Automatisierungsschalter des Projekts sowie Kontovoreinstellungen, Aufwandsfilter und Startverzögerungen wurden durch [Routinen](/docs/scheduled-routines) ersetzt. In einer früheren Version konfigurierte Automatisierungsregeln laufen nicht mehr, und Minddy wandelt sie nicht in Routinen um. Ausstehende und auf Menschen wartende Ketten wurden ohne folgenden Schritt beendet. Die archivierten Regeln bleiben im Projekt und in Kontoexporten erhalten.

Um einen Workflow beizubehalten, öffnen Sie Routinen als Projekteigentümer und [erstellen Sie eine Routine](/docs/scheduled-routines#scheduled-routines) mit der Anweisung, dem Auslöser, den Bedingungen und der Verzögerung, die er braucht.

## Andere Projekthilfen unterscheiden {#mechanisms}

Smart Fill ergänzt weiterhin fehlende Priorität, Aufwand, Kategorien und Ziel. Smart Assign bleibt eine Eigentümereinstellung mit Regeln je Mitglied. Smart Triage bleibt eine statische Regelverwaltung. Automatische Selbstzuweisung bleibt eine separate Einstellung. Diese Hilfen sind von Routinen getrennt und ersetzen keine eingestellte Automatisierung.

Testen Sie eine neue Routine manuell, lesen Sie ihre private Konversation und ihr Budget und aktivieren Sie sie für künftige Ereignisse. Pausieren Sie bei unerwarteter Arbeit die Routine und prüfen Sie die Ausführung vor einem erneuten Versuch. Der [Routinenleitfaden](/docs/scheduled-routines#conditions) erklärt Wartezustände und deren Verwerfung.

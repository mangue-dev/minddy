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
  "revision": 7,
  "sourceRevision": 7,
  "owner": "@mangue-dev",
  "updatedAt": "2026-10-16",
  "compatibility": {
    "version": "0.11.1 candidate (MIN-677); MIN-721 removal of Numo code work",
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
    "revision": 7,
    "fact": "agent:/root (MIN-677 source review and isolated PostgreSQL regressions; unchanged procedures retain prior evidence); agent:/root/min721_docs (MIN-721 source review inherited from en revision 7; no operational rerun)",
    "language": "agent:/root (de translation, label and retained-meaning self-review); agent:/root/min721_docs (de translation of the MIN-721 removal edit; agent review, not human acceptance)",
    "date": "2026-10-16"
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

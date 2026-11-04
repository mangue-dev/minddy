---
{
  "id": "automation-settings",
  "locale": "de",
  "title": "Von Automatisierungen zu Routinen",
  "summary": "Erfahre, was aus den Projektautomatisierungen geworden ist, und bilde einen Workflow als vom Eigentümer gesteuerte Routine neu ab.",
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
  "revision": 10,
  "sourceRevision": 10,
  "owner": "@mangue-dev",
  "updatedAt": "2026-11-04",
  "compatibility": {
    "version": "0.30.0 (MIN-794 release review)",
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
    "revision": 10,
    "fact": "agent:claude-code (Aligned quoted UI labels with the MIN-885 copy audit, checked against messages/*.json; not checked in the running app; rest of the article unchanged since the previous review; no figure recaptured); agent:claude-code (0.30.0 release review, MIN-794: its evidence changes in the v0.20.0..0.30.0 delta were documented by the pull requests that made them; the article was updated by pull requests in that delta; not re-audited line by line; 0 screenshot(s) recaptured on 2026-11-04 from a local candidate against the preview demo account and inspected; no browser walkthrough of the procedures)",
    "language": "agent:claude-code (de changed passages with catalog UI labels; self-reviewed; agent review, not human acceptance)",
    "date": "2026-11-04"
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

Die Automatisierungsschalter des Projekts sowie Kontovoreinstellungen, Aufwandsfilter und Startverzögerungen wurden durch [Routinen](/docs/scheduled-routines) ersetzt. In einer früheren Version konfigurierte Automatisierungsregeln laufen nicht mehr, und minddy wandelt sie nicht in Routinen um. Ausstehende und auf Menschen wartende Ketten wurden ohne folgenden Schritt beendet. Die archivierten Regeln bleiben im Projekt und in Kontoexporten erhalten.

Um einen Workflow beizubehalten, öffne Routinen als Projekteigentümer und [erstelle eine Routine](/docs/scheduled-routines#scheduled-routines) mit der Anweisung, dem Auslöser, den Bedingungen und der Verzögerung, die er braucht.

## Andere Projekthilfen unterscheiden {#mechanisms}

Smart Fill ergänzt weiterhin fehlende Priorität, Aufwand, Kategorien und Ziel. Smart Assign bleibt eine Eigentümereinstellung mit Regeln je Mitglied. Smart Triage bleibt eine statische Regelverwaltung. Automatische Selbstzuweisung bleibt eine separate Einstellung. Diese Hilfen sind von Routinen getrennt und ersetzen keine eingestellte Automatisierung.

Teste eine neue Routine manuell, lies ihre private Konversation und ihr Budget und aktiviere sie für künftige Ereignisse. Pausiere bei unerwarteter Arbeit die Routine und prüfe die Ausführung vor einem erneuten Versuch. Der [Routinenleitfaden](/docs/scheduled-routines#conditions) erklärt Wartezustände und deren Verwerfung.

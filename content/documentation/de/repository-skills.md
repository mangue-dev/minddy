---
{
  "id": "repository-skills",
  "locale": "de",
  "title": "Repository-Skills",
  "summary": "Wiederverwendbare Anweisungen im verknüpften Repository bereitstellen und gezielt auswählen.",
  "topic": "Numo und Integrationen",
  "type": "guide",
  "audiences": [
    "member",
    "integrator"
  ],
  "workflows": [
    "N07"
  ],
  "visibility": "public",
  "status": "published",
  "revision": 3,
  "sourceRevision": 3,
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
      "content/knowledge/repository-skills.md",
      "components/assistant/skill-preview-dialog.tsx",
      "content/documentation/reviews/repository-skill-capture-candidates.json"
    ]
  },
  "review": {
    "revision": 3,
    "fact": "agent:/root/german_spanish_review (structural consolidation review; prior procedural evidence retained; no operational rerun)",
    "language": "agent:/root/german_spanish_review (de title, summary, lead and heading review; retained body comparison)",
    "date": "2026-10-09"
  },
  "related": [],
  "aliases": [],
  "tags": [
    "Repository-Skills verwenden"
  ],
  "figures": [
    {
      "id": "repository-skills-workflow",
      "kind": "screenshot",
      "src": "/documentation/de/repository-skills-workflow.png",
      "alt": "Vorschau eines Repository-Skills mit stabilem Namen, Dateipfad und vollständigen Anweisungen.",
      "caption": "Prüfen Sie den Skill, bevor Sie ihn an eine Nachricht anhängen. Dieser echte Demonstrationsskill verlangt npm test und untersagt das Mergen des Pull Requests. Die Vorschau führt keine dieser Aktionen aus.",
      "revision": 3,
      "reviewed": true,
      "capturedAt": "2026-10-08",
      "viewport": [
        996,
        888
      ],
      "theme": "light",
      "padding": 24
    }
  ],
  "requiredFigures": [
    "repository-skills-workflow"
  ]
}
---

## Den Skill auffindbar machen {#repository-skills}

Numo liest `SKILL.md` in Skill-Unterverzeichnissen von `.agents/skills`, `.claude/skills`, `.github/skills`, `.cursor/skills`, `.codex/skills` und `.gemini/skills`, in dieser Rangfolge. Name und Beschreibung im Frontmatter identifizieren den Skill; Skripte und Referenzen können daneben liegen.

Committen und pushen Sie die Dateien in das verknüpfte GitHub- oder GitLab-Repository. Wählen Sie bei Bedarf die passende Repository-Referenz. Rein lokale Dateien fehlen. Die Liste aktualisiert sich beim Öffnen eines Gesprächs und beim Projektwechsel.

## Auswählen und prüfen {#selection}

Nutzen Sie `/`, `$` oder das `+`-Menü und prüfen Sie die Vorschau vor dem Senden. Bis zu fünf Skills sind auswählbar; grüne Abzeichen zeigen die Auswahl. `$` enthält nur Repository-Skills, `/` außerdem weitere Befehle.

Die Auswahl gilt für diesen Benutzerbeitrag. Bei Routinen gilt sie für jeden Durchlauf. Skills sind Repository-Dateien, keine globalen Kontoinstallationen, und überschreiben keine System- oder Sicherheitsanweisungen. Zum Erstellen oder Ändern bearbeiten Sie die Dateien oder delegieren dies an Numo. Pushen Sie vor Auswahl der neuen Version.

![Vorschau eines Repository-Skills mit stabilem Namen, Dateipfad und vollständigen Anweisungen.](/documentation/de/repository-skills-workflow.png)

---
{
  "id": "repository-skills",
  "locale": "de",
  "title": "Repository-Skills verwenden",
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
  "revision": 1,
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
      "content/knowledge/repository-skills.md",
      "components/assistant/skill-preview-dialog.tsx",
      "content/documentation/reviews/repository-skill-capture-candidates.json"
    ]
  },
  "review": {
    "revision": 1,
    "fact": "2026-10-08",
    "language": "2026-10-08",
    "date": "2026-10-08"
  },
  "related": [],
  "aliases": [
    "repository-skills"
  ],
  "tags": [],
  "figures": [
    {
      "id": "repository-skills-workflow",
      "kind": "screenshot",
      "src": "/documentation/de/repository-skills-workflow.png",
      "alt": "Vorschau eines Repository-Skills mit stabilem Namen, Dateipfad und vollständigen Anweisungen.",
      "caption": "Prüfen Sie den Skill, bevor Sie ihn an eine Nachricht anhängen. Dieser echte Demonstrationsskill verlangt npm test und untersagt das Mergen des Pull Requests. Die Vorschau führt keine dieser Aktionen aus.",
      "revision": 1,
      "reviewed": true,
      "capturedAt": "2026-10-08",
      "viewport": [
        1280,
        920
      ],
      "theme": "light"
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

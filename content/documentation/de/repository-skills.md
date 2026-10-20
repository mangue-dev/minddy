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
  "revision": 6,
  "sourceRevision": 6,
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
      "content/knowledge/repository-skills.md",
      "components/assistant/skill-preview-dialog.tsx"
    ]
  },
  "review": {
    "revision": 6,
    "fact": "agent:/root/min747 (0.20.0 release review: source audit against the v0.11.0..main delta, verified corrections applied; no screenshot in scope; 1 screenshot(s) without a current capture script keep their earlier capture and evidence; no browser walkthrough of the procedures or operator rehearsal; earlier evidence retained in git history)",
    "language": "agent:/root/min747 (de translation of the release corrections with catalog UI labels; equivalent meaning self-reviewed; agent review, not human acceptance)",
    "date": "2026-10-20"
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
      "caption": "Prüfen Sie den Skill, bevor Sie ihn an eine Nachricht anhängen. Dieser echte Demonstrationsskill verlangt `npm test` und untersagt das Mergen des Pull Requests. Die Vorschau führt keine dieser Aktionen aus.",
      "revision": 6,
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

Committen und pushen Sie die Dateien in den Standardbranch des verknüpften GitHub- oder GitLab-Repositorys; Numo liest Skills aus diesem Branch. Dateien, die nur auf Ihrem Computer oder in einem anderen Branch liegen, sind nicht verfügbar. Die Liste aktualisiert sich beim Öffnen eines Gesprächs und beim Projektwechsel.

## Auswählen und prüfen {#selection}

Nutzen Sie `/`, `$` oder das `+`-Menü und prüfen Sie die Vorschau vor dem Senden. Bis zu fünf Skills sind auswählbar; grüne Abzeichen zeigen die Auswahl. `$` enthält nur Repository-Skills, `/` außerdem weitere Befehle.

Die Auswahl gilt für diesen Benutzerbeitrag. Bei Routinen gilt sie für jeden Durchlauf. Skills sind Repository-Dateien, keine globalen Kontoinstallationen, und überschreiben keine System- oder Sicherheitsanweisungen. Zum Erstellen oder Ändern bearbeiten Sie die Repository-Dateien selbst oder mit Ihrem eigenen Coding-Agenten. Pushen Sie vor Auswahl der neuen Version.

![Vorschau eines Repository-Skills mit stabilem Namen, Dateipfad und vollständigen Anweisungen.](/documentation/de/repository-skills-workflow.png)

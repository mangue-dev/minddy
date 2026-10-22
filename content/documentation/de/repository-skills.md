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
  "revision": 7,
  "sourceRevision": 7,
  "owner": "@mangue-dev",
  "updatedAt": "2026-10-22",
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
    "revision": 7,
    "fact": "agent:/root/min747 (0.20.0 release review: source audit against the v0.11.0..main delta, verified corrections applied; no screenshot in scope; 1 screenshot(s) without a current capture script keep their earlier capture and evidence; no browser walkthrough of the procedures or operator rehearsal; earlier evidence retained in git history); agent:claude-code (manual figures rebuilt on the Aurora demo, catalog review labels and informal register; figures recaptured on 2026-10-22 from a local candidate against the preview demo account and inspected; no form submitted)",
    "language": "agent:/root/min747 (de translation of the release corrections with catalog UI labels; equivalent meaning self-reviewed; agent review, not human acceptance); agent:claude-code (de manual figures rebuilt on the Aurora demo, catalog review labels and informal register; self-reviewed; agent review, not human acceptance)",
    "date": "2026-10-22"
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
      "caption": "Prüfe den Skill, bevor du ihn an eine Nachricht anhängst. Dieser echte Demonstrationsskill verlangt `npm test` und untersagt das Mergen des Pull Requests. Die Vorschau führt keine dieser Aktionen aus.",
      "revision": 7,
      "reviewed": true,
      "capturedAt": "2026-10-22",
      "viewport": [
        916,
        868
      ],
      "theme": "light",
      "padding": 24,
      "deviceScaleFactor": 2
    }
  ],
  "requiredFigures": [
    "repository-skills-workflow"
  ]
}
---

## Den Skill auffindbar machen {#repository-skills}

Numo liest `SKILL.md` in Skill-Unterverzeichnissen von `.agents/skills`, `.claude/skills`, `.github/skills`, `.cursor/skills`, `.codex/skills` und `.gemini/skills`, in dieser Rangfolge. Name und Beschreibung im Frontmatter identifizieren den Skill; Skripte und Referenzen können daneben liegen.

Committe und pushe die Dateien in den Standardbranch des verknüpften GitHub- oder GitLab-Repositorys; Numo liest Skills aus diesem Branch. Dateien, die nur auf deinem Computer oder in einem anderen Branch liegen, sind nicht verfügbar. Die Liste aktualisiert sich beim Öffnen eines Gesprächs und beim Projektwechsel.

## Auswählen und prüfen {#selection}

Nutze `/`, `$` oder das `+`-Menü und prüfe die Vorschau vor dem Senden. Bis zu fünf Skills sind auswählbar; grüne Abzeichen zeigen die Auswahl. `$` enthält nur Repository-Skills, `/` außerdem weitere Befehle.

Die Auswahl gilt für diesen Benutzerbeitrag. Bei Routinen gilt sie für jeden Durchlauf. Skills sind Repository-Dateien, keine globalen Kontoinstallationen, und überschreiben keine System- oder Sicherheitsanweisungen. Zum Erstellen oder Ändern bearbeitest du die Repository-Dateien selbst oder mit deinem eigenen Coding-Agenten. Pushe vor Auswahl der neuen Version.

![Vorschau eines Repository-Skills mit stabilem Namen, Dateipfad und vollständigen Anweisungen.](/documentation/de/repository-skills-workflow.png)

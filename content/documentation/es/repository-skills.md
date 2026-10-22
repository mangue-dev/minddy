---
{
  "id": "repository-skills",
  "locale": "es",
  "title": "Skills del repositorio",
  "summary": "Publicar instrucciones reutilizables en el repositorio vinculado y seleccionar las necesarias.",
  "topic": "Numo e integraciones",
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
    "language": "agent:/root/min747 (es translation of the release corrections with catalog UI labels; equivalent meaning self-reviewed; agent review, not human acceptance); agent:claude-code (es manual figures rebuilt on the Aurora demo, catalog review labels and informal register; self-reviewed; agent review, not human acceptance)",
    "date": "2026-10-22"
  },
  "related": [],
  "aliases": [],
  "tags": [
    "Usar skills del repositorio"
  ],
  "figures": [
    {
      "id": "repository-skills-workflow",
      "kind": "screenshot",
      "src": "/documentation/es/repository-skills-workflow.png",
      "alt": "Vista previa de una skill del repositorio con su nombre estable, ruta e instrucciones completas.",
      "caption": "Revisa la skill antes de adjuntarla a un mensaje. Esta skill real de demostración solicita `npm test` y prohíbe fusionar la pull request; la vista previa no ejecuta ninguna de estas acciones.",
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

## Hacer que la skill sea accesible {#repository-skills}

Numo lee archivos `SKILL.md` en subdirectorios de `.agents/skills`, `.claude/skills`, `.github/skills`, `.cursor/skills`, `.codex/skills` y `.gemini/skills`, en ese orden de prioridad. Nombre y descripción del frontmatter identifican la skill; scripts y referencias pueden acompañarla.

Haz commit y push de los archivos a la rama predeterminada del repositorio GitHub o GitLab vinculado; Numo lee las skills desde esa rama. Los archivos que solo existen en tu ordenador o en otra rama no están disponibles. La lista se actualiza al abrir la conversación o cambiar de proyecto.

## Seleccionar y comprobar {#selection}

Usa `/`, `$` o el menú `+` y revisa la vista previa antes de enviar. Puedes seleccionar hasta cinco skills; las insignias verdes muestran la selección. `$` incluye solo skills del repositorio y `/` también otros comandos.

La selección se aplica a ese turno del usuario. En rutinas se aplica a cada ejecución. Son archivos del repositorio, no instalaciones globales de cuenta, y no sustituyen instrucciones de sistema o seguridad. Para crear o editar una, cambia los archivos del repositorio tú mismo o con tu propio agente de código. Haz push antes de seleccionar la nueva versión.

![Vista previa de una skill del repositorio con su nombre estable, ruta e instrucciones completas.](/documentation/es/repository-skills-workflow.png)

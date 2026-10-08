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
    "language": "agent:/root/german_spanish_review (es title, summary, lead and heading review; retained body comparison)",
    "date": "2026-10-09"
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
      "caption": "Revise la skill antes de adjuntarla a un mensaje. Esta skill real de demostración solicita npm test y prohíbe fusionar la pull request; la vista previa no ejecuta ninguna de estas acciones.",
      "revision": 3,
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

## Hacer que la skill sea accesible {#repository-skills}

Numo lee archivos `SKILL.md` en subdirectorios de `.agents/skills`, `.claude/skills`, `.github/skills`, `.cursor/skills`, `.codex/skills` y `.gemini/skills`, en ese orden de prioridad. Nombre y descripción del frontmatter identifican la skill; scripts y referencias pueden acompañarla.

Haga commit y push de los archivos al repositorio GitHub o GitLab vinculado. Elija la referencia adecuada cuando proceda. Los archivos solo locales no están disponibles. La lista se actualiza al abrir la conversación o cambiar de proyecto.

## Seleccionar y comprobar {#selection}

Use `/`, `$` o el menú `+` y revise la vista previa antes de enviar. Puede seleccionar hasta cinco skills; las insignias verdes muestran la selección. `$` incluye solo skills del repositorio y `/` también otros comandos.

La selección se aplica a ese turno del usuario. En rutinas se aplica a cada ejecución. Son archivos del repositorio, no instalaciones globales de cuenta, y no sustituyen instrucciones de sistema o seguridad. Para crear o editar una, cambie los archivos o pida a Numo delegar ese trabajo. Haga push antes de seleccionar la nueva versión.

![Vista previa de una skill del repositorio con su nombre estable, ruta e instrucciones completas.](/documentation/es/repository-skills-workflow.png)

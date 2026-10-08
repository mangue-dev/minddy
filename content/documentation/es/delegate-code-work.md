---
{
  "id": "delegate-code-work",
  "locale": "es",
  "title": "Delegar una incidencia al agente de código",
  "summary": "Preparar el acceso al repositorio, seguir la ejecución y revisar la pull request vinculada.",
  "topic": "Numo e integraciones",
  "type": "guide",
  "audiences": [
    "member"
  ],
  "workflows": [
    "N03"
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
      "content/knowledge/plans-and-agents.md",
      "content/knowledge/agents-and-mcp.md",
      "components/assistant/delegated-work-card.tsx"
    ]
  },
  "review": {
    "revision": 1,
    "fact": "2026-10-08",
    "language": "2026-10-08",
    "date": "2026-10-08"
  },
  "related": [
    "review-pull-requests",
    "recover-numo-work",
    "repository-skills"
  ],
  "aliases": [
    "plans-and-agents"
  ],
  "tags": [],
  "figures": [
    {
      "id": "delegate-code-work-workflow",
      "kind": "screenshot",
      "src": "/documentation/es/delegate-code-work-workflow.png",
      "alt": "Tarjeta del agente completado con modelo, razonamiento bajo, dos archivos modificados, rama, PR n.º 1 y commit corregido.",
      "caption": "Tarjeta de la corrección real de la PR existente, con el commit actualizado y su enlace. Revise las diferencias y las comprobaciones antes de fusionar; el estado completado por sí solo no acredita los criterios de aceptación.",
      "revision": 1,
      "reviewed": true,
      "capturedAt": "2026-10-08",
      "viewport": [
        1480,
        1100
      ],
      "theme": "light"
    }
  ],
  "requiredFigures": [
    "delegate-code-work-workflow"
  ]
}
---

## Delimitar la implementación {#delegate-code-work}
El proyecto necesita un repositorio GitHub o GitLab vinculado, autorización válida y un entorno aislado del servidor configurado. Compruebe el modelo y razonamiento del agente en los ajustes de IA de la cuenta. El modelo de conversación no sustituye esos valores.

1. Abra la incidencia y describa comportamiento esperado, restricciones y comprobaciones de aceptación.
2. Abra Numo con ese contexto. Pida inspeccionar el repositorio antes de elaborar un plan técnico. Nombres de archivo y API sin verificar no son pruebas de implementación.
3. Solicite expresamente la implementación. Numo delega los cambios de rama al agente, que clona el repositorio en el servidor.
4. Siga el progreso, archivos, comprobaciones y preguntas en su tarjeta. Responda en la conversación.
5. Abra la pull request vinculada. Revise diferencias y pruebas frente a los criterios antes de fusionar. Solo habrá vista previa si el proveedor de despliegue la ha creado.

![Tarjeta del agente completado con modelo, razonamiento bajo, dos archivos modificados, rama, PR n.º 1 y commit corregido.](/documentation/es/delegate-code-work-workflow.png)


## Continuar con seguridad {#continuation}
Un punto de control conservado puede permitir retomar el trabajo, pero no garantiza finalizarlo. Compruebe rama y PR antes de repetir una ejecución fallida. Conserve tareas completadas y cambios simultáneos del plan. Los archivos locales no están disponibles: suba primero el código o las skills necesarias.

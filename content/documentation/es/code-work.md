---
{
  "id": "code-work",
  "locale": "es",
  "title": "Trabajo con código y pull requests",
  "summary": "Delegue la implementación de una incidencia al agente de código, continúe el trabajo y revise la pull request vinculada.",
  "topic": "Numo e integraciones",
  "type": "guide",
  "audiences": [
    "member"
  ],
  "workflows": [
    "N03",
    "N04"
  ],
  "visibility": "public",
  "status": "published",
  "revision": 2,
  "sourceRevision": 2,
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
      "content/knowledge/plans-and-agents.md",
      "content/knowledge/agents-and-mcp.md",
      "components/assistant/delegated-work-card.tsx",
      "components/pull-requests/pr-detail.tsx",
      "components/pull-requests/pr-reviews-details.tsx"
    ]
  },
  "review": {
    "revision": 2,
    "fact": "agent:/root/german_spanish_review (structural consolidation review; prior procedural evidence retained; no operational rerun)",
    "language": "agent:/root/german_spanish_review (es title, summary, lead and heading review; retained body comparison)",
    "date": "2026-10-09"
  },
  "related": [
    "numo",
    "repository-skills"
  ],
  "aliases": [
    "delegate-code-work",
    "plans-and-agents",
    "review-pull-requests"
  ],
  "tags": [
    "Delegar una incidencia al agente de código",
    "Revisar una pull request vinculada"
  ],
  "figures": [
    {
      "id": "delegate-code-work-workflow",
      "kind": "screenshot",
      "src": "/documentation/es/delegate-code-work-workflow.png",
      "alt": "Tarjeta del agente completado con modelo, razonamiento bajo, dos archivos modificados, rama, PR n.º 1 y commit corregido.",
      "caption": "Tarjeta de la corrección real de la PR existente, con el commit actualizado y su enlace. Revise las diferencias y las comprobaciones antes de fusionar; el estado completado por sí solo no acredita los criterios de aceptación.",
      "revision": 2,
      "reviewed": true,
      "capturedAt": "2026-10-08",
      "viewport": [
        1480,
        1100
      ],
      "theme": "light"
    },
    {
      "id": "review-pull-requests-workflow",
      "kind": "screenshot",
      "src": "/documentation/es/review-pull-requests-workflow.png",
      "alt": "Pestaña Cambios de la PR de demostración abierta, con las diferencias de greeting y un aviso de autorización de GitHub no disponible.",
      "caption": "La PR real corregida sigue abierta, sin fusionar. Las diferencias eliminan los espacios alrededor del nombre y usan World para un valor vacío. Esta instancia no puede solicitar autorización de usuario de GitHub; la indicación de disponibilidad no concede permisos para fusionar ni demuestra que la CI del proveedor haya pasado.",
      "revision": 2,
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
    "delegate-code-work-workflow",
    "review-pull-requests-workflow"
  ]
}
---

El agente de código implementa el trabajo solicitado en el repositorio vinculado, dentro de una sandbox en el servidor. Los siguientes apartados explican la delegación y la continuación del trabajo, además de la revisión de la pull request vinculada antes de aprobarla o fusionarla.

## Delegar una incidencia al agente de código {#delegate-code-work}

El proyecto necesita un repositorio GitHub o GitLab vinculado, autorización válida y un entorno aislado del servidor configurado. Compruebe el modelo y razonamiento del agente en los ajustes de IA de la cuenta. El modelo de conversación no sustituye esos valores.

1. Abra la incidencia y describa comportamiento esperado, restricciones y comprobaciones de aceptación.
2. Abra Numo con ese contexto. Pida inspeccionar el repositorio antes de elaborar un plan técnico. Nombres de archivo y API sin verificar no son pruebas de implementación.
3. Solicite expresamente la implementación. Numo delega los cambios de rama al agente, que clona el repositorio en el servidor.
4. Siga el progreso, archivos, comprobaciones y preguntas en su tarjeta. Responda en la conversación.
5. Abra la pull request vinculada. Revise diferencias y pruebas frente a los criterios antes de fusionar. Solo habrá vista previa si el proveedor de despliegue la ha creado.

![Tarjeta del agente completado con modelo, razonamiento bajo, dos archivos modificados, rama, PR n.º 1 y commit corregido.](/documentation/es/delegate-code-work-workflow.png)

### Continuar con seguridad {#continuation}

Un punto de control conservado puede permitir retomar el trabajo, pero no garantiza finalizarlo. Compruebe rama y PR antes de repetir una ejecución fallida. Conserve tareas completadas y cambios simultáneos del plan. Los archivos locales no están disponibles: suba primero el código o las skills necesarias.

## Revisar una pull request vinculada {#review-pull-requests}

Abra la pull request vinculada a una incidencia o ejecución delegada. Sigue siendo necesario acceder al repositorio; pertenecer al proyecto no concede permisos del proveedor Git.

Lea descripción y actividad y después los archivos y bloques de diferencias. Abra conversaciones sin resolver y responda en el hilo correspondiente. Marcar archivos revisados registra su lectura, pero no constituye aprobación del proveedor. Compruebe commits, resultados CI e incidencias vinculadas para verificar el alcance solicitado.

![Pestaña Cambios de la PR de demostración abierta, con las diferencias de greeting y un aviso de autorización de GitHub no disponible.](/documentation/es/review-pull-requests-workflow.png)

### Revisión y fusión {#decision}

Solicite otro revisor cuando sea necesario. Una revisión de IA disponible aporta otra opinión; no demuestra que las pruebas hayan pasado. Compruebe si es borrador o está lista para revisión, discusiones abiertas, revisiones solicitadas y política de fusión.

Fusione tras satisfacer los controles y revisiones aplicables y con una cuenta autorizada. El proveedor puede rechazar una acción visible. Si el estado parece antiguo, actualice y consulte el proveedor antes de repetirla. Numo puede leer, comentar, cambiar la disponibilidad o fusionar con autorización; los cambios de rama pasan al agente de código. Una vista previa requiere un despliegue real.

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
  "revision": 4,
  "sourceRevision": 4,
  "owner": "@mangue-dev",
  "updatedAt": "2026-10-10",
  "compatibility": {
    "version": "0.11.1 candidate (cd1843e12); MIN-676 private hosted native worker selection",
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
      "components/pull-requests/pr-reviews-details.tsx",
      "components/settings/native-agent-connections.tsx",
      "components/settings/native-agent-connections.test.tsx",
      "app/api/account/agent-preferences/route.ts",
      "content/documentation/reviews/min-676-native-worker-selection-2026-10-10.md"
    ]
  },
  "review": {
    "revision": 4,
    "fact": "agent:/root/german_spanish_review (structural consolidation review; prior procedural evidence retained; no operational rerun); agent:/root (visual usefulness, figure framing and preserved procedures; previous operational evidence retained); agent:/root/native_hosting_terms (private worker selection controls and fail-closed recovery source/UI-test review; no paid Claude execution or new provider rehearsal claimed)",
    "language": "agent:/root/german_spanish_review (es title, summary, lead and heading review; retained body comparison); agent:/root/editorial_de_es (editorial clarity pass); agent:/root (figure removals and captions); agent:/root/native_hosting_terms (localized worker selection additions and equivalent meaning; agent review, no human acceptance claimed)",
    "date": "2026-10-10"
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
      "revision": 4,
      "reviewed": true,
      "capturedAt": "2026-10-08",
      "viewport": [
        912,
        180
      ],
      "theme": "light",
      "padding": 24
    },
    {
      "id": "review-pull-requests-workflow",
      "kind": "screenshot",
      "src": "/documentation/es/review-pull-requests-workflow.png",
      "alt": "Pestaña Cambios de la PR de demostración abierta, con las diferencias de greeting y un aviso de autorización de GitHub no disponible.",
      "caption": "La PR real corregida sigue abierta, sin fusionar. Las diferencias eliminan los espacios alrededor del nombre y usan World para un valor vacío. Esta instancia no puede solicitar autorización de usuario de GitHub; la indicación de disponibilidad no concede permisos para fusionar ni demuestra que la CI del proveedor haya pasado.",
      "revision": 4,
      "reviewed": true,
      "capturedAt": "2026-10-08",
      "viewport": [
        1528,
        1148
      ],
      "theme": "light",
      "padding": 24
    }
  ],
  "requiredFigures": [
    "delegate-code-work-workflow",
    "review-pull-requests-workflow"
  ]
}
---

El trabajo de código parte del repositorio vinculado al proyecto y se ejecuta en una sandbox del servidor. Prepare la incidencia y delegue la implementación al agente de código de Numo. Antes de fusionar, revise la pull request vinculada y las comprobaciones del proveedor Git.

## Delegar una incidencia al agente de código {#delegate-code-work}

El proyecto necesita un repositorio GitHub o GitLab vinculado, autorización válida y una sandbox de servidor configurada. Compruebe **Agente de código** en los ajustes de IA de la cuenta. OpenCode requiere un modelo API de código compatible y un razonamiento configurado; la vista previa privada de Codex y Claude Code requiere la conexión de la cuenta personal seleccionada. Los valores del CLI nativo son independientes del modelo de conversación. Si falla el acceso nativo, vuelva a conectar o elija OpenCode expresamente; el trabajo no cambia a facturación API.

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

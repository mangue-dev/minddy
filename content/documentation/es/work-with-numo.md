---
{
  "id": "work-with-numo",
  "locale": "es",
  "title": "Completar una tarea del proyecto con Numo",
  "summary": "Abrir una conversación con contexto, elegir un modelo y comprobar el resultado.",
  "topic": "Numo e integraciones",
  "type": "tutorial",
  "audiences": [
    "member"
  ],
  "workflows": [
    "N01"
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
      "content/knowledge/agents-and-mcp.md",
      "components/assistant-panel.tsx",
      "components/assistant/chat-input.tsx"
    ]
  },
  "review": {
    "revision": 1,
    "fact": "2026-10-08",
    "language": "2026-10-08",
    "date": "2026-10-08"
  },
  "related": [
    "numo-permissions-and-approvals",
    "delegate-code-work",
    "recover-numo-work",
    "numo-mcp-connections",
    "external-minddy-mcp"
  ],
  "aliases": [
    "agents-and-mcp"
  ],
  "tags": [],
  "figures": [
    {
      "id": "work-with-numo-workflow",
      "kind": "screenshot",
      "src": "/documentation/es/work-with-numo-workflow.png",
      "alt": "Conversación de demostración de Numo con contexto, cambio de prioridad y respuesta guardada.",
      "caption": "Conversación de demostración existente, traducida para mostrarla. La respuesta guardada cita AUR-11 y AUR-7; la captura no acredita una nueva ejecución.",
      "revision": 1,
      "reviewed": true,
      "capturedAt": "2026-10-08",
      "viewport": [
        1200,
        900
      ],
      "theme": "light"
    }
  ],
  "requiredFigures": [
    "work-with-numo-workflow"
  ]
}
---

## Empezar desde la tarea {#work-with-numo}
Abra la incidencia o el proyecto y use el botón flotante de Numo. La página actual pasa a ser el contexto. Las acciones contextuales que delegan trabajo en Numo abren este mismo panel. Necesita acceso al proyecto y uso de IA disponible o una clave personal compatible.

1. Compruebe el contexto del cuadro de entrada. Indique la incidencia si hay varios elementos relevantes.
2. Elija el modelo y el nivel de razonamiento de la conversación. El agente de código utiliza valores del perfil distintos.
3. Envíe una petición acotada, por ejemplo: «Lee esta incidencia y propone criterios de aceptación. No cambies su estado».
4. Lea la respuesta y abra sus enlaces a incidencias o fuentes. Si pidió una modificación, compruebe el objeto modificado.

![Conversación de demostración de Numo con contexto, cambio de prioridad y respuesta guardada.](/documentation/es/work-with-numo-workflow.png)


## Continuar o delegar {#continue}
La lista permite recuperar conversaciones anteriores. Continúe la que contiene las decisiones necesarias. Para cambiar un repositorio, Numo delega en un agente dentro de un entorno aislado del servidor y muestra progreso, archivos, comprobaciones y pull request. No trabaja en su carpeta local.

Si solicita información, envíe su elección antes de esperar que continúen las acciones dependientes. Una tarjeta de consumo o error explica la interrupción. Compruebe cualquier escritura externa antes de pedir que se repita.

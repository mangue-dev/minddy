---
{
  "id": "scheduled-routines",
  "locale": "es",
  "title": "Programar y revisar una rutina de Numo",
  "summary": "Definir contexto, zona horaria y tope de IA y comprobar cada ejecución.",
  "topic": "Numo e integraciones",
  "type": "guide",
  "audiences": [
    "owner"
  ],
  "workflows": [
    "N06"
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
      "content/knowledge/productivity.md",
      "components/routines/create-routine-wizard.tsx",
      "components/routines/routine-detail.tsx",
      "content/documentation/reviews/routine-localized-capture-candidates.json"
    ]
  },
  "review": {
    "revision": 1,
    "fact": "2026-10-08",
    "language": "2026-10-08",
    "date": "2026-10-08"
  },
  "related": [],
  "aliases": [],
  "tags": [],
  "figures": [
    {
      "id": "scheduled-routines-workflow",
      "kind": "screenshot",
      "src": "/documentation/es/scheduled-routines-workflow.png",
      "alt": "Editor de una rutina de demostración existente en pausa, con la instrucción traducida para mostrarla.",
      "caption": "Editor de una rutina de demostración existente en pausa, con la instrucción traducida para mostrarla. El calendario y el límite de gasto no cambian; no se guardó ni ejecutó nada.",
      "revision": 1,
      "reviewed": true,
      "capturedAt": "2026-10-08",
      "viewport": [
        1447,
        1085
      ],
      "theme": "light"
    }
  ],
  "requiredFigures": [
    "scheduled-routines-workflow"
  ]
}
---

## Crear la petición programada {#scheduled-routines}
Solo el propietario puede crear una rutina del proyecto. Abra las rutinas y empiece una nueva. Elija un proyecto propio, escriba la instrucción y mencione incidencias, páginas u objetivos pertinentes. Seleccione calendario y zona horaria; revise la primera ejecución prevista antes de crearla. Fije el tope por ejecución como porcentaje del presupuesto mensual.

Cada ejecución crea una conversación con la instrucción y contexto guardados. Usa presupuesto y conexiones MCP personales del propietario. Numo delega trabajo del repositorio solo cuando hace falta, con los valores del agente del perfil.

## Gestionar las ejecuciones {#runs}
Abra la rutina para editar instrucción o calendario, pausarla o ver ejecuciones. Las ejecuciones manuales también consumen presupuesto. Lea resultado, preguntas, comprobaciones y trabajo delegado en la conversación correspondiente. Una petición de información requiere respuesta; el calendario no la aporta.

Si un tope detiene la ejecución, revise resultados antes de aumentarlo o repetir. Tras cambiar el propietario, inicie una ejecución con el actual: las anteriores no pueden usar las conexiones del previo.

![Editor de una rutina de demostración existente en pausa, con la instrucción traducida para mostrarla.](/documentation/es/scheduled-routines-workflow.png)

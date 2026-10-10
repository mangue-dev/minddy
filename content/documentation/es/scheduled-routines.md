---
{
  "id": "scheduled-routines",
  "locale": "es",
  "title": "Rutinas programadas",
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
      "content/knowledge/productivity.md",
      "components/routines/create-routine-wizard.tsx",
      "components/routines/routine-detail.tsx",
      "content/documentation/reviews/routine-localized-capture-candidates.json",
      "content/documentation/reviews/visual-refresh-captures-2026-10-09.json"
    ]
  },
  "review": {
    "revision": 3,
    "fact": "agent:/root/german_spanish_review (structural consolidation review; prior procedural evidence retained; no operational rerun); agent:/root (visual usefulness, figure framing and preserved procedures; previous operational evidence retained)",
    "language": "agent:/root/german_spanish_review (es title, summary, lead and heading review; retained body comparison); agent:/root/editorial_de_es (editorial clarity pass); agent:/root (figure removals and captions)",
    "date": "2026-10-09"
  },
  "related": [],
  "aliases": [],
  "tags": [
    "Programar y revisar una rutina de Numo"
  ],
  "figures": [
    {
      "id": "scheduled-routines-workflow",
      "kind": "screenshot",
      "src": "/documentation/es/scheduled-routines-workflow.png",
      "alt": "Editor de una rutina de demostración existente en pausa, con la instrucción traducida para mostrarla.",
      "caption": "Editor de una rutina de demostración existente en pausa, con la instrucción traducida para mostrarla. El calendario y el límite de gasto no cambian; no se guardó ni ejecutó nada.",
      "revision": 3,
      "reviewed": true,
      "capturedAt": "2026-10-09",
      "viewport": [
        1154,
        1016
      ],
      "theme": "light",
      "padding": 24,
      "deviceScaleFactor": 2
    }
  ],
  "requiredFigures": [
    "scheduled-routines-workflow"
  ]
}
---

## Crear la petición programada {#scheduled-routines}

Solo el propietario puede crear una rutina del proyecto. Abra las rutinas y empiece una nueva. Elija un proyecto propio, escriba la instrucción y mencione incidencias, páginas u objetivos pertinentes. Seleccione calendario y zona horaria; revise la primera ejecución prevista antes de crearla. Fije el tope por ejecución como porcentaje del presupuesto mensual.

Cada ejecución crea una conversación con la instrucción y contexto guardados. Usa el presupuesto de IA y las conexiones MCP personales del propietario. Numo delega trabajo del repositorio solo cuando hace falta, con los valores del agente del perfil.

## Gestionar las ejecuciones {#runs}

Abra la rutina para editar instrucción o calendario, pausarla o ver ejecuciones. Las ejecuciones manuales también consumen presupuesto. Lea el resultado, las preguntas, las comprobaciones y el trabajo delegado en la conversación correspondiente. Una petición de información requiere respuesta; el calendario no la aporta.

Si un tope detiene la ejecución, revise resultados antes de aumentarlo o repetir. Tras cambiar el propietario, inicie una ejecución con el propietario actual. Las ejecuciones anteriores no pueden usar las conexiones del anterior.

![Editor de una rutina de demostración existente en pausa, con la instrucción traducida para mostrarla.](/documentation/es/scheduled-routines-workflow.png)

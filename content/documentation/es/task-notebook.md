---
{
  "id": "task-notebook",
  "locale": "es",
  "title": "Capturar notas en el cuaderno privado",
  "summary": "Escribe notas rápidas y convierte una tarea seleccionada en trabajo del proyecto cuando necesite seguimiento.",
  "topic": "Planificar y encontrar trabajo",
  "type": "guide",
  "audiences": [
    "member"
  ],
  "workflows": [
    "W17"
  ],
  "visibility": "public",
  "status": "published",
  "revision": 2,
  "sourceRevision": 2,
  "owner": "@mangue-dev",
  "updatedAt": "2026-10-08",
  "compatibility": {
    "version": "0.11.1 candidate (89ebb59a5)",
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
      "components/scratchpad/scratchpad-modal.tsx",
      "components/scratchpad/start-tasks.ts",
      "components/scratchpad/scratchpad-task.tsx",
      "components/scratchpad/task-item-view.tsx",
      "lib/keyboard/shortcuts.ts",
      "lib/keyboard/keyboard-context.tsx",
      "components/scratchpad/scratchpad-trigger.tsx"
    ]
  },
  "review": {
    "revision": 2,
    "fact": "2026-10-08",
    "language": "2026-10-08",
    "date": "2026-10-08"
  },
  "related": [
    "create-an-issue",
    "work-with-numo",
    "create-and-organize-pages"
  ],
  "aliases": [],
  "tags": [],
  "figures": [
    {
      "id": "task-notebook-steps",
      "kind": "screenshot",
      "src": "/documentation/es/work-task-notebook.png",
      "alt": "Tareas personales de demostración traducidas en el cuaderno.",
      "caption": "El cuaderno mantiene los pasos personales fuera de la jerarquía de incidencias del proyecto. Los estados del ejemplo no se modifican.",
      "revision": 2,
      "reviewed": true,
      "capturedAt": "2026-10-08",
      "viewport": [
        1440,
        1080
      ],
      "theme": "light"
    }
  ],
  "requiredFigures": [
    "task-notebook-steps"
  ]
}
---

## Anotar una idea {#task-notebook}

Abre el cuaderno de tareas desde los controles personales de la aplicación, o pulsa Command+Mayús+K en macOS y Ctrl+Mayús+K en Windows/Linux cuando el foco esté fuera del texto editable. Es un espacio de notas y casillas de verificación que pertenece a tu cuenta. Añade contexto, organízalo en secciones si te ayuda y usa las casillas de las tareas para seguir pequeños pasos personales antes de convertirlos en tickets de un proyecto.

El cuaderno es privado. Utiliza una página del proyecto para la información que tus compañeros necesiten compartir. Numo puede leer o actualizar el cuaderno cuando se lo pidas, pero la pertenencia de otra persona a tu proyecto no convierte tus notas en un documento compartido.

![Tareas personales de demostración traducidas en el cuaderno.](/documentation/es/work-task-notebook.png)

## Llevar una tarea al proyecto {#promote-note}

Abre el menú de la tarea y elige la acción para llevarla al proyecto cuando la nota se convierta en trabajo del proyecto. Se cierra el cuaderno y se abre Numo con una solicitud preparada que incluye la tarea y sus subtareas. Si estás consultando un proyecto, se utiliza ese proyecto; desde una pantalla global, indica el proyecto de destino en la conversación. Revisa la solicitud antes de enviarla. Necesitas tener uso de IA disponible o una clave personal compatible. Abrir esta opción todavía no crea ningún ticket. Cuando Numo confirme la creación, abre el ticket para comprobar su identificador, alcance y propiedades. Añade las condiciones de aceptación que falten para conservar el contexto necesario.

Si la creación falla o el resultado queda ambiguo tras un error de red, busca el ticket antes de volver a llevar la tarea al proyecto. Mantén intactas las demás secciones cuando pidas a Numo que modifique una tarea. Comprueba que haya cambiado la casilla prevista y no sustituido todo el cuaderno.

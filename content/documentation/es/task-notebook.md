---
{
  "id": "task-notebook",
  "locale": "es",
  "title": "Cuaderno de tareas",
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
  "revision": 6,
  "sourceRevision": 6,
  "owner": "@mangue-dev",
  "updatedAt": "2026-10-19",
  "compatibility": {
    "version": "0.11.1 candidate (89ebb59a5); MIN-728 one editor engine; MIN-725 notebook search in the command palette",
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
      "components/scratchpad/scratchpad-trigger.tsx",
      "components/editor/rich-editor.tsx",
      "components/editor/document-editor.tsx",
      "components/editor/comment-editor.tsx",
      "content/documentation/reviews/min-728-one-editor-engine.md",
      "components/scratchpad/scratchpad-editor.tsx",
      "lib/scratchpad-search.ts",
      "components/command-palette.tsx"
    ]
  },
  "review": {
    "revision": 6,
    "fact": "agent:/root/german_spanish_review (structural consolidation review; prior procedural evidence retained; no operational rerun); agent:/root (visual usefulness, figure framing and preserved procedures; previous operational evidence retained); agent:/root (MIN-728 one editor engine: source and unit-test review of the shared editor on this surface; no browser walkthrough, no new captures; unchanged evidence retained); agent:/root (MIN-725 notebook search in the command palette: source and unit-test review of lib/scratchpad-search.ts, the palette rows and the notebook focus; no browser walkthrough, no new captures; unchanged evidence retained)",
    "language": "agent:/root/german_spanish_review (es title, summary, lead and heading review; retained body comparison); agent:/root (es translation of the MIN-728 passage with catalog UI labels, equivalent meaning self-reviewed; agent review, not human acceptance); agent:/root (es MIN-725 added paragraph with catalog UI labels; agent review, not human acceptance)",
    "date": "2026-10-19"
  },
  "related": [
    "issues",
    "numo",
    "pages"
  ],
  "aliases": [],
  "tags": [
    "Capturar notas en el cuaderno privado"
  ],
  "figures": [
    {
      "id": "task-notebook-steps",
      "kind": "screenshot",
      "src": "/documentation/es/work-task-notebook.png",
      "alt": "Tareas personales de demostración traducidas en el cuaderno.",
      "caption": "El cuaderno mantiene los pasos personales fuera de la jerarquía de incidencias del proyecto. Los estados del ejemplo no se modifican.",
      "revision": 6,
      "reviewed": true,
      "capturedAt": "2026-10-08",
      "viewport": [
        1156,
        1048
      ],
      "theme": "light",
      "padding": 24
    }
  ],
  "requiredFigures": [
    "task-notebook-steps"
  ]
}
---

## Anotar una idea {#task-notebook}

Abre el cuaderno de tareas desde los controles personales de la aplicación, o pulsa Command+Mayús+K en macOS y Ctrl+Mayús+K en Windows/Linux cuando el foco esté fuera del texto editable. Es un espacio de notas y casillas de verificación que pertenece a tu cuenta. Añade contexto, organízalo en secciones si te ayuda y usa las casillas de las tareas para seguir pequeños pasos personales antes de convertirlos en tickets de un proyecto.

Para volver a encontrar una tarea, abre la paleta de comandos con Command+K en macOS o Ctrl+K en Windows/Linux y escribe palabras de la tarea. Las tareas pendientes aparecen en **Cuaderno de tareas**, con su sección; las tareas completadas o canceladas y las preguntas no aparecen. Elige una para abrir el cuaderno en esa tarea. Mientras no escribas nada, la paleta no muestra las tareas del cuaderno.

El cuaderno usa el mismo editor que las páginas del proyecto, con los mismos controles de bloque: pasa el cursor sobre un bloque para arrastrarlo, abrir su menú o añadir un bloque con **+**. Escribe `/` para insertar un encabezado, una lista, una tarea, una cita, un **Destacado**, un bloque de código, un **Desplegable** o un divisor, o elige **Dictar una tarea** para dictar tareas en voz alta. El cuaderno se sigue guardando en Markdown, así que Numo y los agentes conectados leen las mismas tareas y estados. Selecciona texto para darle formato o añadir un enlace, y pega o suelta una imagen para insertarla en una nota. Los demás tipos de archivo van en las páginas.

El cuaderno es privado. Utiliza una página del proyecto para la información que tus compañeros necesiten compartir. Numo puede leer o actualizar el cuaderno cuando se lo pidas, pero la pertenencia de otra persona a tu proyecto no convierte tus notas en un documento compartido.

![Tareas personales de demostración traducidas en el cuaderno.](/documentation/es/work-task-notebook.png)

## Llevar una tarea al proyecto {#promote-note}

Abre el menú de la tarea y elige la acción para llevarla al proyecto cuando la nota se convierta en trabajo del proyecto. Se cierra el cuaderno y se abre Numo con una solicitud preparada que incluye la tarea y sus subtareas. Si estás consultando un proyecto, se utiliza ese proyecto; desde una pantalla global, indica el proyecto de destino en la conversación. Revisa la solicitud antes de enviarla. Necesitas tener uso de IA disponible o una clave personal compatible. Abrir esta opción todavía no crea ningún ticket. Cuando Numo confirme la creación, abre el ticket para comprobar su identificador, alcance y propiedades. Añade las condiciones de aceptación que falten para conservar el contexto necesario.

Si la creación falla o el resultado queda ambiguo tras un error de red, busca el ticket antes de volver a llevar la tarea al proyecto. Mantén intactas las demás secciones cuando pidas a Numo que modifique una tarea. Comprueba que haya cambiado la casilla prevista y no sustituido todo el cuaderno.

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
  "revision": 12,
  "sourceRevision": 11,
  "owner": "@mangue-dev",
  "updatedAt": "2026-10-28",
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
      "components/scratchpad/scratchpad-editor.tsx",
      "lib/scratchpad-search.ts",
      "components/command-palette.tsx",
      "components/editor/mobile-editor-toolbar.tsx",
      "components/editor/find-bar.tsx",
      "lib/keyboard/find-shortcut.ts",
      "components/pages/blocks/math.ts",
      "components/editor/math-edit-menu.tsx",
      "components/editor/block-selection.ts"
    ]
  },
  "review": {
    "revision": 12,
    "fact": "agent:claude-code (Command/Ctrl+F find and replace bar in the open notebook checked against components/scratchpad/scratchpad-editor.tsx, components/editor/find-bar.tsx and lib/keyboard/find-shortcut.ts; equations (the `/` Equation entry, `$$…$$` typed in a line, click to edit the LaTeX with a live preview in a popover or phone sheet, red error, empty save removing it, `$…$` and `$$` fence Markdown with prices kept as text) checked against components/pages/blocks/math.ts, components/editor/math-edit-menu.tsx and lib/pages-math.test.ts; the pointer to block selection (drag, Escape, Command/Ctrl+A) in the shared editor checked against components/editor/block-selection.ts and components/scratchpad/scratchpad-editor.tsx; rest of the article unchanged since the previous review; no figure recaptured, the existing figure does not show the changed controls)",
    "language": "agent:claude-code (es changed passages with catalog UI labels; equivalent meaning to en revision 11; self-reviewed; agent review, not human acceptance)",
    "date": "2026-10-28"
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
      "revision": 12,
      "reviewed": true,
      "capturedAt": "2026-10-22",
      "viewport": [
        1156,
        1048
      ],
      "theme": "light",
      "padding": 24,
      "deviceScaleFactor": 2
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

El cuaderno usa el mismo editor que las páginas del proyecto, con los mismos controles de bloque: pasa el cursor sobre un bloque para arrastrarlo, abrir su menú o añadir un bloque con **+**. Escribe `/` para insertar una tarea, que aparece primero, o un encabezado, una lista, una cita, un **Destacado**, un bloque de código, una **Ecuación**, un **Desplegable** o un divisor, o elige **Dictar una tarea** para dictar tareas en voz alta. El cuaderno se sigue guardando en Markdown, así que Numo y los agentes conectados leen las mismas tareas y estados. Selecciona texto para darle formato o añadir un enlace. Selecciona bloques enteros igual que en una página, arrastrando sobre ellos, con Escape o con Comando/Ctrl+A, como explica la [guía de páginas](/es/documentacion/pages#editor-formatting). Pega o suelta una imagen, o elige **Imagen** en el menú `/`, para insertarla en una nota. Los demás tipos de archivo van en las páginas. En un teléfono, la barra encima del teclado sustituye a los tiradores de bloque, a la barra de selección y al menú `@` al escribir; la [guía de páginas](/es/documentacion/pages#editor-formatting) la describe. Mientras el cuaderno está abierto, Command+F en macOS o Ctrl+F en Windows/Linux abre la misma [barra de búsqueda y reemplazo](/es/documentacion/pages#find-and-replace) que en una página.

El menú **Acciones del cuaderno** (`…`) ofrece **Copiar todo como prompt**, que copia el cuaderno completo para tu propio agente de código, y **Eliminar las tareas completadas y descartadas**. La eliminación pide confirmación, borra las tareas completadas y canceladas junto con los encabezados que quedan vacíos, y conserva las tareas pendientes o en curso. Para copiar menos, usa **Copiar la sección como prompt** en un encabezado o **Copiar como prompt** en una tarea. Si **Iniciar la incidencia o la tarea cuando copio su prompt** está activado en **Ajustes de la cuenta** → **Incidencias**, copiar también pasa a en curso las tareas pendientes copiadas.

El cuaderno es privado. Utiliza una página del proyecto para la información que tus compañeros necesiten compartir. Numo puede leer o actualizar el cuaderno cuando se lo pidas, pero la pertenencia de otra persona a tu proyecto no convierte tus notas en un documento compartido.

![Tareas personales de demostración traducidas en el cuaderno.](/documentation/es/work-task-notebook.png)

## Llevar una tarea al proyecto {#promote-note}

Abre el menú de la tarea y elige **Convertir en incidencia** cuando la nota se convierta en trabajo del proyecto. Se cierra el cuaderno y se abre Numo con una solicitud preparada que incluye la tarea y sus subtareas. Si estás consultando un proyecto, se utiliza ese proyecto; desde una pantalla global, indica el proyecto de destino en la conversación. Revisa la solicitud antes de enviarla. Necesitas tener uso de IA disponible o una clave personal compatible. Abrir esta opción todavía no crea ningún ticket. Cuando Numo confirme la creación, abre el ticket para comprobar su identificador, alcance y propiedades. Añade las condiciones de aceptación que falten para conservar el contexto necesario. La solicitud preparada también pide a Numo que retire la tarea del cuaderno una vez creado el ticket, así que búscala en el ticket y no en el cuaderno.

Si la creación falla o el resultado queda ambiguo tras un error de red, busca el ticket antes de volver a llevar la tarea al proyecto. Mantén intactas las demás secciones cuando pidas a Numo que modifique una tarea. Comprueba que haya cambiado la casilla prevista y no sustituido todo el cuaderno.

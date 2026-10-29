---
{
  "id": "issues",
  "locale": "es",
  "title": "Incidencias",
  "summary": "Crea y organiza incidencias, sigue sus estados, gestiona dependencias y planes e importa o actualiza el trabajo en bloque.",
  "topic": "Proyectos e incidencias",
  "type": "guide",
  "audiences": [
    "member",
    "owner"
  ],
  "workflows": [
    "W01",
    "W03",
    "W02",
    "W08",
    "W05",
    "W06",
    "W07",
    "W09",
    "W04",
    "A06",
    "A11"
  ],
  "visibility": "public",
  "status": "published",
  "revision": 43,
  "sourceRevision": 43,
  "owner": "@mangue-dev",
  "updatedAt": "2026-10-29",
  "compatibility": {
    "version": "0.20.0 (MIN-747 release review); MIN-753 drafts tray; MIN-750 Smart Fill re-evaluation; MIN-804 parent and sub-issue relations; MIN-798 Smart Fill titles; MIN-809 Smart Fill split button; MIN-813 Smart Fill title on request; MIN-833 selection right-click menu",
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
      "content/knowledge/core-tracker.md",
      "components/create-issue-dialog.tsx",
      "components/issue-fields.tsx",
      "components/issue-compact-fields.tsx",
      "lib/smart-fill.ts",
      "lib/smart-fill-fields.ts",
      "lib/server/smart-fill-reevaluation.ts",
      "lib/server/smart-fill-ownership.ts",
      "lib/server/smart-fill-title.ts",
      "app/(app)/projects/[id]/triage/page.tsx",
      "components/triage/triage-page.tsx",
      "lib/smart-triage.ts",
      "lib/view-filter.ts",
      "components/kanban-board.tsx",
      "components/issue-context-menu.tsx",
      "components/issue-timeline.tsx",
      "components/issue-resources-section.tsx",
      "components/issue-side-panel.tsx",
      "components/issue-indicators.tsx",
      "lib/server/issue-relations.ts",
      "lib/relation-constants.ts",
      "components/issue-parent-menu.tsx",
      "components/issue-family-banner.tsx",
      "lib/server/create-issue.ts",
      "lib/server/update-issue.ts",
      "content/knowledge/plans-and-agents.md",
      "components/issue-plan.tsx",
      "captures/shots/issue-plan/intent.md",
      "lib/plan.ts",
      "components/settings/project-recurrences-section.tsx",
      "lib/server/recurrence.ts",
      "components/bulk-issue-actions.tsx",
      "components/global-board.tsx",
      "components/issue-card.tsx",
      "components/marquee-selection.tsx",
      "components/command-palette.tsx",
      "components/settings/csv-import-panel.tsx",
      "components/settings/import-mapping-editor.tsx",
      "lib/use-csv-import.ts",
      "lib/import/types.ts",
      "lib/server/import-issues.ts",
      "components/export-issues-dialog.tsx",
      "components/app-shell-chrome.tsx",
      "app/api/me/issues/export/route.ts",
      "lib/export/issues-csv.ts",
      "lib/export-api.ts",
      "components/file-viewer.tsx",
      "components/image-viewer.tsx",
      "lib/issue-prompt.ts",
      "lib/server/issue-prompt-context.ts",
      "docs/security/project-roles.md",
      "lib/project-roles.ts",
      "lib/server/issue-relation-inference.ts",
      "lib/server/issue-relation-decision.ts",
      "lib/server/issue-embedding-store.ts",
      "components/settings/account-preferences-section.tsx",
      "lib/issue-semantic-query.ts",
      "lib/server/issue-semantic-search.ts",
      "components/palette-picker-rows.tsx",
      "components/editor/rich-editor.tsx",
      "components/editor/document-editor.tsx",
      "components/editor/comment-editor.tsx",
      "lib/server/description-collaboration.ts",
      "lib/use-description-collaboration.ts",
      "docs/document-collaboration.md",
      "components/settings/account-smart-fill-section.tsx",
      "components/creation-project-select.tsx",
      "lib/use-resource-mentions.ts",
      "components/relations-section.tsx",
      "components/objective-relations-section.tsx",
      "components/issue-field-shortcuts.tsx",
      "components/creation-relations.tsx",
      "lib/keyboard/shortcuts.ts",
      "lib/server/assistant/prompt.ts",
      "components/drafts-tray.tsx",
      "lib/use-all-drafts.ts",
      "lib/use-held-draft.ts",
      "lib/issue-hierarchy.ts",
      "components/editor/mobile-editor-toolbar.tsx",
      "lib/palette-picker.ts",
      "lib/creation-relations.ts",
      "lib/action-menu-search.ts",
      "components/use-issue-menu-actions.tsx",
      "lib/use-bulk-selection-actions.ts",
      "components/relation-chips.tsx"
    ]
  },
  "review": {
    "revision": 43,
    "fact": "agent:claude-code (remove button with the same confirmation on each relation of a board card's relation chip popover, none for relations inherited through an objective; checked against components/relation-chips.tsx; not checked in the running app; rest of the article unchanged since the previous review; no figure recaptured, existing figures do not show the card chip popover)",
    "language": "agent:claude-code (es changed passages with catalog UI labels; self-reviewed; agent review, not human acceptance)",
    "date": "2026-10-29"
  },
  "related": [
    "feedback",
    "trash-and-recovery",
    "pages",
    "notifications-and-inbox",
    "objectives",
    "code-work",
    "scheduled-routines",
    "projects",
    "views",
    "personal-cycle"
  ],
  "aliases": [
    "create-an-issue",
    "triage-incoming-work",
    "issue-statuses",
    "issue-discussion-and-resources",
    "issue-dependencies",
    "sub-issues",
    "implementation-plans",
    "recurring-issues",
    "bulk-issue-actions",
    "import-issues"
  ],
  "tags": [
    "Crear y editar una incidencia",
    "Revisar el trabajo entrante en clasificación",
    "Mover una incidencia por su ciclo de vida",
    "Discutir el trabajo y adjuntar su contexto",
    "Enlazar dependencias e incidencias relacionadas",
    "Dividir una incidencia en subincidencias",
    "Mantener un plan de implementación",
    "Repetir una incidencia después de completarla",
    "Actualizar varias incidencias juntas",
    "Importar un backlog CSV tras revisar correspondencias"
  ],
  "figures": [
    {
      "id": "create-an-issue-steps",
      "kind": "screenshot",
      "src": "/documentation/es/new-issue.png",
      "alt": "Borrador sin enviar en el proyecto Aurora con título, descripción, propiedades que se pueden elegir manualmente y el botón Crear AUR-21.",
      "caption": "Describe el resultado esperado y elige las propiedades útiles antes de crear el ticket.",
      "revision": 43,
      "reviewed": true,
      "capturedAt": "2026-10-27",
      "viewport": [
        720,
        396
      ],
      "theme": "light",
      "padding": 24,
      "deviceScaleFactor": 2
    },
    {
      "id": "triage-incoming-work-steps",
      "kind": "screenshot",
      "src": "/documentation/es/triage-incoming.png",
      "alt": "Incidencia entrante de demostración AUR-19 con informe, propiedades y controles de duplicado, Rechazar y Aceptar.",
      "caption": "Lee el informe recibido antes de aceptarlo, rechazarlo o enlazar un duplicado.",
      "revision": 43,
      "reviewed": true,
      "capturedAt": "2026-10-22",
      "viewport": [
        1154,
        786
      ],
      "theme": "light",
      "padding": 24,
      "deviceScaleFactor": 2
    },
    {
      "id": "issue-statuses-steps",
      "kind": "screenshot",
      "src": "/documentation/es/issue-statuses.png",
      "alt": "Los ocho estados del ticket en el selector, con el estado de backlog seleccionado.",
      "caption": "La marca indica el estado actual. Elige el que corresponda al estado real del trabajo.",
      "revision": 43,
      "reviewed": true,
      "capturedAt": "2026-10-22",
      "viewport": [
        288,
        358
      ],
      "theme": "light",
      "padding": 24,
      "deviceScaleFactor": 2
    },
    {
      "id": "issue-discussion-and-resources-steps",
      "kind": "screenshot",
      "src": "/documentation/es/work-resources.png",
      "alt": "Diálogo para añadir un enlace con una dirección de contacto de ejemplo.",
      "caption": "Revisa el destino antes de añadir el recurso. Este enlace de ejemplo no se ha enviado.",
      "revision": 43,
      "reviewed": true,
      "capturedAt": "2026-10-20",
      "viewport": [
        496,
        212
      ],
      "theme": "light",
      "padding": 24
    },
    {
      "id": "issue-dependencies-steps",
      "kind": "screenshot",
      "src": "/documentation/es/work-dependencies.png",
      "alt": "La paleta de comandos muestra las incidencias que pueden bloquear esta, con la pregunta de la relación en su campo de búsqueda.",
      "caption": "Elige el sentido de la relación antes de su destino. El selector se muestra sin enviar la relación.",
      "revision": 43,
      "reviewed": true,
      "capturedAt": "2026-10-29",
      "viewport": [
        788,
        506
      ],
      "theme": "light",
      "padding": 24,
      "deviceScaleFactor": 2
    },
    {
      "id": "sub-issues-steps",
      "kind": "screenshot",
      "src": "/documentation/es/work-sub-issues.png",
      "alt": "Campo para crear una subincidencia en una incidencia principal de demostración.",
      "caption": "El campo crea una hija de esta incidencia; cada hija conserva su estado y conversación.",
      "revision": 43,
      "reviewed": true,
      "capturedAt": "2026-10-22",
      "viewport": [
        508,
        1096
      ],
      "theme": "light",
      "padding": 24,
      "deviceScaleFactor": 2
    },
    {
      "id": "implementation-plans-steps",
      "kind": "screenshot",
      "src": "/documentation/es/work-implementation-plan.png",
      "alt": "Plan de demostración con dos tareas de trabajo completadas de seis.",
      "caption": "El plan guardado distingue pasos completados, activos y pendientes. Su progreso no demuestra que se ejecutara la tarea de código ficticia.",
      "revision": 43,
      "reviewed": true,
      "capturedAt": "2026-10-22",
      "viewport": [
        508,
        1416
      ],
      "theme": "light",
      "padding": 24,
      "deviceScaleFactor": 2
    },
    {
      "id": "recurring-issues-steps",
      "kind": "screenshot",
      "src": "/documentation/es/issue-date-recurrence.png",
      "alt": "Selector de fecha en modo recurrente con vista previa semanal los domingos y hora opcional.",
      "caption": "El modo recurrente muestra la frecuencia semanal. Confirma la primera fecha antes de crear el ticket.",
      "revision": 43,
      "reviewed": true,
      "capturedAt": "2026-10-20",
      "viewport": [
        324,
        540
      ],
      "theme": "light",
      "padding": 24
    },
    {
      "id": "import-issues-workflow",
      "kind": "screenshot",
      "src": "/documentation/es/import-issues-preview-workflow.png",
      "alt": "Vista previa CSV de dos filas de demostración traducidas y las columnas detectadas.",
      "caption": "Vista previa CSV de dos filas de demostración traducidas y las columnas detectadas. No se envió la importación; la planificación opcional con IA se bloqueó para la captura.",
      "revision": 43,
      "reviewed": true,
      "capturedAt": "2026-10-22",
      "viewport": [
        816,
        977
      ],
      "theme": "light",
      "padding": 24,
      "deviceScaleFactor": 2
    },
    {
      "id": "issue-file-preview",
      "kind": "screenshot",
      "src": "/documentation/es/file-preview.png",
      "alt": "Visor CSV a toda ventana con tareas de ejemplo, un botón Cerrar grande y el menú Acciones del archivo con Descargar, Cambiar nombre y Eliminar.",
      "caption": "El visor compartido coloca Cerrar debajo de la vista previa. El menú Acciones del archivo ofrece Descargar y, con los permisos necesarios, Cambiar nombre y Eliminar.",
      "revision": 43,
      "reviewed": true,
      "capturedAt": "2026-10-19",
      "viewport": [
        1168,
        808
      ],
      "theme": "light",
      "padding": 24,
      "deviceScaleFactor": 2
    }
  ],
  "requiredFigures": [
    "create-an-issue-steps",
    "triage-incoming-work-steps",
    "issue-statuses-steps",
    "issue-discussion-and-resources-steps",
    "issue-dependencies-steps",
    "sub-issues-steps",
    "implementation-plans-steps",
    "recurring-issues-steps",
    "import-issues-workflow",
    "issue-file-preview"
  ]
}
---

Una incidencia registra una unidad de trabajo del proyecto, desde la solicitud inicial hasta su cierre. Empieza por la creación, la clasificación y los estados. Para trabajo en curso, consulta las conversaciones, las dependencias, las subincidencias y los planes. Antes de aplicar recurrencias, acciones en bloque o una importación CSV, revisa sus requisitos; solo el propietario del proyecto puede importar.

## Crear y editar una incidencia {#create-an-issue}

Debes ser el propietario o un Miembro del proyecto de destino; los lectores pueden abrir incidencias, pero no crearlas ni editarlas. Abre el proyecto y su control para crear una incidencia. Escribe un título que identifique el trabajo y añade contexto, resultado esperado y restricciones en la descripción. El título y la descripción funcionan como un solo texto: en un ordenador, la flecha abajo en la última línea del título pasa a la primera línea de la descripción, la flecha arriba vuelve, y el cursor conserva más o menos su posición en la línea. Mayús+Intro en el título pasa a la descripción; Intro también, salvo si elegiste Intro como atajo de envío, en cuyo caso crea la incidencia. Command/Ctrl+Intro la crea desde cualquiera de los dos campos. Las mismas flechas e Intro enlazan el título y la descripción de una incidencia, un objetivo, una página o una solicitud abiertos. El formulario se abre en el proyecto actual; elige otro en **Crear en**, arriba a la izquierda del formulario (junto al título **Nueva incidencia** en el teléfono), sobre todo cuando crees desde una vista personal o entre proyectos. En un ordenador, Command/Ctrl+Mayús+P abre ese menú incluso mientras escribes el título o la descripción; al elegir un proyecto o cerrar el menú, el cursor vuelve exactamente donde estaba. La píldora muestra este atajo, que solo existe cuando se puede elegir más de un proyecto; en el teléfono no se muestra ningún atajo. Cambiar de proyecto borra las categorías, el objetivo y las relaciones elegidos para el anterior. El botón de creación muestra el identificador que recibirá la incidencia, como `MIN-42`, y tiene en cuenta las incidencias creadas mientras tanto; su menú crea la incidencia y copia ese identificador.

Para crear la incidencia manualmente, desactiva Smart Fill si el botón aparece y está activado. Esto muestra los controles de prioridad, esfuerzo, categorías, objetivo y relaciones para que los establezcas. Para fijar solo algunas de estas propiedades, deja Smart Fill activado y abre la flecha junto a su botón: elige una propiedad y luego su valor. Fuera del título y la descripción, la tecla de la propiedad abre directamente su selector: P para la prioridad, E para el esfuerzo, L para las categorías u O para el objetivo. El valor que elijas sigue visible en el formulario. Smart Fill solo deduce las propiedades que dejaste vacías. La elección se aplica a esta incidencia; al volver a abrir el formulario de creación se restablece la preferencia de la cuenta. Es independiente de Smart Assign y las rutinas. Mientras Smart Fill está activado, también [vincula la incidencia con incidencias relacionadas](#smart-fill-relations) una vez guardada, por lo que el selector de relaciones queda oculto; R lo abre de todos modos. Las relaciones que ya elegiste siguen visibles encima del título y se crean con la incidencia.

Configura las propiedades útiles antes de confirmar: estado, prioridad, esfuerzo, responsable, objetivo, categorías, fecha límite y recurrencia. La persona responsable es el propietario del proyecto o un Miembro, nunca un lector; un objetivo agrupa incidencias alrededor de un resultado del proyecto. Puedes dejar las propiedades opcionales sin valor en lugar de adivinar. La prioridad queda **Sin definir** o va de baja a urgente, pasando por media y alta; el esfuerzo queda **Sin definir** o utiliza XS, S, M, L y XL.

Cuando Smart Assign está activado en el proyecto, el selector de responsable muestra **Smart Assign** en lugar de **Sin asignar**. Las tarjetas de incidencia y la paleta de comandos siguen la misma regla, y una tarjeta sin responsable muestra el icono de Smart Assign. Deja esa opción y Smart Assign elegirá al responsable en cuanto el ticket salga de la clasificación. En el panel del ticket, elegir **Smart Assign** quita al responsable actual y deja que Smart Assign vuelva a elegir. Los tickets **Cancelada** y **Duplicada** conservan **Sin asignar**.

Confirma la creación y abre la nueva incidencia. Comprueba su identificador y proyecto. Vuelve a abrir los selectores de propiedades para cambiar valores conforme la tarea quede más clara. La descripción explica el trabajo; el plan de implementación se mantiene por separado en la pestaña del plan.

Al cerrar el formulario se conserva lo que escribiste: vuelve a abrirlo para seguir donde lo dejaste. Si no lo reabres en dos minutos, su contenido se guarda como borrador y el siguiente formulario empieza vacío; hasta entonces solo existe en esta ventana, así que recargar o cerrar la ventana lo pierde. Abrir un borrador o un formulario rellenado desde otro lugar guarda antes como borrador lo que habías dejado. Para guardarlo tú mismo, abre el menú junto al botón de crear y elige **Guardar como borrador**. Los borradores guardados de incidencias y objetivos se reúnen en **Borradores**, abajo a la derecha de la ventana, entre Numo y el cuaderno de tareas; el botón solo aparece mientras tienes un borrador e indica cuántos hay. Su lista muestra el título y la primera línea de la descripción de cada borrador. Elige un borrador para reabrirlo en su formulario de creación y terminarlo; crear la incidencia elimina el borrador. El botón de eliminar junto a un borrador pide confirmación antes, y la eliminación no se puede deshacer. En un teléfono, abre la paleta de comandos y busca el título del borrador. Los borradores se guardan en este dispositivo durante 30 días, diez de cada tipo como máximo; la lista solo muestra los de proyectos en los que todavía puedes crear incidencias.


![Borrador sin enviar en el proyecto Aurora con título, descripción, propiedades que se pueden elegir manualmente y el botón Crear AUR-21.](/documentation/es/new-issue.png)

La descripción, los comentarios y el diálogo de nueva incidencia usan el mismo editor que las páginas del proyecto, sin los controles de bloque. Escribe `/` para insertar un encabezado, una lista, una tarea, una cita, un **Destacado**, un bloque de código, un **Desplegable** o un divisor, y `@` para mencionar a una persona, una incidencia, un objetivo o una página. El menú `@` también muestra los recursos adjuntos a lo que escribes: la incidencia o el objetivo para su descripción y su plan, un comentario para sus propios archivos o un diálogo de creación para los archivos añadidos en él. Una mención de un recurso adjunto en otro lugar aparece como **No disponible**. Varias personas pueden editar la misma descripción a la vez: el cursor de cada una aparece con su nombre y su color, y los cambios de Numo o de un agente conectado aparecen en cuanto se guardan. Numo, los agentes conectados y las exportaciones CSV leen el texto en Markdown, que se actualiza unos segundos después de dejar de escribir. Selecciona texto para ponerlo en negrita, cursiva, tachado o código, o para añadir un enlace. Pega o suelta una imagen, o elige **Imagen** en el menú `/`, para insertarla en la descripción; los demás tipos de archivo van en los recursos de la incidencia. Una mención apunta a su destino, no a su nombre: sigue un cambio de nombre y resiste las ediciones y el copiar y pegar en otra descripción, un comentario, una página o el compositor de Numo. Quien no puede abrir el destino ve una mención **No disponible**, sin su nombre ni su proyecto. En un teléfono, la barra encima del teclado sustituye a la barra de selección y al menú `@` al escribir; la [guía de páginas](/es/documentacion/pages#editor-formatting) la describe.

### Comprobar el guardado y la visibilidad {#issue-save}

Tras cambiar una propiedad, verifica el valor mostrado. Los filtros pueden retirar de inmediato una incidencia de la vista actual cuando cambia su responsable, estado o categoría. Busca su identificador o abre el proyecto sin esos filtros antes de crear una sustituta.

Si falla la creación o el guardado, conserva el texto, lee el error y comprueba que la pertenencia y el destino sigan existiendo. Antes de reintentar tras un fallo de red, comprueba si la incidencia ya se creó. Adjunta páginas del proyecto como recursos vinculados a su contenido actual cuando lo necesites y utiliza comentarios para discutir la tarea.

### Elegir qué hace Smart Fill {#smart-fill-preferences}

Las preferencias de Smart Fill pertenecen a tu cuenta. Abre **Ajustes de la cuenta** → **Smart Fill**. Cada opción tiene su propia tarjeta:

- En la tarjeta **Smart Fill**, **Activar Smart Fill** activa o desactiva Smart Fill para tu cuenta. Completa la prioridad, el esfuerzo, las categorías y el objetivo que falten; el estado, el responsable y la fecha límite siguen siendo cosa tuya. Los interruptores de las dos tarjetas siguientes dependen de él.
- En **Incidencias que rellenar**, **Completar incidencias creadas** y **Completar incidencias en Clasificación** eligen qué incidencias nuevas completa: las que creas y las incidencias de triaje de las que eres responsable. **Reevaluar incidencias editadas**, activado por defecto, permite a Smart Fill [volver a leer una incidencia](#smart-fill-reevaluation) después de un cambio en su título o su descripción. **Escribir los títulos que falten**, activado por defecto, permite a Smart Fill [escribir el título](#smart-fill-title) de una incidencia que solo describes.
- En **Incidencias relacionadas**, **Vincular incidencias relacionadas**, activado por defecto, permite a Smart Fill [añadir relaciones](#smart-fill-relations) después de guardar una incidencia.
- En **Indexación de incidencias**, **Indexar incidencias**, activado por defecto e independiente de Smart Fill, convierte el título y la descripción de las incidencias que creas o editas en vectores privados que sirven para encontrar incidencias relacionadas y para [buscar incidencias por el sentido](/docs/navigation#search-by-meaning). La indexación en segundo plano de las incidencias existentes de un proyecto respeta a la vez el interruptor del propietario del proyecto y el del autor: una incidencia cuyo autor lo desactivó nunca se indexa. Los vectores se cifran con el proyecto, igual que la incidencia; los guardados antes de que el proyecto empezara a cifrar los convierte la tarea en segundo plano. Con el interruptor desactivado no se crea ningún vector para tus incidencias, aunque otra persona las edite, y la búsqueda de incidencias relacionadas solo compara palabras. Tus propias búsquedas usan entonces solo el texto, sin búsqueda por el sentido. Los vectores ya creados se mantienen mientras el texto no cambie; se eliminan en cuanto el texto cambia, o con la incidencia.

Desactivar un interruptor también cancela las pasadas que aún no se han ejecutado. Numo puede cambiar estas preferencias cuando se lo pidas.

### Cuando Smart Fill vuelve a leer una incidencia {#smart-fill-reevaluation}

Con **Reevaluar incidencias editadas** activado, una incidencia creada con Smart Fill activo se vuelve a leer después de un cambio en su título o su descripción. Smart Fill espera a que el texto lleve cinco minutos sin cambiar, de modo que una serie de cambios se lee una sola vez; la pasada puede empezar hasta un minuto después. Luego vuelve a definir la prioridad, el esfuerzo, las categorías y el objetivo a partir del nuevo texto.

Solo cambia las propiedades que nadie eligió a mano: las que quedaron vacías al crear la incidencia y que nadie ha cambiado desde entonces. En cuanto tú, Numo o un agente conectado cambiáis una de ellas, Smart Fill deja de tocarla. Nunca quita el objetivo ni todas las categorías; puede vaciar el esfuerzo cuando el texto ya no describe trabajo estimable. Las incidencias creadas antes de esta función, con Smart Fill desactivado o con todas sus propiedades ya definidas nunca se vuelven a leer.

Cada cambio aparece en la actividad de la incidencia con Smart Fill como autor, y una incidencia que pasa a otro objetivo aparece también en la actividad de ambos objetivos. Una pasada que no encuentra nada que cambiar no escribe nada. La pasada cuenta en la parte **Automatizaciones** de la persona que hizo el último cambio, sigue su preferencia **Reevaluar incidencias editadas** y se omite cuando su presupuesto está agotado o el proveedor falla.

### Dejar que Smart Fill escriba el título {#smart-fill-title}

Con **Escribir los títulos que falten** activado, creas una incidencia describiéndola. Está activado por defecto y depende de **Activar Smart Fill**. Mientras Smart Fill esté activo para la incidencia, el formulario de creación muestra solo la descripción, con el cursor en ella. Describe el trabajo y crea la incidencia. Para escribir el título tú, abre la flecha junto al botón de Smart Fill y elige **Definir manualmente** → **Título**: el campo del título aparece encima de la descripción, y un título que escribas se conserva tal cual. Si dejas el campo vacío y pasas a otra cosa, vuelve a desaparecer. Desactivar Smart Fill para la incidencia también hace volver el título. Esto se aplica al formulario de creación; Numo, el servidor MCP y la importación CSV escriben sus propios títulos.

Smart Fill escribe un título corto que resume la descripción y distingue la incidencia de otras parecidas, en el idioma de la descripción. La incidencia aparece cuando su título y sus propiedades están completos, y su actividad nombra a Smart Fill. Si no se puede escribir ningún título, porque el proveedor falla o tu presupuesto de **Automatizaciones** está agotado, la incidencia toma en su lugar la primera línea de su descripción. Una descripción que solo contiene una imagen sigue necesitando un título.

Un título escrito así sigue siendo de Smart Fill hasta que alguien lo cambie. Con **Reevaluar incidencias editadas** activado, una [lectura](#smart-fill-reevaluation) posterior puede sustituirlo cuando la descripción ya describe otro trabajo, y lo mantiene mientras siga encajando. Esa pasada solo reescribe el título si la persona que hizo el último cambio no desactivó **Escribir los títulos que falten**. En cuanto tú, Numo o un agente conectado editáis el título, Smart Fill deja de tocarlo.

## Revisar el trabajo entrante en clasificación {#triage-incoming-work}

Abre el destino Clasificación del proyecto. Lee la incidencia entrante y el contexto de su origen antes de incorporarla al trabajo planificado. Comprueba si una incidencia existente ya representa la solicitud. Aclara el resultado esperado, proyecto, responsable, prioridad y esfuerzo cuando sea necesario.

Los filtros de la lista permiten acotar las incidencias entrantes por prioridad, esfuerzo, responsable, objetivo, categorías o integración. **Sin definir** en prioridad o esfuerzo conserva las incidencias que aún no tienen valor. Los valores de una propiedad son alternativas; las distintas propiedades se combinan. Restablece los filtros para mostrar de nuevo todas las incidencias entrantes.

Elige Aceptar y confirma para mover una incidencia que quieras conservar a Backlog. Para rechazarla, elige Rechazar y confirma: su estado pasa a Cancelada. Si es un duplicado, utiliza el selector de duplicados para elegir la incidencia que se conservará. La incidencia entrante pasa a Duplicada y queda enlazada a la elegida. Si describes la solicitud en la búsqueda del selector, también aparecen incidencias parecidas bajo **Relacionadas por significado**, después de las coincidencias de texto; consulta [Buscar incidencias por el sentido](/docs/navigation#search-by-meaning). Cuando un elemento sale de clasificación, se selecciona el siguiente. Comprueba el estado resultante o el enlace al duplicado en la propia incidencia. Pasar de una tarjeta a otra sin realizar una de estas acciones no cierra la incidencia.

### Ordenación y límites {#triage-order}

Smart Triage utiliza reglas de ordenación deterministas.

Dentro de cada columna de estado, las incidencias abiertas que bloquean otro trabajo abierto se sitúan primero, por delante de las que no tienen bloqueos. Las incidencias bloqueadas por trabajo abierto quedan al final, incluso si también bloquean otras. Los extremos cerrados ya no generan esa prioridad. Dentro de cada nivel, una prioridad más alta, un esfuerzo menor y una fecha límite vencida o cercana adelantan el trabajo. En un mismo nivel de bloqueo, las incidencias de un objetivo permanecen agrupadas y el grupo se ordena según su incidencia mejor situada. Los empates se resuelven por fecha límite, antigüedad de creación, posición manual y, por último, identificador, que mantiene estable el orden. Una relación de vínculo no afecta a esta ordenación. No es un modo experimental de clasificación con IA. El orden ayuda a decidir qué elementos examinar primero; no demuestra que una descripción sea cierta, no resuelve duplicados automáticamente ni concede permisos.

Si falta el elemento esperado, comprueba el proyecto activo, estado y filtros, y busca su identificador. El trabajo importado o sincronizado externamente puede entrar en clasificación; revisa la fuente original y el mapeo de la integración antes de modificar campos sincronizados. Una solicitud vinculada desde feedback sigue siendo un objeto de feedback independiente con su propia discusión pública.


![Incidencia entrante de demostración AUR-19 con informe, propiedades y controles de duplicado, Rechazar y Aceptar.](/documentation/es/triage-incoming.png)

## Mover una incidencia por su ciclo de vida {#issue-statuses}

Abre el selector de estado de la incidencia o utiliza las acciones de estado del tablero. En una vista kanban, mover trabajo entre columnas cambia la propia incidencia; cambiar un filtro solo modifica lo que ves. Verifica el nuevo estado en el panel de detalle después del movimiento.

| Estado | Uso |
| --- | --- |
| Clasificación | Trabajo entrante pendiente de revisión. |
| Backlog | Trabajo conservado que todavía no se ha seleccionado para empezar. |
| Pendiente | Trabajo seleccionado para realizarse. |
| En curso | Trabajo en marcha. |
| En revisión | Implementación pendiente de revisión. |
| Hecha | Resultado esperado completado. |
| Cancelada | Trabajo cerrado sin entrega. |
| Duplicada | Trabajo representado por otra incidencia. |

Los estados son fijos y no se personalizan por proyecto. Clasificación y Duplicada están disponibles en los selectores, pero se omiten deliberadamente de las columnas kanban normales. De forma predeterminada, los tableros también ocultan las columnas **Hecha** y **Cancelada**; selecciónalas en el filtro **Estado** para mostrarlas. Que falte una columna no demuestra que el estado o la incidencia no existan.


![Los ocho estados del ticket en el selector, con el estado de backlog seleccionado.](/documentation/es/issue-statuses.png)

### Estados finales y comprobación {#closed-work}

Hecha, Cancelada y Duplicada son estados finales para el seguimiento: dejan de bloquear incidencias dependientes y salen de los recuentos activos. Cerrar como Cancelada no significa que la tarea se haya entregado. Al marcar un duplicado, identifica la incidencia que se conserva para dar un destino claro a la discusión y el progreso.

Comprueba los filtros si una incidencia desaparece después de cerrarla. Ábrela de nuevo por su identificador para inspeccionar el resultado y cambiar el estado si la cerraste por error. En trabajo bloqueado, comprueba también la dirección de la dependencia: un cambio de estado no reescribe la descripción ni el plan de una incidencia.

## Discutir el trabajo y adjuntar su contexto {#issue-discussion-and-resources}

Abre la cronología de discusión de la incidencia para añadir un comentario. Explica una decisión, pregunta o resultado de verificación para que otro miembro comprenda qué cambió. Usa menciones cuando necesites una persona o un objeto vinculado en el contexto; las notificaciones siguen dependiendo de las preferencias del destinatario y de la entrega en su dispositivo. Un lector solo puede comentar si el propietario le ha activado **Puede comentar**. Entonces puede responder, mencionar a personas, adjuntar archivos a sus propios comentarios, y editar o eliminar sus propios comentarios.

Adjunta una página relevante del proyecto, un archivo o un enlace mediante los controles de recursos. Una página vinculada es un recurso actualizado: su título sigue los cambios de nombre y su contenido puede evolucionar. Un archivo es un adjunto almacenado, no una garantía de que una URL externa seguirá disponible. **Página** abre la paleta de comandos con las páginas del proyecto, en el orden de la barra lateral; elige una para adjuntarla. Para redactar una página que aún no existe, elige **Nueva página** al final de la lista; un título escrito antes en la búsqueda se convierte en su título. La página se crea en el proyecto, se adjunta a la incidencia y se abre en un panel lateral, donde **Ampliar** abre la página completa.

Los recursos aparecen como tarjetas: la propia imagen o el icono del tipo de archivo, el nombre y el tamaño. Un enlace muestra la imagen de vista previa de su página cuando el sitio la ofrece; si no, su favicon. Haz clic o clic derecho en una tarjeta para abrir su menú: Vista previa, Abrir enlace o Abrir la página, y después Cambiar nombre, Descargar y Eliminar cuando correspondan. Vista previa abre un archivo compatible en toda la ventana. Las imágenes, los PDF, Markdown (`.md`), el texto sin formato (`.txt`, `.text`), los CSV y los formatos de audio o vídeo compatibles usan el mismo visor. Markdown se muestra con formato, el texto se mantiene literal y el CSV se abre como una tabla desplazable. Usa Cerrar o Escape para volver al ticket. El menú Acciones del archivo (`…`) ofrece Descargar y, si puedes modificar ese recurso, Cambiar nombre y Eliminar. Al hacer clic en la mención de un archivo en un texto se abre el mismo visor. Minddy pide confirmación antes de quitar un recurso, que entonces se desvincula de este contexto. Un recurso de página conserva el título de su página y no se puede renombrar. Los formatos no compatibles conservan su acción de descarga. **Abrir la página** la muestra en un panel lateral, donde **Ampliar** abre la página completa; una base de datos se abre directamente como página completa.

![Visor CSV a toda ventana con tareas de ejemplo, un botón Cerrar grande y el menú Acciones del archivo con Descargar, Cambiar nombre y Eliminar.](/documentation/es/file-preview.png)

![Diálogo para añadir un enlace con una dirección de contacto de ejemplo.](/documentation/es/work-resources.png)

### Visibilidad y cargas fallidas {#resource-access}

La pertenencia y el acceso al proyecto regulan la discusión y los recursos internos. Añadir un recurso a una incidencia no lo publica para visitantes anónimos. Al referirte a comentarios públicos, distingue la discusión interna del equipo de una respuesta pública antes de enviar texto.

Comprueba que un recurso cargado aparezca y pueda abrirse después de la operación. Si falla, conserva el archivo original, lee el error y verifica el límite aplicable de tamaño de archivo o almacenamiento de la cuenta. Los operadores autoalojados también necesitan metadatos, políticas y bytes de Storage que funcionen. Evita adjuntar credenciales o volcados privados de diagnóstico.

## Enlazar dependencias e incidencias relacionadas {#issue-dependencies}

Abre los controles de relaciones de una incidencia y busca la otra por título o identificador. Fuera de un campo de texto, R abre la elección del tipo de relación desde una tarjeta bajo el puntero o el panel de la incidencia. Una vez elegido el tipo, el otro extremo se elige en la [paleta de comandos](/docs/navigation#search-and-shortcuts), que solo muestra las incidencias y objetivos que admiten esa relación. Una búsqueda descriptiva también muestra, después de las coincidencias de texto, incidencias del mismo proyecto encontradas [por el sentido](/docs/navigation#search-by-meaning) bajo **Relacionadas por significado**. Elige una relación de bloqueo cuando una tarea deba terminar antes de que otra pueda avanzar. Si A bloquea B, A es el requisito previo y B está bloqueada por A. Una relación de vínculo añade contexto sin imponer ese orden.

Lee los dos identificadores y la dirección mostrada antes de confirmar. Por ejemplo, «Preparar el punto de acceso» bloquea «Conectar el cliente», y no al revés. Una dependencia no convierte ninguna de las incidencias en subincidencia; una relación de padre e hija no sustituye a una relación de bloqueo.

![La paleta de comandos muestra las incidencias que pueden bloquear esta, con la pregunta de la relación en su campo de búsqueda.](/documentation/es/work-dependencies.png)

### Bloqueos resueltos y heredados {#blocker-state}

Los estados finales Hecha, Cancelada y Duplicada hacen que una incidencia deje de bloquear trabajo. Las relaciones conectan incidencias u objetivos del mismo proyecto; ambos extremos deben ser accesibles allí. No enlazan trabajo privado arbitrario entre proyectos ni publican ninguno de los extremos.

Una incidencia abierta puede heredar un bloqueo a través de su objetivo abierto. Si A bloquea el objetivo B, las incidencias abiertas vinculadas a B muestran A como bloqueo heredado, aunque no exista una relación directa de A a la incidencia. La interfaz identifica el requisito real y el objetivo que transmite el bloqueo. Examina esa relación del objetivo antes de intentar retirarla de la incidencia. Cerrar A, cerrar B o sacar la incidencia de B elimina el bloqueo heredado. Este mecanismo depende de la pertenencia al objetivo, no de la jerarquía entre incidencias principales y subincidencias.

Retira una relación desde sus controles cuando ya no corresponda; una confirmación nombra la otra incidencia u objetivo, y solo desaparece el vínculo. En una tarjeta del tablero, la etiqueta de un tipo de relación abre la lista de esas relaciones, cada una con un botón para quitarla (✕) que pide la misma confirmación; las relaciones heredadas de un objetivo no lo tienen. Después verifica tanto la etiqueta como el indicador de bloqueo. Marcar una incidencia como duplicada afecta a su ciclo de vida y remite al trabajo conservado. Úsalo para tareas duplicadas en lugar de crear un vínculo ordinario y suponer que eso cierra el duplicado.

Si el selector no encuentra una incidencia, comprueba el acceso al proyecto y el identificador. No expongas contenido de otro proyecto pegando una URL privada de incidencia en una respuesta pública a una solicitud de feedback.

### Vínculos añadidos por Smart Fill {#smart-fill-relations}

Con **Vincular incidencias relacionadas** activado, Smart Fill busca incidencias relacionadas después de crear una incidencia o de cambiar su título o su descripción. El trabajo se hace en segundo plano tras el guardado: la creación y la edición nunca lo esperan, y los vínculos pueden aparecer unos segundos más tarde. Para una incidencia nueva sigue las mismas elecciones que los demás campos, así que no se ejecuta si desactivaste Smart Fill para esa incidencia. Tampoco se ejecuta para incidencias importadas de un repositorio vinculado, para copias recurrentes ni para cambios sincronizados desde el repositorio.

Smart Fill compara la incidencia con cinco candidatas como máximo del mismo proyecto y descarta las incidencias canceladas, duplicadas o eliminadas. Después, una decisión clasifica cada candidata como relacionada, bloqueadora, bloqueada por o sin relación. La similitud por sí sola nunca crea un vínculo, una dependencia exige indicios más sólidos que una relación simple y, ante la duda, Smart Fill no añade nada. Una relación exige un vínculo evidente, como el mismo error, una continuación directa o una reversión: dos incidencias que solo comparten una función o un tema quedan sin vincular. Por eso la mayoría de las incidencias no recibe ningún vínculo. Una pasada añade como máximo dos relaciones. Nunca toca un par que ya tenga una relación, nunca añade un bloqueo que cierre un ciclo y descarta su resultado si el texto de la incidencia cambió durante la decisión. Nunca marca un duplicado ni cambia un estado.

Los vínculos añadidos así aparecen en las relaciones de la incidencia como cualquier otro, y el historial indica Smart-fill como autor. Comprueba la dirección de una dependencia como harías con las tuyas. Para quitar un vínculo, usa los controles de relaciones: Smart Fill no vuelve a añadir un vínculo quitado para ese par. Para dejar de recibir vínculos nuevos, desactiva **Vincular incidencias relacionadas** en [tus preferencias](#smart-fill-preferences). Las incidencias creadas antes de esta función, las importadas y las sincronizadas desde un repositorio se indexan poco a poco en segundo plano, pero nunca reciben vínculos automáticos.

La indexación y las decisiones de relación usan IA. Cuentan en la parte **Automatizaciones** de la cuenta a la que corresponde la pasada: la cuenta a la que se cobra el Smart Fill de la incidencia nueva, normalmente quien la creó; quien edita, en una edición; y el propietario del proyecto, en la indexación en segundo plano. El historial de uso muestra la indexación como **Smart-fill · índice de incidencias**. Una decisión de relación aparece como **Decisión de IA** cuando la resuelve el modelo de decisión, y como **Smart-fill · relaciones** cuando la resuelve el modelo de respaldo. Si ese presupuesto se agota o el proveedor falla, la pasada se omite y la incidencia no cambia. [La búsqueda de incidencias por el sentido](/docs/navigation#search-by-meaning) usa el mismo índice: cada búsqueda nueva cuenta en la parte **Automatizaciones** de la cuenta que busca y aparece como **Búsqueda de incidencias**.

## Dividir una incidencia en subincidencias {#sub-issues}

Abre la incidencia principal y usa sus controles de subincidencias para crear partes menores del trabajo. Asigna un resultado distinto a cada hija. Comprueba su proyecto, propiedades e identificador de la principal después de crearla; la jerarquía debe facilitar el seguimiento, no sustituir la descripción de lo que cada hija debe lograr.

Para vincular incidencias que ya existen, pulsa R sobre una tarjeta bajo el puntero o en el panel de la incidencia, o abre **Relaciones** desde el clic derecho de una tarjeta. **Principal de** muestra las incidencias que pueden convertirse en subincidencia de esta; **Subincidencia de** muestra las incidencias de primer nivel que pueden convertirse en su principal. Cada lista solo ofrece lo que permite la regla de un único nivel: una subincidencia no tiene la entrada **Principal de**, y una incidencia que ya tiene subincidencias no tiene la entrada **Subincidencia de**. Elegir una incidencia que ya tiene otra principal la mueve bajo la nueva. Desde una selección de tarjetas, **Subincidencia de** coloca bajo la principal elegida cada incidencia seleccionada que cumpla la regla. En el formulario de nueva incidencia, **Relaciones** ofrece las mismas dos entradas: **Subincidencia de** crea la incidencia bajo la principal elegida, y **Principal de** coloca debajo las incidencias elegidas una vez creada. Una incidencia nueva tiene una principal o subincidencias, no ambas. Al escribir en el campo de búsqueda del clic derecho de una tarjeta o del menú `…` del panel de la incidencia también encuentras las entradas de sus submenús, cada una con su ruta, por ejemplo **Relaciones** › **Marcar como bloqueada por…**.

La jerarquía admite un nivel: la incidencia principal debe ser una incidencia de nivel superior del mismo proyecto y una subincidencia no puede tener hijas. Si no eliges expresamente un objetivo al crearla, la hija hereda el objetivo de la principal. Comprueba las propiedades resultantes en lugar de suponer que los cambios posteriores de la principal se propagan.

Una hija sigue siendo una incidencia con estado y discusión propios. El indicador de progreso de la principal pondera el esfuerzo de las hijas y la proporción de avance que corresponde a su estado. El contador de completadas sobre el total de la lista de subincidencias es un recuento separado, sin ponderar. Lee los estados de las hijas junto con ambas medidas. Usa una dependencia para expresar «debe terminar antes» y una principal para expresar «forma parte de esta tarea mayor».

![Campo para crear una subincidencia en una incidencia principal de demostración.](/documentation/es/work-sub-issues.png)

### Abrir o retirar la relación con la principal {#change-parent}

El identificador de la principal junto al título de la hija abre un menú. Usa la acción de abrir la principal para examinar la tarea mayor. Para separar la hija, elige desvincularla de la principal y lee la confirmación antes de aplicarla. La desvinculación correcta elimina la relación y conserva la incidencia.

No elimines una hija solo para reorganizar la jerarquía. Comprueba las relaciones existentes antes de cambiar la principal y resuelve una relación rechazada en lugar de forzar una jerarquía circular. Si falla el guardado, vuelve a abrir la hija para ver si el cambio se aplicó antes de intentarlo otra vez. Conserva el trabajo completado de las hijas al revisar el plan global.

## Mantener un plan de implementación {#implementation-plans}

Abre la pestaña del plan de la incidencia. Su descripción ya debería indicar el problema y el resultado esperado. Añade los pasos de implementación manualmente o [copia el prompt **Generar un plan**](#copy-issue-prompt) para tu propio agente de código, que explora el repositorio por sí mismo. Numo no puede leer el repositorio: puede afinar la descripción y, si se lo pides, escribir un plan básico, pero cualquier ruta de archivo o función que cite es una suposición. Una ruta o función en un plan solo es una prueba si el repositorio se ha leído realmente.

El plan se edita en el sitio, como la descripción: haz clic en él y escribe, sin modo de edición ni botón de guardar. Un plan vacío muestra un texto de ayuda. Varios miembros, Numo y los agentes conectados pueden editar el mismo plan a la vez, cada uno con un cursor con su nombre, y una tarea que marca un agente aparece en tu editor mientras escribes en otra parte. Escribe `- [ ]` seguido de un espacio al principio de una línea, o elige **Lista de tareas** en el menú `/`, para añadir una tarea. Haz clic en la casilla de una tarea para completarla, o abre su menú para los demás estados.

Pulsa Tab en una tarea para anidarla bajo la anterior y Mayús+Tab para devolverla a su nivel; en el Markdown guardado, cada nivel se sangra con dos espacios. El anidamiento organiza los pasos del plan y no crea relaciones entre incidencias principales e hijas. Todas las tareas de trabajo no canceladas siguen contando para el progreso, incluidas las anidadas.

El plan utiliza líneas de tareas Markdown: `- [ ]` para pendientes, `- [~]` para en curso, `- [x]` para completadas y `- [-]` para canceladas. Escribe el texto después del marcador, por ejemplo `- [ ] Comprobar el enlace de contacto en móvil`. Las tareas canceladas no cuentan en el progreso. Las tareas bajo un encabezado Questions reconocido se tratan como preguntas y también quedan fuera del progreso; mantén los pasos de trabajo en otra sección con el mismo nivel de encabezado. El encabezado reconocido es `Questions`, con esa palabra en inglés. El editor muestra estas líneas como tareas y las vuelve a escribir en el mismo formato, el que leen Numo y los agentes conectados. Utiliza pendiente, en curso, completada y cancelada para reflejar lo ocurrido, sin dar por realizadas comprobaciones que aún no se han ejecutado.

![Plan de demostración con dos tareas de trabajo completadas de seis.](/documentation/es/work-implementation-plan.png)

### Conservar el progreso y las ediciones simultáneas {#plan-progress}

Amplía o modifica el plan existente en lugar de sustituirlo por una copia nueva sin marcar. Conserva los pasos completados y las explicaciones de los cambios de alcance. Los cambios de otros miembros y agentes aparecen en el plan a medida que se hacen. Una herramienta que sustituye el plan entero sigue sustituyendo los pasajes que reescribe, así que pide a los agentes que editen solo la parte que cambian.

Para que se implemente el plan, copia el prompt de la incidencia para tu propio agente de código, como se describe a continuación. Una tarea marcada no demuestra por sí sola que el código pase las pruebas. Lee el resultado, los cambios y las comprobaciones antes de marcar la incidencia como hecha.

### Copiar un prompt para otro agente de código {#copy-issue-prompt}

Para encargar una incidencia a un agente de código fuera de Minddy, como Claude Code, Codex o Cursor, abre el menú de acciones de la incidencia, elige **Copiar como prompt** y luego **Generar un plan** (o **Revisar el plan** si ya existe), **Implementar la incidencia**, **Verificar la implementación** o **Personalizado…**. Con varias incidencias seleccionadas, **Copiar el prompt combinado** las reúne en un solo prompt. Copiar no ejecuta ningún modelo de IA ni consume tu cuota de IA: Minddy reúne lo que ya tiene guardado y el agente explora el repositorio por su cuenta. Si **Iniciar la incidencia o la tarea cuando copio su prompt** está activado en las preferencias de la cuenta, copiar también inicia una incidencia que aún no ha empezado. Consulta [Trabajo con código y pull requests](/docs/code-work) para ver el flujo completo y la revisión de pull requests.

El prompt incluye los campos de la incidencia, sus categorías, sus relaciones, el número de recursos adjuntos y el progreso del plan, pero no el texto del plan, que el agente lee a través del servidor MCP de Minddy o te pide. También indica el repositorio vinculado al proyecto y cada pull request vinculada a la incidencia, con su estado y sus ramas cuando se conocen. El agente continúa una pull request abierta en su rama y trata las fusionadas o cerradas como historial. Sin una pull request abierta, el prompt sugiere un nombre de rama formado por el identificador de la incidencia y un título corto, por ejemplo `min-42-keyboard-navigation`. Es solo una sugerencia: el agente revisa primero las ramas existentes y sigue la convención de nombres del repositorio. Mantener el identificador en el nombre de la rama, el título de la pull request o una línea `Fixes MIN-42` permite a Minddy vincular la pull request a la incidencia cuando el repositorio está vinculado.

Si no se puede cargar la información de las pull requests, el prompt lo indica en lugar de afirmar que no hay ninguna. Los prompts de plan y de revisión del plan piden al agente que se detenga antes de implementar. Un prompt personalizado conserva tu petición y su alcance tal como los escribiste. El contenido de la incidencia y tu petición conservan su idioma original; las instrucciones que los rodean están en inglés.

## Repetir una incidencia después de completarla {#recurring-issues}

Crea o abre una incidencia que siga siendo útil cada vez, como una comprobación periódica de dependencias. Define una fecha límite y elige una recurrencia diaria, semanal, mensual o anual en el control de fecha de la incidencia. Se rechaza una recurrencia sin fecha límite. Revisa propiedades y responsable antes de guardar. Los ajustes de recurrencias del proyecto muestran las series activas; úsalos para cambiar la frecuencia o detener la repetición.

Las incidencias recurrentes se recrean cuando la anterior queda en «Hecha»; la siguiente se crea en Backlog. Comprueba su identificador y propiedades después de completar una recurrencia.

La siguiente fecha límite se calcula sumando un intervalo de recurrencia a la fecha límite anterior, no desde el día en que terminaste la tarea. La sucesora copia título, descripción, prioridad, esfuerzo, responsable, objetivo y categorías. No copia el plan de implementación, la relación con la principal, los recursos ni los comentarios. La recurrencia pasa a la sucesora; reabrir y completar de nuevo la incidencia antigua no crea otra repetición. Si falla la creación de la sucesora, la serie se detiene en lugar de reintentar repetidamente sobre la incidencia completada. Examina el resultado y configura la recurrencia en la siguiente tarea adecuada después de resolver el fallo. No supongas que un calendario ejecuta código o completa la nueva incidencia por ti.


![Selector de fecha en modo recurrente con vista previa semanal los domingos y hora opcional.](/documentation/es/issue-date-recurrence.png)

### Cambiar o detener la repetición {#recurrence-change}

Utiliza los ajustes de recurrencia para editar o desactivar las repeticiones futuras. Examina por separado las incidencias ya creadas: detener la creación futura no significa que el trabajo existente se haya completado o retirado.

Una rutina de Numo es un objeto distinto: programa una conversación y puede utilizar el presupuesto de IA del propietario y los proveedores configurados. Elige incidencias recurrentes para una tarea repetida con seguimiento y una rutina para una instrucción que deba ejecutarse en un horario. Si falta la siguiente incidencia, comprueba si la anterior se marcó como hecha, si la recurrencia sigue activa y si estás viendo Backlog sin filtros restrictivos.

## Actualizar varias incidencias juntas {#bulk-issue-actions}

En un tablero, mantén pulsada Mayús y haz clic en cada tarjeta para seleccionarla o quitarla de la selección. Con el ratón, también puedes arrastrar un rectángulo de selección desde un espacio vacío del tablero. Mayús, Command o Ctrl hacen que ese gesto amplíe la selección existente. Cerca de un borde el tablero se desplaza, y las tarjetas que el rectángulo ha recorrido siguen seleccionadas aunque salgan de la vista. El rectángulo no es un modo de selección para pantallas táctiles. Comprueba el número seleccionado y los identificadores visibles antes de abrir las acciones masivas. La selección es un conjunto de trabajo para la acción, no una vista guardada ni una concesión de permisos. Ábrelas con **Acciones** en la barra de selección, o pulsa Comando+K en macOS o Ctrl+K en Windows/Linux mientras haya incidencias seleccionadas.

Elige Acciones en la barra flotante de selección para abrir la paleta de comandos. Elige estado, prioridad, esfuerzo o responsable, establece el valor y confirma el formulario integrado. La acción de objetivo solo aparece cuando la selección pertenece a un único proyecto con objetivos disponibles. Otras acciones, como añadir o quitar del ciclo, enlazar dos incidencias o enviar la selección a Numo, aparecen cuando el tablero actual las admite. Con el ratón, también puedes señalar una tarjeta seleccionada y pulsar S, P, E, A, L, D, O o R: el selector que se abre se aplica a toda la selección y, para el responsable, el objetivo, las categorías y las relaciones, a las incidencias seleccionadas del proyecto de esa tarjeta. Haz clic derecho en una tarjeta seleccionada para actuar sobre toda la selección: **Copiar el prompt combinado** ofrece **Generar los planes** (**Revisar los planes** cuando todas las incidencias seleccionadas tienen uno, **Generar o revisar los planes** cuando solo algunas lo tienen), **Implementar las incidencias**, **Verificar las implementaciones** y **Personalizado…**, y cada opción copia un único prompt para todas las incidencias seleccionadas. **Copiar los 3 identificadores**, con tres incidencias seleccionadas, copia sus identificadores separados por comas, del número más bajo al más alto. **Relaciones**, **Vincular un objetivo** y **Añadir una fecha límite** abren los mismos selectores que R, O y D. Revisa después las incidencias afectadas. En un dispositivo exclusivamente táctil sin un gesto de selección múltiple compatible, edita cada incidencia en su panel de detalle.

### Resultados parciales y acciones destructivas {#bulk-results}

Al trabajar entre proyectos, verifica tu pertenencia a cada uno de los afectados. Lee los resultados de fallos parciales: algunos cambios pueden haberse guardado aunque otra incidencia se haya rechazado. Comprueba el resultado antes de volver a intentar toda la selección.

La eliminación afecta a todos los elementos seleccionados, así que confirma el conjunto antes de continuar. **Mover las incidencias a la papelera** pide confirmación; las incidencias, con sus comentarios, archivos y enlaces, se pueden restaurar desde la [papelera](/docs/trash-and-recovery) durante 30 días. Quita la selección después de la operación si vas a pasar a otro trabajo. Si la actualización modifica los resultados de los filtros, las incidencias pueden salir de la vista mostrada y seguir en el proyecto. Busca sus identificadores para verificar el estado nuevo en lugar de recrearlas.

## Importar un backlog CSV tras revisar correspondencias {#import-issues}

El propietario abre Importar en los ajustes del proyecto y selecciona una exportación CSV. Los formatos de Linear y Jira se detectan; los demás CSV usan el mapeo genérico. El límite por importación es de 5 MiB y 5.000 incidencias. Divide una exportación mayor de forma planificada y, cuando sea posible, mantén las referencias a incidencias padre en el mismo lote.

Asocia la columna del título antes de importar. Revisa descripción, estado, prioridad, esfuerzo, fecha límite, categorías y responsables. Asocia las personas a miembros reales del proyecto y examina las categorías nuevas. Las referencias a padres corresponden a claves externas del lote y admiten un solo nivel. Los CSV no importan los bytes de los archivos adjuntos.

Solo se solicita una propuesta de IA para los huecos del mapeo. Puedes editarla; un proveedor fallido o no disponible deja utilizable el mapeo manual. Una corrección manual impide que una propuesta tardía sobrescriba tus decisiones.

### Importar y comprobar {#result}

Tras cada cambio de mapeo, lee las cantidades de incidencias, la distribución de estados y los avisos. Corrige las filas omitidas o inválidas antes de confirmar. La importación crea incidencias nuevas; no supongas que reenviar el archivo sea una actualización que elimina duplicados. Después del éxito, comprueba incidencias representativas, responsables, fechas y vínculos con padres. Si se pierde la respuesta, revisa el proyecto antes de reenviar el archivo completo para evitar trabajo duplicado.

![Vista previa CSV de dos filas de demostración traducidas y las columnas detectadas.](/documentation/es/import-issues-preview-workflow.png)

## Exportar incidencias a CSV {#export-issues}

Como miembro conectado de un proyecto, abre la paleta con Command+K en macOS o Ctrl+K en otros sistemas y busca «Exportar incidencias como CSV». Elige el comando, selecciona un proyecto o todos los proyectos accesibles y revisa las casillas de estado. La página del proyecto actual preselecciona ese proyecto. Las incidencias completadas, canceladas y duplicadas se excluyen por defecto; inclúyelas si necesitas todo el historial. Debe quedar al menos un estado seleccionado. Los filtros del tablero y las tarjetas seleccionadas no definen este exportado.

Elige Exportar y comprueba la confirmación de descarga y la cantidad indicada. El CSV UTF-8 contiene identificadores, títulos, descripciones Markdown, estados, prioridades, esfuerzo, categorías, responsables, objetivos, nombres de proyectos, fechas e identificadores de incidencias padre. El acceso se limita a tus proyectos accesibles. Un archivo con solo encabezados puede indicar que no hay incidencias accesibles coincidentes. Al compartirlo, ten en cuenta que las descripciones y los nombres son datos del proyecto.

### Verificar la integridad y volver a importar {#export-issues-limits}

El exportado tiene un máximo de 20.000 incidencias. Una advertencia de truncamiento indica que el archivo puede estar incompleto. Reduce el alcance por proyecto y estado, exporta grupos separados y compara las cantidades. Repetir el mismo alcance no descarga una página siguiente. Si falla la descarga, comprueba el error, la sesión y los permisos del proyecto antes de reintentar.

El formato se puede [importar en minddy](#import-issues), con permiso del propietario de destino y tras revisar el mapeo de campos. La importación crea incidencias nuevas; no restaura los identificadores originales ni actualiza las existentes. Mantén las filas padre en el mismo lote de importación. El CSV transporta datos de incidencias, no una copia de adjuntos, comentarios, ajustes de cuenta o credenciales. Para transferir una cuenta, usa la [guía de transferencia entre instancias](/docs/transfer-between-instances).

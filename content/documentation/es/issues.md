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
    "A06"
  ],
  "visibility": "public",
  "status": "published",
  "revision": 5,
  "sourceRevision": 5,
  "owner": "@mangue-dev",
  "updatedAt": "2026-10-09",
  "compatibility": {
    "version": "0.11.1 candidate (89ebb59a5); 0.11.1 candidate (cd1843e12)",
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
      "captures/shots/relations/intent.md",
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
      "content/documentation/reviews/csv-preview-capture-candidates.json"
    ]
  },
  "review": {
    "revision": 5,
    "fact": "agent:/root/german_spanish_review (structural consolidation review; prior procedural evidence retained; no operational rerun)",
    "language": "agent:/root/german_spanish_review (es title, summary, lead and heading review; retained body comparison)",
    "date": "2026-10-09"
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
      "alt": "Borrador sin enviar con título, descripción y propiedades que se pueden elegir manualmente.",
      "caption": "Describe el resultado esperado y elige las propiedades útiles antes de crear el ticket.",
      "revision": 5,
      "reviewed": true,
      "capturedAt": "2026-10-09",
      "viewport": [
        720,
        368
      ],
      "theme": "light",
      "padding": 24
    },
    {
      "id": "triage-incoming-work-steps",
      "kind": "screenshot",
      "src": "/documentation/es/triage-incoming.png",
      "alt": "Incidencia entrante de demostración DOC-11 con informe, propiedades y controles de duplicado, Rechazar y Aceptar.",
      "caption": "Lee el informe recibido antes de aceptarlo, rechazarlo o enlazar un duplicado.",
      "revision": 5,
      "reviewed": true,
      "capturedAt": "2026-10-08",
      "viewport": [
        994,
        866
      ],
      "theme": "light",
      "padding": 24
    },
    {
      "id": "issue-statuses-steps",
      "kind": "screenshot",
      "src": "/documentation/es/issue-statuses.png",
      "alt": "Los ocho estados del ticket en el selector, con el estado de backlog seleccionado.",
      "caption": "La marca indica el estado actual. Elige el que corresponda al estado real del trabajo.",
      "revision": 5,
      "reviewed": true,
      "capturedAt": "2026-10-09",
      "viewport": [
        288,
        357
      ],
      "theme": "light",
      "padding": 24
    },
    {
      "id": "issue-discussion-and-resources-steps",
      "kind": "screenshot",
      "src": "/documentation/es/work-resources.png",
      "alt": "Diálogo para añadir un enlace con una dirección de contacto de ejemplo.",
      "caption": "Revisa el destino antes de añadir el recurso. Este enlace de ejemplo no se ha enviado.",
      "revision": 5,
      "reviewed": true,
      "capturedAt": "2026-10-09",
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
      "alt": "Búsqueda de una incidencia bloqueante por identificador.",
      "caption": "Elige el sentido de la relación antes de su destino. El selector se muestra sin enviar la relación.",
      "revision": 5,
      "reviewed": true,
      "capturedAt": "2026-10-09",
      "viewport": [
        368,
        152
      ],
      "theme": "light",
      "padding": 24
    },
    {
      "id": "sub-issues-steps",
      "kind": "screenshot",
      "src": "/documentation/es/work-sub-issues.png",
      "alt": "Campo para crear una subincidencia en una incidencia principal de demostración.",
      "caption": "El campo crea una hija de esta incidencia; cada hija conserva su estado y conversación.",
      "revision": 5,
      "reviewed": true,
      "capturedAt": "2026-10-08",
      "viewport": [
        508,
        1096
      ],
      "theme": "light",
      "padding": 24
    },
    {
      "id": "implementation-plans-steps",
      "kind": "screenshot",
      "src": "/documentation/es/work-implementation-plan.png",
      "alt": "Plan de demostración con dos tareas de trabajo completadas de seis.",
      "caption": "El plan guardado distingue pasos completados, activos y pendientes. Su progreso no demuestra que se ejecutara la tarea de código ficticia.",
      "revision": 5,
      "reviewed": true,
      "capturedAt": "2026-10-08",
      "viewport": [
        508,
        1096
      ],
      "theme": "light",
      "padding": 24
    },
    {
      "id": "recurring-issues-steps",
      "kind": "screenshot",
      "src": "/documentation/es/issue-date-recurrence.png",
      "alt": "Selector de fecha en modo recurrente con vista previa semanal los domingos y hora opcional.",
      "caption": "El modo recurrente muestra la frecuencia semanal. Confirma la primera fecha antes de crear el ticket.",
      "revision": 5,
      "reviewed": true,
      "capturedAt": "2026-10-09",
      "viewport": [
        324,
        544
      ],
      "theme": "light",
      "padding": 24
    },
    {
      "id": "bulk-issue-actions-steps",
      "kind": "screenshot",
      "src": "/documentation/es/work-bulk-actions.png",
      "alt": "Menú de acciones para dos incidencias de demostración seleccionadas.",
      "caption": "El menú actúa sobre las incidencias seleccionadas. En esta captura no se envió ningún cambio conjunto.",
      "revision": 5,
      "reviewed": true,
      "capturedAt": "2026-10-08",
      "viewport": [
        788,
        506
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
      "revision": 5,
      "reviewed": true,
      "capturedAt": "2026-10-08",
      "viewport": [
        816,
        977
      ],
      "theme": "light",
      "padding": 24
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
    "bulk-issue-actions-steps",
    "import-issues-workflow"
  ]
}
---

Las incidencias registran el trabajo de un proyecto, desde la solicitud inicial hasta su cierre. Aquí encontrarás creación, clasificación, estados, conversaciones y recursos, relaciones, subincidencias, planes, recurrencias, acciones en bloque e importación CSV. La importación está reservada al propietario del proyecto.

## Crear y editar una incidencia {#create-an-issue}

Debes ser miembro del proyecto de destino. Abre el proyecto y su control para crear una incidencia. Escribe un título que identifique el trabajo y añade contexto, resultado esperado y restricciones en la descripción. Elige el proyecto deliberadamente cuando crees desde una vista personal o entre proyectos.

Para crear la incidencia manualmente, desactiva Rellenado inteligente si el botón aparece y está activado. Esto muestra los controles de prioridad, esfuerzo, categorías y objetivo para que los establezcas. La elección se aplica a esta incidencia; al volver a abrir el formulario de creación se restablece la preferencia de la cuenta. Es independiente de los interruptores de automatización y Smart Assign del proyecto.

Configura las propiedades útiles antes de confirmar: estado, prioridad, esfuerzo, responsable, objetivo, categorías, fecha límite y recurrencia. La persona responsable es miembro del proyecto; un objetivo agrupa incidencias alrededor de un resultado del proyecto. Puedes dejar las propiedades opcionales sin valor en lugar de adivinar. La prioridad va de ninguna a baja, media, alta y urgente; el esfuerzo utiliza XS, S, M, L y XL.

Confirma la creación y abre la nueva incidencia. Comprueba su identificador y proyecto. Vuelve a abrir los selectores de propiedades para cambiar valores conforme la tarea quede más clara. La descripción explica el trabajo; el plan de implementación se mantiene por separado en la pestaña del plan.


![Borrador sin enviar con título, descripción y propiedades que se pueden elegir manualmente.](/documentation/es/new-issue.png)

### Comprobar el guardado y la visibilidad {#issue-save}

Tras cambiar una propiedad, verifica el valor mostrado. Los filtros pueden retirar de inmediato una incidencia de la vista actual cuando cambia su responsable, estado o categoría. Busca su identificador o abre el proyecto sin esos filtros antes de crear una sustituta.

Si falla la creación o el guardado, conserva el texto, lee el error y comprueba que la pertenencia y el destino sigan existiendo. Antes de reintentar tras un fallo de red, comprueba si la incidencia ya se creó. Adjunta páginas del proyecto como recursos vinculados a su contenido actual cuando lo necesites y utiliza comentarios para discutir la tarea.

## Revisar el trabajo entrante en clasificación {#triage-incoming-work}

Abre el destino Clasificación del proyecto. Lee la incidencia entrante y el contexto de su origen antes de incorporarla al trabajo planificado. Comprueba si una incidencia existente ya representa la solicitud. Aclara el resultado esperado, proyecto, responsable, prioridad y esfuerzo cuando sea necesario.

Elige Aceptar y confirma para mover una incidencia que quieras conservar a Registro. Para rechazarla, elige Rechazar y confirma: su estado pasa a Cancelado. Si es un duplicado, utiliza el selector de duplicados para elegir la incidencia que se conservará. La incidencia entrante pasa a Duplicado y queda enlazada a la elegida. Cuando un elemento sale de clasificación, se selecciona el siguiente. Comprueba el estado resultante o el enlace al duplicado en la propia incidencia. Pasar de una tarjeta a otra sin realizar una de estas acciones no cierra la incidencia.

### Ordenación y límites {#triage-order}

Smart Triage utiliza reglas de ordenación deterministas.

Dentro de cada columna de estado, las incidencias abiertas que bloquean otro trabajo abierto se sitúan primero, por delante de las que no tienen bloqueos. Las incidencias bloqueadas por trabajo abierto quedan al final, incluso si también bloquean otras. Los extremos cerrados ya no generan esa prioridad. Dentro de cada nivel, una prioridad más alta, un esfuerzo menor y una fecha límite vencida o cercana adelantan el trabajo. En un mismo nivel de bloqueo, las incidencias de un objetivo permanecen agrupadas y el grupo se ordena según su incidencia mejor situada. Los empates se resuelven por fecha límite, antigüedad de creación, posición manual y, por último, identificador, que mantiene estable el orden. Una relación de vínculo no afecta a esta ordenación. No es un modo experimental de clasificación con IA. El orden ayuda a decidir qué elementos examinar primero; no demuestra que una descripción sea cierta, no resuelve duplicados automáticamente ni concede permisos.

Si falta el elemento esperado, comprueba el proyecto activo, estado y filtros, y busca su identificador. El trabajo importado o sincronizado externamente puede entrar en clasificación; revisa la fuente original y el mapeo de la integración antes de modificar campos sincronizados. Una solicitud vinculada desde feedback sigue siendo un objeto de feedback independiente con su propia discusión pública.


![Incidencia entrante de demostración DOC-11 con informe, propiedades y controles de duplicado, Rechazar y Aceptar.](/documentation/es/triage-incoming.png)

## Mover una incidencia por su ciclo de vida {#issue-statuses}

Abre el selector de estado de la incidencia o utiliza las acciones de estado del tablero. En una vista kanban, mover trabajo entre columnas cambia la propia incidencia; cambiar un filtro solo modifica lo que ves. Verifica el nuevo estado en el panel de detalle después del movimiento.

| Estado | Uso |
| --- | --- |
| Clasificación | Trabajo entrante pendiente de revisión. |
| Registro | Trabajo conservado que todavía no se ha seleccionado para empezar. |
| Pendiente | Trabajo seleccionado para realizarse. |
| En curso | Trabajo en marcha. |
| En examen | Implementación pendiente de revisión. |
| Hecho | Resultado esperado completado. |
| Cancelado | Trabajo cerrado sin entrega. |
| Duplicado | Trabajo representado por otra incidencia. |

Los estados son fijos y no se personalizan por proyecto. Clasificación y Duplicado están disponibles en los selectores, pero se omiten deliberadamente de las columnas kanban normales. Que falte una columna no demuestra que el estado o la incidencia no existan.


![Los ocho estados del ticket en el selector, con el estado de backlog seleccionado.](/documentation/es/issue-statuses.png)

### Estados finales y comprobación {#closed-work}

Hecho, Cancelado y Duplicado son estados finales para el seguimiento: dejan de bloquear incidencias dependientes y salen de los recuentos activos. Cerrar como Cancelado no significa que la tarea se haya entregado. Al marcar un duplicado, identifica la incidencia que se conserva para dar un destino claro a la discusión y el progreso.

Comprueba los filtros si una incidencia desaparece después de cerrarla. Ábrela de nuevo por su identificador para inspeccionar el resultado y cambiar el estado si la cerraste por error. En trabajo bloqueado, comprueba también la dirección de la dependencia: un cambio de estado no reescribe la descripción ni el plan de una incidencia.

## Discutir el trabajo y adjuntar su contexto {#issue-discussion-and-resources}

Abre la cronología de discusión de la incidencia para añadir un comentario. Explica una decisión, pregunta o resultado de verificación para que otro miembro comprenda qué cambió. Usa menciones cuando necesites una persona o un objeto vinculado en el contexto; las notificaciones siguen dependiendo de las preferencias del destinatario y de la entrega en su dispositivo.

Adjunta una página relevante del proyecto, un archivo o un enlace mediante los controles de recursos. Una página vinculada es un recurso actualizado: su título sigue los cambios de nombre y su contenido puede evolucionar. Un archivo es un adjunto almacenado, no una garantía de que una URL externa seguirá disponible.

![Diálogo para añadir un enlace con una dirección de contacto de ejemplo.](/documentation/es/work-resources.png)

### Visibilidad y cargas fallidas {#resource-access}

La pertenencia y el acceso al proyecto regulan la discusión y los recursos internos. Añadir un recurso a una incidencia no lo publica para visitantes anónimos. Al referirte a comentarios públicos, distingue la discusión interna del equipo de una respuesta pública antes de enviar texto.

Comprueba que un recurso cargado aparezca y pueda abrirse después de la operación. Si falla, conserva el archivo original, lee el error y verifica el límite aplicable de tamaño de archivo o almacenamiento de la cuenta. Los operadores autoalojados también necesitan metadatos, políticas y bytes de Storage que funcionen. Evita adjuntar credenciales o volcados privados de diagnóstico.

## Enlazar dependencias e incidencias relacionadas {#issue-dependencies}

Abre los controles de relaciones de una incidencia y busca la otra por título o identificador. Elige una relación de bloqueo cuando una tarea deba terminar antes de que otra pueda avanzar. Si A bloquea B, A es el requisito previo y B está bloqueada por A. Una relación de vínculo añade contexto sin imponer ese orden.

Lee los dos identificadores y la dirección mostrada antes de confirmar. Por ejemplo, «Preparar el punto de acceso» bloquea «Conectar el cliente», y no al revés. Una dependencia no convierte ninguna de las incidencias en subincidencia; una relación de padre e hija no sustituye a una relación de bloqueo.

![Búsqueda de una incidencia bloqueante por identificador.](/documentation/es/work-dependencies.png)

### Bloqueos resueltos y heredados {#blocker-state}

Los estados finales Hecho, Cancelado y Duplicado hacen que una incidencia deje de bloquear trabajo. Las relaciones conectan incidencias u objetivos del mismo proyecto; ambos extremos deben ser accesibles allí. No enlazan trabajo privado arbitrario entre proyectos ni publican ninguno de los extremos.

Una incidencia abierta puede heredar un bloqueo a través de su objetivo abierto. Si A bloquea el objetivo B, las incidencias abiertas vinculadas a B muestran A como bloqueo heredado, aunque no exista una relación directa de A a la incidencia. La interfaz identifica el requisito real y el objetivo que transmite el bloqueo. Examina esa relación del objetivo antes de intentar retirarla de la incidencia. Cerrar A, cerrar B o sacar la incidencia de B elimina el bloqueo heredado. Este mecanismo depende de la pertenencia al objetivo, no de la jerarquía entre incidencias principales y subincidencias.

Retira una relación desde sus controles cuando ya no corresponda y verifica tanto la etiqueta como el indicador de bloqueo. Marcar una incidencia como duplicada afecta a su ciclo de vida y remite al trabajo conservado. Úsalo para tareas duplicadas en lugar de crear un vínculo ordinario y suponer que eso cierra el duplicado.

Si el selector no encuentra una incidencia, comprueba el acceso al proyecto y el identificador. No expongas contenido de otro proyecto pegando una URL privada de incidencia en una respuesta pública a una solicitud de feedback.

## Dividir una incidencia en subincidencias {#sub-issues}

Abre la incidencia principal y usa sus controles de subincidencias para crear partes menores del trabajo. Asigna un resultado distinto a cada hija. Comprueba su proyecto, propiedades e identificador de la principal después de crearla; la jerarquía debe facilitar el seguimiento, no sustituir la descripción de lo que cada hija debe lograr.

La jerarquía admite un nivel: la incidencia principal debe ser una incidencia de nivel superior del mismo proyecto y una subincidencia no puede tener hijas. Si no eliges expresamente un objetivo al crearla, la hija hereda el objetivo de la principal. Comprueba las propiedades resultantes en lugar de suponer que los cambios posteriores de la principal se propagan.

Una hija sigue siendo una incidencia con estado y discusión propios. El indicador de progreso de la principal pondera el esfuerzo de las hijas y la proporción de avance que corresponde a su estado. El contador de completadas sobre el total de la lista de subincidencias es un recuento separado, sin ponderar. Lee los estados de las hijas junto con ambas medidas. Usa una dependencia para expresar «debe terminar antes» y una principal para expresar «forma parte de esta tarea mayor».

![Campo para crear una subincidencia en una incidencia principal de demostración.](/documentation/es/work-sub-issues.png)

### Abrir o retirar la relación con la principal {#change-parent}

El identificador de la principal junto al título de la hija abre un menú. Usa la acción de abrir la principal para examinar la tarea mayor. Para separar la hija, elige desvincularla de la principal y lee la confirmación antes de aplicarla. La desvinculación correcta elimina la relación y conserva la incidencia.

No elimines una hija solo para reorganizar la jerarquía. Comprueba las relaciones existentes antes de cambiar la principal y resuelve una relación rechazada en lugar de forzar una jerarquía circular. Si falla el guardado, vuelve a abrir la hija para ver si el cambio se aplicó antes de intentarlo otra vez. Conserva el trabajo completado de las hijas al revisar el plan global.

## Mantener un plan de implementación {#implementation-plans}

Abre la pestaña del plan de la incidencia. Su descripción ya debería indicar el problema y el resultado esperado. Añade los pasos de implementación manualmente o pide a Numo que examine el repositorio vinculado antes de proponer un plan a nivel de código. Una ruta o función generadas por IA no son una prueba si no se ha leído realmente el repositorio.

Sangra cada línea de tarea con dos espacios por nivel de anidamiento; un tabulador cuenta como cuatro espacios. El anidamiento organiza los pasos del plan y no crea relaciones entre incidencias principales e hijas. Todas las tareas de trabajo no canceladas siguen contando para el progreso, incluidas las anidadas.

El plan utiliza líneas de tareas Markdown: `- [ ]` para pendientes, `- [~]` para en curso, `- [x]` para completadas y `- [-]` para canceladas. Escribe el texto después del marcador, por ejemplo `- [ ] Comprobar el enlace de contacto en móvil`. Las tareas canceladas no cuentan en el progreso. Las tareas bajo un encabezado Questions reconocido se tratan como preguntas y también quedan fuera del progreso; mantén los pasos de trabajo en otra sección con el mismo nivel de encabezado. El encabezado reconocido es `Questions`, con esa palabra en inglés. Guarda las modificaciones explícitas con el control de guardado; cancelar descarta el borrador. Marcar una tarea mostrada actualiza su estado. Utiliza pendiente, en curso, completada y cancelada para reflejar lo ocurrido, sin dar por realizadas comprobaciones que aún no se han ejecutado.

![Plan de demostración con dos tareas de trabajo completadas de seis.](/documentation/es/work-implementation-plan.png)

### Conservar el progreso y las ediciones simultáneas {#plan-progress}

Amplía o modifica el plan existente en lugar de sustituirlo por una copia nueva sin marcar. Conserva los pasos completados y las explicaciones de los cambios de alcance. Antes de guardar una reescritura importante, compárala con el plan más reciente si otro miembro o agente ha trabajado en la incidencia.

Puedes entregar un plan escrito a Numo para implementarlo cuando estén disponibles el trabajo con repositorios y su entorno aislado configurado. Cuando ya exista trabajo completado, la interfaz también ofrece verificar la implementación. Estas acciones inician trabajo; una casilla marcada no demuestra por sí sola que el código pase las pruebas. Lee el resultado, los cambios y las comprobaciones antes de marcar la incidencia como hecha.

## Repetir una incidencia después de completarla {#recurring-issues}

Crea o abre una incidencia que siga siendo útil cada vez, como una comprobación periódica de dependencias. Define una fecha límite y elige una recurrencia diaria, semanal, mensual o anual en el control de fecha de la incidencia. Se rechaza una recurrencia sin fecha límite. Revisa propiedades y responsable antes de guardar. Los ajustes de recurrencias del proyecto muestran las series activas; úsalos para cambiar la frecuencia o detener la repetición.

Las incidencias recurrentes se recrean cuando la anterior queda en «Hecho»; la siguiente se crea en Registro. Comprueba su identificador y propiedades después de completar una recurrencia.

La siguiente fecha límite se calcula sumando un intervalo de recurrencia a la fecha límite anterior, no desde el día en que terminaste la tarea. La sucesora copia título, descripción, prioridad, esfuerzo, responsable, objetivo y categorías. No copia el plan de implementación, la relación con la principal, los recursos ni los comentarios. La recurrencia pasa a la sucesora; reabrir y completar de nuevo la incidencia antigua no crea otra repetición. Si falla la creación de la sucesora, la serie se detiene en lugar de reintentar repetidamente sobre la incidencia completada. Examina el resultado y configura la recurrencia en la siguiente tarea adecuada después de resolver el fallo. No supongas que un calendario ejecuta código o completa la nueva incidencia por ti.


![Selector de fecha en modo recurrente con vista previa semanal los domingos y hora opcional.](/documentation/es/issue-date-recurrence.png)

### Cambiar o detener la repetición {#recurrence-change}

Utiliza los ajustes de recurrencia para editar o desactivar las repeticiones futuras. Examina por separado las incidencias ya creadas: detener la creación futura no significa que el trabajo existente se haya completado o retirado.

Una rutina de Numo es un objeto distinto: programa una conversación y puede utilizar el presupuesto de IA del propietario y los proveedores configurados. Elige incidencias recurrentes para una tarea repetida con seguimiento y una rutina para una instrucción que deba ejecutarse en un horario. Si falta la siguiente incidencia, comprueba si la anterior se marcó como hecha, si la recurrencia sigue activa y si estás viendo Registro sin filtros restrictivos.

## Actualizar varias incidencias juntas {#bulk-issue-actions}

En un tablero, mantén pulsada Mayús y haz clic en cada tarjeta para seleccionarla o quitarla de la selección. Con el ratón, también puedes arrastrar un rectángulo de selección desde un espacio vacío del tablero. Mayús, Command o Ctrl hacen que ese gesto amplíe la selección existente. El rectángulo no es un modo de selección para pantallas táctiles. Comprueba el número seleccionado y los identificadores visibles antes de abrir las acciones masivas. La selección es un conjunto de trabajo para la acción, no una vista guardada ni una concesión de permisos.

Elige Acciones en la barra flotante de selección para abrir la paleta de comandos. Elige estado, prioridad, esfuerzo o responsable, establece el valor y confirma el formulario integrado. La acción de objetivo solo aparece cuando la selección pertenece a un único proyecto con objetivos disponibles. Otras acciones, como añadir o quitar del ciclo, enlazar dos incidencias o enviar la selección a Numo, aparecen cuando el tablero actual las admite. Revisa después las incidencias afectadas. En un dispositivo exclusivamente táctil sin un gesto de selección múltiple compatible, edita cada incidencia en su panel de detalle.

![Menú de acciones para dos incidencias de demostración seleccionadas.](/documentation/es/work-bulk-actions.png)

### Resultados parciales y acciones destructivas {#bulk-results}

Al trabajar entre proyectos, verifica tu pertenencia a cada uno de los afectados. Lee los resultados de fallos parciales: algunos cambios pueden haberse guardado aunque otra incidencia se haya rechazado. Comprueba el resultado antes de volver a intentar toda la selección.

La eliminación afecta a todos los elementos seleccionados, así que confirma el conjunto antes de continuar. Quita la selección después de la operación si vas a pasar a otro trabajo. Si la actualización modifica los resultados de los filtros, las incidencias pueden salir de la vista mostrada y seguir en el proyecto. Busca sus identificadores para verificar el estado nuevo en lugar de recrearlas.

## Importar un backlog CSV tras revisar correspondencias {#import-issues}

El propietario abre Importación en la configuración del proyecto y selecciona una exportación CSV. Los formatos de Linear y Jira se detectan; los demás CSV usan el mapeo genérico. El límite por importación es de 5 MiB y 5.000 incidencias. Divida una exportación mayor de forma planificada y, cuando sea posible, mantenga las referencias a incidencias padre en el mismo lote.

Asocie la columna del título antes de importar. Revise descripción, estado, prioridad, esfuerzo, fecha límite, categorías y responsables. Asocie las personas a miembros reales del proyecto y examine las categorías nuevas. Las referencias a padres corresponden a claves externas del lote y admiten un solo nivel. Los CSV no importan los bytes de los archivos adjuntos.

Solo se solicita una propuesta de IA para los huecos del mapeo. Puede editarla; un proveedor fallido o no disponible deja utilizable el mapeo manual. Una corrección manual impide que una propuesta tardía sobrescriba sus decisiones.

### Importar y comprobar {#result}

Tras cada cambio de mapeo, lea las cantidades de incidencias, la distribución de estados y los avisos. Corrija las filas omitidas o inválidas antes de confirmar. La importación crea incidencias nuevas; no suponga que reenviar el archivo sea una actualización que elimina duplicados. Después del éxito, compruebe incidencias representativas, responsables, fechas y vínculos con padres. Si se pierde la respuesta, revise el proyecto antes de reenviar el archivo completo para evitar trabajo duplicado.

![Vista previa CSV de dos filas de demostración traducidas y las columnas detectadas.](/documentation/es/import-issues-preview-workflow.png)

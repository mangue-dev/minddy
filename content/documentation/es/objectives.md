---
{
  "id": "objectives",
  "locale": "es",
  "title": "Objetivos",
  "summary": "Define el resultado de un proyecto, vincula el trabajo e interpreta el progreso, las dependencias y el ritmo.",
  "topic": "Proyectos e incidencias",
  "type": "guide",
  "audiences": [
    "member"
  ],
  "workflows": [
    "W10",
    "W11"
  ],
  "visibility": "public",
  "status": "published",
  "revision": 24,
  "sourceRevision": 23,
  "owner": "@mangue-dev",
  "updatedAt": "2026-10-31",
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
      "content/knowledge/core-tracker.md",
      "components/objective-dialog.tsx",
      "components/objective-field-shortcuts.ts",
      "components/objective-detail.tsx",
      "components/objective-relations-section.tsx",
      "components/objective-momentum.tsx",
      "lib/relation-constants.ts",
      "lib/server/issue-relations.ts",
      "lib/objective-momentum.ts",
      "docs/security/project-roles.md",
      "lib/project-roles.ts",
      "components/editor/rich-editor.tsx",
      "components/editor/document-editor.tsx",
      "components/editor/comment-editor.tsx",
      "lib/server/description-collaboration.ts",
      "lib/use-description-collaboration.ts",
      "docs/document-collaboration.md",
      "components/creation-project-select.tsx",
      "lib/use-resource-mentions.ts",
      "lib/keyboard/shortcuts.ts",
      "lib/objective-order.ts",
      "components/objective-label.tsx",
      "components/editor/mobile-editor-toolbar.tsx",
      "lib/palette-picker.ts",
      "components/palette-picker-rows.tsx",
      "app/(app)/projects/[id]/page.tsx",
      "components/objectives/objectives-page.tsx",
      "components/app-sidebar.tsx",
      "lib/objective-forecast.ts",
      "lib/server/objective-forecast.ts",
      "app/api/objectives/[id]/forecast/route.ts"
    ]
  },
  "review": {
    "revision": 24,
    "fact": "agent:claude-code (estimated finish date now computed on the server from contributors' activity hours, cross-project throughput and allocation to the objective, with the objective's own pace as fallback, MIN-876; checked against lib/objective-forecast.ts, lib/server/objective-forecast.ts, app/api/objectives/[id]/forecast/route.ts and components/objective-momentum.tsx; not checked in the running app; rest of the article unchanged since the previous review; no figure recaptured, existing figures do not show the momentum estimate)",
    "language": "agent:claude-code (es translation of the changed passage, reviewed against en revision 23; agent review, not human acceptance)",
    "date": "2026-10-31"
  },
  "related": [
    "issues",
    "personal-cycle",
    "personal-statistics"
  ],
  "aliases": [
    "objective-dependencies-and-momentum"
  ],
  "tags": [
    "Seguir un resultado con un objetivo",
    "Interpretar dependencias y ritmo de los objetivos"
  ],
  "figures": [
    {
      "id": "objectives-steps",
      "kind": "screenshot",
      "src": "/documentation/es/reader-objectives.png",
      "alt": "Diálogo de creación de objetivo sin enviar en el proyecto Aurora con un nombre de resultado de ejemplo y el botón Crear objetivo.",
      "caption": "Nombra el resultado antes de elegir responsable, fecha objetivo y estado. Este diálogo no ha creado un segundo objetivo.",
      "revision": 24,
      "reviewed": true,
      "capturedAt": "2026-10-22",
      "viewport": [
        720,
        358
      ],
      "theme": "light",
      "padding": 24,
      "deviceScaleFactor": 2
    }
  ],
  "requiredFigures": [
    "objectives-steps"
  ]
}
---

Un objetivo agrupa las incidencias de un proyecto en torno a un resultado. Créalo y vincula el trabajo correspondiente. Revisa después el progreso, las dependencias bloqueantes y la señal de ritmo antes de ajustar o cerrar el objetivo.

## Seguir un resultado con un objetivo {#objectives}

Abre el destino de objetivos del proyecto y crea un objetivo. Si lo creas desde otro lugar de la aplicación, elige su proyecto en **Crear en**, arriba a la izquierda del formulario (junto al título **Nuevo objetivo** en el teléfono); cambiar de proyecto quita el responsable y las relaciones elegidos para el anterior. En un ordenador, Command/Ctrl+Mayús+P abre ese menú incluso mientras escribes el nombre o la descripción; al elegir un proyecto o cerrar el menú, el cursor vuelve exactamente donde estaba. La píldora muestra este atajo, que solo existe cuando se puede elegir más de un proyecto; en el teléfono no se muestra ningún atajo. Nombra el resultado que quieres, añade contexto útil y define los campos disponibles de responsable, fecha objetivo, color y estado. En un ordenador, las mismas teclas que en los campos de una incidencia los abren en cuanto el cursor sale del nombre y la descripción: S el estado, A el responsable, D la fecha objetivo, R una relación y C el color; la información emergente de cada selector muestra su tecla. Un objetivo pertenece a un proyecto; es distinto de un ciclo personal que abarque varios proyectos. La persona responsable se encarga del resultado; seleccionarla no transfiere la propiedad del proyecto. Solo el propietario o un Miembro puede ser responsable de un objetivo, y un responsable cuyo rol pasa a Lector deja de serlo.

La descripción del objetivo y sus comentarios usan el mismo editor que las páginas del proyecto, sin los controles de bloque: escribe `/` para insertar bloques y `@` para mencionar a una persona, una incidencia, un objetivo o una página. El menú `@` también muestra los recursos adjuntos a lo que escribes: la incidencia o el objetivo para su descripción y su plan, un comentario para sus propios archivos o un diálogo de creación para los archivos añadidos en él. Una mención de un recurso adjunto en otro lugar aparece como **No disponible**. Varias personas pueden editar la descripción a la vez, con el cursor de cada una visible con su nombre y su color. Selecciona texto para darle formato o añadir un enlace. Pega o suelta una imagen, o elige **Imagen** en el menú `/`, para insertarla en la descripción. En un teléfono, la barra encima del teclado sustituye a la barra de selección y al menú `@` al escribir; la [guía de páginas](/es/documentacion/pages#editor-formatting) la describe.

Abre cada incidencia relevante y elige el objetivo en sus propiedades, o utiliza los controles de incidencias del objetivo. El selector de objetivos muestra los objetivos abiertos antes que los hechos y cancelados; dentro de cada grupo, primero aparecen los que recibieron más incidencias en los últimos 30 días. Cada uno muestra su estado y su nombre en su color. Comprueba que el trabajo previsto aparezca bajo el objetivo. Usa su discusión y recursos para decisiones y páginas de referencia que se apliquen al resultado completo.

![Diálogo de creación de objetivo sin enviar en el proyecto Aurora con un nombre de resultado de ejemplo y el botón Crear objetivo.](/documentation/es/reader-objectives.png)

En la página de objetivos, mantén pulsada Mayús y haz clic en objetivos para seleccionar varios; un clic en el espacio vacío de la lista borra la selección. **Acciones** en la barra flotante, o Command+K en macOS o Ctrl+K en otros sistemas, ofrece **Cambiar estado**, **Cambiar responsable**, **Cambiar color** y **Mover a la papelera**, que primero pide confirmación. **Pregúntale a Numo** abre Numo con todos los objetivos seleccionados en su contexto.

### Leer el progreso antes de cerrar {#objective-progress}

Revisa las incidencias completadas y activas junto con el progreso del objetivo. Un indicador resume el trabajo vinculado; no puede determinar si un resultado del producto es aceptable. Revisa tareas que falten y trabajo cancelado o duplicado antes de marcar el objetivo como completado. El tablero del objetivo muestra primero el trabajo abierto: selecciona **Hecha** y **Cancelada** en su filtro **Estado** para revisar ahí las incidencias cerradas. En un ordenador, mientras el tablero muestra las incidencias de un objetivo, la barra lateral se queda en la lista de objetivos, bajo la fila de retorno **Objetivos**, con ese objetivo resaltado; elige otro objetivo en esa lista para cambiar el tablero a él.

Utiliza el ciclo de vida del objetivo para distinguir resultados planificados, en marcha, completados y cancelados. Una fecha objetivo es una meta, mientras que una previsión es una estimación basada en actividad. Si el objetivo parece vacío, comprueba la vinculación de incidencias y los filtros en lugar de recrearlo. Eliminar un objetivo utiliza la papelera recuperable y no es un cambio de estado ordinario.

## Interpretar dependencias y ritmo de los objetivos {#objective-dependencies-and-momentum}

Abre el objetivo y sus relaciones. En la página del objetivo, fuera de un campo de texto, R abre la elección del tipo de relación. Una vez elegido el tipo, la incidencia o el objetivo se elige en la paleta de comandos, como en una incidencia. Comprueba qué resultado depende de otro y lee las relaciones de bloqueo entre incidencias cuando expliquen la restricción. La organización entre principal e hijas, un vínculo y una dependencia de bloqueo responden a preguntas distintas; comprueba la dirección antes de cambiar una relación.

Una relación de bloqueo puede conectar una incidencia u otro objetivo con este objetivo dentro del mismo proyecto. Sus incidencias abiertas heredan el bloqueo pendiente: la relación mostrada identifica tanto el requisito real como el objetivo que lo transmite. No se almacena una nueva relación directa en cada incidencia. Cerrar el requisito o el objetivo bloqueado, o retirar una incidencia de ese objetivo, elimina el bloqueo heredado correspondiente. Resuelve el requisito real o corrige una relación obsoleta. Cambiar únicamente la fecha objetivo no completa las incidencias que lo bloquean.

### Interpretar la señal de ritmo {#momentum}

El panel Ritmo solo aparece cuando el objetivo tiene una fecha objetivo. Al eliminar esa fecha, se oculta el panel, incluidos el historial, las estadísticas de ritmo y la fecha estimada de finalización. Añade una fecha objetivo para volver a mostrarlo; el indicador de progreso general sigue disponible sin ella.

El ritmo resume el trabajo completado recientemente. Puede estar acelerándose, estable, ralentizándose o detenido, con estados separados para objetivos no iniciados, completados y cancelados. Úsalo para identificar un resultado que necesite atención y después lee las incidencias y la actividad subyacentes.

La fecha estimada parte de las personas que hacen el trabajo. Para cada persona asignada a incidencias vinculadas, minddy deduce sus horas de actividad habituales a partir de cuándo finaliza incidencias, mide el esfuerzo que entrega en todos sus proyectos y estima la parte de ese esfuerzo dedicada a este objetivo según sus finalizaciones recientes y su trabajo abierto. La estimación solo avanza durante esas horas de actividad: las noches y los fines de semana no suman progreso, y el trabajo sin asignar se reparte entre quienes contribuyen. El cálculo se hace en el servidor: las incidencias de otros proyectos y las cifras de cada persona nunca se muestran, solo la fecha resultante. Una persona cuenta en cuanto ha finalizado al menos dos incidencias en las últimas seis semanas. Si no hay ninguna, la estimación vuelve al ritmo propio del objetivo, que requiere al menos dos finalizaciones, una semana completa observada, esfuerzo entregado positivo y trabajo pendiente. Solo contribuyen al ritmo las incidencias vinculadas actualmente; una finalización anterior a la creación del objetivo no genera un ritmo reciente artificial. Con una fecha objetivo válida, el historial abarca desde la creación hasta esa fecha y el rendimiento utiliza el tiempo observado desde la creación, incluido el transcurrido después de una fecha incumplida. Si hay una fecha objetivo pero no define un periodo válido posterior a la creación, el cálculo utiliza un historial móvil de ocho semanas y una ventana de previsión de 28 días. Un historial escaso o un cambio reciente de alcance reducen su utilidad. La estimación no es una fecha prometida y no incluye trabajo invisible que no hayas vinculado. Compara la fecha objetivo, el trabajo pendiente y las restricciones reales antes de cambiar compromisos.


## Elegir un objetivo para un comentario {#objective-feedback}

En las propiedades del objetivo, el número de comentarios abre la sección de comentarios del proyecto filtrada por este objetivo, incluidas las solicitudes resueltas. La fila queda oculta mientras ninguna solicitud pertenezca al objetivo. Las solicitudes siguen separadas del progreso de los tickets y del impulso.

Un comentario puede pertenecer a un objetivo sin convertirse en ticket. En los comentarios del proyecto, elige el objetivo en las propiedades de la solicitud. No contribuyen al progreso ni al ritmo de los tickets. Al convertirlas, el ticket hereda el objetivo y las categorías, salvo los cambios realizados en el formulario de creación.

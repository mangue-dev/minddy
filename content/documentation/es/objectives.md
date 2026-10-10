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
  "revision": 7,
  "sourceRevision": 7,
  "owner": "@mangue-dev",
  "updatedAt": "2026-10-10",
  "compatibility": {
    "version": "0.11.1 development (MIN-671)",
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
      "components/objective-detail.tsx",
      "components/objective-relations-section.tsx",
      "components/objective-momentum.tsx",
      "lib/relation-constants.ts",
      "lib/server/issue-relations.ts",
      "lib/objective-momentum.ts",
      "content/documentation/reviews/min-671-objective-momentum-2026-10-10.md"
    ]
  },
  "review": {
    "revision": 7,
    "fact": "agent:/root (MIN-671 target-date condition and retained calculation claims checked against source and render tests; earlier procedural evidence retained)",
    "language": "agent:/root (es changed-passage review against English revision 7; earlier unchanged prose reviews retained)",
    "date": "2026-10-10"
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
      "alt": "Diálogo de creación de objetivo sin enviar con un nombre de resultado de ejemplo.",
      "caption": "Nombra el resultado antes de elegir responsable, fecha objetivo y estado. Este diálogo no ha creado un segundo objetivo.",
      "revision": 7,
      "reviewed": true,
      "capturedAt": "2026-10-08",
      "viewport": [
        720,
        330
      ],
      "theme": "light",
      "padding": 24
    }
  ],
  "requiredFigures": [
    "objectives-steps"
  ]
}
---

Un objetivo agrupa las incidencias de un proyecto en torno a un resultado. Créalo y vincula el trabajo correspondiente. Revisa después el progreso, las dependencias bloqueantes y la señal de ritmo antes de ajustar o cerrar el objetivo.

## Seguir un resultado con un objetivo {#objectives}

Abre el destino de objetivos del proyecto y crea un objetivo. Nombra el resultado que quieres, añade contexto útil y define los campos disponibles de responsable, fecha objetivo, color y estado. Un objetivo pertenece a un proyecto; es distinto de un ciclo personal que abarque varios proyectos. La persona responsable se encarga del resultado; seleccionarla no transfiere la propiedad del proyecto.

Abre cada incidencia relevante y elige el objetivo en sus propiedades, o utiliza los controles de incidencias del objetivo. Comprueba que el trabajo previsto aparezca bajo el objetivo. Usa su discusión y recursos para decisiones y páginas de referencia que se apliquen al resultado completo.

![Diálogo de creación de objetivo sin enviar con un nombre de resultado de ejemplo.](/documentation/es/reader-objectives.png)

### Leer el progreso antes de cerrar {#objective-progress}

Revisa las incidencias completadas y activas junto con el progreso del objetivo. Un indicador resume el trabajo vinculado; no puede determinar si un resultado del producto es aceptable. Revisa tareas que falten y trabajo cancelado o duplicado antes de marcar el objetivo como completado.

Utiliza el ciclo de vida del objetivo para distinguir resultados planificados, en marcha, completados y cancelados. Una fecha objetivo es una meta, mientras que una previsión es una estimación basada en actividad. Si el objetivo parece vacío, comprueba la vinculación de incidencias y los filtros en lugar de recrearlo. Eliminar un objetivo utiliza la papelera recuperable y no es un cambio de estado ordinario.

## Interpretar dependencias y ritmo de los objetivos {#objective-dependencies-and-momentum}

Abre el objetivo y sus relaciones. Comprueba qué resultado depende de otro y lee las relaciones de bloqueo entre incidencias cuando expliquen la restricción. La organización entre principal e hijas, un vínculo y una dependencia de bloqueo responden a preguntas distintas; comprueba la dirección antes de cambiar una relación.

Una relación de bloqueo puede conectar una incidencia u otro objetivo con este objetivo dentro del mismo proyecto. Sus incidencias abiertas heredan el bloqueo pendiente: la relación mostrada identifica tanto el requisito real como el objetivo que lo transmite. No se almacena una nueva relación directa en cada incidencia. Cerrar el requisito o el objetivo bloqueado, o retirar una incidencia de ese objetivo, elimina el bloqueo heredado correspondiente. Resuelve el requisito real o corrige una relación obsoleta. Cambiar únicamente la fecha objetivo no completa las incidencias que lo bloquean.

### Interpretar la señal de ritmo {#momentum}

El panel Ritmo solo aparece cuando el objetivo tiene una fecha objetivo. Al eliminar esa fecha, se oculta el panel, incluidos el historial, las estadísticas de ritmo y la fecha estimada de finalización. Añade una fecha objetivo para volver a mostrarlo; el indicador de progreso general sigue disponible sin ella.

El ritmo resume el trabajo completado recientemente. Puede estar acelerándose, estable, ralentizándose o detenido, con estados separados para objetivos no iniciados, completados y cancelados. Úsalo para identificar un resultado que necesite atención y después lee las incidencias y la actividad subyacentes.

La fecha estimada requiere al menos dos finalizaciones, una semana completa observada, esfuerzo entregado positivo y trabajo pendiente. Solo contribuyen las incidencias vinculadas actualmente; una finalización anterior a la creación del objetivo no genera un ritmo reciente artificial. Con una fecha objetivo válida, el historial abarca desde la creación hasta esa fecha y el rendimiento utiliza el tiempo observado desde la creación, incluido el transcurrido después de una fecha incumplida. Si hay una fecha objetivo pero no define un periodo válido posterior a la creación, el cálculo utiliza un historial móvil de ocho semanas y una ventana de previsión de 28 días. Un historial escaso o un cambio reciente de alcance reducen su utilidad. La estimación no es una fecha prometida y no incluye trabajo invisible que no hayas vinculado. Compara la fecha objetivo, el trabajo pendiente y las restricciones reales antes de cambiar compromisos.

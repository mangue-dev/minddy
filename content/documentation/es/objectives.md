---
{
  "id": "objectives",
  "locale": "es",
  "title": "Seguir un resultado con un objetivo",
  "summary": "Crea un resultado del proyecto, vincula incidencias y examina su progreso.",
  "topic": "Proyectos e incidencias",
  "type": "guide",
  "audiences": [
    "member"
  ],
  "workflows": [
    "W10"
  ],
  "visibility": "public",
  "status": "published",
  "revision": 3,
  "sourceRevision": 1,
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
      "content/knowledge/core-tracker.md",
      "components/objective-dialog.tsx",
      "components/objective-detail.tsx"
    ]
  },
  "review": {
    "revision": 3,
    "fact": "2026-10-08",
    "language": "2026-10-08",
    "date": "2026-10-08"
  },
  "related": [
    "objective-dependencies-and-momentum",
    "create-an-issue",
    "personal-cycle"
  ],
  "aliases": [],
  "tags": [],
  "figures": [
    {
      "id": "objectives-steps",
      "kind": "screenshot",
      "src": "/documentation/es/reader-objectives.png",
      "alt": "Diálogo de creación de objetivo sin enviar con un nombre de resultado de ejemplo.",
      "caption": "Nombra el resultado antes de elegir responsable, fecha objetivo y estado. Este diálogo no ha creado un segundo objetivo.",
      "revision": 3,
      "reviewed": true,
      "capturedAt": "2026-10-08",
      "viewport": [
        1280,
        1080
      ],
      "theme": "light"
    }
  ],
  "requiredFigures": [
    "objectives-steps"
  ]
}
---

## Crear y completar un objetivo con trabajo {#objectives}

Abre el destino de objetivos del proyecto y crea un objetivo. Nombra el resultado que quieres, añade contexto útil y define los campos disponibles de responsable, fecha objetivo, color y estado. Un objetivo pertenece a un proyecto; es distinto de un ciclo personal que abarque varios proyectos. La persona responsable se encarga del resultado; seleccionarla no transfiere la propiedad del proyecto.

Abre cada incidencia relevante y elige el objetivo en sus propiedades, o utiliza los controles de incidencias del objetivo. Comprueba que el trabajo previsto aparezca bajo el objetivo. Usa su discusión y recursos para decisiones y páginas de referencia que se apliquen al resultado completo.

![Diálogo de creación de objetivo sin enviar con un nombre de resultado de ejemplo.](/documentation/es/reader-objectives.png)

## Leer el progreso antes de cerrar {#objective-progress}

Revisa las incidencias completadas y activas junto con el progreso del objetivo. Un indicador resume el trabajo vinculado; no puede determinar si un resultado del producto es aceptable. Revisa tareas que falten y trabajo cancelado o duplicado antes de marcar el objetivo como completado.

Utiliza el ciclo de vida del objetivo para distinguir resultados planificados, en marcha, completados y cancelados. Una fecha objetivo es una meta, mientras que una previsión es una estimación basada en actividad. Si el objetivo parece vacío, comprueba la vinculación de incidencias y los filtros en lugar de recrearlo. Eliminar un objetivo utiliza la papelera recuperable y no es un cambio de estado ordinario.

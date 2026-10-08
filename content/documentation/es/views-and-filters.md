---
{
  "id": "views-and-filters",
  "locale": "es",
  "title": "Guardar una vista de tu trabajo",
  "summary": "Filtra y ordena incidencias sin modificar sus propiedades guardadas.",
  "topic": "Planificar y encontrar trabajo",
  "type": "guide",
  "audiences": [
    "member"
  ],
  "workflows": [
    "W13"
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
      "content/knowledge/productivity.md",
      "components/board-toolbar.tsx",
      "components/sidebar-filter-field.tsx",
      "app/api/me/saved-views/route.ts"
    ]
  },
  "review": {
    "revision": 3,
    "fact": "2026-10-08",
    "language": "2026-10-08",
    "date": "2026-10-08"
  },
  "related": [
    "share-a-view",
    "navigation",
    "search-and-shortcuts"
  ],
  "aliases": [],
  "tags": [],
  "figures": [
    {
      "id": "views-and-filters-steps",
      "kind": "screenshot",
      "src": "/documentation/es/work-view-filters.png",
      "alt": "Filtros manuales de una vista y menú de ordenación.",
      "caption": "Filtra por propiedades de las incidencias o elige un orden. El campo de IA es opcional para estos controles manuales.",
      "revision": 3,
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
    "views-and-filters-steps"
  ]
}
---

## Crear y guardar la vista {#views-and-filters}

Empieza desde un tablero de proyecto o una superficie personal de incidencias entre proyectos. Utiliza sus filtros y controles de ordenación y visualización para elegir el trabajo que necesitas. Comprueba el alcance antes de guardar: una vista personal y una de proyecto no tienen el mismo límite de acceso.

Filtra por propiedades admitidas, como estado, responsable, prioridad, categorías u objetivo. Ordena el resultado para que la siguiente acción sea clara. En kanban, las incidencias siguen agrupadas por estado; cambiar una vista no modifica su estado ni asignación.

Guarda la vista con un nombre que describa su propósito, selecciónala de nuevo desde la navegación y verifica sus filtros. Edítala o retírala cuando cambie su propósito. Compartir una vista es una publicación aparte con sus propias reglas de permisos y revocación.

![Filtros manuales de una vista y menú de ordenación.](/documentation/es/work-view-filters.png)

## Resolver resultados vacíos o inesperados {#view-recovery}

Comprueba todos los filtros, el proyecto activo y tu pertenencia cuando falten incidencias esperadas. Quita los filtros restrictivos antes de suponer que se han eliminado datos. Después de editar una incidencia, es normal que pueda salir de una vista filtrada. Busca su identificador o utiliza un tablero de proyecto sin filtros para examinar los valores guardados.

Una vista guardada no es una copia de sus incidencias. Eliminarla retira su configuración, mientras que eliminar incidencias seleccionadas modifica el trabajo subyacente del proyecto.

---
{
  "id": "views",
  "locale": "es",
  "title": "Vistas y filtros",
  "summary": "Guarda una vista filtrada del trabajo accesible, compártela en modo de solo lectura y revoca el acceso público cuando sea necesario.",
  "topic": "Planificar y encontrar trabajo",
  "type": "guide",
  "audiences": [
    "member"
  ],
  "workflows": [
    "W13",
    "W14"
  ],
  "visibility": "public",
  "status": "published",
  "revision": 4,
  "sourceRevision": 4,
  "owner": "@mangue-dev",
  "updatedAt": "2026-10-09",
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
      "app/api/me/saved-views/route.ts",
      "app/api/views/[id]/share/route.ts",
      "app/share/[token]/page.tsx",
      "content/knowledge/feedback.md",
      "lib/server/view-shares.ts",
      "lib/public-board-projection.ts"
    ]
  },
  "review": {
    "revision": 4,
    "fact": "agent:/root/german_spanish_review (structural consolidation review; prior procedural evidence retained; no operational rerun)",
    "language": "agent:/root/german_spanish_review (es title, summary, lead and heading review; retained body comparison)",
    "date": "2026-10-09"
  },
  "related": [
    "navigation",
    "pages",
    "permissions-and-public-links"
  ],
  "aliases": [
    "views-and-filters",
    "share-a-view"
  ],
  "tags": [
    "Guardar una vista de tu trabajo",
    "Compartir y revocar una vista de solo lectura"
  ],
  "figures": [
    {
      "id": "views-and-filters-steps",
      "kind": "screenshot",
      "src": "/documentation/es/work-view-filters.png",
      "alt": "Filtros manuales de una vista y menú de ordenación.",
      "caption": "Filtra por propiedades de las incidencias o elige un orden. El campo de IA es opcional para estos controles manuales.",
      "revision": 4,
      "reviewed": true,
      "capturedAt": "2026-10-09",
      "viewport": [
        288,
        433
      ],
      "theme": "light",
      "padding": 24
    },
    {
      "id": "share-a-view-steps",
      "kind": "screenshot",
      "src": "/documentation/es/work-share-view.png",
      "alt": "Diálogo para compartir una vista con acceso privado seleccionado.",
      "caption": "El acceso privado, protegido por contraseña y público son opciones distintas. La vista permanece privada en esta captura.",
      "revision": 4,
      "reviewed": true,
      "capturedAt": "2026-10-09",
      "viewport": [
        496,
        230
      ],
      "theme": "light",
      "padding": 24
    }
  ],
  "requiredFigures": [
    "views-and-filters-steps",
    "share-a-view-steps"
  ]
}
---

Las vistas muestran el trabajo seleccionado mediante filtros y ordenación. Los siguientes apartados explican cómo guardarlas y compartir públicamente las vistas de proyecto compatibles. Las vistas globales que abarcan varios proyectos no se pueden compartir.

## Guardar una vista de tu trabajo {#views-and-filters}

Empieza desde un tablero de proyecto o una superficie personal de incidencias entre proyectos. Utiliza sus filtros y controles de ordenación y visualización para elegir el trabajo que necesitas. Comprueba el alcance antes de guardar: una vista personal y una de proyecto no tienen el mismo límite de acceso.

Filtra por propiedades admitidas, como estado, responsable, prioridad, categorías u objetivo. Ordena el resultado para que la siguiente acción sea clara. En kanban, las incidencias siguen agrupadas por estado; cambiar una vista no modifica su estado ni asignación.

Guarda la vista con un nombre que describa su propósito, selecciónala de nuevo desde la navegación y verifica sus filtros. Edítala o retírala cuando cambie su propósito. Compartir una vista es una publicación aparte con sus propias reglas de permisos y revocación.

![Filtros manuales de una vista y menú de ordenación.](/documentation/es/work-view-filters.png)

### Resolver resultados vacíos o inesperados {#view-recovery}

Comprueba todos los filtros, el proyecto activo y tu pertenencia cuando falten incidencias esperadas. Quita los filtros restrictivos antes de suponer que se han eliminado datos. Después de editar una incidencia, es normal que pueda salir de una vista filtrada. Busca su identificador o utiliza un tablero de proyecto sin filtros para examinar los valores guardados.

Una vista guardada no es una copia de sus incidencias. Eliminarla retira su configuración, mientras que eliminar incidencias seleccionadas modifica el trabajo subyacente del proyecto.

## Compartir y revocar una vista de solo lectura {#share-a-view}

Abre el menú de una vista compatible en un tablero del proyecto y elige la acción para compartirla. Necesitas acceso al proyecto; una vista personal dentro del proyecto solo puede compartirla su propio usuario. Las vistas globales entre proyectos no se pueden compartir. Revisa los filtros y el contenido visible antes de publicar. Elige un enlace público secreto o protección por contraseña cuando se ofrezcan; la contraseña debe tener al menos ocho caracteres. Copia el enlace generado solo después de que el cambio se guarde correctamente.

Abre el enlace en una sesión de navegador aparte sin tu cuenta. Comprueba el subconjunto de incidencias, los campos y el contenido enlazado que puede ver un visitante. El enlace público concede acceso de solo lectura a la vista, no pertenencia ni permisos de edición en el proyecto.

Las tarjetas compartidas muestran sus títulos, descripciones y propiedades visibles, incluidos nombres de responsables, categorías, nombres de objetivos, fechas límite, recurrencia y enlaces a plataformas Git remotas. La proyección pública excluye el contenido de los planes de implementación y los correos de los miembros. Las etiquetas de incidencias principales y relaciones pueden mostrar identificadores de incidencias del proyecto que quedan fuera del filtro de la vista. Revisa esas descripciones, nombres e identificadores además de las columnas visibles; ocultar una propiedad de tarjeta no es una herramienta general para censurar contenido sensible.

![Diálogo para compartir una vista con acceso privado seleccionado.](/documentation/es/work-share-view.png)

### Revocar y comprobar {#revoke-view}

Vuelve a los controles de uso compartido y cambia la vista a privada para revocar la publicación. Abre otra vez el enlace antiguo sin identificarte y comprueba que se deniega el acceso. La revocación no puede recuperar copias o capturas ya guardadas por un visitante.

Los enlaces secretos de vistas utilizan la ruta de publicación de enlaces privados y mantienen noindex. Esta política limita su aparición en buscadores, pero no es una contraseña. Mantén el enlace privado si contiene información sensible y utiliza protección por contraseña cuando corresponda. No confundas una vista compartida de un usuario con la documentación oficial indexada.

Si el resultado anónimo difiere de lo esperado, revisa la vista guardada y la configuración antes de reenviar el enlace. Comprueba de nuevo el alcance después de cambiar filtros o contenidos enlazados.

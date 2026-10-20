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
  "revision": 9,
  "sourceRevision": 9,
  "owner": "@mangue-dev",
  "updatedAt": "2026-10-20",
  "compatibility": {
    "version": "0.11.1 candidate (89ebb59a5); MIN-693 project roles; MIN-736 closed columns hidden by default; MIN-743 destructive-action confirmations",
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
      "app/api/views/[id]/share/route.ts",
      "app/share/[token]/page.tsx",
      "content/knowledge/feedback.md",
      "lib/server/view-shares.ts",
      "lib/public-board-projection.ts",
      "docs/security/project-roles.md",
      "lib/project-roles.ts",
      "components/share-view-dialog.tsx"
    ]
  },
  "review": {
    "revision": 9,
    "fact": "agent:/root/german_spanish_review (structural consolidation review; prior procedural evidence retained; no operational rerun); agent:/root (visual usefulness, figure framing and preserved procedures; previous operational evidence retained); agent:/root (technical-reference formatting; prior factual evidence retained; no operational rerun); agent:/root (MIN-693 project roles: decision record, permission matrix and source review; no browser walkthrough, no new captures; unchanged evidence retained); agent:/root (MIN-736 default status columns: source and unit-test review of lib/view-filter.ts and the board status filter; no browser walkthrough, no new captures); agent:/root (MIN-743 destructive-action confirmations: source review of the confirmation dialogs for stopping view sharing; no browser walkthrough, no new captures; unchanged evidence retained)",
    "language": "agent:/root/german_spanish_review (es title, summary, lead and heading review; retained body comparison); agent:/root/editorial_de_es (editorial clarity pass); agent:/root (figure removals and captions); agent:/root (inline-code syntax and unchanged-text review); agent:/root/min693_es with agent:/root (es MIN-693 translation of the changed passages, localized labels and retained-meaning review; agent review, not human acceptance); agent:/root (es MIN-736 added sentences with catalog status labels; agent review, not human acceptance); agent:/root (es MIN-743 confirmation clauses with catalog UI labels; retained-meaning self-review; agent review, not human acceptance)",
    "date": "2026-10-20"
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
      "revision": 9,
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
      "revision": 9,
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

Una vista guarda los filtros y la presentación de las incidencias sin copiarlas ni modificarlas. Configura primero la vista para tu trabajo. Compartir una vista de proyecto compatible es un paso separado que ofrece a los visitantes acceso de solo lectura al contenido publicado. Las vistas globales que abarcan varios proyectos no se pueden compartir.

## Guardar una vista de tu trabajo {#views-and-filters}

Empieza desde un tablero de proyecto o una superficie personal de incidencias entre proyectos. Utiliza sus filtros y controles de ordenación y visualización para elegir el trabajo que necesitas. Comprueba el alcance antes de guardar: una vista personal y una de proyecto no tienen el mismo límite de acceso.

Filtra por propiedades admitidas, como estado, responsable, prioridad, categorías u objetivo. Ordena el resultado para que la siguiente acción sea clara. En kanban, las incidencias siguen agrupadas por estado; cambiar una vista no modifica su estado ni asignación. Sin un filtro de estado propio, un tablero muestra solo **Registro**, **Pendiente**, **En curso** y **En examen**. Selecciona **Hecho** o **Cancelado** en el filtro **Estado** para mostrar esas columnas; una vista conserva el filtro de estado que guardes con ella.

Guarda la vista con un nombre que describa su propósito, selecciónala de nuevo desde la navegación y verifica sus filtros. Edítala o retírala cuando cambie su propósito. Compartir una vista es una publicación aparte con sus propias reglas de permisos y revocación.

![Filtros manuales de una vista y menú de ordenación.](/documentation/es/work-view-filters.png)

### Resolver resultados vacíos o inesperados {#view-recovery}

Comprueba todos los filtros, el proyecto activo y tu pertenencia cuando falten incidencias esperadas. Quita los filtros restrictivos antes de suponer que se han eliminado datos. Después de editar una incidencia, es normal que pueda salir de una vista filtrada. Busca su identificador, o selecciona **Hecho** y **Cancelado** en el filtro **Estado** de un tablero de proyecto sin otros filtros, para examinar los valores guardados.

Una vista guardada no es una copia de sus incidencias. Eliminarla retira su configuración, mientras que eliminar incidencias seleccionadas modifica el trabajo subyacente del proyecto.

## Compartir y revocar una vista de solo lectura {#share-a-view}

Abre el menú de una vista compatible en un tablero del proyecto y elige la acción para compartirla. Debes ser el propietario o un Miembro; los lectores conservan sus vistas personales, pero no pueden compartir vistas. Una vista personal dentro del proyecto solo puede compartirla su propio usuario. Las vistas globales entre proyectos no se pueden compartir. Revisa los filtros y el contenido visible antes de publicar. Elige un enlace público secreto o protección por contraseña cuando se ofrezcan; la contraseña debe tener al menos ocho caracteres. Copia el enlace generado solo después de que el cambio se guarde correctamente.

Abre el enlace en una sesión de navegador aparte sin tu cuenta. Comprueba el subconjunto de incidencias, los campos y el contenido enlazado que puede ver un visitante. El enlace público concede acceso de solo lectura a la vista, no pertenencia ni permisos de edición en el proyecto.

Las tarjetas compartidas muestran sus títulos, descripciones y propiedades visibles, incluidos nombres de responsables, categorías, nombres de objetivos, fechas límite, recurrencia y enlaces a plataformas Git remotas. La proyección pública excluye el contenido de los planes de implementación y los correos de los miembros. Las etiquetas de incidencias principales y relaciones pueden mostrar identificadores de incidencias del proyecto que quedan fuera del filtro de la vista. Revisa esas descripciones, nombres e identificadores además de las columnas visibles; ocultar una propiedad de tarjeta no es una herramienta general para censurar contenido sensible.

![Diálogo para compartir una vista con acceso privado seleccionado.](/documentation/es/work-share-view.png)

### Revocar y comprobar {#revoke-view}

Vuelve a los controles de uso compartido y cambia la vista a privada para revocar la publicación; luego confirma con **Dejar de compartir**. Volver a compartir crea un enlace nuevo. Abre otra vez el enlace antiguo sin identificarte y comprueba que se deniega el acceso. La revocación no puede recuperar copias o capturas ya guardadas por un visitante.

Los enlaces secretos de vistas utilizan la ruta de publicación de enlaces privados y mantienen `noindex`. Esta política limita su aparición en buscadores, pero no es una contraseña. Mantén el enlace privado si contiene información sensible y utiliza protección por contraseña cuando corresponda. No confundas una vista compartida de un usuario con la documentación oficial indexada.

Si el resultado anónimo difiere de lo esperado, revisa la vista guardada y la configuración antes de reenviar el enlace. Comprueba de nuevo el alcance después de cambiar filtros o contenidos enlazados.

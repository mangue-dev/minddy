---
{
  "id": "share-a-view",
  "locale": "es",
  "title": "Compartir y revocar una vista de solo lectura",
  "summary": "Publica el subconjunto previsto de incidencias sin dar al visitante pertenencia al proyecto.",
  "topic": "Planificar y encontrar trabajo",
  "type": "guide",
  "audiences": [
    "member"
  ],
  "workflows": [
    "W14"
  ],
  "visibility": "public",
  "status": "published",
  "revision": 2,
  "sourceRevision": 2,
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
      "app/api/views/[id]/share/route.ts",
      "app/share/[token]/page.tsx",
      "content/knowledge/feedback.md",
      "lib/server/view-shares.ts",
      "components/board-toolbar.tsx",
      "lib/public-board-projection.ts"
    ]
  },
  "review": {
    "revision": 2,
    "fact": "2026-10-08",
    "language": "2026-10-08",
    "date": "2026-10-08"
  },
  "related": [
    "views-and-filters",
    "publish-a-page",
    "permissions-and-public-links"
  ],
  "aliases": [],
  "tags": [],
  "figures": [
    {
      "id": "share-a-view-steps",
      "kind": "screenshot",
      "src": "/documentation/es/work-share-view.png",
      "alt": "Diálogo para compartir una vista con acceso privado seleccionado.",
      "caption": "El acceso privado, protegido por contraseña y público son opciones distintas. La vista permanece privada en esta captura.",
      "revision": 2,
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
    "share-a-view-steps"
  ]
}
---

## Publicar la vista {#share-a-view}

Abre el menú de una vista compatible en un tablero del proyecto y elige la acción para compartirla. Necesitas acceso al proyecto; una vista personal dentro del proyecto solo puede compartirla su propio usuario. Las vistas globales entre proyectos no se pueden compartir. Revisa los filtros y el contenido visible antes de publicar. Elige un enlace público secreto o protección por contraseña cuando se ofrezcan; la contraseña debe tener al menos ocho caracteres. Copia el enlace generado solo después de que el cambio se guarde correctamente.

Abre el enlace en una sesión de navegador aparte sin tu cuenta. Comprueba el subconjunto de incidencias, los campos y el contenido enlazado que puede ver un visitante. El enlace público concede acceso de solo lectura a la vista, no pertenencia ni permisos de edición en el proyecto.

Las tarjetas compartidas muestran sus títulos, descripciones y propiedades visibles, incluidos nombres de responsables, categorías, nombres de objetivos, fechas límite, recurrencia y enlaces a plataformas Git remotas. La proyección pública excluye el contenido de los planes de implementación y los correos de los miembros. Las etiquetas de incidencias principales y relaciones pueden mostrar identificadores de incidencias del proyecto que quedan fuera del filtro de la vista. Revisa esas descripciones, nombres e identificadores además de las columnas visibles; ocultar una propiedad de tarjeta no es una herramienta general para censurar contenido sensible.

![Diálogo para compartir una vista con acceso privado seleccionado.](/documentation/es/work-share-view.png)

## Revocar y comprobar {#revoke-view}

Vuelve a los controles de uso compartido y cambia la vista a privada para revocar la publicación. Abre otra vez el enlace antiguo sin identificarte y comprueba que se deniega el acceso. La revocación no puede recuperar copias o capturas ya guardadas por un visitante.

Los enlaces secretos de vistas utilizan la ruta de publicación de enlaces privados y mantienen noindex. Esta política limita su aparición en buscadores, pero no es una contraseña. Mantén el enlace privado si contiene información sensible y utiliza protección por contraseña cuando corresponda. No confundas una vista compartida de un usuario con la documentación oficial indexada.

Si el resultado anónimo difiere de lo esperado, revisa la vista guardada y la configuración antes de reenviar el enlace. Comprueba de nuevo el alcance después de cambiar filtros o contenidos enlazados.

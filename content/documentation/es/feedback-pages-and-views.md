---
{
  "id": "feedback-pages-and-views",
  "locale": "es",
  "title": "Añadir páginas y vistas públicas al tablero",
  "summary": "Seleccionar contenido publicado sin exponer nombres o enlaces protegidos.",
  "topic": "Comentarios y solicitudes",
  "type": "guide",
  "audiences": [
    "owner",
    "visitor"
  ],
  "workflows": [
    "F05"
  ],
  "visibility": "public",
  "status": "published",
  "revision": 2,
  "sourceRevision": 1,
  "owner": "@mangue-dev",
  "updatedAt": "2026-10-08",
  "compatibility": {
    "version": "0.11.1 candidate (cd1843e12)",
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
      "components/project-feedback-settings.tsx",
      "components/feedback/feedback-settings-shared.tsx",
      "app/api/projects/[id]/feedback/settings/route.ts",
      "lib/server/feedback/public-nav.ts",
      "content/documentation/reviews/feedback-local-capture-candidates.json"
    ]
  },
  "review": {
    "revision": 2,
    "fact": "2026-10-08",
    "language": "2026-10-08",
    "date": "2026-10-08"
  },
  "related": [],
  "aliases": [],
  "tags": [],
  "figures": [
    {
      "id": "feedback-pages-and-views-workflow",
      "kind": "screenshot",
      "src": "/documentation/es/feedback-pages-and-views-workflow.png",
      "alt": "Guía de feedback publicada y seleccionada en la navegación del tablero, legible sin iniciar sesión.",
      "caption": "Publique una página, active las pestañas de páginas y selecciónela para el tablero. Esta página de demostración se abrió de forma anónima; su URL opaca conserva noindex.",
      "revision": 2,
      "reviewed": true,
      "capturedAt": "2026-10-08",
      "viewport": [
        1100,
        650
      ],
      "theme": "light"
    }
  ],
  "requiredFigures": [
    "feedback-pages-and-views-workflow"
  ]
}
---

## Publicar y seleccionar {#feedback-pages-and-views}

Como propietario del proyecto, publique primero la página prevista o comparta la vista prevista con visibilidad pública. Compruebe que no contenga información privada. Abra la configuración de Feedback, active la familia de páginas o vistas y seleccione cada elemento que deba aparecer. Tanto el control de la familia como la selección individual son necesarios.

La lista de configuración puede incluir elementos protegidos, pero la navegación pública solo incluye los compartidos con nivel público. Seleccionar una página protegida no evita su protección ni muestra su nombre en una pestaña del tablero. Un elemento publicado de otro proyecto no forma parte de las pestañas de este proyecto.


## Verificar y retirar acceso {#visibility}

Abra el tablero sin sesión. Siga las pestañas hacia las páginas y vistas seleccionadas y compruebe sus títulos y contenidos. Cuando está configurada, la navegación se comparte entre el tablero, las vistas públicas y las páginas públicas; una pestaña aislada no se muestra como navegación.

Para retirar una pestaña, deseleccione el elemento o desactive su familia. Eso retira la navegación, no el recurso compartido subyacente. Revoque o cambie el propio recurso compartido para eliminar el acceso por enlace directo. Desactivar el tablero también desactiva su navegación asociada, pero no revoca de forma independiente todos los recursos compartidos de páginas o vistas. Después de cambiar la publicación, compruebe la pestaña del tablero y la URL original del recurso compartido.

![Guía de feedback publicada y seleccionada en la navegación del tablero, legible sin iniciar sesión.](/documentation/es/feedback-pages-and-views-workflow.png)

---
{
  "id": "page-comments-and-collaboration",
  "locale": "es",
  "title": "Discutir una página y resolver conflictos",
  "summary": "Usa hilos de comentarios anclados y distingue la presencia de las ediciones guardadas.",
  "topic": "Páginas y bases de datos",
  "type": "guide",
  "audiences": [
    "member"
  ],
  "workflows": [
    "P03"
  ],
  "visibility": "public",
  "status": "published",
  "revision": 4,
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
      "components/pages/page-comment-popover.tsx",
      "components/pages/page-presence.tsx",
      "components/pages/page-conflict-banner.tsx",
      "lib/pages-merge.ts",
      "components/pages/page-view.tsx"
    ]
  },
  "review": {
    "revision": 4,
    "fact": "2026-10-08",
    "language": "2026-10-08",
    "date": "2026-10-08"
  },
  "related": [
    "page-history",
    "page-editor",
    "notifications-and-inbox"
  ],
  "aliases": [],
  "tags": [],
  "figures": [
    {
      "id": "page-comments-and-collaboration-steps",
      "kind": "screenshot",
      "src": "/documentation/es/page-comments.png",
      "alt": "Actividad de la página con una edición de demostración y el campo de comentario vacío.",
      "caption": "Consulta la actividad y escribe un comentario en el campo. En este ejemplo no se ha enviado ninguno.",
      "revision": 4,
      "reviewed": true,
      "capturedAt": "2026-10-08",
      "viewport": [
        1440,
        600
      ],
      "theme": "light"
    }
  ],
  "requiredFigures": [
    "page-comments-and-collaboration-steps"
  ]
}
---

## Añadir y resolver un hilo {#page-comments-and-collaboration}

Abre una página del proyecto y sus controles de comentarios. Selecciona el contenido relevante al crear un comentario anclado, explica la pregunta o cambio propuesto y utiliza menciones para involucrar a un miembro. Responde en el hilo para mantener la decisión junto a su contexto. Resuélvelo cuando su pregunta se haya atendido realmente.

Los avatares de presencia identifican a las personas que ven la página. No demuestran que el texto sin guardar de otra persona haya llegado al servidor ni que las ediciones simultáneas se fusionen automáticamente. Lee el estado de guardado actual antes de salir.


![Actividad de la página con una edición de demostración y el campo de comentario vacío.](/documentation/es/page-comments.png)

## Recuperarte de un conflicto de guardado {#page-conflict}

Minddy combina las ediciones de distintos bloques de primer nivel del documento cuando puede conservar ambos cambios. No fusiona carácter por carácter las ediciones simultáneas dentro del mismo bloque. Si ambas personas han cambiado ese bloque, el documento conserva la versión remota y un aviso ofrece tu bloque anterior para revisarlo.

Compara el bloque identificado con el documento actual. Elige restaurar tu versión solo si quieres reemplazar ese bloque por ella. Si tu acción en conflicto fue una eliminación, la opción de eliminarlo de nuevo aplica esa eliminación expresamente. Descartar el aviso conserva el documento adoptado y cierra la advertencia; no restaura tu versión. Conserva el texto que quieras recuperar antes de descartar el aviso y utiliza el historial para examinar versiones guardadas si necesitas una recuperación más amplia. Estas opciones afectan al bloque identificado, sin reemplazar a ciegas toda la página.

Un anclaje puede desaparecer tras editar el documento; lee la discusión antes de mover o eliminar el bloque referido. Los comentarios y la actividad son internos al proyecto salvo que el contenido se publique expresamente mediante una vía admitida. Prueba una página publicada para conocer la vista real del visitante, sin suponer que los controles de colaboración del proyecto sean públicos.

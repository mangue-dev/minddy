---
{
  "id": "moderate-feedback",
  "locale": "es",
  "title": "Revisar feedback en privado y responder públicamente",
  "summary": "Procesar solicitudes sin exponer notas ni reescribir palabras de visitantes.",
  "topic": "Comentarios y solicitudes",
  "type": "guide",
  "audiences": [
    "owner",
    "member"
  ],
  "workflows": [
    "F03"
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
      "components/feedback/feedback-team-page.tsx",
      "lib/server/feedback/posts.ts",
      "lib/server/feedback/comment-guard.ts",
      "app/api/projects/[id]/feedback/[postId]/comments/route.ts",
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
      "id": "moderate-feedback-workflow",
      "kind": "screenshot",
      "src": "/documentation/es/moderate-feedback-workflow.png",
      "alt": "Detalle de una solicitud de feedback con una respuesta pública del equipo y una nota interna.",
      "caption": "La etiqueta Público identifica la respuesta visible para los visitantes; la nota interna queda en el equipo. No se muestra ningún resultado de moderación con IA.",
      "revision": 2,
      "reviewed": true,
      "capturedAt": "2026-10-08",
      "viewport": [
        1440,
        1100
      ],
      "theme": "light"
    }
  ],
  "requiredFigures": [
    "moderate-feedback-workflow"
  ]
}
---

## Revisar una solicitud {#moderate-feedback}

Los miembros abren Feedback en el proyecto y seleccionan una solicitud de la cola de revisión o la lista. Lea el envío original, la elección pública o privada, el estado de revisión y las sugerencias de moderación o duplicados. Puede aclarar el título y el cuerpo canónicos sin perder los textos originales enviados. Asigne categorías y un estado público adecuado; el spam nunca aparece en el tablero público. Una solicitud privada sigue siendo distinta de una solicitud pública que solo está pendiente.

La traducción opcional aparece junto al texto original para el equipo; el tablero público conserva el feedback tal como se escribió. Compruebe las clasificaciones de IA antes de confiar en ellas. Si una solicitud está vinculada a una incidencia, su estado lo controla esa incidencia y no puede editarse de forma independiente.


## Notas y respuestas públicas {#responses}

Elija la discusión interna para las notas del equipo. Las respuestas públicas son visibles para los visitantes: compruebe la visibilidad antes de enviar. Las respuestas heredan la visibilidad del hilo; elegir el modo interno en el campo de composición no hace privada una respuesta dentro de un hilo público. Las respuestas públicas de Numo requieren una petición expresa; mencionarlo en un comentario público no provoca una respuesta automática.

Los miembros pueden eliminar comentarios públicos para moderarlos. Solo el autor puede editarlos, y el equipo nunca reescribe las palabras de los visitantes. Los comentarios internos conservan las reglas que reservan esas acciones al autor. Tras responder públicamente o moderar, compruebe el tablero sin sesión para confirmar la visibilidad prevista.

![Detalle de una solicitud de feedback con una respuesta pública del equipo y una nota interna.](/documentation/es/moderate-feedback-workflow.png)

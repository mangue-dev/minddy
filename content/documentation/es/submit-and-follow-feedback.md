---
{
  "id": "submit-and-follow-feedback",
  "locale": "es",
  "title": "Enviar, votar y seguir feedback",
  "summary": "Identificarse, elegir visibilidad y encontrar solicitudes y votos propios.",
  "topic": "Comentarios y solicitudes",
  "type": "guide",
  "audiences": [
    "visitor"
  ],
  "workflows": [
    "F02"
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
      "app/f/[token]/feedback-auth.tsx",
      "app/f/[token]/actions.ts",
      "app/f/[token]/me/page.tsx",
      "lib/server/feedback/otp.ts",
      "lib/feedback/types.ts",
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
      "id": "submit-and-follow-feedback-workflow",
      "kind": "screenshot",
      "src": "/documentation/es/submit-and-follow-feedback-workflow.png",
      "alt": "Formulario de una solicitud de feedback con título, descripción y visibilidad pública activada.",
      "caption": "Un visitante identificado envía una solicitud y elige su visibilidad. El ejemplo se envió realmente con la revisión automática desactivada.",
      "revision": 2,
      "reviewed": true,
      "capturedAt": "2026-10-08",
      "viewport": [
        1365,
        1000
      ],
      "theme": "light"
    }
  ],
  "requiredFigures": [
    "submit-and-follow-feedback-workflow"
  ]
}
---

## Identificarse y enviar {#submit-and-follow-feedback}

Abra la URL pública del tablero. Puede leer solicitudes públicas sin una cuenta Minddy. Para enviar, votar o comentar, identifíquese mediante el código por email del tablero o el enlace SSO del producto. La entrega del código depende del servicio de correo de la instancia. El código dura diez minutos y permite cinco intentos; espere al menos sesenta segundos antes de pedir otro. Nunca comparta el código.

Busque solicitudes existentes antes de publicar. Escriba un título concreto y describa la necesidad y su contexto. El título admite 200 caracteres y el cuerpo 10.000. La opción pública está seleccionada por defecto; desmárquela para enviar la solicitud de forma privada al equipo. Revise el texto para eliminar secretos antes del envío. La moderación opcional puede mantener la solicitud pendiente antes de que aparezca públicamente.


## Votar, comentar y seguir {#follow}

Vote por una solicitud existente en lugar de duplicarla. Cada identidad tiene un voto por solicitud. Comentar requiere identificación y que los comentarios públicos estén habilitados; un comentario público admite 5.000 caracteres. Puede eliminar su propio comentario y el equipo puede moderar los comentarios públicos.

Abra Mis sugerencias para encontrar sus solicitudes y votos según lo que permita su identidad actual. Lea allí, o en la solicitud, el estado público y las respuestas del equipo. Las notas internas del equipo no son respuestas públicas. Si el SSO ha caducado, vuelva mediante un nuevo enlace del producto; cambiar de navegador o identidad puede cambiar su lista personal.

![Formulario de una solicitud de feedback con título, descripción y visibilidad pública activada.](/documentation/es/submit-and-follow-feedback-workflow.png)

---
{
  "id": "publish-a-feedback-board",
  "locale": "es",
  "title": "Publicar un tablero de feedback",
  "summary": "Activar visitantes y configurar identidad, presentación y revisión como propietario.",
  "topic": "Comentarios y solicitudes",
  "type": "guide",
  "audiences": [
    "owner"
  ],
  "workflows": [
    "F01"
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
      "content/knowledge/feedback.md",
      "components/project-feedback-settings.tsx",
      "app/api/projects/[id]/feedback/settings/route.ts",
      "lib/server/feedback/posts.ts",
      "content/documentation/reviews/feedback-local-capture-candidates.json"
    ]
  },
  "review": {
    "revision": 2,
    "fact": "2026-10-08",
    "language": "2026-10-08",
    "date": "2026-10-08"
  },
  "related": [
    "submit-and-follow-feedback",
    "moderate-feedback",
    "feedback-to-issue",
    "feedback-pages-and-views",
    "feedback-ingestion-and-sso"
  ],
  "aliases": [
    "feedback"
  ],
  "tags": [],
  "figures": [
    {
      "id": "publish-a-feedback-board-workflow",
      "kind": "screenshot",
      "src": "/documentation/es/publish-a-feedback-board-workflow.png",
      "alt": "Tablero público de feedback activado, con identidad SSO local configurada y URL oculta.",
      "caption": "El propietario activa el tablero y elige cómo se identifican los visitantes. Este ejemplo usa un firmante SSO local; la URL y el secreto de firma están ocultos.",
      "revision": 2,
      "reviewed": true,
      "capturedAt": "2026-10-08",
      "viewport": [
        1440,
        1150
      ],
      "theme": "light"
    }
  ],
  "requiredFigures": [
    "publish-a-feedback-board-workflow"
  ]
}
---

## Configurar y abrir {#publish-a-feedback-board}

Como propietario, abra Feedback en la configuración del proyecto. Complete la preparación si todavía no existe un tablero y active el canal del tablero público. Copie su URL pública y ábrala en un navegador sin sesión para comprobar la vista de los visitantes. Los miembros pueden consultar la configuración, pero no cambiar la publicación, renovar tokens ni gestionar el secreto SSO.

Elija si los visitantes se identifican mediante un código por email o el SSO configurado. Configure los comentarios públicos, la visualización de categorías y las pestañas de páginas o vistas públicas seleccionadas. Revise los datos visibles antes de distribuir la URL. Los visitantes pueden leer sin identificarse; enviar solicitudes, votar y comentar requiere una identidad del tablero. La representación pública no muestra el email ni el nombre real del visitante, aunque el equipo puede gestionar en privado sus solicitudes identificadas.


## Separar publicación e ingestión {#channels}

Desactivar el tablero deja sus páginas fuera del alcance de los visitantes. La recepción de servidor a servidor utiliza una clave de integración de feedback independiente y puede continuar sin tablero público. La elección de visibilidad de una solicitud, su estado de revisión y su estado de spam también determinan si aparece: activar el tablero no publica por sí solo todas las solicitudes.

La revisión opcional de Numo se aplica al feedback enviado y depende de la configuración del proyecto y la instancia, los proveedores y el presupuesto del propietario. Si está activada, las solicitudes esperan la revisión antes de publicarse; si está desactivada, no esperan una revisión que no va a realizarse. Compruebe la cola después de enviar una solicitud de demostración. Numo solo envía respuestas públicas cuando se le solicita expresamente.

![Tablero público de feedback activado, con identidad SSO local configurada y URL oculta.](/documentation/es/publish-a-feedback-board-workflow.png)

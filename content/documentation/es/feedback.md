---
{
  "id": "feedback",
  "locale": "es",
  "title": "Sugerencias",
  "summary": "Publique un tablero de sugerencias, siga las solicitudes, modere las aportaciones y vincule las solicitudes aceptadas al trabajo del proyecto.",
  "topic": "Comentarios y solicitudes",
  "type": "guide",
  "audiences": [
    "owner",
    "visitor",
    "member"
  ],
  "workflows": [
    "F01",
    "F02",
    "F03",
    "F04",
    "F05"
  ],
  "visibility": "public",
  "status": "published",
  "revision": 3,
  "sourceRevision": 3,
  "owner": "@mangue-dev",
  "updatedAt": "2026-10-09",
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
      "content/documentation/reviews/feedback-local-capture-candidates.json",
      "app/f/[token]/feedback-auth.tsx",
      "app/f/[token]/actions.ts",
      "app/f/[token]/me/page.tsx",
      "lib/server/feedback/otp.ts",
      "lib/feedback/types.ts",
      "components/feedback/feedback-team-page.tsx",
      "lib/server/feedback/comment-guard.ts",
      "app/api/projects/[id]/feedback/[postId]/comments/route.ts",
      "app/api/projects/[id]/feedback/[postId]/promote/route.ts",
      "app/api/projects/[id]/feedback/[postId]/link/route.ts",
      "lib/server/feedback/merge.ts",
      "lib/server/feedback/status-sync.ts",
      "lib/server/feedback/notify.ts",
      "components/feedback/feedback-settings-shared.tsx",
      "lib/server/feedback/public-nav.ts"
    ]
  },
  "review": {
    "revision": 3,
    "fact": "agent:/root/german_spanish_review (structural consolidation review; prior procedural evidence retained; no operational rerun)",
    "language": "agent:/root/german_spanish_review (es title, summary, lead and heading review; retained body comparison)",
    "date": "2026-10-09"
  },
  "related": [
    "api-and-webhooks"
  ],
  "aliases": [
    "publish-a-feedback-board",
    "submit-and-follow-feedback",
    "moderate-feedback",
    "feedback-to-issue",
    "feedback-pages-and-views"
  ],
  "tags": [
    "Publicar un tablero de feedback",
    "Enviar, votar y seguir feedback",
    "Revisar feedback en privado y responder públicamente",
    "Fusionar feedback y vincularlo a entregas",
    "Añadir páginas y vistas públicas al tablero"
  ],
  "figures": [
    {
      "id": "publish-a-feedback-board-workflow",
      "kind": "screenshot",
      "src": "/documentation/es/publish-a-feedback-board-workflow.png",
      "alt": "Tablero público de feedback activado, con identidad SSO local configurada y URL oculta.",
      "caption": "El propietario activa el tablero y elige cómo se identifican los visitantes. Este ejemplo usa un firmante SSO local; la URL y el secreto de firma están ocultos.",
      "revision": 3,
      "reviewed": true,
      "capturedAt": "2026-10-08",
      "viewport": [
        1440,
        1150
      ],
      "theme": "light"
    },
    {
      "id": "submit-and-follow-feedback-workflow",
      "kind": "screenshot",
      "src": "/documentation/es/submit-and-follow-feedback-workflow.png",
      "alt": "Formulario de una solicitud de feedback con título, descripción y visibilidad pública activada.",
      "caption": "Un visitante identificado envía una solicitud y elige su visibilidad. El ejemplo se envió realmente con la revisión automática desactivada.",
      "revision": 3,
      "reviewed": true,
      "capturedAt": "2026-10-08",
      "viewport": [
        1365,
        1000
      ],
      "theme": "light"
    },
    {
      "id": "moderate-feedback-workflow",
      "kind": "screenshot",
      "src": "/documentation/es/moderate-feedback-workflow.png",
      "alt": "Detalle de una solicitud de feedback con una respuesta pública del equipo y una nota interna.",
      "caption": "La etiqueta Público identifica la respuesta visible para los visitantes; la nota interna queda en el equipo. No se muestra ningún resultado de moderación con IA.",
      "revision": 3,
      "reviewed": true,
      "capturedAt": "2026-10-08",
      "viewport": [
        1440,
        1100
      ],
      "theme": "light"
    },
    {
      "id": "feedback-to-issue-workflow",
      "kind": "screenshot",
      "src": "/documentation/es/feedback-to-issue-workflow.png",
      "alt": "Solicitud de feedback vinculada a una incidencia recién creada, con estado Planeado.",
      "caption": "La promoción de este ejemplo creó una incidencia vinculada en estado Pendiente. El estado público de la solicitud de feedback cambió automáticamente a Planeado.",
      "revision": 3,
      "reviewed": true,
      "capturedAt": "2026-10-08",
      "viewport": [
        1440,
        1100
      ],
      "theme": "light"
    },
    {
      "id": "feedback-pages-and-views-workflow",
      "kind": "screenshot",
      "src": "/documentation/es/feedback-pages-and-views-workflow.png",
      "alt": "Guía de feedback publicada y seleccionada en la navegación del tablero, legible sin iniciar sesión.",
      "caption": "Publique una página, active las pestañas de páginas y selecciónela para el tablero. Esta página de demostración se abrió de forma anónima; su URL opaca conserva noindex.",
      "revision": 3,
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
    "publish-a-feedback-board-workflow",
    "submit-and-follow-feedback-workflow",
    "moderate-feedback-workflow",
    "feedback-to-issue-workflow",
    "feedback-pages-and-views-workflow"
  ]
}
---

El tablero de sugerencias conecta las solicitudes de los visitantes con su gestión interna en el proyecto. Los siguientes apartados explican la publicación por el propietario, el envío y seguimiento por los visitantes, la moderación y vinculación con el trabajo por los miembros, y la selección de páginas y vistas públicas.

## Publicar un tablero de feedback {#publish-a-feedback-board}

Como propietario, abra Feedback en la configuración del proyecto. Complete la preparación si todavía no existe un tablero y active el canal del tablero público. Copie su URL pública y ábrala en un navegador sin sesión para comprobar la vista de los visitantes. Los miembros pueden consultar la configuración, pero no cambiar la publicación, renovar tokens ni gestionar el secreto SSO.

Elija si los visitantes se identifican mediante un código por email o el SSO configurado. Configure los comentarios públicos, la visualización de categorías y las pestañas de páginas o vistas públicas seleccionadas. Revise los datos visibles antes de distribuir la URL. Los visitantes pueden leer sin identificarse; enviar solicitudes, votar y comentar requiere una identidad del tablero. La representación pública no muestra el email ni el nombre real del visitante, aunque el equipo puede gestionar en privado sus solicitudes identificadas.

### Separar publicación e ingestión {#channels}

Desactivar el tablero deja sus páginas fuera del alcance de los visitantes. La recepción de servidor a servidor utiliza una clave de integración de feedback independiente y puede continuar sin tablero público. La elección de visibilidad de una solicitud, su estado de revisión y su estado de spam también determinan si aparece: activar el tablero no publica por sí solo todas las solicitudes.

La revisión opcional de Numo se aplica al feedback enviado y depende de la configuración del proyecto y la instancia, los proveedores y el presupuesto del propietario. Si está activada, las solicitudes esperan la revisión antes de publicarse; si está desactivada, no esperan una revisión que no va a realizarse. Compruebe la cola después de enviar una solicitud de demostración. Numo solo envía respuestas públicas cuando se le solicita expresamente.

![Tablero público de feedback activado, con identidad SSO local configurada y URL oculta.](/documentation/es/publish-a-feedback-board-workflow.png)

## Enviar, votar y seguir feedback {#submit-and-follow-feedback}

Abra la URL pública del tablero. Puede leer solicitudes públicas sin una cuenta Minddy. Para enviar, votar o comentar, identifíquese mediante el código por email del tablero o el enlace SSO del producto. La entrega del código depende del servicio de correo de la instancia. El código dura diez minutos y permite cinco intentos; espere al menos sesenta segundos antes de pedir otro. Nunca comparta el código.

Busque solicitudes existentes antes de publicar. Escriba un título concreto y describa la necesidad y su contexto. El título admite 200 caracteres y el cuerpo 10.000. La opción pública está seleccionada por defecto; desmárquela para enviar la solicitud de forma privada al equipo. Revise el texto para eliminar secretos antes del envío. La moderación opcional puede mantener la solicitud pendiente antes de que aparezca públicamente.

### Votar, comentar y seguir {#follow}

Vote por una solicitud existente en lugar de duplicarla. Cada identidad tiene un voto por solicitud. Comentar requiere identificación y que los comentarios públicos estén habilitados; un comentario público admite 5.000 caracteres. Puede eliminar su propio comentario y el equipo puede moderar los comentarios públicos.

Abra Mis sugerencias para encontrar sus solicitudes y votos según lo que permita su identidad actual. Lea allí, o en la solicitud, el estado público y las respuestas del equipo. Las notas internas del equipo no son respuestas públicas. Si el SSO ha caducado, vuelva mediante un nuevo enlace del producto; cambiar de navegador o identidad puede cambiar su lista personal.

![Formulario de una solicitud de feedback con título, descripción y visibilidad pública activada.](/documentation/es/submit-and-follow-feedback-workflow.png)

## Revisar feedback en privado y responder públicamente {#moderate-feedback}

Los miembros abren Feedback en el proyecto y seleccionan una solicitud de la cola de revisión o la lista. Lea el envío original, la elección pública o privada, el estado de revisión y las sugerencias de moderación o duplicados. Puede aclarar el título y el cuerpo canónicos sin perder los textos originales enviados. Asigne categorías y un estado público adecuado; el spam nunca aparece en el tablero público. Una solicitud privada sigue siendo distinta de una solicitud pública que solo está pendiente.

La traducción opcional aparece junto al texto original para el equipo; el tablero público conserva el feedback tal como se escribió. Compruebe las clasificaciones de IA antes de confiar en ellas. Si una solicitud está vinculada a una incidencia, su estado lo controla esa incidencia y no puede editarse de forma independiente.

### Notas y respuestas públicas {#responses}

Elija la discusión interna para las notas del equipo. Las respuestas públicas son visibles para los visitantes: compruebe la visibilidad antes de enviar. Las respuestas heredan la visibilidad del hilo; elegir el modo interno en el campo de composición no hace privada una respuesta dentro de un hilo público. Las respuestas públicas de Numo requieren una petición expresa; mencionarlo en un comentario público no provoca una respuesta automática.

Los miembros pueden eliminar comentarios públicos para moderarlos. Solo el autor puede editarlos, y el equipo nunca reescribe las palabras de los visitantes. Los comentarios internos conservan las reglas que reservan esas acciones al autor. Tras responder públicamente o moderar, compruebe el tablero sin sesión para confirmar la visibilidad prevista.

![Detalle de una solicitud de feedback con una respuesta pública del equipo y una nota interna.](/documentation/es/moderate-feedback-workflow.png)

## Fusionar feedback y vincularlo a entregas {#feedback-to-issue}

Como miembro del proyecto, abra la solicitud y elija unirla a una solicitud canónica existente del mismo proyecto. Lea primero ambas necesidades: una redacción parecida no demuestra que busquen el mismo resultado. La solicitud actual se convierte en duplicada, los votos se unen por identidad y el duplicado redirige a la solicitud canónica. Revise el evento de unión en la actividad; la acción de deshacer utiliza ese evento. Rechace una sugerencia de unión incorrecta de la IA en lugar de aceptarla solo para vaciar la cola.

### Crear o vincular trabajo {#work}

Convierta la solicitud en una nueva incidencia si el trabajo aún no está registrado. Revise los campos de creación antes de confirmar; sin campos proporcionados, la promoción crea por defecto trabajo en el backlog. Si ya existe una incidencia, use la acción de vincular. Una solicitud ya vinculada no puede volver a convertirse. Desvincular conserva el último estado público y detiene la relación con la incidencia.

El estado vinculado sigue a la incidencia: triage/backlog/duplicate → open; todo → planned; in_progress/in_review → in_progress; done → shipped; canceled → declined. Devolver el trabajo al backlog también reabre el estado de feedback. Tras cambiar un estado, compruebe la incidencia vinculada y la solicitud sin sesión.

Las notificaciones al equipo por nuevo feedback dependen de su origen y de la transición de revisión. No prometa al votante un email automático por cada unión o actualización de incidencia; puede consultar el estado público y las respuestas en Mis sugerencias. El vínculo muestra el avance sin exponer la incidencia privada.

![Solicitud de feedback vinculada a una incidencia recién creada, con estado Planeado.](/documentation/es/feedback-to-issue-workflow.png)

## Añadir páginas y vistas públicas al tablero {#feedback-pages-and-views}

Como propietario del proyecto, publique primero la página prevista o comparta la vista prevista con visibilidad pública. Compruebe que no contenga información privada. Abra la configuración de Feedback, active la familia de páginas o vistas y seleccione cada elemento que deba aparecer. Tanto el control de la familia como la selección individual son necesarios.

La lista de configuración puede incluir elementos protegidos, pero la navegación pública solo incluye los compartidos con nivel público. Seleccionar una página protegida no evita su protección ni muestra su nombre en una pestaña del tablero. Un elemento publicado de otro proyecto no forma parte de las pestañas de este proyecto.

### Verificar y retirar acceso {#visibility}

Abra el tablero sin sesión. Siga las pestañas hacia las páginas y vistas seleccionadas y compruebe sus títulos y contenidos. Cuando está configurada, la navegación se comparte entre el tablero, las vistas públicas y las páginas públicas; una pestaña aislada no se muestra como navegación.

Para retirar una pestaña, deseleccione el elemento o desactive su familia. Eso retira la navegación, no el recurso compartido subyacente. Revoque o cambie el propio recurso compartido para eliminar el acceso por enlace directo. Desactivar el tablero también desactiva su navegación asociada, pero no revoca de forma independiente todos los recursos compartidos de páginas o vistas. Después de cambiar la publicación, compruebe la pestaña del tablero y la URL original del recurso compartido.

![Guía de feedback publicada y seleccionada en la navegación del tablero, legible sin iniciar sesión.](/documentation/es/feedback-pages-and-views-workflow.png)

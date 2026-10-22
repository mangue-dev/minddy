---
{
  "id": "feedback",
  "locale": "es",
  "title": "Sugerencias",
  "summary": "Publica un tablero de sugerencias, sigue las solicitudes, modera las aportaciones y vincula las solicitudes aceptadas al trabajo del proyecto.",
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
  "revision": 16,
  "sourceRevision": 15,
  "owner": "@mangue-dev",
  "updatedAt": "2026-10-22",
  "compatibility": {
    "version": "0.20.0 (MIN-747 release review)",
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
      "lib/server/feedback/public-nav.ts",
      "app/f/[token]/voice/route.ts",
      "app/f/[token]/feedback-board-client.tsx",
      "lib/server/feedback/voice.ts",
      "lib/server/feedback/voice-limits.ts",
      "supabase/migrations/20270106320000_atomic_public_feedback_and_share_limits.sql",
      "docs/security/project-roles.md",
      "lib/project-roles.ts",
      "components/project-integrations.tsx",
      "app/f/[token]/public-comments.tsx"
    ]
  },
  "review": {
    "revision": 16,
    "fact": "agent:/root/min747 (0.20.0 release review: source audit against the v0.11.0..main delta, verified corrections applied; 2 screenshot(s) recaptured on 2026-10-20 from the local candidate and inspected; 2 screenshot(s) without a current capture script keep their earlier capture and evidence; no browser walkthrough of the procedures or operator rehearsal; earlier evidence retained in git history); agent:claude-code (it/es catalog language review: quoted labels aligned on the corrected es catalog; no behavior change, no new captures); agent:claude-code (it/es catalog review recapture of publish-a-feedback-board-workflow on 2026-10-22 from a local candidate of this branch against the preview demo account; images inspected; no form submitted); agent:claude-code (manual figures rebuilt on the Aurora demo, catalog review labels and informal register; figures recaptured on 2026-10-22 from a local candidate against the preview demo account and inspected; no form submitted)",
    "language": "agent:/root/min747 (es translation of the release corrections with catalog UI labels; equivalent meaning self-reviewed; agent review, not human acceptance); agent:claude-code (es label alignment after the full catalog review; self-reviewed; agent review, not human acceptance); agent:claude-code (es manual figures rebuilt on the Aurora demo, catalog review labels and informal register; self-reviewed; agent review, not human acceptance)",
    "date": "2026-10-22"
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
      "alt": "Tablero público de feedback activado, con identidad por código de correo, la acción Activar SSO y URL oculta.",
      "caption": "El propietario activa el tablero y elige cómo se identifican los visitantes. Este tablero de demostración usa la verificación por correo; su URL está oculta.",
      "revision": 16,
      "reviewed": true,
      "capturedAt": "2026-10-22",
      "viewport": [
        816,
        596
      ],
      "theme": "light",
      "padding": 24,
      "deviceScaleFactor": 2
    },
    {
      "id": "submit-and-follow-feedback-workflow",
      "kind": "screenshot",
      "src": "/documentation/es/submit-and-follow-feedback-workflow.png",
      "alt": "Formulario de una solicitud de feedback con título, descripción y visibilidad pública activada.",
      "caption": "Un visitante identificado envía una solicitud y elige su visibilidad. El ejemplo se envió realmente con la revisión automática desactivada.",
      "revision": 16,
      "reviewed": true,
      "capturedAt": "2026-10-22",
      "viewport": [
        624,
        394
      ],
      "theme": "light",
      "padding": 24,
      "deviceScaleFactor": 2
    },
    {
      "id": "feedback-objective-selection",
      "kind": "screenshot",
      "src": "/documentation/es/feedback-objective-selection.png",
      "alt": "Vista previa de los componentes de selección de objetivo para un comentario y una integración, ambos con Docs.",
      "caption": "Selectores de objetivo con datos de demostración. Los nuevos comentarios heredan el ajuste de la integración.",
      "revision": 16,
      "reviewed": true,
      "capturedAt": "2026-10-10",
      "viewport": [
        680,
        301
      ],
      "theme": "light",
      "padding": 24,
      "deviceScaleFactor": 2
    },
    {
      "id": "feedback-pages-and-views-workflow",
      "kind": "screenshot",
      "src": "/documentation/es/feedback-pages-and-views-workflow.png",
      "alt": "Guía de feedback publicada y seleccionada en la navegación del tablero, legible sin iniciar sesión.",
      "caption": "Publica una página, activa las pestañas de páginas y selecciónala para el tablero. Esta página de demostración se abrió de forma anónima; su URL opaca conserva `noindex`.",
      "revision": 16,
      "reviewed": true,
      "capturedAt": "2026-10-22",
      "viewport": [
        1328,
        668
      ],
      "theme": "light",
      "padding": 24,
      "deviceScaleFactor": 2
    }
  ],
  "requiredFigures": [
    "publish-a-feedback-board-workflow",
    "submit-and-follow-feedback-workflow",
    "feedback-objective-selection",
    "feedback-pages-and-views-workflow"
  ]
}
---

Las sugerencias conectan las solicitudes de los visitantes con la revisión y el trabajo del equipo. Los propietarios configuran el tablero público, los visitantes envían y siguen solicitudes, y los miembros las moderan o vinculan a incidencias. Al gestionar el acceso, distingue las respuestas públicas, las notas internas y las páginas o vistas publicadas por separado.

## Publicar un tablero de feedback {#publish-a-feedback-board}

Como propietario, abre Feedback en los ajustes del proyecto. Completa la preparación si todavía no existe un tablero y activa el canal del tablero público. Copia su URL pública y ábrela en un navegador sin sesión para comprobar la vista de los visitantes. Los miembros pueden consultar la configuración, pero no cambiar la publicación, renovar tokens ni gestionar el secreto SSO.

Elige si los visitantes se identifican mediante un código por email o el SSO configurado. Configura los comentarios públicos, la visualización de categorías y las pestañas de páginas o vistas públicas seleccionadas. Revisa los datos visibles antes de distribuir la URL. Los visitantes pueden leer sin identificarse; enviar solicitudes, votar y comentar requiere una identidad del tablero. La representación pública no muestra el email ni el nombre real del visitante, aunque el equipo puede gestionar en privado sus solicitudes identificadas.

### Separar publicación e ingestión {#channels}

Desactivar el tablero deja sus páginas fuera del alcance de los visitantes. La recepción de servidor a servidor utiliza una clave de integración de feedback independiente y puede continuar sin tablero público. La elección de visibilidad de una solicitud, su estado de revisión y su estado de spam también determinan si aparece: activar el tablero no publica por sí solo todas las solicitudes.

El propietario activa o desactiva la **Revisión de Numo** en los ajustes de Sugerencias del proyecto; no hay un interruptor aparte para la instancia. Con la revisión activada, los envíos del tablero público y de las integraciones esperan la revisión antes de publicarse, mientras que el feedback creado por el equipo no queda retenido. Lo que se marca como sensible, como una vulnerabilidad o datos personales, pasa a privado y espera en **Por revisar**. La revisión usa el proveedor de IA de la instancia y el presupuesto de IA del propietario del proyecto: cuando el presupuesto se agota, el feedback espera, visible solo para el equipo, salvo que el propietario active **Publicar sin revisión cuando se agote el presupuesto de IA**. Con la revisión desactivada, el feedback se publica tal como se envió, sin categorías automáticas, filtro de bromas ni control de privacidad. Comprueba la cola después de enviar una solicitud de demostración. Numo solo envía respuestas públicas cuando se le solicita expresamente.

![Tablero público de feedback activado, con identidad por código de correo, la acción Activar SSO y URL oculta.](/documentation/es/publish-a-feedback-board-workflow.png)

## Enviar, votar y seguir feedback {#submit-and-follow-feedback}

Abre la URL pública del tablero. Puedes leer solicitudes públicas sin una cuenta minddy. Para enviar, votar o comentar, identifícate mediante el código por email del tablero o el enlace SSO del producto. La entrega del código depende del servicio de correo de la instancia. El código dura diez minutos y permite cinco intentos; espera al menos sesenta segundos antes de pedir otro. Nunca compartas el código.

Busca solicitudes existentes antes de publicar. Escribe un título concreto y describe la necesidad y su contexto. El título admite 200 caracteres y el cuerpo 10.000. La opción pública está seleccionada por defecto; desmárcala para enviar la solicitud de forma privada al equipo. Revisa el texto para eliminar secretos antes del envío. La moderación opcional puede mantener la solicitud pendiente antes de que aparezca públicamente.

Utiliza el micrófono del formulario de envío para dictar el título y la descripción. Identifícate primero a través del tablero, permite el acceso al micrófono y después detén la grabación. Revisa el texto antes de elegir Enviar. El dictado rellena el borrador; no envía la solicitud. La disponibilidad depende de que la instancia tenga proveedores de transcripción y de IA operativos y del presupuesto de IA del propietario del proyecto; no hay un interruptor aparte de la instancia para la voz. El consumo se factura a ese propietario según sus ajustes de proveedores, en lugar de a la cuenta del visitante.

Las grabaciones del tablero público están limitadas a 10 MiB. La transcripción permite, por tablero y hora, 20 solicitudes por visitante identificado y 40 por dirección IP; la interpretación del borrador tiene un límite independiente de 40 solicitudes por visitante y hora. Estos límites son distintos de los del dictado de la cuenta. Ante un mensaje de límite de solicitudes, espera antes de reintentar; si la voz no está disponible, escribe la solicitud.

### Votar, comentar y seguir {#follow}

Vota por una solicitud existente en lugar de duplicarla. Cada identidad tiene un voto por solicitud, en una solicitud que aún puede leer: una pública o la suya. Comentar requiere identificación y que los comentarios públicos estén habilitados; un comentario público admite 5.000 caracteres. Un hilo largo se abre en sus comentarios más recientes; elige **Mostrar comentarios anteriores** para leer el resto. Puedes eliminar definitivamente tu propio comentario tras confirmarlo, y el equipo puede moderar los comentarios públicos.

Abre Mis sugerencias para encontrar tus solicitudes y votos según lo que permita tu identidad actual. Lee allí, o en la solicitud, el estado público y las respuestas del equipo. Las notas internas del equipo no son respuestas públicas. Si el SSO ha caducado, vuelve mediante un nuevo enlace del producto; cambiar de navegador o identidad puede cambiar tu lista personal.

![Formulario de una solicitud de feedback con título, descripción y visibilidad pública activada.](/documentation/es/submit-and-follow-feedback-workflow.png)

## Revisar feedback en privado y responder públicamente {#moderate-feedback}

Los filtros de la lista combinan estado, objetivo, categorías, autor, origen y estado de revisión; la visibilidad está disponible cuando el tablero público está activado. Varios valores de una propiedad son alternativas; las distintas propiedades se combinan. Restablece los filtros para volver a la lista inicial. La lista muestra hasta 500 solicitudes que coinciden con estos filtros a la vez. Abre el submenú de una propiedad para seleccionar sus valores; el número indica cuántos están seleccionados. En móvil, despliega la sección de la propiedad.

El propietario del proyecto y los Miembros abren Feedback en el proyecto y seleccionan una solicitud de la cola de revisión o la lista. Los lectores pueden leer las solicitudes, pero no moderarlas. Lee el envío original, la elección pública o privada, el estado de revisión y las sugerencias de moderación o duplicados. Puedes aclarar el título y el cuerpo canónicos sin perder los textos originales enviados. Asigna categorías y un estado público adecuado; el spam nunca aparece en el tablero público. Una solicitud privada sigue siendo distinta de una solicitud pública que solo está pendiente.

La traducción opcional aparece junto al texto original para el equipo; el tablero público conserva el feedback tal como se escribió. Comprueba las clasificaciones de IA antes de confiar en ellas. Si una solicitud está vinculada a una incidencia, su estado lo controla esa incidencia y no puede editarse de forma independiente.

### Notas y respuestas públicas {#responses}

Elige la discusión interna para las notas del equipo. Las respuestas públicas son visibles para los visitantes: comprueba la visibilidad antes de enviar. Un lector con **Puede comentar** puede participar en los hilos de discusión internos, pero no puede responder públicamente en el tablero. Las respuestas heredan la visibilidad del hilo; elegir el modo interno en el campo de composición no hace privada una respuesta dentro de un hilo público. Las respuestas públicas de Numo requieren una petición expresa; mencionarlo en un comentario público no provoca una respuesta automática.

Los miembros pueden eliminar comentarios públicos para moderarlos. Solo el autor puede editarlos, y el equipo nunca reescribe las palabras de los visitantes. Los comentarios internos conservan las reglas que reservan esas acciones al autor. Tras responder públicamente o moderar, comprueba el tablero sin sesión para confirmar la visibilidad prevista.

### Elegir un objetivo para un comentario {#feedback-objective}

La lista muestra el objetivo vinculado debajo del autor y las categorías. En las propiedades del objetivo, el número de comentarios cuenta las solicitudes existentes y no fusionadas, incluidas las privadas visibles para el equipo. Selecciona el número para abrir los comentarios filtrados por ese objetivo, con todos los estados.

Como propietario o Miembro, elige **Objetivo** en las propiedades del comentario o al crearlo internamente. Elige **Ninguno** para quitar el vínculo. El objetivo debe pertenecer al mismo proyecto. Esta asociación es interna, no expone objetivos privados en el tablero público y no cuenta para el progreso de los tickets.

El propietario puede elegir un objetivo opcional al crear una integración de comentarios en **Ajustes del proyecto** → **Integraciones**, o cambiarlo después en la línea **Objetivo de las nuevas sugerencias** bajo una integración de comentarios existente. Ese selector también puede crear un objetivo nuevo. Los nuevos envíos de la API heredan ese objetivo, incluso con `analyze: false`. Cambiar el ajuste no mueve comentarios existentes. Si el objetivo está en la papelera, elige uno activo o elimina el ajuste antes del siguiente envío. Numo nunca elige un objetivo al revisar comentarios. Pídele explícitamente que vincule una solicitud o quite su vínculo.

Al convertir el comentario, el nuevo ticket hereda su objetivo y categorías. Puedes cambiarlos en el formulario de creación. Si no se eligió objetivo, el campo queda vacío incluso con Smart Fill activado. Cambiar después el objetivo del comentario no mueve un ticket ya vinculado. Las fusiones requieren que ambas solicitudes tengan el mismo objetivo, incluido que ambas no tengan ninguno. Iguala sus objetivos primero si el equipo decide que describen la misma necesidad.

Un grupo fusionado comparte un único objetivo. Cambiar el objetivo de la solicitud principal también actualiza las solicitudes absorbidas, para que el grupo pueda volver a fusionarse.

![Vista previa de los componentes de selección de objetivo para un comentario y una integración, ambos con Docs.](/documentation/es/feedback-objective-selection.png)

## Fusionar feedback y vincularlo a entregas {#feedback-to-issue}

Como propietario o Miembro, abre la solicitud y elige unirla a una solicitud canónica existente del mismo proyecto. Lee primero ambas necesidades: una redacción parecida no demuestra que busquen el mismo resultado. La solicitud actual se convierte en duplicada, los votos se unen por identidad y el duplicado redirige a la solicitud canónica. Si la solicitud canónica no es pública, el autor del duplicado lo sigue abriendo en modo de solo lectura, y los demás visitantes no obtienen ninguna página. Revisa el evento de unión en la actividad; la acción de deshacer utiliza ese evento. Rechaza una sugerencia de unión incorrecta de la IA en lugar de aceptarla solo para vaciar la cola.

### Crear o vincular trabajo {#work}

Convierte la solicitud en una nueva incidencia si el trabajo aún no está registrado. Revisa los campos de creación antes de confirmar; sin campos proporcionados, la promoción crea por defecto trabajo en el `backlog`. Si ya existe una incidencia, usa la acción de vincular. **Vincular a una incidencia existente** busca entre las incidencias del proyecto, salvo las canceladas y duplicadas. Si describes la necesidad, también aparecen incidencias encontradas [por el sentido](/docs/navigation#search-by-meaning) bajo **Relacionadas por significado**, después de las coincidencias de texto, lo que ayuda cuando la solicitud no usa las palabras de la incidencia. Una solicitud ya vinculada no puede volver a convertirse. Desvincular pide confirmación antes; conserva el último estado público y detiene la relación con la incidencia.

El estado vinculado sigue a la incidencia: `triage`/`backlog`/`duplicate` → `open`; `todo` → `planned`; `in_progress`/`in_review` → `in_progress`; `done` → `shipped`; `canceled` → `declined`. Devolver el trabajo al `backlog` también reabre el estado de feedback. Tras cambiar un estado, comprueba la incidencia vinculada y la solicitud sin sesión.

Las notificaciones al equipo por nuevo feedback dependen de su origen y de la transición de revisión. No prometas al votante un email automático por cada unión o actualización de incidencia; puede consultar el estado público y las respuestas en Mis sugerencias. El vínculo muestra el avance sin exponer la incidencia privada.


## Añadir páginas y vistas públicas al tablero {#feedback-pages-and-views}

Como propietario del proyecto, publica primero la página prevista o comparte la vista prevista con visibilidad pública. Comprueba que no contenga información privada. Abre la configuración de Feedback, activa la familia de páginas o vistas y selecciona cada elemento que deba aparecer. Tanto el control de la familia como la selección individual son necesarios.

La lista de configuración puede incluir elementos protegidos, pero la navegación pública solo incluye los compartidos con nivel público. Seleccionar una página protegida no evita su protección ni muestra su nombre en una pestaña del tablero. Un elemento publicado de otro proyecto no forma parte de las pestañas de este proyecto.

### Verificar y retirar acceso {#visibility}

Abre el tablero sin sesión. Sigue las pestañas hacia las páginas y vistas seleccionadas y comprueba sus títulos y contenidos. Cuando está configurada, la navegación se comparte entre el tablero, las vistas públicas y las páginas públicas; una pestaña aislada no se muestra como navegación.

Para retirar una pestaña, deselecciona el elemento o desactiva su familia. Eso retira la navegación, no el recurso compartido subyacente. Revoca o cambia el propio recurso compartido para eliminar el acceso por enlace directo. Desactivar el tablero también desactiva su navegación asociada, pero no revoca de forma independiente todos los recursos compartidos de páginas o vistas. Después de cambiar la publicación, comprueba la pestaña del tablero y la URL original del recurso compartido.

![Guía de feedback publicada y seleccionada en la navegación del tablero, legible sin iniciar sesión.](/documentation/es/feedback-pages-and-views-workflow.png)

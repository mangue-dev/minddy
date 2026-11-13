---
{
  "id": "notifications-and-inbox",
  "locale": "es",
  "title": "Bandeja de entrada y notificaciones",
  "summary": "Revisa la actividad sin leer y las menciones, y ajusta las preferencias de notificación de tu cuenta.",
  "topic": "Planificar y encontrar trabajo",
  "type": "guide",
  "audiences": [
    "member"
  ],
  "workflows": [
    "W16"
  ],
  "visibility": "public",
  "status": "published",
  "revision": 14,
  "sourceRevision": 14,
  "owner": "@mangue-dev",
  "updatedAt": "2026-11-13",
  "compatibility": {
    "version": "0.30.0 (MIN-794 release review)",
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
      "components/inbox-popover.tsx",
      "components/inbox-content.tsx",
      "components/settings/account-notifications-section.tsx",
      "components/notification-badge.tsx",
      "components/settings/account-settings-page.tsx",
      "lib/server/notifications.ts",
      "lib/server/numo-notes.ts",
      "lib/notification-prefs.ts",
      "components/mobile-navigation.tsx",
      "components/inbox-row.tsx",
      "lib/notification-line.ts",
      "mobile/README.md"
    ]
  },
  "review": {
    "revision": 14,
    "fact": "agent:claude-code (MIN-973: the iOS app among the push delivery channels; checked against components/settings/account-push-devices-section.tsx and mobile/README.md; no figure affected); agent:/root/min747 (0.20.0 release review: source audit against the v0.11.0..main delta, verified corrections applied; 1 screenshot(s) recaptured on 2026-10-20 from the local candidate and inspected; no browser walkthrough of the procedures or operator rehearsal; earlier evidence retained in git history); agent:claude-code (it/es catalog language review: quoted labels aligned on the corrected es catalog; no behavior change, no new captures); agent:claude-code (it/es catalog review recapture of notifications-and-inbox-steps on 2026-10-22 from a local candidate of this branch against the preview demo account; images inspected; no form submitted); agent:claude-code (manual figures rebuilt on the Aurora demo, catalog review labels and informal register; figures recaptured on 2026-10-22 from a local candidate against the preview demo account and inspected; no form submitted); agent:claude-code (0.30.0 release review MIN-794: source audit against v0.20.0..HEAD; corrected the Inbox entry points to include notification search in the command palette, and the preferences section to state that administrators of a self-hosted instance get an unmutable Instance variables notification; no browser walkthrough; figures not reviewed in this pass); agent:claude-code (MIN-914: Numo messages in Inbox, their link targets, recipient rule and Messages from Numo switch, source audit against the change; no browser walkthrough; existing figures checked against the change and kept, not recaptured); agent:claude-code (MIN-924: which routine runs notify the owner, source audit against the change; no browser walkthrough; existing figures checked against the change and kept, not recaptured); agent:claude-code (MIN-907 inbox button in the phone bottom bar with its dot: checked against components/mobile-navigation.tsx and components/app-shell-chrome.tsx; no browser walkthrough; existing figure kept); agent:claude-code (MIN-975: inbox redesign — view picker and More actions menu, actor/sentence/context rows with mention pills, no date groups, invitation buttons with confirmation, swipe actions on phones; source audit against the change; no browser walkthrough; work-inbox.png recaptured on 2026-11-13 from the local candidate (light, six locales, response-only demo notifications, no writes) and inspected)",
    "language": "agent:claude-code (es MIN-973 iOS app sentence, with catalog UI labels, in the locale's register and glossary; self-reviewed; agent review, not human acceptance); agent:/root/min747 (es translation of the release corrections with catalog UI labels; equivalent meaning self-reviewed; agent review, not human acceptance); agent:claude-code (es label alignment after the full catalog review; self-reviewed; agent review, not human acceptance); agent:claude-code (es manual figures rebuilt on the Aurora demo, catalog review labels and informal register; self-reviewed; agent review, not human acceptance); agent:claude-code (es corrected passages with catalog UI labels; self-reviewed; agent review, not human acceptance); agent:claude-code (es MIN-914 passage translated from en with catalog UI labels and the locale register; self-reviewed; agent review, not human acceptance); agent:claude-code (es MIN-924 passage translated from en with catalog UI labels and the locale register; self-reviewed; agent review, not human acceptance); agent:claude-code (es MIN-907 phone inbox entry point, with catalog UI labels, in the locale's register and glossary; self-reviewed; agent review, not human acceptance); agent:claude-code (es MIN-975 passages, figure alt and caption with catalog UI labels, in the locale's register and glossary; self-reviewed; agent review, not human acceptance)",
    "date": "2026-11-13"
  },
  "related": [
    "projects",
    "applications",
    "accounts"
  ],
  "aliases": [],
  "tags": [
    "Seguir notificaciones e invitaciones en la bandeja de entrada"
  ],
  "figures": [
    {
      "id": "notifications-and-inbox-steps",
      "kind": "screenshot",
      "src": "/documentation/es/work-inbox.png",
      "alt": "Bandeja de entrada en la vista Todos con menciones, asignaciones y comentarios de demostración: cada fila nombra quién actuó, la incidencia como píldora y su título.",
      "caption": "Cada fila muestra quién actuó, qué pasó con la incidencia y su título. Las filas leídas aparecen atenuadas; Todos lista las notificaciones leídas y sin leer.",
      "revision": 14,
      "reviewed": true,
      "capturedAt": "2026-11-13",
      "viewport": [
        528,
        648
      ],
      "theme": "light",
      "padding": 24,
      "deviceScaleFactor": 2
    }
  ],
  "requiredFigures": [
    "notifications-and-inbox-steps"
  ]
}
---

## Leer la bandeja de entrada {#notifications-and-inbox}

Abre la bandeja de entrada con su icono en la barra superior, desde su botón en la barra inferior de la pantalla en un teléfono o pulsando G y luego I fuera de un campo de texto. Un contador rojo en el icono suma las notificaciones sin leer y las invitaciones pendientes, y en un teléfono un punto marca su botón; una PWA instalada muestra el mismo número en el icono de la aplicación. La bandeja de entrada se abre en un panel emergente, o en una hoja en un teléfono, y lista las notificaciones de la más reciente a la más antigua, cada una con su hora. En cuanto escribes en la paleta de comandos, también encuentra notificaciones: elegir una abre la bandeja de entrada en la vista que la lista, Sin leer o Todos, y la resalta sin marcarla como leída.

Se abre con la vista Sin leer. El selector de arriba cambia a Todos, que muestra también las notificaciones leídas, o a Menciones, que conserva solo las menciones en comentarios y páginas. Cada fila nombra quién actuó (un miembro, Numo, Smart Assign, un agente MCP, el tablero de sugerencias o la forja), dice qué pasó con la incidencia, la página, la pull request o el proyecto que aparece como píldora, y añade contexto cuando lo hay, como el extracto del comentario o el título de la incidencia. Selecciona una fila para abrir su incidencia, su página o su pull request. Abrir una notificación la marca como leída. En un teléfono, desliza una fila hacia la derecha para marcarla como leída o sin leer, o hacia la izquierda para eliminarla. En un ordenador, al pasar el puntero por una fila aparecen Marcar como leído o Marcar como sin leer, y Marcar todo como leído, en el menú Más acciones junto al selector, quita todos los indicadores de no leído. Marcarla como no leída restaura ese indicador de actividad; no deshace el cambio en la incidencia o página. Una notificación apunta a trabajo accesible; no sustituye su contenido actual.

Numo también puede dejarte un mensaje: un título corto que nombra el elemento del que trata, con una o dos frases de contexto si hace falta, sobre algo que necesita tu atención, escrito por una de tus rutinas o en una conversación en la que le pediste que te avisara más tarde. Lleva el icono de Numo y, al seleccionarlo, abre la incidencia, el objetivo, la página, la pull request o la rutina de la que trata, o el proyecto si no nombra ninguno. Numo solo te escribe estos mensajes a ti, nunca a otros miembros, y no envía el mismo mensaje sobre el mismo elemento más de una vez al día.

Una rutina te avisa por sí sola cuando una ejecución falla, agota su presupuesto o no puede iniciarse. Una ejecución que termina con normalidad solo te llega como mensaje de Numo. Consulta [Rutinas](/docs/scheduled-routines#runs).

Eliminar, que aparece al pasar el puntero por una fila en un ordenador, borra esa notificación tras una confirmación, y Eliminar leídas, en el menú Más acciones, borra todas las notificaciones leídas tras una confirmación. Ambas eliminaciones son definitivas; las notificaciones sin leer se conservan, y la incidencia, la página o la pull request a la que apunta una notificación no se ven afectadas.

Las invitaciones pendientes a proyectos aparecen al principio de las vistas Sin leer y Todos, con los botones Rechazar y Unirse. Cada uno pide una confirmación: comprueba el proyecto y quién te invita antes de responder. Los enlaces antiguos de la bandeja de entrada abren el acceso actual, no una página independiente.

![Bandeja de entrada en la vista Todos con menciones, asignaciones y comentarios de demostración: cada fila nombra quién actuó, la incidencia como píldora y su título.](/documentation/es/work-inbox.png)

## Elegir canales de notificación {#notification-preferences}

Elige Ajustes de la bandeja de entrada en el menú Más acciones de la bandeja de entrada, o abre Ajustes de la cuenta y la pestaña Notificaciones. En Notificaciones de entrada, un interruptor por categoría (Asignaciones, Menciones, Comentarios, Numo, Rutinas, Pull requests, Sugerencias, Páginas y Mensajes de Numo) decide qué llega a tu bandeja de entrada. Desactivar una categoría detiene las futuras notificaciones de ese tipo, incluidos sus avisos push; no elimina las notificaciones que ya recibiste. En una instancia self-hosted, los administradores también reciben una notificación Variables de la instancia cuando otro administrador cambia una variable de la instancia; ningún interruptor la desactiva. Consulta [Editar las variables de la instancia](/docs/instance-administration#instance-variables).

La sección Notificaciones push de la misma pestaña muestra los dispositivos que reciben avisos. La entrega por navegador, PWA, aplicación de iOS o escritorio también requiere registrar el dispositivo y obtener permiso del sistema operativo. Desactivar o quitar un dispositivo detiene los avisos solo en ese dispositivo; tu bandeja de entrada y sus categorías no cambian.

Si una notificación lleva a contenido no disponible, comprueba si cambió la pertenencia al proyecto o se eliminó el objeto. Si faltan notificaciones push, verifica el permiso y registro del dispositivo con la guía correspondiente; la bandeja de entrada sigue siendo útil para consultar la actividad. Nunca envíes cookies de sesión ni contenido privado de notificaciones en capturas de diagnóstico.

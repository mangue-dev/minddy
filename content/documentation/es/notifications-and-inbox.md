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
  "revision": 7,
  "sourceRevision": 7,
  "owner": "@mangue-dev",
  "updatedAt": "2026-10-20",
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
      "content/knowledge/productivity.md",
      "components/inbox-popover.tsx",
      "components/inbox-content.tsx",
      "components/settings/account-notifications-section.tsx",
      "components/notification-badge.tsx",
      "components/settings/account-settings-page.tsx",
      "lib/server/notifications.ts"
    ]
  },
  "review": {
    "revision": 7,
    "fact": "agent:/root/min747 (0.20.0 release review: source audit against the v0.11.0..main delta, verified corrections applied; 1 screenshot(s) recaptured on 2026-10-20 from the local candidate and inspected; no browser walkthrough of the procedures or operator rehearsal; earlier evidence retained in git history)",
    "language": "agent:/root/min747 (es translation of the release corrections with catalog UI labels; equivalent meaning self-reviewed; agent review, not human acceptance)",
    "date": "2026-10-20"
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
      "alt": "Bandeja de entrada con menciones, asignaciones y comentarios de demostración, leídos y no leídos.",
      "caption": "La actividad de ejemplo muestra el autor, el ticket y el estado de lectura. Todos incluye notificaciones leídas y no leídas.",
      "revision": 7,
      "reviewed": true,
      "capturedAt": "2026-10-20",
      "viewport": [
        528,
        648
      ],
      "theme": "light",
      "padding": 24
    }
  ],
  "requiredFigures": [
    "notifications-and-inbox-steps"
  ]
}
---

## Leer la bandeja de entrada {#notifications-and-inbox}

Abre la bandeja de entrada con su icono en la barra superior, desde su fila en la barra lateral en un teléfono o pulsando G y luego I fuera de un campo de texto. Un contador rojo en el icono suma las notificaciones sin leer y las invitaciones pendientes; una PWA instalada muestra el mismo número en el icono de la aplicación. La bandeja de entrada se abre en un panel emergente, o en una hoja en un teléfono, y agrupa las notificaciones en Hoy, Ayer y Anteriormente.

Se abre con el filtro Sin leer. Todos muestra también las notificaciones leídas, y Menciones conserva solo las menciones en comentarios y páginas. Selecciona un elemento para abrir la incidencia, la página o la pull request correspondiente. Abrir una notificación la marca como leída. Su fila también ofrece Marcar como leído o Marcar como sin leer, y Marcar todo como leído, en el encabezado de la bandeja de entrada, quita todos los indicadores de no leído. Marcarla como no leída restaura ese indicador de actividad; no deshace el cambio en la incidencia o página. Una notificación apunta a trabajo accesible; no sustituye su contenido actual.

Eliminar, en una fila, borra esa notificación tras una confirmación, y Eliminar leídas, en el encabezado, borra todas las notificaciones leídas tras una confirmación. Ambas eliminaciones son definitivas; las notificaciones sin leer se conservan, y la incidencia, la página o la pull request a la que apunta una notificación no se ven afectadas.

Las invitaciones pendientes a proyectos aparecen en Invitaciones con los filtros Sin leer y Todos. Acepta o rechaza después de comprobar el proyecto y quién te invita. Los enlaces antiguos de la bandeja de entrada abren el acceso actual, no una página independiente.

![Bandeja de entrada con menciones, asignaciones y comentarios de demostración, leídos y no leídos.](/documentation/es/work-inbox.png)

## Elegir canales de notificación {#notification-preferences}

Elige Ajustes de la caja de entrada en el encabezado de la bandeja de entrada, o abre Configuración de la cuenta y la pestaña Notificaciones. En Notificaciones de entrada, un interruptor por categoría (Asignaciones, Menciones, Comentarios, Numo, Rutinas, Pull requests, Sugerencias y Páginas) decide qué llega a tu bandeja de entrada. Desactivar una categoría detiene las futuras notificaciones de ese tipo, incluidos sus avisos push; no elimina las notificaciones que ya recibiste.

La sección Notificaciones push de la misma pestaña muestra los dispositivos que reciben avisos. La entrega por navegador, PWA o escritorio también requiere registrar el dispositivo y obtener permiso del sistema operativo. Desactivar o quitar un dispositivo detiene los avisos solo en ese dispositivo; tu bandeja de entrada y sus categorías no cambian.

Si una notificación lleva a contenido no disponible, comprueba si cambió la pertenencia al proyecto o se eliminó el objeto. Si faltan notificaciones push, verifica el permiso y registro del dispositivo con la guía correspondiente; la bandeja de entrada sigue siendo útil para consultar la actividad. Nunca envíes cookies de sesión ni contenido privado de notificaciones en capturas de diagnóstico.

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
  "revision": 5,
  "sourceRevision": 5,
  "owner": "@mangue-dev",
  "updatedAt": "2026-10-09",
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
      "content/knowledge/productivity.md",
      "components/inbox-popover.tsx",
      "components/inbox-content.tsx",
      "components/settings/account-notifications-section.tsx"
    ]
  },
  "review": {
    "revision": 5,
    "fact": "agent:/root/german_spanish_review (structural consolidation review; prior procedural evidence retained; no operational rerun)",
    "language": "agent:/root/german_spanish_review (es title, summary, lead and heading review; retained body comparison)",
    "date": "2026-10-09"
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
      "revision": 5,
      "reviewed": true,
      "capturedAt": "2026-10-09",
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

Abre la bandeja de entrada desde la navegación. Es un panel emergente que agrupa notificaciones por fecha y ofrece filtros de no leídas, todas y menciones. Selecciona un elemento para examinar la incidencia o página correspondiente y comprueba su estado de lectura. Abrir una notificación la marca como leída. Su fila también ofrece controles para marcarla como leída o no leída, y el panel puede marcar todas las notificaciones como leídas. Marcarla como no leída restaura ese indicador de actividad; no deshace el cambio en la incidencia o página. Una notificación apunta a trabajo accesible; no sustituye su contenido actual.

Las invitaciones pendientes a proyectos también aparecen allí. Acepta o rechaza después de comprobar proyecto y cuenta. Los enlaces antiguos de la bandeja de entrada abren el acceso actual, no una página independiente.

![Bandeja de entrada con menciones, asignaciones y comentarios de demostración, leídos y no leídos.](/documentation/es/work-inbox.png)

## Elegir canales de notificación {#notification-preferences}

Abre las preferencias de notificación de la cuenta para ajustar qué actividad recibes. La entrega por navegador, PWA o escritorio también requiere registrar el dispositivo y obtener permiso del sistema operativo. Desactivar un canal de dispositivo es distinto de cambiar los filtros de actividad dentro de la aplicación.

Si una notificación lleva a contenido no disponible, comprueba si cambió la pertenencia al proyecto o se eliminó el objeto. Si faltan notificaciones push, verifica el permiso y registro del dispositivo con la guía correspondiente; la bandeja de entrada sigue siendo útil para consultar la actividad. Nunca envíes cookies de sesión ni contenido privado de notificaciones en capturas de diagnóstico.

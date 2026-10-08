---
{
  "id": "issue-discussion-and-resources",
  "locale": "es",
  "title": "Discutir el trabajo y adjuntar su contexto",
  "summary": "Usa comentarios, menciones, archivos y páginas vinculadas a su contenido actual en una incidencia.",
  "topic": "Proyectos e incidencias",
  "type": "guide",
  "audiences": [
    "member"
  ],
  "workflows": [
    "W08"
  ],
  "visibility": "public",
  "status": "published",
  "revision": 3,
  "sourceRevision": 1,
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
      "components/issue-timeline.tsx",
      "components/issue-resources-section.tsx",
      "content/knowledge/core-tracker.md"
    ]
  },
  "review": {
    "revision": 3,
    "fact": "2026-10-08",
    "language": "2026-10-08",
    "date": "2026-10-08"
  },
  "related": [
    "create-and-organize-pages",
    "page-files",
    "notifications-and-inbox"
  ],
  "aliases": [],
  "tags": [],
  "figures": [
    {
      "id": "issue-discussion-and-resources-steps",
      "kind": "screenshot",
      "src": "/documentation/es/work-resources.png",
      "alt": "Diálogo para añadir un enlace con una dirección de contacto de ejemplo.",
      "caption": "Revisa el destino antes de añadir el recurso. Este enlace de ejemplo no se ha enviado.",
      "revision": 3,
      "reviewed": true,
      "capturedAt": "2026-10-08",
      "viewport": [
        1440,
        1080
      ],
      "theme": "light"
    }
  ],
  "requiredFigures": [
    "issue-discussion-and-resources-steps"
  ]
}
---

## Añadir una discusión o un recurso {#issue-discussion-and-resources}

Abre la cronología de discusión de la incidencia para añadir un comentario. Explica una decisión, pregunta o resultado de verificación para que otro miembro comprenda qué cambió. Usa menciones cuando necesites una persona o un objeto vinculado en el contexto; las notificaciones siguen dependiendo de las preferencias del destinatario y de la entrega en su dispositivo.

Adjunta una página relevante del proyecto, un archivo o un enlace mediante los controles de recursos. Una página vinculada es un recurso actualizado: su título sigue los cambios de nombre y su contenido puede evolucionar. Un archivo es un adjunto almacenado, no una garantía de que una URL externa seguirá disponible.

![Diálogo para añadir un enlace con una dirección de contacto de ejemplo.](/documentation/es/work-resources.png)

## Visibilidad y cargas fallidas {#resource-access}

La pertenencia y el acceso al proyecto regulan la discusión y los recursos internos. Añadir un recurso a una incidencia no lo publica para visitantes anónimos. Al referirte a comentarios públicos, distingue la discusión interna del equipo de una respuesta pública antes de enviar texto.

Comprueba que un recurso cargado aparezca y pueda abrirse después de la operación. Si falla, conserva el archivo original, lee el error y verifica el límite aplicable de tamaño de archivo o almacenamiento de la cuenta. Los operadores autoalojados también necesitan metadatos, políticas y bytes de Storage que funcionen. Evita adjuntar credenciales o volcados privados de diagnóstico.

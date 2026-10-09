---
{
  "id": "architecture-and-data-flows",
  "locale": "es",
  "title": "Arquitectura y flujos de datos",
  "summary": "Next.js proporciona la interfaz y las API autorizadas.",
  "topic": "Conceptos técnicos",
  "type": "explanation",
  "audiences": [
    "operator",
    "integrator"
  ],
  "workflows": [
    "T03"
  ],
  "visibility": "public",
  "status": "published",
  "revision": 4,
  "sourceRevision": 4,
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
      "desktop",
      "mobile",
      "full",
      "managed"
    ],
    "evidence": [
      "docs/editions.md",
      "docs/self-hosting-distribution.md",
      "lib/server/capabilities.ts",
      "content/documentation/reviews/editorial-clarity-en-fr-2026-10-09.md",
      "content/documentation/reviews/editorial-clarity-de-es-2026-10-09.md",
      "content/documentation/reviews/editorial-clarity-it-pt-BR-2026-10-09.md"
    ]
  },
  "review": {
    "revision": 4,
    "fact": "agent:/root/german_spanish_review (structural consolidation review; prior procedural evidence retained; no operational rerun); agent:/root (visual usefulness, figure framing and preserved procedures; previous operational evidence retained); agent:/root (technical-reference formatting; prior factual evidence retained; no operational rerun)",
    "language": "agent:/root/german_spanish_review (es title, summary, lead and heading review; retained body comparison); agent:/root/editorial_de_es (collection-caption clarity); agent:/root (inline-code syntax and unchanged-text review)",
    "date": "2026-10-09"
  },
  "related": [
    "instance-configuration",
    "storage-and-attachments",
    "numo"
  ],
  "aliases": [],
  "tags": [
    "Seguir los flujos entre aplicación, base y proveedores"
  ],
  "figures": [
    {
      "id": "architecture-and-data-flows-flow",
      "kind": "diagram",
      "src": "/documentation/es/architecture-and-data-flows-flow.svg",
      "alt": "Diagrama: Navegador y aplicación autenticada. Supabase: PostgreSQL, Auth, Storage, Realtime. Planificador independiente y runner fiable. Proveedores opcionales: destinos separados.",
      "caption": "La infraestructura separa las solicitudes interactivas, el trabajo programado y los destinos externos de datos.",
      "revision": 4,
      "reviewed": true,
      "capturedAt": "2026-10-08",
      "viewport": [
        720,
        640
      ],
      "theme": "neutral",
      "diagram": {
        "layout": "collection",
        "items": [
          {
            "title": "Navegador y aplicación autenticada"
          },
          {
            "title": "Supabase: PostgreSQL, Auth, Storage, Realtime"
          },
          {
            "title": "Planificador independiente y runner fiable"
          },
          {
            "title": "Proveedores opcionales: destinos separados"
          }
        ]
      }
    }
  ],
  "requiredFigures": [
    "architecture-and-data-flows-flow"
  ]
}
---

## Seguir los flujos entre aplicación, base y proveedores {#architecture-and-data-flows}

`Next.js` proporciona la interfaz y las API autorizadas. Supabase proporciona PostgreSQL, Auth, Storage y Realtime. PostgreSQL conserva registros de aplicación, cuentas, datos de plataforma y metadatos de archivos; Storage conserva los bytes. La configuración protegida contiene claves y parámetros de los proveedores. Los contenedores pueden recrearse, pero los volúmenes, los bytes y las claves deben persistir. Una restauración completa reúne esos elementos en el mismo punto de recuperación.

![Diagrama: Navegador y aplicación autenticada. Supabase: PostgreSQL, Auth, Storage, Realtime. Planificador independiente y runner fiable. Proveedores opcionales: destinos separados.](/documentation/es/architecture-and-data-flows-flow.svg)

## Seguir una solicitud {#requests}

El navegador utiliza las URL de origen públicas de minddy y Supabase. Auth crea la sesión; el servidor comprueba el usuario y el objeto antes de operar. Realtime propaga los cambios. En full, el servidor usa Kong en la red interna sin cambiar las URL del navegador ni los enlaces de cuenta. El planificador envía peticiones HTTP autenticadas sin un navegador. Cuando Numo necesita trabajar con código, el runner de confianza crea sandboxes restringidas para el repositorio vinculado; esas sandboxes no reciben secretos de la instancia ni el socket Docker.

## Identificar destinos externos {#providers}

IA, email, Git, MCP remoto, push, analytics y almacenamiento externo son destinos separados cuando se activan. Alojar minddy en su servidor no vuelve locales esos servicios. En managed, el proveedor elegido opera el backend; full lo sitúa bajo su control. minddy Cloud opera el servicio y sus proveedores, mientras en self-hosted usted configura las cuentas y opciones. Revise permisos, costes y condiciones de tratamiento de datos. No deduzca el proveedor ni la edición Cloud únicamente del hostname o de la plataforma de despliegue.

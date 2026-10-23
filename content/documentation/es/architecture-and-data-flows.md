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
  "revision": 8,
  "sourceRevision": 8,
  "owner": "@mangue-dev",
  "updatedAt": "2026-10-23",
  "compatibility": {
    "version": "0.20.1 (MIN-788 Supabase self-hosted/v0.8.3)",
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
      "lib/server/capabilities.ts"
    ]
  },
  "review": {
    "revision": 8,
    "fact": "agent:/root/min747 (0.20.0 release review: source audit against the v0.11.0..main delta, no correction needed; no screenshot in scope; no browser walkthrough of the procedures or operator rehearsal; earlier evidence retained in git history); agent:claude-code (manual figures rebuilt on the Aurora demo, catalog review labels and informal register; figures recaptured on 2026-10-22 from a local candidate against the preview demo account and inspected; no form submitted); agent:claude-code (MIN-788: Supabase self-hosted/v0.8.3 pin, api-gw gateway name and the upstream release change checked against the pinned upstream files and overlay; full profile installed on v0.8.3 and a v0.7.2 instance moved with the documented sequence on a local Docker host, then sign-in, realtime and attachment SHA-256 verified; no screenshot in scope)",
    "language": "agent:/root/min747 (es translation of the release corrections with catalog UI labels; equivalent meaning self-reviewed; agent review, not human acceptance); agent:claude-code (es manual figures rebuilt on the Aurora demo, catalog review labels and informal register; self-reviewed; agent review, not human acceptance); agent:claude-code (es MIN-788 changed passages; self-reviewed; agent review, not human acceptance)",
    "date": "2026-10-23"
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
      "alt": "Diagrama: Navegador y aplicación autenticada. Supabase: PostgreSQL, Auth, Storage, Realtime. Planificador independiente para tareas en segundo plano. Proveedores opcionales: destinos separados.",
      "caption": "La infraestructura separa las solicitudes interactivas, el trabajo programado y los destinos externos de datos.",
      "revision": 8,
      "reviewed": true,
      "capturedAt": "2026-10-16",
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
            "title": "Planificador independiente para tareas en segundo plano"
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

![Diagrama: Navegador y aplicación autenticada. Supabase: PostgreSQL, Auth, Storage, Realtime. Planificador independiente para tareas en segundo plano. Proveedores opcionales: destinos separados.](/documentation/es/architecture-and-data-flows-flow.svg)

## Seguir una solicitud {#requests}

El navegador utiliza las URL de origen públicas de minddy y Supabase. Auth crea la sesión; el servidor comprueba el usuario y el objeto antes de operar. Realtime propaga los cambios. En full, el servidor usa la pasarela de API de la red interna sin cambiar las URL del navegador ni los enlaces de cuenta. El planificador envía peticiones HTTP autenticadas sin un navegador.

## Identificar destinos externos {#providers}

IA, email, Git, MCP remoto, push, analytics y almacenamiento externo son destinos separados cuando se activan. Alojar minddy en tu servidor no vuelve locales esos servicios. En managed, el proveedor elegido opera el backend; full lo sitúa bajo tu control. minddy Cloud opera el servicio y sus proveedores, mientras en self-hosted tú configuras las cuentas y opciones. Revisa permisos, costes y condiciones de tratamiento de datos. No deduzcas el proveedor ni la edición Cloud únicamente del hostname o de la plataforma de despliegue.

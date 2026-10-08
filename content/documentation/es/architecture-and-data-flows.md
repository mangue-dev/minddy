---
{
  "id": "architecture-and-data-flows",
  "locale": "es",
  "title": "Seguir los flujos entre aplicación, base y proveedores",
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
  "revision": 1,
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
    "revision": 1,
    "fact": "agent:/root/automation_account_documentation (independent targeted primary-source review)",
    "language": "Codex agent review_documentation_locales: independent complete English/Spanish meaning and idiom review, not human review",
    "date": "2026-10-08"
  },
  "related": [
    "optional-providers",
    "storage-and-attachments",
    "numo-execution-model"
  ],
  "aliases": [],
  "tags": [],
  "figures": [
    {
      "id": "architecture-and-data-flows-flow",
      "kind": "diagram",
      "src": "/documentation/es/architecture-and-data-flows-flow.svg",
      "alt": "Diagrama: Navegador y aplicación autenticada. Supabase: PostgreSQL, Auth, Storage, Realtime. Planificador independiente y runner fiable. Proveedores opcionales: destinos separados.",
      "caption": "Estos componentes tienen responsabilidades distintas. Navegador y aplicación autenticada. Supabase: PostgreSQL, Auth, Storage, Realtime. Planificador independiente y runner fiable. Proveedores opcionales: destinos separados.",
      "revision": 1,
      "reviewed": true,
      "capturedAt": "2026-10-08",
      "viewport": [
        720,
        640
      ],
      "theme": "neutral"
    }
  ],
  "requiredFigures": [
    "architecture-and-data-flows-flow"
  ]
}
---
## Seguir los flujos entre aplicación, base y proveedores {#architecture-and-data-flows}

Next.js proporciona la interfaz y las API autorizadas. Supabase proporciona PostgreSQL, Auth, Storage y Realtime. PostgreSQL conserva registros de aplicación, cuentas, datos de plataforma y metadatos de archivos; Storage conserva los bytes. La configuración protegida contiene claves y parámetros de los proveedores. Los contenedores pueden recrearse, pero los volúmenes, los bytes y las claves deben persistir. Una restauración completa reúne esos elementos en el mismo punto de recuperación.

![Diagrama: Navegador y aplicación autenticada. Supabase: PostgreSQL, Auth, Storage, Realtime. Planificador independiente y runner fiable. Proveedores opcionales: destinos separados.](/documentation/es/architecture-and-data-flows-flow.svg)

## Seguir una solicitud {#requests}

El navegador utiliza las URL de origen públicas de Minddy y Supabase. Auth crea la sesión; el servidor comprueba el usuario y el objeto antes de operar. Realtime propaga los cambios. En full, el servidor usa Kong en la red interna sin cambiar las URL del navegador ni los enlaces de cuenta. El planificador envía peticiones HTTP autenticadas sin un navegador. Cuando Numo necesita trabajar con código, el runner de confianza crea sandboxes restringidas para el repositorio vinculado; esas sandboxes no reciben secretos de la instancia ni el socket Docker.



## Identificar destinos externos {#providers}

IA, email, Git, MCP remoto, push, analytics y almacenamiento externo son destinos separados cuando se activan. Alojar Minddy en su servidor no vuelve locales esos servicios. En managed, el proveedor elegido opera el backend; full lo sitúa bajo su control. Minddy Cloud opera el servicio y sus proveedores, mientras en self-hosted usted configura las cuentas y opciones. Revise permisos, costes y condiciones de tratamiento de datos. No deduzca el proveedor ni la edición Cloud únicamente del hostname o de la plataforma de despliegue.

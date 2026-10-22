---
{
  "id": "encryption-and-data-boundaries",
  "locale": "es",
  "title": "Cifrado y límites de protección de datos",
  "summary": "Tras la configuración y migración previstas, minddy cifra contenido y archivos antes de las escrituras persistentes mediante cifrado autenticado en el servidor.",
  "topic": "Conceptos técnicos",
  "type": "explanation",
  "audiences": [
    "member",
    "operator"
  ],
  "workflows": [
    "T04"
  ],
  "visibility": "public",
  "status": "published",
  "revision": 7,
  "sourceRevision": 6,
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
      "desktop",
      "mobile",
      "full",
      "managed"
    ],
    "evidence": [
      "docs/self-hosting.md",
      "lib/server/encryption/data-policy.json",
      "lib/server/encryption.ts",
      "docs/editions.md"
    ]
  },
  "review": {
    "revision": 7,
    "fact": "agent:/root/min747 (0.20.0 release review: source audit against the v0.11.0..main delta, no correction needed; no screenshot in scope; no browser walkthrough of the procedures or operator rehearsal; earlier evidence retained in git history); agent:claude-code (manual figures rebuilt on the Aurora demo, catalog review labels and informal register; figures recaptured on 2026-10-22 from a local candidate against the preview demo account and inspected; no form submitted)",
    "language": "agent:/root/min747 (es translation of the release corrections with catalog UI labels; equivalent meaning self-reviewed; agent review, not human acceptance); agent:claude-code (es manual figures rebuilt on the Aurora demo, catalog review labels and informal register; self-reviewed; agent review, not human acceptance)",
    "date": "2026-10-22"
  },
  "related": [
    "workspace-encryption",
    "backups-and-restoration",
    "permissions-and-public-links"
  ],
  "aliases": [],
  "tags": [
    "Comprender el cifrado y los datos que no oculta"
  ],
  "figures": [
    {
      "id": "encryption-and-data-boundaries-flow",
      "kind": "diagram",
      "src": "/documentation/es/encryption-and-data-boundaries-flow.svg",
      "alt": "Diagrama: Contenido cifrado y claves envueltas. Raíz en configuración protegida del servidor. Runtime autorizado puede descifrar. Exportaciones y proveedores necesitan protección aparte.",
      "caption": "El contenido almacenado está protegido, pero la aplicación autorizada puede descifrarlo y los datos que salen de la instancia necesitan protección propia.",
      "revision": 7,
      "reviewed": true,
      "capturedAt": "2026-10-10",
      "viewport": [
        720,
        640
      ],
      "theme": "neutral",
      "diagram": {
        "layout": "collection",
        "items": [
          {
            "title": "Contenido cifrado y claves envueltas"
          },
          {
            "title": "Raíz en configuración protegida del servidor"
          },
          {
            "title": "Runtime autorizado puede descifrar"
          },
          {
            "title": "Exportaciones y proveedores necesitan protección aparte"
          }
        ]
      }
    }
  ],
  "requiredFigures": [
    "encryption-and-data-boundaries-flow"
  ]
}
---

## Comprender el cifrado y los datos que no oculta {#encryption-and-data-boundaries}

Tras la configuración y migración previstas, minddy cifra contenido y archivos antes de las escrituras persistentes mediante cifrado autenticado en el servidor. Las claves de proyecto, usuario y sistema están versionadas y protegidas por una raíz fuera de PostgreSQL. Una copia aislada de la base de datos no permite leer el contenido protegido sin las claves. La aplicación lo descifra para usuarios autorizados, búsqueda y procesamiento de IA autorizado, incluso sin una sesión interactiva. Un entorno de ejecución comprometido o el acceso a datos y claves supera ese límite: el cifrado no excluye al operador mediante una protección de extremo a extremo.

![Diagrama: Contenido cifrado y claves envueltas. Raíz en configuración protegida del servidor. Runtime autorizado puede descifrar. Exportaciones y proveedores necesitan protección aparte.](/documentation/es/encryption-and-data-boundaries-flow.svg)

## Reconocer datos legibles y exportados {#exceptions}

Auth conserva el email de inicio de sesión. Los identificadores, las claves de proyecto e incidencia, los estados, las prioridades, las fechas y los metadatos permitidos siguen siendo consultables. Las publicaciones son legibles por decisión de quien publica. Protege por separado las exportaciones, los archivos descargados, el navegador y los datos enviados a proveedores externos de IA, email, Git o MCP. Un indicador no demuestra que el historial se haya convertido o eliminado de copias, registros y proveedores. Examinar el código no prueba que la migración de cifrado se haya ejecutado en producción de minddy Cloud.

## Preservar la recuperación {#recovery}

Protege `MINDDY_DATA_ROOT_KEY` fuera de la base de datos y conserva el material de recuperación necesario para las copias actuales e históricas. Restaura juntos la base de datos, los bytes y la configuración. Cifra la copia externa que contiene datos y claves. Cambiar la raíz sin volver a envolver las claves hace ilegible el contenido; desactivar el indicador no lo devuelve a texto claro. Antes de activar el cifrado en una instancia existente, prueba la recuperación y verifica el descifrado y los bytes realmente devueltos.

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
  "revision": 2,
  "sourceRevision": 2,
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
      "docs/self-hosting.md",
      "lib/server/encryption/data-policy.json",
      "lib/server/encryption.ts",
      "docs/editions.md"
    ]
  },
  "review": {
    "revision": 2,
    "fact": "agent:/root/german_spanish_review (structural consolidation review; prior procedural evidence retained; no operational rerun)",
    "language": "agent:/root/german_spanish_review (es title, summary, lead and heading review; retained body comparison)",
    "date": "2026-10-09"
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
      "alt": "Diagrama: Contenido cifrado y claves envueltas. Raíz en configuración protegida del servidor. Runtime autorizado puede descifrar. Exports y proveedores necesitan protección aparte.",
      "caption": "Estos componentes tienen responsabilidades distintas. Contenido cifrado y claves envueltas. Raíz en configuración protegida del servidor. Runtime autorizado puede descifrar. Exports y proveedores necesitan protección aparte.",
      "revision": 2,
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
    "encryption-and-data-boundaries-flow"
  ]
}
---

## Comprender el cifrado y los datos que no oculta {#encryption-and-data-boundaries}

Tras la configuración y migración previstas, minddy cifra contenido y archivos antes de las escrituras persistentes mediante cifrado autenticado en el servidor. Las claves de proyecto, usuario y sistema están versionadas y protegidas por una raíz fuera de PostgreSQL. Una copia aislada de la base de datos no permite leer el contenido protegido sin las claves. La aplicación lo descifra para usuarios autorizados, búsqueda y procesamiento de IA autorizado, incluso sin una sesión interactiva. Un entorno de ejecución comprometido o el acceso a datos y claves supera ese límite: el cifrado no excluye al operador mediante una protección de extremo a extremo.

![Diagrama: Contenido cifrado y claves envueltas. Raíz en configuración protegida del servidor. Runtime autorizado puede descifrar. Exports y proveedores necesitan protección aparte.](/documentation/es/encryption-and-data-boundaries-flow.svg)

## Reconocer datos legibles y exportados {#exceptions}

Auth conserva el email de inicio de sesión. Los identificadores, las claves de proyecto e incidencia, los estados, las prioridades, las fechas y los metadatos permitidos siguen siendo consultables. Las publicaciones son legibles por decisión de quien publica. Proteja por separado las exportaciones, los archivos descargados, el navegador y los datos enviados a proveedores externos de IA, email, Git o MCP. Un indicador no demuestra que el historial se haya convertido o eliminado de copias, registros y proveedores. Examinar el código no prueba que la migración de cifrado se haya ejecutado en producción de minddy Cloud.

## Preservar la recuperación {#recovery}

Proteja MINDDY_DATA_ROOT_KEY fuera de la base de datos y conserve el material de recuperación necesario para las copias actuales e históricas. Restaure juntos la base de datos, los bytes y la configuración. Cifre la copia externa que contiene datos y claves. Cambiar la raíz sin volver a envolver las claves hace ilegible el contenido; desactivar el indicador no lo devuelve a texto claro. Antes de activar el cifrado en una instancia existente, pruebe la recuperación y verifique el descifrado y los bytes realmente devueltos.

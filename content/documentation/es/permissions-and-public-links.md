---
{
  "id": "permissions-and-public-links",
  "locale": "es",
  "title": "Permisos y enlaces públicos",
  "summary": "El servidor comprueba el acceso al proyecto en cada operación.",
  "topic": "Conceptos técnicos",
  "type": "explanation",
  "audiences": [
    "owner",
    "integrator"
  ],
  "workflows": [
    "T02"
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
      "lib/server/pages.ts",
      "lib/server/page-publication.ts",
      "lib/server/mcp/auth.ts",
      "proxy.ts",
      "content/knowledge/settings-and-data.md"
    ]
  },
  "review": {
    "revision": 2,
    "fact": "agent:/root/german_spanish_review (structural consolidation review; prior procedural evidence retained; no operational rerun)",
    "language": "agent:/root/german_spanish_review (es title, summary, lead and heading review; retained body comparison)",
    "date": "2026-10-09"
  },
  "related": [
    "pages",
    "views",
    "encryption-and-data-boundaries"
  ],
  "aliases": [],
  "tags": [
    "Comprender permisos y enlaces públicos"
  ],
  "figures": [
    {
      "id": "permissions-and-public-links-flow",
      "kind": "diagram",
      "src": "/documentation/es/permissions-and-public-links-flow.svg",
      "alt": "Diagrama: Permisos de cuenta y proyecto. Objeto privado o publicación explícita. Solo conjunto publicado y archivos firmados. Revocar enlace; archivos caducan después.",
      "caption": "Estos componentes tienen responsabilidades distintas. Permisos de cuenta y proyecto. Objeto privado o publicación explícita. Solo conjunto publicado y archivos firmados. Revocar enlace; archivos caducan después.",
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
    "permissions-and-public-links-flow"
  ]
}
---

## Comprender permisos y enlaces públicos {#permissions-and-public-links}

El servidor comprueba el acceso al proyecto en cada operación. El propietario administra la configuración restringida, los miembros y las integraciones; los miembros trabajan en incidencias y páginas según sus permisos. Ocultar un control no concede autorización. Las preferencias personales, el cuaderno y las conversaciones privadas no se comparten al añadir contexto de proyecto. MCP actúa con la cuenta que lo autorizó y vuelve a comprobar la pertenencia al proyecto; no concede privilegios de administrador al agente.

![Diagrama: Permisos de cuenta y proyecto. Objeto privado o publicación explícita. Solo conjunto publicado y archivos firmados. Revocar enlace; archivos caducan después.](/documentation/es/permissions-and-public-links-flow.svg)

## Entender el alcance de publicación {#publication}

Una página publicada o una vista compartida usa un enlace opaco, que puede tener contraseña. Quien tenga el enlace y la contraseña, cuando se exija, puede acceder al contenido: revóquelo cuando deje de ser necesario. Las subpáginas solo se resuelven dentro del conjunto publicado, sin revelar títulos de páginas excluidas. Las URL firmadas de archivos abarcan únicamente las páginas incluidas; los buckets y las rutas privadas siguen protegidos. Las menciones pueden quedar como texto sin un perfil accesible. Una base de datos pública muestra solo las entradas de la rama publicada.

## Probar publicación y revocación {#revocation}

Abra el enlace en una sesión independiente sin iniciar sesión y compruebe contenido, archivos y exclusiones. Revóquelo y repita la prueba. Las copias ya descargadas no se pueden retirar; las URL firmadas siguen siendo válidas hasta que expiran, con un plazo de 24 horas para las páginas. Los enlaces secretos mantienen noindex, mientras el centro de documentación puede indexarse. noindex orienta a los rastreadores; no controla el acceso. No incluya enlaces privados en informes ni ejemplos públicos.

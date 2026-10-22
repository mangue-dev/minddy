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
  "revision": 7,
  "sourceRevision": 7,
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
      "lib/server/pages.ts",
      "lib/server/page-publication.ts",
      "lib/server/mcp/auth.ts",
      "proxy.ts",
      "content/knowledge/settings-and-data.md",
      "docs/security/project-roles.md",
      "lib/project-roles.ts"
    ]
  },
  "review": {
    "revision": 7,
    "fact": "agent:/root/min747 (0.20.0 release review: source audit against the v0.11.0..main delta, verified corrections applied; no screenshot in scope; no browser walkthrough of the procedures or operator rehearsal; earlier evidence retained in git history); agent:claude-code (manual figures rebuilt on the Aurora demo, catalog review labels and informal register; figures recaptured on 2026-10-22 from a local candidate against the preview demo account and inspected; no form submitted)",
    "language": "agent:/root/min747 (es translation of the release corrections with catalog UI labels; equivalent meaning self-reviewed; agent review, not human acceptance); agent:claude-code (es manual figures rebuilt on the Aurora demo, catalog review labels and informal register; self-reviewed; agent review, not human acceptance)",
    "date": "2026-10-22"
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
      "caption": "Compartir da acceso solo al contenido seleccionado; los enlaces de archivo ya emitidos pueden seguir siendo válidos después de revocar el acceso compartido.",
      "revision": 7,
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
            "title": "Permisos de cuenta y proyecto"
          },
          {
            "title": "Objeto privado o publicación explícita"
          },
          {
            "title": "Solo conjunto publicado y archivos firmados"
          },
          {
            "title": "Revocar enlace; archivos caducan después"
          }
        ]
      }
    }
  ],
  "requiredFigures": [
    "permissions-and-public-links-flow"
  ]
}
---

## Comprender permisos y enlaces públicos {#permissions-and-public-links}

El servidor comprueba el acceso al proyecto y el rol de cada persona en él en cada operación. Cada proyecto tiene un único propietario, que administra la configuración restringida, los miembros, los roles y las integraciones. Los miembros trabajan en el contenido del proyecto. Los lectores pueden leerlo y, cuando el propietario les activa **Puede comentar**, comentar; no pueden editar contenido ni publicar enlaces, y no ven las integraciones ni los tokens de compartición y de tablero. La tabla de [roles del proyecto](/docs/projects#member-permissions) detalla el acceso de cada rol. Ocultar un control no concede autorización. Las preferencias personales, el cuaderno y las conversaciones privadas no se comparten al añadir contexto de proyecto. MCP actúa con la cuenta que lo autorizó y aplica en cada llamada el rol actual de esa cuenta en cada proyecto; no concede privilegios de administrador al agente. Las integraciones de proyecto con claves `mdy_` no son personas: conservan los permisos fijos de su tipo y no reciben ningún rol.

Un cambio de rol o una retirada se aplica a la siguiente solicitud. El contenido ya entregado no se recupera, y una URL firmada ya emitida para un archivo privado sigue siendo válida hasta que caduca, como máximo 10 minutos después.

![Diagrama: Permisos de cuenta y proyecto. Objeto privado o publicación explícita. Solo conjunto publicado y archivos firmados. Revocar enlace; archivos caducan después.](/documentation/es/permissions-and-public-links-flow.svg)

## Entender el alcance de publicación {#publication}

Una página publicada o una vista compartida usa un enlace opaco, que puede tener contraseña. El propietario y los miembros pueden publicar y revocar estos enlaces; los lectores no. Quien tenga el enlace y la contraseña, cuando se exija, puede acceder al contenido: revócalo cuando deje de ser necesario. Las subpáginas solo se resuelven dentro del conjunto publicado, sin revelar títulos de páginas excluidas. Las URL firmadas de archivos abarcan únicamente las páginas incluidas; los buckets y las rutas privadas siguen protegidos. Las menciones pueden quedar como texto sin un perfil accesible. Una base de datos pública muestra solo las entradas de la rama publicada.

## Probar publicación y revocación {#revocation}

Abre el enlace en una sesión independiente sin iniciar sesión y comprueba contenido, archivos y exclusiones. Revócalo y repite la prueba. Las copias ya descargadas no se pueden retirar; las URL firmadas siguen siendo válidas hasta que expiran, y las URL de archivos emitidas para una página publicada duran 24 horas. Los enlaces secretos mantienen `noindex`, mientras el centro de documentación puede indexarse. `noindex` orienta a los rastreadores; no controla el acceso. No incluyas enlaces privados en informes ni ejemplos públicos.

---
{
  "id": "external-minddy-mcp",
  "locale": "es",
  "title": "Conectar un asistente externo al MCP de Minddy",
  "summary": "Autorizar un cliente compatible en la instancia correcta y revocar acceso cuando proceda.",
  "topic": "Numo e integraciones",
  "type": "guide",
  "audiences": [
    "integrator",
    "member"
  ],
  "workflows": [
    "N09"
  ],
  "visibility": "public",
  "status": "published",
  "revision": 1,
  "sourceRevision": 1,
  "owner": "@mangue-dev",
  "updatedAt": "2026-10-08",
  "compatibility": {
    "version": "0.11.1 candidate (cd1843e12)",
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
      "app/(marketing)/mcp/page.tsx",
      "app/api/mcp/route.ts",
      "lib/site.ts",
      "components/settings/mcp-connect-panel.tsx",
      "components/settings/account-connected-apps-section.tsx",
      "content/documentation/reviews/remaining-account-capture-candidates.json",
      "content/documentation/reviews/mcp-access-capture-candidates.json"
    ]
  },
  "review": {
    "revision": 1,
    "fact": "2026-10-08",
    "language": "2026-10-08",
    "date": "2026-10-08"
  },
  "related": [],
  "aliases": [],
  "tags": [],
  "figures": [
    {
      "id": "external-minddy-mcp-workflow",
      "kind": "screenshot",
      "src": "/documentation/es/external-minddy-mcp-workflow.png",
      "alt": "Selector de clientes MCP de Minddy con Claude, Codex y otros asistentes.",
      "caption": "Selecciona tu cliente para ver su comando o configuración de instalación.",
      "revision": 1,
      "reviewed": true,
      "capturedAt": "2026-10-08",
      "viewport": [
        1440,
        1800
      ],
      "theme": "light"
    },
    {
      "id": "external-minddy-mcp-install-workflow",
      "kind": "screenshot",
      "src": "/documentation/es/external-minddy-mcp-install-workflow.png",
      "alt": "Diálogo de instalación de Codex en la instancia local.",
      "caption": "Diálogo de instalación de Codex en la instancia local. Usa el origen de tu instancia; el comando mostrado no se ejecutó para esta captura.",
      "revision": 1,
      "reviewed": true,
      "capturedAt": "2026-10-08",
      "viewport": [
        1440,
        1800
      ],
      "theme": "light"
    },
    {
      "id": "external-minddy-mcp-accesses-workflow",
      "kind": "screenshot",
      "src": "/documentation/es/external-minddy-mcp-accesses-workflow.png",
      "alt": "Lista de aplicaciones conectadas sin ninguna autorización activa.",
      "caption": "Revisa aquí las aplicaciones autorizadas. La cuenta de demostración no tiene ninguna autorización activa; no se autorizó ni revocó ninguna aplicación.",
      "revision": 1,
      "reviewed": true,
      "capturedAt": "2026-10-08",
      "viewport": [
        1440,
        1800
      ],
      "theme": "light"
    }
  ],
  "requiredFigures": [
    "external-minddy-mcp-workflow",
    "external-minddy-mcp-install-workflow",
    "external-minddy-mcp-accesses-workflow"
  ]
}
---

## Configurar el cliente {#external-minddy-mcp}
Abra la página pública de configuración MCP de la instancia y elija las instrucciones de su cliente. Use el endpoint mostrado, terminado en `/api/mcp`. En self-hosted use su propia instancia, no Cloud. El cliente debe admitir MCP remoto y el flujo OAuth indicado.

Inicie sesión en el navegador y revise la autorización antes de aceptarla. La conexión actúa como su cuenta de Minddy y no obtiene proyectos a los que no tiene acceso. Empiece leyendo una incidencia ya accesible y compruebe el proyecto devuelto.

![Selector de clientes MCP de Minddy con Claude, Codex y otros asistentes.](/documentation/es/external-minddy-mcp-workflow.png)


## Alcance y revocación {#access}
Los clientes externos usan herramientas disponibles para incidencias, planes, comentarios, páginas, feedback, ciclos, rutinas y cuaderno dentro de sus permisos. MCP está disponible en todos los planes Cloud; la IA del cliente sigue dependiendo de su configuración y costes.

Minddy MCP en los ajustes de cuenta muestra accesos externos y controles de revocación. Revoque clientes que ya no use o considere fiables. MCP para Numo es distinto: conecta Numo a otros servicios. No pegue tokens de acceso en incidencias, solicitudes públicas de feedback, sus comentarios ni capturas.

![Diálogo de instalación de Codex en la instancia local.](/documentation/es/external-minddy-mcp-install-workflow.png)

![Lista de aplicaciones conectadas sin ninguna autorización activa.](/documentation/es/external-minddy-mcp-accesses-workflow.png)

---
{
  "id": "minddy-mcp",
  "locale": "es",
  "title": "MCP de minddy",
  "summary": "Conecte un asistente externo a minddy, controle su acceso y descubra las herramientas MCP disponibles y los procedimientos de actualización seguros.",
  "topic": "Numo e integraciones",
  "type": "guide",
  "audiences": [
    "integrator",
    "member"
  ],
  "workflows": [
    "N09",
    "T06"
  ],
  "visibility": "public",
  "status": "published",
  "revision": 3,
  "sourceRevision": 3,
  "owner": "@mangue-dev",
  "updatedAt": "2026-10-09",
  "compatibility": {
    "version": "0.11.1 candidate (cd1843e12); 0.11.1 candidate (89ebb59a5)",
    "editions": [
      "Cloud",
      "self-hosted"
    ],
    "profiles": [
      "web",
      "mobile",
      "desktop",
      "full",
      "managed"
    ],
    "evidence": [
      "app/(marketing)/mcp/page.tsx",
      "app/api/mcp/route.ts",
      "lib/site.ts",
      "components/settings/mcp-connect-panel.tsx",
      "components/settings/account-connected-apps-section.tsx",
      "content/documentation/reviews/remaining-account-capture-candidates.json",
      "content/documentation/reviews/mcp-access-capture-candidates.json",
      "lib/server/mcp/catalog.ts",
      "lib/server/mcp/tools.ts",
      "lib/server/mcp/page-tools.ts",
      "lib/server/mcp/auth.ts",
      "app/llms-full.txt/route.ts",
      "content/documentation/reviews/visual-refresh-captures-2026-10-09.json"
    ]
  },
  "review": {
    "revision": 3,
    "fact": "agent:/root/german_spanish_review (structural consolidation review; prior procedural evidence retained; no operational rerun); agent:/root (visual usefulness, figure framing and preserved procedures; previous operational evidence retained)",
    "language": "agent:/root/german_spanish_review (es title, summary, lead and heading review; retained body comparison); agent:/root/editorial_de_es (editorial clarity pass); agent:/root (figure removals and captions)",
    "date": "2026-10-09"
  },
  "related": [
    "numo",
    "integration-troubleshooting"
  ],
  "aliases": [
    "external-minddy-mcp",
    "mcp-tool-reference"
  ],
  "tags": [
    "Conectar un asistente externo al MCP de minddy",
    "Usar minddy MCP y descubrir herramientas actuales"
  ],
  "figures": [
    {
      "id": "external-minddy-mcp-workflow",
      "kind": "screenshot",
      "src": "/documentation/es/external-minddy-mcp-workflow.png",
      "alt": "Selector de clientes MCP de minddy con Claude, Codex y otros asistentes.",
      "caption": "Selecciona tu cliente para ver su comando o configuración de instalación.",
      "revision": 3,
      "reviewed": true,
      "capturedAt": "2026-10-09",
      "viewport": [
        816,
        252
      ],
      "theme": "light",
      "padding": 24,
      "deviceScaleFactor": 2
    },
    {
      "id": "external-minddy-mcp-install-workflow",
      "kind": "screenshot",
      "src": "/documentation/es/external-minddy-mcp-install-workflow.png",
      "alt": "Diálogo de instalación de Codex en la instancia local.",
      "caption": "Diálogo de instalación de Codex. Usa el origen de tu instancia; el comando mostrado no se ejecutó para esta captura.",
      "revision": 3,
      "reviewed": true,
      "capturedAt": "2026-10-09",
      "viewport": [
        560,
        380
      ],
      "theme": "light",
      "padding": 24,
      "deviceScaleFactor": 2
    }
  ],
  "requiredFigures": [
    "external-minddy-mcp-workflow",
    "external-minddy-mcp-install-workflow"
  ]
}
---

El MCP de minddy permite a un asistente externo utilizar herramientas con los permisos de su cuenta. Conéctelo mediante la configuración de su instancia y revise o revoque su acceso en los ajustes de la cuenta. Antes de cambiar incidencias, páginas o rutinas, consulte los esquemas actuales de las herramientas.

## Conectar un asistente externo al MCP de minddy {#external-minddy-mcp}

Abra la página pública de configuración MCP de la instancia y elija las instrucciones de su cliente. Use el endpoint mostrado, terminado en `/api/mcp`. En self-hosted use su propia instancia, no Cloud. El cliente debe admitir MCP remoto y el flujo OAuth indicado.

Inicie sesión en el navegador y revise la autorización antes de aceptarla. La conexión actúa como su cuenta de minddy y no obtiene proyectos a los que no tiene acceso. Empiece leyendo una incidencia ya accesible y compruebe el proyecto devuelto.

![Selector de clientes MCP de minddy con Claude, Codex y otros asistentes.](/documentation/es/external-minddy-mcp-workflow.png)

### Alcance y revocación {#access}

Los clientes externos usan herramientas disponibles para incidencias, planes, comentarios, páginas, feedback, ciclos, rutinas y cuaderno dentro de sus permisos. MCP está disponible en todos los planes Cloud; la IA del cliente sigue dependiendo de su configuración y costes.

minddy MCP en los ajustes de cuenta muestra accesos externos y controles de revocación. Revoque clientes que ya no use o considere fiables. MCP para Numo es distinto: conecta Numo a otros servicios. No pegue tokens de acceso en incidencias, solicitudes públicas de feedback, sus comentarios ni capturas.

![Diálogo de instalación de Codex en la instancia local.](/documentation/es/external-minddy-mcp-install-workflow.png)


## Usar minddy MCP y descubrir herramientas actuales {#mcp-tool-reference}

minddy expone /api/mcp mediante Streamable HTTP, herramientas sin estado y OAuth 2.1. Conecte su propia cuenta mediante el consentimiento en el navegador; las antiguas claves estáticas mdyk_ no se aceptan. Empiece con minddy_list_projects para obtener los UUID de proyectos accesibles y lea los esquemas del servidor conectado. /llms-full.txt se genera a partir de esos registros y proporciona los parámetros actuales exactos. No deduzca herramientas de una lista antigua. Las herramientas de proyecto vuelven a comprobar el acceso y devuelven códigos de error estables.

### Leer antes de cambiar planes {#issue-plans}

minddy_get_issue acepta un UUID de incidencia, un identificador como DEMO-42 o un número de incidencia con project_id. Sus plan_tasks proporcionan task_index desde cero. minddy_update_plan_task recibe un lote tasks con estados pending, in_progress, completed o cancelled; un índice inválido rechaza todo el lote. Añada contenido con minddy_append_to_plan y cambie un pasaje con minddy_edit_issue_text usando old_string/new_string exactos y únicos. Relea si el texto ha cambiado: reemplazar todo el plan puede sobrescribir el progreso de otra persona. Las preguntas bajo ## Questions no cuentan como tareas del plan.

### Respetar revisiones y propiedad {#pages-and-routines}

minddy_list_pages muestra la jerarquía, minddy_search_pages encuentra extractos y minddy_get_page lee el Markdown completo, los comentarios y los valores de base de datos. Prefiera cambios parciales y utilice la versión actual para un reemplazo completo. Conserve exactamente las URL de archivos e imágenes. minddy_create_page con database=true crea una base de datos de páginas. minddy_update_page_database exige la revisión del esquema, el valor anterior de las celdas y los tokens de vista previa y aplicación para las conversiones. Los propietarios pueden crear, pausar, reprogramar o eliminar sus rutinas. Lea las existentes antes de crear para evitar duplicados. minddy_add_resource limita los archivos a 10 MB; las herramientas de páginas no inventan URL.

### Comprobar con un ejemplo {#example}

El ejemplo cambia la primera tarea de un plan ya leído. Sustituya el UUID del proyecto y la incidencia por los valores obtenidos mediante descubrimiento; task_index debe proceder de la última lectura. Compruebe los plan_tasks y plan_progress devueltos. Ante un error de acceso, revise la cuenta y la autorización del proyecto; ante un conflicto de versión, vuelva a leer y aplique solo el cambio previsto. No repita una modificación externa de resultado incierto antes de comprobarlo.

```json
{
  "project_id": "00000000-0000-4000-8000-000000000001",
  "issue": "DEMO-42",
  "tasks": [{"task_index": 0, "state": "in_progress"}]
}
```

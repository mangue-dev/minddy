---
{
  "id": "minddy-mcp",
  "locale": "es",
  "title": "MCP de minddy",
  "summary": "Conecta un asistente externo a minddy, controla su acceso y descubre las herramientas MCP disponibles y los procedimientos de actualización seguros.",
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
  "revision": 15,
  "sourceRevision": 14,
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
      "lib/server/mcp/catalog.ts",
      "lib/server/mcp/tools.ts",
      "lib/server/mcp/page-tools.ts",
      "lib/server/mcp/auth.ts",
      "app/llms-full.txt/route.ts",
      "lib/server/app-origin.ts",
      "lib/server/oauth/issuer.ts",
      "app/api/oauth/register/route.ts",
      "lib/server/oauth/metadata.ts",
      "lib/server/database-tool-schema.ts",
      "lib/server/page-databases.ts",
      "docs/security/project-roles.md",
      "lib/project-roles.ts",
      "lib/server/issue-reads.ts",
      "components/settings/account-settings-page.tsx"
    ]
  },
  "review": {
    "revision": 15,
    "fact": "agent:MIN-768 (MCP setup moved to wizards: changed passages checked against components/settings/account-mcp-clients.tsx and mcp-connect-panel.tsx; 1 screenshot recaptured on 2026-10-21 from the local candidate and inspected; earlier evidence retained in git history); agent:claude-code (it/es catalog review recapture of external-minddy-mcp-install-workflow on 2026-10-22 from a local candidate of this branch against the preview demo account; images inspected; no form submitted); agent:claude-code (manual figures rebuilt on the Aurora demo, catalog review labels and informal register; figures recaptured on 2026-10-22 from a local candidate against the preview demo account and inspected; no form submitted)",
    "language": "agent:MIN-768 (es translation of the changed passages with catalog UI labels; equivalent meaning self-reviewed; agent review, not human acceptance); agent:claude-code (es figure update after the catalog review; agent review, not human acceptance); agent:claude-code (es manual figures rebuilt on the Aurora demo, catalog review labels and informal register; self-reviewed; agent review, not human acceptance)",
    "date": "2026-10-22"
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
      "revision": 15,
      "reviewed": true,
      "capturedAt": "2026-10-20",
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
      "alt": "Paso de instalación de Codex en el asistente de conexión al MCP de minddy, con el endpoint de minddy Cloud.",
      "caption": "Este ejemplo conecta con minddy Cloud. Para el autoalojamiento, utiliza el origen de tu propia instancia; el comando mostrado no se ejecutó para esta captura.",
      "revision": 15,
      "reviewed": true,
      "capturedAt": "2026-10-22",
      "viewport": [
        560,
        308
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

El MCP de minddy permite a un asistente externo utilizar herramientas con los permisos de tu cuenta. Conéctalo mediante la configuración de tu instancia y revisa o revoca su acceso en los ajustes de la cuenta. Antes de cambiar incidencias, páginas o rutinas, consulta los esquemas actuales de las herramientas.

## Conectar un asistente externo al MCP de minddy {#external-minddy-mcp}

Abre la página pública de configuración MCP de la instancia y elige las instrucciones de tu cliente. Usa el endpoint mostrado, terminado en `/api/mcp`. En self-hosted usa tu propia instancia, no Cloud. El cliente debe admitir MCP remoto y el flujo OAuth indicado.

Inicia sesión en el navegador y revisa la autorización antes de aceptarla. La conexión actúa como tu cuenta de minddy y no obtiene proyectos a los que no tienes acceso. Empieza leyendo una incidencia ya accesible y comprueba el proyecto devuelto.

En los ajustes de cuenta, la sección MCP de minddy abre un asistente de dos pasos para cada cliente: copia el comando de instalación, la configuración o la URL del servidor y luego autoriza el inicio de sesión del cliente. El segundo paso indica cuándo minddy recibe ese acceso; hasta entonces, cerrarlo solo aplaza el inicio de sesión.

![Selector de clientes MCP de minddy con Claude, Codex y otros asistentes.](/documentation/es/external-minddy-mcp-workflow.png)

### Disponibilidad de MCP y acceso a la red {#network-access}

MCP está incluido en minddy autoalojado y se inicia con la aplicación. Funciona directamente en `/api/mcp`, en el origen de la instancia configurado con `MINDDY_PUBLIC_APP_URL`. Incluye el descubrimiento OAuth y el registro dinámico de clientes: no necesitas un servidor MCP separado, una aplicación OAuth dedicada ni un proxy de minddy Cloud. Conecta tu cliente MCP al endpoint de tu instancia, inicia sesión y concede acceso mediante el consentimiento en el navegador.

La disponibilidad del servicio no garantiza que sea accesible por la red. Tanto el cliente MCP como el navegador de autorización deben poder acceder a las URL MCP y OAuth anunciadas. Si defines explícitamente `OAUTH_ISSUER`, ese origen también debe ser accesible. El cliente debe admitir la conexión, el flujo OAuth y la ruta de red elegida; algunos clientes exigen HTTPS incluso en redes privadas.

- **Mismo ordenador:** `http://localhost:6463/api/mcp` funciona con un cliente compatible que se ejecuta en el ordenador que aloja la instancia local. `localhost` y `127.0.0.1` identifican el ordenador que inicia la conexión. El lanzador de instancias locales de la aplicación de escritorio solo escucha en la interfaz de bucle local; otro ordenador o un agente alojado en la nube no puede acceder directamente. Abrir la URL localhost del servidor en otro ordenador apunta a ese otro ordenador.

- **LAN o VPN:** una instancia configurada como `http://192.168.1.50` anuncia `http://192.168.1.50/api/mcp`. Un cliente de la LAN, o conectado por VPN, puede utilizarla si la dirección de escucha, el origen configurado, el puerto de la aplicación, el cortafuegos y el enrutamiento permiten el acceso. El navegador debe acceder a las mismas URL de autorización anunciadas. Esto requiere una instalación de servidor accesible; cambiar solo la URL del cliente no expone un proceso limitado al bucle local.

- **Fuera de la red privada:** utiliza un origen HTTPS accesible, como `https://tickets.example.com/api/mcp`, u otra ruta de red admitida por el cliente. Un agente alojado necesita su propia ruta a la instancia; la VPN del ordenador del navegador no le proporciona esa ruta. Alojar minddy localmente no lo expone automáticamente a Internet.

### Alcance y revocación {#access}

Los clientes externos usan herramientas disponibles para incidencias, planes, comentarios, páginas, feedback, ciclos, rutinas y cuaderno dentro de tus permisos. Las herramientas siguen tu rol actual en cada proyecto en cada llamada, de modo que un cambio de rol se aplica sin volver a conectarse. Como lector, obtienes las herramientas de lectura, y también las de comentarios cuando el propietario te ha activado **Puede comentar**. MCP está disponible en todos los planes Cloud; la IA del cliente sigue dependiendo de su configuración y costes.

minddy MCP en los ajustes de cuenta muestra accesos externos y controles de revocación. Revoca clientes que ya no uses o consideres fiables. La tarjeta **MCP para Numo** de la pestaña **IA y Numo** es distinta: conecta Numo a otros servicios. No pegues tokens de acceso en incidencias, solicitudes públicas de feedback, tus comentarios ni capturas.

![Paso de instalación de Codex en el asistente de conexión al MCP de minddy, con el endpoint de minddy Cloud.](/documentation/es/external-minddy-mcp-install-workflow.png)


## Usar minddy MCP y descubrir herramientas actuales {#mcp-tool-reference}

minddy expone `/api/mcp` mediante Streamable HTTP, herramientas sin estado y OAuth 2.1. Conecta tu propia cuenta mediante el consentimiento en el navegador; las antiguas claves estáticas `mdyk_` no se aceptan. Empieza con `minddy_list_projects` para obtener los UUID de proyectos accesibles y lee los esquemas del servidor conectado. `/llms-full.txt` se genera a partir de esos registros y proporciona los parámetros actuales exactos. No deduzcas herramientas de una lista antigua. Las herramientas de proyecto vuelven a comprobar el acceso y devuelven códigos de error estables.

### Leer antes de cambiar planes {#issue-plans}

Para encontrar una incidencia, llama a `minddy_list_issues` con `query`: busca palabras del título y la descripción, un identificador o un número. Las coincidencias de texto y los identificadores exactos van primero; una búsqueda descriptiva puede añadir después incidencias del mismo proyecto encontradas [por el sentido](/docs/navigation#search-by-meaning), marcadas con `match: "semantic"`. Lee esa incidencia antes de actuar sobre ella. La búsqueda por el sentido se cobra a tu cuenta como **Búsqueda de incidencias** y no se realiza si desactivaste **Indexar incidencias**.

`minddy_get_issue` acepta un UUID de incidencia, un identificador como `DEMO-42` o un número de incidencia con `project_id`. Sus `plan_tasks` proporcionan `task_index` desde cero. `minddy_update_plan_task` recibe un lote `tasks` con estados `pending`, `in_progress`, `completed` o `cancelled`; un índice inválido rechaza todo el lote. Añade contenido con `minddy_append_to_plan` y cambia un pasaje con `minddy_edit_issue_text` usando `old_string`/`new_string` exactos y únicos. Relee si el texto ha cambiado: reemplazar todo el plan puede sobrescribir el progreso de otra persona. Las preguntas bajo `## Questions` no cuentan como tareas del plan.

Las lecturas que devuelven texto con imágenes (`minddy_get_issue`, `minddy_get_objective`, `minddy_get_page`, `minddy_get_feedback`, `minddy_get_scratchpad`) las listan en `images`, cada una con su `src` y su texto alternativo. Pasa ese `src` sin cambios a `minddy_get_image`: comprueba tu acceso al proyecto de la imagen, o que una imagen del cuaderno sea tuya, y devuelve la imagen hasta 10 MB con una `download_url` firmada válida unos diez minutos. Una imagen alojada fuera de minddy se devuelve solo como su URL.

### Respetar revisiones y propiedad {#pages-and-routines}

`minddy_list_pages` muestra la jerarquía, `minddy_search_pages` encuentra extractos y `minddy_get_page` lee el Markdown completo, los comentarios y los valores de base de datos. Prefiere cambios parciales y utiliza la versión actual para un reemplazo completo. Conserva exactamente las URL de archivos e imágenes. `minddy_create_page` con `database=true` crea una base de datos de páginas. `minddy_update_page_database` exige la revisión del esquema y el valor anterior para los cambios de celdas. Para rellenar una base de datos con menos llamadas, pasa `values` a `minddy_create_page` para crear una entrada con sus propiedades, o usa `operation=values` para cambiar varias propiedades de una misma entrada a la vez: todas las celdas se escriben juntas o ninguna.

Para convertir una propiedad, indica `operation=convert`, `propertyId`, `targetType`, `revision` y primero `preview=true`. Revisa `incompatibleCount` y envía después los mismos ajustes de conversión con `preview=false` y el `token` devuelto. Usa `confirmLoss=true` solo si el usuario ha autorizado expresamente la pérdida de valores incompatibles.

Las herramientas de rutinas, reservadas al propietario, crean, modifican, pausan o eliminan rutinas cuyo desencadenante es una programación, un evento o una nueva entrada de base de datos. Lee las rutinas existentes antes de crear una nueva para evitar duplicados. `minddy_add_resource` limita los archivos a 10 MB; las herramientas de páginas no inventan URL.

### Comprobar con un ejemplo {#example}

El ejemplo cambia la primera tarea de un plan ya leído. Sustituye el UUID del proyecto y la incidencia por los valores obtenidos mediante descubrimiento; `task_index` debe proceder de la última lectura. Comprueba los `plan_tasks` y `plan_progress` devueltos. Ante un error de acceso, revisa la cuenta y la autorización del proyecto; ante un conflicto de versión, vuelve a leer y aplica solo el cambio previsto. No repitas una modificación externa de resultado incierto antes de comprobarlo.

```json
{
  "project_id": "00000000-0000-4000-8000-000000000001",
  "issue": "DEMO-42",
  "tasks": [{"task_index": 0, "state": "in_progress"}]
}
```


## Elegir un objetivo para un comentario {#feedback-objectives}

Las lecturas de comentarios incluyen `objective_id`; `minddy_list_feedback` acepta un filtro de objetivo opcional (`null` selecciona solicitudes sin objetivo). Usa `minddy_link_feedback_objective` con `project_id`, `feedback_post_id` y `objective_id` solo cuando el usuario lo pida explícitamente; `null` elimina el vínculo. El objetivo debe estar activo y pertenecer al mismo proyecto. El detalle del objetivo incluye `linked_feedback`. El propietario puede indicar `objective_id` en `minddy_create_integration` para una clave de comentarios, o cambiar el ajuste con `minddy_update_integration_objective`. Los comentarios existentes conservan su elección. La conversión hereda objetivo y categorías; la revisión de Numo nunca asigna objetivos.

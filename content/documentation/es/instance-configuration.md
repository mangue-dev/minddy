---
{
  "id": "instance-configuration",
  "locale": "es",
  "title": "Configuración de la instancia",
  "summary": "Configura los orígenes, los secretos y los proveedores opcionales, publica los puntos de acceso de red previstos y mantén las tareas programadas en ejecución.",
  "topic": "Administrar una instancia",
  "type": "guide",
  "audiences": [
    "operator"
  ],
  "workflows": [
    "H05",
    "H09",
    "H08"
  ],
  "visibility": "public",
  "status": "published",
  "revision": 13,
  "sourceRevision": 13,
  "owner": "@mangue-dev",
  "updatedAt": "2026-10-29",
  "compatibility": {
    "version": "0.20.1 (MIN-788 Supabase self-hosted/v0.8.3)",
    "editions": [
      "self-hosted"
    ],
    "profiles": [
      "full",
      "managed",
      "source",
      "local"
    ],
    "evidence": [
      ".env.example",
      "docs/self-hosting.md",
      "lib/capabilities.ts",
      "docs/editions.md",
      "content/knowledge/self-hosting.md",
      "docs/self-hosting-distribution.md",
      "vercel.json",
      "deploy/self-hosted/compose.full.yml",
      "deploy/self-hosted/scheduler.mjs",
      "app/api/cron/issue-index/route.ts",
      "app/api/cron/smart-fill-reevaluation/route.ts"
    ]
  },
  "review": {
    "revision": 13,
    "fact": "agent:claude-code (MIN-847 MINDDY_CONFIG_OVERRIDES sentence checked against lib/server/instance-variables.ts and scripts/self-hosting-install.mjs); agent:claude-code (MIN-829 MINDDY_PUBLISH_MODEL_CONFIG sentence checked against app/api/recommended-models/route.ts); agent:/root/min750 (schedule table and release delta sentence checked against vercel.json and deploy/self-hosted/scheduler.mjs after adding smart-fill-reevaluation; rest of the article unchanged since the 0.20.0 release review; no screenshot in scope); agent:claude-code (manual figures rebuilt on the Aurora demo, catalog review labels and informal register; figures recaptured on 2026-10-22 from a local candidate against the preview demo account and inspected; no form submitted); agent:claude-code (MIN-788: Supabase self-hosted/v0.8.3 pin, api-gw gateway name and the upstream release change checked against the pinned upstream files and overlay; full profile installed on v0.8.3 and a v0.7.2 instance moved with the documented sequence on a local Docker host, then sign-in, realtime and attachment SHA-256 verified; no screenshot in scope)",
    "language": "agent:claude-code (es MIN-829 sentence; self-reviewed; agent review, not human acceptance); agent:/root/min750 (es table row and release delta sentence; agent review, not human acceptance); agent:claude-code (es manual figures rebuilt on the Aurora demo, catalog review labels and informal register; self-reviewed; agent review, not human acceptance); agent:claude-code (es MIN-788 changed passages; self-reviewed; agent review, not human acceptance)",
    "date": "2026-10-29"
  },
  "related": [
    "workspace-encryption",
    "authentication-and-email",
    "architecture-and-data-flows",
    "update-an-instance",
    "numo"
  ],
  "aliases": [
    "optional-providers",
    "proxy-network-and-jobs"
  ],
  "tags": [
    "Configurar orígenes, secretos y capacidades de la instancia",
    "Activar proveedores opcionales de forma explícita",
    "Publicar los orígenes y ejecutar tareas programadas"
  ],
  "figures": [
    {
      "id": "optional-providers-flow",
      "kind": "diagram",
      "src": "/documentation/es/optional-providers-flow.svg",
      "alt": "Diagrama: Operador elige capacidad opcional. Credenciales completas y condiciones. Destino de datos externo explícito. Verificar conducta y controlar costes.",
      "caption": "Antes de activar una integración, comprueba adónde envía los datos y qué costes continuados genera.",
      "revision": 13,
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
            "title": "Operador elige capacidad opcional"
          },
          {
            "title": "Credenciales completas y condiciones"
          },
          {
            "title": "Destino de datos externo explícito"
          },
          {
            "title": "Verificar conducta y controlar costes"
          }
        ]
      }
    },
    {
      "id": "proxy-network-and-jobs-flow",
      "kind": "diagram",
      "src": "/documentation/es/proxy-network-and-jobs-flow.svg",
      "alt": "Diagrama: Proxy HTTPS público. Orígenes públicos de la aplicación y Supabase. Base de datos y puertos internos privados. Tareas autenticadas; paradas en mantenimiento.",
      "caption": "El acceso público queda separado de los servicios internos; el trabajo programado se autentica y se detiene durante el mantenimiento.",
      "revision": 13,
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
            "title": "Proxy HTTPS público"
          },
          {
            "title": "Orígenes públicos de la aplicación y Supabase"
          },
          {
            "title": "Base de datos y puertos internos privados"
          },
          {
            "title": "Tareas autenticadas; paradas en mantenimiento"
          }
        ]
      }
    }
  ],
  "requiredFigures": [
    "optional-providers-flow",
    "proxy-network-and-jobs-flow"
  ]
}
---

La configuración de la instancia determina los orígenes públicos, los secretos y los servicios disponibles. Conserva las credenciales existentes antes de cambiar el entorno protegido. Configura cada proveedor opcional por completo y comprueba después la exposición de la red y las tareas programadas autenticadas.

## Configurar orígenes, secretos y capacidades de la instancia {#instance-configuration}

Define `MINDDY_PUBLIC_APP_URL` como una única URL de origen absoluta, sin ruta ni barra final. Los despliegues públicos usan HTTPS; `localhost` y una red IPv4 privada de confianza pueden usar HTTP. `MINDDY_PUBLIC_SUPABASE_URL` y `MINDDY_PUBLIC_SUPABASE_ANON_KEY` deben corresponder al mismo entorno Supabase. Esos valores llegan al navegador. `SUPABASE_SERVICE_ROLE_KEY` es exclusiva del servidor y obligatoria en producción: no la coloques en variables públicas ni en un bundle cliente. La URL de la base de datos sirve a las herramientas y no sustituye la configuración de la API.

### Conservar los secretos {#secrets}

El instalador genera los valores ausentes de `GIT_STATE_SECRET`, `GIT_TOKEN_ENCRYPTION_SECRET`, `AI_KEY_ENCRYPTION_SECRET`, `FEEDBACK_SSO_ENCRYPTION_SECRET`, `MINDDY_DATA_ROOT_KEY` y `CRON_SECRET`. La clave raíz de contenido debe tener exactamente 64 caracteres hexadecimales. Consérvala fuera de PostgreSQL con una copia de recuperación protegida. Mantén todo el archivo de entorno con permisos `0600` y fuera de Git. No lo ejecutes como código shell ni lo imprimas. Repetir la instalación no rota los secretos. Perder claves de cifrado puede hacer ilegibles los datos existentes; una rotación deliberada exige el procedimiento de recuperación correspondiente.

### Aplicar y comprobar un cambio {#capabilities}

`MINDDY_PUBLIC_SITE_NAME` y `MINDDY_PUBLIC_CONTACT_EMAIL` identifican la instancia. `ADMIN_EMAILS` contiene las direcciones de los administradores, separadas por comas; el acceso privilegiado también exige MFA. `MINDDY_PUBLISH_MODEL_CONFIG=1` publica la configuración de modelos de IA de la instancia en `/api/recommended-models` (consulta [la configuración de modelos recomendada](/docs/recommended-models)); déjala vacía salvo que otras instancias la importen. `MINDDY_CONFIG_OVERRIDES=1` permite a las personas administradoras editar algunas variables desde el panel de administración, cuyos valores sustituyen entonces a los de este archivo ([editar las variables de la instancia](/docs/instance-administration#instance-variables)); solo el archivo puede definirla. `OAUTH_ISSUER` normalmente queda vacío, salvo que publiques OAuth de forma intencionada en otra URL de origen estable. Mantén desactivadas la IA y la facturación gestionadas en self-hosted. Activa los servicios opcionales solo cuando su configuración esté completa. Reinicia o recrea la aplicación tras cambiar los valores públicos de ejecución; la imagen OCI no requiere recompilación. Ejecuta doctor para distinguir capacidades incompletas de fallos del núcleo y prueba los enlaces de cuenta y callbacks en la URL de origen prevista.

### Configurar comentarios e informes de documentación {#product-feedback}

Define `MINDDY_FEEDBACK_KEY` con una clave de integración de comentarios para activar el envío de comentarios en la aplicación. Para los informes de documentación, crea una integración de comentarios independiente en el proyecto receptor, selecciona Documentation como objetivo predeterminado y guarda su clave en `MINDDY_DOCUMENTATION_FEEDBACK_KEY`. Ambas claves permanecen en el servidor. Los envíos utilizan `/api/v1/feedback` en el origen definido por `MINDDY_PUBLIC_APP_URL`. Reinicia la aplicación después de cambiar estos valores.

Para informar de un error desde un artículo se requiere una cuenta con la sesión iniciada. Tras iniciar sesión, el lector vuelve al mismo artículo con el diálogo de comentarios abierto. El título y la descripción están inicialmente vacíos. Después del envío, el servidor añade el identificador del artículo, el idioma, la revisión y la URL pública; estos datos no son campos editables del formulario. La integración de documentación vincula automáticamente el comentario al objetivo seleccionado. Sin `MINDDY_DOCUMENTATION_FEEDBACK_KEY`, el botón para informar de errores está desactivado y muestra una explicación.

## Activar proveedores opcionales de forma explícita {#optional-providers}

El núcleo no exige Stripe, PostHog, una cuenta Cloud ni una clave de IA gestionada por minddy. Los servicios externos tienen costes, permisos y destinos de datos propios. Revisa sus condiciones antes de activarlos. El diagnóstico informa de valores ausentes sin elegir un proveedor alternativo. Una instancia self-hosted puede usar claves de IA personales o endpoints locales accesibles. Mantén `MINDDY_MANAGED_AI` y `MINDDY_MANAGED_BILLING` desactivados; configurar una clave OpenRouter por sí sola no selecciona Cloud.

![Diagrama: Operador elige capacidad opcional. Credenciales completas y condiciones. Destino de datos externo explícito. Verificar conducta y controlar costes.](/documentation/es/optional-providers-flow.svg)

### Configurar proveedores completos {#configure}

El email de la aplicación necesita `EMAIL_PROVIDER=resend`, `RESEND_API_KEY`, `FEEDBACK_EMAIL_FROM` e `INVITATION_EMAIL_FROM`. `console` no se admite en producción; el SMTP de Auth se configura por separado. Web Push necesita el par VAPID público/privado y `VAPID_SUBJECT`; las suscripciones existentes dependen de ese par. Analytics necesita la clave y el host de PostHog; el seguimiento de errores también exige `MINDDY_PUBLIC_ERROR_TRACKING=1`. El instalador ofrece `application-email` y `web-push`, pero tú debes proporcionar las credenciales externas. No uses remitentes minddy ni credenciales de sus versiones nativas en otra instancia.

### Conectar Git y ejecución de código {#git-and-code}

Los adaptadores admiten GitHub.com y GitLab.com, no GitHub Enterprise Server ni GitLab autogestionado. Las conexiones iniciadas por usuarios pueden utilizar el relay gestionado. Puedes excluirlo con `--no-forge-relay` o `MINDDY_FORGE_RELAY=0` y configurar aplicaciones propias. Las conexiones existentes conservan su canal hasta que se reconectan. Numo no ejecuta código, así que el servidor de referencia no necesita ningún runner de código ni sandbox, y ningún servicio recibe el socket de Docker. Los ajustes que haya dejado una versión anterior, como `AGENT_EXECUTION_BACKEND`, `AGENT_RUNNER_URL`, `AGENT_RUNNER_SECRET`, `AGENT_CONTROL_ORIGIN` y las credenciales de Vercel Sandbox, se ignoran; elimínalos del entorno protegido.

## Publicar los orígenes y ejecutar tareas programadas {#proxy-network-and-jobs}

Un servicio público requiere un proxy inverso TLS y una redirección de HTTP a HTTPS. Las URL de origen de la aplicación y Supabase, las redirecciones Auth, los callbacks OAuth y los encabezados reenviados deben concordar. Mantén PostgreSQL, Studio y los puertos internos fuera de Internet. En full, la aplicación usa `http://api-gw:8000` internamente, mientras el navegador y los enlaces conservan la URL pública de Supabase. HTTP privado exige `localhost` o una red IPv4 privada de confianza, sin redirección de puertos del router.

![Diagrama: Proxy HTTPS público. Orígenes públicos de la aplicación y Supabase. Base de datos y puertos internos privados. Tareas autenticadas; paradas en mantenimiento.](/documentation/es/proxy-network-and-jobs-flow.svg)

### Configurar programación autenticada {#schedules}

Los perfiles Compose de referencia inician su planificador y el instalador genera `CRON_SECRET`. Un despliegue personalizado desde el código necesita un planificador HTTP equivalente. Cada petición envía `Authorization: Bearer <CRON_SECRET>`; si el secreto está vacío o no coincide, recibe 401. No registres ese encabezado. Los horarios siguientes están en UTC y pertenecen a esta versión. Utiliza las rutas de la versión desplegada, porque pueden cambiar.

Respecto al planificador de v0.11.0, esta versión añade `numo-turns`, `forge-relay-maintenance`, `page-materialization`, `issue-index` y `smart-fill-reevaluation`, y ya no llama a `/api/cron/agent-drain` ni a `/api/cron/automations`, que se retiraron junto con el trabajo de código de Numo y las automatizaciones de proyecto. Un planificador personalizado copiado de v0.11.0 debe actualizarse según esta tabla.

| Endpoint | Horario (UTC) |
| --- | --- |
| `/api/cron/feedback-analysis` | `0 * * * *` |
| `/api/cron/numo-turns` | `* * * * *` |
| `/api/cron/forge-relay-deliveries` | `* * * * *` |
| `/api/cron/forge-relay-maintenance` | `35 * * * *` |
| `/api/cron/page-materialization` | `* * * * *` |
| `/api/cron/smart-assign` | `*/5 * * * *` |
| `/api/cron/smart-fill-reevaluation` | `* * * * *` |
| `/api/cron/issue-index` | `25 * * * *` |
| `/api/cron/routines` | `*/5 * * * *` |
| `/api/cron/billing-sync` | `15 * * * *` |
| `/api/cron/fx-rate` | `30 15 * * *` |
| `/api/cron/encryption-maintenance` | `15 * * * *` |
| `/api/cron/data-retention` | `45 3 * * *` |

### Parar tareas durante mantenimiento {#maintenance}

Antes de una copia o migración, detén el planificador, la aplicación, los workers y el acceso público a Supabase. Detener solo el servidor web deja posibles escrituras directas por API. Ejecuta las comprobaciones en mantenimiento, con entradas y trabajos cerrados, y reabre solo cuando se hayan verificado la base de datos, Auth, Storage y la aplicación. Si un trabajo no arranca, comprueba en privado el planificador, la URL de origen y el secreto. Las rutinas requieren un planificador de servidor activo; no es necesario mantener abierta una aplicación de escritorio.

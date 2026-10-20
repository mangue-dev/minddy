---
{
  "id": "instance-configuration",
  "locale": "es",
  "title": "Configuración de la instancia",
  "summary": "Configure los orígenes, los secretos y los proveedores opcionales, publique los puntos de acceso de red previstos y mantenga las tareas programadas en ejecución.",
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
  "revision": 9,
  "sourceRevision": 9,
  "owner": "@mangue-dev",
  "updatedAt": "2026-10-20",
  "compatibility": {
    "version": "0.20.0 (MIN-747 release review)",
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
      "app/api/cron/issue-index/route.ts"
    ]
  },
  "review": {
    "revision": 9,
    "fact": "agent:/root/min747 (0.20.0 release review: source audit against the v0.11.0..main delta, verified corrections applied; no screenshot in scope; no browser walkthrough of the procedures or operator rehearsal; earlier evidence retained in git history)",
    "language": "agent:/root/min747 (es translation of the release corrections with catalog UI labels; equivalent meaning self-reviewed; agent review, not human acceptance)",
    "date": "2026-10-20"
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
      "caption": "Antes de activar una integración, compruebe adónde envía los datos y qué costes continuados genera.",
      "revision": 9,
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
      "revision": 9,
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

La configuración de la instancia determina los orígenes públicos, los secretos y los servicios disponibles. Conserve las credenciales existentes antes de cambiar el entorno protegido. Configure cada proveedor opcional por completo y compruebe después la exposición de la red y las tareas programadas autenticadas.

## Configurar orígenes, secretos y capacidades de la instancia {#instance-configuration}

Defina `MINDDY_PUBLIC_APP_URL` como una única URL de origen absoluta, sin ruta ni barra final. Los despliegues públicos usan HTTPS; `localhost` y una red IPv4 privada de confianza pueden usar HTTP. `MINDDY_PUBLIC_SUPABASE_URL` y `MINDDY_PUBLIC_SUPABASE_ANON_KEY` deben corresponder al mismo entorno Supabase. Esos valores llegan al navegador. `SUPABASE_SERVICE_ROLE_KEY` es exclusiva del servidor y obligatoria en producción: no la coloque en variables públicas ni en un bundle cliente. La URL de la base de datos sirve a las herramientas y no sustituye la configuración de la API.

### Conservar los secretos {#secrets}

El instalador genera los valores ausentes de `GIT_STATE_SECRET`, `GIT_TOKEN_ENCRYPTION_SECRET`, `AI_KEY_ENCRYPTION_SECRET`, `FEEDBACK_SSO_ENCRYPTION_SECRET`, `MINDDY_DATA_ROOT_KEY` y `CRON_SECRET`. La clave raíz de contenido debe tener exactamente 64 caracteres hexadecimales. Consérvela fuera de PostgreSQL con una copia de recuperación protegida. Mantenga todo el archivo de entorno con permisos `0600` y fuera de Git. No lo ejecute como código shell ni lo imprima. Repetir la instalación no rota los secretos. Perder claves de cifrado puede hacer ilegibles los datos existentes; una rotación deliberada exige el procedimiento de recuperación correspondiente.

### Aplicar y comprobar un cambio {#capabilities}

`MINDDY_PUBLIC_SITE_NAME` y `MINDDY_PUBLIC_CONTACT_EMAIL` identifican la instancia. `ADMIN_EMAILS` contiene las direcciones de los administradores, separadas por comas; el acceso privilegiado también exige MFA. `OAUTH_ISSUER` normalmente queda vacío, salvo que publique OAuth de forma intencionada en otra URL de origen estable. Mantenga desactivadas la IA y la facturación gestionadas en self-hosted. Active los servicios opcionales solo cuando su configuración esté completa. Reinicie o recree la aplicación tras cambiar los valores públicos de ejecución; la imagen OCI no requiere recompilación. Ejecute doctor para distinguir capacidades incompletas de fallos del núcleo y pruebe los enlaces de cuenta y callbacks en la URL de origen prevista.

### Configurar comentarios e informes de documentación {#product-feedback}

Defina `MINDDY_FEEDBACK_KEY` con una clave de integración de comentarios para activar el envío de comentarios en la aplicación. Para los informes de documentación, cree una integración de comentarios independiente en el proyecto receptor, seleccione Documentation como objetivo predeterminado y guarde su clave en `MINDDY_DOCUMENTATION_FEEDBACK_KEY`. Ambas claves permanecen en el servidor. Los envíos utilizan `/api/v1/feedback` en el origen definido por `MINDDY_PUBLIC_APP_URL`. Reinicie la aplicación después de cambiar estos valores.

Para informar de un error desde un artículo se requiere una cuenta con la sesión iniciada. Tras iniciar sesión, el lector vuelve al mismo artículo con el diálogo de comentarios abierto. El título y la descripción están inicialmente vacíos. Después del envío, el servidor añade el identificador del artículo, el idioma, la revisión y la URL pública; estos datos no son campos editables del formulario. La integración de documentación vincula automáticamente el comentario al objetivo seleccionado. Sin `MINDDY_DOCUMENTATION_FEEDBACK_KEY`, el botón para informar de errores está desactivado y muestra una explicación.

## Activar proveedores opcionales de forma explícita {#optional-providers}

El núcleo no exige Stripe, PostHog, una cuenta Cloud ni una clave de IA gestionada por minddy. Los servicios externos tienen costes, permisos y destinos de datos propios. Revise sus condiciones antes de activarlos. El diagnóstico informa de valores ausentes sin elegir un proveedor alternativo. Una instancia self-hosted puede usar claves de IA personales o endpoints locales accesibles. Mantenga `MINDDY_MANAGED_AI` y `MINDDY_MANAGED_BILLING` desactivados; configurar una clave OpenRouter por sí sola no selecciona Cloud.

![Diagrama: Operador elige capacidad opcional. Credenciales completas y condiciones. Destino de datos externo explícito. Verificar conducta y controlar costes.](/documentation/es/optional-providers-flow.svg)

### Configurar proveedores completos {#configure}

El email de la aplicación necesita `EMAIL_PROVIDER=resend`, `RESEND_API_KEY`, `FEEDBACK_EMAIL_FROM` e `INVITATION_EMAIL_FROM`. `console` no se admite en producción; el SMTP de Auth se configura por separado. Web Push necesita el par VAPID público/privado y `VAPID_SUBJECT`; las suscripciones existentes dependen de ese par. Analytics necesita la clave y el host de PostHog; el seguimiento de errores también exige `MINDDY_PUBLIC_ERROR_TRACKING=1`. El instalador ofrece `application-email` y `web-push`, pero usted debe proporcionar las credenciales externas. No use remitentes minddy ni credenciales de sus versiones nativas en otra instancia.

### Conectar Git y ejecución de código {#git-and-code}

Los adaptadores admiten GitHub.com y GitLab.com, no GitHub Enterprise Server ni GitLab autogestionado. Las conexiones iniciadas por usuarios pueden utilizar el relay gestionado. Puede excluirlo con `--no-forge-relay` o `MINDDY_FORGE_RELAY=0` y configurar aplicaciones propias. Las conexiones existentes conservan su canal hasta que se reconectan. Numo no ejecuta código, así que el servidor de referencia no necesita ningún runner de código ni sandbox, y ningún servicio recibe el socket de Docker. Los ajustes que haya dejado una versión anterior, como `AGENT_EXECUTION_BACKEND`, `AGENT_RUNNER_URL`, `AGENT_RUNNER_SECRET`, `AGENT_CONTROL_ORIGIN` y las credenciales de Vercel Sandbox, se ignoran; elimínelos del entorno protegido.

## Publicar los orígenes y ejecutar tareas programadas {#proxy-network-and-jobs}

Un servicio público requiere un proxy inverso TLS y una redirección de HTTP a HTTPS. Las URL de origen de la aplicación y Supabase, las redirecciones Auth, los callbacks OAuth y los encabezados reenviados deben concordar. Mantenga PostgreSQL, Studio y los puertos internos fuera de Internet. En full, la aplicación usa `http://kong:8000` internamente, mientras el navegador y los enlaces conservan la URL pública de Supabase. HTTP privado exige `localhost` o una red IPv4 privada de confianza, sin redirección de puertos del router.

![Diagrama: Proxy HTTPS público. Orígenes públicos de la aplicación y Supabase. Base de datos y puertos internos privados. Tareas autenticadas; paradas en mantenimiento.](/documentation/es/proxy-network-and-jobs-flow.svg)

### Configurar programación autenticada {#schedules}

Los perfiles Compose de referencia inician su planificador y el instalador genera `CRON_SECRET`. Un despliegue personalizado desde el código necesita un planificador HTTP equivalente. Cada petición envía `Authorization: Bearer <CRON_SECRET>`; si el secreto está vacío o no coincide, recibe 401. No registre ese encabezado. Los horarios siguientes están en UTC y pertenecen a esta versión. Utilice las rutas de la versión desplegada, porque pueden cambiar.

Respecto al planificador de v0.11.0, esta versión añade `numo-turns`, `forge-relay-maintenance`, `page-materialization` e `issue-index`, y ya no llama a `/api/cron/agent-drain` ni a `/api/cron/automations`, que se retiraron junto con el trabajo de código de Numo y las automatizaciones de proyecto. Un planificador personalizado copiado de v0.11.0 debe actualizarse según esta tabla.

| Endpoint | Horario (UTC) |
| --- | --- |
| `/api/cron/feedback-analysis` | `0 * * * *` |
| `/api/cron/numo-turns` | `* * * * *` |
| `/api/cron/forge-relay-deliveries` | `* * * * *` |
| `/api/cron/forge-relay-maintenance` | `35 * * * *` |
| `/api/cron/page-materialization` | `* * * * *` |
| `/api/cron/smart-assign` | `*/5 * * * *` |
| `/api/cron/issue-index` | `25 * * * *` |
| `/api/cron/routines` | `*/5 * * * *` |
| `/api/cron/billing-sync` | `15 * * * *` |
| `/api/cron/fx-rate` | `30 15 * * *` |
| `/api/cron/encryption-maintenance` | `15 * * * *` |
| `/api/cron/data-retention` | `45 3 * * *` |

### Parar tareas durante mantenimiento {#maintenance}

Antes de una copia o migración, detenga el planificador, la aplicación, los workers y el acceso público a Supabase. Detener solo el servidor web deja posibles escrituras directas por API. Ejecute las comprobaciones en mantenimiento, con entradas y trabajos cerrados, y reabra solo cuando se hayan verificado la base de datos, Auth, Storage y la aplicación. Si un trabajo no arranca, compruebe en privado el planificador, la URL de origen y el secreto. Las rutinas requieren un planificador de servidor activo; no es necesario mantener abierta una aplicación de escritorio.

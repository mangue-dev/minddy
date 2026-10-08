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
  "revision": 2,
  "sourceRevision": 2,
  "owner": "@mangue-dev",
  "updatedAt": "2026-10-09",
  "compatibility": {
    "version": "0.11.1 candidate (89ebb59a5)",
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
      "deploy/self-hosted/scheduler.mjs"
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
      "caption": "Estos componentes tienen responsabilidades distintas. Operador elige capacidad opcional. Credenciales completas y condiciones. Destino de datos externo explícito. Verificar conducta y controlar costes.",
      "revision": 2,
      "reviewed": true,
      "capturedAt": "2026-10-08",
      "viewport": [
        720,
        640
      ],
      "theme": "neutral"
    },
    {
      "id": "proxy-network-and-jobs-flow",
      "kind": "diagram",
      "src": "/documentation/es/proxy-network-and-jobs-flow.svg",
      "alt": "Diagrama: Proxy HTTPS público. Orígenes públicos de la aplicación y Supabase. Runner, base y puertos privados. Tareas autenticadas; paradas en mantenimiento.",
      "caption": "Estos componentes tienen responsabilidades distintas. Proxy HTTPS público. Orígenes públicos de la aplicación y Supabase. Runner, base y puertos privados. Tareas autenticadas; paradas en mantenimiento.",
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
    "optional-providers-flow",
    "proxy-network-and-jobs-flow"
  ]
}
---

La configuración de la instancia conecta los orígenes públicos, los secretos protegidos y los proveedores opcionales con la red y las tareas programadas. Los siguientes apartados explican los requisitos y las comprobaciones de estos ajustes, además de la interrupción de las tareas durante el mantenimiento.

## Configurar orígenes, secretos y capacidades de la instancia {#instance-configuration}

Defina MINDDY_PUBLIC_APP_URL como una única URL de origen absoluta, sin ruta ni barra final. Los despliegues públicos usan HTTPS; localhost y una red IPv4 privada de confianza pueden usar HTTP. MINDDY_PUBLIC_SUPABASE_URL y MINDDY_PUBLIC_SUPABASE_ANON_KEY deben corresponder al mismo entorno Supabase. Esos valores llegan al navegador. SUPABASE_SERVICE_ROLE_KEY es exclusiva del servidor y obligatoria en producción: no la coloque en variables públicas ni en un bundle cliente. La URL de la base de datos sirve a las herramientas y no sustituye la configuración de la API.

### Conservar los secretos {#secrets}

El instalador genera los valores ausentes de GIT_STATE_SECRET, GIT_TOKEN_ENCRYPTION_SECRET, AI_KEY_ENCRYPTION_SECRET, FEEDBACK_SSO_ENCRYPTION_SECRET, MINDDY_DATA_ROOT_KEY, CRON_SECRET y AGENT_RUNNER_SECRET. La clave raíz de contenido debe tener exactamente 64 caracteres hexadecimales. Consérvela fuera de PostgreSQL con una copia de recuperación protegida. Mantenga todo el archivo de entorno con permisos 0600 y fuera de Git. No lo ejecute como código shell ni lo imprima. Repetir la instalación no rota los secretos. Perder claves de cifrado puede hacer ilegibles los datos existentes; una rotación deliberada exige el procedimiento de recuperación correspondiente.

### Aplicar y comprobar un cambio {#capabilities}

MINDDY_PUBLIC_SITE_NAME y MINDDY_PUBLIC_CONTACT_EMAIL identifican la instancia. ADMIN_EMAILS contiene las direcciones de los administradores, separadas por comas; el acceso privilegiado también exige MFA. OAUTH_ISSUER normalmente queda vacío, salvo que publique OAuth de forma intencionada en otra URL de origen estable. Mantenga desactivadas la IA y la facturación gestionadas en self-hosted. Active los servicios opcionales solo cuando su configuración esté completa. Reinicie o recree la aplicación tras cambiar los valores públicos de ejecución; la imagen OCI no requiere recompilación. Ejecute doctor para distinguir capacidades incompletas de fallos del núcleo y pruebe los enlaces de cuenta y callbacks en la URL de origen prevista.

## Activar proveedores opcionales de forma explícita {#optional-providers}

El núcleo no exige Stripe, PostHog, una cuenta Cloud ni una clave de IA gestionada por minddy. Los servicios externos tienen costes, permisos y destinos de datos propios. Revise sus condiciones antes de activarlos. El diagnóstico informa de valores ausentes sin elegir un proveedor alternativo. Una instancia self-hosted puede usar claves de IA personales o endpoints locales accesibles. Mantenga MINDDY_MANAGED_AI y MINDDY_MANAGED_BILLING desactivados; configurar una clave OpenRouter por sí sola no selecciona Cloud.

![Diagrama: Operador elige capacidad opcional. Credenciales completas y condiciones. Destino de datos externo explícito. Verificar conducta y controlar costes.](/documentation/es/optional-providers-flow.svg)

### Configurar proveedores completos {#configure}

El email de la aplicación necesita EMAIL_PROVIDER=resend, RESEND_API_KEY, FEEDBACK_EMAIL_FROM e INVITATION_EMAIL_FROM. console no se admite en producción; el SMTP de Auth se configura por separado. Web Push necesita el par VAPID público/privado y VAPID_SUBJECT; las suscripciones existentes dependen de ese par. Analytics necesita la clave y el host de PostHog; el seguimiento de errores también exige MINDDY_PUBLIC_ERROR_TRACKING=1. El instalador ofrece application-email y web-push, pero usted debe proporcionar las credenciales externas. No use remitentes minddy ni credenciales de sus versiones nativas en otra instancia.

### Conectar Git y ejecución de código {#git-and-code}

Los adaptadores admiten GitHub.com y GitLab.com, no GitHub Enterprise Server ni GitLab autogestionado. Las conexiones iniciadas por usuarios pueden utilizar el relay gestionado. Puede excluirlo con --no-forge-relay o MINDDY_FORGE_RELAY=0 y configurar aplicaciones propias. Las conexiones existentes conservan su canal hasta que se reconectan. El perfil de servidor incluye el runner Docker de confianza. Vercel Sandbox es una alternativa explícita que exige sus credenciales y una MINDDY_DATA_ROOT_KEY válida incluso si el cifrado de contenido está desactivado. La ejecución local de código en escritorio se ha retirado. Una configuración ausente bloquea la delegación; no ejecuta el trabajo en el ordenador del usuario.

La imagen publicada de la aplicación incluye Node.js y Git, pero elimina expresamente npm, npx y Corepack. El perfil Compose de referencia también selecciona esa imagen para los workers mediante AGENT_RUNNER_SANDBOX_IMAGE=MINDDY_IMAGE. Esto no basta para un nuevo worker de código: el bootstrap de OpenCode utiliza npm para instalar su runtime y su plugin fijados, incluso en un repositorio sin dependencias de proyecto. Sin npm, la ejecución se detiene en el bootstrap; la conversación no permite deducir que se haya modificado un archivo del proyecto ni que una prueba haya superado la validación. Utilice una imagen dedicada para workers, construida y verificada por el operador, con Node.js 24, npm, Git y las herramientas necesarias para el proyecto, sobrescribiendo AGENT_RUNNER_SANDBOX_IMAGE en el servicio runner. Mantenga las restricciones de aislamiento. Verifique el bootstrap, la clonación, las pruebas reales y el diff resultante antes de habilitar la delegación de código. Corregir los archivos del runner no proporciona estas herramientas al worker.

## Publicar los orígenes y ejecutar tareas programadas {#proxy-network-and-jobs}

Un servicio público requiere un proxy inverso TLS y una redirección de HTTP a HTTPS. Las URL de origen de la aplicación y Supabase, las redirecciones Auth, los callbacks OAuth y los encabezados reenviados deben concordar. Mantenga PostgreSQL, Studio, los puertos internos y el runner fuera de Internet. En full, la aplicación usa http://kong:8000 internamente, mientras el navegador y los enlaces conservan la URL pública de Supabase. HTTP privado exige localhost o una red IPv4 privada de confianza, sin redirección de puertos del router.

![Diagrama: Proxy HTTPS público. Orígenes públicos de la aplicación y Supabase. Runner, base y puertos privados. Tareas autenticadas; paradas en mantenimiento.](/documentation/es/proxy-network-and-jobs-flow.svg)

### Configurar programación autenticada {#schedules}

Los perfiles Compose de referencia inician su planificador y el instalador genera CRON_SECRET. Un despliegue personalizado desde el código necesita un planificador HTTP equivalente. Cada petición envía `Authorization: Bearer <CRON_SECRET>`; si el secreto está vacío o no coincide, recibe 401. No registre ese encabezado. Los horarios siguientes corresponden al candidato y están en UTC. Utilice las rutas de la versión desplegada, porque pueden cambiar.

El planificador publicado en v0.11.0 no incluye numo-turns. El candidato se ha corregido para llamarlo cada minuto. La tabla describe el candidato corregido; no dé por hecho que ese trabajo existe en una instalación v0.11.0 sin cambios.

| Endpoint | Horario (UTC) |
| --- | --- |
| `/api/cron/feedback-analysis` | `0 * * * *` |
| `/api/cron/agent-drain` | `*/2 * * * *` |
| `/api/cron/numo-turns` | `* * * * *` |
| `/api/cron/forge-relay-deliveries` | `* * * * *` |
| `/api/cron/forge-relay-maintenance` | `35 * * * *` |
| `/api/cron/automations` | `*/2 * * * *` |
| `/api/cron/smart-assign` | `*/5 * * * *` |
| `/api/cron/routines` | `*/5 * * * *` |
| `/api/cron/billing-sync` | `15 * * * *` |
| `/api/cron/fx-rate` | `30 15 * * *` |
| `/api/cron/encryption-maintenance` | `15 * * * *` |
| `/api/cron/data-retention` | `45 3 * * *` |

### Parar tareas durante mantenimiento {#maintenance}

Antes de una copia o migración, detenga el planificador, la aplicación, los workers y el acceso público a Supabase. Detener solo el servidor web deja posibles escrituras directas por API. Ejecute las comprobaciones en mantenimiento, con entradas y trabajos cerrados, y reabra solo cuando se hayan verificado la base de datos, Auth, Storage y la aplicación. Si un trabajo no arranca, compruebe en privado el planificador, la URL de origen y el secreto. Las rutinas requieren un planificador de servidor activo; no es necesario mantener abierta una aplicación de escritorio.

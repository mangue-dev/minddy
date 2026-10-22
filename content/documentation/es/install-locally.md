---
{
  "id": "install-locally",
  "locale": "es",
  "title": "Instancias locales",
  "summary": "Prepara un clon dedicado a la evaluación con Node.js 24, pnpm 10.28.0, Git, Supabase CLI y Docker en ejecución.",
  "topic": "Administrar una instancia",
  "type": "tutorial",
  "audiences": [
    "operator"
  ],
  "workflows": [
    "H02"
  ],
  "visibility": "public",
  "status": "published",
  "revision": 9,
  "sourceRevision": 8,
  "owner": "@mangue-dev",
  "updatedAt": "2026-10-22",
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
      "docs/self-hosting.md",
      "scripts/self-hosting-local.mjs",
      "content/knowledge/self-hosting.md",
      "app/api/mcp/route.ts",
      "lib/site.ts",
      "lib/server/app-origin.ts",
      "lib/server/oauth/issuer.ts",
      "app/api/oauth/register/route.ts",
      "lib/server/oauth/metadata.ts"
    ]
  },
  "review": {
    "revision": 9,
    "fact": "agent:/root/min747 (0.20.0 release review: source audit against the v0.11.0..main delta, verified corrections applied; 1 screenshot(s) recaptured on 2026-10-20 from the local candidate and inspected; no browser walkthrough of the procedures or operator rehearsal; earlier evidence retained in git history); agent:claude-code (it/es catalog review recapture of install-locally-wizard on 2026-10-22 from a local candidate of this branch against the preview demo account; images inspected; no form submitted); agent:claude-code (manual figures rebuilt on the Aurora demo, catalog review labels and informal register; figures recaptured on 2026-10-22 from a local candidate against the preview demo account and inspected; no form submitted)",
    "language": "agent:/root/min747 (es translation of the release corrections with catalog UI labels; equivalent meaning self-reviewed; agent review, not human acceptance); agent:claude-code (es figure update after the catalog review; agent review, not human acceptance); agent:claude-code (es manual figures rebuilt on the Aurora demo, catalog review labels and informal register; self-reviewed; agent review, not human acceptance)",
    "date": "2026-10-22"
  },
  "related": [
    "workspace-encryption",
    "self-hosted-diagnostics"
  ],
  "aliases": [],
  "tags": [
    "Ejecutar una instancia local desde la aplicación de escritorio"
  ],
  "figures": [
    {
      "id": "install-locally-flow",
      "kind": "diagram",
      "src": "/documentation/es/install-locally-flow.svg",
      "alt": "Diagrama: La aplicación de escritorio selecciona el clon. Aplicación loopback: puerto 6463. Supabase mínimo y datos duraderos. Salir detiene la aplicación y el backend.",
      "caption": "La aplicación de escritorio controla los servicios locales del clon elegido, cuyos datos se conservan de forma duradera.",
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
            "title": "Aplicación de escritorio: elegir clon"
          },
          {
            "title": "Aplicación loopback: puerto 6463"
          },
          {
            "title": "Supabase mínimo y datos duraderos"
          },
          {
            "title": "Salir detiene aplicación y backend"
          }
        ]
      }
    },
    {
      "id": "install-locally-wizard",
      "kind": "screenshot",
      "src": "/documentation/es/install-locally-wizard.png",
      "alt": "Asistente público de instalación con el perfil de este ordenador seleccionado.",
      "caption": "Elige la instalación personal cuando la aplicación de escritorio deba gestionar los servicios locales.",
      "revision": 9,
      "reviewed": true,
      "capturedAt": "2026-10-22",
      "viewport": [
        944,
        692
      ],
      "theme": "light",
      "padding": 24,
      "deviceScaleFactor": 2
    }
  ],
  "requiredFigures": [
    "install-locally-flow"
  ]
}
---

## Ejecutar una instancia local desde la aplicación de escritorio {#install-locally}

Prepara un clon dedicado a la evaluación con Node.js 24, `pnpm` 10.28.0, Git, Supabase CLI y Docker en ejecución. Reserva al menos 4 GB de RAM libre, dos núcleos y 10 GB libres en SSD; se recomiendan 8 GB, cuatro núcleos y 20 GB. Instala primero la aplicación de escritorio firmada desde la página de descargas. En Windows se distribuye mediante Microsoft Store; macOS y Linux tienen sus descargas correspondientes. Selecciona en el clon la versión que deseas evaluar antes de instalar las dependencias.

```bash
git clone https://github.com/mangue-dev/minddy.git
cd minddy
git checkout v0.20.0
corepack enable
corepack prepare pnpm@10.28.0 --activate
pnpm install --frozen-lockfile
```

![Diagrama: La aplicación de escritorio selecciona el clon. Aplicación loopback: puerto 6463. Supabase mínimo y datos duraderos. Salir detiene la aplicación y el backend.](/documentation/es/install-locally-flow.svg)


![Asistente público de instalación con el perfil de este ordenador seleccionado.](/documentation/es/install-locally-wizard.png)

Las nuevas instalaciones locales cifran el contenido del espacio de trabajo de forma predeterminada. Para registrar una elección explícita, ejecuta `pnpm bootstrap:supabase -- --minimal --app-url http://localhost:6463 --encryption enabled` (o `--encryption disabled`) en el clon antes de abrirlo en la aplicación; los inicios posteriores conservan la elección guardada. Consulta el [cifrado del espacio de trabajo](/es/documentacion/workspace-encryption#workspace-encryption).

## Dejar que la aplicación gestione los servicios {#launch}

Abre el menú nativo minddy. En Windows y Linux, pulsa Alt para mostrar la barra de menús; en macOS, utiliza la barra global. Abre el diálogo de conexión al servidor, elige la opción de instancia local y selecciona la raíz del clon. La aplicación ejecuta `self-host:local --no-open`, prepara un Supabase mínimo, aplica las migraciones y la configuración de Storage, compila cuando hace falta y espera a que `/api/health` responda antes de abrir el registro. Solo escucha en loopback, en el puerto 6463, recuerda la carpeta y controla tanto el inicio como la parada.

## Disponibilidad de MCP y acceso a la red {#mcp-network-access}

MCP está incluido en minddy autoalojado y se inicia con la aplicación. Funciona directamente en `/api/mcp`, en el origen de la instancia configurado con `MINDDY_PUBLIC_APP_URL`. Incluye el descubrimiento OAuth y el registro dinámico de clientes: no necesitas un servidor MCP separado, una aplicación OAuth dedicada ni un proxy de minddy Cloud. Conecta tu cliente MCP al endpoint de tu instancia, inicia sesión y concede acceso mediante el consentimiento en el navegador.

La disponibilidad del servicio no garantiza que sea accesible por la red. Tanto el cliente MCP como el navegador de autorización deben poder acceder a las URL MCP y OAuth anunciadas. Si defines explícitamente `OAUTH_ISSUER`, ese origen también debe ser accesible. El cliente debe admitir la conexión, el flujo OAuth y la ruta de red elegida; algunos clientes exigen HTTPS incluso en redes privadas.

Este perfil gestionado por la aplicación de escritorio solo escucha en la interfaz de bucle local. Un cliente MCP compatible en el mismo ordenador puede utilizar `http://localhost:6463/api/mcp`; `localhost` y `127.0.0.1` identifican el ordenador que inicia la conexión. Otro ordenador o un agente alojado en la nube no puede acceder directamente a este perfil. Para acceder por LAN/VPN, utiliza una instalación de servidor con un origen configurado accesible, como `http://192.168.1.50`, y permite el acceso al puerto de la aplicación mediante la dirección de escucha, el cortafuegos y el enrutamiento. Fuera de esa red, el cliente necesita un origen HTTPS accesible como `https://tickets.example.com`, u otra ruta de red compatible. La instalación local no permite automáticamente el acceso desde Internet.

[Consulta la guía de acceso a la red de MCP antes de conectar un cliente remoto](/docs/minddy-mcp#network-access).

## Recuperarse de un fallo {#recover}

Comprueba Docker, la disponibilidad de la CLI, el espacio libre y si otro proceso ocupa el puerto 6463. Puedes ejecutar `pnpm self-host:local` desde el terminal para diagnosticar el problema. Detenlo con Ctrl+C antes de devolver el control a la aplicación, que no asume procesos ajenos. Salir por completo de la aplicación normalmente también detiene Supabase; cerrar una ventana no equivale a salir. La opción `--keep-backend` modifica ese comportamiento de forma explícita. No utilices `supabase db reset --local` como método de recuperación: destruye los datos de evaluación. Comprueba la creación de una cuenta, un proyecto, una incidencia y un archivo adjunto antes de confiar en la instancia.

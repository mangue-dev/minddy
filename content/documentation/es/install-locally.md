---
{
  "id": "install-locally",
  "locale": "es",
  "title": "Instancias locales",
  "summary": "Prepare un clon dedicado a la evaluación con Node.js 24, pnpm 10.28.0, Git, Supabase CLI y Docker en ejecución.",
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
  "revision": 5,
  "sourceRevision": 5,
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
      "docs/self-hosting.md",
      "scripts/self-hosting-local.mjs",
      "content/knowledge/self-hosting.md",
      "content/documentation/reviews/visual-refresh-captures-2026-10-09.json",
      "content/documentation/reviews/editorial-clarity-en-fr-2026-10-09.md",
      "content/documentation/reviews/editorial-clarity-de-es-2026-10-09.md",
      "content/documentation/reviews/editorial-clarity-it-pt-BR-2026-10-09.md",
      "app/api/mcp/route.ts",
      "lib/site.ts",
      "lib/server/app-origin.ts",
      "lib/server/oauth/issuer.ts",
      "app/api/oauth/register/route.ts",
      "lib/server/oauth/metadata.ts"
    ]
  },
  "review": {
    "revision": 5,
    "fact": "agent:/root/german_spanish_review (structural consolidation review; prior procedural evidence retained; no operational rerun); agent:/root (visual usefulness, figure framing and preserved procedures; previous operational evidence retained); agent:/root (technical-reference formatting; prior factual evidence retained; no operational rerun); agent:/root (MIN-672 MCP availability and network guidance checked against route, origin, discovery, registration and local launcher source; no operational rerun)",
    "language": "agent:/root/german_spanish_review (es title, summary, lead and heading review; retained body comparison); agent:/root/editorial_de_es (collection-caption clarity); agent:/root (inline-code syntax and unchanged-text review); agent:/root (MIN-672 es network guidance and terminology review)",
    "date": "2026-10-09"
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
      "revision": 5,
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
      "caption": "Elija la instalación personal cuando la aplicación de escritorio deba gestionar los servicios locales.",
      "revision": 5,
      "reviewed": true,
      "capturedAt": "2026-10-09",
      "viewport": [
        944,
        504
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

Prepare un clon dedicado a la evaluación con Node.js 24, `pnpm` 10.28.0, Git, Supabase CLI y Docker en ejecución. Reserve al menos 4 GB de RAM libre, dos núcleos y 10 GB libres en SSD; se recomiendan 8 GB, cuatro núcleos y 20 GB. Instale primero la aplicación de escritorio firmada desde la página de descargas. En Windows se distribuye mediante Microsoft Store; macOS y Linux tienen sus descargas correspondientes. Seleccione en el clon la versión que desea evaluar antes de instalar las dependencias.

```bash
git clone https://github.com/mangue-dev/minddy.git
cd minddy
git checkout v0.11.0
corepack enable
corepack prepare pnpm@10.28.0 --activate
pnpm install --frozen-lockfile
```

![Diagrama: La aplicación de escritorio selecciona el clon. Aplicación loopback: puerto 6463. Supabase mínimo y datos duraderos. Salir detiene la aplicación y el backend.](/documentation/es/install-locally-flow.svg)


![Asistente público de instalación con el perfil de este ordenador seleccionado.](/documentation/es/install-locally-wizard.png)

## Dejar que la aplicación gestione los servicios {#launch}

Abra el menú nativo minddy. En Windows y Linux, pulse Alt para mostrar la barra de menús; en macOS, utilice la barra global. Abra el diálogo de conexión al servidor, elija la opción de instancia local y seleccione la raíz del clon. La aplicación ejecuta `self-host:local --no-open`, prepara un Supabase mínimo, aplica las migraciones y la configuración de Storage, compila cuando hace falta y espera a que `/api/health` responda antes de abrir el registro. Solo escucha en loopback, en el puerto 6463, recuerda la carpeta y controla tanto el inicio como la parada.

## Disponibilidad de MCP y acceso a la red {#mcp-network-access}

MCP está incluido en minddy autoalojado y se inicia con la aplicación. Funciona directamente en `/api/mcp`, en el origen de la instancia configurado con `MINDDY_PUBLIC_APP_URL`. Incluye el descubrimiento OAuth y el registro dinámico de clientes: no necesita un servidor MCP separado, una aplicación OAuth dedicada ni un proxy de minddy Cloud. Conecte su cliente MCP al endpoint de su instancia, inicie sesión y conceda acceso mediante el consentimiento en el navegador.

La disponibilidad del servicio no garantiza que sea accesible por la red. Tanto el cliente MCP como el navegador de autorización deben poder acceder a las URL MCP y OAuth anunciadas. Si define explícitamente `OAUTH_ISSUER`, ese origen también debe ser accesible. El cliente debe admitir la conexión, el flujo OAuth y la ruta de red elegida; algunos clientes exigen HTTPS incluso en redes privadas.

Este perfil gestionado por la aplicación de escritorio solo escucha en la interfaz de bucle local. Un cliente MCP compatible en el mismo ordenador puede utilizar `http://localhost:6463/api/mcp`; `localhost` y `127.0.0.1` identifican el ordenador que inicia la conexión. Otro ordenador o un agente alojado en la nube no puede acceder directamente a este perfil. Para acceder por LAN/VPN, utilice una instalación de servidor con un origen configurado accesible, como `http://192.168.1.50`, y permita el acceso al puerto de la aplicación mediante la dirección de escucha, el cortafuegos y el enrutamiento. Fuera de esa red, el cliente necesita un origen HTTPS accesible como `https://tickets.example.com`, u otra ruta de red compatible. La instalación local no permite automáticamente el acceso desde Internet.

[Consulte la guía de acceso a la red de MCP antes de conectar un cliente remoto](/docs/minddy-mcp#network-access).

## Recuperarse de un fallo {#recover}

Si el inicio falla, copie el informe de diagnóstico desde el menú nativo de ayuda. Compruebe Docker, la disponibilidad de la CLI, el espacio libre y si otro proceso ocupa el puerto 6463. Puede ejecutar `pnpm self-host:local` desde el terminal para diagnosticar el problema. Deténgalo con Ctrl+C antes de devolver el control a la aplicación, que no asume procesos ajenos. Salir por completo de la aplicación normalmente también detiene Supabase; cerrar una ventana no equivale a salir. La opción `--keep-backend` modifica ese comportamiento de forma explícita. No utilice `supabase db reset --local` como método de recuperación: destruye los datos de evaluación. Compruebe la creación de una cuenta, un proyecto, una incidencia y un archivo adjunto antes de confiar en la instancia.

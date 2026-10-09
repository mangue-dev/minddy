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
      "docs/self-hosting.md",
      "scripts/self-hosting-local.mjs",
      "content/knowledge/self-hosting.md"
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
      "caption": "Estos componentes tienen responsabilidades distintas. La aplicación de escritorio selecciona el clon. Aplicación loopback: puerto 6463. Supabase mínimo y datos duraderos. Salir detiene la aplicación y el backend.",
      "revision": 2,
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
      "revision": 2,
      "reviewed": true,
      "capturedAt": "2026-10-08",
      "viewport": [
        944,
        500
      ],
      "theme": "light",
      "padding": 24
    }
  ],
  "requiredFigures": [
    "install-locally-flow"
  ]
}
---

## Ejecutar una instancia local desde la aplicación de escritorio {#install-locally}

Prepare un clon dedicado a la evaluación con Node.js 24, pnpm 10.28.0, Git, Supabase CLI y Docker en ejecución. Reserve al menos 4 GB de RAM libre, dos núcleos y 10 GB libres en SSD; se recomiendan 8 GB, cuatro núcleos y 20 GB. Instale primero la aplicación de escritorio firmada desde la página de descargas. En Windows se distribuye mediante Microsoft Store; macOS y Linux tienen sus descargas correspondientes. Seleccione en el clon la versión que desea evaluar antes de instalar las dependencias.

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

Abra el menú nativo minddy. En Windows y Linux, pulse Alt para mostrar la barra de menús; en macOS, utilice la barra global. Abra el diálogo de conexión al servidor, elija la opción de instancia local y seleccione la raíz del clon. La aplicación ejecuta self-host:local --no-open, prepara un Supabase mínimo, aplica las migraciones y la configuración de Storage, compila cuando hace falta y espera a que /api/health responda antes de abrir el registro. Solo escucha en loopback, en el puerto 6463, recuerda la carpeta y controla tanto el inicio como la parada.

## Recuperarse de un fallo {#recover}

Si el inicio falla, copie el informe de diagnóstico desde el menú nativo de ayuda. Compruebe Docker, la disponibilidad de la CLI, el espacio libre y si otro proceso ocupa el puerto 6463. Puede ejecutar pnpm self-host:local desde el terminal para diagnosticar el problema. Deténgalo con Ctrl+C antes de devolver el control a la aplicación, que no asume procesos ajenos. Salir por completo de la aplicación normalmente también detiene Supabase; cerrar una ventana no equivale a salir. La opción --keep-backend modifica ese comportamiento de forma explícita. No utilice supabase db reset --local como método de recuperación: destruye los datos de evaluación. Compruebe la creación de una cuenta, un proyecto, una incidencia y un archivo adjunto antes de confiar en la instancia.

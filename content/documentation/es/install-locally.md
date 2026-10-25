---
{
  "id": "install-locally",
  "locale": "es",
  "title": "Instancias locales",
  "summary": "Instala una instancia local privada desde la aplicación de escritorio o abre un clon preparado, con Node.js 24.22.1 o una versión 24.x posterior, pnpm 10.28.0, Git, Supabase CLI y Docker en ejecución.",
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
  "revision": 11,
  "sourceRevision": 10,
  "owner": "@mangue-dev",
  "updatedAt": "2026-10-25",
  "compatibility": {
    "version": "0.20.1 (release documentation gate)",
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
      "lib/server/oauth/metadata.ts",
      "lib/desktop/local-installer.ts",
      "desktop/src/local-installer.ts",
      "lib/desktop/local-toolchain.ts",
      "desktop/src/local-toolchain.ts",
      "components/desktop/server-choice.tsx",
      "components/desktop/server-choice-entry.tsx",
      "lib/desktop/server-choice.ts",
      "desktop/src/main.ts",
      "desktop/src/menu.ts",
      "components/auth/auth-chrome.tsx",
      "lib/desktop/local-account.ts",
      "desktop/src/local-account.ts"
    ]
  },
  "review": {
    "revision": 11,
    "fact": "agent:/root/min747 (0.20.0 release review: source audit against the v0.11.0..main delta, verified corrections applied; 1 screenshot(s) recaptured on 2026-10-20 from the local candidate and inspected; no browser walkthrough of the procedures or operator rehearsal; earlier evidence retained in git history); agent:claude-code (it/es catalog review recapture of install-locally-wizard on 2026-10-22 from a local candidate of this branch against the preview demo account; images inspected; no form submitted); agent:claude-code (manual figures rebuilt on the Aurora demo, catalog review labels and informal register; figures recaptured on 2026-10-22 from a local candidate against the preview demo account and inspected; no form submitted); agent:claude-code (0.20.1 release documentation gate: Node.js minimum aligned with README and docs/self-hosting.md after MIN-780; release delta v0.20.0..main audited against the manual; no screenshot in scope); agent:claude-code (MIN-781 desktop onboarding and built-in local installer: source review of lib/desktop/local-installer.ts, desktop/src/local-installer.ts, lib/desktop/onboarding-copy.ts, desktop/src/server-picker.ts, desktop/src/main.ts and scripts/self-hosting-local.mjs; installer procedure, labels and --prepare-only documented, manual clone kept as the alternative; automatic installation of missing tools checked against lib/desktop/local-toolchain.ts and desktop/src/local-toolchain.ts (requirement states, tool steps, app-owned toolchain folder, system prompts per platform, Linux sign-out, Install manually); then the server choice moved from a separate window to a screen in the app window: wording, Cancel, leaving the screen and the Internet requirement checked against components/desktop/server-choice.tsx, app/desktop/welcome/page.tsx, lib/desktop/server-choice.ts and desktop/src/main.ts; no browser or desktop walkthrough, no installation run; no screenshot recaptured); then the server choice bundled in the desktop app (offline, first screen), checked against components/desktop/server-choice-entry.tsx and desktop/src/server-choice.ts; then the self-hosted step regrouped into three cards and one existing-installation screen, checked against components/desktop/server-choice.tsx; then the first-launch welcome removed: the app starts on Cloud sign-up and Self-host minddy under the auth forms opens the self-hosting page, checked against desktop/src/main.ts, components/auth/auth-chrome.tsx and components/desktop/server-choice.tsx; then the installer's account managed by the app: no email, automatic sign-in on the local instance, checked against lib/desktop/local-account.ts, desktop/src/local-account.ts, desktop/src/local-installer.ts, components/desktop/server-choice.tsx and components/auth/desktop-local-sign-in.tsx; no installation run, no screenshot recaptured",
    "language": "agent:/root/min747 (es translation of the release corrections with catalog UI labels; equivalent meaning self-reviewed; agent review, not human acceptance); agent:claude-code (es figure update after the catalog review; agent review, not human acceptance); agent:claude-code (es manual figures rebuilt on the Aurora demo, catalog review labels and informal register; self-reviewed; agent review, not human acceptance); agent:claude-code (es Node.js minimum; self-reviewed; agent review, not human acceptance); agent:claude-code (es translation of the installer and server window rewrite with onboarding window and catalog labels, then automatic tool installation with catalog labels, register checked; equivalent meaning self-reviewed key by key; then window-to-screen wording, Cancel and Internet requirement with catalog labels; then the self-hosted step regrouped into three cards and one existing-installation screen, with catalog labels; then the first-launch welcome removed: the app starts on Cloud sign-up and Self-host minddy under the auth forms opens the self-hosting page, with catalog labels; then the installer's account managed by the app: no email, automatic sign-in on the local instance, with catalog labels and informal register; agent review, not human acceptance)",
    "date": "2026-10-25"
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
      "revision": 11,
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
      "revision": 11,
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

## Instalar minddy en este equipo {#install-locally}

Una instancia local ejecuta minddy con un Supabase mínimo en Docker en un solo equipo, para evaluarlo o para uso personal. Sus datos se quedan en ese equipo, y la aplicación de escritorio inicia y detiene sus servicios. Usa Git, Node.js 24.22.1 o una versión 24.x posterior, `pnpm` 10.28.0, Supabase CLI y Docker en ejecución. La aplicación de escritorio instala lo que falte; un clon que prepares tú mismo los necesita de antemano. Reserva al menos 4 GB de RAM libre, dos núcleos y 10 GB libres en SSD; se recomiendan 8 GB, cuatro núcleos y 20 GB. Instala primero la aplicación de escritorio firmada desde la página de descargas. En Windows se distribuye mediante Microsoft Store; macOS y Linux tienen sus descargas correspondientes.

La aplicación de escritorio incluye un instalador que ejecuta todo el procedimiento por ti:

1. Abre la aplicación de escritorio. Se inicia en minddy Cloud: el primer inicio abre su pantalla de registro. Haz clic en **Autoalojar minddy**, en la parte inferior de la pantalla de inicio de sesión o de registro. Cuando ya hayas iniciado sesión, abre la misma pantalla con **Connect to a Server…** en el menú nativo minddy (el menú nativo está en inglés; en Windows y Linux, pulsa Alt para mostrar la barra de menús) o desde **Ajustes de cuenta** → **Preferencias** → **Aplicación de escritorio** → **Servidor conectado** → **Cambiar…**.
2. En **Autoalojar minddy**, elige **Instalar en este equipo**.
3. En **Requisitos**, la aplicación comprueba Git, Node.js 24, pnpm, Supabase CLI y Docker. Una herramienta que falta muestra **No encontrado; se instalará**, y un Node.js anterior, **Se encontró la versión …; se instalará Node.js 24 para minddy**. Un Docker instalado pero detenido muestra **Instalado pero detenido; se iniciará**. No tienes que instalar nada antes: **Instalar** se encarga. **Comprobar de nuevo** repite la comprobación.
4. Revisa la **Carpeta de instalación**. De forma predeterminada es una carpeta `minddy` en tu carpeta personal; **Elegir…** permite seleccionar otra. Si la carpeta elegida ya contiene otros archivos, la aplicación instala minddy en una carpeta `minddy` dentro de ella.
5. Haz clic en **Instalar**. La aplicación no pide ningún correo: una nota explica que minddy crea tu cuenta en este equipo e inicia sesión por ti.
6. Mantén la ventana abierta mientras se ejecutan los pasos. Las herramientas que faltan van primero, cada una en su propio paso: **Instalar Git**, **Instalar Node.js 24**, **Instalar pnpm**, **Instalar Supabase CLI** y después **Instalar Docker** o **Iniciar Docker**. **Descargar minddy**, seguido del número de versión, hace un `git clone` superficial de la versión que también usa la guía pública de instalación. **Instalar dependencias** ejecuta `pnpm install --frozen-lockfile`, **Configurar la instancia** convierte tu cuenta local en administradora de la instancia, **Preparar Supabase y compilar la app** ejecuta `pnpm self-host:local -- --no-open --prepare-only` **Iniciar minddy** inicia el entorno local y **Crear tu cuenta local** crea tu cuenta en la instancia. La primera instalación puede tardar varios minutos mientras Docker descarga las imágenes de Supabase y se compila la aplicación.
7. Cuando minddy está en marcha, la aplicación lo abre con la sesión ya iniciada en tu cuenta local.

La cuenta local es una cuenta normal, con el nombre de tu cuenta de usuario del equipo y la dirección `owner@local.minddy.app`. Administra la instancia, y los ajustes y la propiedad de los proyectos funcionan como siempre. La aplicación genera su contraseña y la guarda cifrada en el llavero del sistema: nunca la escribes, y la página solo recibe una sesión. Cada vez que la ventana muestra esta instancia, la aplicación inicia la sesión de la cuenta por sí sola tras una breve pantalla **Abriendo tu minddy…**. Si reinstalas en una carpeta cuyos datos de Supabase se conservaron, la aplicación encuentra la misma cuenta y le asigna una contraseña nueva; tus datos se mantienen. Esto solo se aplica a una instancia instalada por la aplicación: una carpeta abierta con **Usar una instalación existente** › **En este equipo** conserva sus propias cuentas y el inicio de sesión habitual, y los servidores remotos siempre usan el inicio de sesión habitual.

Node.js, pnpm y Supabase CLI se instalan sin permisos de administrador en una carpeta `toolchain` dentro de la carpeta de datos de usuario de la aplicación. Node.js procede del archivo oficial de nodejs.org, verificado con las sumas SHA-256 publicadas; pnpm 10.28.0 y Supabase CLI 2.115.0 se instalan con npm. Este Node.js no sustituye al que ya tenga el sistema: la aplicación lo pone primero en `PATH` solo para su instalador y su entorno local.

Git y Docker pasan por la confirmación de tu sistema. En macOS, confirma las herramientas de desarrollo de línea de comandos en el diálogo de Apple para obtener Git. En Windows, la aplicación añade MinGit, la versión portátil de Git for Windows, a la misma carpeta tras comprobar su resumen criptográfico. En macOS y Windows, la aplicación descarga Docker Desktop, comprueba que lo firmó Docker Inc, lo instala y lo abre. macOS puede pedir una contraseña de administrador; Windows pide permiso mediante el Control de cuentas de usuario y muestra el instalador de Docker. Después, acepta la licencia y los avisos de permisos de Docker Desktop. En Linux, un único aviso de contraseña del sistema instala Git con el gestor de paquetes de tu distribución y Docker Engine con el script oficial `get.docker.com` de Docker, inicia el servicio de Docker y te añade al grupo `docker`. Cierra sesión y vuelve a entrar para que tu cuenta pueda usar Docker, y haz clic en **Reintentar**.

Después, la aplicación recuerda la carpeta y controla el inicio y la parada de los servicios locales, como se describe en [Usar un clon preparado](#launch). Igual que una instalación manual, la nueva instancia cifra el contenido del espacio de trabajo de forma predeterminada. Consulta el [cifrado del espacio de trabajo](/es/documentacion/workspace-encryption#workspace-encryption).

![Diagrama: La aplicación de escritorio selecciona el clon. Aplicación loopback: puerto 6463. Supabase mínimo y datos duraderos. Salir detiene la aplicación y el backend.](/documentation/es/install-locally-flow.svg)

## Usar un clon preparado {#launch}

Prepara el clon tú mismo si quieres elegir la versión o revisar el repositorio antes de ejecutarlo. Usa un clon dedicado y selecciona en él la versión que deseas evaluar antes de instalar las dependencias.

```bash
git clone https://github.com/mangue-dev/minddy.git
cd minddy
git checkout v0.20.0
corepack enable
corepack prepare pnpm@10.28.0 --activate
pnpm install --frozen-lockfile
```

Las nuevas instalaciones locales cifran el contenido del espacio de trabajo de forma predeterminada. Para registrar una elección explícita, ejecuta `pnpm bootstrap:supabase -- --minimal --app-url http://localhost:6463 --encryption enabled` (o `--encryption disabled`) en el clon antes de abrirlo en la aplicación; los inicios posteriores conservan la elección guardada.

Abre el paso **Autoalojar minddy** como en el primer paso anterior, elige **Usar una instalación existente**, luego **En este equipo**, y selecciona la raíz del clon. La aplicación ejecuta `self-host:local --no-open`, prepara un Supabase mínimo, aplica las migraciones y la configuración de Storage, compila cuando hace falta y espera a que `/api/health` responda antes de abrir el registro. Solo escucha en loopback, en el puerto 6463, recuerda la carpeta y controla tanto el inicio como la parada. La guía pública de instalación describe la misma instalación personal.

![Asistente público de instalación con el perfil de este ordenador seleccionado.](/documentation/es/install-locally-wizard.png)

## Disponibilidad de MCP y acceso a la red {#mcp-network-access}

MCP está incluido en minddy autoalojado y se inicia con la aplicación. Funciona directamente en `/api/mcp`, en el origen de la instancia configurado con `MINDDY_PUBLIC_APP_URL`. Incluye el descubrimiento OAuth y el registro dinámico de clientes: no necesitas un servidor MCP separado, una aplicación OAuth dedicada ni un proxy de minddy Cloud. Conecta tu cliente MCP al endpoint de tu instancia, inicia sesión y concede acceso mediante el consentimiento en el navegador.

La disponibilidad del servicio no garantiza que sea accesible por la red. Tanto el cliente MCP como el navegador de autorización deben poder acceder a las URL MCP y OAuth anunciadas. Si defines explícitamente `OAUTH_ISSUER`, ese origen también debe ser accesible. El cliente debe admitir la conexión, el flujo OAuth y la ruta de red elegida; algunos clientes exigen HTTPS incluso en redes privadas.

Este perfil gestionado por la aplicación de escritorio solo escucha en la interfaz de bucle local. Un cliente MCP compatible en el mismo ordenador puede utilizar `http://localhost:6463/api/mcp`; `localhost` y `127.0.0.1` identifican el ordenador que inicia la conexión. Otro ordenador o un agente alojado en la nube no puede acceder directamente a este perfil. Para acceder por LAN/VPN, utiliza una instalación de servidor con un origen configurado accesible, como `http://192.168.1.50`, y permite el acceso al puerto de la aplicación mediante la dirección de escucha, el cortafuegos y el enrutamiento. Fuera de esa red, el cliente necesita un origen HTTPS accesible como `https://tickets.example.com`, u otra ruta de red compatible. La instalación local no permite automáticamente el acceso desde Internet.

[Consulta la guía de acceso a la red de MCP antes de conectar un cliente remoto](/docs/minddy-mcp#network-access).

## Recuperarse de un fallo {#recover}

La pantalla de elección de servidor está integrada en la app de escritorio: se abre sin conexión a Internet, así que siempre puedes elegir o cambiar una instancia local sin conexión.

Si falla un paso de la instalación, la pantalla de instalación lo marca y muestra la última línea que imprimió su comando. Un paso de herramienta fallido también ofrece **Instalar manualmente**, que abre la página de descarga de esa herramienta. Corrige la causa, por ejemplo aceptando los avisos de Docker Desktop, instalando la herramienta tú mismo o liberando espacio en disco, y haz clic en **Reintentar**. La instalación continúa en la misma carpeta; las herramientas ya instaladas y una versión ya descargada no se vuelven a obtener. **Volver** regresa al campo de carpeta. **Cancelar**, bajo los pasos, detiene una instalación en curso, igual que salir de esta pantalla; cerrar la ventana solo la oculta. Para leer la salida completa del paso de preparación, ejecuta `pnpm self-host:local -- --no-open --prepare-only` en la carpeta de instalación: prepara Supabase y compila la aplicación, y luego termina dejando Supabase en ejecución.

Comprueba Docker, la disponibilidad de la CLI, el espacio libre y si otro proceso ocupa el puerto 6463. Puedes ejecutar `pnpm self-host:local` desde el terminal para diagnosticar el problema. Detenlo con Ctrl+C antes de devolver el control a la aplicación, que no asume procesos ajenos. Salir por completo de la aplicación normalmente también detiene Supabase; cerrar una ventana no equivale a salir. La opción `--keep-backend` modifica ese comportamiento de forma explícita. No utilices `supabase db reset --local` como método de recuperación: destruye los datos de evaluación. Comprueba la creación de una cuenta, un proyecto, una incidencia y un archivo adjunto antes de confiar en la instancia.

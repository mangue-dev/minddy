---
{
  "id": "installation",
  "locale": "es",
  "title": "Referencia de instalación",
  "summary": "Elige una versión y un perfil verificados, instala el perfil completo, gestionado o desde el código fuente y comprueba sus límites de funcionamiento.",
  "topic": "Administrar una instancia",
  "type": "guide",
  "audiences": [
    "operator"
  ],
  "workflows": [
    "H01",
    "H03",
    "H04"
  ],
  "visibility": "public",
  "status": "published",
  "revision": 12,
  "sourceRevision": 11,
  "owner": "@mangue-dev",
  "updatedAt": "2026-10-23",
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
      "deploy/self-hosted/compatibility.json",
      "docs/container-image.md",
      "docs/self-hosting-distribution.md",
      "docs/self-hosting.md",
      "scripts/self-hosting-install.mjs",
      "deploy/self-hosted/compose.full.yml",
      "deploy/self-hosted/compose.managed.yml",
      "app/api/mcp/route.ts",
      "lib/site.ts",
      "lib/server/app-origin.ts",
      "lib/server/oauth/issuer.ts",
      "app/api/oauth/register/route.ts",
      "lib/server/oauth/metadata.ts",
      "components/documentation/documentation-navigation.tsx",
      "components/documentation/documentation-article.tsx"
    ]
  },
  "review": {
    "revision": 12,
    "fact": "agent:/root/min747 (0.20.0 release review: source audit against the v0.11.0..main delta, verified corrections applied; 1 screenshot(s) recaptured on 2026-10-20 from the local candidate and inspected; no browser walkthrough of the procedures or operator rehearsal; earlier evidence retained in git history); agent:claude-code (it/es catalog review recapture of install-a-server-wizard on 2026-10-22 from a local candidate of this branch against the preview demo account; images inspected; no form submitted); agent:claude-code (manual figures rebuilt on the Aurora demo, catalog review labels and informal register; figures recaptured on 2026-10-22 from a local candidate against the preview demo account and inspected; no form submitted); agent:claude-code (MIN-788: Supabase self-hosted/v0.8.3 pin, api-gw gateway name and the upstream release change checked against the pinned upstream files and overlay; full profile installed on v0.8.3 and a v0.7.2 instance moved with the documented sequence on a local Docker host, then sign-in, realtime and attachment SHA-256 verified; no screenshot in scope)",
    "language": "agent:/root/min747 (es translation of the release corrections with catalog UI labels; equivalent meaning self-reviewed; agent review, not human acceptance); agent:claude-code (es figure update after the catalog review; agent review, not human acceptance); agent:claude-code (es manual figures rebuilt on the Aurora demo, catalog review labels and informal register; self-reviewed; agent review, not human acceptance); agent:claude-code (es MIN-788 changed passages; self-reviewed; agent review, not human acceptance)",
    "date": "2026-10-23"
  },
  "related": [
    "authentication-and-email",
    "backups-and-restoration",
    "instance-configuration"
  ],
  "aliases": [
    "self-hosted-compatibility",
    "install-a-server",
    "self-hosting",
    "managed-or-source-installation"
  ],
  "tags": [
    "Elegir una versión y un perfil de instalación compatibles",
    "Instalar el perfil de servidor de referencia",
    "Instalar con Supabase gestionado o desde el código fuente"
  ],
  "figures": [
    {
      "id": "self-hosted-compatibility-flow",
      "kind": "diagram",
      "src": "/documentation/es/self-hosted-compatibility-flow.svg",
      "alt": "Diagrama: Tag de código anotado. Archivos y SHA256SUMS. Firma y digest OCI oficiales. Perfil de compatibilidad elegido.",
      "caption": "Sigue las etapas en este orden. Tag de código anotado. Archivos y `SHA256SUMS`. Firma y digest OCI oficiales. Perfil de compatibilidad elegido.",
      "revision": 12,
      "reviewed": true,
      "capturedAt": "2026-10-08",
      "viewport": [
        720,
        640
      ],
      "theme": "neutral",
      "diagram": {
        "layout": "sequence",
        "items": [
          {
            "title": "Tag de código anotado"
          },
          {
            "title": "Archivos y `SHA256SUMS`"
          },
          {
            "title": "Firma y digest OCI oficiales"
          },
          {
            "title": "Perfil de compatibilidad elegido"
          }
        ]
      }
    },
    {
      "id": "install-a-server-flow",
      "kind": "diagram",
      "src": "/documentation/es/install-a-server-flow.svg",
      "alt": "Diagrama: Release verificada y entorno protegido. Instalador: perfil full de referencia. Supabase oficial, app, tareas. Validación de cuenta, archivos y recuperación.",
      "caption": "Sigue las etapas en este orden. Release verificada y entorno protegido. Instalador: perfil full de referencia. Supabase oficial, app, tareas. Validación de cuenta, archivos y recuperación.",
      "revision": 12,
      "reviewed": true,
      "capturedAt": "2026-10-08",
      "viewport": [
        720,
        640
      ],
      "theme": "neutral",
      "diagram": {
        "layout": "sequence",
        "items": [
          {
            "title": "Release verificada y entorno protegido"
          },
          {
            "title": "Instalador: perfil full de referencia"
          },
          {
            "title": "Supabase oficial, app, tareas"
          },
          {
            "title": "Validación de cuenta, archivos y recuperación"
          }
        ]
      }
    },
    {
      "id": "install-a-server-wizard",
      "kind": "screenshot",
      "src": "/documentation/es/install-a-server-wizard.png",
      "alt": "Asistente público de instalación con Supabase en el mismo servidor seleccionado.",
      "caption": "El perfil full mantiene la aplicación y Supabase en tu servidor. En este ejemplo, el acceso mediante red privada se limita a la red local.",
      "revision": 12,
      "reviewed": true,
      "capturedAt": "2026-10-22",
      "viewport": [
        944,
        1114
      ],
      "theme": "light",
      "padding": 24,
      "deviceScaleFactor": 2
    },
    {
      "id": "managed-or-source-installation-flow",
      "kind": "diagram",
      "src": "/documentation/es/managed-or-source-installation-flow.svg",
      "alt": "Diagrama: Tu proyecto Supabase gestionado. PostgreSQL, Auth, Storage, Realtime. Perfil OCI O aplicación desde tag. Tareas y copia según el perfil.",
      "caption": "La aplicación y el backend deben corresponder al perfil elegido, incluidos los horarios de las tareas y el procedimiento de copia de seguridad.",
      "revision": 12,
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
            "title": "Tu proyecto Supabase gestionado"
          },
          {
            "title": "PostgreSQL, Auth, Storage, Realtime"
          },
          {
            "title": "Perfil OCI O aplicación desde tag"
          },
          {
            "title": "Tareas y copia según el perfil"
          }
        ]
      }
    }
  ],
  "requiredFigures": [
    "self-hosted-compatibility-flow",
    "install-a-server-flow",
    "managed-or-source-installation-flow"
  ]
}
---

Instala la instancia desde una versión verificada con el perfil correspondiente: full, Supabase gestionado o código fuente. Comprueba primero la compatibilidad. Sigue después el procedimiento elegido y las pruebas de aceptación antes de admitir usuarios.

## Disponibilidad de MCP y acceso a la red {#mcp-network-access}

MCP está incluido en minddy autoalojado y se inicia con la aplicación. Funciona directamente en `/api/mcp`, en el origen de la instancia configurado con `MINDDY_PUBLIC_APP_URL`. Incluye el descubrimiento OAuth y el registro dinámico de clientes: no necesitas un servidor MCP separado, una aplicación OAuth dedicada ni un proxy de minddy Cloud. Conecta tu cliente MCP al endpoint de tu instancia, inicia sesión y concede acceso mediante el consentimiento en el navegador.

La disponibilidad del servicio no garantiza que sea accesible por la red. Tanto el cliente MCP como el navegador de autorización deben poder acceder a las URL MCP y OAuth anunciadas. Si defines explícitamente `OAUTH_ISSUER`, ese origen también debe ser accesible. El cliente debe admitir la conexión, el flujo OAuth y la ruta de red elegida; algunos clientes exigen HTTPS incluso en redes privadas.

Elige un origen accesible para el cliente MCP y su navegador de autorización. En el mismo ordenador, un cliente compatible puede utilizar `http://localhost:6463/api/mcp`. Desde otro ordenador de la LAN/VPN, utiliza la dirección configurada del servidor, como `http://192.168.1.50/api/mcp`, con una dirección de escucha, un puerto de aplicación, un cortafuegos y un enrutamiento que permitan el acceso. `localhost` y `127.0.0.1` siempre apuntan al ordenador que inicia la conexión, por lo que la URL localhost del servidor no funciona allí. Un proceso limitado al bucle local sigue sin ser accesible directamente. Fuera de la red privada, utiliza un endpoint HTTPS accesible como `https://tickets.example.com/api/mcp` o una ruta de red compatible, según los requisitos del cliente. Un agente alojado también necesita esa ruta; el alojamiento local no expone automáticamente la instancia a Internet.

[Consulta la guía de acceso a la red de MCP antes de conectar un cliente remoto](/docs/minddy-mcp#network-access).

## Elegir una versión y un perfil de instalación compatibles {#self-hosted-compatibility}

Utiliza una versión inmutable del repositorio público `mangue-dev/minddy` y consulta sus requisitos en la entrada de `deploy/self-hosted/compatibility.json` cuyo `minddyRelease` coincide con ella. Una versión de paquete sin entrada propia no es una versión autoalojada compatible. Todas las entradas publicadas admiten servidores Linux amd64 y arm64, Node.js 24, `pnpm` 10.28.0, Docker Engine a partir de 27.0.0 y el plugin Compose a partir de 2.29.0. El perfil full fija la distribución oficial de Supabase `self-hosted/v0.8.3` en el commit `bc27d2661edd09a5d0b8d76ce33da6d4071a756e`. Conserva el conjunto completo de imágenes: actualizar un servicio por separado crea una variante bajo la responsabilidad del operador.

El perfil managed utiliza un proyecto Supabase en supabase.com. Ese proyecto debe proporcionar PostgreSQL, Auth, Storage y Realtime y superar la verificación de la versión. PostgreSQL por sí solo no basta. El entorno local de Supabase CLI sirve para desarrollo y evaluación, no para prestar un servicio público en producción.

![Diagrama: Tag de código anotado. Archivos y SHA256SUMS. Firma y digest OCI oficiales. Perfil de compatibilidad elegido.](/documentation/es/self-hosted-compatibility-flow.svg)

### Verificar antes de ejecutar {#verify-release}

Verifica la etiqueta anotada, los archivos de la versión, `SHA256SUMS` y la firma OCI oficial antes de instalar dependencias o ejecutar el código. Los comandos Bash siguientes parten del checkout de la etiqueta elegida y dejan `IMAGE` definido con el digest verificado. Detente si falla cualquier comprobación. Instala primero Cosign siguiendo su documentación oficial. Estas verificaciones confirman la identidad del código y de la imagen; no demuestran que la instalación funcione.

```bash
set -euo pipefail
export SOURCE_DIR="$PWD"
export RELEASE_TAG="$(git describe --tags --exact-match)"
git rev-parse "$RELEASE_TAG^{tag}"
export RELEASE_ASSETS="$(mktemp -d)"
ASSET_BASE="https://github.com/mangue-dev/minddy/releases/download/$RELEASE_TAG"
for ASSET in SHA256SUMS RELEASE_NOTES.md UPDATE.md release-manifest.json \
  "minddy-$RELEASE_TAG-container.txt" "minddy-$RELEASE_TAG-source.tar.gz" \
  "minddy-$RELEASE_TAG-migrations.tar.gz"; do
  curl --fail --show-error --location "$ASSET_BASE/$ASSET" --output "$RELEASE_ASSETS/$ASSET"
done
cd "$RELEASE_ASSETS"
if command -v sha256sum >/dev/null 2>&1; then
  sha256sum --check SHA256SUMS
else
  shasum -a 256 --check SHA256SUMS
fi
test "$(node -p 'require("./release-manifest.json").release.tag')" = "$RELEASE_TAG"
test "$(node -p 'require("./release-manifest.json").release.commit')" = \
  "$(git -C "$SOURCE_DIR" rev-parse "$RELEASE_TAG^{commit}")"
export IMAGE="$(node -p 'require("./release-manifest.json").container.reference')"
test "$IMAGE" = "$(sed -n 's/^reference=//p' "minddy-$RELEASE_TAG-container.txt")"
printf '%s\n' "$IMAGE" | LC_ALL=C grep -Eq '^ghcr\.io/mangue-dev/minddy@sha256:[a-f0-9]{64}$'
cosign verify \
  --certificate-identity 'https://github.com/mangue-dev/minddy/.github/workflows/release.yml@refs/heads/production' \
  --certificate-oidc-issuer 'https://token.actions.githubusercontent.com' \
  "$IMAGE"
cd "$SOURCE_DIR"
```

```bash
gh attestation verify "oci://$IMAGE" --repo mangue-dev/minddy
docker buildx imagetools inspect "$IMAGE" \
  --format '{{ json .SBOM }}' > minddy.sbom.spdx.json
test -s minddy.sbom.spdx.json
```

### Planificar operación y actualizaciones {#support}

Instala una versión publicada cada vez. Las migraciones solo avanzan: para volver a una versión incompatible, restaura juntos la base de datos, Storage, la configuración y la aplicación correspondientes. minddy mantiene las herramientas de publicación y ofrece ayuda, sin garantía, para diagnosticar defectos reproducibles del núcleo. Tú te encargas de DNS, TLS, capacidad del servidor, copias de seguridad, pruebas de restauración y proveedores opcionales. Una etiqueta de imagen que cambia o un entorno Supabase derivado no heredan el contrato de soporte de la versión.

Los perfiles publicados en v0.11.0 también arrancan un servicio `agent-runner` que falla antes de que la aplicación esté en buen estado. Las versiones posteriores eliminan por completo ese runner y sus sandboxes de código: Numo no ejecuta código y ningún servicio recibe el socket de Docker. Instala una de esas versiones en lugar de adaptar v0.11.0.


## Instalar el perfil de servidor de referencia {#install-a-server}

Empieza con un checkout de etiqueta verificado y un digest de imagen inmutable. Se admiten Linux amd64 y arm64. Reserva 4 GB de RAM, dos núcleos y 20 GB de SSD si utilizas Supabase gestionado; reserva 8 GB, cuatro núcleos y 60 GB si Supabase comparte el servidor. Un servicio público necesita DNS y HTTPS en sus propias URL de origen. HTTP solo se acepta en `localhost` o en una red IPv4 privada. Limita ese acceso a una LAN de confianza, sin redirección de puertos del router. En ese modo, el perfil full expone la aplicación en el puerto 80 y la API en el 8000.

![Diagrama: Release verificada y entorno protegido. Instalador: perfil full de referencia. Supabase oficial, app, tareas. Validación de cuenta, archivos y recuperación.](/documentation/es/install-a-server-flow.svg)


![Asistente público de instalación con Supabase en el mismo servidor seleccionado.](/documentation/es/install-a-server-wizard.png)

### Configurar y ejecutar el instalador {#install}

Ejecuta `pnpm self-host:install` desde el directorio de la versión. Elige managed o full, la URL de origen de la aplicación y la dirección del administrador. Para full, obtén primero el checkout upstream fijado. El instalador escribe un archivo de entorno con permisos `0600`, genera secretos distintos cuando faltan, descarga las imágenes del perfil, inicia los servicios y aplica un bootstrap idempotente. Conserva la imagen fijada y los secretos existentes. El instalador también pregunta si debe cifrar el contenido del espacio de trabajo; `--encryption enabled` (valor predeterminado) o `--encryption disabled` responde sin interacción, y el instalador escribe `MINDDY_CONTENT_ENCRYPTION_ENABLED` con una `MINDDY_DATA_ROOT_KEY` independiente. Una nueva ejecución conserva la elección guardada y rechaza una contraria; consulta el [cifrado del espacio de trabajo](/es/documentacion/workspace-encryption#workspace-encryption) antes de cambiarla. `IMAGE` corresponde al digest verificado en [el artículo de compatibilidad](/es/documentacion/installation#verify-release).

Para enviar emails de Auth reales, prepara primero la instalación con `--skip-start`. Configura `SMTP_HOST`, `SMTP_PORT`, `SMTP_USER`, `SMTP_PASS`, `SMTP_ADMIN_EMAIL` y `SMTP_SENDER_NAME` en el archivo protegido antes de volver a ejecutar el instalador. Mantén `ENABLE_EMAIL_AUTOCONFIRM=false`. `supabase-mail` es un valor de ejemplo, no un buzón de producción.

Antes de iniciar, compara `MINDDY_RELEASE` y `MINDDY_IMAGE` con la entrada de compatibilidad elegida y el archivo de imagen verificado. El instalador copia `MINDDY_RELEASE` de la plantilla de despliegue de la versión, y `--image` solo cambia la referencia de la imagen; no existe una opción `--release`. La plantilla de v0.11.0, por ejemplo, todavía indica 0.10.30. Si el valor difiere de la versión que instalas, prepara el archivo con `--skip-start`, establece explícitamente `MINDDY_RELEASE` en esa versión y conserva el digest verificado. No sustituyas las credenciales generadas ni las claves de cifrado.

```bash
node scripts/fetch-official-supabase.mjs --destination /srv/minddy/supabase
pnpm self-host:install -- --non-interactive --mode full \
  --app-url http://192.168.1.50 --admin-email ops@example.com \
  --supabase-dir /srv/minddy/supabase --image "$IMAGE" --skip-start
```

El comando anterior crea `deploy/self-hosted/.env` en el directorio de la release elegida. Edita ese archivo protegido y vuelve a ejecutar el mismo comando sin `--skip-start` para arrancar el perfil y ejecutar el bootstrap. Las URL de origen, la imagen y los secretos existentes permanecen en el archivo protegido.

Si ejecutas este perfil full en macOS con Docker Desktop, aplica el [override de volumen para Storage basado en archivos](/es/documentacion/storage-and-attachments#docker-desktop) antes del primer inicio y conserva `RESTORE_OVERRIDE` en cada operación de Compose posterior. El montaje de directorio en un equipo Linux y este perfil con volumen con nombre necesitan archivos de bytes distintos; utiliza el procedimiento de copia de seguridad y restauración correspondiente.

### Verificar antes de incorporar usuarios {#accept}

Los perfiles de referencia incluyen el planificador; no contienen ningún runner de código ni montan el socket de Docker. No publiques PostgreSQL ni los puertos de los servicios internos en Internet. Ejecuta doctor con el entorno instalado y, para full, con el archivo Compose upstream. Prueba confirmación, inicio de sesión, MFA, recuperación de contraseña, creación de proyectos e incidencias, subida y descarga de adjuntos y Realtime con dos sesiones. Una respuesta 200 de `/api/health` solo demuestra que la aplicación está activa. Tras una interrupción, vuelve a ejecutar el instalador con el mismo contexto Compose y el archivo de entorno protegido; no borres ni reinicialices los datos. Prepara una copia externa y una restauración sobre un destino vacío antes de incorporar un equipo.




## Instalar con Supabase gestionado o desde el código fuente {#managed-or-source-installation}

Supabase gestionado describe quién opera el backend. Puede acompañar al perfil de aplicación OCI oficial o a un servidor compilado desde el código. Distingue ambos despliegues en los registros de instalación y aceptación. El backend debe proporcionar PostgreSQL, Auth, Storage y Realtime. Para el perfil OCI managed guiado necesitas un proyecto en supabase.com, su URL pública, las claves anon y service-role y una conexión PostgreSQL accesible desde las herramientas de bootstrap. Utiliza un proyecto propio; las credenciales de minddy Cloud no son datos de instalación.

![Diagrama: Tu proyecto Supabase gestionado. PostgreSQL, Auth, Storage, Realtime. Perfil OCI O aplicación desde tag. Tareas y copia según el perfil.](/documentation/es/managed-or-source-installation-flow.svg)

### Configurar Supabase gestionado {#managed}

Ejecuta el comando siguiente desde el directorio de la versión verificada. `IMAGE` es el digest comprobado en el artículo de compatibilidad. Los valores ... son ejemplos que debes sustituir, no credenciales utilizables. Obtén los valores reales de forma privada y evita que aparezcan en el historial del terminal o en registros compartidos. El instalador conserva el entorno protegido existente, incluye el planificador y mantiene los servicios opcionales desactivados hasta que se configuren. Configura por separado el SMTP de Auth y las redirecciones exactas en tu proyecto Supabase.

El perfil OCI `managed` publicado en v0.11.0 contiene el mismo runner defectuoso que el perfil `full`, por lo que su instalador sin modificar no puede completar el arranque. Utiliza una versión posterior sin runner. El comando siguiente prepara la configuración con `--skip-start`. Revisa ese archivo protegido sin cambiar la imagen verificada ni los secretos generados y vuelve a ejecutar el comando sin `--skip-start`. Verifica el perfil `managed` antes de admitir usuarios. No ejecutes los comandos de backend local del perfil full contra un proyecto del proveedor.

```bash
pnpm self-host:install -- --non-interactive --mode managed \
  --app-url https://tickets.example.com --admin-email ops@example.com \
  --supabase-url https://project.supabase.co --anon-key '...' \
  --service-role-key '...' --db-url 'postgresql://postgres:...@db.example.com:5432/postgres' \
  --image "$IMAGE" --skip-start
```

### Completar el despliegue desde fuentes {#source}

Para instalar desde el código, instala las dependencias fijadas de la etiqueta, proporciona el entorno de minddy y Supabase, ejecuta bootstrap, compila e inicia el servidor de producción detrás de un proxy inverso. Establece los valores `MINDDY_PUBLIC_*` antes de iniciar. Debes proporcionar un planificador persistente con las llamadas autenticadas de [la configuración de red](/es/documentacion/instance-configuration#schedules): compilar no pone en marcha los trabajos. Verifica migraciones y Storage y prueba Auth, creación de incidencias, bytes de los archivos y Realtime. Utiliza el procedimiento lógico o del proveedor para las copias. Un servidor compilado desde el código no valida una instalación OCI.

```bash
pnpm install --frozen-lockfile
pnpm bootstrap:supabase -- --db-url "$SUPABASE_DB_URL" --env-file .env.local
pnpm build
pnpm start
```

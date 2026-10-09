---
{
  "id": "installation",
  "locale": "es",
  "title": "Instalación autoalojada",
  "summary": "Elija una versión y un perfil verificados, instale el perfil completo, gestionado o desde el código fuente y compruebe sus límites de funcionamiento.",
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
  "revision": 3,
  "sourceRevision": 3,
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
      "deploy/self-hosted/compatibility.json",
      "docs/container-image.md",
      "docs/self-hosting-distribution.md",
      "content/documentation/reviews/operator-large-runner-write.json",
      "content/documentation/reviews/operator-sandbox-network.json",
      "docs/self-hosting.md",
      "scripts/self-hosting-install.mjs",
      "deploy/self-hosted/compose.full.yml",
      "deploy/self-hosted/compose.managed.yml",
      "content/documentation/reviews/visual-refresh-captures-2026-10-09.json",
      "content/documentation/reviews/editorial-clarity-en-fr-2026-10-09.md",
      "content/documentation/reviews/editorial-clarity-de-es-2026-10-09.md",
      "content/documentation/reviews/editorial-clarity-it-pt-BR-2026-10-09.md"
    ]
  },
  "review": {
    "revision": 3,
    "fact": "agent:/root/german_spanish_review (structural consolidation review; prior procedural evidence retained; no operational rerun); agent:/root (visual usefulness, figure framing and preserved procedures; previous operational evidence retained)",
    "language": "agent:/root/german_spanish_review (es title, summary, lead and heading review; retained body comparison); agent:/root/editorial_de_es (editorial clarity pass); agent:/root (figure removals and captions); agent:/root/editorial_de_es (collection-caption clarity)",
    "date": "2026-10-09"
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
      "caption": "Siga las etapas en este orden. Tag de código anotado. Archivos y SHA256SUMS. Firma y digest OCI oficiales. Perfil de compatibilidad elegido.",
      "revision": 3,
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
            "title": "Archivos y SHA256SUMS"
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
      "alt": "Diagrama: Release verificada y entorno protegido. Instalador: perfil full de referencia. Supabase oficial, app, tareas, runner. Validación de cuenta, archivos y recuperación.",
      "caption": "Siga las etapas en este orden. Release verificada y entorno protegido. Instalador: perfil full de referencia. Supabase oficial, app, tareas, runner. Validación de cuenta, archivos y recuperación.",
      "revision": 3,
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
            "title": "Supabase oficial, app, tareas, runner"
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
      "caption": "El perfil full mantiene la aplicación y Supabase en su servidor. En este ejemplo, el acceso mediante red privada se limita a la red local.",
      "revision": 3,
      "reviewed": true,
      "capturedAt": "2026-10-09",
      "viewport": [
        944,
        1075
      ],
      "theme": "light",
      "padding": 24,
      "deviceScaleFactor": 2
    },
    {
      "id": "managed-or-source-installation-flow",
      "kind": "diagram",
      "src": "/documentation/es/managed-or-source-installation-flow.svg",
      "alt": "Diagrama: Su proyecto Supabase gestionado. PostgreSQL, Auth, Storage, Realtime. Perfil OCI O aplicación desde tag. Tareas y copia según el perfil.",
      "caption": "La aplicación y el backend deben corresponder al perfil elegido, incluidos los horarios de las tareas y el procedimiento de copia de seguridad.",
      "revision": 3,
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
            "title": "Su proyecto Supabase gestionado"
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

Instale la instancia desde una versión verificada con el perfil correspondiente: full, Supabase gestionado o código fuente. Compruebe primero la compatibilidad y las limitaciones conocidas del runner. Siga después el procedimiento elegido y las pruebas de aceptación antes de admitir usuarios. La adaptación técnica documentada para v0.11.0 es una variante explícita de las herramientas, no una versión publicada corregida.

## Elegir una versión y un perfil de instalación compatibles {#self-hosted-compatibility}

Utilice una versión inmutable del repositorio público mangue-dev/minddy. La entrada de compatibilidad de v0.11.0 admite servidores Linux amd64 y arm64, Node.js 24, pnpm 10.28.0, Docker Engine a partir de 27.0.0 y el plugin Compose a partir de 2.29.0. El perfil full fija la distribución oficial de Supabase self-hosted/v0.7.2 en el commit 549db119c44c25167461812041ba198bde2b31a4. Conserve el conjunto completo de imágenes: actualizar un servicio por separado crea una variante bajo la responsabilidad del operador.

El perfil managed utiliza un proyecto Supabase en supabase.com. Ese proyecto debe proporcionar PostgreSQL, Auth, Storage y Realtime y superar la verificación de la versión. PostgreSQL por sí solo no basta. El entorno local de Supabase CLI sirve para desarrollo y evaluación, no para prestar un servicio público en producción.

![Diagrama: Tag de código anotado. Archivos y SHA256SUMS. Firma y digest OCI oficiales. Perfil de compatibilidad elegido.](/documentation/es/self-hosted-compatibility-flow.svg)

### Verificar antes de ejecutar {#verify-release}

Verifique la etiqueta anotada, los archivos de la versión, SHA256SUMS y la firma OCI oficial antes de instalar dependencias o ejecutar el código. Los comandos Bash siguientes parten del checkout de la etiqueta elegida y dejan IMAGE definido con el digest verificado. Deténgase si falla cualquier comprobación. Instale primero Cosign siguiendo su documentación oficial. Estas verificaciones confirman la identidad del código y de la imagen; no demuestran que la instalación funcione.

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

Instale una versión publicada cada vez. Las migraciones solo avanzan: para volver a una versión incompatible, restaure juntos la base de datos, Storage, la configuración y la aplicación correspondientes. minddy mantiene las herramientas de publicación y ofrece ayuda, sin garantía, para diagnosticar defectos reproducibles del núcleo. Usted se encarga de DNS, TLS, capacidad del servidor, copias de seguridad, pruebas de restauración y proveedores opcionales. Una etiqueta de imagen que cambia o un entorno Supabase derivado no heredan el contrato de soporte de la versión.

### Limitaciones conocidas del runner de la versión publicada {#known-runner-limits}

El runner publicado en v0.11.0 presenta bloqueos de la ejecución de código: rechaza nombres de sandbox con el sufijo de asignación, escribe bloques base64 demasiado grandes para un único valor de entorno de Linux e inicializa como root un almacenamiento temporal de UID 10001 y modo 0700 después de eliminar todas las capacidades. Esta última orden puede fallar sin que se compruebe su resultado y dejar el directorio de trabajo sin crear. Un endpoint del runner en buen estado no confirma la clonación ni la ejecución de código. El candidato actual corrige estos recorridos; el ensayo aislado utilizó el runner y su helper de almacenamiento actuales mediante montajes explícitos de solo lectura sobre la imagen v0.11.0. Esto no crea una imagen publicada corregida ni una nueva entrada de compatibilidad admitida. Obtenga una combinación corregida de versión y herramientas y compruebe el recorrido de trabajo con código antes de habilitar estos agentes para un equipo.

El relay Git de v0.11.0 también omite el desafío HTTP Basic, lo que impide que un cliente Git habitual envíe sus credenciales. La [solución técnica fijada a un commit](/es/documentacion/installation#runner-workaround) proporciona los archivos correspondientes del runner y sus hashes; no modifica la imagen publicada ni crea una versión compatible.

La imagen publicada de la aplicación incluye Node.js y Git, pero elimina expresamente npm, npx y Corepack. El perfil Compose de referencia también selecciona esa imagen para los workers mediante AGENT_RUNNER_SANDBOX_IMAGE=MINDDY_IMAGE. Esto no basta para un nuevo worker de código: el bootstrap de OpenCode utiliza npm para instalar su runtime y su plugin fijados, incluso en un repositorio sin dependencias de proyecto. Sin npm, la ejecución se detiene en el bootstrap; la conversación no permite deducir que se haya modificado un archivo del proyecto ni que una prueba haya superado la validación. Utilice una imagen dedicada para workers, construida y verificada por el operador, con Node.js 24, npm, Git y las herramientas necesarias para el proyecto, sobrescribiendo AGENT_RUNNER_SANDBOX_IMAGE en el servicio runner. Mantenga las restricciones de aislamiento. Verifique el bootstrap, la clonación, las pruebas reales y el diff resultante antes de habilitar la delegación de código. Corregir los archivos del runner no proporciona estas herramientas al worker.

El helper de almacenamiento fijado también permite ejecutar archivos en el directorio de trabajo de la sandbox. De lo contrario, Docker monta este tmpfs con noexec, lo que impide iniciar el binario nativo de OpenCode y puede mostrar un error engañoso del paquete musl utilizado como alternativa. La corrección mantiene nosuid, nodev, los UID/GID 10001, los permisos 0700, el sistema de archivos raíz de solo lectura, las capabilities eliminadas y el almacenamiento desechable de cada sandbox. No permite ejecutar datos del host ni convierte la imagen de la aplicación en una imagen adecuada para workers.

## Instalar el perfil de servidor de referencia {#install-a-server}

Empiece con un checkout de etiqueta verificado y un digest de imagen inmutable. Se admiten Linux amd64 y arm64. Reserve 4 GB de RAM, dos núcleos y 20 GB de SSD si utiliza Supabase gestionado; reserve 8 GB, cuatro núcleos y 60 GB si Supabase comparte el servidor. Un servicio público necesita DNS y HTTPS en sus propias URL de origen. HTTP solo se acepta en localhost o en una red IPv4 privada. Limite ese acceso a una LAN de confianza, sin redirección de puertos del router. En ese modo, el perfil full expone la aplicación en el puerto 80 y la API en el 8000.

![Diagrama: Release verificada y entorno protegido. Instalador: perfil full de referencia. Supabase oficial, app, tareas, runner. Validación de cuenta, archivos y recuperación.](/documentation/es/install-a-server-flow.svg)


![Asistente público de instalación con Supabase en el mismo servidor seleccionado.](/documentation/es/install-a-server-wizard.png)

### Configurar y ejecutar el instalador {#install}

Ejecute pnpm self-host:install desde el directorio de la versión. Elija managed o full, la URL de origen de la aplicación y la dirección del administrador. Para full, obtenga primero el checkout upstream fijado. El instalador escribe un archivo de entorno con permisos 0600, genera secretos distintos cuando faltan, descarga las imágenes del perfil, inicia los servicios y aplica un bootstrap idempotente. Conserva la imagen fijada y los secretos existentes. IMAGE corresponde al digest verificado en [el artículo de compatibilidad](/es/documentacion/installation#verify-release).

Para enviar emails de Auth reales, prepare primero la instalación con --skip-start. Configure SMTP_HOST, SMTP_PORT, SMTP_USER, SMTP_PASS, SMTP_ADMIN_EMAIL y SMTP_SENDER_NAME en el archivo protegido antes de volver a ejecutar el instalador. Mantenga ENABLE_EMAIL_AUTOCONFIRM=false. supabase-mail es un valor de ejemplo, no un buzón de producción.

Antes de iniciar, compare MINDDY_RELEASE y MINDDY_IMAGE con la entrada de compatibilidad elegida y el archivo de imagen verificado. La plantilla de v0.11.0 todavía indica 0.10.30. --image solo cambia la referencia de la imagen; no existe una opción --release. En una instalación nueva de v0.11.0 preparada con --skip-start, establezca explícitamente MINDDY_RELEASE=0.11.0 y conserve el digest verificado. No sustituya las credenciales generadas ni las claves de cifrado. La versión del paquete candidato no demuestra que exista un perfil 0.11.1 compatible: este snapshot no contiene su entrada de compatibilidad.

```bash
node scripts/fetch-official-supabase.mjs --destination /srv/minddy/supabase
pnpm self-host:install -- --non-interactive --mode full \
  --app-url http://192.168.1.50 --admin-email ops@example.com \
  --supabase-dir /srv/minddy/supabase --image "$IMAGE" --skip-start
```

El comando anterior crea deploy/self-hosted/.env en el directorio de la release elegida. Edite ese archivo protegido antes de iniciar. Para la variante técnica v0.11.0 descrita aquí, detenga el instalador automático después de configurar: siga [el procedimiento fijado del runner y los workers](/es/documentacion/installation#runner-workaround) y, a continuación, [el arranque explícito del perfil full](/es/documentacion/installation#adapted-start). No vuelva a ejecutar el instalador histórico sin --skip-start: omite el overlay necesario y no puede completar esta variante. Las URL de origen, la imagen y los secretos existentes permanecen en el archivo protegido.

### Verificar antes de incorporar usuarios {#accept}

Los perfiles de referencia incluyen el planificador y el runner de sandbox de confianza. No publique el puerto 6464 del runner ni PostgreSQL en Internet. Ejecute doctor con el entorno instalado y, para full, con el archivo Compose upstream. Pruebe confirmación, inicio de sesión, MFA, recuperación de contraseña, creación de proyectos e incidencias, subida y descarga de adjuntos y Realtime con dos sesiones. Una respuesta 200 de /api/health solo demuestra que la aplicación está activa. Tras una interrupción, retome la secuencia adaptada explícita con el mismo contexto Compose y el archivo de entorno protegido; no borre ni reinicialice los datos. Prepare una copia externa y una restauración sobre un destino vacío antes de incorporar un equipo.

### Requisitos del runner para el perfil de servidor {#install-a-server-known-runner-limits}

Antes de iniciar, revise las [limitaciones conocidas del runner](#known-runner-limits). Corregir los archivos del runner no basta: los workers de código también necesitan una imagen propia con las herramientas del bootstrap y del proyecto. El procedimiento siguiente describe esta variante adaptada explícitamente.

### Aplicar la solución técnica fijada a un commit {#runner-workaround}

Para la imagen publicada v0.11.0, esta variante explícita de las herramientas también incluye el desafío Basic que necesitan los clientes Git HTTP. Está fijada al commit de código 89ab340cb10ec729948fc6e596fb7ab0326fc470; no constituye una nueva imagen publicada ni una nueva fila de compatibilidad. Prepare primero la configuración básica y aplique esta variante antes de iniciar la pila full. Los dos archivos deben permanecer juntos, con sus hashes verificados, en almacenamiento persistente. Estos comandos no exponen ningún puerto del runner.

Configure primero el contexto de la instancia en [el procedimiento de copia de seguridad del perfil de referencia](/es/documentacion/backups-and-restoration#context). Su función Compose debe incluir RUNNER_FIX_OVERRIDE. Después, descargue y verifique los dos archivos públicos siguientes. Si un hash no coincide, detenga el procedimiento.

Este procedimiento también construye una imagen independiente para los workers de código. La imagen base está fijada, pero los paquetes Debian se resuelven durante la construcción; obtenga el ID de la imagen Docker resultante y conserve esa imagen exacta con la copia de seguridad. Nunca la sustituya por la imagen de la aplicación después de una restauración. La construcción requiere acceso al registro de la imagen base y a los repositorios Debian; un nuevo bootstrap de OpenCode también necesita el registro npm. La receta proporciona las herramientas del bootstrap, no todas las dependencias de los proyectos. Otras herramientas de compilación requieren una variante mantenida explícitamente. El overlay Compose siguiente define directamente la variable de imagen del servicio runner, porque el archivo Compose histórico ignora un valor AGENT_RUNNER_SANDBOX_IMAGE independiente en el archivo protegido.

```bash
set -euo pipefail
RUNNER_FIX_COMMIT=89ab340cb10ec729948fc6e596fb7ab0326fc470
export RUNNER_FIX_DIR="/srv/minddy/runner-fix-$RUNNER_FIX_COMMIT"
export RUNNER_FIX_OVERRIDE="$RUNNER_FIX_DIR/compose.runner-fix.yml"
sudo install -d -m 0755 -o "$(id -u)" -g "$(id -g)" "$RUNNER_FIX_DIR"
for file in agent-runner.mjs agent-runner-storage.mjs; do
  curl --fail --show-error --location \
    "https://raw.githubusercontent.com/mangue-dev/minddy/$RUNNER_FIX_COMMIT/deploy/self-hosted/$file" \
    -o "$RUNNER_FIX_DIR/$file"
done
(
  cd "$RUNNER_FIX_DIR"
  printf '%s\n' \
    '31631296f9559a0367237bc02fc6387f300eee39bb14681a973d83988ccb7b17  agent-runner.mjs' \
    '501e6c92605ca2b4ec32d13599dfd645f285b08c5092860686b5838691f09b5b  agent-runner-storage.mjs' > SHA256SUMS
  sha256sum --check SHA256SUMS
)
cat > "$RUNNER_FIX_DIR/Dockerfile.agent-sandbox" <<'DOCKERFILE'
# syntax=docker/dockerfile:1.7

# Code workers bootstrap the pinned OpenCode runtime with npm. The application
# image deliberately omits package managers and cannot serve as this image.
FROM node:24-bookworm-slim@sha256:a9f5f7c91a432850b2a8a7797adf5eadb6c733ceed61167806cee7ea7fbc29df

RUN apt-get update \
    && apt-get install --yes --no-install-recommends ca-certificates git libpcre2-8-0 \
    && rm -rf /var/lib/apt/lists/* \
    && groupadd --gid 10001 minddy \
    && useradd --uid 10001 --gid minddy --create-home --shell /usr/sbin/nologin minddy

ENV HOME=/vercel/home
ENV npm_config_cache=/vercel/npm-cache
USER minddy
WORKDIR /

CMD ["node", "-e", "setInterval(() => {}, 2147483647)"]
DOCKERFILE
docker build --pull -t minddy-agent-sandbox:operator \
  -f "$RUNNER_FIX_DIR/Dockerfile.agent-sandbox" "$RUNNER_FIX_DIR"
export RUNNER_SANDBOX_IMAGE="$(docker image inspect minddy-agent-sandbox:operator --format '{{.Id}}')"
printf '%s\n' "$RUNNER_SANDBOX_IMAGE" > "$RUNNER_FIX_DIR/sandbox-image.txt"
docker run --rm --network none --read-only --cap-drop ALL \
  --security-opt no-new-privileges --entrypoint sh "$RUNNER_SANDBOX_IMAGE" \
  -c 'node --version && npm --version && git --version && id -u'
cat > "$RUNNER_FIX_OVERRIDE" <<EOF
services:
  agent-runner:
    environment:
      AGENT_RUNNER_SANDBOX_IMAGE: "$RUNNER_SANDBOX_IMAGE"
    volumes:
      - "$RUNNER_FIX_DIR/agent-runner.mjs:/app/agent-runner.mjs:ro"
      - "$RUNNER_FIX_DIR/agent-runner-storage.mjs:/app/agent-runner-storage.mjs:ro"
EOF
compose up -d --no-deps --force-recreate agent-runner
compose exec -T agent-runner node --input-type=module -e \
  'const r=await fetch("http://127.0.0.1:6464/health"); if(!r.ok) process.exit(1); console.log(r.status);'
```

El comando compose up recrea únicamente el runner. Su respuesta de estado sigue siendo insuficiente como validación: compruebe una nueva sandbox, la clonación del repositorio, un archivo de más de 1 MiB, las pruebas y el diff resultante antes de habilitar agentes de código. Mantenga RUNNER_FIX_OVERRIDE y RUNNER_FIX_DIR en cada sesión de operaciones. El instalador histórico y la herramienta de actualización no utilizan este override del shell; si cualquiera de ellos modifica o recrea el runner, vuelva a aplicar este comando Compose. Incluya los dos archivos y el override en la copia de seguridad cifrada y restablezca sus rutas absolutas antes de reiniciar el runner.

Conserve la imagen propia del worker; la imagen de la aplicación no incluye las herramientas npm del bootstrap. Revise los [requisitos completos del worker](#known-runner-limits) y compruebe el bootstrap, la clonación, las pruebas y el diff antes de habilitar la delegación de código.

### Iniciar el perfil full adaptado explícitamente {#adapted-start}

El instalador v0.11.0 sin modificaciones no puede completar esta variante técnica: su imagen omite el helper, el pin de la función difiere de la dependencia fijada y no acepta el overlay del runner anterior. Para esta variante, prepare la configuración con --skip-start y aplique las herramientas fijadas antes del primer arranque. Utilice la secuencia full siguiente en lugar de volver a ejecutar el instalador histórico sin --skip-start. La sustitución del pin modifica explícitamente las herramientas de despliegue, no el tag publicado. Conserve el pin original con las pruebas de la release.

Si ejecuta este perfil full en macOS con Docker Desktop, aplique el [override de volumen para Storage basado en archivos](/es/documentacion/storage-and-attachments#docker-desktop) antes del primer inicio y conserve RESTORE_OVERRIDE junto con el override del runner. El montaje de directorio en un equipo Linux y este perfil con volumen con nombre necesitan archivos de bytes distintos; utilice el procedimiento de copia de seguridad y restauración correspondiente.

```bash
cd "$CURRENT_RELEASE_DIR"
pnpm install --frozen-lockfile
curl --fail --show-error --location \
  "https://raw.githubusercontent.com/mangue-dev/minddy/$RUNNER_FIX_COMMIT/deploy/self-hosted/functions-bundle.json" \
  -o "$RUNNER_FIX_DIR/functions-bundle.json"
(
  cd "$RUNNER_FIX_DIR"
  printf '%s\n' '7fae1ec49c6a75fcd34d3fae7513e140eead1c2146753f2a4200f30eeb2bf202  functions-bundle.json' | sha256sum --check
)
if [ ! -e "$RUNNER_FIX_DIR/functions-bundle.tagged.json" ]; then
  install -m 0644 deploy/self-hosted/functions-bundle.json "$RUNNER_FIX_DIR/functions-bundle.tagged.json"
fi
install -m 0644 "$RUNNER_FIX_DIR/functions-bundle.json" deploy/self-hosted/functions-bundle.json
compose pull --quiet
node --input-type=module -e \
  'const m=await import("./scripts/prepare-self-hosted-functions.mjs"); m.prepareFunctionsBundle({supabaseDir:process.env.SUPABASE_DIR,envFile:process.env.MINDDY_ENV_FILE});'
compose up -d --pull never --wait --wait-timeout 120
node --input-type=module <<'NODE'
import { chmodSync, readFileSync, writeFileSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { parseEnvironment, fullBootstrapDatabaseUrl, fullMaintenanceApiUrl } from "./scripts/self-hosting-install.mjs";
const envFile = process.env.MINDDY_ENV_FILE;
const values = parseEnvironment(readFileSync(envFile, "utf8"));
const result = spawnSync(process.execPath, ["scripts/bootstrap-supabase.mjs",
  "--db-url", fullBootstrapDatabaseUrl(values), "--env-file", envFile,
  "--existing-env", "--enable", "scheduler", "--supabase-url", fullMaintenanceApiUrl(values)], {
  encoding: "utf8", maxBuffer: 16 * 1024 * 1024,
  env: { ...process.env,
    MINDDY_PUBLIC_APP_URL: values.MINDDY_PUBLIC_APP_URL,
    MINDDY_PUBLIC_SUPABASE_URL: values.MINDDY_PUBLIC_SUPABASE_URL,
    MINDDY_PUBLIC_SUPABASE_ANON_KEY: values.MINDDY_PUBLIC_SUPABASE_ANON_KEY,
    SUPABASE_SERVICE_ROLE_KEY: values.SUPABASE_SERVICE_ROLE_KEY },
});
writeFileSync(`${envFile}.bootstrap.log`, `${result.stdout ?? ""}${result.stderr ?? ""}`, { mode: 0o600 });
chmodSync(`${envFile}.bootstrap.log`, 0o600);
if (result.error || result.status !== 0) {
  console.error("Bootstrap failed; inspect the protected diagnostic log locally.");
  process.exit(1);
}
console.log("Bootstrap completed.");
NODE
pnpm self-host:doctor -- --mode full --env-file "$MINDDY_ENV_FILE" \
  --supabase-compose "$SUPABASE_DIR/docker/docker-compose.yml" --json
```

El wrapper lee el archivo protegido como datos, calcula las URL privadas de mantenimiento con los mismos helpers exportados que el instalador y ejecuta el bootstrap original con los requisitos del planificador. Su registro de diagnóstico conserva permisos 0600; no lo adjunte a un informe público sin revisarlo y eliminar datos sensibles. Cualquier fase que falle debe detener el procedimiento. El doctor debe utilizar el mismo contexto adaptado; verifica los servicios, no la validación del worker de código ni la entrega por proveedores externos.

El helper de almacenamiento fijado también permite ejecutar archivos en el directorio de trabajo de la sandbox. De lo contrario, Docker monta este tmpfs con noexec, lo que impide iniciar el binario nativo de OpenCode y puede mostrar un error engañoso del paquete musl utilizado como alternativa. La corrección mantiene nosuid, nodev, los UID/GID 10001, los permisos 0700, el sistema de archivos raíz de solo lectura, las capabilities eliminadas y el almacenamiento desechable de cada sandbox. No permite ejecutar datos del host ni convierte la imagen de la aplicación en una imagen adecuada para workers.

## Instalar con Supabase gestionado o desde el código fuente {#managed-or-source-installation}

Supabase gestionado describe quién opera el backend. Puede acompañar al perfil de aplicación OCI oficial o a un servidor compilado desde el código. Distinga ambos despliegues en los registros de instalación y aceptación. El backend debe proporcionar PostgreSQL, Auth, Storage y Realtime. Para el perfil OCI managed guiado necesita un proyecto en supabase.com, su URL pública, las claves anon y service-role y una conexión PostgreSQL accesible desde las herramientas de bootstrap. Utilice un proyecto propio; las credenciales de minddy Cloud no son datos de instalación.

![Diagrama: Su proyecto Supabase gestionado. PostgreSQL, Auth, Storage, Realtime. Perfil OCI O aplicación desde tag. Tareas y copia según el perfil.](/documentation/es/managed-or-source-installation-flow.svg)

### Configurar Supabase gestionado {#managed}

Ejecute el comando siguiente desde el directorio de la versión verificada. IMAGE es el digest comprobado en el artículo de compatibilidad. Los valores ... son ejemplos que debe sustituir, no credenciales utilizables. Obtenga los valores reales de forma privada y evite que aparezcan en el historial del terminal o en registros compartidos. El instalador conserva el entorno protegido existente, incluye el planificador y el runner y mantiene los servicios opcionales desactivados hasta que se configuren. Configure por separado el SMTP de Auth y las redirecciones exactas en su proyecto Supabase.

```bash
pnpm self-host:install -- --non-interactive --mode managed \
  --app-url https://tickets.example.com --admin-email ops@example.com \
  --supabase-url https://project.supabase.co --anon-key '...' \
  --service-role-key '...' --db-url 'postgresql://postgres:...@db.example.com:5432/postgres' \
  --image "$IMAGE"
```

### Completar el despliegue desde fuentes {#source}

Para instalar desde el código, instale las dependencias fijadas de la etiqueta, proporcione el entorno de minddy y Supabase, ejecute bootstrap, compile e inicie el servidor de producción detrás de un proxy inverso. Establezca los valores MINDDY_PUBLIC_* antes de iniciar. Debe proporcionar un planificador persistente con las llamadas autenticadas de [la configuración de red](/es/documentacion/instance-configuration#schedules): compilar no pone en marcha los trabajos. Verifique migraciones y Storage y pruebe Auth, creación de incidencias, bytes de los archivos y Realtime. Utilice el procedimiento lógico o del proveedor para las copias. Un servidor compilado desde el código no valida una instalación OCI.

```bash
pnpm install --frozen-lockfile
pnpm bootstrap:supabase -- --db-url "$SUPABASE_DB_URL" --env-file .env.local
pnpm build
pnpm start
```

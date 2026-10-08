---
{
  "id": "install-a-server",
  "locale": "es",
  "title": "Instalar el perfil de servidor de referencia",
  "summary": "Empiece con un checkout de etiqueta verificado y un digest de imagen inmutable.",
  "topic": "Administrar una instancia",
  "type": "tutorial",
  "audiences": [
    "operator"
  ],
  "workflows": [
    "H03"
  ],
  "visibility": "public",
  "status": "published",
  "revision": 1,
  "sourceRevision": 1,
  "owner": "@mangue-dev",
  "updatedAt": "2026-10-08",
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
      "scripts/self-hosting-install.mjs",
      "deploy/self-hosted/compose.full.yml",
      "content/documentation/reviews/operator-large-runner-write.json",
      "content/documentation/reviews/operator-sandbox-network.json"
    ]
  },
  "review": {
    "revision": 1,
    "fact": "agent:/root/automation_account_documentation (independent targeted primary-source review); agent:/root/review_documentation_locales (independent final lifecycle/Storage delta review; prior complete review retained)",
    "language": "Codex agent review_documentation_locales: independent complete English/Spanish meaning and idiom review, not human review; agent:/root/review_documentation_locales (independent final lifecycle/Storage delta review; prior complete review retained)",
    "date": "2026-10-08"
  },
  "related": [
    "self-hosted-compatibility",
    "authentication-and-email",
    "back-up-the-reference-instance"
  ],
  "aliases": [
    "self-hosting"
  ],
  "tags": [],
  "figures": [
    {
      "id": "install-a-server-flow",
      "kind": "diagram",
      "src": "/documentation/es/install-a-server-flow.svg",
      "alt": "Diagrama: Release verificada y entorno protegido. Instalador: perfil full de referencia. Supabase oficial, app, tareas, runner. Validación de cuenta, archivos y recuperación.",
      "caption": "Siga las etapas en este orden. Release verificada y entorno protegido. Instalador: perfil full de referencia. Supabase oficial, app, tareas, runner. Validación de cuenta, archivos y recuperación.",
      "revision": 1,
      "reviewed": true,
      "capturedAt": "2026-10-08",
      "viewport": [
        720,
        640
      ],
      "theme": "neutral"
    },
    {
      "id": "install-a-server-wizard",
      "kind": "screenshot",
      "src": "/documentation/es/install-a-server-wizard.png",
      "alt": "Asistente público de instalación con Supabase en el mismo servidor seleccionado.",
      "caption": "El perfil full mantiene la aplicación y Supabase en su servidor. En este ejemplo, el acceso mediante red privada se limita a la red local.",
      "revision": 1,
      "reviewed": true,
      "capturedAt": "2026-10-08",
      "viewport": [
        1280,
        1100
      ],
      "theme": "light"
    }
  ],
  "requiredFigures": [
    "install-a-server-flow"
  ]
}
---
## Instalar el perfil de servidor de referencia {#install-a-server}

Empiece con un checkout de etiqueta verificado y un digest de imagen inmutable. Se admiten Linux amd64 y arm64. Reserve 4 GB de RAM, dos núcleos y 20 GB de SSD si utiliza Supabase gestionado; reserve 8 GB, cuatro núcleos y 60 GB si Supabase comparte el servidor. Un servicio público necesita DNS y HTTPS en sus propias URL de origen. HTTP solo se acepta en localhost o en una red IPv4 privada. Limite ese acceso a una LAN de confianza, sin redirección de puertos del router. En ese modo, el perfil full expone la aplicación en el puerto 80 y la API en el 8000.

![Diagrama: Release verificada y entorno protegido. Instalador: perfil full de referencia. Supabase oficial, app, tareas, runner. Validación de cuenta, archivos y recuperación.](/documentation/es/install-a-server-flow.svg)


![Asistente público de instalación con Supabase en el mismo servidor seleccionado.](/documentation/es/install-a-server-wizard.png)

## Configurar y ejecutar el instalador {#install}

Ejecute pnpm self-host:install desde el directorio de la versión. Elija managed o full, la URL de origen de la aplicación y la dirección del administrador. Para full, obtenga primero el checkout upstream fijado. El instalador escribe un archivo de entorno con permisos 0600, genera secretos distintos cuando faltan, descarga las imágenes del perfil, inicia los servicios y aplica un bootstrap idempotente. Conserva la imagen fijada y los secretos existentes. IMAGE corresponde al digest verificado en [el artículo de compatibilidad](/es/documentacion/self-hosted-compatibility#verify-release).

Para enviar emails de Auth reales, prepare primero la instalación con --skip-start. Configure SMTP_HOST, SMTP_PORT, SMTP_USER, SMTP_PASS, SMTP_ADMIN_EMAIL y SMTP_SENDER_NAME en el archivo protegido antes de volver a ejecutar el instalador. Mantenga ENABLE_EMAIL_AUTOCONFIRM=false. supabase-mail es un valor de ejemplo, no un buzón de producción.

Antes de iniciar, compare MINDDY_RELEASE y MINDDY_IMAGE con la entrada de compatibilidad elegida y el archivo de imagen verificado. La plantilla de v0.11.0 todavía indica 0.10.30. --image solo cambia la referencia de la imagen; no existe una opción --release. En una instalación nueva de v0.11.0 preparada con --skip-start, establezca explícitamente MINDDY_RELEASE=0.11.0 y conserve el digest verificado. No sustituya las credenciales generadas ni las claves de cifrado. La versión del paquete candidato no demuestra que exista un perfil 0.11.1 compatible: este snapshot no contiene su entrada de compatibilidad.

```bash
node scripts/fetch-official-supabase.mjs --destination /srv/minddy/supabase
pnpm self-host:install -- --non-interactive --mode full \
  --app-url http://192.168.1.50 --admin-email ops@example.com \
  --supabase-dir /srv/minddy/supabase --image "$IMAGE" --skip-start
```

El comando anterior crea deploy/self-hosted/.env en el directorio de la release elegida. Edite ese archivo protegido antes de iniciar. Para la variante técnica v0.11.0 descrita aquí, detenga el instalador automático después de configurar: siga [el procedimiento fijado del runner y los workers](#runner-workaround) y, a continuación, [el arranque explícito del perfil full](#adapted-start). No vuelva a ejecutar el instalador histórico sin --skip-start: omite el overlay necesario y no puede completar esta variante. Las URL de origen, la imagen y los secretos existentes permanecen en el archivo protegido.


## Verificar antes de incorporar usuarios {#accept}

Los perfiles de referencia incluyen el planificador y el runner de sandbox de confianza. No publique el puerto 6464 del runner ni PostgreSQL en Internet. Ejecute doctor con el entorno instalado y, para full, con el archivo Compose upstream. Pruebe confirmación, inicio de sesión, MFA, recuperación de contraseña, creación de proyectos e incidencias, subida y descarga de adjuntos y Realtime con dos sesiones. Una respuesta 200 de /api/health solo demuestra que la aplicación está activa. Tras una interrupción, retome la secuencia adaptada explícita con el mismo contexto Compose y el archivo de entorno protegido; no borre ni reinicialice los datos. Prepare una copia externa y una restauración sobre un destino vacío antes de incorporar un equipo.

## Limitaciones conocidas del runner de la versión publicada {#known-runner-limits}

El runner publicado en v0.11.0 presenta otros bloqueos de la ejecución de código: rechaza nombres de sandbox con el sufijo de asignación, escribe bloques base64 demasiado grandes para un único valor de entorno de Linux e inicializa como root un almacenamiento temporal de UID 10001 y modo 0700 después de eliminar todas las capacidades. Esta última orden puede fallar sin que se compruebe su resultado y dejar el directorio de trabajo sin crear. Un endpoint del runner en buen estado no confirma la clonación ni la ejecución de código. El candidato actual corrige estos recorridos; el ensayo aislado utilizó el runner y su helper de almacenamiento actuales mediante montajes explícitos de solo lectura sobre la imagen v0.11.0. Esto no crea una imagen publicada corregida ni una nueva entrada de compatibilidad admitida. Obtenga una combinación corregida de versión y herramientas y compruebe el recorrido de trabajo con código antes de habilitar estos agentes para un equipo.

## Aplicar la solución técnica fijada a un commit {#runner-workaround}

Para la imagen publicada v0.11.0, esta variante explícita de las herramientas también incluye el desafío Basic que necesitan los clientes Git HTTP. Está fijada al commit de código 89ab340cb10ec729948fc6e596fb7ab0326fc470; no constituye una nueva imagen publicada ni una nueva fila de compatibilidad. Prepare primero la configuración básica y aplique esta variante antes de iniciar la pila full. Los dos archivos deben permanecer juntos, con sus hashes verificados, en almacenamiento persistente. Estos comandos no exponen ningún puerto del runner.

Configure primero el contexto de la instancia en [el procedimiento de copia de seguridad del perfil de referencia](/es/documentacion/back-up-the-reference-instance#context). Su función Compose debe incluir RUNNER_FIX_OVERRIDE. Después, descargue y verifique los dos archivos públicos siguientes. Si un hash no coincide, detenga el procedimiento.

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

La imagen publicada de la aplicación incluye Node.js y Git, pero elimina expresamente npm, npx y Corepack. El perfil Compose de referencia también selecciona esa imagen para los workers mediante AGENT_RUNNER_SANDBOX_IMAGE=MINDDY_IMAGE. Esto no basta para un nuevo worker de código: el bootstrap de OpenCode utiliza npm para instalar su runtime y su plugin fijados, incluso en un repositorio sin dependencias de proyecto. Sin npm, la ejecución se detiene en el bootstrap; la conversación no permite deducir que se haya modificado un archivo del proyecto ni que una prueba haya superado la validación. Utilice una imagen dedicada para workers, construida y verificada por el operador, con Node.js 24, npm, Git y las herramientas necesarias para el proyecto, sobrescribiendo AGENT_RUNNER_SANDBOX_IMAGE en el servicio runner. Mantenga las restricciones de aislamiento. Verifique el bootstrap, la clonación, las pruebas reales y el diff resultante antes de habilitar la delegación de código. Corregir los archivos del runner no proporciona estas herramientas al worker.

## Iniciar el perfil full adaptado explícitamente {#adapted-start}

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

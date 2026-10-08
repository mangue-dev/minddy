---
{
  "id": "backups-and-restoration",
  "locale": "es",
  "title": "Copias de seguridad y restauración",
  "summary": "Conserve la base de datos, Storage, la configuración y las claves de cifrado, elija un método de copia y restaure un conjunto completo en un destino vacío.",
  "topic": "Administrar una instancia",
  "type": "guide",
  "audiences": [
    "operator"
  ],
  "workflows": [
    "H11",
    "H12",
    "H14"
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
      "docs/self-hosting-operations.md",
      "docs/self-hosting-logical-operations.md",
      "content/knowledge/self-hosting-operations.md"
    ]
  },
  "review": {
    "revision": 2,
    "fact": "agent:/root/german_spanish_review (structural consolidation review; prior procedural evidence retained; no operational rerun)",
    "language": "agent:/root/german_spanish_review (es title, summary, lead and heading review; retained body comparison)",
    "date": "2026-10-09"
  },
  "related": [
    "update-an-instance"
  ],
  "aliases": [
    "back-up-the-reference-instance",
    "self-hosting-operations",
    "logical-and-provider-backups",
    "restore-and-roll-back"
  ],
  "tags": [
    "Crear una copia en frío del perfil full con archivos",
    "Crear copias lógicas o gestionadas por el proveedor",
    "Restaurar un conjunto completo sobre un destino vacío"
  ],
  "figures": [
    {
      "id": "restore-and-roll-back-flow",
      "kind": "diagram",
      "src": "/documentation/es/restore-and-roll-back-flow.svg",
      "alt": "Diagrama: Copia completa externa verificada. Destino vacío aislado y versiones iguales. Restaurar base, bytes y claves juntos. Verificar cuenta, contenido y archivos antes de abrir.",
      "caption": "Siga las etapas en este orden. Copia completa externa verificada. Destino vacío aislado y versiones iguales. Restaurar base, bytes y claves juntos. Verificar cuenta, contenido y archivos antes de abrir.",
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
    "restore-and-roll-back-flow"
  ]
}
---

Una copia completa conserva juntos la base de datos, los bytes de Storage, la configuración y las claves necesarias. Esta guía distingue la copia en frío del perfil full con sistema de archivos de los métodos lógicos y del proveedor, y explica la restauración en un destino vacío. Antes de empezar, elija el procedimiento adecuado para la arquitectura y el perfil Storage realmente instalados.

## Crear una copia en frío del perfil full con archivos {#back-up-the-reference-instance}

Este procedimiento Linux se aplica solo al perfil full de referencia con Storage filesystem de la distribución oficial de Supabase fijada en la matriz. Una restauración física exige la misma arquitectura y la imagen exacta de PostgreSQL. Para managed, S3 e instalaciones desde el código, utilice el procedimiento lógico o del proveedor. Anuncie la interrupción de las escrituras y detenga también los workers externos. Elija un destino cifrado, con espacio suficiente y fuera de los datos activos. No ejecute down --volumes sobre la instancia de origen. La copia conserva juntos la base de datos, Auth, los registros y bytes de Storage, las migraciones, las políticas, las claves Vault, la configuración y las identidades de las versiones.

### Definir el contexto Compose instalado {#context}

Sustituya las rutas y la versión del ejemplo por las de la instancia instalada y defina MODE=full. Incluya cualquier override de restauración existente en todos los comandos Compose. Usar solo docker compose upstream omite el overlay minddy y el entorno protegido. No ejecute el archivo de entorno como código shell ni lo imprima. La secuencia siguiente detiene todos los servicios antes de copiar los archivos de PostgreSQL.

```bash
set -euo pipefail
export MODE=full
export CURRENT_RELEASE_DIR=/srv/minddy/releases/vX.Y.Z
export SUPABASE_DIR=/srv/minddy/supabase
export MINDDY_ENV_FILE=/etc/minddy/instance.env
export BACKUP_ROOT=/mnt/backup/minddy
compose() {
  local files=()
  if [ "$MODE" = full ]; then
    files+=(-f "$SUPABASE_DIR/docker/docker-compose.yml")
  fi
  files+=(-f "$CURRENT_RELEASE_DIR/deploy/self-hosted/compose.$MODE.yml")
  if [ -n "${RESTORE_OVERRIDE:-}" ]; then
    files+=(-f "$RESTORE_OVERRIDE")
  fi
  if [ -n "${RUNNER_FIX_OVERRIDE:-}" ]; then
    files+=(-f "$RUNNER_FIX_OVERRIDE")
  fi
  docker compose --env-file "$MINDDY_ENV_FILE" "${files[@]}" "$@"
}
compose ps
```

### Sellar el conjunto correspondiente {#backup}

Ejecute la copia en frío siguiente mientras todas las escrituras permanecen detenidas. Registra las identidades del código y de las imágenes, archiva los datos filesystem upstream y el volumen de claves db-config y conserva los archivos de despliegue y el entorno protegido. Si no encuentra db-config, interrumpa el procedimiento. Conserve los archivos de versión y los digests OCI, incluida la imagen de la base de datos por digest. Como la copia contiene la clave raíz y los datos cifrados, su confidencialidad depende del cifrado externo y de los controles de acceso.

```bash
export BACKUP_DIR="$BACKUP_ROOT/$(date -u +%Y%m%dT%H%M%SZ)"
test ! -e "$BACKUP_DIR"
install -d -m 0700 "$BACKUP_DIR"
compose ps --format json > "$BACKUP_DIR/services.json"
compose images --format json > "$BACKUP_DIR/images.json"
git -C "$CURRENT_RELEASE_DIR" rev-parse HEAD > "$BACKUP_DIR/source-commit.txt"
git -C "$SUPABASE_DIR" rev-parse HEAD > "$BACKUP_DIR/supabase-commit.txt"
DB_CONTAINER="$(compose ps -q db)"
test -n "$DB_CONTAINER"
DB_CONFIG_VOLUME="$(docker inspect "$DB_CONTAINER" --format '{{range .Mounts}}{{if eq .Destination "/etc/postgresql-custom"}}{{.Name}}{{end}}{{end}}')"
test -n "$DB_CONFIG_VOLUME"
BACKUP_HELPER_IMAGE="$(docker inspect "$DB_CONTAINER" --format '{{.Image}}')"
printf '%s\n' "$BACKUP_HELPER_IMAGE" > "$BACKUP_DIR/postgres-image-id.txt"
STORAGE_CONTAINER="$(compose ps -q storage)"
test -n "$STORAGE_CONTAINER"
STORAGE_VOLUME="$(docker inspect "$STORAGE_CONTAINER" --format '{{range .Mounts}}{{if eq .Destination "/var/lib/storage"}}{{.Name}}{{end}}{{end}}')"
compose stop
sudo tar --numeric-owner --acls --xattrs -C "$SUPABASE_DIR" \
  -czf "$BACKUP_DIR/supabase-docker.tar.gz" docker
install -m 0600 "$MINDDY_ENV_FILE" "$BACKUP_DIR/instance.env"
docker run --rm --network none --user 0:0 --entrypoint tar \
  --mount "type=volume,src=$DB_CONFIG_VOLUME,dst=/keys,readonly" \
  "$BACKUP_HELPER_IMAGE" -czf - -C /keys . > "$BACKUP_DIR/db-config.tar.gz"
if [ -n "$STORAGE_VOLUME" ]; then
  docker run --rm --network none --user 0:0 --entrypoint tar \
    --mount "type=volume,src=$STORAGE_VOLUME,dst=/objects,readonly" \
    "$BACKUP_HELPER_IMAGE" --numeric-owner --acls --xattrs -czf - -C /objects . \
    > "$BACKUP_DIR/storage-volume.tar.gz"
fi
tar -C "$CURRENT_RELEASE_DIR" -czf "$BACKUP_DIR/deployment.tar.gz" deploy/self-hosted
if [ -n "${RESTORE_OVERRIDE:-}" ]; then
  install -m 0600 "$RESTORE_OVERRIDE" "$BACKUP_DIR/source-volume-override.yml"
fi
if [ -n "${RUNNER_FIX_OVERRIDE:-}" ]; then
  test -n "${RUNNER_FIX_DIR:-}"
  install -m 0600 "$RUNNER_FIX_OVERRIDE" "$BACKUP_DIR/runner-fix-override.yml"
  tar -C "$RUNNER_FIX_DIR" -czf "$BACKUP_DIR/runner-fix-files.tar.gz" \
    agent-runner.mjs agent-runner-storage.mjs SHA256SUMS Dockerfile.agent-sandbox sandbox-image.txt functions-bundle.json functions-bundle.tagged.json
  docker image save "$(cat "$RUNNER_FIX_DIR/sandbox-image.txt")" | gzip > "$BACKUP_DIR/runner-sandbox-image.tar.gz"
fi
sudo chown "$(id -u):$(id -g)" "$BACKUP_DIR/supabase-docker.tar.gz"
(
  cd "$BACKUP_DIR"
  find . -type f ! -name SHA256SUMS -print0 | sort -z | xargs -0 sha256sum > SHA256SUMS
  sha256sum --check SHA256SUMS
)
```

### Verificar el resultado {#verify}

Copie el conjunto sellado a un disco o servidor independiente y verifique allí SHA256SUMS. Una segunda copia en el mismo servidor no protege frente a la pérdida de ese servidor. Conserve los certificados TLS por separado si su política lo requiere. Si solo está haciendo una copia, reinicie con compose up -d --wait después de verificarla. Antes de confiar en ella, restáurela sobre un destino vacío y aislado, inicie sesión con MFA, compruebe las incidencias conservadas y descargue adjuntos con el mismo SHA-256. Conserve también las claves históricas correspondientes.

Si la instancia utiliza la solución fijada para el runner, conserve RUNNER_FIX_OVERRIDE y RUNNER_FIX_DIR junto con cualquier override de restauración. Estos archivos forman parte del conjunto de recuperación. Restablezca sus rutas absolutas o ajuste explícitamente los dos montajes a la nueva ubicación antes de iniciar el runner.

El comando de copia en frío también detecta un volumen con nombre de Storage basado en archivos y archiva sus bytes por separado. Un montaje de directorio sigue cubierto por supabase-docker.tar.gz. Ninguno de los casos cubre un backend S3 o de un proveedor.

## Crear copias lógicas o gestionadas por el proveedor {#logical-and-provider-backups}

Para instalaciones desde el código, bases de datos gestionadas o Storage personalizado, asocie los comandos de base de datos, bytes originales y proxy a la misma instancia instalada. self-host:backup, self-host:update y self-host:restore son comprobaciones preliminares de solo lectura: no realizan las operaciones. Una copia completa conserva PostgreSQL con auth, los metadatos Storage y el historial de migraciones, los bytes originales de los archivos, la configuración protegida, las claves y las identidades exactas de minddy y Supabase en un punto coherente, sin escrituras concurrentes.

### Supabase gestionado por un proveedor {#provider}

Para Supabase gestionado por un proveedor, registre el proyecto, la versión de la base de datos, el identificador de la copia o snapshot y su punto de recuperación. Detenga minddy, los workers y las escrituras programadas; después use los controles de coherencia o mantenimiento que el proveedor admite para las escrituras directas de Auth, PostgREST y Storage. Si no existen esos controles, documente la limitación: detener solo la aplicación no basta.

Utilice las exportaciones SQL siguientes únicamente si el rol de base de datos y el proveedor las admiten, incluyendo Auth, metadatos Storage, historial de migraciones y políticas gestionadas. Conserve los bytes originales por separado mediante una exportación admitida o un snapshot inmutable del backend. Guarde el entorno y las claves minddy y la configuración Auth/SMTP, URL, proxy y trabajos bajo su control. Los roles de plataforma y las claves pgsodium pueden pertenecer al proveedor; no los presente como archivos locales.

Los bloques siguientes con SUPABASE_COMPOSE_DIR, docker compose, supabase.env, pgsodium y tar filesystem solo se aplican a un backend controlado por el operador. Valide la restauración completa en un proyecto vacío independiente antes de confiar en la copia. No se ha realizado una copia ni una restauración de proveedor para esta revisión documental.

### Bloquear escrituras y exportar SQL {#outage}

Cierre la aplicación, los workers, el planificador y la API pública de Supabase. Detener solo el servidor web deja abiertas las escrituras de PostgREST y Storage. Defina SUPABASE_DB_URL de forma privada y elija una BACKUP_DIR nueva y cifrada. Exporte SQL con las herramientas de la versión instalada. Compruebe que todos los archivos SQL tienen contenido y que data.sql incluye las instrucciones COPY para auth.users, storage.objects y las tablas de la aplicación. La exportación habitual omite el historial de migraciones, por lo que sus dos exportaciones separadas son obligatorias. Conserve también las políticas gestionadas de Storage y Realtime.

```bash
set -euo pipefail
export MINDDY_REPO=/srv/minddy/source
export MINDDY_CURRENT_DIR=/srv/minddy/current
export SUPABASE_COMPOSE_DIR=/srv/supabase/docker
export MINDDY_ENV_FILE=/etc/minddy/minddy.env
export BACKUP_ROOT=/mnt/backup/minddy
export FROM_TAG=v0.11.0
```

```bash
export BACKUP_ID="$(date -u +%Y%m%dT%H%M%SZ)-${FROM_TAG}"
export BACKUP_DIR="$BACKUP_ROOT/$BACKUP_ID"
test ! -e "$BACKUP_DIR"
install -d -m 0700 "$BACKUP_DIR/database" "$BACKUP_DIR/config"
git -C "$MINDDY_CURRENT_DIR" rev-parse HEAD > "$BACKUP_DIR/minddy-commit.txt"
git -C "$MINDDY_CURRENT_DIR" describe --tags --always --dirty > "$BACKUP_DIR/minddy-version.txt"
cd "$SUPABASE_COMPOSE_DIR"
docker compose images > "$BACKUP_DIR/supabase-images.txt"
docker compose ps > "$BACKUP_DIR/supabase-services.txt"
```

```bash
cd "$MINDDY_REPO"
supabase db dump --db-url "$SUPABASE_DB_URL" \
  -f "$BACKUP_DIR/database/roles.sql" --role-only
supabase db dump --db-url "$SUPABASE_DB_URL" \
  -f "$BACKUP_DIR/database/schema.sql"
supabase db dump --db-url "$SUPABASE_DB_URL" \
  -f "$BACKUP_DIR/database/data.sql" --use-copy --data-only \
  -x 'storage.buckets_vectors' -x 'storage.vector_indexes'
supabase db dump --db-url "$SUPABASE_DB_URL" \
  -f "$BACKUP_DIR/database/history_schema.sql" --schema supabase_migrations
supabase db dump --db-url "$SUPABASE_DB_URL" \
  -f "$BACKUP_DIR/database/history_data.sql" --use-copy --data-only \
  --schema supabase_migrations
psql "$SUPABASE_DB_URL" -X -v ON_ERROR_STOP=1 -At \
  -f scripts/export-managed-policies.sql \
  > "$BACKUP_DIR/database/managed_policies.sql"
psql "$SUPABASE_DB_URL" -X -v ON_ERROR_STOP=1 -Atc "
  select jsonb_build_object(
    'auth.users', (select count(*) from auth.users),
    'public.projects', (select count(*) from public.projects),
    'public.issues', (select count(*) from public.issues),
    'public.attachments', (select count(*) from public.attachments),
    'storage.buckets', (select count(*) from storage.buckets),
    'storage.objects', (select count(*) from storage.objects)
  )::text
" > "$BACKUP_DIR/database/counts.json"
```

### Conservar bytes y configuración {#bytes}

Si controla un Storage filesystem, detenga storage e imgproxy tras exportar SQL y archive su directorio conservando propietarios numéricos, ACL y atributos extendidos. Para S3, cree un snapshot o una versión inmutable de los bytes originales. No restaure mediante /storage/v1/s3: crea metadatos en conflicto. El proveedor controla los roles y el acceso filesystem de la plataforma; utilice su procedimiento admitido y registre su alcance. Copie en privado la configuración de minddy y Supabase, los proxies, los trabajos, las plantillas Auth, el SMTP y cualquier clave raíz pgsodium. Incluya MINDDY_DATA_ROOT_KEY y los demás secretos conservados. SQL por sí solo no contiene los bytes de los adjuntos.

```bash
install -m 0600 "$MINDDY_ENV_FILE" "$BACKUP_DIR/config/minddy.env"
install -m 0600 "$SUPABASE_COMPOSE_DIR/.env" "$BACKUP_DIR/config/supabase.env"
tar --exclude='./volumes' --exclude='./.git' \
  -C "$SUPABASE_COMPOSE_DIR" \
  -czf "$BACKUP_DIR/config/supabase-compose.tar.gz" .
cd "$SUPABASE_COMPOSE_DIR"
if docker compose exec -T db test -f /etc/postgresql-custom/pgsodium_root.key; then
  docker compose exec -T db cat /etc/postgresql-custom/pgsodium_root.key \
    > "$BACKUP_DIR/config/pgsodium_root.key"
  chmod 0600 "$BACKUP_DIR/config/pgsodium_root.key"
fi
```

```bash
cd "$SUPABASE_COMPOSE_DIR"
docker compose stop storage imgproxy
test -d "$SUPABASE_COMPOSE_DIR/volumes/storage"
tar --numeric-owner --acls --xattrs \
  -C "$SUPABASE_COMPOSE_DIR/volumes" \
  -czf "$BACKUP_DIR/storage-files.tar.gz" storage
tar -tzf "$BACKUP_DIR/storage-files.tar.gz" > "$BACKUP_DIR/storage-files.list"
cd "$BACKUP_DIR"
find . -type f ! -name SHA256SUMS -print0 | sort -z | xargs -0 sha256sum > SHA256SUMS
sha256sum --check SHA256SUMS
```

### Verificar el resultado {#logical-and-provider-backups-verify}

Genere y verifique SHA256SUMS para el conjunto completo, cífrelo, cópielo fuera del servidor y vuelva a verificarlo en el destino. Registre las identidades de las versiones e imágenes, los recuentos de objetos y los hashes de archivos de muestra. Una exportación correcta no demuestra una restauración. Pruebe la restauración sobre un destino vacío con las versiones y la configuración guardadas antes de confiar en la copia, y documente las limitaciones del proveedor.

## Restaurar un conjunto completo sobre un destino vacío {#restore-and-roll-back}

La restauración sustituye los datos del destino; no fusiona dos instancias. Recupere la copia externa sellada, verifique SHA256SUMS y conserve intactos los datos de origen. Mantenga detenidos las entradas públicas, el planificador y los workers externos del destino. La restauración física full exige la arquitectura y la imagen exacta de PostgreSQL guardadas. Prepare la etiqueta de código y el upstream fijado en directorios nuevos e instale las dependencias fijadas. Confirme que no existen datos de base de datos, objetos Storage ni un volumen db-config en el destino. No ejecute el instalador o bootstrap habitual sobre el destino vacío antes de extraer una copia física.

![Diagrama: Copia completa externa verificada. Destino vacío aislado y versiones iguales. Restaurar base, bytes y claves juntos. Verificar cuenta, contenido y archivos antes de abrir.](/documentation/es/restore-and-roll-back-flow.svg)

### Restaurar archivos del perfil full {#physical}

Antes del primer compose down, defina [el contexto Compose instalado de la instancia de origen](/es/documentacion/backups-and-restoration#context), incluyendo cualquier override existente. La secuencia siguiente retira los contenedores de origen ya detenidos sin borrar sus volúmenes. Utiliza rutas y nombres de volumen nuevos, extrae juntos PostgreSQL en frío y Storage, recupera db-config con la imagen guardada y compara esa imagen antes de iniciar PostgreSQL.

En el entorno protegido restaurado, modifique solo las rutas, las URL de origen públicas y las redirecciones Auth del destino. Conserve JWT, contraseñas, claves Vault y de aplicación e identidades de versión e imagen. Incluya RESTORE_OVERRIDE en todas las operaciones posteriores: omitirlo puede seleccionar los volúmenes de origen. Recompile la función offline, inicie las dependencias, la aplicación y el runner y compruebe el estado en mantenimiento antes de reabrir.

Si existe storage-volume.tar.gz, restáurelo en un volumen Linux nuevo con nombre y conecte ese volumen exacto mediante el override persistente antes de iniciar Storage. La comprobación de destino vacío también se aplica a este volumen.

```bash
compose down
export CURRENT_RELEASE_DIR=/srv/minddy/releases/saved-source
export SUPABASE_DIR=/srv/minddy/supabase-restored
export MINDDY_ENV_FILE=/etc/minddy/restored.env
export RESTORE_OVERRIDE=/etc/minddy/restore-volumes.yml
export RESTORE_DB_CONFIG=minddy-restored-db-config
(cd "$BACKUP_DIR"; sha256sum --check SHA256SUMS)
test ! -d "$SUPABASE_DIR/docker/volumes/db/data"
test -z "$(find "$SUPABASE_DIR/docker/volumes/storage" -type f -print -quit 2>/dev/null)"
if docker volume inspect "$RESTORE_DB_CONFIG" >/dev/null 2>&1; then
  echo "Refusing to overwrite an existing restore volume." >&2
  exit 1
fi
sudo tar --numeric-owner --acls --xattrs -xzf "$BACKUP_DIR/supabase-docker.tar.gz" \
  -C "$SUPABASE_DIR"
install -m 0600 "$BACKUP_DIR/instance.env" "$MINDDY_ENV_FILE"
if [ -f "$BACKUP_DIR/runner-fix-files.tar.gz" ]; then
  : "${RUNNER_FIX_DIR:?Set the new absolute restore runner tooling directory}"
  : "${RUNNER_FIX_OVERRIDE:?Set its new absolute restore runner override path}"
  test "$RUNNER_FIX_OVERRIDE" = "$RUNNER_FIX_DIR/compose.runner-fix.yml"
  test ! -e "$RUNNER_FIX_DIR"
  sudo install -d -m 0755 -o "$(id -u)" -g "$(id -g)" "$RUNNER_FIX_DIR"
  tar -xzf "$BACKUP_DIR/runner-fix-files.tar.gz" -C "$RUNNER_FIX_DIR"
  (cd "$RUNNER_FIX_DIR"; sha256sum --check SHA256SUMS)
  gzip -dc "$BACKUP_DIR/runner-sandbox-image.tar.gz" | docker image load
  export RUNNER_SANDBOX_IMAGE="$(cat "$RUNNER_FIX_DIR/sandbox-image.txt")"
  docker image inspect "$RUNNER_SANDBOX_IMAGE" >/dev/null
  install -m 0600 "$BACKUP_DIR/runner-fix-override.yml" \
    "$RUNNER_FIX_DIR/compose.runner-fix.source.yml"
  cat > "$RUNNER_FIX_OVERRIDE" <<EOF
services:
  agent-runner:
    environment:
      AGENT_RUNNER_SANDBOX_IMAGE: $RUNNER_SANDBOX_IMAGE
    volumes:
      - $RUNNER_FIX_DIR/agent-runner.mjs:/app/agent-runner.mjs:ro
      - $RUNNER_FIX_DIR/agent-runner-storage.mjs:/app/agent-runner-storage.mjs:ro
EOF
  chmod 0600 "$RUNNER_FIX_OVERRIDE"
fi
cat > "$RESTORE_OVERRIDE" <<EOF
volumes:
  db-config:
    name: $RESTORE_DB_CONFIG
  deno-cache:
    name: minddy-restored-deno-cache
  caddy_data:
    name: minddy-restored-caddy-data
  caddy_config:
    name: minddy-restored-caddy-config
EOF
compose() {
  local files=(
    -f "$SUPABASE_DIR/docker/docker-compose.yml"
    -f "$CURRENT_RELEASE_DIR/deploy/self-hosted/compose.full.yml"
    -f "$RESTORE_OVERRIDE"
  )
  if [ -n "${RUNNER_FIX_OVERRIDE:-}" ]; then
    files+=(-f "$RUNNER_FIX_OVERRIDE")
  fi
  docker compose --env-file "$MINDDY_ENV_FILE" "${files[@]}" "$@"
}
BACKUP_HELPER_IMAGE="$(cat "$BACKUP_DIR/postgres-image-id.txt")"
docker image inspect "$BACKUP_HELPER_IMAGE" >/dev/null
docker volume create "$RESTORE_DB_CONFIG"
docker run --rm -i --network none --user 0:0 --entrypoint tar \
  --mount "type=volume,src=$RESTORE_DB_CONFIG,dst=/keys" \
  "$BACKUP_HELPER_IMAGE" -xzf - -C /keys < "$BACKUP_DIR/db-config.tar.gz"
if [ -f "$BACKUP_DIR/storage-volume.tar.gz" ]; then
  export RESTORE_STORAGE_VOLUME=minddy-restored-filesystem-storage
  if docker volume inspect "$RESTORE_STORAGE_VOLUME" >/dev/null 2>&1; then
    echo "Refusing to overwrite an existing Storage restore volume." >&2
    exit 1
  fi
  docker volume create "$RESTORE_STORAGE_VOLUME"
  docker run --rm -i --network none --user 0:0 --entrypoint tar \
    --mount "type=volume,src=$RESTORE_STORAGE_VOLUME,dst=/objects" \
    "$BACKUP_HELPER_IMAGE" --numeric-owner --acls --xattrs -xzf - -C /objects \
    < "$BACKUP_DIR/storage-volume.tar.gz"
  cat >> "$RESTORE_OVERRIDE" <<EOF
  $RESTORE_STORAGE_VOLUME:
    external: true
services:
  storage:
    volumes:
      - $RESTORE_STORAGE_VOLUME:/var/lib/storage
EOF
fi
compose create db
test "$(docker inspect "$(compose ps --all -q db)" --format '{{.Image}}')" = \
  "$BACKUP_HELPER_IMAGE"
cd "$CURRENT_RELEASE_DIR"
pnpm install --frozen-lockfile
if [ -f "$BACKUP_DIR/runner-fix-files.tar.gz" ]; then
  install -m 0644 "$RUNNER_FIX_DIR/functions-bundle.json" \
    "$CURRENT_RELEASE_DIR/deploy/self-hosted/functions-bundle.json"
fi
node scripts/prepare-self-hosted-functions.mjs --supabase-dir "$SUPABASE_DIR" \
  --env-file "$MINDDY_ENV_FILE"
compose up -d --wait db database-access kong auth rest storage imgproxy
compose up -d --wait minddy agent-runner
pnpm self-host:doctor -- --mode full --env-file "$MINDDY_ENV_FILE" \
  --supabase-compose "$SUPABASE_DIR/docker/docker-compose.yml" --skip-network --maintenance
compose up -d --wait
pnpm self-host:doctor -- --mode full --env-file "$MINDDY_ENV_FILE" \
  --supabase-compose "$SUPABASE_DIR/docker/docker-compose.yml"
```

### Restaurar un conjunto lógico {#logical}

Para restaurar una copia lógica, prepare un entorno vacío con las versiones PostgreSQL/Supabase, la configuración y las claves guardadas. Verifique la identidad de la base de datos y del backend Storage de destino antes de ejecutar SQL. Restaure roles, esquema y datos en una transacción, y después el historial de migraciones y las políticas gestionadas. Detenga Storage y recupere los bytes filesystem o el snapshot S3 en un backend nuevo y vacío; no los suba por la API.

Los comandos siguientes de extracción lógica, run.sh y Storage filesystem solo se aplican a un backend controlado por el operador. Para Supabase gestionado, restaure la base de datos y los bytes originales en un destino vacío mediante el procedimiento admitido por el proveedor. Después configure e inicie minddy con [el procedimiento de instalación desde el código](/es/documentacion/installation#source). No ejecute Compose local para un proyecto supabase.com. Use el commit minddy guardado y conserve sus claves al configurar las URL de origen del destino aislado.

Tras el último bloque de compilación y verificación, inicie pnpm start o el supervisor registrado de la instalación desde el código. Mantenga las entradas y los trabajos cerrados hasta completar las comprobaciones de recuperación.

```bash
export RESTORE_DB_URL='postgresql://postgres:...@restore-db:5432/postgres'
export RESTORE_SUPABASE_URL='https://restore-supabase.example.test'
export RESTORE_APP_URL='https://restore-tickets.example.test'
export RESTORE_ANON_KEY='...'
export RESTORE_SERVICE_ROLE_KEY='...'
export RESTORE_SUPABASE_DIR=/srv/restore/supabase/docker
install -d -m 0700 "$RESTORE_SUPABASE_DIR"
tar -C "$RESTORE_SUPABASE_DIR" \
  -xzf "$BACKUP_DIR/config/supabase-compose.tar.gz"
install -m 0600 "$BACKUP_DIR/config/supabase.env" "$RESTORE_SUPABASE_DIR/.env"
cd "$RESTORE_SUPABASE_DIR"
sh run.sh start
psql "$RESTORE_DB_URL" -X -v ON_ERROR_STOP=1 -Atc \
  'select current_database(), inet_server_addr(), version()'
```

```bash
psql --single-transaction --variable ON_ERROR_STOP=1 \
  --file "$BACKUP_DIR/database/roles.sql" \
  --file "$BACKUP_DIR/database/schema.sql" \
  --command 'SET session_replication_role = replica' \
  --file "$BACKUP_DIR/database/data.sql" \
  --dbname "$RESTORE_DB_URL"
psql --single-transaction --variable ON_ERROR_STOP=1 \
  --file "$BACKUP_DIR/database/history_schema.sql" \
  --file "$BACKUP_DIR/database/history_data.sql" \
  --dbname "$RESTORE_DB_URL"
psql --single-transaction --variable ON_ERROR_STOP=1 \
  --file "$BACKUP_DIR/database/managed_policies.sql" \
  --dbname "$RESTORE_DB_URL"
```

```bash
cd "$RESTORE_SUPABASE_DIR"
docker compose stop storage imgproxy
test -d "$RESTORE_SUPABASE_DIR/volumes/storage"
tar --numeric-owner --acls --xattrs \
  -C "$RESTORE_SUPABASE_DIR/volumes" \
  -xzf "$BACKUP_DIR/storage-files.tar.gz"
docker compose up -d storage imgproxy
```

```bash
export RESTORE_RELEASE_DIR="/srv/restore/minddy/releases/$BACKUP_ID"
git -C "$MINDDY_REPO" worktree add --detach "$RESTORE_RELEASE_DIR" \
  "$(cat "$BACKUP_DIR/minddy-commit.txt")"
cd "$RESTORE_RELEASE_DIR"
install -m 0600 "$BACKUP_DIR/config/minddy.env" .env.local
export MINDDY_PUBLIC_SUPABASE_URL="$RESTORE_SUPABASE_URL"
export MINDDY_PUBLIC_SUPABASE_ANON_KEY="$RESTORE_ANON_KEY"
export SUPABASE_SERVICE_ROLE_KEY="$RESTORE_SERVICE_ROLE_KEY"
export MINDDY_PUBLIC_APP_URL="$RESTORE_APP_URL"
pnpm install --frozen-lockfile
pnpm build
pnpm verify:supabase --db-url "$RESTORE_DB_URL" \
  --supabase-url "$MINDDY_PUBLIC_SUPABASE_URL" \
  --service-role-key "$SUPABASE_SERVICE_ROLE_KEY"
```

### Verificar el resultado {#restore-and-roll-back-verify}

Compare los recuentos guardados de base de datos y objetos. Inicie sesión con la cuenta y la MFA restauradas, lea el contenido cifrado de proyectos, incidencias y páginas y descargue muestras de cada bucket comparando SHA-256. Compruebe integraciones, claves revocadas, Realtime, trabajos, OAuth/MCP y URL de callback. Registre rutas, volúmenes, versiones, tiempo transcurrido y ventana observada de pérdida de datos. Tras un fallo de migración, utilice el conjunto anterior. Las escrituras posteriores a la copia pueden perderse al volver a ella. No invente SQL inverso ni considere contenedores sanos una prueba de restauración.

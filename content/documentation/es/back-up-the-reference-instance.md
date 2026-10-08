---
{
  "id": "back-up-the-reference-instance",
  "locale": "es",
  "title": "Crear una copia en frío del perfil full con archivos",
  "summary": "Este procedimiento Linux se aplica solo al perfil full de referencia con Storage filesystem de la distribución oficial de Supabase fijada en la matriz.",
  "topic": "Administrar una instancia",
  "type": "guide",
  "audiences": [
    "operator"
  ],
  "workflows": [
    "H11"
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
      "docs/self-hosting-operations.md"
    ]
  },
  "review": {
    "revision": 1,
    "fact": "agent:/root/automation_account_documentation (independent targeted primary-source review); agent:/root/review_documentation_locales (independent final lifecycle/Storage delta review; prior complete review retained)",
    "language": "Codex agent review_documentation_locales: independent complete English/Spanish meaning and idiom review, not human review; agent:/root/review_documentation_locales (independent final lifecycle/Storage delta review; prior complete review retained)",
    "date": "2026-10-08"
  },
  "related": [
    "logical-and-provider-backups",
    "restore-and-roll-back",
    "update-an-instance"
  ],
  "aliases": [
    "self-hosting-operations"
  ],
  "tags": [],
  "figures": [],
  "requiredFigures": []
}
---
## Crear una copia en frío del perfil full con archivos {#back-up-the-reference-instance}

Este procedimiento Linux se aplica solo al perfil full de referencia con Storage filesystem de la distribución oficial de Supabase fijada en la matriz. Una restauración física exige la misma arquitectura y la imagen exacta de PostgreSQL. Para managed, S3 e instalaciones desde el código, utilice el procedimiento lógico o del proveedor. Anuncie la interrupción de las escrituras y detenga también los workers externos. Elija un destino cifrado, con espacio suficiente y fuera de los datos activos. No ejecute down --volumes sobre la instancia de origen. La copia conserva juntos la base de datos, Auth, los registros y bytes de Storage, las migraciones, las políticas, las claves Vault, la configuración y las identidades de las versiones.



## Definir el contexto Compose instalado {#context}

Sustituya las rutas y la versión del ejemplo por las de la instancia instalada y defina MODE=full. Incluya cualquier override de restauración existente en todos los comandos Compose. Usar solo docker compose upstream omite el overlay Minddy y el entorno protegido. No ejecute el archivo de entorno como código shell ni lo imprima. La secuencia siguiente detiene todos los servicios antes de copiar los archivos de PostgreSQL.

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

## Sellar el conjunto correspondiente {#backup}

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

## Verificar el resultado {#verify}

Copie el conjunto sellado a un disco o servidor independiente y verifique allí SHA256SUMS. Una segunda copia en el mismo servidor no protege frente a la pérdida de ese servidor. Conserve los certificados TLS por separado si su política lo requiere. Si solo está haciendo una copia, reinicie con compose up -d --wait después de verificarla. Antes de confiar en ella, restáurela sobre un destino vacío y aislado, inicie sesión con MFA, compruebe las incidencias conservadas y descargue adjuntos con el mismo SHA-256. Conserve también las claves históricas correspondientes.

Si la instancia utiliza la solución fijada para el runner, conserve RUNNER_FIX_OVERRIDE y RUNNER_FIX_DIR junto con cualquier override de restauración. Estos archivos forman parte del conjunto de recuperación. Restablezca sus rutas absolutas o ajuste explícitamente los dos montajes a la nueva ubicación antes de iniciar el runner.

El comando de copia en frío también detecta un volumen con nombre de Storage basado en archivos y archiva sus bytes por separado. Un montaje de directorio sigue cubierto por supabase-docker.tar.gz. Ninguno de los casos cubre un backend S3 o de un proveedor.

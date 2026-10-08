---
{
  "id": "logical-and-provider-backups",
  "locale": "es",
  "title": "Crear copias lógicas o gestionadas por el proveedor",
  "summary": "Para instalaciones desde el código, bases de datos gestionadas o Storage personalizado, asocie los comandos de base de datos, bytes originales y proxy a la misma instancia instalada.",
  "topic": "Administrar una instancia",
  "type": "guide",
  "audiences": [
    "operator"
  ],
  "workflows": [
    "H12"
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
      "docs/self-hosting-logical-operations.md",
      "content/knowledge/self-hosting-operations.md"
    ]
  },
  "review": {
    "revision": 1,
    "fact": "agent:/root/automation_account_documentation (independent targeted primary-source review)",
    "language": "Codex agent review_documentation_locales: independent complete English/Spanish meaning and idiom review, not human review",
    "date": "2026-10-08"
  },
  "related": [
    "back-up-the-reference-instance",
    "restore-and-roll-back"
  ],
  "aliases": [],
  "tags": [],
  "figures": [],
  "requiredFigures": []
}
---
## Crear copias lógicas o gestionadas por el proveedor {#logical-and-provider-backups}

Para instalaciones desde el código, bases de datos gestionadas o Storage personalizado, asocie los comandos de base de datos, bytes originales y proxy a la misma instancia instalada. self-host:backup, self-host:update y self-host:restore son comprobaciones preliminares de solo lectura: no realizan las operaciones. Una copia completa conserva PostgreSQL con auth, los metadatos Storage y el historial de migraciones, los bytes originales de los archivos, la configuración protegida, las claves y las identidades exactas de Minddy y Supabase en un punto coherente, sin escrituras concurrentes.



## Supabase gestionado por un proveedor {#provider}

Para Supabase gestionado por un proveedor, registre el proyecto, la versión de la base de datos, el identificador de la copia o snapshot y su punto de recuperación. Detenga Minddy, los workers y las escrituras programadas; después use los controles de coherencia o mantenimiento que el proveedor admite para las escrituras directas de Auth, PostgREST y Storage. Si no existen esos controles, documente la limitación: detener solo la aplicación no basta.

Utilice las exportaciones SQL siguientes únicamente si el rol de base de datos y el proveedor las admiten, incluyendo Auth, metadatos Storage, historial de migraciones y políticas gestionadas. Conserve los bytes originales por separado mediante una exportación admitida o un snapshot inmutable del backend. Guarde el entorno y las claves Minddy y la configuración Auth/SMTP, URL, proxy y trabajos bajo su control. Los roles de plataforma y las claves pgsodium pueden pertenecer al proveedor; no los presente como archivos locales.

Los bloques siguientes con SUPABASE_COMPOSE_DIR, docker compose, supabase.env, pgsodium y tar filesystem solo se aplican a un backend controlado por el operador. Valide la restauración completa en un proyecto vacío independiente antes de confiar en la copia. No se ha realizado una copia ni una restauración de proveedor para esta revisión documental.



## Bloquear escrituras y exportar SQL {#outage}

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

## Conservar bytes y configuración {#bytes}

Si controla un Storage filesystem, detenga storage e imgproxy tras exportar SQL y archive su directorio conservando propietarios numéricos, ACL y atributos extendidos. Para S3, cree un snapshot o una versión inmutable de los bytes originales. No restaure mediante /storage/v1/s3: crea metadatos en conflicto. El proveedor controla los roles y el acceso filesystem de la plataforma; utilice su procedimiento admitido y registre su alcance. Copie en privado la configuración de Minddy y Supabase, los proxies, los trabajos, las plantillas Auth, el SMTP y cualquier clave raíz pgsodium. Incluya MINDDY_DATA_ROOT_KEY y los demás secretos conservados. SQL por sí solo no contiene los bytes de los adjuntos.

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

## Verificar el resultado {#verify}

Genere y verifique SHA256SUMS para el conjunto completo, cífrelo, cópielo fuera del servidor y vuelva a verificarlo en el destino. Registre las identidades de las versiones e imágenes, los recuentos de objetos y los hashes de archivos de muestra. Una exportación correcta no demuestra una restauración. Pruebe la restauración sobre un destino vacío con las versiones y la configuración guardadas antes de confiar en la copia, y documente las limitaciones del proveedor.

---
{
  "id": "storage-and-attachments",
  "locale": "es",
  "title": "Almacenamiento y archivos adjuntos",
  "summary": "PostgreSQL conserva los metadatos de los objetos Storage y las referencias de la aplicación; el backend Storage conserva sus bytes.",
  "topic": "Administrar una instancia",
  "type": "guide",
  "audiences": [
    "operator"
  ],
  "workflows": [
    "H07"
  ],
  "visibility": "public",
  "status": "published",
  "revision": 6,
  "sourceRevision": 6,
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
      "docs/self-hosting-operations.md",
      "docs/self-hosting-logical-operations.md",
      "lib/server/page-files.ts",
      "lib/server/page-publication.ts"
    ]
  },
  "review": {
    "revision": 6,
    "fact": "agent:/root/min747 (0.20.0 release review: source audit against the v0.11.0..main delta, no correction needed; no screenshot in scope; no browser walkthrough of the procedures or operator rehearsal; earlier evidence retained in git history); agent:claude-code (manual figures rebuilt on the Aurora demo, catalog review labels and informal register; figures recaptured on 2026-10-22 from a local candidate against the preview demo account and inspected; no form submitted)",
    "language": "agent:/root/min747 (es translation of the release corrections with catalog UI labels; equivalent meaning self-reviewed; agent review, not human acceptance); agent:claude-code (es manual figures rebuilt on the Aurora demo, catalog review labels and informal register; self-reviewed; agent review, not human acceptance)",
    "date": "2026-10-22"
  },
  "related": [
    "backups-and-restoration"
  ],
  "aliases": [],
  "tags": [
    "Mantener Storage duradero y diagnosticar archivos adjuntos"
  ],
  "figures": [
    {
      "id": "storage-and-attachments-flow",
      "kind": "diagram",
      "src": "/documentation/es/storage-and-attachments-flow.svg",
      "alt": "Diagrama: Acceso a archivo autorizado. Metadatos PostgreSQL del objeto. Bytes brutos en archivos o S3. Configuración y claves correspondientes.",
      "caption": "Una restauración necesita los metadatos, los archivos y la configuración protegida que correspondan al mismo conjunto.",
      "revision": 6,
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
            "title": "Acceso a archivo autorizado"
          },
          {
            "title": "Metadatos PostgreSQL del objeto"
          },
          {
            "title": "Bytes brutos en archivos o S3"
          },
          {
            "title": "Configuración y claves correspondientes"
          }
        ]
      }
    }
  ],
  "requiredFigures": [
    "storage-and-attachments-flow"
  ]
}
---

## Mantener Storage duradero y diagnosticar archivos adjuntos {#storage-and-attachments}

PostgreSQL conserva los metadatos de los objetos Storage y las referencias de la aplicación; el backend Storage conserva sus bytes. Ambos deben pertenecer a la misma instancia y al mismo punto de copia. El perfil full con almacenamiento filesystem persiste los bytes en `docker/volumes/storage` de la distribución upstream fijada. Un backend compatible con S3 necesita un snapshot independiente de los bytes originales. Los archivos efímeros de los contenedores no son Storage duradero. Vigila la capacidad para la base de datos, los adjuntos y las copias, y mantén estas últimas fuera del disco activo de Storage.

![Diagrama: Acceso a archivo autorizado. Metadatos PostgreSQL del objeto. Bytes brutos en archivos o S3. Configuración y claves correspondientes.](/documentation/es/storage-and-attachments-flow.svg)

## Comprobar acceso autorizado {#access}

La aplicación verifica la autorización antes de permitir descargar archivos privados de páginas e incidencias. Publicar una página expone solo los archivos del conjunto publicado mediante URL firmadas; no convierte el bucket en público ni abre las rutas privadas. Que exista un objeto en disco no demuestra que sus metadatos, políticas, clave de cifrado o permisos sean correctos. Con una cuenta de demostración, sube y descarga un archivo y compara su SHA-256. Repite la prueba tras restaurar para cada bucket utilizado.

## Recuperarse de un fallo {#recover}

Ejecuta la verificación de Supabase, comprueba que el entorno y la clave service-role corresponden y compara los registros de objetos con los bytes originales y las claves conservadas. Corrige el servicio, la política o la configuración antes de volver a intentarlo. No elimines un bucket `avatars` que contiene archivos para quitar una advertencia. Restaurar registros SQL no recupera los bytes. Para S3, restaura el snapshot del backend original; no reimportes mediante `/storage/v1/s3`, que puede crear metadatos en conflicto.

```bash
pnpm verify:supabase --db-url "$SUPABASE_DB_URL" \
  --supabase-url "$MINDDY_PUBLIC_SUPABASE_URL" \
  --service-role-key "$SUPABASE_SERVICE_ROLE_KEY"
```

## Storage con sistema de archivos en Docker Desktop {#docker-desktop}

En el perfil probado de macOS con Docker Desktop, un montaje de directorio del equipo devolvió `ENOTSUP` cuando Storage escribió atributos extendidos. Un volumen Linux nuevo con nombre evitó el fallo. Para una instalación nueva sin bytes de objetos, el siguiente override persistente sustituye solo el montaje de Storage. Conserva `RESTORE_OVERRIDE` en el contexto instalado de Compose. No sustituyas un montaje con datos por un volumen vacío ni sobrescribas un override de restauración existente: detén las escrituras y preserva primero sus bytes mediante los procedimientos de copia de seguridad y restauración.

```bash
: "${RESTORE_OVERRIDE:=/etc/minddy/storage-volume.yml}"
export RESTORE_OVERRIDE
test ! -e "$RESTORE_OVERRIDE"
export STORAGE_VOLUME=minddy-filesystem-storage
if docker volume inspect "$STORAGE_VOLUME" >/dev/null 2>&1; then
  echo "Refusing to replace an existing Storage volume." >&2
  exit 1
fi
cat > "$RESTORE_OVERRIDE" <<EOF
services:
  storage:
    volumes:
      - $STORAGE_VOLUME:/var/lib/storage
volumes:
  $STORAGE_VOLUME:
EOF
# Apply this overlay with the installed Compose context before the first start.
```

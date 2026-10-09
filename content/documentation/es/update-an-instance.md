---
{
  "id": "update-an-instance",
  "locale": "es",
  "title": "Actualizaciones de la instancia",
  "summary": "Actualice una versión publicada cada vez.",
  "topic": "Administrar una instancia",
  "type": "guide",
  "audiences": [
    "operator"
  ],
  "workflows": [
    "H13"
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
      "docs/self-hosting-distribution.md"
    ]
  },
  "review": {
    "revision": 2,
    "fact": "agent:/root/german_spanish_review (structural consolidation review; prior procedural evidence retained; no operational rerun)",
    "language": "agent:/root/german_spanish_review (es title, summary, lead and heading review; retained body comparison)",
    "date": "2026-10-09"
  },
  "related": [
    "backups-and-restoration"
  ],
  "aliases": [],
  "tags": [
    "Actualizar una instancia conservando la recuperación"
  ],
  "figures": [
    {
      "id": "update-an-instance-flow",
      "kind": "diagram",
      "src": "/documentation/es/update-an-instance-flow.svg",
      "alt": "Diagrama: Parar escrituras y tareas. Sellar copia completa anterior. Migraciones destino, luego aplicación. Verificar recuperación y reabrir.",
      "caption": "Siga las etapas en este orden. Parar escrituras y tareas. Sellar copia completa anterior. Migraciones destino, luego aplicación. Verificar recuperación y reabrir.",
      "revision": 2,
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
            "title": "Parar escrituras y tareas"
          },
          {
            "title": "Sellar copia completa anterior"
          },
          {
            "title": "Migraciones destino, luego aplicación"
          },
          {
            "title": "Verificar recuperación y reabrir"
          }
        ]
      }
    }
  ],
  "requiredFigures": [
    "update-an-instance-flow"
  ]
}
---

## Actualizar una instancia conservando la recuperación {#update-an-instance}

Actualice una versión publicada cada vez. Revise las notas, las diferencias de migraciones y las entradas de compatibilidad. No combine una actualización de minddy con una nueva versión principal de PostgreSQL o un cambio de imágenes Supabase. Verifique el código de destino, las sumas de los archivos y el digest OCI y prepare un directorio de versión independiente con dependencias fijadas. Anuncie la interrupción y el plazo para cancelar. Confirme una copia externa utilizable y una restauración reciente. Conserve la aplicación actual lista para reiniciar y su entorno protegido.

![Diagrama: Parar escrituras y tareas. Sellar copia completa anterior. Migraciones destino, luego aplicación. Verificar recuperación y reabrir.](/documentation/es/update-an-instance-flow.svg)

## Actualizar el perfil full {#full}

Utilice [el contexto Compose full de la copia en frío](/es/documentacion/backups-and-restoration#context). Detenga las entradas públicas, todas las escrituras, los workers y el planificador; después cree la copia sellada completa. Copie el entorno actual con permisos 0600 a TARGET_ENV_FILE y modifique solo MINDDY_RELEASE, MINDDY_IMAGE, MINDDY_DEPLOY_DIR y MINDDY_ENV_FILE para el destino verificado. Conserve las URL, las credenciales, las claves de cifrado y las opciones de funcionalidades. La secuencia siguiente arranca las dependencias del backend, aplica las migraciones del destino y verifica la aplicación y el runner mientras el planificador y Caddy permanecen detenidos.

Al actualizar de v0.10.30 a v0.11.0, la versión de destino introduce MINDDY_DATA_ROOT_KEY. Añada la clave solo si la configuración existente no contiene una raíz y conserve todos los secretos que ya cifran las credenciales. El comando siguiente escribe una nueva raíz de 32 bytes directamente en el archivo de destino protegido, sin mostrarla, y se niega a sustituir un valor guardado no válido. La raíz por sí sola no activa el cifrado del contenido. Antes de iniciar la versión de destino, aplique las [adaptaciones fijadas del runner y de las funciones sin conexión](/es/documentacion/installation#runner-workaround) y conserve RUNNER_FIX_OVERRIDE en cada operación de Compose. Este perfil está adaptado explícitamente; no demuestra una instalación satisfactoria de la etiqueta histórica sin cambios.

```bash
export TARGET_RELEASE_DIR=/srv/minddy/releases/vX.Y.NEXT
export TARGET_ENV_FILE=/etc/minddy/target.env
install -m 0600 "$MINDDY_ENV_FILE" "$TARGET_ENV_FILE"
compose up -d --wait db database-access kong auth rest storage imgproxy
cd "$TARGET_RELEASE_DIR"
pnpm install --frozen-lockfile
node --input-type=module <<'NODE'
import {readFileSync, writeFileSync, chmodSync} from 'node:fs';
import {randomBytes} from 'node:crypto';
import {parseEnvironment} from './scripts/self-hosting-install.mjs';
const file = process.env.TARGET_ENV_FILE;
const text = readFileSync(file, 'utf8');
const values = parseEnvironment(text);
if (Object.hasOwn(values, 'MINDDY_DATA_ROOT_KEY')) {
  if (!/^[a-f0-9]{64}$/i.test(values.MINDDY_DATA_ROOT_KEY)) {
    throw new Error('Recover the valid existing root key; do not replace it.');
  }
} else {
  writeFileSync(file, text + '\nMINDDY_DATA_ROOT_KEY=' + randomBytes(32).toString('hex') + '\n', {mode: 0o600});
  chmodSync(file, 0o600);
}
NODE
SUPABASE_DB_URL="$(node --input-type=module -e '
  import {readFileSync} from "node:fs";
  import {parseEnvironment,fullBootstrapDatabaseUrl} from "./scripts/self-hosting-install.mjs";
  console.log(fullBootstrapDatabaseUrl(parseEnvironment(readFileSync(process.env.TARGET_ENV_FILE,"utf8"))));
')"
node scripts/bootstrap-supabase.mjs --db-url "$SUPABASE_DB_URL" \
  --env-file "$TARGET_ENV_FILE" --existing-env --supabase-url http://127.0.0.1:8001 --enable scheduler
unset SUPABASE_DB_URL
export CURRENT_RELEASE_DIR="$TARGET_RELEASE_DIR"
export MINDDY_ENV_FILE="$TARGET_ENV_FILE"
node scripts/prepare-self-hosted-functions.mjs --supabase-dir "$SUPABASE_DIR" \
  --env-file "$MINDDY_ENV_FILE"
compose pull minddy agent-runner
compose up -d --wait minddy agent-runner
pnpm self-host:doctor -- --mode full --env-file "$MINDDY_ENV_FILE" \
  --supabase-compose "$SUPABASE_DIR/docker/docker-compose.yml" --skip-network --maintenance
compose up -d --wait
pnpm self-host:doctor -- --mode full --env-file "$MINDDY_ENV_FILE" \
  --supabase-compose "$SUPABASE_DIR/docker/docker-compose.yml"
```

## Distinguir operaciones managed y fuentes {#managed-source}

Para managed OCI, siga la misma secuencia de entorno e imagen de destino usando las copias y el acceso a las migraciones de la base de datos y Storage admitidos por el proveedor, sin iniciar servicios de base de datos locales. Para instalar desde el código, compile la etiqueta de destino, bloquee las escrituras por API, cree una copia lógica o del proveedor, aplique bootstrap con el código de destino e inicie el servicio de producción en mantenimiento. No sustituya OCI por un servidor compilado para validar una actualización OCI. No inicie el código anterior sobre un esquema modificado salvo que la versión garantice expresamente la compatibilidad.

Los comandos Compose siguientes solo corresponden a un backend controlado por el operador. Con Supabase gestionado, sustituya su parada, inicio y acceso a migraciones por las operaciones admitidas por el proveedor, conservando el entorno protegido y la copia completa.

Para la secuencia desde el código, MINDDY_REPO es el repositorio versionado y SUPABASE_COMPOSE_DIR es el backend controlado por el operador, como en [el contexto de copia lógica](/es/documentacion/backups-and-restoration#outage). Defina TO_TAG con la siguiente etiqueta realmente publicada y verificada y TARGET_RELEASE_DIR con su checkout separado, ya compilado. Configure SUPABASE_DB_URL, MINDDY_PUBLIC_SUPABASE_URL y SUPABASE_SERVICE_ROLE_KEY en privado para ese destino. Tras bootstrap y verify, inicie pnpm start o el supervisor ya configurado, manteniendo las entradas y los trabajos cerrados hasta completar las verificaciones.

```bash
test "$(git -C "$TARGET_RELEASE_DIR" rev-parse HEAD)" = \
  "$(git -C "$MINDDY_REPO" rev-parse "${TO_TAG}^{commit}")"
test -d "$TARGET_RELEASE_DIR/.next"
cd "$SUPABASE_COMPOSE_DIR"
docker compose up -d storage imgproxy
cd "$TARGET_RELEASE_DIR"
pnpm bootstrap:supabase -- --db-url "$SUPABASE_DB_URL" --env-file .env.local
pnpm verify:supabase --db-url "$SUPABASE_DB_URL" \
  --supabase-url "$MINDDY_PUBLIC_SUPABASE_URL" \
  --service-role-key "$SUPABASE_SERVICE_ROLE_KEY"
curl --fail --silent --show-error "$MINDDY_PUBLIC_SUPABASE_URL/auth/v1/health"
```

## Verificar el resultado {#verify}

Ejecute doctor en mantenimiento antes de reabrir las entradas y los trabajos y ejecútelo normalmente después. Inicie sesión, compruebe los identificadores de proyectos e incidencias, cree o edite datos de demostración y suba y descargue un adjunto comparando su SHA-256. Pruebe Realtime y un trabajo inocuo. Una clave de integración revocada debe seguir siendo rechazada. Registre el digest y el historial de migraciones. Si falla la verificación, mantenga el entorno fallido detenido. Para volver a una versión incompatible tras migrar, restaure el conjunto completo anterior en un destino vacío. No se generan migraciones inversas.

---
{
  "id": "update-an-instance",
  "locale": "es",
  "title": "Actualizaciones de la instancia",
  "summary": "Actualiza una versión publicada cada vez.",
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
      "docs/self-hosting-operations.md",
      "docs/self-hosting-logical-operations.md",
      "docs/self-hosting-distribution.md"
    ]
  },
  "review": {
    "revision": 6,
    "fact": "agent:/root/min747 (0.20.0 release review: source audit against the v0.11.0..main delta, verified corrections applied; no screenshot in scope; no browser walkthrough of the procedures or operator rehearsal; earlier evidence retained in git history); agent:claude-code (manual figures rebuilt on the Aurora demo, catalog review labels and informal register; figures recaptured on 2026-10-22 from a local candidate against the preview demo account and inspected; no form submitted)",
    "language": "agent:/root/min747 (es translation of the release corrections with catalog UI labels; equivalent meaning self-reviewed; agent review, not human acceptance); agent:claude-code (es manual figures rebuilt on the Aurora demo, catalog review labels and informal register; self-reviewed; agent review, not human acceptance)",
    "date": "2026-10-22"
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
      "caption": "Sigue las etapas en este orden. Parar escrituras y tareas. Sellar copia completa anterior. Migraciones destino, luego aplicación. Verificar recuperación y reabrir.",
      "revision": 6,
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

Actualiza una versión publicada cada vez. Revisa las notas, las diferencias de migraciones y las entradas de compatibilidad. No combines una actualización de minddy con una nueva versión principal de PostgreSQL o un cambio de imágenes Supabase. Verifica el código de destino, las sumas de los archivos y el digest OCI y prepara un directorio de versión independiente con dependencias fijadas. Anuncia la interrupción y el plazo para cancelar. Confirma una copia externa utilizable y una restauración reciente. Conserva la aplicación actual lista para reiniciar y su entorno protegido.

Algunas migraciones eliminan definitivamente datos de funciones retiradas. La actualización de v0.11.0 a v0.20.0 elimina los registros de dominios personalizados, las ejecuciones y conversaciones del agente de código con su historial y sus conexiones, y las vistas guardadas de la paleta de comandos (marcadores personales; las vistas de tablero se conservan). Después de estas migraciones, solo la copia completa anterior a la actualización puede recuperarlos.

![Diagrama: Parar escrituras y tareas. Sellar copia completa anterior. Migraciones destino, luego aplicación. Verificar recuperación y reabrir.](/documentation/es/update-an-instance-flow.svg)

## Actualizar el perfil full {#full}

Utiliza [el contexto Compose full de la copia en frío](/es/documentacion/backups-and-restoration#context). Detén las entradas públicas, todas las escrituras, los workers y el planificador; después crea la copia sellada completa. Copia el entorno actual con permisos `0600` a `TARGET_ENV_FILE` y modifica solo `MINDDY_RELEASE`, `MINDDY_IMAGE`, `MINDDY_DEPLOY_DIR` y `MINDDY_ENV_FILE` para el destino verificado. Conserva las URL, las credenciales, las claves de cifrado y las opciones de funcionalidades. Elimina `AGENT_EXECUTION_BACKEND`, `AGENT_RUNNER_URL`, `AGENT_RUNNER_SECRET`, `AGENT_CONTROL_ORIGIN` y las variables de Vercel Sandbox `VERCEL_TOKEN`, `VERCEL_TEAM_ID` y `VERCEL_PROJECT_ID` si una versión anterior los dejó: la aplicación ya no los lee, y `--remove-orphans` elimina el contenedor retirado `agent-runner`. La secuencia siguiente arranca las dependencias del backend, aplica las migraciones del destino y verifica la aplicación mientras el planificador y Caddy permanecen detenidos.

Al actualizar de v0.10.30 a v0.11.0, la versión de destino introduce `MINDDY_DATA_ROOT_KEY`. Añade la clave solo si la configuración existente no contiene una raíz y conserva todos los secretos que ya cifran las credenciales. El comando siguiente escribe una nueva raíz de 32 bytes directamente en el archivo de destino protegido, sin mostrarla, y se niega a sustituir un valor guardado no válido. Si el origen es v0.11.0 o posterior, la raíz normalmente ya existe y el comando solo la comprueba. La raíz por sí sola no activa el cifrado del contenido: un entorno sin `MINDDY_CONTENT_ENCRYPTION_ENABLED=true` lo mantiene desactivado.

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
compose pull minddy
compose up -d --wait --remove-orphans minddy
pnpm self-host:doctor -- --mode full --env-file "$MINDDY_ENV_FILE" \
  --supabase-compose "$SUPABASE_DIR/docker/docker-compose.yml" --skip-network --maintenance
compose up -d --wait
pnpm self-host:doctor -- --mode full --env-file "$MINDDY_ENV_FILE" \
  --supabase-compose "$SUPABASE_DIR/docker/docker-compose.yml"
```

## Distinguir operaciones managed y fuentes {#managed-source}

Para managed OCI, sigue la misma secuencia de entorno e imagen de destino usando las copias y el acceso a las migraciones de la base de datos y Storage admitidos por el proveedor, sin iniciar servicios de base de datos locales. Para instalar desde el código, compila la etiqueta de destino, bloquea las escrituras por API, crea una copia lógica o del proveedor, aplica bootstrap con el código de destino e inicia el servicio de producción en mantenimiento. No sustituyas OCI por un servidor compilado para validar una actualización OCI. No inicies el código anterior sobre un esquema modificado salvo que la versión garantice expresamente la compatibilidad.

Los comandos Compose siguientes solo corresponden a un backend controlado por el operador. Con Supabase gestionado, sustituye su parada, inicio y acceso a migraciones por las operaciones admitidas por el proveedor, conservando el entorno protegido y la copia completa.

Para la secuencia desde el código, `MINDDY_REPO` es el repositorio versionado y `SUPABASE_COMPOSE_DIR` es el backend controlado por el operador, como en [el contexto de copia lógica](/es/documentacion/backups-and-restoration#outage). Define `TO_TAG` con la siguiente etiqueta realmente publicada y verificada y `TARGET_RELEASE_DIR` con su checkout separado, ya compilado. Configura `SUPABASE_DB_URL`, `MINDDY_PUBLIC_SUPABASE_URL` y `SUPABASE_SERVICE_ROLE_KEY` en privado para ese destino. Tras bootstrap y verify, inicia `pnpm start` o el supervisor ya configurado, manteniendo las entradas y los trabajos cerrados hasta completar las verificaciones.

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

Ejecuta doctor en mantenimiento antes de reabrir las entradas y los trabajos y ejecútalo normalmente después. Inicia sesión, comprueba los identificadores de proyectos e incidencias, crea o edita datos de demostración y sube y descarga un adjunto comparando su SHA-256. Prueba Realtime y un trabajo inocuo. Una clave de integración revocada debe seguir siendo rechazada. Registra el digest y el historial de migraciones. Si falla la verificación, mantén el entorno fallido detenido. Para volver a una versión incompatible tras migrar, restaura el conjunto completo anterior en un destino vacío. No se generan migraciones inversas.

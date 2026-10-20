---
{
  "id": "self-hosted-diagnostics",
  "locale": "es",
  "title": "Diagnóstico de la instancia",
  "summary": "Ejecute doctor, que es de solo lectura, desde el checkout exacto de la versión y con el entorno instalado.",
  "topic": "Administrar una instancia",
  "type": "troubleshooting",
  "audiences": [
    "operator"
  ],
  "workflows": [
    "H15"
  ],
  "visibility": "public",
  "status": "published",
  "revision": 6,
  "sourceRevision": 6,
  "owner": "@mangue-dev",
  "updatedAt": "2026-10-20",
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
      "scripts/self-hosting-doctor.mjs",
      "docs/self-hosting.md",
      "docs/self-hosting-clean-room.md"
    ]
  },
  "review": {
    "revision": 6,
    "fact": "agent:/root/min747 (0.20.0 release review: source audit against the v0.11.0..main delta, verified corrections applied; no screenshot in scope; no browser walkthrough of the procedures or operator rehearsal; earlier evidence retained in git history)",
    "language": "agent:/root/min747 (es translation of the release corrections with catalog UI labels; equivalent meaning self-reviewed; agent review, not human acceptance)",
    "date": "2026-10-20"
  },
  "related": [
    "instance-configuration",
    "authentication-and-email",
    "storage-and-attachments"
  ],
  "aliases": [],
  "tags": [
    "Diagnosticar una instalación self-hosted"
  ],
  "figures": [],
  "requiredFigures": []
}
---

## Diagnosticar una instalación self-hosted {#self-hosted-diagnostics}

Ejecute doctor, que es de solo lectura, desde el checkout exacto de la versión y con el entorno instalado. Para `--mode full`, indique el Compose upstream; para managed, proporcione la conexión del proveedor. Comprueba compatibilidad, configuración, contenedores, DNS/TLS, aplicación, disco y planificador. Las verificaciones de base de datos, migraciones y Storage necesitan la conexión correspondiente. El informe oculta secretos, pero debe revisarlo antes de compartirlo. Que la aplicación esté activa no demuestra la entrega de email, la lectura de datos cifrados ni la recuperación de archivos.

```bash
pnpm self-host:doctor -- --mode full --env-file "$MINDDY_ENV_FILE" \
  --supabase-compose "$SUPABASE_DIR/docker/docker-compose.yml" --json
```

## Asociar síntoma y comprobación {#symptoms}

Si recibe muchos 401 tras restaurar, compruebe que JWT y las claves anon y service-role pertenecen al mismo entorno. Para subidas fallidas o archivos 404, compare políticas Storage, registros, bytes originales y claves. Si faltan relaciones, conserve el primer error de migración, compruebe disco, bloqueos y URL de destino y repita bootstrap solo después de resolver la causa. No marque manualmente como aplicadas las migraciones fallidas. Para Realtime, compruebe publication, JWT, el proxy WebSocket y los registros. Si cron no se ejecuta o devuelve 401, verifique en privado el planificador, la URL de origen y `CRON_SECRET`. Si falla la compatibilidad de versión, compare `MINDDY_RELEASE` con una entrada de `deploy/self-hosted/compatibility.json` y `MINDDY_IMAGE` con esa entrada o con el digest inmutable verificado. El instalador copia `MINDDY_RELEASE` de la plantilla de despliegue.

## Preservar la recuperación {#recovery}

Corrija los requisitos Docker/CLI o los valores de API incompletos y repita el instalador idempotente conservando el entorno. Tras corregir las URL públicas de ejecución, recree la aplicación sin recompilar OCI. No elimine buckets con archivos, restablezca la base de datos ni cambie claves raíz para quitar advertencias. Los informes de capacidades opcionales desactivadas pueden ser normales cuando esos proveedores no se utilizan. Comparta versión, perfil, horas, códigos de error controlados y diagnósticos sin datos sensibles. Excluya contraseñas, tokens, encabezados `Authorization`, cookies, URL privadas y contenido de usuarios.

Si la descarga inicial se interrumpe con un registro largo de progreso y sin error del registro de imágenes, el instalador v0.11.0 puede haber superado el buffer de salida del subproceso. Los instaladores posteriores descargan en modo silencioso con un buffer mayor y, si la salida aún lo supera, se detienen con una instrucción explícita. En ambos casos, ejecute `compose pull --quiet` en el contexto Compose exacto de la instalación y repita después el mismo instalador con `--skip-pull` para usar las imágenes locales, conservando el entorno. Este procedimiento no corrige errores del registro ni firmas inválidas. Si la compilación offline informa de una versión `jose` distinta, deténgase. Las herramientas de v0.11.0 exigen 6.2.3, mientras su dependencia directa fijada resuelve 6.2.12; obtenga una combinación corregida de versión y herramientas antes de aceptar esa instalación. En las versiones posteriores, la versión fijada coincide con la dependencia fijada, de modo que una diferencia indica que `pnpm install --frozen-lockfile` no terminó en ese checkout. No relaje silenciosamente la comprobación de identidad.

El runner OCI de v0.11.0 tampoco arranca porque `agent-runner-storage.mjs` falta en la imagen de ejecución, de modo que la aplicación nunca llega a estar en buen estado. Las versiones posteriores eliminan ese runner y sus sandboxes de código. Actualice a una de esas versiones en lugar de montar archivos del runner o debilitar el aislamiento de los contenedores.

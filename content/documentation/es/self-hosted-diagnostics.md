---
{
  "id": "self-hosted-diagnostics",
  "locale": "es",
  "title": "Diagnóstico de la instancia",
  "summary": "Ejecuta doctor, que es de solo lectura, desde el checkout exacto de la versión y con el entorno instalado.",
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
  "revision": 7,
  "sourceRevision": 7,
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
      "scripts/self-hosting-doctor.mjs",
      "docs/self-hosting.md",
      "docs/self-hosting-clean-room.md"
    ]
  },
  "review": {
    "revision": 7,
    "fact": "agent:/root/min747 (0.20.0 release review: source audit against the v0.11.0..main delta, verified corrections applied; no screenshot in scope; no browser walkthrough of the procedures or operator rehearsal; earlier evidence retained in git history); agent:claude-code (manual figures rebuilt on the Aurora demo, catalog review labels and informal register; figures recaptured on 2026-10-22 from a local candidate against the preview demo account and inspected; no form submitted)",
    "language": "agent:/root/min747 (es translation of the release corrections with catalog UI labels; equivalent meaning self-reviewed; agent review, not human acceptance); agent:claude-code (es manual figures rebuilt on the Aurora demo, catalog review labels and informal register; self-reviewed; agent review, not human acceptance)",
    "date": "2026-10-22"
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

Ejecuta doctor, que es de solo lectura, desde el checkout exacto de la versión y con el entorno instalado. Para `--mode full`, indica el Compose upstream; para managed, proporciona la conexión del proveedor. Comprueba compatibilidad, configuración, contenedores, DNS/TLS, aplicación, disco y planificador. Las verificaciones de base de datos, migraciones y Storage necesitan la conexión correspondiente. El informe oculta secretos, pero debes revisarlo antes de compartirlo. Que la aplicación esté activa no demuestra la entrega de email, la lectura de datos cifrados ni la recuperación de archivos.

```bash
pnpm self-host:doctor -- --mode full --env-file "$MINDDY_ENV_FILE" \
  --supabase-compose "$SUPABASE_DIR/docker/docker-compose.yml" --json
```

## Asociar síntoma y comprobación {#symptoms}

Si recibes muchos 401 tras restaurar, comprueba que JWT y las claves anon y service-role pertenecen al mismo entorno. Para subidas fallidas o archivos 404, compara políticas Storage, registros, bytes originales y claves. Si faltan relaciones, conserva el primer error de migración, comprueba disco, bloqueos y URL de destino y repite bootstrap solo después de resolver la causa. No marques manualmente como aplicadas las migraciones fallidas. Para Realtime, comprueba publication, JWT, el proxy WebSocket y los registros. Si cron no se ejecuta o devuelve 401, verifica en privado el planificador, la URL de origen y `CRON_SECRET`. Si falla la compatibilidad de versión, compara `MINDDY_RELEASE` con una entrada de `deploy/self-hosted/compatibility.json` y `MINDDY_IMAGE` con esa entrada o con el digest inmutable verificado. El instalador copia `MINDDY_RELEASE` de la plantilla de despliegue.

## Preservar la recuperación {#recovery}

Corrige los requisitos Docker/CLI o los valores de API incompletos y repite el instalador idempotente conservando el entorno. Tras corregir las URL públicas de ejecución, recrea la aplicación sin recompilar OCI. No elimines buckets con archivos, restablezcas la base de datos ni cambies claves raíz para quitar advertencias. Los informes de capacidades opcionales desactivadas pueden ser normales cuando esos proveedores no se utilizan. Comparte versión, perfil, horas, códigos de error controlados y diagnósticos sin datos sensibles. Excluye contraseñas, tokens, encabezados `Authorization`, cookies, URL privadas y contenido de usuarios.

Si la descarga inicial se interrumpe con un registro largo de progreso y sin error del registro de imágenes, el instalador v0.11.0 puede haber superado el buffer de salida del subproceso. Los instaladores posteriores descargan en modo silencioso con un buffer mayor y, si la salida aún lo supera, se detienen con una instrucción explícita. En ambos casos, ejecuta `compose pull --quiet` en el contexto Compose exacto de la instalación y repite después el mismo instalador con `--skip-pull` para usar las imágenes locales, conservando el entorno. Este procedimiento no corrige errores del registro ni firmas inválidas. Si la compilación offline informa de una versión `jose` distinta, detente. Las herramientas de v0.11.0 exigen 6.2.3, mientras su dependencia directa fijada resuelve 6.2.12; obtén una combinación corregida de versión y herramientas antes de aceptar esa instalación. En las versiones posteriores, la versión fijada coincide con la dependencia fijada, de modo que una diferencia indica que `pnpm install --frozen-lockfile` no terminó en ese checkout. No relajes silenciosamente la comprobación de identidad.

El runner OCI de v0.11.0 tampoco arranca porque `agent-runner-storage.mjs` falta en la imagen de ejecución, de modo que la aplicación nunca llega a estar en buen estado. Las versiones posteriores eliminan ese runner y sus sandboxes de código. Actualiza a una de esas versiones en lugar de montar archivos del runner o debilitar el aislamiento de los contenedores.

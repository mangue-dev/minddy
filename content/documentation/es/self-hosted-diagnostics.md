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
  "revision": 4,
  "sourceRevision": 4,
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
      "scripts/self-hosting-doctor.mjs",
      "docs/self-hosting.md",
      "docs/self-hosting-clean-room.md"
    ]
  },
  "review": {
    "revision": 4,
    "fact": "agent:/root/german_spanish_review (structural consolidation review; prior procedural evidence retained; no operational rerun); agent:/root (visual usefulness, figure framing and preserved procedures; previous operational evidence retained); agent:/root (technical-reference formatting; prior factual evidence retained; no operational rerun)",
    "language": "agent:/root/german_spanish_review (es title, summary, lead and heading review; retained body comparison); agent:/root (inline-code syntax and unchanged-text review)",
    "date": "2026-10-09"
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

Ejecute doctor, que es de solo lectura, desde el checkout exacto de la versión y con el entorno instalado. Para `--mode full`, indique el Compose upstream; para managed, proporcione la conexión del proveedor. Comprueba compatibilidad, configuración, contenedores, DNS/TLS, aplicación, disco, planificador y runner. Las verificaciones de base de datos, migraciones y Storage necesitan la conexión correspondiente. El informe oculta secretos, pero debe revisarlo antes de compartirlo. Que la aplicación esté activa no demuestra la entrega de email, la lectura de datos cifrados ni la recuperación de archivos.

```bash
pnpm self-host:doctor -- --mode full --env-file "$MINDDY_ENV_FILE" \
  --supabase-compose "$SUPABASE_DIR/docker/docker-compose.yml" --json
```

## Asociar síntoma y comprobación {#symptoms}

Si recibe muchos 401 tras restaurar, compruebe que JWT y las claves anon y service-role pertenecen al mismo entorno. Para subidas fallidas o archivos 404, compare políticas Storage, registros, bytes originales y claves. Si faltan relaciones, conserve el primer error de migración, compruebe disco, bloqueos y URL de destino y repita bootstrap solo después de resolver la causa. No marque manualmente como aplicadas las migraciones fallidas. Para Realtime, compruebe publication, JWT, el proxy WebSocket y los registros. Si cron no se ejecuta o devuelve 401, verifique en privado el planificador, la URL de origen y `CRON_SECRET`.

## Preservar la recuperación {#recovery}

Corrija los requisitos Docker/CLI o los valores de API incompletos y repita el instalador idempotente conservando el entorno. Tras corregir las URL públicas de ejecución, recree la aplicación sin recompilar OCI. No elimine buckets con archivos, restablezca la base de datos ni cambie claves raíz para quitar advertencias. Los informes de capacidades opcionales desactivadas pueden ser normales cuando esos proveedores no se utilizan. Comparta versión, perfil, horas, códigos de error controlados y diagnósticos sin datos sensibles. Excluya contraseñas, tokens, encabezados `Authorization`, cookies, URL privadas y contenido de usuarios.

Si la descarga inicial se interrumpe con un registro largo de progreso y sin error del registro de imágenes, el instalador v0.11.0 puede haber superado el buffer de salida del subproceso. En el contexto Compose exacto de la instalación, `compose pull --quiet` funcionó en la prueba desechable. Repita después el mismo instalador con `--skip-pull` para usar las imágenes locales, conservando el entorno. Este procedimiento no corrige errores del registro ni firmas inválidas. Si la compilación offline informa de una versión `jose` distinta tras instalar las dependencias fijadas, deténgase: la versión exige 6.2.3, mientras su dependencia directa fijada resuelve 6.2.12. Obtenga una combinación corregida de versión y herramientas antes de aceptar la instalación estándar; no relaje silenciosamente la comprobación de identidad.

El runner OCI de v0.11.0 tampoco arranca porque `agent-runner-storage.mjs` falta en la imagen de ejecución. El `Dockerfile` actual incluye ahora esa dependencia. La prueba de ingeniería desechable proporcionó el archivo de la misma etiqueta mediante un montaje de solo lectura. Ese perfil modificado no valida la imagen firmada sin cambios. No publique el puerto del runner ni retire su aislamiento para evitar un fallo de inicio.

---
{
  "id": "proxy-network-and-jobs",
  "locale": "es",
  "title": "Publicar los orígenes y ejecutar tareas programadas",
  "summary": "Un servicio público requiere un proxy inverso TLS y una redirección de HTTP a HTTPS.",
  "topic": "Administrar una instancia",
  "type": "guide",
  "audiences": [
    "operator"
  ],
  "workflows": [
    "H08"
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
      "docs/self-hosting-distribution.md",
      "vercel.json",
      "deploy/self-hosted/compose.full.yml",
      "deploy/self-hosted/scheduler.mjs"
    ]
  },
  "review": {
    "revision": 1,
    "fact": "agent:/root/automation_account_documentation (independent targeted primary-source review)",
    "language": "Codex agent review_documentation_locales: independent complete English/Spanish meaning and idiom review, not human review",
    "date": "2026-10-08"
  },
  "related": [
    "update-an-instance",
    "numo-execution-model"
  ],
  "aliases": [],
  "tags": [],
  "figures": [
    {
      "id": "proxy-network-and-jobs-flow",
      "kind": "diagram",
      "src": "/documentation/es/proxy-network-and-jobs-flow.svg",
      "alt": "Diagrama: Proxy HTTPS público. Orígenes públicos de la aplicación y Supabase. Runner, base y puertos privados. Tareas autenticadas; paradas en mantenimiento.",
      "caption": "Estos componentes tienen responsabilidades distintas. Proxy HTTPS público. Orígenes públicos de la aplicación y Supabase. Runner, base y puertos privados. Tareas autenticadas; paradas en mantenimiento.",
      "revision": 1,
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
    "proxy-network-and-jobs-flow"
  ]
}
---
## Publicar los orígenes y ejecutar tareas programadas {#proxy-network-and-jobs}

Un servicio público requiere un proxy inverso TLS y una redirección de HTTP a HTTPS. Las URL de origen de la aplicación y Supabase, las redirecciones Auth, los callbacks OAuth y los encabezados reenviados deben concordar. Mantenga PostgreSQL, Studio, los puertos internos y el runner fuera de Internet. En full, la aplicación usa http://kong:8000 internamente, mientras el navegador y los enlaces conservan la URL pública de Supabase. HTTP privado exige localhost o una red IPv4 privada de confianza, sin redirección de puertos del router.

![Diagrama: Proxy HTTPS público. Orígenes públicos de la aplicación y Supabase. Runner, base y puertos privados. Tareas autenticadas; paradas en mantenimiento.](/documentation/es/proxy-network-and-jobs-flow.svg)

## Configurar programación autenticada {#schedules}

Los perfiles Compose de referencia inician su planificador y el instalador genera CRON_SECRET. Un despliegue personalizado desde el código necesita un planificador HTTP equivalente. Cada petición envía `Authorization: Bearer <CRON_SECRET>`; si el secreto está vacío o no coincide, recibe 401. No registre ese encabezado. Los horarios siguientes corresponden al candidato y están en UTC. Utilice las rutas de la versión desplegada, porque pueden cambiar.

El planificador publicado en v0.11.0 no incluye numo-turns. El candidato se ha corregido para llamarlo cada minuto. La tabla describe el candidato corregido; no dé por hecho que ese trabajo existe en una instalación v0.11.0 sin cambios.

| Endpoint | Horario (UTC) |
| --- | --- |
| `/api/cron/feedback-analysis` | `0 * * * *` |
| `/api/cron/agent-drain` | `*/2 * * * *` |
| `/api/cron/numo-turns` | `* * * * *` |
| `/api/cron/forge-relay-deliveries` | `* * * * *` |
| `/api/cron/forge-relay-maintenance` | `35 * * * *` |
| `/api/cron/automations` | `*/2 * * * *` |
| `/api/cron/smart-assign` | `*/5 * * * *` |
| `/api/cron/routines` | `*/5 * * * *` |
| `/api/cron/billing-sync` | `15 * * * *` |
| `/api/cron/fx-rate` | `30 15 * * *` |
| `/api/cron/encryption-maintenance` | `15 * * * *` |
| `/api/cron/data-retention` | `45 3 * * *` |

## Parar tareas durante mantenimiento {#maintenance}

Antes de una copia o migración, detenga el planificador, la aplicación, los workers y el acceso público a Supabase. Detener solo el servidor web deja posibles escrituras directas por API. Ejecute las comprobaciones en mantenimiento, con entradas y trabajos cerrados, y reabra solo cuando se hayan verificado la base de datos, Auth, Storage y la aplicación. Si un trabajo no arranca, compruebe en privado el planificador, la URL de origen y el secreto. Las rutinas requieren un planificador de servidor activo; no es necesario mantener abierta una aplicación de escritorio.

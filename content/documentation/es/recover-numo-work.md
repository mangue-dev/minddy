---
{
  "id": "recover-numo-work",
  "locale": "es",
  "title": "Recuperar trabajo de Numo detenido o pendiente",
  "summary": "Identificar la causa y comprobar los resultados guardados antes de continuar.",
  "topic": "Numo e integraciones",
  "type": "troubleshooting",
  "audiences": [
    "member"
  ],
  "workflows": [
    "N05"
  ],
  "visibility": "public",
  "status": "published",
  "revision": 1,
  "sourceRevision": 1,
  "owner": "@mangue-dev",
  "updatedAt": "2026-10-08",
  "compatibility": {
    "version": "0.11.1 candidate (cd1843e12)",
    "editions": [
      "Cloud",
      "self-hosted"
    ],
    "profiles": [
      "web",
      "mobile",
      "desktop"
    ],
    "evidence": [
      "components/assistant/usage-exhausted-card.tsx",
      "components/assistant/ask-user-card.tsx",
      "docs/architecture/numo-durable-turns.md"
    ]
  },
  "review": {
    "revision": 1,
    "fact": "2026-10-08",
    "language": "2026-10-08",
    "date": "2026-10-08"
  },
  "related": [],
  "aliases": [],
  "tags": [],
  "figures": [
    {
      "id": "recover-numo-work-workflow",
      "kind": "screenshot",
      "src": "/documentation/es/recover-numo-work-workflow.png",
      "alt": "Respuesta de Numo que informa de código y pruebas locales, un envío de rama fallido y ninguna pull request en ese momento.",
      "caption": "Resultado parcial inicial de una ejecución real de demostración, localizado para su lectura. En ese momento falló el envío y no existía ninguna PR. Compruebe la rama guardada y los servicios externos antes de continuar; después se retomó la conversación y se corrigió la PR.",
      "revision": 1,
      "reviewed": true,
      "capturedAt": "2026-10-08",
      "viewport": [
        1480,
        1100
      ],
      "theme": "light"
    }
  ],
  "requiredFigures": [
    "recover-numo-work-workflow"
  ]
}
---

## Leer el estado final {#recover-numo-work}
Vuelva a la conversación existente y lea los últimos mensajes y la tarjeta del agente. Distinga preguntas pendientes, límite de cuenta, tope de rutina, asignación de operación agotada y fallo técnico. Cerrar el panel no demuestra que el trabajo se haya detenido.

En una tarjeta activa, responda todas las preguntas requeridas y envíe el conjunto. Las tarjetas anteriores son registros y no admiten una nueva respuesta. Omitir no aporta los datos ausentes ni autoriza cambios dependientes.

## Presupuesto y errores {#recovery}
La tarjeta de límite de cuenta muestra la fecha de reinicio si se conoce y puede ofrecer un plan o clave personal. La de rutina lleva a su gestión: revise el tope por ejecución. La asignación de operación corresponde a esa operación. Repetir la petición no elimina el límite. Las claves personales no hacen gratuito el cómputo de la sandbox.

Solo puede retomarse desde un punto de control si se conservó. Compruebe incidencias, rama, PR y servicios externos antes de repetir: una escritura puede haber tenido éxito aunque se perdiera la respuesta. Indique qué queda y solicite continuar. Sin punto recuperable, aporte el estado verificado en una nueva petición. Al informar de fallos persistentes, identifique la conversación sin incluir credenciales.

![Respuesta de Numo que informa de código y pruebas locales, un envío de rama fallido y ninguna pull request en ese momento.](/documentation/es/recover-numo-work-workflow.png)

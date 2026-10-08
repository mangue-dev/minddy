---
{
  "id": "integration-troubleshooting",
  "locale": "es",
  "title": "Recuperar fallos OAuth, MCP, webhook o Git",
  "summary": "Minddy MCP conecta un asistente externo con Minddy; las conexiones MCP personales permiten a Numo llamar a otro servidor.",
  "topic": "Conceptos técnicos",
  "type": "troubleshooting",
  "audiences": [
    "integrator"
  ],
  "workflows": [
    "T08"
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
      "Cloud",
      "self-hosted"
    ],
    "profiles": [
      "web",
      "desktop",
      "mobile",
      "full",
      "managed"
    ],
    "evidence": [
      "content/knowledge/agents-and-mcp.md",
      "docs/github-issue-sync.md",
      "lib/server/integration-auth.ts",
      "lib/mcp-authorization.ts"
    ]
  },
  "review": {
    "revision": 1,
    "fact": "agent:/root/automation_account_documentation (independent targeted primary-source review)",
    "language": "Codex agent review_documentation_locales: independent complete English/Spanish meaning and idiom review, not human review",
    "date": "2026-10-08"
  },
  "related": [
    "integration-api-and-webhooks",
    "mcp-tool-reference"
  ],
  "aliases": [],
  "tags": [],
  "figures": [
    {
      "id": "integration-troubleshooting-flow",
      "kind": "screenshot",
      "src": "/documentation/es/integration-troubleshooting-error.png",
      "alt": "Error al cargar las conexiones MCP con el botón Reintentar.",
      "caption": "Reintentar vuelve a cargar las conexiones cuando se restablece la red.",
      "revision": 1,
      "reviewed": true,
      "capturedAt": "2026-10-08",
      "viewport": [
        1440,
        1100
      ],
      "theme": "light"
    }
  ],
  "requiredFigures": [
    "integration-troubleshooting-flow"
  ]
}
---
## Recuperar fallos OAuth, MCP, webhook o Git {#integration-troubleshooting}

Minddy MCP conecta un asistente externo con Minddy; las conexiones MCP personales permiten a Numo llamar a otro servidor. Utilizan pestañas de cuenta y credenciales distintas. Para MCP personal, revise el estado en la configuración y utilice su acción de prueba o reconexión. Se admiten descubrimiento OAuth, registro dinámico, PKCE y renovación de tokens, pero una entrada de catálogo no evita la aprobación del proveedor, una versión preliminar para desarrolladores o los requisitos de una aplicación registrada. Compruebe los requisitos actuales antes de atribuir un defecto a Minddy.




![Error al cargar las conexiones MCP con el botón Reintentar.](/documentation/es/integration-troubleshooting-error.png)

## Reconectar con el alcance correcto {#oauth}

Si el proveedor exige credenciales de una aplicación cliente existente, registre exactamente el callback mostrado. En escritorio, OAuth abre el navegador del sistema y vuelve a la aplicación. Las conexiones remotas necesitan HTTPS público; no se admiten comandos locales ni servidores en redes privadas. Coloque bearer tokens y secretos en autenticación o encabezados, no en los parámetros de URL. Cambiar la URL borra las credenciales y los encabezados guardados. Desactivar o eliminar una conexión impide llamadas nuevas, pero una petición ya enviada puede terminar. Las rutinas usan las conexiones del propietario actual; un cambio de propietario no reutiliza el acceso personal anterior.



## Inspeccionar antes de repetir {#webhooks}

Las llamadas MCP remotas tienen un timeout de 30 segundos, un límite de transporte de 1 MiB y un resultado máximo de 64 KB. Un timeout no demuestra que una modificación haya fallado. Compruebe el destino antes de repetir. Para API 401, revise instancia, tipo de clave y revocación sin registrar la clave; un tipo incorrecto devuelve 403. Para webhooks, compruebe el último estado, la accesibilidad pública del destino, el HMAC de los bytes originales y la deduplicación delivery_id. Las entregas descartadas no tienen una cola de reintentos duradera. Conserve códigos controlados y horas, excluyendo contenido privado y credenciales.



## Comprobar permisos y sincronización {#git}

Los adaptadores Git operan con github.com y gitlab.com. Compruebe el repositorio vinculado, el acceso de instalación y el canal elegido. La sincronización GitHub exige permiso Issues de lectura y escritura y suscripciones webhook a Issues, Issue comments e Issue dependencies. Las instalaciones existentes deben aceptar los nuevos permisos. Los payloads antiguos no sobrescriben ediciones locales más recientes. Las identidades remotas evitan duplicados de entrega. Las URL de adjuntos siguen siendo enlaces del forge; los bytes no se copian. Verifique el estado remoto y local antes de reconectar o repetir una escritura y comparta solo diagnósticos sin datos sensibles.

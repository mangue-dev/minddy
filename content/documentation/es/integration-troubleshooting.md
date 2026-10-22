---
{
  "id": "integration-troubleshooting",
  "locale": "es",
  "title": "Solución de problemas de conexión",
  "summary": "minddy MCP conecta un asistente externo con minddy; las conexiones MCP personales permiten a Numo llamar a otro servidor.",
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
  "revision": 7,
  "sourceRevision": 7,
  "owner": "@mangue-dev",
  "updatedAt": "2026-10-22",
  "compatibility": {
    "version": "0.20.0 (MIN-747 release review)",
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
      "lib/mcp-authorization.ts",
      "lib/server/mcp-http.ts",
      "lib/server/mcp-client.ts",
      "lib/server/safe-fetch.ts",
      "app/api/mcp/route.ts"
    ]
  },
  "review": {
    "revision": 7,
    "fact": "agent:/root/min747 (0.20.0 release review: source audit against the v0.11.0..main delta, no correction needed; no screenshot in scope; no browser walkthrough of the procedures or operator rehearsal; earlier evidence retained in git history); agent:claude-code (manual figures rebuilt on the Aurora demo, catalog review labels and informal register; figures recaptured on 2026-10-22 from a local candidate against the preview demo account and inspected; no form submitted)",
    "language": "agent:/root/min747 (es translation of the release corrections with catalog UI labels; equivalent meaning self-reviewed; agent review, not human acceptance); agent:claude-code (es manual figures rebuilt on the Aurora demo, catalog review labels and informal register; self-reviewed; agent review, not human acceptance)",
    "date": "2026-10-22"
  },
  "related": [
    "api-and-webhooks",
    "minddy-mcp"
  ],
  "aliases": [],
  "tags": [
    "Recuperar fallos OAuth, MCP, webhook o Git"
  ],
  "figures": [],
  "requiredFigures": []
}
---

## Recuperar fallos OAuth, MCP, webhook o Git {#integration-troubleshooting}

minddy MCP conecta un asistente externo con minddy; las conexiones MCP personales permiten a Numo llamar a otro servidor. Utilizan pestañas de cuenta y credenciales distintas. Para MCP personal, revisa el estado en la configuración y utiliza su acción de prueba o reconexión. Se admiten descubrimiento OAuth, registro dinámico, PKCE y renovación de tokens, pero una entrada de catálogo no evita la aprobación del proveedor, una versión preliminar para desarrolladores o los requisitos de una aplicación registrada. Comprueba los requisitos actuales antes de atribuir un defecto a minddy.




## Reconectar con el alcance correcto {#oauth}

Si el proveedor exige credenciales de una aplicación cliente existente, registra exactamente el callback mostrado. En escritorio, OAuth abre el navegador del sistema y vuelve a la aplicación. Las conexiones MCP personales de Numo necesitan HTTPS público; no se admiten comandos locales ni servidores en redes privadas. Para un asistente externo conectado a minddy MCP, consulta [el acceso de red a tu instancia](/docs/minddy-mcp#network-access). Coloca bearer tokens y secretos en autenticación o encabezados, no en los parámetros de URL. Cambiar la URL borra las credenciales y los encabezados guardados. Desactivar o eliminar una conexión impide llamadas nuevas, pero una petición ya enviada puede terminar. Las rutinas usan las conexiones del propietario actual; un cambio de propietario no reutiliza el acceso personal anterior.

## Inspeccionar antes de repetir {#webhooks}

Las llamadas de Numo a servidores MCP personales tienen un timeout de 30 segundos, un límite de transporte de 1 MiB y un resultado máximo de 64 KB. Un timeout no demuestra que una modificación haya fallado. Comprueba el destino antes de repetir. Para API 401, revisa instancia, tipo de clave y revocación sin registrar la clave; un tipo incorrecto devuelve 403. Para webhooks, comprueba el último estado, la accesibilidad pública del destino, el HMAC de los bytes originales y la deduplicación `delivery_id`. Las entregas descartadas no tienen una cola de reintentos duradera. Conserva códigos controlados y horas, excluyendo contenido privado y credenciales.

## Comprobar permisos y sincronización {#git}

Los adaptadores Git operan con github.com y gitlab.com. Comprueba el repositorio vinculado, el acceso de instalación y el canal elegido. La sincronización GitHub exige permiso Issues de lectura y escritura y suscripciones webhook a Issues, Issue comments e Issue dependencies. Las instalaciones existentes deben aceptar los nuevos permisos. Los payloads antiguos no sobrescriben ediciones locales más recientes. Las identidades remotas evitan duplicados de entrega. Las URL de adjuntos siguen siendo enlaces del forge; los bytes no se copian. Verifica el estado remoto y local antes de reconectar o repetir una escritura y comparte solo diagnósticos sin datos sensibles.

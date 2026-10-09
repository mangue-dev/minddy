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
  "revision": 4,
  "sourceRevision": 4,
  "owner": "@mangue-dev",
  "updatedAt": "2026-10-09",
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
    "revision": 4,
    "fact": "agent:/root/german_spanish_review (structural consolidation review; prior procedural evidence retained; no operational rerun); agent:/root (visual usefulness, figure framing and preserved procedures; previous operational evidence retained); agent:/root (technical-reference formatting; prior factual evidence retained; no operational rerun)",
    "language": "agent:/root/german_spanish_review (es title, summary, lead and heading review; retained body comparison); agent:/root/editorial_de_es (editorial clarity pass); agent:/root (figure removals and captions); agent:/root (inline-code syntax and unchanged-text review)",
    "date": "2026-10-09"
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

minddy MCP conecta un asistente externo con minddy; las conexiones MCP personales permiten a Numo llamar a otro servidor. Utilizan pestañas de cuenta y credenciales distintas. Para MCP personal, revise el estado en la configuración y utilice su acción de prueba o reconexión. Se admiten descubrimiento OAuth, registro dinámico, PKCE y renovación de tokens, pero una entrada de catálogo no evita la aprobación del proveedor, una versión preliminar para desarrolladores o los requisitos de una aplicación registrada. Compruebe los requisitos actuales antes de atribuir un defecto a minddy.




## Reconectar con el alcance correcto {#oauth}

Si el proveedor exige credenciales de una aplicación cliente existente, registre exactamente el callback mostrado. En escritorio, OAuth abre el navegador del sistema y vuelve a la aplicación. Las conexiones remotas necesitan HTTPS público; no se admiten comandos locales ni servidores en redes privadas. Coloque bearer tokens y secretos en autenticación o encabezados, no en los parámetros de URL. Cambiar la URL borra las credenciales y los encabezados guardados. Desactivar o eliminar una conexión impide llamadas nuevas, pero una petición ya enviada puede terminar. Las rutinas usan las conexiones del propietario actual; un cambio de propietario no reutiliza el acceso personal anterior.

## Inspeccionar antes de repetir {#webhooks}

Las llamadas MCP remotas tienen un timeout de 30 segundos, un límite de transporte de 1 MiB y un resultado máximo de 64 KB. Un timeout no demuestra que una modificación haya fallado. Compruebe el destino antes de repetir. Para API 401, revise instancia, tipo de clave y revocación sin registrar la clave; un tipo incorrecto devuelve 403. Para webhooks, compruebe el último estado, la accesibilidad pública del destino, el HMAC de los bytes originales y la deduplicación `delivery_id`. Las entregas descartadas no tienen una cola de reintentos duradera. Conserve códigos controlados y horas, excluyendo contenido privado y credenciales.

## Comprobar permisos y sincronización {#git}

Los adaptadores Git operan con github.com y gitlab.com. Compruebe el repositorio vinculado, el acceso de instalación y el canal elegido. La sincronización GitHub exige permiso Issues de lectura y escritura y suscripciones webhook a Issues, Issue comments e Issue dependencies. Las instalaciones existentes deben aceptar los nuevos permisos. Los payloads antiguos no sobrescriben ediciones locales más recientes. Las identidades remotas evitan duplicados de entrega. Las URL de adjuntos siguen siendo enlaces del forge; los bytes no se copian. Verifique el estado remoto y local antes de reconectar o repetir una escritura y comparta solo diagnósticos sin datos sensibles.

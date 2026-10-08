---
{
  "id": "integration-api-and-webhooks",
  "locale": "es",
  "title": "Crear incidencias o feedback y recibir webhooks firmados",
  "summary": "El propietario crea una integración en la configuración del proyecto.",
  "topic": "Conceptos técnicos",
  "type": "tutorial",
  "audiences": [
    "integrator"
  ],
  "workflows": [
    "T07"
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
      "lib/feedback/integration-contract.ts",
      "lib/server/integration-auth.ts",
      "lib/server/integrations.ts",
      "app/api/v1/issues/route.ts",
      "app/api/v1/feedback/route.ts"
    ]
  },
  "review": {
    "revision": 1,
    "fact": "agent:/root/automation_account_documentation (independent targeted primary-source review)",
    "language": "Codex agent review_documentation_locales: independent complete English/Spanish meaning and idiom review, not human review",
    "date": "2026-10-08"
  },
  "related": [
    "integration-troubleshooting",
    "mcp-tool-reference"
  ],
  "aliases": [],
  "tags": [],
  "figures": [
    {
      "id": "integration-api-and-webhooks-flow",
      "kind": "diagram",
      "src": "/documentation/es/integration-api-and-webhooks-flow.svg",
      "alt": "Diagrama: Servidor guarda clave de integración. POST incidencias o feedback con tipo correcto. Propietario elige destino webhook issues. Receptor verifica HMAC bruto y UUID.",
      "caption": "Siga las etapas en este orden. Servidor guarda clave de integración. POST incidencias o feedback con tipo correcto. Propietario elige destino webhook issues. Receptor verifica HMAC bruto y UUID.",
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
    "integration-api-and-webhooks-flow"
  ]
}
---
## Crear incidencias o feedback y recibir webhooks firmados {#integration-api-and-webhooks}

El propietario crea una integración en la configuración del proyecto. Elija issues para trabajo interno que entra en triage o feedback para solicitudes de usuarios con votos y estado público. La clave mdy_ en texto claro se muestra una sola vez. Guárdela únicamente en el servidor, normalmente como MINDDY_API_KEY o MINDDY_FEEDBACK_KEY, nunca en el navegador, Git o registros compartidos. La revocación es definitiva; las claves desconocidas o revocadas devuelven 401 invalid_api_key. Cada clave pertenece a un proyecto y un tipo: usarla en la otra familia de endpoints devuelve 403 wrong_key_kind.

![Diagrama: Servidor guarda clave de integración. POST incidencias o feedback con tipo correcto. Propietario elige destino webhook issues. Receptor verifica HMAC bruto y UUID.](/documentation/es/integration-api-and-webhooks-flow.svg)

## Enviar los campos correctos {#send}

GET /api/v1/issues/options proporciona los identificadores de categorías y los valores de prioridad y esfuerzo. POST /api/v1/issues exige un título no vacío y admite descripción Markdown, prioridad, esfuerzo y categorías opcionales. La incidencia siempre entra en triage; desde el exterior no se pueden definir estado, responsable o incidencia padre. Los límites son 500 caracteres de título, 65.536 de descripción y 50 identificadores de categoría. Una respuesta 201 contiene id, number, identifier y status.

POST /api/v1/feedback exige title y user.external_id y/o user.email; user.name y body son opcionales. analyze es un booleano con true por defecto. false desactiva conjuntamente moderación, categorización y fusión de duplicados y publica el texto tal cual; la cadena "false" se rechaza. Examine review_state y verifique la identidad del usuario en su servidor.

```bash
curl --fail-with-body --request POST "$MINDDY_ORIGIN/api/v1/issues" \
  --header "Authorization: Bearer $MINDDY_API_KEY" \
  --header 'Content-Type: application/json' \
  --data '{"title":"Informe de demostración","description":"Reproducir con datos de demostración","priority":"low","effort":"s"}'
```

## Verificar y deduplicar eventos {#receive}

Una integración issues puede enviar issue.created, issue.status_changed e issue.updated. El propietario debe elegir cualquier nueva URL de destino webhook en la configuración. Los agentes pueden ajustar los eventos o el ámbito existentes o desactivarlo, pero no abrir un nuevo canal de salida. El ámbito integration incluye solo las incidencias de esa clave; all incluye todas las del proyecto.

Verifique X-Minddy-Signature: el prefijo sha256= seguido de HMAC-SHA256 sobre los bytes originales recibidos. La clave HMAC es el digest SHA-256 de la clave API, representado como una cadena hexadecimal en minúsculas. Compare en tiempo constante antes de confiar en el contenido. No analice y vuelva a serializar JSON antes de calcular el hash. X-Minddy-Delivery corresponde a delivery_id; elimine duplicados mediante ese UUID.



## Tratar fallos y límites {#limits}

La entrega es de mejor esfuerzo: tiene un timeout de cinco segundos y un único reintento inmediato tras un error de red o una respuesta 5xx; después se descarta definitivamente. Puede haber duplicados y cambios de orden. Guarde el contenido verificado, responda 2xx pronto y procéselo después. issue.updated agrupa cambios; description y plan identifican el campo sin incluir su valor. Consulte el último estado de entrega en la configuración. Para 429, respete Retry-After. Los errores de validación devuelven 422 y una cuota de incidencias alcanzada devuelve 403 issue_limit_reached, una negativa definitiva. Una creación con timeout puede haber tenido éxito: compruebe el resultado antes de repetirla. El voto mediante `POST /api/v1/feedback/<post_id>/vote` es idempotente para cada identidad.

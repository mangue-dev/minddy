---
{
  "id": "api-and-webhooks",
  "locale": "es",
  "title": "API, webhooks y SSO de sugerencias",
  "summary": "Cree incidencias o sugerencias mediante la API de integración, verifique los webhooks firmados y autentique a los visitantes del tablero con SSO.",
  "topic": "Conceptos técnicos",
  "type": "guide",
  "audiences": [
    "integrator"
  ],
  "workflows": [
    "T07",
    "F06"
  ],
  "visibility": "public",
  "status": "published",
  "revision": 5,
  "sourceRevision": 5,
  "owner": "@mangue-dev",
  "updatedAt": "2026-10-09",
  "compatibility": {
    "version": "0.11.1 candidate (89ebb59a5); 0.11.1 candidate (cd1843e12)",
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
      "app/api/v1/feedback/route.ts",
      "app/api/v1/feedback/[id]/vote/route.ts",
      "lib/feedback/sso-jwt.ts",
      "app/f/[token]/sso/route.ts",
      "lib/server/feedback/posts.ts"
    ]
  },
  "review": {
    "revision": 5,
    "fact": "agent:/root/german_spanish_review (structural consolidation review; prior procedural evidence retained; no operational rerun); agent:/root (visual usefulness, figure framing and preserved procedures; previous operational evidence retained); agent:/root (technical-reference formatting; prior factual evidence retained; no operational rerun)",
    "language": "agent:/root/german_spanish_review (es title, summary, lead and heading review; retained body comparison); agent:/root/editorial_de_es (editorial clarity pass); agent:/root (figure removals and captions); agent:/root (inline-code syntax and unchanged-text review)",
    "date": "2026-10-09"
  },
  "related": [
    "integration-troubleshooting",
    "minddy-mcp"
  ],
  "aliases": [
    "integration-api-and-webhooks",
    "feedback-ingestion-and-sso"
  ],
  "tags": [
    "Crear incidencias o feedback y recibir webhooks firmados",
    "Conectar ingestión de feedback y SSO"
  ],
  "figures": [
    {
      "id": "integration-api-and-webhooks-flow",
      "kind": "diagram",
      "src": "/documentation/es/integration-api-and-webhooks-flow.svg",
      "alt": "Diagrama: Servidor guarda clave de integración. POST incidencias o feedback con tipo correcto. Propietario elige destino webhook issues. Receptor verifica HMAC bruto y UUID.",
      "caption": "Siga las etapas en este orden. Servidor guarda clave de integración. `POST` incidencias o feedback con tipo correcto. Propietario elige destino webhook issues. Receptor verifica HMAC bruto y UUID.",
      "revision": 5,
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
            "title": "Servidor guarda clave de integración"
          },
          {
            "title": "`POST` incidencias o feedback con tipo correcto"
          },
          {
            "title": "Propietario elige destino webhook issues"
          },
          {
            "title": "Receptor verifica HMAC bruto y UUID"
          }
        ]
      }
    },
    {
      "id": "feedback-ingestion-and-sso-workflow",
      "kind": "diagram",
      "src": "/documentation/es/feedback-ingestion-and-sso-workflow.svg",
      "alt": "Secuencias separadas de recogida desde el backend y SSO del navegador con secretos distintos.",
      "caption": "La clave de recogida autentica llamadas del servidor. El secreto SSO del tablero firma un token de visitante breve y de un solo uso.",
      "revision": 5,
      "reviewed": true,
      "capturedAt": "2026-10-08",
      "viewport": [
        1100,
        760
      ],
      "theme": "neutral",
      "diagram": {
        "layout": "columns",
        "title": "Dos flujos de feedback separados",
        "columns": [
          {
            "title": "Recogida desde el servidor",
            "items": [
              "El backend guarda la clave de feedback",
              "`POST /api/v1/feedback` con clave Bearer e identidad estable",
              "HTTP 201: post guardado en la bandeja del equipo; el tablero puede estar desactivado"
            ]
          },
          {
            "title": "SSO del visitante del navegador",
            "items": [
              "El backend guarda el secreto SSO separado del tablero",
              "Firmar JWT `HS256`: `sub`, `exp`, `jti` único; validez ≤ 600 s",
              "Redirigir navegador a `/f/<board-token>?sso=<jwt>`",
              "Token de un solo uso crea sesión; abrir Mis sugerencias"
            ]
          }
        ],
        "note": "Nunca enviar la clave de recogida ni el secreto SSO al navegador. Tolerancia de reloj: 60 s."
      }
    }
  ],
  "requiredFigures": [
    "integration-api-and-webhooks-flow",
    "feedback-ingestion-and-sso-workflow"
  ]
}
---

La API de integración recibe incidencias o sugerencias desde su servidor mediante claves vinculadas a un proyecto. Las integraciones de incidencias pueden enviar webhooks firmados; el SSO de visitantes utiliza un secreto separado del tablero. Compruebe el endpoint, la identidad y la entrega. Las claves permanecen en el servidor y los tokens de redirección SSO no deben aparecer en registros compartidos.

## Crear incidencias o feedback y recibir webhooks firmados {#integration-api-and-webhooks}

El propietario crea una integración en la configuración del proyecto. Elija `issues` para trabajo interno que entra en triage o `feedback` para solicitudes de usuarios con votos y estado público. La clave `mdy_` en texto claro se muestra una sola vez. Guárdela únicamente en el servidor, normalmente como `MINDDY_API_KEY` o `MINDDY_FEEDBACK_KEY`, nunca en el navegador, Git o registros compartidos. La revocación es definitiva; las claves desconocidas o revocadas devuelven 401 `invalid_api_key`. Cada clave pertenece a un proyecto y un tipo: usarla en la otra familia de endpoints devuelve 403 `wrong_key_kind`.

![Diagrama: Servidor guarda clave de integración. POST incidencias o feedback con tipo correcto. Propietario elige destino webhook issues. Receptor verifica HMAC bruto y UUID.](/documentation/es/integration-api-and-webhooks-flow.svg)

### Enviar los campos correctos {#send}

`GET /api/v1/issues/options` proporciona los identificadores de categorías y los valores de prioridad y esfuerzo. Envíe después `POST /api/v1/issues` con un título no vacío y, opcionalmente, una descripción Markdown, prioridad, esfuerzo y categorías.

| Campo | Límite |
| --- | --- |
| Título | 500 caracteres |
| Descripción | 65.536 caracteres |
| Categorías | 50 identificadores |

La incidencia siempre entra en triage; desde el exterior no se pueden definir estado, responsable o incidencia padre. Una respuesta 201 contiene `id`, `number`, `identifier` y `status`. Para los campos de sugerencias, la verificación de identidad y la moderación, siga el [procedimiento de recepción de sugerencias](#feedback-ingestion-and-sso).

```bash
curl --fail-with-body --request POST "$MINDDY_ORIGIN/api/v1/issues" \
  --header "Authorization: Bearer $MINDDY_API_KEY" \
  --header 'Content-Type: application/json' \
  --data '{"title":"Informe de demostración","description":"Reproducir con datos de demostración","priority":"low","effort":"s"}'
```

### Verificar y deduplicar eventos {#receive}

Una integración `issues` puede enviar `issue.created`, `issue.status_changed` e `issue.updated`. El propietario debe elegir cualquier nueva URL de destino webhook en la configuración. Los agentes pueden ajustar los eventos o el ámbito existentes o desactivarlo, pero no abrir un nuevo canal de salida. El ámbito `integration` incluye solo las incidencias de esa clave; `all` incluye todas las del proyecto.

Verifique `X-minddy-Signature`: el prefijo `sha256=` seguido de HMAC-SHA256 sobre los bytes originales recibidos. La clave HMAC es el digest SHA-256 de la clave API, representado como una cadena hexadecimal en minúsculas. Compare en tiempo constante antes de confiar en el contenido. No analice y vuelva a serializar JSON antes de calcular el hash. `X-minddy-Delivery` corresponde a `delivery_id`; elimine duplicados mediante ese UUID.

### Tratar fallos y límites {#limits}

La entrega es de mejor esfuerzo: tiene un timeout de cinco segundos y un único reintento inmediato tras un error de red o una respuesta 5xx; después se descarta definitivamente. Puede haber duplicados y cambios de orden. Guarde el contenido verificado, responda 2xx pronto y procéselo después. `issue.updated` agrupa cambios; description y plan identifican el campo sin incluir su valor. Consulte el último estado de entrega en la configuración. Para 429, respete `Retry-After`. Los errores de validación devuelven 422 y una cuota de incidencias alcanzada devuelve 403 `issue_limit_reached`, una negativa definitiva. Una creación con timeout puede haber tenido éxito: compruebe el resultado antes de repetirla. El voto mediante `POST /api/v1/feedback/<post_id>/vote` es idempotente para cada identidad.

## Conectar ingestión de feedback y SSO {#feedback-ingestion-and-sso}

El propietario crea una clave de integración de feedback en la configuración del proyecto. Guarde la clave, que se muestra una sola vez, como `MINDDY_FEEDBACK_KEY` en la configuración secreta del backend. Nunca la incorpore al código del navegador. Defina `MINDDY_ORIGIN` con el origen de la instancia de destino, sin barra final.

```bash
curl -i "$MINDDY_ORIGIN/api/v1/feedback"   -H "Authorization: Bearer $MINDDY_FEEDBACK_KEY"   -H 'Content-Type: application/json'   --data '{"title":"Mostrar fecha de entrega","body":"Soporte necesita la fecha prevista.","user":{"external_id":"demo-user-1","name":"Lector de demostración"}}'
```

Proporcione un título no vacío de hasta 200 caracteres, un cuerpo opcional de hasta 10.000 y `user.external_id` y/o `user.email`. `user.name` es opcional. El ID externo admite 255 caracteres, el email 254 y el nombre 200. El backend responde por la identidad; la recepción anónima se rechaza. El éxito devuelve HTTP 201 con `id`, `status`, `review_state`, votos y pseudónimo. El tablero no tiene que estar activado para recibir solicitudes. `analyze` es un booleano con `true` por defecto; la cadena `"false"` se rechaza. `false` omite moderación, categorización y fusión de duplicados para esa solicitud y establece el estado de revisión `published` sin espera. Ese estado de revisión no activa el tablero ni evita las reglas de visibilidad o el estado de spam. La API crea solicitudes públicas por defecto y no acepta un parámetro de visibilidad privada.

### Votos, errores y webhooks {#errors}

Envíe `{"user":{"external_id":"demo-user-1"}}` por `POST` a `/api/v1/feedback/<id>/vote`, con los mismos encabezados. Cada identidad tiene un voto; repetirlo es idempotente. Una solicitud unida a otra devuelve 409 `post_merged` e indica su destino canónico.

La creación permite 20 llamadas por minuto y clave; los votos, 60. Respete `Retry-After` ante 429. Compruebe 401 `invalid_api_key`, 403 `wrong_key_kind`, 400 `invalid_json` y los errores de campos 422 antes de reintentar. La creación no es una actualización idempotente: si se pierde la respuesta, consulte la bandeja de feedback del equipo antes de repetir. Las claves de feedback no ofrecen un webhook saliente de incidencias. Una integración de incidencias configurada por separado proporciona ese canal con su propia firma y un contrato de entrega sin garantía.

### Identificar por SSO {#sso}

Como propietario, active el tablero y configure su secreto SSO independiente. El backend firma un JWT `HS256` con `sub` estable, `exp` obligatorio y email y nombre opcionales. Use como máximo 600 segundos de validez y un `jti` único; la comprobación tolera 60 segundos de desfase de reloj. Redirija inmediatamente a `/f/<board-token>?sso=<jwt>`. Un token se consume una sola vez por tablero; volver a entrar requiere otro token recién firmado. Nunca reutilice la clave de recepción como secreto SSO. Mantenga los tokens fuera de registros y capturas compartidas.

Compruebe que el visitante abra Mis sugerencias con la identidad prevista. Un token caducado exige una nueva redirección. Si el secreto queda comprometido, rótelo mediante la confirmación del tablero y actualice el backend a la vez. El flujo por código de email sigue siendo la alternativa cuando el SSO no está disponible.

![Secuencias separadas de recogida desde el backend y SSO del navegador con secretos distintos.](/documentation/es/feedback-ingestion-and-sso-workflow.svg)

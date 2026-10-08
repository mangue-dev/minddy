---
{
  "id": "feedback-ingestion-and-sso",
  "locale": "es",
  "title": "Conectar ingestión de feedback y SSO",
  "summary": "Guardar claves en servidor y firmar identidades breves con un secreto de tablero distinto.",
  "topic": "Comentarios y solicitudes",
  "type": "guide",
  "audiences": [
    "integrator"
  ],
  "workflows": [
    "F06"
  ],
  "visibility": "public",
  "status": "published",
  "revision": 2,
  "sourceRevision": 2,
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
      "app/api/v1/feedback/route.ts",
      "app/api/v1/feedback/[id]/vote/route.ts",
      "lib/feedback/integration-contract.ts",
      "lib/feedback/sso-jwt.ts",
      "app/f/[token]/sso/route.ts",
      "lib/server/feedback/posts.ts"
    ]
  },
  "review": {
    "revision": 2,
    "fact": "2026-10-08",
    "language": "2026-10-08",
    "date": "2026-10-08"
  },
  "related": [],
  "aliases": [],
  "tags": [],
  "figures": [
    {
      "id": "feedback-ingestion-and-sso-workflow",
      "kind": "diagram",
      "src": "/documentation/es/feedback-ingestion-and-sso-workflow.png",
      "alt": "Secuencias separadas de recogida desde el backend y SSO del navegador con secretos distintos.",
      "caption": "La clave de recogida autentica llamadas del servidor. El secreto SSO del tablero firma un token de visitante breve y de un solo uso.",
      "revision": 2,
      "reviewed": true,
      "capturedAt": "2026-10-08",
      "viewport": [
        1100,
        760
      ],
      "theme": "neutral"
    }
  ],
  "requiredFigures": [
    "feedback-ingestion-and-sso-workflow"
  ]
}
---

## Enviar desde backend {#feedback-ingestion-and-sso}

El propietario crea una clave de integración de feedback en la configuración del proyecto. Guarde la clave, que se muestra una sola vez, como `MINDDY_FEEDBACK_KEY` en la configuración secreta del backend. Nunca la incorpore al código del navegador. Defina `MINDDY_ORIGIN` con el origen de la instancia de destino, sin barra final.

```bash
curl -i "$MINDDY_ORIGIN/api/v1/feedback"   -H "Authorization: Bearer $MINDDY_FEEDBACK_KEY"   -H 'Content-Type: application/json'   --data '{"title":"Mostrar fecha de entrega","body":"Soporte necesita la fecha prevista.","user":{"external_id":"demo-user-1","name":"Lector de demostración"}}'
```

Proporcione un título no vacío de hasta 200 caracteres, un cuerpo opcional de hasta 10.000 y `user.external_id` y/o `user.email`. El ID externo admite 255 caracteres, el email 254 y el nombre 200. El backend responde por la identidad; la recepción anónima se rechaza. El éxito devuelve HTTP 201 con `id`, `status`, `review_state`, votos y pseudónimo. El tablero no tiene que estar activado para recibir solicitudes. `analyze` es true por defecto; false omite moderación, categorización y unión para esa solicitud y establece el estado de revisión `published` sin espera. Ese estado de revisión no activa el tablero ni evita las reglas de visibilidad o el estado de spam. La API crea solicitudes públicas por defecto y no acepta un parámetro de visibilidad privada.


## Votos, errores y webhooks {#errors}

Envíe `{"user":{"external_id":"demo-user-1"}}` por POST a `/api/v1/feedback/<id>/vote`, con los mismos encabezados. Cada identidad tiene un voto; repetirlo es idempotente. Una solicitud unida a otra devuelve 409 `post_merged` e indica su destino canónico.

La creación permite 20 llamadas por minuto y clave; los votos, 60. Respete `Retry-After` ante 429. Compruebe 401 `invalid_api_key`, 403 `wrong_key_kind`, 400 `invalid_json` y los errores de campos 422 antes de reintentar. La creación no es una actualización idempotente: si se pierde la respuesta, consulte la bandeja de feedback del equipo antes de repetir. Las claves de feedback no ofrecen un webhook saliente de incidencias. Una integración de incidencias configurada por separado proporciona ese canal con su propia firma y un contrato de entrega sin garantía.


## Identificar por SSO {#sso}

Como propietario, active el tablero y configure su secreto SSO independiente. El backend firma un JWT HS256 con `sub` estable, `exp` obligatorio y email y nombre opcionales. Use como máximo 600 segundos de validez y un `jti` único; la comprobación tolera 60 segundos de desfase de reloj. Redirija inmediatamente a `/f/<board-token>?sso=<jwt>`. Un token se consume una sola vez por tablero; volver a entrar requiere otro token recién firmado. Nunca reutilice la clave de recepción como secreto SSO. Mantenga los tokens fuera de registros y capturas compartidas.

Compruebe que el visitante abra Mis sugerencias con la identidad prevista. Un token caducado exige una nueva redirección. Si el secreto queda comprometido, rótelo mediante la confirmación del tablero y actualice el backend a la vez. El flujo por código de email sigue siendo la alternativa cuando el SSO no está disponible.

![Secuencias separadas de recogida desde el backend y SSO del navegador con secretos distintos.](/documentation/es/feedback-ingestion-and-sso-workflow.png)

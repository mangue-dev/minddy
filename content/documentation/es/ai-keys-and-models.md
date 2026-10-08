---
{
  "id": "ai-keys-and-models",
  "locale": "es",
  "title": "Configurar claves personales de IA y modelos",
  "summary": "Elegir proveedores y usos teniendo en cuenta facturación y cómputo del servidor.",
  "topic": "Cuenta y aplicaciones",
  "type": "guide",
  "audiences": [
    "member"
  ],
  "workflows": [
    "A04"
  ],
  "visibility": "public",
  "status": "published",
  "revision": 4,
  "sourceRevision": 3,
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
      "content/knowledge/plans-and-billing.md",
      "components/settings/account-ai-keys-section.tsx",
      "components/settings/account-sandbox-section.tsx",
      "content/documentation/reviews/remaining-account-capture-candidates.json",
      "lib/server/agent/model.ts",
      "lib/server/ai-runtime.ts",
      "lib/server/agent/quota.ts",
      "lib/server/usage.ts",
      "lib/server/agent/execute.ts"
    ]
  },
  "review": {
    "revision": 4,
    "fact": "2026-10-08",
    "language": "2026-10-08",
    "date": "2026-10-08"
  },
  "related": [],
  "aliases": [],
  "tags": [],
  "figures": [
    {
      "id": "ai-keys-and-models-workflow",
      "kind": "screenshot",
      "src": "/documentation/es/ai-keys-and-models-workflow.png",
      "alt": "Tarjeta del proveedor de IA con minddy Cloud seleccionado.",
      "caption": "El proveedor Cloud seleccionado utiliza el plan de la cuenta. El selector permite configurar proveedores personales.",
      "revision": 4,
      "reviewed": true,
      "capturedAt": "2026-10-08",
      "viewport": [
        1440,
        1800
      ],
      "theme": "light"
    },
    {
      "id": "ai-keys-and-models-defaults-workflow",
      "kind": "screenshot",
      "src": "/documentation/es/ai-keys-and-models-defaults-workflow.png",
      "alt": "Modelo de código y razonamiento predeterminados.",
      "caption": "Modelo de código y razonamiento predeterminados. Los nuevos workers usan estos valores; los que están en ejecución conservan sus ajustes fijados.",
      "revision": 4,
      "reviewed": true,
      "capturedAt": "2026-10-08",
      "viewport": [
        1440,
        1800
      ],
      "theme": "light"
    }
  ],
  "requiredFigures": [
    "ai-keys-and-models-workflow",
    "ai-keys-and-models-defaults-workflow"
  ]
}
---

## Añadir y asignar un proveedor {#ai-keys-and-models}

Abra la sección de IA de los ajustes de la cuenta, añada un proveedor compatible e introduzca su clave y la URL base si se requiere. Guarde los cambios y compruebe el estado de confirmación. Para las llamadas de IA con una alternativa gestionada disponible, una clave sin confirmar o inaccesible mantiene el consumo en Minddy. Esto exige IA gestionada configurada; los workers de código siguen las reglas de modelo vinculado al proveedor que se explican a continuación. Nunca pegue la clave en una conversación ni en una captura.

Asigne las familias de modelos de texto, transcripción y embeddings a claves compatibles, o manténgalas en Minddy. Para cada clave, elija en qué funciones se puede utilizar: conversaciones de Numo, trabajo de código, automatizaciones, voz y feedback. Una función o familia de modelos sin una asignación utilizable sigue consumiendo la cuota de Minddy. El proveedor factura las llamadas realizadas con su clave. El cómputo de la sandbox del servidor sigue teniendo un coste real y se registra en el uso. Ese registro es independiente de la aplicación de un límite de la cuenta: un worker con BYOK validado no está sujeto a la cuota del plan ni al límite de cómputo, mientras que el trabajo financiado por Minddy sigue sujeto a su asignación incluida.


![Tarjeta del proveedor de IA con minddy Cloud seleccionado.](/documentation/es/ai-keys-and-models-workflow.png)

## Modelos y lugar de ejecución {#models}

La elección del modelo de código está vinculada a su proveedor. Después de cambiar, desactivar o perder una clave personal, la elección anterior puede dejar de corresponder al proveedor activo. Entonces un nuevo worker rechaza el inicio hasta que elija un modelo compatible en la configuración de IA de la cuenta; no selecciona automáticamente un modelo más barato ni un valor predeterminado de la plataforma. Una ejecución BYOK ya fijada no cambia de pagador cuando su clave deja de estar disponible.

Configure aquí el modelo de código y el razonamiento predeterminados para los nuevos workers. Los que ya están en ejecución conservan su nivel de razonamiento fijado. Elija por separado la región y el tamaño de las nuevas sandboxes. Estos valores no sustituyen el modelo seleccionado en una conversación.

Ollama y los endpoints locales compatibles con OpenAI pueden atender conversaciones a través del puente de la aplicación de escritorio cuando esté configurado. No pueden atender el trabajo de código delegado ni las rutinas que se ejecutan en la sandbox del servidor. Para esas funciones, use un proveedor accesible desde el servidor. Cuando deje de necesitar un proveedor, elimínelo mediante su control de confirmación y compruebe las asignaciones resultantes antes de la siguiente ejecución.

![Modelo de código y razonamiento predeterminados.](/documentation/es/ai-keys-and-models-defaults-workflow.png)

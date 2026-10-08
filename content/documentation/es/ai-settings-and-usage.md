---
{
  "id": "ai-settings-and-usage",
  "locale": "es",
  "title": "Ajustes y consumo de IA",
  "summary": "Configure sus claves personales de IA y los modelos predeterminados y comprenda los límites de los planes Cloud y el registro del consumo.",
  "topic": "Cuenta y aplicaciones",
  "type": "guide",
  "audiences": [
    "member"
  ],
  "workflows": [
    "A04",
    "A08"
  ],
  "visibility": "public",
  "status": "published",
  "revision": 5,
  "sourceRevision": 5,
  "owner": "@mangue-dev",
  "updatedAt": "2026-10-09",
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
      "lib/server/agent/execute.ts",
      "app/(app)/billing/page.tsx",
      "app/(marketing)/pricing/page.tsx",
      "lib/billing-plans.ts"
    ]
  },
  "review": {
    "revision": 5,
    "fact": "agent:/root/german_spanish_review (structural consolidation review; prior procedural evidence retained; no operational rerun)",
    "language": "agent:/root/german_spanish_review (es title, summary, lead and heading review; retained body comparison)",
    "date": "2026-10-09"
  },
  "related": [
    "scheduled-routines"
  ],
  "aliases": [
    "ai-keys-and-models",
    "plans-and-ai-usage",
    "plans-and-billing"
  ],
  "tags": [
    "Configurar claves personales de IA y modelos",
    "Entender planes Cloud y consumo de IA"
  ],
  "figures": [
    {
      "id": "ai-keys-and-models-workflow",
      "kind": "screenshot",
      "src": "/documentation/es/ai-keys-and-models-workflow.png",
      "alt": "Tarjeta del proveedor de IA con minddy Cloud seleccionado.",
      "caption": "El proveedor Cloud seleccionado utiliza el plan de la cuenta. El selector permite configurar proveedores personales.",
      "revision": 5,
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
      "revision": 5,
      "reviewed": true,
      "capturedAt": "2026-10-08",
      "viewport": [
        1440,
        1800
      ],
      "theme": "light"
    },
    {
      "id": "plans-and-ai-usage-workflow",
      "kind": "screenshot",
      "src": "/documentation/es/plans-and-ai-usage-workflow.png",
      "alt": "Página de uso de IA de la cuenta de demostración.",
      "caption": "Página de uso de IA de la cuenta de demostración. El presupuesto, las categorías y el historial se leen de la cuenta; no se inició ninguna compra ni ejecución de pago.",
      "revision": 5,
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
    "ai-keys-and-models-defaults-workflow",
    "plans-and-ai-usage-workflow"
  ]
}
---

Las claves personales de IA, los modelos predeterminados y los presupuestos Cloud determinan cómo se ejecuta y factura el trabajo con IA. Los siguientes apartados explican los proveedores y el lugar de ejecución, además de la capacidad de los planes y el consumo; consulte los ajustes disponibles y el uso actual en su cuenta.

## Configurar claves personales de IA y modelos {#ai-keys-and-models}

Abra la sección de IA de los ajustes de la cuenta, añada un proveedor compatible e introduzca su clave y la URL base si se requiere. Guarde los cambios y compruebe el estado de confirmación. Para las llamadas de IA con una alternativa gestionada disponible, una clave sin confirmar o inaccesible mantiene el consumo en Minddy. Esto exige IA gestionada configurada; los workers de código siguen las reglas de modelo vinculado al proveedor que se explican a continuación. Nunca pegue la clave en una conversación ni en una captura.

Asigne las familias de modelos de texto, transcripción y embeddings a claves compatibles, o manténgalas en Minddy. Para cada clave, elija en qué funciones se puede utilizar: conversaciones de Numo, trabajo de código, automatizaciones, voz y feedback. Una función o familia de modelos sin una asignación utilizable sigue consumiendo la cuota de Minddy. El proveedor factura las llamadas realizadas con su clave. El cómputo de la sandbox del servidor sigue teniendo un coste real y se registra en el uso. Ese registro es independiente de la aplicación de un límite de la cuenta: un worker con BYOK validado no está sujeto a la cuota del plan ni al límite de cómputo, mientras que el trabajo financiado por Minddy sigue sujeto a su asignación incluida.


![Tarjeta del proveedor de IA con minddy Cloud seleccionado.](/documentation/es/ai-keys-and-models-workflow.png)

### Modelos y lugar de ejecución {#models}

La elección del modelo de código está vinculada a su proveedor. Después de cambiar, desactivar o perder una clave personal, la elección anterior puede dejar de corresponder al proveedor activo. Entonces un nuevo worker rechaza el inicio hasta que elija un modelo compatible en la configuración de IA de la cuenta; no selecciona automáticamente un modelo más barato ni un valor predeterminado de la plataforma. Una ejecución BYOK ya fijada no cambia de pagador cuando su clave deja de estar disponible.

Configure aquí el modelo de código y el razonamiento predeterminados para los nuevos workers. Los que ya están en ejecución conservan su nivel de razonamiento fijado. Elija por separado la región y el tamaño de las nuevas sandboxes. Estos valores no sustituyen el modelo seleccionado en una conversación.

Ollama y los endpoints locales compatibles con OpenAI pueden atender conversaciones a través del puente de la aplicación de escritorio cuando esté configurado. No pueden atender el trabajo de código delegado ni las rutinas que se ejecutan en la sandbox del servidor. Para esas funciones, use un proveedor accesible desde el servidor. Cuando deje de necesitar un proveedor, elimínelo mediante su control de confirmación y compruebe las asignaciones resultantes antes de la siguiente ejecución.

![Modelo de código y razonamiento predeterminados.](/documentation/es/ai-keys-and-models-defaults-workflow.png)

## Entender planes Cloud y consumo de IA {#plans-and-ai-usage}

Cloud ofrece los planes Free, Go y Pro. Todos incluyen MCP, conversaciones de Numo, acciones contextuales, trabajo de código y rutinas. Se diferencian en capacidad, IA incluida, modelos y almacenamiento. Abra la sección de facturación para consultar el presupuesto y el uso actuales de su cuenta, y compare la página pública de precios antes de elegir un plan; las cifras que aparecen allí son la referencia vigente.

Use el proceso de compra o la gestión de suscripciones que se ofrece para su cuenta. Antes de aceptar, revise el importe, el periodo de facturación y la confirmación del proveedor. Después, compruebe que el plan actualizado aparece en la facturación de la cuenta; cerrar la ventana de compra no demuestra que el cambio se haya completado.


![Página de uso de IA de la cuenta de demostración.](/documentation/es/plans-and-ai-usage-workflow.png)

### Qué consume el presupuesto {#consumption}

El uso de IA incluido cubre el razonamiento, las llamadas a herramientas de Minddy, las automatizaciones, las llamadas al modelo del worker y el cómputo de la sandbox del servidor. El límite mensual de IA incluida se aplica al trabajo financiado por Minddy. El límite por ejecución de una rutina es independiente y puede pausar esa ejecución; el trabajo ya terminado permanece en la conversación. Estos límites no autorizan cargos automáticos por exceso. Consulte la tarjeta de límite y la fecha de restablecimiento del presupuesto cuando esté disponible.

Las claves personales compatibles hacen que el proveedor facture las llamadas al modelo en lugar de consumir la IA incluida. Un worker que utiliza una clave BYOK validada no está sujeto a la cuota del plan ni al límite de cómputo de la cuenta. El cómputo de la sandbox sigue teniendo un coste real y se registra en el uso; ese registro no significa que el límite mensual del plan se aplique a esa ejecución BYOK. Las familias o funciones sin asignación cuyas llamadas financia Minddy siguen sujetas a su asignación de Minddy. Una instalación self-hosted tiene los costes de infraestructura y de proveedores opcionales que determine su configuración; ejecutar el mismo núcleo no crea una suscripción Cloud.

### Capacidad de la versión candidata {#plan-capacities}

Estos valores predeterminados corresponden a la versión candidata 0.11.1 identificada. Compruebe la página vigente de precios y su cuenta antes de comprar: los precios configurados en el proceso de compra y las excepciones de cada cuenta pueden variar. El número de invitados no incluye al propietario del proyecto. El almacenamiento se carga al propietario del proyecto que recibe los archivos.

| Plan | Proyectos | Tickets por proyecto | Invitados por proyecto | Almacenamiento | IA mensual incluida (USD) |
| --- | --- | --- | --- | --- | --- |
| Free | 2 | 300 | 3 | 1 GiB | 0.50 |
| Go | Ilimitado | Ilimitado | Ilimitado | 20 GiB | 5 |
| Pro | Ilimitado | Ilimitado | Ilimitado | 100 GiB | 15 |

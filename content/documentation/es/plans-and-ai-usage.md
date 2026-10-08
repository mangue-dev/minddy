---
{
  "id": "plans-and-ai-usage",
  "locale": "es",
  "title": "Entender planes Cloud y consumo de IA",
  "summary": "Comprobar capacidad actual y distinguir cuota, proveedores e infraestructura.",
  "topic": "Cuenta y aplicaciones",
  "type": "explanation",
  "audiences": [
    "member"
  ],
  "workflows": [
    "A08"
  ],
  "visibility": "public",
  "status": "published",
  "revision": 3,
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
      "content/knowledge/plans-and-billing.md",
      "app/(app)/billing/page.tsx",
      "app/(marketing)/pricing/page.tsx",
      "lib/billing-plans.ts",
      "content/documentation/reviews/remaining-account-capture-candidates.json",
      "lib/server/agent/quota.ts",
      "lib/server/usage.ts",
      "lib/server/agent/execute.ts"
    ]
  },
  "review": {
    "revision": 3,
    "fact": "2026-10-08",
    "language": "2026-10-08",
    "date": "2026-10-08"
  },
  "related": [
    "ai-keys-and-models",
    "scheduled-routines"
  ],
  "aliases": [
    "plans-and-billing"
  ],
  "tags": [],
  "figures": [
    {
      "id": "plans-and-ai-usage-workflow",
      "kind": "screenshot",
      "src": "/documentation/es/plans-and-ai-usage-workflow.png",
      "alt": "Página de uso de IA de la cuenta de demostración.",
      "caption": "Página de uso de IA de la cuenta de demostración. El presupuesto, las categorías y el historial se leen de la cuenta; no se inició ninguna compra ni ejecución de pago.",
      "revision": 3,
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
    "plans-and-ai-usage-workflow"
  ]
}
---

## Comparar el plan de la cuenta {#plans-and-ai-usage}

Cloud ofrece los planes Free, Go y Pro. Todos incluyen MCP, conversaciones de Numo, acciones contextuales, trabajo de código y rutinas. Se diferencian en capacidad, IA incluida, modelos y almacenamiento. Abra la sección de facturación para consultar el presupuesto y el uso actuales de su cuenta, y compare la página pública de precios antes de elegir un plan; las cifras que aparecen allí son la referencia vigente.

Use el proceso de compra o la gestión de suscripciones que se ofrece para su cuenta. Antes de aceptar, revise el importe, el periodo de facturación y la confirmación del proveedor. Después, compruebe que el plan actualizado aparece en la facturación de la cuenta; cerrar la ventana de compra no demuestra que el cambio se haya completado.


![Página de uso de IA de la cuenta de demostración.](/documentation/es/plans-and-ai-usage-workflow.png)

## Qué consume el presupuesto {#consumption}

El uso de IA incluido cubre el razonamiento, las llamadas a herramientas de Minddy, las automatizaciones, las llamadas al modelo del worker y el cómputo de la sandbox del servidor. El límite mensual de IA incluida se aplica al trabajo financiado por Minddy. El límite por ejecución de una rutina es independiente y puede pausar esa ejecución; el trabajo ya terminado permanece en la conversación. Estos límites no autorizan cargos automáticos por exceso. Consulte la tarjeta de límite y la fecha de restablecimiento del presupuesto cuando esté disponible.

Las claves personales compatibles hacen que el proveedor facture las llamadas al modelo en lugar de consumir la IA incluida. Un worker que utiliza una clave BYOK validada no está sujeto a la cuota del plan ni al límite de cómputo de la cuenta. El cómputo de la sandbox sigue teniendo un coste real y se registra en el uso; ese registro no significa que el límite mensual del plan se aplique a esa ejecución BYOK. Las familias o funciones sin asignación cuyas llamadas financia Minddy siguen sujetas a su asignación de Minddy. Una instalación self-hosted tiene los costes de infraestructura y de proveedores opcionales que determine su configuración; ejecutar el mismo núcleo no crea una suscripción Cloud.

## Capacidad de la versión candidata {#plan-capacities}

Estos valores predeterminados corresponden a la versión candidata 0.11.1 identificada. Compruebe la página vigente de precios y su cuenta antes de comprar: los precios configurados en el proceso de compra y las excepciones de cada cuenta pueden variar. El número de invitados no incluye al propietario del proyecto. El almacenamiento se carga al propietario del proyecto que recibe los archivos.

| Plan | Proyectos | Tickets por proyecto | Invitados por proyecto | Almacenamiento | IA mensual incluida (USD) |
| --- | --- | --- | --- | --- | --- |
| Free | 2 | 300 | 3 | 1 GiB | 0.50 |
| Go | Ilimitado | Ilimitado | Ilimitado | 20 GiB | 5 |
| Pro | Ilimitado | Ilimitado | Ilimitado | 100 GiB | 15 |

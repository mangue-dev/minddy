---
{
  "id": "automation-settings",
  "locale": "es",
  "title": "Automatización de tickets",
  "summary": "Separar preferencias de cuenta de reglas exclusivas del propietario.",
  "topic": "Cuenta y aplicaciones",
  "type": "guide",
  "audiences": [
    "owner"
  ],
  "workflows": [
    "A05"
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
      "components/settings/account-automations-section.tsx",
      "components/settings/smart-assign-section.tsx",
      "content/knowledge/settings-and-data.md",
      "content/documentation/reviews/remaining-account-capture-candidates.json",
      "lib/server/agent/quota.ts",
      "lib/server/usage.ts",
      "lib/server/agent/execute.ts",
      "content/documentation/reviews/visual-refresh-captures-2026-10-09.json"
    ]
  },
  "review": {
    "revision": 5,
    "fact": "agent:/root/german_spanish_review (structural consolidation review; prior procedural evidence retained; no operational rerun); agent:/root (visual usefulness, figure framing and preserved procedures; previous operational evidence retained)",
    "language": "agent:/root/german_spanish_review (es title, summary, lead and heading review; retained body comparison)",
    "date": "2026-10-09"
  },
  "related": [],
  "aliases": [],
  "tags": [
    "Configurar trabajo automático de incidencias"
  ],
  "figures": [
    {
      "id": "automation-settings-workflow",
      "kind": "screenshot",
      "src": "/documentation/es/automation-settings-workflow.png",
      "alt": "Preajuste de automatización sin ninguna opción seleccionada.",
      "caption": "Sin preajuste seleccionado, esta cuenta no inicia trabajo automático.",
      "revision": 5,
      "reviewed": true,
      "capturedAt": "2026-10-09",
      "viewport": [
        816,
        221
      ],
      "theme": "light",
      "padding": 24,
      "deviceScaleFactor": 2
    },
    {
      "id": "automation-settings-projects-workflow",
      "kind": "screenshot",
      "src": "/documentation/es/automation-settings-projects-workflow.png",
      "alt": "Selección de proyectos para las automatizaciones de la cuenta.",
      "caption": "Selección de proyectos para las automatizaciones de la cuenta. Los dos proyectos de demostración están desactivados; no se inicia ninguna automatización.",
      "revision": 5,
      "reviewed": true,
      "capturedAt": "2026-10-09",
      "viewport": [
        816,
        176
      ],
      "theme": "light",
      "padding": 24,
      "deviceScaleFactor": 2
    }
  ],
  "requiredFigures": [
    "automation-settings-workflow",
    "automation-settings-projects-workflow"
  ]
}
---

## Opciones de automatización de la cuenta {#automation-settings}

Abra la sección de automatizaciones de los ajustes de la cuenta. Elija una configuración predefinida, lea su explicación y la estimación de uso, ajuste la demora de inicio y seleccione los tamaños de esfuerzo que permiten pasos automáticos. Las estimaciones dependen del presupuesto disponible y no son precios fijos. Antes de activar el trabajo de código, compruebe el modelo del worker en los ajustes de IA de la cuenta. Esta página también muestra los interruptores de automatización de los proyectos de los que es propietario; un miembro no puede activarlos en el proyecto de otro propietario.


![Preajuste de automatización sin ninguna opción seleccionada.](/documentation/es/automation-settings-workflow.png)

## Distinguir los mecanismos {#mechanisms}

Smart Fill completa la prioridad, el esfuerzo, las categorías y el objetivo que falten; no elige el estado, el responsable ni la fecha de vencimiento. Las preferencias de la cuenta distinguen el rellenado durante la creación de tickets y el de los tickets elegibles de triaje en proyectos de los que es propietario. La asignación automática a uno mismo al crear o iniciar un ticket es una preferencia independiente; al iniciar, solo afecta a los tickets que aún no tienen responsable.

Smart Assign es un ajuste del propietario del proyecto con reglas para cada miembro. Smart Triage utiliza reglas estáticas del proyecto y se distingue del rellenado con IA y de la ejecución de código. Antes de guardar una regla, compruebe a qué personas va dirigida y qué acción la activa.

Active únicamente los pasos que quiera ejecutar sin otra petición manual. Los pasos con IA necesitan un proveedor configurado y utilizable y deben superar los controles de presupuesto aplicables a esa llamada. Las claves personales compatibles y validadas pueden eximir sus llamadas de la cuota de IA incluida de la cuenta y trasladar la facturación del modelo al proveedor. No hacen gratuito el cómputo de la sandbox: su coste se sigue registrando por separado, y el presupuesto por ejecución de una rutina sigue siendo un límite independiente. Si se inicia trabajo inesperado, revise la actividad del ticket y su conversación, y desactive el interruptor correspondiente de la cuenta o del proyecto antes de crear más tickets de prueba.

![Selección de proyectos para las automatizaciones de la cuenta.](/documentation/es/automation-settings-projects-workflow.png)

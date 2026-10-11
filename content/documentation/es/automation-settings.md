---
{
  "id": "automation-settings",
  "locale": "es",
  "title": "De automatizaciones a rutinas",
  "summary": "Revisa las propuestas de migración pausadas antes de activar trabajo de Numo por evento.",
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
  "revision": 6,
  "sourceRevision": 6,
  "owner": "@mangue-dev",
  "updatedAt": "2026-10-11",
  "compatibility": {
    "version": "0.11.1 candidate (MIN-677)",
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
      "components/settings/smart-assign-section.tsx",
      "content/knowledge/settings-and-data.md",
      "content/documentation/reviews/remaining-account-capture-candidates.json",
      "lib/server/agent/quota.ts",
      "lib/server/usage.ts",
      "lib/server/agent/execute.ts",
      "content/documentation/reviews/visual-refresh-captures-2026-10-09.json",
      "content/documentation/reviews/min-677-routines.md"
    ]
  },
  "review": {
    "revision": 6,
    "fact": "agent:/root (MIN-677 source review and isolated PostgreSQL regressions; unchanged procedures retain prior evidence)",
    "language": "agent:/root (es translation, label and retained-meaning self-review)",
    "date": "2026-10-11"
  },
  "related": [],
  "aliases": [],
  "tags": [
    "Configurar trabajo automático de incidencias"
  ],
  "figures": [],
  "requiredFigures": []
}
---

## Revisar el trabajo migrado {#automation-settings}

Los interruptores de automatización del proyecto y los preajustes, filtros de esfuerzo y espera inicial de la cuenta se sustituyen por [Rutinas](/docs/scheduled-routines). Abre Rutinas como propietario del proyecto. Las reglas activas archivadas se proponen una sola vez como rutinas pausadas; abrir la lista no las activa ni consume presupuesto de ejecución.

Revisa instrucciones, estado desencadenante, condiciones, espera y límite de gasto de cada propuesta. El flujo original permanece en las instrucciones para compararlo. Comprueba las validaciones humanas y referencias no disponibles antes de activarla. Las propuestas solicitan al propietario las validaciones humanas y limitan cada ejecución al 15 % del presupuesto mensual por defecto. No continúan silenciosamente la cadena anterior. Las cadenas pendientes o esperando a una persona se detienen; el código ya en ejecución puede terminar o detenerse en su conversación, sin un siguiente paso de cadena. La actividad histórica y las copias de la cuenta conservan el archivo.

## Distinguir otras ayudas del proyecto {#mechanisms}

Smart Fill sigue completando prioridad, esfuerzo, categorías y objetivo ausentes. Smart Assign sigue siendo un ajuste del propietario con reglas por miembro. Smart Triage sigue usando reglas estáticas. La autoasignación sigue siendo una preferencia independiente. Estas ayudas no activan una propuesta migrada.

Prueba manualmente una rutina revisada, examina su conversación privada y presupuesto, y actívala para escuchar eventos futuros. Si comienza trabajo inesperado, pausa la rutina y revisa la ejecución antes de reintentar. La [guía de rutinas](/docs/scheduled-routines#conditions) explica las condiciones en espera y su invalidación.

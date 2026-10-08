---
{
  "id": "numo-execution-model",
  "locale": "es",
  "title": "Comprender turnos duraderos Numo y trabajo delegado",
  "summary": "Los mensajes interactivos, las acciones contextuales y las rutinas entran en conversaciones Numo.",
  "topic": "Conceptos técnicos",
  "type": "explanation",
  "audiences": [
    "integrator",
    "operator"
  ],
  "workflows": [
    "T05"
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
      "docs/architecture/numo-persistence.md",
      "docs/architecture/numo-durable-turns.md",
      "content/knowledge/agents-and-mcp.md"
    ]
  },
  "review": {
    "revision": 1,
    "fact": "agent:/root/automation_account_documentation (independent targeted primary-source review)",
    "language": "Codex agent review_documentation_locales: independent complete English/Spanish meaning and idiom review, not human review",
    "date": "2026-10-08"
  },
  "related": [
    "mcp-tool-reference",
    "architecture-and-data-flows",
    "integration-troubleshooting"
  ],
  "aliases": [],
  "tags": [],
  "figures": [
    {
      "id": "numo-execution-model-flow",
      "kind": "diagram",
      "src": "/documentation/es/numo-execution-model-flow.svg",
      "alt": "Diagrama: Persistir intención, mensaje y UUID. Reclamar turno, guardar herramientas y resultados. Esperar worker actual cuando necesario. Releer eventos y conciliar escrituras inciertas.",
      "caption": "Siga las etapas en este orden. Persistir intención, mensaje y UUID. Reclamar turno, guardar herramientas y resultados. Esperar worker actual cuando necesario. Releer eventos y conciliar escrituras inciertas.",
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
    "numo-execution-model-flow"
  ]
}
---
## Comprender turnos duraderos Numo y trabajo delegado {#numo-execution-model}

Los mensajes interactivos, las acciones contextuales y las rutinas entran en conversaciones Numo. El modelo y el nivel de razonamiento de la conversación se eligen en el campo de composición; el trabajo delegado usa los valores predeterminados de modelo de código y razonamiento de la cuenta. Las herramientas directas de Minddy pueden actuar sin repositorio. El trabajo de código abre una sandbox en el servidor para el repositorio vinculado solo cuando hace falta. Una rutina crea una conversación para esa ejecución con las instrucciones guardadas y el contexto de propietario y proyecto. No es necesario mantener una sesión de escritorio abierta.

![Diagrama: Persistir intención, mensaje y UUID. Reclamar turno, guardar herramientas y resultados. Esperar worker actual cuando necesario. Releer eventos y conciliar escrituras inciertas.](/documentation/es/numo-execution-model-flow.svg)

## Separar ejecución y visualización {#state}

La intención se guarda como un turno duradero con el UUID de petición y su mensaje. Pasa de queued a running y después a completed, waiting_input o waiting_work. stopping y stopped representan una interrupción; retryable y failed representan errores. SSE muestra la actividad persistida, pero no controla la ejecución. Tras reconectar, se leen los mensajes y eventos posteriores a la última secuencia recibida. La finalización de un worker solo retoma el turno padre que espera la ejecución actual; los eventos duplicados o antiguos no crean otra tarea. El contexto de proyecto no equivale a acceso: una conversación privada sigue siendo privada.



## Tratar cambios inciertos {#mutations}

Antes de modificar datos, el sistema registra la operación y su checkpoint. Reutiliza los resultados completados. Una lectura interrumpida puede repetirse; una modificación con resultado desconocido pasa a reconciling, sin repetición automática. Compruebe el destino antes de volver a escribir externamente. Las conexiones y el presupuesto de las rutinas siguen sujetos a la propiedad y a las protecciones de coste; otro miembro no puede usar las credenciales MCP personales del propietario anterior. Detener el turno padre interrumpe la delegación activa, aunque una acción externa ya enviada todavía puede finalizar.

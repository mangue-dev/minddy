---
{
  "id": "issue-statuses",
  "locale": "es",
  "title": "Mover una incidencia por su ciclo de vida",
  "summary": "Usa estados fijos para distinguir la entrada, el trabajo planificado, la revisión y los resultados finales.",
  "topic": "Proyectos e incidencias",
  "type": "guide",
  "audiences": [
    "member"
  ],
  "workflows": [
    "W02"
  ],
  "visibility": "public",
  "status": "published",
  "revision": 3,
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
      "mobile",
      "desktop"
    ],
    "evidence": [
      "content/knowledge/core-tracker.md",
      "components/kanban-board.tsx",
      "components/issue-context-menu.tsx"
    ]
  },
  "review": {
    "revision": 3,
    "fact": "2026-10-08",
    "language": "2026-10-08",
    "date": "2026-10-08"
  },
  "related": [
    "triage-incoming-work",
    "issue-dependencies",
    "trash-and-recovery"
  ],
  "aliases": [],
  "tags": [],
  "figures": [
    {
      "id": "issue-statuses-steps",
      "kind": "screenshot",
      "src": "/documentation/es/issue-statuses.png",
      "alt": "Los ocho estados del ticket en el selector, con el estado de backlog seleccionado.",
      "caption": "La marca indica el estado actual. Elige el que corresponda al estado real del trabajo.",
      "revision": 3,
      "reviewed": true,
      "capturedAt": "2026-10-08",
      "viewport": [
        1440,
        1080
      ],
      "theme": "light"
    }
  ],
  "requiredFigures": [
    "issue-statuses-steps"
  ]
}
---

## Cambiar un estado {#issue-statuses}

Abre el selector de estado de la incidencia o utiliza las acciones de estado del tablero. En una vista kanban, mover trabajo entre columnas cambia la propia incidencia; cambiar un filtro solo modifica lo que ves. Verifica el nuevo estado en el panel de detalle después del movimiento.

| Estado | Uso |
| --- | --- |
| Clasificación | Trabajo entrante pendiente de revisión. |
| Registro | Trabajo conservado que todavía no se ha seleccionado para empezar. |
| Pendiente | Trabajo seleccionado para realizarse. |
| En curso | Trabajo en marcha. |
| En examen | Implementación pendiente de revisión. |
| Hecho | Resultado esperado completado. |
| Cancelado | Trabajo cerrado sin entrega. |
| Duplicado | Trabajo representado por otra incidencia. |

Los estados son fijos y no se personalizan por proyecto. Clasificación y Duplicado están disponibles en los selectores, pero se omiten deliberadamente de las columnas kanban normales. Que falte una columna no demuestra que el estado o la incidencia no existan.


![Los ocho estados del ticket en el selector, con el estado de backlog seleccionado.](/documentation/es/issue-statuses.png)

## Estados finales y comprobación {#closed-work}

Hecho, Cancelado y Duplicado son estados finales para el seguimiento: dejan de bloquear incidencias dependientes y salen de los recuentos activos. Cerrar como Cancelado no significa que la tarea se haya entregado. Al marcar un duplicado, identifica la incidencia que se conserva para dar un destino claro a la discusión y el progreso.

Comprueba los filtros si una incidencia desaparece después de cerrarla. Ábrela de nuevo por su identificador para inspeccionar el resultado y cambiar el estado si la cerraste por error. En trabajo bloqueado, comprueba también la dirección de la dependencia: un cambio de estado no reescribe la descripción ni el plan de una incidencia.

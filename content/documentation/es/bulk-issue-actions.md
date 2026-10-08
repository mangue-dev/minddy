---
{
  "id": "bulk-issue-actions",
  "locale": "es",
  "title": "Actualizar varias incidencias juntas",
  "summary": "Revisa la selección antes de aplicar una misma acción a todas sus incidencias.",
  "topic": "Proyectos e incidencias",
  "type": "guide",
  "audiences": [
    "member"
  ],
  "workflows": [
    "W04"
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
      "mobile",
      "desktop"
    ],
    "evidence": [
      "components/bulk-issue-actions.tsx",
      "components/global-board.tsx",
      "components/issue-card.tsx",
      "components/marquee-selection.tsx",
      "components/command-palette.tsx"
    ]
  },
  "review": {
    "revision": 1,
    "fact": "2026-10-08",
    "language": "2026-10-08",
    "date": "2026-10-08"
  },
  "related": [
    "create-an-issue",
    "views-and-filters",
    "personal-cycle"
  ],
  "aliases": [],
  "tags": [],
  "figures": [
    {
      "id": "bulk-issue-actions-steps",
      "kind": "screenshot",
      "src": "/documentation/es/work-bulk-actions.png",
      "alt": "Menú de acciones para dos incidencias de demostración seleccionadas.",
      "caption": "El menú actúa sobre las incidencias seleccionadas. En esta captura no se envió ningún cambio conjunto.",
      "revision": 1,
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
    "bulk-issue-actions-steps"
  ]
}
---

## Seleccionar y actuar {#bulk-issue-actions}

En un tablero, mantén pulsada Mayús y haz clic en cada tarjeta para seleccionarla o quitarla de la selección. Con el ratón, también puedes arrastrar un rectángulo de selección desde un espacio vacío del tablero. Mayús, Command o Ctrl hacen que ese gesto amplíe la selección existente. El rectángulo no es un modo de selección para pantallas táctiles. Comprueba el número seleccionado y los identificadores visibles antes de abrir las acciones masivas. La selección es un conjunto de trabajo para la acción, no una vista guardada ni una concesión de permisos.

Elige Acciones en la barra flotante de selección para abrir la paleta de comandos. Elige estado, prioridad, esfuerzo o responsable, establece el valor y confirma el formulario integrado. La acción de objetivo solo aparece cuando la selección pertenece a un único proyecto con objetivos disponibles. Otras acciones, como añadir o quitar del ciclo, enlazar dos incidencias o enviar la selección a Numo, aparecen cuando el tablero actual las admite. Revisa después las incidencias afectadas. En un dispositivo exclusivamente táctil sin un gesto de selección múltiple compatible, edita cada incidencia en su panel de detalle.

![Menú de acciones para dos incidencias de demostración seleccionadas.](/documentation/es/work-bulk-actions.png)

## Resultados parciales y acciones destructivas {#bulk-results}

Al trabajar entre proyectos, verifica tu pertenencia a cada uno de los afectados. Lee los resultados de fallos parciales: algunos cambios pueden haberse guardado aunque otra incidencia se haya rechazado. Comprueba el resultado antes de volver a intentar toda la selección.

La eliminación afecta a todos los elementos seleccionados, así que confirma el conjunto antes de continuar. Quita la selección después de la operación si vas a pasar a otro trabajo. Si la actualización modifica los resultados de los filtros, las incidencias pueden salir de la vista mostrada y seguir en el proyecto. Busca sus identificadores para verificar el estado nuevo en lugar de recrearlas.

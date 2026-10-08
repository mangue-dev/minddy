---
{
  "id": "forge-issue-sync",
  "locale": "es",
  "title": "Sincronizar incidencias del proveedor Git",
  "summary": "Activar importación y sincronización y diagnosticar permisos y cambios simultáneos.",
  "topic": "Numo e integraciones",
  "type": "guide",
  "audiences": [
    "owner",
    "integrator"
  ],
  "workflows": [
    "N11"
  ],
  "visibility": "public",
  "status": "published",
  "revision": 1,
  "sourceRevision": 1,
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
      "docs/github-issue-sync.md",
      "content/knowledge/integrations.md",
      "components/settings/project-git-section.tsx",
      "content/documentation/reviews/forge-controls-capture-candidates.json"
    ]
  },
  "review": {
    "revision": 1,
    "fact": "2026-10-08",
    "language": "2026-10-08",
    "date": "2026-10-08"
  },
  "related": [],
  "aliases": [],
  "tags": [],
  "figures": [
    {
      "id": "forge-issue-sync-mapping",
      "kind": "diagram",
      "src": "/documentation/es/forge-issue-sync-mapping.png",
      "alt": "Flujo de sincronización de GitHub con configuración, validación de eventos, importación y estados.",
      "caption": "Los eventos de GitHub conservan los cambios recientes y evitan entregas duplicadas. Las correspondencias de GitLab se verifican por separado.",
      "revision": 1,
      "reviewed": true,
      "capturedAt": "2026-10-08",
      "viewport": [
        1100,
        720
      ],
      "theme": "neutral"
    },
    {
      "id": "forge-issue-sync-workflow",
      "kind": "screenshot",
      "src": "/documentation/es/forge-issue-sync-workflow.png",
      "alt": "Repositorio de demostración de GitHub vinculado, con la sincronización de incidencias desactivada.",
      "caption": "El repositorio de demostración está vinculado a GitHub. La sincronización de incidencias sigue desactivada; compruebe el alcance y el backlog existente antes de activarla. Esta captura no demuestra una importación sincronizada.",
      "revision": 1,
      "reviewed": true,
      "capturedAt": "2026-10-08",
      "viewport": [
        1400,
        1000
      ],
      "theme": "light"
    }
  ],
  "requiredFigures": [
    "forge-issue-sync-workflow",
    "forge-issue-sync-mapping"
  ]
}
---

## Activar y comprobar {#forge-issue-sync}
Como propietario, abra Git tras vincular el repositorio. Active sincronización con los permisos de escritura necesarios. Las incidencias importadas llegan al triaje. Compruebe la carga inicial indicada y título, descripción y estado de una incidencia remota conocida.

Los estados abierto y cerrado se reflejan en ambas direcciones. En GitHub, título y cuerpo pasan a título y descripción; las etiquetas aportan categorías y prioridad o esfuerzo reconocidos; se usa el primer asignado vinculado y la fecha del hito como vencimiento. Los comentarios conservan autor, identidad, URL y fechas remotas. Bloqueos requieren ambas incidencias en el mismo proyecto importado. Permanecen URL de adjuntos; bytes y campos de GitHub Projects no tienen equivalente nativo.

## Permisos, conflictos y desactivación {#recovery}
La GitHub App necesita lectura/escritura de Issues y suscripciones Issues, Issue comments e Issue dependencies. Instalaciones existentes deben aceptar permisos nuevos. Estas correspondencias no garantizan todos los campos GitLab.

Eventos GitHub antiguos con fecha no sobrescriben cambios locales recientes. Identidades de entregas y comentarios evitan duplicados. Compare fechas y consulte eventos del proveedor y registros del operador si falta carga inicial. Desactive en el mismo ajuste exclusivo del propietario; revise por separado trabajo ya importado.

![Flujo de sincronización de GitHub con configuración, validación de eventos, importación y estados.](/documentation/es/forge-issue-sync-mapping.png)

![Repositorio de demostración de GitHub vinculado, con la sincronización de incidencias desactivada.](/documentation/es/forge-issue-sync-workflow.png)

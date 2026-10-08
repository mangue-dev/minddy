---
{
  "id": "sub-issues",
  "locale": "es",
  "title": "Dividir una incidencia en subincidencias",
  "summary": "Sigue tareas menores bajo una incidencia principal y desvincula una hija sin eliminarla.",
  "topic": "Proyectos e incidencias",
  "type": "guide",
  "audiences": [
    "member"
  ],
  "workflows": [
    "W06"
  ],
  "visibility": "public",
  "status": "published",
  "revision": 2,
  "sourceRevision": 2,
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
      "components/issue-parent-menu.tsx",
      "components/issue-family-banner.tsx",
      "lib/server/create-issue.ts",
      "lib/server/update-issue.ts"
    ]
  },
  "review": {
    "revision": 2,
    "fact": "2026-10-08",
    "language": "2026-10-08",
    "date": "2026-10-08"
  },
  "related": [
    "create-an-issue",
    "issue-dependencies",
    "implementation-plans"
  ],
  "aliases": [],
  "tags": [],
  "figures": [
    {
      "id": "sub-issues-steps",
      "kind": "screenshot",
      "src": "/documentation/es/work-sub-issues.png",
      "alt": "Campo para crear una subincidencia en una incidencia principal de demostración.",
      "caption": "El campo crea una hija de esta incidencia; cada hija conserva su estado y conversación.",
      "revision": 2,
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
    "sub-issues-steps"
  ]
}
---

## Crear la jerarquía {#sub-issues}

Abre la incidencia principal y usa sus controles de subincidencias para crear partes menores del trabajo. Asigna un resultado distinto a cada hija. Comprueba su proyecto, propiedades e identificador de la principal después de crearla; la jerarquía debe facilitar el seguimiento, no sustituir la descripción de lo que cada hija debe lograr.

La jerarquía admite un nivel: la incidencia principal debe ser una incidencia de nivel superior del mismo proyecto y una subincidencia no puede tener hijas. Si no eliges expresamente un objetivo al crearla, la hija hereda el objetivo de la principal. Comprueba las propiedades resultantes en lugar de suponer que los cambios posteriores de la principal se propagan.

Una hija sigue siendo una incidencia con estado y discusión propios. El indicador de progreso de la principal pondera el esfuerzo de las hijas y la proporción de avance que corresponde a su estado. El contador de completadas sobre el total de la lista de subincidencias es un recuento separado, sin ponderar. Lee los estados de las hijas junto con ambas medidas. Usa una dependencia para expresar «debe terminar antes» y una principal para expresar «forma parte de esta tarea mayor».

![Campo para crear una subincidencia en una incidencia principal de demostración.](/documentation/es/work-sub-issues.png)

## Abrir o retirar la relación con la principal {#change-parent}

El identificador de la principal junto al título de la hija abre un menú. Usa la acción de abrir la principal para examinar la tarea mayor. Para separar la hija, elige desvincularla de la principal y lee la confirmación antes de aplicarla. La desvinculación correcta elimina la relación y conserva la incidencia.

No elimines una hija solo para reorganizar la jerarquía. Comprueba las relaciones existentes antes de cambiar la principal y resuelve una relación rechazada en lugar de forzar una jerarquía circular. Si falla el guardado, vuelve a abrir la hija para ver si el cambio se aplicó antes de intentarlo otra vez. Conserva el trabajo completado de las hijas al revisar el plan global.

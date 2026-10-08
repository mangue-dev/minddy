---
{
  "id": "create-an-issue",
  "locale": "es",
  "title": "Crear y editar una incidencia",
  "summary": "Describe una tarea que se pueda realizar, elige su proyecto y actualiza propiedades sin duplicar trabajo.",
  "topic": "Proyectos e incidencias",
  "type": "guide",
  "audiences": [
    "member"
  ],
  "workflows": [
    "W01"
  ],
  "visibility": "public",
  "status": "published",
  "revision": 4,
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
      "content/knowledge/core-tracker.md",
      "components/create-issue-dialog.tsx",
      "components/issue-fields.tsx",
      "components/issue-compact-fields.tsx",
      "lib/smart-fill.ts"
    ]
  },
  "review": {
    "revision": 4,
    "fact": "2026-10-08",
    "language": "2026-10-08",
    "date": "2026-10-08"
  },
  "related": [
    "issue-statuses",
    "issue-dependencies",
    "sub-issues",
    "implementation-plans"
  ],
  "aliases": [],
  "tags": [],
  "figures": [
    {
      "id": "create-an-issue-steps",
      "kind": "screenshot",
      "src": "/documentation/es/new-issue.png",
      "alt": "Borrador sin enviar con título, descripción y propiedades que se pueden elegir manualmente.",
      "caption": "Describe el resultado esperado y elige las propiedades útiles antes de crear el ticket.",
      "revision": 4,
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
    "create-an-issue-steps"
  ]
}
---

## Crear la tarea {#create-an-issue}

Debes ser miembro del proyecto de destino. Abre el proyecto y su control para crear una incidencia. Escribe un título que identifique el trabajo y añade contexto, resultado esperado y restricciones en la descripción. Elige el proyecto deliberadamente cuando crees desde una vista personal o entre proyectos.

Para crear la incidencia manualmente, desactiva Rellenado inteligente si el botón aparece y está activado. Esto muestra los controles de prioridad, esfuerzo, categorías y objetivo para que los establezcas. La elección se aplica a esta incidencia; al volver a abrir el formulario de creación se restablece la preferencia de la cuenta. Es independiente de los interruptores de automatización y Smart Assign del proyecto.

Configura las propiedades útiles antes de confirmar: estado, prioridad, esfuerzo, responsable, objetivo, categorías, fecha límite y recurrencia. La persona responsable es miembro del proyecto; un objetivo agrupa incidencias alrededor de un resultado del proyecto. Puedes dejar las propiedades opcionales sin valor en lugar de adivinar. La prioridad va de ninguna a baja, media, alta y urgente; el esfuerzo utiliza XS, S, M, L y XL.

Confirma la creación y abre la nueva incidencia. Comprueba su identificador y proyecto. Vuelve a abrir los selectores de propiedades para cambiar valores conforme la tarea quede más clara. La descripción explica el trabajo; el plan de implementación se mantiene por separado en la pestaña del plan.


![Borrador sin enviar con título, descripción y propiedades que se pueden elegir manualmente.](/documentation/es/new-issue.png)

## Comprobar el guardado y la visibilidad {#issue-save}

Tras cambiar una propiedad, verifica el valor mostrado. Los filtros pueden retirar de inmediato una incidencia de la vista actual cuando cambia su responsable, estado o categoría. Busca su identificador o abre el proyecto sin esos filtros antes de crear una sustituta.

Si falla la creación o el guardado, conserva el texto, lee el error y comprueba que la pertenencia y el destino sigan existiendo. Antes de reintentar tras un fallo de red, comprueba si la incidencia ya se creó. Adjunta páginas del proyecto como recursos vinculados a su contenido actual cuando lo necesites y utiliza comentarios para discutir la tarea.

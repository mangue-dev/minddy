---
{
  "id": "trash-and-recovery",
  "locale": "es",
  "title": "Papelera y recuperación",
  "summary": "Encuentra un objeto eliminado, restaura sus dependencias y distingue la eliminación definitiva.",
  "topic": "Planificar y encontrar trabajo",
  "type": "guide",
  "audiences": [
    "member",
    "owner"
  ],
  "workflows": [
    "W19"
  ],
  "visibility": "public",
  "status": "published",
  "revision": 7,
  "sourceRevision": 7,
  "owner": "@mangue-dev",
  "updatedAt": "2026-10-22",
  "compatibility": {
    "version": "0.20.0 (MIN-747 release review)",
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
      "app/(app)/trash/page.tsx",
      "content/knowledge/productivity.md",
      "lib/server/trash.ts",
      "components/app-sidebar.tsx"
    ]
  },
  "review": {
    "revision": 7,
    "fact": "agent:/root/min747 (0.20.0 release review: source audit against the v0.11.0..main delta, verified corrections applied; no screenshot in scope; 1 screenshot(s) without a current capture script keep their earlier capture and evidence; no browser walkthrough of the procedures or operator rehearsal; earlier evidence retained in git history); agent:claude-code (manual figures rebuilt on the Aurora demo, catalog review labels and informal register; figures recaptured on 2026-10-22 from a local candidate against the preview demo account and inspected; no form submitted)",
    "language": "agent:/root/min747 (es translation of the release corrections with catalog UI labels; equivalent meaning self-reviewed; agent review, not human acceptance); agent:claude-code (es manual figures rebuilt on the Aurora demo, catalog review labels and informal register; self-reviewed; agent review, not human acceptance)",
    "date": "2026-10-22"
  },
  "related": [
    "pages",
    "accounts",
    "projects"
  ],
  "aliases": [],
  "tags": [
    "Restaurar trabajo eliminado"
  ],
  "figures": [
    {
      "id": "trash-and-recovery-steps",
      "kind": "screenshot",
      "src": "/documentation/es/reader-trash.png",
      "alt": "Incidencia AUR-20 recuperable en la papelera, con su proyecto, quién la eliminó y el tiempo de conservación restante.",
      "caption": "Las acciones de la fila permiten restaurarla. Vaciar la papelera es una operación permanente independiente.",
      "revision": 7,
      "reviewed": true,
      "capturedAt": "2026-10-22",
      "viewport": [
        994,
        526
      ],
      "theme": "light",
      "padding": 24,
      "deviceScaleFactor": 2
    }
  ],
  "requiredFigures": [
    "trash-and-recovery-steps"
  ]
}
---

## Encontrar y restaurar un elemento {#trash-and-recovery}

Abre la papelera desde el menú de la cuenta. Contiene trabajo eliminado recuperable, incluidas incidencias, objetivos, sugerencias, rutinas, proyectos y páginas compatibles. Comprueba el tipo, la fecha de eliminación y la retención restante mostrada antes de restaurar.

Restaura primero el objeto principal o el contenedor requerido cuando el elemento dependa de él. Por ejemplo, restaura una base de datos eliminada antes de una entrada eliminada por separado. Abre el destino restaurado e inspecciona contenido y propiedades. Los elementos eliminados se pueden recuperar durante 30 días antes de que la retención los retire definitivamente. Solo el propietario puede restaurar o eliminar permanentemente un proyecto o una rutina. El propietario y los Miembros pueden restaurar o retirar los demás objetos compatibles del proyecto mientras conserven acceso. Un Lector no puede modificar un proyecto, así que los elementos de un proyecto que solo lees no aparecen en tu papelera.

![Incidencia AUR-20 recuperable en la papelera, con su proyecto, quién la eliminó y el tiempo de conservación restante.](/documentation/es/reader-trash.png)

## Eliminación permanente y recuperación fallida {#permanent-removal}

La eliminación permanente y el vaciado de la papelera no se pueden deshacer. Lee la confirmación y el número de elementos antes de continuar; no son controles ordinarios para ocultar trabajo terminado. Un elemento fuera de la retención disponible puede dejar de ser recuperable mediante la interfaz.

Si falla la restauración, lee el error y comprueba que exista el proyecto o contenedor y que aún tengas acceso. No elimines permanentemente ni recrees objetos repetidamente para resolver un conflicto de restauración. Exporta datos importantes antes de eliminar la cuenta; eliminar la cuenta tiene consecuencias distintas de enviar un solo objeto a la papelera recuperable.

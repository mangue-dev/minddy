---
{
  "id": "create-and-organize-pages",
  "locale": "es",
  "title": "Crear una wiki del proyecto",
  "summary": "Crea páginas y subpáginas, organiza su jerarquía y destaca favoritos compartidos.",
  "topic": "Páginas y bases de datos",
  "type": "guide",
  "audiences": [
    "member"
  ],
  "workflows": [
    "P01"
  ],
  "visibility": "public",
  "status": "published",
  "revision": 4,
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
      "content/knowledge/pages.md",
      "components/pages/page-create-menu.tsx",
      "components/pages/page-tree.tsx"
    ]
  },
  "review": {
    "revision": 4,
    "fact": "2026-10-08",
    "language": "2026-10-08",
    "date": "2026-10-08"
  },
  "related": [
    "page-editor",
    "page-comments-and-collaboration",
    "publish-a-page"
  ],
  "aliases": [
    "pages"
  ],
  "tags": [],
  "figures": [
    {
      "id": "create-and-organize-pages-steps",
      "kind": "screenshot",
      "src": "/documentation/es/page-create-menu.png",
      "alt": "Menú de creación con Nueva página y Nueva base de datos.",
      "caption": "Utiliza los controles de páginas del proyecto para elegir un documento o una base de datos.",
      "revision": 4,
      "reviewed": true,
      "capturedAt": "2026-10-08",
      "viewport": [
        1440,
        900
      ],
      "theme": "light"
    }
  ],
  "requiredFigures": [
    "create-and-organize-pages-steps"
  ]
}
---

## Crear y organizar páginas {#create-and-organize-pages}

Abre Páginas en un proyecto del que seas miembro. Usa el menú + y elige una página para un documento o una base de datos para una lista estructurada. Pon un título útil y escribe la especificación, decisión o procedimiento que deba conservar.

Crea subpáginas para documentos relacionados y utiliza los controles del árbol para moverlas o reordenarlas. Una página no puede ser descendiente de sí misma. Duplicar una página crea contenido nuevo, no una referencia actualizada al original. Revisa la rama duplicada antes de editarla o compartirla.

## Favoritos y eliminación {#page-tree}

Marca una página como favorita para mostrarla al principio del árbol del proyecto. Estos favoritos se comparten dentro del proyecto, a diferencia de una nota privada del cuaderno. Enlaza una página a una incidencia cuando el documento actual sea contexto de la tarea; el título del recurso sigue los cambios de nombre de la página.

La eliminación envía a la papelera las páginas para las que se admite la recuperación. Comprueba la rama seleccionada antes de eliminar y recupera una página perdida en lugar de recrearla cuando quieras conservar su contenido. Las entradas con valores de base de datos guardados se pueden reordenar dentro de su base, pero no mover fuera de ella. Si se rechaza un movimiento, examina jerarquía y tipo de entrada en lugar de forzarlo con intentos repetidos.


![Menú de creación con Nueva página y Nueva base de datos.](/documentation/es/page-create-menu.png)

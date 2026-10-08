---
{
  "id": "import-a-database",
  "locale": "es",
  "title": "Importar una base de datos con el contenido de sus entradas",
  "summary": "Revisa la correspondencia del esquema y el número de páginas antes de cargar una base vacía.",
  "topic": "Páginas y bases de datos",
  "type": "guide",
  "audiences": [
    "member"
  ],
  "workflows": [
    "P11"
  ],
  "visibility": "public",
  "status": "published",
  "revision": 3,
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
      "components/pages/database-import-dialog.tsx",
      "lib/server/database-import.ts",
      "content/knowledge/pages.md"
    ]
  },
  "review": {
    "revision": 3,
    "fact": "2026-10-08",
    "language": "2026-10-08",
    "date": "2026-10-08"
  },
  "related": [
    "create-a-database",
    "change-a-database-schema",
    "import-export-and-print-pages"
  ],
  "aliases": [],
  "tags": [],
  "figures": [
    {
      "id": "import-a-database-steps",
      "kind": "screenshot",
      "src": "/documentation/es/database-import-review.png",
      "alt": "Revisión de un CSV local: dos páginas de entradas y dos columnas, con el botón Importar base de datos.",
      "caption": "Revisa las entradas analizadas y el número de columnas antes de importar a la base vacía.",
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
    "import-a-database-steps"
  ]
}
---

## Elegir la importación {#import-a-database}

Crea una base de datos sin columnas opcionales ni entradas existentes. En el aviso de la nueva base, elige Importar una base existente. Sube un ZIP de Notion en formato Markdown & CSV con subpáginas, un CSV de una base de datos o un archivo de base de datos de Minddy. Si el archivo contiene varias bases, selecciona la que quieres importar.

Antes de confirmar, revisa los nombres y tipos de columna propuestos y después el número de páginas. Numo puede sugerir tipos a partir de una muestra pequeña si la asistencia de importación está configurada; también puedes establecer la correspondencia manualmente. Las propiedades de origen no compatibles se conservan como texto. Los valores incompatibles bloquean la importación en lugar de borrarse sin aviso.

## Qué se conserva y qué debes comprobar {#database-import-result}

La importación incluye el contenido de las entradas, los documentos anidados y los archivos locales presentes en el archivo de importación. Un archivo de Minddy también conserva el esquema exacto y los colores de las opciones, y reasigna los enlaces internos a páginas y archivos. Las personas pueden asociarse con miembros del proyecto de destino. Una exportación de Notion no contiene el esquema original, los colores de las opciones ni las definiciones de las fórmulas; esa información ausente no se puede recuperar.

Los archivos tienen un límite de 20 MB comprimidos, 50 MB descomprimidos y 1.000 páginas. Cada adjunto mantiene el límite de 10 MB de los archivos de página. La escritura de la base de datos es transaccional. Reintentar el mismo intento en el diálogo abierto mantiene su identificador de solicitud, por lo que un intento ya completado se devuelve sin duplicar filas. Cargar otro archivo o abrir un diálogo nuevo puede crear un intento distinto. Si el resultado de red es incierto, examina el destino antes de empezar de nuevo; una base ya poblada deja de cumplir el requisito de destino vacío.

Tras una importación correcta, comprueba algunas entradas, sus valores, las páginas anidadas y los adjuntos. Conserva el archivo original hasta terminar esta revisión. Si la importación falla, lee el primer error y corrige el formato o la correspondencia antes de reintentarlo. No rellenes manualmente la base de destino dando por hecho que después seguirá cumpliendo el requisito de estar vacía.


![Revisión de un CSV local: dos páginas de entradas y dos columnas, con el botón Importar base de datos.](/documentation/es/database-import-review.png)

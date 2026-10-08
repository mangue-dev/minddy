---
{
  "id": "import-export-and-print-pages",
  "locale": "es",
  "title": "Importar, exportar o imprimir una página",
  "summary": "Elige el formato de salida y comprueba el contenido, la jerarquía y los adjuntos.",
  "topic": "Páginas y bases de datos",
  "type": "guide",
  "audiences": [
    "member"
  ],
  "workflows": [
    "P07"
  ],
  "visibility": "public",
  "status": "published",
  "revision": 2,
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
      "components/pages/page-document-actions.tsx",
      "lib/server/pages-export.ts",
      "components/pages/page-print-view.tsx"
    ]
  },
  "review": {
    "revision": 2,
    "fact": "2026-10-08",
    "language": "2026-10-08",
    "date": "2026-10-08"
  },
  "related": [
    "publish-a-page",
    "import-a-database",
    "page-history"
  ],
  "aliases": [],
  "tags": [],
  "figures": [
    {
      "id": "import-export-and-print-pages-steps",
      "kind": "screenshot",
      "src": "/documentation/es/page-export.png",
      "alt": "Menú de exportación del documento con Markdown (.md) e Imprimir / PDF.",
      "caption": "Elige Markdown para descargar el documento o Imprimir / PDF para abrir la vista de impresión.",
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
    "import-export-and-print-pages-steps"
  ]
}
---

## Elegir la operación del documento {#import-export-and-print-pages}

Abre el menú del documento de la página y elige Exportar. Selecciona Markdown para una página (.md) o una rama (.zip), PDF para abrir la vista de impresión o el archivo de base de datos si la página es una base de datos. Revisa el alcance ofrecido antes de confirmar: una página, su rama y un archivo de base de datos contienen elementos diferentes.

Abre la exportación y comprueba los encabezados, avisos, enlaces y adjuntos que necesite el lector. La acción PDF abre una vista de impresión legible sin toda la navegación de la aplicación. Usa los controles de impresión del navegador para imprimir o guardar un PDF. El menú del documento no ofrece una acción de importación general. Las importaciones compatibles se inician desde una base vacía, como explica la guía de importación de bases de datos.


![Menú de exportación del documento con Markdown (.md) e Imprimir / PDF.](/documentation/es/page-export.png)

## Archivos de base de datos y límites {#export-fidelity}

Un archivo de base de datos (.zip) incluye su rama: Markdown y CSV, el esquema exacto y los colores de las opciones, valores, contenidos, marcas de tiempo, páginas anidadas y los datos de los archivos. Impórtalo en una base nueva y vacía para restaurar esa estructura. Los filtros, la ordenación y las preferencias de columnas ocultas propios de cada dispositivo permanecen en el dispositivo original.

Una exportación no transfiere contraseñas, credenciales de proveedores de cuentas ni suscripciones. Para trasladar el trabajo de una cuenta entre instancias, utiliza la guía de transferencia de datos de la cuenta. Si un formato importado no puede conservar un bloque o una propiedad externa, revisa el resultado antes de utilizarlo como sustituto. No elimines el original solo porque se haya creado un archivo descargable.

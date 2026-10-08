---
{
  "id": "create-a-database",
  "locale": "es",
  "title": "Crear una base de datos y sus columnas",
  "summary": "Empieza con una lista vacía, elige tipos de propiedades y añade una primera entrada.",
  "topic": "Páginas y bases de datos",
  "type": "tutorial",
  "audiences": [
    "member"
  ],
  "workflows": [
    "P08"
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
      "content/knowledge/pages.md",
      "components/pages/database-setup-banner.tsx",
      "components/pages/database-property-dialogs.tsx",
      "lib/page-creation-settlement.ts"
    ]
  },
  "review": {
    "revision": 4,
    "fact": "2026-10-08",
    "language": "2026-10-08",
    "date": "2026-10-08"
  },
  "related": [
    "change-a-database-schema",
    "database-cells-and-entries",
    "import-a-database"
  ],
  "aliases": [],
  "tags": [],
  "figures": [
    {
      "id": "create-a-database-steps",
      "kind": "screenshot",
      "src": "/documentation/es/database-property-types.png",
      "alt": "Selector de tipo de columna con texto, número, selecciones, fechas, personas y casilla de verificación.",
      "caption": "Elige un tipo que corresponda a los valores que deseas guardar.",
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
    "create-a-database-steps"
  ]
}
---

## Crear la lista {#create-a-database}

Como miembro del proyecto, abre Páginas, usa + y elige una base de datos. Una base nueva tiene el nombre de sus entradas y ninguna columna opcional. Su aviso «Nueva base de datos» ofrece configuración con Numo o importar una base existente. La configuración manual sigue disponible sin IA. Elegir la configuración con Numo abre una solicitud preparada con esta base de datos como contexto de página, una vez terminada su creación. Revisa y envía la solicitud para pedir la estructura que necesitas; abrir la conversación no completa la configuración. El trabajo real de IA necesita un proveedor configurado y uso disponible o una clave personal compatible. Comprueba el esquema y las entradas resultantes antes de utilizarlos.

Abre «Columnas» y elige «Añadir columna», o usa la columna + del extremo derecho. Nombra la columna y elige Texto, Número, Selección, Selección múltiple, Fecha de creación, Fecha, Personas o Casilla de verificación. Usa el selector de tipos con búsqueda para encontrarlo. Guarda, añade una entrada y verifica que la columna aparezca en la tabla y en la página de entrada.

## Elegir tipos y respetar límites {#database-types}

Una base admite hasta 30 columnas de propiedades además del nombre de entrada. Selección permite una opción; Selección múltiple permite varias, con hasta 100 opciones por columna. Las celdas de texto admiten 2.000 caracteres. Número acepta decimales con signo, punto o coma y rechaza letras. Fecha de creación es la marca temporal original de la entrada y no se puede editar.

Personas selecciona miembros del proyecto, no correos de cuentas arbitrarias. Los miembros recién mencionados pueden recibir notificaciones. Una entrada de base de datos también es una página completa con contenido normal, comentarios y adjuntos.

No hay fórmulas avanzadas, automatizaciones ni vistas adicionales de base de datos. Elige una propiedad de texto o un documento enlazado cuando los datos no encajen en un tipo admitido; no describas una fórmula no compatible como una columna funcional.


![Selector de tipo de columna con texto, número, selecciones, fechas, personas y casilla de verificación.](/documentation/es/database-property-types.png)

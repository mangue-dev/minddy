---
{
  "id": "change-a-database-schema",
  "locale": "es",
  "title": "Cambiar el esquema de una base de datos con seguridad",
  "summary": "Renombra, reordena o convierte columnas y comprueba la posible pérdida de valores.",
  "topic": "Páginas y bases de datos",
  "type": "guide",
  "audiences": [
    "member"
  ],
  "workflows": [
    "P10"
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
      "components/pages/database-property-dialogs.tsx",
      "components/pages/database-column-name.tsx",
      "content/knowledge/pages.md"
    ]
  },
  "review": {
    "revision": 2,
    "fact": "2026-10-08",
    "language": "2026-10-08",
    "date": "2026-10-08"
  },
  "related": [
    "create-a-database",
    "database-cells-and-entries",
    "import-a-database"
  ],
  "aliases": [],
  "tags": [],
  "figures": [
    {
      "id": "change-a-database-schema-steps",
      "kind": "screenshot",
      "src": "/documentation/es/database-conversion-warning.png",
      "alt": "Advertencia de conversión: cambiar de Texto a Número borra una celda incompatible, con botones para cancelar o confirmar.",
      "caption": "Revisa el número real de celdas incompatibles antes de confirmar. Cancelar conserva los valores actuales.",
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
    "change-a-database-schema-steps"
  ]
}
---

## Cambiar la disposición o las opciones {#change-a-database-schema}

En Columnas, utiliza el control del ojo para mostrar u ocultar propiedades. Haz clic en una cabecera para cambiar su nombre o arrastra las cabeceras para reordenarlas. La columna con el nombre de la entrada permanece en primer lugar. Las opciones de Selección o Selección múltiple se pueden editar desde el menú de la celda o desde Columnas; sus nombres y colores se guardan juntos.

Ocultar una columna cambia las preferencias de visualización y conserva sus valores. Eliminar una columna personalizada borra sus valores en todas las entradas y no se puede deshacer. Ten presente esta consecuencia antes de confirmar la eliminación.

## Convertir el tipo de una propiedad {#convert-column}

Elige Editar columna en una propiedad personalizada y selecciona el nuevo tipo. El diálogo convierte los valores existentes al guardar. Si algunos son incompatibles, la advertencia indica cuántas celdas quedarán vacías. Continúa solo si aceptas perder esos valores, o cancela para conservar el tipo anterior y todos los valores.

Al cambiar a Fecha de creación, se utiliza la fecha de creación original de cada entrada y aparece una advertencia antes de sustituir los valores existentes. Revisa entradas representativas después de la conversión, sobre todo cuando un número, una selección o una fecha puedan interpretarse de otra manera.

Las modificaciones del esquema realizadas por un agente utilizan la revisión actual de la base y un token de vista previa de la conversión. Los cambios simultáneos invalidan esa vista previa. Vuelve a leer el estado actual y a generar la vista previa en lugar de forzar una conversión antigua. Vaciar los valores incompatibles requiere una confirmación explícita.


![Advertencia de conversión: cambiar de Texto a Número borra una celda incompatible, con botones para cancelar o confirmar.](/documentation/es/database-conversion-warning.png)

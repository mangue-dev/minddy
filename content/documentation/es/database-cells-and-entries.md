---
{
  "id": "database-cells-and-entries",
  "locale": "es",
  "title": "Editar valores y páginas de entradas de una base de datos",
  "summary": "Guarda celdas, selecciona filas y amplía una entrada conservando las ediciones pendientes.",
  "topic": "Páginas y bases de datos",
  "type": "guide",
  "audiences": [
    "member"
  ],
  "workflows": [
    "P09"
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
      "components/pages/page-database-view.tsx",
      "components/pages/database-cell-editor.tsx",
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
    "change-a-database-schema",
    "create-a-database",
    "page-history"
  ],
  "aliases": [],
  "tags": [],
  "figures": [
    {
      "id": "database-cells-and-entries-steps",
      "kind": "screenshot",
      "src": "/documentation/es/database-entry.png",
      "alt": "Entrada de demostración con descripción, duración 2.5, casilla marcada y selección vacía.",
      "caption": "Abre una entrada para leer el texto completo y editar los valores según su tipo.",
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
    "database-cells-and-entries-steps"
  ]
}
---

## Editar un valor {#database-cells-and-entries}

Pulsa una celda de la tabla o la propiedad situada sobre el cuerpo de una entrada. Enter guarda, Escape cancela y Shift+Enter inserta una línea de texto. Salir del editor guarda. Un número inválido mantiene el editor abierto hasta corregirse; un fallo de guardado revierte el valor y muestra un error.

Usa una celda de Selección para una opción o Selección múltiple para varias. Busca opciones existentes o crea una nueva desde el menú. Abre «Editar opciones» para cambiar nombres o colores y después guarda el conjunto o cancela. Fecha, Personas y Casilla de verificación usan sus controles; Fecha de creación permanece en solo lectura.

## Abrir, seleccionar e insertar entradas {#entry-actions}

Abre una entrada para editar su página completa en un panel flotante. «Ampliar» la abre como página completa cuando terminan los guardados pendientes del documento. Si fallan, el panel permanece abierto para resolverlo. Una entrada vacía sigue en la base hasta que la elimines.

Usa las casillas de las filas para seleccionar y Shift-clic para un intervalo. El tirador abre acciones y permite reordenar entradas en orden manual. El + del margen inserta debajo de una entrada; Option/Alt inserta encima. La inserción adyacente vuelve al orden manual y quita filtros para que se vea la nueva entrada.

## Preferencias de visualización {#database-display}

Busca, filtra, ordena y oculta columnas en la vista de lista única. Estas preferencias se recuerdan en tu dispositivo; el orden manual se comparte con el árbol de páginas. Desplázate horizontalmente con un gesto de trackpad, Shift y rueda del ratón, pantalla táctil o barra inferior. Una vista previa de texto recortada no acorta el valor guardado. Las entradas con valores de columnas se pueden reordenar dentro de su base, pero no mover fuera de ella.


![Entrada de demostración con descripción, duración 2.5, casilla marcada y selección vacía.](/documentation/es/database-entry.png)

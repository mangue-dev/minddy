---
{
  "id": "databases",
  "locale": "es",
  "title": "Bases de datos",
  "summary": "Crea una base de datos, edita valores y páginas de entradas, cambia su esquema e importa una base completa con las comprobaciones necesarias.",
  "topic": "Páginas y bases de datos",
  "type": "guide",
  "audiences": [
    "member"
  ],
  "workflows": [
    "P08",
    "P09",
    "P10",
    "P11"
  ],
  "visibility": "public",
  "status": "published",
  "revision": 6,
  "sourceRevision": 6,
  "owner": "@mangue-dev",
  "updatedAt": "2026-10-09",
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
      "lib/page-creation-settlement.ts",
      "components/pages/page-database-view.tsx",
      "components/pages/database-cell-editor.tsx",
      "components/pages/database-column-name.tsx",
      "components/pages/database-import-dialog.tsx",
      "lib/server/database-import.ts"
    ]
  },
  "review": {
    "revision": 6,
    "fact": "agent:/root/german_spanish_review (structural consolidation review; prior procedural evidence retained; no operational rerun); agent:/root (visual usefulness, figure framing and preserved procedures; previous operational evidence retained)",
    "language": "agent:/root/german_spanish_review (es title, summary, lead and heading review; retained body comparison); agent:/root/editorial_de_es (editorial clarity pass); agent:/root (figure removals and captions)",
    "date": "2026-10-09"
  },
  "related": [
    "pages"
  ],
  "aliases": [
    "create-a-database",
    "database-cells-and-entries",
    "change-a-database-schema",
    "import-a-database"
  ],
  "tags": [
    "Crear una base de datos y sus columnas",
    "Editar valores y páginas de entradas de una base de datos",
    "Cambiar el esquema de una base de datos con seguridad",
    "Importar una base de datos con el contenido de sus entradas"
  ],
  "figures": [
    {
      "id": "create-a-database-steps",
      "kind": "screenshot",
      "src": "/documentation/es/database-property-types.png",
      "alt": "Selector de tipo de columna con texto, número, selecciones, fechas, personas y casilla de verificación.",
      "caption": "Elige un tipo que corresponda a los valores que deseas guardar.",
      "revision": 6,
      "reviewed": true,
      "capturedAt": "2026-10-08",
      "viewport": [
        464,
        336
      ],
      "theme": "light",
      "padding": 24
    },
    {
      "id": "database-cells-and-entries-steps",
      "kind": "screenshot",
      "src": "/documentation/es/database-entry.png",
      "alt": "Entrada de demostración con descripción, duración 2.5, casilla marcada y selección vacía.",
      "caption": "Abre una entrada para leer el texto completo y editar los valores según su tipo.",
      "revision": 6,
      "reviewed": true,
      "capturedAt": "2026-10-08",
      "viewport": [
        1178,
        429
      ],
      "theme": "light",
      "padding": 24
    },
    {
      "id": "change-a-database-schema-steps",
      "kind": "screenshot",
      "src": "/documentation/es/database-conversion-warning.png",
      "alt": "Advertencia de conversión: cambiar de Texto a Número borra una celda incompatible, con botones para cancelar o confirmar.",
      "caption": "Revisa el número real de celdas incompatibles antes de confirmar. Cancelar conserva los valores actuales.",
      "revision": 6,
      "reviewed": true,
      "capturedAt": "2026-10-08",
      "viewport": [
        456,
        282
      ],
      "theme": "light",
      "padding": 24
    },
    {
      "id": "import-a-database-steps",
      "kind": "screenshot",
      "src": "/documentation/es/database-import-review.png",
      "alt": "Revisión de un CSV local: dos páginas de entradas y dos columnas, con el botón Importar base de datos.",
      "caption": "Revisa las entradas analizadas y el número de columnas antes de importar a la base vacía.",
      "revision": 6,
      "reviewed": true,
      "capturedAt": "2026-10-08",
      "viewport": [
        744,
        511
      ],
      "theme": "light",
      "padding": 24
    }
  ],
  "requiredFigures": [
    "create-a-database-steps",
    "database-cells-and-entries-steps",
    "change-a-database-schema-steps",
    "import-a-database-steps"
  ]
}
---

Una base de datos combina una tabla de propiedades tipadas con una página completa por entrada. Puedes crear columnas y editar entradas manualmente o importar una base existente en un destino vacío. Antes de cambiar el tipo de una propiedad o eliminar una columna, revisa qué valores se sustituirán o perderán.

## Crear una base de datos y sus columnas {#create-a-database}

Como miembro del proyecto, abre Páginas, usa + y elige una base de datos. Una base nueva tiene el nombre de sus entradas y ninguna columna opcional. Su aviso «Nueva base de datos» ofrece configuración con Numo o importar una base existente. La configuración manual sigue disponible sin IA. Elegir la configuración con Numo abre una solicitud preparada con esta base de datos como contexto de página, una vez terminada su creación. Revisa y envía la solicitud para pedir la estructura que necesitas; abrir la conversación no completa la configuración. El trabajo real de IA necesita un proveedor configurado y uso disponible o una clave personal compatible. Comprueba el esquema y las entradas resultantes antes de utilizarlos.

Abre «Columnas» y elige «Añadir columna», o usa la columna + del extremo derecho. Nombra la columna y elige Texto, Número, Selección, Selección múltiple, Fecha de creación, Fecha, Personas o Casilla de verificación. Usa el selector de tipos con búsqueda para encontrarlo. Guarda, añade una entrada y verifica que la columna aparezca en la tabla y en la página de entrada.

### Elegir tipos y respetar límites {#database-types}

Una base admite hasta 30 columnas de propiedades además del nombre de entrada. Selección permite una opción; Selección múltiple permite varias, con hasta 100 opciones por columna. Las celdas de texto admiten 2.000 caracteres. Número acepta decimales con signo, punto o coma y rechaza letras. Fecha de creación es la marca temporal original de la entrada y no se puede editar.

Personas selecciona miembros del proyecto, no correos de cuentas arbitrarias. Los miembros recién mencionados pueden recibir notificaciones. Una entrada de base de datos también es una página completa con contenido normal, comentarios y adjuntos.

No hay fórmulas avanzadas, automatizaciones ni vistas adicionales de base de datos. Elige una propiedad de texto o un documento enlazado cuando los datos no encajen en un tipo admitido; no describas una fórmula no compatible como una columna funcional.


![Selector de tipo de columna con texto, número, selecciones, fechas, personas y casilla de verificación.](/documentation/es/database-property-types.png)

## Editar valores y páginas de entradas de una base de datos {#database-cells-and-entries}

Pulsa una celda de la tabla o la propiedad situada sobre el cuerpo de una entrada. Enter guarda, Escape cancela y Shift+Enter inserta una línea de texto. Salir del editor guarda. Un número inválido mantiene el editor abierto hasta corregirse; un fallo de guardado revierte el valor y muestra un error.

Usa una celda de Selección para una opción o Selección múltiple para varias. Busca opciones existentes o crea una nueva desde el menú. Abre «Editar opciones» para cambiar nombres o colores y después guarda el conjunto o cancela. Fecha, Personas y Casilla de verificación usan sus controles; Fecha de creación permanece en solo lectura.

### Abrir, seleccionar e insertar entradas {#entry-actions}

Abre una entrada para editar su página completa en un panel flotante. «Ampliar» la abre como página completa cuando terminan los guardados pendientes del documento. Si fallan, el panel permanece abierto para resolverlo. Una entrada vacía sigue en la base hasta que la elimines.

Usa las casillas de las filas para seleccionar y Shift-clic para un intervalo. El tirador abre acciones y permite reordenar entradas en orden manual. El + del margen inserta debajo de una entrada; Option/Alt inserta encima. La inserción adyacente vuelve al orden manual y quita filtros para que se vea la nueva entrada.

### Preferencias de visualización {#database-display}

Busca, filtra, ordena y oculta columnas en la vista de lista única. Estas preferencias se recuerdan en tu dispositivo; el orden manual se comparte con el árbol de páginas. Desplázate horizontalmente con un gesto de trackpad, Shift y rueda del ratón, pantalla táctil o barra inferior. Una vista previa de texto recortada no acorta el valor guardado. Las entradas con valores de columnas se pueden reordenar dentro de su base, pero no mover fuera de ella.


![Entrada de demostración con descripción, duración 2.5, casilla marcada y selección vacía.](/documentation/es/database-entry.png)

## Cambiar el esquema de una base de datos con seguridad {#change-a-database-schema}

En Columnas, utiliza el control del ojo para mostrar u ocultar propiedades. Haz clic en una cabecera para cambiar su nombre o arrastra las cabeceras para reordenarlas. La columna con el nombre de la entrada permanece en primer lugar. Las opciones de Selección o Selección múltiple se pueden editar desde el menú de la celda o desde Columnas; sus nombres y colores se guardan juntos.

Ocultar una columna cambia las preferencias de visualización y conserva sus valores. Eliminar una columna personalizada borra sus valores en todas las entradas y no se puede deshacer. Ten presente esta consecuencia antes de confirmar la eliminación.

### Convertir el tipo de una propiedad {#convert-column}

Elige Editar columna en una propiedad personalizada y selecciona el nuevo tipo. El diálogo convierte los valores existentes al guardar. Si algunos son incompatibles, la advertencia indica cuántas celdas quedarán vacías. Continúa solo si aceptas perder esos valores, o cancela para conservar el tipo anterior y todos los valores.

Al cambiar a Fecha de creación, se utiliza la fecha de creación original de cada entrada y aparece una advertencia antes de sustituir los valores existentes. Revisa entradas representativas después de la conversión, sobre todo cuando un número, una selección o una fecha puedan interpretarse de otra manera.

Las modificaciones del esquema realizadas por un agente utilizan la revisión actual de la base y un token de vista previa de la conversión. Los cambios simultáneos invalidan esa vista previa. Vuelve a leer el estado actual y a generar la vista previa en lugar de forzar una conversión antigua. Vaciar los valores incompatibles requiere una confirmación explícita.


![Advertencia de conversión: cambiar de Texto a Número borra una celda incompatible, con botones para cancelar o confirmar.](/documentation/es/database-conversion-warning.png)

## Importar una base de datos con el contenido de sus entradas {#import-a-database}

Crea una base de datos sin columnas opcionales ni entradas existentes. En el aviso de la nueva base, elige Importar una base existente. Sube un ZIP de Notion en formato Markdown & CSV con subpáginas, un CSV de una base de datos o un archivo de base de datos de minddy. Si el archivo contiene varias bases, selecciona la que quieres importar.

Antes de confirmar, revisa los nombres y tipos de columna propuestos y después el número de páginas. Numo puede sugerir tipos a partir de una muestra pequeña si la asistencia de importación está configurada; también puedes establecer la correspondencia manualmente. Las propiedades de origen no compatibles se conservan como texto. Los valores incompatibles bloquean la importación en lugar de borrarse sin aviso.

### Qué se conserva y qué debes comprobar {#database-import-result}

La importación incluye el contenido de las entradas, los documentos anidados y los archivos locales presentes en el archivo de importación. Un archivo de minddy también conserva el esquema exacto y los colores de las opciones, y reasigna los enlaces internos a páginas y archivos. Las personas pueden asociarse con miembros del proyecto de destino. Una exportación de Notion no contiene el esquema original, los colores de las opciones ni las definiciones de las fórmulas; esa información ausente no se puede recuperar.

Los archivos tienen un límite de 20 MB comprimidos, 50 MB descomprimidos y 1.000 páginas. Cada adjunto mantiene el límite de 10 MB de los archivos de página. La escritura de la base de datos es transaccional. Reintentar el mismo intento en el diálogo abierto mantiene su identificador de solicitud, por lo que un intento ya completado se devuelve sin duplicar filas. Cargar otro archivo o abrir un diálogo nuevo puede crear un intento distinto. Si el resultado de red es incierto, examina el destino antes de empezar de nuevo; una base ya poblada deja de cumplir el requisito de destino vacío.

Tras una importación correcta, comprueba algunas entradas, sus valores, las páginas anidadas y los adjuntos. Conserva el archivo original hasta terminar esta revisión. Si la importación falla, lee el primer error y corrige el formato o la correspondencia antes de reintentarlo. No rellenes manualmente la base de destino dando por hecho que después seguirá cumpliendo el requisito de estar vacía.


![Revisión de un CSV local: dos páginas de entradas y dos columnas, con el botón Importar base de datos.](/documentation/es/database-import-review.png)

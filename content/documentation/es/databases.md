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
  "revision": 17,
  "sourceRevision": 17,
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
      "content/knowledge/pages.md",
      "components/pages/database-setup-banner.tsx",
      "components/pages/database-property-dialogs.tsx",
      "lib/page-creation-settlement.ts",
      "components/pages/page-database-view.tsx",
      "components/pages/database-cell-editor.tsx",
      "components/pages/database-column-name.tsx",
      "components/pages/database-import-dialog.tsx",
      "lib/server/database-import.ts",
      "lib/database-import/types.ts",
      "lib/database-import/archive.ts",
      "components/pages/page-database-properties.tsx",
      "components/date-time-picker.tsx",
      "lib/page-databases.ts",
      "scripts/page-database-date-times.integration.test.mjs",
      "components/pages/page-promotion-context.tsx",
      "components/pages/page-promotion-context.test.tsx",
      "components/pages/database-view-strip.tsx",
      "lib/use-page-database-views.ts",
      "lib/server/page-database-views.ts"
    ]
  },
  "review": {
    "revision": 17,
    "fact": "agent:/root/min764 (database views section checked against components/pages/database-view-strip.tsx, components/pages/page-database-view.tsx, lib/use-page-database-views.ts and lib/server/page-database-views.ts: named views shared by the project, each with its own sort, filter and hidden columns, managed and reordered by writers, adjusted locally by readers; insertion clears the active view's filter; rest of the article unchanged since the MIN-747 review; no figure changed)",
    "language": "agent:/root/min764 (es changed passages on shared database views with catalog UI labels; equivalent meaning self-reviewed; agent review, not human acceptance)",
    "date": "2026-10-22"
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
      "id": "database-setup-cards-preview",
      "kind": "screenshot",
      "src": "/documentation/es/database-setup-cards.png",
      "alt": "Vista previa del componente con tarjetas para configurar una nueva base de datos con Numo o importar una existente.",
      "caption": "Sugerencias para una nueva base con datos de demostración. Elige Numo o la importación, o cierra las tarjetas para continuar manualmente.",
      "revision": 17,
      "reviewed": true,
      "capturedAt": "2026-10-11",
      "viewport": [
        712,
        240
      ],
      "deviceScaleFactor": 2,
      "theme": "light",
      "padding": 24
    },
    {
      "id": "create-a-database-steps",
      "kind": "screenshot",
      "src": "/documentation/es/database-property-types.png",
      "alt": "Selector de tipo de columna con un campo de búsqueda, texto, número, selecciones, fechas, personas y casilla de verificación.",
      "caption": "Elige un tipo que corresponda a los valores que deseas guardar.",
      "revision": 17,
      "reviewed": true,
      "capturedAt": "2026-10-18",
      "viewport": [
        448,
        357
      ],
      "theme": "light",
      "padding": 24,
      "deviceScaleFactor": 2
    },
    {
      "id": "database-cells-and-entries-steps",
      "kind": "screenshot",
      "src": "/documentation/es/database-entry.png",
      "alt": "Entrada de demostración con descripción, duración 2.5, casilla marcada y selección vacía.",
      "caption": "Abre una entrada para leer el texto completo y editar los valores según su tipo.",
      "revision": 17,
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
      "revision": 17,
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
      "revision": 17,
      "reviewed": true,
      "capturedAt": "2026-10-08",
      "viewport": [
        744,
        511
      ],
      "theme": "light",
      "padding": 24
    },
    {
      "id": "database-options-preview",
      "kind": "screenshot",
      "src": "/documentation/es/database-options.png",
      "alt": "Vista previa del componente Editar opciones con estados en español, flechas hacia arriba y abajo, papeleras y la explicación de la eliminación.",
      "caption": "Edita juntos los nombres, colores y orden de las opciones. La papelera retira una opción del borrador; Guardar aplica los cambios. Se muestran datos de demostración.",
      "revision": 17,
      "reviewed": true,
      "capturedAt": "2026-10-12",
      "viewport": [
        560,
        448
      ],
      "deviceScaleFactor": 2,
      "theme": "light",
      "padding": 24
    },
    {
      "id": "database-date-time-preview",
      "kind": "screenshot",
      "src": "/documentation/es/database-date-time.png",
      "alt": "Vista previa del selector de fecha con el 12 de octubre de 2026 seleccionado, Añade una hora activado y Hora en 14:30.",
      "caption": "Activa Añade una hora para introducir una hora. Esta vista previa del componente usa datos de demostración y la zona horaria del dispositivo.",
      "revision": 17,
      "reviewed": true,
      "capturedAt": "2026-10-12",
      "viewport": [
        324,
        444
      ],
      "deviceScaleFactor": 2,
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

La configuración de una nueva base de datos ofrece dos tarjetas: **Crear con Numo** para preparar la estructura e **Importar una base existente**. El control de cierre, con la etiqueta **Ocultar la ayuda de creación**, oculta estas sugerencias; la edición manual sigue disponible.

Como propietario o Miembro del proyecto, abre Páginas, usa + y elige una base de datos. Una base nueva tiene el nombre de sus entradas y ninguna columna opcional. Su aviso «Nueva base de datos» ofrece configuración con Numo o importar una base existente. La configuración manual sigue disponible sin IA. Elegir **Crear con Numo** abre una solicitud preparada con esta base de datos como contexto de página, una vez terminada su creación. Revisa y envía la solicitud para pedir la estructura que necesitas; abrir la conversación no completa la configuración. El trabajo real de IA necesita un proveedor configurado y uso disponible o una clave personal compatible. Comprueba el esquema y las entradas resultantes antes de utilizarlos.

Abre «Columnas» y elige «Añadir columna», o usa la columna + del extremo derecho. Nombra la columna y elige Texto, Número, Selección, Selección múltiple, Fecha de creación, Fecha, Personas o Casilla de verificación. Usa el selector de tipos con búsqueda para encontrarlo. Guarda, añade una entrada y verifica que la columna aparezca en la tabla y en la página de entrada.


![Vista previa del componente con tarjetas para configurar una nueva base de datos con Numo o importar una existente.](/documentation/es/database-setup-cards.png)

### Elegir tipos y respetar límites {#database-types}

Una base admite hasta 30 columnas de propiedades además del nombre de entrada. Selección permite una opción; Selección múltiple permite varias, con hasta 100 opciones por columna. Las celdas de texto admiten 2.000 caracteres. Número acepta decimales con signo, punto o coma y rechaza letras. Fecha de creación es la marca temporal original de la entrada y no se puede editar.

Personas selecciona miembros del proyecto, no correos de cuentas arbitrarias. Los miembros recién mencionados pueden recibir notificaciones. Una entrada de base de datos también es una página completa con contenido normal, comentarios y adjuntos.

No hay fórmulas avanzadas ni automatizaciones. Elige una propiedad de texto o un documento enlazado cuando los datos no encajen en un tipo admitido; no describas una fórmula no compatible como una columna funcional.


![Selector de tipo de columna con un campo de búsqueda, texto, número, selecciones, fechas, personas y casilla de verificación.](/documentation/es/database-property-types.png)

## Editar valores y páginas de entradas de una base de datos {#database-cells-and-entries}

En el editor de opciones, añade una opción debajo de las filas existentes, incluso si la lista está vacía. Dale a cada opción un nombre distinto y no vacío, y guarda. Funciona tanto para selección simple como múltiple.

Pulsa una celda de la tabla o la propiedad situada sobre el cuerpo de una entrada. Enter guarda, Escape cancela y Shift+Enter inserta una línea de texto. Salir del editor guarda. Un número inválido mantiene el editor abierto hasta corregirse; un fallo de guardado revierte el valor y muestra un error.

Usa una celda de Selección para una opción o Selección múltiple para varias. Busca opciones existentes o crea una nueva desde el menú. Abre «Editar opciones» desde una celda, o desde el menú del encabezado de una columna de Selección o Selección múltiple (haz clic en el nombre de la columna), para cambiar nombres o colores y después guarda el conjunto o cancela. Fecha, Personas y Casilla de verificación usan sus controles; Fecha de creación permanece en solo lectura.

Las opciones nuevas reciben un color aleatorio de la paleta que aún no se usa en la columna, tanto si las creas desde una celda como en el diálogo de opciones. Una vez usados los diez colores, pueden repetirse. Puedes seguir eligiendo un color manualmente.

En «Editar opciones», usa las flechas hacia arriba y abajo junto a una fila para reordenar las opciones. Usa su papelera para eliminar una opción. Guardar aplica los nombres, colores, orden y eliminaciones juntos; si eliminaste opciones, primero las enumera y pide confirmar con **Eliminar y guardar**, porque la eliminación no se puede deshacer. Una opción eliminada se retira de todas las entradas que la usan, incluidas las de la papelera; las demás opciones seleccionadas se conservan. Cancelar descarta los cambios del borrador.

Elige un día en Fecha. Para incluir una hora, activa Añade una hora y rellena Hora. El valor se guarda al editar y el selector permanece abierto. Los valores con hora se muestran en la zona horaria de tu dispositivo, incluida la medianoche. Al desactivar Añade una hora, el día mostrado se conserva como fecha sin hora. Los filtros de fecha coinciden con el día mostrado.

![Vista previa del componente Editar opciones con estados en español, flechas hacia arriba y abajo, papeleras y la explicación de la eliminación.](/documentation/es/database-options.png)

![Vista previa del selector de fecha con el 12 de octubre de 2026 seleccionado, Añade una hora activado y Hora en 14:30.](/documentation/es/database-date-time.png)

### Abrir, seleccionar e insertar entradas {#entry-actions}

El contenido de una entrada vacía muestra un texto indicativo para localizar el área de escritura. La duplicación desde las acciones de una fila o una selección de varias filas pide confirmación antes de crear las copias. Mover las entradas a la papelera también pide confirmación y permite recuperarlas, sin eliminarlas definitivamente.

Abre una entrada para editar su página completa en un panel flotante. «Ampliar» la abre como página completa cuando terminan los guardados pendientes del documento. Si fallan, el panel permanece abierto para resolverlo. Una entrada vacía sigue en la base hasta que la elimines.

Usa las casillas de las filas para seleccionar y Shift-clic para un intervalo. El tirador abre acciones y permite reordenar entradas en orden manual. El + del margen inserta debajo de una entrada; Option/Alt inserta encima. La inserción adyacente quita el filtro de la vista activa para que se vea la nueva entrada.

Desde el menú del tirador de una sola entrada, el propietario o un Miembro puede elegir **Convertir en incidencia** para que Numo convierta esa entrada, su contenido y sus propiedades en una incidencia. La entrada permanece en la base de datos. La acción no aparece cuando el menú se aplica a varias filas seleccionadas: no hay conversión masiva, así que convierte cada entrada por separado. La [guía de páginas](/es/documentacion/pages#promote-page-to-issue) describe las preguntas de Numo y qué hacer si la entrada no se puede guardar antes.

### Vistas de la base de datos {#database-display}

Una base de datos muestra sus entradas mediante vistas, listadas encima de la tabla. Cada vista conserva su propia ordenación, su filtro y sus columnas ocultas, y todos los miembros del proyecto ven las mismas vistas. El propietario o un Miembro añade una vista con **Nueva vista** (+), que parte de la vista en pantalla, cambia el nombre de la vista activa o la borra desde su menú de opciones (⋯) con **Cambiar el nombre de vista** o **Borrar vista**, y arrastra las vistas para reordenarlas. Los cambios de ordenación, filtro y columnas se guardan en la vista activa para todos. Una base de datos conserva al menos una vista; antes de su primer cambio muestra la vista **Tabla** predeterminada. Los lectores cambian de vista y pueden ajustar una para sí mismos hasta que salen de la página. Tu navegador recuerda la última vista abierta; la búsqueda nunca se guarda. El orden manual se comparte con el árbol de páginas. Desplázate horizontalmente con un gesto de trackpad, Shift y rueda del ratón, pantalla táctil o barra inferior. Una vista previa de texto recortada no acorta el valor guardado. Las entradas con valores de columnas se pueden reordenar dentro de su base, pero no mover fuera de ella.


![Entrada de demostración con descripción, duración 2.5, casilla marcada y selección vacía.](/documentation/es/database-entry.png)

## Cambiar el esquema de una base de datos con seguridad {#change-a-database-schema}

El arrastre de una columna empieza después de mover el puntero y se mantiene horizontal. El cursor de agarre aparece solo durante el arrastre; un clic normal sigue abriendo las acciones de la columna. Con el foco en el encabezado de una columna, Intro o Espacio abre sus acciones. Pulsa F8 para iniciar la reordenación, usa Izquierda o Derecha y pulsa Intro para confirmar o Escape para cancelar.

En Columnas, utiliza el control del ojo para mostrar u ocultar propiedades. Haz clic en una cabecera para cambiar su nombre o arrastra las cabeceras para reordenarlas. La columna con el nombre de la entrada permanece en primer lugar. Las opciones de Selección o Selección múltiple se pueden editar desde el menú de la celda o desde Columnas; sus nombres y colores se guardan juntos.

Ocultar una columna cambia las preferencias de visualización y conserva sus valores. Eliminar una columna personalizada borra sus valores en todas las entradas y no se puede deshacer. Ten presente esta consecuencia antes de confirmar la eliminación.

### Convertir el tipo de una propiedad {#convert-column}

Elige Editar columna en una propiedad personalizada y selecciona el nuevo tipo. El diálogo convierte los valores existentes al guardar. Si algunos son incompatibles, la advertencia indica cuántas celdas quedarán vacías. Continúa solo si aceptas perder esos valores, o cancela para conservar el tipo anterior y todos los valores.

Al cambiar a Fecha de creación, se utiliza la fecha de creación original de cada entrada y aparece una advertencia antes de sustituir los valores existentes. Revisa entradas representativas después de la conversión, sobre todo cuando un número, una selección o una fecha puedan interpretarse de otra manera.

Las modificaciones del esquema realizadas por un agente utilizan la revisión actual de la base y un token de vista previa de la conversión. Los cambios simultáneos invalidan esa vista previa. Vuelve a leer el estado actual y a generar la vista previa en lugar de forzar una conversión antigua. Vaciar los valores incompatibles requiere una confirmación explícita.


![Advertencia de conversión: cambiar de Texto a Número borra una celda incompatible, con botones para cancelar o confirmar.](/documentation/es/database-conversion-warning.png)

## Importar una base de datos con el contenido de sus entradas {#import-a-database}

Crea una base de datos sin columnas opcionales ni entradas existentes. En el aviso de la nueva base, elige **Importar una base existente**. Sube un ZIP de Notion en formato Markdown & CSV con subpáginas, un CSV de una base de datos o un archivo de base de datos de minddy. Si el archivo contiene varias bases, selecciona la que quieres importar.

Antes de confirmar, revisa los nombres y tipos de columna propuestos y después el número de páginas. Numo puede sugerir tipos a partir de una muestra pequeña si la asistencia de importación está configurada; también puedes establecer la correspondencia manualmente. Las propiedades de origen no compatibles se conservan como texto. Los valores incompatibles bloquean la importación en lugar de borrarse sin aviso.

### Qué se conserva y qué debes comprobar {#database-import-result}

La importación incluye el contenido de las entradas, los documentos anidados y los archivos locales presentes en el archivo de importación. Un archivo de minddy también conserva el esquema exacto y los colores de las opciones, y reasigna los enlaces internos a páginas y archivos. Las personas pueden asociarse con miembros del proyecto de destino. Una exportación de Notion no contiene el esquema original, los colores de las opciones ni las definiciones de las fórmulas; esa información ausente no se puede recuperar.

Los archivos tienen un límite de 20 MB comprimidos, 50 MB descomprimidos, 1.000 páginas y 100 adjuntos. Cada adjunto mantiene el límite de 10 MB de los archivos de página. La escritura de la base de datos es transaccional. Reintentar el mismo intento en el diálogo abierto mantiene su identificador de solicitud, por lo que un intento ya completado se devuelve sin duplicar filas. Cargar otro archivo o abrir un diálogo nuevo puede crear un intento distinto. Si el resultado de red es incierto, examina el destino antes de empezar de nuevo; una base ya poblada deja de cumplir el requisito de destino vacío.

Tras una importación correcta, comprueba algunas entradas, sus valores, las páginas anidadas y los adjuntos. Conserva el archivo original hasta terminar esta revisión. Si la importación falla, lee el primer error y corrige el formato o la correspondencia antes de reintentarlo. No rellenes manualmente la base de destino dando por hecho que después seguirá cumpliendo el requisito de estar vacía.


![Revisión de un CSV local: dos páginas de entradas y dos columnas, con el botón Importar base de datos.](/documentation/es/database-import-review.png)


## Rutinas para nuevas entradas {#entry-routines}

El propietario del proyecto puede elegir esta base como desencadenante en [Rutinas](/docs/scheduled-routines#conditions). Las condiciones usan las propiedades tipadas de la entrada. Una entrada vacía puede esperar a que se rellenen. Creación, duplicación, importación de base y traslado permitido hacia la base cuentan como llegadas; restaurar no. Eliminar una propiedad referenciada o cambiar su tipo requiere corregir el filtro de la rutina.

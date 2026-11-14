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
  "revision": 21,
  "sourceRevision": 20,
  "owner": "@mangue-dev",
  "updatedAt": "2026-11-14",
  "compatibility": {
    "version": "0.30.0 (MIN-794 release review)",
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
      "lib/server/page-database-views.ts",
      "components/pages/database-table-scroll.tsx",
      "components/ui/checkbox.tsx",
      "lib/server/database-view-tools.ts",
      "lib/page-database-filters.ts",
      "components/pages/database-filter-editor.tsx",
      "supabase/migrations/20270109200092_page_database_views_realtime.sql",
      "components/pages/page-peek-panel.tsx",
      "components/pages/pages-shell.tsx",
      "components/global-page-panel.tsx",
      "lib/page-database-number.ts",
      "lib/page-database-schema-patch.ts",
      "lib/use-page-database.ts",
      "lib/undo/undo-context.tsx",
      "components/pages/database-choice.tsx",
      "components/pages/page-document-actions.tsx",
      "lib/server/database-tool-schema.ts",
      "supabase/migrations/20270109200126_page_database_metadata_recurrence_formats.sql"
    ]
  },
  "review": {
    "revision": 21,
    "fact": "agent:claude-code (MIN-990 changes mirrored from en revision 20; labels checked against messages/es.json; agent review, not human acceptance)",
    "language": "agent:claude-code (es translation of the changed passages with catalog UI labels; self-reviewed; agent review, not human acceptance)",
    "date": "2026-11-14"
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
      "revision": 21,
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
      "alt": "Selector de tipo de columna con un campo de búsqueda, texto, número, selecciones, fecha, personas, casilla de verificación y los cuatro tipos de solo lectura.",
      "caption": "Elige un tipo que corresponda a los valores que deseas guardar.",
      "revision": 21,
      "reviewed": true,
      "capturedAt": "2026-11-14",
      "viewport": [
        448,
        453
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
      "revision": 21,
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
      "revision": 21,
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
      "revision": 21,
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
      "alt": "Vista previa del componente Editar opciones con estados en español, tiradores de arrastre, papeleras y la explicación de la eliminación.",
      "caption": "Edita juntos los nombres, colores y orden de las opciones. Arrastra un tirador para reordenar; la papelera retira una opción del borrador; Guardar aplica los cambios. Se muestran datos de demostración.",
      "revision": 21,
      "reviewed": true,
      "capturedAt": "2026-11-14",
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
      "alt": "Vista previa del selector de fecha con el 24 de julio de 2026 seleccionado, Añade una hora activado y Hora en 02:00 AM.",
      "caption": "Activa Añade una hora para introducir una hora. Esta vista previa del componente usa datos de demostración y la zona horaria del dispositivo.",
      "revision": 21,
      "reviewed": true,
      "capturedAt": "2026-11-04",
      "viewport": [
        324,
        498
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

Abre «Columnas» y elige «Añadir columna», o usa la columna + del extremo derecho. Nombra la columna y elige Texto, Número, Selección, Selección múltiple, Fecha, Personas, Casilla de verificación, Fecha de creación, Última edición, Creado por o Última edición por. Usa el selector de tipos con búsqueda para encontrarlo. Guarda, añade una entrada y verifica que la columna aparezca en la tabla y en la página de entrada.


![Vista previa del componente con tarjetas para configurar una nueva base de datos con Numo o importar una existente.](/documentation/es/database-setup-cards.png)

### Elegir tipos y respetar límites {#database-types}

Una base admite hasta 30 columnas de propiedades además del nombre de entrada. Selección permite una opción; Selección múltiple permite varias, con hasta 100 opciones por columna. Las celdas de texto admiten 2.000 caracteres. Número acepta una cifra escrita con punto o coma, con separadores de miles, un símbolo de moneda o un signo de porcentaje, y rechaza letras. También acepta un cálculo: escribe `14 + 2` y la celda guarda 16. Los cálculos admiten `+`, `-`, `*`, `/`, `^` y paréntesis, y un porcentaje dentro de un cálculo se aplica a lo que lo precede, de modo que `80 + 20 %` da 96.

Una columna de Número adapta su presentación a lo que escribes. Escribe un importe con un símbolo o un código de moneda, por ejemplo `12 €`, `$40` o `40 CHF`, y toda la columna muestra importes en esa moneda. Escribe una cifra seguida del signo de porcentaje, por ejemplo `25 %`, y la columna muestra porcentajes. Una cifra simple o un cálculo dejan la columna como está. Para volver a las cifras simples, abre el menú del encabezado de la columna y elige **Mostrar como número simple**. El formato cambia cómo se muestran los valores y nunca el número guardado. Un número simple se muestra con separadores de miles a partir de cinco cifras, así que un año se sigue leyendo 2026.

Cuatro tipos de columna se rellenan solos a partir de cada entrada y no se pueden editar: Fecha de creación y Última edición muestran cuándo se creó la entrada y cuándo se modificó por última vez; Creado por y Última edición por muestran quién lo hizo. Un cambio hecho por Numo o por un agente MCP se muestra como hecho por minddy.

Personas selecciona miembros del proyecto, no correos de cuentas arbitrarias. Los miembros recién mencionados pueden recibir notificaciones. Una entrada de base de datos también es una página completa con contenido normal, comentarios y adjuntos.

No hay fórmulas avanzadas ni automatizaciones. Elige una propiedad de texto o un documento enlazado cuando los datos no encajen en un tipo admitido; no describas una fórmula no compatible como una columna funcional.


![Selector de tipo de columna con un campo de búsqueda, texto, número, selecciones, fecha, personas, casilla de verificación y los cuatro tipos de solo lectura.](/documentation/es/database-property-types.png)

## Editar valores y páginas de entradas de una base de datos {#database-cells-and-entries}

En el editor de opciones, añade una opción debajo de las filas existentes, incluso si la lista está vacía. Dale a cada opción un nombre distinto y no vacío, y guarda. Funciona tanto para selección simple como múltiple.

Pulsa una celda de la tabla o la propiedad situada sobre el cuerpo de una entrada. Enter guarda, Escape cancela y Shift+Enter inserta una línea de texto. Salir del editor guarda. Un número inválido mantiene el editor abierto hasta corregirse; un fallo de guardado revierte el valor y muestra un error.

Usa una celda de Selección para una opción o Selección múltiple para varias. Busca opciones existentes o crea una nueva desde el menú. Abre «Editar opciones» desde una celda, o desde el menú del encabezado de una columna de Selección o Selección múltiple (haz clic en el nombre de la columna), para cambiar nombres o colores y después guarda el conjunto o cancela. Fecha, Personas y Casilla de verificación usan sus controles; Fecha de creación, Última edición, Creado por y Última edición por permanecen en solo lectura.

Las opciones nuevas reciben un color aleatorio de la paleta que aún no se usa en la columna, tanto si las creas desde una celda como en el diálogo de opciones. Una vez usados los diez colores, pueden repetirse. Puedes seguir eligiendo un color manualmente.

En «Editar opciones», arrastra el tirador situado al principio de una fila para reordenar las opciones. Con el teclado, pon el foco en el tirador, pulsa Espacio, mueve la opción con las flechas Arriba y Abajo y vuelve a pulsar Espacio para soltarla; Escape cancela. Usa la papelera de la fila para eliminar una opción. Guardar aplica los nombres, colores, orden y eliminaciones juntos; si eliminaste opciones, primero las enumera y pide confirmar con **Eliminar y guardar**. Una notificación ofrece entonces **Deshacer**, que recupera las opciones con los valores que las usaban. Una opción eliminada se retira de todas las entradas que la usan, incluidas las de la papelera; las demás opciones seleccionadas se conservan. Cancelar descarta los cambios del borrador.

Elige un día en Fecha. Para incluir una hora, activa Añade una hora y rellena Hora. El valor se guarda al editar y el selector permanece abierto. Los valores con hora se muestran en la zona horaria de tu dispositivo, incluida la medianoche. Al desactivar Añade una hora, el día mostrado se conserva como fecha sin hora. Los filtros de fecha coinciden con el día mostrado.

Una fecha puede repetirse, como la fecha límite de una incidencia. En el selector de fecha, elige **Recurrente** en lugar de **Una vez** y después un ritmo: cada día, semana, mes o año. La celda muestra un icono de repetición y la próxima ocurrencia, que avanza sola cuando el día ha pasado; la ordenación y los filtros usan esa ocurrencia. Elige **Una vez** para volver a tener una sola fecha.

![Vista previa del componente Editar opciones con estados en español, tiradores de arrastre, papeleras y la explicación de la eliminación.](/documentation/es/database-options.png)

![Vista previa del selector de fecha con el 24 de julio de 2026 seleccionado, Añade una hora activado y Hora en 02:00 AM.](/documentation/es/database-date-time.png)

### Abrir, seleccionar e insertar entradas {#entry-actions}

El contenido de una entrada vacía muestra un texto indicativo para localizar el área de escritura. La duplicación desde las acciones de una fila o una selección de varias filas pide confirmación antes de crear las copias. Mover las entradas a la papelera también pide confirmación y permite recuperarlas, sin eliminarlas definitivamente.

Abre una entrada para editar su página completa en un panel flotante. «Ampliar» la abre como página completa cuando terminan los guardados pendientes del documento. Si fallan, el panel permanece abierto para resolverlo. El encabezado del panel también tiene el menú **Opciones de la página** (`…`) de la entrada, entre «Ampliar» y cerrar; mover la entrada a la papelera desde ahí cierra el panel y deja la tabla en su sitio. Una entrada vacía sigue en la base hasta que la elimines.

Usa las casillas de las filas para seleccionar y Shift-clic para un intervalo. La descripción emergente de cada casilla indica **Seleccionar** o **Deseleccionar**. La casilla del encabezado (**Seleccionar todas las entradas**, o **Deseleccionar todo** cuando todas lo están) muestra un guion mientras solo una parte de las entradas está seleccionada y una marca cuando lo están todas; al hacer clic en ella desde una selección parcial, se seleccionan todas las entradas. Pasa el puntero sobre una fila para mostrar su margen: el tirador abre el menú de la entrada y permite reordenar entradas en orden manual, y el + inserta debajo de la entrada; Option/Alt inserta encima. La inserción adyacente quita los filtros de la vista activa para que se vea la nueva entrada. Las entradas marcadas abren la barra de selección flotante: elige **Acciones**, o pulsa Command+K en macOS o Ctrl+K en otros sistemas, para convertirlas en incidencias, **Duplicar** o **Mover a la papelera**, cada una tras su confirmación, y **Pregúntale a Numo** abre Numo con todas las entradas marcadas en su contexto. En una pantalla táctil, las filas no tienen margen y sus casillas siguen visibles; la misma barra de selección actúa sobre las entradas marcadas, y mover una entrada hacia arriba o hacia abajo no está disponible allí.

El menú del tirador de una sola entrada empieza por **Abrir página** y después ofrece lo mismo que la barra lateral para cualquier página: **Añadir una subpágina**, **Añadir a favoritos**, **Copiar**, **Convertir en incidencia**, **Publicar…** y **Exportar**, seguidos de **Duplicar** y **Mover a la papelera**. Un lector ve **Abrir página**, **Copiar** y **Exportar**. Cuando el menú se aplica a varias filas seleccionadas, conserva **Duplicar** y **Mover a la papelera**.

Desde ese menú, el propietario o un Miembro puede elegir **Convertir en incidencia** para que Numo convierta esa entrada, su contenido y sus propiedades en una incidencia. La entrada permanece en la base de datos. Cuando el menú se aplica a varias filas seleccionadas, conviértelas desde **Acciones** en la barra de selección: una sola conversación con Numo crea una incidencia por entrada. La [guía de páginas](/es/documentacion/pages#promote-page-to-issue) describe las preguntas de Numo y qué hacer si la entrada no se puede guardar antes.

### Vistas de la base de datos {#database-display}

Una base de datos muestra sus entradas mediante vistas, listadas encima de la tabla. Cada vista conserva su propia ordenación, su filtro y sus columnas ocultas, y todos los miembros del proyecto ven las mismas vistas. El propietario o un Miembro añade una vista con **Nueva vista** (+), que parte de la vista en pantalla, hace clic derecho en una vista para elegir **Cambiar el nombre de la vista** o **Eliminar vista**, y arrastra las vistas para reordenarlas. Los cambios de ordenación, filtro y columnas se guardan en la vista activa para todos. Una base de datos conserva al menos una vista; antes de su primer cambio muestra la vista **Tabla** predeterminada. Los lectores cambian de vista y pueden ajustar una para sí mismos hasta que salen de la página. Tu navegador recuerda la última vista abierta; la búsqueda nunca se guarda. El orden manual se comparte con el árbol de páginas. Desplázate horizontalmente con un gesto de trackpad, Shift y rueda del ratón o la barra de desplazamiento de la parte inferior de la ventana. Una pantalla táctil no muestra esa barra: desliza la tabla con el dedo. Una vista previa de texto recortada no acorta el valor guardado. Las entradas con valores de columnas se pueden reordenar dentro de su base, pero no mover fuera de ella. Numo puede listar las vistas de una base de datos y, cuando se lo pides, crearlas, cambiarles el nombre, reordenarlas o eliminarlas (nunca la última), o cambiar su ordenación, sus filtros (todos o cualquiera) y sus columnas ocultas. En la página de una base de datos, Numo entiende «una vista» como una vista de la base de datos, no del tablero de incidencias. El orden de las columnas no forma parte de una vista: pertenece al esquema de la base de datos. Los clientes de minddy MCP no pueden gestionar las vistas.

Abre **Ordenar por** para elegir una columna y después un sentido formulado según lo que contiene la columna: **De la A a la Z** o **De la Z a la A** para texto y personas, **Primera opción primero** o **Última opción primero** para una columna de Selección o Selección múltiple, que se ordena según el orden de sus opciones, **Menor primero** o **Mayor primero** para un número, **Más antiguo primero** o **Más reciente primero** para una fecha, **Sin marcar primero** o **Marcadas primero** para una casilla de verificación, y **De arriba abajo** o **De abajo arriba** para el orden manual. Las listas de columnas de **Ordenar por** y **Filtrar** muestran el icono del tipo de cada columna.

Arrastra el borde derecho del encabezado de una columna para ajustar su ancho; haz doble clic en ese borde para volver al ancho predeterminado. Bajo una columna de Número, pasa el cursor por la parte inferior de la tabla y elige **Calcular** para mostrar la **Suma**, el **Promedio**, el **Mínimo**, el **Máximo** o el **Recuento** de las entradas que conserva la vista. Los anchos y los cálculos se guardan con la vista, igual que su orden y sus filtros.

Abre **Filtrar** para crear una lista de condiciones con **Añadir un filtro**; **Quitar este filtro** elimina una. Cada condición elige una columna, una condición y un valor, y las condiciones dependen del tipo de columna. Texto ofrece contiene, no contiene, es, no es, está vacío y no está vacío. Número ofrece es, no es, mayor que, menor que, está vacío y no está vacío. Selección ofrece es, no es, está vacío y no está vacío. Selección múltiple y Personas ofrecen contiene, no contiene, está vacío y no está vacío. Fecha, Fecha de creación y Última edición ofrecen es el, es posterior a, es anterior a, está vacío y no está vacío. Creado por y Última edición por ofrecen es y no es, con un miembro del proyecto. Casilla de verificación coincide con **Marcada** o **Sin marcar**. Una condición sin valor todavía no filtra. Con dos o más condiciones, elige **Todos los filtros** para conservar las entradas que cumplen todas, o **Cualquier filtro** para las que cumplen al menos una. Una vista admite hasta 10 condiciones; una vista guardada antes con un solo filtro lo conserva.

Las vistas se actualizan en directo: una vista que crea o cambia un compañero de equipo o Numo aparece sin recargar la página. Mientras una base de datos no tenga ninguna vista guardada, haz clic derecho en su vista predeterminada para elegir **Cambiar el nombre de la vista**: al cambiarle el nombre se guarda como vista con nombre con los ajustes actuales, y **Eliminar vista** sigue sin estar disponible.

En un teléfono, elige una vista en el desplegable encima de la tabla; su menú ofrece **Nueva vista**, **Cambiar el nombre de la vista** y **Eliminar vista**. La barra de herramientas solo muestra la búsqueda, **Ajustes de la vista** y **Nuevo**. **Ajustes de la vista** abre una hoja con **Ordenar por**, **Filtrar** y **Columnas**, y cada una abre su propia hoja. La búsqueda despliega un campo bajo la barra de herramientas, con un botón para cerrarlo. La tabla ocupa todo el ancho, con filas más altas y casillas siempre visibles. Las celdas de texto y número se abren en una hoja inferior con un botón **Guardar**, como ya hacían las selecciones, las personas y las fechas.

Una base de datos abierta en el panel lateral, desde una mención, un enlace inverso, una página adjunta a una incidencia o un enlace en un comentario, también usa esta barra de herramientas compacta en el ordenador: el desplegable de vistas, cuyo menú ofrece **Nueva vista**, **Cambiar el nombre de la vista** y **Eliminar vista**, y después la búsqueda, **Ajustes de la vista** y **Nuevo**. La búsqueda abre un campo en una ventana emergente. **Ajustes de la vista** abre un menú: **Ordenar por** muestra las columnas y el sentido del orden en un submenú, mientras que **Filtrar** y **Columnas** abren cada uno su ventana emergente bajo el botón. La tabla se desplaza en horizontal dentro del panel, con su propia barra de desplazamiento. Una entrada abierta desde esa tabla ocupa su lugar en el panel; **Volver**, arriba a la izquierda del panel, regresa a la tabla, y **Ampliar** abre como página completa lo que muestra el panel.


![Entrada de demostración con descripción, duración 2.5, casilla marcada y selección vacía.](/documentation/es/database-entry.png)

### Deshacer y rehacer {#database-undo}

Pulsa ⌘Z (Ctrl+Z en Windows y Linux) para deshacer tu último cambio en una base de datos, y ⌘⇧Z (Ctrl+Shift+Z) para rehacerlo. Esto incluye el valor de una celda, una columna añadida, renombrada, reordenada, convertida a otro tipo o eliminada, las opciones editadas, una entrada creada, duplicada, reordenada o movida a la papelera, y los ajustes de una vista: orden, filtros, columnas ocultas, anchos de columna y cálculos. Deshacer la eliminación de una columna o de una opción restaura los valores que eliminó. Un cambio aplicado a varias entradas seleccionadas se deshace en un solo paso.

El historial pertenece a la pestaña abierta y contiene tus propios cambios: se pierde al recargar la página y no incluye los cambios hechos por compañeros de equipo, Numo o un agente MCP. Mientras el cursor está en un campo de texto o en el cuerpo de una página, las mismas teclas deshacen lo escrito. Si otra persona cambió el mismo valor entretanto, la acción de deshacer se rechaza y la tabla muestra el valor actual.

## Cambiar el esquema de una base de datos con seguridad {#change-a-database-schema}

El arrastre de una columna empieza después de mover el puntero y se mantiene horizontal. El cursor de agarre aparece solo durante el arrastre; un clic normal sigue abriendo las acciones de la columna. Con el foco en el encabezado de una columna, Intro o Espacio abre sus acciones. Pulsa F8 para iniciar la reordenación, usa Izquierda o Derecha y pulsa Intro para confirmar o Escape para cancelar.

En Columnas, utiliza el control del ojo para mostrar u ocultar propiedades y arrastra el tirador de una fila de esa lista para reordenar las columnas. Con el teclado, pon el foco en el tirador, pulsa Espacio, mueve la columna con las flechas Arriba y Abajo y vuelve a pulsar Espacio para soltarla; Escape cancela. Haz clic o clic derecho en una cabecera para abrir su menú, por ejemplo para cambiar el nombre de la columna, o arrastra las cabeceras para reordenarlas. La columna con el nombre de la entrada permanece en primer lugar. Las opciones de Selección o Selección múltiple se pueden editar desde el menú de la celda o desde Columnas; sus nombres y colores se guardan juntos.

Ocultar una columna cambia las preferencias de visualización y conserva sus valores. Para eliminar una columna personalizada, elige **Eliminar columna** en el menú de su cabecera o su botón de papelera en Columnas; ambos piden confirmación. La eliminación borra sus valores en todas las entradas. Una notificación ofrece entonces **Deshacer**, y [deshacer](#database-undo) recupera la columna y sus valores mientras la página sigue abierta; pasado ese momento, la eliminación es definitiva.

### Convertir el tipo de una propiedad {#convert-column}

Elige Editar columna en una propiedad personalizada y selecciona el nuevo tipo. El diálogo convierte los valores existentes al guardar. Si algunos son incompatibles, la advertencia indica cuántas celdas quedarán vacías. Continúa solo si aceptas perder esos valores, o cancela para conservar el tipo anterior y todos los valores.

Al cambiar a Fecha de creación, Última edición, Creado por o Última edición por, los valores existentes se sustituyen por lo que minddy registra para cada entrada, y aparece una advertencia antes de hacerlo. Revisa entradas representativas después de la conversión, sobre todo cuando un número, una selección o una fecha puedan interpretarse de otra manera.

Numo y los agentes MCP leen y escriben las mismas columnas: pueden añadir las columnas de solo lectura, definir un formato de número y escribir una fecha recurrente. Las modificaciones del esquema realizadas por un agente utilizan la revisión actual de la base y un token de vista previa de la conversión. Los cambios simultáneos invalidan esa vista previa. Vuelve a leer el estado actual y a generar la vista previa en lugar de forzar una conversión antigua. Vaciar los valores incompatibles requiere una confirmación explícita.


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

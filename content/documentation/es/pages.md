---
{
  "id": "pages",
  "locale": "es",
  "title": "Páginas",
  "summary": "Crea y edita páginas de proyecto, gestiona la colaboración, los archivos y el historial, y publica, exporta o imprime documentos.",
  "topic": "Páginas y bases de datos",
  "type": "guide",
  "audiences": [
    "member",
    "visitor"
  ],
  "workflows": [
    "P01",
    "P02",
    "P03",
    "P04",
    "P05",
    "P06",
    "P07"
  ],
  "visibility": "public",
  "status": "published",
  "revision": 22,
  "sourceRevision": 21,
  "owner": "@mangue-dev",
  "updatedAt": "2026-10-29",
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
      "components/pages/page-create-menu.tsx",
      "components/pages/page-tree.tsx",
      "components/pages/page-editor.tsx",
      "components/pages/page-slash-command.tsx",
      "components/pages/page-presence.tsx",
      "components/pages/page-conflict-banner.tsx",
      "lib/pages-merge.ts",
      "components/pages/page-view.tsx",
      "components/pages/page-uploads.tsx",
      "lib/server/page-files.ts",
      "lib/server/page-publication.ts",
      "components/pages/page-history.tsx",
      "lib/server/page-versions.ts",
      "components/pages/page-publish-dialog.tsx",
      "app/p/[token]/page.tsx",
      "components/pages/page-document-actions.tsx",
      "lib/server/pages-export.ts",
      "components/pages/page-print-view.tsx",
      "components/file-viewer.tsx",
      "components/image-viewer.tsx",
      "docs/security/project-roles.md",
      "lib/project-roles.ts",
      "lib/use-semantic-mentions.ts",
      "components/markdown-mention.tsx",
      "components/editor/comment-editor.tsx",
      "docs/page-collaboration.md",
      "lib/use-page-collaboration.ts",
      "lib/page-collaboration-stream.ts",
      "components/pages/page-promotion-context.tsx",
      "components/pages/page-promotion-context.test.tsx",
      "components/pages/page-database-view.tsx",
      "lib/server/page-database-views.ts",
      "components/pages/page-comment-bubble.tsx",
      "components/editor/mobile-editor-toolbar.tsx",
      "components/editor/rich-editor.tsx",
      "components/pages/page-extensions.ts",
      "components/pages/blocks/image.ts",
      "lib/pages-markdown.ts",
      "components/pages/blocks/subpage.ts",
      "lib/server/pages.ts",
      "lib/pages-subpage.ts",
      "lib/pages-export.ts",
      "components/public-page-body.tsx",
      "components/pages/page-comment-dialog.tsx",
      "lib/keyboard/shortcuts.ts",
      "components/editor/find-bar.tsx",
      "components/editor/find-replace.ts",
      "lib/keyboard/find-shortcut.ts",
      "components/pages/blocks/math.ts",
      "components/editor/math-edit-menu.tsx",
      "components/code-block-lowlight.ts",
      "app/globals.css",
      "components/pages/page-peek-panel.tsx",
      "components/global-page-panel.tsx",
      "components/pages/pages-shell.tsx",
      "components/pages/block-gutter.tsx",
      "components/editor/suggestion-menu.tsx",
      "components/editor/suggestion-chip.ts",
      "components/editor/suggestion-menu.test.tsx",
      "components/editor/block-selection.ts",
      "components/editor/document-editor.tsx",
      "app/tokens.css",
      "components/pages/block-actions.ts",
      "lib/selection-menu-visibility.test.ts",
      "lib/mention-menu.ts",
      "components/pages/block-menu.tsx",
      "lib/action-menu-search.ts"
    ]
  },
  "review": {
    "revision": 22,
    "fact": "agent:claude-code (block menu search field reaching every action, block types and colors included, with submenu entries shown behind their path such as Turn into › Heading 1 (MIN-845), checked against components/pages/block-menu.tsx, components/issue-context-menu.tsx and lib/action-menu-search.ts; rest of the article unchanged since the previous review; no figure recaptured, existing figures do not show the changed controls)",
    "language": "agent:claude-code (es changed passages with catalog UI labels; equivalent meaning to en revision 21; self-reviewed; agent review, not human acceptance)",
    "date": "2026-10-29"
  },
  "related": [
    "notifications-and-inbox",
    "storage-and-attachments",
    "trash-and-recovery",
    "views",
    "permissions-and-public-links",
    "databases"
  ],
  "aliases": [
    "create-and-organize-pages",
    "page-editor",
    "page-comments-and-collaboration",
    "page-files",
    "page-history",
    "publish-a-page",
    "import-export-and-print-pages"
  ],
  "tags": [
    "Crear una wiki del proyecto",
    "Escribir una página con bloques y menciones",
    "Discutir una página y resolver conflictos",
    "Adjuntar y recuperar archivos de páginas",
    "Examinar y restaurar una versión de página",
    "Publicar una página y revocar su enlace",
    "Exportar o imprimir una página"
  ],
  "figures": [
    {
      "id": "create-and-organize-pages-steps",
      "kind": "screenshot",
      "src": "/documentation/es/page-create-menu.png",
      "alt": "Menú de creación con Nueva página y Nueva base de datos.",
      "caption": "Utiliza los controles de páginas del proyecto para elegir un documento o una base de datos.",
      "revision": 22,
      "reviewed": true,
      "capturedAt": "2026-10-20",
      "viewport": [
        243,
        129
      ],
      "theme": "light",
      "padding": 24
    },
    {
      "id": "page-editor-steps",
      "kind": "screenshot",
      "src": "/documentation/es/page-editor.png",
      "alt": "Página de demostración con títulos, párrafos, casillas de tareas y una mención a un ticket.",
      "caption": "Los títulos, las tareas y la mención AUR-2 estructuran la página. El contenido es un ejemplo de demostración.",
      "revision": 22,
      "reviewed": true,
      "capturedAt": "2026-10-22",
      "viewport": [
        1154,
        1046
      ],
      "theme": "light",
      "padding": 24,
      "deviceScaleFactor": 2
    },
    {
      "id": "page-comments-and-collaboration-steps",
      "kind": "screenshot",
      "src": "/documentation/es/page-comments.png",
      "alt": "Actividad de la página todavía sin eventos y el campo de comentario vacío.",
      "caption": "Consulta la actividad y escribe un comentario en el campo. En este ejemplo no se ha enviado ninguno.",
      "revision": 22,
      "reviewed": true,
      "capturedAt": "2026-10-22",
      "viewport": [
        608,
        616
      ],
      "theme": "light",
      "padding": 24,
      "deviceScaleFactor": 2
    },
    {
      "id": "page-files-steps",
      "kind": "screenshot",
      "src": "/documentation/es/page-file-states.png",
      "alt": "Página de demostración con una carga incompleta y un archivo guardado de 67 bytes que ofrece Descargar.",
      "caption": "Comprueba el estado real del archivo: el segundo adjunto está disponible y la primera carga incompleta no.",
      "revision": 22,
      "reviewed": true,
      "capturedAt": "2026-10-08",
      "viewport": [
        1178,
        466
      ],
      "theme": "light",
      "padding": 24
    },
    {
      "id": "page-history-steps",
      "kind": "screenshot",
      "src": "/documentation/es/page-history-preview.png",
      "alt": "Pestaña Versiones con un estado anterior desplegado, su autor, Restaurar y el aviso de conservación durante 30 días.",
      "caption": "Previsualiza un estado guardado y compáralo con la página actual antes de restaurarlo.",
      "revision": 22,
      "reviewed": true,
      "capturedAt": "2026-10-08",
      "viewport": [
        632,
        538
      ],
      "theme": "light",
      "padding": 24
    },
    {
      "id": "publish-a-page-steps",
      "kind": "screenshot",
      "src": "/documentation/es/page-publish.png",
      "alt": "Diálogo de publicación con Privado seleccionado y opciones de contraseña o enlace.",
      "caption": "Privado mantiene la página dentro del proyecto. Revisa quién debe verla antes de cambiar la publicación.",
      "revision": 22,
      "reviewed": true,
      "capturedAt": "2026-10-20",
      "viewport": [
        496,
        230
      ],
      "theme": "light",
      "padding": 24
    },
    {
      "id": "import-export-and-print-pages-steps",
      "kind": "screenshot",
      "src": "/documentation/es/page-export.png",
      "alt": "Menú de exportación del documento con Markdown (.md) e Imprimir / PDF.",
      "caption": "Elige Markdown para descargar el documento o Imprimir / PDF para abrir la vista de impresión.",
      "revision": 22,
      "reviewed": true,
      "capturedAt": "2026-10-20",
      "viewport": [
        211,
        128
      ],
      "theme": "light",
      "padding": 24
    },
    {
      "id": "page-file-preview",
      "kind": "screenshot",
      "src": "/documentation/es/file-preview.png",
      "alt": "Visor CSV a toda ventana con tareas de ejemplo, un botón Cerrar grande y el menú Acciones del archivo con Descargar, Cambiar nombre y Eliminar.",
      "caption": "El visor compartido coloca Cerrar debajo de la vista previa. El menú Acciones del archivo ofrece Descargar y, con los permisos necesarios, Cambiar nombre y Eliminar.",
      "revision": 22,
      "reviewed": true,
      "capturedAt": "2026-10-12",
      "viewport": [
        1168,
        808
      ],
      "theme": "light",
      "padding": 24,
      "deviceScaleFactor": 2
    }
  ],
  "requiredFigures": [
    "create-and-organize-pages-steps",
    "page-editor-steps",
    "page-comments-and-collaboration-steps",
    "page-files-steps",
    "page-history-steps",
    "publish-a-page-steps",
    "import-export-and-print-pages-steps",
    "page-file-preview"
  ]
}
---

Las páginas forman el wiki de un proyecto, con documentos, subpáginas y entradas de bases de datos. Puedes organizar y editar el contenido, colaborar, gestionar archivos y versiones, publicar una rama o exportarla. Las importaciones comienzan en una base de datos vacía; sigue la [guía de bases de datos](/es/documentacion/databases#import-a-database).

## Crear una wiki del proyecto {#create-and-organize-pages}

Abre Páginas en un proyecto como propietario o como Miembro; los lectores pueden abrir las páginas, pero no crearlas. Usa el menú + y elige una página para un documento o una base de datos para una lista estructurada. Pon un título útil y escribe la especificación, decisión o procedimiento que deba conservar.

Crea subpáginas para documentos relacionados y utiliza los controles del árbol para moverlas o reordenarlas. Una página no puede ser descendiente de sí misma. Duplicar una página crea contenido nuevo, no una referencia actualizada al original. Revisa la rama duplicada antes de editarla o compartirla. Para crear una subpágina mientras escribes, teclea `/` y elige **Subpágina**: minddy crea la página hija bajo la actual, inserta su mención en el cursor seguida de un espacio y abre la nueva página en el panel lateral, junto a la página en la que escribes; elige **Ampliar** para abrirla completa. Puedes seguir escribiendo después de la mención en la misma línea, como después de cualquier mención. Una página creada desde la barra lateral se abre completa. Una página más antigua puede mostrar todavía bloques de subpágina: la primera vez que la abre alguien que puede editarla, cada bloque se convierte en una línea que solo contiene la mención de la hija, y los comentarios y enlaces de bloque siguen apuntando a ella. Abrirla como lector no convierte nada. Al duplicar una página con sus subpáginas, las menciones de las páginas copiadas apuntan a las copias, incluidas las menciones dentro de una frase.

### Favoritos y eliminación {#page-tree}

Marca una página como favorita para mostrarla al principio del árbol del proyecto. Estos favoritos se comparten dentro del proyecto, a diferencia de una nota privada del cuaderno. Enlaza una página a una incidencia cuando el documento actual sea contexto de la tarea; el título del recurso sigue los cambios de nombre de la página. En el menú `…` de la página abierta, **Copiar** ofrece **Copiar enlace** y **Copiar el contenido de la página**, que copia el título y el cuerpo en Markdown (no se ofrece en una base de datos). Comando+Mayús+L en macOS o Ctrl+Mayús+L en Windows/Linux copia el enlace de la página abierta.

La eliminación envía a la papelera las páginas para las que se admite la recuperación. Desde un menú de página, **Mover a la papelera** pide confirmación antes, nombrando la página y cuántas subpáginas se van con ella; se pueden restaurar desde la papelera durante 30 días. Borrar una mención nunca mueve una página a la papelera. Mover una página hija a la papelera desde el árbol quita de la página principal la línea que solo contiene su mención; al restaurar la página, esa línea vuelve al final de la página principal, salvo que esta aún la mencione en otro lugar. Una mención dentro de una frase nunca se quita. Comprueba la rama seleccionada antes de eliminar y recupera una página perdida en lugar de recrearla cuando quieras conservar su contenido. Las entradas con valores de base de datos guardados se pueden reordenar dentro de su base, pero no mover fuera de ella. Si se rechaza un movimiento, examina jerarquía y tipo de entrada en lugar de forzarlo con intentos repetidos.


![Menú de creación con Nueva página y Nueva base de datos.](/documentation/es/page-create-menu.png)

## Convertir una página en incidencia {#promote-page-to-issue}

Cuando una página describe trabajo pendiente, el propietario o un Miembro puede convertirla en una incidencia con Numo. Los lectores no ven esta acción. Necesitas tener uso de IA disponible o una clave personal compatible.

1. Elige **Convertir en incidencia** en el menú de la página en el árbol (`…` o clic derecho en la fila) o en el menú `…` de la página abierta (**Opciones de la página**). La misma acción aparece para una entrada de base de datos abierta en el panel lateral y en el menú del tirador de una sola entrada, como explica la [guía de bases de datos](/es/documentacion/databases#entry-actions).
2. Si la página abierta tiene cambios sin guardar, minddy los guarda primero. Si ese guardado falla, minddy indica que no se pudo guardar la página y Numo no se abre. Vuelve a convertir la página cuando se haya guardado.
3. Numo se abre en el proyecto de la página, con la página como contexto, y recibe una solicitud para leer su título, su contenido y, en una entrada de base de datos, sus propiedades. Si la página no es clara, o si una base de datos deja ambiguo el alcance de la incidencia, Numo hace preguntas antes de crear nada. Respóndelas en la conversación.
4. Numo crea una sola incidencia y le adjunta la página. Abre la incidencia y comprueba su identificador, su alcance, sus propiedades y la página adjunta.

A diferencia de una tarea del cuaderno llevada al proyecto, la página no se elimina: sigue en su lugar en el árbol, con su contenido y sus subpáginas. Si la creación falla o el resultado queda ambiguo tras un error de red, busca la incidencia antes de volver a convertir la página.

## Escribir una página con bloques y menciones {#page-editor}

Abre la página y edita su título o cuerpo como propietario o como Miembro. Los lectores pueden abrir y leer las páginas, pero no pueden editarlas, importarlas, duplicarlas, añadirlas a favoritos ni publicarlas, ni restaurar una versión. Usa el menú de comandos de barra y los controles de formato para insertar encabezados, texto, listas con viñetas, numeradas y de tareas, citas, avisos, bloques de código, ecuaciones, divisores, desplegables (secciones plegables), subpáginas, imágenes y archivos. Un aviso puede tener un icono emoji y un color de la paleta; elígelos para distinguir información útil, no como única forma de comunicar una advertencia. Una **Ecuación** se escribe en LaTeX y se muestra con KaTeX. Elígela en el menú `/` para una ecuación en su propia línea, o escribe LaTeX entre `$$` dentro de una frase, como `$$x^2$$`, para una ecuación en el texto. Haz clic en una ecuación para editar su LaTeX con una vista previa en directo, en una ventana emergente en el ordenador o en un panel inferior en el teléfono. El LaTeX que no se puede mostrar aparece en rojo con un mensaje, y guardar una ecuación vacía la elimina.

El menú `/` agrupa los bloques en **Bloques básicos**, **Listas** y **Bloques avanzados**, y el menú `@` agrupa por tipo lo que puedes mencionar, como **Personas**, **Incidencias** o **Páginas**. Mientras un menú está abierto, la `/` o la `@` y lo que escribes después se muestran en el texto como una etiqueta resaltada, con **Escribe para buscar** hasta que escribes una letra. Las flechas recorren todas las secciones, e Intro o Tab elige. Pulsa Escape, escribe dos espacios seguidos o elige **Cerrar menú**, al final del menú, para cerrarlo: lo que escribiste queda como texto normal. Un espacio justo después de la `/` o la `@` sola también cierra el menú. Una vez que escribes una búsqueda, un solo espacio forma parte de ella, así que `/lista con viñetas` o `@Camille Roy` se buscan tal como los escribes. El menú también se cierra cuando la búsqueda no encuentra nada, salvo que una búsqueda por el sentido siga en curso.

Utiliza menciones para enlazar incidencias, objetivos, personas o páginas relevantes. Escribe `@` seguido de un identificador, un nombre o un título, que puede contener espacios sueltos; el menú se cierra de las mismas formas que el menú `/`, y al elegir un elemento. Una palabra que describe el trabajo en lugar de nombrarlo también muestra incidencias encontradas [por el sentido](/docs/navigation#search-by-meaning) bajo **Relacionadas por significado**, después de las coincidencias de texto. Los enlaces inversos ayudan a encontrar páginas que hacen referencia a la actual. Un enlace aporta contexto, no acceso a un objeto privado de otro proyecto. La mención de una página que aún no tiene título muestra **Sin título**.

Al hacer clic en la mención de una página, un enlace inverso, una página adjunta a una incidencia o a un objetivo, o un enlace a una página en un comentario o una respuesta de Numo, esa página se abre en un panel lateral sobre lo que estabas leyendo. Léela o edítala ahí, elige **Ampliar** para abrir la página completa o cierra el panel para volver. Entre **Ampliar** y cerrar, el menú **Opciones de la página** (`…`) del panel ofrece las mismas acciones que en la página completa; mover la página a la papelera desde ahí cierra el panel y te deja en la página de debajo. Una base de datos también se abre en el panel, con la barra de herramientas compacta que describe la [guía de bases de datos](/docs/databases#database-display); una entrada abierta desde su tabla ocupa su lugar, y **Volver**, arriba a la izquierda del panel, regresa a la tabla.


![Página de demostración con títulos, párrafos, casillas de tareas y una mención a un ticket.](/documentation/es/page-editor.png)

### Dar formato al texto y escribir en el teléfono {#editor-formatting}

Las páginas, las descripciones, los comentarios y el cuaderno de tareas comparten el mismo editor. Selecciona texto, o bloques enteros como se describe más abajo, para abrir la barra de selección. Su primera fila muestra el tipo de bloque actual: elígela para abrir **Convertir en** y cambiar el bloque. Después vienen **Color**, para el texto o el fondo, **Negrita**, **Cursiva**, **Subrayado**, **Tachado**, **Código**, **Añadir enlace** (o **Quitar enlace** sobre un enlace), **Ecuación en línea**, que convierte el texto seleccionado en una ecuación en línea o lo devuelve a texto, **Borrar formato** y **Copiar**, que copia la selección. En un ordenador, una fila **Pregúntale a Numo** envía el pasaje a Numo, como se describe en la [guía de Numo](/es/documentacion/numo#work-with-numo), y en una página una fila **Comentar** ancla un comentario a la selección. **Convertir en** marca solo el tipo del bloque que contiene la selección. En las listas de colores, aquí y en el menú del bloque, cada color aparece con su nombre, escrito en ese color o sobre ese fondo. Hacer clic fuera del editor termina la selección y oculta la barra, igual que elegir **Comentar**. Las descripciones emergentes muestran los atajos: Comando+B, Comando+I, Comando+U, Comando+Mayús+S y Comando+E en macOS, o Ctrl con las mismas teclas en Windows/Linux. En un editor, Comando/Ctrl+B pone el texto en negrita; fuera de él, sigue mostrando u ocultando la barra lateral. En un bloque de código, la barra solo muestra el tipo de bloque, **Color**, **Copiar**, **Pregúntale a Numo** y **Comentar**: un color de texto sustituye el resaltado de sintaxis del código, un color de fondo lo conserva y el color predeterminado lo restablece. Los colores de texto y de fondo no se conservan en Markdown. La barra sigue el pasaje seleccionado mientras la página se desplaza y se cierra en cuanto el pasaje sale de la vista.

Mayús+Intro empieza una línea nueva dentro del mismo bloque. Comando/Ctrl+Intro no inserta un salto de línea: en un comentario u otro compositor envía, sea cual sea el atajo de envío elegido en tus [preferencias](/es/documentacion/accounts#preferences), y si elegiste Intro como atajo de envío, Intro también envía.

Para seleccionar bloques enteros, arrastra de un bloque a otro o traza un rectángulo de selección desde fuera del texto: pulsa en el margen junto a él o en el espacio vacío bajo la página y arrastra sobre los bloques. Se selecciona cada bloque que toca el rectángulo; un clic ahí sin arrastrar sigue colocando el cursor en esa línea, y Escape cancela el rectángulo. Cada bloque al que llegas se resalta con esquinas redondeadas, en el color del texto seleccionado. Cuando hay un solo bloque seleccionado, la barra de selección se abre encima: sus acciones (**Convertir en**, **Color**, **Negrita** y los demás formatos, **Copiar**, **Pregúntale a Numo**, **Comentar**) se aplican al bloque, y después de **Convertir en** sigue seleccionado para que puedas encadenar otra acción. Con varios bloques seleccionados, la barra no aparece: abre el menú del control de un bloque seleccionado, que actúa sobre todos. Mayús+clic en otro bloque, o Mayús+flecha arriba y Mayús+flecha abajo en el borde de un bloque, amplían la selección por bloques enteros. Escape selecciona el bloque en el que escribes, y Escape otra vez borra la selección. Comando+A en macOS o Ctrl+A en Windows/Linux selecciona primero el texto del bloque en el que estás, también en un bloque de código, y al pulsarlo otra vez, todos los bloques. Con bloques seleccionados, la flecha arriba y la flecha abajo seleccionan el bloque de encima o de debajo, Mayús+flecha arriba y Mayús+flecha abajo añaden o quitan bloques, Retroceso o Supr los elimina, Comando/Ctrl+C los copia, Comando/Ctrl+X los corta, e Intro en un solo bloque pone el cursor al final; escribir no hace nada. El menú del bloque actúa sobre todos los bloques seleccionados. Escribe en el campo de búsqueda del menú del bloque para llegar a cualquiera de sus acciones, incluidos los tipos de bloque y los colores: una entrada de un submenú muestra su ruta, por ejemplo **Convertir en** › **Encabezado 1**. Las imágenes, los archivos, los bloques de código, las ecuaciones, los divisores, las menciones y el código en línea muestran el mismo resaltado cuando están seleccionados, solos o dentro de una selección. Mientras escribes o editas un comentario, Escape sigue cerrándolo o cancelándolo. En una pantalla táctil, la pulsación larga sigue seleccionando texto, y arrastrar no selecciona bloques.

En un teléfono, el editor no muestra tiradores de bloque ni barra de selección, y escribir `@` deja un carácter normal. Mientras un editor tiene el foco, una barra flotante se sitúa encima del teclado y se oculta cuando el teclado se cierra: **Insertar un bloque** (+) lista los bloques de este editor, en las mismas secciones que el menú `/`, e inserta el elegido en el cursor, como `/`; **Mencionar** (@) lista personas, incidencias, objetivos y páginas para mencionar, agrupados por tipo; después vienen **Negrita**, **Cursiva**, **Tachado**, **Código**, **Color** (una hoja para el color del texto o del fondo), **Añadir enlace**, **Reducir sangría** y **Aumentar sangría** en una lista, **Comentar** en una página y **Ocultar teclado**, que se mantiene fijo en el extremo derecho. Una hoja inferior en la que escribes crece hasta ocupar toda la altura de la pantalla, y la línea que escribes se mantiene encima del teclado. Una pulsación larga selecciona texto en un editor, y la barra y sus hojas también funcionan en el cuaderno de tareas. La navegación inferior se oculta mientras un campo de texto tiene el foco, como el título de una página o un comentario. En una pantalla táctil, **Añadir icono** siempre está visible en una página.

### Buscar y reemplazar en una página {#find-and-replace}

Mientras una página está en pantalla, Comando+F en macOS o Ctrl+F en Windows/Linux abre una barra de búsqueda arriba a la derecha del documento, esté donde esté el cursor; en una página abierta en el panel lateral, busca en esa página. El texto que tenías seleccionado pasa a ser la búsqueda. Cada resultado se resalta, el actual con más intensidad, y la barra muestra su posición, por ejemplo 2 de 7. Intro va al resultado siguiente y Mayús+Intro al anterior; volver a pulsar Comando/Ctrl+F selecciona el texto buscado. **Distinguir mayúsculas y minúsculas**, **Palabra completa** y **Expresión regular** afinan la búsqueda; una expresión no válida se señala y no resalta nada. La búsqueda abarca el cuerpo de la página, no su título.

Si puedes editar la página, **Mostrar reemplazo** añade un campo para el texto de reemplazo, con **Reemplazar**, que reemplaza el resultado actual y pasa al siguiente, y **Reemplazar todo**. En una expresión regular, `$1` a `$9` insertan los grupos encontrados y `$&` el resultado completo; una búsqueda simple inserta el texto tal como lo escribiste. Un reemplazo es una edición normal: se guarda y llega a los demás editores como lo que escribes, y Comando/Ctrl+Z lo deshace, **Reemplazar todo** en un solo paso. Escape cierra la barra y vuelve al texto. El cuaderno de tareas tiene la misma barra. En el resto de minddy, y cuando hay otro cuadro de diálogo abierto sobre la página, Comando/Ctrl+F abre la búsqueda del navegador.

### Guardado y portabilidad {#editor-save}

Una página se guarda a medida que escribes: cada cambio llega al servidor en un instante y el indicador de guardado muestra Guardando… hasta que el servidor lo acepta. Varias personas pueden editar la misma página a la vez, incluso el mismo párrafo o el título. Los cambios de cada persona aparecen para las demás mientras escribe, al igual que las ediciones que Numo o un agente conectado por MCP hacen en la página.

Si se corta la conexión, mantén la página abierta. Los cambios sin guardar permanecen en la página y se envían cuando vuelve la conexión; los cambios de los demás llegan al mismo tiempo y se fusionan con los tuyos. minddy solo abre otra página cuando tus cambios están guardados: mientras no se pueden enviar, te mantiene en la página e indica que el guardado falló. Cerrar una pestaña del navegador con cambios sin guardar te pide confirmación antes; salir de la aplicación de escritorio no la pide, y los cambios sin guardar se pierden. Si pierdes el acceso a la página o el permiso para editarla mientras hay cambios sin guardar, minddy los deshace y muestra un mensaje. Cuando el servidor rechaza un cambio, por ejemplo un título de más de 500 caracteres o un enlace cuyo protocolo no está permitido, minddy deshace ese cambio y muestra un mensaje. El historial puede ayudar a examinar versiones guardadas anteriormente.

Las exportaciones Markdown y las lecturas de páginas por agentes conservan iconos y colores de avisos en su representación admitida. Una imagen redimensionada también conserva su ancho, escrito como título de la imagen (`![alt](src "width=60%")`), así que las ediciones de Numo, de los agentes MCP o del cuaderno de tareas no lo restablecen. Los agentes leen y escriben una mención de página como `[@Title](mention:page/<id>)`; la forma antigua `[[page:<id>]]` sigue aceptándose y se lee como la misma mención, también dentro de una línea. Las ecuaciones viajan como LaTeX: `$E = mc^2$` dentro de una línea y un bloque entre dos líneas `$$`. Un importe como `$5` sigue siendo texto. Los formatos difieren en fidelidad y tratamiento de adjuntos, así que comprueba el documento resultante antes de sustituir una fuente original. Usa bloques de código para comandos literales y conserva sus requisitos y advertencias en el texto que los rodea.

## Discutir una página y resolver conflictos {#page-comments-and-collaboration}

Abre una página del proyecto y sus controles de comentarios. Selecciona el contenido relevante al crear un comentario anclado, explica la pregunta o cambio propuesto y utiliza menciones para involucrar a un miembro. Un lector puede comentar si el propietario le ha activado **Puede comentar**. Responde en el hilo para mantener la decisión junto a su contexto. Resuélvelo cuando su pregunta se haya atendido realmente. El hilo de un bloque se abre en un diálogo en un ordenador y en una hoja inferior en un teléfono, en lugar de junto al bloque: muestra el pasaje citado, las discusiones existentes con sus respuestas y un campo para un comentario nuevo. Ábrelo desde la insignia de comentarios del bloque, **Comentar** en la barra de selección o el menú del bloque. En un ordenador, al pasar el puntero sobre un bloque sin comentarios aparece a su derecha un botón **Comentar este bloque**, a la altura del tirador del bloque; un bloque comentado muestra ahí su insignia de comentarios. Al pasar el puntero sobre ese botón, su bloque se resalta como una selección. Este botón no aparece en un teléfono.

Los avatares de presencia identifican a las personas que ven la página. Mientras alguien edita, su cursor y su selección aparecen en el cuerpo y en el título, con un color propio y una etiqueta con su nombre. El cursor de un lector no se muestra. Un cursor indica dónde está trabajando alguien, no que su texto esté guardado: el indicador de guardado solo refleja tus propios cambios.


![Actividad de la página todavía sin eventos y el campo de comentario vacío.](/documentation/es/page-comments.png)

### Recuperarte de un conflicto de guardado {#page-conflict}

Las ediciones simultáneas se fusionan automáticamente, carácter por carácter, incluso dentro del mismo párrafo. Aun así, puede aparecer un aviso de conflicto cuando minddy tiene que recargar la página mientras tienes cambios sin guardar: tras una desconexión durante la que se hicieron muchos cambios, o tras un cambio realizado sin edición en directo, como una importación en una base de datos. Si tus cambios y la versión recargada modificaron el mismo bloque de primer nivel, el documento conserva la versión recargada de ese bloque y el aviso ofrece la tuya para revisarla.

Compara el bloque identificado con el documento actual. Elige restaurar tu versión solo si quieres reemplazar ese bloque por ella. Si tu acción en conflicto fue una eliminación, la opción de eliminarlo de nuevo aplica esa eliminación expresamente. Descartar el aviso conserva el documento adoptado y cierra la advertencia; no restaura tu versión. Conserva el texto que quieras recuperar antes de descartar el aviso y utiliza el historial para examinar versiones guardadas si necesitas una recuperación más amplia. Estas opciones afectan al bloque identificado, sin reemplazar a ciegas toda la página.

Un anclaje puede desaparecer tras editar el documento; lee la discusión antes de mover o eliminar el bloque referido. Los comentarios y la actividad son internos al proyecto salvo que el contenido se publique expresamente mediante una vía admitida. Prueba una página publicada para conocer la vista real del visitante, sin suponer que los controles de colaboración del proyecto sean públicos.

## Adjuntar y recuperar archivos de páginas {#page-files}

Abre la página como miembro del proyecto y utiliza los controles de adjuntos o carga. Selecciona un archivo no vacío dentro del límite de 10 MB por archivo. La cuota de almacenamiento de la cuenta o instancia puede imponer otro límite. Conserva el original hasta que la carga tenga éxito.

Las imágenes pueden insertarse como bloques de imagen y los demás documentos como bloques de archivo. El servidor determina el tipo de medio almacenado a partir de los bytes, sin confiar en el nombre del archivo ni en la etiqueta del navegador. Aceptar una carga no garantiza que todos los formatos tengan una vista previa en la página; descarga el archivo si no hay vista previa.

En el editor del proyecto, haz clic en una imagen o en el nombre de un bloque de archivo compatible para abrir el mismo visor a toda ventana que usan los adjuntos de los tickets. Markdown (`.md`), texto sin formato (`.txt`, `.text`), CSV, PDF y los formatos de audio o vídeo compatibles se abren en contenedores específicos. Usa Cerrar o Escape para volver a la página. El menú Acciones del archivo (`…`) ofrece Descargar. En una página editable, un bloque de archivo ofrece también Cambiar nombre, que cambia el nombre mostrado en la página, y las imágenes y los archivos ofrecen Eliminar: pide confirmación, quita el bloque del documento y puedes deshacerlo en el editor. El bloque de archivo conserva también su control directo Descargar. Los formatos no compatibles, los enlaces a archivos externos y los bloques de archivo de páginas publicadas conservan su comportamiento de descarga. Las imágenes publicadas usan el visor sin la acción de eliminación.

![Visor CSV a toda ventana con tareas de ejemplo, un botón Cerrar grande y el menú Acciones del archivo con Descargar, Cambiar nombre y Eliminar.](/documentation/es/file-preview.png)

Comprueba que aparezca en la página y ábrelo o descárgalo. Los bytes están en Storage, mientras que los metadatos de página y archivo determinan el acceso. Que la página se guarde correctamente no demuestra por sí solo que estén disponibles los bytes.

### Archivos compartidos y fallos {#file-access}

Un archivo referenciado en una página publicada puede quedar disponible para sus visitantes. Los archivos de páginas fuera de la rama publicada no se hacen accesibles solo porque otra página los referencie. Revisa la página y los descendientes incluidos antes de compartir.

Si falla la carga, comprueba tamaño, cuota y mensaje de error. Un operador autoalojado también debe verificar configuración y políticas de Storage. Si falta un archivo después de restaurar, recupera sus bytes de Storage y metadatos correspondientes; una restauración solo de la base de datos no puede recrearlo. Las URL de archivos publicados se firman por un máximo de 24 horas al renderizar la página. Revocar una publicación detiene las nuevas visitas autorizadas a la página, pero no invalida inmediatamente las URL de archivos ya entregadas; pueden seguir utilizándose hasta que caduquen. Las copias descargadas no se pueden recuperar.


![Página de demostración con una carga incompleta y un archivo guardado de 67 bytes que ofrece Descargar.](/documentation/es/page-file-states.png)

## Examinar y restaurar una versión de página {#page-history}

Abre el indicador de guardado o historial de la página para ver versiones, o el control de comentarios y actividad para examinar acciones. Estas pestañas responden a preguntas distintas: una versión guardada es un estado del documento, mientras que la actividad puede incluir cambios de nombre, eliminación o restauración sin la misma instantánea de contenido.

Selecciona una versión para previsualizarla antes de restaurar. El historial identifica autores y actividad de agentes, así que compara el contenido con el cambio que quieres deshacer. La interfaz anuncia un historial de 30 días; no lo trates como una copia externa permanente.

### Restaurar y comprobar {#restore-page-version}

Como miembro autorizado, restaura la versión seleccionada solo después de revisar el contenido actual que sustituirá. El estado previo a la restauración también entra en el historial y puede recuperarse más adelante mientras se conserve.

Vuelve a abrir o actualiza el editor después de restaurar y comprueba el cuerpo real de la página. Un editor ya abierto mantiene una versión anticuada y no debe sobrescribir a ciegas el estado restaurado. Las versiones de página no son copias completas de la instancia: los bytes de adjuntos, archivos eliminados u objetos relacionados pueden tener ciclos de vida separados. Usa las guías de archivos y recuperación del operador cuando falte información fuera del cuerpo guardado.


![Pestaña Versiones con un estado anterior desplegado, su autor, Restaurar y el aviso de conservación durante 30 días.](/documentation/es/page-history-preview.png)

## Publicar una página y revocar su enlace {#publish-a-page}

Abre una página del proyecto como propietario o como Miembro y usa sus controles de publicación. Revisa primero contenido y adjuntos. Elige acceso privado, protegido por contraseña o público. La contraseña requiere al menos ocho caracteres y se aplica después de enviarla; seleccionar el modo no crea por sí solo un enlace protegido.

Copia el enlace /p/ generado cuando la publicación tenga éxito. Si la página tiene descendientes, revisa la opción de incluirlos y su número. Incluirlos publica la rama seleccionada; excluirlos deja su contenido fuera de esa publicación. Una base de datos sin descendientes publicados no expone automáticamente todos los cuerpos de sus entradas.

Abre el enlace en una sesión separada del navegador sin tu cuenta. Prueba la contraseña si está activada, el contenido, las subpáginas previstas y las descargas. Una mención de una página del conjunto publicado muestra su título y la abre con el mismo enlace; una mención de cualquier otra página muestra **Subpágina no publicada** y no se abre. Esto verifica el acceso de solo lectura del visitante, no tus permisos más amplios de miembro.


![Diálogo de publicación con Privado seleccionado y opciones de contraseña o enlace.](/documentation/es/page-publish.png)

### Revocar y comprobar {#revoke-page}

Vuelve a los controles, elige privado y confirma con **Dejar de publicar**: el enlace antiguo deja de funcionar y volver a publicar crea un enlace nuevo. Tras revocar correctamente, abre el enlace antiguo de forma anónima y comprueba que se deniega el acceso. No se pueden recuperar copias o capturas ya recibidas. Las URL de descarga de archivos ya entregadas por una página publicada se firman por un máximo de 24 horas. La revocación impide nuevas visitas a la página, pero esas URL de archivos pueden seguir siendo válidas hasta que caduquen.

Los enlaces de páginas de usuarios mantienen `noindex` y son distintos del manual oficial indexado. Noindex es una política de descubrimiento, no una contraseña. Si un descendiente o archivo resulta legible inesperadamente, revoca primero, revisa la rama publicada y prueba de nuevo antes de reenviar un enlace corregido. Los archivos de páginas sin publicar no obtienen acceso por una referencia interna.

## Exportar o imprimir una página {#import-export-and-print-pages}

Abre el menú del documento de la página y elige Exportar. Selecciona Markdown para una página (.md) o una rama (.zip), PDF para abrir la vista de impresión o el archivo de base de datos si la página es una base de datos. Revisa el alcance ofrecido antes de confirmar: una página, su rama y un archivo de base de datos contienen elementos diferentes.

Abre la exportación y comprueba los encabezados, avisos, enlaces y adjuntos que necesite el lector. En la exportación, las menciones muestran los títulos actuales de las páginas, y las menciones de páginas incluidas en la exportación se convierten en enlaces relativos. La acción PDF abre una vista de impresión legible sin toda la navegación de la aplicación. Usa los controles de impresión del navegador para imprimir o guardar un PDF. El menú del documento no ofrece una acción de importación general. Las importaciones compatibles se inician desde una base vacía, como explica la guía de importación de bases de datos.


![Menú de exportación del documento con Markdown (.md) e Imprimir / PDF.](/documentation/es/page-export.png)

### Archivos de base de datos y límites {#export-fidelity}

Un archivo de base de datos (.zip) incluye su rama: Markdown y CSV, el esquema exacto y los colores de las opciones, valores, contenidos, marcas de tiempo, páginas anidadas y los datos de los archivos. Impórtalo en una base nueva y vacía para restaurar esa estructura. Las vistas guardadas de la base de datos no forman parte del archivo: vuelve a crearlas después de la importación. Duplicar una base de datos conserva sus vistas.

Una exportación no transfiere contraseñas, credenciales de proveedores de cuentas ni suscripciones. Para trasladar el trabajo de una cuenta entre instancias, utiliza la guía de transferencia de datos de la cuenta. Si un formato importado no puede conservar un bloque o una propiedad externa, revisa el resultado antes de utilizarlo como sustituto. No elimines el original solo porque se haya creado un archivo descargable.


## Rutinas para nuevas entradas {#entry-routines}

El propietario del proyecto puede elegir esta base como desencadenante en [Rutinas](/docs/scheduled-routines#conditions). Las condiciones usan las propiedades tipadas de la entrada. Una entrada vacía puede esperar a que se rellenen. Creación, duplicación, importación de base y traslado permitido hacia la base cuentan como llegadas; restaurar no. Eliminar una propiedad referenciada o cambiar su tipo requiere corregir el filtro de la rutina.

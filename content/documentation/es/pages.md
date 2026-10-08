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
  "revision": 5,
  "sourceRevision": 5,
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
      "components/pages/page-create-menu.tsx",
      "components/pages/page-tree.tsx",
      "components/pages/page-editor.tsx",
      "components/pages/page-slash-command.tsx",
      "components/pages/page-comment-popover.tsx",
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
      "components/pages/page-print-view.tsx"
    ]
  },
  "review": {
    "revision": 5,
    "fact": "agent:/root/german_spanish_review (structural consolidation review; prior procedural evidence retained; no operational rerun)",
    "language": "agent:/root/german_spanish_review (es title, summary, lead and heading review; retained body comparison)",
    "date": "2026-10-09"
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
      "revision": 5,
      "reviewed": true,
      "capturedAt": "2026-10-08",
      "viewport": [
        1440,
        900
      ],
      "theme": "light"
    },
    {
      "id": "page-editor-steps",
      "kind": "screenshot",
      "src": "/documentation/es/page-editor.png",
      "alt": "Página de demostración con títulos, párrafos, casillas de tareas y una mención a un ticket.",
      "caption": "Los títulos, las tareas y la mención AUR-2 estructuran la página. El contenido es un ejemplo de demostración.",
      "revision": 5,
      "reviewed": true,
      "capturedAt": "2026-10-08",
      "viewport": [
        1440,
        1080
      ],
      "theme": "light"
    },
    {
      "id": "page-comments-and-collaboration-steps",
      "kind": "screenshot",
      "src": "/documentation/es/page-comments.png",
      "alt": "Actividad de la página con una edición de demostración y el campo de comentario vacío.",
      "caption": "Consulta la actividad y escribe un comentario en el campo. En este ejemplo no se ha enviado ninguno.",
      "revision": 5,
      "reviewed": true,
      "capturedAt": "2026-10-08",
      "viewport": [
        1440,
        600
      ],
      "theme": "light"
    },
    {
      "id": "page-files-steps",
      "kind": "screenshot",
      "src": "/documentation/es/page-file-states.png",
      "alt": "Página de demostración con una carga incompleta y un archivo guardado de 67 bytes que ofrece Descargar.",
      "caption": "Comprueba el estado real del archivo: el segundo adjunto está disponible y la primera carga incompleta no.",
      "revision": 5,
      "reviewed": true,
      "capturedAt": "2026-10-08",
      "viewport": [
        1440,
        900
      ],
      "theme": "light"
    },
    {
      "id": "page-history-steps",
      "kind": "screenshot",
      "src": "/documentation/es/page-history-preview.png",
      "alt": "Pestaña Versiones con un estado anterior desplegado, su autor, Restaurar y el aviso de conservación durante 30 días.",
      "caption": "Previsualiza un estado guardado y compáralo con la página actual antes de restaurarlo.",
      "revision": 5,
      "reviewed": true,
      "capturedAt": "2026-10-08",
      "viewport": [
        1440,
        900
      ],
      "theme": "light"
    },
    {
      "id": "publish-a-page-steps",
      "kind": "screenshot",
      "src": "/documentation/es/page-publish.png",
      "alt": "Diálogo de publicación con Privado seleccionado y opciones de contraseña o enlace.",
      "caption": "Privado mantiene la página dentro del proyecto. Revisa quién debe verla antes de cambiar la publicación.",
      "revision": 5,
      "reviewed": true,
      "capturedAt": "2026-10-08",
      "viewport": [
        1440,
        1080
      ],
      "theme": "light"
    },
    {
      "id": "import-export-and-print-pages-steps",
      "kind": "screenshot",
      "src": "/documentation/es/page-export.png",
      "alt": "Menú de exportación del documento con Markdown (.md) e Imprimir / PDF.",
      "caption": "Elige Markdown para descargar el documento o Imprimir / PDF para abrir la vista de impresión.",
      "revision": 5,
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
    "create-and-organize-pages-steps",
    "page-editor-steps",
    "page-comments-and-collaboration-steps",
    "page-files-steps",
    "page-history-steps",
    "publish-a-page-steps",
    "import-export-and-print-pages-steps"
  ]
}
---

Las páginas conservan el conocimiento del proyecto en documentos y subpáginas. Aquí encontrarás organización, edición, colaboración, adjuntos, historial, publicación y exportación. El menú de la página no permite importar documentos de forma general; las importaciones compatibles comienzan en una base de datos vacía.

## Crear una wiki del proyecto {#create-and-organize-pages}

Abre Páginas en un proyecto del que seas miembro. Usa el menú + y elige una página para un documento o una base de datos para una lista estructurada. Pon un título útil y escribe la especificación, decisión o procedimiento que deba conservar.

Crea subpáginas para documentos relacionados y utiliza los controles del árbol para moverlas o reordenarlas. Una página no puede ser descendiente de sí misma. Duplicar una página crea contenido nuevo, no una referencia actualizada al original. Revisa la rama duplicada antes de editarla o compartirla.

### Favoritos y eliminación {#page-tree}

Marca una página como favorita para mostrarla al principio del árbol del proyecto. Estos favoritos se comparten dentro del proyecto, a diferencia de una nota privada del cuaderno. Enlaza una página a una incidencia cuando el documento actual sea contexto de la tarea; el título del recurso sigue los cambios de nombre de la página.

La eliminación envía a la papelera las páginas para las que se admite la recuperación. Comprueba la rama seleccionada antes de eliminar y recupera una página perdida en lugar de recrearla cuando quieras conservar su contenido. Las entradas con valores de base de datos guardados se pueden reordenar dentro de su base, pero no mover fuera de ella. Si se rechaza un movimiento, examina jerarquía y tipo de entrada en lugar de forzarlo con intentos repetidos.


![Menú de creación con Nueva página y Nueva base de datos.](/documentation/es/page-create-menu.png)

## Escribir una página con bloques y menciones {#page-editor}

Abre la página y edita su título o cuerpo como miembro del proyecto. Usa el menú de comandos de barra y los controles de formato para insertar encabezados, párrafos, listas, tareas, código, secciones plegables y avisos. Un aviso puede tener un icono emoji y un color de la paleta; elígelos para distinguir información útil, no como única forma de comunicar una advertencia.

Utiliza menciones para enlazar incidencias, objetivos, personas o páginas relevantes. Los enlaces inversos ayudan a encontrar páginas que hacen referencia a la actual. Un enlace aporta contexto, no acceso a un objeto privado de otro proyecto.


![Página de demostración con títulos, párrafos, casillas de tareas y una mención a un ticket.](/documentation/es/page-editor.png)

### Guardado y portabilidad {#editor-save}

Observa el indicador de guardado antes de salir de una edición importante. Si otra edición crea un conflicto, usa los controles de recuperación mostrados y conserva el texto; no supongas que ambas se fusionaron. El historial puede ayudar a examinar versiones guardadas anteriormente.

Las exportaciones Markdown y las lecturas de páginas por agentes conservan iconos y colores de avisos en su representación admitida. Los formatos difieren en fidelidad y tratamiento de adjuntos, así que comprueba el documento resultante antes de sustituir una fuente original. Usa bloques de código para comandos literales y conserva sus requisitos y advertencias en el texto que los rodea.

## Discutir una página y resolver conflictos {#page-comments-and-collaboration}

Abre una página del proyecto y sus controles de comentarios. Selecciona el contenido relevante al crear un comentario anclado, explica la pregunta o cambio propuesto y utiliza menciones para involucrar a un miembro. Responde en el hilo para mantener la decisión junto a su contexto. Resuélvelo cuando su pregunta se haya atendido realmente.

Los avatares de presencia identifican a las personas que ven la página. No demuestran que el texto sin guardar de otra persona haya llegado al servidor ni que las ediciones simultáneas se fusionen automáticamente. Lee el estado de guardado actual antes de salir.


![Actividad de la página con una edición de demostración y el campo de comentario vacío.](/documentation/es/page-comments.png)

### Recuperarte de un conflicto de guardado {#page-conflict}

Minddy combina las ediciones de distintos bloques de primer nivel del documento cuando puede conservar ambos cambios. No fusiona carácter por carácter las ediciones simultáneas dentro del mismo bloque. Si ambas personas han cambiado ese bloque, el documento conserva la versión remota y un aviso ofrece tu bloque anterior para revisarlo.

Compara el bloque identificado con el documento actual. Elige restaurar tu versión solo si quieres reemplazar ese bloque por ella. Si tu acción en conflicto fue una eliminación, la opción de eliminarlo de nuevo aplica esa eliminación expresamente. Descartar el aviso conserva el documento adoptado y cierra la advertencia; no restaura tu versión. Conserva el texto que quieras recuperar antes de descartar el aviso y utiliza el historial para examinar versiones guardadas si necesitas una recuperación más amplia. Estas opciones afectan al bloque identificado, sin reemplazar a ciegas toda la página.

Un anclaje puede desaparecer tras editar el documento; lee la discusión antes de mover o eliminar el bloque referido. Los comentarios y la actividad son internos al proyecto salvo que el contenido se publique expresamente mediante una vía admitida. Prueba una página publicada para conocer la vista real del visitante, sin suponer que los controles de colaboración del proyecto sean públicos.

## Adjuntar y recuperar archivos de páginas {#page-files}

Abre la página como miembro del proyecto y utiliza los controles de adjuntos o carga. Selecciona un archivo no vacío dentro del límite de 10 MB por archivo. La cuota de almacenamiento de la cuenta o instancia puede imponer otro límite. Conserva el original hasta que la carga tenga éxito.

Las imágenes pueden insertarse como bloques de imagen y los demás documentos como bloques de archivo. El servidor determina el tipo de medio almacenado a partir de los bytes, sin confiar en el nombre del archivo ni en la etiqueta del navegador. Aceptar una carga no garantiza que todos los formatos tengan una vista previa en la página; descarga el archivo si no hay vista previa.

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

Abre una página del proyecto como miembro y usa sus controles de publicación. Revisa primero contenido y adjuntos. Elige acceso privado, protegido por contraseña o público. La contraseña requiere al menos ocho caracteres y se aplica después de enviarla; seleccionar el modo no crea por sí solo un enlace protegido.

Copia el enlace /p/ generado cuando la publicación tenga éxito. Si la página tiene descendientes, revisa la opción de incluirlos y su número. Incluirlos publica la rama seleccionada; excluirlos deja su contenido fuera de esa publicación. Una base de datos sin descendientes publicados no expone automáticamente todos los cuerpos de sus entradas.

Abre el enlace en una sesión separada del navegador sin tu cuenta. Prueba la contraseña si está activada, el contenido, las subpáginas previstas y las descargas. Esto verifica el acceso de solo lectura del visitante, no tus permisos más amplios de miembro.


![Diálogo de publicación con Privado seleccionado y opciones de contraseña o enlace.](/documentation/es/page-publish.png)

### Revocar y comprobar {#revoke-page}

Vuelve a los controles y elige privado. Tras revocar correctamente, abre el enlace antiguo de forma anónima y comprueba que se deniega el acceso. No se pueden recuperar copias o capturas ya recibidas. Las URL de descarga de archivos ya entregadas por una página publicada se firman por un máximo de 24 horas. La revocación impide nuevas visitas a la página, pero esas URL de archivos pueden seguir siendo válidas hasta que caduquen.

Los enlaces de páginas de usuarios mantienen noindex y son distintos del manual oficial indexado. Noindex es una política de descubrimiento, no una contraseña. Si un descendiente o archivo resulta legible inesperadamente, revoca primero, revisa la rama publicada y prueba de nuevo antes de reenviar un enlace corregido. Los archivos de páginas sin publicar no obtienen acceso por una referencia interna.

## Exportar o imprimir una página {#import-export-and-print-pages}

Abre el menú del documento de la página y elige Exportar. Selecciona Markdown para una página (.md) o una rama (.zip), PDF para abrir la vista de impresión o el archivo de base de datos si la página es una base de datos. Revisa el alcance ofrecido antes de confirmar: una página, su rama y un archivo de base de datos contienen elementos diferentes.

Abre la exportación y comprueba los encabezados, avisos, enlaces y adjuntos que necesite el lector. La acción PDF abre una vista de impresión legible sin toda la navegación de la aplicación. Usa los controles de impresión del navegador para imprimir o guardar un PDF. El menú del documento no ofrece una acción de importación general. Las importaciones compatibles se inician desde una base vacía, como explica la guía de importación de bases de datos.


![Menú de exportación del documento con Markdown (.md) e Imprimir / PDF.](/documentation/es/page-export.png)

### Archivos de base de datos y límites {#export-fidelity}

Un archivo de base de datos (.zip) incluye su rama: Markdown y CSV, el esquema exacto y los colores de las opciones, valores, contenidos, marcas de tiempo, páginas anidadas y los datos de los archivos. Impórtalo en una base nueva y vacía para restaurar esa estructura. Los filtros, la ordenación y las preferencias de columnas ocultas propios de cada dispositivo permanecen en el dispositivo original.

Una exportación no transfiere contraseñas, credenciales de proveedores de cuentas ni suscripciones. Para trasladar el trabajo de una cuenta entre instancias, utiliza la guía de transferencia de datos de la cuenta. Si un formato importado no puede conservar un bloque o una propiedad externa, revisa el resultado antes de utilizarlo como sustituto. No elimines el original solo porque se haya creado un archivo descargable.

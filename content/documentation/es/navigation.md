---
{
  "id": "navigation",
  "locale": "es",
  "title": "Navegación y búsqueda",
  "summary": "Navega por el trabajo personal y los proyectos, usa pestañas y paneles y encuentra elementos accesibles con la búsqueda y los atajos de teclado.",
  "topic": "Primeros pasos",
  "type": "guide",
  "audiences": [
    "member"
  ],
  "workflows": [
    "S04",
    "W15"
  ],
  "visibility": "public",
  "status": "published",
  "revision": 23,
  "sourceRevision": 22,
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
      "components/app-sidebar.tsx",
      "components/secondary-sidebar.tsx",
      "content/knowledge/agents-and-mcp.md",
      "content/knowledge/productivity.md",
      "components/command-palette.tsx",
      "components/keyboard-cheatsheet.tsx",
      "components/issue-field-shortcuts.tsx",
      "lib/keyboard/shortcuts.ts",
      "lib/keyboard/keyboard-context.tsx",
      "components/project-context-actions.tsx",
      "lib/sidebar-context-actions.ts",
      "components/routines/routines-panel.tsx",
      "components/pull-requests/pr-context-actions.tsx",
      "lib/use-hidden-projects.ts",
      "lib/issue-semantic-query.ts",
      "lib/use-semantic-issue-search.ts",
      "lib/server/issue-semantic-search.ts",
      "app/api/issues/semantic-search/route.ts",
      "lib/use-semantic-mentions.ts",
      "lib/issue-search-order.ts",
      "components/app-tab-strip.tsx",
      "lib/app-tab-indicators.ts",
      "lib/settings-sections.ts",
      "lib/settings-section-focus.ts",
      "components/settings-shell.tsx",
      "components/settings/account-smart-fill-section.tsx",
      "components/objective-relations-section.tsx",
      "components/create-issue-dialog.tsx",
      "components/app-shell-chrome.tsx",
      "components/editor/find-bar.tsx",
      "lib/keyboard/find-shortcut.ts",
      "lib/palette-workspace-groups.ts",
      "components/inbox-content.tsx",
      "lib/inbox-launcher.ts",
      "lib/palette-picker.ts",
      "components/palette-picker-rows.tsx",
      "components/mobile-navigation.tsx",
      "components/mobile-nav-actions.tsx",
      "lib/keyboard/typeahead.ts"
    ]
  },
  "review": {
    "revision": 23,
    "fact": "agent:claude-code (pointer to the Numo type-ahead on Home and in the expanded Numo panel, checked against lib/keyboard/typeahead.ts and lib/keyboard/keyboard-context.tsx; not checked in the running app; rest of the article unchanged since the previous review; no figure recaptured, existing figures do not show this behavior)",
    "language": "agent:claude-code (es changed passages with catalog UI labels; self-reviewed; agent review, not human acceptance)",
    "date": "2026-10-29"
  },
  "related": [
    "views",
    "applications"
  ],
  "aliases": [
    "productivity",
    "search-and-shortcuts"
  ],
  "tags": [
    "Encontrar trabajo personal y cambiar de proyecto",
    "Encontrar trabajo y usar acciones de teclado"
  ],
  "figures": [
    {
      "id": "navigation-steps",
      "kind": "screenshot",
      "src": "/documentation/es/work-navigation.png",
      "alt": "Navegación del proyecto junto al tablero de incidencias de demostración.",
      "caption": "La barra del proyecto da acceso a incidencias, objetivos, páginas y clasificación de entradas.",
      "revision": 23,
      "reviewed": true,
      "capturedAt": "2026-10-22",
      "viewport": [
        1440,
        1080
      ],
      "theme": "light",
      "padding": 0,
      "deviceScaleFactor": 2
    },
    {
      "id": "search-and-shortcuts-steps",
      "kind": "screenshot",
      "src": "/documentation/es/work-search.png",
      "alt": "Resultados de búsqueda del identificador de una incidencia de demostración.",
      "caption": "La paleta encuentra la incidencia por identificador junto a las páginas del proyecto; abrir un resultado conserva sus reglas de acceso.",
      "revision": 23,
      "reviewed": true,
      "capturedAt": "2026-10-22",
      "viewport": [
        788,
        320
      ],
      "theme": "light",
      "padding": 24,
      "deviceScaleFactor": 2
    }
  ],
  "requiredFigures": [
    "navigation-steps",
    "search-and-shortcuts-steps"
  ]
}
---

La navegación permite acceder a tu trabajo personal o a un proyecto. La paleta de comandos encuentra una incidencia o acción concreta. Los paneles, la navegación móvil y las pestañas de escritorio ofrecen distintas formas de llegar. Antes de hacer cambios, comprueba el proyecto y la instancia seleccionados.

## Encontrar trabajo personal y cambiar de proyecto {#navigation}

La navegación principal da acceso a tu trabajo personal y a tus proyectos. Selecciona un proyecto para ver sus incidencias y destinos secundarios, como clasificación, objetivos, páginas y ajustes del proyecto. La fila de regreso sube un nivel de navegación; puede cambiar el contenido de la barra lateral mientras la página principal permanece abierta. Selecciona un destino para abrirlo. En una lista como clasificación, objetivos, sugerencias, revisión de código o rutinas, el campo de filtro de la parte superior de la barra lateral busca en todos los elementos, sean cuales sean los filtros que acotan la lista; su texto de ejemplo indica el total.

Los contadores y las alertas te acompañan entre niveles. El control que vuelve a **Inicio** muestra el total por clasificar en los proyectos que lista **Inicio**, incluido el actual, y la alerta de Smart Assign cuando a uno de tus proyectos le faltan reglas. Una fila de retorno muestra el contador del nivel al que regresa como insignia sobre su flecha, en ámbar mientras se aplique la alerta de Smart Assign. Dentro de un proyecto, **Clasificación** y **Sugerencias** conservan los contadores de ese proyecto. Las pestañas de la app de escritorio llevan la misma insignia que su entrada de la barra lateral: la alerta en **Inicio** y los contadores en **Bandeja de entrada**, **Revisión de código** y en **Clasificación** y **Sugerencias** de un proyecto, actualizados aunque la pestaña esté en segundo plano.

Los ciclos personales y las vistas entre proyectos abarcan los proyectos a los que tienes acceso. Los objetivos, las páginas y las sugerencias de un proyecto pertenecen a un único proyecto. Comprueba el proyecto activo antes de crear trabajo o modificar ajustes.

![Navegación del proyecto junto al tablero de incidencias de demostración.](/documentation/es/work-navigation.png)

### Actuar desde una fila de la barra lateral {#sidebar-menus}

Haz clic derecho en una fila de la barra lateral para actuar sobre lo que representa sin abrirlo primero. Las filas de enlace también ofrecen **Abrir en una pestaña nueva** y **Copiar enlace**. Una acción que mueve algo a la papelera siempre aparece al final, tras un separador.

- La fila **Todas las incidencias** ofrece **Nueva incidencia**, y la fila **Rutinas** ofrece **Nueva rutina** si eres propietario de un proyecto.
- Una fila de proyecto, o el nombre del proyecto en la parte superior de su panel, ofrece **Nuevo** (una incidencia, un objetivo o una página en ese proyecto) y **Ajustes del proyecto**. El propietario del proyecto también ve **Mover a la papelera**, que pide la misma confirmación que los ajustes del proyecto. El mismo menú también ofrece **Ocultar proyecto**, o **Mostrar proyecto** para un proyecto que ocultaste; consulta [Ocultar un proyecto para ti](/docs/projects#hide-project).
- Una pestaña de proyecto ofrece su propia creación: **Nueva incidencia** en Incidencias, **Nuevo objetivo** en Objetivos, **Nueva página** en Páginas y **Nueva sugerencia** en Sugerencias, que abre el formulario interno de sugerencias.
- Una fila de clasificación ofrece **Aceptar**, **Rechazar** y **Marcar como duplicada…**, que piden la misma confirmación o el mismo selector que el panel de clasificación, y después **Prioridad**, **Esfuerzo**, **Responsable**, **Categorías** y **Objetivo**, la copia de su identificador y **Mover a la papelera**. Un lector solo puede copiar el identificador. Consulta [Revisar el trabajo entrante en clasificación](/docs/issues#triage-incoming-work).
- Una fila de objetivo ofrece **Estado**, **Responsable** y **Color**, **Nueva incidencia** en ese objetivo, **Ver incidencias** en el tablero del proyecto y **Mover a la papelera**. Un lector solo ve **Ver incidencias**.
- Una fila de feedback ofrece **Estado**, salvo que lo fije una incidencia vinculada, **Objetivo**, **Categorías**, **Visibilidad** cuando el tablero público está activado, **Publicar** mientras la revisión de la IA la retiene, **Vincular a una incidencia existente**, **Fusionar con…** cuando otra solicitud puede recibirla, y **Mover a la papelera**. Las propiedades se cambian desde la fila; las demás acciones abren la solicitud y piden la misma confirmación que su panel.
- Una fila de rutina ofrece **Abrir la última ejecución** y, al propietario del proyecto, **Ejecutar ahora**, **Pausar** o **Reanudar**, **Editar** y **Mover a la papelera**. Consulta [Gestionar y comprobar ejecuciones](/es/documentacion/scheduled-routines#runs).
- Una fila de pull request ofrece los cambios que permite su estado actual, **Fusionar** cuando está lista y acciones de corrección cuando algo la bloquea. Consulta [Revisión y fusión](/es/documentacion/code-work#decision).

La acción se aplica a la fila en la que hiciste clic, aunque haya otro proyecto o elemento abierto.

### Paneles y navegación móvil {#panels}

Una incidencia se abre en un panel de detalle para mantener disponible el tablero que hay debajo. Una página abierta desde una mención o un enlace se abre del mismo modo, en un panel lateral con **Ampliar** para llegar a la página completa. Numo se abre desde su botón flotante en un panel de conversación compartido. La bandeja de entrada se abre como un panel emergente de navegación con notificaciones e invitaciones. Los antiguos enlaces a pantallas propias de la bandeja de entrada y Numo llevan a los accesos actuales; no representan pantallas independientes actuales.

En el móvil, abre el menú lateral de navegación para elegir los mismos destinos. La barra inferior de la pantalla reúne, de izquierda a derecha, el menú lateral de navegación, Numo, la búsqueda, el cuaderno de tareas y **Nuevo**; **Inicio** está en el menú lateral. Una barra de carga en la parte superior indica que la navegación está en curso, también mientras terminan los guardados pendientes de la página. Los paneles usan el ancho disponible, así que ciérralos o vuelve desde el panel actual para ver de nuevo la lista. Utiliza los botones visibles cuando no haya un atajo de teclado disponible.

### Pestañas de escritorio {#tabs}

La aplicación de escritorio añade pestañas nativas y un selector de servidor alrededor de la aplicación. Una pestaña es una superficie de navegación, no otra cuenta ni otra pertenencia a un proyecto. Comprueba la instancia seleccionada al cambiar de servidor. Consulta la guía de escritorio para la instalación, los atajos nativos y las actualizaciones; los permisos de páginas e incidencias siguen aplicándose.

## Encontrar trabajo y usar acciones de teclado {#search-and-shortcuts}

Abre la paleta de comandos desde el control de búsqueda de la navegación. Busca un título distintivo o un identificador de incidencia y elige un resultado. Los resultados se limitan al trabajo al que tu cuenta puede acceder; conocer un identificador no da acceso a otro proyecto. El comando Documentación abre el manual público en tu idioma actual.

En cuanto escribes, la paleta también encuentra rutinas, pull requests, vistas y notificaciones de la **Bandeja de entrada**; no aparecen en la lista que se muestra antes de escribir. Las rutinas y las pull requests aparecen si tu plan las incluye, y las pull requests abarcan las 100 actualizadas más recientemente en tus repositorios vinculados. Las vistas abarcan **Todas las incidencias** y el proyecto en el que estás. Elegir una rutina, una pull request o una vista la abre. Elegir una notificación abre la **Bandeja de entrada** en la pestaña que la lista, **Sin leer** o **Todos**, se desplaza hasta ella y la resalta un momento; sigue sin leer hasta que la abras. Los proyectos que ocultaste quedan fuera de estos resultados.

Lo que vinculas también se elige en la paleta. Añadir una relación, vincular una incidencia a una pull request o una pull request a una incidencia y adjuntar una página como recurso la abren solo con los elementos que puedes elegir, y su campo de búsqueda indica qué estás eligiendo. Para una relación, elige primero su tipo en el menú; la paleta muestra después las incidencias y objetivos que la admiten. Elegir un elemento lo vincula; Escape cierra la paleta sin vincular nada.

Pulsa Command+K en macOS o Ctrl+K en Windows/Linux para abrir la paleta de comandos; Command/Ctrl+P es un atajo alternativo de la aplicación. Fuera del texto editable, ? abre la ayuda de atajos y C la creación de incidencias. Sobre una tarjeta de incidencia bajo el puntero o en sus controles de detalle compatibles, S abre el estado, P la prioridad, E el esfuerzo, A el responsable, L las categorías, D la fecha límite y O el objetivo. R añade una relación desde esos mismos lugares, en la página de un objetivo y en el formulario de nueva incidencia: elige el tipo de relación y después la otra incidencia u objetivo. Si la tarjeta forma parte de una selección, estas teclas cambian todas las incidencias seleccionadas; el responsable, el objetivo, las categorías y las relaciones solo se aplican a las incidencias seleccionadas del proyecto de esa tarjeta. Mayús+C lleva a un campo de comentario listo para escribir, con el hilo desplazado hasta su último mensaje: el de una tarjeta de incidencia bajo el puntero o de una fila bajo el puntero en la lista de objetivos, sugerencias, pull requests, páginas o clasificación, o, si no hay nada bajo el puntero, el de la incidencia, el objetivo, la sugerencia, la pull request o la página en pantalla. Una página abre para ello su panel **Actividad**. Mayús+C solo actúa sobre ese elemento, aunque la tarjeta forme parte de una selección. En la página de un objetivo y en el formulario de nuevo objetivo, S abre su estado, A su responsable, D su fecha objetivo y C su color; ahí, C no crea una incidencia. Estas acciones de una sola tecla no interceptan la escritura en campos, áreas de texto ni editores de contenido. Las secuencias de navegación como G y después H (Inicio) o G y después I (Bandeja de entrada) usan dos teclas sucesivas. G y después W lleva a Páginas solo dentro de un proyecto. En **Inicio** y en el panel de Numo ampliado, una ráfaga rápida de teclas se escribe en cambio en el campo de redacción de Numo, y una sola tecla ejecuta su atajo tras una breve pausa ([escribir a Numo](/docs/numo#work-with-numo)).

Para llegar a un ajuste, escribe su nombre en la paleta de comandos o en el campo de filtro de la parte superior de la barra lateral de ajustes. Ambos encuentran cada tarjeta de ajustes y los ajustes individuales, como el idioma, el tema, cada paleta, la transparencia y los dos interruptores de **Iniciar una incidencia**. Al elegir un resultado se abre la pestaña de ajustes correcta, se desplaza hasta la tarjeta o la fila y la resalta. Comando+T en macOS o Ctrl+T en Windows/Linux abre la paleta de nueva pestaña; un ajuste elegido allí se abre en una nueva pestaña de la app. Dentro de un proyecto, también ofrece **Nueva página**, que crea una página en ese proyecto y la abre en una nueva pestaña. Las palabras clave en inglés y en francés funcionan sea cual sea el idioma de la interfaz.

Comando+F en macOS o Ctrl+F en Windows/Linux busca en la página o el cuaderno de tareas en pantalla con la [barra de búsqueda y reemplazo](/es/documentacion/pages#find-and-replace) de minddy. En otras pantallas, y cuando hay otro cuadro de diálogo abierto sobre la página, abre la búsqueda del navegador.

Utiliza la ayuda de atajos para consultar los comandos disponibles en tu plataforma. minddy distingue los atajos de la aplicación, las acciones de propiedades de incidencias y los atajos nativos de pestañas o ventanas de escritorio. Comprueba dónde está el foco antes de usar un comando: escribir en un editor y actuar sobre la incidencia que lo rodea son contextos diferentes.

![Resultados de búsqueda del identificador de una incidencia de demostración.](/documentation/es/work-search.png)

### Orden de las incidencias en la búsqueda {#issue-search-order}

Todas las búsquedas de incidencias muestran las incidencias en el mismo orden: la paleta, las menciones `@`, los selectores de relaciones, duplicados y pull requests, el diálogo **Vincular a una incidencia existente** de los comentarios y la búsqueda que usan Numo y los agentes MCP. Las incidencias **En curso** y **En revisión** van primero, luego las de **Backlog** y **Pendiente**. Las incidencias en **Clasificación**, **Hecha**, **Cancelada** y **Duplicada** siempre van al final y siguen siendo seleccionables. Dentro de cada grupo, la mejor coincidencia de texto va primero. Un identificador escrito completo, como `MIN-42`, pone esa incidencia primero, sea cual sea su estado.

### Buscar incidencias por el sentido {#search-by-meaning}

Cuando una búsqueda describe el trabajo en lugar de nombrarlo, la búsqueda de incidencias también encuentra incidencias de sentido parecido, aunque usen otras palabras. Por ejemplo, «el inicio de sesión falla tras restablecer la contraseña» puede encontrar una incidencia titulada «Sesión perdida al cambiar la contraseña». Esto se aplica a la paleta de comandos, las menciones `@` en descripciones, páginas, comentarios y el compositor de Numo, los selectores de relaciones, **Marcar como duplicada…** en el triaje, **Vincular una incidencia** en una pull request, el menú **Añadir contexto** → **Incidencia** de Numo y **Vincular a una incidencia existente** en el feedback.

Las coincidencias de texto y los identificadores exactos aparecen siempre primero y conservan su orden. Poco después de que dejes de escribir, se añaden detrás, bajo **Relacionadas por significado**, como máximo cinco incidencias encontradas por el sentido. Mientras llegan, una línea **Buscando por significado…** indica que la búsqueda sigue en curso (en la paleta de comandos, solo cuando ningún resultado de texto coincide). Si no se encuentra ninguna, indica **Ninguna incidencia relacionada por significado**; un menú `@` sin coincidencias de texto se cierra en su lugar. Una incidencia ya mostrada no se repite y la fila resaltada no se mueve. Cada selector conserva sus propias reglas, así que solo aparecen incidencias que ya podía ofrecer: un selector de relaciones, por ejemplo, sigue ofreciendo solo incidencias del mismo proyecto que aún no están vinculadas. La paleta de comandos busca en los proyectos que puedes leer, hasta los 25 actualizados más recientemente; sus acciones de selección múltiple no usan la búsqueda por el sentido.

La búsqueda por el sentido tiene estos límites:

- La búsqueda necesita al menos dos palabras, o una palabra de al menos seis letras. Los identificadores como `MIN-42`, `#42` o `42`, y las búsquedas muy cortas, solo usan la búsqueda de texto.
- Se basa en el índice que Smart Fill construye con el título y la descripción de las incidencias. Una incidencia aún no indexada, o cuyo autor desactivó [**Indexar incidencias**](/docs/issues#smart-fill-preferences), solo se encuentra por sus palabras. Las incidencias de la papelera nunca aparecen.
- Si desactivaste **Indexar incidencias** en **Ajustes de la cuenta** → **Smart Fill** → **Indexación de incidencias**, tus búsquedas solo comparan palabras. Lo mismo ocurre cuando tu presupuesto de IA está agotado o cuando el proveedor no responde en pocos segundos. Los resultados de texto se mantienen y no se muestra ningún error.
- Una consulta `@` cuyo texto ya coincide con una persona, un proyecto o una página no se busca por el sentido. En un proyecto con más de 3000 incidencias indexadas, solo se comparan las 3000 indexadas más recientemente; las demás se encuentran por sus palabras.

Cada búsqueda nueva usa una llamada de IA, que cuenta en tu parte **Automatizaciones** y aparece en el historial de uso como **Búsqueda de incidencias**. Una búsqueda repetida en unos 15 minutos normalmente no se cobra de nuevo.

### Usar un control visible equivalente {#shortcut-alternatives}

Los campos de las incidencias tienen selectores de propiedades visibles además de acciones de teclado. Úsalos en el móvil o cuando el navegador o sistema operativo intercepte un atajo. Cierra un panel superpuesto o devuelve el foco a la superficie prevista antes de intentar otra acción.

La búsqueda puede encontrar una incidencia ausente de la vista filtrada actual. Si falta un resultado, confirma proyecto, cuenta e instancia y usa una consulta más distintiva. No crees un duplicado solo porque el tablero oculte la tarea. La documentación pública tiene su propia búsqueda textual localizada, independiente de Numo y de la configuración de proveedores.

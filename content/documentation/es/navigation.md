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
  "revision": 13,
  "sourceRevision": 13,
  "owner": "@mangue-dev",
  "updatedAt": "2026-10-20",
  "compatibility": {
    "version": "0.11.1 development (UI refinements); MIN-685 sidebar context menus; MIN-692 hidden projects; MIN-718 hybrid issue search; MIN-726 issue search order; MIN-733 always-on AI features; MIN-737 account settings reorganization; MIN-749 relation shortcut R",
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
      "components/create-issue-dialog.tsx"
    ]
  },
  "review": {
    "revision": 13,
    "fact": "agent:/root/german_spanish_review (structural consolidation review; prior procedural evidence retained; no operational rerun); agent:/root (visual usefulness, figure framing and preserved procedures; previous operational evidence retained); agent:/root (Documentation command and mobile transition source review; unchanged evidence retained); agent:/root (MIN-685 sidebar context menu source review inherited from en revision 7; es translation of added passages; no operational rerun); agent:/root (MIN-692 hidden-project source, route and unit-test review; no browser walkthrough; unchanged evidence retained); agent:/root (MIN-718 hybrid issue search source and unit-test review; no browser walkthrough, no new captures; unchanged evidence retained); agent:/root (MIN-695 badge propagation: source and unit-test review of app-shell-chrome, app-sidebar, mobile-navigation, app-tab-strip and lib/app-tab-indicators; no browser walkthrough, no new captures; unchanged evidence retained); agent:/root (MIN-733 removal of the instance AI switches: source and unit-test review of the admin registry and every former switch reader; no browser walkthrough, no new captures; unchanged evidence retained); agent:/root (MIN-737 account settings reorganization: source review of the Issue indexing card, the settings section catalog, the settings filter and the new-tab palette hand-off in lib/settings-sections.ts and lib/settings-section-focus.ts; unchanged evidence retained; no browser walkthrough, no new captures); agent:/root (MIN-749 relation shortcut R: source and unit-test review of components/issue-field-shortcuts.tsx, the board card, issue panel, objective page and new-issue dialog relation pickers and lib/keyboard/shortcuts.ts; no browser walkthrough, no new captures; unchanged evidence retained)",
    "language": "agent:/root/german_spanish_review (es title, summary, lead and heading review; retained body comparison); agent:/root/editorial_de_es (editorial clarity pass); agent:/root (figure removals and captions); agent:/root (es changed-passage parity and label review); agent:/root (es translation of MIN-685 added passages with catalog UI labels, equivalent meaning self-reviewed; agent review, not human acceptance); agent:/root (es MIN-692 added passages, label and retained-meaning self-review; agent review, not human acceptance); agent:/root (es translation of MIN-718 added passages with catalog UI labels, equivalent meaning self-reviewed; agent review, not human acceptance); agent:/root (es MIN-695 badge paragraph, catalog UI labels and retained-meaning self-review; agent review, not human acceptance); agent:/root (es removal of the sentences describing instance AI switches; retained-meaning self-review; agent review, not human acceptance); agent:/root (es MIN-737 changed passages with catalog UI labels; retained-meaning self-review; agent review, not human acceptance); agent:/root (es translation of MIN-749 added sentences, equivalent meaning self-reviewed; agent review, not human acceptance)",
    "date": "2026-10-20"
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
      "revision": 13,
      "reviewed": true,
      "capturedAt": "2026-10-08",
      "viewport": [
        1488,
        1128
      ],
      "theme": "light",
      "padding": 24
    },
    {
      "id": "search-and-shortcuts-steps",
      "kind": "screenshot",
      "src": "/documentation/es/work-search.png",
      "alt": "Resultados de búsqueda del identificador de una incidencia de demostración.",
      "caption": "La paleta encuentra la incidencia por identificador junto a las páginas del proyecto; abrir un resultado conserva sus reglas de acceso.",
      "revision": 13,
      "reviewed": true,
      "capturedAt": "2026-10-08",
      "viewport": [
        788,
        364
      ],
      "theme": "light",
      "padding": 24
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

La navegación principal da acceso a tu trabajo personal y a tus proyectos. Selecciona un proyecto para ver sus incidencias y destinos secundarios, como clasificación, objetivos, páginas y ajustes del proyecto. La fila de regreso sube un nivel de navegación; puede cambiar el contenido de la barra lateral mientras la página principal permanece abierta. Selecciona un destino para abrirlo.

Los contadores y las alertas te acompañan entre niveles. El control que vuelve a **Inicio** muestra el total por clasificar en los proyectos que lista **Inicio**, incluido el actual, y la alerta de Smart Assign cuando a uno de tus proyectos le faltan reglas. Una fila de retorno muestra el contador del nivel al que regresa. Dentro de un proyecto, **Clasificación** y **Sugerencias** conservan los contadores de ese proyecto. Las pestañas de la app de escritorio llevan la misma insignia que su entrada de la barra lateral: la alerta en **Inicio** y los contadores en **Caja de entrada**, **Revisión de código** y en **Clasificación** y **Sugerencias** de un proyecto, actualizados aunque la pestaña esté en segundo plano.

Los ciclos personales y las vistas entre proyectos abarcan los proyectos a los que tienes acceso. Los objetivos, la wiki y las sugerencias de un proyecto pertenecen a un único proyecto. Comprueba el proyecto activo antes de crear trabajo o modificar ajustes.

![Navegación del proyecto junto al tablero de incidencias de demostración.](/documentation/es/work-navigation.png)

### Actuar desde una fila de la barra lateral {#sidebar-menus}

Haz clic derecho en una fila de la barra lateral para actuar sobre lo que representa sin abrirlo primero. Las filas de enlace también ofrecen **Abrir en una pestaña nueva** y **Copiar enlace**. Una acción que mueve algo a la papelera siempre aparece al final, tras un separador.

- La fila **Todas las incidencias** ofrece **Nueva incidencia**, y la fila **Rutinas** ofrece **Nueva rutina** si eres propietario de un proyecto.
- Una fila de proyecto, o el nombre del proyecto en la parte superior de su panel, ofrece **Nuevo** (una incidencia, un objetivo o una página en ese proyecto) y **Configuración del proyecto**. El propietario del proyecto también ve **Mover a la papelera**, que pide la misma confirmación que la configuración del proyecto. El mismo menú también ofrece **Ocultar proyecto**, o **Mostrar proyecto** para un proyecto que ocultaste; consulta [Ocultar un proyecto para ti](/docs/projects#hide-project).
- Una pestaña de proyecto ofrece su propia creación: **Nueva incidencia** en Incidencias, **Nuevo objetivo** en Objetivos, **Nueva página** en Páginas y **Nueva sugerencia** en Sugerencias, que abre el formulario interno de sugerencias.
- Una fila de rutina ofrece **Abrir la última ejecución** y, al propietario del proyecto, **Ejecutar ahora**, **Pausar** o **Reactivar**, **Editar** y **Mover a la papelera**. Consulta [Gestionar y comprobar ejecuciones](/es/documentacion/scheduled-routines#runs).
- Una fila de pull request ofrece los cambios que permite su estado actual, **Fusionar** cuando está lista y acciones de corrección cuando algo la bloquea. Consulta [Revisión y fusión](/es/documentacion/code-work#decision).

La acción se aplica a la fila en la que hiciste clic, aunque haya otro proyecto o elemento abierto.

### Paneles y navegación móvil {#panels}

En móviles, una barra de carga en la parte superior indica que la navegación está en curso, también mientras terminan los guardados pendientes de la página.

Una incidencia se abre en un panel de detalle para mantener disponible el tablero que hay debajo. Numo se abre desde su botón flotante en un panel de conversación compartido. La bandeja de entrada se abre como un panel emergente de navegación con notificaciones e invitaciones. Los antiguos enlaces a pantallas propias de la bandeja de entrada y Numo llevan a los accesos actuales; no representan pantallas independientes actuales.

En el móvil, abre el menú lateral de navegación para elegir los mismos destinos. Los paneles usan el ancho disponible, así que ciérralos o vuelve desde el panel actual para ver de nuevo la lista. Utiliza los botones visibles cuando no haya un atajo de teclado disponible.

### Pestañas de escritorio {#tabs}

La aplicación de escritorio añade pestañas nativas y un selector de servidor alrededor de la aplicación. Una pestaña es una superficie de navegación, no otra cuenta ni otra pertenencia a un proyecto. Comprueba la instancia seleccionada al cambiar de servidor. Consulta la guía de escritorio para la instalación, los atajos nativos y las actualizaciones; los permisos de páginas e incidencias siguen aplicándose.

## Encontrar trabajo y usar acciones de teclado {#search-and-shortcuts}

El comando Documentación abre el manual público en tu idioma actual.

Abre la paleta de comandos desde el control de búsqueda de la navegación. Busca un título distintivo o un identificador de incidencia y elige un resultado. Los resultados se limitan al trabajo al que tu cuenta puede acceder; conocer un identificador no da acceso a otro proyecto.

Pulsa Command+K en macOS o Ctrl+K en Windows/Linux para abrir la paleta de comandos; Command/Ctrl+P es un atajo alternativo de la aplicación. Fuera del texto editable, ? abre la ayuda de atajos y C la creación de incidencias. Sobre una tarjeta de incidencia bajo el puntero o en sus controles de detalle compatibles, S abre el estado, P la prioridad, E el esfuerzo, A el responsable, L las categorías, D la fecha límite y O el objetivo. R añade una relación desde esos mismos lugares, en la página de un objetivo y en el formulario de nueva incidencia: elige el tipo de relación y después la otra incidencia u objetivo. Estas acciones de una sola tecla no interceptan la escritura en campos, áreas de texto ni editores de contenido. Las secuencias de navegación como G y después H (Inicio) o G y después I (Bandeja de entrada) usan dos teclas sucesivas. G y después W lleva a Páginas solo dentro de un proyecto.

Para llegar a un ajuste, escribe su nombre en la paleta de comandos o en el campo de filtro de la parte superior de la barra lateral de ajustes. Ambos encuentran cada tarjeta de ajustes y los ajustes individuales, como el idioma, el tema, cada paleta, la transparencia y los dos interruptores de **Iniciar una incidencia**. Al elegir un resultado se abre la pestaña de ajustes correcta, se desplaza hasta la tarjeta o la fila y la resalta. Comando+T en macOS o Ctrl+T en Windows/Linux abre la paleta de nueva pestaña; un ajuste elegido allí se abre en una nueva pestaña de la app. Las palabras clave en inglés y en francés funcionan sea cual sea el idioma de la interfaz.

Utiliza la ayuda de atajos para consultar los comandos disponibles en tu plataforma. minddy distingue los atajos de la aplicación, las acciones de propiedades de incidencias y los atajos nativos de pestañas o ventanas de escritorio. Comprueba dónde está el foco antes de usar un comando: escribir en un editor y actuar sobre la incidencia que lo rodea son contextos diferentes.

![Resultados de búsqueda del identificador de una incidencia de demostración.](/documentation/es/work-search.png)

### Orden de las incidencias en la búsqueda {#issue-search-order}

Todas las búsquedas de incidencias muestran las incidencias en el mismo orden: la paleta, las menciones `@`, los selectores de relaciones, duplicados y pull requests, el diálogo **Vincular a una incidencia existente** de los comentarios y la búsqueda que usan Numo y los agentes MCP. Las incidencias **En curso** y **En examen** van primero, luego las de **Registro** y **Pendiente**. Las incidencias en **Clasificación**, **Hecho**, **Cancelado** y **Duplicado** siempre van al final y siguen siendo seleccionables. Dentro de cada grupo, la mejor coincidencia de texto va primero. Un identificador escrito completo, como `MIN-42`, pone esa incidencia primero, sea cual sea su estado.

### Buscar incidencias por el sentido {#search-by-meaning}

Cuando una búsqueda describe el trabajo en lugar de nombrarlo, la búsqueda de incidencias también encuentra incidencias de sentido parecido, aunque usen otras palabras. Por ejemplo, «el inicio de sesión falla tras restablecer la contraseña» puede encontrar una incidencia titulada «Sesión perdida al cambiar la contraseña». Esto se aplica a la paleta de comandos, las menciones `@` en descripciones, páginas, comentarios y el compositor de Numo, los selectores de relaciones, **Marcar como duplicado...** en el triaje, **Vincular una incidencia** en una pull request, el menú **Añadir contexto** → **Incidencia** de Numo y **Vincular a una incidencia existente** en el feedback.

Las coincidencias de texto y los identificadores exactos aparecen siempre primero y conservan su orden. Poco después de que dejes de escribir, se añaden detrás, bajo **Relacionadas por el sentido**, como máximo cinco incidencias encontradas por el sentido. Una incidencia ya mostrada no se repite y la fila resaltada no se mueve. Cada selector conserva sus propias reglas, así que solo aparecen incidencias que ya podía ofrecer: un selector de relaciones, por ejemplo, sigue ofreciendo solo incidencias del mismo proyecto que aún no están vinculadas. La paleta de comandos busca en los proyectos que puedes leer, hasta los 25 actualizados más recientemente; sus acciones de selección múltiple no usan la búsqueda por el sentido.

La búsqueda por el sentido tiene estos límites:

- La búsqueda necesita al menos dos palabras, o una palabra de al menos seis letras. Los identificadores como `MIN-42`, `#42` o `42`, y las búsquedas muy cortas, solo usan la búsqueda de texto.
- Se basa en el índice que Rellenado inteligente construye con el título y la descripción de las incidencias. Una incidencia aún no indexada, o cuyo autor desactivó [**Indexar incidencias**](/docs/issues#smart-fill-preferences), solo se encuentra por sus palabras. Las incidencias de la papelera nunca aparecen.
- Si desactivaste **Indexar incidencias** en **Configuración de la cuenta** → **Smart Fill** → **Indexación de incidencias**, tus búsquedas solo comparan palabras. Lo mismo ocurre cuando tu presupuesto de IA está agotado o cuando el proveedor no responde en pocos segundos. Los resultados de texto se mantienen y no se muestra ningún error.
- Una consulta `@` cuyo texto ya coincide con una persona, un proyecto o una página no se busca por el sentido. En un proyecto con más de 3000 incidencias indexadas, solo se comparan las 3000 indexadas más recientemente; las demás se encuentran por sus palabras.

Cada búsqueda nueva usa una llamada de IA, que cuenta en tu parte **Automatizaciones** y aparece en el historial de uso como **Búsqueda de incidencias**. Una búsqueda repetida en unos 15 minutos normalmente no se cobra de nuevo.

### Usar un control visible equivalente {#shortcut-alternatives}

Los campos de las incidencias tienen selectores de propiedades visibles además de acciones de teclado. Úsalos en el móvil o cuando el navegador o sistema operativo intercepte un atajo. Cierra un panel superpuesto o devuelve el foco a la superficie prevista antes de intentar otra acción.

La búsqueda puede encontrar una incidencia ausente de la vista filtrada actual. Si falta un resultado, confirma proyecto, cuenta e instancia y usa una consulta más distintiva. No crees un duplicado solo porque el tablero oculte la tarea. La documentación pública tiene su propia búsqueda textual localizada, independiente de Numo y de la configuración de proveedores.

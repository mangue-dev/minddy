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
  "revision": 4,
  "sourceRevision": 4,
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
      "components/app-sidebar.tsx",
      "components/secondary-sidebar.tsx",
      "content/knowledge/agents-and-mcp.md",
      "content/knowledge/productivity.md",
      "components/command-palette.tsx",
      "components/keyboard-cheatsheet.tsx",
      "components/issue-field-shortcuts.tsx",
      "lib/keyboard/shortcuts.ts",
      "lib/keyboard/keyboard-context.tsx"
    ]
  },
  "review": {
    "revision": 4,
    "fact": "agent:/root/german_spanish_review (structural consolidation review; prior procedural evidence retained; no operational rerun)",
    "language": "agent:/root/german_spanish_review (es title, summary, lead and heading review; retained body comparison)",
    "date": "2026-10-09"
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
      "revision": 4,
      "reviewed": true,
      "capturedAt": "2026-10-08",
      "viewport": [
        1440,
        1080
      ],
      "theme": "light"
    },
    {
      "id": "search-and-shortcuts-steps",
      "kind": "screenshot",
      "src": "/documentation/es/work-search.png",
      "alt": "Resultados de búsqueda del identificador de una incidencia de demostración.",
      "caption": "La paleta encuentra la incidencia por identificador junto a las páginas del proyecto; abrir un resultado conserva sus reglas de acceso.",
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
    "navigation-steps",
    "search-and-shortcuts-steps"
  ]
}
---

La navegación conecta el trabajo personal con los proyectos y sus distintas áreas. Esta guía explica los paneles, la navegación móvil y las pestañas de escritorio, además de la búsqueda y los atajos para encontrar contenido al que tu cuenta tiene acceso.

## Encontrar trabajo personal y cambiar de proyecto {#navigation}

La navegación principal da acceso a tu trabajo personal y a tus proyectos. Selecciona un proyecto para ver sus incidencias y destinos secundarios, como clasificación, objetivos, páginas y ajustes del proyecto. La fila de regreso sube un nivel de navegación; puede cambiar el contenido de la barra lateral mientras la página principal permanece abierta. Selecciona un destino para abrirlo.

Los ciclos personales y las vistas entre proyectos abarcan los proyectos a los que tienes acceso. Los objetivos, la wiki y los comentarios de un proyecto pertenecen a un único proyecto. Comprueba el proyecto activo antes de crear trabajo o modificar ajustes.

![Navegación del proyecto junto al tablero de incidencias de demostración.](/documentation/es/work-navigation.png)

### Paneles y navegación móvil {#panels}

Una incidencia se abre en un panel de detalle para mantener disponible el tablero que hay debajo. Numo se abre desde su botón flotante en un panel de conversación compartido. La bandeja de entrada se abre como un panel emergente de navegación con notificaciones e invitaciones. Los antiguos enlaces a pantallas propias de la bandeja de entrada y Numo llevan a los accesos actuales; no representan pantallas independientes actuales.

En el móvil, abre el menú lateral de navegación para elegir los mismos destinos. Los paneles usan el ancho disponible, así que ciérralos o vuelve desde el panel actual para ver de nuevo la lista. Utiliza los botones visibles cuando no haya un atajo de teclado disponible.

### Pestañas de escritorio {#tabs}

La aplicación de escritorio añade pestañas nativas y un selector de servidor alrededor de la aplicación. Una pestaña es una superficie de navegación, no otra cuenta ni otra pertenencia a un proyecto. Comprueba la instancia seleccionada al cambiar de servidor. Consulta la guía de escritorio para la instalación, los atajos nativos y las actualizaciones; los permisos de páginas e incidencias siguen aplicándose.

## Encontrar trabajo y usar acciones de teclado {#search-and-shortcuts}

Abre la paleta de comandos desde el control de búsqueda de la navegación. Busca un título distintivo o un identificador de incidencia y elige un resultado. Los resultados se limitan al trabajo al que tu cuenta puede acceder; conocer un identificador no da acceso a otro proyecto.

Pulsa Command+K en macOS o Ctrl+K en Windows/Linux para abrir la paleta de comandos; Command/Ctrl+P es un atajo alternativo de la aplicación. Fuera del texto editable, ? abre la ayuda de atajos y C la creación de incidencias. Sobre una tarjeta de incidencia bajo el puntero o en sus controles de detalle compatibles, S abre el estado, P la prioridad, E el esfuerzo, A el responsable, L las categorías, D la fecha límite y O el objetivo. Estas acciones de una sola tecla no interceptan la escritura en campos, áreas de texto ni editores de contenido. Las secuencias de navegación como G y después H (Inicio) o G y después I (Bandeja de entrada) usan dos teclas sucesivas. G y después W lleva a Páginas solo dentro de un proyecto.

Utiliza la ayuda de atajos para consultar los comandos disponibles en tu plataforma. Minddy distingue los atajos de la aplicación, las acciones de propiedades de incidencias y los atajos nativos de pestañas o ventanas de escritorio. Comprueba dónde está el foco antes de usar un comando: escribir en un editor y actuar sobre la incidencia que lo rodea son contextos diferentes.

![Resultados de búsqueda del identificador de una incidencia de demostración.](/documentation/es/work-search.png)

### Usar un control visible equivalente {#shortcut-alternatives}

Los campos de las incidencias tienen selectores de propiedades visibles además de acciones de teclado. Úsalos en el móvil o cuando el navegador o sistema operativo intercepte un atajo. Cierra un panel superpuesto o devuelve el foco a la superficie prevista antes de intentar otra acción.

La búsqueda puede encontrar una incidencia ausente de la vista filtrada actual. Si falta un resultado, confirma proyecto, cuenta e instancia y usa una consulta más distintiva. No crees un duplicado solo porque el tablero oculte la tarea. La documentación pública tiene su propia búsqueda textual localizada, independiente de Numo y de la configuración de proveedores.

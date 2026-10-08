---
{
  "id": "search-and-shortcuts",
  "locale": "es",
  "title": "Encontrar trabajo y usar acciones de teclado",
  "summary": "Busca trabajo accesible, consulta la ayuda de atajos y mantén el foco en el objeto previsto.",
  "topic": "Planificar y encontrar trabajo",
  "type": "guide",
  "audiences": [
    "member"
  ],
  "workflows": [
    "W15"
  ],
  "visibility": "public",
  "status": "published",
  "revision": 2,
  "sourceRevision": 2,
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
      "components/command-palette.tsx",
      "components/keyboard-cheatsheet.tsx",
      "components/issue-field-shortcuts.tsx",
      "lib/keyboard/shortcuts.ts",
      "lib/keyboard/keyboard-context.tsx"
    ]
  },
  "review": {
    "revision": 2,
    "fact": "2026-10-08",
    "language": "2026-10-08",
    "date": "2026-10-08"
  },
  "related": [
    "navigation",
    "views-and-filters",
    "desktop-app"
  ],
  "aliases": [],
  "tags": [],
  "figures": [
    {
      "id": "search-and-shortcuts-steps",
      "kind": "screenshot",
      "src": "/documentation/es/work-search.png",
      "alt": "Resultados de búsqueda del identificador de una incidencia de demostración.",
      "caption": "La paleta encuentra la incidencia por identificador junto a las páginas del proyecto; abrir un resultado conserva sus reglas de acceso.",
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
    "search-and-shortcuts-steps"
  ]
}
---

## Buscar un objeto {#search-and-shortcuts}

Abre la paleta de comandos desde el control de búsqueda de la navegación. Busca un título distintivo o un identificador de incidencia y elige un resultado. Los resultados se limitan al trabajo al que tu cuenta puede acceder; conocer un identificador no da acceso a otro proyecto.

Pulsa Command+K en macOS o Ctrl+K en Windows/Linux para abrir la paleta de comandos; Command/Ctrl+P es un atajo alternativo de la aplicación. Fuera del texto editable, ? abre la ayuda de atajos y C la creación de incidencias. Sobre una tarjeta de incidencia bajo el puntero o en sus controles de detalle compatibles, S abre el estado, P la prioridad, E el esfuerzo, A el responsable, L las categorías, D la fecha límite y O el objetivo. Estas acciones de una sola tecla no interceptan la escritura en campos, áreas de texto ni editores de contenido. Las secuencias de navegación como G y después H (Inicio) o G y después I (Bandeja de entrada) usan dos teclas sucesivas. G y después W lleva a Páginas solo dentro de un proyecto.

Utiliza la ayuda de atajos para consultar los comandos disponibles en tu plataforma. Minddy distingue los atajos de la aplicación, las acciones de propiedades de incidencias y los atajos nativos de pestañas o ventanas de escritorio. Comprueba dónde está el foco antes de usar un comando: escribir en un editor y actuar sobre la incidencia que lo rodea son contextos diferentes.

![Resultados de búsqueda del identificador de una incidencia de demostración.](/documentation/es/work-search.png)

## Usar un control visible equivalente {#shortcut-alternatives}

Los campos de las incidencias tienen selectores de propiedades visibles además de acciones de teclado. Úsalos en el móvil o cuando el navegador o sistema operativo intercepte un atajo. Cierra un panel superpuesto o devuelve el foco a la superficie prevista antes de intentar otra acción.

La búsqueda puede encontrar una incidencia ausente de la vista filtrada actual. Si falta un resultado, confirma proyecto, cuenta e instancia y usa una consulta más distintiva. No crees un duplicado solo porque el tablero oculte la tarea. La documentación pública tiene su propia búsqueda textual localizada, independiente de Numo y de la configuración de proveedores.

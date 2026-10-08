---
{
  "id": "page-editor",
  "locale": "es",
  "title": "Escribir una página con bloques y menciones",
  "summary": "Usa contenido estructurado, avisos y enlaces, y comprueba que se guarden las ediciones.",
  "topic": "Páginas y bases de datos",
  "type": "guide",
  "audiences": [
    "member"
  ],
  "workflows": [
    "P02"
  ],
  "visibility": "public",
  "status": "published",
  "revision": 1,
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
      "components/pages/page-editor.tsx",
      "components/pages/page-slash-command.tsx",
      "content/knowledge/pages.md"
    ]
  },
  "review": {
    "revision": 1,
    "fact": "2026-10-08",
    "language": "2026-10-08",
    "date": "2026-10-08"
  },
  "related": [
    "page-history",
    "page-files",
    "page-comments-and-collaboration"
  ],
  "aliases": [],
  "tags": [],
  "figures": [
    {
      "id": "page-editor-steps",
      "kind": "screenshot",
      "src": "/documentation/es/page-editor.png",
      "alt": "Página de demostración con títulos, párrafos, casillas de tareas y una mención a un ticket.",
      "caption": "Los títulos, las tareas y la mención AUR-2 estructuran la página. El contenido es un ejemplo de demostración.",
      "revision": 1,
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
    "page-editor-steps"
  ]
}
---

## Escribir el documento {#page-editor}

Abre la página y edita su título o cuerpo como miembro del proyecto. Usa el menú de comandos de barra y los controles de formato para insertar encabezados, párrafos, listas, tareas, código, secciones plegables y avisos. Un aviso puede tener un icono emoji y un color de la paleta; elígelos para distinguir información útil, no como única forma de comunicar una advertencia.

Utiliza menciones para enlazar incidencias, objetivos, personas o páginas relevantes. Los enlaces inversos ayudan a encontrar páginas que hacen referencia a la actual. Un enlace aporta contexto, no acceso a un objeto privado de otro proyecto.


![Página de demostración con títulos, párrafos, casillas de tareas y una mención a un ticket.](/documentation/es/page-editor.png)

## Guardado y portabilidad {#editor-save}

Observa el indicador de guardado antes de salir de una edición importante. Si otra edición crea un conflicto, usa los controles de recuperación mostrados y conserva el texto; no supongas que ambas se fusionaron. El historial puede ayudar a examinar versiones guardadas anteriormente.

Las exportaciones Markdown y las lecturas de páginas por agentes conservan iconos y colores de avisos en su representación admitida. Los formatos difieren en fidelidad y tratamiento de adjuntos, así que comprueba el documento resultante antes de sustituir una fuente original. Usa bloques de código para comandos literales y conserva sus requisitos y advertencias en el texto que los rodea.

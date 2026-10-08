---
{
  "id": "page-history",
  "locale": "es",
  "title": "Examinar y restaurar una versión de página",
  "summary": "Previsualiza el historial guardado antes de sustituir el documento actual.",
  "topic": "Páginas y bases de datos",
  "type": "guide",
  "audiences": [
    "member"
  ],
  "workflows": [
    "P05"
  ],
  "visibility": "public",
  "status": "published",
  "revision": 3,
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
      "components/pages/page-history.tsx",
      "lib/server/page-versions.ts"
    ]
  },
  "review": {
    "revision": 3,
    "fact": "2026-10-08",
    "language": "2026-10-08",
    "date": "2026-10-08"
  },
  "related": [
    "page-editor",
    "create-and-organize-pages",
    "trash-and-recovery"
  ],
  "aliases": [],
  "tags": [],
  "figures": [
    {
      "id": "page-history-steps",
      "kind": "screenshot",
      "src": "/documentation/es/page-history-preview.png",
      "alt": "Pestaña Versiones con un estado anterior desplegado, su autor, Restaurar y el aviso de conservación durante 30 días.",
      "caption": "Previsualiza un estado guardado y compáralo con la página actual antes de restaurarlo.",
      "revision": 3,
      "reviewed": true,
      "capturedAt": "2026-10-08",
      "viewport": [
        1440,
        900
      ],
      "theme": "light"
    }
  ],
  "requiredFigures": [
    "page-history-steps"
  ]
}
---

## Examinar versiones guardadas {#page-history}

Abre el indicador de guardado o historial de la página para ver versiones, o el control de comentarios y actividad para examinar acciones. Estas pestañas responden a preguntas distintas: una versión guardada es un estado del documento, mientras que la actividad puede incluir cambios de nombre, eliminación o restauración sin la misma instantánea de contenido.

Selecciona una versión para previsualizarla antes de restaurar. El historial identifica autores y actividad de agentes, así que compara el contenido con el cambio que quieres deshacer. La interfaz anuncia un historial de 30 días; no lo trates como una copia externa permanente.

## Restaurar y comprobar {#restore-page-version}

Como miembro autorizado, restaura la versión seleccionada solo después de revisar el contenido actual que sustituirá. El estado previo a la restauración también entra en el historial y puede recuperarse más adelante mientras se conserve.

Vuelve a abrir o actualiza el editor después de restaurar y comprueba el cuerpo real de la página. Un editor ya abierto mantiene una versión anticuada y no debe sobrescribir a ciegas el estado restaurado. Las versiones de página no son copias completas de la instancia: los bytes de adjuntos, archivos eliminados u objetos relacionados pueden tener ciclos de vida separados. Usa las guías de archivos y recuperación del operador cuando falte información fuera del cuerpo guardado.


![Pestaña Versiones con un estado anterior desplegado, su autor, Restaurar y el aviso de conservación durante 30 días.](/documentation/es/page-history-preview.png)

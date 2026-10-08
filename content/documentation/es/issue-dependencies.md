---
{
  "id": "issue-dependencies",
  "locale": "es",
  "title": "Enlazar dependencias e incidencias relacionadas",
  "summary": "Indica qué trabajo bloquea otra tarea y distingue las relaciones de la jerarquía.",
  "topic": "Proyectos e incidencias",
  "type": "guide",
  "audiences": [
    "member"
  ],
  "workflows": [
    "W05"
  ],
  "visibility": "public",
  "status": "published",
  "revision": 4,
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
      "content/knowledge/core-tracker.md",
      "components/issue-side-panel.tsx",
      "components/issue-indicators.tsx",
      "captures/shots/relations/intent.md",
      "lib/server/issue-relations.ts",
      "lib/relation-constants.ts"
    ]
  },
  "review": {
    "revision": 4,
    "fact": "2026-10-08",
    "language": "2026-10-08",
    "date": "2026-10-08"
  },
  "related": [
    "sub-issues",
    "issue-statuses",
    "objective-dependencies-and-momentum"
  ],
  "aliases": [],
  "tags": [],
  "figures": [
    {
      "id": "issue-dependencies-steps",
      "kind": "screenshot",
      "src": "/documentation/es/work-dependencies.png",
      "alt": "Búsqueda de una incidencia bloqueante por identificador.",
      "caption": "Elige el sentido de la relación antes de su destino. El selector se muestra sin enviar la relación.",
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
    "issue-dependencies-steps"
  ]
}
---

## Elegir la relación y su dirección {#issue-dependencies}

Abre los controles de relaciones de una incidencia y busca la otra por título o identificador. Elige una relación de bloqueo cuando una tarea deba terminar antes de que otra pueda avanzar. Si A bloquea B, A es el requisito previo y B está bloqueada por A. Una relación de vínculo añade contexto sin imponer ese orden.

Lee los dos identificadores y la dirección mostrada antes de confirmar. Por ejemplo, «Preparar el punto de acceso» bloquea «Conectar el cliente», y no al revés. Una dependencia no convierte ninguna de las incidencias en subincidencia; una relación de padre e hija no sustituye a una relación de bloqueo.

![Búsqueda de una incidencia bloqueante por identificador.](/documentation/es/work-dependencies.png)

## Bloqueos resueltos y heredados {#blocker-state}

Los estados finales Hecho, Cancelado y Duplicado hacen que una incidencia deje de bloquear trabajo. Las relaciones conectan incidencias u objetivos del mismo proyecto; ambos extremos deben ser accesibles allí. No enlazan trabajo privado arbitrario entre proyectos ni publican ninguno de los extremos.

Una incidencia abierta puede heredar un bloqueo a través de su objetivo abierto. Si A bloquea el objetivo B, las incidencias abiertas vinculadas a B muestran A como bloqueo heredado, aunque no exista una relación directa de A a la incidencia. La interfaz identifica el requisito real y el objetivo que transmite el bloqueo. Examina esa relación del objetivo antes de intentar retirarla de la incidencia. Cerrar A, cerrar B o sacar la incidencia de B elimina el bloqueo heredado. Este mecanismo depende de la pertenencia al objetivo, no de la jerarquía entre incidencias principales y subincidencias.

Retira una relación desde sus controles cuando ya no corresponda y verifica tanto la etiqueta como el indicador de bloqueo. Marcar una incidencia como duplicada afecta a su ciclo de vida y remite al trabajo conservado. Úsalo para tareas duplicadas en lugar de crear un vínculo ordinario y suponer que eso cierra el duplicado.

Si el selector no encuentra una incidencia, comprueba el acceso al proyecto y el identificador. No expongas contenido de otro proyecto pegando una URL privada de incidencia en una respuesta pública a una solicitud de feedback.

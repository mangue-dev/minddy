---
{
  "id": "glossary-and-data-model",
  "locale": "es",
  "title": "Glosario y modelo de datos",
  "summary": "Un proyecto reúne el trabajo compartido: miembros, incidencias, categorías, vistas, páginas, integraciones y feedback.",
  "topic": "Conceptos técnicos",
  "type": "explanation",
  "audiences": [
    "member",
    "integrator"
  ],
  "workflows": [
    "T01"
  ],
  "visibility": "public",
  "status": "published",
  "revision": 3,
  "sourceRevision": 3,
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
      "desktop",
      "mobile",
      "full",
      "managed"
    ],
    "evidence": [
      "content/knowledge/core-tracker.md",
      "content/knowledge/productivity.md",
      "content/knowledge/pages.md",
      "content/knowledge/feedback.md",
      "content/documentation/reviews/editorial-clarity-en-fr-2026-10-09.md",
      "content/documentation/reviews/editorial-clarity-de-es-2026-10-09.md",
      "content/documentation/reviews/editorial-clarity-it-pt-BR-2026-10-09.md"
    ]
  },
  "review": {
    "revision": 3,
    "fact": "agent:/root/german_spanish_review (structural consolidation review; prior procedural evidence retained; no operational rerun); agent:/root (visual usefulness, figure framing and preserved procedures; previous operational evidence retained)",
    "language": "agent:/root/german_spanish_review (es title, summary, lead and heading review; retained body comparison); agent:/root/editorial_de_es (editorial clarity pass); agent:/root (figure removals and captions); agent:/root/editorial_de_es (collection-caption clarity)",
    "date": "2026-10-09"
  },
  "related": [
    "permissions-and-public-links",
    "numo"
  ],
  "aliases": [],
  "tags": [
    "Comprender proyectos, incidencias, objetivos y trabajo personal"
  ],
  "figures": [
    {
      "id": "glossary-and-data-model-flow",
      "kind": "diagram",
      "src": "/documentation/es/glossary-and-data-model-flow.svg",
      "alt": "Diagrama: Proyecto: trabajo y conocimiento compartidos. Incidencia: trabajo; objetivo: resultado. Ciclo personal: trabajo entre proyectos. Página: contexto; feedback: necesidad.",
      "caption": "Los objetos relacionan tareas, resultados y contexto duradero, mientras el ciclo personal organiza el trabajo propio entre proyectos.",
      "revision": 3,
      "reviewed": true,
      "capturedAt": "2026-10-08",
      "viewport": [
        720,
        640
      ],
      "theme": "neutral",
      "diagram": {
        "layout": "collection",
        "items": [
          {
            "title": "Proyecto: trabajo y conocimiento compartidos"
          },
          {
            "title": "Incidencia: trabajo; objetivo: resultado"
          },
          {
            "title": "Ciclo personal: trabajo entre proyectos"
          },
          {
            "title": "Página: contexto; feedback: necesidad"
          }
        ]
      }
    }
  ],
  "requiredFigures": [
    "glossary-and-data-model-flow"
  ]
}
---

## Comprender proyectos, incidencias, objetivos y trabajo personal {#glossary-and-data-model}

| Concepto | Significado |
| --- | --- |
| Proyecto | Espacio de trabajo compartido con miembros, incidencias, categorías, vistas, páginas, integraciones y tablero de sugerencias. |
| Incidencia | Tarea concreta con estado y responsable. Puede incluir un plan, fecha límite, objetivo, categorías, relaciones, comentarios y recursos. |
| Objetivo | Agrupa incidencias del proyecto para seguir un resultado y su progreso. |
| Ciclo personal | Selecciona el trabajo de una persona durante una o dos semanas, incluso de distintos proyectos. No es un sprint compartido ni un objetivo del proyecto. |

![Diagrama: Proyecto: trabajo y conocimiento compartidos. Incidencia: trabajo; objetivo: resultado. Ciclo personal: trabajo entre proyectos. Página: contexto; feedback: necesidad.](/documentation/es/glossary-and-data-model-flow.svg)

## Distinguir conocimiento y solicitudes {#knowledge-and-feedback}

Una página conserva contexto duradero, como una especificación, decisión o procedimiento. Puede incluir subpáginas, archivos y discusiones. Una base de datos de páginas añade propiedades a sus entradas, que siguen siendo páginas completas. El feedback representa una necesidad con votos y estado público, distinta de la incidencia interna; al enlazarlo con una incidencia, su estado público sigue automáticamente el estado de ese trabajo. Una vista filtra y ordena incidencias sin modificarlas. El cuaderno conserva notas y casillas privadas: convierta una nota en incidencia cuando el proyecto deba seguirla.

## Comprobar con un ejemplo {#example}

Para preparar una versión, cree un objetivo, documente la decisión en una página y enlácela con las incidencias pertinentes. Cada miembro puede incluir sus incidencias en el ciclo personal. Puede vincular feedback al trabajo sin publicar la discusión privada. Una rutina inicia una nueva conversación programada con Numo que utiliza las instrucciones y el contexto guardados; no crea automáticamente una incidencia recurrente ni se activa con cada cambio. Conserve los identificadores y la propiedad de los objetos: enlazar contexto no iguala los permisos.

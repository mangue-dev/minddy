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
  "revision": 2,
  "sourceRevision": 2,
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
      "content/knowledge/feedback.md"
    ]
  },
  "review": {
    "revision": 2,
    "fact": "agent:/root/german_spanish_review (structural consolidation review; prior procedural evidence retained; no operational rerun)",
    "language": "agent:/root/german_spanish_review (es title, summary, lead and heading review; retained body comparison)",
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
      "caption": "Estos componentes tienen responsabilidades distintas. Proyecto: trabajo y conocimiento compartidos. Incidencia: trabajo; objetivo: resultado. Ciclo personal: trabajo entre proyectos. Página: contexto; feedback: necesidad.",
      "revision": 2,
      "reviewed": true,
      "capturedAt": "2026-10-08",
      "viewport": [
        720,
        640
      ],
      "theme": "neutral"
    }
  ],
  "requiredFigures": [
    "glossary-and-data-model-flow"
  ]
}
---

## Comprender proyectos, incidencias, objetivos y trabajo personal {#glossary-and-data-model}

Un proyecto reúne el trabajo compartido: miembros, incidencias, categorías, vistas, páginas, integraciones y feedback. Una incidencia describe una tarea concreta con estado y responsable; puede incluir un plan, una fecha límite, un objetivo, categorías, relaciones, comentarios y recursos. Un objetivo agrupa incidencias para seguir un resultado y su progreso. El ciclo personal selecciona el trabajo de una persona durante una o dos semanas, incluso de distintos proyectos. No es un sprint compartido ni un objetivo.

![Diagrama: Proyecto: trabajo y conocimiento compartidos. Incidencia: trabajo; objetivo: resultado. Ciclo personal: trabajo entre proyectos. Página: contexto; feedback: necesidad.](/documentation/es/glossary-and-data-model-flow.svg)

## Distinguir conocimiento y solicitudes {#knowledge-and-feedback}

Una página conserva contexto duradero, como una especificación, decisión o procedimiento. Puede incluir subpáginas, archivos y discusiones. Una base de datos de páginas añade propiedades a sus entradas, que siguen siendo páginas completas. El feedback representa una necesidad con votos y estado público, distinta de la incidencia interna; al enlazarlo con una incidencia, su estado público sigue automáticamente el estado de ese trabajo. Una vista filtra y ordena incidencias sin modificarlas. El cuaderno conserva notas y casillas privadas: convierta una nota en incidencia cuando el proyecto deba seguirla.

## Comprobar con un ejemplo {#example}

Para preparar una versión, cree un objetivo, documente la decisión en una página y enlácela con las incidencias pertinentes. Cada miembro puede incluir sus incidencias en el ciclo personal. Puede vincular feedback al trabajo sin publicar la discusión privada. Una rutina inicia una nueva conversación Numo programada con instrucciones y contexto; no crea automáticamente una incidencia recurrente ni se activa con cada cambio. Conserve los identificadores y la propiedad de los objetos: enlazar contexto no iguala los permisos.

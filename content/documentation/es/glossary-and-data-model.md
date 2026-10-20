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
  "revision": 5,
  "sourceRevision": 5,
  "owner": "@mangue-dev",
  "updatedAt": "2026-10-20",
  "compatibility": {
    "version": "0.20.0 (MIN-747 release review)",
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
      "docs/security/project-roles.md",
      "lib/project-roles.ts"
    ]
  },
  "review": {
    "revision": 5,
    "fact": "agent:/root/min747 (0.20.0 release review: source audit against the v0.11.0..main delta, verified corrections applied; no screenshot in scope; no browser walkthrough of the procedures or operator rehearsal; earlier evidence retained in git history)",
    "language": "agent:/root/min747 (es translation of the release corrections with catalog UI labels; equivalent meaning self-reviewed; agent review, not human acceptance)",
    "date": "2026-10-20"
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
      "revision": 5,
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
| Proyecto | Espacio de trabajo compartido con miembros, incidencias, categorías, vistas, páginas, integraciones y tablero de sugerencias. Cada persona tiene un rol: un único propietario, miembros que trabajan en el contenido y lectores que lo siguen. |
| Incidencia | Tarea concreta con estado y responsable. Puede incluir un plan, fecha límite, objetivo, categorías, relaciones, comentarios y recursos. |
| Objetivo | Agrupa incidencias del proyecto para seguir un resultado y su progreso. |
| Ciclo personal | Selecciona el trabajo de una persona durante una o dos semanas, incluso de distintos proyectos. No es un sprint compartido ni un objetivo del proyecto. |

![Diagrama: Proyecto: trabajo y conocimiento compartidos. Incidencia: trabajo; objetivo: resultado. Ciclo personal: trabajo entre proyectos. Página: contexto; feedback: necesidad.](/documentation/es/glossary-and-data-model-flow.svg)

## Distinguir conocimiento y solicitudes {#knowledge-and-feedback}

Una página conserva contexto duradero, como una especificación, decisión o procedimiento. Puede incluir subpáginas, archivos y discusiones. Una base de datos de páginas añade propiedades a sus entradas, que siguen siendo páginas completas. El feedback representa una necesidad con votos y estado público, distinta de la incidencia interna; al enlazarlo con una incidencia, su estado público sigue automáticamente el estado de ese trabajo. Una vista filtra y ordena incidencias sin modificarlas. El cuaderno conserva notas y casillas privadas: convierta una nota en incidencia cuando el proyecto deba seguirla.

## Comprobar con un ejemplo {#example}

Para preparar una versión, cree un objetivo, documente la decisión en una página y enlácela con las incidencias pertinentes. Cada miembro puede incluir sus incidencias en el ciclo personal. Puede vincular feedback al trabajo sin publicar la discusión privada. Una rutina inicia una nueva conversación con Numo con el contexto del proyecto según una programación o cuando un evento elegido cumple sus condiciones, por ejemplo una incidencia que entra en un estado o una nueva entrada de base de datos; no es una incidencia recurrente y no modifica el código del repositorio. Conserve los identificadores y la propiedad de los objetos: enlazar contexto no iguala los permisos.

---
{
  "id": "implementation-plans",
  "locale": "es",
  "title": "Mantener un plan de implementación",
  "summary": "Sigue pasos ordenados por separado de la descripción de una incidencia sin perder el trabajo completado.",
  "topic": "Proyectos e incidencias",
  "type": "guide",
  "audiences": [
    "member"
  ],
  "workflows": [
    "W07"
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
      "content/knowledge/plans-and-agents.md",
      "components/issue-plan.tsx",
      "captures/shots/issue-plan/intent.md",
      "lib/plan.ts"
    ]
  },
  "review": {
    "revision": 2,
    "fact": "2026-10-08",
    "language": "2026-10-08",
    "date": "2026-10-08"
  },
  "related": [
    "issue-discussion-and-resources",
    "delegate-code-work",
    "review-pull-requests"
  ],
  "aliases": [],
  "tags": [],
  "figures": [
    {
      "id": "implementation-plans-steps",
      "kind": "screenshot",
      "src": "/documentation/es/work-implementation-plan.png",
      "alt": "Plan de demostración con dos tareas de trabajo completadas de seis.",
      "caption": "El plan guardado distingue pasos completados, activos y pendientes. Su progreso no demuestra que se ejecutara la tarea de código ficticia.",
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
    "implementation-plans-steps"
  ]
}
---

## Escribir el plan {#implementation-plans}

Abre la pestaña del plan de la incidencia. Su descripción ya debería indicar el problema y el resultado esperado. Añade los pasos de implementación manualmente o pide a Numo que examine el repositorio vinculado antes de proponer un plan a nivel de código. Una ruta o función generadas por IA no son una prueba si no se ha leído realmente el repositorio.

Sangra cada línea de tarea con dos espacios por nivel de anidamiento; un tabulador cuenta como cuatro espacios. El anidamiento organiza los pasos del plan y no crea relaciones entre incidencias principales e hijas. Todas las tareas de trabajo no canceladas siguen contando para el progreso, incluidas las anidadas.

El plan utiliza líneas de tareas Markdown: `- [ ]` para pendientes, `- [~]` para en curso, `- [x]` para completadas y `- [-]` para canceladas. Escribe el texto después del marcador, por ejemplo `- [ ] Comprobar el enlace de contacto en móvil`. Las tareas canceladas no cuentan en el progreso. Las tareas bajo un encabezado Questions reconocido se tratan como preguntas y también quedan fuera del progreso; mantén los pasos de trabajo en otra sección con el mismo nivel de encabezado. El encabezado reconocido es `Questions`, con esa palabra en inglés. Guarda las modificaciones explícitas con el control de guardado; cancelar descarta el borrador. Marcar una tarea mostrada actualiza su estado. Utiliza pendiente, en curso, completada y cancelada para reflejar lo ocurrido, sin dar por realizadas comprobaciones que aún no se han ejecutado.

![Plan de demostración con dos tareas de trabajo completadas de seis.](/documentation/es/work-implementation-plan.png)

## Conservar el progreso y las ediciones simultáneas {#plan-progress}

Amplía o modifica el plan existente en lugar de sustituirlo por una copia nueva sin marcar. Conserva los pasos completados y las explicaciones de los cambios de alcance. Antes de guardar una reescritura importante, compárala con el plan más reciente si otro miembro o agente ha trabajado en la incidencia.

Puedes entregar un plan escrito a Numo para implementarlo cuando estén disponibles el trabajo con repositorios y su entorno aislado configurado. Cuando ya exista trabajo completado, la interfaz también ofrece verificar la implementación. Estas acciones inician trabajo; una casilla marcada no demuestra por sí sola que el código pase las pruebas. Lee el resultado, los cambios y las comprobaciones antes de marcar la incidencia como hecha.

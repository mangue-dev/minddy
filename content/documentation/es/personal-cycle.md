---
{
  "id": "personal-cycle",
  "locale": "es",
  "title": "Ciclos personales",
  "summary": "Selecciona trabajo entre proyectos para un periodo de planificación semanal o quincenal.",
  "topic": "Planificar y encontrar trabajo",
  "type": "guide",
  "audiences": [
    "member"
  ],
  "workflows": [
    "W12"
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
      "content/knowledge/productivity.md",
      "components/cycle/cycle-header.tsx",
      "components/settings/account-cycles-section.tsx",
      "lib/cycle-prefs.ts",
      "lib/server/cycles.ts",
      "components/cycle/use-cycle-menu-actions.tsx"
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
    "issues"
  ],
  "aliases": [],
  "tags": [
    "Planificar un ciclo personal"
  ],
  "figures": [
    {
      "id": "personal-cycle-steps",
      "kind": "screenshot",
      "src": "/documentation/es/reader-cycle.png",
      "alt": "Incidencia de demostración en el backlog del ciclo personal.",
      "caption": "Al añadirla se asignó al titular del ciclo y se conservó su estado de backlog.",
      "revision": 4,
      "reviewed": true,
      "capturedAt": "2026-10-08",
      "viewport": [
        994,
        1046
      ],
      "theme": "light",
      "padding": 24
    }
  ],
  "requiredFigures": [
    "personal-cycle-steps"
  ]
}
---

## Configurar y llenar tu ciclo {#personal-cycle}

Activa los ciclos en los ajustes de la cuenta → Ciclos y abre Ciclo desde la navegación personal. Pertenece a tu cuenta y puede contener incidencias de varios proyectos a los que tienes acceso. No es un sprint del proyecto ni pertenece a un objetivo del equipo.

Elige una duración de una o dos semanas, el día de inicio, de uno a cuatro ciclos futuros y una intensidad ligera, media o alta. Estas opciones determinan tu periodo y capacidad objetivo. Los controles de captura automática indican si las incidencias asignadas entran en el ciclo actual al iniciarse o completarse.

El ciclo actual se llena automáticamente una vez con trabajo elegible. Para añadir una incidencia a mano, usa la acción de ciclo de su menú y elige el periodo actual o el siguiente cuando estén disponibles. Añadirla la asigna al propietario del ciclo sin cambiar su estado. Las incidencias en Clasificación, Hecho, Cancelado o Duplicado no se pueden añadir mediante esta acción. Comprueba el responsable y los bloqueos después de añadir trabajo. Quitar una incidencia del ciclo la conserva en el proyecto.

![Incidencia de demostración en el backlog del ciclo personal.](/documentation/es/reader-cycle.png)

## Terminar o ajustar el periodo {#cycle-results}

Actualiza los estados a medida que avanza el trabajo y revisa lo completado y lo pendiente. Al cambiar de periodo, las incidencias elegibles sin terminar de ciclos anteriores se trasladan automáticamente al actual, conservando la asignación. Ese traslado no las marca como completadas. Usa el selector de fechas para consultar ciclos anteriores y futuros. Esas vistas son de solo lectura, mientras que el ciclo actual permite cambios.

Si se añade un requisito al ciclo actual para mantener las dependencias coherentes, comprueba el motivo antes de quitarlo. Una incidencia que desaparece tras completarse puede seguir en el trabajo completado del ciclo o localizarse por su identificador. Los ajustes de ciclos de la cuenta afectan a tu planificación, no al ciclo personal de otro miembro.

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
  "revision": 5,
  "sourceRevision": 5,
  "owner": "@mangue-dev",
  "updatedAt": "2026-10-17",
  "compatibility": {
    "version": "0.11.1 candidate (89ebb59a5); MIN-693 project roles",
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
      "components/cycle/use-cycle-menu-actions.tsx",
      "docs/security/project-roles.md",
      "lib/project-roles.ts"
    ]
  },
  "review": {
    "revision": 5,
    "fact": "agent:/root/german_spanish_review (structural consolidation review; prior procedural evidence retained; no operational rerun); agent:/root (MIN-693 project roles: decision record, permission matrix and source review; no browser walkthrough, no new captures; unchanged evidence retained)",
    "language": "agent:/root/german_spanish_review (es title, summary, lead and heading review; retained body comparison); agent:/root/min693_es with agent:/root (es MIN-693 translation of the changed passages, localized labels and retained-meaning review; agent review, not human acceptance)",
    "date": "2026-10-17"
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
      "revision": 5,
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

Activa los ciclos en **Configuración de la cuenta** → **Ciclos**, o con **Activar ciclos** en la pestaña **Ciclo**. Abre esa pestaña en la barra de vistas de **Todas las incidencias**, o busca Ciclo en la paleta de comandos; la pestaña **Ciclo** de un tablero de proyecto, marcada con una flecha, lleva al mismo ciclo personal. Pertenece a tu cuenta y puede contener incidencias que tienes asignadas en proyectos donde eres el propietario o un Miembro. A los lectores no se les puede asignar trabajo, así que un proyecto que solo lees no aporta ninguna incidencia. No es un sprint del proyecto ni pertenece a un objetivo del equipo.

Elige una duración de una o dos semanas, el día de inicio, de uno a cuatro ciclos futuros y una intensidad ligera, media o alta. Estas opciones determinan tu periodo y capacidad objetivo. Los controles de captura automática indican si las incidencias asignadas entran en el ciclo actual al iniciarse o completarse.

El ciclo actual se llena automáticamente una vez con trabajo elegible. Para añadir una incidencia a mano, usa la acción de ciclo de su menú y elige el periodo actual o el siguiente cuando estén disponibles. Añadirla la asigna al propietario del ciclo sin cambiar su estado. Las incidencias en Clasificación, Hecho, Cancelado o Duplicado no se pueden añadir mediante esta acción. Comprueba el responsable y los bloqueos después de añadir trabajo. Quitar una incidencia del ciclo la conserva en el proyecto.

![Incidencia de demostración en el backlog del ciclo personal.](/documentation/es/reader-cycle.png)

## Terminar o ajustar el periodo {#cycle-results}

Actualiza los estados a medida que avanza el trabajo y revisa lo completado y lo pendiente. Al cambiar de periodo, las incidencias elegibles sin terminar de ciclos anteriores se trasladan automáticamente al actual, conservando la asignación. Ese traslado no las marca como completadas. Cuando todas las incidencias del ciclo actual están cerradas, un aviso **Ciclo terminado** ofrece **Ciclo de relleno** para añadir trabajo elegible; el ciclo no se rellena automáticamente durante el periodo. Usa el selector de fechas para consultar ciclos anteriores y futuros. Esas vistas son de solo lectura, mientras que el ciclo actual permite cambios.

Si se añade un requisito al ciclo actual para mantener las dependencias coherentes, comprueba el motivo antes de quitarlo. Una incidencia que desaparece tras completarse puede seguir en el trabajo completado del ciclo o localizarse por su identificador. Los ajustes de ciclos de la cuenta afectan a tu planificación, no al ciclo personal de otro miembro.

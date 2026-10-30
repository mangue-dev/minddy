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
  "revision": 9,
  "sourceRevision": 7,
  "owner": "@mangue-dev",
  "updatedAt": "2026-10-22",
  "compatibility": {
    "version": "0.20.0 (MIN-747 release review)",
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
      "lib/project-roles.ts",
      "components/cycle/cycle-empty-states.tsx",
      "components/global-board.tsx"
    ]
  },
  "review": {
    "revision": 9,
    "fact": "agent:/root/min747 (0.20.0 release review: source audit against the v0.11.0..main delta, verified corrections applied; no screenshot in scope; 1 screenshot(s) without a current capture script keep their earlier capture and evidence; no browser walkthrough of the procedures or operator rehearsal; earlier evidence retained in git history); agent:claude-code (MIN-762 UI label correction: quoted labels aligned on the corrected es catalog; no behavior change, no new captures); agent:claude-code (it/es catalog language review: quoted labels aligned on the corrected es catalog; no behavior change, no new captures); agent:claude-code (manual figures rebuilt on the Aurora demo, catalog review labels and informal register; figures recaptured on 2026-10-22 from a local candidate against the preview demo account and inspected; no form submitted)",
    "language": "agent:/root/min747 (es translation of the release corrections with catalog UI labels; equivalent meaning self-reviewed; agent review, not human acceptance); agent:claude-code (es MIN-762 label edit; self-reviewed; agent review, not human acceptance); agent:claude-code (es label alignment after the full catalog review; self-reviewed; agent review, not human acceptance); agent:claude-code (es manual figures rebuilt on the Aurora demo, catalog review labels and informal register; self-reviewed; agent review, not human acceptance)",
    "date": "2026-10-22"
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
      "revision": 9,
      "reviewed": true,
      "capturedAt": "2026-10-22",
      "viewport": [
        1314,
        1046
      ],
      "theme": "light",
      "padding": 24,
      "deviceScaleFactor": 2
    }
  ],
  "requiredFigures": [
    "personal-cycle-steps"
  ]
}
---

## Configurar y llenar tu ciclo {#personal-cycle}

Activa los ciclos en **Ajustes de la cuenta** → **Ciclos**, o abre Ciclo desde la paleta de comandos y elige allí **Activar ciclos**. Una vez activados, aparece una pestaña **Ciclo** en la barra de vistas de **Todas las incidencias**, y la pestaña **Ciclo** de un tablero de proyecto, marcada con una flecha, lleva al mismo ciclo personal; mientras los ciclos están desactivados, los tableros no muestran la pestaña **Ciclo**. Pertenece a tu cuenta y puede contener incidencias que tienes asignadas en proyectos donde eres el propietario o un Miembro. A los lectores no se les puede asignar trabajo, así que un proyecto que solo lees no aporta ninguna incidencia. No es un sprint del proyecto ni pertenece a un objetivo del equipo.

Elige una duración de una o dos semanas, el día de inicio, de uno a cuatro ciclos futuros y una intensidad ligera, media o alta. Estas opciones determinan tu periodo y capacidad objetivo. Los controles de captura automática indican si las incidencias asignadas entran en el ciclo actual al iniciarse o completarse.

El ciclo actual se llena automáticamente una vez con trabajo elegible. Para añadir una incidencia a mano, usa la acción de ciclo de su menú y elige el periodo actual o el siguiente cuando estén disponibles. Añadirla la asigna al propietario del ciclo sin cambiar su estado. Las incidencias en Clasificación, Hecha, Cancelada o Duplicada no se pueden añadir mediante esta acción. Comprueba el responsable y los bloqueos después de añadir trabajo. Quitar una incidencia del ciclo la conserva en el proyecto.

![Incidencia de demostración en el backlog del ciclo personal.](/documentation/es/reader-cycle.png)

## Terminar o ajustar el periodo {#cycle-results}

Actualiza los estados a medida que avanza el trabajo y revisa lo completado y lo pendiente. Al cambiar de periodo, las incidencias elegibles sin terminar de ciclos anteriores se trasladan automáticamente al actual, conservando la asignación. Ese traslado no las marca como completadas. Cuando todas las incidencias del ciclo actual están cerradas, un aviso **Ciclo terminado** ofrece **Completar el ciclo** para añadir trabajo elegible; el ciclo no se rellena automáticamente durante el periodo. Usa el selector de fechas para consultar ciclos anteriores y futuros. Esas vistas son de solo lectura, mientras que el ciclo actual permite cambios.

Si se añade un requisito al ciclo actual para mantener las dependencias coherentes, comprueba el motivo antes de quitarlo. Una incidencia que desaparece tras completarse puede seguir en el trabajo completado del ciclo o localizarse por su identificador. Los ajustes de ciclos de la cuenta afectan a tu planificación, no al ciclo personal de otro miembro.

---
{
  "id": "first-project",
  "locale": "es",
  "title": "Primeros pasos",
  "summary": "Crea un proyecto o únete a uno, registra una tarea y ciérrala cuando hayas comprobado su resultado.",
  "topic": "Primeros pasos",
  "type": "tutorial",
  "audiences": [
    "member"
  ],
  "workflows": [
    "S01"
  ],
  "visibility": "public",
  "status": "published",
  "revision": 6,
  "sourceRevision": 6,
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
      "content/knowledge/core-tracker.md",
      "components/sidebar-onboarding.tsx",
      "app/(app)/home/page.tsx",
      "components/create-project-wizard.tsx",
      "lib/project-draft.ts",
      "lib/project-key.ts",
      "components/create-issue-dialog.tsx",
      "components/issue-compact-fields.tsx",
      "lib/smart-fill.ts"
    ]
  },
  "review": {
    "revision": 6,
    "fact": "agent:/root/german_spanish_review (structural consolidation review; prior procedural evidence retained; no operational rerun); agent:/root (visual usefulness, figure framing and preserved procedures; previous operational evidence retained)",
    "language": "agent:/root/german_spanish_review (es title, summary, lead and heading review; retained body comparison); agent:/root/editorial_de_es (editorial clarity pass); agent:/root (figure removals and captions)",
    "date": "2026-10-09"
  },
  "related": [
    "accounts",
    "projects",
    "issues"
  ],
  "aliases": [
    "core-tracker"
  ],
  "tags": [
    "Completar tu primera incidencia"
  ],
  "figures": [
    {
      "id": "first-project-steps",
      "kind": "screenshot",
      "src": "/documentation/es/reader-first-project.png",
      "alt": "Incidencia de demostración completada con su descripción y comentario guardado.",
      "caption": "El estado completado registra la comprobación del recorrido de la aplicación. No afirma que se probara el enlace de correo del sitio de ejemplo.",
      "revision": 6,
      "reviewed": true,
      "capturedAt": "2026-10-08",
      "viewport": [
        508,
        1096
      ],
      "theme": "light",
      "padding": 24
    }
  ],
  "requiredFigures": [
    "first-project-steps"
  ]
}
---

## Del proyecto a una incidencia completada {#first-project}

Usa una cuenta de la instancia que quieres utilizar. En este ejemplo, crea un proyecto de demostración para un sitio web y una incidencia para comprobar su enlace de contacto. Puedes seguir la misma secuencia en Cloud o en una instancia autoalojada configurada; no necesitas IA.

Si tu equipo ya tiene un proyecto, comunica al propietario el correo de tu cuenta y acepta la invitación en la bandeja de entrada en lugar de crear un proyecto duplicado.

1. Abre Inicio después de iniciar sesión. Para empezar un trabajo nuevo, elige la acción para crear un proyecto en la navegación. Selecciona un proyecto completamente nuevo en el asistente, introduce un nombre y una clave de dos a cinco letras.
2. Continúa por los pasos del icono y el repositorio. Para este ejemplo manual, conserva el icono predeterminado y no elijas ningún repositorio. Puedes dejar vacía la descripción inicial.
3. En el último paso, revisa Smart Assign y la asignación automática; deja esta última desactivada si quieres asignar tú el ticket de demostración. Elige la acción para finalizar, espera a que se cree el proyecto y ábrelo.
4. Abre el proyecto y crea una incidencia. Ponle un título concreto, como «Comprobar el enlace de contacto del sitio web». Describe la página, el destino esperado y cómo verificarás el resultado. Si el botón Rellenado inteligente aparece y está activado, desactívalo para este ejemplo manual antes de crear la incidencia. Controla el rellenado de esta incidencia y es independiente de los interruptores de automatización y Smart Assign del proyecto.
5. Elige una persona responsable, una prioridad y un esfuerzo si ayudan a planificar la tarea. Confirma la creación, abre la incidencia creada y comprueba su proyecto e identificador.
6. Cambia el estado a «En curso» cuando empiece el trabajo. Realiza la comprobación y registra el resultado en un comentario. Usa «En examen» si otra persona todavía tiene que revisarlo.
7. Cambia el estado a «Hecho» después de comprobar el resultado esperado. Busca la incidencia entre el trabajo completado del proyecto o por su identificador para confirmar el cambio.

![Incidencia de demostración completada con su descripción y comentario guardado.](/documentation/es/reader-first-project.png)

## Resolver un resultado inesperado {#first-use-recovery}

Una invitación corresponde a una cuenta y una instancia concretas. Si no aparece, comprueba el correo que facilitaste al propietario y abre la bandeja de entrada en esa misma instancia. Conocer el nombre de un proyecto no permite unirse a él. Si una incidencia desaparece del tablero al cambiar su estado, quita los filtros de la vista o busca su identificador antes de crear otra copia.

En el móvil, abre el menú de navegación para acceder al proyecto y utiliza sus controles de incidencias. Los selectores de estado y propiedades permiten realizar la misma tarea sin un atajo de teclado de escritorio. Guarda las decisiones propias del proyecto en una página y enlázala a la incidencia cuando la tarea necesite contexto duradero.

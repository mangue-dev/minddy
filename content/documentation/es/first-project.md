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
  "revision": 10,
  "sourceRevision": 9,
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
    "revision": 10,
    "fact": "agent:/root/min747 (0.20.0 release review: source audit against the v0.11.0..main delta, verified corrections applied; no screenshot in scope; 1 screenshot(s) without a current capture script keep their earlier capture and evidence; no browser walkthrough of the procedures or operator rehearsal; earlier evidence retained in git history); agent:claude-code (it/es catalog language review: quoted labels aligned on the corrected es catalog; no behavior change, no new captures); agent:claude-code (manual figures rebuilt on the Aurora demo, catalog review labels and informal register; figures recaptured on 2026-10-22 from a local candidate against the preview demo account and inspected; no form submitted)",
    "language": "agent:/root/min747 (es translation of the release corrections with catalog UI labels; equivalent meaning self-reviewed; agent review, not human acceptance); agent:claude-code (es label alignment after the full catalog review; self-reviewed; agent review, not human acceptance); agent:claude-code (es manual figures rebuilt on the Aurora demo, catalog review labels and informal register; self-reviewed; agent review, not human acceptance)",
    "date": "2026-10-22"
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
      "alt": "Incidencia AUR-3 en curso, con su descripción, responsable, esfuerzo y categoría.",
      "caption": "La incidencia muestra su identificador, estado y propiedades. Márcala como completada solo después de verificar el resultado esperado.",
      "revision": 10,
      "reviewed": true,
      "capturedAt": "2026-10-22",
      "viewport": [
        508,
        1096
      ],
      "theme": "light",
      "padding": 24,
      "deviceScaleFactor": 2
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
3. A continuación, el asistente propone invitar a tu equipo. Sáltalo en este ejemplo manual; si trabajas con otras personas, busca en su lugar por nombre a las personas de tus otros proyectos o introduce sus correos electrónicos. No se envía nada hasta que finalizas la creación del proyecto.
4. En el último paso, revisa Smart Assign y la asignación automática; deja esta última desactivada si quieres asignar tú el ticket de demostración. Elige la acción para finalizar, espera a que se cree el proyecto y ábrelo.
5. Abre el proyecto y crea una incidencia. Ponle un título concreto, como «Comprobar el enlace de contacto del sitio web». Describe la página, el destino esperado y cómo verificarás el resultado. Si el botón Smart Fill aparece y está activado, desactívalo para este ejemplo manual antes de crear la incidencia. Controla el rellenado de esta incidencia y es independiente de Smart Assign y de las rutinas.
6. Elige una persona responsable, una prioridad y un esfuerzo si ayudan a planificar la tarea. Confirma la creación, abre la incidencia creada y comprueba su proyecto e identificador.
7. Cambia el estado a «En curso» cuando empiece el trabajo. Realiza la comprobación y registra el resultado en un comentario. Usa «En revisión» si otra persona todavía tiene que revisarlo.
8. Cambia el estado a «Hecha» después de comprobar el resultado esperado. Los tableros ocultan la columna **Hecha** de forma predeterminada: selecciona **Hecha** en el filtro **Estado** del tablero, o busca el identificador de la incidencia, para confirmar el cambio.

![Incidencia AUR-3 en curso, con su descripción, responsable, esfuerzo y categoría.](/documentation/es/reader-first-project.png)

## Resolver un resultado inesperado {#first-use-recovery}

Una invitación corresponde a una cuenta y una instancia concretas. Si no aparece, comprueba el correo que facilitaste al propietario y abre la bandeja de entrada en esa misma instancia. Conocer el nombre de un proyecto no permite unirse a él. Si una incidencia desaparece del tablero al cambiar su estado, quita los filtros de la vista o busca su identificador antes de crear otra copia. Las incidencias hechas y canceladas salen del tablero de forma predeterminada; selecciona **Hecha** o **Cancelada** en el filtro **Estado** para mostrarlas.

Si alguna de las invitaciones añadidas en el asistente no pudo enviarse, el proyecto se crea igualmente y una notificación indica cada persona no invitada y el motivo. Revisa las invitaciones pendientes en la configuración de miembros del proyecto antes de volver a invitar.

En el móvil, abre el menú de navegación para acceder al proyecto y utiliza sus controles de incidencias. Los selectores de estado y propiedades permiten realizar la misma tarea sin un atajo de teclado de escritorio. Guarda las decisiones propias del proyecto en una página y enlázala a la incidencia cuando la tarea necesite contexto duradero.

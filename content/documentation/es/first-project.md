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
  "revision": 13,
  "sourceRevision": 12,
  "owner": "@mangue-dev",
  "updatedAt": "2026-11-12",
  "compatibility": {
    "version": "0.30.0 (MIN-794 release review)",
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
      "lib/smart-fill.ts",
      "components/first-run/first-run-gate.tsx",
      "components/first-run/mobile-onboarding-screen.tsx",
      "lib/use-onboarding.ts",
      "components/wizard/wizard-dialog.tsx",
      "components/import/import-guide.tsx",
      "lib/import-guides.ts",
      "lib/project-seed-handoff.ts"
    ]
  },
  "review": {
    "revision": 13,
    "fact": "agent:claude-code (Aligned quoted UI labels with the MIN-885 copy audit, checked against messages/*.json; not checked in the running app; rest of the article unchanged since the previous review; no figure recaptured); agent:claude-code (0.30.0 release review, MIN-794: its evidence changes in the v0.20.0..0.30.0 delta were documented by the pull requests that made them; the article was updated by pull requests in that delta; not re-audited line by line; 1 screenshot(s) recaptured on 2026-11-04 from a local candidate against the preview demo account and inspected; no browser walkthrough of the procedures); agent:claude-code (MIN-907 first-run profile page and phone getting-started tour before Home: checked against components/first-run/first-run-gate.tsx, components/first-run/mobile-onboarding-screen.tsx and lib/first-run.ts; no browser walkthrough; existing figure kept); agent:claude-code (MIN-907 tour follow-up: skip confirmation, final screen with confetti, Home after the tour and the issue step completed on creation, checked against components/first-run/mobile-onboarding-screen.tsx, lib/use-onboarding.ts and messages/*.json; no browser walkthrough; existing figures do not show the tour and were kept); agent:claude-code (MIN-907 project wizard: the origin question, the brief step and the name suggestion are gone; the wizard opens on the name and key, with I want to join a project between Continue and Back; steps in order name, icon, repository, Invite your team, Bring your issues over, Finishing touches; Back is a full button from the second step; the import step offers a tool list, a folded How to export from section and Choose the CSV file, and the import dialog opens on the new project; checked against components/create-project-wizard.tsx, lib/project-draft.ts PROJECT_WIZARD_STEPS, components/wizard/wizard-dialog.tsx, components/import/import-guide.tsx, lib/project-seed-handoff.ts, app/(app)/projects/[id]/page.tsx and messages/*.json; no browser walkthrough; the existing figure shows an issue, not the wizard, and was kept)",
    "language": "agent:claude-code (es changed passages with catalog UI labels; self-reviewed; agent review, not human acceptance); agent:claude-code (es MIN-907 new-account paragraph, with catalog UI labels, in the locale's register and glossary; self-reviewed; agent review, not human acceptance); agent:claude-code (es MIN-907 tour follow-up skip sentence with catalog UI labels, in the locale's register and glossary; self-reviewed; agent review, not human acceptance); agent:claude-code (es MIN-907 wizard steps, join sentence and import paragraph rewritten, with catalog UI labels, in the locale's register and glossary; self-reviewed; agent review, not human acceptance)",
    "date": "2026-11-12"
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
      "revision": 13,
      "reviewed": true,
      "capturedAt": "2026-11-04",
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

Si tu equipo ya tiene un proyecto, comunica al propietario el correo de tu cuenta y acepta la invitación en la bandeja de entrada en lugar de crear un proyecto duplicado. En el primer paso del asistente, **Quiero unirme a un proyecto** explica cómo unirte.

Una cuenta nueva pide primero tu nombre y tu imagen en **¿Cómo deberíamos llamarte?**. En el móvil siguen los primeros pasos, una página cada vez: crea el proyecto desde el primer paso o elige **Omitir la introducción**, confirma y sigue este ejemplo desde Inicio. Consulta [Crear una cuenta e iniciar sesión](/es/documentacion/accounts#account-access).

1. Abre Inicio después de iniciar sesión y elige **Nuevo proyecto** en la navegación. El asistente se abre en **¿Cómo se llama tu proyecto?**: introduce un nombre y una clave de dos a cinco letras y elige **Continuar**.
2. Conserva el icono predeterminado en **Icono del proyecto** y elige **Continuar**. En **Vincular un repositorio**, elige **Omitir** para este ejemplo manual. A partir del segundo paso, **Volver**, debajo de **Continuar**, regresa al paso anterior.
3. En **Invita a tu equipo**, elige **Omitir** para este ejemplo manual; si trabajas con otras personas, busca en su lugar por nombre a las personas de tus otros proyectos o introduce sus correos electrónicos. No se envía nada hasta que eliges **Terminar**.
4. En **Trae tus incidencias**, elige **Omitir**: este ejemplo empieza sin incidencias. Para empezar desde otra herramienta, consulta el párrafo que sigue a estos pasos.
5. En **Últimos detalles**, revisa Smart Assign. Elige **Terminar**, espera a que se cree el proyecto y ábrelo.
6. Abre el proyecto y crea una incidencia. Ponle un título concreto, como «Comprobar el enlace de contacto del sitio web». Describe la página, el destino esperado y cómo verificarás el resultado. Si el botón Smart Fill aparece y está activado, desactívalo para este ejemplo manual antes de crear la incidencia. Controla el rellenado de esta incidencia y es independiente de Smart Assign y de las rutinas.
7. Elige una persona responsable, una prioridad y un esfuerzo si ayudan a planificar la tarea. Confirma la creación, abre la incidencia creada y comprueba su proyecto e identificador.
8. Cambia el estado a «En curso» cuando empiece el trabajo. Realiza la comprobación y registra el resultado en un comentario. Usa «En revisión» si otra persona todavía tiene que revisarlo.
9. Cambia el estado a «Hecha» después de comprobar el resultado esperado. Los tableros ocultan la columna **Hecha** de forma predeterminada: selecciona **Hecha** en el filtro **Estado** del tablero, o busca el identificador de la incidencia, para confirmar el cambio.

Para traer las incidencias de otra herramienta, elígela en la lista de **Trae tus incidencias**: Linear, Jira, Notion, GitHub, Trello o minddy. **Cómo exportar desde …** despliega los pasos de exportación de la herramienta elegida. Exporta allí el CSV y luego elige **Elegir el archivo CSV**. El archivo elegido aparece con un botón para quitarlo. Se importa cuando el proyecto existe: el proyecto se abre con un diálogo de importación que contiene el archivo, donde asocias las columnas y confirmas la importación. Un borrador guardado del asistente no conserva el archivo; si retomas la creación más tarde, vuelve a elegirlo.

![Incidencia AUR-3 en curso, con su descripción, responsable, esfuerzo y categoría.](/documentation/es/reader-first-project.png)

## Resolver un resultado inesperado {#first-use-recovery}

Una invitación corresponde a una cuenta y una instancia concretas. Si no aparece, comprueba el correo que facilitaste al propietario y abre la bandeja de entrada en esa misma instancia. Conocer el nombre de un proyecto no permite unirse a él. Si una incidencia desaparece del tablero al cambiar su estado, quita los filtros de la vista o busca su identificador antes de crear otra copia. Las incidencias hechas y canceladas salen del tablero de forma predeterminada; selecciona **Hecha** o **Cancelada** en el filtro **Estado** para mostrarlas.

Si alguna de las invitaciones añadidas en el asistente no pudo enviarse, el proyecto se crea igualmente y una notificación indica cada persona no invitada y el motivo. Revisa las invitaciones pendientes en la configuración de miembros del proyecto antes de volver a invitar.

En el móvil, abre el menú de navegación para acceder al proyecto y utiliza sus controles de incidencias. Los selectores de estado y propiedades permiten realizar la misma tarea sin un atajo de teclado de escritorio. Guarda las decisiones propias del proyecto en una página y enlázala a la incidencia cuando la tarea necesite contexto duradero.

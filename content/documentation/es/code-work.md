---
{
  "id": "code-work",
  "locale": "es",
  "title": "Trabajo con código y pull requests",
  "summary": "Encarga una incidencia a tu propio agente de código con un prompt copiado y minddy MCP, y después revisa y fusiona la pull request vinculada.",
  "topic": "Numo e integraciones",
  "type": "guide",
  "audiences": [
    "member"
  ],
  "workflows": [
    "N03",
    "N04"
  ],
  "visibility": "public",
  "status": "published",
  "revision": 20,
  "sourceRevision": 19,
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
      "components/agent/use-agent-menu-actions.tsx",
      "components/agent/custom-prompt-dialog.tsx",
      "components/settings/account-preferences-section.tsx",
      "components/pull-requests/pr-detail.tsx",
      "components/pull-requests/pr-unresolved-conversations.tsx",
      "lib/server/agent/pr-mention.ts",
      "components/pull-requests/pr-context-actions.tsx",
      "lib/pr-context-menu.ts",
      "docs/security/project-roles.md",
      "lib/project-roles.ts",
      "components/pull-requests/pr-link-issue.tsx",
      "components/pull-requests/pr-link-target-picker.tsx",
      "lib/bulk-pull-request-links.ts",
      "components/settings/account-issues-section.tsx",
      "components/markdown-image.tsx",
      "components/pull-requests/pr-image-diff.tsx",
      "components/image-viewer.tsx",
      "components/issue-card.tsx"
    ]
  },
  "review": {
    "revision": 20,
    "fact": "agent:/root/min747 (0.20.0 release review: source audit against the v0.11.0..main delta, verified corrections applied; no screenshot in scope; 1 screenshot(s) without a current capture script keep their earlier capture and evidence; no browser walkthrough of the procedures or operator rehearsal; earlier evidence retained in git history); agent:claude-code (it/es catalog language review: quoted labels aligned on the corrected es catalog; no behavior change, no new captures); agent:claude-code (manual figures rebuilt on the Aurora demo, catalog review labels and informal register; figures recaptured on 2026-10-22 from a local candidate against the preview demo account and inspected; no form submitted)",
    "language": "agent:/root/min747 (es translation of the release corrections with catalog UI labels; equivalent meaning self-reviewed; agent review, not human acceptance); agent:claude-code (es label alignment after the full catalog review; self-reviewed; agent review, not human acceptance); agent:claude-code (es manual figures rebuilt on the Aurora demo, catalog review labels and informal register; self-reviewed; agent review, not human acceptance)",
    "date": "2026-10-22"
  },
  "related": [
    "issues",
    "minddy-mcp",
    "git"
  ],
  "aliases": [
    "delegate-code-work",
    "plans-and-agents",
    "review-pull-requests"
  ],
  "tags": [
    "Encargar una incidencia a un agente de código externo",
    "Revisar una pull request vinculada"
  ],
  "figures": [
    {
      "id": "review-pull-requests-workflow",
      "kind": "screenshot",
      "src": "/documentation/es/review-pull-requests-workflow.png",
      "alt": "Pestaña Cambios de la PR de demostración abierta, con las diferencias de greeting y un aviso de autorización de GitHub no disponible.",
      "caption": "PR de demostración que sigue abierta, sin fusionar. Las diferencias eliminan los espacios alrededor del nombre y usan World para un valor vacío. Esta instancia no puede solicitar autorización de usuario de GitHub; la indicación de disponibilidad no concede permisos para fusionar ni demuestra que la CI del proveedor haya pasado.",
      "revision": 20,
      "reviewed": true,
      "capturedAt": "2026-10-22",
      "viewport": [
        1528,
        1148
      ],
      "theme": "light",
      "padding": 24,
      "deviceScaleFactor": 2
    }
  ],
  "requiredFigures": [
    "review-pull-requests-workflow"
  ]
}
---

Minddy hace el seguimiento del trabajo; tu propio agente de código, como Claude Code, Codex o Cursor, modifica el código. Copia un prompt desde la incidencia, deja que el agente lea y actualice la incidencia a través de minddy MCP y revisa después la pull request vinculada en Minddy antes de fusionarla. Numo no escribe código, no abre ramas ni ejecuta pruebas.

## Encargar una incidencia a un agente de código externo {#external-coding-agents}

Conecta primero tu agente a minddy MCP para que pueda leer el plan y actualizar sus tareas; consulta [Conectar un asistente externo al MCP de minddy](/docs/minddy-mcp#external-minddy-mcp). El agente se ejecuta en tu ordenador o en tu propio servicio, con tu propia suscripción o tus propios costes de API. Minddy no le proporciona acceso al repositorio.

1. Abre la incidencia y describe el comportamiento esperado, las restricciones y las comprobaciones de aceptación. Escribe o revisa el plan en su pestaña Plan cuando el trabajo tenga varios pasos.
2. Abre el menú de acciones de la incidencia y elige **Copiar como prompt**. Elige **Generar un plan** (o **Revisar el plan** si ya existe) para delimitar el trabajo sin programar, **Implementar la incidencia** para empezar el cambio, **Verificar la implementación** para que el agente revise el trabajo terminado frente al plan y los comentarios, o **Personalizado…** para escribir tu propia instrucción.
3. Pega el prompt en tu agente, dentro de la copia de trabajo del repositorio. Copiar no ejecuta ningún modelo de IA ni consume cuota de IA.
4. Sigue el progreso del plan en la incidencia mientras el agente actualiza sus tareas a través de MCP. Responde a sus preguntas en el agente o añade las decisiones a la incidencia para que el siguiente prompt las incluya.

El contenido del prompt, la rama sugerida y las reglas de idioma se describen en [Copiar un prompt para otro agente de código](/docs/issues#copy-issue-prompt).

### Mantener el trabajo vinculado a la incidencia {#link-work}

Cuando el repositorio está vinculado al proyecto, mantén el identificador de la incidencia en el nombre de la rama, en el título de la pull request o en una línea `Fixes MIN-42`. Minddy vincula entonces la pull request a la incidencia, y los prompts siguientes indican al agente que continúe la pull request abierta en su rama. Para vincular una incidencia a mano, usa **Vincular una incidencia** en la pull request. Su búsqueda acepta un identificador o palabras del título, y una descripción también muestra incidencias del proyecto encontradas [por el sentido](/docs/navigation#search-by-meaning) bajo **Relacionadas por significado**.

Desde un tablero, haz clic derecho en una incidencia sin pull request abierta y elige **Vincular a una pull request** para escoger una de las pull requests abiertas de su proyecto, incluidos los borradores. La opción solo aparece cuando ese proyecto tiene al menos una pull request que vincular. Con varias incidencias seleccionadas, **Acciones** ofrece la misma opción para toda la selección, y **Vincular las demás incidencias a #N** cuando algunas ya tienen la pull request N. **Vincular a una pull request** deja de ofrecerse en cuanto una incidencia seleccionada tiene alguna pull request vinculada; **Desvincular N incidencias de sus pull requests** quita primero todos los vínculos de la selección, después de que lo confirmes. Los vínculos aparecen al instante en las tarjetas, y un vínculo rechazado desaparece cuando el tablero se actualiza. Una tarjeta con una pull request abierta muestra su número, coloreado según su estado, y su preparación para la fusión, el mismo indicador que en **Revisión de código**.

En **Ajustes de la cuenta → Incidencias → Iniciar una incidencia**, **Iniciar la incidencia o la tarea cuando copio su prompt** pasa a «En curso» una incidencia o una tarea del cuaderno que aún no ha empezado cuando copias su prompt. Déjalo desactivado si solo copias prompts para leerlos.

## Revisar una pull request vinculada {#review-pull-requests}

Abre la pull request vinculada a una incidencia o búscala en la lista de pull requests. Sigue siendo necesario acceder al repositorio; pertenecer al proyecto no concede permisos del proveedor Git.

Lee la descripción y la actividad y después los archivos modificados y los bloques de diferencias. Abre las conversaciones sin resolver y responde en el hilo correspondiente en lugar de crear un comentario aparte. Para devolver a tu agente los comentarios pendientes, abre **Ver conversaciones**, después **Corregir todo** y **Copiar prompt**. Marcar archivos como revisados registra su lectura, pero no constituye una aprobación del proveedor. Comprueba los commits, los resultados de CI y las incidencias vinculadas para confirmar que el cambio propuesto cubre el trabajo solicitado.

En una descripción, un comentario o la diferencia de una imagen, haz clic en una imagen para abrirla en toda la ventana; la diferencia de una imagen abre por separado sus lados **Antes** y **Después**. Usa **Cerrar** o Escape para volver a la pull request.

Menciona `@numo` en un comentario de la pull request para pedir a Numo una revisión de solo lectura en una conversación. Numo lee la pull request y responde; no sube commits. Una mención escrita en el proveedor Git solo cuenta si su autor está vinculado al propietario o a un Miembro (no a un lector) de un proyecto que vincula el repositorio, y su uso se imputa al propietario de ese proyecto.

Lo que se escribe en una pull request o merge request vinculada también aparece en los comentarios de cada incidencia a la que está vinculada: los comentarios de la conversación, el mensaje de una revisión enviada y los comentarios sobre el código con el archivo, la línea y, en GitHub, el fragmento al que se refieren, con las respuestas agrupadas debajo. Los comentarios de bots se quedan en la pull request, salvo los comentarios sobre el código. Una edición actualiza la copia, y un comentario eliminado en GitHub aparece como eliminado; GitLab no notifica las eliminaciones. Cada vez que una pull request se vincula a una incidencia, a mano o porque su rama, su título o su descripción nombra la incidencia, se traen los comentarios que ya tiene con la fecha en que se escribieron, aunque sea anterior a la creación de la incidencia. Responde bajo uno de estos comentarios para contestar en la pull request con tu propia cuenta de Git, como en la vista de la pull request; una conversación sobre el código también muestra **Resuelta** u **Obsoleto** y ofrece **Resolver** o **Reabrir**. Las copias en sí no se pueden editar en Minddy.

![Pestaña Cambios de la PR de demostración abierta, con las diferencias de greeting y un aviso de autorización de GitHub no disponible.](/documentation/es/review-pull-requests-workflow.png)

### Revisión y fusión {#decision}

Usa **Solicitar revisión** para elegir un revisor cuando haga falta una segunda revisión. Comprueba si es borrador o está lista para revisión, las discusiones abiertas, las revisiones solicitadas y la política de fusión del proveedor.

Fusiona solo después de satisfacer los controles y revisiones aplicables y cuando tu cuenta del proveedor tenga permiso. **Fusionar con Numo** permite que Numo redacte el título y la descripción del commit de fusión a partir de la pull request y fusione en cuanto estén listos. El proveedor Git puede rechazar una acción visible. Si el estado mostrado parece desactualizado, actualiza y consulta el proveedor antes de repetir la acción. Una vista previa vinculada depende de un despliegue real del proveedor.

Haz clic derecho en una pull request de la lista para cambiar su estado, fusionarla o pedir una corrección sin abrirla. Una pull request abierta ofrece **Convertir en borrador** y **Cerrar pull request**, un borrador ofrece **Lista para revisión** y **Cerrar pull request**, y una cerrada ofrece **Reabrir**; cada cambio pide confirmación. Una pull request fusionada no ofrece ningún cambio de estado. Las acciones de escritura solo aparecen cuando tu cuenta del proveedor puede escribir en el repositorio y no están disponibles hasta que el menú vuelve a leer la pull request. **Fusionar** aparece cuando la pull request está abierta, no es un borrador y puede fusionarse; abre la pull request en su confirmación de fusión habitual. **Copiar prompt de corrección** y **Corregir con Numo** aparecen cuando falla una comprobación, hay una conversación sin resolver o la rama tiene conflictos o está desactualizada. **Corregir con Numo** envía ese prompt a Numo con la pull request como contexto. Numo puede leer la pull request, responder a una conversación de revisión que no requiere cambios en el código y resolver las conversaciones que la rama ya atiende, pero no modifica el código ni hace push de commits; para los cambios de código, usa **Copiar prompt de corrección** y pégalo en tu agente de código. Los permisos y la posibilidad de fusionar se vuelven a comprobar al confirmar.

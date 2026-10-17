---
{
  "id": "code-work",
  "locale": "es",
  "title": "Trabajo con código y pull requests",
  "summary": "Encargue una incidencia a su propio agente de código con un prompt copiado y minddy MCP, y después revise y fusione la pull request vinculada.",
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
  "revision": 11,
  "sourceRevision": 11,
  "owner": "@mangue-dev",
  "updatedAt": "2026-10-17",
  "compatibility": {
    "version": "0.11.1 candidate; MIN-721 removal of Numo code work (copied prompts and MCP for external agents, pull request review and merge retained); MIN-685 sidebar context menus; MIN-693 project roles",
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
      "content/documentation/reviews/min-721-code-work-removal-2026-10-16.md",
      "components/pull-requests/pr-context-actions.tsx",
      "lib/pr-context-menu.ts",
      "content/documentation/reviews/min-685-sidebar-context-actions.md",
      "docs/security/project-roles.md",
      "lib/project-roles.ts",
      "content/documentation/reviews/min-693-project-roles.md"
    ]
  },
  "review": {
    "revision": 11,
    "fact": "agent:/root/german_spanish_review (structural consolidation review; prior procedural evidence retained; no operational rerun); agent:/root (visual usefulness, figure framing and preserved procedures; previous operational evidence retained); agent:/root/native_hosting_terms (private worker selection controls and fail-closed recovery source/UI-test review; no paid Claude execution or new provider rehearsal claimed); agent:/root/native_identity_docs (frozen identity and proactive context source review; prior operational evidence retained, no new provider execution); agent:/root (account organization and official hosted-auth restriction source review; no provider rerun); agent:/root (native model controls and frozen launch source review; live auth outcomes recorded separately); agent:/root (worker card, explicit validation, PR handoff and footer source/component review; no new provider execution); agent:/root/min721_docs (MIN-721 source review inherited from en revision 9; es translation of removal edits; no operational rerun); agent:/root (MIN-685 sidebar context menu source review inherited from en revision 10; es translation of added passages; no operational rerun); agent:/root (MIN-693 project roles: decision record, permission matrix and source review; no browser walkthrough, no new captures; unchanged evidence retained)",
    "language": "agent:/root/german_spanish_review (es title, summary, lead and heading review; retained body comparison); agent:/root/editorial_de_es (editorial clarity pass); agent:/root (figure removals and captions); agent:/root/native_hosting_terms (localized worker selection additions and equivalent meaning; agent review, no human acceptance claimed); agent:/root/native_identity_docs (localized additions and complete equivalent meaning; agent review, no human acceptance claimed); agent:/root (complete six-locale meaning review; agent review, not human acceptance); agent:/root (six-locale model-control meaning review; not human acceptance); agent:/root (six-locale card controls and delivery wording review; not human acceptance); agent:/root/min721_es (es translation of MIN-721 removal edits, equivalent meaning reviewed; agent review, not human acceptance); agent:/root (es translation of MIN-685 added passages with catalog UI labels, equivalent meaning self-reviewed; agent review, not human acceptance); agent:/root/min693_es with agent:/root (es MIN-693 translation of the changed passages, localized labels and retained-meaning review; agent review, not human acceptance)",
    "date": "2026-10-17"
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
      "revision": 11,
      "reviewed": true,
      "capturedAt": "2026-10-08",
      "viewport": [
        1528,
        1148
      ],
      "theme": "light",
      "padding": 24
    }
  ],
  "requiredFigures": [
    "review-pull-requests-workflow"
  ]
}
---

Minddy hace el seguimiento del trabajo; su propio agente de código, como Claude Code, Codex o Cursor, modifica el código. Copie un prompt desde la incidencia, deje que el agente lea y actualice la incidencia a través de minddy MCP y revise después la pull request vinculada en Minddy antes de fusionarla. Numo no escribe código, no abre ramas ni ejecuta pruebas.

## Encargar una incidencia a un agente de código externo {#external-coding-agents}

Conecte primero su agente a minddy MCP para que pueda leer el plan y actualizar sus tareas; consulte [Conectar un asistente externo al MCP de minddy](/docs/minddy-mcp#external-minddy-mcp). El agente se ejecuta en su ordenador o en su propio servicio, con su propia suscripción o sus propios costes de API. Minddy no le proporciona acceso al repositorio.

1. Abra la incidencia y describa el comportamiento esperado, las restricciones y las comprobaciones de aceptación. Escriba o revise el plan en su pestaña Plan cuando el trabajo tenga varios pasos.
2. Abra el menú de acciones de la incidencia y elija **Copiar como prompt**. Elija **Generar un plan** (o **Revisar el plan** si ya existe) para delimitar el trabajo sin programar, **Implementar la incidencia** para empezar el cambio, **Verificar la implementación** para que el agente revise el trabajo terminado frente al plan y los comentarios, o **Personalizado…** para escribir su propia instrucción.
3. Pegue el prompt en su agente, dentro de la copia de trabajo del repositorio. Copiar no ejecuta ningún modelo de IA ni consume cuota de IA.
4. Siga el progreso del plan en la incidencia mientras el agente actualiza sus tareas a través de MCP. Responda a sus preguntas en el agente o añada las decisiones a la incidencia para que el siguiente prompt las incluya.

El contenido del prompt, la rama sugerida y las reglas de idioma se describen en [Copiar un prompt para otro agente de código](/docs/issues#copy-issue-prompt).

### Mantener el trabajo vinculado a la incidencia {#link-work}

Cuando el repositorio está vinculado al proyecto, mantenga el identificador de la incidencia en el nombre de la rama, en el título de la pull request o en una línea `Fixes MIN-42`. Minddy vincula entonces la pull request a la incidencia, y los prompts siguientes indican al agente que continúe la pull request abierta en su rama.

En **Configuración de la cuenta → Preferencias**, **Inicia la incidencia o tarea cuando copies su prompt** pasa a «En curso» una incidencia o una tarea del cuaderno que aún no ha empezado cuando copia su prompt. Déjelo desactivado si solo copia prompts para leerlos.

## Revisar una pull request vinculada {#review-pull-requests}

Abra la pull request vinculada a una incidencia o búsquela en la lista de pull requests. Sigue siendo necesario acceder al repositorio; pertenecer al proyecto no concede permisos del proveedor Git.

Lea la descripción y la actividad y después los archivos modificados y los bloques de diferencias. Abra las conversaciones sin resolver y responda en el hilo correspondiente en lugar de crear un comentario aparte. Para devolver a su agente los comentarios pendientes, abra **Ver conversaciones**, después **Corregir todo** y **Copiar prompt**. Marcar archivos como revisados registra su lectura, pero no constituye una aprobación del proveedor. Compruebe los commits, los resultados de CI y las incidencias vinculadas para confirmar que el cambio propuesto cubre el trabajo solicitado.

Mencione `@numo` en un comentario de la pull request para pedir a Numo una revisión de solo lectura en una conversación. Numo lee la pull request y responde; no sube commits. Una mención escrita en el proveedor Git solo cuenta si su autor está vinculado al propietario o a un Miembro (no a un lector) de un proyecto que vincula el repositorio, y su uso se imputa al propietario de ese proyecto.

![Pestaña Cambios de la PR de demostración abierta, con las diferencias de greeting y un aviso de autorización de GitHub no disponible.](/documentation/es/review-pull-requests-workflow.png)

### Revisión y fusión {#decision}

Solicite otro revisor cuando haga falta una segunda revisión. Compruebe si es borrador o está lista para revisión, las discusiones abiertas, las revisiones solicitadas y la política de fusión del proveedor.

Fusione solo después de satisfacer los controles y revisiones aplicables y cuando su cuenta del proveedor tenga permiso. **Fusionar con Numo** permite que Numo redacte el título y la descripción del commit de fusión a partir de la pull request y fusione en cuanto estén listos. El proveedor Git puede rechazar una acción visible. Si el estado mostrado parece desactualizado, actualice y consulte el proveedor antes de repetir la acción. Una vista previa vinculada depende de un despliegue real del proveedor.

Haga clic derecho en una pull request de la lista para cambiar su estado, fusionarla o pedir una corrección sin abrirla. Una pull request abierta ofrece **Convertir en borrador** y **Cerrar pull request**, un borrador ofrece **Listo para la revisión** y **Cerrar pull request**, y una cerrada ofrece **Reabrir**; cada cambio pide confirmación. Una pull request fusionada no ofrece ningún cambio de estado. Las acciones de escritura solo aparecen cuando su cuenta del proveedor puede escribir en el repositorio y no están disponibles hasta que el menú vuelve a leer la pull request. **Fusionar** aparece cuando la pull request está abierta, no es un borrador y puede fusionarse; abre la pull request en su confirmación de fusión habitual. **Copiar prompt de corrección** y **Corregir con Numo** aparecen cuando falla una comprobación, hay una conversación sin resolver o la rama tiene conflictos o está desactualizada. **Corregir con Numo** envía ese prompt a Numo con la pull request como contexto. Los permisos y la posibilidad de fusionar se vuelven a comprobar al confirmar.

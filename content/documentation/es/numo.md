---
{
  "id": "numo",
  "locale": "es",
  "title": "Numo",
  "summary": "Trabaja con Numo, comprende sus permisos y ejecución, conecta servicios MCP y retoma el trabajo pendiente o interrumpido.",
  "topic": "Numo e integraciones",
  "type": "guide",
  "audiences": [
    "member",
    "owner",
    "integrator",
    "operator"
  ],
  "workflows": [
    "N01",
    "N02",
    "T05",
    "N08",
    "N05"
  ],
  "visibility": "public",
  "status": "published",
  "revision": 38,
  "sourceRevision": 38,
  "owner": "@mangue-dev",
  "updatedAt": "2026-11-11",
  "compatibility": {
    "version": "0.30.0 (MIN-794 release review)",
    "editions": [
      "Cloud",
      "self-hosted"
    ],
    "profiles": [
      "web",
      "mobile",
      "desktop",
      "full",
      "managed"
    ],
    "evidence": [
      "content/knowledge/agents-and-mcp.md",
      "components/assistant-panel.tsx",
      "components/assistant/chat-input.tsx",
      "content/knowledge/settings-and-data.md",
      "lib/server/assistant/tools.ts",
      "docs/architecture/numo-persistence.md",
      "docs/architecture/numo-durable-turns.md",
      "components/settings/account-mcp-section.tsx",
      "app/api/account/mcp-connections/route.ts",
      "components/settings/account-mcp-clients.tsx",
      "components/assistant/usage-exhausted-card.tsx",
      "components/assistant/ask-user-card.tsx",
      "lib/server/numo/request-stop.test.ts",
      "supabase/migrations/20270109200042_numo_stop_preserves_workers.sql",
      "lib/server/numo/turns.ts",
      "docs/security/project-roles.md",
      "lib/project-roles.ts",
      "components/assistant/assistant-context-bar.tsx",
      "lib/use-ask-numo-about-selection.ts",
      "lib/assistant-selection.ts",
      "lib/server/issue-reads.ts",
      "components/settings/account-settings-page.tsx",
      "lib/settings-sections.ts",
      "lib/server/assistant/conversation-attachments.ts",
      "lib/server/assistant/markdown-pdf.ts",
      "components/assistant/generated-file-cards.tsx",
      "components/assistant/assistant-starter-list.tsx",
      "app/(app)/home/page.tsx",
      "lib/keyboard/typeahead.ts",
      "lib/keyboard/keyboard-context.tsx",
      "components/assistant/assistant-shell.tsx",
      "components/assistant/chat-message.tsx",
      "components/typed-mention-chip.tsx",
      "lib/server/assistant/prompt.ts",
      "lib/server/numo-notes.ts",
      "lib/server/numo/memory-prompt.ts",
      "components/settings/account-numo-memory-section.tsx",
      "lib/server/assistant/long-message.ts",
      "lib/server/assistant/create-page-database.ts",
      "lib/server/numo/journal-content.ts",
      "lib/server/numo/journal-prompt.ts",
      "lib/server/numo/wake.ts",
      "lib/server/assistant/proactive-guard.ts",
      "lib/server/numo/watches.ts",
      "lib/server/numo/watch-clock.ts",
      "components/settings/account-numo-watches-section.tsx",
      "lib/server/numo/home-brief.ts",
      "lib/server/numo/home-brief-prompt.ts",
      "app/api/home/brief/route.ts",
      "components/home/home-numo-brief.tsx",
      "lib/server/numo/home-brief-opening.ts",
      "lib/numo-watches.ts",
      "lib/server/numo/watch-proposal.ts",
      "components/assistant/watch-proposal-card.tsx",
      "lib/server/numo/watch-prompt.ts",
      "lib/server/assistant/context-compaction.ts",
      "lib/server/assistant/conversation-config.ts",
      "components/assistant/conversation-settings.tsx",
      "components/settings/account-numo-section.tsx",
      "components/assistant/numo-intro.tsx"
    ]
  },
  "review": {
    "revision": 38,
    "fact": "agent:claude-code (MIN-912: desktop OAuth sentence checked against lib/mcp-authorization.ts and app/api/account/mcp-connections/oauth/callback/route.ts; rest of the article unchanged since the previous review; no figure recaptured, no figure shows this flow); agent:claude-code (Aligned quoted UI labels with the MIN-885 copy audit, checked against messages/*.json; not checked in the running app; rest of the article unchanged since the previous review; no figure recaptured); agent:claude-code (0.30.0 release review, MIN-794: its evidence changes in the v0.20.0..0.30.0 delta were documented by the pull requests that made them; the article was updated by pull requests in that delta; not re-audited line by line; 3 screenshot(s) recaptured on 2026-11-04 from a local candidate against the preview demo account and inspected; no browser walkthrough of the procedures); agent:claude-code (MIN-914: Numo messages in Inbox, their link targets, recipient rule and Messages from Numo switch, source audit against the change; no browser walkthrough; existing figures checked against the change and kept, not recaptured); agent:claude-code (MIN-915: Numo's memory section, source audit against the change; no browser walkthrough; no figure shows this flow; existing figures kept, not recaptured); agent:claude-code (MIN-927: Numo's journal section, source audit against the change; no browser walkthrough; no figure shows this flow; existing figures kept, not recaptured); agent:claude-code (MIN-929: Numo in the background section, source audit against the change; no browser walkthrough; no figure shows this flow; existing figures kept, not recaptured); agent:claude-code (MIN-923: Numo's reminders section, source audit against the change; no browser walkthrough; no figure shows this flow; existing figures kept, not recaptured); agent:claude-code (Numo in the background now on by default: first sentence of #background, checked against lib/numo-background.ts and migration 20270109200112); agent:claude-code (MIN-930: Home summary section, MIN-933 opening message, reminders sentence, journal, background and suggestion-row sentences, source audit against the change; no browser walkthrough yet; no figure shows this flow; existing figures kept, not recaptured); agent:claude-code (MIN-946: AI budget warning sentence of #home-word, source audit against the change; no browser walkthrough; no figure shows this flow; existing figures kept, not recaptured); agent:claude-code (MIN-953: recurring reminders section and the last paragraph of #reminders, source audit against lib/numo-watches.ts, lib/server/numo/watches.ts, watch-clock.ts, watch-proposal.ts, lib/server/assistant/proactive-guard.ts and messages/*.json; no browser walkthrough; no figure shows this flow; existing figures kept, not recaptured); agent:claude-code (MIN-954: step 2 of #work-with-numo, the default-model paragraph, the compaction paragraph of #continue and the model sentence of #numo-execution-model, source audit against lib/server/assistant/conversation-config.ts, lib/server/assistant/context-compaction.ts, components/assistant/conversation-settings.tsx and messages/*.json; no browser walkthrough; no figure shows the model control or the compaction step; existing figures kept, not recaptured); agent:claude-code (MIN-954 settings split: account settings paths moved from the former AI & Numo tab to the Numo, AI and MCP tabs, checked against components/settings/account-settings-page.tsx, components/settings/account-numo-section.tsx and messages/*.json; no browser walkthrough; existing figures kept, not recaptured); agent:claude-code (MIN-955: the paragraph on what Numo can change in #numo-permissions-and-approvals, source audit against lib/server/assistant/settings-coverage.ts, lib/server/account-settings.ts and the update_member_role tool; no browser walkthrough; no figure shows this flow; existing figures kept, not recaptured); agent:claude-code (MIN-956: search in earlier conversations paragraph and memory switch sentence of #memory, source audit against lib/server/numo/conversation-search.ts, lib/server/numo/turns.ts, lib/server/assistant/execute-tool.ts and messages/*.json; no browser walkthrough; no figure shows this flow; existing figures kept, not recaptured); agent:claude-code (MIN-907 Numo introduction: the message shown on Home and in an empty Numo panel when there is no summary, checked against components/assistant/numo-intro.tsx, app/(app)/home/page.tsx, components/assistant-panel.tsx, components/assistant/assistant-shell.tsx and messages/*.json; no browser walkthrough; no figure shows Home without a summary; existing figures kept, not recaptured)",
    "language": "agent:claude-code (es changed passages with catalog UI labels; self-reviewed; agent review, not human acceptance); agent:claude-code (es MIN-914 passage translated from en with catalog UI labels and the locale register; self-reviewed; agent review, not human acceptance); agent:claude-code (es MIN-915 passage with catalog UI labels; self-reviewed; agent review, not human acceptance); agent:claude-code (es MIN-927 passage with catalog UI labels; self-reviewed; agent review, not human acceptance); agent:claude-code (es MIN-929 passage translated from en with catalog UI labels; self-reviewed; agent review, not human acceptance); agent:claude-code (es MIN-923 passage with catalog UI labels and the locale register; self-reviewed; agent review, not human acceptance); agent:claude-code (es MIN-930 passage translated from en with catalog UI labels and the locale register; self-reviewed; agent review, not human acceptance); agent:claude-code (es MIN-946 passage translated from en with catalog UI labels and the locale register; self-reviewed; agent review, not human acceptance); agent:claude-code (es MIN-953 passage translated from en with catalog UI labels and the locale register; self-reviewed; agent review, not human acceptance); agent:claude-code (es MIN-954 passage with catalog UI labels; self-reviewed; agent review, not human acceptance); agent:claude-code (es MIN-954 settings paths with catalog UI labels; self-reviewed; agent review, not human acceptance); agent:claude-code (es MIN-955 passage translated from en; self-reviewed; agent review, not human acceptance); agent:claude-code (es MIN-907 Numo introduction paragraph, in the locale's register and glossary; self-reviewed; agent review, not human acceptance)",
    "date": "2026-11-11"
  },
  "related": [
    "code-work",
    "minddy-mcp",
    "architecture-and-data-flows",
    "integration-troubleshooting"
  ],
  "aliases": [
    "work-with-numo",
    "agents-and-mcp",
    "numo-permissions-and-approvals",
    "numo-execution-model",
    "numo-mcp-connections",
    "recover-numo-work"
  ],
  "tags": [
    "Completar una tarea del proyecto con Numo",
    "Entender los permisos de Numo",
    "Comprender los turnos duraderos de Numo",
    "Conectar un servicio MCP personal a Numo",
    "Recuperar trabajo de Numo detenido o pendiente"
  ],
  "figures": [
    {
      "id": "work-with-numo-workflow",
      "kind": "screenshot",
      "src": "/documentation/es/work-with-numo-workflow.png",
      "alt": "Conversación de demostración de Numo con contexto, cambio de prioridad y respuesta guardada.",
      "caption": "Conversación de demostración existente, traducida para mostrarla. La respuesta guardada cita AUR-11 y AUR-7; la captura no acredita una nueva ejecución.",
      "revision": 38,
      "reviewed": true,
      "capturedAt": "2026-11-04",
      "viewport": [
        498,
        648
      ],
      "theme": "light",
      "padding": 24,
      "deviceScaleFactor": 2
    },
    {
      "id": "numo-permissions-and-approvals-workflow",
      "kind": "diagram",
      "src": "/documentation/es/numo-permissions-and-approvals-workflow.svg",
      "alt": "Matriz de permisos de Numo para acciones del proyecto, conexiones personales y rutinas.",
      "caption": "El acceso al proyecto y las peticiones explícitas limitan las acciones de Numo; el contenido externo no concede permisos.",
      "revision": 38,
      "reviewed": true,
      "capturedAt": "2026-10-08",
      "viewport": [
        1100,
        790
      ],
      "theme": "neutral",
      "diagram": {
        "layout": "matrix",
        "title": "Numo: acceso y autorización",
        "headers": [
          "Acción o contexto",
          "Quién autoriza",
          "Límite"
        ],
        "rows": [
          [
            "Trabajo del proyecto",
            "Miembro con acceso al proyecto",
            "Se siguen aplicando los permisos del proyecto"
          ],
          [
            "Ajustes del propietario",
            "Propietario del proyecto",
            "Miembros, repositorio y ajustes de feedback"
          ],
          [
            "Credenciales y seguridad",
            "Titular de la cuenta, en ajustes",
            "Configurar claves, Git y doble factor directamente"
          ],
          [
            "Respuesta pública al feedback",
            "Petición explícita del usuario",
            "Leer una petición no autoriza una respuesta pública"
          ],
          [
            "MCP personal",
            "Quien solicita la conversación",
            "Sin conexiones personales de otros miembros"
          ],
          [
            "Rutina programada",
            "Propietario actual del proyecto",
            "Conexiones y presupuesto de IA del propietario"
          ],
          [
            "Resultado MCP remoto",
            "Contenido externo no fiable",
            "No puede autorizar acciones adicionales"
          ]
        ]
      }
    },
    {
      "id": "numo-execution-model-flow",
      "kind": "diagram",
      "src": "/documentation/es/numo-execution-model-flow.svg",
      "alt": "Diagrama: Persistir intención, mensaje y UUID. Reclamar turno, guardar herramientas y resultados. Esperar tu respuesta cuando haga falta información. Releer eventos y conciliar escrituras inciertas.",
      "caption": "Sigue las etapas en este orden. Persistir intención, mensaje y UUID. Reclamar turno, guardar herramientas y resultados. Esperar tu respuesta cuando haga falta información. Releer eventos y conciliar escrituras inciertas.",
      "revision": 38,
      "reviewed": true,
      "capturedAt": "2026-10-16",
      "viewport": [
        720,
        640
      ],
      "theme": "neutral",
      "diagram": {
        "layout": "sequence",
        "items": [
          {
            "title": "Persistir intención, mensaje y UUID"
          },
          {
            "title": "Reclamar turno, guardar herramientas y resultados"
          },
          {
            "title": "Esperar tu respuesta cuando haga falta información"
          },
          {
            "title": "Releer eventos y conciliar escrituras inciertas"
          }
        ]
      }
    },
    {
      "id": "numo-mcp-connections-workflow",
      "kind": "screenshot",
      "src": "/documentation/es/numo-mcp-connections-workflow.png",
      "alt": "Ajustes MCP personales, lista vacía y botón para añadir otro servidor.",
      "caption": "Las conexiones de Numo son personales; las rutinas usan las del propietario del proyecto.",
      "revision": 38,
      "reviewed": true,
      "capturedAt": "2026-11-04",
      "viewport": [
        816,
        1314
      ],
      "theme": "light",
      "padding": 24,
      "deviceScaleFactor": 2
    },
    {
      "id": "numo-mcp-connections-config-workflow",
      "kind": "screenshot",
      "src": "/documentation/es/numo-mcp-connections-config-workflow.png",
      "alt": "Asistente de conexión de Notion con el método de inicio de sesión conocido por el catálogo.",
      "caption": "Paso de inicio de sesión de un servicio del catálogo. No se introdujeron credenciales ni se contactó con ningún servidor.",
      "revision": 38,
      "reviewed": true,
      "capturedAt": "2026-11-04",
      "viewport": [
        560,
        354
      ],
      "theme": "light",
      "padding": 24,
      "deviceScaleFactor": 2
    }
  ],
  "requiredFigures": [
    "work-with-numo-workflow",
    "numo-permissions-and-approvals-workflow",
    "numo-execution-model-flow",
    "numo-mcp-connections-workflow",
    "numo-mcp-connections-config-workflow"
  ]
}
---

Numo trabaja con el contexto de tu conversación y los permisos de tu cuenta. Formula una petición acotada y comprueba el resultado. Los apartados de autorizaciones y ejecución explican el trabajo programado. Si un turno está pendiente o ha fallado, revisa el estado guardado antes de repetir la petición.

## Completar una tarea del proyecto con Numo {#work-with-numo}

Abre la incidencia o el proyecto y usa el botón flotante de Numo. La página actual pasa a ser el contexto. Las acciones contextuales que delegan trabajo en Numo abren este mismo panel. Necesitas acceso al proyecto y uso de IA disponible o una clave personal compatible.

1. Comprueba el contexto del cuadro de entrada. Indica la incidencia si hay varios elementos relevantes. Para añadir una incidencia como contexto, escribe `@` en el cuadro de entrada o usa **Añadir contexto**, que agrupa el contexto en las mismas secciones que el menú `@`, las incidencias en **Incidencias** y tus servidores MCP conectados en **Servidores MCP**; una descripción también muestra incidencias encontradas [por el sentido](/docs/navigation#search-by-meaning) bajo **Relacionadas por significado**.
2. En minddy Cloud, Numo usa el modelo y el nivel de razonamiento que eligió la administración de tu instancia, como Smart Fill y Smart Assign, y el campo de composición no muestra ningún control de modelo. Con una clave personal para Numo, el logotipo del proveedor, junto al micrófono, elige el proveedor, el modelo y el nivel de razonamiento de la conversación; al pasar el cursor se muestra el modelo actual. Si el modelo no ofrece control del razonamiento, el control deslizante se queda en **Sin razonamiento**; en un modelo que siempre razona, **Sin razonamiento** usa su nivel más ligero. El mismo logotipo devuelve la conversación a **minddy Cloud**.
3. Envía una petición acotada, por ejemplo: «Lee esta incidencia y propón criterios de aceptación. No cambies su estado».
4. Lee la respuesta y abre sus enlaces a incidencias o fuentes. Si pediste una modificación, comprueba el objeto modificado. Las incidencias, objetivos, proyectos, páginas y miembros que Numo encontró aparecen en su respuesta como menciones en forma de etiqueta: cada una abre su destino, y la que no puedes ver se muestra como **No disponible**. Numo también escribe estas menciones en lo que redacta, como las descripciones y planes de las incidencias, las descripciones de objetivos, los comentarios, las páginas y el cuaderno, solo para los elementos que identificó; un miembro mencionado ahí recibe una notificación como con cualquier mención.

En una conversación nueva y vacía, cuatro filas de sugerencias encima del campo de redacción proponen peticiones adaptadas a la página actual, por ejemplo **Resumir esta incidencia** o **Escribir un plan de implementación** cuando hay una incidencia abierta en el panel lateral. Elegir una fila rellena el campo sin enviarlo, para que puedas ajustar la petición antes. Las filas desaparecen en cuanto el campo contiene texto y vuelven cuando lo vacías. Aparecen en el diseño de escritorio, no en un teléfono. El campo de redacción al pie de **Inicio** muestra las mismas filas, con sugerencias como **Elegir en qué centrarme hoy** o **Encontrar lo atrasado**. **Inicio** es en sí una conversación con Numo, igual que el panel sin su encabezado: cada visita abre una nueva, salvo que haya una respuesta en curso, y es independiente de la que está abierta en el panel; la anterior queda en el historial, y el botón **Nueva conversación** arriba a la derecha empieza otra. Cuando Numo ya escribió su resumen, las filas de **Inicio** son las sugerencias escritas con él ([el resumen de Numo en Inicio](#home-word)).

En **Inicio**, y en el panel de Numo cuando está ampliado o tiene el foco, puedes empezar a escribir sin hacer clic en el campo de redacción: una ráfaga rápida de teclas pulsadas fuera de un campo de texto va al campo de redacción, que toma el foco. Una sola tecla sigue ejecutando su atajo de teclado, por ejemplo C para crear una incidencia, unos 0,2 segundos después en esas pantallas. G seguida de una tecla sigue siendo una secuencia de navegación; una tercera tecla en la ráfaga la convierte en texto.

Para preguntar a Numo por un fragmento, selecciónalo en un editor, como una página o la descripción de una incidencia, y elige **Pregúntale a Numo** en la barra de herramientas de selección, en un ordenador. El panel se abre sin enviar nada: junto a la página o la incidencia de la que procede, el fragmento aparece como una píldora de contexto con sus primeras palabras, y al pasar el cursor sobre la píldora ves el fragmento completo. Escribe tu pregunta, por ejemplo «Reescribe esto de forma más concisa» o «Crea incidencias a partir de esto», y envíala. El fragmento acompaña solo a ese mensaje. Para no incluirlo, quita su píldora con su cruz.

Numo también puede ver las imágenes de la descripción de una incidencia o de un objetivo, de un plan, de un comentario, de una página o de tu cuaderno cuando el modelo de la conversación acepta imágenes. Sin esa capacidad, Numo indica que no pudo ver la imagen en lugar de describirla.

Numo también puede escribir un archivo para descargar: un informe o un documento en PDF, una exportación en CSV, o un archivo de texto, Markdown, HTML, JSON, XML, SVG o de calendario. Pídelo en tu solicitud; Numo puede crearlo a partir de los archivos que añadiste a la conversación. El archivo aparece como una tarjeta bajo su respuesta: al seleccionar la tarjeta se abre su vista previa cuando el formato lo permite, **Descargar** lo guarda, y el menú de al lado ofrece **Vista previa** y **Copiar el contenido**. El archivo se queda en el almacenamiento privado de tu conversación; para compartirlo con el proyecto, pide a Numo que lo adjunte a una incidencia, a un objetivo o a un comentario que publique allí. Un PDF usa las fuentes estándar: los caracteres fuera de los alfabetos de Europa occidental y los emojis no aparecen.

Si pegas en el campo de mensaje un texto de más de 12.000 caracteres, como unos logs, se adjunta a tu mensaje como **Texto pegado** en lugar de llenar el campo de mensaje. Numo lee el archivo entero antes de basarse en él, así que un CSV hecho con tus logs incluye todas las líneas. Un mensaje largo que llega a Numo por otra vía se adjunta igual: el mensaje conserva sus primeras líneas y nombra el archivo.

Cuando pides un seguimiento, o una lista de elementos que comparten campos, como candidaturas con su empresa, su estado y su fecha, Numo crea una [base de datos](/docs/databases) con esas columnas y sus primeras entradas en lugar de una página.

Con una clave personal, el modelo predeterminado de Numo se configura en **Ajustes de la cuenta → IA → Numo → Conversaciones**, guardado para ese proveedor: el valor de la app o un modelo que elijas. La elección propia de una conversación tiene prioridad. En minddy Cloud no hay modelo que elegir. Consulta [los ajustes de IA y uso](/docs/ai-settings-and-usage#ai-keys-and-models).

![Conversación de demostración de Numo con contexto, cambio de prioridad y respuesta guardada.](/documentation/es/work-with-numo-workflow.png)

### Continuar una conversación {#continue}

La lista permite recuperar conversaciones anteriores. Continúa la que contiene las decisiones necesarias. Numo organiza y sigue el trabajo: lee y actualiza incidencias, planes, páginas y otros contenidos de minddy, y puede leer las pull requests vinculadas. Si se lo pides, también puede comentar una pull request, resolver las conversaciones de revisión ya atendidas y fusionarla. Cuando Numo busca incidencias, las coincidencias de texto y los identificadores exactos van primero; una búsqueda descriptiva puede añadir incidencias del mismo proyecto encontradas por el sentido, que Numo debe comprobar antes de basarse en ellas. No escribe código ni hace push de commits. Para que se escriba código, copia el prompt de la incidencia para tu propio agente de código; consulta [Trabajo con código y pull requests](/docs/code-work#external-coding-agents).

Cuando una conversación se vuelve demasiado larga para reenviarla a bajo coste, unos 90.000 tokens o tres cuartas partes de lo que el modelo puede leer si es menos, Numo la compacta antes de su siguiente llamada: la respuesta muestra **Compactando el contexto…** y después **Contexto compactado**. Numo resume los mensajes y resultados de herramientas más antiguos y conserva literalmente tu último mensaje y los últimos intercambios; las respuestas siguientes parten de ese resumen. El resumen cuenta en el uso de IA como el resto de la respuesta. Si falla, el paso indica **No se pudo compactar el contexto** y Numo responde con toda la conversación.

Si solicita información, envía tu elección antes de esperar que continúen las acciones dependientes. Una tarjeta de consumo o error explica la interrupción. Comprueba cualquier escritura externa antes de pedir que se repita.

## Entender los permisos de Numo {#numo-permissions-and-approvals}

Numo actúa dentro del acceso y el rol del usuario actual. Pedirlo por chat no concede a un miembro ajustes exclusivos del propietario. El Numo de un lector, en el chat o mediante `@Numo` en un comentario que tenga permitido publicar, solo usa herramientas de lectura y se factura al lector. El propietario administra miembros, integraciones, repositorios y configuración del tablón de feedback. Los ajustes personales pertenecen a la cuenta actual.

Numo puede cambiar las preferencias de tu cuenta, ocultar o volver a mostrar proyectos para ti y, cuando un proyecto es tuyo, sus ajustes, sus miembros y sus roles. Algunas acciones siguen siendo tuyas: las claves de proveedores y los modelos de IA, las conexiones Git, el inicio de sesión, el segundo factor y las aplicaciones conectadas, el avatar y el icono del proyecto, la transferencia de la propiedad, la exportación de datos y la eliminación de la cuenta.

### Autorizar la acción {#authorization}

Describe el cambio y su alcance. Leer una solicitud no autoriza contestarla públicamente: Numo solo envía respuestas públicas a solicitudes de feedback cuando se le pide expresamente. Las instrucciones o resultados de un MCP remoto no autorizan acciones adicionales. Conecta únicamente servicios a los que confíe la información y las acciones previstas.

Una petición puede llegar a un proveedor externo. Desactivar la conexión impide nuevas llamadas, pero no retira las enviadas. Comprueba en el destino una escritura que haya agotado el tiempo antes de repetirla.

### Contexto personal y programado {#context}

Las conversaciones no usan conexiones MCP personales de otros miembros. Las rutinas utilizan las conexiones y el presupuesto del propietario. Tras una transferencia de la propiedad, las rutinas del propietario anterior en el proyecto se pausan; el nuevo propietario crea las rutinas que deban continuar. Una ejecución anterior no puede seguir usando las credenciales del propietario anterior. Numo se ejecuta en el servidor: no lee archivos de tu ordenador ni usa tus sesiones personales.

Numo puede dejar un mensaje en tu bandeja de entrada, con una alerta push, cuando una rutina encuentra algo que necesita tu atención o cuando le pides que te avise más tarde. El mensaje solo llega a la cuenta para la que trabaja Numo, que en una rutina es su propietario. El interruptor Mensajes de Numo de las [preferencias de notificación](/docs/notifications-and-inbox#notification-preferences) desactiva estos mensajes.

![Matriz de permisos de Numo para acciones del proyecto, conexiones personales y rutinas.](/documentation/es/numo-permissions-and-approvals-workflow.svg)

### Memoria de Numo {#memory}

Numo guarda recuerdos breves sobre ti para que no tengas que repetirte: una preferencia como «escribe los títulos de mis incidencias en inglés», un hecho como «el proyecto Mobile está en pausa hasta enero» o una instrucción permanente. Guarda uno cuando se lo pides («recuerda que…») o cuando expresas una preferencia que claramente quieres que se aplique la próxima vez, y lo dice en su respuesta. Desde entonces, tus recuerdos se aplican en cada conversación.

Un recuerdo vale para todos tus proyectos o para uno solo; Numo te pregunta cuando no sabe cuál. Un recuerdo de proyecto se usa en las conversaciones de ese proyecto y cuando Numo trabaja en ese proyecto desde otra conversación. Tus recuerdos son solo tuyos: los demás miembros no los ven y su Numo no los usa. Las rutinas y `@Numo` en un comentario leen tus recuerdos, pero no pueden cambiarlos. Puedes guardar hasta 100 recuerdos de 1000 caracteres cada uno; al llegar al límite, Numo te pregunta cuál reemplazar.

Numo también puede buscar en tus conversaciones anteriores con él. Cuando te refieres a algo ya dicho que no está en la conversación actual ni en tus recuerdos («como decidimos la semana pasada», «busca la conversación sobre los precios»), busca en lo que escribiste y en lo que respondió, lee la conversación que encaja y te dice a cuál se refiere. Solo busca en tus propias conversaciones, incluidas las archivadas: las 100 con actividad más reciente, o las de un periodo que indiques. Lo que devolvieron sus herramientas no se busca. Las rutinas, `@Numo` en un comentario y Numo en segundo plano no buscan en tus conversaciones, y sus propias conversaciones no se buscan.

**Ajustes de la cuenta → Numo → Recuerdos** muestra cada recuerdo con el proyecto al que se aplica. **Editar** cambia su texto, **Eliminar** lo quita y **Olvidarlo todo** los quita todos; una eliminación no se puede deshacer. También puedes pedirle a Numo que olvide algo. **Memoria de Numo**, en la tarjeta **Numo** de arriba, desactiva la memoria: Numo deja de leer y guardar recuerdos y no busca en tus conversaciones anteriores; los recuerdos guardados se conservan.

### Diario de Numo {#journal}

Numo lleva un diario de lo que te espera y de lo que hizo por ti mientras no mirabas: «la PR #12 lleva 3 días esperando tu revisión», «hice la búsqueda web que pediste en MIN-42». Escribe una entrada cuando le pides que lleve la cuenta de algo («anota que espero la respuesta del cliente») y, en una rutina o un comentario `@Numo`, cuando cambia tu contenido. Cierra la entrada cuando el asunto queda resuelto. La conversación muestra entonces **Anotado en el diario** o **Entrada del diario cerrada**. El diario es solo tuyo, no envía ninguna notificación y las entradas cerradas se eliminan en un plazo de 180 días. **Inicio** lo resume ([el resumen de Numo en Inicio](#home-word)); para ver cada entrada, pregúntale a Numo en una conversación, o pídele que cierre una.

### El resumen de Numo en Inicio {#home-word}

Cuando **Inicio** abre su nueva conversación, Numo escribe primero, bajo el saludo: unas pocas frases que resumen su diario, con primero lo que te espera, luego lo que hizo que afecta a tu contenido y después lo que se ofrece a hacer por su cuenta. Los elementos que cita, como una incidencia o una página, se abren con un clic. Cuando Numo preparó algo para ti, como un resumen de tus proyectos o una búsqueda, el resumen da lo esencial y las cifras en lugar de remitirte a una conversación. Numo reescribe el resumen en segundo plano después de cada turno que escribe o cierra una entrada del diario, así que está al día antes de que abras **Inicio**, y abrir la página no llama a la IA. Si una entrada que cubre se resuelve entretanto, **Inicio** oculta el resumen hasta que Numo escribe el siguiente. Mostrar el resumen marca como vistas las entradas que cubre: un resumen posterior deja fuera lo que se resolvió y solo vuelve a mencionar lo que aún te espera. Cuando tu presupuesto de IA va camino de agotarse antes de renovarse, el resumen empieza por eso: el día en que se agotará al ritmo actual y la parte ya consumida, en porcentaje. Cuando no hay nada abierto ni sin ver en el diario y el presupuesto alcanza, no hay resumen.

Cuando no hay resumen, Numo se presenta en su lugar debajo del saludo: un mensaje breve que te nombra, cita el primer proyecto en el que puedes crear incidencias y dice lo que Numo puede hacer en él. Sin un proyecto así, dice lo que Numo hará en cuanto tengas uno. Un panel de Numo vacío se abre con la misma presentación. minddy la escribe sin llamar a la IA y nunca la guarda: desaparece cuando envías tu primer mensaje, y el resumen la sustituye en cuanto Numo escribe uno.

En cuanto escribes, el saludo y el resumen se quedan arriba de la conversación que empiezas debajo en **Inicio**, el resumen como primer mensaje de Numo; sin resumen, la conversación empieza con tu mensaje. Se guarda como el primer mensaje de Numo en esa conversación: Numo lo lee al responderte, como la continuación de lo que dijo, y el panel y el historial también lo muestran. Encima del campo de redacción, hasta cuatro sugerencias escritas con el resumen sustituyen a las filas habituales, o ninguna cuando nada concreto encaja. También sirven como respuestas rápidas, por ejemplo **Sí, hazlo por tu cuenta a partir de ahora**, y cada una es una petición completa. Elegir una rellena el campo sin enviarlo. Con Numo en segundo plano desactivado, **Inicio** se abre con el saludo, la presentación de Numo y las filas habituales, sin resumen. En una instancia sin IA no hay conversación: **Inicio** muestra el saludo y los avisos de tu cuenta, como las invitaciones pendientes o la aplicación de escritorio.

### Numo en segundo plano {#background}

**Ajustes de la cuenta → Numo → Numo en segundo plano** está activado por defecto: Numo trabaja para ti mientras no estás. Cuando algo en tus proyectos te concierne, como una incidencia asignada a ti, una mención o una rutina fallida, o coincide con lo que uno de tus recuerdos le pide vigilar, Numo se activa unos minutos después y actúa con las mismas herramientas y el mismo modelo que en una conversación. Con el recuerdo «para cada nueva incidencia de MIN que necesite una búsqueda web, hazla y publica el resultado como comentario», investiga cada nueva incidencia, publica el comentario y lo anota en su diario, donde escribe lo que hizo y lo que te espera. **Inicio** resume lo que anotó. El interruptor necesita la memoria de Numo: mientras la memoria esté desactivada, Numo en segundo plano también lo está, y vuelve con ella.

En un proyecto compartido, Numo solo cambia lo que es tuyo: las incidencias asignadas a ti o que creaste, los objetivos que lideras y las páginas que creaste. Crear contenido ahí, o cambiar cualquier otra cosa, necesita un recuerdo que lo pida. En todos tus proyectos, también en los que trabajas solo, no manda nada a la papelera ni restaura nada, no actúa sobre ningún pull request, no llama a herramientas MCP externas, no administra el proyecto (ajustes, miembros, integraciones), no cambia los ajustes de tu cuenta y no responde públicamente a los comentarios de feedback, salvo que uno de tus recuerdos permita esa acción. El servidor comprueba que el recuerdo existe, es tuyo y se aplica al proyecto que toca la acción. Numo solo te deja un mensaje en la bandeja de entrada cuando un recuerdo lo pide, o por algo urgente, y en ese caso como mucho dos veces en 24 horas.

Si eres administrador de la instancia y tienes activada la autenticación de dos factores, Numo en segundo plano también puede [administrar la instancia](/docs/instance-administration#numo). Lee por su cuenta la configuración de modelos de IA y los costes de IA, así que puedes darle un recuerdo como «vigila los modelos de IA configurados en la instancia y avísame cuando uno más barato sirva». Cambiar o importar la configuración de modelos, buscar una cuenta o cambiar su plan necesita un recuerdo que permita esa acción; sin él, Numo pregunta en su diario e **Inicio** muestra la pregunta. Tu cuenta se comprueba antes de cada una de estas acciones: en cuanto pierde el rol de administrador o la autenticación de dos factores, Numo también los pierde.

Cuando una acción necesita un permiso que no tiene, Numo lo pide en su diario y se ofrece a hacerlo solo la próxima vez. Para permitirlo, díselo a Numo en una conversación, por ejemplo «sí, hazlo siempre»: guarda un recuerdo y lo usa la próxima vez que se active. Para limitar a Numo, dale un recuerdo como «en el proyecto Design, solo anota en el diario», edita o elimina el recuerdo que permitía una acción, o desactiva el interruptor: una activación que aún no ha empezado se cancela, y una en curso termina. La revisión de tus eventos, cada activación y el resumen de Numo en **Inicio** cuentan en tu uso de IA, y un administrador decide cuántas activaciones recibe cada miembro en 24 horas, 20 por defecto. Cada activación ocurre en una conversación propia, que no aparece en tu lista de conversaciones y se elimina a los 30 días.

### Recordatorios de Numo {#reminders}

Pídele a Numo en una conversación que piense en algo por ti más adelante: «cuando MIN-42 esté terminada, recuérdame avisar al cliente», «cuando el objetivo 0.40 esté terminado, crea la incidencia de la versión» o «recuérdame el viernes a las 9:00 enviar la factura». Numo crea un recordatorio sobre una incidencia (un estado, o un comentario de otra persona), un objetivo (un estado) o una fecha, y la conversación muestra **Recordatorio creado**. Mientras no se cumpla la condición, no se ejecuta nada ni se descuenta nada de tu uso de IA: minddy la comprueba cada cinco minutos.

Cuando se cumple la condición, el recordatorio se activa una sola vez. Para algo que harás tú, recibes un mensaje de Numo en la Bandeja de entrada con tu instrucción. Para algo que le pediste a Numo, el mensaje dice que Numo se está encargando, y Numo lleva a cabo la instrucción en la conversación donde creaste el recordatorio (en una nueva si esa conversación se eliminó o está ocupada), con las herramientas y los permisos que tengas en ese momento; ese turno cuenta en tu uso de IA. Nadie sigue ese turno: Numo no hace preguntas, no cambia su memoria y no envía nada a la papelera, no fusiona nada ni administra nada; en su respuesta dice lo que te dejó. Si alcanzaste tu límite de uso, o si el turno falla, recibes un mensaje y Numo no actúa. Con **Mensajes de Numo** desactivado, no llega ningún mensaje. Cuando Numo cambió algo con un recordatorio, por ejemplo una incidencia, una página o un comentario, anota en su diario lo que hizo, y [el resumen de Numo en Inicio](#home-word) te lo cuenta. Un recordatorio que solo te envía un mensaje no aparece ahí.

Un recordatorio cuya condición nunca se cumple caduca a los 90 días, y puedes tener 20 a la vez. Mientras su incidencia u objetivo está en la papelera, el recordatorio espera; se cancela cuando el elemento se elimina definitivamente o cuando pierdes el acceso a su proyecto.

Un recordatorio puntual se activa una vez, para una incidencia, un objetivo o una fecha; para algo que vuelve, crea un [recordatorio recurrente](#recurring-reminders). Solo tú creas un recordatorio, en una conversación con Numo: las rutinas, las menciones `@Numo`, Numo en segundo plano y la ejecución de un recordatorio no pueden crear, cambiar ni cancelar ninguno. **Ajustes de la cuenta → Numo → Recordatorios** muestra los recordatorios que conservas, y **Cancelar recordatorio** quita uno. Para cambiar un recordatorio, pídeselo a Numo.

### Recordatorios recurrentes {#recurring-reminders}

Un recordatorio también puede volver de forma periódica: «todas las tardes a las 19:00, repasa mis incidencias y prepara mi día de mañana», o «cada lunes a las 9:00, revisa los costes de los modelos y avísame si se disparan». Numo lo programa para todos los días, de lunes a viernes, un día a la semana o un día al mes, a una hora de tu zona horaria, que mantiene en los cambios de hora. Un mes más corto que el día elegido usa su último día. Un recordatorio recurrente no caduca, y puedes tener 5 activos entre tus 20.

En cada ejecución, Numo lleva a cabo la instrucción en una conversación nueva, que lleva el nombre del recordatorio y el día, con las herramientas y los permisos que tengas en ese momento; esa ejecución cuenta en tu uso de IA. Nadie la sigue: Numo no hace preguntas, no cambia su memoria y respeta los límites de [Numo en segundo plano](#background): en un proyecto compartido solo cambia lo que es tuyo, y no realiza ninguna acción sensible. Tus recuerdos no levantan esos límites aquí; solo lo hacen los permisos del propio recordatorio. Numo anota el resultado en su diario, y [el resumen de Numo en Inicio](#home-word) te lo cuenta. Ningún mensaje anuncia cada ejecución.

Para que un recordatorio recurrente pueda hacer más, pídelo al crearlo. Se le puede permitir notificarte aunque no sea urgente, cambiar contenido que no es tuyo en un proyecto compartido, actuar sobre pull requests, llamar a tus herramientas MCP externas, responder públicamente a las sugerencias, usar la papelera, quitar miembros, invitaciones e integraciones, cambiar los ajustes de tu cuenta, o administrar tus proyectos y, para un administrador, la instancia. En ese caso Numo no guarda nada por sí mismo: la conversación muestra una tarjeta que enumera lo que el recordatorio podrá hacer, y **Permitir y crear** lo guarda. Tus permisos se comprueban de nuevo en cada ejecución: un recordatorio autorizado a administrar la instancia no recibe ninguna herramienta de administración cuando tu cuenta deja de ser administradora, y un recordatorio se cancela cuando pierdes el acceso a su proyecto. Numo no puede añadir un permiso a un recordatorio ni reformular uno que tiene permisos: propone un reemplazo, que confirmas en una tarjeta nueva.

Una ejecución que minddy se perdió por más de seis horas se omite. Cuando una ejecución no termina, o alcanzas tu límite de uso, recibes un mensaje. Tras 3 ejecuciones seguidas que no terminan, el recordatorio se pausa y un mensaje te lo dice. **Ajustes de la cuenta → Numo → Recordatorios** muestra, para cada recordatorio recurrente, su periodicidad, su próxima ejecución, lo que puede hacer y su última ejecución, con un enlace a esa conversación. **Pausar recordatorio** lo detiene y **Reanudar recordatorio** lo reactiva en su próxima ejecución.

Un recordatorio recurrente es tuyo; una rutina pertenece a un proyecto. Solo tú ves tu recordatorio y sus conversaciones, se ejecuta con tus permisos y sobre tu uso de IA, y puede tener permisos propios. Todos los miembros del proyecto ven una rutina y sus ejecuciones, se ejecuta sobre el uso y las conexiones del propietario del proyecto, también puede empezar con un evento, y nunca llega a la administración de la instancia. Usa un recordatorio recurrente para tus hábitos y una rutina para el trabajo que comparte el equipo.

## Comprender los turnos duraderos de Numo {#numo-execution-model}

Los mensajes interactivos, acciones contextuales y rutinas entran en conversaciones Numo. Con una clave personal, el modelo y el razonamiento de la conversación se eligen en el campo de composición; en minddy Cloud los fija la instancia. Numo actúa mediante sus herramientas de minddy y las conexiones MCP personales que hayas añadido; no necesita ningún repositorio. Una rutina crea una nueva conversación con instrucciones guardadas y contexto de propietario y proyecto. No es necesario mantener una sesión de escritorio abierta.

![Diagrama: Persistir intención, mensaje y UUID. Reclamar turno, guardar herramientas y resultados. Esperar tu respuesta cuando haga falta información. Releer eventos y conciliar escrituras inciertas.](/documentation/es/numo-execution-model-flow.svg)

### Separar ejecución y visualización {#state}

La intención se guarda como un turno duradero con el UUID de petición y su mensaje. Pasa de `queued` a `running` y después a `completed` o `waiting_input`. `stopping` y `stopped` representan una interrupción; `retryable` y `failed` representan errores. SSE muestra la actividad persistida, pero no controla la ejecución. Tras reconectar, se leen los mensajes y eventos posteriores a la última secuencia recibida. Los eventos duplicados o antiguos no crean otra tarea. El contexto de proyecto no equivale a acceso: una conversación privada sigue siendo privada.

### Tratar cambios inciertos {#mutations}

Antes de modificar datos, el sistema registra la operación y su checkpoint. Reutiliza los resultados completados. Una lectura interrumpida puede repetirse; una modificación con resultado desconocido pasa a `reconciling`, sin repetición automática. Comprueba el destino antes de volver a escribir externamente. Las conexiones y el presupuesto de las rutinas siguen sujetos a la propiedad y a las protecciones de coste; otro miembro no puede usar las credenciales MCP personales del propietario anterior.

Detener Numo termina su turno. Una acción externa ya enviada todavía puede finalizar. Una conversación que esperaba trabajo de código de una versión anterior se detiene automáticamente y vuelve a quedar inactiva.

## Conectar un servicio MCP personal a Numo {#numo-mcp-connections}

En los ajustes de cuenta, abre **MCP** y usa la tarjeta **MCP para Numo**. Los enlaces a la antigua pestaña MCP para Numo llevan allí. Elige un servicio del catálogo o añade otro servidor MCP HTTPS público. El catálogo y registro no evitan requisitos de inscripción o aprobación del proveedor. Numo puede preparar la conexión en una conversación interactiva, pero no en una rutina autónoma.

La conexión se hace en un asistente. Un servidor personalizado o del registro pide primero su nombre y su dirección HTTPS; un servicio del catálogo se abre directamente en el paso de inicio de sesión. Un servicio del catálogo, una conexión guardada o una entrada del registro que declara un token ya conoce su método de inicio de sesión: el paso lo muestra y **Usar otro método** permite cambiarlo. Si no, elige **Iniciar sesión con OAuth**, **Token Bearer** o **Sin autenticación**. Las **Opciones avanzadas** contienen el transporte (Streamable HTTP por defecto, también admite SSE antiguo) y las cabeceras cifradas. Pon secretos en credenciales o cabeceras, nunca en la URL. No admite comandos locales ni redes privadas. Para una aplicación OAuth existente, registra la URL de retorno mostrada e introduce ID y secreto. Tras guardar, el último paso espera el inicio de sesión, prueba la conexión y muestra cuántas herramientas encontró Numo. En escritorio, solo se abre en el navegador del sistema la página de inicio de sesión del proveedor: no necesitas tener la sesión iniciada en minddy ahí, y la aplicación completa la conexión cuando vuelves.

![Ajustes MCP personales, lista vacía y botón para añadir otro servidor.](/documentation/es/numo-mcp-connections-workflow.png)

### Probar y gestionar {#manage}

El menú permite probar, editar, reconectar, desactivar o eliminar. Una alerta naranja de autenticación requiere reconectar. Campos de credenciales vacíos conservan valores; cambiar la URL borra credenciales y cabeceras. Usa el control específico para borrar el token bearer; `{}` borra cabeceras.

Desactivar bloquea llamadas nuevas, no enviadas. Límites: 30 segundos, 1 MiB de transporte y 64 KB de resultado. Comprueba escrituras agotadas en el destino antes de repetir. Las rutinas usan conexiones del propietario, sin prestarlas a otros miembros.

![Asistente de conexión de Notion con el método de inicio de sesión conocido por el catálogo.](/documentation/es/numo-mcp-connections-config-workflow.png)

## Recuperar trabajo de Numo detenido o pendiente {#recover-numo-work}

Vuelve a la conversación existente y lee los últimos mensajes y tarjetas. Distingue preguntas pendientes, límite de cuenta, tope de rutina y fallo técnico. Cerrar el panel no demuestra que el trabajo se haya detenido.

Si se pierde la conexión con minddy antes de que Numo responda, por ejemplo cuando la app del móvil pasa a segundo plano, la conversación muestra una tarjeta de conexión. Cuando recuperas la conexión o vuelves a la app, minddy comprueba si tu mensaje llegó. Si llegó, el trabajo de Numo continúa o aparece su respuesta. Si no, el mensaje sale de la conversación y **Reenviar** lo envía otra vez. **Reintentar** lo comprueba al momento.

En una tarjeta activa, responde todas las preguntas requeridas y envía el conjunto. Las tarjetas anteriores son registros y no admiten una nueva respuesta. Omitir no aporta los datos ausentes ni autoriza cambios dependientes.

### Presupuesto y errores {#recovery}

La tarjeta de límite de cuenta muestra la fecha de reinicio si se conoce y puede ofrecer un plan o clave personal. La de rutina lleva a su gestión: revisa el tope por ejecución. Varias conversaciones pueden ejecutarse a la vez; comparten el presupuesto de la cuenta. Repetir la petición no elimina el límite.

Solo puede retomarse desde un punto de control si se conservó. Comprueba incidencias, páginas y servicios externos antes de repetir: una escritura puede haber tenido éxito aunque se perdiera la respuesta. Indica qué queda y solicita continuar. Sin punto recuperable, aporta el estado verificado en una nueva petición. Al informar de fallos persistentes, identifica la conversación sin incluir credenciales.

## Elegir un objetivo para un comentario {#feedback-objectives}

Los objetivos de los comentarios requieren una elección explícita. Pide a Numo que vincule una solicitud a un objetivo del proyecto o quite ese vínculo; Numo resuelve la solicitud y el objetivo antes de modificarlos. Una revisión o categorización general no autoriza asignar objetivos. Una integración puede aportar el objetivo elegido por el propietario. La conversión hereda el objetivo y las categorías; si no se eligió ninguno, el campo queda vacío.

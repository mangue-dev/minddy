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
  "revision": 25,
  "sourceRevision": 24,
  "owner": "@mangue-dev",
  "updatedAt": "2026-10-29",
  "compatibility": {
    "version": "0.20.0 (MIN-747 release review)",
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
      "components/home/home-numo-composer.tsx",
      "lib/keyboard/typeahead.ts",
      "lib/keyboard/keyboard-context.tsx",
      "components/assistant/assistant-shell.tsx",
      "components/assistant/chat-message.tsx",
      "components/typed-mention-chip.tsx",
      "lib/server/assistant/prompt.ts"
    ]
  },
  "review": {
    "revision": 25,
    "fact": "agent:claude-code (type-ahead from Home and the expanded or focused Numo panel into the composer, single keys still running their shortcut after the 200 ms window, checked against lib/keyboard/typeahead.ts, lib/keyboard/keyboard-context.tsx, components/home/home-numo-composer.tsx and components/assistant/assistant-shell.tsx; Numo citing issues, objectives, projects, pages and members as mention pills in replies and in what it writes (issue descriptions and plans, objective descriptions, comments, pages, notebook), checked against lib/server/assistant/prompt.ts, lib/server/assistant/tools.ts, components/assistant/chat-message.tsx and components/typed-mention-chip.tsx; not checked in the running app; rest of the article unchanged since the previous review; no figure recaptured, the conversation figure predates mention pills in answers)",
    "language": "agent:claude-code (es changed passages with catalog UI labels; self-reviewed; agent review, not human acceptance)",
    "date": "2026-10-29"
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
      "revision": 25,
      "reviewed": true,
      "capturedAt": "2026-10-22",
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
      "revision": 25,
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
      "revision": 25,
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
      "revision": 25,
      "reviewed": true,
      "capturedAt": "2026-10-20",
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
      "revision": 25,
      "reviewed": true,
      "capturedAt": "2026-10-21",
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

1. Comprueba el contexto del cuadro de entrada. Indica la incidencia si hay varios elementos relevantes. Para añadir una incidencia como contexto, escribe `@` en el cuadro de entrada o usa **Añadir contexto** → **Incidencia**; una descripción también muestra incidencias encontradas [por el sentido](/docs/navigation#search-by-meaning) bajo **Relacionadas por significado**.
2. Elige el proveedor, el modelo y el nivel de razonamiento de la conversación con el logotipo del proveedor, junto al micrófono; al pasar el cursor se muestra el modelo actual. Estas opciones afectan a la conversación. Si el modelo no ofrece control del razonamiento, el control deslizante se queda en **Sin razonamiento**; en un modelo que siempre razona, **Sin razonamiento** usa su nivel más ligero.
3. Envía una petición acotada, por ejemplo: «Lee esta incidencia y propón criterios de aceptación. No cambies su estado».
4. Lee la respuesta y abre sus enlaces a incidencias o fuentes. Si pediste una modificación, comprueba el objeto modificado. Las incidencias, objetivos, proyectos, páginas y miembros que Numo encontró aparecen en su respuesta como menciones en forma de etiqueta: cada una abre su destino, y la que no puedes ver se muestra como **No disponible**. Numo también escribe estas menciones en lo que redacta, como las descripciones y planes de las incidencias, las descripciones de objetivos, los comentarios, las páginas y el cuaderno, solo para los elementos que identificó; un miembro mencionado ahí recibe una notificación como con cualquier mención.

En una conversación nueva y vacía, cuatro filas de sugerencias encima del campo de redacción proponen peticiones adaptadas a la página actual, por ejemplo **Resumir esta incidencia** o **Escribir un plan de implementación** cuando hay una incidencia abierta en el panel lateral. Elegir una fila rellena el campo sin enviarlo, para que puedas ajustar la petición antes. Las filas desaparecen en cuanto el campo contiene texto y vuelven cuando lo vacías. Aparecen en el diseño de escritorio, no en un teléfono. El campo de redacción al pie de **Inicio** muestra las mismas filas, con sugerencias como **Elegir en qué centrarme hoy** o **Encontrar lo atrasado**; si envías desde ahí, el panel se abre en su diseño ampliado.

En **Inicio**, y en el panel de Numo cuando está ampliado o tiene el foco, puedes empezar a escribir sin hacer clic en el campo de redacción: una ráfaga rápida de teclas pulsadas fuera de un campo de texto va al campo de redacción, que toma el foco. Una sola tecla sigue ejecutando su atajo de teclado, por ejemplo C para crear una incidencia, unos 0,2 segundos después en esas pantallas. G seguida de una tecla sigue siendo una secuencia de navegación; una tercera tecla en la ráfaga la convierte en texto.

Para preguntar a Numo por un fragmento, selecciónalo en un editor, como una página o la descripción de una incidencia, y elige **Pregúntale a Numo** en la barra de herramientas de selección, en un ordenador. El panel se abre sin enviar nada: junto a la página o la incidencia de la que procede, el fragmento aparece como una píldora de contexto con sus primeras palabras, y al pasar el cursor sobre la píldora ves el fragmento completo. Escribe tu pregunta, por ejemplo «Reescribe esto de forma más concisa» o «Crea incidencias a partir de esto», y envíala. El fragmento acompaña solo a ese mensaje. Para no incluirlo, quita su píldora con su cruz.

Numo también puede ver las imágenes de la descripción de una incidencia o de un objetivo, de un plan, de un comentario, de una página o de tu cuaderno cuando el modelo de la conversación acepta imágenes. Sin esa capacidad, Numo indica que no pudo ver la imagen en lugar de describirla.

Numo también puede escribir un archivo para descargar: un informe o un documento en PDF, una exportación en CSV, o un archivo de texto, Markdown, HTML, JSON, XML, SVG o de calendario. Pídelo en tu solicitud; Numo puede crearlo a partir de los archivos que añadiste a la conversación. El archivo aparece como una tarjeta bajo su respuesta: al seleccionar la tarjeta se abre su vista previa cuando el formato lo permite, **Descargar** lo guarda, y el menú de al lado ofrece **Vista previa** y **Copiar el contenido**. El archivo se queda en el almacenamiento privado de tu conversación; para compartirlo con el proyecto, pide a Numo que lo adjunte a una incidencia, a un objetivo o a un comentario que publique allí. Un PDF usa las fuentes estándar: los caracteres fuera de los alfabetos de Europa occidental y los emojis no aparecen.

El modelo predeterminado de Numo se configura en **Ajustes de cuenta → IA y Numo → Modelo predeterminado de Numo**: el valor de la app o un modelo personal del proveedor activo. Una elección explícita en la conversación tiene prioridad. Consulta [los ajustes de IA y uso](/docs/ai-settings-and-usage#ai-keys-and-models).

![Conversación de demostración de Numo con contexto, cambio de prioridad y respuesta guardada.](/documentation/es/work-with-numo-workflow.png)

### Continuar una conversación {#continue}

La lista permite recuperar conversaciones anteriores. Continúa la que contiene las decisiones necesarias. Numo organiza y sigue el trabajo: lee y actualiza incidencias, planes, páginas y otros contenidos de Minddy, y puede leer las pull requests vinculadas. Si se lo pides, también puede comentar una pull request, resolver las conversaciones de revisión ya atendidas y fusionarla. Cuando Numo busca incidencias, las coincidencias de texto y los identificadores exactos van primero; una búsqueda descriptiva puede añadir incidencias del mismo proyecto encontradas por el sentido, que Numo debe comprobar antes de basarse en ellas. No escribe código ni hace push de commits. Para que se escriba código, copia el prompt de la incidencia para tu propio agente de código; consulta [Trabajo con código y pull requests](/docs/code-work#external-coding-agents).

Si solicita información, envía tu elección antes de esperar que continúen las acciones dependientes. Una tarjeta de consumo o error explica la interrupción. Comprueba cualquier escritura externa antes de pedir que se repita.

## Entender los permisos de Numo {#numo-permissions-and-approvals}

Numo actúa dentro del acceso y el rol del usuario actual. Pedirlo por chat no concede a un miembro ajustes exclusivos del propietario. El Numo de un lector, en el chat o mediante `@Numo` en un comentario que tenga permitido publicar, solo usa herramientas de lectura y se factura al lector. El propietario administra miembros, integraciones, repositorios y configuración del tablón de feedback. Los ajustes personales pertenecen a la cuenta actual.

Numo puede cambiar preferencias compatibles y ajustes del proyecto autorizados al propietario. Las credenciales de proveedores, conexiones Git, segundo factor y archivos de avatar los configuras tú.

### Autorizar la acción {#authorization}

Describe el cambio y su alcance. Leer una solicitud no autoriza contestarla públicamente: Numo solo envía respuestas públicas a solicitudes de feedback cuando se le pide expresamente. Las instrucciones o resultados de un MCP remoto no autorizan acciones adicionales. Conecta únicamente servicios a los que confíe la información y las acciones previstas.

Una petición puede llegar a un proveedor externo. Desactivar la conexión impide nuevas llamadas, pero no retira las enviadas. Comprueba en el destino una escritura que haya agotado el tiempo antes de repetirla.

### Contexto personal y programado {#context}

Las conversaciones no usan conexiones MCP personales de otros miembros. Las rutinas utilizan las conexiones y el presupuesto del propietario. Tras una transferencia de la propiedad, las rutinas del propietario anterior en el proyecto se pausan; el nuevo propietario crea las rutinas que deban continuar. Una ejecución anterior no puede seguir usando las credenciales del propietario anterior. Numo se ejecuta en el servidor: no lee archivos de tu ordenador ni usa tus sesiones personales.

![Matriz de permisos de Numo para acciones del proyecto, conexiones personales y rutinas.](/documentation/es/numo-permissions-and-approvals-workflow.svg)

## Comprender los turnos duraderos de Numo {#numo-execution-model}

Los mensajes interactivos, acciones contextuales y rutinas entran en conversaciones Numo. El modelo y razonamiento de conversación se eligen en el campo de composición. Numo actúa mediante sus herramientas de Minddy y las conexiones MCP personales que hayas añadido; no necesita ningún repositorio. Una rutina crea una nueva conversación con instrucciones guardadas y contexto de propietario y proyecto. No es necesario mantener una sesión de escritorio abierta.

![Diagrama: Persistir intención, mensaje y UUID. Reclamar turno, guardar herramientas y resultados. Esperar tu respuesta cuando haga falta información. Releer eventos y conciliar escrituras inciertas.](/documentation/es/numo-execution-model-flow.svg)

### Separar ejecución y visualización {#state}

La intención se guarda como un turno duradero con el UUID de petición y su mensaje. Pasa de `queued` a `running` y después a `completed` o `waiting_input`. `stopping` y `stopped` representan una interrupción; `retryable` y `failed` representan errores. SSE muestra la actividad persistida, pero no controla la ejecución. Tras reconectar, se leen los mensajes y eventos posteriores a la última secuencia recibida. Los eventos duplicados o antiguos no crean otra tarea. El contexto de proyecto no equivale a acceso: una conversación privada sigue siendo privada.

### Tratar cambios inciertos {#mutations}

Antes de modificar datos, el sistema registra la operación y su checkpoint. Reutiliza los resultados completados. Una lectura interrumpida puede repetirse; una modificación con resultado desconocido pasa a `reconciling`, sin repetición automática. Comprueba el destino antes de volver a escribir externamente. Las conexiones y el presupuesto de las rutinas siguen sujetos a la propiedad y a las protecciones de coste; otro miembro no puede usar las credenciales MCP personales del propietario anterior.

Detener Numo termina su turno. Una acción externa ya enviada todavía puede finalizar. Una conversación que esperaba trabajo de código de una versión anterior se detiene automáticamente y vuelve a quedar inactiva.

## Conectar un servicio MCP personal a Numo {#numo-mcp-connections}

En los ajustes de cuenta, abre **IA y Numo** y usa la tarjeta **MCP para Numo**. Los enlaces a la antigua pestaña MCP para Numo llevan allí. Elige un servicio del catálogo o añade otro servidor MCP HTTPS público. El catálogo y registro no evitan requisitos de inscripción o aprobación del proveedor. Numo puede preparar la conexión en una conversación interactiva, pero no en una rutina autónoma.

La conexión se hace en un asistente. Un servidor personalizado o del registro pide primero su nombre y su dirección HTTPS; un servicio del catálogo se abre directamente en el paso de inicio de sesión. Un servicio del catálogo, una conexión guardada o una entrada del registro que declara un token ya conoce su método de inicio de sesión: el paso lo muestra y **Usar otro método** permite cambiarlo. Si no, elige **Iniciar sesión con OAuth**, **Token Bearer** o **Sin autenticación**. Las **Opciones avanzadas** contienen el transporte (Streamable HTTP por defecto, también admite SSE antiguo) y las cabeceras cifradas. Pon secretos en credenciales o cabeceras, nunca en la URL. No admite comandos locales ni redes privadas. Para una aplicación OAuth existente, registra la URL de retorno mostrada e introduce ID y secreto. Tras guardar, el último paso espera el inicio de sesión, prueba la conexión y muestra cuántas herramientas encontró Numo. En escritorio OAuth abre el navegador del sistema y vuelve a la aplicación.

![Ajustes MCP personales, lista vacía y botón para añadir otro servidor.](/documentation/es/numo-mcp-connections-workflow.png)

### Probar y gestionar {#manage}

El menú permite probar, editar, reconectar, desactivar o eliminar. Una alerta naranja de autenticación requiere reconectar. Campos de credenciales vacíos conservan valores; cambiar la URL borra credenciales y cabeceras. Usa el control específico para borrar el token bearer; `{}` borra cabeceras.

Desactivar bloquea llamadas nuevas, no enviadas. Límites: 30 segundos, 1 MiB de transporte y 64 KB de resultado. Comprueba escrituras agotadas en el destino antes de repetir. Las rutinas usan conexiones del propietario, sin prestarlas a otros miembros.

![Asistente de conexión de Notion con el método de inicio de sesión conocido por el catálogo.](/documentation/es/numo-mcp-connections-config-workflow.png)

## Recuperar trabajo de Numo detenido o pendiente {#recover-numo-work}

Vuelve a la conversación existente y lee los últimos mensajes y tarjetas. Distingue preguntas pendientes, límite de cuenta, tope de rutina, asignación de operación agotada y fallo técnico. Cerrar el panel no demuestra que el trabajo se haya detenido.

En una tarjeta activa, responde todas las preguntas requeridas y envía el conjunto. Las tarjetas anteriores son registros y no admiten una nueva respuesta. Omitir no aporta los datos ausentes ni autoriza cambios dependientes.

### Presupuesto y errores {#recovery}

La tarjeta de límite de cuenta muestra la fecha de reinicio si se conoce y puede ofrecer un plan o clave personal. La de rutina lleva a su gestión: revisa el tope por ejecución. La asignación de operación corresponde a esa operación. Repetir la petición no elimina el límite.

Solo puede retomarse desde un punto de control si se conservó. Comprueba incidencias, páginas y servicios externos antes de repetir: una escritura puede haber tenido éxito aunque se perdiera la respuesta. Indica qué queda y solicita continuar. Sin punto recuperable, aporta el estado verificado en una nueva petición. Al informar de fallos persistentes, identifica la conversación sin incluir credenciales.

## Elegir un objetivo para un comentario {#feedback-objectives}

Los objetivos de los comentarios requieren una elección explícita. Pide a Numo que vincule una solicitud a un objetivo del proyecto o quite ese vínculo; Numo resuelve la solicitud y el objetivo antes de modificarlos. Una revisión o categorización general no autoriza asignar objetivos. Una integración puede aportar el objetivo elegido por el propietario. La conversión hereda el objetivo y las categorías; si no se eligió ninguno, el campo queda vacío.

---
{
  "id": "numo",
  "locale": "es",
  "title": "Numo",
  "summary": "Trabaje con Numo, comprenda sus permisos y ejecución, conecte servicios MCP y retome el trabajo pendiente o interrumpido.",
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
  "revision": 6,
  "sourceRevision": 6,
  "owner": "@mangue-dev",
  "updatedAt": "2026-10-10",
  "compatibility": {
    "version": "0.11.1 candidate (cd1843e12); 0.11.1 candidate (89ebb59a5); MIN-676 private hosted native worker selection",
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
      "content/documentation/reviews/remaining-account-capture-candidates.json",
      "components/assistant/usage-exhausted-card.tsx",
      "components/assistant/ask-user-card.tsx",
      "content/documentation/reviews/visual-refresh-captures-2026-10-09.json",
      "content/documentation/reviews/premerge-de-es-2026-10-10.md",
      "content/documentation/reviews/premerge-light-review-2026-10-10.md",
      "content/documentation/reviews/min-670-feedback-objectives.md",
      "components/settings/native-agent-connections.tsx",
      "components/settings/native-agent-connections.test.tsx",
      "app/api/account/agent-preferences/route.ts",
      "content/documentation/reviews/min-676-native-worker-selection-2026-10-10.md"
    ]
  },
  "review": {
    "revision": 6,
    "fact": "agent:/root/german_spanish_review (structural consolidation review; prior procedural evidence retained; no operational rerun); agent:/root (visual usefulness, figure framing and preserved procedures; previous operational evidence retained); agent:/root (technical-reference formatting; prior factual evidence retained; no operational rerun); agent:/root with agent:/root/review_de_es (light pre-merge source and retained-claim review; existing operational evidence retained; no operational rerun); agent:/root (MIN-670 source, es wording and new-control review; existing procedural evidence retained); agent:/root/native_hosting_terms (private worker selection controls and fail-closed recovery source/UI-test review; no paid Claude execution or new provider rehearsal claimed)",
    "language": "agent:/root/german_spanish_review (es title, summary, lead and heading review; retained body comparison); agent:/root/editorial_de_es (editorial clarity pass); agent:/root (figure removals and captions); agent:/root (inline-code syntax and unchanged-text review); agent:/root/review_de_es with agent:/root (es pre-merge wording, correction and retained-meaning review); agent:/root (MIN-670 source, es wording and new-control review; existing procedural evidence retained); agent:/root/native_hosting_terms (localized worker selection additions and equivalent meaning; agent review, no human acceptance claimed)",
    "date": "2026-10-10"
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
    "Comprender los turnos duraderos de Numo y el trabajo delegado",
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
      "revision": 6,
      "reviewed": true,
      "capturedAt": "2026-10-09",
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
      "revision": 6,
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
      "alt": "Diagrama: Persistir intención, mensaje y UUID. Reclamar turno, guardar herramientas y resultados. Esperar al worker actual cuando sea necesario. Releer eventos y conciliar escrituras inciertas.",
      "caption": "Siga las etapas en este orden. Persistir intención, mensaje y UUID. Reclamar turno, guardar herramientas y resultados. Esperar al worker actual cuando sea necesario. Releer eventos y conciliar escrituras inciertas.",
      "revision": 6,
      "reviewed": true,
      "capturedAt": "2026-10-10",
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
            "title": "Esperar al worker actual cuando sea necesario"
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
      "revision": 6,
      "reviewed": true,
      "capturedAt": "2026-10-09",
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
      "alt": "Formulario de servidor MCP personalizado con ajustes avanzados de autenticación, transporte y cabeceras.",
      "caption": "Formulario de servidor MCP personalizado con ajustes avanzados de autenticación, transporte y cabeceras. No se introdujeron credenciales ni se contactó con ningún servidor.",
      "revision": 6,
      "reviewed": true,
      "capturedAt": "2026-10-09",
      "viewport": [
        560,
        920
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

Numo trabaja con el contexto de su conversación y los permisos de su cuenta. Formule una petición acotada y compruebe el resultado. Los apartados de autorizaciones y ejecución explican el trabajo delegado o programado. Si un turno está pendiente o ha fallado, revise el estado guardado antes de repetir la petición.

## Completar una tarea del proyecto con Numo {#work-with-numo}

Abra la incidencia o el proyecto y use el botón flotante de Numo. La página actual pasa a ser el contexto. Las acciones contextuales que delegan trabajo en Numo abren este mismo panel. Necesita acceso al proyecto y uso de IA disponible o una clave personal compatible.

1. Compruebe el contexto del cuadro de entrada. Indique la incidencia si hay varios elementos relevantes.
2. Elija el modelo y el nivel de razonamiento de la conversación. El agente de código utiliza valores del perfil distintos.
3. Envíe una petición acotada, por ejemplo: «Lee esta incidencia y propone criterios de aceptación. No cambies su estado».
4. Lea la respuesta y abra sus enlaces a incidencias o fuentes. Si pidió una modificación, compruebe el objeto modificado.

![Conversación de demostración de Numo con contexto, cambio de prioridad y respuesta guardada.](/documentation/es/work-with-numo-workflow.png)

### Continuar o delegar {#continue}

La lista permite recuperar conversaciones anteriores. Continúe la que contiene las decisiones necesarias. Para cambiar un repositorio, Numo delega en un agente dentro de un entorno aislado del servidor y muestra progreso, archivos, comprobaciones y pull request. No trabaja en su carpeta local.

Si solicita información, envíe su elección antes de esperar que continúen las acciones dependientes. Una tarjeta de consumo o error explica la interrupción. Compruebe cualquier escritura externa antes de pedir que se repita.

## Entender los permisos de Numo {#numo-permissions-and-approvals}

Numo actúa dentro del acceso del usuario actual. Pedirlo por chat no concede a un miembro ajustes exclusivos del propietario. El propietario administra miembros, integraciones, repositorios y configuración del tablón de feedback. Los ajustes personales pertenecen a la cuenta actual.

Numo puede cambiar preferencias compatibles y ajustes del proyecto autorizados al propietario. Las credenciales de proveedores, conexiones de suscripciones nativas, conexiones Git, segundo factor y archivos de avatar los configura usted. El agente de código y los valores de modelo y razonamiento de OpenCode se eligen únicamente en los ajustes de IA de la cuenta.

### Autorizar la acción {#authorization}

Describa el cambio y su alcance. Leer una solicitud no autoriza contestarla públicamente: Numo solo envía respuestas públicas a solicitudes de feedback cuando se le pide expresamente. Las instrucciones o resultados de un MCP remoto no autorizan acciones adicionales. Conecte únicamente servicios a los que confíe la información y las acciones previstas.

Una petición puede llegar a un proveedor externo. Desactivar la conexión impide nuevas llamadas, pero no retira las enviadas. Compruebe en el destino una escritura que haya agotado el tiempo antes de repetirla.

### Contexto personal y programado {#context}

Las conversaciones no usan conexiones MCP personales de otros miembros. Las rutinas utilizan las conexiones y el presupuesto del propietario. Tras un cambio de propietario, inicie una nueva ejecución con el propietario actual; una anterior no conserva sus credenciales. El entorno aislado del servidor no hereda archivos ni sesiones de su ordenador.

![Matriz de permisos de Numo para acciones del proyecto, conexiones personales y rutinas.](/documentation/es/numo-permissions-and-approvals-workflow.svg)

## Comprender los turnos duraderos de Numo y el trabajo delegado {#numo-execution-model}

Los mensajes interactivos, acciones contextuales y rutinas entran en conversaciones Numo. El modelo y razonamiento de conversación se eligen en el campo de composición. El trabajo delegado en repositorios usa el agente de código elegido en los ajustes de IA de la cuenta: OpenCode utiliza su modelo API y razonamiento configurados; Codex o Claude Code usa la suscripción personal conectada y los valores del CLI en la vista previa privada. Las herramientas directas de Minddy pueden actuar sin repositorio. El trabajo de código abre una sandbox de servidor alojada para el repositorio vinculado solo cuando hace falta. Una rutina crea una nueva conversación con instrucciones guardadas y contexto de propietario y proyecto. No es necesario mantener una sesión de escritorio abierta. [Codex / Claude Code](/docs/ai-settings-and-usage#native-agent-preview).

La vista previa nativa ofrece herramientas de Minddy controladas mediante MCP. Las herramientas integradas nativas del proveedor, las imágenes de entrada y los subagentes no están disponibles en estos adaptadores. Numo lee las capacidades del adaptador elegido y recibe las capacidades fijadas del agente junto con su resultado. Resuelve las preguntas del agente con contexto fiable de la conversación o te pregunta si falta una decisión. Numo puede usar sus propias herramientas compatibles dentro de tu autorización; no inventa operaciones que el motor no admite.

![Diagrama: Persistir intención, mensaje y UUID. Reclamar turno, guardar herramientas y resultados. Esperar al worker actual cuando sea necesario. Releer eventos y conciliar escrituras inciertas.](/documentation/es/numo-execution-model-flow.svg)

### Separar ejecución y visualización {#state}

La intención se guarda como un turno duradero con el UUID de petición y su mensaje. Pasa de `queued` a `running` y después a `completed`, `waiting_input` o `waiting_work`. `stopping` y `stopped` representan una interrupción; `retryable` y `failed` representan errores. SSE muestra la actividad persistida, pero no controla la ejecución. Tras reconectar, se leen los mensajes y eventos posteriores a la última secuencia recibida. La finalización de un worker solo retoma el turno padre que espera la ejecución actual; los eventos duplicados o antiguos no crean otra tarea. El contexto de proyecto no equivale a acceso: una conversación privada sigue siendo privada.

### Tratar cambios inciertos {#mutations}

Antes de modificar datos, el sistema registra la operación y su checkpoint. Reutiliza los resultados completados. Una lectura interrumpida puede repetirse; una modificación con resultado desconocido pasa a `reconciling`, sin repetición automática. Compruebe el destino antes de volver a escribir externamente. Las conexiones y el presupuesto de las rutinas siguen sujetos a la propiedad y a las protecciones de coste; otro miembro no puede usar las credenciales MCP personales del propietario anterior. Detener el turno padre interrumpe la delegación activa, aunque una acción externa ya enviada todavía puede finalizar.

## Conectar un servicio MCP personal a Numo {#numo-mcp-connections}

Abra MCP para Numo en los ajustes de cuenta. Elija un servicio del catálogo o añada otro servidor MCP HTTPS público. El catálogo y registro no evitan requisitos de inscripción o aprobación del proveedor. Numo puede preparar la conexión en una conversación interactiva, pero no en una rutina autónoma.

Use OAuth o ajustes avanzados para token bearer, sin autenticación o cabeceras cifradas. Streamable HTTP es el transporte predeterminado; también admite SSE antiguo. Ponga secretos en credenciales o cabeceras, nunca en la URL. No admite comandos locales ni redes privadas. Para una aplicación OAuth existente, registre la URL de retorno mostrada e introduzca ID y secreto. En escritorio OAuth abre el navegador del sistema y vuelve a la aplicación.

![Ajustes MCP personales, lista vacía y botón para añadir otro servidor.](/documentation/es/numo-mcp-connections-workflow.png)

### Probar y gestionar {#manage}

El menú permite probar, editar, reconectar, desactivar o eliminar. Una alerta naranja de autenticación requiere reconectar. Campos de credenciales vacíos conservan valores; cambiar la URL borra credenciales y cabeceras. Use el control específico para borrar el token bearer; `{}` borra cabeceras.

Desactivar bloquea llamadas nuevas, no enviadas. Límites: 30 segundos, 1 MiB de transporte y 64 KB de resultado. Compruebe escrituras agotadas en el destino antes de repetir. Las rutinas usan conexiones del propietario, sin prestarlas a otros miembros.

![Formulario de servidor MCP personalizado con ajustes avanzados de autenticación, transporte y cabeceras.](/documentation/es/numo-mcp-connections-config-workflow.png)

## Recuperar trabajo de Numo detenido o pendiente {#recover-numo-work}

Vuelva a la conversación existente y lea los últimos mensajes y la tarjeta del agente. Distinga preguntas pendientes, límite de cuenta, tope de rutina, asignación de operación agotada y fallo técnico. Cerrar el panel no demuestra que el trabajo se haya detenido.

En una tarjeta activa, responda todas las preguntas requeridas y envíe el conjunto. Las tarjetas anteriores son registros y no admiten una nueva respuesta. Omitir no aporta los datos ausentes ni autoriza cambios dependientes.

### Presupuesto y errores {#recovery}

La tarjeta de límite de cuenta muestra la fecha de reinicio si se conoce y puede ofrecer un plan o clave personal. La de rutina lleva a su gestión: revise el tope por ejecución. La asignación de operación corresponde a esa operación. Repetir la petición no elimina el límite. Las claves personales no hacen gratuito el cómputo de la sandbox.

Solo puede retomarse desde un punto de control si se conservó. Compruebe incidencias, rama, PR y servicios externos antes de repetir: una escritura puede haber tenido éxito aunque se perdiera la respuesta. Indique qué queda y solicite continuar. Sin punto recuperable, aporte el estado verificado en una nueva petición. Al informar de fallos persistentes, identifique la conversación sin incluir credenciales.


## Elegir un objetivo para un comentario {#feedback-objectives}

Los objetivos de los comentarios requieren una elección explícita. Pide a Numo que vincule una solicitud a un objetivo del proyecto o quite ese vínculo; Numo resuelve la solicitud y el objetivo antes de modificarlos. Una revisión o categorización general no autoriza asignar objetivos. Una integración puede aportar el objetivo elegido por el propietario. La conversión hereda el objetivo y las categorías; si no se eligió ninguno, el campo queda vacío.

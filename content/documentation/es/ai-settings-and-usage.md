---
{
  "id": "ai-settings-and-usage",
  "locale": "es",
  "title": "Ajustes y consumo de IA",
  "summary": "Configure sus claves personales de IA y los modelos predeterminados y comprenda los límites de los planes Cloud y el registro del consumo.",
  "topic": "Cuenta y aplicaciones",
  "type": "guide",
  "audiences": [
    "member"
  ],
  "workflows": [
    "A04",
    "A08",
    "A10"
  ],
  "visibility": "public",
  "status": "published",
  "revision": 9,
  "sourceRevision": 9,
  "owner": "@mangue-dev",
  "updatedAt": "2026-10-10",
  "compatibility": {
    "version": "0.11.1 candidate with allowlisted private native preview (MIN-676); MIN-676 private hosted native worker selection",
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
      "content/knowledge/plans-and-billing.md",
      "components/settings/account-ai-keys-section.tsx",
      "components/settings/account-sandbox-section.tsx",
      "content/documentation/reviews/remaining-account-capture-candidates.json",
      "lib/server/agent/model.ts",
      "lib/server/ai-runtime.ts",
      "lib/server/agent/quota.ts",
      "lib/server/usage.ts",
      "lib/server/agent/execute.ts",
      "app/(app)/billing/page.tsx",
      "app/(marketing)/pricing/page.tsx",
      "lib/billing-plans.ts",
      "content/documentation/reviews/visual-refresh-captures-2026-10-09.json",
      "components/ai-elements/dictate-button.tsx",
      "app/api/transcribe/route.ts",
      "lib/use-issue-dictation.ts",
      "components/issue-side-panel.tsx",
      "lib/use-objective-dictation.ts",
      "lib/use-feedback-dictation.ts",
      "components/issue-timeline.tsx",
      "components/assistant/chat-input.tsx",
      "components/routines/routine-prompt-field.tsx",
      "content/documentation/reviews/pr397-review-fixes-2026-10-09.md",
      "components/settings/native-agent-connections.tsx",
      "components/settings/native-agent-connections.test.tsx",
      "content/documentation/reviews/min-676-private-native-preview-2026-10-10.md",
      "app/api/account/agent-preferences/route.ts",
      "content/documentation/reviews/min-676-native-worker-selection-2026-10-10.md"
    ]
  },
  "review": {
    "revision": 9,
    "fact": "agent:/root/german_spanish_review (structural consolidation review; prior procedural evidence retained; no operational rerun); agent:/root (visual usefulness, figure framing and preserved procedures; previous operational evidence retained); agent:/root (PR #397 source review of voice/export additions; existing procedures and figures retained, no operational rerun); agent:/root/native_hosting_terms (private preview controls and limitations source/UI-test review; prior procedures retained, no native operational run); agent:/root/native_hosting_terms (private worker selection controls and fail-closed recovery source/UI-test review; no paid Claude execution or new provider rehearsal claimed)",
    "language": "agent:/root/german_spanish_review (es title, summary, lead and heading review; retained body comparison); agent:/root/editorial_de_es (editorial clarity pass); agent:/root (figure removals and captions); agent:/root (PR #397 localized additions and equivalent meaning review; no independent or human review claimed); agent:/root/native_hosting_terms (localized private preview additions and equivalent meaning; agent review, no human acceptance claimed); agent:/root/native_hosting_terms (localized worker selection additions and equivalent meaning; agent review, no human acceptance claimed)",
    "date": "2026-10-10"
  },
  "related": [
    "scheduled-routines"
  ],
  "aliases": [
    "ai-keys-and-models",
    "plans-and-ai-usage",
    "plans-and-billing"
  ],
  "tags": [
    "Configurar claves personales de IA y modelos",
    "Entender planes Cloud y consumo de IA"
  ],
  "figures": [
    {
      "id": "ai-keys-and-models-workflow",
      "kind": "screenshot",
      "src": "/documentation/es/ai-keys-and-models-workflow.png",
      "alt": "Tarjeta del proveedor de IA con minddy Cloud seleccionado.",
      "caption": "El proveedor Cloud seleccionado utiliza el plan de la cuenta. El selector permite configurar proveedores personales.",
      "revision": 9,
      "reviewed": true,
      "capturedAt": "2026-10-09",
      "viewport": [
        816,
        212
      ],
      "theme": "light",
      "padding": 24,
      "deviceScaleFactor": 2
    },
    {
      "id": "ai-keys-and-models-defaults-workflow",
      "kind": "screenshot",
      "src": "/documentation/es/ai-keys-and-models-defaults-workflow.png",
      "alt": "Modelo de código y razonamiento predeterminados.",
      "caption": "Modelo y razonamiento predeterminados de OpenCode. Los nuevos agentes OpenCode usan estos valores; los agentes en curso mantienen su configuración fijada.",
      "revision": 9,
      "reviewed": true,
      "capturedAt": "2026-10-09",
      "viewport": [
        816,
        217
      ],
      "theme": "light",
      "padding": 24,
      "deviceScaleFactor": 2
    },
    {
      "id": "plans-and-ai-usage-workflow",
      "kind": "screenshot",
      "src": "/documentation/es/plans-and-ai-usage-workflow.png",
      "alt": "Página de uso de IA de la cuenta de demostración.",
      "caption": "Página de uso de IA de la cuenta de demostración. El presupuesto, las categorías y el historial se leen de la cuenta; no se inició ninguna compra ni ejecución de pago.",
      "revision": 9,
      "reviewed": true,
      "capturedAt": "2026-10-09",
      "viewport": [
        1154,
        1016
      ],
      "theme": "light",
      "padding": 24,
      "deviceScaleFactor": 2
    }
  ],
  "requiredFigures": [
    "ai-keys-and-models-workflow",
    "ai-keys-and-models-defaults-workflow",
    "plans-and-ai-usage-workflow"
  ]
}
---

Los ajustes de IA de la cuenta determinan los proveedores, las claves personales y los valores predeterminados de las funciones compatibles. Antes de empezar, compruebe la asignación de modelos. En el consumo Cloud, distinga la facturación del proveedor, la cuota de IA incluida, el cómputo de la sandbox y los límites de las rutinas.

## Configurar claves personales de IA y modelos {#ai-keys-and-models}

Abra la sección de IA de los ajustes de la cuenta, añada un proveedor compatible e introduzca su clave y la URL base si se requiere. Guarde los cambios y compruebe el estado de confirmación. Para las llamadas de IA con una alternativa gestionada disponible, una clave sin confirmar o inaccesible mantiene el consumo en minddy. Esto exige IA gestionada configurada; los workers de código siguen las reglas de modelo vinculado al proveedor que se explican a continuación. Nunca pegue la clave en una conversación ni en una captura.

Asigne las familias de modelos de texto, transcripción y embeddings a claves compatibles, o manténgalas en minddy. Para cada clave, elija en qué funciones se puede utilizar: conversaciones de Numo, trabajo de código, automatizaciones, voz y feedback. Una función o familia de modelos sin una asignación utilizable sigue consumiendo la cuota de minddy. El proveedor factura las llamadas realizadas con su clave. El cómputo de la sandbox del servidor sigue teniendo un coste real y se registra en el uso. Ese registro es independiente de la aplicación de un límite de la cuenta: un worker con BYOK validado no está sujeto a la cuota del plan ni al límite de cómputo, mientras que el trabajo financiado por minddy sigue sujeto a su asignación incluida.


![Tarjeta del proveedor de IA con minddy Cloud seleccionado.](/documentation/es/ai-keys-and-models-workflow.png)

### Elegir una suscripción personal de programación en la vista previa privada {#native-agent-preview}

Si tu cuenta está habilitada para la vista previa privada, los ajustes de IA de la cuenta muestran **Suscripciones personales de programación**. Elige **Conectar Codex** o **Conectar Claude Code** y autoriza el acceso con tu propia cuenta en la página oficial del proveedor. Para Codex, introduce el código de acceso mostrado en esa página. Si Claude pide un código de autorización, pega solo ese código en Minddy y elige **Completar conexión**. Necesitas acceso a Codex o una suscripción de Claude que incluya Claude Code. **Cancelar conexión** detiene un intento en curso.

Una vez conectado, **Probar nuevos sandboxes** comprueba el acceso nativo y las herramientas de Minddy en dos sandboxes alojados nuevos. Revisa el resultado, incluida la eliminación de cada sandbox. Una prueba de acceso correcta no demuestra la renovación de la autenticación: un mensaje separado indica cuando no se observó esa renovación. La conexión se guarda para pruebas posteriores; vuelve a conectarte si el acceso caduca o no puede restaurarse. **Desconectar** elimina la conexión guardada por Minddy; no cancela tu suscripción al proveedor.

Tras conectar la cuenta, selecciona **Codex** o **Claude Code** en **Agente de código**. Numo usa esta elección para los nuevos agentes de repositorio: implementación de incidencias, planificación, verificación y trabajo solicitado en una conversación o rutina. El CLI nativo elige su modelo y razonamiento; los valores del modelo API de OpenCode no se aplican. Los agentes se ejecutan en sandboxes de servidor alojadas con herramientas de Minddy. No hace falta un equipo local ni una sandbox permanente.

La vista previa nativa ofrece herramientas de Minddy controladas mediante MCP. Las herramientas integradas nativas del proveedor, las imágenes de entrada y los subagentes no están disponibles en estos adaptadores. Numo lee las capacidades del adaptador elegido y recibe las capacidades fijadas del agente junto con su resultado. Resuelve las preguntas del agente con contexto fiable de la conversación o te pregunta si falta una decisión. Numo puede usar sus propias herramientas compatibles dentro de tu autorización; no inventa operaciones que el motor no admite.

Una conexión ausente, un acceso caducado o un límite del proveedor detiene el trabajo nativo. Minddy no cambia automáticamente a OpenCode, a otro proveedor API ni a otro pagador. Vuelve a conectar la cuenta seleccionada o elige **OpenCode** expresamente. Desconectar o perder acceso a la vista previa conserva la elección guardada hasta que la cambies. Los agentes existentes mantienen el motor elegido al iniciarse.

Tu suscripción financia el uso del modelo nativo. Las llamadas de conversación de Numo y el cómputo de las sandboxes siguen las reglas de uso y presupuesto de Minddy. Esta vista previa está limitada a cuentas habilitadas; la ejecución real de Claude Code con una suscripción de pago aún no se ha validado. Una conexión o una prueba de arranque correcta no demuestra que funcionen todos los planes, la renovación de autenticación o una implementación completa.

### Modelos y lugar de ejecución {#models}

**OpenCode:** La elección del modelo de código está vinculada a su proveedor. Después de cambiar, desactivar o perder una clave personal, la elección anterior puede dejar de corresponder al proveedor activo. Entonces un nuevo worker rechaza el inicio hasta que elija un modelo compatible en la configuración de IA de la cuenta; no selecciona automáticamente un modelo más barato ni un valor predeterminado de la plataforma. Una ejecución BYOK ya fijada no cambia de pagador cuando su clave deja de estar disponible.

Con **OpenCode**, configura aquí el modelo de código y razonamiento predeterminados para nuevos agentes. Con **Codex** o **Claude Code**, el CLI elige esos valores. Los agentes existentes mantienen su configuración fijada. Elige región y tamaño de sandbox por separado. Estas elecciones no sustituyen el modelo de conversación.

Ollama y los endpoints locales compatibles con OpenAI pueden atender conversaciones a través del puente de la aplicación de escritorio cuando esté configurado. No pueden atender el trabajo de código delegado ni las rutinas que se ejecutan en la sandbox del servidor. Para esas funciones, use un proveedor accesible desde el servidor. Cuando deje de necesitar un proveedor, elimínelo mediante su control de confirmación y compruebe las asignaciones resultantes antes de la siguiente ejecución.

![Modelo de código y razonamiento predeterminados.](/documentation/es/ai-keys-and-models-defaults-workflow.png)

## Entender planes Cloud y consumo de IA {#plans-and-ai-usage}

Cloud ofrece los planes Free, Go y Pro. Todos incluyen MCP, conversaciones de Numo, acciones contextuales, trabajo de código y rutinas. Se diferencian en capacidad, IA incluida, modelos y almacenamiento. Abra la sección de facturación para consultar el presupuesto y el uso actuales de su cuenta, y compare la página pública de precios antes de elegir un plan; las cifras que aparecen allí son la referencia vigente.

Use el proceso de compra o la gestión de suscripciones que se ofrece para su cuenta. Antes de aceptar, revise el importe, el periodo de facturación y la confirmación del proveedor. Después, compruebe que el plan actualizado aparece en la facturación de la cuenta; cerrar la ventana de compra no demuestra que el cambio se haya completado.


![Página de uso de IA de la cuenta de demostración.](/documentation/es/plans-and-ai-usage-workflow.png)

### Qué consume el presupuesto {#consumption}

El uso de IA incluido cubre el razonamiento, las llamadas a herramientas de minddy, las automatizaciones, las llamadas al modelo del worker y el cómputo de la sandbox del servidor. El límite mensual de IA incluida se aplica al trabajo financiado por minddy. El límite por ejecución de una rutina es independiente y puede pausar esa ejecución; el trabajo ya terminado permanece en la conversación. Estos límites no autorizan cargos automáticos por exceso. Consulte la tarjeta de límite y la fecha de restablecimiento del presupuesto cuando esté disponible.

Las claves personales compatibles hacen que el proveedor facture las llamadas al modelo en lugar de consumir la IA incluida. Un worker que utiliza una clave BYOK validada no está sujeto a la cuota del plan ni al límite de cómputo de la cuenta. El cómputo de la sandbox sigue teniendo un coste real y se registra en el uso; ese registro no significa que el límite mensual del plan se aplique a esa ejecución BYOK. Las familias o funciones sin asignación cuyas llamadas financia minddy siguen sujetas a su asignación de minddy. Una instalación self-hosted tiene los costes de infraestructura y de proveedores opcionales que determine su configuración; ejecutar el mismo núcleo no crea una suscripción Cloud.

### Capacidad de la versión candidata {#plan-capacities}

Estos valores predeterminados corresponden a la versión candidata 0.11.1 identificada. Compruebe la página vigente de precios y su cuenta antes de comprar: los precios configurados en el proceso de compra y las excepciones de cada cuenta pueden variar. El número de invitados no incluye al propietario del proyecto. El almacenamiento se carga al propietario del proyecto que recibe los archivos.

| Plan | Proyectos | Tickets por proyecto | Invitados por proyecto | Almacenamiento | IA mensual incluida (USD) |
| --- | --- | --- | --- | --- | --- |
| Free | 2 | 300 | 3 | 1 GiB | 0.50 |
| Go | Ilimitado | Ilimitado | Ilimitado | 20 GiB | 5 |
| Pro | Ilimitado | Ilimitado | Ilimitado | 100 GiB | 15 |

## Dictar texto y cambios {#voice-dictation}

Usa el micrófono junto a un campo compatible para dictar una incidencia, un objetivo, un comentario, un mensaje de Numo, feedback o una instrucción de rutina. Necesitas permiso para escribir ahí, un micrófono funcional y un navegador compatible con la grabación. Autoriza el micrófono para este sitio en el navegador y el sistema operativo. Usa HTTPS para una instancia remota. En Cloud debe haber presupuesto de IA disponible; las instancias autoalojadas también necesitan proveedores de transcripción y dictado operativos. Las claves personales de voz y los modelos se configuran [más arriba](#ai-keys-and-models).

1. Abre el formulario o la incidencia y elige su micrófono. En una incidencia abierta, Command+Mayús+D en macOS o Ctrl+Mayús+D en otros sistemas inicia o detiene la edición por voz. Comprueba que aparezcan el temporizador y la onda de audio.
2. Habla en el idioma de la interfaz, que orienta la transcripción. Para editar una incidencia, indica el cambio claramente, por ejemplo «Pon la prioridad en alta». Detén la grabación con el control cuadrado y espera a que terminen la transcripción y el procesamiento de Numo antes de cerrar el formulario.
3. Revisa el resultado. Los mensajes de Numo, comentarios e instrucciones de rutina reciben texto editable; revísalo antes de enviarlo o guardarlo. Los formularios de creación reciben campos de borrador que debes confirmar. La edición por voz de una incidencia existente aplica los cambios de inmediato: revisa los campos después y corrige cualquier error con los controles habituales. El dictado no concede permisos adicionales.

### Consumo y límites de grabación {#voice-limits}

El audio se envía al servicio de transcripción configurado y después un modelo de IA puede corregirlo o interpretarlo. El consumo sigue las reglas del proveedor y del presupuesto de la cuenta; la grabación y su interpretación pueden generar consumos separados. El feedback público tiene sus propias reglas de disponibilidad y facturación, descritas en la [guía de feedback](/docs/feedback). La demo de la página de inicio tiene un límite independiente y no es una cuota de dictado de la cuenta.

El servicio de transcripción para usuarios conectados acepta hasta 10 MiB de audio y 30 solicitudes por cuenta y hora. El grabador compartido se detiene a los 20 minutos como precaución. Usa grabaciones cortas para revisar cada resultado. Conserva el texto existente hasta verificarlo; el grabador no es una copia de seguridad de audio.

### Recuperarse de un dictado fallido {#voice-recovery}

Si se deniega el acceso, activa el permiso de micrófono del sitio y el del navegador o la app de escritorio en el sistema operativo. Si no se encuentra ningún dispositivo, conecta o selecciona un micrófono; si está ocupado, cierra la aplicación que lo usa. Si la grabación no es compatible, usa un navegador compatible o escribe el texto.

Si hay silencio o el resultado está vacío, comprueba el dispositivo de entrada y graba una toma corta y audible. Divide las grabaciones demasiado grandes. El mensaje de límite de solicitudes indica cuánto esperar; espera antes de reintentar. Ante fallos de presupuesto o proveedor, revisa el consumo de IA, las asignaciones de voz y la configuración de la instancia. Si falla la corrección pero se devuelve texto reconocido, revísalo y edítalo. Antes de repetir una edición fallida, revisa los campos actuales para evitar aplicar el mismo cambio dos veces.

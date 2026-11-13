---
{
  "id": "ai-settings-and-usage",
  "locale": "es",
  "title": "Ajustes y consumo de IA",
  "summary": "Configura tus claves personales de IA y los modelos predeterminados y comprenda los límites de los planes Cloud y el registro del consumo.",
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
  "revision": 28,
  "sourceRevision": 27,
  "owner": "@mangue-dev",
  "updatedAt": "2026-11-13",
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
      "content/knowledge/plans-and-billing.md",
      "components/settings/account-ai-keys-section.tsx",
      "lib/server/agent/model.ts",
      "lib/server/ai-runtime.ts",
      "lib/server/usage.ts",
      "app/(app)/billing/page.tsx",
      "app/(marketing)/pricing/page.tsx",
      "lib/billing-plans.ts",
      "components/ai-elements/dictate-button.tsx",
      "components/ai-elements/dictation-pill.tsx",
      "components/ai-elements/use-dictation-recorder.ts",
      "components/settings/account-preferences-section.tsx",
      "components/settings/dictation-vocabulary-section.tsx",
      "lib/dictation-vocabulary.ts",
      "lib/dictation-hallucinations.ts",
      "app/api/transcribe/route.ts",
      "lib/use-issue-dictation.ts",
      "components/issue-side-panel.tsx",
      "lib/use-objective-dictation.ts",
      "lib/use-feedback-dictation.ts",
      "components/issue-timeline.tsx",
      "components/assistant/chat-input.tsx",
      "components/routines/routine-prompt-field.tsx",
      "lib/ai-surfaces.ts",
      "components/billing/usage-segment-ui.tsx",
      "docs/security/project-roles.md",
      "lib/project-roles.ts",
      "components/agent/model-combobox.tsx",
      "lib/server/assistant/model-preferences.ts",
      "app/api/account/numo-preferences/route.ts",
      "lib/server/ai-routes.ts",
      "lib/server/decisions/engine.ts",
      "app/api/account/ai-decisions/route.ts",
      "lib/decision-engine.ts"
    ]
  },
  "review": {
    "revision": 28,
    "fact": "agent:claude-code (Aligned quoted UI labels with the MIN-885 copy audit, checked against messages/*.json; not checked in the running app; rest of the article unchanged since the previous review; no figure recaptured); agent:claude-code (0.30.0 release review, MIN-794: its evidence changes in the v0.20.0..0.30.0 delta were documented by the pull requests that made them; the article was updated by pull requests in that delta; not re-audited line by line; 0 screenshot(s) recaptured on 2026-11-04 from a local candidate against the preview demo account and inspected; no browser walkthrough of the procedures); agent:claude-code (MIN-946: Billing usage paragraph (budget forecast, Daily usage chart, hover values, Numo's warning), source audit against the change; no browser walkthrough; no figure shows this flow; existing figures kept, not recaptured); agent:claude-code (MIN-954: Numo Conversations paragraph and the ai-keys-and-models-workflow diagram's third step and caption, source audit against lib/server/assistant/model-preferences.ts, app/api/account/numo-preferences/route.ts and components/settings/account-ai-keys-section.tsx; diagram SVG fallback updated in every locale; no browser walkthrough); agent:claude-code (MIN-954 model roles: usages and language-model paragraphs of #ai-keys-and-models and the ai-keys-and-models-workflow diagram, source audit against components/settings/account-ai-keys-section.tsx, lib/server/ai-routes.ts and lib/server/ai-runtime.ts; diagram SVG fallback updated in every locale; no browser walkthrough); agent:claude-code (MIN-980: Decisions paragraph of #ai-keys-and-models, source audit against components/settings/account-ai-keys-section.tsx, lib/server/decisions/engine.ts and app/api/account/ai-decisions/route.ts; no browser walkthrough; no figure shows this row; existing figures kept, not recaptured)",
    "language": "agent:claude-code (es changed passages with catalog UI labels; self-reviewed; agent review, not human acceptance); agent:claude-code (es MIN-946 passage translated from en with catalog UI labels and the locale register; self-reviewed; agent review, not human acceptance); agent:claude-code (es MIN-954 passage with catalog UI labels; self-reviewed; agent review, not human acceptance); agent:claude-code (es MIN-954 model-role passages with catalog UI labels; self-reviewed; agent review, not human acceptance); agent:claude-code (es MIN-980 decision passages with catalog UI labels; self-reviewed; agent review, not human acceptance)",
    "date": "2026-11-13"
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
      "kind": "diagram",
      "src": "/documentation/es/ai-providers-and-numo-defaults-flow.svg",
      "alt": "Los proveedores conectados, un proveedor por tipo de modelo y el modelo de lenguaje son ajustes separados.",
      "caption": "Cada tipo de modelo funciona con minddy Cloud o un proveedor conectado. En minddy Cloud la instancia fija el modelo de lenguaje; con una clave personal, su modelo se guarda por proveedor y una conversación puede elegir el suyo.",
      "revision": 28,
      "reviewed": true,
      "capturedAt": "2026-10-28",
      "viewport": [
        816,
        390
      ],
      "theme": "neutral",
      "diagram": {
        "layout": "sequence",
        "title": "Proveedores, usos y Numo",
        "items": [
          {
            "title": "Proveedores conectados",
            "detail": "minddy Cloud y tus claves API siguen disponibles a la vez."
          },
          {
            "title": "Un proveedor por tipo de modelo",
            "detail": "El modelo de lenguaje, los embeddings y la voz a texto eligen cada uno el suyo."
          },
          {
            "title": "Proveedor y modelo de Numo",
            "detail": "minddy Cloud usa el modelo de la instancia. Una clave personal elige el suyo."
          }
        ]
      }
    }
  ],
  "requiredFigures": [
    "ai-keys-and-models-workflow"
  ]
}
---

Los ajustes de IA de la cuenta determinan los proveedores, las claves personales y los valores predeterminados de las funciones compatibles. Antes de empezar, comprueba la asignación de modelos. En el consumo Cloud, distingue la facturación del proveedor, la cuota de IA incluida y los límites de las rutinas.

La sección **IA de minddy** de los ajustes de IA de la cuenta configura los proveedores API que usan las conversaciones de Numo, las rutinas, las automatizaciones, la voz y el feedback. Los agentes de código que ejecutas por tu cuenta, conectados mediante minddy MCP, usan su propia suscripción o cuenta API y no consumen uso de IA de minddy.

## Configurar claves personales de IA y modelos {#ai-keys-and-models}

En los ajustes de IA de la cuenta, **Proveedores conectados** muestra minddy Cloud, incluido en tu plan, y los proveedores API que has conectado. Elige **Añadir proveedor**, selecciona un proveedor, introduce su clave API y la URL base que pueda requerir, y guarda. Puedes conectar varios proveedores; añadir uno no elimina los demás ni cambia lo que usan tus usos. Nunca pegues una clave en una conversación ni en una captura de pantalla.

Debajo, **Modelos** elige un proveedor para cada tipo de modelo: **Modelo de lenguaje** para Numo y todas las funciones de IA que leen o escriben texto, **Embeddings** para la búsqueda por significado y las incidencias y sugerencias relacionadas, y **Voz a texto** para el dictado. Cada uno elige minddy Cloud o un proveedor conectado que pueda servirlo: los embeddings y la voz a texto necesitan un proveedor con esos modelos. Ninguna función tiene un proveedor ni un modelo propios; la búsqueda web, que necesita minddy Cloud o una clave de OpenRouter, sigue en minddy Cloud cuando tu modelo de lenguaje usa otro proveedor. Cuando **Embeddings** o **Voz a texto** usa una de tus claves, su modelo aparece bajo el proveedor: conserva el modelo preseleccionado del proveedor o elige otro. Los cambios se aplican al instante. En una instancia sin minddy Cloud, un proveedor recién conectado sirve cada tipo que aún no tiene ninguno.

Para **Modelo de lenguaje**, elige el proveedor. En **minddy Cloud**, usa el modelo y el nivel de razonamiento que fijó la administración de la instancia, así que ni esta fila ni una conversación ofrecen un modelo. Con una de tus claves, elige un modelo de ese proveedor: Numo y todas las funciones de texto lo usan. El selector muestra el modelo predeterminado de la app con su propio nombre, marcado mientras lo sigues; elegirlo mantiene tu ajuste siguiendo el predeterminado de la app, así que sus cambios posteriores se siguen aplicando. **Predeterminado de la app** solo aparece como opción cuando ese modelo no está en el catálogo. Este valor se guarda para tu cuenta y por separado para cada proveedor, entre recargas y sesiones nuevas. En una conversación, la lista de modelos junto al micrófono se abre en los proveedores cuando hay varios disponibles; elige uno para ver sus modelos. La conversación conserva ese proveedor y ese modelo, y las conversaciones que siguen tu valor predeterminado recogen los cambios posteriores de la cuenta. Los turnos ya admitidos conservan su proveedor y su modelo fijados. Un modelo guardado que deja de estar disponible se rechaza: elige otro modelo o el modelo predeterminado de la app. Si se elimina el proveedor de una conversación, Numo te pide elegir otro en lugar de cambiarlo por su cuenta. La exportación e importación de la cuenta incluyen estas preferencias de modelo, sin las credenciales de los proveedores.

**Decisiones** elige qué responde a Smart Fill, Smart Assign, las relaciones, la revisión de eventos y la revisión de sugerencias. La primera lista elige el tipo de modelo: **Modelo de decisión**, que recurre al modelo de lenguaje cuando duda, o **Modelo de lenguaje**. El tipo que usa la instancia aparece como predeterminado; elegirlo vuelve a seguir al administrador. La segunda lista elige el proveedor: un modelo de decisión necesita minddy Cloud o una clave de OpenRouter, el único proveedor con modelos de decisión, mientras que un modelo de lenguaje acepta cualquier proveedor conectado que sirva texto. La lista solo ofrece los proveedores que pueden responder y se muestra como texto cuando solo uno puede. Mientras no elijas, las decisiones usan el proveedor de tu modelo de lenguaje si puede responderlas y, si no, minddy Cloud. Con una de tus claves, una tercera lista elige su modelo: uno de sus modelos de decisión o cualquier modelo de lenguaje. Al cambiar el tipo o el proveedor, el modelo vuelve al predeterminado del proveedor.

Una clave sin confirmar o inaccesible puede dejar las llamadas generales de IA compatibles en la cuota de minddy cuando la IA gestionada está configurada. Tu proveedor factura las llamadas realizadas con su clave, y minddy no las registra. Las claves personales validadas y el trabajo financiado por minddy siguen las [reglas de presupuesto siguientes](#consumption).

![Los proveedores conectados, un proveedor por tipo de modelo y el modelo de lenguaje son ajustes separados.](/documentation/es/ai-providers-and-numo-defaults-flow.svg)

### Modelos locales {#models}

minddy llama a los modelos de IA desde el servidor, por lo que no puede usar un modelo que se ejecute en tu ordenador. **Añadir proveedor** no ofrece Ollama local ni endpoints locales compatibles con OpenAI. Un endpoint local guardado en una versión anterior sigue apareciendo en **Proveedores conectados**, pero no puede atender conversaciones de Numo, rutinas ni otras funciones. Elimínalo y asigna en su lugar un proveedor accesible desde el servidor. Cuando dejes de necesitar un proveedor, elimínalo mediante su control de confirmación y comprueba las asignaciones resultantes antes de la siguiente ejecución.


## Entender planes Cloud y consumo de IA {#plans-and-ai-usage}

Cloud ofrece los planes Free, Go y Pro. Todos incluyen MCP, conversaciones de Numo, acciones contextuales y rutinas. Se diferencian en capacidad, IA incluida, modelos y almacenamiento. Abre Uso y facturación para consultar el presupuesto y el uso actuales de tu cuenta, y compara la página pública de precios antes de elegir un plan; las cifras que aparecen allí son la referencia vigente.

Usa el proceso de compra o la gestión de suscripciones que se ofrece para tu cuenta. Antes de aceptar, revisa el importe, el periodo de facturación y la confirmación del proveedor. Después, comprueba que el plan actualizado aparece en la facturación de la cuenta; cerrar la ventana de compra no demuestra que el cambio se haya completado.

### Qué consume el presupuesto {#consumption}

El uso de IA incluido cubre el razonamiento y las llamadas a herramientas de Numo, las rutinas, las automatizaciones, el dictado por voz y el procesamiento del feedback. El límite mensual de IA incluida se aplica al trabajo financiado por minddy. El límite por ejecución de una rutina es independiente y puede pausar esa ejecución; el trabajo ya terminado permanece en la conversación. Estos límites no autorizan cargos automáticos por exceso. Consulta la tarjeta de límite y la fecha de restablecimiento del presupuesto cuando esté disponible.

Las claves personales compatibles hacen que el proveedor facture las llamadas al modelo en lugar de consumir la IA incluida. Las familias o funciones sin asignación cuyas llamadas financia minddy siguen sujetas a su asignación de minddy. Una instalación self-hosted tiene los costes de infraestructura y de proveedores opcionales que determine su configuración; ejecutar el mismo núcleo no crea una suscripción Cloud.

### Capacidad de los planes {#plan-capacities}

Estos valores predeterminados corresponden a minddy 0.20.0. Comprueba la página vigente de precios y tu cuenta antes de comprar: los precios configurados en el proceso de compra y las excepciones de cada cuenta pueden variar. El número de invitados no incluye al propietario del proyecto, pero sí a los miembros, los lectores y las invitaciones pendientes; no hay facturación por puesto. El almacenamiento se carga al propietario del proyecto que recibe los archivos. Cuando se transfiere la propiedad, estos límites, el almacenamiento y la IA en segundo plano, como Smart Assign y la revisión de feedback, usan el plan del nuevo propietario.

| Plan | Proyectos | Tickets por proyecto | Invitados por proyecto | Almacenamiento | IA mensual incluida (USD) |
| --- | --- | --- | --- | --- | --- |
| Free | 2 | 300 | 3 | 1 GiB | 0.50 |
| Go | Ilimitado | Ilimitado | Ilimitado | 20 GiB | 5 |
| Pro | Ilimitado | Ilimitado | Ilimitado | 100 GiB | 15 |

Uso y facturación muestra el presupuesto de IA restante y su próximo restablecimiento. **Evolución del presupuesto** dibuja lo que has consumido con una línea continua y, en discontinua, adónde lleva el ritmo actual hasta la renovación; la frase bajo el título dice si vas bien o qué día se agotará el presupuesto. **¿Qué consume tu presupuesto?**, que reparte el consumo entre **Rutinas**, **Numo**, **Dictado por voz**, **Sugerencias** y **Automatizaciones** como porcentaje del presupuesto incluido. **Uso por día** muestra lo que consumió cada día, por tipo de uso; pasa el cursor sobre un gráfico para leer los valores de un día. **Historial de uso** enumera las acciones del periodo actual y su parte del presupuesto. Numo lee las mismas cifras y la misma previsión cuando le preguntas por tu presupuesto, y te avisa en **Inicio** cuando el presupuesto va camino de agotarse antes de renovarse.

## Dictar texto y cambios {#voice-dictation}

Usa el micrófono junto a un campo compatible para dictar una incidencia, un objetivo, un comentario, un mensaje de Numo, feedback o una instrucción de rutina. Necesitas permiso para escribir ahí, un micrófono funcional y un navegador compatible con la grabación. Autoriza el micrófono para este sitio en el navegador y el sistema operativo. Usa HTTPS para una instancia remota. En Cloud debe haber presupuesto de IA disponible; las instancias autoalojadas también necesitan proveedores de transcripción y dictado operativos. Las claves personales de voz y los modelos se configuran [más arriba](#ai-keys-and-models).

1. Abre el formulario o la incidencia y elige su micrófono. En una incidencia abierta, Command+Mayús+D en macOS o Ctrl+Mayús+D en otros sistemas inicia o detiene la edición por voz. Se abre una barra de dictado en la parte inferior de la pantalla, como panel en un teléfono, con el temporizador y una onda que sigue tu voz. El resto de la interfaz espera a que termine la grabación.
2. Habla en el idioma de la interfaz, que orienta la transcripción. Para editar una incidencia, indica el cambio claramente, por ejemplo «Pon la prioridad en alta». Elige **Transcribir** (✓), pulsa Command+Intro en macOS o Ctrl+Intro en otros sistemas (Intro también funciona) o repite el atajo y espera a que terminen la transcripción y el procesamiento de Numo. Para desechar la grabación, elige **Descartar grabación** (✕) o pulsa Esc y luego **Descartar**: no se envía nada.
3. Revisa el resultado. Los mensajes de Numo, comentarios e instrucciones de rutina reciben texto editable; revísalo antes de enviarlo o guardarlo. Los formularios de creación reciben campos de borrador que debes confirmar. En el formulario de nueva incidencia con Smart Fill activado, el dictado deja a Smart Fill el título (cuando Smart Fill lo escribe), la prioridad, el esfuerzo, las categorías y el objetivo, salvo que pidas una de esas propiedades, por ejemplo «pon el esfuerzo en M». La edición por voz de una incidencia existente aplica los cambios de inmediato: revisa los campos después y corrige cualquier error con los controles habituales. El dictado no concede permisos adicionales.

### Consumo y límites de grabación {#voice-limits}

El audio se envía al servicio de transcripción configurado y después un modelo de IA puede corregirlo o interpretarlo. La limpieza corrige la puntuación, las muletillas y las autocorrecciones; para insertar las palabras tal como se oyeron, desactiva **Limpiar los dictados** en **Ajustes de la cuenta** > **Preferencias** > **Dictado por voz**, y no se llama a ningún modelo de limpieza para tus dictados. Con o sin limpieza, minddy elimina las frases que los modelos de transcripción inventan ante el silencio, como los créditos de subtítulos o un «Gracias por ver el video» final. El feedback público mantiene su propio procesamiento. En **Vocabulario**, justo debajo, añade hasta 50 nombres y términos que el dictado debe escribir a tu manera; rellena **Se oye como** para sustituir esa palabra en cada dictado, incluso sin limpieza. El consumo sigue las reglas del proveedor y del presupuesto de la cuenta; la grabación y su interpretación pueden generar consumos separados. El feedback público tiene sus propias reglas de disponibilidad y facturación, descritas en la [guía de feedback](/docs/feedback). La demo de la página de inicio tiene un límite independiente y no es una cuota de dictado de la cuenta.

El servicio de transcripción para usuarios conectados acepta hasta 10 MiB de audio y 30 solicitudes por cuenta y hora. El grabador compartido se detiene a los 20 minutos como precaución. Usa grabaciones cortas para revisar cada resultado. Conserva el texto existente hasta verificarlo; el grabador no es una copia de seguridad de audio.

### Recuperarse de un dictado fallido {#voice-recovery}

Si se deniega el acceso, activa el permiso de micrófono del sitio y el del navegador o la app de escritorio en el sistema operativo. Si no se encuentra ningún dispositivo, conecta o selecciona un micrófono; si está ocupado, cierra la aplicación que lo usa. Si la grabación no es compatible, usa un navegador compatible o escribe el texto.

Si hay silencio o el resultado está vacío, comprueba el dispositivo de entrada y graba una toma corta y audible. Divide las grabaciones demasiado grandes. El mensaje de límite de solicitudes indica cuánto esperar; espera antes de reintentar. Ante fallos de presupuesto o proveedor, revisa el consumo de IA, las asignaciones de voz y la configuración de la instancia. Si falla la corrección pero se devuelve texto reconocido, revísalo y edítalo. Antes de repetir una edición fallida, revisa los campos actuales para evitar aplicar el mismo cambio dos veces.
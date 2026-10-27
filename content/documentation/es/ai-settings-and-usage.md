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
  "revision": 21,
  "sourceRevision": 20,
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
      "lib/project-roles.ts"
    ]
  },
  "review": {
    "revision": 21,
    "fact": "agent:claude/min773 (dictation pill, discard confirmation, cleanup preference and vocabulary checked against the changed source and the running app; earlier evidence retained in git history); agent:claude-code (it/es catalog language review: quoted labels aligned on the corrected es catalog; no behavior change, no new captures); agent:claude-code (manual figures rebuilt on the Aurora demo, catalog review labels and informal register; figures recaptured on 2026-10-22 from a local candidate against the preview demo account and inspected; no form submitted)",
    "language": "agent:claude/min773 (es translation of the MIN-773 passages with catalog UI labels; equivalent meaning self-reviewed; agent review, not human acceptance); agent:claude-code (es label alignment after the full catalog review; self-reviewed; agent review, not human acceptance); agent:claude-code (es manual figures rebuilt on the Aurora demo, catalog review labels and informal register; self-reviewed; agent review, not human acceptance)",
    "date": "2026-10-22"
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
      "alt": "Las conexiones, la asignación por capacidad y el modelo personal de Numo son ajustes separados.",
      "caption": "Pueden permanecer conectados varios proveedores. La asignación elige por capacidad; el valor de Numo se guarda por cuenta y proveedor.",
      "revision": 21,
      "reviewed": true,
      "capturedAt": "2026-10-11",
      "viewport": [
        816,
        390
      ],
      "theme": "neutral",
      "diagram": {
        "layout": "sequence",
        "title": "Proveedores y modelo de Numo",
        "items": [
          {
            "title": "Proveedores conectados",
            "detail": "Mantén varios proveedores API conectados; añadir uno conserva los demás."
          },
          {
            "title": "Proveedor por capacidad",
            "detail": "Asigna texto, transcripción y embeddings por separado y activa los usos necesarios."
          },
          {
            "title": "Modelo predeterminado de Numo",
            "detail": "Usa el valor de la app o guarda un modelo personal. Una conversación puede elegir otro."
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

La sección **IA de Minddy** de los ajustes de IA de la cuenta configura los proveedores API que usan las conversaciones de Numo, las rutinas, las automatizaciones, la voz y el feedback. Los agentes de código que ejecutas por tu cuenta, conectados mediante minddy MCP, usan su propia suscripción o cuenta API y no consumen uso de IA de Minddy.

## Configurar claves personales de IA y modelos {#ai-keys-and-models}

En los ajustes de IA de la cuenta, **Proveedor de IA** selecciona el proveedor de modelos de texto entre Minddy Cloud y los proveedores compatibles conectados. **Proveedores conectados** muestra la lista completa. Elige **Añadir proveedor**, selecciónalo, introduce su clave API y la URL base si es necesaria y guarda. Puedes conectar varios proveedores; añadir o seleccionar uno no elimina los demás. Nunca pegues una clave en una conversación o captura de pantalla.

Asigna por separado texto, transcripción y embeddings. Cada familia usa un proveedor a la vez. Los interruptores de uso de cada proveedor determinan si Numo, las automatizaciones, la voz y el feedback usan su clave o la cuota de Minddy. Por ejemplo, puedes mantener el texto en OpenRouter y la transcripción en OpenAI. Seleccionar un proveedor de texto no reactiva un uso de Numo previamente desactivado.

En **Modelo predeterminado de Numo**, elige **Predeterminado de la app** o un modelo concreto del proveedor activo de Numo. Se guarda para tu cuenta y por separado para cada proveedor, tras recargas y en nuevas sesiones. El valor de la app sigue el modelo configurado por la aplicación para ese proveedor. Un modelo elegido explícitamente en una conversación tiene prioridad; las conversaciones que siguen su valor predeterminado recogen los cambios posteriores de la cuenta. Los turnos ya admitidos conservan su modelo fijado. Se rechaza un modelo que deja de estar disponible o supera tu plan: elige otro modelo o el predeterminado de la app. La exportación e importación de la cuenta incluyen estas preferencias, sin credenciales de proveedores.

Una clave sin confirmar o inaccesible puede dejar las llamadas generales de IA compatibles en la cuota de Minddy cuando la IA gestionada está configurada. Tu proveedor factura las llamadas realizadas con su clave. Las claves personales validadas y el trabajo financiado por Minddy siguen las [reglas de presupuesto siguientes](#consumption).

![Las conexiones, la asignación por capacidad y el modelo personal de Numo son ajustes separados.](/documentation/es/ai-providers-and-numo-defaults-flow.svg)

### Modelos locales {#models}

Minddy llama a los modelos de IA desde el servidor, por lo que no puede usar un modelo que se ejecute en tu ordenador. **Añadir proveedor** no ofrece Ollama local ni endpoints locales compatibles con OpenAI. Un endpoint local guardado en una versión anterior sigue apareciendo en **Proveedores conectados**, pero no puede atender conversaciones de Numo, rutinas ni otras funciones. Elimínalo y asigna en su lugar un proveedor accesible desde el servidor. Cuando dejes de necesitar un proveedor, elimínalo mediante su control de confirmación y comprueba las asignaciones resultantes antes de la siguiente ejecución.


## Entender planes Cloud y consumo de IA {#plans-and-ai-usage}

Cloud ofrece los planes Free, Go y Pro. Todos incluyen MCP, conversaciones de Numo, acciones contextuales y rutinas. Se diferencian en capacidad, IA incluida, modelos y almacenamiento. Abre la sección de facturación para consultar el presupuesto y el uso actuales de tu cuenta, y compara la página pública de precios antes de elegir un plan; las cifras que aparecen allí son la referencia vigente.

Usa el proceso de compra o la gestión de suscripciones que se ofrece para tu cuenta. Antes de aceptar, revisa el importe, el periodo de facturación y la confirmación del proveedor. Después, comprueba que el plan actualizado aparece en la facturación de la cuenta; cerrar la ventana de compra no demuestra que el cambio se haya completado.

### Qué consume el presupuesto {#consumption}

El uso de IA incluido cubre el razonamiento y las llamadas a herramientas de Numo, las rutinas, las automatizaciones, el dictado por voz y el procesamiento del feedback. El límite mensual de IA incluida se aplica al trabajo financiado por minddy. El límite por ejecución de una rutina es independiente y puede pausar esa ejecución; el trabajo ya terminado permanece en la conversación. Estos límites no autorizan cargos automáticos por exceso. Consulta la tarjeta de límite y la fecha de restablecimiento del presupuesto cuando esté disponible.

Las claves personales compatibles hacen que el proveedor facture las llamadas al modelo en lugar de consumir la IA incluida. Las familias o funciones sin asignación cuyas llamadas financia minddy siguen sujetas a su asignación de minddy. Una instalación self-hosted tiene los costes de infraestructura y de proveedores opcionales que determine su configuración; ejecutar el mismo núcleo no crea una suscripción Cloud.

### Capacidad de los planes {#plan-capacities}

Estos valores predeterminados corresponden a Minddy 0.20.0. Comprueba la página vigente de precios y tu cuenta antes de comprar: los precios configurados en el proceso de compra y las excepciones de cada cuenta pueden variar. El número de invitados no incluye al propietario del proyecto, pero sí a los miembros, los lectores y las invitaciones pendientes; no hay facturación por puesto. El almacenamiento se carga al propietario del proyecto que recibe los archivos. Cuando se transfiere la propiedad, estos límites, el almacenamiento y la IA en segundo plano, como Smart Assign y la revisión de feedback, usan el plan del nuevo propietario.

| Plan | Proyectos | Tickets por proyecto | Invitados por proyecto | Almacenamiento | IA mensual incluida (USD) |
| --- | --- | --- | --- | --- | --- |
| Free | 2 | 300 | 3 | 1 GiB | 0.50 |
| Go | Ilimitado | Ilimitado | Ilimitado | 20 GiB | 5 |
| Pro | Ilimitado | Ilimitado | Ilimitado | 100 GiB | 15 |

La facturación muestra el presupuesto de IA restante y su próximo restablecimiento, **Evolución del presupuesto** y **¿Qué consume tu presupuesto?**, que reparte el consumo entre **Rutinas**, **Numo**, **Dictado por voz**, **Sugerencias** y **Automatizaciones** como porcentaje del presupuesto incluido. **Historial de uso** enumera las acciones del periodo actual y su parte del presupuesto.

## Dictar texto y cambios {#voice-dictation}

Usa el micrófono junto a un campo compatible para dictar una incidencia, un objetivo, un comentario, un mensaje de Numo, feedback o una instrucción de rutina. Necesitas permiso para escribir ahí, un micrófono funcional y un navegador compatible con la grabación. Autoriza el micrófono para este sitio en el navegador y el sistema operativo. Usa HTTPS para una instancia remota. En Cloud debe haber presupuesto de IA disponible; las instancias autoalojadas también necesitan proveedores de transcripción y dictado operativos. Las claves personales de voz y los modelos se configuran [más arriba](#ai-keys-and-models).

1. Abre el formulario o la incidencia y elige su micrófono. En una incidencia abierta, Command+Mayús+D en macOS o Ctrl+Mayús+D en otros sistemas inicia o detiene la edición por voz. Se abre una barra de dictado en la parte inferior de la pantalla, como panel en un teléfono, con el temporizador y una onda que sigue tu voz. El resto de la interfaz espera a que termine la grabación.
2. Habla en el idioma de la interfaz, que orienta la transcripción. Para editar una incidencia, indica el cambio claramente, por ejemplo «Pon la prioridad en alta». Elige **Transcribir** (✓), pulsa Command+Intro en macOS o Ctrl+Intro en otros sistemas (Intro también funciona) o repite el atajo y espera a que terminen la transcripción y el procesamiento de Numo. Para desechar la grabación, elige **Descartar grabación** (✕) o pulsa Esc y luego **Descartar**: no se envía nada.
3. Revisa el resultado. Los mensajes de Numo, comentarios e instrucciones de rutina reciben texto editable; revísalo antes de enviarlo o guardarlo. Los formularios de creación reciben campos de borrador que debes confirmar. En el formulario de nueva incidencia con Smart Fill activado, el dictado deja a Smart Fill el título (cuando Smart Fill lo escribe), la prioridad, el esfuerzo, las categorías y el objetivo, salvo que pidas una de esas propiedades, por ejemplo «pon el esfuerzo en M». La edición por voz de una incidencia existente aplica los cambios de inmediato: revisa los campos después y corrige cualquier error con los controles habituales. El dictado no concede permisos adicionales.

### Consumo y límites de grabación {#voice-limits}

El audio se envía al servicio de transcripción configurado y después un modelo de IA puede corregirlo o interpretarlo. La limpieza corrige la puntuación, las muletillas y las autocorrecciones; para insertar las palabras tal como se oyeron, desactiva **Limpiar los dictados** en **Ajustes de la cuenta** > **Preferencias** > **Dictado por voz**, y no se llama a ningún modelo de limpieza para tus dictados. El feedback público mantiene su propio procesamiento. En **Vocabulario**, justo debajo, añade hasta 50 nombres y términos que el dictado debe escribir a tu manera; rellena **Se oye como** para sustituir esa palabra en cada dictado, incluso sin limpieza. El consumo sigue las reglas del proveedor y del presupuesto de la cuenta; la grabación y su interpretación pueden generar consumos separados. El feedback público tiene sus propias reglas de disponibilidad y facturación, descritas en la [guía de feedback](/docs/feedback). La demo de la página de inicio tiene un límite independiente y no es una cuota de dictado de la cuenta.

El servicio de transcripción para usuarios conectados acepta hasta 10 MiB de audio y 30 solicitudes por cuenta y hora. El grabador compartido se detiene a los 20 minutos como precaución. Usa grabaciones cortas para revisar cada resultado. Conserva el texto existente hasta verificarlo; el grabador no es una copia de seguridad de audio.

### Recuperarse de un dictado fallido {#voice-recovery}

Si se deniega el acceso, activa el permiso de micrófono del sitio y el del navegador o la app de escritorio en el sistema operativo. Si no se encuentra ningún dispositivo, conecta o selecciona un micrófono; si está ocupado, cierra la aplicación que lo usa. Si la grabación no es compatible, usa un navegador compatible o escribe el texto.

Si hay silencio o el resultado está vacío, comprueba el dispositivo de entrada y graba una toma corta y audible. Divide las grabaciones demasiado grandes. El mensaje de límite de solicitudes indica cuánto esperar; espera antes de reintentar. Ante fallos de presupuesto o proveedor, revisa el consumo de IA, las asignaciones de voz y la configuración de la instancia. Si falla la corrección pero se devuelve texto reconocido, revísalo y edítalo. Antes de repetir una edición fallida, revisa los campos actuales para evitar aplicar el mismo cambio dos veces.
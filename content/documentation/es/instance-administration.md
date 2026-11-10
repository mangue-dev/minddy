---
{
  "id": "instance-administration",
  "locale": "es",
  "title": "Administración de la instancia",
  "summary": "Administrar la instancia es distinto de ser propietario de un proyecto.",
  "topic": "Administrar una instancia",
  "type": "guide",
  "audiences": [
    "operator"
  ],
  "workflows": [
    "H16"
  ],
  "visibility": "public",
  "status": "published",
  "revision": 18,
  "sourceRevision": 18,
  "owner": "@mangue-dev",
  "updatedAt": "2026-11-10",
  "compatibility": {
    "version": "0.30.0 (MIN-794 release review)",
    "editions": [
      "self-hosted"
    ],
    "profiles": [
      "full",
      "managed",
      "source",
      "local"
    ],
    "evidence": [
      "app/(app)/admin/page.tsx",
      "app/(app)/admin/layout.tsx",
      "components/admin/admin-dashboard.tsx",
      "lib/admin-tabs.ts",
      "lib/server/admin.ts",
      "docs/self-hosting-auth.md",
      "lib/ai-model-config.ts",
      "app/api/admin/app-config/route.ts",
      "lib/server/decisions/model-validation.ts",
      "lib/server/issue-relation-inference.ts",
      "lib/server/model-capability-validation.ts",
      "app/api/cron/issue-index/route.ts",
      "lib/server/issue-semantic-search.ts",
      "components/admin/admin-accounts-dashboard.tsx",
      "components/admin/admin-costs-dashboard.tsx",
      "components/admin/admin-models-dashboard.tsx",
      "lib/ai-model-config-file.ts",
      "lib/server/admin-model-config.ts",
      "lib/server/model-config.ts",
      "lib/server/assistant/admin-tools.ts",
      "lib/instance-variables.ts",
      "lib/server/instance-variables.ts",
      "app/api/admin/instance-variables/route.ts",
      "components/admin/admin-instance-dashboard.tsx",
      "components/agent/model-combobox.tsx",
      "lib/server/assistant/conversation-config.ts"
    ]
  },
  "review": {
    "revision": 18,
    "fact": "agent:claude-code (Aligned quoted UI labels with the MIN-885 copy audit, checked against messages/*.json; not checked in the running app; rest of the article unchanged since the previous review; no figure recaptured); agent:claude-code (0.30.0 release review, MIN-794: its evidence changes in the v0.20.0..0.30.0 delta were documented by the pull requests that made them; the article was updated by pull requests in that delta; not re-audited line by line; 2 screenshot(s) recaptured on 2026-11-04 from a local candidate against the preview demo account and inspected, 1 kept with their earlier capture; no browser walkthrough of the procedures); agent:claude-code (MIN-928: event screening added to the Assistant category of Models, checked against lib/ai-model-config.ts; rest of the article unchanged since the previous review; no figure recaptured); agent:claude-code (MIN-929: Background turns per day added to the Assistant card of Models, checked against lib/ai-model-config.ts and lib/ai-model-config-file.ts; rest of the article unchanged since the previous review; no figure recaptured); agent:claude-code (MIN-930: home summary added to the Assistant category of Models, checked against lib/ai-model-config.ts); agent:claude-code (MIN-954: sentence on Numo's model on minddy Cloud in #models, source audit against lib/server/assistant/conversation-config.ts; no browser walkthrough; no figure shows this flow; existing figures kept, not recaptured); agent:claude-code (MIN-954 model roles: #models, #models-file, #decision-model and #smart-fill-relations rewritten for one model per role, source audit against lib/ai-model-config.ts, lib/ai-model-config-file.ts, lib/server/admin-model-config.ts and components/admin/admin-models-dashboard.tsx; no browser walkthrough; the instance-administration-models screenshot still shows the former category cards and needs a recapture); agent:claude-code (MIN-954: recommended models and routing shortcuts removed from #models and #models-file, checked against components/admin/admin-models-dashboard.tsx and lib/ai-model-config-file.ts)",
    "language": "agent:claude-code (es changed passages with catalog UI labels; self-reviewed; agent review, not human acceptance); agent:claude-code (es MIN-928 passage with catalog UI labels; self-reviewed; agent review, not human acceptance); agent:claude-code (es MIN-929 passage translated from en with catalog UI labels; self-reviewed; agent review, not human acceptance); agent:claude-code (es MIN-954 passage with catalog UI labels; self-reviewed; agent review, not human acceptance); agent:claude-code (es MIN-954 model-role passages with catalog UI labels; self-reviewed; agent review, not human acceptance)",
    "date": "2026-11-10"
  },
  "related": [
    "authentication-and-email",
    "instance-configuration",
    "recommended-models"
  ],
  "aliases": [],
  "tags": [
    "Usar la consola de administración de la instancia"
  ],
  "figures": [
    {
      "id": "instance-administration-flow",
      "kind": "screenshot",
      "src": "/documentation/es/instance-administration-overview.png",
      "alt": "Pestaña Cuentas con el número de cuentas y la búsqueda de una cuenta por su correo exacto.",
      "caption": "Cuentas muestra el número de cuentas y la búsqueda de soporte; la captura procede de una instancia de demostración.",
      "revision": 18,
      "reviewed": true,
      "capturedAt": "2026-11-04",
      "viewport": [
        1488,
        1148
      ],
      "theme": "light",
      "padding": 24,
      "deviceScaleFactor": 2
    },
    {
      "id": "instance-administration-models",
      "kind": "screenshot",
      "src": "/documentation/es/instance-administration-models.png",
      "alt": "Pestaña Modelos con un modelo predeterminado por categoría y los modelos por tarea plegados.",
      "caption": "Modelos muestra un modelo predeterminado por categoría; los modelos por tarea quedan plegados. No se cambió ningún ajuste de modelo ni de proveedor para esta captura.",
      "revision": 18,
      "reviewed": true,
      "capturedAt": "2026-11-04",
      "viewport": [
        1488,
        1148
      ],
      "theme": "light",
      "padding": 24,
      "deviceScaleFactor": 2
    },
    {
      "id": "instance-administration-instance",
      "kind": "screenshot",
      "src": "/documentation/es/instance-administration-instance.png",
      "alt": "Pestaña Instancia con el origen de cada variable, una clave de OpenRouter enmascarada definida aquí y las direcciones de administradores del archivo.",
      "caption": "Instancia muestra de dónde viene cada valor; los secretos solo muestran sus últimos caracteres. Esta captura procede de una instancia autoalojada local desechable.",
      "revision": 18,
      "reviewed": true,
      "capturedAt": "2026-10-29",
      "viewport": [
        1488,
        1148
      ],
      "theme": "light",
      "padding": 24,
      "deviceScaleFactor": 2
    }
  ],
  "requiredFigures": [
    "instance-administration-flow"
  ]
}
---

## Usar la consola de administración de la instancia {#instance-administration}

Administrar la instancia es distinto de ser propietario de un proyecto. `ADMIN_EMAILS` contiene las direcciones de cuentas confirmadas autorizadas en el servidor; `app_metadata.role=admin` firmado por el servidor también es un origen de rol válido. La sesión de administrador exige `aal2`, MFA verificada y comprobaciones actuales de cuenta y sesión. Si fallan, se deniega el acceso. Inicia sesión, completa TOTP y abre `/admin`. No cambies roles en la base de datos para evitar el registro MFA. La consola y sus API privadas siguen siendo `noindex`.




![Pestaña Cuentas con el número de cuentas y la búsqueda de una cuenta por su correo exacto.](/documentation/es/instance-administration-overview.png)

![Pestaña Modelos con un modelo predeterminado por categoría y los modelos por tarea plegados.](/documentation/es/instance-administration-models.png)

## Usar capacidades disponibles {#panels}

La consola tiene tres pestañas: **Cuentas**, **Costes**, **Modelos** y, donde se permite, **Instancia**. **Costes** queda oculta sin una capacidad gestionada de OpenRouter vinculada. Los enlaces a las antiguas pestañas Resumen, Usuarios y Finanzas abren **Cuentas** o **Costes**. Regalar un plan depende de una facturación configurada o de una anulación existente. Una instancia autoalojada sin proveedores comerciales no obtiene la facturación Cloud por abrir la consola. Los cambios administrativos afectan a toda la instancia, no a un proyecto; compruébalos con cuentas de demostración.

## Atender una cuenta {#accounts}

**Cuentas** muestra cuántas cuentas tiene la instancia. Debajo, busca una cuenta solo por su dirección de correo exacta con **Buscar cuenta**. Ábrela para ver el estado de confirmación de su correo, revisar o **Restablecer** su presupuesto de uso de IA, o **Regalar un plan** con la condición anterior. La pestaña no muestra actividad, registros, incorporación, número de proyectos ni contenido personal; abre una cuenta solo para una tarea de soporte o facturación.

## Seguir los costes de la instancia {#costs}

**Costes** muestra lo que los proveedores de IA cuestan a la instancia, en dólares, como lo facturan, y se actualiza solo mientras sigue abierta. Elige el periodo en el menú de la esquina superior derecha del panel y filtra todo con el botón **Filtros** que tiene al lado, por función o modelo. Las llamadas hechas con las claves personales de los miembros nunca se registran, así que no aparecen aquí. Siguen cuatro cifras, cada una con su tendencia y su cambio frente al periodo anterior: gasto total, solicitudes, tokens y coste por millón de tokens. Después vienen las funciones y los modelos más caros, luego el gasto por día por modelo y por familia de funciones, las solicitudes por día por modelo y las ejecuciones recientes, que se abren en sus llamadas. No se muestran ingresos, suscripciones ni márgenes: la facturación de Stripe se gestiona en Stripe. Las claves de OpenRouter por cuenta que ninguna cuenta usa ya se eliminan cada noche.

## Elegir los modelos {#models}

**Modelos** tiene una tarjeta por tipo de modelo, y cada tipo usa un solo modelo para toda la instancia. **Modelo de lenguaje** fija el modelo que usan Numo y todas las tareas de texto: títulos de conversación, búsqueda web, revisión de eventos, resumen de inicio, Smart Fill y sus títulos, Smart Assign, decisiones de relación, correspondencia de importaciones CSV, desglose de briefs, mensajes de commit de fusión, limpieza de dictados, revisión de sugerencias y el cuadro de preguntas de la FAQ. La misma tarjeta contiene el **Nivel de razonamiento** de Numo y **Turnos en segundo plano por día**, que limita los turnos que [Numo en segundo plano](/docs/numo#background) hace para un miembro en 24 horas: 20 si está vacío, 0 para desactivar Numo en segundo plano para todos; el archivo de modelos no lo incluye ni lo restablece. **Embeddings** fija el único modelo de embeddings para incidencias y sugerencias, **Voz** el modelo de voz a texto y **Decisiones** el [modelo de decisión](#decision-model). Ninguna tarea tiene un modelo propio. Una instancia que había fijado un modelo predeterminado de categoría en una versión anterior lo sigue usando: la tarjeta lo muestra, y guardar la tarjeta lo reemplaza. **Claves personales** está plegado abajo: para cada proveedor, contiene el modelo que usa la clave de un miembro para cada tipo cuando el miembro no eligió ninguno.

En minddy Cloud, el Numo de cada miembro usa el modelo y el **Nivel de razonamiento** de la tarjeta **Modelo de lenguaje**, y los miembros no pueden cambiarlos. Solo una clave personal da a un miembro la elección del modelo de lenguaje, que entonces sirve a Numo y a todas sus tareas de texto.

## Exportar e importar la configuración de modelos {#models-file}

Arriba a la derecha del panel **Modelos**, **Exportar** descarga la configuración de modelos como un archivo JSON versionado (formato `minddy.instance-models`): el modelo de cada tipo, el nivel de razonamiento y los modelos predeterminados de las claves personales. No contiene ninguna clave de API ni ninguna cuenta. **Importar** lee un archivo así y muestra cada cambio antes de escribir nada; **Aplicar** los escribe todos, o ninguno si se rechaza un valor, por ejemplo un modelo que no es de decisión. Una importación reemplaza la configuración: los ajustes que el archivo omite vuelven a su valor predeterminado. Un archivo de una versión anterior de minddy se actualiza al formato actual: sus modelos predeterminados de las categorías Asistente y Embeddings llenan el modelo de lenguaje y el de embeddings, y sus modelos por tarea, atajos de enrutamiento y modelos recomendados se listan y se omiten. Un archivo de una versión más reciente se rechaza hasta que la instancia se actualice.

## Administrar la instancia con Numo {#numo}

En una conversación de Numo iniciada desde una sesión de administrador, Numo puede leer los costes de IA de la instancia, con las mismas cifras y filtros que **Costes**, leer y cambiar la configuración de modelos, previsualizar y aplicar una importación, incluido un archivo de configuración adjunto a la conversación, encontrar una cuenta por su dirección de correo exacta, leer su plan y su presupuesto de uso de IA, y regalar o retirar un plan. La sesión de administrador se comprueba de nuevo antes de cada una de estas acciones, y Numo te pide confirmar cada cambio antes de hacerlo. Estas herramientas no devuelven actividad, proyectos ni contenido de otra cuenta. [Numo en segundo plano](/docs/numo#background) también las recibe mientras tu cuenta sea de administrador con la autenticación de dos factores activada: lee por su cuenta la configuración de modelos y los costes, y cualquier otra acción necesita uno de tus recuerdos, que sustituye a tu confirmación. Las menciones a @Numo, las rutinas y la ayuda pública de la documentación nunca las reciben.

## Editar las variables de la instancia {#instance-variables}

En una instancia autoalojada cuyo archivo de entorno define `MINDDY_CONFIG_OVERRIDES=1`, la pestaña **Instancia** cambia algunas de sus variables sin editar el archivo: la clave de OpenRouter, las direcciones de administración, el proveedor y los remitentes de correo, tus propias apps de GitHub y GitLab, la analítica, el nombre y la dirección de contacto de la instancia y la publicación de la configuración de modelos. La guía de instalación pregunta si permitirlo, y la app de escritorio lo activa para la instancia que instala en tu ordenador. Solo el archivo lo activa o lo desactiva; minddy Cloud nunca lo ofrece.

![Pestaña Instancia con el origen de cada variable, una clave de OpenRouter enmascarada definida aquí y las direcciones de administradores del archivo.](/documentation/es/instance-administration-instance.png)

El campo de búsqueda sobre la lista encuentra una variable por su nombre, su etiqueta o su descripción. Un valor guardado en la pestaña sustituye al del archivo, y **Eliminar** recupera el valor del archivo. Cada variable indica de dónde viene su valor; los secretos solo muestran sus últimos caracteres. La mayoría de los cambios se aplican en un minuto; la pestaña indica los que se aplican tras reiniciar la instancia, y la app de escritorio ofrece entonces **Reiniciar ahora**. El acceso a la base de datos, las claves de cifrado, la dirección de la app y los valores fijados al compilar solo se definen en el archivo, así que un valor erróneo en la pestaña nunca te bloquea: elimínalo, o define `MINDDY_CONFIG_OVERRIDES=0` en el archivo para volver a sus valores.

Guardar un secreto o las direcciones de administración pide tu código de dos pasos si no lo has introducido en los últimos minutos, y no puedes eliminar tu propia dirección. Cada cambio aparece en la bandeja de entrada de las demás personas administradoras, incluidas las que lo son por rol, y por correo a todas, tú incluida, si la instancia envía correos. Guardar un valor sin cambios no registra nada. Cada variable conserva sus últimas versiones, con quién la cambió y cuándo; **Restaurar** recupera una. Los valores se guardan en la base de datos, cifrados cuando el cifrado del espacio de trabajo está activado.

## Elegir el modelo de decisión de IA {#decision-model}

En **Modelos**, **Decisiones**, **Modelo de decisión** fija el único modelo de decisión que responde a todas las decisiones de IA de la instancia: Smart Fill, Smart Assign, decisiones de relación, revisión de eventos y revisión de sugerencias. No hay elección por proyecto, usuario ni función. El selector solo muestra modelos de OpenRouter que publican la capacidad de decisión; los modelos de chat, embeddings y transcripción nunca aparecen. Al guardar se prueba el candidato con una decisión representativa. Un modelo que no es de decisión, rechaza la solicitud, devuelve una respuesta inválida o tarda más de 5 segundos se rechaza, y el modelo actual sigue en uso. Cuando el catálogo no puede cargarse, se rechaza cualquier cambio. Las instancias autoalojadas sin IA gestionada no tienen catálogo de plataforma y conservan el modelo predeterminado, Jev.

Las decisiones nuevas usan el modelo guardado en aproximadamente un minuto en cada proceso del servidor. Cuando el modelo falla o responde por debajo del umbral de confianza, la decisión recurre al modelo de lenguaje. El umbral se calibró con Jev y otros modelos de decisión reparten su confianza de otra forma, así que revisa la concordancia por modelo en la vista `ai_decision_evaluations_weekly` de la base de datos tras un cambio. Las filas de uso registran el modelo que respondió.

## Configurar las relaciones de Smart Fill {#smart-fill-relations}

Después de guardar una incidencia, Smart Fill puede indexarla y enlazarla con incidencias relacionadas. **Modelo de embeddings**, en **Modelos**, **Embeddings**, convierte el título y la descripción de las incidencias, y las sugerencias, en vectores. El valor predeterminado es `openai/text-embedding-3-small`. Cambiarlo inicia una nueva versión del índice: los vectores antiguos y nuevos nunca se comparan. La tarea horaria `/api/cron/issue-index` indexa entonces las incidencias existentes, 100 por ejecución, y factura al propietario de cada proyecto; nunca crea relaciones. El mismo modelo convierte cada consulta de búsqueda por significado en un vector, con los ajustes de proveedor de IA del miembro que busca, y las consultas solo se comparan con vectores de la versión actual del índice. Hasta que una incidencia se vuelva a indexar, la búsqueda de incidencias relacionadas y la búsqueda por significado solo la encuentran por sus palabras. La misma tarea cifra los vectores guardados en claro en cuanto su proyecto se cifra. Las decisiones de relación usan el [modelo de decisión](#decision-model) y recurren al modelo de lenguaje cuando falla o duda.

Los campos de embedding y de transcripción rechazan al guardar un modelo de la familia equivocada, por ejemplo un modelo de chat en un campo de embeddings, y el modelo actual sigue en uso. Esta comprobación necesita el catálogo de la plataforma: si no puede cargarse, como en una instancia autoalojada sin IA gestionada, la elección no puede verificarse y se acepta. Para los miembros que ejecutan automatizaciones con su propia clave, los valores predeterminados por proveedor incluyen `issue_embedding_model`: `text-embedding-3-small` para OpenAI y `gemini-embedding-001` para Google.

## Mantener responsabilidades operativas {#responsibilities}

Sigues siendo responsable de limitar los privilegios, recuperar MFA, proteger secretos del servidor, mantener copias, gestionar retención e incidentes y controlar costes. La consola no sustituye una restauración de base de datos y Storage ni una prueba SMTP. Si se deniega el acceso, comprueba dirección confirmada, lista autorizada, MFA y sesión actual antes de modificar la configuración. Una sesión revocada o una cuenta bloqueada no conserva privilegios por tener un JWT todavía válido. No incluyas datos privados ajenos, factores de seguridad o detalles financieros en las capturas documentales.

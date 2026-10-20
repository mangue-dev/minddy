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
  "revision": 8,
  "sourceRevision": 8,
  "owner": "@mangue-dev",
  "updatedAt": "2026-10-19",
  "compatibility": {
    "version": "0.11.1 candidate with the global decision model (MIN-694); MIN-717 Smart Fill relations; MIN-718 hybrid issue search; MIN-733 always-on AI features",
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
      "lib/server/issue-semantic-search.ts"
    ]
  },
  "review": {
    "revision": 8,
    "fact": "agent:/root/german_spanish_review (structural consolidation review; prior procedural evidence retained; no operational rerun); agent:/root (visual usefulness, figure framing and preserved procedures; previous operational evidence retained); agent:/root (technical-reference formatting; prior factual evidence retained; no operational rerun); agent:/root (MIN-694 decision model selector, save validation and fallback source and test review; existing figures unchanged); agent:/root (MIN-717 Smart Fill relations source review inherited from en revision 6; es translation of added passages; no browser walkthrough); agent:/root (MIN-718 hybrid issue search source and unit-test review; no browser walkthrough, no new captures; unchanged evidence retained); agent:/root (MIN-733 removal of the instance AI switches: source and unit-test review of the admin registry and every former switch reader; no browser walkthrough, no new captures; unchanged evidence retained); agent:/root (MIN-733 instance-administration-models recaptured on 2026-10-19 in this locale from the local candidate with the Camille Roy demo account, temporarily granted admin and MFA; read-only, no setting changed; image inspected; see reviews/min-733-admin-models-capture-2026-10-19.json)",
    "language": "agent:/root/german_spanish_review (es title, summary, lead and heading review; retained body comparison); agent:/root/editorial_de_es (editorial clarity pass); agent:/root (figure removals and captions); agent:/root (inline-code syntax and unchanged-text review); agent:/root (MIN-694 six-locale decision model section meaning review; agent review, not human acceptance); agent:/root (es translation of MIN-717 added passages with catalog UI labels, equivalent meaning self-reviewed; agent review, not human acceptance); agent:/root (es translation of MIN-718 added passages with catalog UI labels, equivalent meaning self-reviewed; agent review, not human acceptance); agent:/root (es removal of the sentences describing instance AI switches; retained-meaning self-review; agent review, not human acceptance)",
    "date": "2026-10-19"
  },
  "related": [
    "authentication-and-email",
    "instance-configuration"
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
      "alt": "Resumen de administración con métricas agregadas de cuentas, incorporación y contenido.",
      "caption": "Resumen muestra indicadores agregados de la instancia. Finanzas no aparece en este perfil de demostración porque no hay una clave gestionada de OpenRouter configurada.",
      "revision": 8,
      "reviewed": true,
      "capturedAt": "2026-10-08",
      "viewport": [
        1488,
        1148
      ],
      "theme": "light",
      "padding": 24
    },
    {
      "id": "instance-administration-models",
      "kind": "screenshot",
      "src": "/documentation/es/instance-administration-models.png",
      "alt": "Configuración de modelos de IA y razonamiento de la instancia.",
      "caption": "Modelos configura valores predeterminados y usos específicos. La captura muestra la configuración existente; no se cambió ningún modelo ni proveedor.",
      "revision": 8,
      "reviewed": true,
      "capturedAt": "2026-10-19",
      "viewport": [
        1488,
        1148
      ],
      "theme": "light",
      "padding": 24
    }
  ],
  "requiredFigures": [
    "instance-administration-flow"
  ]
}
---

## Usar la consola de administración de la instancia {#instance-administration}

Administrar la instancia es distinto de ser propietario de un proyecto. `ADMIN_EMAILS` contiene las direcciones de cuentas confirmadas autorizadas en el servidor; `app_metadata.role=admin` firmado por el servidor también es un origen de rol válido. La sesión de administrador exige `aal2`, MFA verificada y comprobaciones actuales de cuenta y sesión. Si fallan, se deniega el acceso. Inicie sesión, complete TOTP y abra `/admin`. No cambie roles en la base de datos para evitar el registro MFA. La consola y sus API privadas siguen siendo `noindex`.




![Resumen de administración con métricas agregadas de cuentas, incorporación y contenido.](/documentation/es/instance-administration-overview.png)

![Configuración de modelos de IA y razonamiento de la instancia.](/documentation/es/instance-administration-models.png)

## Usar capacidades disponibles {#panels}

La consola incluye Resumen, Usuarios, Modelos y, cuando está disponible, Finanzas. Finanzas queda oculto sin una capacidad OpenRouter gestionada vinculada. La asignación de planes depende de la facturación configurada o de un override existente. Abrir la consola no añade facturación Cloud a una instancia self-hosted sin proveedores comerciales. **Usuarios** solo encuentra una cuenta por su dirección de correo electrónico exacta; ábrala para ver el estado de confirmación de su correo, consultar o restablecer su presupuesto de uso de IA, regalar un plan con la condición anterior o marcarla como cuenta interna, lo que la excluye de todas las estadísticas. El panel no muestra la actividad de la cuenta ni su contenido personal; abra una cuenta solo para una tarea de soporte o facturación. Revise modelos, valores predeterminados, usuarios y cuotas en la versión instalada antes de cambiar nada. Los cambios afectan a toda la instancia: utilice cuentas de demostración para comprobarlos.

## Elegir el modelo de decisión de IA {#decision-model}

En **Modelos**, sección **Automatizaciones**, **Modelo de decisión** fija el único modelo de decisión que responde a todas las decisiones de IA de la instancia: Smart Fill, Smart Assign y la revisión de comentarios. No hay elección por proyecto, por usuario ni por función. El selector solo muestra modelos de OpenRouter que publican la capacidad de decisión; los modelos de chat, embedding y transcripción nunca aparecen. Al guardar, se prueba el candidato con una decisión representativa. Un modelo que no es de decisión, rechaza la solicitud, devuelve una respuesta no válida o tarda más de 5 segundos se rechaza, y el modelo actual sigue en uso. Si el catálogo no puede cargarse, se rechaza cualquier cambio. Las instancias autoalojadas sin IA gestionada no tienen catálogo de la plataforma y conservan el modelo predeterminado, Jev.

Las nuevas decisiones usan el modelo guardado en aproximadamente un minuto en cada proceso del servidor. Si el modelo falla o responde por debajo del umbral de confianza, la decisión recurre al modelo LLM propio de la función, como antes. El umbral se calibró con Jev y otros modelos de decisión reparten su confianza de otra forma: tras un cambio, revisa la concordancia por modelo en la vista de base de datos `ai_decision_evaluations_weekly`. Las filas de uso registran el modelo que respondió.

## Configurar las relaciones de Smart Fill {#smart-fill-relations}

Después de guardar una incidencia, Smart Fill puede indexarla y vincularla con incidencias relacionadas. Dos campos de **Modelos**, sección **Automatizaciones**, controlan este trabajo:

- **Embeddings de incidencias** elige el modelo que convierte el título y la descripción de las incidencias en vectores. El valor predeterminado es `openai/text-embedding-3-small`. Cambiarlo inicia una nueva versión del índice: los vectores antiguos y nuevos nunca se comparan. La tarea horaria `/api/cron/issue-index` indexa después las incidencias existentes, 100 por ejecución, y factura al propietario de cada proyecto; nunca crea relaciones. El mismo modelo convierte en vector cada consulta de la búsqueda por el sentido, con la configuración del proveedor de IA del miembro que busca, y las consultas solo se comparan con vectores de la versión actual del índice. Hasta que una incidencia se vuelve a indexar, la búsqueda de incidencias relacionadas y la búsqueda por el sentido solo la encuentran por sus palabras. La misma tarea convierte en cifrados los vectores guardados sin cifrar en cuanto su proyecto empieza a cifrar.
- **Modelo de decisión de relaciones** es el modelo LLM de respaldo que responde a las decisiones de relación cuando el [modelo de decisión](#decision-model) falla o no está seguro, como el modelo LLM propio de cada función. El valor predeterminado es `deepseek/deepseek-v4-flash`.

Los campos de embedding y de transcripción rechazan al guardar un modelo de la familia equivocada, por ejemplo un modelo de chat en un campo de embeddings, y el modelo actual sigue en uso. Esta comprobación necesita el catálogo de la plataforma: si no puede cargarse, como en una instancia autoalojada sin IA gestionada, la elección no puede verificarse y se acepta. Para los miembros que ejecutan automatizaciones con su propia clave, los valores predeterminados por proveedor incluyen `issue_embedding_model`: `text-embedding-3-small` para OpenAI y `gemini-embedding-001` para Google.

## Mantener responsabilidades operativas {#responsibilities}

Usted sigue siendo responsable de limitar los privilegios, recuperar MFA, proteger secretos del servidor, mantener copias, gestionar retención e incidentes y controlar costes. La consola no sustituye una restauración de base de datos y Storage ni una prueba SMTP. Si se deniega el acceso, compruebe dirección confirmada, lista autorizada, MFA y sesión actual antes de modificar la configuración. Una sesión revocada o una cuenta bloqueada no conserva privilegios por tener un JWT todavía válido. No incluya datos privados ajenos, factores de seguridad o detalles financieros en las capturas documentales.

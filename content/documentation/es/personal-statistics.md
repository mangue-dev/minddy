---
{
  "id": "personal-statistics",
  "locale": "es",
  "title": "Estadísticas personales",
  "summary": "Compara la actividad completada y las mediciones de tiempo dentro de su alcance real.",
  "topic": "Planificar y encontrar trabajo",
  "type": "explanation",
  "audiences": [
    "member"
  ],
  "workflows": [
    "W18"
  ],
  "visibility": "public",
  "status": "published",
  "revision": 7,
  "sourceRevision": 7,
  "owner": "@mangue-dev",
  "updatedAt": "2026-10-20",
  "compatibility": {
    "version": "0.11.1 candidate (89ebb59a5); MIN-737 account settings reorganization; UI/UX refinements batch: account settings open on Preferences",
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
      "components/stats/profile-statistics.tsx",
      "components/settings/account-profile-section.tsx",
      "components/settings/account-settings-page.tsx",
      "components/stats/effort-durations.tsx",
      "content/documentation/reviews/min-737-settings-reorganization.md",
      "content/knowledge/productivity.md",
      "lib/stats-derive.ts",
      "lib/server/stats.ts",
      "supabase/migrations/20270107070000_history_encryption.sql",
      "supabase/migrations/20270107720000_project_content_encryption.sql",
      "supabase/migrations/20270109200067_stats_distinct_year.sql",
      "lib/settings-sections.ts",
      "components/app-sidebar.tsx",
      "app/(app)/statistics/page.tsx"
    ]
  },
  "review": {
    "revision": 7,
    "fact": "agent:/root/german_spanish_review (structural consolidation review; prior procedural evidence retained; no operational rerun); agent:/root (visual usefulness, figure framing and preserved procedures; previous operational evidence retained); agent:/root (12-month headline deduplication: get_user_stats migration 20270109200067, lib/stats-derive.ts and a production read of one account (685 events, 603 distinct issues); no browser walkthrough, no new captures; unchanged evidence retained); agent:/root (MIN-737 account settings reorganization: text revised from source review of components/settings/account-settings-page.tsx and components/stats/profile-statistics.tsx; figure personal-statistics-steps recaptured on 2026-10-19 in all six locales from the local candidate (now personal-statistics-workflow.png, demo history mirrored into the statistics ledger by captures/world/seed/018-statistiques.mjs) and inspected; the grid crops to the most recent weeks that fit; no other browser walkthrough); agent:/root (UI/UX refinements batch, account settings opening tab: source review of ACCOUNT_SETTINGS_DEFAULT_TAB in lib/settings-sections.ts, the profile entry in components/app-sidebar.tsx and the /statistics redirect to the Profile tab; no browser walkthrough, no new captures; unchanged evidence retained)",
    "language": "agent:/root/german_spanish_review (es title, summary, lead and heading review; retained body comparison); agent:/root (es headline deduplication sentence and retained-meaning self-review; agent review, not human acceptance); agent:/root (es MIN-737 changed passages with catalog UI labels; retained-meaning self-review; agent review, not human acceptance); agent:/root (es translation of the account settings opening tab changed passage with catalog UI labels, equivalent meaning self-reviewed; agent review, not human acceptance)",
    "date": "2026-10-20"
  },
  "related": [
    "personal-cycle",
    "objectives",
    "ai-settings-and-usage"
  ],
  "aliases": [],
  "tags": [
    "Leer tus estadísticas personales de trabajo"
  ],
  "figures": [
    {
      "id": "personal-statistics-steps",
      "kind": "screenshot",
      "src": "/documentation/es/personal-statistics-workflow.png",
      "alt": "Estadísticas del perfil con la franja de cifras, la cuadrícula de actividad de 12 meses, los desgloses por proyecto y categoría y el ritmo de trabajo.",
      "caption": "Historial real de la cuenta de demostración: seis incidencias completadas en dos proyectos, treinta incidencias creadas y ninguna tarea del cuaderno marcada.",
      "revision": 7,
      "reviewed": true,
      "capturedAt": "2026-10-19",
      "viewport": [
        816,
        999
      ],
      "theme": "light",
      "padding": 24,
      "deviceScaleFactor": 2
    }
  ],
  "requiredFigures": [
    "personal-statistics-steps"
  ]
}
---

## Abrir e interpretar las estadísticas {#personal-statistics}

Tus estadísticas están en la pestaña **Perfil** de los ajustes de la cuenta. Elige tu nombre en la parte superior del menú de la cuenta para abrirla directamente. **Configuración de la cuenta** se abre en **Preferencias**; desde ahí, selecciona **Perfil**, la primera pestaña. Las estadísticas aparecen bajo tu avatar, tu nombre y tu correo. La antigua dirección `/statistics` abre ahora esta pestaña.

Primero aparece una franja de seis cifras: **Completadas**, **Tareas completadas**, **Creado**, **Proyectos**, **Racha más larga** y **Racha actual**. Sustituye a la antigua sección de totales históricos. Debajo, consulta la cifra de los 12 meses y la cuadrícula de actividad, luego **Dónde se concentró tu trabajo**, con los desgloses por proyecto, categoría y objetivo, y **Ritmo de trabajo**, con **Carga de trabajo actual**, **Incidencias por ciclo**, **Diferencia respecto a la fecha límite** y **Desglose por esfuerzo**. **Incidencias por ciclo**, **Diferencia respecto a la fecha límite** y **Desglose por esfuerzo** solo aparecen cuando tienen datos. La pestaña muestra sus períodos configurados; no tiene un filtro de fechas para elegir otro intervalo. Resume tu trabajo, sin establecer una clasificación del rendimiento de otros miembros.

Utiliza los tickets completados, el ritmo, los días activos, las rachas y las mediciones de tiempo para examinar tu propia actividad. La cuadrícula de actividad cuenta eventos de finalización de incidencias y de tareas del cuaderno, agrupados por días del calendario en tu zona horaria. La cuadrícula nunca se desplaza: muestra las semanas más recientes que caben en la pantalla, así que un teléfono muestra menos meses que un ordenador. Un día activo tiene al menos uno de esos eventos; la racha actual permite que hoy aún esté vacío, pero termina en el siguiente día vacío. La cifra **Completadas** elimina identificadores repetidos: mover dos veces la misma incidencia a Hecho solo cuenta una vez, por lo que el número de eventos y el total de incidencias distintas responden a preguntas diferentes. La cifra sobre la cuadrícula también cuenta cada incidencia una sola vez en sus 12 meses: una incidencia completada de nuevo marca cada uno de sus días en la cuadrícula, pero suma una sola incidencia a la cifra.

El tiempo por esfuerzo es la mediana del tiempo transcurrido desde el primer cambio registrado de una incidencia a En curso hasta su finalización. Se consideran incidencias aptas en Hecho, asignadas a ti, con esfuerzo y ambas marcas temporales. Incluye el tiempo de espera; no es un cronómetro de horas trabajadas. La vista **Número de incidencias** muestra el tamaño de la muestra utilizada. La ausencia de mediana puede indicar que no hay mediciones aptas, no una duración cero. Lee la unidad y el período de cada sección antes de comparar los valores.

## Interpretar datos escasos o cambiantes {#statistics-limits}

Un período vacío puede indicar que no hay trabajo completado que coincida o que la actividad es insuficiente. No demuestra que la cuenta no tenga tickets. Los cambios en las etiquetas de esfuerzo, el alcance o la combinación de tipos de trabajo pueden modificar la comparación sin demostrar que trabajas más rápido o más despacio.

Numo puede consultar tus estadísticas mediante herramientas de solo lectura y explicar los mismos números. Su acceso al uso del plan y a las ejecuciones recientes también es de solo lectura: informar sobre tu presupuesto no lo modifica. Ante un problema de costes de IA, abre las pantallas de uso y configuración de la cuenta en lugar de cambiar el esfuerzo de un ticket para ocultar la medición.


![Estadísticas del perfil con la franja de cifras, la cuadrícula de actividad de 12 meses, los desgloses por proyecto y categoría y el ritmo de trabajo.](/documentation/es/personal-statistics-workflow.png)

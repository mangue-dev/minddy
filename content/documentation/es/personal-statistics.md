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
  "revision": 9,
  "sourceRevision": 8,
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
      "components/stats/profile-statistics.tsx",
      "components/settings/account-profile-section.tsx",
      "components/settings/account-settings-page.tsx",
      "components/stats/effort-durations.tsx",
      "content/knowledge/productivity.md",
      "lib/stats-derive.ts",
      "lib/server/stats.ts",
      "supabase/migrations/20270107070000_history_encryption.sql",
      "supabase/migrations/20270107720000_project_content_encryption.sql",
      "supabase/migrations/20270109200067_stats_distinct_year.sql",
      "lib/settings-sections.ts",
      "components/app-sidebar.tsx",
      "app/(app)/statistics/page.tsx",
      "components/stats/stats-hero.tsx"
    ]
  },
  "review": {
    "revision": 9,
    "fact": "agent:/root/min747 (0.20.0 release review: source audit against the v0.11.0..main delta, verified corrections applied; 1 screenshot(s) recaptured on 2026-10-20 from the local candidate and inspected; no browser walkthrough of the procedures or operator rehearsal; earlier evidence retained in git history); agent:claude-code (it/es catalog language review: quoted labels aligned on the corrected es catalog; no behavior change, no new captures); agent:claude-code (it/es catalog review recapture of personal-statistics-steps on 2026-10-22 from a local candidate of this branch against the preview demo account; images inspected; no form submitted)",
    "language": "agent:/root/min747 (es translation of the release corrections with catalog UI labels; equivalent meaning self-reviewed; agent review, not human acceptance); agent:claude-code (es label alignment after the full catalog review; self-reviewed; agent review, not human acceptance)",
    "date": "2026-10-22"
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
      "revision": 9,
      "reviewed": true,
      "capturedAt": "2026-10-22",
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

Tus estadísticas están en la pestaña **Perfil** de los ajustes de la cuenta. Elige tu nombre en la parte superior del menú de la cuenta para abrirla directamente. **Ajustes de la cuenta** se abre en **Preferencias**; desde ahí, selecciona **Perfil**, la primera pestaña. Las estadísticas aparecen bajo tu avatar, tu nombre y tu correo. La antigua dirección `/statistics` abre ahora esta pestaña.

Primero aparece una franja de seis cifras: **Completadas**, **Tareas completadas**, **Creadas**, **Proyectos**, **Racha más larga** y **Racha actual**. Sustituye a la antigua sección de totales históricos. Debajo, consulta la cifra de los 12 meses y la cuadrícula de actividad, luego **Dónde se concentró tu trabajo**, con los desgloses por proyecto, categoría y objetivo, y **Ritmo de trabajo**, con **Carga de trabajo actual**, **Incidencias por ciclo**, **Diferencia respecto a la fecha límite** y **Desglose por esfuerzo**. **Incidencias por ciclo**, **Diferencia respecto a la fecha límite** y **Desglose por esfuerzo** solo aparecen cuando tienen datos. La pestaña muestra sus períodos configurados; no tiene un filtro de fechas para elegir otro intervalo. Resume tu trabajo, sin establecer una clasificación del rendimiento de otros miembros.

Utiliza los tickets completados, el ritmo, los días activos, las rachas y las mediciones de tiempo para examinar tu propia actividad. La cuadrícula de actividad cuenta eventos de finalización de incidencias y de tareas del cuaderno, agrupados por días del calendario en tu zona horaria. La cuadrícula nunca se desplaza: muestra las semanas más recientes que caben en la pantalla, así que un teléfono muestra menos meses que un ordenador. Un día activo tiene al menos uno de esos eventos; la racha actual permite que hoy aún esté vacío, pero termina en el siguiente día vacío. La cifra **Completadas** elimina identificadores repetidos: mover dos veces la misma incidencia a Hecha solo cuenta una vez, por lo que el número de eventos y el total de incidencias distintas responden a preguntas diferentes. La cifra sobre la cuadrícula suma las incidencias y las tareas del cuaderno que completaste en los últimos 12 meses; señala el número para ver su reparto en incidencias, tareas y días activos. También cuenta cada incidencia una sola vez en esos 12 meses: una incidencia completada de nuevo marca cada uno de sus días en la cuadrícula, pero suma una sola incidencia a la cifra.

El tiempo por esfuerzo es la mediana del tiempo transcurrido desde el primer cambio registrado de una incidencia a En curso hasta su finalización. Se consideran incidencias aptas en Hecha, asignadas a ti, con esfuerzo y ambas marcas temporales. Incluye el tiempo de espera; no es un cronómetro de horas trabajadas. La vista **Número de incidencias** muestra el tamaño de la muestra utilizada. La ausencia de mediana puede indicar que no hay mediciones aptas, no una duración cero. Lee la unidad y el período de cada sección antes de comparar los valores.

## Interpretar datos escasos o cambiantes {#statistics-limits}

Una cuenta que aún no ha creado ni completado ninguna incidencia ni marcado ninguna tarea del cuaderno ve **No hay nada que medir aún** en lugar de las cifras, con un botón **Nueva incidencia**, o **Crear el primer proyecto** si no tiene ningún proyecto donde crear una incidencia. Un período vacío puede indicar que no hay trabajo completado que coincida o que la actividad es insuficiente. No demuestra que la cuenta no tenga tickets. Los cambios en las etiquetas de esfuerzo, el alcance o la combinación de tipos de trabajo pueden modificar la comparación sin demostrar que trabajas más rápido o más despacio.

Numo puede consultar tus estadísticas mediante herramientas de solo lectura y explicar los mismos números. Su acceso al uso del plan y a las ejecuciones recientes también es de solo lectura: informar sobre tu presupuesto no lo modifica. Ante un problema de costes de IA, abre las pantallas de uso y de ajustes de la cuenta en lugar de cambiar el esfuerzo de un ticket para ocultar la medición.


![Estadísticas del perfil con la franja de cifras, la cuadrícula de actividad de 12 meses, los desgloses por proyecto y categoría y el ritmo de trabajo.](/documentation/es/personal-statistics-workflow.png)

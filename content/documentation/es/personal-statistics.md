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
  "revision": 3,
  "sourceRevision": 3,
  "owner": "@mangue-dev",
  "updatedAt": "2026-10-09",
  "compatibility": {
    "version": "0.11.1 candidate (89ebb59a5)",
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
      "app/(app)/statistics/page.tsx",
      "components/stats/effort-durations.tsx",
      "content/knowledge/productivity.md",
      "lib/stats-derive.ts",
      "lib/server/stats.ts",
      "supabase/migrations/20270107070000_history_encryption.sql",
      "supabase/migrations/20270107720000_project_content_encryption.sql"
    ]
  },
  "review": {
    "revision": 3,
    "fact": "agent:/root/german_spanish_review (structural consolidation review; prior procedural evidence retained; no operational rerun)",
    "language": "agent:/root/german_spanish_review (es title, summary, lead and heading review; retained body comparison)",
    "date": "2026-10-09"
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
      "src": "/documentation/es/reader-statistics.png",
      "alt": "Estadísticas personales con cuadrícula anual, desgloses, ritmo de trabajo y totales históricos.",
      "caption": "Esta cuenta de demostración tiene un ticket completado y once creados. Las estadísticas mostradas son reales; los nombres del proyecto y del objetivo se tradujeron para la ilustración.",
      "revision": 3,
      "reviewed": true,
      "capturedAt": "2026-10-08",
      "viewport": [
        994,
        1046
      ],
      "theme": "light",
      "padding": 24
    }
  ],
  "requiredFigures": [
    "personal-statistics-steps"
  ]
}
---

## Abrir e interpretar las estadísticas {#personal-statistics}

Abre Estadísticas desde la navegación de tu cuenta. Consulta la cuadrícula anual de actividad, los desgloses por proyecto, categoría y objetivo, la sección de ritmo y los totales históricos. La página muestra sus períodos configurados; no tiene un filtro de fechas para elegir otro intervalo. Resume tu trabajo, sin establecer una clasificación del rendimiento de otros miembros.

Utiliza los tickets completados, el ritmo, los días activos, las rachas y las mediciones de tiempo para examinar tu propia actividad. La cuadrícula de actividad cuenta eventos de finalización de incidencias y de tareas del cuaderno, agrupados por días del calendario en tu zona horaria. Un día activo tiene al menos uno de esos eventos; la racha actual permite que hoy aún esté vacío, pero termina en el siguiente día vacío. Los totales históricos de incidencias completadas eliminan identificadores repetidos, por lo que el número de eventos y el total de incidencias distintas responden a preguntas diferentes.

El tiempo por esfuerzo es la mediana del tiempo transcurrido desde el primer cambio registrado de una incidencia a En curso hasta su finalización. Se consideran incidencias aptas en Hecho, asignadas a ti, con esfuerzo y ambas marcas temporales. Incluye el tiempo de espera; no es un cronómetro de horas trabajadas. La vista de cantidad muestra el tamaño de la muestra utilizada. La ausencia de mediana puede indicar que no hay mediciones aptas, no una duración cero. Lee la unidad y el período de cada sección antes de comparar los valores.

## Interpretar datos escasos o cambiantes {#statistics-limits}

Un período vacío puede indicar que no hay trabajo completado que coincida o que la actividad es insuficiente. No demuestra que la cuenta no tenga tickets. Los cambios en las etiquetas de esfuerzo, el alcance o la combinación de tipos de trabajo pueden modificar la comparación sin demostrar que trabajas más rápido o más despacio.

Numo puede consultar tus estadísticas mediante herramientas de solo lectura y explicar los mismos números. Su acceso al uso del plan y a las ejecuciones recientes también es de solo lectura: informar sobre tu presupuesto no lo modifica. Ante un problema de costes de IA, abre las pantallas de uso y configuración de la cuenta en lugar de cambiar el esfuerzo de un ticket para ocultar la medición.


![Estadísticas personales con cuadrícula anual, desgloses, ritmo de trabajo y totales históricos.](/documentation/es/reader-statistics.png)

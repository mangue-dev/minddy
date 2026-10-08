---
{
  "id": "objective-dependencies-and-momentum",
  "locale": "es",
  "title": "Interpretar dependencias y ritmo de los objetivos",
  "summary": "Lee bloqueos y señales de actividad sin tratar las estimaciones como garantías de entrega.",
  "topic": "Proyectos e incidencias",
  "type": "explanation",
  "audiences": [
    "member"
  ],
  "workflows": [
    "W11"
  ],
  "visibility": "public",
  "status": "published",
  "revision": 4,
  "sourceRevision": 2,
  "owner": "@mangue-dev",
  "updatedAt": "2026-10-08",
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
      "components/objective-relations-section.tsx",
      "components/objective-momentum.tsx",
      "content/knowledge/core-tracker.md",
      "lib/relation-constants.ts",
      "lib/server/issue-relations.ts",
      "lib/objective-momentum.ts"
    ]
  },
  "review": {
    "revision": 4,
    "fact": "2026-10-08",
    "language": "2026-10-08",
    "date": "2026-10-08"
  },
  "related": [
    "objectives",
    "issue-dependencies",
    "personal-statistics"
  ],
  "aliases": [],
  "tags": [],
  "figures": [
    {
      "id": "objective-dependencies-and-momentum-steps",
      "kind": "screenshot",
      "src": "/documentation/es/reader-objective-momentum.png",
      "alt": "Ritmo del objetivo tras completar realmente una incidencia de demostración.",
      "caption": "Lee el ritmo junto al trabajo vinculado. El historial disponible aún no permite mostrar una fecha estimada de finalización.",
      "revision": 4,
      "reviewed": true,
      "capturedAt": "2026-10-08",
      "viewport": [
        1280,
        1080
      ],
      "theme": "light"
    }
  ],
  "requiredFigures": [
    "objective-dependencies-and-momentum-steps"
  ]
}
---

## Examinar relaciones y bloqueos {#objective-dependencies-and-momentum}

Abre el objetivo y sus relaciones. Comprueba qué resultado depende de otro y lee las relaciones de bloqueo entre incidencias cuando expliquen la restricción. La organización entre principal e hijas, un vínculo y una dependencia de bloqueo responden a preguntas distintas; comprueba la dirección antes de cambiar una relación.

Una relación de bloqueo puede conectar una incidencia u otro objetivo con este objetivo dentro del mismo proyecto. Sus incidencias abiertas heredan el bloqueo pendiente: la relación mostrada identifica tanto el requisito real como el objetivo que lo transmite. No se almacena una nueva relación directa en cada incidencia. Cerrar el requisito o el objetivo bloqueado, o retirar una incidencia de ese objetivo, elimina el bloqueo heredado correspondiente. Resuelve el requisito real o corrige una relación obsoleta. Cambiar únicamente la fecha objetivo no completa las incidencias que lo bloquean.

## Interpretar la señal de ritmo {#momentum}

El ritmo resume el trabajo completado recientemente. Puede estar acelerándose, estable, ralentizándose o detenido, con estados separados para objetivos no iniciados, completados y cancelados. Úsalo para identificar un resultado que necesite atención y después lee las incidencias y la actividad subyacentes.

La fecha estimada requiere al menos dos finalizaciones, una semana completa observada, esfuerzo entregado positivo y trabajo pendiente. Solo contribuyen las incidencias vinculadas actualmente; una finalización anterior a la creación del objetivo no genera un ritmo reciente artificial. Con una fecha objetivo válida, el historial abarca desde la creación hasta esa fecha y el rendimiento utiliza el tiempo observado desde la creación, incluido el transcurrido después de una fecha incumplida. Sin una fecha objetivo válida, el cálculo utiliza un historial móvil de ocho semanas y una ventana de previsión de 28 días. Un historial escaso o un cambio reciente de alcance reducen su utilidad. La estimación no es una fecha prometida y no incluye trabajo invisible que no hayas vinculado. Compara la fecha objetivo, el trabajo pendiente y las restricciones reales antes de cambiar compromisos.

![Ritmo del objetivo tras completar realmente una incidencia de demostración.](/documentation/es/reader-objective-momentum.png)

---
{
  "id": "recurring-issues",
  "locale": "es",
  "title": "Repetir una incidencia después de completarla",
  "summary": "Configura trabajo recurrente y distínguelo de una solicitud programada a Numo.",
  "topic": "Proyectos e incidencias",
  "type": "guide",
  "audiences": [
    "owner"
  ],
  "workflows": [
    "W09"
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
      "components/settings/project-recurrences-section.tsx",
      "content/knowledge/core-tracker.md",
      "lib/server/recurrence.ts"
    ]
  },
  "review": {
    "revision": 4,
    "fact": "2026-10-08",
    "language": "2026-10-08",
    "date": "2026-10-08"
  },
  "related": [
    "create-an-issue",
    "scheduled-routines",
    "project-settings"
  ],
  "aliases": [],
  "tags": [],
  "figures": [
    {
      "id": "recurring-issues-steps",
      "kind": "screenshot",
      "src": "/documentation/es/issue-date-recurrence.png",
      "alt": "Selector de fecha en modo recurrente con vista previa semanal los domingos y hora opcional.",
      "caption": "El modo recurrente muestra la frecuencia semanal. Confirma la primera fecha antes de crear el ticket.",
      "revision": 4,
      "reviewed": true,
      "capturedAt": "2026-10-08",
      "viewport": [
        1440,
        1080
      ],
      "theme": "light"
    }
  ],
  "requiredFigures": [
    "recurring-issues-steps"
  ]
}
---

## Configurar la tarea repetida {#recurring-issues}

Crea o abre una incidencia que siga siendo útil cada vez, como una comprobación periódica de dependencias. Define una fecha límite y elige una recurrencia diaria, semanal, mensual o anual en el control de fecha de la incidencia. Se rechaza una recurrencia sin fecha límite. Revisa propiedades y responsable antes de guardar. Los ajustes de recurrencias del proyecto muestran las series activas; úsalos para cambiar la frecuencia o detener la repetición.

Las incidencias recurrentes se recrean cuando la anterior queda en «Hecho»; la siguiente se crea en Registro. Comprueba su identificador y propiedades después de completar una recurrencia.

La siguiente fecha límite se calcula sumando un intervalo de recurrencia a la fecha límite anterior, no desde el día en que terminaste la tarea. La sucesora copia título, descripción, prioridad, esfuerzo, responsable, objetivo y categorías. No copia el plan de implementación, la relación con la principal, los recursos ni los comentarios. La recurrencia pasa a la sucesora; reabrir y completar de nuevo la incidencia antigua no crea otra repetición. Si falla la creación de la sucesora, la serie se detiene en lugar de reintentar repetidamente sobre la incidencia completada. Examina el resultado y configura la recurrencia en la siguiente tarea adecuada después de resolver el fallo. No supongas que un calendario ejecuta código o completa la nueva incidencia por ti.


![Selector de fecha en modo recurrente con vista previa semanal los domingos y hora opcional.](/documentation/es/issue-date-recurrence.png)

## Cambiar o detener la repetición {#recurrence-change}

Utiliza los ajustes de recurrencia para editar o desactivar las repeticiones futuras. Examina por separado las incidencias ya creadas: detener la creación futura no significa que el trabajo existente se haya completado o retirado.

Una rutina de Numo es un objeto distinto: programa una conversación y puede utilizar el presupuesto de IA del propietario y los proveedores configurados. Elige incidencias recurrentes para una tarea repetida con seguimiento y una rutina para una instrucción que deba ejecutarse en un horario. Si falta la siguiente incidencia, comprueba si la anterior se marcó como hecha, si la recurrencia sigue activa y si estás viendo Registro sin filtros restrictivos.

---
{
  "id": "triage-incoming-work",
  "locale": "es",
  "title": "Revisar el trabajo entrante en clasificación",
  "summary": "Aclara las nuevas solicitudes antes de añadirlas al trabajo planificado.",
  "topic": "Proyectos e incidencias",
  "type": "guide",
  "audiences": [
    "owner",
    "member"
  ],
  "workflows": [
    "W03"
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
      "app/(app)/projects/[id]/triage/page.tsx",
      "components/triage/triage-page.tsx",
      "lib/smart-triage.ts",
      "lib/view-filter.ts"
    ]
  },
  "review": {
    "revision": 4,
    "fact": "2026-10-08",
    "language": "2026-10-08",
    "date": "2026-10-08"
  },
  "related": [
    "issue-statuses",
    "create-an-issue",
    "feedback-to-issue"
  ],
  "aliases": [],
  "tags": [],
  "figures": [
    {
      "id": "triage-incoming-work-steps",
      "kind": "screenshot",
      "src": "/documentation/es/triage-incoming.png",
      "alt": "Incidencia entrante de demostración DOC-11 con informe, propiedades y controles de duplicado, Rechazar y Aceptar.",
      "caption": "Lee el informe recibido antes de aceptarlo, rechazarlo o enlazar un duplicado.",
      "revision": 4,
      "reviewed": true,
      "capturedAt": "2026-10-08",
      "viewport": [
        1280,
        900
      ],
      "theme": "light"
    }
  ],
  "requiredFigures": [
    "triage-incoming-work-steps"
  ]
}
---

## Revisar las solicitudes entrantes {#triage-incoming-work}

Abre el destino Clasificación del proyecto. Lee la incidencia entrante y el contexto de su origen antes de incorporarla al trabajo planificado. Comprueba si una incidencia existente ya representa la solicitud. Aclara el resultado esperado, proyecto, responsable, prioridad y esfuerzo cuando sea necesario.

Elige Aceptar y confirma para mover una incidencia que quieras conservar a Registro. Para rechazarla, elige Rechazar y confirma: su estado pasa a Cancelado. Si es un duplicado, utiliza el selector de duplicados para elegir la incidencia que se conservará. La incidencia entrante pasa a Duplicado y queda enlazada a la elegida. Cuando un elemento sale de clasificación, se selecciona el siguiente. Comprueba el estado resultante o el enlace al duplicado en la propia incidencia. Pasar de una tarjeta a otra sin realizar una de estas acciones no cierra la incidencia.

## Ordenación y límites {#triage-order}

Smart Triage utiliza reglas de ordenación deterministas.

Dentro de cada columna de estado, las incidencias abiertas que bloquean otro trabajo abierto se sitúan primero, por delante de las que no tienen bloqueos. Las incidencias bloqueadas por trabajo abierto quedan al final, incluso si también bloquean otras. Los extremos cerrados ya no generan esa prioridad. Dentro de cada nivel, una prioridad más alta, un esfuerzo menor y una fecha límite vencida o cercana adelantan el trabajo. En un mismo nivel de bloqueo, las incidencias de un objetivo permanecen agrupadas y el grupo se ordena según su incidencia mejor situada. Los empates se resuelven por fecha límite, antigüedad de creación, posición manual y, por último, identificador, que mantiene estable el orden. Una relación de vínculo no afecta a esta ordenación. No es un modo experimental de clasificación con IA. El orden ayuda a decidir qué elementos examinar primero; no demuestra que una descripción sea cierta, no resuelve duplicados automáticamente ni concede permisos.

Si falta el elemento esperado, comprueba el proyecto activo, estado y filtros, y busca su identificador. El trabajo importado o sincronizado externamente puede entrar en clasificación; revisa la fuente original y el mapeo de la integración antes de modificar campos sincronizados. Una solicitud vinculada desde feedback sigue siendo un objeto de feedback independiente con su propia discusión pública.


![Incidencia entrante de demostración DOC-11 con informe, propiedades y controles de duplicado, Rechazar y Aceptar.](/documentation/es/triage-incoming.png)

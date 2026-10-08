---
{
  "id": "feedback-to-issue",
  "locale": "es",
  "title": "Fusionar feedback y vincularlo a entregas",
  "summary": "Elegir solicitud canónica, vincular trabajo y revisar estado público.",
  "topic": "Comentarios y solicitudes",
  "type": "guide",
  "audiences": [
    "owner",
    "member"
  ],
  "workflows": [
    "F04"
  ],
  "visibility": "public",
  "status": "published",
  "revision": 2,
  "sourceRevision": 1,
  "owner": "@mangue-dev",
  "updatedAt": "2026-10-08",
  "compatibility": {
    "version": "0.11.1 candidate (cd1843e12)",
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
      "components/feedback/feedback-team-page.tsx",
      "app/api/projects/[id]/feedback/[postId]/promote/route.ts",
      "app/api/projects/[id]/feedback/[postId]/link/route.ts",
      "lib/server/feedback/merge.ts",
      "lib/server/feedback/status-sync.ts",
      "lib/server/feedback/notify.ts",
      "content/documentation/reviews/feedback-local-capture-candidates.json"
    ]
  },
  "review": {
    "revision": 2,
    "fact": "2026-10-08",
    "language": "2026-10-08",
    "date": "2026-10-08"
  },
  "related": [],
  "aliases": [],
  "tags": [],
  "figures": [
    {
      "id": "feedback-to-issue-workflow",
      "kind": "screenshot",
      "src": "/documentation/es/feedback-to-issue-workflow.png",
      "alt": "Solicitud de feedback vinculada a una incidencia recién creada, con estado Planeado.",
      "caption": "La promoción de este ejemplo creó una incidencia vinculada en estado Pendiente. El estado público de la solicitud de feedback cambió automáticamente a Planeado.",
      "revision": 2,
      "reviewed": true,
      "capturedAt": "2026-10-08",
      "viewport": [
        1440,
        1100
      ],
      "theme": "light"
    }
  ],
  "requiredFigures": [
    "feedback-to-issue-workflow"
  ]
}
---

## Resolver duplicados {#feedback-to-issue}

Como miembro del proyecto, abra la solicitud y elija unirla a una solicitud canónica existente del mismo proyecto. Lea primero ambas necesidades: una redacción parecida no demuestra que busquen el mismo resultado. La solicitud actual se convierte en duplicada, los votos se unen por identidad y el duplicado redirige a la solicitud canónica. Revise el evento de unión en la actividad; la acción de deshacer utiliza ese evento. Rechace una sugerencia de unión incorrecta de la IA en lugar de aceptarla solo para vaciar la cola.


## Crear o vincular trabajo {#work}

Convierta la solicitud en una nueva incidencia si el trabajo aún no está registrado. Revise los campos de creación antes de confirmar; sin campos proporcionados, la promoción crea por defecto trabajo en el backlog. Si ya existe una incidencia, use la acción de vincular. Una solicitud ya vinculada no puede volver a convertirse. Desvincular conserva el último estado público y detiene la relación con la incidencia.

El estado vinculado sigue a la incidencia: triage/backlog/duplicate → open; todo → planned; in_progress/in_review → in_progress; done → shipped; canceled → declined. Devolver el trabajo al backlog también reabre el estado de feedback. Tras cambiar un estado, compruebe la incidencia vinculada y la solicitud sin sesión.

Las notificaciones al equipo por nuevo feedback dependen de su origen y de la transición de revisión. No prometa al votante un email automático por cada unión o actualización de incidencia; puede consultar el estado público y las respuestas en Mis sugerencias. El vínculo muestra el avance sin exponer la incidencia privada.

![Solicitud de feedback vinculada a una incidencia recién creada, con estado Planeado.](/documentation/es/feedback-to-issue-workflow.png)

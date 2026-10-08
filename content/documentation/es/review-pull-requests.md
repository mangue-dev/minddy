---
{
  "id": "review-pull-requests",
  "locale": "es",
  "title": "Revisar una pull request vinculada",
  "summary": "Examinar archivos, discusiones y comprobaciones antes de pedir revisión o fusionar.",
  "topic": "Numo e integraciones",
  "type": "guide",
  "audiences": [
    "member"
  ],
  "workflows": [
    "N04"
  ],
  "visibility": "public",
  "status": "published",
  "revision": 1,
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
      "components/pull-requests/pr-detail.tsx",
      "components/pull-requests/pr-reviews-details.tsx",
      "content/knowledge/plans-and-agents.md"
    ]
  },
  "review": {
    "revision": 1,
    "fact": "2026-10-08",
    "language": "2026-10-08",
    "date": "2026-10-08"
  },
  "related": [],
  "aliases": [],
  "tags": [],
  "figures": [
    {
      "id": "review-pull-requests-workflow",
      "kind": "screenshot",
      "src": "/documentation/es/review-pull-requests-workflow.png",
      "alt": "Pestaña Cambios de la PR de demostración abierta, con las diferencias de greeting y un aviso de autorización de GitHub no disponible.",
      "caption": "La PR real corregida sigue abierta, sin fusionar. Las diferencias eliminan los espacios alrededor del nombre y usan World para un valor vacío. Esta instancia no puede solicitar autorización de usuario de GitHub; la indicación de disponibilidad no concede permisos para fusionar ni demuestra que la CI del proveedor haya pasado.",
      "revision": 1,
      "reviewed": true,
      "capturedAt": "2026-10-08",
      "viewport": [
        1480,
        1100
      ],
      "theme": "light"
    }
  ],
  "requiredFigures": [
    "review-pull-requests-workflow"
  ]
}
---

## Examinar la propuesta {#review-pull-requests}
Abra la pull request vinculada a una incidencia o ejecución delegada. Sigue siendo necesario acceder al repositorio; pertenecer al proyecto no concede permisos del proveedor Git.

Lea descripción y actividad y después los archivos y bloques de diferencias. Abra conversaciones sin resolver y responda en el hilo correspondiente. Marcar archivos revisados registra su lectura, pero no constituye aprobación del proveedor. Compruebe commits, resultados CI e incidencias vinculadas para verificar el alcance solicitado.

![Pestaña Cambios de la PR de demostración abierta, con las diferencias de greeting y un aviso de autorización de GitHub no disponible.](/documentation/es/review-pull-requests-workflow.png)


## Revisión y fusión {#decision}
Solicite otro revisor cuando sea necesario. Una revisión de IA disponible aporta otra opinión; no demuestra que las pruebas hayan pasado. Compruebe si es borrador o está lista para revisión, discusiones abiertas, revisiones solicitadas y política de fusión.

Fusione tras satisfacer los controles y revisiones aplicables y con una cuenta autorizada. El proveedor puede rechazar una acción visible. Si el estado parece antiguo, actualice y consulte el proveedor antes de repetirla. Numo puede leer, comentar, cambiar la disponibilidad o fusionar con autorización; los cambios de rama pasan al agente de código. Una vista previa requiere un despliegue real.

---
{
  "id": "automation-settings",
  "locale": "es",
  "title": "De automatizaciones a rutinas",
  "summary": "Las automatizaciones de proyecto se han sustituido por rutinas. Consulta qué ocurrió con tus reglas y recrea un flujo como rutina controlada por el propietario.",
  "topic": "Cuenta y aplicaciones",
  "type": "guide",
  "audiences": [
    "owner"
  ],
  "workflows": [
    "A05"
  ],
  "visibility": "public",
  "status": "published",
  "revision": 11,
  "sourceRevision": 11,
  "owner": "@mangue-dev",
  "updatedAt": "2026-11-17",
  "compatibility": {
    "version": "0.40.0 (MIN-970 release review)",
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
      "components/settings/smart-assign-section.tsx",
      "content/knowledge/settings-and-data.md",
      "lib/server/usage.ts"
    ]
  },
  "review": {
    "revision": 11,
    "fact": "agent:claude-code (Aligned quoted UI labels with the MIN-885 copy audit, checked against messages/*.json; not checked in the running app; rest of the article unchanged since the previous review; no figure recaptured); agent:claude-code (0.30.0 release review, MIN-794: its evidence changes in the v0.20.0..0.30.0 delta were documented by the pull requests that made them; the article was updated by pull requests in that delta; not re-audited line by line; 0 screenshot(s) recaptured on 2026-11-04 from a local candidate against the preview demo account and inspected; no browser walkthrough of the procedures); agent:claude-code (MIN-673: summary lengthened for the page description from facts stated in the article sections; body unchanged; no screenshot in scope); agent:claude-code (0.40.0 release review, MIN-970: source audit against the v0.30.1..0.40.0 delta: commit subjects and targeted commit bodies, quoted labels checked against messages/en.json; no correction needed; translations not reread; no screenshot recaptured; no browser walkthrough of the procedures)",
    "language": "agent:claude-code (es changed passages with catalog UI labels; self-reviewed; agent review, not human acceptance); agent:claude-code (es MIN-673 summary translated from the English revision with the locale glossary and register; self-reviewed; agent review, not human acceptance)",
    "date": "2026-11-17"
  },
  "related": [],
  "aliases": [],
  "tags": [
    "Recrear una automatización de proyecto como rutina"
  ],
  "figures": [],
  "requiredFigures": []
}
---

## Qué ocurrió con las automatizaciones de proyecto {#automation-settings}

Los interruptores de automatización del proyecto y los preajustes, filtros de esfuerzo y espera inicial de la cuenta se sustituyen por [Rutinas](/docs/scheduled-routines). Las reglas de automatización configuradas en una versión anterior ya no se ejecutan y minddy no las convierte en rutinas. Las cadenas pendientes o esperando a una persona se detuvieron sin un paso siguiente. Las reglas archivadas se conservan en el proyecto y en las exportaciones de la cuenta.

Para conservar un flujo, abre Rutinas como propietario del proyecto y [crea una rutina](/docs/scheduled-routines#scheduled-routines) con las instrucciones, el desencadenante, las condiciones y la espera que necesite.

## Distinguir otras ayudas del proyecto {#mechanisms}

Smart Fill sigue completando prioridad, esfuerzo, categorías y objetivo ausentes. Smart Assign sigue siendo un ajuste del propietario con reglas por miembro. Smart Triage sigue usando reglas estáticas. La autoasignación sigue siendo una preferencia independiente. Estas ayudas son independientes de las rutinas y no sustituyen una automatización retirada.

Prueba manualmente una rutina nueva, examina su conversación privada y presupuesto, y actívala para escuchar eventos futuros. Si comienza trabajo inesperado, pausa la rutina y revisa la ejecución antes de reintentar. La [guía de rutinas](/docs/scheduled-routines#conditions) explica las condiciones en espera y su invalidación.

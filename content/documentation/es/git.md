---
{
  "id": "git",
  "locale": "es",
  "title": "Repositorios Git y sincronización de incidencias",
  "summary": "Conecte una cuenta Git, vincule un repositorio al proyecto y configure la sincronización de incidencias con su proveedor.",
  "topic": "Numo e integraciones",
  "type": "guide",
  "audiences": [
    "owner",
    "member",
    "integrator"
  ],
  "workflows": [
    "N10",
    "N11"
  ],
  "visibility": "public",
  "status": "published",
  "revision": 6,
  "sourceRevision": 5,
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
      "content/knowledge/integrations.md",
      "components/settings/account-git-connections-section.tsx",
      "components/settings/project-git-section.tsx",
      "docs/managed-forge-relay-plan.md",
      "docs/github-issue-sync.md"
    ]
  },
  "review": {
    "revision": 6,
    "fact": "agent:/root/min747 (0.20.0 release review: source audit against the v0.11.0..main delta, no correction needed; no screenshot in scope; 1 screenshot(s) without a current capture script keep their earlier capture and evidence; no browser walkthrough of the procedures or operator rehearsal; earlier evidence retained in git history); agent:claude-code (it/es catalog language review: quoted labels aligned on the corrected es catalog; no behavior change, no new captures)",
    "language": "agent:/root/min747 (es translation of the release corrections with catalog UI labels; equivalent meaning self-reviewed; agent review, not human acceptance); agent:claude-code (es label alignment after the full catalog review; self-reviewed; agent review, not human acceptance)",
    "date": "2026-10-22"
  },
  "related": [
    "api-and-webhooks"
  ],
  "aliases": [
    "git-accounts-and-repositories",
    "integrations",
    "forge-issue-sync"
  ],
  "tags": [
    "Conectar Git y vincular un repositorio",
    "Sincronizar incidencias del proveedor Git"
  ],
  "figures": [
    {
      "id": "git-accounts-and-repositories-workflow",
      "kind": "diagram",
      "src": "/documentation/es/git-connection-flow.svg",
      "alt": "Conectar la cuenta personal y vincular un repositorio al proyecto son pasos distintos.",
      "caption": "Autoriza primero la cuenta y después vincula un repositorio como propietario del proyecto.",
      "revision": 6,
      "reviewed": true,
      "capturedAt": "2026-10-09",
      "viewport": [
        720,
        580
      ],
      "theme": "neutral",
      "diagram": {
        "layout": "sequence",
        "title": "Conectar una cuenta y vincular un repositorio",
        "items": [
          {
            "title": "Cuenta personal de Git",
            "detail": "Autoriza GitHub o GitLab para los repositorios que necesites."
          },
          {
            "title": "Propietario del proyecto",
            "detail": "Elige un repositorio disponible en los ajustes de Git del proyecto."
          },
          {
            "title": "Repositorio vinculado",
            "detail": "Aurora → aurora/web. La sincronización de tickets se elige por separado."
          }
        ]
      }
    },
    {
      "id": "forge-issue-sync-mapping",
      "kind": "diagram",
      "src": "/documentation/es/forge-issue-sync-mapping.svg",
      "alt": "Flujo de sincronización de GitHub con configuración, validación de eventos, importación y estados.",
      "caption": "Los eventos de GitHub conservan los cambios recientes y evitan entregas duplicadas. Las correspondencias de GitLab se verifican por separado.",
      "revision": 6,
      "reviewed": true,
      "capturedAt": "2026-10-08",
      "viewport": [
        1100,
        720
      ],
      "theme": "neutral",
      "diagram": {
        "layout": "sequence",
        "title": "Sincronización de issues de GitHub",
        "items": [
          {
            "title": "Configuración del propietario",
            "detail": "Vincular repositorio, conceder lectura/escritura de Issues y activar sincronización."
          },
          {
            "title": "Eventos entrantes",
            "detail": "Deduplicar identificadores de entrega; rechazar datos anteriores a cambios locales más recientes."
          },
          {
            "title": "Importación y correspondencias",
            "detail": "Los issues importados entran en triage. Título/cuerpo se convierten en título/descripción; las etiquetas aportan categorías, prioridad y esfuerzo reconocidos."
          },
          {
            "title": "Sincronización del estado",
            "detail": "Los estados abierto/cerrado se reflejan en ambos sentidos. Comparar fechas cuando compiten cambios."
          }
        ],
        "note": "Los comentarios conservan la identidad remota sin duplicarse. Las correspondencias de GitLab pueden variar."
      }
    },
    {
      "id": "forge-issue-sync-workflow",
      "kind": "screenshot",
      "src": "/documentation/es/forge-issue-sync-workflow.png",
      "alt": "Repositorio de demostración de GitHub vinculado, con la sincronización de incidencias desactivada.",
      "caption": "El repositorio de demostración está vinculado a GitHub. La sincronización de incidencias sigue desactivada; compruebe el alcance y el backlog existente antes de activarla. Esta captura no demuestra una importación sincronizada.",
      "revision": 6,
      "reviewed": true,
      "capturedAt": "2026-10-08",
      "viewport": [
        816,
        278
      ],
      "theme": "light",
      "padding": 24
    }
  ],
  "requiredFigures": [
    "git-accounts-and-repositories-workflow",
    "forge-issue-sync-workflow",
    "forge-issue-sync-mapping"
  ]
}
---

Conectar una cuenta Git personal, vincular un repositorio al proyecto y sincronizar las incidencias del proveedor son acciones separadas. Autorice primero la cuenta. El propietario del proyecto elige después el repositorio y puede activar la sincronización con los permisos necesarios del proveedor.

## Conectar Git y vincular un repositorio {#git-accounts-and-repositories}

Conecte GitHub o GitLab en los ajustes Git de cuenta y complete la autorización en el navegador. Conceda solo los repositorios necesarios. En escritorio vuelva a la aplicación después. La conexión sirve para varios proyectos, sin vincular automáticamente todos los repositorios.

El propietario abre Git en los ajustes del proyecto, elige un repositorio disponible y confirma. Compruebe proveedor, nombre completo y cuenta que actuará. Los miembros no pueden sustituir el vínculo reservado al propietario. El vínculo permite el contexto del repositorio, el seguimiento de pull requests y las skills del repositorio; la sincronización de incidencias es un interruptor separado.

![Conectar la cuenta personal y vincular un repositorio al proyecto son pasos distintos.](/documentation/es/git-connection-flow.svg)

### Repositorios ausentes o acceso caducado {#recovery}

Si la lista está vacía, compruebe permisos y autorización de la organización o repositorio. Reconecte cuentas caducadas en vez de pegar tokens en incidencias. Desvincular requiere ser propietario; lea la confirmación.

Self-hosted puede usar un relay gestionado configurado o aplicaciones propias del operador. La conexión al relay se inicia expresamente y no convierte la plataforma Git en local. La disponibilidad depende de la configuración. Revise la política del operador antes de autorizar.


## Sincronizar incidencias del proveedor Git {#forge-issue-sync}

Como propietario, abra Git tras vincular el repositorio. Active sincronización con los permisos de escritura necesarios. Las incidencias importadas llegan al triaje. Compruebe la carga inicial indicada y título, descripción y estado de una incidencia remota conocida.

Los estados abierto y cerrado se reflejan en ambas direcciones. En GitHub, título y cuerpo pasan a título y descripción; las etiquetas aportan categorías y prioridad o esfuerzo reconocidos; se usa el primer responsable vinculado y la fecha del hito como vencimiento. Los comentarios conservan autor, identidad, URL y fechas remotas. Bloqueos requieren ambas incidencias en el mismo proyecto importado. Permanecen URL de adjuntos; bytes y campos de GitHub Projects no tienen equivalente nativo.

### Permisos, conflictos y desactivación {#forge-issue-sync-recovery}

La GitHub App necesita lectura/escritura de Issues y suscripciones Issues, Issue comments e Issue dependencies. Instalaciones existentes deben aceptar permisos nuevos. Estas correspondencias no garantizan todos los campos GitLab.

Eventos GitHub antiguos con fecha no sobrescriben cambios locales recientes. Identidades de entregas y comentarios evitan duplicados. Compare fechas y consulte eventos del proveedor y registros del operador si falta carga inicial. Desactive en el mismo ajuste exclusivo del propietario; revise por separado trabajo ya importado.

![Flujo de sincronización de GitHub con configuración, validación de eventos, importación y estados.](/documentation/es/forge-issue-sync-mapping.svg)

![Repositorio de demostración de GitHub vinculado, con la sincronización de incidencias desactivada.](/documentation/es/forge-issue-sync-workflow.png)

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
  "revision": 2,
  "sourceRevision": 2,
  "owner": "@mangue-dev",
  "updatedAt": "2026-10-09",
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
      "content/knowledge/integrations.md",
      "components/settings/account-git-connections-section.tsx",
      "components/settings/project-git-section.tsx",
      "docs/managed-forge-relay-plan.md",
      "content/documentation/reviews/remaining-account-capture-candidates.json",
      "docs/github-issue-sync.md",
      "content/documentation/reviews/forge-controls-capture-candidates.json"
    ]
  },
  "review": {
    "revision": 2,
    "fact": "agent:/root/german_spanish_review (structural consolidation review; prior procedural evidence retained; no operational rerun)",
    "language": "agent:/root/german_spanish_review (es title, summary, lead and heading review; retained body comparison)",
    "date": "2026-10-09"
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
      "kind": "screenshot",
      "src": "/documentation/es/git-accounts-and-repositories-workflow.png",
      "alt": "Cuentas GitHub y GitLab desconectadas con controles de autorización.",
      "caption": "Autoriza primero tu cuenta Git. El propietario vincula el repositorio al proyecto por separado.",
      "revision": 2,
      "reviewed": true,
      "capturedAt": "2026-10-08",
      "viewport": [
        1440,
        1800
      ],
      "theme": "light"
    },
    {
      "id": "git-accounts-and-repositories-project-workflow",
      "kind": "screenshot",
      "src": "/documentation/es/git-accounts-and-repositories-project-workflow.png",
      "alt": "Ajustes Git de un proyecto sin repositorio vinculado.",
      "caption": "Ajustes Git de un proyecto sin repositorio vinculado. Autoriza GitHub o GitLab antes de elegir un repositorio.",
      "revision": 2,
      "reviewed": true,
      "capturedAt": "2026-10-08",
      "viewport": [
        1440,
        1800
      ],
      "theme": "light"
    },
    {
      "id": "forge-issue-sync-mapping",
      "kind": "diagram",
      "src": "/documentation/es/forge-issue-sync-mapping.png",
      "alt": "Flujo de sincronización de GitHub con configuración, validación de eventos, importación y estados.",
      "caption": "Los eventos de GitHub conservan los cambios recientes y evitan entregas duplicadas. Las correspondencias de GitLab se verifican por separado.",
      "revision": 2,
      "reviewed": true,
      "capturedAt": "2026-10-08",
      "viewport": [
        1100,
        720
      ],
      "theme": "neutral"
    },
    {
      "id": "forge-issue-sync-workflow",
      "kind": "screenshot",
      "src": "/documentation/es/forge-issue-sync-workflow.png",
      "alt": "Repositorio de demostración de GitHub vinculado, con la sincronización de incidencias desactivada.",
      "caption": "El repositorio de demostración está vinculado a GitHub. La sincronización de incidencias sigue desactivada; compruebe el alcance y el backlog existente antes de activarla. Esta captura no demuestra una importación sincronizada.",
      "revision": 2,
      "reviewed": true,
      "capturedAt": "2026-10-08",
      "viewport": [
        1400,
        1000
      ],
      "theme": "light"
    }
  ],
  "requiredFigures": [
    "git-accounts-and-repositories-workflow",
    "git-accounts-and-repositories-project-workflow",
    "forge-issue-sync-workflow",
    "forge-issue-sync-mapping"
  ]
}
---

La conexión Git permite acceder al repositorio y realizar trabajo con código. El vínculo del repositorio y la sincronización de incidencias son ajustes separados. Esta guía explica cómo configurarlos y qué límites afectan a los permisos, los datos transferidos y los cambios simultáneos.

## Conectar Git y vincular un repositorio {#git-accounts-and-repositories}

Conecte GitHub o GitLab en los ajustes Git de cuenta y complete la autorización en el navegador. Conceda solo los repositorios necesarios. En escritorio vuelva a la aplicación después. La conexión sirve para varios proyectos, sin vincular automáticamente todos los repositorios.

El propietario abre Git en los ajustes del proyecto, elige un repositorio disponible y confirma. Compruebe proveedor, nombre completo y cuenta que actuará. Los miembros no pueden sustituir el vínculo reservado al propietario. El vínculo permite contexto y trabajo de código en servidor; la sincronización de incidencias es un interruptor separado.

![Cuentas GitHub y GitLab desconectadas con controles de autorización.](/documentation/es/git-accounts-and-repositories-workflow.png)

### Repositorios ausentes o acceso caducado {#recovery}

Si la lista está vacía, compruebe permisos y autorización de la organización o repositorio. Reconecte cuentas caducadas en vez de pegar tokens en incidencias. Desvincular requiere ser propietario; lea la confirmación.

Self-hosted puede usar un relay gestionado configurado o aplicaciones propias del operador. La conexión al relay se inicia expresamente y no convierte la plataforma Git en local. La disponibilidad depende de la configuración. Revise la política del operador antes de autorizar.

![Ajustes Git de un proyecto sin repositorio vinculado.](/documentation/es/git-accounts-and-repositories-project-workflow.png)

## Sincronizar incidencias del proveedor Git {#forge-issue-sync}

Como propietario, abra Git tras vincular el repositorio. Active sincronización con los permisos de escritura necesarios. Las incidencias importadas llegan al triaje. Compruebe la carga inicial indicada y título, descripción y estado de una incidencia remota conocida.

Los estados abierto y cerrado se reflejan en ambas direcciones. En GitHub, título y cuerpo pasan a título y descripción; las etiquetas aportan categorías y prioridad o esfuerzo reconocidos; se usa el primer asignado vinculado y la fecha del hito como vencimiento. Los comentarios conservan autor, identidad, URL y fechas remotas. Bloqueos requieren ambas incidencias en el mismo proyecto importado. Permanecen URL de adjuntos; bytes y campos de GitHub Projects no tienen equivalente nativo.

### Permisos, conflictos y desactivación {#forge-issue-sync-recovery}

La GitHub App necesita lectura/escritura de Issues y suscripciones Issues, Issue comments e Issue dependencies. Instalaciones existentes deben aceptar permisos nuevos. Estas correspondencias no garantizan todos los campos GitLab.

Eventos GitHub antiguos con fecha no sobrescriben cambios locales recientes. Identidades de entregas y comentarios evitan duplicados. Compare fechas y consulte eventos del proveedor y registros del operador si falta carga inicial. Desactive en el mismo ajuste exclusivo del propietario; revise por separado trabajo ya importado.

![Flujo de sincronización de GitHub con configuración, validación de eventos, importación y estados.](/documentation/es/forge-issue-sync-mapping.png)

![Repositorio de demostración de GitHub vinculado, con la sincronización de incidencias desactivada.](/documentation/es/forge-issue-sync-workflow.png)

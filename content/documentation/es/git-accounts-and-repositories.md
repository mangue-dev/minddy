---
{
  "id": "git-accounts-and-repositories",
  "locale": "es",
  "title": "Conectar Git y vincular un repositorio",
  "summary": "Autorizar la cuenta del proveedor y hacer que el propietario elija el repositorio del proyecto.",
  "topic": "Numo e integraciones",
  "type": "guide",
  "audiences": [
    "owner",
    "member"
  ],
  "workflows": [
    "N10"
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
      "content/knowledge/integrations.md",
      "components/settings/account-git-connections-section.tsx",
      "components/settings/project-git-section.tsx",
      "docs/managed-forge-relay-plan.md",
      "content/documentation/reviews/remaining-account-capture-candidates.json"
    ]
  },
  "review": {
    "revision": 1,
    "fact": "2026-10-08",
    "language": "2026-10-08",
    "date": "2026-10-08"
  },
  "related": [
    "forge-issue-sync",
    "feedback-ingestion-and-sso"
  ],
  "aliases": [
    "integrations"
  ],
  "tags": [],
  "figures": [
    {
      "id": "git-accounts-and-repositories-workflow",
      "kind": "screenshot",
      "src": "/documentation/es/git-accounts-and-repositories-workflow.png",
      "alt": "Cuentas GitHub y GitLab desconectadas con controles de autorización.",
      "caption": "Autoriza primero tu cuenta Git. El propietario vincula el repositorio al proyecto por separado.",
      "revision": 1,
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
      "revision": 1,
      "reviewed": true,
      "capturedAt": "2026-10-08",
      "viewport": [
        1440,
        1800
      ],
      "theme": "light"
    }
  ],
  "requiredFigures": [
    "git-accounts-and-repositories-workflow",
    "git-accounts-and-repositories-project-workflow"
  ]
}
---

## Conexión y vínculo {#git-accounts-and-repositories}
Conecte GitHub o GitLab en los ajustes Git de cuenta y complete la autorización en el navegador. Conceda solo los repositorios necesarios. En escritorio vuelva a la aplicación después. La conexión sirve para varios proyectos, sin vincular automáticamente todos los repositorios.

El propietario abre Git en los ajustes del proyecto, elige un repositorio disponible y confirma. Compruebe proveedor, nombre completo y cuenta que actuará. Los miembros no pueden sustituir el vínculo reservado al propietario. El vínculo permite contexto y trabajo de código en servidor; la sincronización de incidencias es un interruptor separado.

![Cuentas GitHub y GitLab desconectadas con controles de autorización.](/documentation/es/git-accounts-and-repositories-workflow.png)


## Repositorios ausentes o acceso caducado {#recovery}
Si la lista está vacía, compruebe permisos y autorización de la organización o repositorio. Reconecte cuentas caducadas en vez de pegar tokens en incidencias. Desvincular requiere ser propietario; lea la confirmación.

Self-hosted puede usar un relay gestionado configurado o aplicaciones propias del operador. La conexión al relay se inicia expresamente y no convierte la plataforma Git en local. La disponibilidad depende de la configuración. Revise la política del operador antes de autorizar.

![Ajustes Git de un proyecto sin repositorio vinculado.](/documentation/es/git-accounts-and-repositories-project-workflow.png)

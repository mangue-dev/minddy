---
{
  "id": "forge-issue-sync",
  "locale": "pt-BR",
  "title": "Sincronizar tarefas da plataforma Git",
  "summary": "Ativar importação e sincronização e diagnosticar permissões e alterações simultâneas.",
  "topic": "Numo e integrações",
  "type": "guide",
  "audiences": [
    "owner",
    "integrator"
  ],
  "workflows": [
    "N11"
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
      "docs/github-issue-sync.md",
      "content/knowledge/integrations.md",
      "components/settings/project-git-section.tsx",
      "content/documentation/reviews/forge-controls-capture-candidates.json"
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
      "id": "forge-issue-sync-mapping",
      "kind": "diagram",
      "src": "/documentation/pt-BR/forge-issue-sync-mapping.png",
      "alt": "Fluxo de sincronização do GitHub com configuração, verificação de eventos, importação e estados.",
      "caption": "Eventos do GitHub preservam alterações recentes e evitam entregas duplicadas. O mapeamento do GitLab exige verificação separada.",
      "revision": 1,
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
      "src": "/documentation/pt-BR/forge-issue-sync-workflow.png",
      "alt": "Repositório de demonstração do GitHub vinculado, com a sincronização de issues desativada.",
      "caption": "O repositório de demonstração está vinculado ao GitHub. A sincronização de issues continua desativada; confira o escopo e o backlog existente antes de ativá-la. Esta captura não comprova uma importação sincronizada.",
      "revision": 1,
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
    "forge-issue-sync-workflow",
    "forge-issue-sync-mapping"
  ]
}
---

## Ativar e conferir {#forge-issue-sync}
Como proprietário, abra Git após vincular o repositório. Ative sincronização com as permissões de escrita necessárias. Tarefas importadas chegam à triagem. Confira a carga inicial informada e título, descrição e status de uma tarefa remota conhecida.

Aberto e fechado são espelhados nos dois sentidos. No GitHub, título e corpo viram título e descrição; labels fornecem categorias e prioridade ou esforço reconhecidos; usa-se o primeiro responsável vinculado e a data do milestone como prazo. Comentários preservam autor, identidade, URL e datas remotos. Bloqueios exigem ambas as tarefas no mesmo projeto importado. URLs de anexos permanecem; bytes e campos GitHub Projects não têm equivalente nativo.

## Permissões, conflitos e desativação {#recovery}
A GitHub App exige leitura/escrita de Issues e assinaturas Issues, Issue comments e Issue dependencies. Instalações existentes precisam aceitar permissões novas. Esses mapeamentos não garantem todos os campos GitLab.

Eventos GitHub antigos com data não substituem alterações locais recentes. Identidades de entrega e comentário evitam duplicações. Compare datas e consulte eventos do provedor e logs do operador se faltar carga inicial. Desative no mesmo controle exclusivo do proprietário; examine o trabalho já importado separadamente.

![Fluxo de sincronização do GitHub com configuração, verificação de eventos, importação e estados.](/documentation/pt-BR/forge-issue-sync-mapping.png)

![Repositório de demonstração do GitHub vinculado, com a sincronização de issues desativada.](/documentation/pt-BR/forge-issue-sync-workflow.png)

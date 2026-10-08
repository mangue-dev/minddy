---
{
  "id": "git",
  "locale": "pt-BR",
  "title": "Repositórios Git e sincronização de problemas",
  "summary": "Conecte uma conta Git, vincule um repositório ao projeto e configure a sincronização de problemas com o provedor.",
  "topic": "Numo e integrações",
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
    "fact": "agent:/root consolidation review; agent:/root/italian_portuguese_review retained-meaning comparison with prior procedural evidence (no operational rerun)",
    "language": "agent:/root/italian_portuguese_review (localized feature scope, summaries and heading review; retained source procedures)",
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
    "Conectar Git e vincular um repositório ao projeto",
    "Sincronizar problemas da plataforma Git",
    "Sincronizar tarefas da plataforma Git"
  ],
  "figures": [
    {
      "id": "git-accounts-and-repositories-workflow",
      "kind": "screenshot",
      "src": "/documentation/pt-BR/git-accounts-and-repositories-workflow.png",
      "alt": "Contas GitHub e GitLab desconectadas com controles de autorização.",
      "caption": "Autorize primeiro sua conta Git. O proprietário vincula o repositório ao projeto separadamente.",
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
      "src": "/documentation/pt-BR/git-accounts-and-repositories-project-workflow.png",
      "alt": "Configurações Git de um projeto sem repositório vinculado.",
      "caption": "Configurações Git de um projeto sem repositório vinculado. Autorize o GitHub ou o GitLab antes de escolher um repositório.",
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
      "src": "/documentation/pt-BR/forge-issue-sync-mapping.png",
      "alt": "Fluxo de sincronização do GitHub com configuração, verificação de eventos, importação e estados.",
      "caption": "Eventos do GitHub preservam alterações recentes e evitam entregas duplicadas. O mapeamento do GitLab exige verificação separada.",
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
      "src": "/documentation/pt-BR/forge-issue-sync-workflow.png",
      "alt": "Repositório de demonstração do GitHub vinculado, com a sincronização de issues desativada.",
      "caption": "O repositório de demonstração está vinculado ao GitHub. A sincronização de issues continua desativada; confira o escopo e o backlog existente antes de ativá-la. Esta captura não comprova uma importação sincronizada.",
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

A conexão Git pessoal autoriza o acesso ao provedor; o vínculo do repositório e a sincronização de problemas são configurações do projeto. O proprietário as configura para GitHub.com ou GitLab.com. Confira separadamente acesso, direção da sincronização e conflitos.

## Conectar Git e vincular um repositório ao projeto {#git-accounts-and-repositories}

Conecte GitHub ou GitLab nas configurações Git da conta e conclua a autorização pelo navegador. Conceda somente repositórios necessários. No desktop retorne ao app depois. A conexão pode ser reutilizada em projetos, sem vincular todos os repositórios automaticamente.

O proprietário abre Git nas configurações do projeto, escolhe um repositório disponível e confirma. Confira provedor, nome completo e conta que atuará. Membros não podem substituir esse vínculo exclusivo. Ele permite contexto e trabalho de código no servidor; a sincronização de tarefas é um botão separado.

![Contas GitHub e GitLab desconectadas com controles de autorização.](/documentation/pt-BR/git-accounts-and-repositories-workflow.png)

### Repositório ausente ou acesso expirado {#recovery}

Se a lista estiver vazia, confira permissões e autorização da organização ou repositório. Reconecte contas expiradas em vez de colar tokens nas tarefas. Desvincular exige o proprietário; leia a confirmação.

Self-hosted pode usar um relay gerenciado configurado ou apps próprios do operador. A conexão com o relay é explícita e não torna a plataforma Git local. Disponibilidade depende da configuração. Confira a política do operador antes de autorizar.

![Configurações Git de um projeto sem repositório vinculado.](/documentation/pt-BR/git-accounts-and-repositories-project-workflow.png)

## Sincronizar problemas da plataforma Git {#forge-issue-sync}

Como proprietário, abra Git após vincular o repositório. Ative sincronização com as permissões de escrita necessárias. Tarefas importadas chegam à triagem. Confira a carga inicial informada e título, descrição e status de uma tarefa remota conhecida.

Aberto e fechado são espelhados nos dois sentidos. No GitHub, título e corpo viram título e descrição; labels fornecem categorias e prioridade ou esforço reconhecidos; usa-se o primeiro responsável vinculado e a data do milestone como prazo. Comentários preservam autor, identidade, URL e datas remotos. Bloqueios exigem ambas as tarefas no mesmo projeto importado. URLs de anexos permanecem; bytes e campos GitHub Projects não têm equivalente nativo.

### Permissões, conflitos e desativação {#forge-issue-sync-recovery}

A GitHub App exige leitura/escrita de Issues e assinaturas Issues, Issue comments e Issue dependencies. Instalações existentes precisam aceitar permissões novas. Esses mapeamentos não garantem todos os campos GitLab.

Eventos GitHub antigos com data não substituem alterações locais recentes. Identidades de entrega e comentário evitam duplicações. Compare datas e consulte eventos do provedor e logs do operador se faltar carga inicial. Desative no mesmo controle exclusivo do proprietário; examine o trabalho já importado separadamente.

![Fluxo de sincronização do GitHub com configuração, verificação de eventos, importação e estados.](/documentation/pt-BR/forge-issue-sync-mapping.png)

![Repositório de demonstração do GitHub vinculado, com a sincronização de issues desativada.](/documentation/pt-BR/forge-issue-sync-workflow.png)

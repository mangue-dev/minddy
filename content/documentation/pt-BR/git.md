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
      "kind": "diagram",
      "src": "/documentation/pt-BR/git-connection-flow.svg",
      "alt": "Conectar a conta pessoal e vincular um repositório ao projeto são etapas distintas.",
      "caption": "Autorize primeiro a conta e depois vincule um repositório como proprietário do projeto.",
      "revision": 2,
      "reviewed": true,
      "capturedAt": "2026-10-09",
      "viewport": [
        720,
        580
      ],
      "theme": "neutral",
      "diagram": {
        "layout": "sequence",
        "title": "Conectar uma conta e vincular um repositório",
        "items": [
          {
            "title": "Conta pessoal do Git",
            "detail": "Autorize o GitHub ou o GitLab para os repositórios de que você precisa."
          },
          {
            "title": "Proprietário do projeto",
            "detail": "Escolha um repositório disponível nas configurações de Git do projeto."
          },
          {
            "title": "Repositório vinculado",
            "detail": "Aurora → aurora/web. A sincronização de tickets é uma escolha separada."
          }
        ]
      }
    },
    {
      "id": "forge-issue-sync-mapping",
      "kind": "diagram",
      "src": "/documentation/pt-BR/forge-issue-sync-mapping.svg",
      "alt": "Fluxo de sincronização do GitHub com configuração, verificação de eventos, importação e estados.",
      "caption": "Eventos do GitHub preservam alterações recentes e evitam entregas duplicadas. O mapeamento do GitLab exige verificação separada.",
      "revision": 2,
      "reviewed": true,
      "capturedAt": "2026-10-08",
      "viewport": [
        1100,
        720
      ],
      "theme": "neutral",
      "diagram": {
        "layout": "sequence",
        "title": "Sincronização de tickets do GitHub",
        "items": [
          {
            "title": "Configuração do proprietário",
            "detail": "Vincular repositório, conceder leitura/escrita de Issues e ativar a sincronização."
          },
          {
            "title": "Eventos recebidos",
            "detail": "Deduplicar IDs de entrega; dados mais antigos não sobrescrevem alterações locais mais recentes."
          },
          {
            "title": "Importação e mapeamento",
            "detail": "Tickets importados entram na triagem. Título/corpo viram título/descrição; rótulos fornecem categorias, prioridade e esforço reconhecidos."
          },
          {
            "title": "Sincronização de estado",
            "detail": "Estados aberto/fechado são espelhados nos dois sentidos. Comparar horários quando alterações concorrem."
          }
        ],
        "note": "Comentários mantêm a identidade remota sem duplicação. O mapeamento do GitLab pode ser diferente."
      }
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

A conexão Git pessoal autoriza o acesso ao provedor; o vínculo do repositório e a sincronização de problemas são configurações do projeto. O proprietário as configura para GitHub.com ou GitLab.com. Confira separadamente acesso, direção da sincronização e conflitos.

## Conectar Git e vincular um repositório ao projeto {#git-accounts-and-repositories}

Conecte GitHub ou GitLab nas configurações Git da conta e conclua a autorização pelo navegador. Conceda somente repositórios necessários. No desktop retorne ao app depois. A conexão pode ser reutilizada em projetos, sem vincular todos os repositórios automaticamente.

O proprietário abre Git nas configurações do projeto, escolhe um repositório disponível e confirma. Confira provedor, nome completo e conta que atuará. Membros não podem substituir esse vínculo exclusivo. Ele permite contexto e trabalho de código no servidor; a sincronização de tarefas é um botão separado.

![Conectar a conta pessoal e vincular um repositório ao projeto são etapas distintas.](/documentation/pt-BR/git-connection-flow.svg)

### Repositório ausente ou acesso expirado {#recovery}

Se a lista estiver vazia, confira permissões e autorização da organização ou repositório. Reconecte contas expiradas em vez de colar tokens nas tarefas. Desvincular exige o proprietário; leia a confirmação.

Self-hosted pode usar um relay gerenciado configurado ou apps próprios do operador. A conexão com o relay é explícita e não torna a plataforma Git local. Disponibilidade depende da configuração. Confira a política do operador antes de autorizar.


## Sincronizar problemas da plataforma Git {#forge-issue-sync}

Como proprietário, abra Git após vincular o repositório. Ative sincronização com as permissões de escrita necessárias. Tarefas importadas chegam à triagem. Confira a carga inicial informada e título, descrição e status de uma tarefa remota conhecida.

Aberto e fechado são espelhados nos dois sentidos. No GitHub, título e corpo viram título e descrição; labels fornecem categorias e prioridade ou esforço reconhecidos; usa-se o primeiro responsável vinculado e a data do milestone como prazo. Comentários preservam autor, identidade, URL e datas remotos. Bloqueios exigem ambas as tarefas no mesmo projeto importado. URLs de anexos permanecem; bytes e campos GitHub Projects não têm equivalente nativo.

### Permissões, conflitos e desativação {#forge-issue-sync-recovery}

A GitHub App exige leitura/escrita de Issues e assinaturas Issues, Issue comments e Issue dependencies. Instalações existentes precisam aceitar permissões novas. Esses mapeamentos não garantem todos os campos GitLab.

Eventos GitHub antigos com data não substituem alterações locais recentes. Identidades de entrega e comentário evitam duplicações. Compare datas e consulte eventos do provedor e logs do operador se faltar carga inicial. Desative no mesmo controle exclusivo do proprietário; examine o trabalho já importado separadamente.

![Fluxo de sincronização do GitHub com configuração, verificação de eventos, importação e estados.](/documentation/pt-BR/forge-issue-sync-mapping.svg)

![Repositório de demonstração do GitHub vinculado, com a sincronização de issues desativada.](/documentation/pt-BR/forge-issue-sync-workflow.png)

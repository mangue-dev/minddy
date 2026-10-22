---
{
  "id": "git",
  "locale": "pt-BR",
  "title": "Repositórios Git e sincronização de issues",
  "summary": "Conecte uma conta Git, vincule um repositório ao projeto e configure a sincronização de issues com o provedor.",
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
  "revision": 7,
  "sourceRevision": 6,
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
    "revision": 7,
    "fact": "agent:/root/min747 (0.20.0 release review: source audit against the v0.11.0..main delta, no correction needed; no screenshot in scope; 1 screenshot(s) without a current capture script keep their earlier capture and evidence; no browser walkthrough of the procedures or operator rehearsal; earlier evidence retained in git history); agent:claude-code (MIN-762 UI label and terminology correction: pt-BR labels aligned on the corrected catalog and the ticket term; no behavior change, no new captures); agent:claude-code (manual figures rebuilt on the Aurora demo, catalog review labels and informal register; figures recaptured on 2026-10-22 from a local candidate against the preview demo account and inspected; no form submitted)",
    "language": "agent:/root/min747 (pt-BR translation of the release corrections with catalog UI labels; equivalent meaning self-reviewed; agent review, not human acceptance); agent:claude-code (pt-BR MIN-762 terminology edit; self-reviewed; agent review, not human acceptance); agent:claude-code (pt-BR manual figures rebuilt on the Aurora demo, catalog review labels and informal register; self-reviewed; agent review, not human acceptance)",
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
    "Conectar Git e vincular um repositório ao projeto",
    "Sincronizar issues da plataforma Git",
    "Sincronizar tickets da plataforma Git"
  ],
  "figures": [
    {
      "id": "git-accounts-and-repositories-workflow",
      "kind": "diagram",
      "src": "/documentation/pt-BR/git-connection-flow.svg",
      "alt": "Conectar a conta pessoal e vincular um repositório ao projeto são etapas distintas.",
      "caption": "Autorize primeiro a conta e depois vincule um repositório como proprietário do projeto.",
      "revision": 7,
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
      "revision": 7,
      "reviewed": true,
      "capturedAt": "2026-10-08",
      "viewport": [
        1100,
        720
      ],
      "theme": "neutral",
      "diagram": {
        "layout": "sequence",
        "title": "Sincronização de issues do GitHub",
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
      "revision": 7,
      "reviewed": true,
      "capturedAt": "2026-10-22",
      "viewport": [
        816,
        208
      ],
      "theme": "light",
      "padding": 24,
      "deviceScaleFactor": 2
    }
  ],
  "requiredFigures": [
    "git-accounts-and-repositories-workflow",
    "forge-issue-sync-workflow",
    "forge-issue-sync-mapping"
  ]
}
---

A conexão Git pessoal autoriza o acesso ao provedor; o vínculo do repositório e a sincronização de issues são configurações do projeto. O proprietário as configura para GitHub.com ou GitLab.com. Confira separadamente acesso, direção da sincronização e conflitos.

## Conectar Git e vincular um repositório ao projeto {#git-accounts-and-repositories}

Conecte GitHub ou GitLab nas configurações Git da conta e conclua a autorização pelo navegador. Conceda somente repositórios necessários. No desktop retorne ao app depois. A conexão pode ser reutilizada em projetos, sem vincular todos os repositórios automaticamente.

O proprietário abre Git nas configurações do projeto, escolhe um repositório disponível e confirma. Confira provedor, nome completo e conta que atuará. Membros não podem substituir esse vínculo exclusivo. Ele permite o contexto do repositório, o acompanhamento de pull requests e as skills do repositório; a sincronização de issues é um botão separado.

![Conectar a conta pessoal e vincular um repositório ao projeto são etapas distintas.](/documentation/pt-BR/git-connection-flow.svg)

### Repositório ausente ou acesso expirado {#recovery}

Se a lista estiver vazia, confira permissões e autorização da organização ou repositório. Reconecte contas expiradas em vez de colar tokens no texto dos tickets. Desvincular exige o proprietário; leia a confirmação.

Self-hosted pode usar um relay gerenciado configurado ou apps próprios do operador. A conexão com o relay é explícita e não torna a plataforma Git local. Disponibilidade depende da configuração. Confira a política do operador antes de autorizar.


## Sincronizar issues da plataforma Git {#forge-issue-sync}

Como proprietário, abra Git após vincular o repositório. Ative a sincronização de issues somente com as permissões de escrita necessárias. As issues importadas chegam à triagem como tickets. Confira a carga inicial informada e o título, a descrição e o status de uma issue remota conhecida.

Aberto e fechado são espelhados nos dois sentidos. No GitHub, título e corpo viram título e descrição; labels fornecem categorias e prioridade ou esforço reconhecidos; usa-se o primeiro responsável vinculado e a data do milestone como prazo. Comentários preservam autor, identidade, URL e datas remotos. Bloqueios exigem que as duas issues estejam no mesmo projeto importado. URLs de anexos permanecem; bytes e campos GitHub Projects não têm equivalente nativo.

### Permissões, conflitos e desativação {#forge-issue-sync-recovery}

A GitHub App exige leitura/escrita de Issues e assinaturas Issues, Issue comments e Issue dependencies. Instalações existentes precisam aceitar permissões novas. Esses mapeamentos não garantem todos os campos GitLab.

Eventos GitHub antigos com data não substituem alterações locais recentes. Identidades de entrega e comentário evitam duplicações. Compare datas e consulte eventos do provedor e logs do operador se faltar carga inicial. Desative no mesmo controle exclusivo do proprietário; examine o trabalho já importado separadamente.

![Fluxo de sincronização do GitHub com configuração, verificação de eventos, importação e estados.](/documentation/pt-BR/forge-issue-sync-mapping.svg)

![Repositório de demonstração do GitHub vinculado, com a sincronização de issues desativada.](/documentation/pt-BR/forge-issue-sync-workflow.png)

---
{
  "id": "git-accounts-and-repositories",
  "locale": "pt-BR",
  "title": "Conectar Git e vincular um repositório ao projeto",
  "summary": "Autorizar a conta do provedor e deixar o proprietário escolher o repositório.",
  "topic": "Numo e integrações",
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
      "src": "/documentation/pt-BR/git-accounts-and-repositories-workflow.png",
      "alt": "Contas GitHub e GitLab desconectadas com controles de autorização.",
      "caption": "Autorize primeiro sua conta Git. O proprietário vincula o repositório ao projeto separadamente.",
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
      "src": "/documentation/pt-BR/git-accounts-and-repositories-project-workflow.png",
      "alt": "Configurações Git de um projeto sem repositório vinculado.",
      "caption": "Configurações Git de um projeto sem repositório vinculado. Autorize o GitHub ou o GitLab antes de escolher um repositório.",
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

## Conexão da conta e vínculo do projeto {#git-accounts-and-repositories}
Conecte GitHub ou GitLab nas configurações Git da conta e conclua a autorização pelo navegador. Conceda somente repositórios necessários. No desktop retorne ao app depois. A conexão pode ser reutilizada em projetos, sem vincular todos os repositórios automaticamente.

O proprietário abre Git nas configurações do projeto, escolhe um repositório disponível e confirma. Confira provedor, nome completo e conta que atuará. Membros não podem substituir esse vínculo exclusivo. Ele permite contexto e trabalho de código no servidor; a sincronização de tarefas é um botão separado.

![Contas GitHub e GitLab desconectadas com controles de autorização.](/documentation/pt-BR/git-accounts-and-repositories-workflow.png)


## Repositório ausente ou acesso expirado {#recovery}
Se a lista estiver vazia, confira permissões e autorização da organização ou repositório. Reconecte contas expiradas em vez de colar tokens nas tarefas. Desvincular exige o proprietário; leia a confirmação.

Self-hosted pode usar um relay gerenciado configurado ou apps próprios do operador. A conexão com o relay é explícita e não torna a plataforma Git local. Disponibilidade depende da configuração. Confira a política do operador antes de autorizar.

![Configurações Git de um projeto sem repositório vinculado.](/documentation/pt-BR/git-accounts-and-repositories-project-workflow.png)

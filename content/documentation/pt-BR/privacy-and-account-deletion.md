---
{
  "id": "privacy-and-account-deletion",
  "locale": "pt-BR",
  "title": "Controlar análises e excluir a conta",
  "summary": "Conferir destinos e consequências antes de um pedido irreversível.",
  "topic": "Conta e aplicativos",
  "type": "guide",
  "audiences": [
    "member"
  ],
  "workflows": [
    "A09"
  ],
  "visibility": "public",
  "status": "published",
  "revision": 2,
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
      "components/settings/account-analytics-section.tsx",
      "components/settings/account-data-section.tsx",
      "app/api/account/deletion-preview/route.ts",
      "app/api/account/route.ts"
    ]
  },
  "review": {
    "revision": 2,
    "fact": "2026-10-08",
    "language": "2026-10-08",
    "date": "2026-10-08"
  },
  "related": [],
  "aliases": [],
  "tags": [],
  "figures": [
    {
      "id": "privacy-and-account-deletion-workflow",
      "kind": "screenshot",
      "src": "/documentation/pt-BR/privacy-and-account-deletion-workflow.png",
      "alt": "Prévia de exclusão com projetos próprios, tickets e membros que perderão acesso.",
      "caption": "Leia a prévia e exporte os dados que deseja manter antes de abrir a confirmação.",
      "revision": 2,
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
    "privacy-and-account-deletion-workflow"
  ]
}
---

## Consentimento de análises {#privacy-and-account-deletion}

Quando o serviço de análise está configurado, as configurações da conta mostram um controle de consentimento e um link para a política de cookies. Desativá-lo altera imediatamente o consentimento de medição neste dispositivo e salva a escolha na conta. A escolha local já existente em outro dispositivo pode continuar valendo naquele dispositivo. Se nenhum serviço de análise estiver configurado, a seção não aparece.

Esse consentimento é separado dos dados necessários ao funcionamento da conta. Leia a política de privacidade da instância e confira os provedores externos que habilitou. No Minddy self-hosted, a configuração e as políticas do operador determinam os destinos dos serviços; desativar a análise não remove integrações de IA ou Git.

![Prévia de exclusão com projetos próprios, tickets e membros que perderão acesso.](/documentation/pt-BR/privacy-and-account-deletion-workflow.png)


## Conferir exclusão {#deletion}

Antes de excluir a conta, exporte pela seção Dados o que precisa conservar. Leia a prévia dos projetos que possui, membros afetados, tarefas, comentários e assinatura ativa. As consequências para os projetos próprios afetam outras pessoas; resolva essas questões antes de confirmar.

Abra a confirmação de exclusão somente quando estiver pronto. Digite o email da conta e, nas contas com senha, a senha. Contas sem senha exigem um login recente. Siga as orientações de uma recusa por autenticação não recente, em vez de repetir tentativas às cegas. Uma exclusão bem-sucedida encerra a sessão e retorna ao site público. Essa operação não envia os dados para uma lixeira recuperável. Mantenha as exportações privadas e trate qualquer questão restante de assinatura ou provedor pelos controles correspondentes de cobrança e serviço.

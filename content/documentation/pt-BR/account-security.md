---
{
  "id": "account-security",
  "locale": "pt-BR",
  "title": "Proteger a conta com dois fatores",
  "summary": "Verificar um autenticador e guardar códigos de recuperação antes de concluir.",
  "topic": "Conta e aplicativos",
  "type": "guide",
  "audiences": [
    "member"
  ],
  "workflows": [
    "A02"
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
      "components/settings/account-security-section.tsx",
      "app/api/account/mfa/route.ts",
      "app/api/account/mfa/recovery-codes/route.ts",
      "app/api/account/mfa/recover/route.ts",
      "lib/server/mfa.ts",
      "content/documentation/reviews/mfa-enrollment-capture-candidates.json"
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
      "id": "account-security-workflow",
      "kind": "screenshot",
      "src": "/documentation/pt-BR/account-security-workflow.png",
      "alt": "Cartão de autenticação de dois fatores com botão de ativação.",
      "caption": "Comece aqui, depois verifique o autenticador e guarde os códigos de recuperação em local protegido.",
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
      "id": "account-security-enrollment-workflow",
      "kind": "screenshot",
      "src": "/documentation/pt-BR/account-security-enrollment-workflow.png",
      "alt": "Configuração do autenticador antes da verificação do código.",
      "caption": "Configuração do autenticador antes da verificação do código. O QR real e o segredo manual estão ocultos; esse fator temporário não verificado foi cancelado e removido.",
      "revision": 2,
      "reviewed": true,
      "capturedAt": "2026-10-08",
      "viewport": [
        1440,
        1200
      ],
      "theme": "light"
    }
  ],
  "requiredFigures": [
    "account-security-workflow",
    "account-security-enrollment-workflow"
  ]
}
---

## Ativar e verificar {#account-security}

Abra a seção Segurança nas configurações da conta e ative a autenticação de dois fatores. Esse segundo fator também é exigido ao entrar pelo Google ou GitHub; a autenticação do provedor não o substitui.

1. Escaneie o código QR com um aplicativo autenticador TOTP ou digite manualmente a chave de configuração exibida. Nunca inclua o código QR nem a chave em uma captura de tela.
2. Digite o código atual de seis dígitos e confirme. Se ele tiver expirado, tente o próximo código; depois de muitas tentativas, aguarde antes de tentar novamente.
3. Guarde os códigos de recuperação em um local protegido que possa acessar sem o telefone. Cada código funciona uma única vez, e a lista é exibida apenas uma vez. Confirme que a salvou antes de concluir.

A ativação atualiza a sessão atual e tenta encerrar as outras sessões. Se for solicitado um novo login depois que o código tiver sido aceito, entre novamente e siga as orientações exibidas.

![Cartão de autenticação de dois fatores com botão de ativação.](/documentation/pt-BR/account-security-workflow.png)


## Recuperação e mudanças {#recovery}

Durante o login, se estiver sem o telefone, use um dos códigos de recuperação que guardou. Usar um código desativa a autenticação de dois fatores e invalida todos os códigos restantes. Depois de entrar, configure o autenticador novamente e guarde os novos códigos de recuperação. Essa operação não garante que o suporte humano possa recuperar a conta.

Substituir os códigos de recuperação invalida a lista anterior. Tanto a substituição quanto a desativação voluntária exigem as verificações de autenticação recente do servidor. Leia a confirmação: ao desativar a função, o fator adicional deixa de ser exigido, inclusive ao entrar pelo Google ou GitHub.

![Configuração do autenticador antes da verificação do código.](/documentation/pt-BR/account-security-enrollment-workflow.png)

---
{
  "id": "account-access",
  "locale": "pt-BR",
  "title": "Criar uma conta e entrar",
  "summary": "Use a instância correta, confirme seu e-mail e encerre a sessão pela ação apropriada.",
  "topic": "Primeiros passos",
  "type": "guide",
  "audiences": [
    "member"
  ],
  "workflows": [
    "S02"
  ],
  "visibility": "public",
  "status": "published",
  "revision": 2,
  "sourceRevision": 1,
  "owner": "@mangue-dev",
  "updatedAt": "2026-10-08",
  "compatibility": {
    "version": "0.11.1 candidate (89ebb59a5)",
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
      "app/(auth)/signup/page.tsx",
      "components/auth/signup-wizard.tsx",
      "lib/signup-wizard.ts",
      "lib/password-policy.ts",
      "app/(auth)/login/page.tsx",
      "app/auth/confirm/page.tsx"
    ]
  },
  "review": {
    "revision": 2,
    "fact": "2026-10-08",
    "language": "2026-10-08",
    "date": "2026-10-08"
  },
  "related": [
    "choose-an-instance",
    "account-recovery",
    "project-members"
  ],
  "aliases": [],
  "tags": [],
  "figures": [
    {
      "id": "account-access-steps",
      "kind": "screenshot",
      "src": "/documentation/pt-BR/auth-signup.png",
      "alt": "Cadastro por e-mail, com os botões dos provedores e a primeira etapa do assistente de três etapas.",
      "caption": "Comece na instância correta. Após o e-mail vêm a identidade e a senha; nenhum cadastro foi enviado nesta captura.",
      "revision": 2,
      "reviewed": true,
      "capturedAt": "2026-10-08",
      "viewport": [
        380,
        454
      ],
      "theme": "light"
    },
    {
      "id": "account-access-login",
      "kind": "screenshot",
      "src": "/documentation/pt-BR/auth-login.png",
      "alt": "Formulário de login com o link de recuperação abaixo do campo de senha.",
      "caption": "Inicie a recuperação na instância da sua conta. O formulário aparece sem credenciais enviadas.",
      "revision": 2,
      "reviewed": true,
      "capturedAt": "2026-10-08",
      "viewport": [
        380,
        540
      ],
      "theme": "light"
    }
  ],
  "requiredFigures": [
    "account-access-steps"
  ]
}
---

## Cadastrar e confirmar sua conta {#account-access}

Abra a tela de entrada ou cadastro na instância que pretende usar. O Cloud e outra instância auto-hospedada têm contas separadas. Os métodos de entrada disponíveis e a possibilidade de cadastro dependem da configuração de autenticação da instância.

Para se cadastrar por email, informe seu endereço e avance para a etapa de identidade. Informe seu nome completo; ele não pode estar vazio nem conter apenas espaços. Você também pode escolher um avatar. Avance para a etapa de senha, informe uma senha com pelo menos oito caracteres, uma letra minúscula (a–z), uma maiúscula (A–Z) e um dígito, e repita-a no campo de confirmação. Envie essa última etapa para criar a conta. Abandonar as etapas anteriores não cria uma conta. Quando a confirmação de email for necessária, abra a mensagem enviada pela instância. Siga o link e acione o botão de confirmação na página. Abrir o link não é suficiente: o Minddy exige essa ação deliberada antes de consumir o token de email.

Volte à aplicação desejada e entre. Uma conta recém-autenticada pode criar seu próprio projeto ou aceitar um convite. Saber a URL de um projeto não concede participação nele.


![Cadastro por e-mail, com os botões dos provedores e a primeira etapa do assistente de três etapas.](/documentation/pt-BR/auth-signup.png)

## Sair e verificar mensagens que não chegaram {#session-and-mail}

Abra o menu da conta, escolha sair e confirme. No aplicativo desktop, fechar uma aba ou janela não é o mesmo que sair da conta. Use o menu da conta quando quiser encerrar a sessão.

Se a mensagem não chegar, confira o endereço, a pasta de spam e a identidade da instância. O operador de uma instância auto-hospedada precisa ter configurado um envio de e-mail funcional para o Auth; os e-mails opcionais de notificação da aplicação e a confirmação do Auth são funções distintas. Uma página de confirmação expirada permite voltar à entrada para solicitar um novo link. Não encaminhe links de confirmação ou recuperação como evidência para diagnóstico: eles autorizam acesso à conta.

![Formulário de login com o link de recuperação abaixo do campo de senha.](/documentation/pt-BR/auth-login.png)

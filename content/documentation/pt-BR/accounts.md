---
{
  "id": "accounts",
  "locale": "pt-BR",
  "title": "Contas",
  "summary": "Crie e proteja sua conta, recupere o acesso, altere suas preferências e entenda a exclusão da conta.",
  "topic": "Primeiros passos",
  "type": "guide",
  "audiences": [
    "member"
  ],
  "workflows": [
    "S02",
    "A02",
    "S03",
    "A01",
    "A09"
  ],
  "visibility": "public",
  "status": "published",
  "revision": 6,
  "sourceRevision": 6,
  "owner": "@mangue-dev",
  "updatedAt": "2026-10-09",
  "compatibility": {
    "version": "0.11.1 candidate (89ebb59a5); 0.11.1 candidate (cd1843e12)",
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
      "app/auth/confirm/page.tsx",
      "components/settings/account-security-section.tsx",
      "app/api/account/mfa/route.ts",
      "app/api/account/mfa/recovery-codes/route.ts",
      "app/api/account/mfa/recover/route.ts",
      "lib/server/mfa.ts",
      "content/documentation/reviews/mfa-enrollment-capture-candidates.json",
      "app/(auth)/reset-password/page.tsx",
      "docs/self-hosting-auth.md",
      "content/knowledge/settings-and-data.md",
      "components/settings/account-profile-section.tsx",
      "components/settings/account-preferences-section.tsx",
      "app/api/me/avatar/route.ts",
      "lib/server/avatar-seeds.ts",
      "components/settings/account-analytics-section.tsx",
      "components/settings/account-data-section.tsx",
      "app/api/account/deletion-preview/route.ts",
      "app/api/account/route.ts"
    ]
  },
  "review": {
    "revision": 6,
    "fact": "agent:/root consolidation review; agent:/root/italian_portuguese_review retained-meaning comparison with prior procedural evidence (no operational rerun)",
    "language": "agent:/root/italian_portuguese_review (localized feature scope, summaries and heading review; retained source procedures)",
    "date": "2026-10-09"
  },
  "related": [
    "choose-an-instance",
    "projects",
    "authentication-and-email",
    "applications",
    "automation-settings",
    "transfer-between-instances"
  ],
  "aliases": [
    "account-access",
    "account-security",
    "account-recovery",
    "profile-and-preferences",
    "settings-and-data",
    "privacy-and-account-deletion"
  ],
  "tags": [
    "Criar uma conta e entrar",
    "Proteger a conta com dois fatores",
    "Recuperar o acesso à conta",
    "Alterar perfil e preferências",
    "Controlar análises e excluir a conta"
  ],
  "figures": [
    {
      "id": "account-access-steps",
      "kind": "screenshot",
      "src": "/documentation/pt-BR/auth-signup.png",
      "alt": "Cadastro por e-mail, com os botões dos provedores e a primeira etapa do assistente de três etapas.",
      "caption": "Comece na instância correta. Após o e-mail vêm a identidade e a senha; nenhum cadastro foi enviado nesta captura.",
      "revision": 6,
      "reviewed": true,
      "capturedAt": "2026-10-08",
      "viewport": [
        428,
        502
      ],
      "theme": "light",
      "padding": 24
    },
    {
      "id": "account-access-login",
      "kind": "screenshot",
      "src": "/documentation/pt-BR/auth-login.png",
      "alt": "Formulário de login com o link de recuperação abaixo do campo de senha.",
      "caption": "Inicie a recuperação na instância da sua conta. O formulário aparece sem credenciais enviadas.",
      "revision": 6,
      "reviewed": true,
      "capturedAt": "2026-10-08",
      "viewport": [
        428,
        588
      ],
      "theme": "light",
      "padding": 24
    },
    {
      "id": "account-security-workflow",
      "kind": "screenshot",
      "src": "/documentation/pt-BR/account-security-workflow.png",
      "alt": "Cartão de autenticação de dois fatores com botão de ativação.",
      "caption": "Comece aqui, depois verifique o autenticador e guarde os códigos de recuperação em local protegido.",
      "revision": 6,
      "reviewed": true,
      "capturedAt": "2026-10-08",
      "viewport": [
        816,
        227
      ],
      "theme": "light",
      "padding": 24
    },
    {
      "id": "account-security-enrollment-workflow",
      "kind": "screenshot",
      "src": "/documentation/pt-BR/account-security-enrollment-workflow.png",
      "alt": "Configuração do autenticador antes da verificação do código.",
      "caption": "Configuração do autenticador antes da verificação do código. O QR real e o segredo manual estão ocultos; esse fator temporário não verificado foi cancelado e removido.",
      "revision": 6,
      "reviewed": true,
      "capturedAt": "2026-10-08",
      "viewport": [
        816,
        498
      ],
      "theme": "light",
      "padding": 24
    },
    {
      "id": "account-recovery-steps",
      "kind": "screenshot",
      "src": "/documentation/pt-BR/auth-recovery.png",
      "alt": "Formulário de recuperação de senha com um endereço de exemplo e o botão para enviar o link.",
      "caption": "Digite aqui o e-mail da sua conta. O endereço de exemplo não foi enviado; a imagem não comprova o recebimento da mensagem nem uma recuperação concluída.",
      "revision": 6,
      "reviewed": true,
      "capturedAt": "2026-10-08",
      "viewport": [
        428,
        326
      ],
      "theme": "light",
      "padding": 24
    },
    {
      "id": "profile-and-preferences-workflow",
      "kind": "screenshot",
      "src": "/documentation/pt-BR/profile-and-preferences-workflow.png",
      "alt": "Controles do perfil para avatar, nome de usuário e email somente leitura.",
      "caption": "Salve as alterações do perfil após a validação; o endereço de email permanece somente leitura.",
      "revision": 6,
      "reviewed": true,
      "capturedAt": "2026-10-08",
      "viewport": [
        816,
        416
      ],
      "theme": "light",
      "padding": 24
    },
    {
      "id": "profile-and-preferences-preferences-workflow",
      "kind": "screenshot",
      "src": "/documentation/pt-BR/profile-and-preferences-preferences-workflow.png",
      "alt": "Seletor de idioma e controles de tema claro, escuro e do sistema.",
      "caption": "O idioma da conta e o do site público são configurados separadamente.",
      "revision": 6,
      "reviewed": true,
      "capturedAt": "2026-10-08",
      "viewport": [
        816,
        212
      ],
      "theme": "light",
      "padding": 24
    },
    {
      "id": "privacy-and-account-deletion-workflow",
      "kind": "screenshot",
      "src": "/documentation/pt-BR/privacy-and-account-deletion-workflow.png",
      "alt": "Prévia de exclusão com projetos próprios, tickets e membros que perderão acesso.",
      "caption": "Leia a prévia e exporte os dados que deseja manter antes de abrir a confirmação.",
      "revision": 6,
      "reviewed": true,
      "capturedAt": "2026-10-08",
      "viewport": [
        816,
        231
      ],
      "theme": "light",
      "padding": 24
    }
  ],
  "requiredFigures": [
    "account-access-steps",
    "account-security-workflow",
    "account-security-enrollment-workflow",
    "account-recovery-steps",
    "profile-and-preferences-workflow",
    "profile-and-preferences-preferences-workflow",
    "privacy-and-account-deletion-workflow"
  ]
}
---

Sua conta pertence à instância em que você se cadastra. Aqui você encontra acesso e recuperação, autenticação de dois fatores, perfil, preferências e exclusão; antes de excluir a conta, confira também as consequências para os projetos que você possui.

## Criar uma conta e entrar {#account-access}

Abra a tela de entrada ou cadastro na instância que pretende usar. O Cloud e outra instância auto-hospedada têm contas separadas. Os métodos de entrada disponíveis e a possibilidade de cadastro dependem da configuração de autenticação da instância.

Para se cadastrar por email, informe seu endereço e avance para a etapa de identidade. Informe seu nome completo; ele não pode estar vazio nem conter apenas espaços. Você também pode escolher um avatar. Avance para a etapa de senha, informe uma senha com pelo menos oito caracteres, uma letra minúscula (a–z), uma maiúscula (A–Z) e um dígito, e repita-a no campo de confirmação. Envie essa última etapa para criar a conta. Abandonar as etapas anteriores não cria uma conta. Quando a confirmação de email for necessária, abra a mensagem enviada pela instância. Siga o link e acione o botão de confirmação na página. Abrir o link não é suficiente: o minddy exige essa ação deliberada antes de consumir o token de email.

Volte à aplicação desejada e entre. Uma conta recém-autenticada pode criar seu próprio projeto ou aceitar um convite. Saber a URL de um projeto não concede participação nele.


![Cadastro por e-mail, com os botões dos provedores e a primeira etapa do assistente de três etapas.](/documentation/pt-BR/auth-signup.png)

### Sair e verificar mensagens que não chegaram {#session-and-mail}

Abra o menu da conta, escolha sair e confirme. No aplicativo desktop, fechar uma aba ou janela não é o mesmo que sair da conta. Use o menu da conta quando quiser encerrar a sessão.

Se a mensagem não chegar, confira o endereço, a pasta de spam e a identidade da instância. O operador de uma instância auto-hospedada precisa ter configurado um envio de e-mail funcional para o Auth; os e-mails opcionais de notificação da aplicação e a confirmação do Auth são funções distintas. Uma página de confirmação expirada permite voltar à entrada para solicitar um novo link. Não encaminhe links de confirmação ou recuperação como evidência para diagnóstico: eles autorizam acesso à conta.

![Formulário de login com o link de recuperação abaixo do campo de senha.](/documentation/pt-BR/auth-login.png)

## Proteger a conta com dois fatores {#account-security}

Abra a seção Segurança nas configurações da conta e ative a autenticação de dois fatores. Esse segundo fator também é exigido ao entrar pelo Google ou GitHub; a autenticação do provedor não o substitui.

1. Escaneie o código QR com um aplicativo autenticador TOTP ou digite manualmente a chave de configuração exibida. Nunca inclua o código QR nem a chave em uma captura de tela.
2. Digite o código atual de seis dígitos e confirme. Se ele tiver expirado, tente o próximo código; depois de muitas tentativas, aguarde antes de tentar novamente.
3. Guarde os códigos de recuperação em um local protegido que possa acessar sem o telefone. Cada código funciona uma única vez, e a lista é exibida apenas uma vez. Confirme que a salvou antes de concluir.

A ativação atualiza a sessão atual e tenta encerrar as outras sessões. Se for solicitado um novo login depois que o código tiver sido aceito, entre novamente e siga as orientações exibidas.

![Cartão de autenticação de dois fatores com botão de ativação.](/documentation/pt-BR/account-security-workflow.png)

### Recuperação e mudanças {#recovery}

Durante o login, se estiver sem o telefone, use um dos códigos de recuperação que guardou. Usar um código desativa a autenticação de dois fatores e invalida todos os códigos restantes. Depois de entrar, configure o autenticador novamente e guarde os novos códigos de recuperação. Essa operação não garante que o suporte humano possa recuperar a conta.

Substituir os códigos de recuperação invalida a lista anterior. Tanto a substituição quanto a desativação voluntária exigem as verificações de autenticação recente do servidor. Leia a confirmação: ao desativar a função, o fator adicional deixa de ser exigido, inclusive ao entrar pelo Google ou GitHub.

![Configuração do autenticador antes da verificação do código.](/documentation/pt-BR/account-security-enrollment-workflow.png)

## Recuperar o acesso à conta {#account-recovery}

Na tela de entrada da instância correta, use a recuperação de senha e informe o e-mail associado à sua conta. Abra a mensagem de redefinição, siga o link e confirme a ação. Informe a nova senha na tela de redefinição e envie. Depois, verifique se consegue entrar na mesma instância.

Um link pode expirar ou deixar de ter uma sessão ativa. A tela de redefinição identifica essa situação e permite solicitar outro link. Comece por uma mensagem nova, em vez de tentar novamente um favorito antigo. Não envie o link, os cookies ou a senha ao suporte.


![Formulário de recuperação de senha com um endereço de exemplo e o botão para enviar o link.](/documentation/pt-BR/auth-recovery.png)

### MFA e acesso ainda não resolvido {#mfa-recovery}

Se a autenticação de dois fatores estiver habilitada, redefinir a senha não remove esse requisito. Use seu aplicativo autenticador. Você também pode usar um código de recuperação salvo ao habilitar a MFA; usá-lo desativa a MFA. Trate os códigos de recuperação como segredos e configure novamente a MFA nas configurações de segurança depois de recuperar o acesso.

Se não tiver nem o segundo fator nem um código de recuperação, contate o operador da instância pelo canal de suporte. Inclua o endereço da instância e a falha exibida, sem tokens de autenticação ou conteúdo privado do projeto. Se o e-mail de recuperação não chegar, peça ao operador que verifique as URLs de redirecionamento do Auth e a entrega SMTP. Não crie uma segunda conta supondo que ela herdará os projetos ou conexões da conta original.

## Alterar perfil e preferências {#profile-and-preferences}

Abra as configurações no menu da conta. No perfil, informe um nome não vazio e salve. O email é somente leitura. Gere outro avatar ou envie uma imagem pelos controles próprios. Aguarde o resultado e confira o avatar em um comentário ou na lista de membros; ele acompanha a conta entre projetos e conversas. Se o arquivo for rejeitado, siga a mensagem de validação em vez de reenviar repetidamente.

A imagem fonte não pode passar de 10 MiB. O servidor verifica bytes legíveis, aplica a orientação e recorta no centro como avatar WebP de 256 × 256.

![Controles do perfil para avatar, nome de usuário e email somente leitura.](/documentation/pt-BR/profile-and-preferences-workflow.png)

### Escolher o comportamento {#preferences}

Selecione o idioma e o tema nas preferências e confira outra página. O idioma da conta controla o produto autenticado; o site público possui seu próprio seletor. O tema fica salvo na conta entre dispositivos.

Escolha o atalho de envio na seção de teclado. Ele vale para comentários e Numo. Use o botão de enviar se a plataforma interceptar o atalho; as teclas modificadoras variam entre sistemas. Preferências como atribuição automática e status de tarefas criadas pelo Numo também pertencem à conta e não alteram as de outros membros.

![Seletor de idioma e controles de tema claro, escuro e do sistema.](/documentation/pt-BR/profile-and-preferences-preferences-workflow.png)

## Controlar análises e excluir a conta {#privacy-and-account-deletion}

Quando o serviço de análise está configurado, as configurações da conta mostram um controle de consentimento e um link para a política de cookies. Desativá-lo altera imediatamente o consentimento de medição neste dispositivo e salva a escolha na conta. A escolha local já existente em outro dispositivo pode continuar valendo naquele dispositivo. Se nenhum serviço de análise estiver configurado, a seção não aparece.

Esse consentimento é separado dos dados necessários ao funcionamento da conta. Leia a política de privacidade da instância e confira os provedores externos que habilitou. No minddy self-hosted, a configuração e as políticas do operador determinam os destinos dos serviços; desativar a análise não remove integrações de IA ou Git.

![Prévia de exclusão com projetos próprios, tickets e membros que perderão acesso.](/documentation/pt-BR/privacy-and-account-deletion-workflow.png)

### Conferir as consequências da exclusão {#deletion}

Antes de excluir a conta, exporte pela seção Dados o que precisa conservar. Leia a prévia dos projetos que possui, membros afetados, tarefas, comentários e assinatura ativa. As consequências para os projetos próprios afetam outras pessoas; resolva essas questões antes de confirmar.

Abra a confirmação de exclusão somente quando estiver pronto. Digite o email da conta e, nas contas com senha, a senha. Contas sem senha exigem um login recente. Siga as orientações de uma recusa por autenticação não recente, em vez de repetir tentativas às cegas. Uma exclusão bem-sucedida encerra a sessão e retorna ao site público. Essa operação não envia os dados para uma lixeira recuperável. Mantenha as exportações privadas e trate qualquer questão restante de assinatura ou provedor pelos controles correspondentes de cobrança e serviço.

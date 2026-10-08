---
{
  "id": "account-recovery",
  "locale": "pt-BR",
  "title": "Recuperar o acesso à conta",
  "summary": "Redefina a senha com segurança e identifique quando ainda é necessário usar MFA ou buscar suporte da instância.",
  "topic": "Primeiros passos",
  "type": "troubleshooting",
  "audiences": [
    "member"
  ],
  "workflows": [
    "S03"
  ],
  "visibility": "public",
  "status": "published",
  "revision": 1,
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
      "app/(auth)/reset-password/page.tsx",
      "components/settings/account-security-section.tsx",
      "docs/self-hosting-auth.md"
    ]
  },
  "review": {
    "revision": 1,
    "fact": "2026-10-08",
    "language": "2026-10-08",
    "date": "2026-10-08"
  },
  "related": [
    "account-access",
    "account-security",
    "authentication-and-email"
  ],
  "aliases": [],
  "tags": [],
  "figures": [
    {
      "id": "account-recovery-steps",
      "kind": "screenshot",
      "src": "/documentation/pt-BR/auth-recovery.png",
      "alt": "Formulário de recuperação de senha com um endereço de exemplo e o botão para enviar o link.",
      "caption": "Digite aqui o e-mail da sua conta. O endereço de exemplo não foi enviado; a imagem não comprova o recebimento da mensagem nem uma recuperação concluída.",
      "revision": 1,
      "reviewed": true,
      "capturedAt": "2026-10-08",
      "viewport": [
        380,
        278
      ],
      "theme": "light"
    }
  ],
  "requiredFigures": [
    "account-recovery-steps"
  ]
}
---

## Solicitar um novo link de redefinição {#account-recovery}

Na tela de entrada da instância correta, use a recuperação de senha e informe o e-mail associado à sua conta. Abra a mensagem de redefinição, siga o link e confirme a ação. Informe a nova senha na tela de redefinição e envie. Depois, verifique se consegue entrar na mesma instância.

Um link pode expirar ou deixar de ter uma sessão ativa. A tela de redefinição identifica essa situação e permite solicitar outro link. Comece por uma mensagem nova, em vez de tentar novamente um favorito antigo. Não envie o link, os cookies ou a senha ao suporte.


![Formulário de recuperação de senha com um endereço de exemplo e o botão para enviar o link.](/documentation/pt-BR/auth-recovery.png)

## MFA e acesso ainda não resolvido {#mfa-recovery}

Se a autenticação de dois fatores estiver habilitada, redefinir a senha não remove esse requisito. Use seu aplicativo autenticador. Você também pode usar um código de recuperação salvo ao habilitar a MFA; usá-lo desativa a MFA. Trate os códigos de recuperação como segredos e configure novamente a MFA nas configurações de segurança depois de recuperar o acesso.

Se não tiver nem o segundo fator nem um código de recuperação, contate o operador da instância pelo canal de suporte. Inclua o endereço da instância e a falha exibida, sem tokens de autenticação ou conteúdo privado do projeto. Se o e-mail de recuperação não chegar, peça ao operador que verifique as URLs de redirecionamento do Auth e a entrega SMTP. Não crie uma segunda conta supondo que ela herdará os projetos ou conexões da conta original.

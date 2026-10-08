---
{
  "id": "authentication-and-email",
  "locale": "pt-BR",
  "title": "Autenticação e e-mail",
  "summary": "Configure os e-mails de autenticação, redirecionamentos e MFA no Supabase e verifique confirmação, acesso e recuperação.",
  "topic": "Operar uma instância",
  "type": "guide",
  "audiences": [
    "operator"
  ],
  "workflows": [
    "H06"
  ],
  "visibility": "public",
  "status": "published",
  "revision": 2,
  "sourceRevision": 2,
  "owner": "@mangue-dev",
  "updatedAt": "2026-10-09",
  "compatibility": {
    "version": "0.11.1 candidate (89ebb59a5)",
    "editions": [
      "self-hosted"
    ],
    "profiles": [
      "full",
      "managed",
      "source",
      "local"
    ],
    "evidence": [
      "docs/self-hosting-auth.md",
      "supabase/email-templates/confirm-signup.html",
      "supabase/email-templates/reset-password.html",
      "lib/self-hosting-email-templates.ts"
    ]
  },
  "review": {
    "revision": 2,
    "fact": "agent:/root consolidation review; agent:/root/italian_portuguese_review retained-meaning comparison with prior procedural evidence (no operational rerun)",
    "language": "agent:/root/italian_portuguese_review (localized feature scope, summaries and heading review; retained source procedures)",
    "date": "2026-10-09"
  },
  "related": [
    "instance-administration",
    "self-hosted-diagnostics"
  ],
  "aliases": [],
  "tags": [
    "Configurar e-mails de conta, MFA e recuperação",
    "Configurar emails de conta, MFA e recuperação"
  ],
  "figures": [
    {
      "id": "authentication-and-email-flow",
      "kind": "diagram",
      "src": "/documentation/pt-BR/authentication-and-email-flow.svg",
      "alt": "Diagrama: Origem Auth e redirecionamentos. SMTP próprio e modelos versionados. Confirmação e login com senha. Testes TOTP, recuperação e senha antiga.",
      "caption": "Siga as etapas nesta ordem. Origem Auth e redirecionamentos. SMTP próprio e modelos versionados. Confirmação e login com senha. Testes TOTP, recuperação e senha antiga.",
      "revision": 2,
      "reviewed": true,
      "capturedAt": "2026-10-08",
      "viewport": [
        720,
        640
      ],
      "theme": "neutral"
    }
  ],
  "requiredFigures": [
    "authentication-and-email-flow"
  ]
}
---

## Configurar e-mails de conta, MFA e recuperação {#authentication-and-email}

Os emails de conta dependem do Supabase e do GoTrue. Resend para notificações da aplicação não configura confirmação nem recuperação de senha. No perfil full, mantenha o overlay minddy em cada comando Compose. Defina SITE_URL, API_EXTERNAL_URL, SUPABASE_PUBLIC_URL e ADDITIONAL_REDIRECT_URLS para as origens da sua instância. Configure SMTP_ADMIN_EMAIL, SMTP_HOST, SMTP_PORT, SMTP_USER, SMTP_PASS e SMTP_SENDER_NAME com os valores do seu provedor. Mantenha a confirmação de email ativa e reinicie Auth no contexto instalado.


Antes de usar compose abaixo, defina a função do perfil full instalado a partir do [contexto Compose de referência](/pt-br/documentacao/backups-and-restoration#context).

```bash
compose up -d --wait auth
```


![Diagrama: Origem Auth e redirecionamentos. SMTP próprio e modelos versionados. Confirmação e login com senha. Testes TOTP, recuperação e senha antiga.](/documentation/pt-BR/authentication-and-email-flow.svg)

## Configurar Supabase gerenciado {#managed}

Na seção Authentication do projeto gerenciado, defina Site URL e o redirect exato `<app-origin>/auth/callback`. Configure SMTP e os dois templates de email versionados. A confirmação usa token_hash e type=signup. Exija senhas com pelo menos oito caracteres, letras minúsculas, maiúsculas e números, e habilite cadastro e verificação TOTP. Ative o controle de senhas comprometidas quando disponível e registre os limites do provedor. O perfil full nega acesso se esse controle falha e precisa alcançar api.pwnedpasswords.com. Registre duração das sessões, rotação de refresh, revogação e limites Auth: o bootstrap SQL não configura esses controles.

## Verificar o resultado {#verify}

Use um endereço temporário sob seu controle. Verifique recebimento, abertura do link na sua instância e confirmação explícita. Ative TOTP com segurança e guarde os códigos de recuperação fora do navegador. Saia e teste uma entrada nova com senha e TOTP. Redefina a senha e confirme que a anterior falha. Teste acesso administrador para uma conta em ADMIN_EMAILS após MFA. Registre versões, datas e resultados sanitizados. Containers saudáveis não comprovam entrega nem segurança. Não inclua tokens de email, senhas, sessões, segredos TOTP ou códigos de recuperação.

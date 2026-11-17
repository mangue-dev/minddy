---
{
  "id": "authentication-and-email",
  "locale": "pt-BR",
  "title": "Autenticação e e-mail",
  "summary": "Configure as origens do Auth e o SMTP de uma instância auto-hospedada do minddy para que os e-mails de confirmação e de recuperação funcionem e teste o cadastro e o login.",
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
  "revision": 6,
  "sourceRevision": 6,
  "owner": "@mangue-dev",
  "updatedAt": "2026-11-17",
  "compatibility": {
    "version": "0.40.0 (MIN-970 release review)",
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
    "revision": 6,
    "fact": "agent:/root/min747 (0.20.0 release review: source audit against the v0.11.0..main delta, verified corrections applied; no screenshot in scope; no browser walkthrough of the procedures or operator rehearsal; earlier evidence retained in git history); agent:claude-code (manual figures rebuilt on the Aurora demo, catalog review labels and informal register; figures recaptured on 2026-10-22 from a local candidate against the preview demo account and inspected; no form submitted); agent:claude-code (0.30.0 release review, MIN-794: its evidence changes in the v0.20.0..0.30.0 delta were documented by the pull requests that made them; the article was updated by pull requests in that delta; not re-audited line by line; 0 screenshot(s) recaptured on 2026-11-04 from a local candidate against the preview demo account and inspected; no browser walkthrough of the procedures); agent:claude-code (MIN-673: summary lengthened for the page description from facts stated in the article sections; body unchanged; no screenshot in scope); agent:claude-code (0.40.0 release review, MIN-970: source audit against the v0.30.1..0.40.0 delta: commit subjects and targeted commit bodies, quoted labels checked against messages/en.json; no correction needed; translations not reread; no screenshot recaptured; no browser walkthrough of the procedures)",
    "language": "agent:/root/min747 (pt-BR translation of the release corrections with catalog UI labels; equivalent meaning self-reviewed; agent review, not human acceptance); agent:claude-code (pt-BR manual figures rebuilt on the Aurora demo, catalog review labels and informal register; self-reviewed; agent review, not human acceptance); agent:claude-code (pt-BR MIN-673 summary translated from the English revision with the locale glossary and register; self-reviewed; agent review, not human acceptance)",
    "date": "2026-11-17"
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
      "revision": 6,
      "reviewed": true,
      "capturedAt": "2026-10-08",
      "viewport": [
        720,
        640
      ],
      "theme": "neutral",
      "diagram": {
        "layout": "sequence",
        "items": [
          {
            "title": "Origem Auth e redirecionamentos"
          },
          {
            "title": "SMTP próprio e modelos versionados"
          },
          {
            "title": "Confirmação e login com senha"
          },
          {
            "title": "Testes TOTP, recuperação e senha antiga"
          }
        ]
      }
    }
  ],
  "requiredFigures": [
    "authentication-and-email-flow"
  ]
}
---

## Configurar e-mails de conta, MFA e recuperação {#authentication-and-email}

Os emails de conta dependem do Supabase e do GoTrue. Resend para notificações da aplicação não configura confirmação nem recuperação de senha. No perfil full, mantenha o overlay minddy em cada comando Compose. Defina `SITE_URL`, `API_EXTERNAL_URL`, `SUPABASE_PUBLIC_URL` e `ADDITIONAL_REDIRECT_URLS` para as origens da sua instância. Configure `SMTP_ADMIN_EMAIL`, `SMTP_HOST`, `SMTP_PORT`, `SMTP_USER`, `SMTP_PASS` e `SMTP_SENDER_NAME` com os valores do seu provedor. O overlay também define os limites de sessão: `GOTRUE_SESSIONS_TIMEBOX` é `8760h` (um ano) e `GOTRUE_SESSIONS_INACTIVITY_TIMEOUT` é `720h` (30 dias). Mantenha a confirmação de email ativa e reinicie Auth no contexto instalado.


Antes de usar `compose` abaixo, defina a função do perfil full instalado a partir do [contexto Compose de referência](/pt-br/documentacao/backups-and-restoration#context).

```bash
compose up -d --wait auth
```


![Diagrama: Origem Auth e redirecionamentos. SMTP próprio e modelos versionados. Confirmação e login com senha. Testes TOTP, recuperação e senha antiga.](/documentation/pt-BR/authentication-and-email-flow.svg)

## Configurar Supabase gerenciado {#managed}

Na seção Authentication do projeto gerenciado, defina Site URL e o redirect exato `<app-origin>/auth/callback`. Configure SMTP e os dois templates de email versionados. A confirmação usa `token_hash` e `type=signup`. Exija senhas com pelo menos oito caracteres, letras minúsculas, maiúsculas e números, e habilite cadastro e verificação TOTP. Ative o controle de senhas comprometidas quando disponível e registre os limites do provedor. O perfil full nega acesso se esse controle falha e precisa alcançar `api.pwnedpasswords.com`. Defina a duração máxima das sessões em 8760 horas (um ano) e o tempo limite de inatividade em 720 horas (30 dias). O banco de dados recusa sessões além desses mesmos limites, então um limite de Auth desativado ou mais longo continua renovando sessões que depois todas as APIs rejeitam. Registre duração das sessões, rotação de refresh, revogação e limites Auth: o bootstrap SQL não configura esses controles.

## Verificar o resultado {#verify}

Use um endereço temporário sob seu controle. Verifique recebimento, abertura do link na sua instância e confirmação explícita. Ative TOTP com segurança e guarde os códigos de recuperação fora do navegador. Saia e teste uma entrada nova com senha e TOTP. Redefina a senha e confirme que a anterior falha. Teste acesso administrador para uma conta em `ADMIN_EMAILS` após MFA. Registre versões, datas e resultados sanitizados. Containers saudáveis não comprovam entrega nem segurança. Não inclua tokens de email, senhas, sessões, segredos TOTP ou códigos de recuperação.

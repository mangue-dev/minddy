---
{
  "id": "instance-configuration",
  "locale": "pt-BR",
  "title": "Configurar origens, segredos e capacidades da instância",
  "summary": "MINDDY_PUBLIC_APP_URL é uma origem absoluta única, sem caminho ou barra final.",
  "topic": "Operar uma instância",
  "type": "reference",
  "audiences": [
    "operator"
  ],
  "workflows": [
    "H05"
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
      "self-hosted"
    ],
    "profiles": [
      "full",
      "managed",
      "source",
      "local"
    ],
    "evidence": [
      ".env.example",
      "docs/self-hosting.md",
      "lib/capabilities.ts"
    ]
  },
  "review": {
    "revision": 1,
    "fact": "agent:/root/automation_account_documentation (independent targeted primary-source review)",
    "language": "agent:/root/automation_account_documentation (complete independent article and caption review)",
    "date": "2026-10-08"
  },
  "related": [
    "optional-providers",
    "workspace-encryption",
    "authentication-and-email"
  ],
  "aliases": [],
  "tags": [],
  "figures": [],
  "requiredFigures": []
}
---

## Configurar origens, segredos e capacidades da instância {#instance-configuration}

MINDDY_PUBLIC_APP_URL é uma origem absoluta única, sem caminho ou barra final. Serviços públicos usam HTTPS; localhost e IPv4 privada confiável podem usar HTTP. MINDDY_PUBLIC_SUPABASE_URL e MINDDY_PUBLIC_SUPABASE_ANON_KEY precisam pertencer à mesma pilha. Esses valores chegam ao navegador. SUPABASE_SERVICE_ROLE_KEY é exclusiva do servidor e obrigatória em produção; nunca use em variável pública ou bundle cliente. A URL de banco serve a ferramentas e não substitui configuração API.

## Preservar os segredos {#secrets}

O instalador cria GIT_STATE_SECRET, GIT_TOKEN_ENCRYPTION_SECRET, AI_KEY_ENCRYPTION_SECRET, FEEDBACK_SSO_ENCRYPTION_SECRET, MINDDY_DATA_ROOT_KEY, CRON_SECRET e AGENT_RUNNER_SECRET ausentes. A raiz de conteúdo tem exatamente 64 caracteres hexadecimais. Preserve fora PostgreSQL com cópia protegida para recuperação. Todo ambiente permanece 0600 e fora Git. Não execute como shell nem imprima. Repetir instalação não gira segredos. Perder chaves pode impedir leitura; rotação deliberada requer o procedimento correspondente.

## Aplicar e conferir uma mudança {#capabilities}

MINDDY_PUBLIC_SITE_NAME e MINDDY_PUBLIC_CONTACT_EMAIL identificam a instância. ADMIN_EMAILS contém administradores separados por vírgulas, também sujeitos a MFA. OAUTH_ISSUER normalmente fica vazio, salvo publicação intencional de OAuth em outra origem estável. Desligue IA e cobrança gerenciadas em self-hosted. Cada serviço opcional exige configuração completa. Reinicie ou recrie a aplicação após mudar valores públicos de execução, sem rebuild OCI. doctor distingue capacidades incompletas de falhas do núcleo. Confira links de conta e callbacks na origem correta.

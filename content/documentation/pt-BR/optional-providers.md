---
{
  "id": "optional-providers",
  "locale": "pt-BR",
  "title": "Habilitar provedores opcionais deliberadamente",
  "summary": "O núcleo não exige Stripe, PostHog, uma conta Cloud ou uma chave de IA do Minddy.",
  "topic": "Operar uma instância",
  "type": "guide",
  "audiences": [
    "operator"
  ],
  "workflows": [
    "H09"
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
      "docs/editions.md",
      ".env.example",
      "lib/capabilities.ts",
      "content/knowledge/self-hosting.md"
    ]
  },
  "review": {
    "revision": 1,
    "fact": "agent:/root/automation_account_documentation (independent targeted primary-source review)",
    "language": "agent:/root/automation_account_documentation (complete independent article and caption review)",
    "date": "2026-10-08"
  },
  "related": [
    "authentication-and-email",
    "architecture-and-data-flows",
    "instance-configuration"
  ],
  "aliases": [],
  "tags": [],
  "figures": [
    {
      "id": "optional-providers-flow",
      "kind": "diagram",
      "src": "/documentation/pt-BR/optional-providers-flow.svg",
      "alt": "Diagrama: Operador escolhe capacidade opcional. Credenciais completas e condições. Destino externo explícito dos dados. Verificar comportamento e acompanhar custos.",
      "caption": "Estes componentes têm responsabilidades distintas. Operador escolhe capacidade opcional. Credenciais completas e condições. Destino externo explícito dos dados. Verificar comportamento e acompanhar custos.",
      "revision": 1,
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
    "optional-providers-flow"
  ]
}
---

## Habilitar provedores opcionais deliberadamente {#optional-providers}

O núcleo não exige Stripe, PostHog, uma conta Cloud ou uma chave de IA do Minddy. Serviços externos acrescentam custos, permissões e destinos de dados: leia suas condições antes de habilitá-los. A ferramenta de diagnóstico informa valores ausentes sem escolher uma alternativa automaticamente. Uma instância própria pode usar chaves pessoais ou endpoints locais de IA acessíveis. Mantenha MINDDY_MANAGED_AI e MINDDY_MANAGED_BILLING desativados; uma chave OpenRouter isolada não seleciona a edição Cloud.

![Diagrama: Operador escolhe capacidade opcional. Credenciais completas e condições. Destino externo explícito dos dados. Verificar comportamento e acompanhar custos.](/documentation/pt-BR/optional-providers-flow.svg)

## Configurar provedores completos {#configure}

O email da aplicação exige EMAIL_PROVIDER=resend, RESEND_API_KEY, FEEDBACK_EMAIL_FROM e INVITATION_EMAIL_FROM. console não é permitido em produção; SMTP Auth é configurado separadamente. Web Push exige o par VAPID e VAPID_SUBJECT; as assinaturas dependem desse par. Analytics exige chave e host PostHog; rastreamento de erros exige MINDDY_PUBLIC_ERROR_TRACKING=1. O instalador oferece application-email e web-push, mas o operador precisa fornecer as credenciais externas. Não use remetentes Minddy ou credenciais das versões nativas em outras instâncias.

## Conectar Git e execução de código {#git-and-code}

GitHub.com e GitLab.com são suportados; GitHub Enterprise Server e GitLab próprio não são. Conexões de usuários podem usar o relay gerenciado; exclua-o com --no-forge-relay ou MINDDY_FORGE_RELAY=0 e configure suas próprias aplicações. Conexões existentes preservam o canal até reconectar. O perfil servidor inclui o runner Docker confiável. Vercel Sandbox é uma alternativa explícita que exige credenciais e uma MINDDY_DATA_ROOT_KEY válida mesmo com criptografia de conteúdo desativada. A execução local no desktop foi retirada. Configuração ausente bloqueia a delegação; não executa o trabalho no computador do usuário.


A imagem publicada da aplicação inclui Node.js e Git, mas remove intencionalmente npm, npx e Corepack. O perfil Compose de referência também seleciona essa imagem para os workers por meio de AGENT_RUNNER_SANDBOX_IMAGE=MINDDY_IMAGE. Isso não basta para um novo worker de código: o bootstrap do OpenCode usa npm para instalar seu runtime e plugin fixados, mesmo em um repositório sem dependências de projeto. Sem npm, a execução para no bootstrap; a conversa não permite concluir que um arquivo do projeto foi alterado ou que um teste passou. Use uma imagem dedicada aos workers, criada e verificada pelo operador, com Node.js 24, npm, Git e as ferramentas exigidas pelo projeto, sobrescrevendo AGENT_RUNNER_SANDBOX_IMAGE no serviço runner. Preserve as restrições de isolamento. Verifique o bootstrap, a clonagem, os testes reais e o diff resultante antes de habilitar a delegação de código. Corrigir os arquivos do runner não fornece essas ferramentas ao worker.

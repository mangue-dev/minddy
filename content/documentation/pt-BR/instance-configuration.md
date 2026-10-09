---
{
  "id": "instance-configuration",
  "locale": "pt-BR",
  "title": "Configuração da instância",
  "summary": "Configure origens, segredos e provedores opcionais, exponha os pontos de acesso de rede previstos e mantenha os trabalhos agendados em execução.",
  "topic": "Operar uma instância",
  "type": "guide",
  "audiences": [
    "operator"
  ],
  "workflows": [
    "H05",
    "H09",
    "H08"
  ],
  "visibility": "public",
  "status": "published",
  "revision": 3,
  "sourceRevision": 3,
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
      ".env.example",
      "docs/self-hosting.md",
      "lib/capabilities.ts",
      "docs/editions.md",
      "content/knowledge/self-hosting.md",
      "docs/self-hosting-distribution.md",
      "vercel.json",
      "deploy/self-hosted/compose.full.yml",
      "deploy/self-hosted/scheduler.mjs",
      "content/documentation/reviews/editorial-clarity-en-fr-2026-10-09.md",
      "content/documentation/reviews/editorial-clarity-de-es-2026-10-09.md",
      "content/documentation/reviews/editorial-clarity-it-pt-BR-2026-10-09.md"
    ]
  },
  "review": {
    "revision": 3,
    "fact": "agent:/root consolidation review; agent:/root/italian_portuguese_review retained-meaning comparison with prior procedural evidence (no operational rerun); agent:/root (visual usefulness, figure framing and preserved procedures; previous operational evidence retained)",
    "language": "agent:/root/italian_portuguese_review (localized feature scope, summaries and heading review; retained source procedures); agent:/root/editorial_it_pt (collection-caption clarity)",
    "date": "2026-10-09"
  },
  "related": [
    "workspace-encryption",
    "authentication-and-email",
    "architecture-and-data-flows",
    "update-an-instance",
    "numo"
  ],
  "aliases": [
    "optional-providers",
    "proxy-network-and-jobs"
  ],
  "tags": [
    "Configurar origens, segredos e capacidades da instância",
    "Habilitar provedores opcionais deliberadamente",
    "Expor origens e operar tarefas agendadas"
  ],
  "figures": [
    {
      "id": "optional-providers-flow",
      "kind": "diagram",
      "src": "/documentation/pt-BR/optional-providers-flow.svg",
      "alt": "Diagrama: Operador escolhe capacidade opcional. Credenciais completas e condições. Destino externo explícito dos dados. Verificar comportamento e acompanhar custos.",
      "caption": "Antes de ativar uma integração, confira as credenciais, as condições e o destino dos dados.",
      "revision": 3,
      "reviewed": true,
      "capturedAt": "2026-10-08",
      "viewport": [
        720,
        640
      ],
      "theme": "neutral",
      "diagram": {
        "layout": "collection",
        "items": [
          {
            "title": "Operador escolhe capacidade opcional"
          },
          {
            "title": "Credenciais completas e condições"
          },
          {
            "title": "Destino externo explícito dos dados"
          },
          {
            "title": "Verificar comportamento e acompanhar custos"
          }
        ]
      }
    },
    {
      "id": "proxy-network-and-jobs-flow",
      "kind": "diagram",
      "src": "/documentation/pt-BR/proxy-network-and-jobs-flow.svg",
      "alt": "Diagrama: Proxy HTTPS público. Origens app e Supabase públicas. Runner, banco e portas privadas. Tarefas autenticadas; paradas em manutenção.",
      "caption": "O proxy expõe as origens públicas e mantém os serviços internos privados; durante a manutenção, pare também as tarefas agendadas.",
      "revision": 3,
      "reviewed": true,
      "capturedAt": "2026-10-08",
      "viewport": [
        720,
        640
      ],
      "theme": "neutral",
      "diagram": {
        "layout": "collection",
        "items": [
          {
            "title": "Proxy HTTPS público"
          },
          {
            "title": "Origens app e Supabase públicas"
          },
          {
            "title": "Runner, banco e portas privadas"
          },
          {
            "title": "Tarefas autenticadas; paradas em manutenção"
          }
        ]
      }
    }
  ],
  "requiredFigures": [
    "optional-providers-flow",
    "proxy-network-and-jobs-flow"
  ]
}
---

A configuração da instância define origens, segredos, provedores opcionais e tarefas agendadas. Este guia é voltado ao operador: preserve os segredos fora do Git, exponha apenas os pontos de acesso previstos e verifique cada serviço habilitado separadamente. Os procedimentos de manutenção exigem parar também tarefas e entradas que possam gravar dados.

## Configurar origens, segredos e capacidades da instância {#instance-configuration}

MINDDY_PUBLIC_APP_URL é uma origem absoluta única, sem caminho ou barra final. Serviços públicos usam HTTPS; localhost e IPv4 privada confiável podem usar HTTP. MINDDY_PUBLIC_SUPABASE_URL e MINDDY_PUBLIC_SUPABASE_ANON_KEY precisam pertencer à mesma pilha. Esses valores chegam ao navegador. SUPABASE_SERVICE_ROLE_KEY é exclusiva do servidor e obrigatória em produção; nunca use em variável pública ou bundle cliente. A URL de banco serve a ferramentas e não substitui configuração API.

### Preservar os segredos {#secrets}

O instalador cria GIT_STATE_SECRET, GIT_TOKEN_ENCRYPTION_SECRET, AI_KEY_ENCRYPTION_SECRET, FEEDBACK_SSO_ENCRYPTION_SECRET, MINDDY_DATA_ROOT_KEY, CRON_SECRET e AGENT_RUNNER_SECRET ausentes. A raiz de conteúdo tem exatamente 64 caracteres hexadecimais. Preserve fora PostgreSQL com cópia protegida para recuperação. Todo ambiente permanece 0600 e fora Git. Não execute como shell nem imprima. Repetir instalação não gira segredos. Perder chaves pode impedir leitura; rotação deliberada requer o procedimento correspondente.

### Aplicar e conferir uma mudança {#capabilities}

MINDDY_PUBLIC_SITE_NAME e MINDDY_PUBLIC_CONTACT_EMAIL identificam a instância. ADMIN_EMAILS contém administradores separados por vírgulas, também sujeitos a MFA. OAUTH_ISSUER normalmente fica vazio, salvo publicação intencional de OAuth em outra origem estável. Desligue IA e cobrança gerenciadas em self-hosted. Cada serviço opcional exige configuração completa. Reinicie ou recrie a aplicação após mudar valores públicos de execução, sem rebuild OCI. doctor distingue capacidades incompletas de falhas do núcleo. Confira links de conta e callbacks na origem correta.

## Habilitar provedores opcionais deliberadamente {#optional-providers}

O núcleo não exige Stripe, PostHog, uma conta Cloud ou uma chave de IA do minddy. Serviços externos acrescentam custos, permissões e destinos de dados: leia suas condições antes de habilitá-los. A ferramenta de diagnóstico informa valores ausentes sem escolher uma alternativa automaticamente. Uma instância própria pode usar chaves pessoais ou endpoints locais de IA acessíveis. Mantenha MINDDY_MANAGED_AI e MINDDY_MANAGED_BILLING desativados; uma chave OpenRouter isolada não seleciona a edição Cloud.

![Diagrama: Operador escolhe capacidade opcional. Credenciais completas e condições. Destino externo explícito dos dados. Verificar comportamento e acompanhar custos.](/documentation/pt-BR/optional-providers-flow.svg)

### Configurar provedores completos {#configure}

O email da aplicação exige EMAIL_PROVIDER=resend, RESEND_API_KEY, FEEDBACK_EMAIL_FROM e INVITATION_EMAIL_FROM. console não é permitido em produção; SMTP Auth é configurado separadamente. Web Push exige o par VAPID e VAPID_SUBJECT; as assinaturas dependem desse par. Analytics exige chave e host PostHog; rastreamento de erros exige MINDDY_PUBLIC_ERROR_TRACKING=1. O instalador oferece application-email e web-push, mas o operador precisa fornecer as credenciais externas. Não use remetentes minddy ou credenciais das versões nativas em outras instâncias.

### Conectar Git e execução de código {#git-and-code}

GitHub.com e GitLab.com são suportados; GitHub Enterprise Server e GitLab próprio não são. Conexões de usuários podem usar o relay gerenciado; exclua-o com --no-forge-relay ou MINDDY_FORGE_RELAY=0 e configure suas próprias aplicações. Conexões existentes preservam o canal até reconectar. O perfil servidor inclui o runner Docker confiável. Vercel Sandbox é uma alternativa explícita que exige credenciais e uma MINDDY_DATA_ROOT_KEY válida mesmo com criptografia de conteúdo desativada. A execução local no desktop foi retirada. Configuração ausente bloqueia a delegação; não executa o trabalho no computador do usuário.


A imagem publicada da aplicação inclui Node.js e Git, mas remove intencionalmente npm, npx e Corepack. O perfil Compose de referência também seleciona essa imagem para os workers por meio de AGENT_RUNNER_SANDBOX_IMAGE=MINDDY_IMAGE. Isso não basta para um novo worker de código: o bootstrap do OpenCode usa npm para instalar seu runtime e plugin fixados, mesmo em um repositório sem dependências de projeto. Sem npm, a execução para no bootstrap; a conversa não permite concluir que um arquivo do projeto foi alterado ou que um teste passou. Use uma imagem dedicada aos workers, criada e verificada pelo operador, com Node.js 24, npm, Git e as ferramentas exigidas pelo projeto, sobrescrevendo AGENT_RUNNER_SANDBOX_IMAGE no serviço runner. Preserve as restrições de isolamento. Verifique o bootstrap, a clonagem, os testes reais e o diff resultante antes de habilitar a delegação de código. Corrigir os arquivos do runner não fornece essas ferramentas ao worker.

## Expor origens e operar tarefas agendadas {#proxy-network-and-jobs}

Um serviço público exige proxy TLS e redirect de HTTP para HTTPS. As origens minddy e Supabase, redirects Auth, callbacks OAuth e cabeçalhos precisam concordar. Não exponha PostgreSQL, Studio, portas internas ou runner. No perfil full, o servidor usa http://kong:8000 internamente, enquanto navegador e links preservam a origem pública do Supabase. HTTP privado exige localhost ou uma rede IPv4 privada confiável, sem encaminhamento de portas do roteador.

![Diagrama: Proxy HTTPS público. Origens app e Supabase públicas. Runner, banco e portas privadas. Tarefas autenticadas; paradas em manutenção.](/documentation/pt-BR/proxy-network-and-jobs-flow.svg)

### Fornecer agendamento autenticado {#schedules}

Os perfis Compose de referência iniciam o agendador, e o instalador gera CRON_SECRET. Uma implantação personalizada a partir do código precisa fornecer um agendador HTTP equivalente. Cada requisição envia `Authorization: Bearer <CRON_SECRET>`; um valor vazio ou errado retorna 401. Não registre esse cabeçalho. Os horários do candidato listados abaixo estão em UTC. Use as rotas da versão instalada, pois elas podem mudar.


O agendador publicado em v0.11.0 não inclui numo-turns. O candidato foi corrigido para chamá-lo a cada minuto. A tabela descreve o candidato corrigido; não presuma que esse job exista em uma implantação v0.11.0 intacta.

| Endpoint | Horário (UTC) |
| --- | --- |
| `/api/cron/feedback-analysis` | `0 * * * *` |
| `/api/cron/agent-drain` | `*/2 * * * *` |
| `/api/cron/numo-turns` | `* * * * *` |
| `/api/cron/forge-relay-deliveries` | `* * * * *` |
| `/api/cron/forge-relay-maintenance` | `35 * * * *` |
| `/api/cron/automations` | `*/2 * * * *` |
| `/api/cron/smart-assign` | `*/5 * * * *` |
| `/api/cron/routines` | `*/5 * * * *` |
| `/api/cron/billing-sync` | `15 * * * *` |
| `/api/cron/fx-rate` | `30 15 * * *` |
| `/api/cron/encryption-maintenance` | `15 * * * *` |
| `/api/cron/data-retention` | `45 3 * * *` |

### Parar tarefas em manutenção {#maintenance}

Antes de backup ou migração, pare agendador, aplicação, workers e API pública. Parar apenas o servidor web ainda permite gravações diretas. Verifique em manutenção com entradas e jobs fechados e reabra somente após conferir banco, Auth, Storage e aplicação. Se um job não iniciar, verifique agendador, origem e segredo em privado. Rotinas exigem o servidor, não um desktop aberto.

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
  "revision": 8,
  "sourceRevision": 8,
  "owner": "@mangue-dev",
  "updatedAt": "2026-10-17",
  "compatibility": {
    "version": "0.11.1 candidate (MIN-677); MIN-717 issue-index schedule; MIN-688 page-materialization schedule",
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
      "app/api/cron/issue-index/route.ts"
    ]
  },
  "review": {
    "revision": 8,
    "fact": "agent:/root (MIN-677 source review and isolated PostgreSQL regressions; unchanged procedures retain prior evidence); agent:/root/min-721 (code-runner removal checked against the edited Compose profiles, installer, doctor, scheduler and capability source; existing figures and procedural evidence retained; no operational rerun); agent:/root (MIN-717 issue-index schedule row checked against deploy/self-hosted/scheduler.mjs and vercel.json; no scheduler run)",
    "language": "agent:/root (pt-BR translation, label and retained-meaning self-review); agent:/root/min-721 (pt-BR runner-removal edits and full retained meaning); agent:/root (pt-BR MIN-717 table row: endpoint and cron expression only, no prose change)",
    "date": "2026-10-17"
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
      "revision": 8,
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
      "alt": "Diagrama: Proxy HTTPS público. Origens app e Supabase públicas. Banco e portas internas privadas. Tarefas autenticadas; paradas em manutenção.",
      "caption": "O proxy expõe as origens públicas e mantém os serviços internos privados; durante a manutenção, pare também as tarefas agendadas.",
      "revision": 8,
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
            "title": "Banco e portas internas privadas"
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

`MINDDY_PUBLIC_APP_URL` é uma origem absoluta única, sem caminho ou barra final. Serviços públicos usam HTTPS; `localhost` e IPv4 privada confiável podem usar HTTP. `MINDDY_PUBLIC_SUPABASE_URL` e `MINDDY_PUBLIC_SUPABASE_ANON_KEY` precisam pertencer à mesma pilha. Esses valores chegam ao navegador. `SUPABASE_SERVICE_ROLE_KEY` é exclusiva do servidor e obrigatória em produção; nunca use em variável pública ou bundle cliente. A URL de banco serve a ferramentas e não substitui configuração API.

### Preservar os segredos {#secrets}

O instalador cria `GIT_STATE_SECRET`, `GIT_TOKEN_ENCRYPTION_SECRET`, `AI_KEY_ENCRYPTION_SECRET`, `FEEDBACK_SSO_ENCRYPTION_SECRET`, `MINDDY_DATA_ROOT_KEY`, e `CRON_SECRET` ausentes. A raiz de conteúdo tem exatamente 64 caracteres hexadecimais. Preserve fora PostgreSQL com cópia protegida para recuperação. Todo ambiente permanece `0600` e fora Git. Não execute como shell nem imprima. Repetir instalação não gira segredos. Perder chaves pode impedir leitura; rotação deliberada requer o procedimento correspondente.

### Aplicar e conferir uma mudança {#capabilities}

`MINDDY_PUBLIC_SITE_NAME` e `MINDDY_PUBLIC_CONTACT_EMAIL` identificam a instância. `ADMIN_EMAILS` contém administradores separados por vírgulas, também sujeitos a MFA. `OAUTH_ISSUER` normalmente fica vazio, salvo publicação intencional de OAuth em outra origem estável. Desligue IA e cobrança gerenciadas em self-hosted. Cada serviço opcional exige configuração completa. Reinicie ou recrie a aplicação após mudar valores públicos de execução, sem rebuild OCI. doctor distingue capacidades incompletas de falhas do núcleo. Confira links de conta e callbacks na origem correta.

### Configurar feedback e relatos sobre a documentação {#product-feedback}

Defina `MINDDY_FEEDBACK_KEY` com uma chave de integração de feedback para habilitar o envio de feedback no aplicativo. Para relatos sobre a documentação, crie uma integração de feedback separada no projeto que receberá os relatos, selecione Documentation como objetivo padrão e salve a chave em `MINDDY_DOCUMENTATION_FEEDBACK_KEY`. As duas chaves ficam no servidor. Os envios usam `/api/v1/feedback` na origem definida por `MINDDY_PUBLIC_APP_URL`. Reinicie o aplicativo após alterar esses valores.

Para relatar um erro em um artigo, é preciso estar conectado a uma conta. Após entrar, o leitor volta ao mesmo artigo com o diálogo de feedback aberto. O título e a descrição começam vazios. Após o envio, o servidor acrescenta o identificador do artigo, o idioma, a revisão e a URL pública; esses dados não são campos editáveis do formulário. A integração da documentação vincula automaticamente o feedback ao objetivo selecionado. Sem `MINDDY_DOCUMENTATION_FEEDBACK_KEY`, o botão para relatar erros fica desabilitado e apresenta uma explicação.

## Habilitar provedores opcionais deliberadamente {#optional-providers}

O núcleo não exige Stripe, PostHog, uma conta Cloud ou uma chave de IA do minddy. Serviços externos acrescentam custos, permissões e destinos de dados: leia suas condições antes de habilitá-los. A ferramenta de diagnóstico informa valores ausentes sem escolher uma alternativa automaticamente. Uma instância própria pode usar chaves pessoais ou endpoints locais de IA acessíveis. Mantenha `MINDDY_MANAGED_AI` e `MINDDY_MANAGED_BILLING` desativados; uma chave OpenRouter isolada não seleciona a edição Cloud.

![Diagrama: Operador escolhe capacidade opcional. Credenciais completas e condições. Destino externo explícito dos dados. Verificar comportamento e acompanhar custos.](/documentation/pt-BR/optional-providers-flow.svg)

### Configurar provedores completos {#configure}

O email da aplicação exige `EMAIL_PROVIDER=resend`, `RESEND_API_KEY`, `FEEDBACK_EMAIL_FROM` e `INVITATION_EMAIL_FROM`. `console` não é permitido em produção; SMTP Auth é configurado separadamente. Web Push exige o par VAPID e `VAPID_SUBJECT`; as assinaturas dependem desse par. Analytics exige chave e host PostHog; rastreamento de erros exige `MINDDY_PUBLIC_ERROR_TRACKING=1`. O instalador oferece `application-email` e `web-push`, mas o operador precisa fornecer as credenciais externas. Não use remetentes minddy ou credenciais das versões nativas em outras instâncias.

### Conectar Git e execução de código {#git-and-code}

GitHub.com e GitLab.com são suportados; GitHub Enterprise Server e GitLab próprio não são. Conexões de usuários podem usar o relay gerenciado; exclua-o com `--no-forge-relay` ou `MINDDY_FORGE_RELAY=0` e configure suas próprias aplicações. Conexões existentes preservam o canal até reconectar. O Numo não executa código, então o servidor de referência não precisa de runner de código nem de sandbox, e nenhum serviço recebe o socket do Docker. Configurações deixadas por uma release anterior, como `AGENT_EXECUTION_BACKEND`, `AGENT_RUNNER_URL`, `AGENT_RUNNER_SECRET`, `AGENT_CONTROL_ORIGIN` e as credenciais do Vercel Sandbox, são ignoradas; remova-as do ambiente protegido.

## Expor origens e operar tarefas agendadas {#proxy-network-and-jobs}

Um serviço público exige proxy TLS e redirect de HTTP para HTTPS. As origens minddy e Supabase, redirects Auth, callbacks OAuth e cabeçalhos precisam concordar. Não exponha PostgreSQL, Studio ou portas internas. No perfil full, o servidor usa `http://kong:8000` internamente, enquanto navegador e links preservam a origem pública do Supabase. HTTP privado exige `localhost` ou uma rede IPv4 privada confiável, sem encaminhamento de portas do roteador.

![Diagrama: Proxy HTTPS público. Origens app e Supabase públicas. Banco e portas internas privadas. Tarefas autenticadas; paradas em manutenção.](/documentation/pt-BR/proxy-network-and-jobs-flow.svg)

### Fornecer agendamento autenticado {#schedules}

Os perfis Compose de referência iniciam o agendador, e o instalador gera `CRON_SECRET`. Uma implantação personalizada a partir do código precisa fornecer um agendador HTTP equivalente. Cada requisição envia `Authorization: Bearer <CRON_SECRET>`; um valor vazio ou errado retorna 401. Não registre esse cabeçalho. Os horários listados abaixo estão em UTC e pertencem a esta versão. Use as rotas da versão instalada, pois elas podem mudar.


Em relação ao agendador da v0.11.0, esta versão acrescenta `numo-turns`, `forge-relay-maintenance`, `page-materialization` e `issue-index` e não chama mais `/api/cron/agent-drain` nem `/api/cron/automations`, removidos junto com o trabalho de código do Numo e as automações de projeto. Um agendador personalizado copiado da v0.11.0 precisa ser atualizado conforme esta tabela.

| Endpoint | Horário (UTC) |
| --- | --- |
| `/api/cron/feedback-analysis` | `0 * * * *` |
| `/api/cron/numo-turns` | `* * * * *` |
| `/api/cron/forge-relay-deliveries` | `* * * * *` |
| `/api/cron/forge-relay-maintenance` | `35 * * * *` |
| `/api/cron/page-materialization` | `* * * * *` |
| `/api/cron/smart-assign` | `*/5 * * * *` |
| `/api/cron/issue-index` | `25 * * * *` |
| `/api/cron/routines` | `*/5 * * * *` |
| `/api/cron/billing-sync` | `15 * * * *` |
| `/api/cron/fx-rate` | `30 15 * * *` |
| `/api/cron/encryption-maintenance` | `15 * * * *` |
| `/api/cron/data-retention` | `45 3 * * *` |

### Parar tarefas em manutenção {#maintenance}

Antes de backup ou migração, pare agendador, aplicação, workers e API pública. Parar apenas o servidor web ainda permite gravações diretas. Verifique em manutenção com entradas e jobs fechados e reabra somente após conferir banco, Auth, Storage e aplicação. Se um job não iniciar, verifique agendador, origem e segredo em privado. Rotinas exigem o servidor, não um desktop aberto.

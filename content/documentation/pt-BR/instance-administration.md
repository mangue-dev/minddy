---
{
  "id": "instance-administration",
  "locale": "pt-BR",
  "title": "Administração da instância",
  "summary": "Acesse a administração com MFA, use os controles disponíveis e diferencie administração da instância e propriedade do projeto.",
  "topic": "Operar uma instância",
  "type": "guide",
  "audiences": [
    "operator"
  ],
  "workflows": [
    "H16"
  ],
  "visibility": "public",
  "status": "published",
  "revision": 13,
  "sourceRevision": 13,
  "owner": "@mangue-dev",
  "updatedAt": "2026-10-29",
  "compatibility": {
    "version": "0.20.0 (MIN-747 release review); MIN-798 Smart Fill title model; MIN-829 instance administration; MIN-847 instance variables",
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
      "app/(app)/admin/page.tsx",
      "app/(app)/admin/layout.tsx",
      "components/admin/admin-dashboard.tsx",
      "lib/admin-tabs.ts",
      "lib/server/admin.ts",
      "docs/self-hosting-auth.md",
      "lib/ai-model-config.ts",
      "app/api/admin/app-config/route.ts",
      "lib/server/decisions/model-validation.ts",
      "lib/server/issue-relation-inference.ts",
      "lib/server/model-capability-validation.ts",
      "app/api/cron/issue-index/route.ts",
      "lib/server/issue-semantic-search.ts",
      "components/admin/admin-accounts-dashboard.tsx",
      "components/admin/admin-costs-dashboard.tsx",
      "components/admin/admin-models-dashboard.tsx",
      "lib/ai-model-config-file.ts",
      "lib/server/admin-model-config.ts",
      "lib/server/model-config.ts",
      "lib/server/assistant/admin-tools.ts",
      "lib/instance-variables.ts",
      "lib/server/instance-variables.ts",
      "app/api/admin/instance-variables/route.ts",
      "components/admin/admin-instance-dashboard.tsx",
      "components/agent/model-combobox.tsx"
    ]
  },
  "review": {
    "revision": 13,
    "fact": "agent:claude-code (per-task model pickers show the category's model by name instead of Default model when that model is in the catalog, and choosing it makes the task follow the category again; checked against components/agent/model-combobox.tsx and components/admin/admin-models-dashboard.tsx; not checked in the running app; no figure recaptured, the Models figure may show the former picker wording); agent:claude-code (MIN-847 Instance tab section checked against lib/instance-variables.ts, lib/server/instance-variables.ts and app/api/admin/instance-variables/route.ts; figure captured on 2026-10-29 from a disposable local self-hosted instance with its own test administrator, every write blocked, and inspected); agent:claude-code (MIN-829 tabs, accounts, costs, model categories, configuration file and Numo admin tools checked against lib/admin-tabs.ts, lib/ai-model-config.ts, lib/ai-model-config-file.ts, lib/server/admin-model-config.ts, lib/server/finance.ts, lib/admin-costs.ts, lib/server/retention.ts and lib/server/assistant/admin-tools.ts, including admin_get_costs; both figures recaptured on 2026-10-29 with captures/shots/documentation-admin from a local candidate against the preview capture admin, every write blocked, and inspected); agent:claude-code (MIN-798 Smart-fill titles model paragraph checked against lib/ai-model-config.ts, lib/ai-surfaces.ts and lib/server/smart-fill-title.ts: automations group, fallback deepseek/deepseek-v4-flash, not answered by the decision model; no figure changed); agent:/root/min747 (0.20.0 release review: source audit against the v0.11.0..main delta, verified corrections applied; no screenshot in scope; both screenshots recaptured on 2026-10-20 with captures/shots/documentation-admin and the preview-only capture admin (MIN-740); no browser walkthrough of the procedures or operator rehearsal; earlier evidence retained in git history); agent:claude-code (MIN-762 UI label and terminology correction: pt-BR labels aligned on the corrected catalog and the ticket term; no behavior change, no new captures); agent:claude-code (manual figures rebuilt on the Aurora demo, catalog review labels and informal register; figures recaptured on 2026-10-22 from a local candidate against the preview demo account and inspected; no form submitted)",
    "language": "agent:claude-code (pt-BR changed passages with catalog UI labels; self-reviewed; agent review, not human acceptance); agent:claude-code (pt-BR MIN-829 sections with catalog UI labels; self-reviewed; agent review, not human acceptance); agent:claude-code (pt-BR MIN-798 Smart-fill titles model paragraph with catalog UI labels; self-reviewed; agent review, not human acceptance); agent:/root/min747 (pt-BR translation of the release corrections with catalog UI labels; equivalent meaning self-reviewed; agent review, not human acceptance); agent:claude-code (pt-BR MIN-762 terminology edit; self-reviewed; agent review, not human acceptance); agent:claude-code (pt-BR manual figures rebuilt on the Aurora demo, catalog review labels and informal register; self-reviewed; agent review, not human acceptance)",
    "date": "2026-10-29"
  },
  "related": [
    "authentication-and-email",
    "instance-configuration",
    "recommended-models"
  ],
  "aliases": [],
  "tags": [
    "Usar a administração da instância"
  ],
  "figures": [
    {
      "id": "instance-administration-flow",
      "kind": "screenshot",
      "src": "/documentation/pt-BR/instance-administration-overview.png",
      "alt": "Aba Contas com o número de contas e a busca de uma conta pelo e-mail exato.",
      "caption": "Contas mostra o número de contas e a busca de suporte; a captura vem de uma instância de demonstração.",
      "revision": 13,
      "reviewed": true,
      "capturedAt": "2026-10-29",
      "viewport": [
        1488,
        1148
      ],
      "theme": "light",
      "padding": 24,
      "deviceScaleFactor": 2
    },
    {
      "id": "instance-administration-models",
      "kind": "screenshot",
      "src": "/documentation/pt-BR/instance-administration-models.png",
      "alt": "Aba Modelos com um modelo padrão por categoria e os modelos por tarefa recolhidos.",
      "caption": "Modelos mostra um modelo padrão por categoria; os modelos por tarefa ficam recolhidos. Nenhuma configuração de modelo ou provedor foi alterada para esta captura.",
      "revision": 13,
      "reviewed": true,
      "capturedAt": "2026-10-29",
      "viewport": [
        1488,
        1148
      ],
      "theme": "light",
      "padding": 24,
      "deviceScaleFactor": 2
    },
    {
      "id": "instance-administration-instance",
      "kind": "screenshot",
      "src": "/documentation/pt-BR/instance-administration-instance.png",
      "alt": "Aba Instância com a origem de cada variável, uma chave do OpenRouter mascarada definida aqui e os endereços de administradores vindos do arquivo.",
      "caption": "Instância mostra de onde vem cada valor; os segredos mostram só os últimos caracteres. Esta captura vem de uma instância auto-hospedada local descartável.",
      "revision": 13,
      "reviewed": true,
      "capturedAt": "2026-10-29",
      "viewport": [
        1488,
        1148
      ],
      "theme": "light",
      "padding": 24,
      "deviceScaleFactor": 2
    }
  ],
  "requiredFigures": [
    "instance-administration-flow"
  ]
}
---

## Usar a administração da instância {#instance-administration}

Administrar a instância é diferente de ser proprietário de um projeto. `ADMIN_EMAILS` lista as contas confirmadas autorizadas no servidor; `app_metadata.role=admin` assinado também é uma fonte válida. São exigidos `aal2`, MFA verificada e verificações atuais de conta e sessão. Se elas falham, o acesso é negado. Entre, complete TOTP e abra `/admin`. Não altere papéis no banco para contornar MFA. O console e as APIs privadas continuam `noindex`.


![Aba Contas com o número de contas e a busca de uma conta pelo e-mail exato.](/documentation/pt-BR/instance-administration-overview.png)

![Aba Modelos com um modelo padrão por categoria e os modelos por tarefa recolhidos.](/documentation/pt-BR/instance-administration-models.png)

## Usar os controles disponíveis {#panels}

O console tem três abas: **Contas**, **Custos**, **Modelos** e, onde for permitido, **Instância**. **Custos** fica oculta sem uma capacidade gerenciada do OpenRouter vinculada. Links para as antigas abas Visão geral, Usuários e Finanças abrem **Contas** ou **Custos**. Oferecer um plano depende de uma cobrança configurada ou de uma substituição existente. Uma instância auto-hospedada sem provedores comerciais não ganha a cobrança Cloud ao abrir o console. As mudanças administrativas afetam a instância inteira, não um projeto; verifique-as com contas de demonstração.

## Atender uma conta {#accounts}

**Contas** mostra quantas contas a instância tem. Abaixo, encontre uma conta apenas pelo endereço de e-mail exato com **Buscar conta**. Abra-a para ver o status de confirmação do e-mail, conferir ou **Redefinir** o orçamento de uso de IA, ou **Oferecer um plano** na condição acima. A aba não mostra atividade, cadastros, onboarding, número de projetos nem conteúdo pessoal; abra uma conta apenas para uma tarefa de suporte ou cobrança.

## Acompanhar os custos da instância {#costs}

**Custos** mostra quanto os provedores de IA custam à instância, em dólares, como eles cobram, e se atualiza sozinha enquanto fica aberta. Escolha o período no menu no canto superior direito do painel e restrinja tudo com o botão **Filtros** ao lado, por recurso, modelo ou chave usada (a chave da instância ou as chaves pessoais dos membros). Seguem quatro números, cada um com sua tendência e sua variação em relação ao período anterior: gasto total, requisições, tokens e custo por milhão de tokens. Depois vêm os recursos e os modelos mais caros, em seguida o gasto por dia por modelo e por família de recursos, as requisições por dia por modelo e as execuções recentes, que se abrem nas suas chamadas. Receitas, assinaturas e margens não são mostradas: a cobrança do Stripe é gerenciada no Stripe. Chaves do OpenRouter por conta que nenhuma conta usa mais são excluídas toda noite.

## Escolher os modelos por categoria {#models}

Cada cartão de **Modelos** tem um **Modelo padrão** para sua categoria: **Assistente** (Numo, títulos de conversa, busca na web), **Automações** (Smart Fill e seus títulos, Smart Assign, decisões de relação, mapeamento de importações CSV, divisão de resumos, mensagens de commit ao mesclar), **Embeddings** (embeddings de tickets e de feedback) e **Feedback e site público** (análise de feedback, caixa de perguntas da FAQ). Uma tarefa segue o modelo padrão da sua categoria até você dar a ela um modelo próprio em **Modelos por tarefa**; para que ela volte a seguir a categoria, escolha no seletor o modelo da categoria, mostrado pelo próprio nome e marcado enquanto a tarefa o segue. **Modelo padrão** só continua como opção quando esse modelo não está no catálogo. Enquanto o modelo padrão de uma categoria não está definido, cada tarefa mantém seu próprio padrão integrado. **Nível de raciocínio**, **Modelo de decisão** e as duas configurações de **Voz** têm linhas próprias. Definir o modelo padrão de uma categoria libera as tarefas que ainda têm o padrão integrado, como as que uma instância nova recebe; uma tarefa configurada com outro modelo o mantém. **Modelos recomendados** define a lista curta com que cada seletor de modelo abre. **Chaves pessoais** fica recolhida no fim: só diz respeito a membros que usam a própria chave do provedor.

## Exportar e importar a configuração de modelos {#models-file}

No canto superior direito do painel **Modelos**, **Exportar** baixa a configuração de modelos em um arquivo JSON versionado (formato `minddy.instance-models`): modelos padrão das categorias, modelos das tarefas, atalhos de roteamento, nível de raciocínio, modelos recomendados e padrões de provedor para chaves pessoais. Ele não contém chaves de API nem contas. **Importar** lê um arquivo assim e lista cada mudança antes de gravar qualquer coisa; **Aplicar** grava todas, ou nenhuma quando um valor é recusado, por exemplo um modelo que não é um modelo de decisão. Uma importação substitui a configuração: as configurações que o arquivo não inclui voltam ao padrão. Um arquivo de uma versão anterior do minddy é atualizado para o formato atual; um arquivo de uma versão mais recente é recusado até a instância ser atualizada. Entradas que esta versão não conhece são listadas e ignoradas.

## Administrar a instância com o Numo {#numo}

Em uma conversa do Numo iniciada a partir de uma sessão de administrador, o Numo pode ler os custos de IA da instância, com os mesmos números e filtros de **Custos**, ler e alterar a configuração de modelos, pré-visualizar e aplicar uma importação, inclusive de um arquivo de configuração anexado à conversa, encontrar uma conta pelo endereço de e-mail exato, ler o plano e o orçamento de uso de IA dela, e oferecer ou retirar um plano. A sessão de administrador é verificada de novo antes de cada uma dessas ações, e o Numo pede que você confirme cada mudança antes de fazê-la. Essas ferramentas não retornam atividade, projetos nem conteúdo de outra conta. Menções ao @Numo, rotinas e a ajuda pública da documentação nunca as recebem.

## Editar as variáveis da instância {#instance-variables}

Em uma instância auto-hospedada cujo arquivo de ambiente define `MINDDY_CONFIG_OVERRIDES=1`, a aba **Instância** altera algumas das variáveis sem editar o arquivo: a chave do OpenRouter, os endereços dos administradores, o provedor e os remetentes de e-mail, seus próprios apps do GitHub e do GitLab, a análise, o nome e o endereço de contato da instância e a publicação da configuração de modelos. O guia de instalação pergunta se isso deve ser permitido, e o app para desktop ativa para a instância que ele instala no seu computador. Só o arquivo ativa ou desativa; o Minddy Cloud nunca oferece.

![Aba Instância com a origem de cada variável, uma chave do OpenRouter mascarada definida aqui e os endereços de administradores vindos do arquivo.](/documentation/pt-BR/instance-administration-instance.png)

O campo de busca acima da lista encontra uma variável pelo nome, pelo rótulo ou pela descrição. Um valor salvo na aba substitui o do arquivo, e **Remover** traz de volta o valor do arquivo. Cada variável mostra de onde vem o valor; os segredos mostram só os últimos caracteres. A maioria das mudanças vale em até um minuto; a aba indica as que valem depois que a instância reinicia, e o app para desktop oferece então **Reiniciar agora**. O acesso ao banco de dados, as chaves de criptografia, o endereço do app e os valores fixados no build só podem ser definidos no arquivo, então um valor errado na aba nunca bloqueia você: remova-o, ou defina `MINDDY_CONFIG_OVERRIDES=0` no arquivo para voltar aos valores dele.

Salvar um segredo ou os endereços dos administradores pede o seu código de dois fatores se você não o digitou nos últimos minutos, e você não pode remover o seu próprio endereço. Cada mudança aparece na caixa de entrada dos outros administradores, inclusive os definidos por função, e por e-mail para todos os administradores, você incluído, quando a instância envia e-mails. Salvar um valor sem mudança não registra nada. Cada variável guarda as últimas versões, com quem a alterou e quando; **Restaurar** traz uma de volta. Os valores ficam no banco de dados, criptografados quando a criptografia do espaço de trabalho está ativada.

## Escolher o modelo de decisão de IA {#decision-model}

Em **Modelos**, seção **Automações**, **Modelo de decisão** define o único modelo de decisão que responde a todas as decisões de IA da instância: Smart Fill, Smart Assign e a revisão de feedback. Não há escolha por projeto, por usuário ou por recurso. O seletor só lista modelos do OpenRouter que publicam a capacidade de decisão; modelos de chat, embedding e transcrição nunca aparecem. Ao salvar, o candidato é testado com uma decisão representativa. Um modelo que não é de decisão, recusa a solicitação, devolve uma resposta inválida ou leva mais de 5 segundos é recusado, e o modelo atual continua em uso. Quando o catálogo não pode ser carregado, toda alteração é recusada. Instâncias auto-hospedadas sem IA gerenciada não têm catálogo da plataforma e mantêm o padrão, Jev.

Novas decisões usam o modelo salvo em cerca de um minuto em cada processo do servidor. Quando o modelo falha ou responde abaixo do limite de confiança, a decisão recorre ao modelo LLM próprio do recurso, como antes. O limite foi calibrado no Jev e outros modelos de decisão distribuem a confiança de outra forma: após uma troca, confira a concordância por modelo na visão de banco de dados `ai_decision_evaluations_weekly`. As linhas de uso registram o modelo que respondeu.

**Títulos do preenchimento inteligente**, em **Modelos**, seção **Automações**, **Modelos por tarefa**, escolhe o modelo que escreve o título de um ticket criado sem título e o reescreve em uma reavaliação. É uma tarefa de redação, não uma decisão: o modelo de decisão nunca a responde. O padrão é `deepseek/deepseek-v4-flash`; alguém está esperando o ticket, então escolha um modelo rápido.

## Configurar as relações do Smart Fill {#smart-fill-relations}

Depois que um ticket é salvo, o Smart Fill pode indexá-lo e vinculá-lo a tickets relacionados. Dois campos em **Modelos** controlam esse trabalho:

- **Embeddings de tickets**, na seção **Embeddings**, **Modelos por tarefa**, escolhe o modelo que transforma o título e a descrição dos tickets em vetores. O padrão é `openai/text-embedding-3-small`. Trocá-lo inicia uma nova versão do índice: vetores antigos e novos nunca são comparados. A tarefa de hora em hora `/api/cron/issue-index` indexa então os tickets existentes, 100 por execução, cobrando o proprietário de cada projeto; ela nunca cria relações. O mesmo modelo transforma em vetor cada consulta da busca pelo sentido, com as configurações do provedor de IA do membro que busca, e as consultas só são comparadas com vetores da versão atual do índice. Até que um ticket seja indexado de novo, a busca de tickets relacionados e a busca pelo sentido só o encontram pelas palavras. A mesma tarefa converte em vetores criptografados os salvos sem criptografia assim que o projeto deles passa a criptografar.
- **Modelo de decisão de relações**, na seção **Automações**, **Modelos por tarefa**, é o modelo LLM de reserva que responde às decisões de relação quando o [modelo de decisão](#decision-model) falha ou não tem certeza, como o modelo LLM próprio de cada recurso. O padrão é `deepseek/deepseek-v4-flash`.

Os campos de embedding e de transcrição recusam ao salvar um modelo da família errada, por exemplo um modelo de chat em um campo de embeddings, e o modelo atual continua em uso. Essa verificação precisa do catálogo da plataforma: quando ele não pode ser carregado, como em uma instância auto-hospedada sem IA gerenciada, a escolha não pode ser verificada e é aceita. Para membros que executam automações com a própria chave, os padrões por provedor incluem `issue_embedding_model`: `text-embedding-3-small` para OpenAI e `gemini-embedding-001` para Google.

## Manter responsabilidades operacionais {#responsibilities}

Privilégios mínimos, recuperação MFA, segredos, backup, retenção, incidentes e custos continuam sob sua responsabilidade. O console não substitui a restauração de banco e Storage nem a configuração SMTP. Se o acesso for recusado, confira email confirmado, allowlist, MFA e sessão antes de mudar a configuração. Uma sessão revogada ou conta bloqueada não conserva privilégios por ainda ter um JWT válido. Evite capturas com dados privados de outras pessoas, fatores MFA ou detalhes financeiros.

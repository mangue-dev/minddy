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
  "revision": 19,
  "sourceRevision": 19,
  "owner": "@mangue-dev",
  "updatedAt": "2026-11-13",
  "compatibility": {
    "version": "0.30.0 (MIN-794 release review)",
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
      "components/agent/model-combobox.tsx",
      "lib/server/assistant/conversation-config.ts",
      "lib/decision-engine.ts",
      "lib/server/decisions/engine.ts"
    ]
  },
  "review": {
    "revision": 19,
    "fact": "agent:claude-code (Aligned quoted UI labels with the MIN-885 copy audit, checked against messages/*.json; not checked in the running app; rest of the article unchanged since the previous review; no figure recaptured); agent:claude-code (0.30.0 release review, MIN-794: its evidence changes in the v0.20.0..0.30.0 delta were documented by the pull requests that made them; the article was updated by pull requests in that delta; not re-audited line by line; 2 screenshot(s) recaptured on 2026-11-04 from a local candidate against the preview demo account and inspected, 1 kept with their earlier capture; no browser walkthrough of the procedures); agent:claude-code (MIN-928: event screening added to the Assistant category of Models, checked against lib/ai-model-config.ts; rest of the article unchanged since the previous review; no figure recaptured); agent:claude-code (MIN-929: Background turns per day added to the Assistant card of Models, checked against lib/ai-model-config.ts and lib/ai-model-config-file.ts; rest of the article unchanged since the previous review; no figure recaptured); agent:claude-code (MIN-930: home summary added to the Assistant category of Models, checked against lib/ai-model-config.ts); agent:claude-code (MIN-954: sentence on Numo's model on minddy Cloud in #models, source audit against lib/server/assistant/conversation-config.ts; no browser walkthrough; no figure shows this flow; existing figures kept, not recaptured); agent:claude-code (MIN-954 model roles: #models, #models-file, #decision-model and #smart-fill-relations rewritten for one model per role, source audit against lib/ai-model-config.ts, lib/ai-model-config-file.ts, lib/server/admin-model-config.ts and components/admin/admin-models-dashboard.tsx; no browser walkthrough; the instance-administration-models screenshot still shows the former category cards and needs a recapture); agent:claude-code (MIN-954: recommended models and routing shortcuts removed from #models and #models-file, checked against components/admin/admin-models-dashboard.tsx and lib/ai-model-config-file.ts); agent:claude-code (MIN-980: decision engine switch in #decision-model, per-member decision model and the models file's decision engine in #models-file, source audit against lib/ai-model-config.ts, lib/ai-model-config-file.ts, lib/server/admin-model-config.ts and components/admin/admin-models-dashboard.tsx; no browser walkthrough; the instance-administration-models screenshot does not show the new switch and was not recaptured)",
    "language": "agent:claude-code (pt-BR changed passages with catalog UI labels; self-reviewed; agent review, not human acceptance); agent:claude-code (pt-BR MIN-928 passage with catalog UI labels; self-reviewed; agent review, not human acceptance); agent:claude-code (pt-BR MIN-929 passage translated from en with catalog UI labels; self-reviewed; agent review, not human acceptance); agent:claude-code (pt-BR MIN-954 passage with catalog UI labels; self-reviewed; agent review, not human acceptance); agent:claude-code (pt-BR MIN-954 model-role passages with catalog UI labels; self-reviewed; agent review, not human acceptance); agent:claude-code (pt-BR MIN-980 decision passages with catalog UI labels; self-reviewed; agent review, not human acceptance)",
    "date": "2026-11-13"
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
      "revision": 19,
      "reviewed": true,
      "capturedAt": "2026-11-04",
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
      "revision": 19,
      "reviewed": true,
      "capturedAt": "2026-11-04",
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
      "revision": 19,
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

**Custos** mostra quanto os provedores de IA custam à instância, em dólares, como eles cobram, e se atualiza sozinha enquanto fica aberta. Escolha o período no menu no canto superior direito do painel e restrinja tudo com o botão **Filtros** ao lado, por recurso ou modelo. Chamadas feitas com as chaves pessoais dos membros nunca são registradas, então não aparecem aqui. Seguem quatro números, cada um com sua tendência e sua variação em relação ao período anterior: gasto total, requisições, tokens e custo por milhão de tokens. Depois vêm os recursos e os modelos mais caros, em seguida o gasto por dia por modelo e por família de recursos, as requisições por dia por modelo e as execuções recentes, que se abrem nas suas chamadas. Receitas, assinaturas e margens não são mostradas: a cobrança do Stripe é gerenciada no Stripe. Chaves do OpenRouter por conta que nenhuma conta usa mais são excluídas toda noite.

## Escolher os modelos {#models}

**Modelos** tem um cartão por tipo de modelo, e cada tipo usa um único modelo para toda a instância. **Modelo de linguagem** define o modelo que o Numo e todas as tarefas de texto usam: títulos de conversa, busca na web, análise de eventos, resumo da página inicial, Smart Fill e seus títulos, Smart Assign, decisões de relação, mapeamento de importações CSV, divisão de briefs, mensagens de commit de merge, limpeza de ditados, revisão de feedback e a caixa de perguntas do FAQ. O mesmo cartão contém o **Nível de raciocínio** do Numo e **Turnos em segundo plano por dia**, que limita os turnos que o [Numo em segundo plano](/docs/numo#background) faz para um membro em 24 horas: 20 quando vazio, 0 para desativar o Numo em segundo plano para todos; o arquivo de modelos não o inclui nem o redefine. **Embeddings** define o único modelo de embeddings para tickets e feedbacks, **Voz** o modelo de fala para texto e **Decisões** o [modelo de decisão](#decision-model). Nenhuma tarefa tem modelo próprio. Uma instância que tinha definido um modelo padrão de categoria numa versão anterior continua a usá-lo: o cartão o mostra, e salvar o cartão o substitui. **Chaves pessoais** fica recolhido no fim: para cada provedor, contém o modelo que a chave de um membro usa para cada tipo quando o membro não escolheu nenhum.

No minddy Cloud, o Numo de cada membro usa o modelo e o **Nível de raciocínio** do cartão **Modelo de linguagem**, que os membros não podem mudar. Só uma chave pessoal dá a um membro a escolha do modelo de linguagem, que então atende o Numo e todas as tarefas de texto desse membro.

## Exportar e importar a configuração de modelos {#models-file}

No canto superior direito do painel **Modelos**, **Exportar** baixa a configuração de modelos como um arquivo JSON versionado (formato `minddy.instance-models`): o modelo de cada tipo, o nível de raciocínio, o mecanismo das decisões e os modelos padrão das chaves pessoais. Ele não contém chave de API nem conta. **Importar** lê um arquivo assim e lista cada mudança antes de gravar qualquer coisa; **Aplicar** grava todas, ou nenhuma quando um valor é recusado, por exemplo um modelo que não é de decisão. Uma importação substitui a configuração: os ajustes que o arquivo omite voltam ao padrão. Um arquivo de uma versão anterior do minddy é atualizado para o formato atual: os modelos padrão das categorias Assistente e Embeddings preenchem o modelo de linguagem e o de embeddings, e os modelos por tarefa, atalhos de roteamento e modelos recomendados são listados e ignorados. Um arquivo de uma versão mais nova é recusado até a instância ser atualizada.

## Administrar a instância com o Numo {#numo}

Em uma conversa do Numo iniciada a partir de uma sessão de administrador, o Numo pode ler os custos de IA da instância, com os mesmos números e filtros de **Custos**, ler e alterar a configuração de modelos, pré-visualizar e aplicar uma importação, inclusive de um arquivo de configuração anexado à conversa, encontrar uma conta pelo endereço de e-mail exato, ler o plano e o orçamento de uso de IA dela, e oferecer ou retirar um plano. A sessão de administrador é verificada de novo antes de cada uma dessas ações, e o Numo pede que você confirme cada mudança antes de fazê-la. Essas ferramentas não retornam atividade, projetos nem conteúdo de outra conta. O [Numo em segundo plano](/docs/numo#background) também as recebe enquanto sua conta for de administrador com a autenticação de dois fatores ativada: ele lê por conta própria a configuração de modelos e os custos, e qualquer outra ação precisa de uma das suas lembranças, que substitui a sua confirmação. Menções ao @Numo, rotinas e a ajuda pública da documentação nunca as recebem.

## Editar as variáveis da instância {#instance-variables}

Em uma instância auto-hospedada cujo arquivo de ambiente define `MINDDY_CONFIG_OVERRIDES=1`, a aba **Instância** altera algumas das variáveis sem editar o arquivo: a chave do OpenRouter, os endereços dos administradores, o provedor e os remetentes de e-mail, seus próprios apps do GitHub e do GitLab, a análise, o nome e o endereço de contato da instância e a publicação da configuração de modelos. O guia de instalação pergunta se isso deve ser permitido, e o app para desktop ativa para a instância que ele instala no seu computador. Só o arquivo ativa ou desativa; o minddy Cloud nunca oferece.

![Aba Instância com a origem de cada variável, uma chave do OpenRouter mascarada definida aqui e os endereços de administradores vindos do arquivo.](/documentation/pt-BR/instance-administration-instance.png)

O campo de busca acima da lista encontra uma variável pelo nome, pelo rótulo ou pela descrição. Um valor salvo na aba substitui o do arquivo, e **Remover** traz de volta o valor do arquivo. Cada variável mostra de onde vem o valor; os segredos mostram só os últimos caracteres. A maioria das mudanças vale em até um minuto; a aba indica as que valem depois que a instância reinicia, e o app para desktop oferece então **Reiniciar agora**. O acesso ao banco de dados, as chaves de criptografia, o endereço do app e os valores fixados no build só podem ser definidos no arquivo, então um valor errado na aba nunca bloqueia você: remova-o, ou defina `MINDDY_CONFIG_OVERRIDES=0` no arquivo para voltar aos valores dele.

Salvar um segredo ou os endereços dos administradores pede o seu código de dois fatores se você não o digitou nos últimos minutos, e você não pode remover o seu próprio endereço. Cada mudança aparece na caixa de entrada dos outros administradores, inclusive os definidos por função, e por e-mail para todos os administradores, você incluído, quando a instância envia e-mails. Salvar um valor sem mudança não registra nada. Cada variável guarda as últimas versões, com quem a alterou e quando; **Restaurar** traz uma de volta. Os valores ficam no banco de dados, criptografados quando a criptografia do espaço de trabalho está ativada.

## Escolher o modelo de decisão de IA {#decision-model}

Em **Modelos**, **Decisões**, **Modelo de decisão** define o único modelo de decisão que responde a todas as decisões de IA da instância: Smart Fill, Smart Assign, decisões de relação, análise de eventos e revisão de feedback. Não há escolha por projeto ou recurso; um membro pode escolher outro modelo de decisão para a própria chave do OpenRouter nos ajustes de IA. O seletor lista só modelos do OpenRouter que publicam a capacidade de decisão; modelos de chat, embeddings e transcrição nunca aparecem. Ao salvar, o candidato é testado com uma decisão representativa. Um modelo que não é de decisão, recusa a solicitação, devolve uma resposta inválida ou leva mais de 5 segundos é recusado, e o modelo atual continua em uso. Quando o catálogo não pode ser carregado, toda mudança é recusada. Instâncias auto-hospedadas sem IA gerenciada não têm catálogo da plataforma e mantêm o padrão, Jev.

**Usar um modelo de linguagem para as decisões**, no mesmo cartão, envia cada decisão ao **Modelo de linguagem** e oculta **Modelo de decisão**. É o padrão de cada membro, que pode escolher outra opção nos [ajustes de IA](/docs/ai-settings-and-usage#ai-keys-and-models). Ative quando sua instância não tiver nenhum modelo de decisão disponível, por exemplo uma instância auto-hospedada sem IA gerenciada cujos membros usam as próprias chaves.

Novas decisões usam o modelo salvo em cerca de um minuto em cada processo do servidor. Quando o modelo falha ou responde abaixo do limite de confiança, a decisão recorre ao modelo de linguagem. O limite foi calibrado no Jev e outros modelos de decisão distribuem a confiança de outro jeito, então confira a concordância por modelo na view `ai_decision_evaluations_weekly` do banco após uma mudança. As linhas de uso registram o modelo que respondeu.

## Configurar as relações do Smart Fill {#smart-fill-relations}

Depois que um ticket é salvo, o Smart Fill pode indexá-lo e ligá-lo a tickets relacionados. **Modelo de embeddings**, em **Modelos**, **Embeddings**, transforma título e descrição dos tickets, e os feedbacks, em vetores. O padrão é `openai/text-embedding-3-small`. Trocá-lo inicia uma nova versão do índice: vetores antigos e novos nunca são comparados. O job horário `/api/cron/issue-index` então indexa os tickets existentes, 100 por execução, e cobra o proprietário de cada projeto; ele nunca cria relações. O mesmo modelo transforma cada consulta da busca pelo sentido em vetor, com os ajustes de provedor de IA do membro que busca, e as consultas só são comparadas com vetores da versão atual do índice. Até um ticket ser indexado de novo, a busca de tickets relacionados e a busca pelo sentido só o encontram pelas palavras. O mesmo job criptografa os vetores guardados em claro assim que o projeto deles é criptografado. As decisões de relação usam o [modelo de decisão](#decision-model) e recorrem ao modelo de linguagem quando ele falha ou fica em dúvida.

Os campos de embedding e de transcrição recusam ao salvar um modelo da família errada, por exemplo um modelo de chat em um campo de embeddings, e o modelo atual continua em uso. Essa verificação precisa do catálogo da plataforma: quando ele não pode ser carregado, como em uma instância auto-hospedada sem IA gerenciada, a escolha não pode ser verificada e é aceita. Para membros que executam automações com a própria chave, os padrões por provedor incluem `issue_embedding_model`: `text-embedding-3-small` para OpenAI e `gemini-embedding-001` para Google.

## Manter responsabilidades operacionais {#responsibilities}

Privilégios mínimos, recuperação MFA, segredos, backup, retenção, incidentes e custos continuam sob sua responsabilidade. O console não substitui a restauração de banco e Storage nem a configuração SMTP. Se o acesso for recusado, confira email confirmado, allowlist, MFA e sessão antes de mudar a configuração. Uma sessão revogada ou conta bloqueada não conserva privilégios por ainda ter um JWT válido. Evite capturas com dados privados de outras pessoas, fatores MFA ou detalhes financeiros.

---
{
  "id": "ai-settings-and-usage",
  "locale": "pt-BR",
  "title": "Configurações e uso de IA",
  "summary": "Configure suas chaves pessoais de IA e os modelos padrão e entenda os limites dos planos Cloud e a contabilização do uso.",
  "topic": "Conta e aplicativos",
  "type": "guide",
  "audiences": [
    "member"
  ],
  "workflows": [
    "A04",
    "A08",
    "A10"
  ],
  "visibility": "public",
  "status": "published",
  "revision": 7,
  "sourceRevision": 7,
  "owner": "@mangue-dev",
  "updatedAt": "2026-10-09",
  "compatibility": {
    "version": "0.11.1 candidate (cd1843e12)",
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
      "content/knowledge/plans-and-billing.md",
      "components/settings/account-ai-keys-section.tsx",
      "components/settings/account-sandbox-section.tsx",
      "content/documentation/reviews/remaining-account-capture-candidates.json",
      "lib/server/agent/model.ts",
      "lib/server/ai-runtime.ts",
      "lib/server/agent/quota.ts",
      "lib/server/usage.ts",
      "lib/server/agent/execute.ts",
      "app/(app)/billing/page.tsx",
      "app/(marketing)/pricing/page.tsx",
      "lib/billing-plans.ts",
      "content/documentation/reviews/visual-refresh-captures-2026-10-09.json",
      "components/ai-elements/dictate-button.tsx",
      "app/api/transcribe/route.ts",
      "lib/use-issue-dictation.ts",
      "components/issue-side-panel.tsx",
      "lib/use-objective-dictation.ts",
      "lib/use-feedback-dictation.ts",
      "components/issue-timeline.tsx",
      "components/assistant/chat-input.tsx",
      "components/routines/routine-prompt-field.tsx",
      "content/documentation/reviews/pr397-review-fixes-2026-10-09.md"
    ]
  },
  "review": {
    "revision": 7,
    "fact": "agent:/root consolidation review; agent:/root/italian_portuguese_review retained-meaning comparison with prior procedural evidence (no operational rerun); agent:/root (visual usefulness, figure framing and preserved procedures; previous operational evidence retained); agent:/root (PR #397 source review of voice/export additions; existing procedures and figures retained, no operational rerun)",
    "language": "agent:/root/italian_portuguese_review (localized feature scope, summaries and heading review; retained source procedures); agent:/root/editorial_it_pt (editorial clarity pass); agent:/root (figure removals and captions); agent:/root (PR #397 localized additions and equivalent meaning review; no independent or human review claimed)",
    "date": "2026-10-09"
  },
  "related": [
    "scheduled-routines"
  ],
  "aliases": [
    "ai-keys-and-models",
    "plans-and-ai-usage",
    "plans-and-billing"
  ],
  "tags": [
    "Configurar chaves pessoais de IA e modelos",
    "Entender os planos Cloud e o consumo de IA",
    "Entender planos Cloud e consumo de IA"
  ],
  "figures": [
    {
      "id": "ai-keys-and-models-workflow",
      "kind": "screenshot",
      "src": "/documentation/pt-BR/ai-keys-and-models-workflow.png",
      "alt": "Cartão do provedor de IA com minddy Cloud selecionado.",
      "caption": "O provedor Cloud selecionado usa o plano da conta. O seletor permite configurar provedores pessoais.",
      "revision": 7,
      "reviewed": true,
      "capturedAt": "2026-10-09",
      "viewport": [
        816,
        212
      ],
      "theme": "light",
      "padding": 24,
      "deviceScaleFactor": 2
    },
    {
      "id": "ai-keys-and-models-defaults-workflow",
      "kind": "screenshot",
      "src": "/documentation/pt-BR/ai-keys-and-models-defaults-workflow.png",
      "alt": "Modelo de código e raciocínio padrão.",
      "caption": "Modelo de código e raciocínio padrão. Novos workers usam esses valores; os que estão em execução mantêm as configurações fixadas.",
      "revision": 7,
      "reviewed": true,
      "capturedAt": "2026-10-09",
      "viewport": [
        816,
        217
      ],
      "theme": "light",
      "padding": 24,
      "deviceScaleFactor": 2
    },
    {
      "id": "plans-and-ai-usage-workflow",
      "kind": "screenshot",
      "src": "/documentation/pt-BR/plans-and-ai-usage-workflow.png",
      "alt": "Página de uso de IA da conta de demonstração.",
      "caption": "Página de uso de IA da conta de demonstração. O orçamento, as categorias e o histórico são lidos da conta; nenhuma compra ou execução paga foi iniciada.",
      "revision": 7,
      "reviewed": true,
      "capturedAt": "2026-10-09",
      "viewport": [
        1154,
        1016
      ],
      "theme": "light",
      "padding": 24,
      "deviceScaleFactor": 2
    }
  ],
  "requiredFigures": [
    "ai-keys-and-models-workflow",
    "ai-keys-and-models-defaults-workflow",
    "plans-and-ai-usage-workflow"
  ]
}
---

As configurações de IA da conta definem chaves pessoais, escopos e modelos padrão. Confira o roteamento dos modelos antes de iniciar o trabalho. No Cloud, use a área de faturamento para distinguir uso incluído, chamadas com chaves pessoais, processamento na sandbox e limites de rotinas. Em instâncias auto-hospedadas, disponibilidade e custos dependem da configuração da instância.

## Configurar chaves pessoais de IA e modelos {#ai-keys-and-models}

Abra as configurações de IA da conta, adicione um provedor compatível e informe a chave e a URL de base, quando exigida. Salve e confira o estado de confirmação. Nas chamadas de IA com alternativa gerenciada disponível, uma chave não confirmada ou inacessível mantém o consumo no minddy. Isso exige IA gerenciada configurada; os workers de código seguem as regras de modelo vinculado ao provedor descritas abaixo. Nunca cole a chave em uma conversa ou captura de tela.

Associe as famílias de modelos de texto, transcrição e embeddings a chaves compatíveis ou mantenha-as no minddy. Para cada chave, escolha os usos habilitados: conversas do Numo, trabalho de código, automações, voz e feedback. Um uso ou uma família sem associação utilizável continua consumindo a cota do minddy. O provedor cobra as chamadas feitas com a chave dele. O processamento da sandbox no servidor continua tendo um custo real e é registrado no uso. Esse registro é separado da aplicação de um limite da conta: um worker com BYOK validado não está sujeito à cota do plano nem ao limite de processamento, enquanto o trabalho financiado pelo minddy continua sujeito à franquia incluída.

![Cartão do provedor de IA com minddy Cloud selecionado.](/documentation/pt-BR/ai-keys-and-models-workflow.png)

### Modelos e local de execução {#models}

A escolha do modelo de código está vinculada ao provedor. Depois de alterar, desativar ou perder uma chave pessoal, a escolha anterior pode deixar de corresponder ao provedor ativo. Nesse caso, um novo worker recusa o início até que você escolha um modelo compatível nas configurações de IA da conta; ele não seleciona automaticamente um modelo mais barato nem um padrão da plataforma. Uma execução BYOK já fixada não muda quem paga quando sua chave fica indisponível.

Defina aqui o modelo de código e o nível de raciocínio padrão dos novos workers. Os workers existentes mantêm o nível de raciocínio fixado quando foram criados. Escolha separadamente a região e o tamanho das novas sandboxes. Esses padrões não substituem o modelo selecionado em uma conversa.

Quando configurados, o Ollama local e endpoints compatíveis com OpenAI podem atender às conversas pela ponte do aplicativo desktop. Eles não podem atender ao trabalho delegado de código nem às rotinas executadas na sandbox do servidor. Para esses usos, escolha um provedor acessível pelo servidor. Remova um provedor pelo controle de confirmação quando ele não for mais necessário e confira o roteamento resultante antes da próxima execução.

![Modelo de código e raciocínio padrão.](/documentation/pt-BR/ai-keys-and-models-defaults-workflow.png)

## Entender os planos Cloud e o consumo de IA {#plans-and-ai-usage}

O Cloud oferece os planos Free, Go e Pro. Todos incluem MCP, conversas do Numo, ações contextuais, trabalho de código e rotinas. A capacidade, o uso de IA incluído, os modelos e o armazenamento variam. Abra Cobrança para consultar seu saldo e consumo atuais e compare a página pública de preços antes de escolher um plano; os valores publicados ali são a referência atual.

Use a opção de contratação ou de gerenciamento de assinatura oferecida à sua conta. Confira o valor, o período de cobrança e a confirmação do provedor antes de aceitar. Uma mudança de plano bem-sucedida deve aparecer na cobrança da conta; verifique esse estado, em vez de tratar o fechamento da janela de pagamento como uma prova.

### Consumo do orçamento {#consumption}

O uso de IA incluído cobre raciocínio, chamadas às ferramentas do minddy, automações, chamadas ao modelo do worker e processamento da sandbox no servidor. O limite mensal de IA incluída se aplica ao trabalho financiado pelo minddy. O teto por execução de uma rotina é um limite separado que pode pausar essa execução; o trabalho concluído continua na conversa. Esses limites não autorizam cobranças automáticas por excedentes. Confira o cartão de limite e a data de redefinição do orçamento quando estiver disponível.

As chaves pessoais compatíveis fazem o provedor cobrar as chamadas aos modelos, em vez de consumir o uso de IA incluído. Um worker que usa uma chave BYOK validada não está sujeito à cota do plano nem ao limite de processamento da conta. O processamento da sandbox continua tendo um custo real e é registrado no uso; esse registro não significa que o limite mensal do plano se aplique a essa execução BYOK. Famílias ou usos não associados cujas chamadas são financiadas pelo minddy continuam sujeitos à sua franquia minddy. O self-hosting tem custos de infraestrutura e de provedores opcionais definidos pela instalação; executar o mesmo núcleo não o transforma em uma assinatura Cloud.

### Capacidades da versão candidata {#plan-capacities}

Estes padrões descrevem a versão candidata 0.11.1 identificada. Confira a página de preços e a conta reais antes de comprar: os preços configurados no pagamento e as exceções da conta podem ser diferentes. A contagem de convidados exclui o proprietário do projeto. O armazenamento é contabilizado para o proprietário do projeto que recebe os arquivos.

| Plano | Projetos | Tarefas por projeto | Convidados por projeto | Armazenamento | IA mensal incluída (USD) |
| --- | --- | --- | --- | --- | --- |
| Free | 2 | 300 | 3 | 1 GiB | 0.50 |
| Go | Ilimitados | Ilimitadas | Ilimitados | 20 GiB | 5 |
| Pro | Ilimitados | Ilimitadas | Ilimitados | 100 GiB | 15 |

![Página de uso de IA da conta de demonstração.](/documentation/pt-BR/plans-and-ai-usage-workflow.png)

## Ditar texto e alterações {#voice-dictation}

Use o microfone ao lado de um campo compatível para ditar uma issue, um objetivo, um comentário, uma mensagem do Numo, um feedback ou uma instrução de rotina. Você precisa de permissão para escrever ali, um microfone funcionando e um navegador compatível com gravação. Permita o acesso ao microfone para o site no navegador e no sistema operacional. Use HTTPS para uma instância remota. No Cloud, deve haver orçamento de IA disponível; instâncias self-hosted também precisam de provedores de transcrição e ditado funcionando. As chaves pessoais de voz e os modelos são configurados [acima](#ai-keys-and-models).

1. Abra o formulário ou a issue desejada e selecione seu microfone. Em uma issue aberta, Command+Shift+D no macOS ou Ctrl+Shift+D nos outros sistemas inicia ou encerra a edição por voz. Verifique se o cronômetro e a forma de onda aparecem.
2. Fale no idioma da interface, que orienta a transcrição. Para editar uma issue, indique a alteração com clareza, por exemplo “Defina a prioridade como alta”. Pare a gravação pelo controle quadrado e espere a transcrição e o processamento do Numo terminarem antes de fechar o formulário.
3. Confira o resultado. Mensagens do Numo, comentários e instruções de rotina recebem texto editável; revise antes de enviar ou salvar. Formulários de criação recebem campos de rascunho que ainda precisam de confirmação. A edição por voz de uma issue existente aplica as alterações imediatamente: confira os campos depois e corrija erros pelos controles habituais. O ditado não concede permissões adicionais.

### Consumo e limites de gravação {#voice-limits}

O áudio é enviado ao serviço de transcrição configurado e depois pode ser revisado ou interpretado por um modelo de IA. O consumo segue as regras do provedor e do orçamento da conta; a gravação e sua interpretação podem gerar consumos separados. O feedback público tem regras próprias de disponibilidade e cobrança, descritas no [guia de feedback](/docs/feedback). A demonstração da página inicial tem um limite separado e não representa uma cota de ditado da conta.

O serviço de transcrição para usuários conectados aceita até 10 MiB de áudio e 30 solicitações por conta por hora. O gravador compartilhado para após 20 minutos como precaução. Prefira gravações curtas para conferir cada resultado. Mantenha o texto existente até verificá-lo; o gravador não é um backup de áudio.

### Retomar após uma falha {#voice-recovery}

Se o acesso for negado, habilite o microfone para o site e para o navegador ou app desktop no sistema operacional. Se nenhum dispositivo for encontrado, conecte ou selecione um microfone; se estiver ocupado, feche o aplicativo que o utiliza. Se a gravação não for compatível, use um navegador compatível ou digite o texto.

Em caso de silêncio ou resultado vazio, confira o dispositivo de entrada e faça uma gravação curta e audível. Divida gravações grandes demais. A mensagem de limite de solicitações informa quanto esperar; aguarde antes de tentar novamente. Para falhas de orçamento ou provedor, confira o consumo de IA, as atribuições de voz e a configuração da instância. Se a revisão falhar, mas a transcrição for devolvida, revise e edite esse texto. Antes de repetir uma edição que falhou, confira os campos atuais para evitar aplicar a mesma alteração duas vezes.

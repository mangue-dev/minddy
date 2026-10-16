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
  "revision": 16,
  "sourceRevision": 16,
  "owner": "@mangue-dev",
  "updatedAt": "2026-10-16",
  "compatibility": {
    "version": "0.11.1 candidate; multi-provider settings and persistent personal Numo defaults; MIN-721 removal of code agents, sandboxes and code-work usage",
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
      "content/documentation/reviews/remaining-account-capture-candidates.json",
      "lib/server/agent/model.ts",
      "lib/server/ai-runtime.ts",
      "lib/server/usage.ts",
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
      "content/documentation/reviews/pr397-review-fixes-2026-10-09.md",
      "content/documentation/reviews/min-676-private-native-preview-2026-10-10.md",
      "content/documentation/reviews/min-676-native-worker-selection-2026-10-10.md",
      "content/documentation/reviews/min-676-native-identity-2026-10-10.md",
      "content/documentation/reviews/min-676-account-ai-organization-2026-10-10.md",
      "content/documentation/reviews/min-676-model-controls-2026-10-10.md",
      "content/documentation/reviews/min-676-review-fixes-2026-10-11.md",
      "content/documentation/reviews/min-676-provider-numo-defaults-2026-10-11.md",
      "content/documentation/reviews/min-676-native-login-wizard-2026-10-11.md",
      "lib/ai-surfaces.ts",
      "components/billing/usage-segment-ui.tsx",
      "content/documentation/reviews/min-721-code-work-removal-2026-10-16.md"
    ]
  },
  "review": {
    "revision": 16,
    "fact": "agent:/root consolidation review; agent:/root/italian_portuguese_review retained-meaning comparison with prior procedural evidence (no operational rerun); agent:/root (visual usefulness, figure framing and preserved procedures; previous operational evidence retained); agent:/root (PR #397 source review of voice/export additions; existing procedures and figures retained, no operational rerun); agent:/root/native_hosting_terms (private preview controls and limitations source/UI-test review; prior procedures retained, no native operational run); agent:/root/native_hosting_terms (private worker selection controls and fail-closed recovery source/UI-test review; no paid Claude execution or new provider rehearsal claimed); agent:/root/native_identity_docs (frozen identity and proactive context source review; prior operational evidence retained, no new provider execution); agent:/root (account organization and official hosted-auth restriction source review; no provider rerun); agent:/root (native model controls and frozen launch source review; live auth outcomes recorded separately); agent:/root (experimental Claude and explicit cold continuation source and fixture review; no live provider execution); agent:/root (provider routing, persistent Numo defaults and local Docker UI review; no provider inference); agent:/root (guided connection source, behavior fixtures and local visual review; no live provider authentication); agent:/root/min721_docs (MIN-721 source review inherited from en revision 16; pt-BR translation of removal edits; no operational rerun)",
    "language": "agent:/root/italian_portuguese_review (localized feature scope, summaries and heading review; retained source procedures); agent:/root/editorial_it_pt (editorial clarity pass); agent:/root (figure removals and captions); agent:/root (PR #397 localized additions and equivalent meaning review; no independent or human review claimed); agent:/root/native_hosting_terms (localized private preview additions and equivalent meaning; agent review, no human acceptance claimed); agent:/root/native_hosting_terms (localized worker selection additions and equivalent meaning; agent review, no human acceptance claimed); agent:/root/native_identity_docs (localized additions and complete equivalent meaning; agent review, no human acceptance claimed); agent:/root (complete six-locale meaning review; agent review, not human acceptance); agent:/root (six-locale model-control meaning review; not human acceptance); agent:/root (six-locale experimental and reconnect additions; agent review, not human acceptance); agent:/root (complete six-locale defaults and routing meaning review; no human acceptance); agent:/root (six-locale wizard procedure equivalence; no human acceptance); agent:/root/min721_pt-BR (pt-BR translation of MIN-721 removal edits, equivalent meaning reviewed; agent review, not human acceptance)",
    "date": "2026-10-16"
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
      "kind": "diagram",
      "src": "/documentation/pt-BR/ai-providers-and-numo-defaults-flow.svg",
      "alt": "Conexões, atribuição por capacidade e modelo pessoal do Numo são ajustes separados.",
      "caption": "Vários provedores podem continuar conectados. A atribuição escolhe por capacidade; o padrão do Numo é salvo por conta e provedor.",
      "revision": 16,
      "reviewed": true,
      "capturedAt": "2026-10-11",
      "viewport": [
        816,
        390
      ],
      "theme": "neutral",
      "diagram": {
        "layout": "sequence",
        "title": "Provedores e modelo do Numo",
        "items": [
          {
            "title": "Provedores conectados",
            "detail": "Mantenha vários provedores API conectados; adicionar um preserva os demais."
          },
          {
            "title": "Provedor por capacidade",
            "detail": "Atribua texto, transcrição e embeddings separadamente e ative os usos necessários."
          },
          {
            "title": "Modelo padrão do Numo",
            "detail": "Siga o padrão do app ou salve seu modelo. A escolha de uma conversa tem prioridade."
          }
        ]
      }
    }
  ],
  "requiredFigures": [
    "ai-keys-and-models-workflow"
  ]
}
---

As configurações de IA da conta definem chaves pessoais, escopos e modelos padrão. Confira o roteamento dos modelos antes de iniciar o trabalho. No Cloud, use a área de faturamento para distinguir uso incluído, chamadas com chaves pessoais e limites de rotinas. Em instâncias auto-hospedadas, disponibilidade e custos dependem da configuração da instância.

A seção **IA do Minddy** das configurações de IA da conta configura os provedores de API usados pelas conversas do Numo, rotinas, automações, voz e feedback. Os agentes de código que você mesmo executa, conectados pelo MCP do minddy, usam a própria assinatura ou conta de API e não consomem o uso de IA do Minddy.

## Configurar chaves pessoais de IA e modelos {#ai-keys-and-models}

Nos ajustes de IA da conta, **Provedor de IA** seleciona o provedor de modelos de texto entre o Minddy Cloud e seus provedores compatíveis conectados. **Provedores conectados** mostra a lista completa. Escolha **Adicionar provedor**, selecione-o, informe sua chave API e a URL base quando necessária e salve. Você pode conectar vários provedores; adicionar ou selecionar um não remove os demais. Nunca cole uma chave em uma conversa ou captura de tela.

Atribua texto, transcrição e embeddings separadamente. Cada família usa um provedor por vez. Os controles de uso de cada provedor determinam se Numo, automações, voz e feedback usam essa chave ou a cota Minddy. Por exemplo, você pode manter o texto no OpenRouter e a transcrição no OpenAI. Selecionar um provedor de texto não reativa um uso do Numo anteriormente desativado.

Em **Modelo padrão do Numo**, escolha **Padrão do app** ou um modelo específico do provedor ativo do Numo. A escolha é salva para sua conta e separadamente para cada provedor, após recarregar e em novas sessões. O padrão do app segue o modelo configurado pela aplicação para esse provedor. Um modelo escolhido explicitamente numa conversa tem prioridade; conversas que seguem seu padrão recebem mudanças posteriores da conta. Turnos já admitidos mantêm seu modelo fixado. Um modelo indisponível ou acima dos limites do seu plano é recusado: escolha outro ou o padrão do app. A exportação e importação da conta incluem essas preferências, sem credenciais dos provedores.

Uma chave não confirmada ou inacessível pode manter as chamadas gerais de IA compatíveis na cota Minddy quando a IA gerenciada está configurada. Seu provedor cobra as chamadas feitas com a chave dele. Chaves pessoais validadas e trabalho financiado pelo Minddy seguem as [regras de orçamento abaixo](#consumption).

![Conexões, atribuição por capacidade e modelo pessoal do Numo são ajustes separados.](/documentation/pt-BR/ai-providers-and-numo-defaults-flow.svg)

### Modelos locais {#models}

Quando configurados, o Ollama local e endpoints compatíveis com OpenAI podem atender às conversas pela ponte do aplicativo desktop. As rotinas são executadas no servidor e não conseguem acessar um modelo no seu computador. Para elas, escolha um provedor acessível pelo servidor. Remova um provedor pelo controle de confirmação quando ele não for mais necessário e confira o roteamento resultante antes da próxima execução.


## Entender os planos Cloud e o consumo de IA {#plans-and-ai-usage}

O Cloud oferece os planos Free, Go e Pro. Todos incluem MCP, conversas do Numo, ações contextuais e rotinas. A capacidade, o uso de IA incluído, os modelos e o armazenamento variam. Abra Cobrança para consultar seu saldo e consumo atuais e compare a página pública de preços antes de escolher um plano; os valores publicados ali são a referência atual.

Use a opção de contratação ou de gerenciamento de assinatura oferecida à sua conta. Confira o valor, o período de cobrança e a confirmação do provedor antes de aceitar. Uma mudança de plano bem-sucedida deve aparecer na cobrança da conta; verifique esse estado, em vez de tratar o fechamento da janela de pagamento como uma prova.

### Consumo do orçamento {#consumption}

O uso de IA incluído cobre o raciocínio e as chamadas de ferramentas do Numo, rotinas, automações, ditado de voz e processamento de feedback. O limite mensal de IA incluída se aplica ao trabalho financiado pelo minddy. O teto por execução de uma rotina é um limite separado que pode pausar essa execução; o trabalho concluído continua na conversa. Esses limites não autorizam cobranças automáticas por excedentes. Confira o cartão de limite e a data de redefinição do orçamento quando estiver disponível.

As chaves pessoais compatíveis fazem o provedor cobrar as chamadas aos modelos, em vez de consumir o uso de IA incluído. Famílias ou usos não associados cujas chamadas são financiadas pelo minddy continuam sujeitos à sua franquia minddy. O self-hosting tem custos de infraestrutura e de provedores opcionais definidos pela instalação; executar o mesmo núcleo não o transforma em uma assinatura Cloud.

### Capacidades da versão candidata {#plan-capacities}

Estes padrões descrevem a versão candidata 0.11.1 identificada. Confira a página de preços e a conta reais antes de comprar: os preços configurados no pagamento e as exceções da conta podem ser diferentes. A contagem de convidados exclui o proprietário do projeto. O armazenamento é contabilizado para o proprietário do projeto que recebe os arquivos.

| Plano | Projetos | Tarefas por projeto | Convidados por projeto | Armazenamento | IA mensal incluída (USD) |
| --- | --- | --- | --- | --- | --- |
| Free | 2 | 300 | 3 | 1 GiB | 0.50 |
| Go | Ilimitados | Ilimitadas | Ilimitados | 20 GiB | 5 |
| Pro | Ilimitados | Ilimitadas | Ilimitados | 100 GiB | 15 |

A Cobrança mostra o orçamento de IA restante e sua próxima redefinição, **Evolução do orçamento** e **O que consome seu orçamento?**, que divide o consumo entre **Rotinas**, **Numo**, **Ditado de voz**, **Feedback** e **Automações** como percentual do orçamento incluído. **Histórico de uso** lista as ações do período atual e sua parcela do orçamento.

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
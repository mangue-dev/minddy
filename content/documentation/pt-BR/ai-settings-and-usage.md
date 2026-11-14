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
  "revision": 28,
  "sourceRevision": 27,
  "owner": "@mangue-dev",
  "updatedAt": "2026-11-13",
  "compatibility": {
    "version": "0.30.0 (MIN-794 release review)",
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
      "lib/server/agent/model.ts",
      "lib/server/ai-runtime.ts",
      "lib/server/usage.ts",
      "app/(app)/billing/page.tsx",
      "app/(marketing)/pricing/page.tsx",
      "lib/billing-plans.ts",
      "components/ai-elements/dictate-button.tsx",
      "components/ai-elements/dictation-pill.tsx",
      "components/ai-elements/use-dictation-recorder.ts",
      "components/settings/account-preferences-section.tsx",
      "components/settings/dictation-vocabulary-section.tsx",
      "lib/dictation-vocabulary.ts",
      "lib/dictation-hallucinations.ts",
      "app/api/transcribe/route.ts",
      "lib/use-issue-dictation.ts",
      "components/issue-side-panel.tsx",
      "lib/use-objective-dictation.ts",
      "lib/use-feedback-dictation.ts",
      "components/issue-timeline.tsx",
      "components/assistant/chat-input.tsx",
      "components/routines/routine-prompt-field.tsx",
      "lib/ai-surfaces.ts",
      "components/billing/usage-segment-ui.tsx",
      "docs/security/project-roles.md",
      "lib/project-roles.ts",
      "components/agent/model-combobox.tsx",
      "lib/server/assistant/model-preferences.ts",
      "app/api/account/numo-preferences/route.ts",
      "lib/server/ai-routes.ts",
      "lib/server/decisions/engine.ts",
      "app/api/account/ai-decisions/route.ts",
      "lib/decision-engine.ts"
    ]
  },
  "review": {
    "revision": 28,
    "fact": "agent:claude-code (Aligned quoted UI labels with the MIN-885 copy audit, checked against messages/*.json; not checked in the running app; rest of the article unchanged since the previous review; no figure recaptured); agent:claude-code (0.30.0 release review, MIN-794: its evidence changes in the v0.20.0..0.30.0 delta were documented by the pull requests that made them; the article was updated by pull requests in that delta; not re-audited line by line; 0 screenshot(s) recaptured on 2026-11-04 from a local candidate against the preview demo account and inspected; no browser walkthrough of the procedures); agent:claude-code (MIN-946: Billing usage paragraph (budget forecast, Daily usage chart, hover values, Numo's warning), source audit against the change; no browser walkthrough; no figure shows this flow; existing figures kept, not recaptured); agent:claude-code (MIN-954: Numo Conversations paragraph and the ai-keys-and-models-workflow diagram's third step and caption, source audit against lib/server/assistant/model-preferences.ts, app/api/account/numo-preferences/route.ts and components/settings/account-ai-keys-section.tsx; diagram SVG fallback updated in every locale; no browser walkthrough); agent:claude-code (MIN-954 model roles: usages and language-model paragraphs of #ai-keys-and-models and the ai-keys-and-models-workflow diagram, source audit against components/settings/account-ai-keys-section.tsx, lib/server/ai-routes.ts and lib/server/ai-runtime.ts; diagram SVG fallback updated in every locale; no browser walkthrough); agent:claude-code (MIN-980: Decisions paragraph of #ai-keys-and-models, source audit against components/settings/account-ai-keys-section.tsx, lib/server/decisions/engine.ts and app/api/account/ai-decisions/route.ts; no browser walkthrough; no figure shows this row; existing figures kept, not recaptured); agent:claude-code (MIN-979: one sentence in #ai-keys-and-models on model lists limited to callable models and the save-time check of a key's embedding and speech-to-text models, source audit against lib/server/agent/models-catalog.ts, lib/byok-model-catalog.ts and app/api/account/ai-keys/route.ts; no browser walkthrough; no figure shows this; existing figures kept, not recaptured)",
    "language": "agent:claude-code (pt-BR changed passages with catalog UI labels; self-reviewed; agent review, not human acceptance); agent:claude-code (pt-BR MIN-946 passage translated from en with catalog UI labels and the locale register; self-reviewed; agent review, not human acceptance); agent:claude-code (pt-BR MIN-954 passage with catalog UI labels; self-reviewed; agent review, not human acceptance); agent:claude-code (pt-BR MIN-954 model-role passages with catalog UI labels; self-reviewed; agent review, not human acceptance); agent:claude-code (pt-BR MIN-980 decision passages with catalog UI labels; self-reviewed; agent review, not human acceptance)",
    "date": "2026-11-13"
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
      "alt": "Provedores conectados, um provedor por tipo de modelo e o modelo de linguagem são ajustes separados.",
      "caption": "Cada tipo de modelo passa pelo minddy Cloud ou por um provedor conectado. No minddy Cloud, a instância define o modelo de linguagem; com uma chave pessoal, o modelo dele é salvo por provedor e uma conversa pode escolher o seu.",
      "revision": 28,
      "reviewed": true,
      "capturedAt": "2026-10-28",
      "viewport": [
        816,
        390
      ],
      "theme": "neutral",
      "diagram": {
        "layout": "sequence",
        "title": "Provedores, usos e Numo",
        "items": [
          {
            "title": "Provedores conectados",
            "detail": "O minddy Cloud e suas chaves de API ficam disponíveis lado a lado."
          },
          {
            "title": "Um provedor por tipo de modelo",
            "detail": "Modelo de linguagem, embeddings e voz para texto escolhem cada um o seu."
          },
          {
            "title": "Provedor e modelo do Numo",
            "detail": "O minddy Cloud usa o modelo da instância. Uma chave pessoal escolhe o seu."
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

A seção **IA do minddy** das configurações de IA da conta configura os provedores de API usados pelas conversas do Numo, rotinas, automações, voz e feedback. Os agentes de código que você mesmo executa, conectados pelo MCP do minddy, usam a própria assinatura ou conta de API e não consomem o uso de IA do minddy.

## Configurar chaves pessoais de IA e modelos {#ai-keys-and-models}

Nos ajustes de IA da conta, **Provedores conectados** lista o minddy Cloud, incluído no seu plano, e os provedores de API que você conectou. Escolha **Adicionar provedor**, selecione um provedor, informe a chave de API e a URL base, se exigida, e salve. Você pode conectar vários provedores; adicionar um não remove os outros nem muda o que seus usos utilizam. Nunca cole uma chave em uma conversa ou captura de tela.

Abaixo, **Modelos** escolhe um provedor para cada tipo de modelo: **Modelo de linguagem** para o Numo e todos os recursos de IA que leem ou escrevem texto, **Embeddings** para a busca pelo sentido e os tickets e feedbacks relacionados, e **Voz para texto** para o ditado. Cada um escolhe o minddy Cloud ou um provedor conectado capaz de atendê-lo: embeddings e voz para texto exigem um provedor com esses modelos. Nenhum recurso tem provedor ou modelo próprios; a busca na web, que exige o minddy Cloud ou uma chave OpenRouter, fica no minddy Cloud quando o seu modelo de linguagem usa outro provedor. Quando **Embeddings** ou **Voz para texto** usa uma das suas chaves, o modelo dele aparece sob o provedor: mantenha o modelo pré-selecionado do provedor ou escolha outro. As listas mostram só os modelos que o minddy consegue chamar nesse provedor, e um modelo de outro tipo é recusado ao salvar. As escolhas valem na hora. Numa instância sem minddy Cloud, um provedor recém-conectado atende cada tipo que ainda não tem nenhum.

Para **Modelo de linguagem**, escolha o provedor. No **minddy Cloud**, ele usa o modelo e o nível de raciocínio definidos pela administração da instância, então nem esta linha nem uma conversa oferecem um modelo. Com uma das suas chaves, escolha um modelo desse provedor: o Numo e todos os recursos de texto o usam. O seletor mostra o modelo padrão do app pelo próprio nome, marcado enquanto você o segue; escolhê-lo mantém sua configuração seguindo o padrão do app, então mudanças posteriores nesse padrão continuam valendo. **Padrão do app** só aparece como opção quando esse modelo não está no catálogo. Esse padrão é salvo para a sua conta e separadamente para cada provedor, entre recarregamentos e novas sessões. Em uma conversa, a lista de modelos ao lado do microfone abre nos provedores quando há vários disponíveis; escolha um para ver os modelos dele. A conversa mantém esse provedor e esse modelo, e as conversas que seguem o seu padrão recebem as mudanças posteriores da conta. Turnos já admitidos mantêm o provedor e o modelo fixados. Um modelo salvo que fica indisponível é recusado: escolha outro modelo ou o modelo padrão do app. Se o provedor de uma conversa for removido, o Numo pede que você escolha outro em vez de trocar por conta própria. A exportação e a importação da conta incluem essas preferências de modelo, sem as credenciais dos provedores.

**Decisões** escolhe o que responde ao Smart Fill, ao Smart Assign, às relações, à análise de eventos e à revisão de feedback. A primeira lista escolhe o tipo de modelo: **Modelo de decisão**, que recorre ao modelo de linguagem quando está em dúvida, ou **Modelo de linguagem**. O tipo usado pela instância aparece como padrão; escolhê-lo volta a seguir o administrador. A segunda lista escolhe o provedor: um modelo de decisão precisa do minddy Cloud ou de uma chave do OpenRouter, o único provedor com modelos de decisão, enquanto um modelo de linguagem aceita qualquer provedor conectado que sirva texto. A lista só oferece os provedores que podem responder e vira texto simples quando só um pode. Enquanto você não escolher, as decisões usam o provedor do seu modelo de linguagem se ele puder respondê-las e, se não, o minddy Cloud. Em uma das suas chaves, uma terceira lista escolhe o modelo dela: um dos modelos de decisão dela ou qualquer modelo de linguagem. Mudar o tipo ou o provedor volta o modelo ao padrão do provedor.

Uma chave não confirmada ou inacessível pode manter as chamadas gerais de IA compatíveis na cota minddy quando a IA gerenciada está configurada. Seu provedor cobra as chamadas feitas com a chave dele, e o minddy não as registra. Chaves pessoais validadas e trabalho financiado pelo minddy seguem as [regras de orçamento abaixo](#consumption).

![Provedores conectados, um provedor por tipo de modelo e o modelo de linguagem são ajustes separados.](/documentation/pt-BR/ai-providers-and-numo-defaults-flow.svg)

### Modelos locais {#models}

O minddy chama os modelos de IA pelo servidor, então não consegue usar um modelo executado no seu computador. **Adicionar provedor** não oferece Ollama local nem endpoints locais compatíveis com OpenAI. Um endpoint local salvo em uma versão anterior continua aparecendo em **Provedores conectados**, mas não atende às conversas do Numo, às rotinas nem a outros recursos. Remova-o e atribua no lugar um provedor acessível pelo servidor. Remova um provedor pelo controle de confirmação quando ele não for mais necessário e confira o roteamento resultante antes da próxima execução.


## Entender os planos Cloud e o consumo de IA {#plans-and-ai-usage}

O Cloud oferece os planos Grátis, Go e Pro. Todos incluem MCP, conversas do Numo, ações contextuais e rotinas. A capacidade, o uso de IA incluído, os modelos e o armazenamento variam. Abra Uso e faturamento para consultar seu saldo e consumo atuais e compare a página pública de preços antes de escolher um plano; os valores publicados ali são a referência atual.

Use a opção de contratação ou de gerenciamento de assinatura oferecida à sua conta. Confira o valor, o período de cobrança e a confirmação do provedor antes de aceitar. Uma mudança de plano bem-sucedida deve aparecer na cobrança da conta; verifique esse estado, em vez de tratar o fechamento da janela de pagamento como uma prova.

### Consumo do orçamento {#consumption}

O uso de IA incluído cobre o raciocínio e as chamadas de ferramentas do Numo, rotinas, automações, ditado de voz e processamento de feedback. O limite mensal de IA incluída se aplica ao trabalho financiado pelo minddy. O teto por execução de uma rotina é um limite separado que pode pausar essa execução; o trabalho concluído continua na conversa. Esses limites não autorizam cobranças automáticas por excedentes. Confira o cartão de limite e a data de redefinição do orçamento quando estiver disponível.

As chaves pessoais compatíveis fazem o provedor cobrar as chamadas aos modelos, em vez de consumir o uso de IA incluído. Famílias ou usos não associados cujas chamadas são financiadas pelo minddy continuam sujeitos à sua franquia minddy. O self-hosting tem custos de infraestrutura e de provedores opcionais definidos pela instalação; executar o mesmo núcleo não o transforma em uma assinatura Cloud.

### Capacidades dos planos {#plan-capacities}

Estes padrões descrevem o minddy 0.20.0. Confira a página de preços e a conta reais antes de comprar: os preços configurados no pagamento e as exceções da conta podem ser diferentes. A contagem de convidados exclui o proprietário do projeto e inclui membros, leitores e convites pendentes; não há cobrança por assento. O armazenamento é contabilizado para o proprietário do projeto que recebe os arquivos. Quando a propriedade é transferida, esses limites, o armazenamento e a IA em segundo plano, como o Smart Assign e a análise de feedback, passam a usar o plano do novo proprietário.

| Plano | Projetos | Tickets por projeto | Convidados por projeto | Armazenamento | IA mensal incluída (USD) |
| --- | --- | --- | --- | --- | --- |
| Grátis | 2 | 300 | 3 | 1 GiB | 0.50 |
| Go | Ilimitados | Ilimitadas | Ilimitados | 20 GiB | 5 |
| Pro | Ilimitados | Ilimitadas | Ilimitados | 100 GiB | 15 |

Uso e faturamento mostra o orçamento de IA restante e sua próxima redefinição. **Evolução do orçamento** traça o que você já consumiu em linha contínua e, tracejado, aonde o ritmo atual leva até a renovação; a frase abaixo do título diz se você está no caminho certo ou em que dia o orçamento vai acabar. **O que consome seu orçamento?**, que divide o consumo entre **Rotinas**, **Numo**, **Ditado por voz**, **Feedback** e **Automações** como percentual do orçamento incluído. **Uso por dia** mostra o que cada dia consumiu, por tipo de uso; passe o cursor sobre um gráfico para ler os valores de um dia. **Histórico de uso** lista as ações do período atual e sua parcela do orçamento. O Numo lê os mesmos números e a mesma previsão quando você pergunta sobre seu orçamento, e avisa você na **Página inicial** quando o orçamento está a caminho de acabar antes da renovação.

## Ditar texto e alterações {#voice-dictation}

Use o microfone ao lado de um campo compatível para ditar um ticket, um objetivo, um comentário, uma mensagem do Numo, um feedback ou uma instrução de rotina. Você precisa de permissão para escrever ali, um microfone funcionando e um navegador compatível com gravação. Permita o acesso ao microfone para o site no navegador e no sistema operacional. Use HTTPS para uma instância remota. No Cloud, deve haver orçamento de IA disponível; instâncias self-hosted também precisam de provedores de transcrição e ditado funcionando. As chaves pessoais de voz e os modelos são configurados [acima](#ai-keys-and-models).

1. Abra o formulário ou o ticket desejado e selecione seu microfone. Em um ticket aberto, Command+Shift+D no macOS ou Ctrl+Shift+D nos outros sistemas inicia ou encerra a edição por voz. Uma barra de ditado se abre na parte inferior da tela, como painel em um celular, com o cronômetro e uma onda que acompanha sua voz. O restante da interface aguarda o fim da gravação.
2. Fale no idioma da interface, que orienta a transcrição. Para editar um ticket, indique a alteração com clareza, por exemplo “Defina a prioridade como alta”. Escolha **Transcrever** (✓), pressione Command+Enter no macOS ou Ctrl+Enter nos outros sistemas (Enter também funciona) ou repita o atalho e espere a transcrição e o processamento do Numo terminarem. Para descartar a gravação, escolha **Descartar gravação** (✕) ou pressione Esc e depois **Descartar**: nada é enviado.
3. Confira o resultado. Mensagens do Numo, comentários e instruções de rotina recebem texto editável; revise antes de enviar ou salvar. Formulários de criação recebem campos de rascunho que ainda precisam de confirmação. No formulário de novo ticket com o Smart Fill ativado, o ditado deixa para o Smart Fill o título (quando o Smart Fill o escreve), a prioridade, o esforço, as categorias e o objetivo, a menos que você peça uma dessas propriedades, por exemplo “coloque o esforço em M”. A edição por voz de um ticket existente aplica as alterações imediatamente: confira os campos depois e corrija erros pelos controles habituais. O ditado não concede permissões adicionais.

### Consumo e limites de gravação {#voice-limits}

O áudio é enviado ao serviço de transcrição configurado e depois pode ser revisado ou interpretado por um modelo de IA. A limpeza corrige pontuação, vícios de linguagem e autocorreções; para inserir as palavras exatamente como foram ouvidas, desative **Limpar ditados** em **Configurações da conta** > **Preferências** > **Ditado por voz**, e nenhum modelo de limpeza é chamado para seus ditados. Com ou sem limpeza, o minddy remove as frases que os modelos de transcrição inventam diante do silêncio, como créditos de legendas ou um “Obrigado por assistir” no final. O feedback público mantém seu próprio processamento. Em **Vocabulário**, logo abaixo, adicione até 50 nomes e termos que o ditado deve escrever do seu jeito; preencha **Ouvido como** para substituir essa palavra em todo ditado, mesmo sem limpeza. O consumo segue as regras do provedor e do orçamento da conta; a gravação e sua interpretação podem gerar consumos separados. O feedback público tem regras próprias de disponibilidade e cobrança, descritas no [guia de feedback](/docs/feedback). A demonstração da página inicial tem um limite separado e não representa uma cota de ditado da conta.

O serviço de transcrição para usuários conectados aceita até 10 MiB de áudio e 30 solicitações por conta por hora. O gravador compartilhado para após 20 minutos como precaução. Prefira gravações curtas para conferir cada resultado. Mantenha o texto existente até verificá-lo; o gravador não é um backup de áudio.

### Retomar após uma falha {#voice-recovery}

Se o acesso for negado, habilite o microfone para o site e para o navegador ou app desktop no sistema operacional. Se nenhum dispositivo for encontrado, conecte ou selecione um microfone; se estiver ocupado, feche o aplicativo que o utiliza. Se a gravação não for compatível, use um navegador compatível ou digite o texto.

Em caso de silêncio ou resultado vazio, confira o dispositivo de entrada e faça uma gravação curta e audível. Divida gravações grandes demais. A mensagem de limite de solicitações informa quanto esperar; aguarde antes de tentar novamente. Para falhas de orçamento ou provedor, confira o consumo de IA, as atribuições de voz e a configuração da instância. Se a revisão falhar, mas a transcrição for devolvida, revise e edite esse texto. Antes de repetir uma edição que falhou, confira os campos atuais para evitar aplicar a mesma alteração duas vezes.
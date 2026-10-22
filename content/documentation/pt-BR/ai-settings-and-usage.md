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
  "revision": 19,
  "sourceRevision": 19,
  "owner": "@mangue-dev",
  "updatedAt": "2026-10-22",
  "compatibility": {
    "version": "0.20.0 (MIN-747 release review)",
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
      "lib/project-roles.ts"
    ]
  },
  "review": {
    "revision": 19,
    "fact": "agent:claude/min773 (dictation pill, discard confirmation and cleanup preference checked against the changed source and the running app; earlier evidence retained in git history)",
    "language": "agent:claude/min773 (pt-BR translation of the MIN-773 passages with catalog UI labels; equivalent meaning self-reviewed; agent review, not human acceptance)",
    "date": "2026-10-22"
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
      "revision": 19,
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

O Minddy chama os modelos de IA pelo servidor, então não consegue usar um modelo executado no seu computador. **Adicionar provedor** não oferece Ollama local nem endpoints locais compatíveis com OpenAI. Um endpoint local salvo em uma versão anterior continua aparecendo em **Provedores conectados**, mas não atende às conversas do Numo, às rotinas nem a outros recursos. Remova-o e atribua no lugar um provedor acessível pelo servidor. Remova um provedor pelo controle de confirmação quando ele não for mais necessário e confira o roteamento resultante antes da próxima execução.


## Entender os planos Cloud e o consumo de IA {#plans-and-ai-usage}

O Cloud oferece os planos Free, Go e Pro. Todos incluem MCP, conversas do Numo, ações contextuais e rotinas. A capacidade, o uso de IA incluído, os modelos e o armazenamento variam. Abra Cobrança para consultar seu saldo e consumo atuais e compare a página pública de preços antes de escolher um plano; os valores publicados ali são a referência atual.

Use a opção de contratação ou de gerenciamento de assinatura oferecida à sua conta. Confira o valor, o período de cobrança e a confirmação do provedor antes de aceitar. Uma mudança de plano bem-sucedida deve aparecer na cobrança da conta; verifique esse estado, em vez de tratar o fechamento da janela de pagamento como uma prova.

### Consumo do orçamento {#consumption}

O uso de IA incluído cobre o raciocínio e as chamadas de ferramentas do Numo, rotinas, automações, ditado de voz e processamento de feedback. O limite mensal de IA incluída se aplica ao trabalho financiado pelo minddy. O teto por execução de uma rotina é um limite separado que pode pausar essa execução; o trabalho concluído continua na conversa. Esses limites não autorizam cobranças automáticas por excedentes. Confira o cartão de limite e a data de redefinição do orçamento quando estiver disponível.

As chaves pessoais compatíveis fazem o provedor cobrar as chamadas aos modelos, em vez de consumir o uso de IA incluído. Famílias ou usos não associados cujas chamadas são financiadas pelo minddy continuam sujeitos à sua franquia minddy. O self-hosting tem custos de infraestrutura e de provedores opcionais definidos pela instalação; executar o mesmo núcleo não o transforma em uma assinatura Cloud.

### Capacidades dos planos {#plan-capacities}

Estes padrões descrevem o Minddy 0.20.0. Confira a página de preços e a conta reais antes de comprar: os preços configurados no pagamento e as exceções da conta podem ser diferentes. A contagem de convidados exclui o proprietário do projeto e inclui membros, leitores e convites pendentes; não há cobrança por assento. O armazenamento é contabilizado para o proprietário do projeto que recebe os arquivos. Quando a propriedade é transferida, esses limites, o armazenamento e a IA em segundo plano, como o Smart Assign e a análise de feedback, passam a usar o plano do novo proprietário.

| Plano | Projetos | Tarefas por projeto | Convidados por projeto | Armazenamento | IA mensal incluída (USD) |
| --- | --- | --- | --- | --- | --- |
| Free | 2 | 300 | 3 | 1 GiB | 0.50 |
| Go | Ilimitados | Ilimitadas | Ilimitados | 20 GiB | 5 |
| Pro | Ilimitados | Ilimitadas | Ilimitados | 100 GiB | 15 |

A Cobrança mostra o orçamento de IA restante e sua próxima redefinição, **Evolução do orçamento** e **O que consome seu orçamento?**, que divide o consumo entre **Rotinas**, **Numo**, **Ditado de voz**, **Feedback** e **Automações** como percentual do orçamento incluído. **Histórico de uso** lista as ações do período atual e sua parcela do orçamento.

## Ditar texto e alterações {#voice-dictation}

Use o microfone ao lado de um campo compatível para ditar uma issue, um objetivo, um comentário, uma mensagem do Numo, um feedback ou uma instrução de rotina. Você precisa de permissão para escrever ali, um microfone funcionando e um navegador compatível com gravação. Permita o acesso ao microfone para o site no navegador e no sistema operacional. Use HTTPS para uma instância remota. No Cloud, deve haver orçamento de IA disponível; instâncias self-hosted também precisam de provedores de transcrição e ditado funcionando. As chaves pessoais de voz e os modelos são configurados [acima](#ai-keys-and-models).

1. Abra o formulário ou a issue desejada e selecione seu microfone. Em uma issue aberta, Command+Shift+D no macOS ou Ctrl+Shift+D nos outros sistemas inicia ou encerra a edição por voz. Uma barra de ditado se abre na parte inferior da tela, como painel em um celular, com o cronômetro e uma onda que acompanha sua voz. O restante da interface aguarda o fim da gravação.
2. Fale no idioma da interface, que orienta a transcrição. Para editar uma issue, indique a alteração com clareza, por exemplo “Defina a prioridade como alta”. Escolha **Transcrever** (✓), pressione Command+Enter no macOS ou Ctrl+Enter nos outros sistemas (Enter também funciona) ou repita o atalho e espere a transcrição e o processamento do Numo terminarem. Para descartar a gravação, escolha **Descartar gravação** (✕) ou pressione Esc e depois **Descartar**: nada é enviado.
3. Confira o resultado. Mensagens do Numo, comentários e instruções de rotina recebem texto editável; revise antes de enviar ou salvar. Formulários de criação recebem campos de rascunho que ainda precisam de confirmação. A edição por voz de uma issue existente aplica as alterações imediatamente: confira os campos depois e corrija erros pelos controles habituais. O ditado não concede permissões adicionais.

### Consumo e limites de gravação {#voice-limits}

O áudio é enviado ao serviço de transcrição configurado e depois pode ser revisado ou interpretado por um modelo de IA. A limpeza corrige pontuação, vícios de linguagem e autocorreções; para inserir as palavras exatamente como foram ouvidas, desative **Limpar ditados** em **Configurações da conta** > **Preferências** > **Ditado por voz**, e nenhum modelo de limpeza é chamado para seus ditados. O feedback público mantém seu próprio processamento. O consumo segue as regras do provedor e do orçamento da conta; a gravação e sua interpretação podem gerar consumos separados. O feedback público tem regras próprias de disponibilidade e cobrança, descritas no [guia de feedback](/docs/feedback). A demonstração da página inicial tem um limite separado e não representa uma cota de ditado da conta.

O serviço de transcrição para usuários conectados aceita até 10 MiB de áudio e 30 solicitações por conta por hora. O gravador compartilhado para após 20 minutos como precaução. Prefira gravações curtas para conferir cada resultado. Mantenha o texto existente até verificá-lo; o gravador não é um backup de áudio.

### Retomar após uma falha {#voice-recovery}

Se o acesso for negado, habilite o microfone para o site e para o navegador ou app desktop no sistema operacional. Se nenhum dispositivo for encontrado, conecte ou selecione um microfone; se estiver ocupado, feche o aplicativo que o utiliza. Se a gravação não for compatível, use um navegador compatível ou digite o texto.

Em caso de silêncio ou resultado vazio, confira o dispositivo de entrada e faça uma gravação curta e audível. Divida gravações grandes demais. A mensagem de limite de solicitações informa quanto esperar; aguarde antes de tentar novamente. Para falhas de orçamento ou provedor, confira o consumo de IA, as atribuições de voz e a configuração da instância. Se a revisão falhar, mas a transcrição for devolvida, revise e edite esse texto. Antes de repetir uma edição que falhou, confira os campos atuais para evitar aplicar a mesma alteração duas vezes.
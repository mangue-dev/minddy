---
{
  "id": "scheduled-routines",
  "locale": "pt-BR",
  "title": "Rotinas",
  "summary": "Inicie Numo por agenda, evento de ticket, feedback recebido ou nova entrada de banco de dados.",
  "topic": "Numo e integrações",
  "type": "guide",
  "audiences": [
    "owner"
  ],
  "workflows": [
    "N06"
  ],
  "visibility": "public",
  "status": "published",
  "revision": 9,
  "sourceRevision": 9,
  "owner": "@mangue-dev",
  "updatedAt": "2026-10-17",
  "compatibility": {
    "version": "0.11.1 candidate (MIN-677); MIN-721 removal of code delegation in routines; MIN-685 sidebar context menus; MIN-693 project roles",
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
      "content/knowledge/productivity.md",
      "components/routines/create-routine-wizard.tsx",
      "components/routines/routine-detail.tsx",
      "content/documentation/reviews/routine-localized-capture-candidates.json",
      "content/documentation/reviews/visual-refresh-captures-2026-10-09.json",
      "content/documentation/reviews/min-677-routines.md",
      "content/documentation/reviews/min-677-editor-captures.json",
      "content/documentation/reviews/min-721-code-work-removal-2026-10-16.md",
      "components/routines/routines-panel.tsx",
      "components/routines/use-routine-actions.tsx",
      "content/documentation/reviews/min-685-sidebar-context-actions.md",
      "docs/security/project-roles.md",
      "lib/project-roles.ts",
      "content/documentation/reviews/min-693-project-roles.md"
    ]
  },
  "review": {
    "revision": 9,
    "fact": "agent:/root (MIN-677 source review and single-group editor keyboard/mobile follow-up; unchanged procedures retain prior evidence); agent:/root/min721_docs (MIN-721 source review inherited from en revision 7; pt-BR translation of removal edits; no operational rerun); agent:/root (MIN-685 sidebar context menu source review inherited from en revision 8; pt-BR translation of added passages; no operational rerun); agent:/root (MIN-693 project roles: decision record, permission matrix and source review; no browser walkthrough, no new captures; unchanged evidence retained)",
    "language": "agent:/root (pt-BR translation, label and retained-meaning self-review); agent:/root/min721_pt-BR (pt-BR translation of MIN-721 removal edits, equivalent meaning reviewed; agent review, not human acceptance); agent:/root (pt-BR translation of MIN-685 added passages with catalog UI labels, equivalent meaning self-reviewed; agent review, not human acceptance); agent:/root/min693_pt-BR with agent:/root (pt-BR MIN-693 translation of the changed passages, localized labels and retained-meaning review; agent review, not human acceptance)",
    "date": "2026-10-17"
  },
  "related": [],
  "aliases": [],
  "tags": [
    "Agendar e acompanhar uma rotina do Numo"
  ],
  "figures": [
    {
      "id": "scheduled-routines-workflow",
      "kind": "screenshot",
      "src": "/documentation/pt-BR/scheduled-routines-workflow.png",
      "alt": "Modos Agendado e Evento, um grupo de condições, ícones do aplicativo e botões de informação discretos.",
      "caption": "Demonstração local do editor real de gatilhos. Nenhuma rotina foi salva ou executada.",
      "revision": 9,
      "reviewed": true,
      "capturedAt": "2026-10-12",
      "viewport": [
        788,
        910
      ],
      "theme": "light",
      "padding": 24,
      "deviceScaleFactor": 2
    }
  ],
  "requiredFigures": [
    "scheduled-routines-workflow"
  ]
}
---

## Criar uma rotina {#scheduled-routines}

Somente o proprietário do projeto pode criar, editar ou ativar uma rotina. Abra Rotinas, escolha um projeto seu e escreva as instruções para Numo. Mencione tickets, páginas ou objetivos relevantes. Cada execução tem uma conversa privada com Numo, histórico e ferramentas Minddy. As rotinas organizam e acompanham o trabalho, por exemplo uma triagem semanal, uma revisão de tickets parados ou um resumo semanal; elas não alteram o código do repositório.

Escolha **Agendado** ou **Evento**. As chegadas a um banco são uma opção da lista de eventos.

- **Agendado:** frequência diária, semanal ou mensal, horário e seu fuso. Confira a prévia da primeira execução.
- **Evento:** criação de ticket, entrada em um status específico, atribuição, comentário em um ticket acompanhado, recebimento de feedback ou uma nova entrada em um banco. Selecione status, pessoa ou ticket quando solicitado. O gatilho de status inclui tickets criados diretamente nesse status. Uma atribuição exige uma mudança real da pessoa responsável. Um comentário escrito por um leitor não inicia uma rotina de comentário.

Para uma chegada a um banco, escolha **Nova entrada no banco de dados** na lista de eventos e depois um banco de páginas do projeto. Criação, duplicação, importação de banco ou movimentação para esse banco contam como chegada. Restaurar uma entrada não gera outra chegada.

As **Condições** são opcionais: sem filtros, cada evento correspondente pode iniciar a rotina. Defina o atraso separadamente em **Momento de início**. Os pequenos botões de informação explicam a espera e o atraso. Os seletores usam os mesmos indicadores de status, prioridade, categoria e pessoa do Minddy. Use as setas e Enter; as listas longas incluem uma busca.

Se necessário, defina uma espera após o evento de 0 a 120 minutos. Mantenha seu fuso no contexto de Numo. Rotinas de evento e banco aguardam chegadas futuras sem próxima data agendada. O processamento automático precisa do scheduler da instância; a execução manual continua disponível.

## Criar condições que podem aguardar {#conditions}

Use **Adicionar condição** para criar um único grupo de até 16 condições. Escolha **Todas as condições** (E) ou **Qualquer condição** (OU) para todo o grupo. Selecione status, pessoa responsável, categoria, prioridade ou esforço; para um banco, sua propriedade tipada. Escolha um operador compatível e um valor. Pessoas, categorias e bancos devem pertencer ao projeto. Não é possível adicionar grupos aninhados. As regras aninhadas salvas mantêm sua lógica; se não puderem ser exibidas como um único grupo equivalente, **Substituir condições** as apaga para criar um grupo novo.

Exemplo: entrada em Triage, com todas as condições exigindo a categoria Backend e a prioridade Alta. Um ticket que chega sem categoria fica aguardando. Adicionar Backend depois pode iniciar a execução. Uma espera consumida não pode iniciar outra execução. Sair do status escolhido cancela a espera; entrar novamente cria outra. Uma reatribuição também substitui a espera anterior.

Uma entrada sem a propriedade exigida aguarda uma edição que satisfaça o filtro. Remover uma propriedade referenciada ou mudar seu tipo mostra um erro de filtro: corrija as condições antes de continuar. A espera configurada também é respeitada quando o filtro é satisfeito mais tarde. O recebimento de feedback inclui conteúdo privado e pendente; Numo não o publica nem contorna a moderação.

![Modos Agendado e Evento, um grupo de condições, ícones do aplicativo e botões de informação discretos.](/documentation/pt-BR/scheduled-routines-workflow.png)

## Gerenciar e verificar execuções {#runs}

Abra a rotina para consultar as esperas, mudar instruções ou gatilho, pausar ou ler as execuções. Pausar, excluir ou mudar a configuração invalida as esperas. Reativar passa a ouvir eventos futuros sem repetir chegadas antigas. A execução manual funciona com qualquer gatilho sem aguardar seu evento e também consome orçamento.

Clique com o botão direito em uma rotina da lista para abrir a última execução sem selecioná-la primeiro; **Abrir a última execução** fica indisponível até a rotina ter sido executada. O proprietário do projeto também pode escolher **Executar agora**, **Pausar** ou **Reativar**, **Editar** ou **Mover para a lixeira** no mesmo menu. **Reativar** fica indisponível quando a instância não pode agendar rotinas. Os outros membros só veem entradas que não alteram a rotina. Para criar uma rotina, clique com o botão direito em **Rotinas** na barra lateral e escolha **Nova rotina**.

Cada execução usa o orçamento de IA do proprietário com limite padrão de 15 % do orçamento mensal, incluindo todas as chamadas ao Numo dessa execução. Abra a conversa para ver origem, resultado e perguntas. Quando sua resposta for necessária, responda nessa conversa; o orçamento restante é mantido. Consulte os resultados salvos antes de mudar o limite ou tentar novamente. Quando a propriedade é [transferida](/docs/projects#transfer-ownership), as rotinas do antigo proprietário no projeto são pausadas e não podem iniciar novo trabalho; o novo proprietário cria as rotinas que devem continuar.

As automações arquivadas aparecem como propostas pausadas quando o proprietário abre Rotinas. Leia o [guia de transição](/docs/automation-settings) antes de ativá-las.

O limite vale quando há orçamento mensal incluído; o modo sem limite com chave pessoal não recebe um orçamento mensal artificial.

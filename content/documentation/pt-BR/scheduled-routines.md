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
  "revision": 5,
  "sourceRevision": 5,
  "owner": "@mangue-dev",
  "updatedAt": "2026-10-11",
  "compatibility": {
    "version": "0.11.1 candidate (MIN-677)",
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
      "content/documentation/reviews/min-677-editor-captures.json"
    ]
  },
  "review": {
    "revision": 5,
    "fact": "agent:/root (MIN-677 source review, isolated PostgreSQL regressions and trigger editor keyboard/mobile follow-up; unchanged procedures retain prior evidence)",
    "language": "agent:/root (pt-BR translation, label and retained-meaning self-review)",
    "date": "2026-10-11"
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
      "alt": "Cartões de gatilhos, seleção do evento, grupos E/OU aninhados e atraso de início separado.",
      "caption": "Demonstração local do editor real de gatilhos. Nenhuma rotina foi salva ou executada.",
      "revision": 5,
      "reviewed": true,
      "capturedAt": "2026-10-11",
      "viewport": [
        788,
        1277
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

Somente o proprietário do projeto pode criar, editar ou ativar uma rotina. Abra Rotinas, escolha um projeto seu e escreva as instruções para Numo. Mencione tickets, páginas ou objetivos relevantes. Cada execução tem uma conversa privada com Numo, histórico, ferramentas Minddy e delegação de código opcional. Os workers usam as configurações do proprietário; um repositório só é necessário para trabalhar no código.

Escolha um gatilho:

- **Agenda:** frequência diária, semanal ou mensal, horário e seu fuso. Confira a prévia da primeira execução.
- **Evento:** criação de ticket, entrada em um status específico, atribuição, comentário em um ticket acompanhado ou recebimento de feedback. Selecione status, pessoa ou ticket quando solicitado. O gatilho de status inclui tickets criados diretamente nesse status. Uma atribuição exige uma mudança real da pessoa responsável.
- **Entrada de banco:** escolha um banco de páginas do projeto. Criação, duplicação, importação de banco ou movimentação para esse banco contam como chegada. Restaurar uma entrada não gera outra chegada.

Para um gatilho de evento ou de base, selecione seu cartão e configure **Quando isso acontece**. As **Condições** são opcionais: sem filtros, cada evento correspondente pode iniciar a rotina. Defina o atraso separadamente em **Momento de início**. As condições numeradas e os grupos recuados mostram quais regras pertencem ao mesmo grupo. Use as setas e Enter nos seletores; as listas longas incluem um campo de busca.

Se necessário, defina uma espera após o evento de 0 a 120 minutos. Mantenha seu fuso no contexto de Numo. Rotinas de evento e banco aguardam chegadas futuras sem próxima data agendada. O processamento automático precisa do scheduler da instância; a execução manual continua disponível.

## Criar condições que podem aguardar {#conditions}

Use **Adicionar condição** e **Adicionar grupo** para combinar **Todas as condições** (E) e **Qualquer condição** (OU). Escolha status, responsável, categoria, prioridade ou esforço; para um banco, sua propriedade tipada. Selecione um operador compatível e um valor. Pessoas, categorias e bancos precisam pertencer ao projeto. As condições têm limite de seis níveis aninhados e 64 nós, sem expressões executáveis.

Exemplo: entrada em Triagem E categoria Backend E (há uma pessoa responsável OU a prioridade é Alta). Um ticket sem categoria permanece aguardando. Adicionar Backend depois pode iniciar a execução. Uma espera consumida não pode iniciar outra execução. Sair do status escolhido cancela a espera; entrar novamente cria outra. Uma reatribuição também substitui a espera anterior.

Uma entrada sem a propriedade exigida aguarda uma edição que satisfaça o filtro. Remover uma propriedade referenciada ou mudar seu tipo mostra um erro de filtro: corrija as condições antes de continuar. A espera configurada também é respeitada quando o filtro é satisfeito mais tarde. O recebimento de feedback inclui conteúdo privado e pendente; Numo não o publica nem contorna a moderação.

![Cartões de gatilhos, seleção do evento, grupos E/OU aninhados e atraso de início separado.](/documentation/pt-BR/scheduled-routines-workflow.png)

## Gerenciar e verificar execuções {#runs}

Abra a rotina para consultar as esperas, mudar instruções ou gatilho, pausar ou ler as execuções. Pausar, excluir ou mudar a configuração invalida as esperas. Reativar passa a ouvir eventos futuros sem repetir chegadas antigas. A execução manual funciona com qualquer gatilho sem aguardar seu evento e também consome orçamento.

Cada execução usa o orçamento de IA do proprietário com limite padrão de 15 % do orçamento mensal, incluindo Numo e workers delegados. Abra a conversa para ver origem, resultado, verificações, perguntas e trabalho delegado. Quando sua resposta for necessária, responda nessa conversa; o orçamento restante é mantido. Consulte os resultados salvos antes de mudar o limite ou tentar novamente. Após mudar o proprietário, a rotina do antigo proprietário não pode iniciar novo trabalho; crie outra como proprietário atual.

As automações arquivadas aparecem como propostas pausadas quando o proprietário abre Rotinas. Leia o [guia de transição](/docs/automation-settings) antes de ativá-las.

O limite vale quando há orçamento mensal incluído; o modo sem limite com chave pessoal não recebe um orçamento mensal artificial.

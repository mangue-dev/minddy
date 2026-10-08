---
{
  "id": "bulk-issue-actions",
  "locale": "pt-BR",
  "title": "Atualizar vários problemas juntos",
  "summary": "Revise a seleção antes de aplicar uma mesma ação a todos os problemas incluídos.",
  "topic": "Projetos e problemas",
  "type": "guide",
  "audiences": [
    "member"
  ],
  "workflows": [
    "W04"
  ],
  "visibility": "public",
  "status": "published",
  "revision": 1,
  "sourceRevision": 1,
  "owner": "@mangue-dev",
  "updatedAt": "2026-10-08",
  "compatibility": {
    "version": "0.11.1 candidate (89ebb59a5)",
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
      "components/bulk-issue-actions.tsx",
      "components/global-board.tsx",
      "components/issue-card.tsx",
      "components/marquee-selection.tsx",
      "components/command-palette.tsx"
    ]
  },
  "review": {
    "revision": 1,
    "fact": "2026-10-08",
    "language": "2026-10-08",
    "date": "2026-10-08"
  },
  "related": [
    "create-an-issue",
    "views-and-filters",
    "personal-cycle"
  ],
  "aliases": [],
  "tags": [],
  "figures": [
    {
      "id": "bulk-issue-actions-steps",
      "kind": "screenshot",
      "src": "/documentation/pt-BR/work-bulk-actions.png",
      "alt": "Menu de ações para dois tickets de demonstração selecionados.",
      "caption": "O menu atua nos tickets selecionados. Nenhuma alteração em grupo foi enviada nesta captura.",
      "revision": 1,
      "reviewed": true,
      "capturedAt": "2026-10-08",
      "viewport": [
        1440,
        1080
      ],
      "theme": "light"
    }
  ],
  "requiredFigures": [
    "bulk-issue-actions-steps"
  ]
}
---

## Selecionar e agir {#bulk-issue-actions}

No quadro, mantenha Shift pressionado e clique em cada cartão para adicioná-lo à seleção ou removê-lo dela. Com o mouse, você também pode arrastar um retângulo de seleção a partir de um espaço vazio do quadro. Shift, Command ou Ctrl fazem esse gesto ampliar a seleção existente. O retângulo não é um modo de seleção para telas sensíveis ao toque. Confira a quantidade selecionada e os identificadores visíveis antes de abrir as ações em lote. A seleção é um conjunto de trabalho para a ação, não uma visualização salva nem uma concessão de permissão.

Escolha Ações na barra flutuante de seleção para abrir a paleta de comandos. Escolha estado, prioridade, esforço ou responsável, defina o valor e confirme o formulário integrado. A ação de objetivo aparece somente quando a seleção pertence a um único projeto com objetivos disponíveis. Outras ações, como adicionar ou remover do ciclo, vincular dois problemas ou enviar a seleção ao Numo, aparecem quando o quadro atual oferece suporte a elas. Confira os problemas afetados depois. Em um dispositivo somente de toque sem um gesto de seleção múltipla compatível, edite cada problema pelo painel de detalhes.

![Menu de ações para dois tickets de demonstração selecionados.](/documentation/pt-BR/work-bulk-actions.png)

## Resultados parciais e ações destrutivas {#bulk-results}

Ao trabalhar entre projetos, verifique sua participação em cada projeto afetado. Leia os resultados de falhas parciais: alterações bem-sucedidas podem já estar salvas mesmo que outro problema tenha sido rejeitado. Inspecione o resultado antes de repetir a seleção inteira.

A exclusão afeta todos os itens selecionados, então confirme o conjunto antes de continuar. Limpe a seleção depois da operação se for passar para outro trabalho. Se a atualização mudar os resultados dos filtros, problemas podem sair da visualização exibida e permanecer no projeto. Pesquise os identificadores para verificar o novo estado em vez de recriá-los.

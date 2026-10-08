---
{
  "id": "page-comments-and-collaboration",
  "locale": "pt-BR",
  "title": "Discutir uma página e lidar com conflitos",
  "summary": "Use discussões ancoradas e entenda a diferença entre presença e edições salvas.",
  "topic": "Páginas e bancos de dados",
  "type": "guide",
  "audiences": [
    "member"
  ],
  "workflows": [
    "P03"
  ],
  "visibility": "public",
  "status": "published",
  "revision": 2,
  "sourceRevision": 2,
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
      "components/pages/page-comment-popover.tsx",
      "components/pages/page-presence.tsx",
      "components/pages/page-conflict-banner.tsx",
      "lib/pages-merge.ts",
      "components/pages/page-view.tsx"
    ]
  },
  "review": {
    "revision": 2,
    "fact": "2026-10-08",
    "language": "2026-10-08",
    "date": "2026-10-08"
  },
  "related": [
    "page-history",
    "page-editor",
    "notifications-and-inbox"
  ],
  "aliases": [],
  "tags": [],
  "figures": [
    {
      "id": "page-comments-and-collaboration-steps",
      "kind": "screenshot",
      "src": "/documentation/pt-BR/page-comments.png",
      "alt": "Atividade da página com uma edição de demonstração e campo de comentário vazio.",
      "caption": "Leia a atividade e escreva um comentário no campo. Nenhum comentário foi enviado neste exemplo.",
      "revision": 2,
      "reviewed": true,
      "capturedAt": "2026-10-08",
      "viewport": [
        1440,
        600
      ],
      "theme": "light"
    }
  ],
  "requiredFigures": [
    "page-comments-and-collaboration-steps"
  ]
}
---

## Adicionar e resolver uma discussão {#page-comments-and-collaboration}

Abra uma página do projeto e os controles de comentários. Selecione o conteúdo relevante ao criar um comentário ancorado, explique a pergunta ou mudança proposta e use menções para envolver um membro. Responda na discussão para manter a decisão junto ao contexto. Resolva a discussão quando a pergunta tiver sido realmente atendida.

Avatares de presença identificam quem está vendo a página. Eles não provam que o texto não salvo de outra pessoa chegou ao servidor nem que edições simultâneas sejam mescladas automaticamente. Leia o estado atual de salvamento antes de sair.


![Atividade da página com uma edição de demonstração e campo de comentário vazio.](/documentation/pt-BR/page-comments.png)

## Recuperar um conflito de salvamento {#page-conflict}

O Minddy combina edições de blocos diferentes no primeiro nível do documento quando consegue preservar as duas alterações. Ele não mescla caractere por caractere edições simultâneas dentro do mesmo bloco. Se as duas pessoas alteraram esse bloco, o documento mantém a versão remota e um aviso oferece seu bloco anterior para análise.

Compare o bloco identificado com o documento atual. Escolha restaurar sua versão apenas quando realmente quiser substituir esse bloco por ela. Se sua ação em conflito foi uma exclusão, a opção de excluí-lo novamente aplica essa exclusão de forma explícita. Dispensar o aviso mantém o documento adotado e fecha o alerta; não restaura sua versão. Preserve o texto que deseja recuperar antes de dispensar e use o histórico para examinar versões salvas quando precisar de uma recuperação mais ampla. Essas escolhas afetam o bloco identificado, sem substituir toda a página às cegas.

Uma âncora pode desaparecer após edições do documento; leia a discussão antes de mover ou excluir o bloco referido. Comentários e atividade são internos ao projeto, salvo publicação explícita de conteúdo por um caminho compatível. Teste uma página publicada para determinar a visão real do visitante, em vez de supor que os controles de colaboração se tornem públicos.

---
{
  "id": "glossary-and-data-model",
  "locale": "pt-BR",
  "title": "Glossário e modelo de dados",
  "summary": "Entenda o papel de projetos, problemas, objetivos, ciclos pessoais, páginas, bancos de dados e feedback e suas relações.",
  "topic": "Conceitos técnicos",
  "type": "explanation",
  "audiences": [
    "member",
    "integrator"
  ],
  "workflows": [
    "T01"
  ],
  "visibility": "public",
  "status": "published",
  "revision": 4,
  "sourceRevision": 4,
  "owner": "@mangue-dev",
  "updatedAt": "2026-10-17",
  "compatibility": {
    "version": "0.11.1 candidate (89ebb59a5); MIN-693 project roles",
    "editions": [
      "Cloud",
      "self-hosted"
    ],
    "profiles": [
      "web",
      "desktop",
      "mobile",
      "full",
      "managed"
    ],
    "evidence": [
      "content/knowledge/core-tracker.md",
      "content/knowledge/productivity.md",
      "content/knowledge/pages.md",
      "content/knowledge/feedback.md",
      "docs/security/project-roles.md",
      "lib/project-roles.ts"
    ]
  },
  "review": {
    "revision": 4,
    "fact": "agent:/root consolidation review; agent:/root/italian_portuguese_review retained-meaning comparison with prior procedural evidence (no operational rerun); agent:/root (visual usefulness, figure framing and preserved procedures; previous operational evidence retained); agent:/root (MIN-693 project roles: decision record, permission matrix and source review; no browser walkthrough, no new captures; unchanged evidence retained)",
    "language": "agent:/root/italian_portuguese_review (localized feature scope, summaries and heading review; retained source procedures); agent:/root/editorial_it_pt (collection-caption clarity); agent:/root/min693_pt-BR with agent:/root (pt-BR MIN-693 translation of the changed passages, localized labels and retained-meaning review; agent review, not human acceptance)",
    "date": "2026-10-17"
  },
  "related": [
    "permissions-and-public-links",
    "numo"
  ],
  "aliases": [],
  "tags": [
    "Entender projetos, problemas, objetivos e trabalho pessoal",
    "Entender projetos, issues, objetivos e trabalho pessoal"
  ],
  "figures": [
    {
      "id": "glossary-and-data-model-flow",
      "kind": "diagram",
      "src": "/documentation/pt-BR/glossary-and-data-model-flow.svg",
      "alt": "Diagrama: Projeto: trabalho e conhecimento compartilhados. Issue: trabalho; objetivo: resultado. Ciclo pessoal: trabalho entre projetos. Página: contexto; feedback: necessidade.",
      "caption": "O trabalho compartilhado do projeto se conecta ao planejamento pessoal sem igualar a propriedade dos objetos nem as permissões.",
      "revision": 4,
      "reviewed": true,
      "capturedAt": "2026-10-08",
      "viewport": [
        720,
        640
      ],
      "theme": "neutral",
      "diagram": {
        "layout": "collection",
        "items": [
          {
            "title": "Projeto: trabalho e conhecimento compartilhados"
          },
          {
            "title": "Issue: trabalho; objetivo: resultado"
          },
          {
            "title": "Ciclo pessoal: trabalho entre projetos"
          },
          {
            "title": "Página: contexto; feedback: necessidade"
          }
        ]
      }
    }
  ],
  "requiredFigures": [
    "glossary-and-data-model-flow"
  ]
}
---

## Entender projetos, problemas, objetivos e trabalho pessoal {#glossary-and-data-model}

Um projeto reúne o trabalho compartilhado: membros, issues, categorias, visualizações, páginas, integrações e feedback. Cada pessoa nele tem um papel: um proprietário, membros que trabalham no conteúdo e leitores que o acompanham. Uma issue descreve uma atividade específica com status e responsável; pode ter plano, prazo, objetivo, categorias, relações, comentários e recursos. Um objetivo reúne issues para acompanhar um resultado e seu progresso. Já o ciclo pessoal seleciona o trabalho de uma pessoa para uma ou duas semanas, inclusive de projetos diferentes. Ele não é uma sprint compartilhada nem um objetivo.

![Diagrama: Projeto: trabalho e conhecimento compartilhados. Issue: trabalho; objetivo: resultado. Ciclo pessoal: trabalho entre projetos. Página: contexto; feedback: necessidade.](/documentation/pt-BR/glossary-and-data-model-flow.svg)

## Separar conhecimento e solicitações {#knowledge-and-feedback}

Uma página guarda o contexto que precisa durar, como uma especificação, decisão ou procedimento operacional. Pode conter subpáginas, arquivos e discussões. Um banco de páginas acrescenta propriedades às entradas, que continuam sendo páginas completas. O feedback representa uma necessidade com votos e status público, separado da issue interna; ao vinculá-lo a uma issue, seu status público acompanha automaticamente o status desse trabalho. Uma visualização filtra e ordena issues sem alterá-las. O caderno guarda notas e caixas de seleção privadas: transforme uma nota em issue quando o projeto precisar acompanhá-la.

## Conferir com um exemplo {#example}

Para preparar uma versão, crie um objetivo, documente a decisão em uma página e vincule-a às issues relevantes. Cada membro pode incluir suas issues no ciclo pessoal. É possível vincular feedback ao trabalho sem publicar a discussão privada. Uma rotina inicia uma nova conversa do Numo com o contexto do projeto conforme um agendamento ou quando um evento escolhido atende às suas condições, por exemplo uma issue que entra em um status ou uma nova entrada de banco de dados; ela não é uma issue recorrente e não altera o código do repositório. Preserve os identificadores e a propriedade dos objetos: vincular contexto não iguala as permissões.

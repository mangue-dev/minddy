---
{
  "id": "glossary-and-data-model",
  "locale": "pt-BR",
  "title": "Glossário e modelo de dados",
  "summary": "Entenda o papel de projetos, tickets, objetivos, ciclos pessoais, páginas, bancos de dados e feedback e suas relações.",
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
  "revision": 6,
  "sourceRevision": 5,
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
    "revision": 6,
    "fact": "agent:/root/min747 (0.20.0 release review: source audit against the v0.11.0..main delta, verified corrections applied; no screenshot in scope; no browser walkthrough of the procedures or operator rehearsal; earlier evidence retained in git history); agent:claude-code (MIN-762 UI label and terminology correction: pt-BR labels aligned on the corrected catalog and the ticket term; no behavior change, no new captures)",
    "language": "agent:/root/min747 (pt-BR translation of the release corrections with catalog UI labels; equivalent meaning self-reviewed; agent review, not human acceptance); agent:claude-code (pt-BR MIN-762 terminology edit; self-reviewed; agent review, not human acceptance)",
    "date": "2026-10-22"
  },
  "related": [
    "permissions-and-public-links",
    "numo"
  ],
  "aliases": [],
  "tags": [
    "Entender projetos, tickets, objetivos e trabalho pessoal",
    "Entender projetos, issues, objetivos e trabalho pessoal"
  ],
  "figures": [
    {
      "id": "glossary-and-data-model-flow",
      "kind": "diagram",
      "src": "/documentation/pt-BR/glossary-and-data-model-flow.svg",
      "alt": "Diagrama: Projeto: trabalho e conhecimento compartilhados. Ticket: trabalho; objetivo: resultado. Ciclo pessoal: trabalho entre projetos. Página: contexto; feedback: necessidade.",
      "caption": "O trabalho compartilhado do projeto se conecta ao planejamento pessoal sem igualar a propriedade dos objetos nem as permissões.",
      "revision": 6,
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
            "title": "Ticket: trabalho; objetivo: resultado"
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

## Entender projetos, tickets, objetivos e trabalho pessoal {#glossary-and-data-model}

Um projeto reúne o trabalho compartilhado: membros, tickets, categorias, visualizações, páginas, integrações e feedback. Cada pessoa nele tem um papel: um proprietário, membros que trabalham no conteúdo e leitores que o acompanham. Um ticket descreve uma atividade específica com status e responsável; pode ter plano, prazo, objetivo, categorias, relações, comentários e recursos. Um objetivo reúne tickets para acompanhar um resultado e seu progresso. Já o ciclo pessoal seleciona o trabalho de uma pessoa para uma ou duas semanas, inclusive de projetos diferentes. Ele não é uma sprint compartilhada nem um objetivo.

![Diagrama: Projeto: trabalho e conhecimento compartilhados. Ticket: trabalho; objetivo: resultado. Ciclo pessoal: trabalho entre projetos. Página: contexto; feedback: necessidade.](/documentation/pt-BR/glossary-and-data-model-flow.svg)

## Separar conhecimento e solicitações {#knowledge-and-feedback}

Uma página guarda o contexto que precisa durar, como uma especificação, decisão ou procedimento operacional. Pode conter subpáginas, arquivos e discussões. Um banco de páginas acrescenta propriedades às entradas, que continuam sendo páginas completas. O feedback representa uma necessidade com votos e status público, separado do ticket interno; ao vinculá-lo a um ticket, seu status público acompanha automaticamente o status desse trabalho. Uma visualização filtra e ordena tickets sem alterá-los. O caderno guarda notas e caixas de seleção privadas: transforme uma nota em ticket quando o projeto precisar acompanhá-la.

## Conferir com um exemplo {#example}

Para preparar uma versão, crie um objetivo, documente a decisão em uma página e vincule-a aos tickets relevantes. Cada membro pode incluir seus tickets no ciclo pessoal. É possível vincular feedback ao trabalho sem publicar a discussão privada. Uma rotina inicia uma nova conversa do Numo com o contexto do projeto conforme um agendamento ou quando um evento escolhido atende às suas condições, por exemplo um ticket que entra em um status ou uma nova entrada de banco de dados; ela não é um ticket recorrente e não altera o código do repositório. Preserve os identificadores e a propriedade dos objetos: vincular contexto não iguala as permissões.

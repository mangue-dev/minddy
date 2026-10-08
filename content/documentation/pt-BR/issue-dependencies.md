---
{
  "id": "issue-dependencies",
  "locale": "pt-BR",
  "title": "Vincular dependências e problemas relacionados",
  "summary": "Indique qual trabalho bloqueia outra tarefa e diferencie relações de hierarquia.",
  "topic": "Projetos e problemas",
  "type": "guide",
  "audiences": [
    "member"
  ],
  "workflows": [
    "W05"
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
      "content/knowledge/core-tracker.md",
      "components/issue-side-panel.tsx",
      "components/issue-indicators.tsx",
      "captures/shots/relations/intent.md",
      "lib/server/issue-relations.ts",
      "lib/relation-constants.ts"
    ]
  },
  "review": {
    "revision": 2,
    "fact": "2026-10-08",
    "language": "2026-10-08",
    "date": "2026-10-08"
  },
  "related": [
    "sub-issues",
    "issue-statuses",
    "objective-dependencies-and-momentum"
  ],
  "aliases": [],
  "tags": [],
  "figures": [
    {
      "id": "issue-dependencies-steps",
      "kind": "screenshot",
      "src": "/documentation/pt-BR/work-dependencies.png",
      "alt": "Busca de um ticket bloqueador pelo identificador.",
      "caption": "Escolha o sentido da relação antes do destino. O seletor é mostrado sem enviar a relação.",
      "revision": 2,
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
    "issue-dependencies-steps"
  ]
}
---

## Escolher a relação e sua direção {#issue-dependencies}

Abra os controles de relações de um problema e encontre o outro pelo título ou identificador. Escolha uma relação de bloqueio quando uma tarefa precisar terminar antes que outra possa avançar. Se A bloqueia B, A é o pré-requisito e B é bloqueado por A. Uma relação de vínculo acrescenta contexto sem impor essa ordem.

Leia os dois identificadores e a direção exibida antes de confirmar. Por exemplo, “Preparar o endpoint” bloqueia “Conectar o cliente”, e não o contrário. Uma dependência não transforma nenhum problema em subproblema, e uma relação de pai e filho não substitui uma relação de bloqueio.

![Busca de um ticket bloqueador pelo identificador.](/documentation/pt-BR/work-dependencies.png)

## Bloqueios resolvidos e herdados {#blocker-state}

Os estados finais Concluído, Cancelada e Duplicado fazem um problema deixar de bloquear trabalho. As relações conectam problemas ou objetivos do mesmo projeto; as duas pontas precisam estar acessíveis nele. Elas não conectam trabalho privado arbitrário entre projetos nem publicam nenhuma das pontas.

Um problema aberto pode herdar um bloqueio pelo seu objetivo aberto. Se A bloqueia o objetivo B, os problemas abertos vinculados a B mostram A como bloqueio herdado, mesmo sem uma relação direta de A ao problema. A interface identifica o pré-requisito real e o objetivo que transmite o bloqueio. Examine essa relação do objetivo antes de tentar removê-la do problema. Encerrar A, encerrar B ou retirar o problema de B elimina o bloqueio herdado. Esse mecanismo segue a participação no objetivo, não a hierarquia entre problema pai e subproblemas.

Remova uma relação pelos seus controles quando ela deixar de fazer sentido, depois verifique tanto o rótulo quanto o indicador de bloqueio. Marcar um problema como duplicata tem efeitos no ciclo de vida e aponta para o trabalho mantido. Use essa ação para tarefas duplicadas, em vez de criar uma relação comum e supor que isso encerra a duplicata.

Se o seletor de relações não encontrar um problema, confira o acesso ao projeto e o identificador. Não exponha conteúdo de outro projeto colando a URL de um problema privado em uma resposta pública de feedback.

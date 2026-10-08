---
{
  "id": "review-pull-requests",
  "locale": "pt-BR",
  "title": "Revisar uma pull request vinculada",
  "summary": "Examinar arquivos, discussões e verificações antes de solicitar revisão ou mesclar.",
  "topic": "Numo e integrações",
  "type": "guide",
  "audiences": [
    "member"
  ],
  "workflows": [
    "N04"
  ],
  "visibility": "public",
  "status": "published",
  "revision": 1,
  "sourceRevision": 1,
  "owner": "@mangue-dev",
  "updatedAt": "2026-10-08",
  "compatibility": {
    "version": "0.11.1 candidate (cd1843e12)",
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
      "components/pull-requests/pr-detail.tsx",
      "components/pull-requests/pr-reviews-details.tsx",
      "content/knowledge/plans-and-agents.md"
    ]
  },
  "review": {
    "revision": 1,
    "fact": "2026-10-08",
    "language": "2026-10-08",
    "date": "2026-10-08"
  },
  "related": [],
  "aliases": [],
  "tags": [],
  "figures": [
    {
      "id": "review-pull-requests-workflow",
      "kind": "screenshot",
      "src": "/documentation/pt-BR/review-pull-requests-workflow.png",
      "alt": "Aba Alterações do PR de demonstração aberto, com o diff de greeting e um aviso de autorização do GitHub indisponível.",
      "caption": "O PR real corrigido permanece aberto, sem merge. O diff remove os espaços ao redor do nome e usa World quando o valor é vazio. Esta instância não pode solicitar autorização de usuário do GitHub; a indicação de prontidão não concede permissão de merge nem comprova que a CI do provedor passou.",
      "revision": 1,
      "reviewed": true,
      "capturedAt": "2026-10-08",
      "viewport": [
        1480,
        1100
      ],
      "theme": "light"
    }
  ],
  "requiredFigures": [
    "review-pull-requests-workflow"
  ]
}
---

## Examinar a proposta {#review-pull-requests}
Abra a pull request vinculada à tarefa ou execução delegada. O acesso ao repositório continua necessário; ser membro do projeto não concede permissões na plataforma Git.

Leia descrição e atividade, depois arquivos alterados e trechos do diff. Abra conversas não resolvidas e responda no tópico correspondente. Marcar arquivos revisados acompanha sua leitura, mas não equivale à aprovação do provedor. Confira commits, resultados de CI e tarefas vinculadas diante do trabalho solicitado.

![Aba Alterações do PR de demonstração aberto, com o diff de greeting e um aviso de autorização do GitHub indisponível.](/documentation/pt-BR/review-pull-requests-workflow.png)


## Revisão e merge {#decision}
Solicite outro revisor quando necessário. Uma revisão por IA disponível acrescenta uma avaliação, sem comprovar que os testes passaram. Confira estado de rascunho ou pronto para revisão, discussões abertas, revisões solicitadas e política de merge.

Faça o merge após satisfazer verificações e revisões aplicáveis e com uma conta autorizada. O provedor pode rejeitar uma ação visível. Se o estado estiver desatualizado, atualize e confira no provedor antes de repetir. O Numo pode ler, comentar, alterar prontidão ou mesclar com autorização; alterações na branch passam ao worker. Uma prévia depende de implantação real.

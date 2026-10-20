---
{
  "id": "permissions-and-public-links",
  "locale": "pt-BR",
  "title": "Permissões e links públicos",
  "summary": "Diferencie acesso ao projeto e conteúdo publicado, confira o que um visitante vê e verifique a revogação dos links.",
  "topic": "Conceitos técnicos",
  "type": "explanation",
  "audiences": [
    "owner",
    "integrator"
  ],
  "workflows": [
    "T02"
  ],
  "visibility": "public",
  "status": "published",
  "revision": 5,
  "sourceRevision": 5,
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
      "lib/server/pages.ts",
      "lib/server/page-publication.ts",
      "lib/server/mcp/auth.ts",
      "proxy.ts",
      "content/knowledge/settings-and-data.md",
      "docs/security/project-roles.md",
      "lib/project-roles.ts"
    ]
  },
  "review": {
    "revision": 5,
    "fact": "agent:/root consolidation review; agent:/root/italian_portuguese_review retained-meaning comparison with prior procedural evidence (no operational rerun); agent:/root (visual usefulness, figure framing and preserved procedures; previous operational evidence retained); agent:/root (technical-reference formatting; prior factual evidence retained; no operational rerun); agent:/root (MIN-693 project roles: decision record, permission matrix and source review; no browser walkthrough, no new captures; unchanged evidence retained)",
    "language": "agent:/root/italian_portuguese_review (localized feature scope, summaries and heading review; retained source procedures); agent:/root/editorial_it_pt (collection-caption clarity); agent:/root (inline-code syntax and unchanged-text review); agent:/root/min693_pt-BR with agent:/root (pt-BR MIN-693 translation of the changed passages, localized labels and retained-meaning review; agent review, not human acceptance)",
    "date": "2026-10-17"
  },
  "related": [
    "pages",
    "views",
    "encryption-and-data-boundaries"
  ],
  "aliases": [],
  "tags": [
    "Entender permissões e links públicos"
  ],
  "figures": [
    {
      "id": "permissions-and-public-links-flow",
      "kind": "diagram",
      "src": "/documentation/pt-BR/permissions-and-public-links-flow.svg",
      "alt": "Diagrama: Permissões de conta e projeto. Objeto privado ou publicação explícita. Só conjunto publicado e arquivos assinados. Revogar link; arquivos expiram depois.",
      "caption": "A publicação permite acessar apenas o conteúdo escolhido; revogar o link não invalida imediatamente as URLs assinadas já emitidas.",
      "revision": 5,
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
            "title": "Permissões de conta e projeto"
          },
          {
            "title": "Objeto privado ou publicação explícita"
          },
          {
            "title": "Só conjunto publicado e arquivos assinados"
          },
          {
            "title": "Revogar link; arquivos expiram depois"
          }
        ]
      }
    }
  ],
  "requiredFigures": [
    "permissions-and-public-links-flow"
  ]
}
---

## Entender permissões e links públicos {#permissions-and-public-links}

O servidor verifica o acesso ao projeto e o seu papel no projeto em cada operação. Cada projeto tem um único proprietário, que gerencia as configurações restritas, os membros, os papéis e as integrações. Os membros trabalham no conteúdo do projeto. Os leitores podem lê-lo e, quando o proprietário ativa **Pode comentar** para eles, comentar; não podem editar o conteúdo nem publicar links, e não veem as integrações nem os tokens de compartilhamento e de mural. A tabela de [papéis do projeto](/docs/projects#member-permissions) lista o acesso de cada papel. Ocultar um controle na interface não concede autorização. Preferências pessoais, caderno e conversas privadas não se tornam compartilhados ao adicionar contexto do projeto. O MCP atua com a conta que o autorizou e segue, a cada chamada, o papel atual dessa conta em cada projeto; ele não concede privilégios de administrador ao agente. As integrações de projeto com chaves `mdy_` não são pessoas: mantêm as permissões fixas do seu tipo e não recebem papel.

Uma mudança de papel ou uma remoção vale a partir da próxima solicitação. O conteúdo já entregue não é recuperado, e uma URL assinada já emitida para um arquivo privado continua válida até expirar, no máximo 10 minutos depois.

![Diagrama: Permissões de conta e projeto. Objeto privado ou publicação explícita. Só conjunto publicado e arquivos assinados. Revogar link; arquivos expiram depois.](/documentation/pt-BR/permissions-and-public-links-flow.svg)

## Entender o alcance da publicação {#publication}

Uma página publicada ou visualização compartilhada usa um link opaco, que pode ter senha. O proprietário e os membros podem publicar e revogar esses links; os leitores não. Quem possui o link e, quando exigida, a senha pode acessar o conteúdo publicado. Revogue o link quando deixar de ser necessário. As subpáginas só são resolvidas dentro do conjunto publicado, sem revelar títulos das páginas excluídas. As URLs assinadas dos arquivos abrangem apenas páginas incluídas; os buckets e as rotas privadas continuam protegidos. As menções podem permanecer como texto sem um perfil acessível. Um banco público mostra somente as entradas do ramo publicado.

## Testar compartilhamento e revogação {#revocation}

Abra o link em uma sessão separada sem login e confira conteúdo, arquivos e exclusões. Revogue-o e repita o teste. Cópias já baixadas não podem ser recolhidas; as URLs assinadas dos arquivos continuam válidas até expirar, e as URLs de arquivos emitidas para uma página publicada duram 24 horas. Os links secretos mantêm `noindex`, enquanto o centro de documentação pode ser indexado. `noindex` orienta os rastreadores e não controla acesso. Não inclua links privados em relatórios ou exemplos públicos.

---
{
  "id": "encryption-and-data-boundaries",
  "locale": "pt-BR",
  "title": "Criptografia e limites de proteção de dados",
  "summary": "Após a configuração e a migração previstas, o minddy cifra conteúdos e arquivos antes das gravações persistentes usando criptografia autenticada no servidor.",
  "topic": "Conceitos técnicos",
  "type": "explanation",
  "audiences": [
    "member",
    "operator"
  ],
  "workflows": [
    "T04"
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
      "docs/self-hosting.md",
      "lib/server/encryption/data-policy.json",
      "lib/server/encryption.ts",
      "docs/editions.md"
    ]
  },
  "review": {
    "revision": 6,
    "fact": "agent:/root/min747 (0.20.0 release review: source audit against the v0.11.0..main delta, no correction needed; no screenshot in scope; no browser walkthrough of the procedures or operator rehearsal; earlier evidence retained in git history); agent:claude-code (MIN-762 UI label and terminology correction: pt-BR labels aligned on the corrected catalog and the ticket term; no behavior change, no new captures)",
    "language": "agent:/root/min747 (pt-BR translation of the release corrections with catalog UI labels; equivalent meaning self-reviewed; agent review, not human acceptance); agent:claude-code (pt-BR MIN-762 terminology edit; self-reviewed; agent review, not human acceptance)",
    "date": "2026-10-22"
  },
  "related": [
    "workspace-encryption",
    "backups-and-restoration",
    "permissions-and-public-links"
  ],
  "aliases": [],
  "tags": [
    "Entender criptografia e dados ainda visíveis"
  ],
  "figures": [
    {
      "id": "encryption-and-data-boundaries-flow",
      "kind": "diagram",
      "src": "/documentation/pt-BR/encryption-and-data-boundaries-flow.svg",
      "alt": "Diagrama: Conteúdo cifrado e chaves empacotadas. Raiz na configuração protegida do servidor. Runtime autorizado pode decifrar. Exports e provedores precisam proteção separada.",
      "caption": "A proteção do conteúdo persistente depende das chaves do servidor; exportações e envios a provedores exigem controles separados.",
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
            "title": "Conteúdo cifrado e chaves empacotadas"
          },
          {
            "title": "Raiz na configuração protegida do servidor"
          },
          {
            "title": "Runtime autorizado pode decifrar"
          },
          {
            "title": "Exports e provedores precisam proteção separada"
          }
        ]
      }
    }
  ],
  "requiredFigures": [
    "encryption-and-data-boundaries-flow"
  ]
}
---

## Entender criptografia e dados ainda visíveis {#encryption-and-data-boundaries}

Após a configuração e a migração previstas, o minddy cifra conteúdos e arquivos antes das gravações persistentes usando criptografia autenticada no servidor. As chaves de projeto, usuário e sistema são versionadas e protegidas por uma chave raiz mantida fora do PostgreSQL. Uma cópia isolada do banco não permite ler os conteúdos protegidos sem as chaves. A aplicação os decifra para usuários autorizados, busca e trabalho de IA autorizado, inclusive sem uma sessão interativa. Um ambiente de execução comprometido ou o acesso aos dados e às chaves ultrapassa esse limite. Não se trata de criptografia ponta a ponta que impeça o operador de ler o conteúdo.

![Diagrama: Conteúdo cifrado e chaves empacotadas. Raiz na configuração protegida do servidor. Runtime autorizado pode decifrar. Exports e provedores precisam proteção separada.](/documentation/pt-BR/encryption-and-data-boundaries-flow.svg)

## Reconhecer dados legíveis e exportados {#exceptions}

O Auth mantém o email de login. Identificadores, chaves de projeto e de ticket, status, prioridades, datas e metadados permitidos continuam consultáveis. Publicações ficam legíveis por escolha de quem publica. Exporte, baixe e envie dados a provedores externos de IA, email, Git ou MCP com os controles adequados; os dados no navegador também precisam de proteção. Uma flag não comprova que o histórico foi convertido ou removido de cópias, logs e provedores. A leitura do código não demonstra que a migração de criptografia foi executada no minddy Cloud em produção.

## Preservar a recuperação {#recovery}

Proteja `MINDDY_DATA_ROOT_KEY` fora do banco e conserve o material de recuperação necessário aos backups atuais e históricos. Restaure banco, bytes e configuração juntos. Cifre o backup externo que contém tanto dados quanto chaves. Trocar a raiz sem reencapsular as chaves torna os conteúdos ilegíveis; desativar a flag não os devolve ao texto aberto. Antes de ativar a criptografia em uma instância existente, teste a recuperação e verifique a decifragem e os bytes efetivamente retornados.

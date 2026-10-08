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
  "revision": 2,
  "sourceRevision": 2,
  "owner": "@mangue-dev",
  "updatedAt": "2026-10-09",
  "compatibility": {
    "version": "0.11.1 candidate (89ebb59a5)",
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
    "revision": 2,
    "fact": "agent:/root consolidation review; agent:/root/italian_portuguese_review retained-meaning comparison with prior procedural evidence (no operational rerun)",
    "language": "agent:/root/italian_portuguese_review (localized feature scope, summaries and heading review; retained source procedures)",
    "date": "2026-10-09"
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
      "caption": "Estes componentes têm responsabilidades distintas. Conteúdo cifrado e chaves empacotadas. Raiz na configuração protegida do servidor. Runtime autorizado pode decifrar. Exports e provedores precisam proteção separada.",
      "revision": 2,
      "reviewed": true,
      "capturedAt": "2026-10-08",
      "viewport": [
        720,
        640
      ],
      "theme": "neutral"
    }
  ],
  "requiredFigures": [
    "encryption-and-data-boundaries-flow"
  ]
}
---

## Entender criptografia e dados ainda visíveis {#encryption-and-data-boundaries}

Após a configuração e a migração previstas, o minddy cifra conteúdos e arquivos antes das gravações persistentes usando criptografia autenticada no servidor. As chaves de projeto, usuário e sistema são versionadas e protegidas por uma chave raiz mantida fora do PostgreSQL. Uma cópia isolada do banco não permite ler os conteúdos protegidos sem as chaves. A aplicação os decifra para usuários autorizados, busca e trabalho de IA autorizado, inclusive sem uma sessão interativa. Um ambiente de execução comprometido ou o acesso aos dados e às chaves ultrapassa esse limite; a proteção não exclui o operador por criptografia ponta a ponta.

![Diagrama: Conteúdo cifrado e chaves empacotadas. Raiz na configuração protegida do servidor. Runtime autorizado pode decifrar. Exports e provedores precisam proteção separada.](/documentation/pt-BR/encryption-and-data-boundaries-flow.svg)

## Reconhecer dados legíveis e exportados {#exceptions}

O Auth mantém o email de login. Identificadores, chaves de projeto e issue, status, prioridades, datas e metadados permitidos continuam consultáveis. Publicações ficam legíveis por escolha de quem publica. Exporte, baixe e envie dados a provedores externos de IA, email, Git ou MCP com os controles adequados; os dados no navegador também precisam de proteção. Uma flag não comprova que o histórico foi convertido ou removido de cópias, logs e provedores. A leitura do código não demonstra que a migração de criptografia foi executada no minddy Cloud em produção.

## Preservar a recuperação {#recovery}

Proteja MINDDY_DATA_ROOT_KEY fora do banco e conserve o material de recuperação necessário aos backups atuais e históricos. Restaure banco, bytes e configuração juntos. Cifre o backup externo que contém tanto dados quanto chaves. Trocar a raiz sem reencapsular as chaves torna os conteúdos ilegíveis; desativar a flag não os devolve ao texto aberto. Antes de ativar a criptografia em uma instância existente, teste a recuperação e verifique a decifragem e os bytes efetivamente retornados.

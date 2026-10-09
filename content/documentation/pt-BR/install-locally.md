---
{
  "id": "install-locally",
  "locale": "pt-BR",
  "title": "Instâncias locais",
  "summary": "Execute uma instância local pelo app desktop, prepare os requisitos e preserve os dados ao iniciar, parar ou recuperar os serviços.",
  "topic": "Operar uma instância",
  "type": "tutorial",
  "audiences": [
    "operator"
  ],
  "workflows": [
    "H02"
  ],
  "visibility": "public",
  "status": "published",
  "revision": 6,
  "sourceRevision": 5,
  "owner": "@mangue-dev",
  "updatedAt": "2026-10-10",
  "compatibility": {
    "version": "0.11.1 candidate (89ebb59a5)",
    "editions": [
      "self-hosted"
    ],
    "profiles": [
      "full",
      "managed",
      "source",
      "local"
    ],
    "evidence": [
      "docs/self-hosting.md",
      "scripts/self-hosting-local.mjs",
      "content/knowledge/self-hosting.md",
      "content/documentation/reviews/visual-refresh-captures-2026-10-09.json",
      "content/documentation/reviews/editorial-clarity-en-fr-2026-10-09.md",
      "content/documentation/reviews/editorial-clarity-de-es-2026-10-09.md",
      "content/documentation/reviews/editorial-clarity-it-pt-BR-2026-10-09.md",
      "app/api/mcp/route.ts",
      "lib/site.ts",
      "lib/server/app-origin.ts",
      "lib/server/oauth/issuer.ts",
      "app/api/oauth/register/route.ts",
      "lib/server/oauth/metadata.ts",
      "content/documentation/reviews/premerge-it-pt-BR-2026-10-10.md",
      "content/documentation/reviews/premerge-light-review-2026-10-10.md"
    ]
  },
  "review": {
    "revision": 6,
    "fact": "agent:/root consolidation review; agent:/root/italian_portuguese_review retained-meaning comparison with prior procedural evidence (no operational rerun); agent:/root (visual usefulness, figure framing and preserved procedures; previous operational evidence retained); agent:/root (technical-reference formatting; prior factual evidence retained; no operational rerun); agent:/root (MIN-672 MCP availability and network guidance checked against route, origin, discovery, registration and local launcher source; no operational rerun); agent:/root with agent:/root/review_it_pt (light pre-merge source and retained-claim review; existing operational evidence retained; no operational rerun)",
    "language": "agent:/root/italian_portuguese_review (localized feature scope, summaries and heading review; retained source procedures); agent:/root/editorial_it_pt (editorial clarity pass); agent:/root (figure removals and captions); agent:/root/editorial_it_pt (collection-caption clarity); agent:/root (inline-code syntax and unchanged-text review); agent:/root (MIN-672 pt-BR network guidance and terminology review); agent:/root/review_it_pt with agent:/root (pt-BR pre-merge wording, correction and retained-meaning review)",
    "date": "2026-10-10"
  },
  "related": [
    "workspace-encryption",
    "self-hosted-diagnostics"
  ],
  "aliases": [],
  "tags": [
    "Executar uma instância local pelo aplicativo desktop"
  ],
  "figures": [
    {
      "id": "install-locally-flow",
      "kind": "diagram",
      "src": "/documentation/pt-BR/install-locally-flow.svg",
      "alt": "Diagrama: Aplicativo desktop seleciona clone. Aplicação loopback: porta 6463. Supabase mínimo e dados duráveis. Sair encerra o aplicativo e o backend.",
      "caption": "O aplicativo desktop controla o início e o encerramento da instância local; os dados precisam ser preservados entre as execuções.",
      "revision": 6,
      "reviewed": true,
      "capturedAt": "2026-10-10",
      "viewport": [
        720,
        640
      ],
      "theme": "neutral",
      "diagram": {
        "layout": "collection",
        "items": [
          {
            "title": "Aplicativo desktop seleciona clone"
          },
          {
            "title": "Aplicação loopback: porta 6463"
          },
          {
            "title": "Supabase mínimo e dados duráveis"
          },
          {
            "title": "Sair encerra o aplicativo e o backend"
          }
        ]
      }
    },
    {
      "id": "install-locally-wizard",
      "kind": "screenshot",
      "src": "/documentation/pt-BR/install-locally-wizard.png",
      "alt": "Assistente público de instalação com o perfil deste computador selecionado.",
      "caption": "Escolha a instalação pessoal quando o aplicativo de desktop for gerenciar os serviços locais.",
      "revision": 6,
      "reviewed": true,
      "capturedAt": "2026-10-09",
      "viewport": [
        944,
        504
      ],
      "theme": "light",
      "padding": 24,
      "deviceScaleFactor": 2
    }
  ],
  "requiredFigures": [
    "install-locally-flow"
  ]
}
---

## Executar uma instância local pelo aplicativo desktop {#install-locally}

Use um clone dedicado à avaliação com Node.js 24, `pnpm` 10.28.0, Git, Supabase CLI e Docker em execução. Reserve ao menos 4 GB de RAM livre, dois núcleos e 10 GB livres de SSD; recomendamos 8 GB, quatro núcleos e 20 GB. Instale primeiro o aplicativo assinado pela página de downloads. Windows usa Microsoft Store; macOS e Linux têm downloads próprios. Selecione no clone a versão a avaliar antes de instalar dependências.

```bash
git clone https://github.com/mangue-dev/minddy.git
cd minddy
git checkout v0.11.0
corepack enable
corepack prepare pnpm@10.28.0 --activate
pnpm install --frozen-lockfile
```


![Diagrama: Aplicativo desktop seleciona clone. Aplicação loopback: porta 6463. Supabase mínimo e dados duráveis. Sair encerra o aplicativo e o backend.](/documentation/pt-BR/install-locally-flow.svg)


![Assistente público de instalação com o perfil deste computador selecionado.](/documentation/pt-BR/install-locally-wizard.png)

## Deixar o aplicativo controlar os serviços {#launch}

Abra o menu nativo minddy. No Windows e Linux, Alt mostra a barra; no macOS, use a barra global. Abra o diálogo de conexão a servidor, escolha a opção de instância local e selecione a raiz do clone. O aplicativo executa `self-host:local --no-open`, prepara Supabase mínimo, aplica migrações e Storage, compila quando necessário e aguarda `/api/health` antes de abrir cadastro. Ele escuta apenas em loopback na porta 6463, lembra a pasta e controla inicialização e encerramento.

## Disponibilidade do MCP e acesso à rede {#mcp-network-access}

O MCP está incluído no minddy self-hosted e inicia com a aplicação. Funciona imediatamente em `/api/mcp`, na origem da instância configurada com `MINDDY_PUBLIC_APP_URL`. A descoberta OAuth e o registro dinâmico de clientes estão incluídos: não é necessário um servidor MCP separado, um aplicativo OAuth dedicado nem um proxy do minddy Cloud. Conecte o cliente MCP ao endpoint da sua instância, entre na conta e conceda acesso pelo consentimento no navegador.

A disponibilidade do serviço não garante que ele seja acessível pela rede. Tanto o cliente MCP quanto o navegador usado para autorização precisam alcançar as URLs MCP e OAuth anunciadas. Se você definir explicitamente `OAUTH_ISSUER`, essa origem também precisa ser acessível. O cliente deve aceitar a conexão, o fluxo OAuth e o caminho de rede escolhido; alguns clientes exigem HTTPS mesmo em redes privadas.

Este perfil gerenciado pelo aplicativo desktop escuta apenas na interface de loopback. Um cliente MCP compatível no mesmo computador pode usar `http://localhost:6463/api/mcp`; `localhost` e `127.0.0.1` identificam o computador que inicia a conexão. Outro computador ou um agente hospedado na nuvem não pode acessar diretamente este perfil. Para acesso por LAN/VPN, use uma instalação de servidor com uma origem configurada acessível, por exemplo `http://192.168.1.50`, e permita o acesso à porta da aplicação pelo endereço de escuta, firewall e roteamento. Fora dessa rede, o cliente precisa de uma origem HTTPS acessível como `https://tickets.example.com`, ou de outro caminho de rede aceito. A instalação local não oferece automaticamente acesso pela Internet.

[Leia a orientação de acesso à rede do MCP antes de conectar um cliente remoto](/docs/minddy-mcp#network-access).

## Recuperar após uma falha {#recover}

Fechar uma janela mantém o aplicativo desktop ativo; use o comando para sair do aplicativo para parar também os serviços locais. Se não iniciar, copie o relatório pelo menu nativo de ajuda. Confira Docker, CLI, espaço e outros processos na 6463.

`pnpm self-host:local` é uma alternativa de diagnóstico no terminal. Pare com Ctrl+C antes de devolver o controle ao aplicativo, que não assume processos alheios. Sair do aplicativo normalmente também para Supabase; `--keep-backend` muda isso explicitamente.

Nunca use `supabase db reset --local` para recuperar dados: ele apaga os dados de avaliação. Teste conta nova, projeto, issue e anexo antes de confiar na instância.

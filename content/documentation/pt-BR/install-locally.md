---
{
  "id": "install-locally",
  "locale": "pt-BR",
  "title": "Executar uma instância local pelo aplicativo desktop",
  "summary": "Use um clone dedicado à avaliação com Node.js 24, pnpm 10.28.0, Git, Supabase CLI e Docker em execução.",
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
  "revision": 1,
  "sourceRevision": 1,
  "owner": "@mangue-dev",
  "updatedAt": "2026-10-08",
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
      "content/knowledge/self-hosting.md"
    ]
  },
  "review": {
    "revision": 1,
    "fact": "agent:/root/automation_account_documentation (independent primary-source and final correction review)",
    "language": "agent:/root/automation_account_documentation (complete independent article and final correction review)",
    "date": "2026-10-08"
  },
  "related": [
    "workspace-encryption",
    "self-hosted-diagnostics"
  ],
  "aliases": [],
  "tags": [],
  "figures": [
    {
      "id": "install-locally-flow",
      "kind": "diagram",
      "src": "/documentation/pt-BR/install-locally-flow.svg",
      "alt": "Diagrama: Aplicativo desktop seleciona clone. Aplicação loopback: porta 6463. Supabase mínimo e dados duráveis. Sair para aplicativo e backend.",
      "caption": "Estes componentes têm responsabilidades distintas. Aplicativo desktop seleciona clone. Aplicação loopback: porta 6463. Supabase mínimo e dados duráveis. Sair para aplicativo e backend.",
      "revision": 1,
      "reviewed": true,
      "capturedAt": "2026-10-08",
      "viewport": [
        720,
        640
      ],
      "theme": "neutral"
    },
    {
      "id": "install-locally-wizard",
      "kind": "screenshot",
      "src": "/documentation/pt-BR/install-locally-wizard.png",
      "alt": "Assistente público de instalação com o perfil deste computador selecionado.",
      "caption": "Escolha a instalação pessoal quando o aplicativo de desktop for gerenciar os serviços locais.",
      "revision": 1,
      "reviewed": true,
      "capturedAt": "2026-10-08",
      "viewport": [
        1280,
        1100
      ],
      "theme": "light"
    }
  ],
  "requiredFigures": [
    "install-locally-flow"
  ]
}
---

## Executar uma instância local pelo aplicativo desktop {#install-locally}

Use um clone dedicado à avaliação com Node.js 24, pnpm 10.28.0, Git, Supabase CLI e Docker em execução. Reserve ao menos 4 GB de RAM livre, dois núcleos e 10 GB livres de SSD; recomendamos 8 GB, quatro núcleos e 20 GB. Instale primeiro o aplicativo assinado pela página de downloads. Windows usa Microsoft Store; macOS e Linux têm downloads próprios. Selecione no clone a versão a avaliar antes de instalar dependências.

```bash
git clone https://github.com/mangue-dev/minddy.git
cd minddy
git checkout v0.11.0
corepack enable
corepack prepare pnpm@10.28.0 --activate
pnpm install --frozen-lockfile
```


![Diagrama: Aplicativo desktop seleciona clone. Aplicação loopback: porta 6463. Supabase mínimo e dados duráveis. Sair para aplicativo e backend.](/documentation/pt-BR/install-locally-flow.svg)


![Assistente público de instalação com o perfil deste computador selecionado.](/documentation/pt-BR/install-locally-wizard.png)

## Deixar o aplicativo controlar os serviços {#launch}

Abra o menu nativo minddy. No Windows e Linux, Alt mostra a barra; no macOS, use a barra global. Abra o diálogo de conexão a servidor, escolha a opção de instância local e selecione a raiz do clone. O aplicativo executa self-host:local --no-open, prepara Supabase mínimo, aplica migrações e Storage, compila quando necessário e aguarda /api/health antes de abrir cadastro. Ele escuta apenas em loopback na porta 6463, lembra a pasta e controla inicialização e encerramento.

## Recuperar após uma falha {#recover}

Fechar uma janela mantém o aplicativo desktop ativo; use o comando para sair do aplicativo para parar também os serviços locais. Se não iniciar, copie o relatório pelo menu nativo de ajuda. Confira Docker, CLI, espaço e outros processos na 6463. pnpm self-host:local é uma alternativa de diagnóstico no terminal. Pare com Ctrl+C antes de devolver o controle ao aplicativo, que não assume processos alheios. Sair do aplicativo normalmente também para Supabase; --keep-backend muda isso explicitamente. Nunca use supabase db reset --local para recuperar dados: ele apaga os dados de avaliação. Teste conta nova, projeto, issue e anexo antes de confiar na instância.

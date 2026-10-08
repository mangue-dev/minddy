---
{
  "id": "ai-keys-and-models",
  "locale": "pt-BR",
  "title": "Configurar chaves pessoais de IA e modelos",
  "summary": "Escolher provedores e usos considerando cobrança e processamento da sandbox.",
  "topic": "Conta e aplicativos",
  "type": "guide",
  "audiences": [
    "member"
  ],
  "workflows": [
    "A04"
  ],
  "visibility": "public",
  "status": "published",
  "revision": 4,
  "sourceRevision": 3,
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
      "content/knowledge/plans-and-billing.md",
      "components/settings/account-ai-keys-section.tsx",
      "components/settings/account-sandbox-section.tsx",
      "content/documentation/reviews/remaining-account-capture-candidates.json",
      "lib/server/agent/model.ts",
      "lib/server/ai-runtime.ts",
      "lib/server/agent/quota.ts",
      "lib/server/usage.ts",
      "lib/server/agent/execute.ts"
    ]
  },
  "review": {
    "revision": 4,
    "fact": "2026-10-08",
    "language": "2026-10-08",
    "date": "2026-10-08"
  },
  "related": [],
  "aliases": [],
  "tags": [],
  "figures": [
    {
      "id": "ai-keys-and-models-workflow",
      "kind": "screenshot",
      "src": "/documentation/pt-BR/ai-keys-and-models-workflow.png",
      "alt": "Cartão do provedor de IA com minddy Cloud selecionado.",
      "caption": "O provedor Cloud selecionado usa o plano da conta. O seletor permite configurar provedores pessoais.",
      "revision": 4,
      "reviewed": true,
      "capturedAt": "2026-10-08",
      "viewport": [
        1440,
        1800
      ],
      "theme": "light"
    },
    {
      "id": "ai-keys-and-models-defaults-workflow",
      "kind": "screenshot",
      "src": "/documentation/pt-BR/ai-keys-and-models-defaults-workflow.png",
      "alt": "Modelo de código e raciocínio padrão.",
      "caption": "Modelo de código e raciocínio padrão. Novos workers usam esses valores; os que estão em execução mantêm as configurações fixadas.",
      "revision": 4,
      "reviewed": true,
      "capturedAt": "2026-10-08",
      "viewport": [
        1440,
        1800
      ],
      "theme": "light"
    }
  ],
  "requiredFigures": [
    "ai-keys-and-models-workflow",
    "ai-keys-and-models-defaults-workflow"
  ]
}
---

## Adicionar e atribuir um provedor {#ai-keys-and-models}

Abra as configurações de IA da conta, adicione um provedor compatível e informe a chave e a URL de base, quando exigida. Salve e confira o estado de confirmação. Nas chamadas de IA com alternativa gerenciada disponível, uma chave não confirmada ou inacessível mantém o consumo no Minddy. Isso exige IA gerenciada configurada; os workers de código seguem as regras de modelo vinculado ao provedor descritas abaixo. Nunca cole a chave em uma conversa ou captura de tela.

Associe as famílias de modelos de texto, transcrição e embeddings a chaves compatíveis ou mantenha-as no Minddy. Para cada chave, escolha os usos habilitados: conversas do Numo, trabalho de código, automações, voz e feedback. Um uso ou uma família sem associação utilizável continua consumindo a cota do Minddy. O provedor cobra as chamadas feitas com a chave dele. O processamento da sandbox no servidor continua tendo um custo real e é registrado no uso. Esse registro é separado da aplicação de um limite da conta: um worker com BYOK validado não está sujeito à cota do plano nem ao limite de processamento, enquanto o trabalho financiado pelo Minddy continua sujeito à franquia incluída.

![Cartão do provedor de IA com minddy Cloud selecionado.](/documentation/pt-BR/ai-keys-and-models-workflow.png)


## Modelos e local de execução {#models}

A escolha do modelo de código está vinculada ao provedor. Depois de alterar, desativar ou perder uma chave pessoal, a escolha anterior pode deixar de corresponder ao provedor ativo. Nesse caso, um novo worker recusa o início até que você escolha um modelo compatível nas configurações de IA da conta; ele não seleciona automaticamente um modelo mais barato nem um padrão da plataforma. Uma execução BYOK já fixada não muda quem paga quando sua chave fica indisponível.

Defina aqui o modelo de código e o nível de raciocínio padrão dos novos workers. Os workers existentes mantêm o nível de raciocínio fixado quando foram criados. Escolha separadamente a região e o tamanho das novas sandboxes. Esses padrões não substituem o modelo selecionado em uma conversa.

Quando configurados, o Ollama local e endpoints compatíveis com OpenAI podem atender às conversas pela ponte do aplicativo desktop. Eles não podem atender ao trabalho delegado de código nem às rotinas executadas na sandbox do servidor. Para esses usos, escolha um provedor acessível pelo servidor. Remova um provedor pelo controle de confirmação quando ele não for mais necessário e confira o roteamento resultante antes da próxima execução.

![Modelo de código e raciocínio padrão.](/documentation/pt-BR/ai-keys-and-models-defaults-workflow.png)

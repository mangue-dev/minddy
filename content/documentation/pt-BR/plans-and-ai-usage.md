---
{
  "id": "plans-and-ai-usage",
  "locale": "pt-BR",
  "title": "Entender planos Cloud e consumo de IA",
  "summary": "Conferir capacidade atual e separar cota, provedores e infraestrutura.",
  "topic": "Conta e aplicativos",
  "type": "explanation",
  "audiences": [
    "member"
  ],
  "workflows": [
    "A08"
  ],
  "visibility": "public",
  "status": "published",
  "revision": 3,
  "sourceRevision": 2,
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
      "app/(app)/billing/page.tsx",
      "app/(marketing)/pricing/page.tsx",
      "lib/billing-plans.ts",
      "content/documentation/reviews/remaining-account-capture-candidates.json",
      "lib/server/agent/quota.ts",
      "lib/server/usage.ts",
      "lib/server/agent/execute.ts"
    ]
  },
  "review": {
    "revision": 3,
    "fact": "2026-10-08",
    "language": "2026-10-08",
    "date": "2026-10-08"
  },
  "related": [
    "ai-keys-and-models",
    "scheduled-routines"
  ],
  "aliases": [
    "plans-and-billing"
  ],
  "tags": [],
  "figures": [
    {
      "id": "plans-and-ai-usage-workflow",
      "kind": "screenshot",
      "src": "/documentation/pt-BR/plans-and-ai-usage-workflow.png",
      "alt": "Página de uso de IA da conta de demonstração.",
      "caption": "Página de uso de IA da conta de demonstração. O orçamento, as categorias e o histórico são lidos da conta; nenhuma compra ou execução paga foi iniciada.",
      "revision": 3,
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
    "plans-and-ai-usage-workflow"
  ]
}
---

## Comparar a conta atual {#plans-and-ai-usage}

O Cloud oferece os planos Free, Go e Pro. Todos incluem MCP, conversas do Numo, ações contextuais, trabalho de código e rotinas. A capacidade, o uso de IA incluído, os modelos e o armazenamento variam. Abra Cobrança para consultar seu saldo e consumo atuais e compare a página pública de preços antes de escolher um plano; os valores publicados ali são a referência atual.

Use a opção de contratação ou de gerenciamento de assinatura oferecida à sua conta. Confira o valor, o período de cobrança e a confirmação do provedor antes de aceitar. Uma mudança de plano bem-sucedida deve aparecer na cobrança da conta; verifique esse estado, em vez de tratar o fechamento da janela de pagamento como uma prova.


## Consumo do orçamento {#consumption}

O uso de IA incluído cobre raciocínio, chamadas às ferramentas do Minddy, automações, chamadas ao modelo do worker e processamento da sandbox no servidor. O limite mensal de IA incluída se aplica ao trabalho financiado pelo Minddy. O teto por execução de uma rotina é um limite separado que pode pausar essa execução; o trabalho concluído continua na conversa. Esses limites não autorizam cobranças automáticas por excedentes. Confira o cartão de limite e a data de redefinição do orçamento quando estiver disponível.

As chaves pessoais compatíveis fazem o provedor cobrar as chamadas aos modelos, em vez de consumir o uso de IA incluído. Um worker que usa uma chave BYOK validada não está sujeito à cota do plano nem ao limite de processamento da conta. O processamento da sandbox continua tendo um custo real e é registrado no uso; esse registro não significa que o limite mensal do plano se aplique a essa execução BYOK. Famílias ou usos não associados cujas chamadas são financiadas pelo Minddy continuam sujeitos à sua franquia Minddy. O self-hosting tem custos de infraestrutura e de provedores opcionais definidos pela instalação; executar o mesmo núcleo não o transforma em uma assinatura Cloud.

## Capacidades da versão candidata {#plan-capacities}

Estes padrões descrevem a versão candidata 0.11.1 identificada. Confira a página de preços e a conta reais antes de comprar: os preços configurados no pagamento e as exceções da conta podem ser diferentes. A contagem de convidados exclui o proprietário do projeto. O armazenamento é contabilizado para o proprietário do projeto que recebe os arquivos.

| Plano | Projetos | Tarefas por projeto | Convidados por projeto | Armazenamento | IA mensal incluída (USD) |
| --- | --- | --- | --- | --- | --- |
| Free | 2 | 300 | 3 | 1 GiB | 0.50 |
| Go | Ilimitados | Ilimitadas | Ilimitados | 20 GiB | 5 |
| Pro | Ilimitados | Ilimitadas | Ilimitados | 100 GiB | 15 |

![Página de uso de IA da conta de demonstração.](/documentation/pt-BR/plans-and-ai-usage-workflow.png)

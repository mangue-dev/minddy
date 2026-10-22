---
{
  "id": "instance-administration",
  "locale": "pt-BR",
  "title": "Administração da instância",
  "summary": "Acesse a administração com MFA, use os controles disponíveis e diferencie administração da instância e propriedade do projeto.",
  "topic": "Operar uma instância",
  "type": "guide",
  "audiences": [
    "operator"
  ],
  "workflows": [
    "H16"
  ],
  "visibility": "public",
  "status": "published",
  "revision": 10,
  "sourceRevision": 9,
  "owner": "@mangue-dev",
  "updatedAt": "2026-10-22",
  "compatibility": {
    "version": "0.20.0 (MIN-747 release review)",
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
      "app/(app)/admin/page.tsx",
      "app/(app)/admin/layout.tsx",
      "components/admin/admin-dashboard.tsx",
      "lib/admin-tabs.ts",
      "lib/server/admin.ts",
      "docs/self-hosting-auth.md",
      "lib/ai-model-config.ts",
      "app/api/admin/app-config/route.ts",
      "lib/server/decisions/model-validation.ts",
      "lib/server/issue-relation-inference.ts",
      "lib/server/model-capability-validation.ts",
      "app/api/cron/issue-index/route.ts",
      "lib/server/issue-semantic-search.ts"
    ]
  },
  "review": {
    "revision": 10,
    "fact": "agent:/root/min747 (0.20.0 release review: source audit against the v0.11.0..main delta, verified corrections applied; no screenshot in scope; both screenshots recaptured on 2026-10-20 with captures/shots/documentation-admin and the preview-only capture admin (MIN-740); no browser walkthrough of the procedures or operator rehearsal; earlier evidence retained in git history); agent:claude-code (MIN-762 UI label and terminology correction: pt-BR labels aligned on the corrected catalog and the ticket term; no behavior change, no new captures)",
    "language": "agent:/root/min747 (pt-BR translation of the release corrections with catalog UI labels; equivalent meaning self-reviewed; agent review, not human acceptance); agent:claude-code (pt-BR MIN-762 terminology edit; self-reviewed; agent review, not human acceptance)",
    "date": "2026-10-22"
  },
  "related": [
    "authentication-and-email",
    "instance-configuration"
  ],
  "aliases": [],
  "tags": [
    "Usar a administração da instância"
  ],
  "figures": [
    {
      "id": "instance-administration-flow",
      "kind": "screenshot",
      "src": "/documentation/pt-BR/instance-administration-overview.png",
      "alt": "Visão geral administrativa com indicadores agregados de contas, atividade, integração inicial e planos.",
      "caption": "Visão geral mostra os indicadores agregados da instância; a captura vem de uma instância de demonstração. Finanças aparece porque há uma chave gerenciada do OpenRouter configurada nela.",
      "revision": 10,
      "reviewed": true,
      "capturedAt": "2026-10-20",
      "viewport": [
        1488,
        1148
      ],
      "theme": "light",
      "padding": 24
    },
    {
      "id": "instance-administration-models",
      "kind": "screenshot",
      "src": "/documentation/pt-BR/instance-administration-models.png",
      "alt": "Configurações de modelos de IA e raciocínio da instância.",
      "caption": "Modelos configura padrões e usos específicos. A captura mostra a configuração existente; nenhum modelo ou provedor foi alterado.",
      "revision": 10,
      "reviewed": true,
      "capturedAt": "2026-10-20",
      "viewport": [
        1488,
        1148
      ],
      "theme": "light",
      "padding": 24
    }
  ],
  "requiredFigures": [
    "instance-administration-flow"
  ]
}
---

## Usar a administração da instância {#instance-administration}

Administrar a instância é diferente de ser proprietário de um projeto. `ADMIN_EMAILS` lista as contas confirmadas autorizadas no servidor; `app_metadata.role=admin` assinado também é uma fonte válida. São exigidos `aal2`, MFA verificada e verificações atuais de conta e sessão. Se elas falham, o acesso é negado. Entre, complete TOTP e abra `/admin`. Não altere papéis no banco para contornar MFA. O console e as APIs privadas continuam `noindex`.


![Visão geral administrativa com indicadores agregados de contas, atividade, integração inicial e planos.](/documentation/pt-BR/instance-administration-overview.png)

![Configurações de modelos de IA e raciocínio da instância.](/documentation/pt-BR/instance-administration-models.png)

## Usar os controles disponíveis {#panels}

O console inclui Visão geral, Usuários, Modelos e, quando disponível, Finanças. Finanças fica oculto sem OpenRouter gerenciado; a atribuição de plano depende da cobrança habilitada ou de um override já existente. Abrir o console não acrescenta cobrança Cloud a uma instância própria sem provedores comerciais. **Usuários** encontra uma conta apenas pelo endereço de e-mail exato; abra-a para ver o status de confirmação do e-mail, consultar ou redefinir o orçamento de uso de IA, oferecer um plano na condição acima ou marcá-la como conta interna, o que a exclui de todas as estatísticas. O painel não mostra a atividade da conta nem seu conteúdo pessoal; abra uma conta somente para uma tarefa de suporte ou de cobrança. Confira modelos, padrões, usuários e quotas na versão instalada antes de alterar. As mudanças afetam toda a instância: valide com uma conta de demonstração.

## Escolher o modelo de decisão de IA {#decision-model}

Em **Modelos**, seção **Automações**, **Modelo de decisão** define o único modelo de decisão que responde a todas as decisões de IA da instância: Smart Fill, Smart Assign e a revisão de feedback. Não há escolha por projeto, por usuário ou por recurso. O seletor só lista modelos do OpenRouter que publicam a capacidade de decisão; modelos de chat, embedding e transcrição nunca aparecem. Ao salvar, o candidato é testado com uma decisão representativa. Um modelo que não é de decisão, recusa a solicitação, devolve uma resposta inválida ou leva mais de 5 segundos é recusado, e o modelo atual continua em uso. Quando o catálogo não pode ser carregado, toda alteração é recusada. Instâncias auto-hospedadas sem IA gerenciada não têm catálogo da plataforma e mantêm o padrão, Jev.

Novas decisões usam o modelo salvo em cerca de um minuto em cada processo do servidor. Quando o modelo falha ou responde abaixo do limite de confiança, a decisão recorre ao modelo LLM próprio do recurso, como antes. O limite foi calibrado no Jev e outros modelos de decisão distribuem a confiança de outra forma: após uma troca, confira a concordância por modelo na visão de banco de dados `ai_decision_evaluations_weekly`. As linhas de uso registram o modelo que respondeu.

## Configurar as relações do Smart Fill {#smart-fill-relations}

Depois que um ticket é salvo, o Smart Fill pode indexá-lo e vinculá-lo a tickets relacionados. Dois campos em **Modelos**, seção **Automações**, controlam esse trabalho:

- **Embeddings de tickets** escolhe o modelo que transforma o título e a descrição dos tickets em vetores. O padrão é `openai/text-embedding-3-small`. Trocá-lo inicia uma nova versão do índice: vetores antigos e novos nunca são comparados. A tarefa de hora em hora `/api/cron/issue-index` indexa então os tickets existentes, 100 por execução, cobrando o proprietário de cada projeto; ela nunca cria relações. O mesmo modelo transforma em vetor cada consulta da busca pelo sentido, com as configurações do provedor de IA do membro que busca, e as consultas só são comparadas com vetores da versão atual do índice. Até que um ticket seja indexado de novo, a busca de tickets relacionados e a busca pelo sentido só o encontram pelas palavras. A mesma tarefa converte em vetores criptografados os salvos sem criptografia assim que o projeto deles passa a criptografar.
- **Modelo de decisão de relações** é o modelo LLM de reserva que responde às decisões de relação quando o [modelo de decisão](#decision-model) falha ou não tem certeza, como o modelo LLM próprio de cada recurso. O padrão é `deepseek/deepseek-v4-flash`.

Os campos de embedding e de transcrição recusam ao salvar um modelo da família errada, por exemplo um modelo de chat em um campo de embeddings, e o modelo atual continua em uso. Essa verificação precisa do catálogo da plataforma: quando ele não pode ser carregado, como em uma instância auto-hospedada sem IA gerenciada, a escolha não pode ser verificada e é aceita. Para membros que executam automações com a própria chave, os padrões por provedor incluem `issue_embedding_model`: `text-embedding-3-small` para OpenAI e `gemini-embedding-001` para Google.

## Manter responsabilidades operacionais {#responsibilities}

Privilégios mínimos, recuperação MFA, segredos, backup, retenção, incidentes e custos continuam sob sua responsabilidade. O console não substitui a restauração de banco e Storage nem a configuração SMTP. Se o acesso for recusado, confira email confirmado, allowlist, MFA e sessão antes de mudar a configuração. Uma sessão revogada ou conta bloqueada não conserva privilégios por ainda ter um JWT válido. Evite capturas com dados privados de outras pessoas, fatores MFA ou detalhes financeiros.

---
{
  "id": "choose-an-instance",
  "locale": "pt-BR",
  "title": "Instâncias Cloud e auto-hospedadas",
  "summary": "Compare quem opera o serviço, para onde os dados vão e quais provedores opcionais você configura.",
  "topic": "Primeiros passos",
  "type": "explanation",
  "audiences": [
    "member",
    "operator"
  ],
  "workflows": [
    "S07"
  ],
  "visibility": "public",
  "status": "published",
  "revision": 6,
  "sourceRevision": 6,
  "owner": "@mangue-dev",
  "updatedAt": "2026-10-20",
  "compatibility": {
    "version": "0.20.0 (MIN-747 release review)",
    "editions": [
      "Cloud",
      "self-hosted"
    ],
    "profiles": [
      "Cloud",
      "self-hosted"
    ],
    "evidence": [
      "docs/editions.md",
      "content/knowledge/open-source.md",
      "docs/self-hosting-distribution.md",
      "app/(marketing)/self-hosting/install/page.tsx",
      "lib/public-routes.ts"
    ]
  },
  "review": {
    "revision": 6,
    "fact": "agent:/root/min747 (0.20.0 release review: source audit against the v0.11.0..main delta, verified corrections applied; no screenshot in scope; no browser walkthrough of the procedures or operator rehearsal; earlier evidence retained in git history)",
    "language": "agent:/root/min747 (pt-BR translation of the release corrections with catalog UI labels; equivalent meaning self-reviewed; agent review, not human acceptance)",
    "date": "2026-10-20"
  },
  "related": [
    "installation",
    "transfer-between-instances",
    "architecture-and-data-flows"
  ],
  "aliases": [
    "open-source"
  ],
  "tags": [
    "Escolher o Cloud ou sua própria instância"
  ],
  "figures": [],
  "requiredFigures": []
}
---

## Escolher um modelo de operação {#choose-an-instance}

O minddy Cloud e o minddy auto-hospedado executam o mesmo núcleo público. Escolha o Cloud se quiser que o minddy opere a aplicação, o banco de dados, o Storage e o agendador. Escolha a hospedagem própria se precisar controlar o local de hospedagem, os provedores ou o calendário de atualizações e puder operar esses serviços.

Uma conta Cloud pertence ao Cloud. Em uma instância auto-hospedada, crie uma conta nessa instância; uma conta do minddy Cloud não é necessária. Confira o endereço antes de entrar ou convidar alguém. Duas instâncias do minddy não compartilham contas nem credenciais automaticamente.


## Responsabilidades e custos {#responsibilities}

| Responsabilidade | Cloud | Hospedagem própria |
| --- | --- | --- |
| Infraestrutura, atualizações e incidentes | O minddy opera o serviço. | Você mantém os servidores, TLS, monitoramento e atualizações de versões. |
| Backups e recuperação | O minddy opera o serviço Cloud. | Você preserva os dados do banco, os arquivos do Storage, a configuração e as chaves de criptografia, e testa restaurações. |
| Contas de provedores | O minddy mantém as contas dos serviços que opera. | Você escolhe e paga a infraestrutura e os provedores opcionais. |
| Suporte | Aplicam-se os termos de suporte do Cloud. | As ferramentas de versão e a ajuda da comunidade, conforme disponibilidade, cobrem defeitos reproduzíveis do núcleo; não há SLA incluído para operar sua infraestrutura. |

Por exemplo, uma equipe sem capacidade para operar bancos de dados pode usar o Cloud. Um operador com requisitos de residência dos dados pode escolher a hospedagem própria e revisar os destinos de cada provedor habilitado. Hospedar a aplicação não torna local um provedor externo de IA, e-mail ou Git.

## Serviços necessários e opcionais {#services}

Uma instalação compatível precisa da aplicação e do Supabase com PostgreSQL, Auth, Storage e Realtime. Apenas PostgreSQL não é suficiente. Use uma versão com tag e sua matriz de compatibilidade. Variantes derivadas do Supabase sem versão fixada e adaptadores autogerenciados para GitHub Enterprise ou GitLab estão fora do contrato suportado.

IA, e-mail, Git, notificações push e análise de uso dependem da configuração. A hospedagem própria não exige Stripe, PostHog, uma chave de IA gerenciada pelo minddy nem uma conta Cloud. A configuração opcional ausente é informada, sem substituição silenciosa por um provedor. Chaves pessoais de IA e, no aplicativo de desktop, endpoints locais de IA são opções possíveis; disponibilidade e custos dependem da capacidade configurada.

Revise as permissões e os termos sobre dados antes de habilitar uma integração. As conexões Git podem usar o relay gerenciado para forjas quando você inicia explicitamente a integração; aplicativos próprios do provedor e a desativação do relay também estão disponíveis. A hospedagem própria não é uma categoria reduzida das funções do núcleo.

## Fonte e próximo passo {#next-step}

O repositório oficial é [`mangue-dev/minddy`](https://github.com/mangue-dev/minddy), sob GNU AGPL v3.0 exclusivamente. Respeite a licença e a política de nomes em instalações modificadas ou hospedadas. Para instalar, comece pelo [assistente de hospedagem própria passo a passo](/pt-br/auto-hospedagem/instalar). Consulte a [referência de instalação](/pt-br/documentacao/installation) para detalhes técnicos e verificações adicionais. Antes de transferir trabalho existente, consulte o guia de transferência entre instâncias: credenciais e assinaturas não são transferidas com os dados da conta.

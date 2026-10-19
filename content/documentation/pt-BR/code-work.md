---
{
  "id": "code-work",
  "locale": "pt-BR",
  "title": "Trabalho de código e pull requests",
  "summary": "Entregue um problema ao seu próprio agente de código com um prompt copiado e o MCP do minddy, depois revise e faça o merge da pull request vinculada.",
  "topic": "Numo e integrações",
  "type": "guide",
  "audiences": [
    "member"
  ],
  "workflows": [
    "N03",
    "N04"
  ],
  "visibility": "public",
  "status": "published",
  "revision": 15,
  "sourceRevision": 15,
  "owner": "@mangue-dev",
  "updatedAt": "2026-10-19",
  "compatibility": {
    "version": "0.11.1 candidate; MIN-721 removal of Numo code work (copied prompts and MCP for external agents, pull request review and merge retained); MIN-685 sidebar context menus; MIN-693 project roles; MIN-718 hybrid issue search; MIN-737 account settings reorganization",
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
      "components/agent/use-agent-menu-actions.tsx",
      "components/agent/custom-prompt-dialog.tsx",
      "components/settings/account-preferences-section.tsx",
      "components/pull-requests/pr-detail.tsx",
      "components/pull-requests/pr-unresolved-conversations.tsx",
      "lib/server/agent/pr-mention.ts",
      "content/documentation/reviews/min-721-code-work-removal-2026-10-16.md",
      "components/pull-requests/pr-context-actions.tsx",
      "lib/pr-context-menu.ts",
      "content/documentation/reviews/min-685-sidebar-context-actions.md",
      "docs/security/project-roles.md",
      "lib/project-roles.ts",
      "content/documentation/reviews/min-693-project-roles.md",
      "components/pull-requests/pr-link-issue.tsx",
      "content/documentation/reviews/min-718-hybrid-issue-search.md",
      "components/pull-requests/pr-link-target-picker.tsx",
      "lib/bulk-pull-request-links.ts",
      "components/settings/account-issues-section.tsx",
      "content/documentation/reviews/min-737-settings-reorganization.md"
    ]
  },
  "review": {
    "revision": 15,
    "fact": "agent:/root consolidation review; agent:/root/italian_portuguese_review retained-meaning comparison with prior procedural evidence (no operational rerun); agent:/root (visual usefulness, figure framing and preserved procedures; previous operational evidence retained); agent:/root/native_hosting_terms (private worker selection controls and fail-closed recovery source/UI-test review; no paid Claude execution or new provider rehearsal claimed); agent:/root/native_identity_docs (frozen identity and proactive context source review; prior operational evidence retained, no new provider execution); agent:/root (account organization and official hosted-auth restriction source review; no provider rerun); agent:/root (native model controls and frozen launch source review; live auth outcomes recorded separately); agent:/root (worker card, explicit validation, PR handoff and footer source/component review; no new provider execution); agent:/root/min721_docs (MIN-721 source review inherited from en revision 9; pt-BR translation of removal edits; no operational rerun); agent:/root (MIN-685 sidebar context menu source review inherited from en revision 10; pt-BR translation of added passages; no operational rerun); agent:/root (MIN-693 project roles: decision record, permission matrix and source review; no browser walkthrough, no new captures; unchanged evidence retained); agent:/root (MIN-718 hybrid issue search source and unit-test review; no browser walkthrough, no new captures; unchanged evidence retained); agent:/root (board pull request linking and card merge readiness: source and unit-test review of use-issue-menu-actions, pr-link-target-picker, bulk-pull-request-links and issue-pr-context; no browser walkthrough with a live pull request, no new captures; unchanged evidence retained); agent:/root (bulk link rule, unlink from all pull requests and optimistic links: source and unit-test review of bulk-pull-request-links and use-link-issues-to-pull-request; no browser walkthrough with live pull requests; unchanged evidence retained); agent:/root (MIN-737 account settings reorganization: source review of the Starting an issue card in components/settings/account-issues-section.tsx; unchanged evidence retained; no browser walkthrough, no new captures)",
    "language": "agent:/root/italian_portuguese_review (localized feature scope, summaries and heading review; retained source procedures); agent:/root/native_hosting_terms (localized worker selection additions and equivalent meaning; agent review, no human acceptance claimed); agent:/root/native_identity_docs (localized additions and complete equivalent meaning; agent review, no human acceptance claimed); agent:/root (complete six-locale meaning review; agent review, not human acceptance); agent:/root (six-locale model-control meaning review; not human acceptance); agent:/root (six-locale card controls and delivery wording review; not human acceptance); agent:/root/min721_pt-BR (pt-BR translation of MIN-721 removal edits, equivalent meaning reviewed; agent review, not human acceptance); agent:/root (pt-BR translation of MIN-685 added passages with catalog UI labels, equivalent meaning self-reviewed; agent review, not human acceptance); agent:/root/min693_pt-BR with agent:/root (pt-BR MIN-693 translation of the changed passages, localized labels and retained-meaning review; agent review, not human acceptance); agent:/root (pt-BR translation of MIN-718 added passages with catalog UI labels, equivalent meaning self-reviewed; agent review, not human acceptance); agent:/root (pt-BR board pull request linking paragraph, catalog UI labels and retained-meaning self-review; agent review, not human acceptance); agent:/root (pt-BR added sentences, catalog UI labels and retained-meaning self-review; agent review, not human acceptance); agent:/root (pt-BR MIN-737 changed passages with catalog UI labels; retained-meaning self-review; agent review, not human acceptance)",
    "date": "2026-10-19"
  },
  "related": [
    "issues",
    "minddy-mcp",
    "git"
  ],
  "aliases": [
    "delegate-code-work",
    "plans-and-agents",
    "review-pull-requests"
  ],
  "tags": [
    "Entregar um problema a um agente de código externo",
    "Revisar uma pull request vinculada"
  ],
  "figures": [
    {
      "id": "review-pull-requests-workflow",
      "kind": "screenshot",
      "src": "/documentation/pt-BR/review-pull-requests-workflow.png",
      "alt": "Aba Alterações do PR de demonstração aberto, com o diff de greeting e um aviso de autorização do GitHub indisponível.",
      "caption": "PR de demonstração que permanece aberto, sem merge. O diff remove os espaços ao redor do nome e usa World quando o valor é vazio. Esta instância não pode solicitar autorização de usuário do GitHub; a indicação de prontidão não concede permissão de merge nem comprova que a CI do provedor passou.",
      "revision": 15,
      "reviewed": true,
      "capturedAt": "2026-10-08",
      "viewport": [
        1528,
        1148
      ],
      "theme": "light",
      "padding": 24
    }
  ],
  "requiredFigures": [
    "review-pull-requests-workflow"
  ]
}
---

O Minddy acompanha o trabalho; seu próprio agente de código, como Claude Code, Codex ou Cursor, altera o código. Copie um prompt a partir do problema, deixe o agente ler e atualizar o problema pelo MCP do minddy e depois revise a pull request vinculada no Minddy antes do merge. O Numo não escreve código, não abre branches nem executa testes.

## Entregar um problema a um agente de código externo {#external-coding-agents}

Primeiro, conecte seu agente ao MCP do minddy para que ele possa ler o plano e atualizar suas tarefas; consulte [Conectar um assistente externo ao MCP do minddy](/docs/minddy-mcp#external-minddy-mcp). O agente é executado no seu computador ou no próprio serviço, com assinatura ou custos de API próprios. O Minddy não fornece a ele acesso ao repositório.

1. Abra o problema e descreva o comportamento esperado, as restrições e as verificações de aceitação. Escreva ou revise o plano na aba do plano quando o trabalho tiver várias etapas.
2. Abra o menu de ações do problema e escolha **Copiar como prompt**. Escolha **Gerar um plano** (ou **Revisar o plano** quando já existir um) para delimitar o trabalho sem programar, **Implementar o problema** para iniciar a alteração, **Verificar a implementação** para que o agente revise o trabalho concluído com base no plano e nos comentários, ou **Personalizado…** para escrever sua própria instrução.
3. Cole o prompt no agente, na cópia de trabalho do repositório. Copiar não executa nenhum modelo de IA nem consome sua cota de IA.
4. Acompanhe o progresso do plano no problema enquanto o agente atualiza as tarefas pelo MCP. Responda às perguntas dele no próprio agente ou registre as decisões no problema para que o próximo prompt as inclua.

O conteúdo do prompt, a sugestão de branch e as regras de idioma estão descritos em [Copiar um prompt para outro agente de código](/docs/issues#copy-issue-prompt).

### Manter o trabalho vinculado ao problema {#link-work}

Quando o repositório estiver vinculado ao projeto, mantenha o identificador do problema no nome da branch, no título da pull request ou em uma linha `Fixes MIN-42`. Assim o Minddy anexa a pull request ao problema, e os prompts seguintes pedem ao agente que continue a pull request aberta na branch dela. Para anexar um problema manualmente, use **Vincular um problema** na pull request. A busca aceita um identificador ou palavras do título, e uma descrição também lista problemas do projeto encontrados [pelo sentido](/docs/navigation#search-by-meaning) em **Relacionados pelo sentido**.

Em um quadro, clique com o botão direito em um problema sem pull request aberto e escolha **Vincular a um pull request** para escolher um dos pull requests abertos do projeto. Com vários problemas selecionados, **Ações** oferece a mesma opção para toda a seleção, além de **Vincular os outros problemas a #N** quando alguns já têm o pull request N. **Vincular a um pull request** deixa de ser oferecido assim que um problema selecionado tem algum pull request vinculado; **Desvincular N problemas dos seus pull requests** remove primeiro todos os vínculos da seleção. Os vínculos aparecem na hora nos cartões, e um vínculo recusado some quando o quadro é atualizado. Um cartão com um pull request aberto mostra o número dele, colorido conforme o estado, e sua prontidão para merge, o mesmo indicador da **Revisão de código**.

Em **Configurações da conta → Tickets → Iniciar um ticket**, **Iniciar o problema ou tarefa quando eu copiar seu prompt** coloca em andamento um problema ou uma tarefa do caderno que ainda não foi iniciado quando você copia o prompt. Deixe essa opção desativada se você copia prompts apenas para lê-los.

## Revisar uma pull request vinculada {#review-pull-requests}

Abra a pull request vinculada a um problema ou encontre-a na lista de pull requests. O acesso ao repositório continua necessário; ser membro do projeto não concede permissões na plataforma Git.

Leia a descrição e a atividade, depois os arquivos alterados e os trechos do diff. Abra as conversas não resolvidas e responda no tópico correspondente, em vez de criar um comentário avulso. Para devolver os comentários pendentes ao seu agente, abra **Ver conversas**, depois **Corrigir tudo** e **Copiar prompt**. Marcar arquivos como revisados ajuda a acompanhar sua leitura, mas não equivale à aprovação do provedor. Confira commits, resultados de CI e problemas vinculados para confirmar que a alteração proposta cobre o trabalho solicitado.

Mencione `@numo` em um comentário da pull request para pedir ao Numo uma revisão somente leitura em uma conversa. Ele lê a pull request e responde; não faz push de commits. Uma menção escrita na plataforma Git só conta quando o autor está vinculado ao proprietário ou a um Membro (não a um leitor) de um projeto que vincula o repositório, e o uso é cobrado do proprietário desse projeto.

![Aba Alterações do PR de demonstração aberto, com o diff de greeting e um aviso de autorização do GitHub indisponível.](/documentation/pt-BR/review-pull-requests-workflow.png)

### Revisão e merge {#decision}

Solicite outro revisor quando precisar de uma segunda revisão. Confira o estado de rascunho ou pronto para revisão, as discussões abertas, as revisões solicitadas e a política de merge do provedor.

Faça o merge somente depois de satisfazer as verificações e revisões aplicáveis e se sua conta no provedor tiver permissão. **Mesclar com Numo** deixa o Numo redigir o título e a descrição do commit de merge a partir da pull request e faz o merge assim que eles estiverem prontos. O provedor ainda pode rejeitar uma ação visível. Se o estado exibido estiver desatualizado, atualize e confira no provedor antes de repetir uma ação. Uma prévia vinculada depende de uma implantação real no provedor.

Clique com o botão direito em uma pull request da lista para mudar o estado, mesclá-la ou pedir uma correção sem abri-la. Uma pull request aberta oferece **Converter em rascunho** e **Fechar pull request**, um rascunho oferece **Pronto para revisão** e **Fechar pull request**, e uma fechada oferece **Reabrir**; cada mudança pede confirmação. Uma pull request mesclada não oferece mudança de estado. As ações de escrita só aparecem quando sua conta no provedor pode escrever no repositório e ficam indisponíveis até o menu ler a pull request novamente. **Mesclar** aparece quando a pull request está aberta, não é rascunho e pode ser mesclada; ela abre a pull request na confirmação de merge habitual. **Copiar prompt de correção** e **Corrigir com o Numo** aparecem quando uma verificação falha, uma conversa não está resolvida ou o branch tem conflitos ou está desatualizado. **Corrigir com o Numo** envia esse prompt ao Numo com a pull request como contexto. As permissões e a possibilidade de merge são verificadas novamente quando você confirma.

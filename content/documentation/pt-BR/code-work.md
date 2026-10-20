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
  "revision": 18,
  "sourceRevision": 18,
  "owner": "@mangue-dev",
  "updatedAt": "2026-10-20",
  "compatibility": {
    "version": "0.20.0 (MIN-747 release review)",
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
      "components/pull-requests/pr-context-actions.tsx",
      "lib/pr-context-menu.ts",
      "docs/security/project-roles.md",
      "lib/project-roles.ts",
      "components/pull-requests/pr-link-issue.tsx",
      "components/pull-requests/pr-link-target-picker.tsx",
      "lib/bulk-pull-request-links.ts",
      "components/settings/account-issues-section.tsx",
      "components/markdown-image.tsx",
      "components/pull-requests/pr-image-diff.tsx",
      "components/image-viewer.tsx",
      "components/issue-card.tsx"
    ]
  },
  "review": {
    "revision": 18,
    "fact": "agent:/root/min747 (0.20.0 release review: source audit against the v0.11.0..main delta, verified corrections applied; no screenshot in scope; 1 screenshot(s) without a current capture script keep their earlier capture and evidence; no browser walkthrough of the procedures or operator rehearsal; earlier evidence retained in git history)",
    "language": "agent:/root/min747 (pt-BR translation of the release corrections with catalog UI labels; equivalent meaning self-reviewed; agent review, not human acceptance)",
    "date": "2026-10-20"
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
      "revision": 18,
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

Em um quadro, clique com o botão direito em um problema sem pull request aberto e escolha **Vincular a um pull request** para escolher um dos pull requests abertos do projeto, incluindo rascunhos. A opção só aparece quando esse projeto tem pelo menos um pull request para vincular. Com vários problemas selecionados, **Ações** oferece a mesma opção para toda a seleção, além de **Vincular os outros problemas a #N** quando alguns já têm o pull request N. **Vincular a um pull request** deixa de ser oferecido assim que um problema selecionado tem algum pull request vinculado; **Desvincular N problemas dos seus pull requests** remove primeiro todos os vínculos da seleção, depois que você confirma. Os vínculos aparecem na hora nos cartões, e um vínculo recusado some quando o quadro é atualizado. Um cartão com um pull request aberto mostra o número dele, colorido conforme o estado, e sua prontidão para merge, o mesmo indicador da **Revisão de código**.

Em **Configurações da conta → Tickets → Iniciar um ticket**, **Iniciar o problema ou tarefa quando eu copiar seu prompt** coloca em andamento um problema ou uma tarefa do caderno que ainda não foi iniciado quando você copia o prompt. Deixe essa opção desativada se você copia prompts apenas para lê-los.

## Revisar uma pull request vinculada {#review-pull-requests}

Abra a pull request vinculada a um problema ou encontre-a na lista de pull requests. O acesso ao repositório continua necessário; ser membro do projeto não concede permissões na plataforma Git.

Leia a descrição e a atividade, depois os arquivos alterados e os trechos do diff. Abra as conversas não resolvidas e responda no tópico correspondente, em vez de criar um comentário avulso. Para devolver os comentários pendentes ao seu agente, abra **Ver conversas**, depois **Corrigir tudo** e **Copiar prompt**. Marcar arquivos como revisados ajuda a acompanhar sua leitura, mas não equivale à aprovação do provedor. Confira commits, resultados de CI e problemas vinculados para confirmar que a alteração proposta cobre o trabalho solicitado.

Em uma descrição, em um comentário ou no diff de uma imagem, clique em uma imagem para abri-la na janela inteira; o diff de uma imagem abre separadamente os lados **Antes** e **Depois**. Use **Fechar** ou Esc para voltar à pull request.

Mencione `@numo` em um comentário da pull request para pedir ao Numo uma revisão somente leitura em uma conversa. Ele lê a pull request e responde; não faz push de commits. Uma menção escrita na plataforma Git só conta quando o autor está vinculado ao proprietário ou a um Membro (não a um leitor) de um projeto que vincula o repositório, e o uso é cobrado do proprietário desse projeto.

![Aba Alterações do PR de demonstração aberto, com o diff de greeting e um aviso de autorização do GitHub indisponível.](/documentation/pt-BR/review-pull-requests-workflow.png)

### Revisão e merge {#decision}

Use **Solicitar revisão** para escolher um revisor quando precisar de uma segunda revisão. Confira o estado de rascunho ou pronto para revisão, as discussões abertas, as revisões solicitadas e a política de merge do provedor.

Faça o merge somente depois de satisfazer as verificações e revisões aplicáveis e se sua conta no provedor tiver permissão. **Mesclar com Numo** deixa o Numo redigir o título e a descrição do commit de merge a partir da pull request e faz o merge assim que eles estiverem prontos. O provedor ainda pode rejeitar uma ação visível. Se o estado exibido estiver desatualizado, atualize e confira no provedor antes de repetir uma ação. Uma prévia vinculada depende de uma implantação real no provedor.

Clique com o botão direito em uma pull request da lista para mudar o estado, mesclá-la ou pedir uma correção sem abri-la. Uma pull request aberta oferece **Converter em rascunho** e **Fechar pull request**, um rascunho oferece **Pronto para revisão** e **Fechar pull request**, e uma fechada oferece **Reabrir**; cada mudança pede confirmação. Uma pull request mesclada não oferece mudança de estado. As ações de escrita só aparecem quando sua conta no provedor pode escrever no repositório e ficam indisponíveis até o menu ler a pull request novamente. **Mesclar** aparece quando a pull request está aberta, não é rascunho e pode ser mesclada; ela abre a pull request na confirmação de merge habitual. **Copiar prompt de correção** e **Corrigir com o Numo** aparecem quando uma verificação falha, uma conversa não está resolvida ou o branch tem conflitos ou está desatualizado. **Corrigir com o Numo** envia esse prompt ao Numo com a pull request como contexto. O Numo pode ler a pull request, responder a uma conversa de revisão que não exige alteração no código e resolver as conversas que o branch já atende, mas não altera o código nem faz push de commits; para as alterações de código, use **Copiar prompt de correção** e cole-o no seu agente de código. As permissões e a possibilidade de merge são verificadas novamente quando você confirma.

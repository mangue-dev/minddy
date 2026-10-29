---
{
  "id": "code-work",
  "locale": "pt-BR",
  "title": "Trabalho de código e pull requests",
  "summary": "Entregue um ticket ao seu próprio agente de código com um prompt copiado e o MCP do minddy, depois revise e mescle o pull request vinculado.",
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
  "revision": 22,
  "sourceRevision": 21,
  "owner": "@mangue-dev",
  "updatedAt": "2026-10-29",
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
      "components/issue-card.tsx",
      "lib/palette-picker.ts",
      "components/use-issue-menu-actions.tsx",
      "lib/use-link-issues-to-pull-request.ts",
      "lib/pr-issue-status.ts",
      "lib/pr-merge-intent.ts",
      "components/issue-pr-context.tsx"
    ]
  },
  "review": {
    "revision": 22,
    "fact": "agent:claude-code (card right-click menu: linked pull request entries grouped under a Pull request submenu with View pull request in its own tab, Merge, Enable/Disable auto-merge, Link to a pull request and Unlink from pull request; Link the other issues to #N from a selected card; cards move to the status the pull request implies when linked; auto-merge named in the readiness tooltip; checked against components/use-issue-menu-actions.tsx, lib/use-link-issues-to-pull-request.ts, lib/pr-issue-status.ts, lib/pr-merge-intent.ts and components/issue-pr-context.tsx; not checked in the running app; rest of the article unchanged since the previous review; no figure recaptured, the existing figure does not show the card menu)",
    "language": "agent:claude-code (pt-BR changed passages with catalog UI labels; self-reviewed; agent review, not human acceptance)",
    "date": "2026-10-29"
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
    "Entregar um ticket a um agente de código externo",
    "Revisar um pull request vinculado"
  ],
  "figures": [
    {
      "id": "review-pull-requests-workflow",
      "kind": "screenshot",
      "src": "/documentation/pt-BR/review-pull-requests-workflow.png",
      "alt": "Aba Alterações do PR de demonstração aberto, com o diff de greeting e um aviso de autorização do GitHub indisponível.",
      "caption": "PR de demonstração que permanece aberto, sem mesclagem. O diff remove os espaços ao redor do nome e usa World quando o valor é vazio. Esta instância não pode solicitar autorização de usuário do GitHub; a indicação de prontidão não concede permissão de mesclagem nem comprova que a CI do provedor passou.",
      "revision": 22,
      "reviewed": true,
      "capturedAt": "2026-10-22",
      "viewport": [
        1528,
        1148
      ],
      "theme": "light",
      "padding": 24,
      "deviceScaleFactor": 2
    }
  ],
  "requiredFigures": [
    "review-pull-requests-workflow"
  ]
}
---

O Minddy acompanha o trabalho; seu próprio agente de código, como Claude Code, Codex ou Cursor, altera o código. Copie um prompt a partir do ticket, deixe o agente ler e atualizar o ticket pelo MCP do minddy e depois revise o pull request vinculado no Minddy antes da mesclagem. O Numo não escreve código, não abre branches nem executa testes.

## Entregar um ticket a um agente de código externo {#external-coding-agents}

Primeiro, conecte seu agente ao MCP do minddy para que ele possa ler o plano e atualizar suas tarefas; consulte [Conectar um assistente externo ao MCP do minddy](/docs/minddy-mcp#external-minddy-mcp). O agente é executado no seu computador ou no próprio serviço, com assinatura ou custos de API próprios. O Minddy não fornece a ele acesso ao repositório.

1. Abra o ticket e descreva o comportamento esperado, as restrições e as verificações de aceitação. Escreva ou revise o plano na aba do plano quando o trabalho tiver várias etapas.
2. Abra o menu de ações do ticket e escolha **Copiar como prompt**. Escolha **Gerar um plano** (ou **Revisar o plano** quando já existir um) para delimitar o trabalho sem programar, **Implementar o ticket** para iniciar a alteração, **Verificar a implementação** para que o agente revise o trabalho concluído com base no plano e nos comentários, ou **Personalizado…** para escrever sua própria instrução.
3. Cole o prompt no agente, na cópia de trabalho do repositório. Copiar não executa nenhum modelo de IA nem consome sua cota de IA.
4. Acompanhe o progresso do plano no ticket enquanto o agente atualiza as tarefas pelo MCP. Responda às perguntas dele no próprio agente ou registre as decisões no ticket para que o próximo prompt as inclua.

Quando seu agente comentou o ticket pelo MCP e chegam comentários depois, incluindo os trazidos de um pull request vinculado, o botão **Copiar prompt para N novos comentários** aparece acima do campo de comentário. O prompt pede ao agente que leia esses comentários pelo MCP e trate cada um; ele não os copia. Uma resposta sob um comentário do agente continua aguardando até que o agente responda nesse tópico, mesmo que ele comente em outro ponto do ticket nesse meio-tempo; o prompt indica esses tópicos e pede ao agente que responda dentro deles. Em um quadro, o card do ticket mostra quantos comentários estão aguardando, um clique nesse número copia o mesmo prompt e o menu do clique direito oferece **Copiar prompt para os novos comentários**.

O conteúdo do prompt, a sugestão de branch e as regras de idioma estão descritos em [Copiar um prompt para outro agente de código](/docs/issues#copy-issue-prompt).

### Manter o trabalho vinculado ao ticket {#link-work}

Quando o repositório estiver vinculado ao projeto, mantenha o identificador do ticket no nome da branch, no título do pull request ou em uma linha `Fixes MIN-42`. Assim o Minddy anexa o pull request ao ticket, e os prompts seguintes pedem ao agente que continue o pull request aberto na branch dele. Para anexar um ticket manualmente, use **Vincular um ticket** no pull request: a paleta de comandos abre com os tickets do projeto, e o escolhido é vinculado após a confirmação. A busca aceita um identificador ou palavras do título, e uma descrição também lista tickets do projeto encontrados [pelo sentido](/docs/navigation#search-by-meaning) em **Relacionados pelo sentido**.

Em um quadro, clique com o botão direito em um ticket sem pull request aberto e escolha **Vincular a um pull request** para escolher na paleta de comandos um dos pull requests abertos do projeto, incluindo rascunhos. A opção só aparece quando esse projeto tem pelo menos um pull request para vincular. Com vários tickets selecionados, **Ações** oferece a mesma opção para toda a seleção, além de **Vincular os outros tickets a #N** quando alguns já têm o pull request N; o clique direito em um dos tickets selecionados também oferece **Vincular os outros tickets a #N**. **Vincular a um pull request** deixa de ser oferecido assim que um ticket selecionado tem algum pull request vinculado; **Desvincular N tickets dos seus pull requests** remove primeiro todos os vínculos da seleção, depois que você confirma. Os vínculos aparecem na hora nos cartões, e cada cartão passa na hora para o status que o pull request implica, por exemplo **Em revisão** para um pull request aberto; um vínculo recusado some quando o quadro é atualizado. Um cartão com um pull request aberto mostra o número dele, colorido conforme o estado, e sua prontidão para mesclagem, o mesmo indicador da **Revisão de código**; quando a mesclagem automática está ativada, a dica do indicador acrescenta **Mesclagem automática** depois do estado.

Quando um ticket tem um pull request vinculado, o menu do clique direito reúne as ações desse pull request em um submenu **Pull request**. **Ver pull request** abre o pull request em uma aba própria, ou muda para a aba que já o mostra. **Mesclar** aparece quando o pull request está aberto e pode ser mesclado e sua conta no provedor pode escrever no repositório; ele abre o pull request na confirmação de mesclagem habitual, onde você escolhe o método e a mensagem de commit, ou usa **Mesclar com o Numo**. **Ativar mesclagem automática** aparece enquanto o pull request ainda não pode ser mesclado e o repositório permite a mesclagem automática; **Desativar mesclagem automática** a substitui quando a mesclagem automática está ativada. Quando o pull request vinculado está mesclado ou fechado, **Vincular a um pull request** vincula o ticket a outro pull request aberto do projeto. **Desvincular do pull request**, à parte e em vermelho no fim do submenu, remove o vínculo depois que você confirma.

Em **Configurações da conta → Tickets → Iniciar um ticket**, **Iniciar o ticket ou tarefa quando eu copiar seu prompt** coloca em andamento um ticket ou uma tarefa do caderno que ainda não foi iniciado quando você copia o prompt. Deixe essa opção desativada se você copia prompts apenas para lê-los.

## Revisar um pull request vinculado {#review-pull-requests}

Abra o pull request vinculado a um ticket ou encontre-o na lista de pull requests. O acesso ao repositório continua necessário; ser membro do projeto não concede permissões na plataforma Git.

Leia a descrição e a atividade, depois os arquivos alterados e os trechos do diff. Abra as conversas não resolvidas e responda no tópico correspondente, em vez de criar um comentário avulso. Para devolver os comentários pendentes ao seu agente, abra **Ver conversas**, depois **Corrigir tudo** e **Copiar prompt**. Marcar arquivos como revisados ajuda a acompanhar sua leitura, mas não equivale à aprovação do provedor. Confira commits, resultados de CI e tickets vinculados para confirmar que a alteração proposta cobre o trabalho solicitado.

Em uma descrição, em um comentário ou no diff de uma imagem, clique em uma imagem para abri-la na janela inteira; o diff de uma imagem abre separadamente os lados **Antes** e **Depois**. Use **Fechar** ou Esc para voltar ao pull request.

Mencione `@numo` em um comentário do pull request para pedir ao Numo uma revisão somente leitura em uma conversa. Ele lê o pull request e responde; não faz push de commits. Uma menção escrita na plataforma Git só conta quando o autor está vinculado ao proprietário ou a um Membro (não a um leitor) de um projeto que vincula o repositório, e o uso é cobrado do proprietário desse projeto.

O que é escrito em um pull request ou merge request vinculado também aparece nos comentários de cada ticket ao qual ele está vinculado: os comentários da conversa, a mensagem de uma revisão enviada e os comentários sobre o código com o arquivo, a linha e, no GitHub, o trecho a que se referem, com as respostas agrupadas abaixo. Comentários de bots ficam no pull request, exceto os comentários sobre o código. Uma edição atualiza a cópia, e um comentário excluído no GitHub aparece como excluído; o GitLab não informa exclusões. Sempre que um pull request é vinculado a um ticket, manualmente ou porque a branch, o título ou a descrição dele cita o ticket, os comentários que ele já tem são trazidos com a data em que foram escritos, mesmo que seja anterior à criação do ticket. Responda sob um desses comentários para responder no pull request com sua própria conta do Git, como na visualização do pull request; uma conversa sobre o código também mostra **Resolvida** ou **Desatualizado** e oferece **Resolver** ou **Reabrir**. As cópias em si não podem ser editadas no Minddy.

![Aba Alterações do PR de demonstração aberto, com o diff de greeting e um aviso de autorização do GitHub indisponível.](/documentation/pt-BR/review-pull-requests-workflow.png)

### Revisão e mesclagem {#decision}

Use **Solicitar revisão** para escolher um revisor quando precisar de uma segunda revisão. Confira o estado de rascunho ou pronto para revisão, as discussões abertas, as revisões solicitadas e a política de mesclagem do provedor.

Mescle somente depois de satisfazer as verificações e revisões aplicáveis e se sua conta no provedor tiver permissão. **Mesclar com o Numo** deixa o Numo redigir o título e a descrição do commit de mesclagem a partir do pull request e faz a mesclagem assim que eles estiverem prontos. O provedor ainda pode rejeitar uma ação visível. Se o estado exibido estiver desatualizado, atualize e confira no provedor antes de repetir uma ação. Uma prévia vinculada depende de uma implantação real no provedor.

Clique com o botão direito em um pull request da lista para mudar o estado, mesclá-lo ou pedir uma correção sem abri-lo. Um pull request aberto oferece **Converter em rascunho** e **Fechar pull request**, um rascunho oferece **Pronto para revisão** e **Fechar pull request**, e um fechado oferece **Reabrir**; cada mudança pede confirmação. Um pull request mesclado não oferece mudança de estado. As ações de escrita só aparecem quando sua conta no provedor pode escrever no repositório e ficam indisponíveis até o menu ler o pull request novamente. **Mesclar** aparece quando o pull request está aberto, não é rascunho e pode ser mesclado; ele abre o pull request na confirmação de mesclagem habitual. **Copiar prompt de correção** e **Corrigir com o Numo** aparecem quando uma verificação falha, uma conversa não está resolvida ou o branch tem conflitos ou está desatualizado. **Corrigir com o Numo** envia esse prompt ao Numo com o pull request como contexto. O Numo pode ler o pull request, responder a uma conversa de revisão que não exige alteração no código e resolver as conversas que o branch já atende, mas não altera o código nem faz push de commits; para as alterações de código, use **Copiar prompt de correção** e cole-o no seu agente de código. As permissões e a possibilidade de mesclagem são verificadas novamente quando você confirma.

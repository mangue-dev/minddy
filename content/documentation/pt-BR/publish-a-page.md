---
{
  "id": "publish-a-page",
  "locale": "pt-BR",
  "title": "Publicar uma página e revogar seu link",
  "summary": "Teste a visão do visitante, escolha o acesso a descendentes deliberadamente e revogue a publicação.",
  "topic": "Páginas e bancos de dados",
  "type": "tutorial",
  "audiences": [
    "member",
    "visitor"
  ],
  "workflows": [
    "P06"
  ],
  "visibility": "public",
  "status": "published",
  "revision": 2,
  "sourceRevision": 2,
  "owner": "@mangue-dev",
  "updatedAt": "2026-10-08",
  "compatibility": {
    "version": "0.11.1 candidate (89ebb59a5)",
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
      "components/pages/page-publish-dialog.tsx",
      "lib/server/page-publication.ts",
      "app/p/[token]/page.tsx"
    ]
  },
  "review": {
    "revision": 2,
    "fact": "2026-10-08",
    "language": "2026-10-08",
    "date": "2026-10-08"
  },
  "related": [
    "share-a-view",
    "page-files",
    "permissions-and-public-links"
  ],
  "aliases": [],
  "tags": [],
  "figures": [
    {
      "id": "publish-a-page-steps",
      "kind": "screenshot",
      "src": "/documentation/pt-BR/page-publish.png",
      "alt": "Janela de publicação com Privado selecionado e opções de senha ou link.",
      "caption": "Privado mantém a página no projeto. Confira quem deve ler o conteúdo antes de mudar a publicação.",
      "revision": 2,
      "reviewed": true,
      "capturedAt": "2026-10-08",
      "viewport": [
        1440,
        1080
      ],
      "theme": "light"
    }
  ],
  "requiredFigures": [
    "publish-a-page-steps"
  ]
}
---

## Publicar o conteúdo desejado {#publish-a-page}

Abra uma página do projeto como membro e use os controles de publicação. Revise primeiro conteúdo e anexos. Escolha acesso privado, protegido por senha ou público. A senha exige pelo menos oito caracteres e é aplicada depois do envio; selecionar o modo sozinho não cria um link protegido.

Copie o link /p/ gerado depois que a publicação tiver êxito. Se a página tiver descendentes, revise a opção de incluí-los e a quantidade. Incluí-los publica a ramificação selecionada; excluí-los mantém o conteúdo fora dessa publicação. Um banco de dados sem descendentes publicados não expõe automaticamente todos os corpos das entradas.

Abra o link em uma sessão separada do navegador sem sua conta. Teste a senha se habilitada, conteúdo da página, subpáginas desejadas e downloads. Isso verifica o acesso somente leitura do visitante, não suas permissões mais amplas de membro.


![Janela de publicação com Privado selecionado e opções de senha ou link.](/documentation/pt-BR/page-publish.png)

## Revogar e verificar {#revoke-page}

Volte aos controles de publicação e escolha privado. Depois da revogação bem-sucedida, abra o link antigo anonimamente e confira se o acesso é negado. Cópias ou capturas já recebidas não podem ser recuperadas. As URLs de download de arquivos já entregues por uma página publicada são assinadas por até 24 horas. A revogação impede novas visitas à página, mas essas URLs de arquivos já emitidas podem permanecer válidas até expirar.

Links de páginas de usuários continuam noindex e são separados do manual oficial indexado. Noindex é uma política de descoberta, não uma senha de acesso. Se um descendente ou arquivo puder ser lido inesperadamente, revogue primeiro, inspecione a ramificação publicada e teste novamente antes de encaminhar um link corrigido. Arquivos de páginas não publicadas não ganham acesso por uma referência interna.

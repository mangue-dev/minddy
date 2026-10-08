---
{
  "id": "web-and-mobile",
  "locale": "pt-BR",
  "title": "Trabalhar no navegador e no celular",
  "summary": "Navegar projetos, detalhes e Numo considerando a conexão.",
  "topic": "Conta e aplicativos",
  "type": "guide",
  "audiences": [
    "member"
  ],
  "workflows": [
    "A10"
  ],
  "visibility": "public",
  "status": "published",
  "revision": 2,
  "sourceRevision": 1,
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
      "components/mobile-sidebar-reveal.tsx",
      "components/issue-side-panel.tsx",
      "components/assistant-panel.tsx",
      "public/sw.js",
      "content/documentation/reviews/mobile-account-capture-candidates.json"
    ]
  },
  "review": {
    "revision": 2,
    "fact": "2026-10-08",
    "language": "2026-10-08",
    "date": "2026-10-08"
  },
  "related": [],
  "aliases": [],
  "tags": [],
  "figures": [
    {
      "id": "web-and-mobile-workflow",
      "kind": "screenshot",
      "src": "/documentation/pt-BR/web-and-mobile-workflow.png",
      "alt": "Painel móvel de uma tarefa com título, descrição, propriedades e campo de comentário.",
      "caption": "Em uma tela estreita, os detalhes da tarefa ocupam um painel adaptável. Use o botão de fechar para voltar ao projeto; Numo continua acessível pelo botão flutuante.",
      "revision": 2,
      "reviewed": true,
      "capturedAt": "2026-10-08",
      "viewport": [
        390,
        844
      ],
      "theme": "dark"
    }
  ],
  "requiredFigures": [
    "web-and-mobile-workflow"
  ]
}
---

## Abrir e alterar uma tarefa {#web-and-mobile}
Abra o endereço da sua instância e entre nessa mesma instância. Em uma tela estreita, mostre a barra lateral para escolher um projeto e abra uma tarefa pela lista ou pelo quadro. Leia os detalhes no painel adaptado à tela, altere o campo desejado ou adicione um comentário e aguarde o resultado do salvamento antes de fechar. Feche o painel de detalhes para voltar à lista; sua apresentação no celular difere da de uma tela ampla.

Abra o Numo pelo botão flutuante ou por uma ação contextual da tarefa. Confira o contexto da tarefa no campo de composição. Se outro painel cobrir o conteúdo necessário, feche-o antes de continuar navegando. Em dispositivos de toque, use os botões e menus visíveis; não presuma que ações ao passar o mouse ou atalhos de desktop estejam disponíveis.

## Teclado e conexão {#access}
Com o teclado, você pode focar os controles e usar a paleta de comandos para navegar e executar ações comuns. O botão de envio visível continua sendo uma alternativa ao envio por teclado. Siga o atalho mostrado pela aplicação para a sua plataforma.

O navegador e o aplicativo web instalado precisam de conexão de rede para consultar dados dos projetos e salvar alterações. O service worker gerencia notificações push sem implementar um cache de dados offline. Após uma falha de conexão, confira se a alteração foi salva antes de repeti-la. Instalar a PWA não cria outra conta nem contorna as permissões da instância.

![Painel móvel de uma tarefa com título, descrição, propriedades e campo de comentário.](/documentation/pt-BR/web-and-mobile-workflow.png)

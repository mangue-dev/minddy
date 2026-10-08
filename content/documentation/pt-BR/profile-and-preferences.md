---
{
  "id": "profile-and-preferences",
  "locale": "pt-BR",
  "title": "Alterar perfil e preferências",
  "summary": "Definir nome, avatar, idioma, tema e atalho de envio da conta.",
  "topic": "Conta e aplicativos",
  "type": "guide",
  "audiences": [
    "member"
  ],
  "workflows": [
    "A01"
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
      "content/knowledge/settings-and-data.md",
      "components/settings/account-profile-section.tsx",
      "components/settings/account-preferences-section.tsx",
      "app/api/me/avatar/route.ts",
      "lib/server/avatar-seeds.ts"
    ]
  },
  "review": {
    "revision": 2,
    "fact": "2026-10-08",
    "language": "2026-10-08",
    "date": "2026-10-08"
  },
  "related": [
    "account-security",
    "devices-and-notifications",
    "automation-settings",
    "transfer-between-instances",
    "privacy-and-account-deletion"
  ],
  "aliases": [
    "settings-and-data"
  ],
  "tags": [],
  "figures": [
    {
      "id": "profile-and-preferences-workflow",
      "kind": "screenshot",
      "src": "/documentation/pt-BR/profile-and-preferences-workflow.png",
      "alt": "Controles do perfil para avatar, nome de usuário e email somente leitura.",
      "caption": "Salve as alterações do perfil após a validação; o endereço de email permanece somente leitura.",
      "revision": 2,
      "reviewed": true,
      "capturedAt": "2026-10-08",
      "viewport": [
        1440,
        1800
      ],
      "theme": "light"
    },
    {
      "id": "profile-and-preferences-preferences-workflow",
      "kind": "screenshot",
      "src": "/documentation/pt-BR/profile-and-preferences-preferences-workflow.png",
      "alt": "Seletor de idioma e controles de tema claro, escuro e do sistema.",
      "caption": "O idioma da conta e o do site público são configurados separadamente.",
      "revision": 2,
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
    "profile-and-preferences-workflow",
    "profile-and-preferences-preferences-workflow"
  ]
}
---

## Atualizar sua identidade {#profile-and-preferences}
Abra as configurações no menu da conta. No perfil, informe um nome não vazio e salve. O email é somente leitura. Gere outro avatar ou envie uma imagem pelos controles próprios. Aguarde o resultado e confira o avatar em um comentário ou na lista de membros; ele acompanha a conta entre projetos e conversas. Se o arquivo for rejeitado, siga a mensagem de validação em vez de reenviar repetidamente.

A imagem fonte não pode passar de 10 MiB. O servidor verifica bytes legíveis, aplica a orientação e recorta no centro como avatar WebP de 256 × 256.

![Controles do perfil para avatar, nome de usuário e email somente leitura.](/documentation/pt-BR/profile-and-preferences-workflow.png)


## Escolher o comportamento {#preferences}
Selecione o idioma e o tema nas preferências e confira outra página. O idioma da conta controla o produto autenticado; o site público possui seu próprio seletor. O tema fica salvo na conta entre dispositivos.

Escolha o atalho de envio na seção de teclado. Ele vale para comentários e Numo. Use o botão de enviar se a plataforma interceptar o atalho; as teclas modificadoras variam entre sistemas. Preferências como atribuição automática e status de tarefas criadas pelo Numo também pertencem à conta e não alteram as de outros membros.

![Seletor de idioma e controles de tema claro, escuro e do sistema.](/documentation/pt-BR/profile-and-preferences-preferences-workflow.png)

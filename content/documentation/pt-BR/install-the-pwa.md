---
{
  "id": "install-the-pwa",
  "locale": "pt-BR",
  "title": "Instalar o app web no celular ou tablet",
  "summary": "Adicionar a instância à tela inicial e entender condições de rede e push.",
  "topic": "Conta e aplicativos",
  "type": "guide",
  "audiences": [
    "member"
  ],
  "workflows": [
    "A11"
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
      "components/marketing/mobile-pwa-install-guide.tsx",
      "components/marketing/mobile-install-guide-copy.ts",
      "public/sw.js",
      "content/documentation/reviews/pwa-guide-capture-candidates.json",
      "content/documentation/reviews/pwa-installation-probe.json"
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
      "id": "install-the-pwa-workflow",
      "kind": "screenshot",
      "src": "/documentation/pt-BR/install-the-pwa-workflow.png",
      "alt": "Guia ilustrado de instalação pelo Safari no Minddy: Compartilhar, adicionar à Tela de Início e confirmar.",
      "caption": "O guia público ilustra as três etapas do Safari e a opção Abrir como App da Web que deve permanecer ativada. São ilustrações de instruções exibidas pelo Minddy, não capturas de uma instalação do iOS concluída.",
      "revision": 2,
      "reviewed": true,
      "capturedAt": "2026-10-08",
      "viewport": [
        1240,
        940
      ],
      "theme": "light"
    }
  ],
  "requiredFigures": [
    "install-the-pwa-workflow"
  ]
}
---

## Instalar pelo navegador {#install-the-pwa}
Abra a instância Minddy que deseja usar no Safari em um iPhone ou iPad, ou no Chrome ou em outro navegador Android compatível. Se o link tiver aberto dentro de outro aplicativo, abra-o primeiro no navegador completo. Para uma instância self-hosted, use o endereço do seu próprio servidor.

No iOS, abra Compartilhar e escolha Adicionar à Tela de Início. Mantenha Abrir como App da Web ativado e toque em Adicionar. Dependendo da interface do Safari, pode ser necessário abrir Mais antes de Compartilhar. Se a ação não aparecer, confira Editar Ações.

No Android, use a sugestão de instalação ou escolha Instalar app ou Adicionar à tela inicial no menu do navegador e confirme Instalar. Os nomes dependem do navegador. Abra o novo ícone e entre com a conta daquela instância. Trata-se de uma PWA instalada pelo navegador; não existe um aplicativo nativo Minddy na App Store do iOS nem no Google Play.

## Atualizações, acesso offline e notificações {#operation}
A instalação não cria uma cópia offline do projeto. O service worker do Minddy só gerencia notificações push e não armazena as requisições do aplicativo em cache. Use uma conexão de rede e recarregue a página para obter o conteúdo web atual. As notificações também exigem um navegador compatível, sua permissão e a configuração push no servidor. No iOS, use o aplicativo instalado quando o processo solicitar. Se a opção de instalação não aparecer, abra um navegador completo compatível e confira se a instância já está instalada.

![Guia ilustrado de instalação pelo Safari no Minddy: Compartilhar, adicionar à Tela de Início e confirmar.](/documentation/pt-BR/install-the-pwa-workflow.png)

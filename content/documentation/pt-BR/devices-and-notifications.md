---
{
  "id": "devices-and-notifications",
  "locale": "pt-BR",
  "title": "Ativar notificações em um dispositivo",
  "summary": "Registrar o dispositivo, testar a entrega e distinguir navegador de suporte nativo.",
  "topic": "Conta e aplicativos",
  "type": "guide",
  "audiences": [
    "member"
  ],
  "workflows": [
    "A03"
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
      "components/settings/account-push-devices-section.tsx",
      "lib/desktop/notification-capabilities.ts",
      "public/sw.js",
      "content/documentation/reviews/push-registration-capture-candidates.json"
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
      "id": "devices-and-notifications-workflow",
      "kind": "screenshot",
      "src": "/documentation/pt-BR/devices-and-notifications-workflow.png",
      "alt": "Configurações push com permissão bloqueada no navegador e nenhum dispositivo registrado.",
      "caption": "Este navegador bloqueia notificações. Restaure a permissão do site antes de registrar este dispositivo.",
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
      "id": "devices-and-notifications-registered-workflow",
      "kind": "screenshot",
      "src": "/documentation/pt-BR/devices-and-notifications-registered.png",
      "alt": "Dispositivo de navegador registrado e ativo na conta, com a data real do último envio.",
      "caption": "A conta tem um dispositivo de navegador registrado e ativo. A lista mostra as datas de registro e do último envio. A exibição de um alerta continua dependendo da permissão do navegador e das configurações do sistema operacional.",
      "revision": 2,
      "reviewed": true,
      "capturedAt": "2026-10-08",
      "viewport": [
        1240,
        950
      ],
      "theme": "light"
    }
  ],
  "requiredFigures": [
    "devices-and-notifications-workflow",
    "devices-and-notifications-registered-workflow"
  ]
}
---

## Ativar e testar {#devices-and-notifications}

Abra as notificações nas configurações da conta no dispositivo que deseja registrar. Ative-as e aceite a solicitação de permissão do navegador ou do sistema operacional. Se a permissão foi negada, altere-a nas configurações do navegador ou do sistema; acionar o controle do Minddy repetidamente não pode superar essa recusa. No iOS, instale e abra o aplicativo web primeiro quando a interface exigir.

Confira se o dispositivo aparece na lista e use o controle de teste correspondente. Consulte as informações da última entrega. Você pode desativar ou remover registros individuais sem excluir a conta. As preferências da caixa de entrada determinam quais eventos geram notificações; a caixa de entrada do aplicativo continua disponível quando o push não está disponível.

![Configurações push com permissão bloqueada no navegador e nenhum dispositivo registrado.](/documentation/pt-BR/devices-and-notifications-workflow.png)


## Condições por plataforma {#platforms}

O push web exige um navegador compatível e o serviço de push configurado na instância. Os banners nativos e a entrega em segundo plano variam conforme a plataforma. O pacote macOS assinado oferece suporte a APNs; o pacote Windows precisa do componente WNS opcional para o transporte em segundo plano. No Linux, a entrega utiliza a sessão em segundo plano do aplicativo distribuído, em vez de APNs ou WNS.

Confira a permissão de notificações no sistema, o estado de instalação no navegador e a explicação exibida caso o recurso não esteja configurado ou não seja compatível. Um teste bem-sucedido não garante a entrega sem conexão ou sob todas as restrições de segundo plano do sistema. Mantenha disponível o aplicativo ou o serviço em segundo plano configurado, conforme os requisitos da plataforma.

![Dispositivo de navegador registrado e ativo na conta, com a data real do último envio.](/documentation/pt-BR/devices-and-notifications-registered.png)

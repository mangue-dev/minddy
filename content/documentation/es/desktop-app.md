---
{
  "id": "desktop-app",
  "locale": "es",
  "title": "Instalar y gestionar la aplicación de escritorio",
  "summary": "Elegir paquete e instancia y seguir la actualización correspondiente.",
  "topic": "Cuenta y aplicaciones",
  "type": "guide",
  "audiences": [
    "member",
    "operator"
  ],
  "workflows": [
    "A12"
  ],
  "visibility": "public",
  "status": "published",
  "revision": 1,
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
      "content/knowledge/desktop-and-speed.md",
      "app/(marketing)/download/page.tsx",
      "components/settings/account-desktop-section.tsx",
      "docs/linux-desktop.md",
      "content/documentation/reviews/desktop-capture-candidates.json"
    ]
  },
  "review": {
    "revision": 1,
    "fact": "2026-10-08",
    "language": "2026-10-08",
    "date": "2026-10-08"
  },
  "related": [
    "install-the-pwa",
    "web-and-mobile",
    "devices-and-notifications",
    "import-issues"
  ],
  "aliases": [
    "desktop-and-speed"
  ],
  "tags": [],
  "figures": [
    {
      "id": "desktop-app-workflow",
      "kind": "screenshot",
      "src": "/documentation/es/desktop-app-workflow.png",
      "alt": "Ajustes de escritorio en la aplicación real de desarrollo Electron para macOS, versión 0.11.1, conectada al servidor local con un perfil aislado.",
      "caption": "Ajustes de escritorio en la aplicación real de desarrollo Electron para macOS, versión 0.11.1, conectada al servidor local con un perfil aislado. Esta captura no valida las versiones firmadas ni otros sistemas.",
      "revision": 1,
      "reviewed": true,
      "capturedAt": "2026-10-08",
      "viewport": [
        1280,
        860
      ],
      "theme": "light"
    }
  ],
  "requiredFigures": [
    "desktop-app-workflow"
  ]
}
---

## Instalar y elegir un servidor {#desktop-app}
Abra la página pública de descargas. En macOS, elija el paquete para Apple silicon o Intel. En Windows, instale la aplicación desde Microsoft Store. En Linux, elija una AppImage o un paquete deb/rpm firmado para x64 o ARM64. Siga la guía de la plataforma y las instrucciones de verificación del paquete. Windows no ofrece un instalador exe.

En el selector de servidor, elija Minddy Cloud, el origen de un servidor self-hosted o el entorno local disponible. Compruebe el destino antes de iniciar sesión: cada cuenta pertenece a su instancia. OAuth utiliza el navegador del sistema y vuelve después a la aplicación de escritorio. Un entorno local no significa que el agente de código de Numo trabaje en su carpeta local.

## Pestañas, cierre y actualizaciones {#operation}
Utilice los controles de pestañas y la paleta de comandos para desplazarse entre sus tareas. Siga los atajos indicados para su plataforma: macOS utiliza Command donde Windows y Linux suelen utilizar Control. Cerrar la ventana la oculta y mantiene la aplicación en ejecución. Utilice Salir para terminar la aplicación; en macOS también puede usar Cmd+Q. Las notificaciones en segundo plano dependen del paquete y de las funciones de la plataforma.

macOS y las AppImage portátiles ofrecen actualizaciones dentro de la aplicación. Windows las instala desde Microsoft Store. Para deb/rpm, instale el siguiente paquete verificado. Los ajustes de escritorio de la cuenta muestran el servidor conectado y los controles disponibles de actualización o asistencia. Tras actualizar, compruebe la versión de escritorio indicada y que siga abriéndose la instancia deseada.

![Ajustes de escritorio en la aplicación real de desarrollo Electron para macOS, versión 0.11.1, conectada al servidor local con un perfil aislado.](/documentation/es/desktop-app-workflow.png)

---
{
  "id": "applications",
  "locale": "es",
  "title": "Aplicaciones web, móviles y de escritorio",
  "summary": "Usa minddy en el navegador, instala la aplicación móvil o de escritorio y configura las notificaciones del dispositivo.",
  "topic": "Cuenta y aplicaciones",
  "type": "guide",
  "audiences": [
    "member",
    "operator"
  ],
  "workflows": [
    "A10",
    "A11",
    "A12",
    "A03"
  ],
  "visibility": "public",
  "status": "published",
  "revision": 4,
  "sourceRevision": 4,
  "owner": "@mangue-dev",
  "updatedAt": "2026-10-09",
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
      "content/documentation/reviews/mobile-account-capture-candidates.json",
      "components/marketing/mobile-pwa-install-guide.tsx",
      "components/marketing/mobile-install-guide-copy.ts",
      "content/documentation/reviews/pwa-guide-capture-candidates.json",
      "content/documentation/reviews/pwa-installation-probe.json",
      "content/knowledge/desktop-and-speed.md",
      "app/(marketing)/download/page.tsx",
      "components/settings/account-desktop-section.tsx",
      "docs/linux-desktop.md",
      "content/documentation/reviews/desktop-capture-candidates.json",
      "components/settings/account-push-devices-section.tsx",
      "lib/desktop/notification-capabilities.ts",
      "content/documentation/reviews/push-registration-capture-candidates.json"
    ]
  },
  "review": {
    "revision": 4,
    "fact": "agent:/root/german_spanish_review (structural consolidation review; prior procedural evidence retained; no operational rerun)",
    "language": "agent:/root/german_spanish_review (es title, summary, lead and heading review; retained body comparison)",
    "date": "2026-10-09"
  },
  "related": [
    "issues"
  ],
  "aliases": [
    "web-and-mobile",
    "install-the-pwa",
    "desktop-app",
    "desktop-and-speed",
    "devices-and-notifications"
  ],
  "tags": [
    "Trabajar en navegador y móvil",
    "Instalar la aplicación web en móvil o tableta",
    "Instalar y gestionar la aplicación de escritorio",
    "Activar notificaciones de un dispositivo"
  ],
  "figures": [
    {
      "id": "web-and-mobile-workflow",
      "kind": "screenshot",
      "src": "/documentation/es/web-and-mobile-workflow.png",
      "alt": "Panel móvil de una incidencia con título, descripción, propiedades y campo de comentario.",
      "caption": "En una pantalla estrecha, los detalles de la incidencia ocupan un panel adaptable. Use el botón de cierre para volver al proyecto; Numo sigue disponible mediante su botón flotante.",
      "revision": 4,
      "reviewed": true,
      "capturedAt": "2026-10-08",
      "viewport": [
        438,
        892
      ],
      "theme": "dark",
      "padding": 24
    },
    {
      "id": "install-the-pwa-workflow",
      "kind": "screenshot",
      "src": "/documentation/es/install-the-pwa-workflow.png",
      "alt": "Guía ilustrada de instalación en Safari de minddy: Compartir, Añadir a pantalla de inicio y confirmar.",
      "caption": "La guía pública ilustra los tres pasos de Safari y la opción Abrir como app web que debe permanecer activada. Son ilustraciones didácticas mostradas por minddy, no capturas de una instalación de iOS realizada.",
      "revision": 4,
      "reviewed": true,
      "capturedAt": "2026-10-08",
      "viewport": [
        1288,
        736
      ],
      "theme": "light",
      "padding": 24
    },
    {
      "id": "desktop-app-workflow",
      "kind": "screenshot",
      "src": "/documentation/es/desktop-app-workflow.png",
      "alt": "Ajustes de escritorio en la aplicación real de desarrollo Electron para macOS, versión 0.11.1, conectada al servidor local con un perfil aislado.",
      "caption": "Ajustes de escritorio en la aplicación real de desarrollo Electron para macOS, versión 0.11.1, conectada al servidor local con un perfil aislado. Esta captura no valida las versiones firmadas ni otros sistemas.",
      "revision": 4,
      "reviewed": true,
      "capturedAt": "2026-10-08",
      "viewport": [
        816,
        287
      ],
      "theme": "light",
      "padding": 24
    },
    {
      "id": "devices-and-notifications-workflow",
      "kind": "screenshot",
      "src": "/documentation/es/devices-and-notifications-workflow.png",
      "alt": "Ajustes push con permiso bloqueado en el navegador y ningún dispositivo registrado.",
      "caption": "Este navegador bloquea las notificaciones. Restablezca el permiso del sitio antes de registrar este dispositivo.",
      "revision": 4,
      "reviewed": true,
      "capturedAt": "2026-10-08",
      "viewport": [
        816,
        196
      ],
      "theme": "light",
      "padding": 24
    },
    {
      "id": "devices-and-notifications-registered-workflow",
      "kind": "screenshot",
      "src": "/documentation/es/devices-and-notifications-registered.png",
      "alt": "Dispositivo de navegador registrado y activo en la cuenta, con la fecha real del último envío.",
      "caption": "La cuenta tiene un dispositivo de navegador registrado y activo. La lista muestra las fechas de registro y del último envío. La aparición de una notificación sigue dependiendo del permiso del navegador y de los ajustes del sistema operativo.",
      "revision": 4,
      "reviewed": true,
      "capturedAt": "2026-10-08",
      "viewport": [
        816,
        208
      ],
      "theme": "light",
      "padding": 24
    }
  ],
  "requiredFigures": [
    "web-and-mobile-workflow",
    "install-the-pwa-workflow",
    "desktop-app-workflow",
    "devices-and-notifications-workflow",
    "devices-and-notifications-registered-workflow"
  ]
}
---

minddy se puede usar en el navegador, como aplicación web instalada y como aplicación de escritorio. Los siguientes apartados explican los puntos de entrada, la instalación y las actualizaciones, además de los requisitos de las notificaciones en cada plataforma.

## Trabajar en navegador y móvil {#web-and-mobile}

Abra la dirección de su instancia e inicie sesión en ella. En una pantalla estrecha, muestre la barra lateral para elegir un proyecto y abra una incidencia desde su lista o tablero. Consulte los detalles en el panel adaptado a la pantalla, cambie el campo previsto o añada un comentario y espere el resultado del guardado antes de cerrar. Cierre el panel de detalles para volver a la lista; su presentación móvil difiere de la de una pantalla amplia.

Abra Numo mediante su botón flotante o una acción contextual de la incidencia. Compruebe el contexto de la incidencia en el campo de composición. Si otro panel cubre el contenido que necesita, ciérrelo antes de seguir navegando. En dispositivos táctiles, utilice los botones y menús visibles; no dé por hecho que están disponibles las acciones al pasar el cursor o los atajos de escritorio.

### Teclado y conexión {#access}

Con el teclado puede enfocar los controles y utilizar la paleta de comandos para navegar y realizar acciones habituales. El botón de envío visible ofrece una alternativa al envío por teclado. Siga el atajo que la aplicación muestra para su plataforma.

El navegador y la aplicación web instalada necesitan conexión de red para consultar los datos de los proyectos y guardar cambios. El service worker gestiona las notificaciones push sin implementar una caché de datos sin conexión. Tras un fallo de conexión, compruebe si el cambio se guardó antes de repetirlo. Instalar la PWA no crea una cuenta independiente ni evita los permisos de la instancia.

![Panel móvil de una incidencia con título, descripción, propiedades y campo de comentario.](/documentation/es/web-and-mobile-workflow.png)

## Instalar la aplicación web en móvil o tableta {#install-the-pwa}

Abra la instancia de minddy que desea usar en Safari en un iPhone o iPad, o en Chrome u otro navegador compatible de Android. Si el enlace se abrió dentro de otra aplicación, ábralo primero en el navegador completo. Para una instancia self-hosted, utilice la dirección de su propio servidor.

En iOS, abra Compartir y elija Añadir a pantalla de inicio. Mantenga Abrir como app web activado y pulse Añadir. Según la interfaz de Safari, puede tener que abrir Más antes de Compartir. Si falta la acción, revise Editar acciones.

En Android, utilice la propuesta de instalación o elija Instalar aplicación o Añadir a pantalla de inicio en el menú del navegador y confirme Instalar. Los nombres varían según el navegador. Abra el nuevo icono e inicie sesión con la cuenta de esa instancia. Se trata de una PWA instalada por el navegador; minddy no dispone de una aplicación nativa en el App Store de iOS ni en Google Play.

### Actualizaciones, acceso sin conexión y notificaciones {#operation}

La instalación no crea una copia del proyecto para usarla sin conexión. El service worker de minddy solo gestiona notificaciones push y no almacena las solicitudes de la aplicación en caché. Mantenga una conexión de red y recargue la página para obtener el contenido web actual. Las notificaciones también requieren un navegador compatible, su permiso y una configuración push en el servidor. En iOS, utilice la aplicación instalada cuando el proceso lo indique. Si no aparece la opción de instalación, abra un navegador completo compatible y compruebe si la instancia ya está instalada.

![Guía ilustrada de instalación en Safari de minddy: Compartir, Añadir a pantalla de inicio y confirmar.](/documentation/es/install-the-pwa-workflow.png)

## Instalar y gestionar la aplicación de escritorio {#desktop-app}

Abra la página pública de descargas. En macOS, elija el paquete para Apple silicon o Intel. En Windows, instale la aplicación desde Microsoft Store. En Linux, elija una AppImage o un paquete deb/rpm firmado para x64 o ARM64. Siga la guía de la plataforma y las instrucciones de verificación del paquete. Windows no ofrece un instalador exe.

En el selector de servidor, elija minddy Cloud, el origen de un servidor self-hosted o el entorno local disponible. Compruebe el destino antes de iniciar sesión: cada cuenta pertenece a su instancia. OAuth utiliza el navegador del sistema y vuelve después a la aplicación de escritorio. Un entorno local no significa que el agente de código de Numo trabaje en su carpeta local.

### Pestañas, cierre y actualizaciones {#desktop-app-operation}

Utilice los controles de pestañas y la paleta de comandos para desplazarse entre sus tareas. Siga los atajos indicados para su plataforma: macOS utiliza Command donde Windows y Linux suelen utilizar Control. Cerrar la ventana la oculta y mantiene la aplicación en ejecución. Utilice Salir para terminar la aplicación; en macOS también puede usar Cmd+Q. Las notificaciones en segundo plano dependen del paquete y de las funciones de la plataforma.

macOS y las AppImage portátiles ofrecen actualizaciones dentro de la aplicación. Windows las instala desde Microsoft Store. Para deb/rpm, instale el siguiente paquete verificado. Los ajustes de escritorio de la cuenta muestran el servidor conectado y los controles disponibles de actualización o asistencia. Tras actualizar, compruebe la versión de escritorio indicada y que siga abriéndose la instancia deseada.

![Ajustes de escritorio en la aplicación real de desarrollo Electron para macOS, versión 0.11.1, conectada al servidor local con un perfil aislado.](/documentation/es/desktop-app-workflow.png)

## Activar notificaciones de un dispositivo {#devices-and-notifications}

Abra las notificaciones en la configuración de la cuenta desde el dispositivo que desea registrar. Actívelas y acepte la solicitud de permiso del navegador o del sistema operativo. Si se ha denegado el permiso, debe cambiarlo en la configuración del navegador o del sistema; accionar repetidamente el control de minddy no evita ese rechazo. En iOS, instale y abra primero la aplicación web cuando la interfaz lo exija.

Compruebe que el dispositivo aparece en la lista y use su control de prueba. Consulte la información de la última entrega. Puede desactivar o eliminar registros individuales sin borrar la cuenta. Las preferencias de la bandeja de entrada determinan qué eventos generan notificaciones; la bandeja de entrada de la aplicación sigue disponible cuando el push no lo está.

![Ajustes push con permiso bloqueado en el navegador y ningún dispositivo registrado.](/documentation/es/devices-and-notifications-workflow.png)

### Condiciones por plataforma {#platforms}

El push web requiere un navegador compatible y un servicio push configurado en la instancia. Los avisos nativos y la entrega en segundo plano varían según la plataforma. La aplicación macOS distribuida y firmada admite APNs; el paquete Windows necesita su componente WNS opcional para el transporte en segundo plano. Linux utiliza la sesión en segundo plano de la aplicación distribuida, en lugar de APNs o WNS.

Compruebe el permiso de notificaciones del sistema, el estado de instalación en el navegador y la explicación mostrada si la función no está configurada o no es compatible. Una prueba correcta no garantiza la entrega sin conexión o bajo todas las restricciones de segundo plano del sistema. Mantenga disponible la aplicación o su servicio de segundo plano configurado, según los requisitos de la plataforma.

![Dispositivo de navegador registrado y activo en la cuenta, con la fecha real del último envío.](/documentation/es/devices-and-notifications-registered.png)

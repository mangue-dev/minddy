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
  "revision": 17,
  "sourceRevision": 16,
  "owner": "@mangue-dev",
  "updatedAt": "2026-10-25",
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
      "components/mobile-sidebar-reveal.tsx",
      "components/issue-side-panel.tsx",
      "components/assistant-panel.tsx",
      "public/sw.js",
      "components/marketing/mobile-pwa-install-guide.tsx",
      "components/marketing/mobile-install-guide-copy.ts",
      "content/knowledge/desktop-and-speed.md",
      "app/(marketing)/download/page.tsx",
      "components/settings/account-desktop-section.tsx",
      "docs/linux-desktop.md",
      "components/settings/account-push-devices-section.tsx",
      "lib/desktop/notification-capabilities.ts",
      "lib/query-snapshot-budget.ts",
      "lib/query-persistence.ts",
      "lib/desktop/renderer-recovery.ts",
      "desktop/src/main.ts",
      "lib/query-retention.ts",
      "lib/pull-request-tab-labels.ts",
      "lib/desktop/window-stall-recovery.ts",
      "lib/desktop/local-recovery-load.ts",
      "scripts/desktop-renderer-hang.integration.mjs",
      "lib/use-desktop-notifications.ts",
      "lib/use-desktop-notifications.test.ts",
      "lib/query-provider.tsx",
      "lib/navigation-working-set.ts",
      "lib/query-storage-writes.test.ts",
      "lib/local-snapshot-security.test.ts",
      "components/settings/account-settings-page.tsx",
      "components/desktop/server-choice.tsx",
      "components/desktop/server-choice-entry.tsx",
      "lib/desktop/server-choice.ts",
      "desktop/src/menu.ts",
      "components/auth/auth-chrome.tsx"
    ]
  },
  "review": {
    "revision": 17,
    "fact": "agent:/root/min747 (0.20.0 release review: source audit against the v0.11.0..main delta, no correction needed; 3 screenshot(s) recaptured on 2026-10-20 from the local candidate and inspected; 2 screenshot(s) without a current capture script keep their earlier capture and evidence; no browser walkthrough of the procedures or operator rehearsal; earlier evidence retained in git history); agent:/root (MIN-765 desktop preview channel removal: source review of components/settings/account-desktop-section.tsx and desktop/src/menu.ts; the Desktop app card no longer lists a preview channel; unchanged evidence retained; no browser walkthrough, no new captures); agent:claude-code (it/es catalog language review: quoted labels aligned on the corrected es catalog; no behavior change, no new captures); agent:claude-code (it/es catalog review recapture of web-and-mobile-workflow, devices-and-notifications-workflow on 2026-10-22 from a local candidate of this branch against the preview demo account; images inspected; no form submitted); agent:claude-code (manual figures rebuilt on the Aurora demo, catalog review labels and informal register; figures recaptured on 2026-10-22 from a local candidate against the preview demo account and inspected; no form submitted); agent:claude-code (MIN-781 self-hosting from the desktop app: source review of components/desktop/server-choice.tsx, components/auth/auth-chrome.tsx, desktop/src/main.ts, desktop/src/menu.ts and lib/desktop/server-choice.ts; no desktop walkthrough, no screenshot recaptured)",
    "language": "agent:/root/min747 (es translation of the release corrections with catalog UI labels; equivalent meaning self-reviewed; agent review, not human acceptance); agent:/root (es MIN-765 removal edit; retained-meaning self-review; agent review, not human acceptance); agent:claude-code (es label alignment after the full catalog review; self-reviewed; agent review, not human acceptance); agent:claude-code (es manual figures rebuilt on the Aurora demo, catalog review labels and informal register; self-reviewed; agent review, not human acceptance); agent:claude-code (es MIN-781 translation on self-hosting from the desktop app, with catalog UI labels; self-reviewed; agent review, not human acceptance)",
    "date": "2026-10-25"
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
      "caption": "En una pantalla estrecha, los detalles de la incidencia ocupan un panel adaptable. Usa el botón de cierre para volver al proyecto; Numo sigue disponible mediante su botón flotante.",
      "revision": 17,
      "reviewed": true,
      "capturedAt": "2026-10-22",
      "viewport": [
        438,
        1032
      ],
      "theme": "light",
      "padding": 24,
      "deviceScaleFactor": 2
    },
    {
      "id": "install-the-pwa-workflow",
      "kind": "screenshot",
      "src": "/documentation/es/install-the-pwa-workflow.png",
      "alt": "Guía ilustrada de instalación en Safari de minddy: Compartir, Añadir a pantalla de inicio y confirmar.",
      "caption": "La guía pública ilustra los tres pasos de Safari y la opción Abrir como app web que debe permanecer activada. Son ilustraciones didácticas mostradas por minddy, no capturas de una instalación de iOS realizada.",
      "revision": 17,
      "reviewed": true,
      "capturedAt": "2026-10-20",
      "viewport": [
        1488,
        736
      ],
      "theme": "light",
      "padding": 24,
      "deviceScaleFactor": 2
    },
    {
      "id": "devices-and-notifications-workflow",
      "kind": "screenshot",
      "src": "/documentation/es/devices-and-notifications-workflow.png",
      "alt": "Ajustes push con permiso bloqueado en el navegador y ningún dispositivo registrado.",
      "caption": "Este navegador bloquea las notificaciones. Restablece el permiso del sitio antes de registrar este dispositivo.",
      "revision": 17,
      "reviewed": true,
      "capturedAt": "2026-10-22",
      "viewport": [
        816,
        196
      ],
      "theme": "light",
      "padding": 24,
      "deviceScaleFactor": 2
    },
    {
      "id": "devices-and-notifications-registered-workflow",
      "kind": "screenshot",
      "src": "/documentation/es/devices-and-notifications-registered.png",
      "alt": "Dispositivo de navegador registrado y activo en la cuenta, con la fecha real del último envío.",
      "caption": "La cuenta tiene un dispositivo de navegador registrado y activo. La lista muestra las fechas de registro y del último envío. La aparición de una notificación sigue dependiendo del permiso del navegador y de los ajustes del sistema operativo.",
      "revision": 17,
      "reviewed": true,
      "capturedAt": "2026-10-22",
      "viewport": [
        816,
        208
      ],
      "theme": "light",
      "padding": 24,
      "deviceScaleFactor": 2
    },
    {
      "id": "desktop-renderer-recovery",
      "kind": "screenshot",
      "src": "/documentation/es/desktop-renderer-recovery.png",
      "alt": "Página local de recuperación tras un fallo forzado del proceso de renderizado, con los controles Reload window y Check server settings.",
      "caption": "Página de recuperación en la aplicación de desarrollo para macOS, con un perfil aislado y un servidor de demostración. La interfaz nativa utiliza etiquetas en inglés en todos los idiomas.",
      "revision": 17,
      "reviewed": true,
      "capturedAt": "2026-10-10",
      "viewport": [
        1280,
        860
      ],
      "theme": "light",
      "padding": 0,
      "deviceScaleFactor": 2
    }
  ],
  "requiredFigures": [
    "web-and-mobile-workflow",
    "install-the-pwa-workflow",
    "devices-and-notifications-workflow",
    "devices-and-notifications-registered-workflow",
    "desktop-renderer-recovery"
  ]
}
---

Puedes acceder a la misma instancia desde el navegador, una aplicación web instalada o la aplicación de escritorio. Sigue los pasos de instalación de tu dispositivo y comprueba después la conexión, las actualizaciones y los permisos de notificación de esa plataforma.

## Trabajar en navegador y móvil {#web-and-mobile}

Abre la dirección de tu instancia e inicia sesión en ella. En una pantalla estrecha, muestra la barra lateral para elegir un proyecto y abre una incidencia desde su lista o tablero. Consulta los detalles en el panel adaptado a la pantalla, cambia el campo previsto o añade un comentario y espera el resultado del guardado antes de cerrar. Cierra el panel de detalles para volver a la lista; su presentación móvil difiere de la de una pantalla amplia.

Abre Numo mediante su botón flotante o una acción contextual de la incidencia. Comprueba el contexto de la incidencia en el campo de composición. Si otro panel cubre el contenido que necesitas, ciérralo antes de seguir navegando. En dispositivos táctiles, utiliza los botones y menús visibles; no des por hecho que están disponibles las acciones al pasar el cursor o los atajos de escritorio.

### Teclado y conexión {#access}

Con el teclado puedes enfocar los controles y utilizar la paleta de comandos para navegar y realizar acciones habituales. El botón de envío visible ofrece una alternativa al envío por teclado. Sigue el atajo que la aplicación muestra para tu plataforma.

El navegador y la aplicación web instalada necesitan conexión de red para consultar los datos de los proyectos y guardar cambios. El service worker gestiona las notificaciones push sin implementar una caché de datos sin conexión. Tras un fallo de conexión, comprueba si el cambio se guardó antes de repetirlo. Instalar la PWA no crea una cuenta independiente ni evita los permisos de la instancia.

![Panel móvil de una incidencia con título, descripción, propiedades y campo de comentario.](/documentation/es/web-and-mobile-workflow.png)

## Instalar la aplicación web en móvil o tableta {#install-the-pwa}

Abre la instancia de minddy que deseas usar en Safari en un iPhone o iPad, o en Chrome u otro navegador compatible de Android. Si el enlace se abrió dentro de otra aplicación, ábrelo primero en el navegador completo. Para una instancia self-hosted, utiliza la dirección de tu propio servidor.

En iOS, abre Compartir y elige Añadir a pantalla de inicio. Mantén Abrir como app web activado y pulsa Añadir. Según la interfaz de Safari, puedes tener que abrir Más antes de Compartir. Si falta la acción, revisa Editar acciones.

En Android, utiliza la propuesta de instalación o elige Instalar aplicación o Añadir a pantalla de inicio en el menú del navegador y confirma Instalar. Los nombres varían según el navegador. Abre el nuevo icono e inicia sesión con la cuenta de esa instancia. Se trata de una PWA instalada por el navegador; minddy no dispone de una aplicación nativa en el App Store de iOS ni en Google Play.

### Actualizaciones, acceso sin conexión y notificaciones {#operation}

La instalación no crea una copia del proyecto para usarla sin conexión. El service worker de minddy solo gestiona notificaciones push y no almacena las solicitudes de la aplicación en caché. Mantén una conexión de red y recarga la página para obtener el contenido web actual. Las notificaciones también requieren un navegador compatible, tu permiso y una configuración push en el servidor. En iOS, utiliza la aplicación instalada cuando el proceso lo indique. Si no aparece la opción de instalación, abre un navegador completo compatible y comprueba si la instancia ya está instalada.

![Guía ilustrada de instalación en Safari de minddy: Compartir, Añadir a pantalla de inicio y confirmar.](/documentation/es/install-the-pwa-workflow.png)

## Instalar y gestionar la aplicación de escritorio {#desktop-app}

Abre la página pública de descargas. En macOS, elige el paquete para Apple silicon o Intel. En Windows, instala la aplicación desde Microsoft Store. En Linux, elige una AppImage o un paquete `deb`/`rpm` firmado para x64 o ARM64. Sigue la guía de la plataforma y las instrucciones de verificación del paquete. Windows no ofrece un instalador `exe`.

En el primer inicio, la aplicación abre la pantalla de registro de minddy Cloud, donde creas tu cuenta. Para usar tu propia instancia, haz clic en **Autoalojar minddy**, en la parte inferior de las pantallas de inicio de sesión y registro. Se abre **Autoalojar minddy**, con tres opciones: **Instalar en este equipo** prepara una [instancia local](/es/documentacion/install-locally#install-locally), **Instalar en un servidor** abre en tu navegador la guía pública para instalar un servidor, y **Usar una instalación existente** abre una pantalla que reúne las instalaciones que ya tienes. Allí, **En este equipo** abre una carpeta de minddy que ya está en este equipo y la app la inicia; debajo, **Dirección del servidor** con **Conectar** te une a un servidor que gestionas. Los servidores remotos requieren HTTPS; `localhost` puede usar HTTP.

Para cambiar de servidor más adelante, elige **Connect to a Server…** en el menú nativo minddy (el menú nativo está en inglés; en Windows y Linux, pulsa Alt para mostrar la barra de menús), **Cambiar…** junto a **Servidor conectado** en **Ajustes de cuenta** → **Preferencias** → **Aplicación de escritorio**, o **Autoalojar minddy** en la parte inferior de las pantallas de inicio de sesión y registro. Cada opción lleva la ventana de la aplicación a **Autoalojar minddy**; si hay un servidor autoalojado conectado, **Usar minddy Cloud**, en **Usar una instalación existente**, vuelve a Cloud. La ruta en la parte superior de la página lleva de vuelta a cada paso, y el logo de minddy regresa a la aplicación. Esta pantalla está integrada en la app de escritorio y se abre sin conexión a Internet. Comprueba el destino antes de iniciar sesión: cada cuenta pertenece a su instancia. OAuth utiliza el navegador del sistema y vuelve después a la aplicación de escritorio.

### Pestañas, cierre y actualizaciones {#desktop-app-operation}

Utiliza los controles de pestañas y la paleta de comandos para desplazarte entre tus tareas. Sigue los atajos indicados para tu plataforma: macOS utiliza Command donde Windows y Linux suelen utilizar Control. Cerrar la ventana la oculta y mantiene la aplicación en ejecución. Utiliza Salir para terminar la aplicación; en macOS también puedes usar Cmd+Q. Las notificaciones en segundo plano dependen del paquete y de las funciones de la plataforma.

macOS y las AppImage portátiles ofrecen actualizaciones dentro de la aplicación. Windows las instala desde Microsoft Store. Para `deb`/`rpm`, instala el siguiente paquete verificado. En la aplicación de escritorio, **Ajustes de cuenta** → **Preferencias** → **Aplicación de escritorio** muestra el servidor conectado y la versión de la aplicación, con una comprobación de actualizaciones cuando el paquete la admite. En la web, la misma tarjeta enlaza a la página de descarga. Tras actualizar, comprueba la versión de escritorio indicada y que siga abriéndose la instancia deseada.

### Recuperar una ventana bloqueada {#desktop-renderer-recovery}

Si una ventana de escritorio falla, una página local de recuperación ofrece **Reload window**. Utiliza este botón para volver a abrir la última pantalla en el servidor seleccionado actualmente. Los cambios sin guardar pueden perderse. La aplicación espera tu acción en lugar de volver a cargar repetidamente la página que falla. Si la página de recuperación también falla, el mensaje nativo te pide que cierres y vuelvas a abrir minddy. Estos controles nativos de recuperación utilizan actualmente etiquetas en inglés.

Si una página sigue cargando después de 30 segundos, o una ventana no responde durante cinco segundos desde que la aplicación de escritorio lo detecta, un diálogo nativo ofrece **Wait** y **Recover window**. **Wait** es la opción predeterminada y mantiene tu trabajo y la solicitud en curso. El diálogo se cierra cuando termina la carga o la ventana vuelve a responder. La recuperación puede perder cambios sin guardar: elige **Recover window** para abrir la página local de recuperación y después **Reload window** para volver a la última pantalla.

La caché de consultas guardada, que es opcional, tiene un límite de 2 MiB de datos. Si la caché completa es demasiado grande, minddy conserva resultados de consultas completos que se puedan guardar y da prioridad, cuando hace falta, a las vistas actuales y las pestañas de la barra. Si esa selección aún supera el límite, se elimina la instantánea local anterior. Los datos omitidos de la caché guardada permanecen en memoria durante la sesión y se vuelven a consultar cuando sean necesarios después de reiniciar. Los borradores guardados por separado no se ven afectados. Esta caché no es una copia de seguridad de tu trabajo.

Para reducir el uso de memoria en sesiones largas, los detalles de PR, los diffs de commits y los contenidos de páginas inactivos se liberan después de un minuto y se vuelven a cargar cuando hacen falta. Las consultas activas se conservan. Las etiquetas de las pestañas solo guardan información ligera de las PR, por lo que mantener una pestaña abierta no retiene sus patches.

![Página local de recuperación tras un fallo forzado del proceso de renderizado, con los controles Reload window y Check server settings.](/documentation/es/desktop-renderer-recovery.png)

## Activar notificaciones de un dispositivo {#devices-and-notifications}

Abre las notificaciones en los ajustes de la cuenta desde el dispositivo que deseas registrar. Actívalas y acepta la solicitud de permiso del navegador o del sistema operativo. Si se ha denegado el permiso, debes cambiarlo en la configuración del navegador o del sistema; accionar repetidamente el control de minddy no evita ese rechazo. En iOS, instala y abre primero la aplicación web cuando la interfaz lo exija.

Comprueba que el dispositivo aparece en la lista y usa su control de prueba. Consulta la información de la última entrega. Puedes desactivar o eliminar registros individuales sin borrar la cuenta. Las categorías de **Ajustes de cuenta** → **Notificaciones** determinan qué eventos generan notificaciones; la bandeja de entrada de la aplicación sigue disponible cuando el push no lo está.

![Ajustes push con permiso bloqueado en el navegador y ningún dispositivo registrado.](/documentation/es/devices-and-notifications-workflow.png)

### Condiciones por plataforma {#platforms}

El push web requiere un navegador compatible y un servicio push configurado en la instancia. Los avisos nativos y la entrega en segundo plano varían según la plataforma. La aplicación macOS distribuida y firmada admite APNs; el paquete Windows necesita su componente WNS opcional para el transporte en segundo plano. Linux utiliza la sesión en segundo plano de la aplicación distribuida, en lugar de APNs o WNS.

Si el servidor seleccionado no tiene APNs o WNS configurado, la aplicación de escritorio usa avisos nativos locales mientras está abierta u oculta. Esta alternativa deja de entregar notificaciones al salir de la aplicación.

Comprueba el permiso de notificaciones del sistema, el estado de instalación en el navegador y la explicación mostrada si la función no está configurada o no es compatible. Una prueba correcta no garantiza la entrega sin conexión o bajo todas las restricciones de segundo plano del sistema. Mantén disponible la aplicación o su servicio de segundo plano configurado, según los requisitos de la plataforma.

![Dispositivo de navegador registrado y activo en la cuenta, con la fecha real del último envío.](/documentation/es/devices-and-notifications-registered.png)

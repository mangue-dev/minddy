---
{
  "id": "applications",
  "locale": "es",
  "title": "Aplicaciones web, móviles y de escritorio",
  "summary": "Usar minddy en un navegador, instalar la aplicación de iOS, la aplicación web o la de escritorio y configurar las notificaciones del dispositivo.",
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
    "A03",
    "A13"
  ],
  "visibility": "public",
  "status": "published",
  "revision": 22,
  "sourceRevision": 21,
  "owner": "@mangue-dev",
  "updatedAt": "2026-11-13",
  "compatibility": {
    "version": "0.30.0 (MIN-794 release review)",
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
      "components/mobile-navigation.tsx",
      "components/auth/auth-entry.tsx",
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
      "components/auth/auth-chrome.tsx",
      "lib/desktop/window-material.ts",
      "components/ui/mobile-sheet.tsx",
      "lib/sheet-swipe-dismiss.ts",
      "mobile/README.md",
      "components/mobile/shell.tsx",
      "components/mobile/ai-consent-gate.tsx",
      "lib/mobile/ai-consent.ts",
      "lib/server/ai-consent.ts",
      "components/settings/account-mobile-section.tsx",
      "lib/mobile/haptics.ts",
      "lib/apple-app-site-association.ts",
      "lib/mobile/public-links.ts",
      "lib/native-app.ts"
    ]
  },
  "review": {
    "revision": 22,
    "fact": "agent:claude-code (MIN-973 iOS app: new ios-app section with sign-in, server choice, offline screen, universal links, push, vibrations, purchases hidden and AI consent, and the iOS app in the PWA and notification passages; checked against mobile/README.md, components/mobile/shell.tsx, components/auth/auth-chrome.tsx, components/mobile/ai-consent-gate.tsx, lib/mobile/ai-consent.ts, lib/server/ai-consent.ts, components/settings/account-mobile-section.tsx, lib/apple-app-site-association.ts and the catalogs; not walked through on a device or on the App Store listing; 3 figures captured on 2026-11-13 from the local candidate in a phone-sized page with the shell bridge stubbed, inspected in all six locales; earlier figures kept with their capture dates); agent:claude-code (MIN-896 bottom sheets closed by a downward swipe, after the list scrolls back to its top; checked against components/ui/mobile-sheet.tsx and lib/sheet-swipe-dismiss.ts and their tests; not checked on a physical phone; rest of the article unchanged since the previous review; no figure recaptured, existing figures do not show the gesture); agent:claude-code (0.30.0 release review, MIN-794: its evidence changes in the v0.20.0..0.30.0 delta were documented by the pull requests that made them; the article was updated by pull requests in that delta; not re-audited line by line; 4 screenshot(s) recaptured on 2026-11-04 from a local candidate against the preview demo account and inspected, 1 kept with their earlier capture; no browser walkthrough of the procedures); agent:claude-code (MIN-907 phone menu opened from the bottom bar as a sheet, and the desktop app's first launch on the single sign-in and sign-up screen: checked against components/mobile-navigation.tsx, components/auth/auth-entry.tsx, components/auth/auth-chrome.tsx and desktop/src/main.ts; no browser walkthrough; existing figures do not show the bottom bar or the sign-in screen and were kept); agent:claude-code (MIN-907 store submission prep: the browser-install passage no longer states that minddy has no App Store app, ahead of the iOS app; checked against messages/*.json DownloadMobile.noteBody; no figure affected)",
    "language": "agent:claude-code (es MIN-973 iOS app section and passages, with catalog UI labels, in the locale's register and glossary; self-reviewed; agent review, not human acceptance); agent:claude-code (es changed passage on closing bottom sheets, in the locale's register and glossary; self-reviewed; agent review, not human acceptance); agent:claude-code (es MIN-907 phone menu and desktop first-launch passages, with catalog UI labels, in the locale's register and glossary; self-reviewed; agent review, not human acceptance); agent:claude-code (es MIN-907 browser-install sentence, in the locale's register; self-reviewed; agent review, not human acceptance)",
    "date": "2026-11-13"
  },
  "related": [
    "issues"
  ],
  "aliases": [
    "web-and-mobile",
    "install-the-pwa",
    "desktop-app",
    "desktop-and-speed",
    "devices-and-notifications",
    "ios-app"
  ],
  "tags": [
    "Trabajar en navegador y móvil",
    "Instalar la aplicación de iOS",
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
      "revision": 22,
      "reviewed": true,
      "capturedAt": "2026-11-04",
      "viewport": [
        438,
        1032
      ],
      "theme": "light",
      "padding": 24,
      "deviceScaleFactor": 2
    },
    {
      "id": "ios-app-sign-in",
      "kind": "screenshot",
      "src": "/documentation/es/ios-app-sign-in.png",
      "alt": "La pantalla Inicia sesión o regístrate de la aplicación de iOS, con el campo de correo, los botones de Apple, Google y GitHub y Autoalojar minddy.",
      "caption": "En la aplicación de iOS, Autoalojar minddy sigue a los servicios de inicio de sesión. Las ventanas de inicio de sesión de Apple y del sistema no aparecen en esta captura.",
      "revision": 22,
      "reviewed": true,
      "capturedAt": "2026-11-13",
      "viewport": [
        386,
        502
      ],
      "theme": "light",
      "padding": 24,
      "deviceScaleFactor": 2
    },
    {
      "id": "ios-app-ai-consent",
      "kind": "screenshot",
      "src": "/documentation/es/ios-app-ai-consent.png",
      "alt": "La ventana ¿Usar las funciones de IA? de la aplicación de iOS, con Ahora no y Permitir.",
      "caption": "La pregunta que aparece una vez en cada dispositivo antes de cualquier función de IA. Ahora no deja las funciones de IA desactivadas en la aplicación.",
      "revision": 22,
      "reviewed": true,
      "capturedAt": "2026-11-13",
      "viewport": [
        442,
        515
      ],
      "theme": "light",
      "padding": 24,
      "deviceScaleFactor": 2
    },
    {
      "id": "ios-app-mobile-preferences",
      "kind": "screenshot",
      "src": "/documentation/es/ios-app-mobile-preferences.png",
      "alt": "El grupo Aplicación móvil de las preferencias de la aplicación de iOS, con los interruptores Vibración y Funciones de IA.",
      "caption": "Este grupo solo aparece en la aplicación de iOS. Funciones de IA cambia la respuesta dada a la pregunta del primer inicio.",
      "revision": 22,
      "reviewed": true,
      "capturedAt": "2026-11-13",
      "viewport": [
        418,
        305
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
      "revision": 22,
      "reviewed": true,
      "capturedAt": "2026-11-04",
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
      "revision": 22,
      "reviewed": true,
      "capturedAt": "2026-11-04",
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
      "revision": 22,
      "reviewed": true,
      "capturedAt": "2026-11-04",
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
      "revision": 22,
      "reviewed": true,
      "capturedAt": "2026-10-28",
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
    "ios-app-sign-in",
    "ios-app-ai-consent",
    "ios-app-mobile-preferences",
    "install-the-pwa-workflow",
    "devices-and-notifications-workflow",
    "devices-and-notifications-registered-workflow",
    "desktop-renderer-recovery"
  ]
}
---

Puedes acceder a la misma instancia desde el navegador, la aplicación de iOS, una aplicación web instalada o la aplicación de escritorio. Sigue los pasos de instalación de tu dispositivo y comprueba después la conexión, las actualizaciones y los permisos de notificación de esa plataforma.

## Trabajar en navegador y móvil {#web-and-mobile}

Abre la dirección de tu instancia e inicia sesión en ella. En una pantalla estrecha, abre el menú, a la izquierda de la barra inferior de la pantalla, para elegir un proyecto y abre una incidencia desde su lista o tablero. Consulta los detalles en el panel adaptado a la pantalla, cambia el campo previsto o añade un comentario y espera el resultado del guardado antes de cerrar. Cierra el panel de detalles para volver a la lista; su presentación móvil difiere de la de una pantalla amplia.

En el teléfono, los menús, los selectores y los diálogos se abren en un panel inferior. Ciérralo con su botón de cerrar o deslizándolo hacia abajo; si su lista está desplazada, el gesto primero la devuelve arriba.

Abre Numo mediante su botón flotante o una acción contextual de la incidencia. Comprueba el contexto de la incidencia en el campo de composición. Si otro panel cubre el contenido que necesitas, ciérralo antes de seguir navegando. En dispositivos táctiles, utiliza los botones y menús visibles; no des por hecho que están disponibles las acciones al pasar el cursor o los atajos de escritorio.

### Teclado y conexión {#access}

Con el teclado puedes enfocar los controles y utilizar la paleta de comandos para navegar y realizar acciones habituales. El botón de envío visible ofrece una alternativa al envío por teclado. Sigue el atajo que la aplicación muestra para tu plataforma.

El navegador y la aplicación web instalada necesitan conexión de red para consultar los datos de los proyectos y guardar cambios. El service worker gestiona las notificaciones push sin implementar una caché de datos sin conexión. Tras un fallo de conexión, comprueba si el cambio se guardó antes de repetirlo. Instalar la PWA no crea una cuenta independiente ni evita los permisos de la instancia.

![Panel móvil de una incidencia con título, descripción, propiedades y campo de comentario.](/documentation/es/web-and-mobile-workflow.png)

## Instalar la aplicación de iOS {#ios-app}

En iPhone y iPad, instala minddy desde el App Store. La aplicación necesita iOS 15 o posterior. Muestra la interfaz del servidor al que está conectada, minddy Cloud o tu propia instancia, así que las nuevas funciones de minddy le llegan sin actualizar la aplicación.

En el primer inicio, unas pantallas presentan minddy; **Empezar** lleva a **Inicia sesión o regístrate**. Escribe tu correo electrónico y elige **Continuar**, o usa **Continuar con Apple**, **Continuar con Google** o **Continuar con GitHub**. Apple abre su propia ventana de inicio de sesión; Google y GitHub abren la ventana de inicio de sesión del sistema sobre la aplicación y vuelven a ella al terminar. El resto sigue los mismos pasos que en la web; consulta [Crear una cuenta e iniciar sesión](/es/documentacion/accounts#account-access).

Para usar una instancia autoalojada, toca **Autoalojar minddy** debajo de las opciones de inicio de sesión. En **Conéctate a tu servidor**, escribe la dirección de la instancia en **Dirección del servidor** y toca **Conectar**. Los servidores remotos requieren HTTPS; una dirección escrita sin esquema usa HTTPS. **Volver** regresa a la pantalla de inicio de sesión y, cuando la aplicación está en un servidor autoalojado, **Usar minddy Cloud** vuelve a Cloud. Las cuentas pertenecen a su instancia: inicia sesión con la cuenta del servidor que elegiste. **Autoalojar minddy** solo aparece en la pantalla de inicio de sesión, así que cierra sesión primero para cambiar de servidor.

Si el servidor no responde, la aplicación muestra **No se puede conectar con el servidor**, o **No tienes conexión** cuando el dispositivo no tiene red. **Intentar de nuevo** recarga la página, y la aplicación también lo vuelve a intentar sola cuando vuelve la red. **Cambiar de servidor** abre **Conéctate a tu servidor**.

![La pantalla Inicia sesión o regístrate de la aplicación de iOS, con el campo de correo, los botones de Apple, Google y GitHub y Autoalojar minddy.](/documentation/es/ios-app-sign-in.png)

### Enlaces, notificaciones, vibración y facturación {#ios-app-operation}

Un enlace a `www.minddy.app` que toques en Mail, Mensajes o Notas abre la aplicación en esa página, estuviera abierta o no: una incidencia, un proyecto, una página o un enlace de correo que confirma tu cuenta, restablece tu contraseña o acepta una invitación. Los enlaces a la facturación, al sitio público, a este manual y los enlaces públicos para compartir siguen abriéndose en el navegador. Los enlaces a una instancia autoalojada se abren en el navegador y, mientras la aplicación esté conectada a un servidor autoalojado, un enlace de minddy Cloud se abre en Safari. Dentro de la aplicación, los enlaces al sitio público, como los precios, el manual o las páginas legales, se abren en una ventana de Safari sobre la aplicación.

Para recibir notificaciones push, abre **Ajustes de la cuenta** → **Notificaciones** en la aplicación y activa **Notificar en este dispositivo**. iOS pide permiso la primera vez; después, las notificaciones llegan aunque la aplicación esté cerrada. Al tocar una se abre la incidencia, la página o el elemento del que trata. Si iOS bloquea las notificaciones, **Abrir Ajustes** abre los ajustes de notificación de minddy en la app Ajustes. Consulta [Activar notificaciones de un dispositivo](#devices-and-notifications).

La aplicación vibra suavemente al elegir una opción, activar un interruptor o copiar algo, y con más fuerza al crear una incidencia o un objetivo, completar una incidencia o enviar un comentario. Para desactivarlo, abre **Ajustes de la cuenta** → **Preferencias** → **Aplicación móvil** y desactiva **Vibración**. El ajuste pertenece a tu cuenta, así que te acompaña en tus otros teléfonos.

La aplicación no vende nada. No muestra la página de facturación, los planes ni los botones para mejorar el plan, y una función que tu plan no incluye lo indica sin ofrecer una mejora. Gestiona tu suscripción en un navegador, en el sitio web de minddy; la aplicación reconoce tu plan al iniciar sesión.

### Permitir o rechazar las funciones de IA {#ios-app-ai}

Numo, Smart Fill, el dictado y la búsqueda envían el contenido con el que trabajan (texto de las incidencias, comentarios, páginas, grabaciones) al proveedor del modelo de IA que usa la instancia. Antes de la primera de esas solicitudes, la aplicación pregunta **¿Usar las funciones de IA?** una vez en cada dispositivo, después del inicio de sesión y de los primeros pasos. La política de privacidad, enlazada desde la ventana, nombra a los proveedores. Elige **Permitir** para usar las funciones de IA, o **Ahora no** para dejarlas desactivadas en esta aplicación. Si cierras la ventana sin elegir, la pregunta vuelve en el siguiente inicio. Cerrar sesión borra la respuesta, así que la próxima cuenta que inicie sesión en el dispositivo vuelve a recibir la pregunta.

Si la rechazas, la aplicación no inicia ningún trabajo de IA: enviar un mensaje a Numo, dictar o usar otra función de IA vuelve a mostrar la ventana para que puedas permitirlo desde ahí. Una nueva incidencia se crea sin Smart Fill, la búsqueda de incidencias solo las encuentra por sus palabras, sin la [búsqueda por significado](/es/documentacion/navigation#search-by-meaning), y una mención a Numo en un comentario no recibe respuesta. El resto de minddy funciona con normalidad. La web y la aplicación de escritorio nunca hacen esta pregunta, y rechazarla en la aplicación no limita lo que haces allí. Tu última respuesta sí se aplica al trabajo de IA que minddy realiza en segundo plano para tu cuenta: tras **Ahora no**, Smart Assign y Smart Fill en los proyectos de los que eres propietario, tus rutinas programadas y los recordatorios de Numo dejan de usar la IA.

Para cambiar tu respuesta, abre **Ajustes de la cuenta** → **Preferencias** → **Aplicación móvil** y activa o desactiva **Funciones de IA**.

![La ventana ¿Usar las funciones de IA? de la aplicación de iOS, con Ahora no y Permitir.](/documentation/es/ios-app-ai-consent.png)

![El grupo Aplicación móvil de las preferencias de la aplicación de iOS, con los interruptores Vibración y Funciones de IA.](/documentation/es/ios-app-mobile-preferences.png)

## Instalar la aplicación web en móvil o tableta {#install-the-pwa}

En iPhone y iPad, la [aplicación de iOS](#ios-app) es la opción habitual. La aplicación web instalada sigue disponible en Android y para quien prefiera el navegador.

Abre la instancia de minddy que deseas usar en Safari en un iPhone o iPad, o en Chrome u otro navegador compatible de Android. Si el enlace se abrió dentro de otra aplicación, ábrelo primero en el navegador completo. Para una instancia self-hosted, utiliza la dirección de tu propio servidor.

En iOS, abre Compartir y elige Añadir a pantalla de inicio. Mantén Abrir como app web activado y pulsa Añadir. Según la interfaz de Safari, puedes tener que abrir Más antes de Compartir. Si falta la acción, revisa Editar acciones.

En Android, utiliza la propuesta de instalación o elige Instalar aplicación o Añadir a pantalla de inicio en el menú del navegador y confirma Instalar. Los nombres varían según el navegador. Abre el nuevo icono e inicia sesión con la cuenta de esa instancia. Así, el navegador instala minddy como una app web.

### Actualizaciones, acceso sin conexión y notificaciones {#operation}

La instalación no crea una copia del proyecto para usarla sin conexión. El service worker de minddy solo gestiona notificaciones push y no almacena las solicitudes de la aplicación en caché. Mantén una conexión de red y recarga la página para obtener el contenido web actual. Las notificaciones también requieren un navegador compatible, tu permiso y una configuración push en el servidor. En iOS, utiliza la aplicación instalada cuando el proceso lo indique. Si no aparece la opción de instalación, abre un navegador completo compatible y comprueba si la instancia ya está instalada.

![Guía ilustrada de instalación en Safari de minddy: Compartir, Añadir a pantalla de inicio y confirmar.](/documentation/es/install-the-pwa-workflow.png)

## Instalar y gestionar la aplicación de escritorio {#desktop-app}

Abre la página pública de descargas. En macOS, elige el paquete para Apple silicon o Intel. En Windows, instala la aplicación desde Microsoft Store. En Linux, elige una AppImage o un paquete `deb`/`rpm` firmado para x64 o ARM64. Sigue la guía de la plataforma y las instrucciones de verificación del paquete. Windows no ofrece un instalador `exe`. La aplicación para macOS requiere macOS 13 (Ventura) o posterior; en una versión anterior, una aplicación ya instalada conserva su versión actual y no recibe más actualizaciones.

En el primer inicio, la aplicación abre la pantalla **Inicia sesión o regístrate** de minddy Cloud, donde inicias sesión o creas tu cuenta. Para usar tu propia instancia, haz clic en **Autoalojar minddy**, en la parte inferior de esa pantalla. Se abre **Autoalojar minddy**, con tres opciones: **Instalar en este equipo** prepara una [instancia local](/es/documentacion/install-locally#install-locally), **Instalar en un servidor** abre en tu navegador la guía pública para instalar un servidor, y **Usar una instalación existente** abre una pantalla que reúne las instalaciones que ya tienes. Allí, **En este equipo** abre una carpeta de minddy que ya está en este equipo y la app la inicia; debajo, **Dirección del servidor** con **Conectar** te une a un servidor que gestionas. Los servidores remotos requieren HTTPS; `localhost` puede usar HTTP.

Para cambiar de servidor más adelante, elige **Connect to a Server…** en el menú nativo minddy (el menú nativo está en inglés; en Windows y Linux, pulsa Alt para mostrar la barra de menús), **Cambiar…** junto a **Servidor conectado** en **Ajustes de cuenta** → **Preferencias** → **Aplicación de escritorio**, o **Autoalojar minddy** en la parte inferior de la pantalla **Inicia sesión o regístrate**. Cada opción lleva la ventana de la aplicación a **Autoalojar minddy**; si hay un servidor autoalojado conectado, **Usar minddy Cloud**, en **Usar una instalación existente**, vuelve a Cloud. La ruta en la parte superior de la página lleva de vuelta a cada paso, y el logo de minddy regresa a la aplicación. Esta pantalla está integrada en la app de escritorio y se abre sin conexión a Internet. Comprueba el destino antes de iniciar sesión: cada cuenta pertenece a su instancia. OAuth utiliza el navegador del sistema y vuelve después a la aplicación de escritorio.

En macOS y Windows 11, la barra lateral, las pestañas y los bordes de la ventana dejan ver tu escritorio, difuminado, detrás del contenido opaco. Una ventana a pantalla completa sigue opaca, y la transparencia vuelve cuando sale de la pantalla completa. Para mantener la ventana opaca en este dispositivo, desactiva **Transparencia de la aplicación de escritorio** en **Ajustes de cuenta** → **Preferencias** → [Apariencia](/docs/accounts#preferences).

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

Abre las notificaciones en los ajustes de la cuenta desde el dispositivo que deseas registrar. Actívalas y acepta la solicitud de permiso del navegador o del sistema operativo. Si se ha denegado el permiso, debes cambiarlo en la configuración del navegador o del sistema; accionar repetidamente el control de minddy no evita ese rechazo. La [aplicación de iOS](#ios-app-operation) se registra directamente. En Safari en iPhone o iPad, instala y abre primero la aplicación web cuando la interfaz lo exija.

Comprueba que el dispositivo aparece en la lista y usa su control de prueba. Consulta la información de la última entrega. Puedes desactivar o eliminar registros individuales sin borrar la cuenta. Las categorías de **Ajustes de cuenta** → **Notificaciones** determinan qué eventos generan notificaciones; la bandeja de entrada de la aplicación sigue disponible cuando el push no lo está.

![Ajustes push con permiso bloqueado en el navegador y ningún dispositivo registrado.](/documentation/es/devices-and-notifications-workflow.png)

### Condiciones por plataforma {#platforms}

El push web requiere un navegador compatible y un servicio push configurado en la instancia. Los avisos nativos y la entrega en segundo plano varían según la plataforma. La aplicación de iOS recibe las notificaciones por APNs, incluso cerrada. La aplicación macOS distribuida y firmada admite APNs; el paquete Windows necesita su componente WNS opcional para el transporte en segundo plano. Linux utiliza la sesión en segundo plano de la aplicación distribuida, en lugar de APNs o WNS.

Si el servidor seleccionado no tiene APNs o WNS configurado, la aplicación de escritorio usa avisos nativos locales mientras está abierta u oculta. Esta alternativa deja de entregar notificaciones al salir de la aplicación.

Comprueba el permiso de notificaciones del sistema, el estado de instalación en el navegador y la explicación mostrada si la función no está configurada o no es compatible. Una prueba correcta no garantiza la entrega sin conexión o bajo todas las restricciones de segundo plano del sistema. Mantén disponible la aplicación o su servicio de segundo plano configurado, según los requisitos de la plataforma.

![Dispositivo de navegador registrado y activo en la cuenta, con la fecha real del último envío.](/documentation/es/devices-and-notifications-registered.png)

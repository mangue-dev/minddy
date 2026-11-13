---
{
  "id": "accounts",
  "locale": "es",
  "title": "Cuentas",
  "summary": "Crea y protege tu cuenta, recupera el acceso, cambia tus preferencias y conoce las consecuencias de eliminarla.",
  "topic": "Primeros pasos",
  "type": "guide",
  "audiences": [
    "member"
  ],
  "workflows": [
    "S02",
    "A02",
    "S03",
    "A01",
    "A09"
  ],
  "visibility": "public",
  "status": "published",
  "revision": 21,
  "sourceRevision": 20,
  "owner": "@mangue-dev",
  "updatedAt": "2026-11-12",
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
      "app/(auth)/signup/page.tsx",
      "components/auth/auth-entry.tsx",
      "components/auth/auth-chrome.tsx",
      "lib/auth-entry.ts",
      "app/api/auth/lookup/route.ts",
      "components/first-run/first-run-gate.tsx",
      "components/first-run/profile-setup-screen.tsx",
      "components/first-run/onboarding-screen.tsx",
      "lib/first-run.ts",
      "lib/password-policy.ts",
      "app/(auth)/login/page.tsx",
      "app/auth/confirm/page.tsx",
      "components/settings/account-security-section.tsx",
      "app/api/account/mfa/route.ts",
      "app/api/account/mfa/recovery-codes/route.ts",
      "app/api/account/mfa/recover/route.ts",
      "lib/server/mfa.ts",
      "app/(auth)/reset-password/page.tsx",
      "docs/self-hosting-auth.md",
      "content/knowledge/settings-and-data.md",
      "components/settings/account-profile-section.tsx",
      "components/settings/account-preferences-section.tsx",
      "app/api/me/avatar/route.ts",
      "lib/server/avatar-seeds.ts",
      "components/settings/account-analytics-section.tsx",
      "components/settings/account-data-section.tsx",
      "app/api/account/deletion-preview/route.ts",
      "app/api/account/route.ts",
      "lib/server/apple-sign-in.ts",
      "supabase/migrations/20270109200046_list_auth_sessions.sql",
      "supabase/migrations/20270109200047_revoke_auth_session.sql",
      "lib/theme-presets.ts",
      "app/theme-presets.css",
      "components/settings/account-settings-page.tsx",
      "components/settings/account-desktop-section.tsx",
      "components/settings/account-issues-section.tsx",
      "components/settings/account-hidden-projects-section.tsx",
      "lib/settings-sections.ts",
      "components/app-sidebar.tsx",
      "components/mobile-account.tsx",
      "lib/keyboard/shortcuts.ts",
      "desktop/src/local-installer.ts",
      "desktop/src/local-account.ts",
      "lib/week-start.ts",
      "components/settings/account-numo-section.tsx",
      "lib/use-onboarding.ts",
      "lib/onboarding.ts"
    ]
  },
  "review": {
    "revision": 21,
    "fact": "agent:/root/min747 (0.20.0 release review: source audit against the v0.11.0..main delta, verified corrections applied; 4 screenshot(s) recaptured on 2026-10-20 from the local candidate and inspected; no browser walkthrough of the procedures or operator rehearsal; earlier evidence retained in git history); agent:/root (MIN-765 desktop preview channel removal: source review of components/settings/account-desktop-section.tsx and desktop/src/menu.ts; the Desktop app card no longer lists a preview channel; unchanged evidence retained; no browser walkthrough, no new captures); agent:claude-code (it/es catalog language review: quoted labels aligned on the corrected es catalog; no behavior change, no new captures); agent:claude-code (it/es catalog review recapture of account-security-workflow, profile-and-preferences-workflow, profile-and-preferences-preferences-workflow, privacy-and-account-deletion-workflow on 2026-10-22 from a local candidate of this branch against the preview demo account; images inspected; no form submitted); agent:claude-code (manual figures rebuilt on the Aurora demo, catalog review labels and informal register; figures recaptured on 2026-10-22 from a local candidate against the preview demo account and inspected; no form submitted); agent:claude-code (MIN-781 self-hosting from the desktop app: source review of components/desktop/server-choice.tsx, desktop/src/local-installer.ts and desktop/src/local-account.ts; the account-access section now states that a local instance installed by the desktop app has no signup; no installation run, no screenshot recaptured, existing figures carried forward unchanged); agent:claude-code (MIN-881 first day of the week: source review of lib/week-start.ts, components/settings/account-preferences-section.tsx, components/calendar.tsx, lib/routine-schedule.ts, lib/routine-week-order.ts, components/stats/activity-heatmap.tsx and lib/mention-date.ts; new preferences paragraph; localized mention example checked against the parser; no browser walkthrough, no screenshot recaptured, existing figures carried forward unchanged); agent:claude-code (0.30.0 release review, MIN-794: its evidence changes in the v0.20.0..0.30.0 delta were documented by the pull requests that made them; the article was updated by pull requests in that delta; not re-audited line by line; 4 screenshot(s) recaptured on 2026-11-04 from a local candidate against the preview demo account and inspected; no browser walkthrough of the procedures); agent:claude-code (MIN-954 settings split: account settings paths moved from the former AI & Numo tab to the Numo, AI and MCP tabs, checked against components/settings/account-settings-page.tsx, components/settings/account-numo-section.tsx and messages/*.json; no browser walkthrough; existing figures kept, not recaptured); agent:claude-code (MIN-907 single sign-in and sign-up screen, first-run profile page and phone getting-started tour: checked against components/auth/auth-entry.tsx, components/auth/auth-chrome.tsx, lib/auth-entry.ts, app/api/auth/lookup/route.ts, components/first-run/first-run-gate.tsx, components/first-run/profile-setup-screen.tsx, components/first-run/onboarding-screen.tsx, lib/first-run.ts and messages/*.json; no browser walkthrough; existing figures do not show these screens and were kept); agent:claude-code (MIN-907 tour follow-up: skip confirmation, final screen with confetti, Home after the tour and the issue step completed on creation, checked against components/first-run/onboarding-screen.tsx, lib/use-onboarding.ts and messages/*.json; no browser walkthrough; existing figures do not show the tour and were kept); agent:claude-code (MIN-907 four-step tour: the cycles step left the getting-started steps (lib/onboarding.ts ONBOARDING_STEPS, components/sidebar-onboarding.tsx); the phone tour's Back and Skip row, Back from the first step returning to the profile page, and the skip confirmation checked against components/first-run/onboarding-screen.tsx and messages/*.json; no browser walkthrough; existing figures do not show the tour and were kept); agent:claude-code (MIN-964 tour on every platform: the full-screen getting-started steps now also run on a computer, their actions open dialogs, the issue step offers the CSV import to a project owner on a computer, and the sidebar checklist is gone; checked against components/first-run/first-run-gate.tsx, components/first-run/onboarding-screen.tsx, components/app-sidebar.tsx and messages/*.json; no browser walkthrough; existing figures do not show the tour and were kept)",
    "language": "agent:/root/min747 (es translation of the release corrections with catalog UI labels; equivalent meaning self-reviewed; agent review, not human acceptance); agent:/root (es MIN-765 removal edit; retained-meaning self-review; agent review, not human acceptance); agent:claude-code (es label alignment after the full catalog review; self-reviewed; agent review, not human acceptance); agent:claude-code (es manual figures rebuilt on the Aurora demo, catalog review labels and informal register; self-reviewed; agent review, not human acceptance); agent:claude-code (es MIN-781 changed passages on local instances from the desktop app, with catalog UI labels; self-reviewed; agent review, not human acceptance); agent:claude-code (es MIN-881 first-day-of-week paragraph with catalog UI labels; self-reviewed; agent review, not human acceptance); agent:claude-code (es MIN-954 settings paths with catalog UI labels; self-reviewed; agent review, not human acceptance); agent:claude-code (es MIN-907 account-access section rewritten for the single sign-in and sign-up screen and the first-run screens, with catalog UI labels, in the locale's register and glossary; self-reviewed; agent review, not human acceptance); agent:claude-code (es MIN-907 tour follow-up tour passage with catalog UI labels, in the locale's register and glossary; self-reviewed; agent review, not human acceptance); agent:claude-code (es MIN-907 four-step tour passage with Back and Skip, with catalog UI labels, in the locale's register and glossary; self-reviewed; agent review, not human acceptance); agent:claude-code (es MIN-964 changed passages on the tour on every platform, with catalog UI labels, in the locale's register and glossary; self-reviewed; agent review, not human acceptance)",
    "date": "2026-11-12"
  },
  "related": [
    "choose-an-instance",
    "projects",
    "authentication-and-email",
    "applications",
    "automation-settings",
    "transfer-between-instances"
  ],
  "aliases": [
    "account-access",
    "account-security",
    "account-recovery",
    "profile-and-preferences",
    "settings-and-data",
    "privacy-and-account-deletion"
  ],
  "tags": [
    "Crear una cuenta e iniciar sesión",
    "Proteger la cuenta con un segundo factor",
    "Recuperar el acceso a tu cuenta",
    "Cambiar perfil y preferencias",
    "Controlar analítica y eliminar una cuenta"
  ],
  "figures": [
    {
      "id": "account-security-workflow",
      "kind": "screenshot",
      "src": "/documentation/es/account-security-workflow.png",
      "alt": "Tarjeta de autenticación de dos factores con botón de activación.",
      "caption": "Empieza aquí, verifica después el autenticador y guarda los códigos de recuperación de forma privada.",
      "revision": 21,
      "reviewed": true,
      "capturedAt": "2026-11-04",
      "viewport": [
        816,
        227
      ],
      "theme": "light",
      "padding": 24,
      "deviceScaleFactor": 2
    },
    {
      "id": "profile-and-preferences-workflow",
      "kind": "screenshot",
      "src": "/documentation/es/profile-and-preferences-workflow.png",
      "alt": "Cabecera del perfil con el avatar y su distintivo de edición, el nombre y el correo de solo lectura.",
      "caption": "Selecciona el avatar para generar o subir uno, o el nombre para cambiarlo; el correo sigue siendo de solo lectura.",
      "revision": 21,
      "reviewed": true,
      "capturedAt": "2026-11-04",
      "viewport": [
        816,
        256
      ],
      "theme": "light",
      "padding": 24,
      "deviceScaleFactor": 2
    },
    {
      "id": "profile-and-preferences-preferences-workflow",
      "kind": "screenshot",
      "src": "/documentation/es/profile-and-preferences-preferences-workflow.png",
      "alt": "Selector de idioma, controles de tema claro, oscuro y del sistema, selectores de paleta de los modos claro y oscuro e interruptor de transparencia.",
      "caption": "El idioma de la cuenta se configura por separado del idioma del sitio público.",
      "revision": 21,
      "reviewed": true,
      "capturedAt": "2026-11-04",
      "viewport": [
        816,
        491
      ],
      "theme": "light",
      "padding": 24,
      "deviceScaleFactor": 2
    },
    {
      "id": "privacy-and-account-deletion-workflow",
      "kind": "screenshot",
      "src": "/documentation/es/privacy-and-account-deletion-workflow.png",
      "alt": "Vista previa de eliminación con proyectos propios, tickets y miembros que perderán acceso.",
      "caption": "Lee la vista previa y exporta los datos que quieras conservar antes de abrir la confirmación.",
      "revision": 21,
      "reviewed": true,
      "capturedAt": "2026-11-04",
      "viewport": [
        816,
        251
      ],
      "theme": "light",
      "padding": 24,
      "deviceScaleFactor": 2
    }
  ],
  "requiredFigures": [
    "account-security-workflow",
    "profile-and-preferences-workflow",
    "profile-and-preferences-preferences-workflow",
    "privacy-and-account-deletion-workflow"
  ]
}
---

Cada cuenta pertenece a la instancia en la que te registraste. Aquí puedes gestionar el acceso, la autenticación de dos factores, la recuperación y tus preferencias. Antes de eliminarla, revisa la exportación de datos y las consecuencias para tus proyectos.

## Crear una cuenta e iniciar sesión {#account-access}

Abre la pantalla de inicio de sesión de la instancia que quieres utilizar. **Inicia sesión o regístrate** es una sola pantalla para ambas cosas, en `/login` y en `/signup`. Cloud y otra instancia autoalojada tienen cuentas separadas. Los servicios de acceso disponibles y la posibilidad de registrarse dependen de la configuración de autenticación de la instancia. Una instancia local instalada por la aplicación de escritorio no tiene registro: la aplicación crea tu cuenta e inicia tu sesión. Consulta [Instancias locales](/es/documentacion/install-locally#install-locally).

La pantalla empieza por tu dirección de email y **Continuar**. Debajo de **o**, enumera los servicios de acceso que ofrece la instancia, en este orden: Apple, Google y GitHub. En la aplicación de escritorio, les sigue **Autoalojar minddy**. Después de **Continuar**, minddy comprueba qué corresponde a la dirección y muestra uno de estos pasos. **Cambiar**, junto a la dirección, vuelve a ella.

- **Escribe tu contraseña**: la dirección tiene una cuenta con contraseña. Escríbela y elige **Iniciar sesión**. **¿Has olvidado tu contraseña?** inicia la [recuperación de la contraseña](#account-recovery).
- **Elige una contraseña**: la dirección aún no tiene cuenta. Introduce al menos ocho caracteres con una minúscula (a–z), una mayúscula (A–Z) y un dígito; los requisitos se comprueban mientras escribes. Elige **Crear mi cuenta**. Este paso no pide nombre, imagen ni confirmación de la contraseña.
- **Esta cuenta no tiene contraseña**: la cuenta se creó con un servicio de acceso. Continúa con el mismo servicio o elige **Crear contraseña**, que abre la recuperación de la contraseña para esa dirección.
- **Los registros están cerrados aquí**: la instancia de vista previa de minddy no crea cuentas. Su botón lleva al registro en minddy.app.

Si es necesario confirmar el email, **Comprueba tu bandeja de entrada** aparece tras crear la cuenta. Abre el mensaje enviado por esa instancia. Sigue su enlace y pulsa el botón de confirmación en la página. Abrir el enlace no basta: no confirma la cuenta ni consume el token de email. Después, vuelve a la aplicación que quieres utilizar e inicia sesión. Demasiadas comprobaciones de direcciones en poco tiempo se rechazan durante un rato: espera antes de volver a intentarlo.

Tras el primer inicio de sesión, una cuenta nueva se abre en **¿Cómo deberíamos llamarte?** antes de la aplicación. Elige **Subir imagen** o **Nuevo avatar de Lorelei** para tu imagen y escribe tu nombre de usuario; el nombre que haya dado un servicio de acceso ya aparece escrito. Elige **Continuar**. Esta página aparece una sola vez, en todas las plataformas; las cuentas creadas antes de que existiera no la ven nunca. Puedes cambiar ambos más tarde en tu [perfil](#profile-and-preferences).

Una cuenta nueva recorre después los primeros pasos, en el móvil como en el ordenador, uno por página, con puntos de progreso: **Crear o unirse a un proyecto**, **Añade tu primera incidencia**, **Descubrir Numo** y **Conectar un agente de programación**. El botón de cada paso abre sobre la página el mismo diálogo que en la aplicación: creación de proyecto o de incidencia, Numo o la conexión del agente. En el ordenador, el paso de la incidencia también ofrece **Importar incidencias** al propietario de un proyecto. El paso de la incidencia se completa en cuanto creas la incidencia, aunque Smart Fill todavía la esté rellenando. Bajo los botones del paso, **Volver** muestra de nuevo el paso anterior; desde el primer paso, vuelve a **¿Cómo deberíamos llamarte?**, donde **Continuar** te devuelve a los pasos. **Omitir** pasa al paso siguiente. **Omitir la introducción** pide antes una confirmación, porque los pasos omitidos no vuelven: confirma con **Omitir la introducción**. Tras el último paso aparece **Todo listo.** con una breve animación de confeti, y **Continuar** lleva a Inicio. Omitir el recorrido también lleva a Inicio.

Una cuenta recién autenticada puede crear su propio proyecto o aceptar una invitación. Conocer la URL de un proyecto no concede la condición de miembro.


### Cerrar sesión y comprobar el correo que falta {#session-and-mail}

Abre el menú de la cuenta, elige cerrar sesión y confirma. En la aplicación de escritorio, cerrar una pestaña o ventana no equivale a cerrar sesión. Utiliza el menú de la cuenta si quieres terminar la sesión.

Una sesión permanece iniciada mientras uses minddy, hasta un año, y termina tras 30 días sin uso. Cuando termina, o se cierra desde otro dispositivo, minddy vuelve a la pantalla de inicio de sesión con un mensaje que indica que tu sesión ha caducado. Vuelve a iniciar sesión para continuar donde estabas.

El grupo **Sesiones** de la pestaña **Seguridad** de los ajustes de la cuenta muestra los navegadores y apps de escritorio conectados a tu cuenta, marca el dispositivo que usas e indica cuándo estuvo activo por última vez cada uno de los demás. Para cerrar todas las demás sesiones, por ejemplo en un portátil perdido o un ordenador compartido, elige **Cerrar todas las sesiones** en la fila **Cerrar sesión en otros dispositivos** y confirma: todos los demás navegadores y apps de escritorio conectados a tu cuenta vuelven a la pantalla de inicio de sesión. Para cerrar una sola sesión, elige **Cerrar sesión** en su fila y confirma; solo ese dispositivo vuelve a la pantalla de inicio de sesión. En ambos casos, el dispositivo que usas sigue conectado. Las aplicaciones que autorizaste en **MCP** → **Aplicaciones conectadas** conservan su acceso hasta que lo revoques allí.

Si el correo no llega, comprueba la dirección, la carpeta de spam y la identidad de la instancia. El operador de una instancia autoalojada debe haber configurado un envío de correo de Auth que funcione; el correo opcional de notificaciones de la aplicación y la confirmación de Auth son funciones distintas. Una página de confirmación caducada permite volver al inicio de sesión para solicitar un enlace nuevo. No reenvíes enlaces de confirmación o recuperación como prueba para diagnosticar un problema: autorizan el acceso a la cuenta.


## Proteger la cuenta con un segundo factor {#account-security}

Abre la sección Seguridad en los ajustes de la cuenta y activa la autenticación de dos factores. El segundo factor también se aplica al iniciar sesión mediante Google, GitHub o Apple; la autenticación del proveedor no lo sustituye.

1. Escanea el código QR con un autenticador TOTP o introduce manualmente la clave de configuración mostrada. Nunca incluyas ni el código QR ni la clave en una captura.
2. Introduce el código actual de seis dígitos y confirma. Si ha caducado, prueba el siguiente. Después de demasiados intentos, espera antes de volver a intentarlo.
3. Guarda los códigos de recuperación en un lugar protegido al que puedas acceder sin el teléfono. Cada código funciona una sola vez y la lista solo se muestra una vez. Confirma que los has guardado antes de terminar.

La activación actualiza la sesión actual e intenta cerrar las demás sesiones. Si se solicita una nueva autenticación después de aceptar el código, vuelve a iniciar sesión y sigue las indicaciones mostradas.

![Tarjeta de autenticación de dos factores con botón de activación.](/documentation/es/account-security-workflow.png)

### Recuperación y cambios {#recovery}

Si no tienes el teléfono, utiliza al iniciar sesión uno de los códigos de recuperación que guardaste. Usarlo desactiva la autenticación de dos factores e invalida los códigos restantes. Una vez dentro, configura de nuevo el autenticador y guarda los nuevos códigos de recuperación. Este proceso no garantiza que el soporte humano pueda restaurar la cuenta.

Sustituir los códigos de recuperación invalida la lista anterior. Tanto la sustitución como la desactivación voluntaria requieren las comprobaciones de autenticación reciente del servidor. Lee la confirmación: al desactivar la función, el factor adicional deja de solicitarse, incluso al entrar por Google, GitHub o Apple.


## Recuperar el acceso a tu cuenta {#account-recovery}

En la pantalla de acceso de la instancia correcta, utiliza la recuperación de contraseña e introduce el correo asociado a tu cuenta. Abre el mensaje de restablecimiento, sigue el enlace y confirma la acción. Introduce la nueva contraseña en la pantalla de restablecimiento y envíala. Comprueba después que puedas iniciar sesión en la misma instancia.

Un enlace puede caducar o dejar de tener una sesión activa. La pantalla de restablecimiento identifica esa situación y permite solicitar otro enlace. Empieza desde un mensaje nuevo en lugar de volver a intentar un marcador antiguo. No envíes el enlace, las cookies ni la contraseña al servicio de asistencia.


### MFA y acceso sin resolver {#mfa-recovery}

Si la autenticación de dos factores está activada, restablecer la contraseña no elimina ese requisito. Utiliza tu aplicación de autenticación. También puedes usar un código de recuperación guardado al activar MFA; su uso desactiva MFA. Trata los códigos como secretos y vuelve a configurar MFA en los ajustes de seguridad cuando recuperes el acceso.

Si no dispones ni del segundo factor ni de un código de recuperación, contacta con el operador de la instancia por su canal de asistencia. Incluye la dirección de la instancia y el fallo que ves, sin tokens de autenticación ni contenido privado del proyecto. Si falta el correo de recuperación, pide al operador que verifique las URL de redirección de Auth y el envío SMTP. No crees una segunda cuenta suponiendo que heredará los proyectos o conexiones de la original.

## Cambiar perfil y preferencias {#profile-and-preferences}

Elige **Ajustes de la cuenta** en el menú de la cuenta, en el menú móvil o en la paleta de comandos, o pulsa Command+coma en macOS (Ctrl+coma en Windows/Linux): los ajustes de la cuenta se abren en la pestaña **Preferencias**. Para abrir directamente la pestaña **Perfil**, elige tu nombre en la parte superior del menú de la cuenta; también puedes seleccionar **Perfil** entre las pestañas de los ajustes. Muestra tu avatar, tu nombre y tu correo, seguidos de tus [estadísticas personales](/docs/personal-statistics). Selecciona tu avatar y elige **Nuevo avatar de Lorelei** o **Subir imagen**; el cambio se aplica en cuanto se completa. Selecciona tu nombre para cambiarlo: en un ordenador se convierte en un campo que Intro o salir del campo guardan y Escape cancela; en un teléfono abre un panel con **Nombre de usuario** y **Guardar**. El nombre no puede quedar vacío. El correo es de solo lectura. Espera el resultado y comprueba el avatar en un comentario o en la lista de miembros; es el mismo en todos los proyectos y conversaciones. Si se rechaza un archivo, sigue el mensaje de validación en vez de subirlo repetidamente.

La imagen fuente no debe superar 10 MiB. El servidor comprueba que la imagen pueda leerse, aplica su orientación y la recorta por el centro para crear un avatar WebP de 256 × 256 píxeles.

![Cabecera del perfil con el avatar y su distintivo de edición, el nombre y el correo de solo lectura.](/documentation/es/profile-and-preferences-workflow.png)

### Elegir el comportamiento {#preferences}

Selecciona idioma y tema en preferencias y comprueba otra página. El idioma de cuenta gobierna el producto autenticado; el sitio público tiene su propio selector. El tema se guarda en la cuenta entre dispositivos.

El tema elige el modo claro, oscuro o del sistema. **Paleta del modo claro** y **Paleta del modo oscuro** fijan cada una los colores de un modo. Los **colores de acento** conservan los colores de minddy y solo cambian el color de los botones y del anillo de foco: minddy (lavanda), Negro en modo claro o Blanco en modo oscuro, Azul, Verde, Naranja y Rosa; las **paletas completas** (Solarized, Catppuccin, Nord) cambian todas las superficies; **Alto contraste** está en Accesibilidad. La paleta del modo en pantalla se aplica al instante; la otra se guarda y aparece cuando su modo vuelve a estar activo, también cuando Sistema sigue un cambio del sistema operativo. Alto contraste refuerza el contraste del texto y los bordes, contornea campos, menús, diálogos y pestañas, marca la página actual y el elemento seleccionado, muestra siempre el foco del teclado y mantiene opacos los menús. Desactiva **Transparencia** para que los menús, las ventanas emergentes y la paleta de comandos sean opacos y sin desenfoque. Las paletas y la transparencia se guardan en la cuenta; otro dispositivo las aplica la próxima vez que carga una página. En la aplicación de escritorio en macOS y Windows 11, **Transparencia de la aplicación de escritorio** deja ver tu escritorio, difuminado, detrás de la barra lateral, las pestañas y los bordes de la ventana, mientras el contenido sigue opaco. Solo se aplica a este dispositivo y surte efecto al instante. La ventana sigue opaca con una paleta de alto contraste o cuando el ajuste «Reducir transparencia» o el alto contraste del sistema está activo; el interruptor queda entonces desactivado. Windows 10 y Linux mantienen una ventana opaca y no muestran el interruptor.

**Primer día de la semana** fija el día en que empiezan tus semanas. El calendario del selector de fecha, los días de una rutina y su orden en Rutinas, las filas de la cuadrícula de actividad de tus estadísticas y una mención de fecha como `@jueves en 2 semanas` lo siguen. **Según el idioma** mantiene la costumbre del idioma de la interfaz: domingo en inglés y portugués de Brasil, lunes en los demás idiomas. Elige lunes, domingo o sábado para fijarlo tú. La elección se guarda en la cuenta. Los [ciclos personales](/docs/personal-cycle) conservan su propio día de inicio.

Elige el atajo de envío en los ajustes de teclado. Se aplica a comentarios, a Numo y a Intro en el título de un formulario de creación; una descripción mantiene Command/Ctrl+Intro, y Mayús+Intro en un título siempre pasa a la descripción. Usa el botón de enviar si la plataforma intercepta el atajo; las teclas modificadoras varían según el sistema. Los proyectos que ocultaste aparecen en su propia pestaña **Proyectos ocultos**, donde puedes volver a mostrarlos. **Preferencias** también contiene la tarjeta **Aplicación de escritorio**: en la web enlaza a la descarga de la aplicación de escritorio y, en la aplicación de escritorio, muestra el servidor conectado y la versión de la aplicación. Las preferencias de incidencias también pertenecen a la cuenta y no cambian los ajustes de otros miembros: la asignación automática está en la pestaña **Incidencias** y el estado de las incidencias que crea Numo, en **Numo** → **Estado de las incidencias que crea Numo**.

![Selector de idioma, controles de tema claro, oscuro y del sistema, selectores de paleta de los modos claro y oscuro e interruptor de transparencia.](/documentation/es/profile-and-preferences-preferences-workflow.png)

## Controlar analítica y eliminar una cuenta {#privacy-and-account-deletion}

Cuando hay un servicio de analítica configurado, la pestaña **Privacidad y datos** de los ajustes de la cuenta muestra su interruptor de consentimiento y un enlace a la política de cookies. Desactivarlo cambia inmediatamente el consentimiento de medición en este dispositivo y guarda la elección en la cuenta. En otro dispositivo puede seguir aplicándose una elección local ya existente. Si no se ha configurado ningún servicio de analítica, esta sección no aparece.

El consentimiento para analítica se distingue de los datos necesarios para utilizar la cuenta. Consulta la política de privacidad de la instancia y los proveedores externos que hayas activado. En una instalación self-hosted, la configuración y las políticas del operador determinan los destinos de los servicios; desactivar la analítica no elimina las integraciones de IA ni de Git.


![Vista previa de eliminación con proyectos propios, tickets y miembros que perderán acceso.](/documentation/es/privacy-and-account-deletion-workflow.png)

### Revisar la eliminación antes de confirmar {#deletion}

Antes de eliminar la cuenta, exporta los datos que necesites conservar desde la pestaña **Privacidad y datos**. Lee la vista previa de tus proyectos, los miembros afectados, los tickets, los comentarios y la suscripción activa. Resuelve antes de confirmar las consecuencias para otras personas que participan en tus proyectos.

Abre la confirmación de eliminación solo cuando estés preparado. Escribe el correo de tu cuenta y, si tienes una cuenta con contraseña, introduce también esa contraseña. Las cuentas sin contraseña necesitan un inicio de sesión reciente. Si se exige volver a autenticarte, sigue esa indicación antes de repetir la solicitud. Una eliminación completada cierra la sesión y vuelve al sitio público. Si la cuenta inicia sesión con Apple, la eliminación también pide a Apple que retire el acceso de minddy a tu cuenta de Apple. Esta acción no envía la cuenta a una papelera recuperable. Mantén las exportaciones privadas y resuelve cualquier cuestión pendiente de suscripción o proveedores desde los controles de facturación y de servicio.


## Configurar rutinas {#routines}

El trabajo automático del proyecto se configura en [Rutinas](/docs/scheduled-routines), donde el propietario elige horario, evento o llegada a una base. Los preajustes de automatización de la cuenta y sus interruptores de proyecto se retiran. Lee la [guía de transición](/docs/automation-settings) antes de activar una propuesta archivada.

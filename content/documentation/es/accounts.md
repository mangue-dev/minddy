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
  "revision": 6,
  "sourceRevision": 6,
  "owner": "@mangue-dev",
  "updatedAt": "2026-10-09",
  "compatibility": {
    "version": "0.11.1 candidate (89ebb59a5); 0.11.1 candidate (cd1843e12)",
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
      "components/auth/signup-wizard.tsx",
      "lib/signup-wizard.ts",
      "lib/password-policy.ts",
      "app/(auth)/login/page.tsx",
      "app/auth/confirm/page.tsx",
      "components/settings/account-security-section.tsx",
      "app/api/account/mfa/route.ts",
      "app/api/account/mfa/recovery-codes/route.ts",
      "app/api/account/mfa/recover/route.ts",
      "lib/server/mfa.ts",
      "content/documentation/reviews/mfa-enrollment-capture-candidates.json",
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
      "app/api/account/route.ts"
    ]
  },
  "review": {
    "revision": 6,
    "fact": "agent:/root/german_spanish_review (structural consolidation review; prior procedural evidence retained; no operational rerun)",
    "language": "agent:/root/german_spanish_review (es title, summary, lead and heading review; retained body comparison)",
    "date": "2026-10-09"
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
      "id": "account-access-steps",
      "kind": "screenshot",
      "src": "/documentation/es/auth-signup.png",
      "alt": "Registro por correo electrónico, con los botones de proveedores y el primer paso del asistente de tres pasos.",
      "caption": "Empieza en la instancia correcta. Después del correo vienen la identidad y la contraseña; en esta captura no se envió ningún registro.",
      "revision": 6,
      "reviewed": true,
      "capturedAt": "2026-10-08",
      "viewport": [
        380,
        474
      ],
      "theme": "light"
    },
    {
      "id": "account-access-login",
      "kind": "screenshot",
      "src": "/documentation/es/auth-login.png",
      "alt": "Formulario de inicio de sesión con el enlace de recuperación debajo del campo de contraseña.",
      "caption": "Inicia la recuperación en la instancia de tu cuenta. El formulario se muestra sin haber enviado credenciales.",
      "revision": 6,
      "reviewed": true,
      "capturedAt": "2026-10-08",
      "viewport": [
        380,
        540
      ],
      "theme": "light"
    },
    {
      "id": "account-security-workflow",
      "kind": "screenshot",
      "src": "/documentation/es/account-security-workflow.png",
      "alt": "Tarjeta de autenticación de dos factores con botón de activación.",
      "caption": "Empieza aquí, verifica después el autenticador y guarda los códigos de recuperación de forma privada.",
      "revision": 6,
      "reviewed": true,
      "capturedAt": "2026-10-08",
      "viewport": [
        1440,
        1800
      ],
      "theme": "light"
    },
    {
      "id": "account-security-enrollment-workflow",
      "kind": "screenshot",
      "src": "/documentation/es/account-security-enrollment-workflow.png",
      "alt": "Configuración del autenticador antes de verificar el código.",
      "caption": "Configuración del autenticador antes de verificar el código. El QR real y el secreto manual están ocultos; este factor temporal sin verificar se canceló y eliminó.",
      "revision": 6,
      "reviewed": true,
      "capturedAt": "2026-10-08",
      "viewport": [
        1440,
        1200
      ],
      "theme": "light"
    },
    {
      "id": "account-recovery-steps",
      "kind": "screenshot",
      "src": "/documentation/es/auth-recovery.png",
      "alt": "Formulario de recuperación de contraseña con una dirección de ejemplo y el botón para enviar el enlace.",
      "caption": "Introduce aquí el correo de tu cuenta. La dirección de ejemplo no se envió; esta imagen no acredita la entrega del mensaje ni una recuperación completada.",
      "revision": 6,
      "reviewed": true,
      "capturedAt": "2026-10-08",
      "viewport": [
        380,
        278
      ],
      "theme": "light"
    },
    {
      "id": "profile-and-preferences-workflow",
      "kind": "screenshot",
      "src": "/documentation/es/profile-and-preferences-workflow.png",
      "alt": "Controles del perfil para avatar, nombre de usuario y correo de solo lectura.",
      "caption": "Guarda los cambios del perfil tras validarlos; el correo sigue siendo de solo lectura.",
      "revision": 6,
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
      "src": "/documentation/es/profile-and-preferences-preferences-workflow.png",
      "alt": "Selector de idioma y controles de tema claro, oscuro y del sistema.",
      "caption": "El idioma de la cuenta se configura por separado del idioma del sitio público.",
      "revision": 6,
      "reviewed": true,
      "capturedAt": "2026-10-08",
      "viewport": [
        1440,
        1800
      ],
      "theme": "light"
    },
    {
      "id": "privacy-and-account-deletion-workflow",
      "kind": "screenshot",
      "src": "/documentation/es/privacy-and-account-deletion-workflow.png",
      "alt": "Vista previa de eliminación con proyectos propios, tickets y miembros que perderán acceso.",
      "caption": "Lee la vista previa y exporta los datos que quieras conservar antes de abrir la confirmación.",
      "revision": 6,
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
    "account-access-steps",
    "account-security-workflow",
    "account-security-enrollment-workflow",
    "account-recovery-steps",
    "profile-and-preferences-workflow",
    "profile-and-preferences-preferences-workflow",
    "privacy-and-account-deletion-workflow"
  ]
}
---

Cada cuenta pertenece a la instancia en la que se creó. Esta guía reúne el acceso, el segundo factor, la recuperación, el perfil y las preferencias, además de las consecuencias de eliminar la cuenta.

## Crear una cuenta e iniciar sesión {#account-access}

Abre la pantalla de inicio de sesión o registro en la instancia que quieres utilizar. Cloud y otra instancia autoalojada tienen cuentas separadas. Los métodos de acceso disponibles y la posibilidad de registrarse dependen de la configuración de autenticación de la instancia.

Para registrarte por email, introduce tu dirección y continúa al paso de identidad. Escribe tu nombre completo; no puede estar vacío ni contener solo espacios. También puedes elegir un avatar. Continúa al paso de contraseña, introduce una de al menos ocho caracteres con una minúscula (a–z), una mayúscula (A–Z) y un dígito, y repítela en el campo de confirmación. Envía este último paso para crear la cuenta. Abandonar los pasos anteriores no crea ninguna cuenta. Si es necesario confirmar el email, abre el mensaje enviado por esa instancia. Sigue su enlace y pulsa el botón de confirmación en la página que se abre. Abrir el enlace no basta: minddy exige esa acción deliberada antes de consumir el token de email.

Vuelve a la aplicación que quieres utilizar e inicia sesión. Una cuenta recién autenticada puede crear su propio proyecto o aceptar una invitación. Conocer la URL de un proyecto no concede la condición de miembro.


![Registro por correo electrónico, con los botones de proveedores y el primer paso del asistente de tres pasos.](/documentation/es/auth-signup.png)

### Cerrar sesión y comprobar el correo que falta {#session-and-mail}

Abre el menú de la cuenta, elige cerrar sesión y confirma. En la aplicación de escritorio, cerrar una pestaña o ventana no equivale a cerrar sesión. Utiliza el menú de la cuenta si quieres terminar la sesión.

Si el correo no llega, comprueba la dirección, la carpeta de spam y la identidad de la instancia. El operador de una instancia autoalojada debe haber configurado un envío de correo de Auth que funcione; el correo opcional de notificaciones de la aplicación y la confirmación de Auth son funciones distintas. Una página de confirmación caducada permite volver al inicio de sesión para solicitar un enlace nuevo. No reenvíes enlaces de confirmación o recuperación como prueba para diagnosticar un problema: autorizan el acceso a la cuenta.

![Formulario de inicio de sesión con el enlace de recuperación debajo del campo de contraseña.](/documentation/es/auth-login.png)

## Proteger la cuenta con un segundo factor {#account-security}

Abra la sección Seguridad en la configuración de la cuenta y active la autenticación de dos factores. El segundo factor también se aplica al iniciar sesión mediante Google o GitHub; la autenticación del proveedor no lo sustituye.

1. Escanee el código QR con un autenticador TOTP o introduzca manualmente la clave de configuración mostrada. Nunca incluya ni el código QR ni la clave en una captura.
2. Introduzca el código actual de seis dígitos y confirme. Si ha caducado, pruebe el siguiente; después de demasiados intentos, espere antes de volver a intentarlo.
3. Guarde los códigos de recuperación en un lugar protegido al que pueda acceder sin el teléfono. Cada código funciona una sola vez y la lista solo se muestra una vez. Confirme que los ha guardado antes de terminar.

La activación actualiza la sesión actual e intenta cerrar las demás sesiones. Si se solicita una nueva autenticación después de aceptar el código, vuelva a iniciar sesión y siga las indicaciones mostradas.

![Tarjeta de autenticación de dos factores con botón de activación.](/documentation/es/account-security-workflow.png)

### Recuperación y cambios {#recovery}

Durante el inicio de sesión, si no tiene el teléfono, use uno de los códigos de recuperación que guardó. Usarlo desactiva la autenticación de dos factores e invalida los códigos restantes. Una vez dentro, configure de nuevo el autenticador y guarde los nuevos códigos de recuperación. Este proceso no garantiza que el soporte humano pueda restaurar la cuenta.

Sustituir los códigos de recuperación invalida la lista anterior. Tanto la sustitución como la desactivación voluntaria requieren las comprobaciones de autenticación reciente del servidor. Lea la confirmación: al desactivar la función, el factor adicional deja de solicitarse, incluso al entrar por Google o GitHub.

![Configuración del autenticador antes de verificar el código.](/documentation/es/account-security-enrollment-workflow.png)

## Recuperar el acceso a tu cuenta {#account-recovery}

En la pantalla de acceso de la instancia correcta, utiliza la recuperación de contraseña e introduce el correo asociado a tu cuenta. Abre el mensaje de restablecimiento, sigue el enlace y confirma la acción. Introduce la nueva contraseña en la pantalla de restablecimiento y envíala. Comprueba después que puedas iniciar sesión en la misma instancia.

Un enlace puede caducar o dejar de tener una sesión activa. La pantalla de restablecimiento identifica esa situación y permite solicitar otro enlace. Empieza desde un mensaje nuevo en lugar de volver a intentar un marcador antiguo. No envíes el enlace, las cookies ni la contraseña al servicio de asistencia.


![Formulario de recuperación de contraseña con una dirección de ejemplo y el botón para enviar el enlace.](/documentation/es/auth-recovery.png)

### MFA y acceso sin resolver {#mfa-recovery}

Si la autenticación de dos factores está activada, restablecer la contraseña no elimina ese requisito. Utiliza tu aplicación de autenticación. También puedes usar un código de recuperación guardado al activar MFA; su uso desactiva MFA. Trata los códigos como secretos y vuelve a configurar MFA en los ajustes de seguridad cuando recuperes el acceso.

Si no dispones ni del segundo factor ni de un código de recuperación, contacta con el operador de la instancia por su canal de asistencia. Incluye la dirección de la instancia y el fallo que ves, sin tokens de autenticación ni contenido privado del proyecto. Si falta el correo de recuperación, pide al operador que verifique las URL de redirección de Auth y el envío SMTP. No crees una segunda cuenta suponiendo que heredará los proyectos o conexiones de la original.

## Cambiar perfil y preferencias {#profile-and-preferences}

Abra los ajustes desde el menú de cuenta. En el perfil, escriba un nombre no vacío y guárdelo. El correo es de solo lectura. Genere otro avatar o suba una imagen con los controles correspondientes. Espere el resultado y compruebe el avatar en comentarios o miembros; es el mismo en proyectos y conversaciones. Si se rechaza un archivo, siga el mensaje de validación en vez de subirlo repetidamente.

La imagen fuente no debe superar 10 MiB. El servidor verifica bytes de imagen legibles, aplica orientación y recorta al centro como avatar WebP de 256 × 256.

![Controles del perfil para avatar, nombre de usuario y correo de solo lectura.](/documentation/es/profile-and-preferences-workflow.png)

### Elegir el comportamiento {#preferences}

Seleccione idioma y tema en preferencias y compruebe otra página. El idioma de cuenta gobierna el producto autenticado; el sitio público tiene su propio selector. El tema se guarda en la cuenta entre dispositivos.

Elija el atajo de envío en teclado. Se aplica a comentarios y Numo. Use el botón de enviar si la plataforma intercepta el atajo; las teclas modificadoras varían según el sistema. Preferencias como asignación automática y estado de incidencias creadas por Numo también pertenecen a la cuenta y no cambian los ajustes de otros miembros.

![Selector de idioma y controles de tema claro, oscuro y del sistema.](/documentation/es/profile-and-preferences-preferences-workflow.png)

## Controlar analítica y eliminar una cuenta {#privacy-and-account-deletion}

Cuando hay un servicio de analítica configurado, los ajustes de la cuenta muestran su interruptor de consentimiento y un enlace a la política de cookies. Desactivarlo cambia inmediatamente el consentimiento de medición en este dispositivo y guarda la elección en la cuenta. En otro dispositivo puede seguir aplicándose una elección local ya existente. Si no se ha configurado ningún servicio de analítica, esta sección no aparece.

El consentimiento para analítica se distingue de los datos necesarios para utilizar la cuenta. Consulte la política de privacidad de la instancia y los proveedores externos que haya activado. En una instalación self-hosted, la configuración y las políticas del operador determinan los destinos de los servicios; desactivar la analítica no elimina las integraciones de IA ni de Git.


![Vista previa de eliminación con proyectos propios, tickets y miembros que perderán acceso.](/documentation/es/privacy-and-account-deletion-workflow.png)

### Revisar la eliminación antes de confirmar {#deletion}

Antes de eliminar la cuenta, exporte los datos que necesite conservar desde su sección de datos. Lea la vista previa de los proyectos de los que es propietario, los miembros afectados, los tickets, los comentarios y la suscripción activa. Las consecuencias para esos proyectos afectan a otras personas; resuélvalas antes de confirmar.

Abra la confirmación de eliminación solo cuando esté preparado. Escriba el correo de su cuenta y, si tiene una cuenta con contraseña, introduzca también esa contraseña. Las cuentas sin contraseña necesitan un inicio de sesión reciente. Si se exige volver a autenticarse, siga esa indicación en lugar de repetir la solicitud a ciegas. Una eliminación completada cierra la sesión y vuelve al sitio público. Esta acción no envía la cuenta a una papelera recuperable. Mantenga las exportaciones privadas y resuelva cualquier cuestión pendiente de suscripción o proveedores desde sus controles de facturación y de servicio.

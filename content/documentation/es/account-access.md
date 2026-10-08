---
{
  "id": "account-access",
  "locale": "es",
  "title": "Crear una cuenta e iniciar sesión",
  "summary": "Usa la instancia correcta, confirma el correo electrónico y cierra la sesión de forma deliberada.",
  "topic": "Primeros pasos",
  "type": "guide",
  "audiences": [
    "member"
  ],
  "workflows": [
    "S02"
  ],
  "visibility": "public",
  "status": "published",
  "revision": 5,
  "sourceRevision": 1,
  "owner": "@mangue-dev",
  "updatedAt": "2026-10-08",
  "compatibility": {
    "version": "0.11.1 candidate (89ebb59a5)",
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
      "app/auth/confirm/page.tsx"
    ]
  },
  "review": {
    "revision": 5,
    "fact": "2026-10-08",
    "language": "2026-10-08",
    "date": "2026-10-08"
  },
  "related": [
    "choose-an-instance",
    "account-recovery",
    "project-members"
  ],
  "aliases": [],
  "tags": [],
  "figures": [
    {
      "id": "account-access-steps",
      "kind": "screenshot",
      "src": "/documentation/es/auth-signup.png",
      "alt": "Registro por correo electrónico, con los botones de proveedores y el primer paso del asistente de tres pasos.",
      "caption": "Empieza en la instancia correcta. Después del correo vienen la identidad y la contraseña; en esta captura no se envió ningún registro.",
      "revision": 5,
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
      "revision": 5,
      "reviewed": true,
      "capturedAt": "2026-10-08",
      "viewport": [
        380,
        540
      ],
      "theme": "light"
    }
  ],
  "requiredFigures": [
    "account-access-steps"
  ]
}
---

## Registrarte y confirmar tu cuenta {#account-access}

Abre la pantalla de inicio de sesión o registro en la instancia que quieres utilizar. Cloud y otra instancia autoalojada tienen cuentas separadas. Los métodos de acceso disponibles y la posibilidad de registrarse dependen de la configuración de autenticación de la instancia.

Para registrarte por email, introduce tu dirección y continúa al paso de identidad. Escribe tu nombre completo; no puede estar vacío ni contener solo espacios. También puedes elegir un avatar. Continúa al paso de contraseña, introduce una de al menos ocho caracteres con una minúscula (a–z), una mayúscula (A–Z) y un dígito, y repítela en el campo de confirmación. Envía este último paso para crear la cuenta. Abandonar los pasos anteriores no crea ninguna cuenta. Si es necesario confirmar el email, abre el mensaje enviado por esa instancia. Sigue su enlace y pulsa el botón de confirmación en la página que se abre. Abrir el enlace no basta: Minddy exige esa acción deliberada antes de consumir el token de email.

Vuelve a la aplicación que quieres utilizar e inicia sesión. Una cuenta recién autenticada puede crear su propio proyecto o aceptar una invitación. Conocer la URL de un proyecto no concede la condición de miembro.


![Registro por correo electrónico, con los botones de proveedores y el primer paso del asistente de tres pasos.](/documentation/es/auth-signup.png)

## Cerrar sesión y comprobar el correo que falta {#session-and-mail}

Abre el menú de la cuenta, elige cerrar sesión y confirma. En la aplicación de escritorio, cerrar una pestaña o ventana no equivale a cerrar sesión. Utiliza el menú de la cuenta si quieres terminar la sesión.

Si el correo no llega, comprueba la dirección, la carpeta de spam y la identidad de la instancia. El operador de una instancia autoalojada debe haber configurado un envío de correo de Auth que funcione; el correo opcional de notificaciones de la aplicación y la confirmación de Auth son funciones distintas. Una página de confirmación caducada permite volver al inicio de sesión para solicitar un enlace nuevo. No reenvíes enlaces de confirmación o recuperación como prueba para diagnosticar un problema: autorizan el acceso a la cuenta.

![Formulario de inicio de sesión con el enlace de recuperación debajo del campo de contraseña.](/documentation/es/auth-login.png)

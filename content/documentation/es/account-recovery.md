---
{
  "id": "account-recovery",
  "locale": "es",
  "title": "Recuperar el acceso a tu cuenta",
  "summary": "Restablece la contraseña con seguridad e identifica cuándo sigue haciendo falta MFA o ayuda de la instancia.",
  "topic": "Primeros pasos",
  "type": "troubleshooting",
  "audiences": [
    "member"
  ],
  "workflows": [
    "S03"
  ],
  "visibility": "public",
  "status": "published",
  "revision": 4,
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
      "app/(auth)/reset-password/page.tsx",
      "components/settings/account-security-section.tsx",
      "docs/self-hosting-auth.md"
    ]
  },
  "review": {
    "revision": 4,
    "fact": "2026-10-08",
    "language": "2026-10-08",
    "date": "2026-10-08"
  },
  "related": [
    "account-access",
    "account-security",
    "authentication-and-email"
  ],
  "aliases": [],
  "tags": [],
  "figures": [
    {
      "id": "account-recovery-steps",
      "kind": "screenshot",
      "src": "/documentation/es/auth-recovery.png",
      "alt": "Formulario de recuperación de contraseña con una dirección de ejemplo y el botón para enviar el enlace.",
      "caption": "Introduce aquí el correo de tu cuenta. La dirección de ejemplo no se envió; esta imagen no acredita la entrega del mensaje ni una recuperación completada.",
      "revision": 4,
      "reviewed": true,
      "capturedAt": "2026-10-08",
      "viewport": [
        380,
        278
      ],
      "theme": "light"
    }
  ],
  "requiredFigures": [
    "account-recovery-steps"
  ]
}
---

## Solicitar un enlace nuevo de restablecimiento {#account-recovery}

En la pantalla de acceso de la instancia correcta, utiliza la recuperación de contraseña e introduce el correo asociado a tu cuenta. Abre el mensaje de restablecimiento, sigue el enlace y confirma la acción. Introduce la nueva contraseña en la pantalla de restablecimiento y envíala. Comprueba después que puedas iniciar sesión en la misma instancia.

Un enlace puede caducar o dejar de tener una sesión activa. La pantalla de restablecimiento identifica esa situación y permite solicitar otro enlace. Empieza desde un mensaje nuevo en lugar de volver a intentar un marcador antiguo. No envíes el enlace, las cookies ni la contraseña al servicio de asistencia.


![Formulario de recuperación de contraseña con una dirección de ejemplo y el botón para enviar el enlace.](/documentation/es/auth-recovery.png)

## MFA y acceso sin resolver {#mfa-recovery}

Si la autenticación de dos factores está activada, restablecer la contraseña no elimina ese requisito. Utiliza tu aplicación de autenticación. También puedes usar un código de recuperación guardado al activar MFA; su uso desactiva MFA. Trata los códigos como secretos y vuelve a configurar MFA en los ajustes de seguridad cuando recuperes el acceso.

Si no dispones ni del segundo factor ni de un código de recuperación, contacta con el operador de la instancia por su canal de asistencia. Incluye la dirección de la instancia y el fallo que ves, sin tokens de autenticación ni contenido privado del proyecto. Si falta el correo de recuperación, pide al operador que verifique las URL de redirección de Auth y el envío SMTP. No crees una segunda cuenta suponiendo que heredará los proyectos o conexiones de la original.

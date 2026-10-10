---
{
  "id": "authentication-and-email",
  "locale": "es",
  "title": "Autenticación y correo electrónico",
  "summary": "Los emails de cuenta dependen de Supabase y GoTrue.",
  "topic": "Administrar una instancia",
  "type": "guide",
  "audiences": [
    "operator"
  ],
  "workflows": [
    "H06"
  ],
  "visibility": "public",
  "status": "published",
  "revision": 3,
  "sourceRevision": 3,
  "owner": "@mangue-dev",
  "updatedAt": "2026-10-09",
  "compatibility": {
    "version": "0.11.1 candidate (89ebb59a5)",
    "editions": [
      "self-hosted"
    ],
    "profiles": [
      "full",
      "managed",
      "source",
      "local"
    ],
    "evidence": [
      "docs/self-hosting-auth.md",
      "supabase/email-templates/confirm-signup.html",
      "supabase/email-templates/reset-password.html",
      "lib/self-hosting-email-templates.ts"
    ]
  },
  "review": {
    "revision": 3,
    "fact": "agent:/root/german_spanish_review (structural consolidation review; prior procedural evidence retained; no operational rerun); agent:/root (technical-reference formatting; prior factual evidence retained; no operational rerun)",
    "language": "agent:/root/german_spanish_review (es title, summary, lead and heading review; retained body comparison); agent:/root (inline-code syntax and unchanged-text review)",
    "date": "2026-10-09"
  },
  "related": [
    "instance-administration",
    "self-hosted-diagnostics"
  ],
  "aliases": [],
  "tags": [
    "Configurar correo de cuentas, MFA y recuperación"
  ],
  "figures": [
    {
      "id": "authentication-and-email-flow",
      "kind": "diagram",
      "src": "/documentation/es/authentication-and-email-flow.svg",
      "alt": "Diagrama: Origen Auth y redirecciones configurados. SMTP propio y plantillas versionadas. Confirmación e inicio de sesión. Pruebas TOTP, recuperación y contraseña antigua.",
      "caption": "Siga las etapas en este orden. Origen Auth y redirecciones configurados. SMTP propio y plantillas versionadas. Confirmación e inicio de sesión. Pruebas TOTP, recuperación y contraseña antigua.",
      "revision": 3,
      "reviewed": true,
      "capturedAt": "2026-10-08",
      "viewport": [
        720,
        640
      ],
      "theme": "neutral",
      "diagram": {
        "layout": "sequence",
        "items": [
          {
            "title": "Origen Auth y redirecciones configurados"
          },
          {
            "title": "SMTP propio y plantillas versionadas"
          },
          {
            "title": "Confirmación e inicio de sesión"
          },
          {
            "title": "Pruebas TOTP, recuperación y contraseña antigua"
          }
        ]
      }
    }
  ],
  "requiredFigures": [
    "authentication-and-email-flow"
  ]
}
---

## Configurar correo de cuentas, MFA y recuperación {#authentication-and-email}

Los emails de cuenta dependen de Supabase y GoTrue. Las notificaciones de la aplicación mediante Resend no configuran la confirmación ni la recuperación de contraseña. En full, conserve el overlay minddy en cada comando Compose. Defina `SITE_URL`, `API_EXTERNAL_URL`, `SUPABASE_PUBLIC_URL` y `ADDITIONAL_REDIRECT_URLS` con las URL de origen de su instancia. Configure `SMTP_ADMIN_EMAIL`, `SMTP_HOST`, `SMTP_PORT`, `SMTP_USER`, `SMTP_PASS` y `SMTP_SENDER_NAME` con su proveedor. Mantenga activa la confirmación y reinicie Auth en el contexto instalado.

Antes de ejecutar `compose`, defina la función del perfil full instalado siguiendo [el contexto Compose de referencia](/es/documentacion/backups-and-restoration#context).

```bash
compose up -d --wait auth
```

![Diagrama: Origen Auth y redirecciones configurados. SMTP propio y plantillas versionadas. Confirmación e inicio de sesión. Pruebas TOTP, recuperación y contraseña antigua.](/documentation/es/authentication-and-email-flow.svg)

## Configurar Supabase gestionado {#managed}

En Authentication del proyecto gestionado, configure Site URL y la redirección exacta `<app-origin>/auth/callback`. Configure su SMTP y las dos plantillas versionadas de confirmación y recuperación. La plantilla de confirmación utiliza `token_hash` y `type=signup`. Exija contraseñas de al menos ocho caracteres con minúsculas, mayúsculas y números y habilite el registro y la verificación TOTP. Active la comprobación de contraseñas comprometidas cuando esté disponible y registre las limitaciones del proveedor. El overlay full deniega el acceso si esa comprobación falla y necesita acceso saliente a `api.pwnedpasswords.com`. Registre la duración de las sesiones, la rotación de refresh tokens, la revocación y los límites de Auth: el bootstrap SQL no configura esos controles de plataforma.

## Verificar el resultado {#verify}

Utilice una dirección temporal bajo su control. Compruebe que el email de registro llega, abre esta instancia y requiere una confirmación explícita. Active TOTP en la seguridad de la cuenta y guarde los códigos de recuperación fuera del navegador. Cierre sesión y pruebe un nuevo inicio con contraseña y TOTP. Solicite un restablecimiento, siga el email de recuperación y compruebe que la contraseña anterior deja de funcionar. Para una dirección incluida en `ADMIN_EMAILS`, verifique el acceso de administrador solo después de MFA. Registre versiones, fechas y resultados sin datos sensibles. La salud de los contenedores no demuestra la entrega del correo ni la seguridad de la cuenta. No incluya tokens de email, contraseñas, sesiones, secretos TOTP ni códigos de recuperación en las pruebas.

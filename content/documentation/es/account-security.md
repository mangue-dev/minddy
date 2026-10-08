---
{
  "id": "account-security",
  "locale": "es",
  "title": "Proteger la cuenta con un segundo factor",
  "summary": "Verificar un autenticador y guardar códigos de recuperación antes de terminar.",
  "topic": "Cuenta y aplicaciones",
  "type": "guide",
  "audiences": [
    "member"
  ],
  "workflows": [
    "A02"
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
      "components/settings/account-security-section.tsx",
      "app/api/account/mfa/route.ts",
      "app/api/account/mfa/recovery-codes/route.ts",
      "app/api/account/mfa/recover/route.ts",
      "lib/server/mfa.ts",
      "content/documentation/reviews/mfa-enrollment-capture-candidates.json"
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
      "id": "account-security-workflow",
      "kind": "screenshot",
      "src": "/documentation/es/account-security-workflow.png",
      "alt": "Tarjeta de autenticación de dos factores con botón de activación.",
      "caption": "Empieza aquí, verifica después el autenticador y guarda los códigos de recuperación de forma privada.",
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
      "id": "account-security-enrollment-workflow",
      "kind": "screenshot",
      "src": "/documentation/es/account-security-enrollment-workflow.png",
      "alt": "Configuración del autenticador antes de verificar el código.",
      "caption": "Configuración del autenticador antes de verificar el código. El QR real y el secreto manual están ocultos; este factor temporal sin verificar se canceló y eliminó.",
      "revision": 2,
      "reviewed": true,
      "capturedAt": "2026-10-08",
      "viewport": [
        1440,
        1200
      ],
      "theme": "light"
    }
  ],
  "requiredFigures": [
    "account-security-workflow",
    "account-security-enrollment-workflow"
  ]
}
---

## Activar y verificar {#account-security}

Abra la sección Seguridad en la configuración de la cuenta y active la autenticación de dos factores. El segundo factor también se aplica al iniciar sesión mediante Google o GitHub; la autenticación del proveedor no lo sustituye.

1. Escanee el código QR con un autenticador TOTP o introduzca manualmente la clave de configuración mostrada. Nunca incluya ni el código QR ni la clave en una captura.
2. Introduzca el código actual de seis dígitos y confirme. Si ha caducado, pruebe el siguiente; después de demasiados intentos, espere antes de volver a intentarlo.
3. Guarde los códigos de recuperación en un lugar protegido al que pueda acceder sin el teléfono. Cada código funciona una sola vez y la lista solo se muestra una vez. Confirme que los ha guardado antes de terminar.

La activación actualiza la sesión actual e intenta cerrar las demás sesiones. Si se solicita una nueva autenticación después de aceptar el código, vuelva a iniciar sesión y siga las indicaciones mostradas.

![Tarjeta de autenticación de dos factores con botón de activación.](/documentation/es/account-security-workflow.png)


## Recuperación y cambios {#recovery}

Durante el inicio de sesión, si no tiene el teléfono, use uno de los códigos de recuperación que guardó. Usarlo desactiva la autenticación de dos factores e invalida los códigos restantes. Una vez dentro, configure de nuevo el autenticador y guarde los nuevos códigos de recuperación. Este proceso no garantiza que el soporte humano pueda restaurar la cuenta.

Sustituir los códigos de recuperación invalida la lista anterior. Tanto la sustitución como la desactivación voluntaria requieren las comprobaciones de autenticación reciente del servidor. Lea la confirmación: al desactivar la función, el factor adicional deja de solicitarse, incluso al entrar por Google o GitHub.

![Configuración del autenticador antes de verificar el código.](/documentation/es/account-security-enrollment-workflow.png)

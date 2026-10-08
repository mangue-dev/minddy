---
{
  "id": "profile-and-preferences",
  "locale": "es",
  "title": "Cambiar perfil y preferencias",
  "summary": "Configurar nombre, avatar, idioma, tema y atajo de envío de su cuenta.",
  "topic": "Cuenta y aplicaciones",
  "type": "guide",
  "audiences": [
    "member"
  ],
  "workflows": [
    "A01"
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
      "content/knowledge/settings-and-data.md",
      "components/settings/account-profile-section.tsx",
      "components/settings/account-preferences-section.tsx",
      "app/api/me/avatar/route.ts",
      "lib/server/avatar-seeds.ts"
    ]
  },
  "review": {
    "revision": 1,
    "fact": "2026-10-08",
    "language": "2026-10-08",
    "date": "2026-10-08"
  },
  "related": [
    "account-security",
    "devices-and-notifications",
    "automation-settings",
    "transfer-between-instances",
    "privacy-and-account-deletion"
  ],
  "aliases": [
    "settings-and-data"
  ],
  "tags": [],
  "figures": [
    {
      "id": "profile-and-preferences-workflow",
      "kind": "screenshot",
      "src": "/documentation/es/profile-and-preferences-workflow.png",
      "alt": "Controles del perfil para avatar, nombre de usuario y correo de solo lectura.",
      "caption": "Guarda los cambios del perfil tras validarlos; el correo sigue siendo de solo lectura.",
      "revision": 1,
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
      "revision": 1,
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
    "profile-and-preferences-workflow",
    "profile-and-preferences-preferences-workflow"
  ]
}
---

## Actualizar su identidad {#profile-and-preferences}
Abra los ajustes desde el menú de cuenta. En el perfil, escriba un nombre no vacío y guárdelo. El correo es de solo lectura. Genere otro avatar o suba una imagen con los controles correspondientes. Espere el resultado y compruebe el avatar en comentarios o miembros; es el mismo en proyectos y conversaciones. Si se rechaza un archivo, siga el mensaje de validación en vez de subirlo repetidamente.

La imagen fuente no debe superar 10 MiB. El servidor verifica bytes de imagen legibles, aplica orientación y recorta al centro como avatar WebP de 256 × 256.

![Controles del perfil para avatar, nombre de usuario y correo de solo lectura.](/documentation/es/profile-and-preferences-workflow.png)


## Elegir el comportamiento {#preferences}
Seleccione idioma y tema en preferencias y compruebe otra página. El idioma de cuenta gobierna el producto autenticado; el sitio público tiene su propio selector. El tema se guarda en la cuenta entre dispositivos.

Elija el atajo de envío en teclado. Se aplica a comentarios y Numo. Use el botón de enviar si la plataforma intercepta el atajo; las teclas modificadoras varían según el sistema. Preferencias como asignación automática y estado de incidencias creadas por Numo también pertenecen a la cuenta y no cambian los ajustes de otros miembros.

![Selector de idioma y controles de tema claro, oscuro y del sistema.](/documentation/es/profile-and-preferences-preferences-workflow.png)

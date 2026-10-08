---
{
  "id": "privacy-and-account-deletion",
  "locale": "es",
  "title": "Controlar analítica y eliminar una cuenta",
  "summary": "Revisar destinos y consecuencias antes de una petición irreversible.",
  "topic": "Cuenta y aplicaciones",
  "type": "guide",
  "audiences": [
    "member"
  ],
  "workflows": [
    "A09"
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
      "components/settings/account-analytics-section.tsx",
      "components/settings/account-data-section.tsx",
      "app/api/account/deletion-preview/route.ts",
      "app/api/account/route.ts"
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
      "id": "privacy-and-account-deletion-workflow",
      "kind": "screenshot",
      "src": "/documentation/es/privacy-and-account-deletion-workflow.png",
      "alt": "Vista previa de eliminación con proyectos propios, tickets y miembros que perderán acceso.",
      "caption": "Lee la vista previa y exporta los datos que quieras conservar antes de abrir la confirmación.",
      "revision": 2,
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
    "privacy-and-account-deletion-workflow"
  ]
}
---

## Consentimiento para analítica {#privacy-and-account-deletion}

Cuando hay un servicio de analítica configurado, los ajustes de la cuenta muestran su interruptor de consentimiento y un enlace a la política de cookies. Desactivarlo cambia inmediatamente el consentimiento de medición en este dispositivo y guarda la elección en la cuenta. En otro dispositivo puede seguir aplicándose una elección local ya existente. Si no se ha configurado ningún servicio de analítica, esta sección no aparece.

El consentimiento para analítica se distingue de los datos necesarios para utilizar la cuenta. Consulte la política de privacidad de la instancia y los proveedores externos que haya activado. En una instalación self-hosted, la configuración y las políticas del operador determinan los destinos de los servicios; desactivar la analítica no elimina las integraciones de IA ni de Git.


![Vista previa de eliminación con proyectos propios, tickets y miembros que perderán acceso.](/documentation/es/privacy-and-account-deletion-workflow.png)

## Revisar la eliminación antes de confirmar {#deletion}

Antes de eliminar la cuenta, exporte los datos que necesite conservar desde su sección de datos. Lea la vista previa de los proyectos de los que es propietario, los miembros afectados, los tickets, los comentarios y la suscripción activa. Las consecuencias para esos proyectos afectan a otras personas; resuélvalas antes de confirmar.

Abra la confirmación de eliminación solo cuando esté preparado. Escriba el correo de su cuenta y, si tiene una cuenta con contraseña, introduzca también esa contraseña. Las cuentas sin contraseña necesitan un inicio de sesión reciente. Si se exige volver a autenticarse, siga esa indicación en lugar de repetir la solicitud a ciegas. Una eliminación completada cierra la sesión y vuelve al sitio público. Esta acción no envía la cuenta a una papelera recuperable. Mantenga las exportaciones privadas y resuelva cualquier cuestión pendiente de suscripción o proveedores desde sus controles de facturación y de servicio.

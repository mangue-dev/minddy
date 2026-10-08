---
{
  "id": "devices-and-notifications",
  "locale": "es",
  "title": "Activar notificaciones de un dispositivo",
  "summary": "Registrar el dispositivo, probar entrega y distinguir navegador de soporte nativo.",
  "topic": "Cuenta y aplicaciones",
  "type": "guide",
  "audiences": [
    "member"
  ],
  "workflows": [
    "A03"
  ],
  "visibility": "public",
  "status": "published",
  "revision": 3,
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
      "components/settings/account-push-devices-section.tsx",
      "lib/desktop/notification-capabilities.ts",
      "public/sw.js",
      "content/documentation/reviews/push-registration-capture-candidates.json"
    ]
  },
  "review": {
    "revision": 3,
    "fact": "2026-10-08",
    "language": "2026-10-08",
    "date": "2026-10-08"
  },
  "related": [],
  "aliases": [],
  "tags": [],
  "figures": [
    {
      "id": "devices-and-notifications-workflow",
      "kind": "screenshot",
      "src": "/documentation/es/devices-and-notifications-workflow.png",
      "alt": "Ajustes push con permiso bloqueado en el navegador y ningún dispositivo registrado.",
      "caption": "Este navegador bloquea las notificaciones. Restablezca el permiso del sitio antes de registrar este dispositivo.",
      "revision": 3,
      "reviewed": true,
      "capturedAt": "2026-10-08",
      "viewport": [
        1440,
        1800
      ],
      "theme": "light"
    },
    {
      "id": "devices-and-notifications-registered-workflow",
      "kind": "screenshot",
      "src": "/documentation/es/devices-and-notifications-registered.png",
      "alt": "Dispositivo de navegador registrado y activo en la cuenta, con la fecha real del último envío.",
      "caption": "La cuenta tiene un dispositivo de navegador registrado y activo. La lista muestra las fechas de registro y del último envío. La aparición de una notificación sigue dependiendo del permiso del navegador y de los ajustes del sistema operativo.",
      "revision": 3,
      "reviewed": true,
      "capturedAt": "2026-10-08",
      "viewport": [
        1240,
        950
      ],
      "theme": "light"
    }
  ],
  "requiredFigures": [
    "devices-and-notifications-workflow",
    "devices-and-notifications-registered-workflow"
  ]
}
---

## Activar y probar {#devices-and-notifications}

Abra las notificaciones en la configuración de la cuenta desde el dispositivo que desea registrar. Actívelas y acepte la solicitud de permiso del navegador o del sistema operativo. Si se ha denegado el permiso, debe cambiarlo en la configuración del navegador o del sistema; accionar repetidamente el control de Minddy no evita ese rechazo. En iOS, instale y abra primero la aplicación web cuando la interfaz lo exija.

Compruebe que el dispositivo aparece en la lista y use su control de prueba. Consulte la información de la última entrega. Puede desactivar o eliminar registros individuales sin borrar la cuenta. Las preferencias de la bandeja de entrada determinan qué eventos generan notificaciones; la bandeja de entrada de la aplicación sigue disponible cuando el push no lo está.

![Ajustes push con permiso bloqueado en el navegador y ningún dispositivo registrado.](/documentation/es/devices-and-notifications-workflow.png)


## Condiciones por plataforma {#platforms}

El push web requiere un navegador compatible y un servicio push configurado en la instancia. Los avisos nativos y la entrega en segundo plano varían según la plataforma. La aplicación macOS distribuida y firmada admite APNs; el paquete Windows necesita su componente WNS opcional para el transporte en segundo plano. Linux utiliza la sesión en segundo plano de la aplicación distribuida, en lugar de APNs o WNS.

Compruebe el permiso de notificaciones del sistema, el estado de instalación en el navegador y la explicación mostrada si la función no está configurada o no es compatible. Una prueba correcta no garantiza la entrega sin conexión o bajo todas las restricciones de segundo plano del sistema. Mantenga disponible la aplicación o su servicio de segundo plano configurado, según los requisitos de la plataforma.

![Dispositivo de navegador registrado y activo en la cuenta, con la fecha real del último envío.](/documentation/es/devices-and-notifications-registered.png)

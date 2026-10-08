---
{
  "id": "install-the-pwa",
  "locale": "es",
  "title": "Instalar la aplicación web en móvil o tableta",
  "summary": "Añadir la instancia a inicio y conocer condiciones de conexión y push.",
  "topic": "Cuenta y aplicaciones",
  "type": "guide",
  "audiences": [
    "member"
  ],
  "workflows": [
    "A11"
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
      "components/marketing/mobile-pwa-install-guide.tsx",
      "components/marketing/mobile-install-guide-copy.ts",
      "public/sw.js",
      "content/documentation/reviews/pwa-guide-capture-candidates.json",
      "content/documentation/reviews/pwa-installation-probe.json"
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
      "id": "install-the-pwa-workflow",
      "kind": "screenshot",
      "src": "/documentation/es/install-the-pwa-workflow.png",
      "alt": "Guía ilustrada de instalación en Safari de Minddy: Compartir, Añadir a pantalla de inicio y confirmar.",
      "caption": "La guía pública ilustra los tres pasos de Safari y la opción Abrir como app web que debe permanecer activada. Son ilustraciones didácticas mostradas por Minddy, no capturas de una instalación de iOS realizada.",
      "revision": 2,
      "reviewed": true,
      "capturedAt": "2026-10-08",
      "viewport": [
        1240,
        940
      ],
      "theme": "light"
    }
  ],
  "requiredFigures": [
    "install-the-pwa-workflow"
  ]
}
---

## Instalar desde el navegador {#install-the-pwa}
Abra la instancia de Minddy que desea usar en Safari en un iPhone o iPad, o en Chrome u otro navegador compatible de Android. Si el enlace se abrió dentro de otra aplicación, ábralo primero en el navegador completo. Para una instancia self-hosted, utilice la dirección de su propio servidor.

En iOS, abra Compartir y elija Añadir a pantalla de inicio. Mantenga Abrir como app web activado y pulse Añadir. Según la interfaz de Safari, puede tener que abrir Más antes de Compartir. Si falta la acción, revise Editar acciones.

En Android, utilice la propuesta de instalación o elija Instalar aplicación o Añadir a pantalla de inicio en el menú del navegador y confirme Instalar. Los nombres varían según el navegador. Abra el nuevo icono e inicie sesión con la cuenta de esa instancia. Se trata de una PWA instalada por el navegador; Minddy no dispone de una aplicación nativa en el App Store de iOS ni en Google Play.

## Actualizaciones, acceso sin conexión y notificaciones {#operation}
La instalación no crea una copia del proyecto para usarla sin conexión. El service worker de Minddy solo gestiona notificaciones push y no almacena las solicitudes de la aplicación en caché. Mantenga una conexión de red y recargue la página para obtener el contenido web actual. Las notificaciones también requieren un navegador compatible, su permiso y una configuración push en el servidor. En iOS, utilice la aplicación instalada cuando el proceso lo indique. Si no aparece la opción de instalación, abra un navegador completo compatible y compruebe si la instancia ya está instalada.

![Guía ilustrada de instalación en Safari de Minddy: Compartir, Añadir a pantalla de inicio y confirmar.](/documentation/es/install-the-pwa-workflow.png)

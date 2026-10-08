---
{
  "id": "web-and-mobile",
  "locale": "es",
  "title": "Trabajar en navegador y móvil",
  "summary": "Navegar proyectos, detalles y Numo teniendo en cuenta la conexión.",
  "topic": "Cuenta y aplicaciones",
  "type": "guide",
  "audiences": [
    "member"
  ],
  "workflows": [
    "A10"
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
      "components/mobile-sidebar-reveal.tsx",
      "components/issue-side-panel.tsx",
      "components/assistant-panel.tsx",
      "public/sw.js",
      "content/documentation/reviews/mobile-account-capture-candidates.json"
    ]
  },
  "review": {
    "revision": 1,
    "fact": "2026-10-08",
    "language": "2026-10-08",
    "date": "2026-10-08"
  },
  "related": [],
  "aliases": [],
  "tags": [],
  "figures": [
    {
      "id": "web-and-mobile-workflow",
      "kind": "screenshot",
      "src": "/documentation/es/web-and-mobile-workflow.png",
      "alt": "Panel móvil de una incidencia con título, descripción, propiedades y campo de comentario.",
      "caption": "En una pantalla estrecha, los detalles de la incidencia ocupan un panel adaptable. Use el botón de cierre para volver al proyecto; Numo sigue disponible mediante su botón flotante.",
      "revision": 1,
      "reviewed": true,
      "capturedAt": "2026-10-08",
      "viewport": [
        390,
        844
      ],
      "theme": "dark"
    }
  ],
  "requiredFigures": [
    "web-and-mobile-workflow"
  ]
}
---

## Abrir y modificar una incidencia {#web-and-mobile}
Abra la dirección de su instancia e inicie sesión en ella. En una pantalla estrecha, muestre la barra lateral para elegir un proyecto y abra una incidencia desde su lista o tablero. Consulte los detalles en el panel adaptado a la pantalla, cambie el campo previsto o añada un comentario y espere el resultado del guardado antes de cerrar. Cierre el panel de detalles para volver a la lista; su presentación móvil difiere de la de una pantalla amplia.

Abra Numo mediante su botón flotante o una acción contextual de la incidencia. Compruebe el contexto de la incidencia en el campo de composición. Si otro panel cubre el contenido que necesita, ciérrelo antes de seguir navegando. En dispositivos táctiles, utilice los botones y menús visibles; no dé por hecho que están disponibles las acciones al pasar el cursor o los atajos de escritorio.

## Teclado y conexión {#access}
Con el teclado puede enfocar los controles y utilizar la paleta de comandos para navegar y realizar acciones habituales. El botón de envío visible ofrece una alternativa al envío por teclado. Siga el atajo que la aplicación muestra para su plataforma.

El navegador y la aplicación web instalada necesitan conexión de red para consultar los datos de los proyectos y guardar cambios. El service worker gestiona las notificaciones push sin implementar una caché de datos sin conexión. Tras un fallo de conexión, compruebe si el cambio se guardó antes de repetirlo. Instalar la PWA no crea una cuenta independiente ni evita los permisos de la instancia.

![Panel móvil de una incidencia con título, descripción, propiedades y campo de comentario.](/documentation/es/web-and-mobile-workflow.png)

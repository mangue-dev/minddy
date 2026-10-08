---
{
  "id": "publish-a-page",
  "locale": "es",
  "title": "Publicar una página y revocar su enlace",
  "summary": "Prueba la vista del visitante, elige deliberadamente el acceso a descendientes y revoca la publicación.",
  "topic": "Páginas y bases de datos",
  "type": "tutorial",
  "audiences": [
    "member",
    "visitor"
  ],
  "workflows": [
    "P06"
  ],
  "visibility": "public",
  "status": "published",
  "revision": 4,
  "sourceRevision": 2,
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
      "components/pages/page-publish-dialog.tsx",
      "lib/server/page-publication.ts",
      "app/p/[token]/page.tsx"
    ]
  },
  "review": {
    "revision": 4,
    "fact": "2026-10-08",
    "language": "2026-10-08",
    "date": "2026-10-08"
  },
  "related": [
    "share-a-view",
    "page-files",
    "permissions-and-public-links"
  ],
  "aliases": [],
  "tags": [],
  "figures": [
    {
      "id": "publish-a-page-steps",
      "kind": "screenshot",
      "src": "/documentation/es/page-publish.png",
      "alt": "Diálogo de publicación con Privado seleccionado y opciones de contraseña o enlace.",
      "caption": "Privado mantiene la página dentro del proyecto. Revisa quién debe verla antes de cambiar la publicación.",
      "revision": 4,
      "reviewed": true,
      "capturedAt": "2026-10-08",
      "viewport": [
        1440,
        1080
      ],
      "theme": "light"
    }
  ],
  "requiredFigures": [
    "publish-a-page-steps"
  ]
}
---

## Publicar el contenido previsto {#publish-a-page}

Abre una página del proyecto como miembro y usa sus controles de publicación. Revisa primero contenido y adjuntos. Elige acceso privado, protegido por contraseña o público. La contraseña requiere al menos ocho caracteres y se aplica después de enviarla; seleccionar el modo no crea por sí solo un enlace protegido.

Copia el enlace /p/ generado cuando la publicación tenga éxito. Si la página tiene descendientes, revisa la opción de incluirlos y su número. Incluirlos publica la rama seleccionada; excluirlos deja su contenido fuera de esa publicación. Una base de datos sin descendientes publicados no expone automáticamente todos los cuerpos de sus entradas.

Abre el enlace en una sesión separada del navegador sin tu cuenta. Prueba la contraseña si está activada, el contenido, las subpáginas previstas y las descargas. Esto verifica el acceso de solo lectura del visitante, no tus permisos más amplios de miembro.


![Diálogo de publicación con Privado seleccionado y opciones de contraseña o enlace.](/documentation/es/page-publish.png)

## Revocar y comprobar {#revoke-page}

Vuelve a los controles y elige privado. Tras revocar correctamente, abre el enlace antiguo de forma anónima y comprueba que se deniega el acceso. No se pueden recuperar copias o capturas ya recibidas. Las URL de descarga de archivos ya entregadas por una página publicada se firman por un máximo de 24 horas. La revocación impide nuevas visitas a la página, pero esas URL de archivos pueden seguir siendo válidas hasta que caduquen.

Los enlaces de páginas de usuarios mantienen noindex y son distintos del manual oficial indexado. Noindex es una política de descubrimiento, no una contraseña. Si un descendiente o archivo resulta legible inesperadamente, revoca primero, revisa la rama publicada y prueba de nuevo antes de reenviar un enlace corregido. Los archivos de páginas sin publicar no obtienen acceso por una referencia interna.

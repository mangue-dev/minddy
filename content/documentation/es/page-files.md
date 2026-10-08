---
{
  "id": "page-files",
  "locale": "es",
  "title": "Adjuntar y recuperar archivos de páginas",
  "summary": "Carga un archivo, verifica el acceso y comprende qué hace legible una publicación.",
  "topic": "Páginas y bases de datos",
  "type": "guide",
  "audiences": [
    "member"
  ],
  "workflows": [
    "P04"
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
      "components/pages/page-uploads.tsx",
      "lib/server/page-files.ts",
      "content/knowledge/pages.md",
      "lib/server/page-publication.ts"
    ]
  },
  "review": {
    "revision": 4,
    "fact": "2026-10-08",
    "language": "2026-10-08",
    "date": "2026-10-08"
  },
  "related": [
    "page-editor",
    "publish-a-page",
    "storage-and-attachments"
  ],
  "aliases": [],
  "tags": [],
  "figures": [
    {
      "id": "page-files-steps",
      "kind": "screenshot",
      "src": "/documentation/es/page-file-states.png",
      "alt": "Página de demostración con una carga incompleta y un archivo guardado de 67 bytes que ofrece Descargar.",
      "caption": "Comprueba el estado real del archivo: el segundo adjunto está disponible y la primera carga incompleta no.",
      "revision": 4,
      "reviewed": true,
      "capturedAt": "2026-10-08",
      "viewport": [
        1440,
        900
      ],
      "theme": "light"
    }
  ],
  "requiredFigures": [
    "page-files-steps"
  ]
}
---

## Cargar y comprobar un archivo {#page-files}

Abre la página como miembro del proyecto y utiliza los controles de adjuntos o carga. Selecciona un archivo no vacío dentro del límite de 10 MB por archivo. La cuota de almacenamiento de la cuenta o instancia puede imponer otro límite. Conserva el original hasta que la carga tenga éxito.

Las imágenes pueden insertarse como bloques de imagen y los demás documentos como bloques de archivo. El servidor determina el tipo de medio almacenado a partir de los bytes, sin confiar en el nombre del archivo ni en la etiqueta del navegador. Aceptar una carga no garantiza que todos los formatos tengan una vista previa en la página; descarga el archivo si no hay vista previa.

Comprueba que aparezca en la página y ábrelo o descárgalo. Los bytes están en Storage, mientras que los metadatos de página y archivo determinan el acceso. Que la página se guarde correctamente no demuestra por sí solo que estén disponibles los bytes.

## Archivos compartidos y fallos {#file-access}

Un archivo referenciado en una página publicada puede quedar disponible para sus visitantes. Los archivos de páginas fuera de la rama publicada no se hacen accesibles solo porque otra página los referencie. Revisa la página y los descendientes incluidos antes de compartir.

Si falla la carga, comprueba tamaño, cuota y mensaje de error. Un operador autoalojado también debe verificar configuración y políticas de Storage. Si falta un archivo después de restaurar, recupera sus bytes de Storage y metadatos correspondientes; una restauración solo de la base de datos no puede recrearlo. Las URL de archivos publicados se firman por un máximo de 24 horas al renderizar la página. Revocar una publicación detiene las nuevas visitas autorizadas a la página, pero no invalida inmediatamente las URL de archivos ya entregadas; pueden seguir utilizándose hasta que caduquen. Las copias descargadas no se pueden recuperar.


![Página de demostración con una carga incompleta y un archivo guardado de 67 bytes que ofrece Descargar.](/documentation/es/page-file-states.png)

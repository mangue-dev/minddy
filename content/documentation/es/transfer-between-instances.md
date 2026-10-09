---
{
  "id": "transfer-between-instances",
  "locale": "es",
  "title": "Transferencia de datos de la cuenta",
  "summary": "Exportar JSON privado, importar de forma aditiva y revisar conflictos y exclusiones.",
  "topic": "Cuenta y aplicaciones",
  "type": "guide",
  "audiences": [
    "member"
  ],
  "workflows": [
    "A07"
  ],
  "visibility": "public",
  "status": "published",
  "revision": 5,
  "sourceRevision": 5,
  "owner": "@mangue-dev",
  "updatedAt": "2026-10-09",
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
      "components/settings/account-data-section.tsx",
      "lib/server/account-import.ts",
      "content/documentation/reviews/remaining-account-capture-candidates.json",
      "content/documentation/reviews/account-transfer-execution.json",
      "content/documentation/reviews/visual-refresh-captures-2026-10-09.json"
    ]
  },
  "review": {
    "revision": 5,
    "fact": "agent:/root/german_spanish_review (structural consolidation review; prior procedural evidence retained; no operational rerun); agent:/root (visual usefulness, figure framing and preserved procedures; previous operational evidence retained)",
    "language": "agent:/root/german_spanish_review (es title, summary, lead and heading review; retained body comparison)",
    "date": "2026-10-09"
  },
  "related": [],
  "aliases": [],
  "tags": [
    "Transferir datos entre instancias"
  ],
  "figures": [
    {
      "id": "transfer-between-instances-workflow",
      "kind": "screenshot",
      "src": "/documentation/es/transfer-between-instances-workflow.png",
      "alt": "Ajustes de transferencia con botón para importar un archivo.",
      "caption": "Elige el JSON intacto exportado de la cuenta de origen; revisa el resultado antes de cerrar.",
      "revision": 5,
      "reviewed": true,
      "capturedAt": "2026-10-09",
      "viewport": [
        816,
        148
      ],
      "theme": "light",
      "padding": 24,
      "deviceScaleFactor": 2
    },
    {
      "id": "transfer-between-instances-export-workflow",
      "kind": "screenshot",
      "src": "/documentation/es/transfer-between-instances-export-workflow.png",
      "alt": "Control de exportación de la cuenta.",
      "caption": "Control de exportación de la cuenta. El archivo excluye claves y tokens; la captura muestra el botón antes de descargarlo.",
      "revision": 5,
      "reviewed": true,
      "capturedAt": "2026-10-09",
      "viewport": [
        816,
        148
      ],
      "theme": "light",
      "padding": 24,
      "deviceScaleFactor": 2
    }
  ],
  "requiredFigures": [
    "transfer-between-instances-workflow",
    "transfer-between-instances-export-workflow"
  ]
}
---

## Exportar e importar {#transfer-between-instances}

Inicie sesión en la instancia de origen y abra la sección de datos de los ajustes de la cuenta. Descargue el archivo JSON y guárdelo de forma privada: contiene datos de la cuenta y de los proyectos. Cree una cuenta o inicie sesión en la instancia de destino, compruebe su dirección y use allí el control de importación. Seleccione el archivo exportado sin modificarlo y espere el resultado antes de cerrar la página.

La importación añade datos; no sustituye los que ya existen en el destino. Conserva los identificadores que pueden reutilizarse de forma segura y asigna otros nuevos cuando hay conflictos. El resultado informa de los identificadores reasignados y de las membresías omitidas. Las referencias de membresía de proyectos existentes solo se restauran si el proyecto ya existe en el destino y la referencia está autorizada. Después de que la página se recargue, revise los proyectos, tickets, páginas y datos personales.


![Ajustes de transferencia con botón para importar un archivo.](/documentation/es/transfer-between-instances-workflow.png)

## Volver a conectar los servicios {#exclusions}

No se transfieren contraseñas, claves API, tokens OAuth, credenciales de repositorios ni suscripciones. Configure y autorice de nuevo los servicios necesarios en el destino; un proyecto exportado no demuestra que el acceso a su proveedor siga funcionando. Revise los archivos adjuntos y su disponibilidad en lugar de tratar el JSON como una copia operativa de la base de datos y de los archivos de Storage.

Conserve la instancia de origen hasta comprobar el trabajo transferido. Si la importación falla, guarde el mensaje de error y verifique el estado del destino antes de repetirla. Elimine o proteja los archivos de transferencia cuando ya no los necesite; nunca los adjunte a un informe público de error.

![Control de exportación de la cuenta.](/documentation/es/transfer-between-instances-export-workflow.png)

El resultado permanece abierto hasta que pulse Recargar la cuenta o cierre el diálogo. Ambas acciones recargan la cuenta después de que haya revisado los recuentos.

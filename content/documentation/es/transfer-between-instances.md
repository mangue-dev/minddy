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
  "revision": 8,
  "sourceRevision": 7,
  "owner": "@mangue-dev",
  "updatedAt": "2026-10-22",
  "compatibility": {
    "version": "0.20.0 (MIN-747 release review)",
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
      "components/settings/account-settings-page.tsx"
    ]
  },
  "review": {
    "revision": 8,
    "fact": "agent:/root/min747 (0.20.0 release review: source audit against the v0.11.0..main delta, verified corrections applied; 2 screenshot(s) recaptured on 2026-10-20 from the local candidate and inspected; no browser walkthrough of the procedures or operator rehearsal; earlier evidence retained in git history); agent:claude-code (it/es catalog language review: quoted labels aligned on the corrected es catalog; no behavior change, no new captures)",
    "language": "agent:/root/min747 (es translation of the release corrections with catalog UI labels; equivalent meaning self-reviewed; agent review, not human acceptance); agent:claude-code (es label alignment after the full catalog review; self-reviewed; agent review, not human acceptance)",
    "date": "2026-10-22"
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
      "revision": 8,
      "reviewed": true,
      "capturedAt": "2026-10-20",
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
      "revision": 8,
      "reviewed": true,
      "capturedAt": "2026-10-20",
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

Inicie sesión en la instancia de origen y abra la pestaña **Privacidad y datos** de los ajustes de la cuenta. Elija **Descargar mis datos** y guarde el archivo JSON de forma privada: contiene datos de la cuenta y de los proyectos, incluidos los bytes de los archivos. Cree una cuenta o inicie sesión en la instancia de destino, compruebe su dirección, abra la misma pestaña y elija **Importar un archivo de transferencia**. Seleccione el archivo exportado sin modificarlo y espere el resultado antes de cerrar la página.

La importación añade datos; no sustituye los que ya existen en el destino. Conserva los identificadores que pueden reutilizarse de forma segura y asigna otros nuevos cuando hay conflictos. El resultado informa de los identificadores reasignados y de las membresías omitidas. Las referencias de membresía de proyectos existentes solo se restauran si el proyecto ya existe en el destino y la referencia está autorizada. Después de que la página se recargue, revise los proyectos, tickets, páginas y datos personales.


![Ajustes de transferencia con botón para importar un archivo.](/documentation/es/transfer-between-instances-workflow.png)

## Volver a conectar los servicios {#exclusions}

No se transfieren contraseñas, claves API, tokens OAuth, credenciales de repositorios ni suscripciones. Configure y autorice de nuevo los servicios necesarios en el destino; un proyecto exportado no demuestra que el acceso a su proveedor siga funcionando. Revise los archivos adjuntos y su disponibilidad en lugar de tratar el JSON como una copia operativa de la base de datos y de los archivos de Storage. Una exportación creada con v0.11.0 o anterior puede contener vistas guardadas de la paleta de comandos y conversaciones del agente de código; esta versión ya no tiene esas funciones y las ignora al importar.

Conserve la instancia de origen hasta comprobar el trabajo transferido. Si la importación falla, guarde el mensaje de error y verifique el estado del destino antes de repetirla. Elimine o proteja los archivos de transferencia cuando ya no los necesite; nunca los adjunte a un informe público de error.

![Control de exportación de la cuenta.](/documentation/es/transfer-between-instances-export-workflow.png)

El resultado permanece abierto hasta que pulse Recargar la cuenta o cierre el diálogo. Ambas acciones recargan la cuenta después de que haya revisado los recuentos.

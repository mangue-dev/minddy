---
{
  "id": "instance-administration",
  "locale": "es",
  "title": "Administración de la instancia",
  "summary": "Administrar la instancia es distinto de ser propietario de un proyecto.",
  "topic": "Administrar una instancia",
  "type": "guide",
  "audiences": [
    "operator"
  ],
  "workflows": [
    "H16"
  ],
  "visibility": "public",
  "status": "published",
  "revision": 4,
  "sourceRevision": 4,
  "owner": "@mangue-dev",
  "updatedAt": "2026-10-09",
  "compatibility": {
    "version": "0.11.1 candidate (89ebb59a5)",
    "editions": [
      "self-hosted"
    ],
    "profiles": [
      "full",
      "managed",
      "source",
      "local"
    ],
    "evidence": [
      "app/(app)/admin/page.tsx",
      "app/(app)/admin/layout.tsx",
      "components/admin/admin-dashboard.tsx",
      "lib/admin-tabs.ts",
      "lib/server/admin.ts",
      "docs/self-hosting-auth.md"
    ]
  },
  "review": {
    "revision": 4,
    "fact": "agent:/root/german_spanish_review (structural consolidation review; prior procedural evidence retained; no operational rerun); agent:/root (visual usefulness, figure framing and preserved procedures; previous operational evidence retained); agent:/root (technical-reference formatting; prior factual evidence retained; no operational rerun)",
    "language": "agent:/root/german_spanish_review (es title, summary, lead and heading review; retained body comparison); agent:/root/editorial_de_es (editorial clarity pass); agent:/root (figure removals and captions); agent:/root (inline-code syntax and unchanged-text review)",
    "date": "2026-10-09"
  },
  "related": [
    "authentication-and-email",
    "instance-configuration"
  ],
  "aliases": [],
  "tags": [
    "Usar la consola de administración de la instancia"
  ],
  "figures": [
    {
      "id": "instance-administration-flow",
      "kind": "screenshot",
      "src": "/documentation/es/instance-administration-overview.png",
      "alt": "Resumen de administración con métricas agregadas de cuentas, incorporación y contenido.",
      "caption": "Resumen muestra indicadores agregados de la instancia. Finanzas no aparece en este perfil de demostración porque no hay una clave gestionada de OpenRouter configurada.",
      "revision": 4,
      "reviewed": true,
      "capturedAt": "2026-10-08",
      "viewport": [
        1488,
        1148
      ],
      "theme": "light",
      "padding": 24
    },
    {
      "id": "instance-administration-models",
      "kind": "screenshot",
      "src": "/documentation/es/instance-administration-models.png",
      "alt": "Configuración de modelos de IA y razonamiento de la instancia.",
      "caption": "Modelos configura valores predeterminados y usos específicos. La captura muestra la configuración existente; no se cambió ningún modelo ni proveedor.",
      "revision": 4,
      "reviewed": true,
      "capturedAt": "2026-10-08",
      "viewport": [
        1488,
        1148
      ],
      "theme": "light",
      "padding": 24
    }
  ],
  "requiredFigures": [
    "instance-administration-flow"
  ]
}
---

## Usar la consola de administración de la instancia {#instance-administration}

Administrar la instancia es distinto de ser propietario de un proyecto. `ADMIN_EMAILS` contiene las direcciones de cuentas confirmadas autorizadas en el servidor; `app_metadata.role=admin` firmado por el servidor también es un origen de rol válido. La sesión de administrador exige `aal2`, MFA verificada y comprobaciones actuales de cuenta y sesión. Si fallan, se deniega el acceso. Inicie sesión, complete TOTP y abra `/admin`. No cambie roles en la base de datos para evitar el registro MFA. La consola y sus API privadas siguen siendo `noindex`.




![Resumen de administración con métricas agregadas de cuentas, incorporación y contenido.](/documentation/es/instance-administration-overview.png)

![Configuración de modelos de IA y razonamiento de la instancia.](/documentation/es/instance-administration-models.png)

## Usar capacidades disponibles {#panels}

La consola incluye Resumen, Usuarios, Modelos y, cuando está disponible, Finanzas. Finanzas queda oculto sin una capacidad OpenRouter gestionada vinculada. La asignación de planes depende de la facturación configurada o de un override existente. Abrir la consola no añade facturación Cloud a una instancia self-hosted sin proveedores comerciales. Revise modelos, valores predeterminados, usuarios y cuotas en la versión instalada antes de cambiar nada. Los cambios afectan a toda la instancia: utilice cuentas de demostración para comprobarlos.

## Mantener responsabilidades operativas {#responsibilities}

Usted sigue siendo responsable de limitar los privilegios, recuperar MFA, proteger secretos del servidor, mantener copias, gestionar retención e incidentes y controlar costes. La consola no sustituye una restauración de base de datos y Storage ni una prueba SMTP. Si se deniega el acceso, compruebe dirección confirmada, lista autorizada, MFA y sesión actual antes de modificar la configuración. Una sesión revocada o una cuenta bloqueada no conserva privilegios por tener un JWT todavía válido. No incluya datos privados ajenos, factores de seguridad o detalles financieros en las capturas documentales.

---
{
  "id": "mcp-tool-reference",
  "locale": "fr",
  "title": "Utiliser MCP Minddy et découvrir ses outils actuels",
  "summary": "Minddy expose /api/mcp en Streamable HTTP, avec outils stateless et OAuth 2.1.",
  "topic": "Concepts techniques",
  "type": "reference",
  "audiences": [
    "integrator"
  ],
  "workflows": [
    "T06"
  ],
  "visibility": "public",
  "status": "published",
  "revision": 1,
  "sourceRevision": 1,
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
      "desktop",
      "mobile",
      "full",
      "managed"
    ],
    "evidence": [
      "lib/server/mcp/catalog.ts",
      "lib/server/mcp/tools.ts",
      "lib/server/mcp/page-tools.ts",
      "lib/server/mcp/auth.ts",
      "app/llms-full.txt/route.ts"
    ]
  },
  "review": {
    "revision": 1,
    "fact": "agent:/root/automation_account_documentation (independent primary-source and final correction review)",
    "language": "agent:/root/automation_account_documentation (complete independent article and final correction review)",
    "date": "2026-10-08"
  },
  "related": [
    "numo-execution-model",
    "integration-troubleshooting"
  ],
  "aliases": [],
  "tags": [],
  "figures": [],
  "requiredFigures": []
}
---

## Utiliser MCP Minddy et découvrir ses outils actuels {#mcp-tool-reference}

Minddy expose /api/mcp en Streamable HTTP, avec outils stateless et OAuth 2.1. Connectez votre compte par consentement dans le navigateur ; les anciennes clés statiques mdyk_ ne sont pas acceptées. Commencez par minddy_list_projects pour les UUID accessibles, puis lisez les schémas du serveur connecté. /llms-full.txt est généré depuis ces enregistrements et fournit les paramètres actuels exacts. Ne devinez pas les outils depuis une ancienne liste copiée. Chaque opération projet revérifie l’accès et retourne des codes stables.

## Lire avant de modifier les plans {#issue-plans}

minddy_get_issue accepte UUID de ticket, identifiant de ticket tel que DEMO-42 ou numéro de ticket, avec project_id fourni séparément. Ses plan_tasks fournissent les task_index à partir de zéro. minddy_update_plan_task reçoit un lot tasks avec pending, in_progress, completed ou cancelled. Un index invalide refuse tout le lot. Ajoutez avec minddy_append_to_plan et modifiez un passage avec minddy_edit_issue_text et old_string/new_string exacts et uniques. Relisez si le passage est périmé ; remplacer le plan entier peut écraser la progression d’autrui. Les questions sous ## Questions ne comptent pas comme tâches.

## Respecter versions et propriété {#pages-and-routines}

minddy_list_pages décrit la hiérarchie ; minddy_search_pages trouve des extraits et minddy_get_page lit Markdown complet, commentaires et valeurs de base. Préférez ajout/modification partielle et gardez les contrôles de version pour remplacement complet. Préservez exactement URLs de fichiers/images. minddy_create_page avec database=true crée une base ; minddy_update_page_database exige révision pour schéma, valeur précédente pour cellule et tokens aperçu/application pour conversions. Les outils de routine réservés au propriétaire créent, suspendent, déplacent ou retirent des demandes planifiées. Lisez l’existant avant de créer un doublon. minddy_add_resource limite les fichiers à 10 Mo ; les outils pages n’inventent pas d’URLs.

## Vérifier avec un exemple {#example}

L’exemple expurgé change l’état de la première tâche d’un plan déjà lu. Remplacez UUID projet et ticket par la découverte ; task_index doit venir de la dernière lecture. Vérifiez plan_tasks et plan_progress retournés. Pour un refus d’accès, contrôlez compte et autorisation projet ; pour conflit périmé, relisez puis appliquez uniquement la modification voulue. Ne répétez pas une mutation externe incertaine avant d’en vérifier le résultat.

```json
{
  "project_id": "00000000-0000-4000-8000-000000000001",
  "issue": "DEMO-42",
  "tasks": [{"task_index": 0, "state": "in_progress"}]
}
```

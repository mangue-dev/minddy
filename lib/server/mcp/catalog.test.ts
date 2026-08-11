import { describe, expect, it } from "vitest";
import { FEEDBACK_POST_STATUSES } from "@/lib/feedback/types";
import { mcpToolCatalog } from "./catalog";
import { MCP_SERVER_INSTRUCTIONS } from "./instructions";

/**
 * Le catalogue est lu depuis l'enregistrement RÉEL des tools (catalog.ts), et
 * c'est lui que servent `/llms.txt` et la carte de serveur MCP. Ce que ce test
 * garde, c'est donc le contrat ANNONCÉ des écritures chirurgicales de plan
 * (MIN-186) : leurs noms, leurs paramètres, et le fait qu'elles soient nommées
 * là où un modèle les cherchera — dans le mode d'emploi du serveur, et dans la
 * description du tool qui, lui, remplace tout.
 */

const tool = (name: string) => {
  const found = mcpToolCatalog().find((t) => t.name === name);
  expect(found, `${name} is not registered`).toBeDefined();
  return found!;
};

const param = (name: string, paramName: string) => {
  const found = tool(name).params.find((p) => p.name === paramName);
  expect(found, `${name} has no "${paramName}" parameter`).toBeDefined();
  return found!;
};

describe("catalogue MCP — édition partielle d'un plan", () => {
  it("annonce minddy_append_to_plan avec markdown requis et section optionnelle", () => {
    expect(tool("minddy_append_to_plan").readOnly).toBe(false);
    expect(param("minddy_append_to_plan", "project_id").required).toBe(true);
    expect(param("minddy_append_to_plan", "issue").required).toBe(true);
    expect(param("minddy_append_to_plan", "markdown").required).toBe(true);
    expect(param("minddy_append_to_plan", "section").required).toBe(false);
  });

  it("annonce minddy_edit_issue_text en old_string → new_string", () => {
    expect(tool("minddy_edit_issue_text").readOnly).toBe(false);
    for (const required of ["project_id", "issue", "field", "old_string", "new_string"]) {
      expect(param("minddy_edit_issue_text", required).required).toBe(true);
    }
    expect(param("minddy_edit_issue_text", "replace_all").required).toBe(false);
    // new_string accepte la chaîne vide : c'est ainsi qu'on SUPPRIME un passage.
    expect(param("minddy_edit_issue_text", "new_string").description).toMatch(/empty/i);
  });

  it("détourne minddy_update_issues de la réécriture d'un plan existant", () => {
    const description = tool("minddy_update_issues").description ?? "";
    expect(description).toContain("minddy_edit_issue_text");
    expect(description).toContain("minddy_append_to_plan");
  });

  it("nomme les trois gestes chirurgicaux dans le mode d'emploi du serveur", () => {
    for (const name of [
      "minddy_append_to_plan",
      "minddy_edit_issue_text",
      "minddy_update_plan_task",
    ]) {
      expect(MCP_SERVER_INSTRUCTIONS).toContain(name);
    }
  });

  it("garde des noms d'outils uniques", () => {
    const names = mcpToolCatalog().map((t) => t.name);
    expect(new Set(names).size).toBe(names.length);
  });
});

/**
 * Ce que l'audit MCP du 2026-08-06 a trouvé désynchronisé du feedback, et qui
 * ne doit pas se re-désynchroniser : les descriptions et le mode d'emploi
 * sont de la PROSE, que rien ne relie à ses constantes. Ces trois assertions
 * sont ce lien — elles échouent le jour où un statut s'ajoute sans être dit.
 */
describe("catalogue MCP — le feedback dit ce que l'app fait", () => {
  it("nomme les six statuts d'un retour, `spam` compris", () => {
    const description = tool("minddy_list_feedback").description ?? "";
    for (const status of FEEDBACK_POST_STATUSES) {
      expect(description, `statut "${status}" absent de la description`).toContain(
        status
      );
    }
  });

  it("annonce minddy_update_feedback, et son statut verrouillé par le ticket", () => {
    expect(tool("minddy_update_feedback").readOnly).toBe(false);
    for (const optional of ["status", "is_public", "review_state"]) {
      expect(param("minddy_update_feedback", optional).required).toBe(false);
    }
    expect(MCP_SERVER_INSTRUCTIONS).toContain("minddy_update_feedback");
  });

  it("ne décrit plus le fil de commentaires comme team-only (MIN-196)", () => {
    // Le fil porte deux visibilités : le dire « internal, team-only » cachait
    // à l'agent les réponses publiques des visiteurs.
    expect(MCP_SERVER_INSTRUCTIONS).not.toContain("team-only comment thread");
    expect(tool("minddy_get_feedback").description).toContain("visibility");
  });
});

/**
 * Un agent qui écrit un commentaire n'a AUCUNE mesure de ce qu'est un
 * commentaire ici : mesuré le 2026-08-06 sur la base, les commentaires écrits
 * par le MCP faisaient 2 555 caractères de médiane contre 177 pour ceux écrits
 * à la main — quatorze fois plus long, avec titres et sections, là où le fil
 * porte des phrases. Le seul endroit qui pouvait le lui dire ne disait rien du
 * tout (`body` valait « Markdown. »). Ce qui doit tenir : la consigne de
 * brièveté est dans la description ET dans le champ, avec un chiffre — un
 * adjectif seul ne borne rien.
 */
describe("catalogue MCP — un commentaire est court", () => {
  const bodyParam = {
    minddy_add_comment: "body",
    minddy_add_feedback_comment: "body",
    minddy_add_objective_comment: "body",
  };

  for (const [name, field] of Object.entries(bodyParam)) {
    it(`borne ${name} dans sa description et dans ${field}`, () => {
      expect(tool(name).description).toContain("1000 characters");
      expect(param(name, field).description).toMatch(/1000 characters/);
      expect(param(name, field).description).toMatch(/no headings/i);
    });
  }

  it("borne aussi la réponse publique de minddy_respond_feedback", () => {
    expect(tool("minddy_respond_feedback").description).toMatch(/KEEP IT SHORT/);
    expect(param("minddy_respond_feedback", "response").description).toMatch(
      /two or three sentences/i
    );
  });
});

/**
 * MIN-184 — la pièce jointe devient une RESSOURCE : un fichier OU un lien. Les
 * tools MCP sont redécouverts à chaque connexion, donc le renommage est franc
 * et rien ne persiste l'ancien nom côté client. Ce qui doit tenir, en revanche,
 * c'est que la capacité EXPOSÉE dise les deux moitiés — un agent qui ne lit
 * qu'« attach a file » n'essaiera jamais d'attacher un lien, et la feature
 * n'existera pas pour lui.
 */
describe("catalogue MCP — ressources", () => {
  it("remplace les tools pièce jointe par les tools ressource", () => {
    const names = mcpToolCatalog().map((t) => t.name);
    expect(names).toContain("minddy_add_resource");
    expect(names).toContain("minddy_get_resource");
    expect(names).not.toContain("minddy_add_attachment");
    expect(names).not.toContain("minddy_get_attachment");
  });

  it("annonce les deux moitiés de minddy_add_resource, exclusives", () => {
    const description = tool("minddy_add_resource").description ?? "";
    expect(description).toMatch(/file/i);
    expect(description).toMatch(/link/i);
    // Aucun des quatre champs de contenu n'est requis : c'est le handler qui
    // tranche l'exclusivité, un schéma ne sait pas dire « l'un ou l'autre ».
    for (const optional of ["url", "file_name", "mime_type", "content_base64"]) {
      expect(param("minddy_add_resource", optional).required).toBe(false);
    }
    for (const required of ["project_id", "issue"]) {
      expect(param("minddy_add_resource", required).required).toBe(true);
    }
  });

  it("nomme minddy_get_resource par resource_id, et dit ce qu'un lien rend", () => {
    expect(tool("minddy_get_resource").readOnly).toBe(true);
    expect(param("minddy_get_resource", "resource_id").required).toBe(true);
    expect(tool("minddy_get_resource").description).toMatch(/LINK/);
  });

  it("dit la ressource dans le mode d'emploi du serveur, et n'y garde plus la pièce jointe", () => {
    expect(MCP_SERVER_INSTRUCTIONS).toContain("minddy_add_resource");
    expect(MCP_SERVER_INSTRUCTIONS).toContain("minddy_get_resource");
    expect(MCP_SERVER_INSTRUCTIONS).not.toContain("minddy_add_attachment");
    expect(MCP_SERVER_INSTRUCTIONS).not.toContain("minddy_get_attachment");
  });

  it("annonce les ressources dans les tools de LECTURE, les deux types nommés", () => {
    for (const name of ["minddy_get_issue", "minddy_list_objectives"]) {
      const description = tool(name).description ?? "";
      expect(description, `${name} ne parle pas de ressources`).toMatch(/resource/i);
      expect(description, `${name} ne nomme pas les liens`).toMatch(/link/i);
    }
  });
});

/**
 * Un agent remplit ce qu'on lui DEMANDE de remplir, et « only title is
 * required » — ce que disait `minddy_create_issue` — se lit comme une
 * autorisation à ne mettre qu'un titre. Les tickets arrivaient sans priorité,
 * sans effort, sans catégorie, sans relation : le schéma n'a jamais été le
 * problème, la consigne l'était.
 *
 * Ce qui doit tenir : l'ATTENTE est écrite là où un modèle la lit — la
 * description du tool, la description de CHAQUE champ concerné, et le mode
 * d'emploi du serveur —, et remplir ne coûte plus un aller-retour (catégories
 * par nom, relations posées dans l'appel de création).
 */
describe("catalogue MCP — un ticket créé arrive rempli", () => {
  it("demande le remplissage dans minddy_create_issue, pas seulement l'autorise", () => {
    const description = tool("minddy_create_issue").description ?? "";
    expect(description).toContain("FILL THE TICKET");
    // Ce qui manquait dans les vrais tickets, nommé un par un.
    for (const field of ["priority", "effort", "description", "categor", "relations"]) {
      expect(description, `le champ "${field}" n'est pas réclamé`).toContain(field);
    }
    // La règle d'assignation est une DÉCISION (MIN-201) : la personne nommée,
    // le owner sur un projet solo, personne sinon. Un agent qui assigne au
    // hasard est pire qu'un ticket non assigné.
    expect(param("minddy_create_issue", "assignee_id").description).toMatch(
      /single-member project, the owner/i
    );
  });

  it("réclame priority et effort dans LEURS champs, pas seulement dans la prose", () => {
    for (const field of ["priority", "effort"]) {
      expect(
        param("minddy_create_issue", field).description,
        `${field} ne dit pas qu'on en attend toujours un`
      ).toMatch(/ALWAYS/);
    }
  });

  it("rend le remplissage moins cher qu'un aller-retour : catégories par nom", () => {
    for (const name of ["minddy_create_issue", "minddy_update_issues"]) {
      expect(tool(name).description, `${name} ignore category_names`).toMatch(
        /category_names/
      );
    }
    expect(param("minddy_create_issue", "category_names").required).toBe(false);
    // Un nom inventé ne doit pas disparaître en silence : il revient à l'agent.
    expect(param("minddy_create_issue", "category_names").description).toMatch(
      /categories_unmatched/
    );
  });

  it("pose les relations DANS l'appel de création, siblings compris", () => {
    expect(param("minddy_create_issue", "relations").required).toBe(false);
    expect(param("minddy_create_issue", "relations").description).toMatch(/sub:N/);
    expect(tool("minddy_create_issue").description).toMatch(/sub:N/);
  });

  it("nomme les relations dans la LECTURE d'un ticket", () => {
    // Elles étaient déjà rendues par minddy_get_issue, et annoncées nulle part :
    // un agent qui ne lit que la description ignore que le concept existe.
    const description = tool("minddy_get_issue").description ?? "";
    expect(description).toMatch(/relations/);
    expect(description).toMatch(/blocked_by/);
    expect(description).toContain("minddy_link_issues");
  });

  it("écrit la règle de remplissage dans le mode d'emploi du serveur", () => {
    expect(MCP_SERVER_INSTRUCTIONS).toContain("FILL WHAT YOU CREATE");
    expect(MCP_SERVER_INSTRUCTIONS).toContain("minddy_link_issues");
    expect(MCP_SERVER_INSTRUCTIONS).toContain("category_names");
  });

  it("demande aussi le remplissage d'un objectif", () => {
    const description = tool("minddy_create_objective").description ?? "";
    expect(description).toContain("FILL IT");
    expect(description).toMatch(/description/);
    expect(description).toMatch(/lead_user_id/);
    // Un objectif sans ticket a une barre de progression morte : le tool doit
    // dire par où on les rattache.
    expect(description).toContain("minddy_update_issues");
  });
});

/**
 * Les objectifs portaient depuis longtemps un fil de commentaires et une
 * activité (20260728091000_objective_activity.sql, tables polymorphes), une
 * description et des ressources — et la surface MCP n'en exposait rien : ni
 * lecture unitaire, ni écriture de commentaire. Ce qui doit tenir : les deux
 * moitiés existent, et la lecture précède l'écriture.
 */
describe("catalogue MCP — un objectif se lit et se commente", () => {
  it("expose minddy_get_objective en lecture, par objective_id", () => {
    expect(tool("minddy_get_objective").readOnly).toBe(true);
    for (const required of ["project_id", "objective_id"]) {
      expect(param("minddy_get_objective", required).required).toBe(true);
    }
    const description = tool("minddy_get_objective").description ?? "";
    // Ce que la liste ne rendait pas, et qui justifie une lecture unitaire.
    for (const carried of ["description", "COMMENT", "progress", "activity"]) {
      expect(description, `${carried} absent de la description`).toMatch(
        new RegExp(carried, "i")
      );
    }
  });

  it("expose minddy_add_objective_comment en écriture, et renvoie d'abord vers la lecture", () => {
    expect(tool("minddy_add_objective_comment").readOnly).toBe(false);
    for (const required of ["project_id", "objective_id", "body"]) {
      expect(param("minddy_add_objective_comment", required).required).toBe(true);
    }
    const description = tool("minddy_add_objective_comment").description ?? "";
    expect(description).toContain("minddy_get_objective");
    // Le partage des rôles avec le commentaire de ticket, dit explicitement.
    expect(description).toContain("minddy_add_comment");
  });

  it("nomme les deux dans le mode d'emploi du serveur", () => {
    for (const name of ["minddy_get_objective", "minddy_add_objective_comment"]) {
      expect(MCP_SERVER_INSTRUCTIONS).toContain(name);
    }
  });

  it("annonce la description tronquée de la liste, et où lire la vraie", () => {
    const description = tool("minddy_list_objectives").description ?? "";
    expect(description).toMatch(/TRUNCATED/i);
    expect(description).toContain("minddy_get_objective");
  });
});

/**
 * MIN-273 — les six outils de PAGE. Ce que garde ce bloc n'est pas leur
 * existence (le catalogue la dit déjà) mais leur CONTRAT annoncé : ce qui est
 * requis, ce qui ne l'est pas, et surtout le fait que chaque outil dise où
 * envoyer un modèle qui s'apprête à réécrire un document entier pour changer une
 * phrase. C'est la seule chose qui empêche `minddy_update_page` de redevenir le
 * chemin par défaut, comme `minddy_update_issues` l'avait été pour les plans.
 */
describe("catalogue MCP — les pages", () => {
  it("expose les outils, lectures annoncées sans effet de bord", () => {
    for (const name of [
      "minddy_list_pages",
      "minddy_get_page",
      "minddy_create_page",
      "minddy_update_page",
      "minddy_append_to_page",
      "minddy_edit_page_text",
      "minddy_add_page_comment",
    ]) {
      expect(tool(name)).toBeDefined();
    }
    expect(tool("minddy_list_pages").readOnly).toBe(true);
    expect(tool("minddy_get_page").readOnly).toBe(true);
    for (const write of [
      "minddy_create_page",
      "minddy_update_page",
      "minddy_append_to_page",
      "minddy_edit_page_text",
      // Commenter est une ÉCRITURE, même si elle ne touche pas au document :
      // elle notifie des gens, et elle s'affiche sous leur page.
      "minddy_add_page_comment",
    ]) {
      expect(tool(write).readOnly).toBe(false);
    }
  });

  it("dit où lire une objection, et par quoi y répondre", () => {
    // MIN-282 : le corps dit ce qui a été décidé, les fils disent ce qui est
    // contesté. Un agent qui réécrit sans les avoir lus tranche un débat que
    // personne ne lui a demandé de trancher — encore faut-il qu'il sache que
    // c'est là, et que répondre est un geste qu'il a.
    expect(tool("minddy_get_page").description).toMatch(/open_threads/i);
    expect(tool("minddy_get_page").description).toContain(
      "minddy_add_page_comment"
    );
    for (const required of ["project_id", "page_id", "body"]) {
      expect(param("minddy_add_page_comment", required).required).toBe(true);
    }
    for (const optional of ["block_id", "parent_comment_id"]) {
      expect(param("minddy_add_page_comment", optional).required).toBe(false);
    }
    // L'ancre se REPREND, elle ne s'invente pas : les ids de blocs ne sont pas
    // dans le markdown, et une ancre inventée fait un fil détaché aussitôt né.
    expect(param("minddy_add_page_comment", "block_id").description).toContain(
      "open_threads"
    );
    expect(tool("minddy_add_page_comment").description).toMatch(
      /never invent a block_id/i
    );
    expect(MCP_SERVER_INSTRUCTIONS).toContain("minddy_add_page_comment");
  });

  it("met dans `required` ce qu'un petit modèle ne répondrait pas sinon", () => {
    // Un champ hors `required` d'un appel d'outil forcé n'est tout simplement
    // pas rempli : le titre et le corps d'une page créée en font partie.
    for (const required of ["project_id", "title", "markdown"]) {
      expect(param("minddy_create_page", required).required).toBe(true);
    }
    expect(param("minddy_create_page", "parent_page_id").required).toBe(false);
    expect(param("minddy_create_page", "icon").required).toBe(false);

    for (const required of ["project_id", "page_id", "markdown"]) {
      expect(param("minddy_append_to_page", required).required).toBe(true);
    }
    for (const required of ["project_id", "page_id", "old_string", "new_string"]) {
      expect(param("minddy_edit_page_text", required).required).toBe(true);
    }
    expect(param("minddy_edit_page_text", "replace_all").required).toBe(false);
    // La chaîne vide SUPPRIME un passage — dit là où le modèle le lit.
    expect(param("minddy_edit_page_text", "new_string").description).toMatch(/empty/i);
    // Rien n'est requis au-delà de la cible sur l'écriture totale : on peut ne
    // changer que l'icône.
    for (const optional of ["markdown", "title", "icon", "version"]) {
      expect(param("minddy_update_page", optional).required).toBe(false);
    }
  });

  it("détourne minddy_update_page de la réécriture d'une page existante", () => {
    const description = tool("minddy_update_page").description ?? "";
    expect(description).toContain("minddy_append_to_page");
    expect(description).toContain("minddy_edit_page_text");
    // Le garde-fou d'écriture concurrente, nommé par son code d'erreur.
    expect(description).toContain("page_stale");
    expect(param("minddy_update_page", "version").description).toContain(
      "minddy_get_page"
    );
  });

  it("annonce du markdown, jamais du JSON ProseMirror", () => {
    for (const name of ["minddy_get_page", "minddy_create_page"]) {
      expect(tool(name).description).toMatch(/markdown/i);
    }
    expect(param("minddy_create_page", "markdown").description).toMatch(
      /Never send ProseMirror JSON/
    );
    // La syntaxe d'un lien de page : un agent ne peut pas la deviner.
    expect(param("minddy_create_page", "markdown").description).toContain(
      "[[page:"
    );
  });

  it("annonce les rétroliens là où on lit une page", () => {
    // MIN-279 : un agent qui ouvre une spec doit voir ce qui en dépend sans
    // avoir à le chercher — et il ne le cherchera que s'il sait que c'est là.
    expect(tool("minddy_get_page").description).toMatch(/backlink/i);
  });

  it("dit par où commencer, et le dit dans le mode d'emploi du serveur", () => {
    expect(tool("minddy_list_pages").description).toContain("minddy_get_page");
    expect(tool("minddy_get_page").description).toContain("minddy_edit_page_text");
    for (const name of [
      "minddy_list_pages",
      "minddy_get_page",
      "minddy_create_page",
      "minddy_update_page",
      "minddy_append_to_page",
      "minddy_edit_page_text",
    ]) {
      expect(MCP_SERVER_INSTRUCTIONS).toContain(name);
    }
  });
});

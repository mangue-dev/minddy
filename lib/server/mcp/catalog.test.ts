import { describe, expect, it } from "vitest";
import { FEEDBACK_POST_STATUSES } from "@/lib/feedback/types";
import { mcpToolCatalog } from "./catalog";
import { MCP_SERVER_INSTRUCTIONS } from "./instructions";

/**
 * The catalog is read from the REAL tools record (catalog.ts), and
 * this is what `/llms.txt` and the MCP server card are used for. What this test
 * keeps is therefore the ANNOUNCED contract of the surgical plan writings
 * (MIN-186): their names, their parameters, and the fact that they are named
 * where a model will look for them — in the server's instructions for use, and in the
 * description of the tool which, itself, replaces everything.
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
    // new_string accepts the empty string: this is how we DELETE a passage.
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
 * What the MCP audit of 2026-08-06 found desynchronized from the feedback, and which
 * must not re-desynchronize: the descriptions and instructions for use
 * are PROSE, which nothing connects to its constants. These three assertions
 * are that link — they fail the day a status is added without being said.
 */
describe("catalogue MCP — le feedback dit ce que l'app fait", () => {
  it("expose toutes les options de configuration du board", () => {
    for (const optional of [
      "enabled",
      "generate_sso_secret",
      "show_categories",
      "show_views",
      "visible_view_ids",
      "show_pages",
      "visible_page_ids",
      "allow_comments",
    ]) {
      expect(param("minddy_configure_feedback_board", optional).required).toBe(false);
    }
    expect(param("minddy_configure_feedback_board", "visible_view_ids").description).toMatch(
      /shared view ids/i
    );
    expect(param("minddy_configure_feedback_board", "visible_page_ids").description).toMatch(
      /published page ids/i
    );
  });

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
    // The thread carries two visibilities: the saying “internal, team-only” hid
    // to the agent public responses from visitors.
    expect(MCP_SERVER_INSTRUCTIONS).not.toContain("team-only comment thread");
    expect(tool("minddy_get_feedback").description).toContain("visibility");
  });
});

/**
 * An agent who writes a comment has NO measure of what a
 * comment here: measured on 2026-08-06 based, comments written
 * by the MCP were 2,555 characters in median compared to 177 for those written
 * by hand — fourteen times longer, with titles and sections, where the thread
 * carries sentences. The only place that could tell him said nothing about
 * everything (`body` was “Markdown.”). What must hold: the instruction of
 * brevity is in the description AND in the field, with a number — a
 * adjective alone does not limit anything.
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
 * MIN-184 — the attachment becomes a RESOURCE: a file OR a link. The
 * MCP tools are rediscovered on each connection, so the renaming is straightforward
 * and nothing persists the old name on the client side. What should hold, however, is that the EXPOSED capability says both halves — an agent that only reads “attach a file” will never attempt to attach a link, and the feature
 * will not exist for it.
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
    // None of the four content fields are required: it is the handler which
    // decides exclusivity, a diagram cannot say “one or the other”.
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
 * An agent fills out what they are ASKED to fill out, and "only title is
 * required" — what `minddy_create_issue` said — reads like permission to put only one title. The tickets arrived without priority,
 * without effort, without category, without relation: the schema was never the
 * problem, the instruction was.
 *
 * What must hold: the WAIT is written where a model reads it — the
 * description of the tool, the description of EACH field concerned, and the mode
 * of use of the server —, and filling no longer costs a round trip (categories
 * by name, relations posed in the creation call).
 */
describe("catalogue MCP — un ticket créé arrive rempli", () => {
  it("demande le remplissage dans minddy_create_issue, pas seulement l'autorise", () => {
    const description = tool("minddy_create_issue").description ?? "";
    expect(description).toContain("FILL THE TICKET");
    // What was missing in the real tickets, named one by one.
    for (const field of ["priority", "effort", "description", "categor", "relations"]) {
      expect(description, `le champ "${field}" n'est pas réclamé`).toContain(field);
    }
    // The assignment rule is a DECISION (MIN-201): the named person,
    // the owner on a solo project, no one otherwise. An agent who assigns
    // chance is worse than an unassigned ticket.
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
    // An invented name must not disappear silently: it returns to the agent.
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
    // They were already rendered by minddy_get_issue, and announced nowhere:
    // an agent who only reads the description does not know that the concept exists.
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
    // An objective without a ticket has a dead progress bar: the tool must
    // say where we connect them.
    expect(description).toContain("minddy_update_issues");
  });
});

/**
 * Objectives have long carried a comment thread and an
 * activity (20260728091000_objective_activity.sql, polymorphic tables), a
 * description and resources — and the MCP surface exposed none of them: neither
 * unit read, nor comment write. What should hold: both
 * halves exist, and reading precedes writing.
 */
describe("catalogue MCP — un objectif se lit et se commente", () => {
  it("expose minddy_get_objective en lecture, par objective_id", () => {
    expect(tool("minddy_get_objective").readOnly).toBe(true);
    for (const required of ["project_id", "objective_id"]) {
      expect(param("minddy_get_objective", required).required).toBe(true);
    }
    const description = tool("minddy_get_objective").description ?? "";
    // What the list did not cover, and which justifies a unitary reading.
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
    // Role sharing with the ticket comment, said explicitly.
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
 * MIN-273 — the six tools of PAGE. What this block guards is not their
 * existence (the catalog already says it) but their announced CONTRACT: what is
 * required, what is not, and above all the fact that each tool says where
 * send a model that is about to rewrite an entire document to change a
 * sentence. This is the only thing preventing `minddy_update_page` from becoming the
 * default path again, like `minddy_update_issues` had been for blueprints.
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
      // Commenting is WRITING, even if it does not affect the document:
      // it notifies people, and it displays under their page.
      "minddy_add_page_comment",
    ]) {
      expect(tool(write).readOnly).toBe(false);
    }
  });

  it("dit où lire une objection, et par quoi y répondre", () => {
    // MIN-282: the body says what has been decided, the son says what is
    // disputed. An agent who rewrites without having read them settles a debate that
    // no one asked him to decide — he still needs to know that
    // it's there, and responding is a gesture he has.
    expect(tool("minddy_get_page").description).toMatch(/threads/i);
    expect(tool("minddy_get_page").description).toContain(
      "minddy_add_page_comment"
    );
    for (const required of ["project_id", "page_id", "body"]) {
      expect(param("minddy_add_page_comment", required).required).toBe(true);
    }
    for (const optional of ["block_id", "parent_comment_id"]) {
      expect(param("minddy_add_page_comment", optional).required).toBe(false);
    }
    // The anchor RESUMES, it does not invent itself: the block ids are not
    // in the markdown, and an invented anchor makes a detached thread as soon as it is born.
    expect(param("minddy_add_page_comment", "block_id").description).toContain(
      "threads"
    );
    expect(tool("minddy_add_page_comment").description).toMatch(
      /never invent a block_id/i
    );
    expect(MCP_SERVER_INSTRUCTIONS).toContain("minddy_add_page_comment");
  });

  it("met dans `required` ce qu'un petit modèle ne répondrait pas sinon", () => {
    // A field outside `required` of a forced tool call is simply not
    // not filled: the title and body of a created page are part of it.
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
    // The empty string DELETES a passage — said where the model reads it.
    expect(param("minddy_edit_page_text", "new_string").description).toMatch(/empty/i);
    // Nothing is required beyond the target on total writing: we can only
    // change only the icon.
    for (const optional of ["markdown", "title", "icon", "version"]) {
      expect(param("minddy_update_page", optional).required).toBe(false);
    }
  });

  it("détourne minddy_update_page de la réécriture d'une page existante", () => {
    const description = tool("minddy_update_page").description ?? "";
    expect(description).toContain("minddy_append_to_page");
    expect(description).toContain("minddy_edit_page_text");
    // The concurrent write guardrail, named by its error code.
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
    // The syntax of a page link: an agent cannot guess it.
    expect(param("minddy_create_page", "markdown").description).toContain(
      "[[page:"
    );
  });

  it("annonce les rétroliens là où on lit une page", () => {
    // MIN-279: an agent who opens a spec must see what depends on it without
    // having to look for it — and he will only look for it if he knows it's there.
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

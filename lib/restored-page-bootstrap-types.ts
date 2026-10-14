import type { Page } from "./pages";
import type { PageSummary } from "./pages-api";
import type { Issue, MembersResponse, Objective } from "./types";

type Scope = { ownerId: string; projectId: string; complete: true };

/** Complete ordinary DTOs, authorized independently by the initial server request. */
export type RestoredPageBootstrapRecord = Scope & (
  | { kind: "issues"; data: Issue[] }
  | { kind: "members"; data: MembersResponse }
  | { kind: "objectives"; data: Objective[] }
  | { kind: "pages"; data: PageSummary[] }
  | { kind: "page"; pageId: string; data: Page }
);

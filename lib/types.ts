import type { IssueStatus, IssuePriority, IssueEffort } from "./issue-constants";
import type { ObjectiveStatus } from "./objective-constants";

export interface Objective {
  id: string;
  project_id: string;
  name: string;
  description: string | null;
  status: ObjectiveStatus;
  lead_user_id: string | null;
  target_date: string | null;
  color: string | null;
  created_at: string;
  updated_at: string;
}

export interface Comment {
  id: string;
  issue_id: string;
  author_id: string | null;
  /** Root comment of the thread when this is a reply (depth ≤ 1). */
  parent_id: string | null;
  body: string;
  created_at: string;
  updated_at: string;
}

export type NotificationType = "assigned" | "mention" | "comment";

/** A notification enriched for the Inbox UI. */
export interface MyNotification {
  id: string;
  type: NotificationType;
  read_at: string | null;
  created_at: string;
  issue_id: string | null;
  issue_number: number | null;
  issue_title: string | null;
  project_id: string | null;
  project_key: string | null;
  actor_name: string | null;
}

export interface IssueEvent {
  id: string;
  issue_id: string;
  actor_id: string | null;
  type: string;
  field: string | null;
  from_value: string | null;
  to_value: string | null;
  created_at: string;
}

export interface CreateObjectiveInput {
  name: string;
  description?: string | null;
  status?: ObjectiveStatus;
  lead_user_id?: string | null;
  target_date?: string | null;
  color?: string | null;
}

export interface ObjectiveUpdateInput {
  name?: string;
  description?: string | null;
  status?: ObjectiveStatus;
  lead_user_id?: string | null;
  target_date?: string | null;
  color?: string | null;
}

export interface Project {
  id: string;
  owner_id: string;
  name: string;
  key: string;
  color: string | null;
  created_at: string;
  updated_at: string;
  deleted_at: string | null;
}

export interface CreateProjectInput {
  name: string;
  key: string;
  color?: string | null;
}

export interface ProjectUpdateInput {
  name?: string;
  key?: string;
  color?: string | null;
}

export interface Member {
  user_id: string;
  email: string | null;
  full_name: string | null;
  avatar_url: string | null;
  role: "owner" | "member";
  is_owner: boolean;
}

export interface Invitation {
  id: string;
  project_id: string;
  invited_email: string;
  invited_user_id: string | null;
  status: string;
  created_at: string;
}

export interface MembersResponse {
  members: Member[];
  invitations: Invitation[];
  isOwner: boolean;
}

/** A pending invitation as shown to the invitee on their Home banner. */
export interface MyInvitation {
  id: string;
  project_id: string;
  project_name: string;
  project_key: string;
  inviter_email: string | null;
  inviter_name: string | null;
  created_at: string;
}

export interface Category {
  id: string;
  project_id: string;
  name: string;
  color: string;
  created_at: string;
}

export interface CreateCategoryInput {
  name: string;
  color: string;
}

export interface CategoryUpdateInput {
  name?: string;
  color?: string;
}

export interface Issue {
  id: string;
  project_id: string;
  number: number;
  title: string;
  description: string | null;
  status: IssueStatus;
  priority: IssuePriority;
  effort: IssueEffort | null;
  assignee_id: string | null;
  objective_id: string | null;
  parent_id: string | null;
  duplicate_of_id: string | null;
  due_date: string | null;
  position: number;
  created_by: string | null;
  created_at: string;
  updated_at: string;
  completed_at: string | null;
  category_ids: string[];
}

export interface CreateIssueInput {
  title: string;
  description?: string | null;
  status?: IssueStatus;
  priority?: IssuePriority;
  effort?: IssueEffort | null;
  assignee_id?: string | null;
  objective_id?: string | null;
  parent_id?: string | null;
  due_date?: string | null;
  category_ids?: string[];
}

export interface IssueUpdateInput {
  title?: string;
  description?: string | null;
  status?: IssueStatus;
  priority?: IssuePriority;
  effort?: IssueEffort | null;
  assignee_id?: string | null;
  objective_id?: string | null;
  parent_id?: string | null;
  duplicate_of_id?: string | null;
  due_date?: string | null;
  position?: number;
}

export type Onglet = "my" | "all";
export type ViewSort = "manual" | "priority" | "created" | "updated" | "due";

export interface ViewFilters {
  status?: IssueStatus[];
  priority?: IssuePriority[];
  assignee?: (string | null)[]; // null = unassigned
  effort?: IssueEffort[];
  category?: string[];
  objective?: (string | null)[]; // null = no objective
}

export interface ViewDisplay {
  hideDone?: boolean;
}

/** The filter/sort/display triple a view applies (also the live "working" state). */
export interface ViewConfig {
  filters: ViewFilters;
  sort: ViewSort;
  display: ViewDisplay;
}

export interface View {
  id: string;
  project_id: string;
  onglet: Onglet;
  user_id: string | null; // NULL = shared
  name: string;
  filters: ViewFilters;
  sort: ViewSort;
  display: ViewDisplay;
  position: number;
  created_at: string;
  updated_at: string;
}

export interface CreateViewInput {
  onglet: Onglet;
  name: string;
  filters: ViewFilters;
  sort: ViewSort;
  display: ViewDisplay;
}

export interface ViewUpdateInput {
  name?: string;
  filters?: ViewFilters;
  sort?: ViewSort;
  display?: ViewDisplay;
}

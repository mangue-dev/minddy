import type { IssueStatus, IssuePriority, IssueEffort } from "./issue-constants";

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
  due_date: string | null;
  position: number;
  created_by: string | null;
  created_at: string;
  updated_at: string;
  completed_at: string | null;
}

export interface CreateIssueInput {
  title: string;
  description?: string | null;
  status?: IssueStatus;
  priority?: IssuePriority;
  effort?: IssueEffort | null;
  assignee_id?: string | null;
  due_date?: string | null;
}

export interface IssueUpdateInput {
  title?: string;
  description?: string | null;
  status?: IssueStatus;
  priority?: IssuePriority;
  effort?: IssueEffort | null;
  assignee_id?: string | null;
  due_date?: string | null;
  position?: number;
}

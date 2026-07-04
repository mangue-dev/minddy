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

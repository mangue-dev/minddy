BEGIN;
CREATE EXTENSION IF NOT EXISTS pgtap WITH SCHEMA extensions;
SELECT plan(7);

SELECT hasnt_trigger(
  'public', 'project_members', 'project_members_lock_project_scope',
  'Upgrades remove the legacy project-row membership mutex'
);
SELECT has_trigger(
  'public', 'project_members', 'project_members_authority_rekey',
  'Membership changes retain the current authority and Realtime trigger'
);

SELECT has_function(
  'public', 'lock_live_project_actor_access', ARRAY['uuid', 'uuid'],
  'Upgrades install the live project authority helper'
);
SELECT has_trigger(
  'public', 'project_members', 'project_members_auth_insert_lock',
  'Membership inserts lock their Auth parents before foreign-key checks'
);
SELECT has_trigger(
  'public', 'project_members', 'project_members_authority_lock',
  'Membership changes retain the project authority lock'
);
SELECT has_trigger(
  'public', 'project_git_links', 'project_git_links_parent_insert_lock',
  'Repository link inserts preserve parent lock ordering'
);
SELECT has_trigger(
  'public', 'project_git_links', 'project_git_links_authority_lock',
  'Repository link changes retain the project authority lock'
);

SELECT * FROM finish();
ROLLBACK;

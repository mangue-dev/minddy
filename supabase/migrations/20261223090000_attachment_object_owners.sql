-- minddy — MIN-343 : qui a téléversé l'objet ?
--
-- L'enregistrement d'une ressource ne contrôlait que le PRÉFIXE du chemin
-- (`projects/{id}/`) : il dit dans quel projet le fichier vit, jamais à qui il
-- appartient. Un membre pouvait donc enregistrer une ressource pointant sur le
-- fichier d'un collègue, puis supprimer SA ligne — la suppression filtre bien
-- sur `created_by` — et emporter l'objet d'un autre.
--
-- Le téléverseur, le storage le connaît : un envoi direct depuis le navigateur
-- porte le JWT de son auteur, et `storage.objects.owner_id` le garde. Mais le
-- schéma `storage` n'est pas exposé par PostgREST, donc `lib/server/attachments.ts`
-- ne peut pas le lire. D'où cette fonction : la seule chose qu'elle rend, c'est
-- un couple (chemin, téléverseur) sur le bucket `attachments`, et EXECUTE n'est
-- donné qu'au rôle de service (le seul appelant, côté serveur).
--
-- Idempotent — safe to re-run.

create or replace function public.attachment_object_owners(paths text[])
returns table (name text, owner_id text)
language sql
security definer
set search_path = ''
stable
as $$
  select o.name, o.owner_id
  from storage.objects o
  where o.bucket_id = 'attachments'
    and o.name = any(paths)
$$;

-- Personne d'autre que le serveur : la fonction contourne les policies du
-- schéma storage par construction, et l'ouvrir à `authenticated` donnerait à
-- n'importe quel client la liste des téléverseurs de tout le bucket.
revoke all on function public.attachment_object_owners(text[])
  from public, anon, authenticated;
grant execute on function public.attachment_object_owners(text[]) to service_role;

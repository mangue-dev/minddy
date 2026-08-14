-- minddy — MIN-350 : le préfixe des fichiers de PAGE n'est plus écrivable par le
-- client.
--
-- L'invariant, posé par MIN-280 : **aucun objet de page n'est écrit directement
-- par le navigateur.** Un fichier de page naît dans le même appel que sa ligne
-- `page_files`, côté serveur, en clé service
-- (app/api/projects/[id]/pages/[pageId]/files/route.ts → lib/server/page-files.ts),
-- précisément parce qu'un objet sans sa ligne est invisible pour le balayage des
-- orphelins : personne ne sait plus à quelle page il appartenait, donc personne
-- ne l'efface jamais.
--
-- Sauf que la policy, elle, ne disait rien de tel. `attachments insert` ouvre
-- `projects/{id}/…` à tout membre du projet, et `projects/{id}/pages/…` est DANS
-- ce préfixe (cf. `pageFileStoragePrefix`, lib/page-files.ts). Le navigateur
-- pouvait donc y déposer ce qu'il voulait, sous le nom d'une page existante :
-- des octets que le quota compte sans que rien ne les référence, dans un dossier
-- que l'app croit tenir seule.
--
-- La correction est une branche de plus dans le `case`, et rien d'autre : le
-- troisième segment `pages` est refusé. La clé service, elle, ne passe pas par
-- les policies — les vrais fichiers de page continuent d'être écrits.
--
-- Ce que ça ne casse pas : les ressources de ticket, dont le chemin est
-- `projects/{id}/{uuid}/{nom}` (lib/use-attachment-uploads.ts) — leur troisième
-- segment est un uuid, jamais le mot `pages`.
--
-- Idempotent — safe to re-run.

drop policy if exists "attachments insert" on storage.objects;
create policy "attachments insert" on storage.objects for insert to authenticated
  with check (
    bucket_id = 'attachments'
    and case (storage.foldername(name))[1]
      when 'projects' then
        case when (storage.foldername(name))[2]
               ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
               -- Le préfixe des PAGES est réservé au serveur (MIN-350).
               and coalesce((storage.foldername(name))[3], '') <> 'pages'
             then public.can_access_project(((storage.foldername(name))[2])::uuid)
                  and public.project_storage_quota_ok(((storage.foldername(name))[2])::uuid)
             else false
        end
      when 'chat' then
        case when (storage.foldername(name))[2] = (select auth.uid()::text)
             then public.storage_quota_ok((select auth.uid()))
             else false
        end
      else false
    end
  );

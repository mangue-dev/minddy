-- minddy — MIN-162 : pièces jointes des commentaires de pull request.
--
-- Un commentaire de PR part chez la forge. Une pièce jointe ne peut donc PAS
-- vivre dans `attachments` (bucket privé, servi par URL signée à durée de vie
-- courte) : le commentaire porte l'URL du fichier, et cette URL est lue par
-- GitHub, par ses notifications e-mail, et par des gens qui n'ont pas de compte
-- minddy. Il lui faut une adresse stable et publique.
--
-- Ni GitHub ni GitLab n'exposent d'API d'upload d'attachement de commentaire
-- (le glisser-déposer de github.com passe par un endpoint interne, non
-- documenté et non ouvert aux Apps) : héberger nous-mêmes est le seul chemin
-- qui marche des deux côtés.
--
-- Le bucket est PUBLIC en lecture — c'est le point — mais **aucune policy
-- d'écriture** : comme `project-icons`, tout passe par la route serveur
-- (`/api/pull-requests/[prId]/attachments`), qui vérifie l'accès à la PR avant
-- d'écrire en clé de service. Un client ne peut donc pas s'en servir comme
-- hébergeur de fichiers : sans droit sur une PR, pas d'upload.
--
-- Le chemin est `{pr_id}/{uuid}/{fichier}` : l'uuid rend l'URL non devinable,
-- et le préfixe par PR rend le ménage possible (une PR supprimée, ses fichiers
-- avec). Aucune policy de listing : comme pour `project-icons`, la lecture d'un
-- objet public passe par /object/public/… sans consulter les policies, et une
-- policy `select` n'ouvrirait que l'ÉNUMÉRATION du bucket.
--
-- Idempotent — safe to re-run.

insert into storage.buckets (id, name, public, file_size_limit)
values ('forge-attachments', 'forge-attachments', true, 20 * 1024 * 1024)
on conflict (id) do update set
  public = true,
  file_size_limit = 20 * 1024 * 1024;

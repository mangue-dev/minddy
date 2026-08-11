-- minddy — MIN-283 : publier une page ne la rend PAS trouvable sur Google.
--
-- `allow_indexing` était une case à cocher, décochée par défaut. C'en était une
-- de trop : le lien EST le secret, exactement comme pour une vue partagée et un
-- board de retours, et une page publiée est le plus souvent une spec client ou
-- un compte rendu. Laisser l'option, c'est laisser quelqu'un la cocher une fois
-- « pour voir » sur une page qui, six mois plus tard, ne devrait plus sortir
-- nulle part — et un retrait d'index, ça ne se défait pas d'un décochage.
--
-- La colonne part donc, plutôt que de rester à `false` en attendant qu'on se
-- redemande à quoi elle sert. Le `noindex` est désormais inconditionnel : dans
-- les métadonnées de la route, dans l'en-tête posé par le proxy, et dans le
-- robots.txt.
-- Idempotent.

alter table public.view_shares drop column if exists allow_indexing;

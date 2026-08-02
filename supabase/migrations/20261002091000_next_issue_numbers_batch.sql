-- minddy — réserve N numéros de ticket en UN aller-retour.
--
-- `next_issue_number` incrémente d'une unité et rend le compteur : parfait pour
-- une création à l'unité, ruineux pour un import. Un fichier de 1 000 tickets
-- faisait 1 000 appels RPC (par paquets de 25 en parallèle, soit 40 vagues
-- successives) juste pour obtenir des numéros — de loin le poste le plus cher
-- de l'import, et celui qui grandit linéairement avec le fichier.
--
-- La version par lot fait le même `update ... returning` en avançant le
-- compteur de p_count d'un coup, et rend le PREMIER numéro de la plage : les
-- suivants se déduisent côté appelant. Même atomicité (une seule instruction
-- UPDATE), donc deux imports simultanés ne peuvent pas se chevaucher.
--
-- `next_issue_number` reste : tout le reste de l'app crée les tickets un par un.

create or replace function public.next_issue_numbers(
  p_project_id uuid,
  p_count integer
)
returns integer language sql security definer set search_path = public as $$
  update public.projects
     set issue_seq = issue_seq + greatest(p_count, 0)
   where id = p_project_id
  returning issue_seq - greatest(p_count, 0) + 1;
$$;

revoke all on function public.next_issue_numbers(uuid, integer)
  from public, anon, authenticated;
grant execute on function public.next_issue_numbers(uuid, integer) to service_role;

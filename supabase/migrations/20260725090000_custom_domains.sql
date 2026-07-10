-- minddy — MIN-36 « Domaine personnalisé pour vues partagées et boards de feedback »
-- Un hostname client (sous-domaine, CNAME → cname.vercel-dns.com) sert un board
-- de feedback OU une vue partagée à la racine. La table stocke les ids cibles
-- (jamais les tokens) : la rotation d'un token ne casse pas le domaine, le
-- middleware joint le token au lookup. `status` reflète la vérification Vercel
-- (info UI — le routage réécrit dès qu'une ligne existe) ; `verification` garde
-- les challenges TXT renvoyés par Vercel quand le domaine est revendiqué par un
-- autre compte. RLS deny-all : tout passe par le service client avec checks
-- manuels (lib/server/custom-domains.ts).
-- Idempotent — safe to re-run.

create table if not exists public.custom_domains (
  id           uuid primary key default gen_random_uuid(),
  domain       text not null,
  board_id     uuid references public.feedback_boards(id) on delete cascade,
  share_id     uuid references public.view_shares(id) on delete cascade,
  status       text not null default 'pending' check (status in ('pending', 'verified')),
  verification jsonb,
  created_by   uuid references auth.users(id) on delete set null,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now(),
  constraint custom_domains_one_target check (
    ((board_id is not null)::int + (share_id is not null)::int) = 1
  )
);

-- Un domaine ne pointe que sur une seule cible, une cible n'a qu'un domaine.
create unique index if not exists custom_domains_domain_key on public.custom_domains (lower(domain));
create unique index if not exists custom_domains_board_key on public.custom_domains (board_id) where board_id is not null;
create unique index if not exists custom_domains_share_key on public.custom_domains (share_id) where share_id is not null;

alter table public.custom_domains enable row level security;
-- Deny-all: no policies. Service-role only.

drop trigger if exists custom_domains_set_updated_at on public.custom_domains;
create trigger custom_domains_set_updated_at
  before update on public.custom_domains
  for each row execute function public.set_updated_at();

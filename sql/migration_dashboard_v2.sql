-- ============================================================================
-- MIGRATION : Dashboard admin v2 (invitations + programmation + annonces)
-- À exécuter dans Supabase > SQL Editor, APRÈS schema.sql,
-- migration_email_auth.sql et migration_admin_google.sql.
-- ============================================================================

-- ----------------------------------------------------------------------------
-- 1. Kills totaux par joueur (le score d'un match = son nombre de kills)
-- ----------------------------------------------------------------------------
alter table public.profiles
  add column if not exists total_kills integer not null default 0;

-- Recalcul des stats : ajoute le cumul des kills (score1/score2) en plus
-- des points, dégâts, victoires/défaites déjà gérés.
create or replace function public.recompute_player_stats(p_player_id uuid)
returns void
language plpgsql
security definer set search_path = public
as $$
declare
  v_points integer := 0;
  v_damage integer := 0;
  v_kills  integer := 0;
  v_wins   integer := 0;
  v_losses integer := 0;
begin
  select
    coalesce(sum(case when m.player1_id = p_player_id then m.damage1
                       when m.player2_id = p_player_id then m.damage2 else 0 end), 0),
    coalesce(sum(case when m.player1_id = p_player_id then m.score1
                       when m.player2_id = p_player_id then m.score2 else 0 end), 0),
    coalesce(sum(case when m.winner_id = p_player_id then 1 else 0 end), 0),
    coalesce(sum(case when m.status = 'completed' and m.winner_id is not null
                        and m.winner_id <> p_player_id
                        and (m.player1_id = p_player_id or m.player2_id = p_player_id)
                       then 1 else 0 end), 0)
  into v_damage, v_kills, v_wins, v_losses
  from public.matches m
  where m.status = 'completed'
    and (m.player1_id = p_player_id or m.player2_id = p_player_id);

  v_points := v_wins * 3;

  update public.profiles
    set total_points = v_points,
        total_damage = v_damage,
        total_kills  = v_kills,
        wins = v_wins,
        losses = v_losses
    where id = p_player_id;
end;
$$;

-- Le trigger existant (trg_after_poule_match_completed) n'agissait que sur
-- les matchs de poule ; on l'étend à toutes les phases pour que le
-- classement général réagisse aussi aux résultats des phases finales.
create or replace function public.trg_recompute_stats_after_match()
returns trigger
language plpgsql
security definer set search_path = public
as $$
begin
  if new.status = 'completed' then
    perform public.recompute_player_stats(new.player1_id);
    perform public.recompute_player_stats(new.player2_id);
  end if;
  return new;
end;
$$;

-- ----------------------------------------------------------------------------
-- 2. Classement général — alimente directement la page Classement.
--    Trié par kills puis dégâts (demande explicite : afficher les joueurs
--    selon leur nombre de kills et dégâts).
-- ----------------------------------------------------------------------------
create or replace view public.leaderboard as
select
  p.id as player_id,
  p.pseudo,
  p.avatar_url,
  g.name as group_name,
  p.total_kills,
  p.total_damage,
  p.total_points,
  p.wins,
  p.losses,
  p.is_qualified,
  p.qualification_seed,
  rank() over (order by p.total_kills desc, p.total_damage desc) as overall_rank
from public.profiles p
left join public.groups g on g.id = p.group_id
where p.status = 'approved'
order by overall_rank;

comment on view public.leaderboard is 'Classement général tous groupes confondus, trié par kills puis dégâts. Se recalcule automatiquement dès qu''un admin valide le score final d''un match.';

grant select on public.leaderboard to anon, authenticated;

-- ----------------------------------------------------------------------------
-- 3. Liste des inscriptions en attente, AVEC email (section "Accepter les
--    invitations du joueur"). L'email vit dans auth.users, inaccessible
--    directement via la clé anonyme : on passe par une fonction sécurisée,
--    réservée aux admins.
-- ----------------------------------------------------------------------------
create or replace function public.admin_list_pending_players()
returns table (
  id uuid,
  pseudo text,
  ff_uid text,
  email text,
  group_id uuid,
  group_name text,
  created_at timestamptz
)
language sql
security definer set search_path = public
as $$
  select
    p.id, p.pseudo, p.ff_uid, u.email, p.group_id, g.name as group_name, p.created_at
  from public.profiles p
  join auth.users u on u.id = p.id
  left join public.groups g on g.id = p.group_id
  where p.status = 'pending'
    and public.is_admin()
  order by p.created_at asc;
$$;

comment on function public.admin_list_pending_players is 'Réservée aux admins (vérifie is_admin() en interne) : liste les inscriptions en attente avec leur email, pour la section "Accepter les invitations du joueur".';

-- ----------------------------------------------------------------------------
-- 4. Annonces — section "Ajouter une information" du dashboard admin,
--    affichées automatiquement sur la page d'accueil.
-- ----------------------------------------------------------------------------
create table if not exists public.announcements (
  id          uuid primary key default gen_random_uuid(),
  title       text,
  body        text not null,
  published   boolean not null default true,
  author_id   uuid references public.profiles(id) on delete set null,
  created_at  timestamptz not null default now()
);

comment on table public.announcements is 'Informations publiées par un admin, affichées automatiquement sur la page d''accueil.';

alter table public.announcements enable row level security;

create policy "announcements_select_public"
  on public.announcements for select
  using (published = true or public.is_admin());

create policy "announcements_admin_write"
  on public.announcements for insert
  with check (public.is_admin());

create policy "announcements_admin_update"
  on public.announcements for update
  using (public.is_admin());

create policy "announcements_admin_delete"
  on public.announcements for delete
  using (public.is_admin());

alter publication supabase_realtime add table public.announcements;

-- ----------------------------------------------------------------------------
-- 5. Passage automatique "Programmé" → "Live" à l'heure programmée,
--    même si personne n'a le site ouvert (pg_cron, exécution serveur).
-- ----------------------------------------------------------------------------
-- ⚠️ Étape manuelle requise UNE SEULE FOIS avant d'exécuter la suite :
-- Supabase Dashboard > Database > Extensions > activer "pg_cron".
-- (Cette étape ne peut pas être faite depuis le SQL Editor sur certains plans.)
create extension if not exists pg_cron with schema extensions;

create or replace function public.activate_scheduled_matches()
returns void
language sql
security definer set search_path = public
as $$
  update public.matches
    set status = 'live'
    where status = 'scheduled'
      and scheduled_at is not null
      and scheduled_at <= now();
$$;

comment on function public.activate_scheduled_matches is 'Appelée chaque minute par pg_cron : passe en Live tout match programmé dont l''heure est arrivée.';

-- Supprime une éventuelle ancienne programmation avant d'en recréer une
select cron.unschedule(jobid) from cron.job where jobname = 'activate-scheduled-matches';

select cron.schedule(
  'activate-scheduled-matches',
  '* * * * *', -- toutes les minutes
  $$select public.activate_scheduled_matches();$$
);

-- ============================================================================
-- FIN DE LA MIGRATION
-- ============================================================================

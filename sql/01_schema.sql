-- ============================================================================
-- LA BATAILLE DES CHAROS — SCHEMA SUPABASE (PostgreSQL)
-- Guilde MÉCHANTCHARO — Tournoi Esport Free Fire 1v1
-- Généré à partir du Cahier des Charges Technique et Fonctionnel
-- ============================================================================
-- À exécuter dans Supabase > SQL Editor, dans l'ordre du fichier.
-- ============================================================================

-- ----------------------------------------------------------------------------
-- 0. EXTENSIONS
-- ----------------------------------------------------------------------------
create extension if not exists "pgcrypto";

-- ----------------------------------------------------------------------------
-- 1. TYPES ÉNUMÉRÉS
-- ----------------------------------------------------------------------------
create type public.user_role       as enum ('admin', 'player');
create type public.player_status   as enum ('pending', 'approved', 'rejected');
create type public.match_type      as enum ('onetap', 'spam');           -- Aller = onetap (headshot only) / Retour = spam (bodyshot)
create type public.match_leg       as enum ('aller', 'retour');
create type public.match_phase     as enum ('poule', 'huitieme', 'quart', 'demie', 'finale');
create type public.match_status    as enum ('scheduled', 'in_progress', 'completed');

-- ----------------------------------------------------------------------------
-- 2. TABLE: groups — Les 10 poules (A à J)
-- ----------------------------------------------------------------------------
create table public.groups (
  id          uuid primary key default gen_random_uuid(),
  name        text not null unique check (name ~ '^[A-J]$'),  -- une seule lettre A-J
  created_at  timestamptz not null default now()
);

comment on table public.groups is 'Les 10 groupes de qualification (A à J), 4 joueurs chacun.';

-- ----------------------------------------------------------------------------
-- 3. TABLE: profiles — Authentification, joueurs & stats
-- ----------------------------------------------------------------------------
create table public.profiles (
  id            uuid primary key references auth.users(id) on delete cascade,
  pseudo        text not null unique,
  ff_uid        text not null,                       -- ID Free Fire du joueur
  avatar_url    text,
  role          public.user_role not null default 'player',
  status        public.player_status not null default 'pending',
  group_id      uuid references public.groups(id) on delete set null,

  -- Stats calculées / agrégées (mises à jour par triggers)
  total_points  integer not null default 0,
  total_damage  integer not null default 0,
  wins          integer not null default 0,
  losses        integer not null default 0,

  -- Statut compétitif
  is_qualified       boolean not null default false,  -- qualifié pour le Top 16
  qualification_seed integer,                          -- position dans le Top 16 (1-16), calculée

  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);

comment on table public.profiles is 'Profils joueurs/admin. Un profil = un compte Supabase Auth (auth.users), créé par email ou fournisseur OAuth.';

create index idx_profiles_group_id on public.profiles(group_id);
create index idx_profiles_role     on public.profiles(role);
create index idx_profiles_status   on public.profiles(status);

-- ----------------------------------------------------------------------------
-- 4. TABLE: matches — Poules ET phases finales (bracket)
-- ----------------------------------------------------------------------------
create table public.matches (
  id            uuid primary key default gen_random_uuid(),

  -- Contexte
  phase         public.match_phase  not null,
  group_id      uuid references public.groups(id) on delete set null,  -- rempli seulement en phase 'poule'
  leg           public.match_leg,                                       -- rempli seulement pour les phases finales (Aller/Retour)
  match_type    public.match_type  not null,                            -- onetap (Aller) / spam (Retour)

  -- Joueurs
  player1_id    uuid references public.profiles(id) on delete set null,
  player2_id    uuid references public.profiles(id) on delete set null,

  -- Scores (kills / manches gagnées selon règle interne du tournoi)
  score1        integer not null default 0,
  score2        integer not null default 0,
  damage1       integer not null default 0,
  damage2       integer not null default 0,

  winner_id     uuid references public.profiles(id) on delete set null,

  -- Statut & programmation
  status        public.match_status not null default 'scheduled',
  scheduled_at  timestamptz,
  is_featured   boolean not null default false,   -- mis en avant sur le Dashboard "Matchs du jour"

  -- Bracket : propagation automatique du vainqueur
  next_match_id     uuid references public.matches(id) on delete set null,
  next_match_slot   smallint check (next_match_slot in (1, 2)),  -- indique si le vainqueur va en player1 ou player2 du match suivant

  round_label   text,   -- ex: "Huitième de finale 3", libellé lisible pour l'UI / bracket

  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),

  constraint chk_players_different check (player1_id is distinct from player2_id)
);

comment on table public.matches is 'Tous les affrontements : 60 matchs de poules (10 groupes x 6) + phases finales (huitièmes à finale, aller/retour).';

create index idx_matches_group_id      on public.matches(group_id);
create index idx_matches_phase         on public.matches(phase);
create index idx_matches_status        on public.matches(status);
create index idx_matches_is_featured   on public.matches(is_featured);
create index idx_matches_next_match_id on public.matches(next_match_id);
create index idx_matches_scheduled_at  on public.matches(scheduled_at);

-- ============================================================================
-- 5. FONCTIONS UTILITAIRES & TRIGGERS
-- ============================================================================

-- updated_at automatique -------------------------------------------------
create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create trigger trg_profiles_updated_at
  before update on public.profiles
  for each row execute function public.set_updated_at();

create trigger trg_matches_updated_at
  before update on public.matches
  for each row execute function public.set_updated_at();

-- Comptes admin automatiques ----------------------------------------------
-- Ces 2 adresses deviennent role='admin' + status='approved' dès leur
-- première connexion Google (eadande2@gmail.com, mechantcharoguilde@gmail.com).
-- Un compte admin reste aussi un joueur normal (même ligne `profiles`) :
-- il peut renseigner un pseudo, rejoindre un groupe et apparaître au
-- classement comme n'importe quel autre participant.
create or replace function public.is_configured_admin_email(p_email text)
returns boolean
language sql
immutable
as $$
  select lower(p_email) = any (array[
    'eadande2@gmail.com',
    'mechantcharoguilde@gmail.com'
  ]);
$$;

-- Création automatique du profil à l'inscription (Supabase Auth : Google ou email) ---------
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer set search_path = public
as $$
declare
  v_pseudo text;
  v_role   public.user_role;
  v_status public.player_status;
begin
  v_pseudo := coalesce(
    nullif(new.raw_user_meta_data->>'full_name', ''),
    nullif(new.raw_user_meta_data->>'name', ''),
    'joueur_' || replace(substr(new.id::text, 1, 8), '-', '')
  );

  if public.is_configured_admin_email(new.email) then
    v_role   := 'admin';
    v_status := 'approved';
  else
    v_role   := 'player';
    v_status := 'pending';
  end if;

  insert into public.profiles (id, pseudo, ff_uid, avatar_url, role, status)
  values (
    new.id,
    v_pseudo,
    '',
    coalesce(new.raw_user_meta_data->>'avatar_url', new.raw_user_meta_data->>'picture'),
    v_role,
    v_status
  )
  on conflict (id) do nothing;
  return new;
end;
$$;

create trigger trg_on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- Détermination du vainqueur + mise à jour du statut ---------------------
create or replace function public.set_match_winner()
returns trigger
language plpgsql
as $$
begin
  if new.status = 'completed' then
    if new.score1 > new.score2 then
      new.winner_id := new.player1_id;
    elsif new.score2 > new.score1 then
      new.winner_id := new.player2_id;
    end if;
  end if;
  return new;
end;
$$;

create trigger trg_set_match_winner
  before insert or update on public.matches
  for each row execute function public.set_match_winner();

-- Propagation automatique du vainqueur vers le match suivant (bracket) --
create or replace function public.propagate_bracket_winner()
returns trigger
language plpgsql
security definer set search_path = public
as $$
begin
  if new.status = 'completed'
     and new.winner_id is not null
     and new.next_match_id is not null
     and (old.winner_id is distinct from new.winner_id or old.status is distinct from new.status) then

    if new.next_match_slot = 1 then
      update public.matches
        set player1_id = new.winner_id
        where id = new.next_match_id;
    elsif new.next_match_slot = 2 then
      update public.matches
        set player2_id = new.winner_id
        where id = new.next_match_id;
    end if;
  end if;
  return new;
end;
$$;

create trigger trg_propagate_bracket_winner
  after update on public.matches
  for each row execute function public.propagate_bracket_winner();

-- Recalcul des stats agrégées d'un joueur (points/dégâts/W-L) -----------
-- Barème : victoire = 3 points, défaite = 0 point (ajustable selon règlement interne)
create or replace function public.recompute_player_stats(p_player_id uuid)
returns void
language plpgsql
security definer set search_path = public
as $$
declare
  v_points integer := 0;
  v_damage integer := 0;
  v_wins   integer := 0;
  v_losses integer := 0;
begin
  select
    coalesce(sum(case when m.player1_id = p_player_id then m.damage1
                       when m.player2_id = p_player_id then m.damage2 else 0 end), 0),
    coalesce(sum(case when m.winner_id = p_player_id then 1 else 0 end), 0),
    coalesce(sum(case when m.status = 'completed' and m.winner_id is not null
                        and m.winner_id <> p_player_id
                        and (m.player1_id = p_player_id or m.player2_id = p_player_id)
                       then 1 else 0 end), 0)
  into v_damage, v_wins, v_losses
  from public.matches m
  where m.phase = 'poule'
    and m.status = 'completed'
    and (m.player1_id = p_player_id or m.player2_id = p_player_id);

  v_points := v_wins * 3;

  update public.profiles
    set total_points = v_points,
        total_damage = v_damage,
        wins = v_wins,
        losses = v_losses
    where id = p_player_id;
end;
$$;

-- Déclenche le recalcul des stats des 2 joueurs après un match de poule terminé
create or replace function public.trg_recompute_stats_after_match()
returns trigger
language plpgsql
security definer set search_path = public
as $$
begin
  if new.phase = 'poule' and new.status = 'completed' then
    perform public.recompute_player_stats(new.player1_id);
    perform public.recompute_player_stats(new.player2_id);
  end if;
  return new;
end;
$$;

create trigger trg_after_poule_match_completed
  after insert or update on public.matches
  for each row execute function public.trg_recompute_stats_after_match();

-- ============================================================================
-- 6. QUALIFICATION : Top 16 (1ers de groupe + 6 meilleurs 2èmes)
-- ============================================================================
-- Vue de classement par groupe (points desc, puis dégâts desc)
create or replace view public.group_standings as
select
  p.id as player_id,
  p.pseudo,
  p.group_id,
  g.name as group_name,
  p.total_points,
  p.total_damage,
  p.wins,
  p.losses,
  rank() over (
    partition by p.group_id
    order by p.total_points desc, p.total_damage desc
  ) as group_rank
from public.profiles p
join public.groups g on g.id = p.group_id
where p.status = 'approved';

comment on view public.group_standings is 'Classement de chaque groupe (1er, 2ème, 3ème, 4ème) trié par points puis dégâts.';

-- Fonction : calcule et marque les 16 qualifiés (10 x 1ers + 6 meilleurs 2èmes)
create or replace function public.compute_qualifications()
returns void
language plpgsql
security definer set search_path = public
as $$
begin
  -- reset
  update public.profiles set is_qualified = false, qualification_seed = null;

  -- 10 premiers de chaque groupe -> qualifiés d'office
  with firsts as (
    select player_id from public.group_standings where group_rank = 1
  )
  update public.profiles p
    set is_qualified = true
    from firsts f
    where p.id = f.player_id;

  -- 6 meilleurs deuxièmes (départage : points puis dégâts) -> repêchés
  with seconds as (
    select player_id
    from public.group_standings
    where group_rank = 2
    order by total_points desc, total_damage desc
    limit 6
  )
  update public.profiles p
    set is_qualified = true
    from seconds s
    where p.id = s.player_id;

  -- attribution d'un seed (tête de série) 1 à 16 pour le tirage du bracket
  with seeded as (
    select id, row_number() over (order by total_points desc, total_damage desc) as seed
    from public.profiles
    where is_qualified = true
  )
  update public.profiles p
    set qualification_seed = s.seed
    from seeded s
    where p.id = s.id;
end;
$$;

comment on function public.compute_qualifications is 'À exécuter par un admin une fois les 60 matchs de poules terminés : calcule le Top 16 (10 x 1ers + 6 meilleurs 2èmes).';

-- ============================================================================
-- 7. ROW LEVEL SECURITY (RLS)
-- ============================================================================
alter table public.profiles enable row level security;
alter table public.groups   enable row level security;
alter table public.matches  enable row level security;

-- Fonction utilitaire : l'utilisateur courant est-il admin ?
create or replace function public.is_admin()
returns boolean
language sql
security definer set search_path = public
stable
as $$
  select exists (
    select 1 from public.profiles
    where id = auth.uid() and role = 'admin'
  );
$$;

-- ---- PROFILES ----------------------------------------------------------
create policy "profiles_select_public"
  on public.profiles for select
  using (true);  -- classements/dashboard publics

create policy "profiles_update_own"
  on public.profiles for update
  using (auth.uid() = id)
  with check (
    auth.uid() = id
    -- un joueur ne peut pas s'auto-promouvoir admin ni s'auto-valider
    and role = (select role from public.profiles where id = auth.uid())
    and status = (select status from public.profiles where id = auth.uid())
  );

create policy "profiles_admin_all"
  on public.profiles for all
  using (public.is_admin())
  with check (public.is_admin());

-- ---- GROUPS --------------------------------------------------------------
create policy "groups_select_public"
  on public.groups for select
  using (true);

create policy "groups_admin_write"
  on public.groups for insert
  with check (public.is_admin());

create policy "groups_admin_update"
  on public.groups for update
  using (public.is_admin());

create policy "groups_admin_delete"
  on public.groups for delete
  using (public.is_admin());

-- ---- MATCHES ---------------------------------------------------------
create policy "matches_select_public"
  on public.matches for select
  using (true);  -- suivi en cours public

create policy "matches_admin_insert"
  on public.matches for insert
  with check (public.is_admin());

create policy "matches_admin_update"
  on public.matches for update
  using (public.is_admin())
  with check (public.is_admin());

create policy "matches_admin_delete"
  on public.matches for delete
  using (public.is_admin());

-- ============================================================================
-- 8. REALTIME
-- ============================================================================
-- Active la réplication realtime pour le suivi en cours des scores côté public
alter publication supabase_realtime add table public.matches;
alter publication supabase_realtime add table public.profiles;

-- ============================================================================
-- 9. SEED : les 10 groupes A à J
-- ============================================================================
insert into public.groups (name)
values ('A'), ('B'), ('C'), ('D'), ('E'), ('F'), ('G'), ('H'), ('I'), ('J')
on conflict (name) do nothing;

-- ============================================================================
-- 10. Comptes admin — voir is_configured_admin_email() plus haut dans ce
--     fichier : eadande2@gmail.com et mechantcharoguilde@gmail.com sont
--     promus automatiquement à leur première connexion Google, aucune
--     action manuelle n'est nécessaire.
-- ============================================================================

-- ============================================================================
-- FIN DU SCHEMA
-- ============================================================================

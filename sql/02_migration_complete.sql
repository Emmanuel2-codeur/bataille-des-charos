-- ============================================================================
-- LA BATAILLE DES CHAROS — MIGRATION CONSOLIDÉE
-- ============================================================================
-- Ce fichier regroupe les anciennes migrations en un seul fichier.
--
-- Fichiers supprimés/regroupés :
--   - migration_email_auth.sql
--   - migration_admin_google.sql
--   - migration_dashboard_v2.sql
--   - migration_social_notifications.sql
--   - migration_media_comments.sql
--   - migration_comments_mobile_fix.sql (règles déjà reprises dans media_comments)
--   - migration_match_status_in_progress.sql
--   - migration_admin_controls_32.sql
--   - migration_finales_16.sql (fonctionnalités reprises par le bracket final)
--   - migration_final_bracket_validation.sql (repris par le bracket final)
--   - PHASE_FINALE_16_A_EXECUTER.sql (doublon du bracket final)
--   - A_EXECUTER_BRACKET_FINAL.sql
--   - A2_EXECUTER_32EMES_ALLER_RETOUR.sql
--   - migration_super_admin_security.sql
--   - FIX_URGENT_new_has_no_field_role.sql
--
-- IMPORTANT :
-- PostgreSQL impose une validation/commit entre l'ajout d'une nouvelle valeur
-- d'enum et son utilisation. Dans Supabase, exécute donc :
--
--   ÉTAPE 1 : le bloc "ÉTAPE 1 — ENUMS" SEUL, puis Run.
--   ÉTAPE 2 : tout le reste du fichier, puis Run.
--
-- Pour une nouvelle base, utilise plutôt 01_schema.sql (qui doit idéalement
-- contenir directement les enums finaux).
-- ============================================================================

-- ============================================================================
-- ÉTAPE 1 — ENUMS (À EXÉCUTER SEULE)
-- ============================================================================
alter type public.match_phase add value if not exists 'trente_deuxieme' before 'seizieme';
alter type public.match_phase add value if not exists 'seizieme' before 'huitieme';
alter type public.user_role add value if not exists 'super_admin';

-- FIN ÉTAPE 1 : Run/valide cette requête avant de passer à l'ÉTAPE 2.
-- ============================================================================


-- ============================================================================
-- SOURCE REGROUPÉE : migration_email_auth.sql
-- ============================================================================
-- Migration pour passer l'authentification à Supabase Auth par email / Magic Link.
-- À exécuter uniquement si schema.sql a déjà été exécuté auparavant.

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer set search_path = public
as $$
begin
  insert into public.profiles (id, pseudo, ff_uid, avatar_url, role, status)
  values (
    new.id,
    'joueur_' || replace(substr(new.id::text, 1, 8), '-', ''),
    '',
    new.raw_user_meta_data->>'avatar_url',
    'player',
    'pending'
  )
  on conflict (id) do nothing;

  return new;
end;
$$;

-- Le joueur peut ensuite remplacer ce pseudo temporaire depuis /profil.


-- ============================================================================
-- SOURCE REGROUPÉE : migration_admin_google.sql
-- ============================================================================
-- ============================================================================
-- Migration : connexion Google + comptes admin automatiques
-- À exécuter dans Supabase > SQL Editor, APRÈS schema.sql (et après
-- migration_email_auth.sql si vous l'aviez déjà exécutée).
-- ============================================================================

-- ----------------------------------------------------------------------------
-- 1. Liste des emails admin (eadande2@gmail.com, mechantcharoguilde@gmail.com).
--    Ces comptes seront automatiquement role='admin' ET status='approved'
--    dès leur première connexion. Ils restent aussi des joueurs normaux :
--    même ligne dans `profiles`, ils peuvent renseigner un pseudo, rejoindre
--    un groupe et apparaître dans le classement comme n'importe quel joueur.
-- ----------------------------------------------------------------------------
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

-- ----------------------------------------------------------------------------
-- 2. handle_new_user() — récupère le nom/avatar Google si disponibles,
--    et élève automatiquement les 2 comptes admin ci-dessus.
-- ----------------------------------------------------------------------------
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

-- ----------------------------------------------------------------------------
-- 3. Rattrapage : si les 2 admins se sont déjà connectés AVANT cette
--    migration, cette requête les promeut immédiatement (sans attendre
--    une nouvelle connexion). Sans effet si leur profil n'existe pas encore.
-- ----------------------------------------------------------------------------
update public.profiles p
set role = 'admin', status = 'approved'
from auth.users u
where p.id = u.id
  and public.is_configured_admin_email(u.email);

-- ============================================================================
-- FIN
-- ============================================================================


-- ============================================================================
-- SOURCE REGROUPÉE : migration_dashboard_v2.sql
-- ============================================================================
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
-- 5. Passage automatique "Programmé" → "En cours" à l'heure programmée,
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
    set status = 'in_progress'
    where status = 'scheduled'
      and scheduled_at is not null
      and scheduled_at <= now();
$$;

comment on function public.activate_scheduled_matches is 'Appelée chaque minute par pg_cron : passe en En cours tout match programmé dont l''heure est arrivée.';

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


-- ============================================================================
-- SOURCE REGROUPÉE : migration_social_notifications.sql
-- ============================================================================
-- ============================================================================
-- MIGRATION : Notifications + annonces sociales + commentaires + réactions
-- LA BATAILLE DES CHAROS
-- À exécuter APRÈS migration_dashboard_v2.sql
-- ============================================================================

-- 1. Champs supplémentaires des annonces
alter table public.announcements
  add column if not exists category text not null default 'information',
  add column if not exists image_url text;

create index if not exists idx_announcements_published_created
  on public.announcements(published, created_at desc);

-- 2. Commentaires imbriqués (parent_id permet plusieurs niveaux)
create table if not exists public.comments (
  id             uuid primary key default gen_random_uuid(),
  announcement_id uuid not null references public.announcements(id) on delete cascade,
  user_id         uuid not null references public.profiles(id) on delete cascade,
  parent_id       uuid references public.comments(id) on delete cascade,
  content         text not null check (char_length(trim(content)) between 1 and 1000),
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);

create index if not exists idx_comments_announcement on public.comments(announcement_id, created_at);
create index if not exists idx_comments_parent on public.comments(parent_id);
create index if not exists idx_comments_user on public.comments(user_id);

-- 3. Réactions sur publications et commentaires
create table if not exists public.announcement_reactions (
  announcement_id uuid not null references public.announcements(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  reaction text not null default 'like' check (reaction in ('like','love','fire','wow')),
  created_at timestamptz not null default now(),
  primary key (announcement_id, user_id)
);

create table if not exists public.comment_reactions (
  comment_id uuid not null references public.comments(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  reaction text not null default 'like' check (reaction in ('like','love','fire','wow')),
  created_at timestamptz not null default now(),
  primary key (comment_id, user_id)
);

create index if not exists idx_announcement_reactions_announcement
  on public.announcement_reactions(announcement_id);
create index if not exists idx_comment_reactions_comment
  on public.comment_reactions(comment_id);

-- 4. Centre de notifications
create table if not exists public.notifications (
  id uuid primary key default gen_random_uuid(),
  recipient_id uuid not null references public.profiles(id) on delete cascade,
  actor_id uuid references public.profiles(id) on delete set null,
  type text not null,
  title text not null,
  body text not null,
  link text,
  entity_id uuid,
  read_at timestamptz,
  created_at timestamptz not null default now()
);

create index if not exists idx_notifications_recipient_created
  on public.notifications(recipient_id, created_at desc);
create index if not exists idx_notifications_unread
  on public.notifications(recipient_id) where read_at is null;

-- 5. Abonnements Web Push
create table if not exists public.push_subscriptions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  endpoint text not null unique,
  p256dh text not null,
  auth text not null,
  created_at timestamptz not null default now()
);

create index if not exists idx_push_subscriptions_user on public.push_subscriptions(user_id);

-- 6. updated_at des commentaires
drop trigger if exists trg_comments_updated_at on public.comments;
create trigger trg_comments_updated_at
  before update on public.comments
  for each row execute function public.set_updated_at();

-- 7. RLS
alter table public.comments enable row level security;
alter table public.announcement_reactions enable row level security;
alter table public.comment_reactions enable row level security;
alter table public.notifications enable row level security;
alter table public.push_subscriptions enable row level security;

drop policy if exists "comments_select_public" on public.comments;
create policy "comments_select_public"
  on public.comments for select
  using (
    exists (
      select 1 from public.announcements a
      where a.id = announcement_id
        and (a.published = true or public.is_admin())
    )
  );

drop policy if exists "comments_insert_members" on public.comments;
create policy "comments_insert_members"
  on public.comments for insert
  with check (
    auth.uid() = user_id
    and exists (
      select 1 from public.profiles p
      where p.id = auth.uid()
        and (p.role = 'admin' or p.status = 'approved')
    )
    and exists (
      select 1 from public.announcements a
      where a.id = announcement_id and a.published = true
    )
    and (
      parent_id is null
      or exists (
        select 1 from public.comments parent
        where parent.id = parent_id
          and parent.announcement_id = announcement_id
      )
    )
  );

drop policy if exists "comments_update_own_or_admin" on public.comments;
create policy "comments_update_own_or_admin"
  on public.comments for update
  using (auth.uid() = user_id or public.is_admin())
  with check (auth.uid() = user_id or public.is_admin());

drop policy if exists "comments_delete_own_or_admin" on public.comments;
create policy "comments_delete_own_or_admin"
  on public.comments for delete
  using (auth.uid() = user_id or public.is_admin());

drop policy if exists "announcement_reactions_select_public" on public.announcement_reactions;
create policy "announcement_reactions_select_public"
  on public.announcement_reactions for select using (true);

drop policy if exists "announcement_reactions_insert_members" on public.announcement_reactions;
create policy "announcement_reactions_insert_members"
  on public.announcement_reactions for insert
  with check (
    auth.uid() = user_id
    and exists (select 1 from public.profiles p where p.id = auth.uid() and (p.role='admin' or p.status='approved'))
  );

drop policy if exists "announcement_reactions_update_own" on public.announcement_reactions;
create policy "announcement_reactions_update_own"
  on public.announcement_reactions for update
  using (auth.uid() = user_id) with check (auth.uid() = user_id);

drop policy if exists "announcement_reactions_delete_own_or_admin" on public.announcement_reactions;
create policy "announcement_reactions_delete_own_or_admin"
  on public.announcement_reactions for delete
  using (auth.uid() = user_id or public.is_admin());

drop policy if exists "comment_reactions_select_public" on public.comment_reactions;
create policy "comment_reactions_select_public"
  on public.comment_reactions for select using (true);

drop policy if exists "comment_reactions_insert_members" on public.comment_reactions;
create policy "comment_reactions_insert_members"
  on public.comment_reactions for insert
  with check (
    auth.uid() = user_id
    and exists (select 1 from public.profiles p where p.id = auth.uid() and (p.role='admin' or p.status='approved'))
  );

drop policy if exists "comment_reactions_update_own" on public.comment_reactions;
create policy "comment_reactions_update_own"
  on public.comment_reactions for update
  using (auth.uid() = user_id) with check (auth.uid() = user_id);

drop policy if exists "comment_reactions_delete_own_or_admin" on public.comment_reactions;
create policy "comment_reactions_delete_own_or_admin"
  on public.comment_reactions for delete
  using (auth.uid() = user_id or public.is_admin());

drop policy if exists "notifications_select_own" on public.notifications;
create policy "notifications_select_own"
  on public.notifications for select
  using (auth.uid() = recipient_id);

drop policy if exists "notifications_update_own" on public.notifications;
create policy "notifications_update_own"
  on public.notifications for update
  using (auth.uid() = recipient_id)
  with check (auth.uid() = recipient_id);

drop policy if exists "notifications_delete_own" on public.notifications;
create policy "notifications_delete_own"
  on public.notifications for delete
  using (auth.uid() = recipient_id);

drop policy if exists "push_subscriptions_own" on public.push_subscriptions;
create policy "push_subscriptions_own"
  on public.push_subscriptions for select
  using (auth.uid() = user_id);

drop policy if exists "push_subscriptions_insert_own" on public.push_subscriptions;
create policy "push_subscriptions_insert_own"
  on public.push_subscriptions for insert
  with check (auth.uid() = user_id);

drop policy if exists "push_subscriptions_update_own" on public.push_subscriptions;
create policy "push_subscriptions_update_own"
  on public.push_subscriptions for update
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

drop policy if exists "push_subscriptions_delete_own" on public.push_subscriptions;
create policy "push_subscriptions_delete_own"
  on public.push_subscriptions for delete
  using (auth.uid() = user_id);

-- 8. Fonctions de notification
create or replace function public.notify_user(
  p_recipient uuid,
  p_actor uuid,
  p_type text,
  p_title text,
  p_body text,
  p_link text default null,
  p_entity uuid default null
)
returns void
language plpgsql
security definer set search_path = public
as $$
begin
  if p_recipient is null or p_recipient = p_actor then return; end if;
  insert into public.notifications(recipient_id, actor_id, type, title, body, link, entity_id)
  values (p_recipient, p_actor, p_type, p_title, p_body, p_link, p_entity);
end;
$$;

-- Nouvelle annonce : avertit les membres approuvés et les admins.
create or replace function public.notify_new_announcement()
returns trigger
language plpgsql
security definer set search_path = public
as $$
begin
  if new.published = true then
    insert into public.notifications(recipient_id, actor_id, type, title, body, link, entity_id)
    select p.id, new.author_id, 'announcement', 'Nouvelle annonce',
           coalesce(new.title, 'Une nouvelle annonce vient d’être publiée.'),
           '/annonces', new.id
    from public.profiles p
    where p.status = 'approved'
      and p.id is distinct from new.author_id;
  end if;
  return new;
end;
$$;

drop trigger if exists trg_notify_new_announcement on public.announcements;
create trigger trg_notify_new_announcement
after insert on public.announcements
for each row execute function public.notify_new_announcement();

-- Commentaire / réponse : notifie l'auteur de la publication ou du parent.
create or replace function public.notify_new_comment()
returns trigger
language plpgsql
security definer set search_path = public
as $$
declare
  v_author uuid;
  v_pseudo text;
begin
  select pseudo into v_pseudo from public.profiles where id = new.user_id;

  if new.parent_id is not null then
    select user_id into v_author from public.comments where id = new.parent_id;
    perform public.notify_user(v_author, new.user_id, 'comment_reply',
      coalesce(v_pseudo, 'Un joueur') || ' vous a répondu',
      left(new.content, 120), '/annonces', new.announcement_id);
  else
    select author_id into v_author from public.announcements where id = new.announcement_id;
    perform public.notify_user(v_author, new.user_id, 'comment',
      coalesce(v_pseudo, 'Un joueur') || ' a commenté votre annonce',
      left(new.content, 120), '/annonces', new.announcement_id);

    insert into public.notifications(recipient_id, actor_id, type, title, body, link, entity_id)
    select p.id, new.user_id, 'admin_comment', 'Nouveau commentaire 💬',
           coalesce(v_pseudo, 'Un joueur') || ' a commenté une annonce.',
           '/annonces', new.announcement_id
    from public.profiles p
    where p.role = 'admin' and p.id <> new.user_id and p.id is distinct from v_author;
  end if;
  return new;
end;
$$;

drop trigger if exists trg_notify_new_comment on public.comments;
create trigger trg_notify_new_comment
after insert on public.comments
for each row execute function public.notify_new_comment();

-- Réaction : notifie le propriétaire de la publication/commentaire.
create or replace function public.notify_announcement_reaction()
returns trigger
language plpgsql
security definer set search_path = public
as $$
declare
  v_author uuid;
  v_pseudo text;
begin
  select author_id into v_author from public.announcements where id = new.announcement_id;
  select pseudo into v_pseudo from public.profiles where id = new.user_id;
  perform public.notify_user(v_author, new.user_id, 'reaction',
    coalesce(v_pseudo, 'Un joueur') || ' a réagi à votre annonce',
    'Réaction : ' || new.reaction, '/annonces', new.announcement_id);
  return new;
end;
$$;

drop trigger if exists trg_notify_announcement_reaction on public.announcement_reactions;
create trigger trg_notify_announcement_reaction
after insert on public.announcement_reactions
for each row execute function public.notify_announcement_reaction();

create or replace function public.notify_comment_reaction()
returns trigger
language plpgsql
security definer set search_path = public
as $$
declare
  v_author uuid;
  v_pseudo text;
  v_announcement uuid;
begin
  select user_id, announcement_id into v_author, v_announcement
  from public.comments where id = new.comment_id;
  select pseudo into v_pseudo from public.profiles where id = new.user_id;
  perform public.notify_user(v_author, new.user_id, 'reaction',
    coalesce(v_pseudo, 'Un joueur') || ' a réagi à votre commentaire',
    'Réaction : ' || new.reaction, '/annonces', v_announcement);
  return new;
end;
$$;

drop trigger if exists trg_notify_comment_reaction on public.comment_reactions;
create trigger trg_notify_comment_reaction
after insert on public.comment_reactions
for each row execute function public.notify_comment_reaction();

-- Nouvelle inscription en attente : alerte les administrateurs.
create or replace function public.notify_new_player_pending()
returns trigger
language plpgsql
security definer set search_path = public
as $$
begin
  if new.status = 'pending' and (tg_op = 'INSERT' or old.status is distinct from new.status) then
    insert into public.notifications(recipient_id, actor_id, type, title, body, link, entity_id)
    select p.id, new.id, 'new_player', 'Nouvelle inscription 👤',
           coalesce(new.pseudo, 'Un nouveau joueur') || ' attend une validation.',
           '/admin', new.id
    from public.profiles p
    where p.role = 'admin' and p.id <> new.id;
  end if;
  return new;
end;
$$;

drop trigger if exists trg_notify_new_player_pending on public.profiles;
create trigger trg_notify_new_player_pending
after insert or update of status on public.profiles
for each row execute function public.notify_new_player_pending();

-- Statut joueur approuvé : notification au joueur.
create or replace function public.notify_profile_approval()
returns trigger
language plpgsql
security definer set search_path = public
as $$
begin
  if new.status = 'approved' and old.status is distinct from new.status then
    insert into public.notifications(recipient_id, type, title, body, link)
    values (new.id, 'approval', 'Inscription validée 🎉',
            'Ton inscription à la Bataille des Charos est maintenant validée.',
            '/profil');
  end if;
  return new;
end;
$$;

drop trigger if exists trg_notify_profile_approval on public.profiles;
create trigger trg_notify_profile_approval
after update of status on public.profiles
for each row execute function public.notify_profile_approval();

-- Match : notifications aux joueurs concernés.
create or replace function public.notify_match_change()
returns trigger
language plpgsql
security definer set search_path = public
as $$
declare
  v_pseudo1 text;
  v_pseudo2 text;
  v_title text;
  v_body text;
begin
  select pseudo into v_pseudo1 from public.profiles where id = new.player1_id;
  select pseudo into v_pseudo2 from public.profiles where id = new.player2_id;

  if new.status = 'scheduled'
     and (tg_op = 'INSERT' or old.scheduled_at is distinct from new.scheduled_at or old.player1_id is distinct from new.player1_id or old.player2_id is distinct from new.player2_id) then
    v_title := 'Match programmé ⚔️';
    v_body := coalesce(v_pseudo1, 'Joueur 1') || ' vs ' || coalesce(v_pseudo2, 'Joueur 2');
    if new.scheduled_at is not null then
      v_body := v_body || ' · ' || to_char(new.scheduled_at at time zone 'Africa/Lome', 'DD/MM à HH24:MI');
    end if;
    perform public.notify_user(new.player1_id, null, 'match_scheduled', v_title, v_body, '/matchs', new.id);
    perform public.notify_user(new.player2_id, null, 'match_scheduled', v_title, v_body, '/matchs', new.id);
  elsif new.status = 'in_progress' and (tg_op = 'INSERT' or old.status is distinct from new.status) then
    v_title := 'Ton match est en cours 🔴';
    v_body := coalesce(v_pseudo1, 'Joueur 1') || ' vs ' || coalesce(v_pseudo2, 'Joueur 2');
    perform public.notify_user(new.player1_id, null, 'match_in_progress', v_title, v_body, '/matchs', new.id);
    perform public.notify_user(new.player2_id, null, 'match_in_progress', v_title, v_body, '/matchs', new.id);
  elsif new.status = 'completed' and old.status is distinct from new.status then
    v_title := 'Match terminé 🏆';
    v_body := coalesce(v_pseudo1, 'Joueur 1') || ' ' || new.score1 || ' — ' || new.score2 || ' ' || coalesce(v_pseudo2, 'Joueur 2');
    perform public.notify_user(new.player1_id, null, 'match_completed', v_title, v_body, '/matchs', new.id);
    perform public.notify_user(new.player2_id, null, 'match_completed', v_title, v_body, '/matchs', new.id);
  end if;

  if (tg_op = 'INSERT' or old.status is distinct from new.status or old.scheduled_at is distinct from new.scheduled_at) then
    insert into public.notifications(recipient_id, type, title, body, link, entity_id)
    select p.id, 'match_admin', 'Match mis à jour ⚔️',
           coalesce(v_pseudo1, 'Joueur 1') || ' vs ' || coalesce(v_pseudo2, 'Joueur 2') || ' · ' || new.status,
           '/admin', new.id
    from public.profiles p
    where p.role = 'admin'
      and p.id not in (new.player1_id, new.player2_id);
  end if;

  return new;
end;
$$;

drop trigger if exists trg_notify_match_change on public.matches;
create trigger trg_notify_match_change
after insert or update on public.matches
for each row execute function public.notify_match_change();

-- 9. Realtime
do $$
begin
  begin
    alter publication supabase_realtime add table public.notifications;
  exception when duplicate_object then null;
  end;
  begin
    alter publication supabase_realtime add table public.comments;
  exception when duplicate_object then null;
  end;
  begin
    alter publication supabase_realtime add table public.announcement_reactions;
  exception when duplicate_object then null;
  end;
  begin
    alter publication supabase_realtime add table public.comment_reactions;
  exception when duplicate_object then null;
  end;
end $$;

-- ============================================================================
-- FIN
-- ============================================================================

-- Contrôle manuel du statut d'un match.
alter table public.matches
  add column if not exists status_override boolean not null default false;

create index if not exists idx_matches_status_override on public.matches(status_override);

create or replace function public.activate_scheduled_matches()
returns void
language sql
security definer set search_path = public
as $$
  update public.matches
    set status = 'in_progress'
    where status = 'scheduled'
      and status_override = false
      and scheduled_at is not null
      and scheduled_at <= now();
$$;

comment on function public.activate_scheduled_matches is 'Passe automatiquement les matchs programmés à En cours, sauf si un admin a forcé le statut.';


-- ============================================================================
-- SOURCE REGROUPÉE : migration_media_comments.sql
-- ============================================================================
-- ============================================================================
-- MÉCHANTCHARO / BATAILLE DES CHAROS
-- Médias dans les annonces + pièces jointes dans les commentaires
-- À exécuter après migration_social_notifications.sql
-- ============================================================================

-- 1. Métadonnées de pièce jointe sur les commentaires
alter table public.comments
  add column if not exists attachment_url text,
  add column if not exists attachment_name text,
  add column if not exists attachment_type text,
  add column if not exists attachment_size bigint;

-- 2. Autoriser tout membre connecté disposant d'un profil à commenter/réagir.
-- Le contrôle reste strictement réservé aux utilisateurs authentifiés.
drop policy if exists "comments_insert_members" on public.comments;
create policy "comments_insert_members"
  on public.comments for insert
  with check (
    auth.uid() = user_id
    and exists (select 1 from public.profiles p where p.id = auth.uid())
    and exists (
      select 1 from public.announcements a
      where a.id = announcement_id and a.published = true
    )
    and (
      parent_id is null
      or exists (
        select 1 from public.comments parent
        where parent.id = parent_id
          and parent.announcement_id = announcement_id
      )
    )
  );

drop policy if exists "announcement_reactions_insert_members" on public.announcement_reactions;
create policy "announcement_reactions_insert_members"
  on public.announcement_reactions for insert
  with check (
    auth.uid() = user_id
    and exists (select 1 from public.profiles p where p.id = auth.uid())
  );

drop policy if exists "comment_reactions_insert_members" on public.comment_reactions;
create policy "comment_reactions_insert_members"
  on public.comment_reactions for insert
  with check (
    auth.uid() = user_id
    and exists (select 1 from public.profiles p where p.id = auth.uid())
  );

-- 3. Bucket public pour les images d'annonces et pièces jointes.
-- La limite applicative et Storage est de 10 Mo.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'announcement-media',
  'announcement-media',
  true,
  10485760,
  array[
    'image/*',
    'application/pdf',
    'text/plain',
    'application/zip',
    'application/x-zip-compressed',
    'application/msword',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    'application/vnd.ms-excel',
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
  ]
)
on conflict (id) do update set
  public = true,
  file_size_limit = 10485760,
  allowed_mime_types = excluded.allowed_mime_types;

-- Lecture publique : les URL des images/fichiers d'annonces peuvent être affichées.
drop policy if exists "announcement_media_public_read" on storage.objects;
create policy "announcement_media_public_read"
  on storage.objects for select
  using (bucket_id = 'announcement-media');

-- Tout membre connecté peut téléverser un média.
drop policy if exists "announcement_media_authenticated_insert" on storage.objects;
create policy "announcement_media_authenticated_insert"
  on storage.objects for insert
  with check (
    bucket_id = 'announcement-media'
    and auth.uid() is not null
  );

-- Un utilisateur peut remplacer/supprimer ses propres fichiers ; un admin peut modérer.
drop policy if exists "announcement_media_owner_update" on storage.objects;
create policy "announcement_media_owner_update"
  on storage.objects for update
  using (
    bucket_id = 'announcement-media'
    and (owner_id = auth.uid()::text or public.is_admin())
  )
  with check (
    bucket_id = 'announcement-media'
    and (owner_id = auth.uid()::text or public.is_admin())
  );

drop policy if exists "announcement_media_owner_delete" on storage.objects;
create policy "announcement_media_owner_delete"
  on storage.objects for delete
  using (
    bucket_id = 'announcement-media'
    and (owner_id = auth.uid()::text or public.is_admin())
  );

-- 4. Realtime : les nouvelles pièces jointes suivent déjà les événements comments.
-- Aucun changement supplémentaire n'est nécessaire ici.

-- 5. Activer Realtime sur les nouvelles tables si elles n'y sont pas encore.
do $$
begin
  begin alter publication supabase_realtime add table public.comments; exception when duplicate_object then null; end;
  begin alter publication supabase_realtime add table public.announcement_reactions; exception when duplicate_object then null; end;
  begin alter publication supabase_realtime add table public.comment_reactions; exception when duplicate_object then null; end;
  begin alter publication supabase_realtime add table public.notifications; exception when duplicate_object then null; end;
end $$;


-- ============================================================================
-- SOURCE REGROUPÉE : migration_match_status_in_progress.sql
-- ============================================================================
-- ============================================================================
-- MIGRATION : statut match "live" -> "in_progress"
--
-- Objectif :
--   scheduled    = match à venir
--   in_progress  = match en cours
--   completed    = résultat validé, déplacé vers l'historique
--
-- À exécuter UNE FOIS sur une base déjà créée avec l'ancien enum.
-- ============================================================================

DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM pg_enum e
    JOIN pg_type t ON t.oid = e.enumtypid
    JOIN pg_namespace n ON n.oid = t.typnamespace
    WHERE n.nspname = 'public'
      AND t.typname = 'match_status'
      AND e.enumlabel = 'live'
  ) THEN
    ALTER TYPE public.match_status RENAME VALUE 'live' TO 'in_progress';
  END IF;
END $$;

-- Les anciennes notifications "match_live" sont alignées avec le nouveau vocabulaire.
UPDATE public.notifications
SET type = 'match_in_progress'
WHERE type = 'match_live';

-- Activation automatique à l'heure programmée.
-- Un statut forcé par l'administration n'est jamais écrasé automatiquement.
CREATE OR REPLACE FUNCTION public.activate_scheduled_matches()
RETURNS void
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  UPDATE public.matches
  SET status = 'in_progress'
  WHERE status = 'scheduled'
    AND COALESCE(status_override, false) = false
    AND scheduled_at IS NOT NULL
    AND scheduled_at <= now();
$$;

COMMENT ON FUNCTION public.activate_scheduled_matches IS
'Passe automatiquement les matchs programmés à in_progress à l heure prévue, sauf si un administrateur a forcé le statut.';

-- Notifications : "Match en cours".
CREATE OR REPLACE FUNCTION public.notify_match_change()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_pseudo1 text;
  v_pseudo2 text;
  v_title text;
  v_body text;
BEGIN
  SELECT pseudo INTO v_pseudo1 FROM public.profiles WHERE id = new.player1_id;
  SELECT pseudo INTO v_pseudo2 FROM public.profiles WHERE id = new.player2_id;

  IF new.status = 'scheduled'
     AND (TG_OP = 'INSERT'
       OR old.scheduled_at IS DISTINCT FROM new.scheduled_at
       OR old.player1_id IS DISTINCT FROM new.player1_id
       OR old.player2_id IS DISTINCT FROM new.player2_id) THEN
    v_title := 'Match programmé ⚔️';
    v_body := coalesce(v_pseudo1, 'Joueur 1') || ' vs ' || coalesce(v_pseudo2, 'Joueur 2');
    IF new.scheduled_at IS NOT NULL THEN
      v_body := v_body || ' · ' || to_char(new.scheduled_at at time zone 'Africa/Lome', 'DD/MM à HH24:MI');
    END IF;
    PERFORM public.notify_user(new.player1_id, null, 'match_scheduled', v_title, v_body, '/matchs', new.id);
    PERFORM public.notify_user(new.player2_id, null, 'match_scheduled', v_title, v_body, '/matchs', new.id);
  ELSIF new.status = 'in_progress' AND (TG_OP = 'INSERT' OR old.status IS DISTINCT FROM new.status) THEN
    v_title := 'Ton match est en cours 🔴';
    v_body := coalesce(v_pseudo1, 'Joueur 1') || ' vs ' || coalesce(v_pseudo2, 'Joueur 2');
    PERFORM public.notify_user(new.player1_id, null, 'match_in_progress', v_title, v_body, '/matchs', new.id);
    PERFORM public.notify_user(new.player2_id, null, 'match_in_progress', v_title, v_body, '/matchs', new.id);
  ELSIF new.status = 'completed' AND old.status IS DISTINCT FROM new.status THEN
    v_title := 'Match terminé 🏆';
    v_body := coalesce(v_pseudo1, 'Joueur 1') || ' ' || new.score1 || ' — ' || new.score2 || ' ' || coalesce(v_pseudo2, 'Joueur 2');
    PERFORM public.notify_user(new.player1_id, null, 'match_completed', v_title, v_body, '/historique', new.id);
    PERFORM public.notify_user(new.player2_id, null, 'match_completed', v_title, v_body, '/historique', new.id);
  END IF;

  IF (TG_OP = 'INSERT' OR old.status IS DISTINCT FROM new.status OR old.scheduled_at IS DISTINCT FROM new.scheduled_at) THEN
    INSERT INTO public.notifications(recipient_id, type, title, body, link, entity_id)
    SELECT p.id, 'match_admin', 'Match mis à jour ⚔️',
           coalesce(v_pseudo1, 'Joueur 1') || ' vs ' || coalesce(v_pseudo2, 'Joueur 2') || ' · ' || new.status,
           '/admin', new.id
    FROM public.profiles p
    WHERE p.role = 'admin'
      AND p.id NOT IN (new.player1_id, new.player2_id);
  END IF;

  RETURN new;
END;
$$;

DROP TRIGGER IF EXISTS trg_notify_match_change ON public.matches;
CREATE TRIGGER trg_notify_match_change
AFTER INSERT OR UPDATE ON public.matches
FOR EACH ROW EXECUTE FUNCTION public.notify_match_change();

-- Si pg_cron existe déjà, on recrée la tâche avec la nouvelle fonction.
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_namespace WHERE nspname = 'cron') THEN
    PERFORM cron.unschedule(jobid)
    FROM cron.job
    WHERE jobname = 'activate-scheduled-matches';

    PERFORM cron.schedule(
      'activate-scheduled-matches',
      '* * * * *',
      $job$SELECT public.activate_scheduled_matches();$job$
    );
  END IF;
EXCEPTION WHEN OTHERS THEN
  -- La migration reste valide même si pg_cron n'est pas disponible sur le projet.
  NULL;
END $$;

-- ============================================================================
-- FIN
-- ============================================================================


-- ============================================================================
-- SOURCE REGROUPÉE : migration_admin_controls_32.sql
-- ============================================================================
-- ============================================================================
-- MIGRATION : Admin complet + Seizièmes de finale (32 joueurs)
-- À exécuter APRÈS les migrations existantes.
-- ============================================================================

-- 1. Ajouter la phase "seizieme" sans recréer les enums existants.

-- 2. Qualification : 2 joueurs par groupe + 12 meilleurs joueurs restants.
--    Les 20 premiers = rang 1 et 2 de chacun des 10 groupes.
--    Les 12 places restantes = meilleurs joueurs approuvés hors de ces 20,
--    départagés par points puis dégâts puis kills.
create or replace function public.compute_qualifications_32()
returns void
language plpgsql
security definer set search_path = public
as $$
begin
  if not public.is_admin() then
    raise exception 'Accès réservé aux administrateurs';
  end if;

  update public.profiles
    set is_qualified = false, qualification_seed = null
    where is_qualified = true or qualification_seed is not null;

  with ranked_groups as (
    select player_id
    from public.group_standings
    where group_rank <= 2
  ),
  best_remaining as (
    select p.id
    from public.profiles p
    where p.status = 'approved'
      and p.id not in (select player_id from ranked_groups)
    order by p.total_points desc, p.total_damage desc, p.total_kills desc, p.pseudo asc
    limit 12
  ),
  selected as (
    select player_id from ranked_groups
    union
    select id from best_remaining
  ),
  seeded as (
    select p.id,
           row_number() over (
             order by p.total_points desc, p.total_damage desc, p.total_kills desc, p.pseudo asc
           ) as seed
    from public.profiles p
    where p.id in (select player_id from selected)
  )
  update public.profiles p
    set is_qualified = true,
        qualification_seed = seeded.seed
  from seeded
  where p.id = seeded.id;
end;
$$;

comment on function public.compute_qualifications_32 is
'Qualifie 32 joueurs pour les seizièmes : 2 par groupe (20) puis 12 meilleurs joueurs restants selon points, dégâts et kills.';

-- 3. Recalcul des statistiques aussi après suppression/modification d'un match.
create or replace function public.trg_recompute_stats_after_match()
returns trigger
language plpgsql
security definer set search_path = public
as $$
begin
  if tg_op = 'DELETE' then
    if old.player1_id is not null then perform public.recompute_player_stats(old.player1_id); end if;
    if old.player2_id is not null then perform public.recompute_player_stats(old.player2_id); end if;
    return old;
  end if;

  if new.status = 'completed' then
    if new.player1_id is not null then perform public.recompute_player_stats(new.player1_id); end if;
    if new.player2_id is not null then perform public.recompute_player_stats(new.player2_id); end if;
  end if;

  if tg_op = 'UPDATE' then
    if old.player1_id is distinct from new.player1_id and old.player1_id is not null then perform public.recompute_player_stats(old.player1_id); end if;
    if old.player2_id is distinct from new.player2_id and old.player2_id is not null then perform public.recompute_player_stats(old.player2_id); end if;
  end if;

  return new;
end;
$$;

drop trigger if exists trg_after_poule_match_completed on public.matches;
create trigger trg_after_match_stats_recompute
  after insert or update or delete on public.matches
  for each row execute function public.trg_recompute_stats_after_match();

-- 4. Suppression complète d'un joueur par un admin : profil + compte Auth.
create or replace function public.admin_delete_player(p_player_id uuid)
returns void
language plpgsql
security definer set search_path = public, auth
as $$
begin
  if not public.is_admin() then
    raise exception 'Accès réservé aux administrateurs';
  end if;

  if p_player_id = auth.uid() then
    raise exception 'Un administrateur ne peut pas supprimer son propre compte ici';
  end if;

  delete from auth.users where id = p_player_id;
end;
$$;

-- 5. Créer automatiquement les 16 matchs de seizièmes à partir des 32 seeds.
--    Pairing classique : 1-32, 16-17, 8-25, 9-24, 4-29, 13-20, 5-28, 12-21,
--    2-31, 15-18, 7-26, 10-23, 3-30, 14-19, 6-27, 11-22.
create or replace function public.generate_round_of_32()
returns integer
language plpgsql
security definer set search_path = public
as $$
declare
  v_count integer;
  v_seed_a integer;
  v_seed_b integer;
  v_id_a uuid;
  v_id_b uuid;
  v_match_id uuid;
  pairs integer[][] := array[
    array[1,32], array[16,17], array[8,25], array[9,24],
    array[4,29], array[13,20], array[5,28], array[12,21],
    array[2,31], array[15,18], array[7,26], array[10,23],
    array[3,30], array[14,19], array[6,27], array[11,22]
  ];
  i integer;
begin
  if not public.is_admin() then
    raise exception 'Accès réservé aux administrateurs';
  end if;

  select count(*) into v_count from public.profiles where is_qualified = true and status = 'approved';
  if v_count <> 32 then
    raise exception 'Il faut exactement 32 joueurs qualifiés avant de générer les seizièmes (actuellement %).', v_count;
  end if;

  if exists (select 1 from public.matches where phase = 'seizieme') then
    raise exception 'Les matchs des seizièmes existent déjà.';
  end if;

  for i in 1..16 loop
    v_seed_a := pairs[i][1];
    v_seed_b := pairs[i][2];

    select id into v_id_a from public.profiles where qualification_seed = v_seed_a and is_qualified = true limit 1;
    select id into v_id_b from public.profiles where qualification_seed = v_seed_b and is_qualified = true limit 1;

    insert into public.matches (
      phase, match_type, leg, player1_id, player2_id, status, round_label
    ) values (
      'seizieme', 'onetap', 'aller', v_id_a, v_id_b, 'scheduled', 'Seizième de finale ' || i
    ) returning id into v_match_id;
  end loop;

  return 16;
end;
$$;

comment on function public.generate_round_of_32 is 'Génère les 16 matchs de seizièmes à partir des 32 qualifiés.';

-- 6. Vue pratique pour l'admin : tous les joueurs approuvés.
create or replace view public.admin_players as
select
  p.id, p.pseudo, p.ff_uid, p.avatar_url, p.role, p.status, p.group_id,
  g.name as group_name, p.total_points, p.total_kills, p.total_damage,
  p.wins, p.losses, p.is_qualified, p.qualification_seed, p.created_at, p.updated_at
from public.profiles p
left join public.groups g on g.id = p.group_id
where p.status = 'approved';

grant select on public.admin_players to authenticated;

-- ==========================================================================
-- FIN
-- ============================================================================


-- ============================================================================
-- SOURCE REGROUPÉE : A_EXECUTER_BRACKET_FINAL.sql
-- ============================================================================
-- ================================================================
-- BATAILLE DES CHAROS — BRACKET FINAL (16èmes → Finale)
-- À exécuter dans Supabase → SQL Editor.
--
-- IMPORTANT : exécute D'ABORD l'ÉTAPE 1 seule (bouton "Run"),
-- attends que ça affiche "Success", PUIS exécute l'ÉTAPE 2 seule.
-- Postgres interdit d'utiliser une nouvelle valeur d'enum dans la
-- même transaction que celle où elle a été créée : si tu colles
-- tout d'un coup, ça peut échouer silencieusement ou tout annuler.
-- ================================================================


-- ============================================================
-- ÉTAPE 1 — à exécuter seule, puis clique "Run"
-- ============================================================

alter table public.matches
  add column if not exists bracket_position smallint;

create index if not exists idx_matches_final_bracket_position
  on public.matches(phase, bracket_position);

create unique index if not exists ux_matches_final_bracket_position
  on public.matches(phase, bracket_position)
  where phase in ('seizieme','quart','demie','finale') and bracket_position is not null;

create table if not exists public.tournament_settings (
  id uuid primary key default gen_random_uuid(),
  mvp_player_id uuid references public.profiles(id) on delete set null,
  mvp_note text,
  updated_at timestamptz not null default now()
);

alter table public.tournament_settings enable row level security;
drop policy if exists "tournament_settings_public_select" on public.tournament_settings;
create policy "tournament_settings_public_select" on public.tournament_settings for select using (true);
drop policy if exists "tournament_settings_admin_write" on public.tournament_settings;
create policy "tournament_settings_admin_write" on public.tournament_settings for all using (public.is_admin()) with check (public.is_admin());
grant select on public.tournament_settings to anon, authenticated;


-- ============================================================
-- ÉTAPE 2 — colle et exécute SÉPARÉMENT, APRÈS que l'étape 1
-- soit terminée avec succès.
-- ============================================================

-- Sélection manuelle des 16 finalistes.
create or replace function public.set_final_qualifiers(p_player_ids uuid[])
returns integer
language plpgsql
security definer set search_path = public
as $$
declare
  v_count integer;
  v_id uuid;
  v_seed integer := 0;
begin
  if not public.is_admin() then raise exception 'Accès réservé aux administrateurs'; end if;
  if coalesce(array_length(p_player_ids, 1), 0) <> 16 then raise exception 'Il faut sélectionner exactement 16 joueurs.'; end if;

  select count(*) into v_count from public.profiles where id = any(p_player_ids) and status = 'approved';
  if v_count <> 16 then raise exception 'Tous les finalistes doivent être des joueurs approuvés.'; end if;
  if exists (select 1 from public.matches where phase in ('seizieme','quart','demie','finale')) then
    raise exception 'Supprime d''abord les matchs de la phase finale avant de modifier les 16 finalistes.';
  end if;

  update public.profiles
    set is_qualified = false, qualification_seed = null
    where is_qualified = true or qualification_seed is not null;

  foreach v_id in array p_player_ids loop
    v_seed := v_seed + 1;
    update public.profiles set is_qualified = true, qualification_seed = v_seed where id = v_id;
  end loop;
  return 16;
end;
$$;
grant execute on function public.set_final_qualifiers(uuid[]) to authenticated;

-- Valide un match de la phase finale et envoie le vainqueur dans la case suivante du bracket.
create or replace function public.admin_validate_final_match(
  p_match_id uuid,
  p_score1 integer,
  p_score2 integer,
  p_damage1 integer default 0,
  p_damage2 integer default 0
)
returns public.matches
language plpgsql
security definer
set search_path = public
as $$
declare
  v_match public.matches;
  v_next_phase public.match_phase;
  v_next_position integer;
  v_next_match public.matches;
  v_winner uuid;
  v_slot integer;
begin
  if not public.is_admin() then
    raise exception 'Accès réservé aux administrateurs';
  end if;

  if p_score1 is null or p_score2 is null or p_score1 < 0 or p_score2 < 0 then
    raise exception 'Les scores doivent être des nombres positifs.';
  end if;

  if p_score1 = p_score2 then
    raise exception 'Une égalité ne permet pas de déterminer le qualifié.';
  end if;

  if p_damage1 is null or p_damage2 is null or p_damage1 < 0 or p_damage2 < 0 then
    raise exception 'Les dégâts doivent être des nombres positifs.';
  end if;

  select * into v_match
  from public.matches
  where id = p_match_id
  for update;

  if not found then
    raise exception 'Match introuvable.';
  end if;

  if v_match.phase not in ('seizieme','quart','demie','finale') then
    raise exception 'Ce match ne fait pas partie de la phase finale.';
  end if;

  if v_match.player1_id is null or v_match.player2_id is null then
    raise exception 'Les deux joueurs doivent être définis avant de valider le score.';
  end if;

  v_winner := case when p_score1 > p_score2 then v_match.player1_id else v_match.player2_id end;

  update public.matches
  set score1 = p_score1,
      score2 = p_score2,
      damage1 = p_damage1,
      damage2 = p_damage2,
      winner_id = v_winner,
      status = 'completed'
  where id = p_match_id
  returning * into v_match;

  if v_match.phase = 'seizieme' then
    v_next_phase := 'quart';
  elsif v_match.phase = 'quart' then
    v_next_phase := 'demie';
  elsif v_match.phase = 'demie' then
    v_next_phase := 'finale';
  else
    v_next_phase := null;
  end if;

  if v_next_phase is not null and v_match.bracket_position is not null then
    v_next_position := ceil(v_match.bracket_position::numeric / 2.0)::integer;
    v_slot := case when mod(v_match.bracket_position, 2) = 1 then 1 else 2 end;

    select * into v_next_match
    from public.matches
    where phase = v_next_phase
      and bracket_position = v_next_position
    limit 1
    for update;

    if found then
      if v_slot = 1 then
        update public.matches set player1_id = v_winner where id = v_next_match.id;
      else
        update public.matches set player2_id = v_winner where id = v_next_match.id;
      end if;

      update public.matches
      set next_match_id = v_next_match.id,
          next_match_slot = v_slot
      where id = p_match_id;
    end if;
  end if;

  select * into v_match from public.matches where id = p_match_id;
  return v_match;
end;
$$;

grant execute on function public.admin_validate_final_match(uuid, integer, integer, integer, integer) to authenticated;

comment on function public.admin_validate_final_match is
'Valide le score d''un match de la phase finale et propage son vainqueur vers le bon emplacement du tour suivant.';

-- Quand l'admin programme un tour suivant après que les matchs précédents sont déjà
-- terminés, remplit automatiquement les deux joueurs de la nouvelle case.
create or replace function public.sync_final_bracket_match_players(p_match_id uuid)
returns public.matches
language plpgsql
security definer set search_path = public
as $$
declare
  v_match public.matches;
  v_prev_phase public.match_phase;
  v_a public.matches;
  v_b public.matches;
  v_pos integer;
begin
  if not public.is_admin() then raise exception 'Accès réservé aux administrateurs'; end if;
  select * into v_match from public.matches where id = p_match_id for update;
  if not found or v_match.phase not in ('quart','demie','finale') then return v_match; end if;

  v_prev_phase := case v_match.phase when 'quart' then 'seizieme' when 'demie' then 'quart' when 'finale' then 'demie' end;
  v_pos := v_match.bracket_position;
  if v_pos is null then return v_match; end if;

  select * into v_a from public.matches where phase = v_prev_phase and bracket_position = (v_pos * 2 - 1) limit 1;
  select * into v_b from public.matches where phase = v_prev_phase and bracket_position = (v_pos * 2) limit 1;

  update public.matches
  set player1_id = case when v_a.status = 'completed' then v_a.winner_id else player1_id end,
      player2_id = case when v_b.status = 'completed' then v_b.winner_id else player2_id end
  where id = v_match.id;

  select * into v_match from public.matches where id = p_match_id;
  return v_match;
end;
$$;

grant execute on function public.sync_final_bracket_match_players(uuid) to authenticated;

-- ============================================================
-- VÉRIFICATION — colle ça à la fin pour confirmer que tout est en place
-- ============================================================
-- select 'seizieme'::public.match_phase; -- doit retourner "seizieme" sans erreur
-- select column_name from information_schema.columns where table_name='matches' and column_name='bracket_position'; -- doit retourner 1 ligne
-- select proname from pg_proc where proname in ('admin_validate_final_match','sync_final_bracket_match_players','set_final_qualifiers'); -- doit retourner 3 lignes


-- ============================================================================
-- SOURCE REGROUPÉE : A2_EXECUTER_32EMES_ALLER_RETOUR.sql
-- ============================================================================
-- ================================================================
-- BATAILLE DES CHAROS — AJOUT DU TOUR DES 32èmes + ALLER/RETOUR
-- Bracket : 32 → 16 → 8 → 4 → 2 → 1 (32èmes, 16èmes, quarts, demies, finale)
-- Chaque case de la phase finale cumule maintenant un score ALLER et un
-- score RETOUR ; le vainqueur est celui qui a le plus de kills cumulés.
--
-- À exécuter dans Supabase → SQL Editor.
-- ÉTAPE 1 seule d'abord (ajout de la valeur d'enum), attends "Success",
-- PUIS ÉTAPE 2 (colonnes + fonctions).
-- ================================================================


-- ============================================================
-- ÉTAPE 1 — à exécuter seule
-- ============================================================

-- ============================================================
-- ÉTAPE 2 — à exécuter séparément, après le succès de l'étape 1
-- ============================================================

-- Colonnes pour le score du match RETOUR (le match ALLER reste sur
-- score1/score2/damage1/damage2, qui existaient déjà).
alter table public.matches add column if not exists score1_retour integer;
alter table public.matches add column if not exists score2_retour integer;
alter table public.matches add column if not exists damage1_retour integer;
alter table public.matches add column if not exists damage2_retour integer;
alter table public.matches add column if not exists scheduled_at_retour timestamptz;

-- Validation d'une case de la phase finale : reçoit désormais le score
-- ALLER et le score RETOUR en un seul appel, cumule les kills des deux
-- manches pour déterminer le vainqueur, puis propage comme avant.
-- On supprime d'abord l'ancienne version (5 arguments, sans retour) pour
-- éviter toute ambiguïté de surcharge avec la nouvelle (9 arguments).
drop function if exists public.admin_validate_final_match(uuid, integer, integer, integer, integer);

create or replace function public.admin_validate_final_match(
  p_match_id uuid,
  p_score1 integer,
  p_score2 integer,
  p_damage1 integer default 0,
  p_damage2 integer default 0,
  p_score1_retour integer default 0,
  p_score2_retour integer default 0,
  p_damage1_retour integer default 0,
  p_damage2_retour integer default 0
)
returns public.matches
language plpgsql
security definer
set search_path = public
as $$
declare
  v_match public.matches;
  v_next_phase public.match_phase;
  v_next_position integer;
  v_next_match public.matches;
  v_winner uuid;
  v_slot integer;
  v_total1 integer;
  v_total2 integer;
begin
  if not public.is_admin() then
    raise exception 'Accès réservé aux administrateurs';
  end if;

  if p_score1 is null or p_score2 is null or p_score1 < 0 or p_score2 < 0
     or p_score1_retour is null or p_score2_retour is null or p_score1_retour < 0 or p_score2_retour < 0 then
    raise exception 'Les scores (aller et retour) doivent être des nombres positifs.';
  end if;

  if p_damage1 is null or p_damage2 is null or p_damage1 < 0 or p_damage2 < 0
     or p_damage1_retour is null or p_damage2_retour is null or p_damage1_retour < 0 or p_damage2_retour < 0 then
    raise exception 'Les dégâts (aller et retour) doivent être des nombres positifs.';
  end if;

  v_total1 := p_score1 + p_score1_retour;
  v_total2 := p_score2 + p_score2_retour;

  if v_total1 = v_total2 then
    raise exception 'Égalité sur le cumul aller + retour (%s - %s) : impossible de déterminer le qualifié.', v_total1, v_total2;
  end if;

  select * into v_match
  from public.matches
  where id = p_match_id
  for update;

  if not found then
    raise exception 'Match introuvable.';
  end if;

  if v_match.phase not in ('trente_deuxieme','seizieme','quart','demie','finale') then
    raise exception 'Ce match ne fait pas partie de la phase finale.';
  end if;

  if v_match.player1_id is null or v_match.player2_id is null then
    raise exception 'Les deux joueurs doivent être définis avant de valider le score.';
  end if;

  v_winner := case when v_total1 > v_total2 then v_match.player1_id else v_match.player2_id end;

  update public.matches
  set score1 = p_score1,
      score2 = p_score2,
      damage1 = p_damage1,
      damage2 = p_damage2,
      score1_retour = p_score1_retour,
      score2_retour = p_score2_retour,
      damage1_retour = p_damage1_retour,
      damage2_retour = p_damage2_retour,
      winner_id = v_winner,
      status = 'completed'
  where id = p_match_id
  returning * into v_match;

  v_next_phase := case v_match.phase
    when 'trente_deuxieme' then 'seizieme'
    when 'seizieme' then 'quart'
    when 'quart' then 'demie'
    when 'demie' then 'finale'
    else null
  end;

  if v_next_phase is not null and v_match.bracket_position is not null then
    v_next_position := ceil(v_match.bracket_position::numeric / 2.0)::integer;
    v_slot := case when mod(v_match.bracket_position, 2) = 1 then 1 else 2 end;

    select * into v_next_match
    from public.matches
    where phase = v_next_phase
      and bracket_position = v_next_position
    limit 1
    for update;

    if found then
      if v_slot = 1 then
        update public.matches set player1_id = v_winner where id = v_next_match.id;
      else
        update public.matches set player2_id = v_winner where id = v_next_match.id;
      end if;

      update public.matches
      set next_match_id = v_next_match.id,
          next_match_slot = v_slot
      where id = p_match_id;
    end if;
  end if;

  select * into v_match from public.matches where id = p_match_id;
  return v_match;
end;
$$;

grant execute on function public.admin_validate_final_match(uuid, integer, integer, integer, integer, integer, integer, integer, integer) to authenticated;

comment on function public.admin_validate_final_match(uuid, integer, integer, integer, integer, integer, integer, integer, integer) is
'Valide le score ALLER + RETOUR d''une case de la phase finale (32èmes → finale), cumule les kills et propage le vainqueur vers le tour suivant.';

-- Remplissage automatique d'une nouvelle case si le tour précédent est déjà terminé.
create or replace function public.sync_final_bracket_match_players(p_match_id uuid)
returns public.matches
language plpgsql
security definer set search_path = public
as $$
declare
  v_match public.matches;
  v_prev_phase public.match_phase;
  v_a public.matches;
  v_b public.matches;
  v_pos integer;
begin
  if not public.is_admin() then raise exception 'Accès réservé aux administrateurs'; end if;
  select * into v_match from public.matches where id = p_match_id for update;
  if not found or v_match.phase not in ('seizieme','quart','demie','finale') then return v_match; end if;

  v_prev_phase := case v_match.phase
    when 'seizieme' then 'trente_deuxieme'
    when 'quart' then 'seizieme'
    when 'demie' then 'quart'
    when 'finale' then 'demie'
  end;
  v_pos := v_match.bracket_position;
  if v_pos is null then return v_match; end if;

  select * into v_a from public.matches where phase = v_prev_phase and bracket_position = (v_pos * 2 - 1) limit 1;
  select * into v_b from public.matches where phase = v_prev_phase and bracket_position = (v_pos * 2) limit 1;

  update public.matches
  set player1_id = case when v_a.status = 'completed' then v_a.winner_id else player1_id end,
      player2_id = case when v_b.status = 'completed' then v_b.winner_id else player2_id end
  where id = v_match.id;

  select * into v_match from public.matches where id = p_match_id;
  return v_match;
end;
$$;

grant execute on function public.sync_final_bracket_match_players(uuid) to authenticated;

-- Rappel : les fonctions ci-dessus supposent que A_EXECUTER_BRACKET_FINAL.sql
-- (colonne bracket_position, table tournament_settings, is_admin(), etc.)
-- a déjà été exécuté avant celui-ci.

-- Le tournoi part maintenant de 32 finalistes (32èmes → 16èmes → quarts →
-- demies → finale) au lieu de 16. On met à jour la sélection manuelle en
-- conséquence.
create or replace function public.set_final_qualifiers(p_player_ids uuid[])
returns integer
language plpgsql
security definer set search_path = public
as $$
declare
  v_count integer;
  v_id uuid;
  v_seed integer := 0;
begin
  if not public.is_admin() then raise exception 'Accès réservé aux administrateurs'; end if;
  if coalesce(array_length(p_player_ids, 1), 0) <> 32 then raise exception 'Il faut sélectionner exactement 32 joueurs.'; end if;

  select count(*) into v_count from public.profiles where id = any(p_player_ids) and status = 'approved';
  if v_count <> 32 then raise exception 'Tous les finalistes doivent être des joueurs approuvés.'; end if;
  if exists (select 1 from public.matches where phase in ('trente_deuxieme','seizieme','quart','demie','finale')) then
    raise exception 'Supprime d''abord les matchs de la phase finale avant de modifier les 32 finalistes.';
  end if;

  update public.profiles
    set is_qualified = false, qualification_seed = null
    where is_qualified = true or qualification_seed is not null;

  foreach v_id in array p_player_ids loop
    v_seed := v_seed + 1;
    update public.profiles set is_qualified = true, qualification_seed = v_seed where id = v_id;
  end loop;
  return 32;
end;
$$;
grant execute on function public.set_final_qualifiers(uuid[]) to authenticated;

-- ============================================================
-- VÉRIFICATION
-- ============================================================
-- select 'trente_deuxieme'::public.match_phase; -- doit réussir
-- select column_name from information_schema.columns where table_name='matches' and column_name like '%retour%';
-- doit renvoyer : score1_retour, score2_retour, damage1_retour, damage2_retour, scheduled_at_retour


-- ============================================================================
-- SOURCE REGROUPÉE : migration_super_admin_security.sql
-- ============================================================================
-- ============================================================================
-- MIGRATION : Super-admin, journal d'audit & sécurité
-- LA BATAILLE DES CHAROS
-- À exécuter APRÈS toutes les migrations précédentes
-- ============================================================================
-- Contenu :
--   1. Nouveau rôle "super_admin" (au-dessus de "admin")
--   2. is_super_admin() + promotion manuelle
--   3. Journal d'audit automatique (qui a fait quoi, quand, avant/après)
--   4. Détection d'anomalies (rafale d'actions, suppression massive,
--      tentative d'auto-élévation de rôle, activité hors-heures)
--   5. Table security_alerts, réservée au(x) super-admin(s)
--   6. Notification automatique (in-app, via la table notifications déjà
--      existante) + point d'accroche pour l'email (Database Webhook, voir
--      supabase/functions/send-security-alert)
--
-- ⚠️ IMPORTANT — À EXÉCUTER EN DEUX ÉTAPES SÉPARÉES ⚠️
-- PostgreSQL interdit d'utiliser une nouvelle valeur d'enum dans la même
-- transaction que celle qui l'a créée ("unsafe use of new value... must be
-- committed before they can be used"). Le SQL Editor de Supabase exécute
-- tout le script collé comme UNE seule transaction.
--
--   ÉTAPE 1 : sélectionne uniquement le bloc "ÉTAPE 1" ci-dessous, exécute-le
--             seul, attends la confirmation.
--   ÉTAPE 2 : sélectionne ensuite tout le reste du fichier (à partir de
--             "ÉTAPE 2") et exécute-le.
-- ============================================================================

-- ============================================================================
-- ÉTAPE 1 — à exécuter seule, puis valider avant de passer à la suite
-- ============================================================================

-- ============================================================================
-- FIN DE L'ÉTAPE 1. Exécute ce bloc seul, PUIS lance l'étape 2 séparément.
-- ============================================================================


-- ============================================================================
-- ÉTAPE 2 — à exécuter dans une NOUVELLE requête, après l'étape 1
-- ============================================================================

-- 2. Fonctions de rôle --------------------------------------------------------
create or replace function public.is_super_admin()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.profiles
    where id = auth.uid() and role = 'super_admin'
  );
$$;

-- is_admin() doit désormais aussi être vrai pour un super_admin
create or replace function public.is_admin()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.profiles
    where id = auth.uid() and role in ('admin','super_admin')
  );
$$;

-- Promotion manuelle initiale : remplace CES adresses par les tiennes puis
-- exécute cette section UNE SEULE FOIS. Un super-admin reste aussi admin.
update public.profiles
   set role = 'super_admin'
 where email in ('eadande2@gmail.com')   -- <-- adresse(s) du/des super-admin(s)
   and role <> 'super_admin';

comment on function public.is_super_admin is 'Vrai si l''utilisateur courant est super-admin (accès sécurité + audit complet).';

-- 3. Journal d'audit ----------------------------------------------------------
create table if not exists public.audit_log (
  id           uuid primary key default gen_random_uuid(),
  actor_id     uuid references public.profiles(id) on delete set null,
  actor_pseudo text,
  actor_role   text,
  action       text not null,              -- insert | update | delete
  entity_type  text not null,               -- profiles | matches | groups | announcements
  entity_id    uuid,
  entity_label text,                        -- ex: "Pseudo1 vs Pseudo2", pratique pour l'affichage
  changes      jsonb,                       -- { champ: { avant, apres } } pour un update
  created_at   timestamptz not null default now()
);

create index if not exists idx_audit_log_created on public.audit_log(created_at desc);
create index if not exists idx_audit_log_actor on public.audit_log(actor_id, created_at desc);
create index if not exists idx_audit_log_entity on public.audit_log(entity_type, entity_id);

alter table public.audit_log enable row level security;

drop policy if exists "audit_log_admin_select" on public.audit_log;
create policy "audit_log_admin_select"
  on public.audit_log for select
  using (public.is_admin());

-- 4. Alertes de sécurité -------------------------------------------------------
create table if not exists public.security_alerts (
  id           uuid primary key default gen_random_uuid(),
  severity     text not null default 'medium' check (severity in ('low','medium','high','critical')),
  type         text not null,               -- activity_burst | mass_delete | role_escalation | off_hours | new_admin_login
  message      text not null,
  actor_id     uuid references public.profiles(id) on delete set null,
  actor_pseudo text,
  details      jsonb,
  resolved     boolean not null default false,
  resolved_by  uuid references public.profiles(id) on delete set null,
  resolved_at  timestamptz,
  created_at   timestamptz not null default now()
);

create index if not exists idx_security_alerts_created on public.security_alerts(created_at desc);
create index if not exists idx_security_alerts_unresolved on public.security_alerts(resolved) where resolved = false;

alter table public.security_alerts enable row level security;

drop policy if exists "security_alerts_super_admin_select" on public.security_alerts;
create policy "security_alerts_super_admin_select"
  on public.security_alerts for select
  using (public.is_super_admin());

drop policy if exists "security_alerts_super_admin_update" on public.security_alerts;
create policy "security_alerts_super_admin_update"
  on public.security_alerts for update
  using (public.is_super_admin())
  with check (public.is_super_admin());

-- 5. Fonction utilitaire : créer une alerte + notifier tous les super-admins --
create or replace function public.raise_security_alert(
  p_severity text, p_type text, p_message text,
  p_actor_id uuid, p_actor_pseudo text, p_details jsonb
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_alert_id uuid;
  v_super record;
begin
  insert into public.security_alerts (severity, type, message, actor_id, actor_pseudo, details)
  values (p_severity, p_type, p_message, p_actor_id, p_actor_pseudo, p_details)
  returning id into v_alert_id;

  for v_super in select id from public.profiles where role = 'super_admin' loop
    insert into public.notifications (recipient_id, actor_id, type, title, body, link, entity_id)
    values (
      v_super.id, p_actor_id, 'security_alert',
      case p_severity
        when 'critical' then '🚨 Alerte sécurité critique'
        when 'high' then '⚠️ Alerte sécurité'
        else 'Alerte sécurité'
      end,
      p_message, '/admin?tab=securite', v_alert_id
    );
  end loop;
end;
$$;

-- 6. Journalisation générique + détection d'anomalies --------------------------
create or replace function public.fn_audit_row_change()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_actor_id     uuid := auth.uid();
  v_actor_pseudo text;
  v_actor_role   text;
  v_changes      jsonb := '{}'::jsonb;
  v_label        text;
  v_key          text;
  v_recent_count int;
begin
  select pseudo, role into v_actor_pseudo, v_actor_role from public.profiles where id = v_actor_id;

  if tg_op = 'UPDATE' then
    for v_key in select jsonb_object_keys(to_jsonb(new)) loop
      if to_jsonb(old) ->> v_key is distinct from to_jsonb(new) ->> v_key
         and v_key not in ('updated_at') then
        v_changes := v_changes || jsonb_build_object(
          v_key, jsonb_build_object('avant', to_jsonb(old) ->> v_key, 'apres', to_jsonb(new) ->> v_key)
        );
      end if;
    end loop;
    if v_changes = '{}'::jsonb then
      return new; -- rien de significatif n'a changé (ex: juste updated_at)
    end if;
  end if;

  if tg_table_name = 'matches' then
    v_label := coalesce(
      (select pseudo from public.profiles where id = coalesce(new.player1_id, old.player1_id)), '—'
    ) || ' vs ' || coalesce(
      (select pseudo from public.profiles where id = coalesce(new.player2_id, old.player2_id)), '—'
    );
  elsif tg_table_name = 'profiles' then
    v_label := coalesce(new.pseudo, old.pseudo);
  elsif tg_table_name = 'announcements' then
    v_label := coalesce(new.title, old.title, left(coalesce(new.body, old.body, ''), 60));
  elsif tg_table_name = 'groups' then
    v_label := coalesce(new.name, old.name);
  end if;

  insert into public.audit_log (actor_id, actor_pseudo, actor_role, action, entity_type, entity_id, entity_label, changes)
  values (
    v_actor_id, v_actor_pseudo, v_actor_role, lower(tg_op), tg_table_name,
    coalesce(new.id, old.id), v_label,
    case when tg_op = 'UPDATE' then v_changes else null end
  );

  -- Détection : élévation de rôle vers admin/super_admin -------------------
  -- IMPORTANT : cette fonction est partagée par plusieurs tables (matches,
  -- profiles, groups, announcements). "new"/"old" sont des RECORD génériques,
  -- donc `new.role` ne doit JAMAIS être évalué dans la même condition qu'une
  -- table qui n'a pas de colonne "role" (ex: matches), sinon Postgres lève
  -- "record new has no field role". On isole donc le test dans un IF imbriqué
  -- qui n'est atteint QUE lorsque tg_table_name = 'profiles'.
  if tg_table_name = 'profiles' and tg_op = 'UPDATE' then
   if new.role is distinct from old.role
     and new.role in ('admin','super_admin') then
    perform public.raise_security_alert(
      'critical', 'role_escalation',
      format('Le rôle de "%s" est passé de %s à %s (modifié par %s).',
             new.pseudo, old.role, new.role, coalesce(v_actor_pseudo, 'système')),
      v_actor_id, v_actor_pseudo,
      jsonb_build_object('target_id', new.id, 'target_pseudo', new.pseudo, 'from', old.role, 'to', new.role)
    );
   end if;
  end if;

  -- Détection : rafale d'actions par le même compte (>25 en 5 minutes) -----
  if v_actor_id is not null then
    select count(*) into v_recent_count
    from public.audit_log
    where actor_id = v_actor_id and created_at > now() - interval '5 minutes';

    if v_recent_count = 25 then -- déclenche une seule fois par rafale
      perform public.raise_security_alert(
        'high', 'activity_burst',
        format('%s a effectué %s modifications en moins de 5 minutes — vérifie qu''il ne s''agit pas d''un compte compromis.',
               coalesce(v_actor_pseudo, 'Un compte'), v_recent_count),
        v_actor_id, v_actor_pseudo,
        jsonb_build_object('count', v_recent_count, 'window', '5 minutes')
      );
    end if;
  end if;

  -- Détection : suppressions en série (>8 en 10 minutes) --------------------
  if tg_op = 'DELETE' and v_actor_id is not null then
    select count(*) into v_recent_count
    from public.audit_log
    where actor_id = v_actor_id and action = 'delete' and created_at > now() - interval '10 minutes';

    if v_recent_count = 8 then
      perform public.raise_security_alert(
        'high', 'mass_delete',
        format('%s a supprimé %s éléments (%s) en moins de 10 minutes.',
               coalesce(v_actor_pseudo, 'Un compte'), v_recent_count, tg_table_name),
        v_actor_id, v_actor_pseudo,
        jsonb_build_object('count', v_recent_count, 'table', tg_table_name)
      );
    end if;
  end if;

  -- Détection : action admin hors plage horaire habituelle (00h-05h) --------
  if v_actor_role in ('admin','super_admin') and extract(hour from now()) between 0 and 4 then
    perform public.raise_security_alert(
      'low', 'off_hours',
      format('Action admin de "%s" entre minuit et 5h du matin (%s).', coalesce(v_actor_pseudo,'—'), tg_table_name),
      v_actor_id, v_actor_pseudo,
      jsonb_build_object('table', tg_table_name, 'action', tg_op)
    );
  end if;

  return coalesce(new, old);
end;
$$;

drop trigger if exists trg_audit_profiles on public.profiles;
create trigger trg_audit_profiles
  after insert or update or delete on public.profiles
  for each row execute function public.fn_audit_row_change();

drop trigger if exists trg_audit_matches on public.matches;
create trigger trg_audit_matches
  after insert or update or delete on public.matches
  for each row execute function public.fn_audit_row_change();

drop trigger if exists trg_audit_groups on public.groups;
create trigger trg_audit_groups
  after insert or update or delete on public.groups
  for each row execute function public.fn_audit_row_change();

drop trigger if exists trg_audit_announcements on public.announcements;
create trigger trg_audit_announcements
  after insert or update or delete on public.announcements
  for each row execute function public.fn_audit_row_change();

-- 7. Realtime pour audit_log / security_alerts (mise à jour live du panneau) --
alter publication supabase_realtime add table public.audit_log;
alter publication supabase_realtime add table public.security_alerts;

-- ============================================================================
-- Notes de déploiement
-- ============================================================================
-- 1. Remplace l'adresse dans la section 2 par le(s) email(s) du/des vrai(s)
--    super-admin(s), puis exécute ce script une fois dans Supabase SQL Editor.
-- 2. Les alertes créent automatiquement une notification in-app (cloche) pour
--    chaque super-admin, via la table notifications déjà existante.
-- 3. Pour recevoir aussi un EMAIL à chaque alerte, déployer la fonction
--    supabase/functions/send-security-alert puis créer, comme pour les push,
--    un Database Webhook sur security_alerts -> INSERT qui appelle cette
--    fonction avec l'en-tête x-alert-secret: <SECURITY_ALERT_WEBHOOK_SECRET>.
-- 4. Le journal d'audit capture désormais TOUTE modification faite par un
--    compte connecté sur profiles / matches / groups / announcements, avec
--    l'identité exacte de l'auteur (actor_pseudo) — visible par tous les
--    admins dans Admin > Journal.
-- ============================================================================


-- ============================================================================
-- SOURCE REGROUPÉE : FIX_URGENT_new_has_no_field_role.sql
-- ============================================================================
-- ================================================================
-- CORRECTIF URGENT — erreur "record new has no field role"
-- ================================================================
-- Cause : la fonction d'audit public.fn_audit_row_change() est
-- partagée par plusieurs tables (matches, profiles, groups,
-- announcements). Le test "élévation de rôle admin" testait
-- `new.role` dans la MÊME condition que `tg_table_name = 'profiles'`,
-- au lieu d'un IF imbriqué séparé. Résultat : dès qu'on modifie un
-- match (qui n'a pas de colonne "role"), Postgres essaie quand même
-- de lire new.role et plante avec "record new has no field role".
--
-- Ce script ne fait que remplacer la fonction (CREATE OR REPLACE) :
-- aucune donnée n'est touchée, aucun trigger n'a besoin d'être
-- recréé (ils pointent déjà vers cette fonction par son nom).
-- Colle-le tel quel dans Supabase → SQL Editor → Run.
-- ================================================================

-- 6. Journalisation générique + détection d'anomalies --------------------------
create or replace function public.fn_audit_row_change()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_actor_id     uuid := auth.uid();
  v_actor_pseudo text;
  v_actor_role   text;
  v_changes      jsonb := '{}'::jsonb;
  v_label        text;
  v_key          text;
  v_recent_count int;
begin
  select pseudo, role into v_actor_pseudo, v_actor_role from public.profiles where id = v_actor_id;

  if tg_op = 'UPDATE' then
    for v_key in select jsonb_object_keys(to_jsonb(new)) loop
      if to_jsonb(old) ->> v_key is distinct from to_jsonb(new) ->> v_key
         and v_key not in ('updated_at') then
        v_changes := v_changes || jsonb_build_object(
          v_key, jsonb_build_object('avant', to_jsonb(old) ->> v_key, 'apres', to_jsonb(new) ->> v_key)
        );
      end if;
    end loop;
    if v_changes = '{}'::jsonb then
      return new; -- rien de significatif n'a changé (ex: juste updated_at)
    end if;
  end if;

  if tg_table_name = 'matches' then
    v_label := coalesce(
      (select pseudo from public.profiles where id = coalesce(new.player1_id, old.player1_id)), '—'
    ) || ' vs ' || coalesce(
      (select pseudo from public.profiles where id = coalesce(new.player2_id, old.player2_id)), '—'
    );
  elsif tg_table_name = 'profiles' then
    v_label := coalesce(new.pseudo, old.pseudo);
  elsif tg_table_name = 'announcements' then
    v_label := coalesce(new.title, old.title, left(coalesce(new.body, old.body, ''), 60));
  elsif tg_table_name = 'groups' then
    v_label := coalesce(new.name, old.name);
  end if;

  insert into public.audit_log (actor_id, actor_pseudo, actor_role, action, entity_type, entity_id, entity_label, changes)
  values (
    v_actor_id, v_actor_pseudo, v_actor_role, lower(tg_op), tg_table_name,
    coalesce(new.id, old.id), v_label,
    case when tg_op = 'UPDATE' then v_changes else null end
  );

  -- Détection : élévation de rôle vers admin/super_admin -------------------
  -- IMPORTANT : cette fonction est partagée par plusieurs tables (matches,
  -- profiles, groups, announcements). "new"/"old" sont des RECORD génériques,
  -- donc `new.role` ne doit JAMAIS être évalué dans la même condition qu'une
  -- table qui n'a pas de colonne "role" (ex: matches), sinon Postgres lève
  -- "record new has no field role". On isole donc le test dans un IF imbriqué
  -- qui n'est atteint QUE lorsque tg_table_name = 'profiles'.
  if tg_table_name = 'profiles' and tg_op = 'UPDATE' then
   if new.role is distinct from old.role
     and new.role in ('admin','super_admin') then
    perform public.raise_security_alert(
      'critical', 'role_escalation',
      format('Le rôle de "%s" est passé de %s à %s (modifié par %s).',
             new.pseudo, old.role, new.role, coalesce(v_actor_pseudo, 'système')),
      v_actor_id, v_actor_pseudo,
      jsonb_build_object('target_id', new.id, 'target_pseudo', new.pseudo, 'from', old.role, 'to', new.role)
    );
   end if;
  end if;

  -- Détection : rafale d'actions par le même compte (>25 en 5 minutes) -----
  if v_actor_id is not null then
    select count(*) into v_recent_count
    from public.audit_log
    where actor_id = v_actor_id and created_at > now() - interval '5 minutes';

    if v_recent_count = 25 then -- déclenche une seule fois par rafale
      perform public.raise_security_alert(
        'high', 'activity_burst',
        format('%s a effectué %s modifications en moins de 5 minutes — vérifie qu''il ne s''agit pas d''un compte compromis.',
               coalesce(v_actor_pseudo, 'Un compte'), v_recent_count),
        v_actor_id, v_actor_pseudo,
        jsonb_build_object('count', v_recent_count, 'window', '5 minutes')
      );
    end if;
  end if;

  -- Détection : suppressions en série (>8 en 10 minutes) --------------------
  if tg_op = 'DELETE' and v_actor_id is not null then
    select count(*) into v_recent_count
    from public.audit_log
    where actor_id = v_actor_id and action = 'delete' and created_at > now() - interval '10 minutes';

    if v_recent_count = 8 then
      perform public.raise_security_alert(
        'high', 'mass_delete',
        format('%s a supprimé %s éléments (%s) en moins de 10 minutes.',
               coalesce(v_actor_pseudo, 'Un compte'), v_recent_count, tg_table_name),
        v_actor_id, v_actor_pseudo,
        jsonb_build_object('count', v_recent_count, 'table', tg_table_name)
      );
    end if;
  end if;

  -- Détection : action admin hors plage horaire habituelle (00h-05h) --------
  if v_actor_role in ('admin','super_admin') and extract(hour from now()) between 0 and 4 then
    perform public.raise_security_alert(
      'low', 'off_hours',
      format('Action admin de "%s" entre minuit et 5h du matin (%s).', coalesce(v_actor_pseudo,'—'), tg_table_name),
      v_actor_id, v_actor_pseudo,
      jsonb_build_object('table', tg_table_name, 'action', tg_op)
    );
  end if;

  return coalesce(new, old);
end;
$$;

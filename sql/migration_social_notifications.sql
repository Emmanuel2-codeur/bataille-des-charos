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

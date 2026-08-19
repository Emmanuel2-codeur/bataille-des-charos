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

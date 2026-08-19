-- Correctif commentaires / réponses / réactions
-- À exécuter dans Supabase SQL Editor si les règles de la base n'ont pas encore été appliquées.

-- Réponses et commentaires : tout utilisateur authentifié ayant un profil peut publier sur une annonce publiée.
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

-- Réagir à un commentaire : un utilisateur connecté possédant un profil peut créer sa réaction.
drop policy if exists "comment_reactions_insert_members" on public.comment_reactions;
create policy "comment_reactions_insert_members"
  on public.comment_reactions for insert
  with check (
    auth.uid() = user_id
    and exists (select 1 from public.profiles p where p.id = auth.uid())
    and exists (
      select 1 from public.comments c
      where c.id = comment_id
    )
  );

-- Lecture publique des réactions pour que les compteurs soient visibles.
drop policy if exists "comment_reactions_select_public" on public.comment_reactions;
create policy "comment_reactions_select_public"
  on public.comment_reactions for select using (true);

-- Mise à jour / suppression de sa propre réaction.
drop policy if exists "comment_reactions_update_own" on public.comment_reactions;
create policy "comment_reactions_update_own"
  on public.comment_reactions for update
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

drop policy if exists "comment_reactions_delete_own_or_admin" on public.comment_reactions;
create policy "comment_reactions_delete_own_or_admin"
  on public.comment_reactions for delete
  using (auth.uid() = user_id or public.is_admin());

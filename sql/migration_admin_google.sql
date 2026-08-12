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

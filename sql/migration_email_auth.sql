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

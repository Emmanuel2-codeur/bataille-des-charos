-- ============================================================================
-- RESET AVANT LANCEMENT — à exécuter UNE SEULE FOIS, quand vous êtes prêts
-- à ouvrir les vraies inscriptions. Supprime toutes les données de test
-- (joueurs, matchs, annonces) mais garde la structure : les 10 groupes A-J
-- et les comptes admin restent en place.
--
-- ⚠️ IRRÉVERSIBLE. Vérifiez que c'est bien le bon projet Supabase avant de
-- lancer ce script.
-- ============================================================================

-- 1. Supprime tous les matchs de test (poules + phases finales)
delete from public.matches;

-- 2. Supprime toutes les annonces de test
delete from public.announcements;

-- 3. Détache tous les joueurs de leur groupe et réinitialise leurs stats,
--    SANS supprimer les comptes admin (ils restent joueurs + admin).
update public.profiles
  set group_id = null,
      total_points = 0,
      total_damage = 0,
      total_kills = 0,
      wins = 0,
      losses = 0,
      is_qualified = false,
      qualification_seed = null;

-- 4. Supprime les comptes joueurs de test qui ne sont pas admin.
--    (Les vrais joueurs se réinscriront eux-mêmes via Google/email.)
delete from auth.users u
  using public.profiles p
  where u.id = p.id
    and p.role <> 'admin';

-- Les lignes `profiles` correspondantes sont supprimées automatiquement
-- (foreign key `on delete cascade` vers auth.users).

-- 5. Les 10 groupes A à J restent en place : ce sont des données
--    structurelles du tournoi, pas des données de test.

-- ============================================================================
-- FIN — la base est prête pour les vraies inscriptions.
-- ============================================================================

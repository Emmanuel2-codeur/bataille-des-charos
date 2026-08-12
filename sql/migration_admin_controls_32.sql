-- ============================================================================
-- MIGRATION : Admin complet + Seizièmes de finale (32 joueurs)
-- À exécuter APRÈS les migrations existantes.
-- ============================================================================

-- 1. Ajouter la phase "seizieme" sans recréer les enums existants.
alter type public.match_phase add value if not exists 'seizieme' before 'huitieme';

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
    set is_qualified = false, qualification_seed = null;

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

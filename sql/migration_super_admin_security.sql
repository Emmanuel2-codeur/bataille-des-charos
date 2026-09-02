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
alter type public.user_role add value if not exists 'super_admin';
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
  if tg_table_name = 'profiles' and tg_op = 'UPDATE'
     and new.role is distinct from old.role
     and new.role in ('admin','super_admin') then
    perform public.raise_security_alert(
      'critical', 'role_escalation',
      format('Le rôle de "%s" est passé de %s à %s (modifié par %s).',
             new.pseudo, old.role, new.role, coalesce(v_actor_pseudo, 'système')),
      v_actor_id, v_actor_pseudo,
      jsonb_build_object('target_id', new.id, 'target_pseudo', new.pseudo, 'from', old.role, 'to', new.role)
    );
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

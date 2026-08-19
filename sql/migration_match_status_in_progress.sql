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

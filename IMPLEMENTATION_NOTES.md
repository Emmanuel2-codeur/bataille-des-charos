# Nouvelles fonctionnalités — La Bataille des Charos

## 1. Migration Supabase

Dans Supabase > SQL Editor, exécuter dans cet ordre :

1. `sql/schema.sql` (si nouvelle base)
2. les migrations déjà utilisées par le projet
3. `sql/migration_dashboard_v2.sql`
4. `sql/migration_social_notifications.sql`

La nouvelle migration ajoute :
- `announcements.category` et `announcements.image_url`
- commentaires imbriqués avec `parent_id`
- réactions J'aime / J'adore / 🔥 / Wow
- centre de notifications
- abonnements Web Push
- notifications automatiques pour joueurs et admins
- contrôle manuel/automatique du statut des matchs
- Realtime pour notifications, commentaires et réactions

## 2. Matchs

L'ordre de la page `/matchs` est :
1. En direct
2. À venir
3. Terminés

Le passage `scheduled -> live` est automatique avec `pg_cron` si la programmation du projet est activée. Le navigateur calcule aussi l'état affiché pour éviter d'attendre la prochaine minute.

Un admin peut forcer un statut avec `status_override`.

## 3. Notifications intégrées

Les notifications sont affichées dans la cloche de la navbar :
- badge non lu
- marquer comme lu
- tout marquer comme lu
- notifications Realtime
- notification système lorsque la permission navigateur est accordée

## 4. Web Push lorsque le site est fermé

Pour activer les vraies notifications push hors site :

Variables frontend :
`VITE_VAPID_PUBLIC_KEY`

Secrets de la fonction Supabase `send-push` :
- `VAPID_PUBLIC_KEY`
- `VAPID_PRIVATE_KEY`
- `VAPID_SUBJECT`
- `PUSH_WEBHOOK_SECRET`
- `SUPABASE_SERVICE_ROLE_KEY`

Déployer :
`supabase/functions/send-push/index.ts`

Puis créer un Database Webhook Supabase sur :
`public.notifications` → `INSERT`

Le webhook doit appeler la fonction `send-push` et envoyer le secret dans l'en-tête :
`x-push-secret: <PUSH_WEBHOOK_SECRET>`

Le navigateur doit d'abord avoir activé les notifications depuis la cloche.

## 5. Annonces

Nouvelle page :
`/annonces`

Les admins peuvent publier :
- titre
- texte
- catégorie
- URL d'image

Les joueurs approuvés et les admins peuvent :
- commenter
- répondre à n'importe quel commentaire
- réagir
- modifier/supprimer leurs propres commentaires

Les admins peuvent modérer les commentaires.

## 6. Sécurité

Le fichier `.env` original n'est volontairement pas inclus dans cette archive de travail. Conserve tes variables locales dans ton propre `.env`.

## Modifications supplémentaires — navigation, matchs et médias

- Les liens de navigation sont centralisés dans `src/config.js`.
- `Bracket` a été retiré de la navbar et son accès est disponible depuis `Classement`.
- `Matchs` reprend la carte de match de l'ancienne page et conserve les sections `En direct`, `À venir`, `Terminés`.
- Les matchs sont automatiquement classés Live > À venir > Terminés côté interface.
- La page `/dashboard` redirige vers `/matchs`; il n'existe plus de lien navbar vers une page Live dédiée.
- Les annonces et commentaires supportent maintenant des fichiers via Supabase Storage.
- L'admin téléverse directement une image lors de la création/modification d'une annonce; aucune URL d'image n'est demandée.
- Les commentaires et réponses peuvent recevoir une image ou un fichier (10 Mo maximum).
- Exécuter `sql/migration_media_comments.sql` après `sql/migration_social_notifications.sql`.
- Le bucket Supabase utilisé est `announcement-media`.
- Si l'envoi d'un commentaire échouait auparavant avec une erreur RLS, la nouvelle migration autorise tout utilisateur authentifié qui possède un profil à commenter/réagir.

## Mise à jour UX/UI — statut des matchs

- `live` a été renommé en `in_progress` dans le statut PostgreSQL.
- La page `/matchs` affiche uniquement `En cours` puis `À venir`.
- Un match validé (`completed`) disparaît automatiquement de `/matchs` et reste dans `/historique`.
- La migration `sql/migration_match_status_in_progress.sql` doit être exécutée une fois sur une base existante.
- L'accueil affiche maintenant les 3 dernières annonces de la guilde avec un bouton `Voir plus` vers `/annonces`.
- La palette `ink` existante n'a pas été remplacée : les nouveaux composants réutilisent les nuances déjà présentes.

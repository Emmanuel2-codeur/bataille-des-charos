# Correctifs intégrés — Bataille des Charos

## 1. Menu mobile
- Le menu mobile est maintenant rendu comme un panneau blanc positionné sous la barre de navigation.
- Aucun fond sombre/overlay n'est ajouté quand on ouvre les trois traits.
- Le menu se ferme avec `Échap` et lorsque l'écran repasse en largeur desktop.
- Le défilement de la page est bloqué pendant l'ouverture du menu, sans assombrir le contenu.

Fichier : `src/components/Navbar.jsx`

## 2. Réponses aux commentaires
Le bouton `Répondre` existait déjà, mais l'affichage et l'enregistrement d'une réponse dépendent des règles Supabase sur `comments`. Une migration de sécurité/cohérence est fournie pour autoriser les réponses d'un utilisateur connecté ayant un profil.

Fichier : `sql/migration_comments_mobile_fix.sql`

## 3. Réactions sur les commentaires
Le front chargeait uniquement les réactions de l'annonce et les passait aux commentaires. Les réactions de commentaires n'étaient donc jamais récupérées correctement.

Correctif :
- chargement de `comment_reactions` pour les commentaires présents ;
- affichage des compteurs/réactions par commentaire ;
- conservation du système de sélection J’aime / J’adore / 🔥 / Wow ;
- actualisation après chaque réaction ;
- abonnement Realtime conservé.

Fichier : `src/pages/Annonces.jsx`

## À faire dans Supabase
Exécuter une seule fois `sql/migration_comments_mobile_fix.sql` dans le SQL Editor de Supabase, surtout si les réponses/réactions retournent encore une erreur de permission RLS.

Le fichier `.env` n'est pas inclus dans l'archive livrée. Reprendre les variables de votre projet dans `.env` à partir de `.env.example`.

### Correction realtime des notifications
Le canal Supabase Realtime utilise maintenant un nom unique à chaque montage du composant et est correctement supprimé au démontage. Cela évite l'erreur `cannot add postgres_changes callbacks ... after subscribe()` observée avec React 18 StrictMode / les remounts du composant.


# La Bataille des Charos — Plateforme Esport

Site officiel du tournoi Free Fire 1v1 organisé par la guilde **MÉCHANTCHARO**.
Généré à partir du cahier des charges technique et fonctionnel, en respectant la
direction artistique de la maquette fournie (fond sombre, accents orange, cartes
et sections claires en contraste).

## Stack

- **Front-end** : React 18 + Vite, React Router, Tailwind CSS, lucide-react (icônes)
- **Back-end** : Supabase (PostgreSQL, Auth Google OAuth, Realtime, RLS)

## Démarrage rapide

```bash
npm install
cp .env.example .env      # renseigner VITE_SUPABASE_URL et VITE_SUPABASE_ANON_KEY
npm run dev
```

## Base de données Supabase

1. Ouvrir votre projet Supabase → **SQL Editor**.
2. Exécuter le contenu de `sql/schema.sql` (dans l'ordre, en une seule fois).
   Ce script crée :
   - les types énumérés (rôles, statuts, phases, types de match…)
   - les tables `profiles`, `groups`, `matches`
   - les triggers : création automatique du profil à l'inscription, calcul du
     vainqueur, **propagation automatique du vainqueur dans le bracket**
     (`next_match_id` / `next_match_slot`), recalcul des stats joueurs
   - la fonction `compute_qualifications()` qui calcule le Top 16 (10 premiers de
     groupe + 6 meilleurs deuxièmes, départagés aux dégâts)
   - les policies RLS (lecture publique, écriture réservée aux admins)
   - l'activation de Supabase Realtime sur `matches` et `profiles`
   - le seed des 10 groupes A → J
3. Dans **Authentication → Providers**, activer **Google OAuth** (client ID / secret
   Google Cloud requis — voir la doc Supabase).
4. `schema.sql` élève déjà automatiquement **eadande2@gmail.com** et
   **mechantcharoguilde@gmail.com** en `role='admin'` + `status='approved'`
   dès leur première connexion Google — pas besoin de validation manuelle.
   Un admin reste aussi un joueur normal : même profil, il peut renseigner
   un pseudo, rejoindre un groupe et apparaître au classement comme tout
   le monde. (Pour changer ou ajouter des admins plus tard, éditer la
   fonction `is_configured_admin_email()` dans `schema.sql`.)
5. Si `schema.sql` avait déjà été exécuté avant cette version, exécuter plutôt
   `sql/migration_admin_google.sql` : elle met à jour la fonction avec ces
   2 adresses et **rétro-promeut** les comptes déjà existants, sans attendre
   une nouvelle connexion.

### Comment fonctionne l'inscription

- Un joueur clique **Continuer avec Google** sur `/connexion` → son profil est
  créé automatiquement avec `status = 'pending'`.
- Il choisit son pseudo sur `/profil`. Tant que son statut est `pending`, il
  n'apparaît pas dans le classement.
- Un admin ouvre `/admin` (accès bloqué côté app + RLS pour tout le monde
  d'autre) et clique **Approuver**. Le joueur passe en `status = 'approved'`.
- La prochaine fois que ce joueur revient sur le site, sa session Supabase est
  toujours active : il est automatiquement reconnecté en tant que joueur
  approuvé, sans rien refaire.

## Structure des pages (conforme au cahier des charges)

| Route          | Page                    | Section du cahier des charges |
|-----------------|-------------------------|--------------------------------|
| `/`             | Landing page publique   | 3.1 |
| `/dashboard`    | Dashboard live & matchs du jour | 3.2 |
| `/groupes`      | Classements des 10 poules | 2, 5 |
| `/bracket`      | Arbre de compétition (swipe mobile) | 3.3 |
| `/reglement`    | Règlement complet & lots | 2, 3.1 |
| `/connexion`    | Connexion Google OAuth  | 3.1, 4 |
| `/admin`        | Panneau d'administration (protégé RLS) | 6 |

## Assets

Le logo fourni (`src/assets/logo.jpg`) est utilisé dans la navbar, le footer,
la page de connexion et le favicon (`public/logo.jpg`).

## Notes

- Les données affichées sur `/dashboard`, `/groupes`, `/bracket` et `/admin` sont
  actuellement des données de démonstration (mock) : branchez `src/lib/supabaseClient.js`
  sur vos tables (`matches`, `profiles`, `groups`) pour passer en production.
- `signInWithGoogle()` dans `src/lib/supabaseClient.js` gère la connexion réelle
  via Supabase Auth.

## Mise à jour — Dashboard admin v2 (invitations, programmation, annonces)

### 1. Migration SQL à exécuter (Supabase > SQL Editor)

Dans l'ordre, si pas déjà fait :
1. `sql/schema.sql`
2. `sql/migration_email_auth.sql`
3. `sql/migration_admin_google.sql`
4. **`sql/migration_dashboard_v2.sql`** ← nouveau : kills totaux, classement par kills/dégâts,
   liste des invitations avec email, table `announcements`, passage automatique en Live via `pg_cron`.

⚠️ Avant l'étape 4 : allez dans **Database > Extensions** et activez **pg_cron** si ce n'est pas déjà fait
(certains projets Supabase ne l'activent pas par défaut).

### 2. Avant le vrai lancement du tournoi

Exécutez **une seule fois**, quand vous êtes prêts à ouvrir les vraies inscriptions :
`sql/reset_before_launch.sql` — vide tous les joueurs/matchs/annonces de test, garde les 10 groupes A-J
et les comptes admin.

### 3. Ce qui a changé côté site

- **Admin** (`/admin`) : 4 sections — Accepter les invitations (+ choix du groupe), Programmer un match,
  Valider le score du match, Ajouter une information.
- **Accueil** : nouvelle section "Annonces de la guilde", alimentée par ce que l'admin publie.
- **Poules, Dashboard, Bracket** : ne contiennent plus aucune donnée de démonstration —
  tout vient de Supabase en temps réel, avec un message clair quand une section est encore vide.
- **Classement** : trié par kills puis dégâts (colonne `total_kills`, maintenue automatiquement).
- Un match programmé passe seul en "Live" à l'heure prévue (pg_cron, côté serveur — fonctionne
  même si personne n'a le site ouvert), et un match validé par l'admin quitte le Live pour l'Historique.

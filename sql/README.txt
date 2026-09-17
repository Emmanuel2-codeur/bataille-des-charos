# SQL réduit — La Bataille des Charos

Le dossier passe de nombreux fichiers SQL à 3 fichiers principaux :

1. `01_schema.sql` — schéma de base.
2. `02_migration_complete.sql` — toutes les évolutions regroupées, avec les doublons de bracket final supprimés.
3. `03_reset_before_launch.sql` — reset des données de test avant lancement.

## Pour une base déjà existante

Dans `02_migration_complete.sql` :

- Exécuter uniquement `ÉTAPE 1 — ENUMS`.
- Valider avec Run.
- Puis exécuter le reste du fichier.

Cette séparation est nécessaire à cause de PostgreSQL : une nouvelle valeur d'enum ne peut pas être utilisée dans la même transaction que celle qui vient de la créer.

## Fichiers volontairement retirés comme doublons

Les anciennes versions `migration_finales_16.sql`, `PHASE_FINALE_16_A_EXECUTER.sql` et `migration_final_bracket_validation.sql` ne sont pas recopiées séparément : leurs fonctionnalités sont reprises dans le bracket final consolidé.

`migration_comments_mobile_fix.sql` n'est pas recopiée séparément car les règles commentaires/réactions sont déjà reprises par la migration médias/commentaires.

## Attention

Avant d'exécuter sur la production, faire une sauvegarde de la base Supabase.

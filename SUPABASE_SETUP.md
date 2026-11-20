# Mise en service de la synchronisation Pokawa Kitchen

L'application possède déjà les connexions Supabase et les abonnements Realtime côté navigateur. Cette étape met en service les migrations SQL et les Edge Functions nécessaires pour les comptes partagés et la connexion par PIN.

## Secrets GitHub à ajouter

Dans **Settings → Secrets and variables → Actions** du dépôt, créer deux *Repository secrets* :

- `SUPABASE_ACCESS_TOKEN` : jeton d'accès personnel créé dans le compte Supabase (Account → Access Tokens).
- `SUPABASE_DB_PASSWORD` : mot de passe de la base de données de ce projet Supabase.

Le Project Ref est déjà renseigné dans le workflow : `kweckmiczarcspuzchzo`.

Ne jamais publier ces valeurs, ni le mot de passe de base de données, ni une clé `service_role` dans le code ou dans une conversation.

## Lancer le déploiement

Une fois les deux secrets enregistrés :

1. Ouvrir l'onglet **Actions** du dépôt GitHub.
2. Choisir **Deploy Pokawa Kitchen backend**.
3. Cliquer sur **Run workflow** sur la branche `main`.
4. Vérifier que les étapes de migrations SQL et des quatre Edge Functions terminent avec succès.

Le workflow appliquera les migrations SQL, dont l'activation de Realtime pour les tables `profiles`, `checklist_tasks`, `checklist_completions`, `daily_context` et `audit_events`, puis publiera les Edge Functions.

## Important

Les comptes et modifications déjà créés en mode démo sont conservés uniquement dans le stockage local de chaque appareil : ils ne sont pas automatiquement transférés dans Supabase. Après activation du backend, utiliser le mode connecté pour créer les vrais comptes partagés et les utiliser sur tous les appareils.

Si l'étape SQL échoue en indiquant qu'une table de base est absente, ne pas ignorer l'erreur : il faudra d'abord vérifier le schéma déjà présent dans le projet Supabase avant de poursuivre.

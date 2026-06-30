# Patrimoine

Application personnelle de suivi de patrimoine (compte courant, épargne, investissement, crypto), saisie 100% manuelle. Aucune donnée bancaire réelle n'est demandée ni stockée.

## Stack
- HTML / CSS / JavaScript vanilla (aucune étape de build)
- [Chart.js](https://www.chartjs.org/) via CDN
- [Supabase](https://supabase.com/) pour la base de données et l'authentification (email/mot de passe), avec Row Level Security : chaque utilisateur ne voit que ses propres données.

## Structure
- `index.html` — structure de la page (écran de connexion, onboarding, tableau de bord, comptes, dépenses, journal)
- `style.css` — thème "carnet d'épargne" (parchemin, encre marine, doré, sauge, rouille)
- `app.js` — toute la logique de l'application
- `config.js` — URL et clé publique ("anon") du projet Supabase
- `supabase/schema.sql` — script SQL à exécuter dans le SQL Editor de Supabase pour créer les tables et les règles de sécurité

## Configuration
1. Créer un projet sur [supabase.com](https://supabase.com)
2. Exécuter `supabase/schema.sql` dans le SQL Editor du projet
3. Renseigner `url` et `anonKey` dans `config.js` (Project Settings > API)
4. Activer GitHub Pages sur ce dépôt (Settings > Pages > Source = branche `main`, dossier `/`)

## Modifier l'application
Demander à Claude (ou tout autre assistant) de modifier les fichiers `index.html`, `style.css` ou `app.js` directement — aucune compilation nécessaire, il suffit de pousser les changements sur GitHub pour que le site se mette à jour (1-2 minutes de déploiement).

**Important** : si vous modifiez `app.js`, incrémentez le numéro de version dans `index.html` (`<script src="app.js?v=3">` → `?v=4`, etc.). Sans cela, les navigateurs des utilisateurs peuvent continuer à charger une version mise en cache de l'ancien fichier.

## URL et accès
- Site : https://lucaskfr.github.io/patrimoine-app/
- Dépôt GitHub : https://github.com/lucaskfr/patrimoine-app
- Projet Supabase : https://supabase.com/dashboard/project/rpgxqkcfijsuwyheagzz

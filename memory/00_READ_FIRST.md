# 00 - À LIRE EN PREMIER (début de chaque session)

Projet : **PharmaLoc** - concours **CADEV 2026** (SYSTALINK SENEGAL). Claude = ingénieur principal.
Le bac à sable de Claude est **réinitialisé entre les sessions** : ces fichiers sont la seule mémoire fiable.

## Protocole de début de session
1. L'utilisateur doit fournir le projet : **zip du dépôt** (ou au minimum le dossier `memory/`).
2. Lire dans l'ordre : `00_READ_FIRST.md` -> `REGLEMENT_CADEV.md` -> `PROJECT_BRIEF.md` -> `PROGRESS.md` -> `DECISIONS.md` -> `CONVENTIONS.md` -> dernière entrée de `SESSION_LOG.md`.
3. **Vérifier l'état réel** avant de coder (ne pas croire la mémoire aveuglément) :
   `cd backend && npm ci && npm run typecheck` puis démarrer une base de test (voir CONVENTIONS) et `npm test` ; puis `cd ../frontend && npm ci && npm run build`.
4. Annoncer en 3 lignes : où on en est, ce qu'on fait dans cette session, les questions ouvertes.

## Protocole de fin de session (OBLIGATOIRE, même si la session est interrompue)
1. Mettre à jour `PROGRESS.md` (cocher/décocher honnêtement - n'écrire "fait" que si testé).
2. Ajouter une entrée datée dans `SESSION_LOG.md` (fait / décidé / problèmes / prochaine étape précise).
3. Ajouter à `DECISIONS.md` toute décision d'architecture ou de licence.
4. Régénérer `LICENSES.md` si une dépendance a changé : `node scripts/scan_licenses.js && node scripts/gen_licenses.js` (depuis la racine).
5. Livrer un **zip à jour** (sans `node_modules`, `.next`, `dist`) et rappeler à l'utilisateur de le conserver + de le renvoyer à la prochaine session.

## Règles d'or (rappel)
- Pas d'assistant médical / diagnostic IA. IA = outil de dev uniquement (déclarée dans `AI_USAGE.md`).
- Zéro GPL/AGPL/LGPL (cf. `LICENSES.md`, surtout le piège `sharp`).
- Ne jamais casser l'existant ; une phase = analyser, implémenter, tester, vérifier les anciennes fonctions.
- Permissions toujours vérifiées **côté serveur**.
- Aucune commande automatique auprès d'un fournisseur sans validation du pharmacien (v1).
- Géolocalisation uniquement avec consentement.

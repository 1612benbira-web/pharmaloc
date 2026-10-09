# CONVENTIONS

## Structure backend (`backend/src`)
- `config/` env (Zod, échoue au démarrage si invalide), db
- `models/` schémas Mongoose uniquement (+ `roles.ts`)
- `modules/<domaine>/` : `*.validators.ts` (Zod) - `*.repository.ts` (SEUL accès Mongoose, mockable) - `*.service.ts` (logique métier) - `*.controller.ts` (HTTP fin) - `*.routes.ts`
- `middleware/` auth, validate, rateLimit, errorHandler
- `services/` transverses (audit, bientôt events/notifications)
- `utils/` AppError, asyncHandler, pagination, logger
- `routes/index.ts` monte tous les modules sous `/api`
- Fichiers courts ; pas de logique métier dans les controllers.

## Écarts par rapport à la structure idéale
Les modules ajoutés en phases 2-5 regroupent schémas Zod + handlers + router dans un seul `*.routes.ts` (petits fichiers) ; la logique métier est toujours dans un `*.service.ts` (stock, orders, deliveries, payments, supplier-deliveries). Seul `users` garde le triptyque repository/controller. Tests = vraie base (D-09).

## Tests : base MongoDB-compatible requise
- Réelle : `TEST_MONGODB_URI=mongodb://127.0.0.1:27017/pharmaloc_test npm test` (+ `MONGO_REAL=1` pour le test de concurrence).
- Bac à sable Claude : télécharger `https://github.com/FerretDB/FerretDB/releases/download/v1.24.0/ferretdb-linux-amd64` dans /tmp, puis la lancer **détachée** : `setsid nohup ./ferretdb --handler=sqlite --sqlite-url=file:/tmp/ferret/ --listen-addr=127.0.0.1:27017 --telemetry=disable &` (elle meurt entre deux appels d'outil : relancer avant chaque `vitest`). Ne jamais utiliser `pkill -f "motif"` dans la commande : ça tue le shell.
- Ne jamais mettre FerretDB dans le dépôt ni dans le déploiement.

## Ajouter un module (recette)
1. validators Zod (`.strict()` sur les body) -> 2. repository -> 3. service -> 4. controller -> 5. routes avec `authenticate` + `authorize(...)` + `validate({...})` + `asyncHandler` -> 6. monter dans `routes/index.ts` -> 7. tests (succès, 401, 403, 422) -> 8. `npm run typecheck && npm test`.

## Règles
- Réponses : `{ data, meta? }` ; erreurs : `{ error: { code, message, details? } }`.
- Erreurs métier = `AppError.*` ; jamais de `res.status(500)` à la main.
- Tout endpoint de liste est **paginé** (`paginationSchema`, max 100).
- Toute opération sensible appelle `audit({...})`.
- Messages utilisateur en **français**, code/identifiants en anglais.
- Les changements de stock = **service unique** qui écrit stock + StockMovement ensemble (jamais de `Stock.update` direct dans un controller).
- Nouvelle dépendance => vérifier la licence AVANT (`npm view <pkg> license`), puis régénérer `LICENSES.md`. Interdit : GPL, AGPL, LGPL (y compris binaires natifs transitifs).

## Commandes
- Backend : `npm run dev | typecheck | test | build | start` (copier `.env.example` en `.env`)
- Frontend : `npm run dev | build | typecheck` (copier `.env.example` en `.env.local`)
- Licences (racine) : `node scripts/scan_licenses.js && node scripts/gen_licenses.js`
- Piège shell : le shell du bac à sable est `sh` (dash) : pas d'expansion `{a,b}`.

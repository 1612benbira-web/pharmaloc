# DECISIONS - journal des décisions (ne jamais réécrire l'historique, ajouter à la fin)

## Décisions prises
- **D-01 (2026-10-07)** Backend : Express **4** (pas 5), Zod **3**, Mongoose 8. TypeScript 7 => `module/moduleResolution: nodenext` (node10 supprimé), projet CommonJS ; les imports relatifs sans extension marchent dans `src/` mais les **imports dynamiques dans `tests/` exigent `.js`**.
- **D-02** Auth : JWT HS256, access 15 min + refresh 7 j renvoyés dans le corps JSON ; claim `tv` = `tokenVersion` en base. Logout / désactivation incrémentent `tokenVersion` => tous les jetons meurent. Le middleware relit l'utilisateur en base à chaque requête (pas de confiance au JWT seul). Pas de refresh rotation / cookie httpOnly en v1 (amélioration possible).
- **D-03** Inscription publique = toujours PATIENT, schéma `.strict()` (champ `role` => 422). Autres rôles créés par ADMIN via POST /api/users. Le premier ADMIN viendra du **seed** (phase 7).
- **D-04** Tests : le binaire MongoDB n'est pas téléchargeable dans le bac à sable (réseau limité) => tests d'intégration HTTP avec **dépôt utilisateur factice en mémoire** (`tests/helpers/fakeUserRepo.ts`) et `audit` mocké. Règle : tout accès Mongoose passe par un `*.repository.ts` mockable. **TODO** : ajouter des tests contre une vraie MongoDB (local de l'utilisateur / CI) pour la logique stock atomique (phase 2-3) - les mocks ne prouvent pas l'atomicité.
- **D-05** Licences : `sharp` (libvips LGPL) neutralisé par `overrides` + stub MIT + `images.unoptimized`. `lightningcss` (MPL-2.0) accepté car dev-only (vitest). Voir `LICENSES.md`.
- **D-06** Frontend : Next 16 + React 19 + Tailwind **3** (pas v4, stabilité), `output: 'standalone'`. shadcn/ui reporté à la phase 6 (CLI interactive ; composants MIT, vérifier `lucide-react` ISC et `radix-ui` MIT).
- **D-07** Hypothèses par défaut (faute de réponse utilisateur) : carte = **Leaflet + OpenStreetMap** (BSD / ODbL, vérifier conditions des tuiles) ; paiement = **mode DEMO** + abstraction ; pas de dépendance aux transactions Mongo.
- **D-08 (PROPOSÉE, à valider en phase 2)** Le modèle Stock du cahier des charges a un seul `batchNumber/expirationDate` mais §21 exige plusieurs lots par produit. Proposition : `Stock` (agrégat par pharmacie x médicament : quantity, reservedQuantity, min/max, unique(pharmacyId, medicineId)) + `StockBatch` (stockId, batchNumber, expirationDate, quantity) ; ventes en **FEFO** (premier expiré, premier sorti) ; `quantity` du Stock = somme des lots non expirés/expirés (à préciser).

## Questions ouvertes (à poser à l'utilisateur)
- Q1 Datacloud propose-t-il MongoDB en **replica set** (transactions) ? Sinon : opérations atomiques `$inc` conditionnelles (`quantity >= n`) + écriture mouvement idempotente.
- Q2 Le règlement impose-t-il une API cartographique précise ?
- Q3 Paiement réel (Wave / Orange Money / PayTech) ou DEMO suffisant ?
- Q4 Nom exact et services Datacloud utilisés (pour DEPLOYMENT.md et la preuve d'usage).

## Décisions session 2 (2026-10-08)
- **D-09 Tests sur vraie base** : abandon du dépôt factice (il cachait un bug réel). Les tests tournent contre une base MongoDB-compatible (`TEST_MONGODB_URI`, défaut `mongodb://127.0.0.1:27017/pharmaloc_test`). Dans le bac à sable : **FerretDB 1.24 (Apache-2.0, SQLite)** téléchargé depuis GitHub, lancé par `/tmp/startdb.sh` (à recréer : voir CONVENTIONS). FerretDB ne supporte pas : projection dans findAndModify (donc `findByIdAndUpdate(...).select(...)`/champs `select:false`), `$expr`, index partiels, ni l'**atomicité sous concurrence** -> test de concurrence réel uniquement avec `MONGO_REAL=1`.
- **D-10 Anti-survente** : champ dénormalisé `Stock.available` + filtres simples `{available:{$gte:n}}` (pas de `$expr`, pas de transaction). Résout Q1 : aucun replica set requis, mais MongoDB réel nécessaire en production.
- **D-11 Lots (valide D-08)** : `Stock` agrégé + `StockBatch`, vente FEFO, `quantity` = lots non expirés. Une alerte par (stock, type) (index unique, statut open/resolved).
- **D-12 Moment de la vente** : réservation à la création de commande ; **vente** (sortie physique + mouvement `sale`) quand le livreur **récupère** (livraison) ou quand le pharmacien **remet** (retrait) ; annulation libère la réservation. Évènement `ORDER_CONFIRMED` = commande validée par le patient (réservation faite de façon synchrone dans le service pour pouvoir échouer proprement).
- **D-13 Nommage API** : réception fournisseur = `/api/supplier-deliveries` (la spec utilisait `/deliveries` pour deux choses). Livraison patient = `/api/deliveries/*` + `/api/delivery-assignments`.
- **D-14 OTP** : code = HMAC(secret, orderId) sur 6 chiffres, rien à stocker, visible du seul patient, 5 essais.
- **D-15 Prévision** : conso = ventes 14 j / 14 ; alerte si ≤ 7 j ; suggestion = (max, sinon conso x 14 j + min) − stock, arrondie à 10 ; une seule suggestion « suggested » par pharmacie (régénérée).
- **D-16 Licences** : `sharp` ET `lightningcss` neutralisés par `overrides` + stubs MIT locaux (`frontend/vendor/sharp-stub`, `backend/vendor/lightningcss-stub`). Ne pas retirer.
- **D-17 Frontend** : pas de lib de graphiques ni de carte (SVG maison, liens OSM) = zéro nouvelle licence ; composants maison de style shadcn (le CLI shadcn exige un accès réseau au registre, indisponible).
- **D-18 Fuseau** : Dakar = UTC (pas d'heure d'été) : horaires d'ouverture évalués en UTC.
- Q2 (carte imposée ?) : le règlement n'impose aucune API cartographique. Q3 : paiement = DEMO. Q4 : **Datacloud de Systalink** (produit exact encore inconnu).

## Questions ouvertes (session 2)
- Quel produit Datacloud (VM/conteneur/PaaS + MongoDB managé ?) -> compléter DEPLOYMENT.md.
- Qui sont les 2-5 membres, qui est le représentant (inscription, vote des paires obligatoire pour tous) ?
- Le code a-t-il été commencé avant le 25 sept. 2026 ? (règlement : projet antérieur interdit ; code antérieur d'un membre = à déclarer).

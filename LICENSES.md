# LICENSES.md - Licences des dépendances

> Fichier généré le 2026-10-08 par `scan_licenses.js` + `gen_licenses.js`. À régénérer à chaque ajout de dépendance (checklist dans `memory/CONVENTIONS.md`).

## Règle du concours CADEV
Les licences à réciprocité (**GPL, AGPL, LGPL**) rendent le projet irrecevable. Politique : MIT, Apache-2.0, BSD, ISC (et 0BSD / CC-BY-4.0 pour les données).

## Résultat de l'analyse
Analyse de **toutes** les dépendances installées (directes + transitives), backend et frontend : **aucune GPL / AGPL / LGPL**.

### Points d'attention
1. **sharp / libvips (LGPL-3.0)** : Next.js l'installe par défaut (optimisation d'images). **Neutralisé** : `overrides` dans `frontend/package.json` remplace `sharp` par un stub MIT local (`frontend/vendor/sharp-stub`) et `images.unoptimized: true` dans `next.config.mjs`. Aucun paquet `@img/*` dans `package-lock.json`. **Ne jamais retirer cet override.**
2. **lightningcss (MPL-2.0)** : tiré par vite/vitest (tests du backend). Par précaution (réciprocité au niveau fichier), **neutralisé** de la même façon : `overrides` dans `backend/package.json` vers `backend/vendor/lightningcss-stub` (MIT). Le backend ne traite aucun CSS.
3. **caniuse-lite (CC-BY-4.0)** : données de compatibilité navigateurs (build uniquement). Attribution : © Alexis Deveria / Browserslist.
4. **Serveur MongoDB** : le cahier des charges impose MongoDB. Le serveur MongoDB Community est sous licence **SSPL** ; c'est un **service d'infrastructure**, non lié ni distribué avec le code du projet (le projet n'embarque que le pilote `mongodb`/`mongoose`, Apache-2.0/MIT). À mentionner à l'organisateur si la question se pose.
5. **Outils de test hors livrable** : un serveur compatible MongoDB (FerretDB, Apache-2.0) a servi à exécuter les tests localement ; il n'est ni dans le dépôt ni dans le déploiement.
6. **Cartographie** : aucune bibliothèque de carte n'est embarquée ; les itinéraires sont de simples liens vers OpenStreetMap. Si Leaflet (BSD-2-Clause) est ajouté plus tard, respecter les conditions d'usage des tuiles OSM.
7. **Composants UI** : les composants sont écrits dans le projet (style shadcn/ui) sans dépendance supplémentaire.

## backend - dépendances directes

| Paquet | Version | Licence | Type |
|---|---|---|---|
| bcryptjs | 3.0.3 | BSD-3-Clause | production |
| cors | 2.8.6 | MIT | production |
| dotenv | 18.0.6 | BSD-2-Clause | production |
| express | 4.22.3 | MIT | production |
| express-rate-limit | 8.7.1 | MIT | production |
| helmet | 8.3.0 | MIT | production |
| jsonwebtoken | 9.0.3 | MIT | production |
| mongoose | 8.24.5 | MIT | production |
| zod | 3.25.76 | MIT | production |
| @types/cors | 2.8.19 | MIT | développement |
| @types/express | 4.17.25 | MIT | développement |
| @types/jsonwebtoken | 9.0.10 | MIT | développement |
| @types/node | 26.6.4 | MIT | développement |
| @types/supertest | 7.2.1 | MIT | développement |
| supertest | 7.3.1 | MIT | développement |
| tsx | 4.23.15 | MIT | développement |
| typescript | 7.0.2 | Apache-2.0 | développement |
| vitest | 5.0.3 | MIT | développement |

## frontend - dépendances directes

| Paquet | Version | Licence | Type |
|---|---|---|---|
| next | 16.4.0 | MIT | production |
| react | 19.3.0 | MIT | production |
| react-dom | 19.3.0 | MIT | production |
| @types/node | 26.6.4 | MIT | développement |
| @types/react | 19.3.0 | MIT | développement |
| @types/react-dom | 19.3.0 | MIT | développement |
| autoprefixer | 10.6.1 | MIT | développement |
| postcss | 8.5.29 | MIT | développement |
| tailwindcss | 3.4.19 | MIT | développement |
| typescript | 7.0.2 | Apache-2.0 | développement |

## Répartition (toutes dépendances, backend + frontend, avec doublons)

| Licence | Nombre |
|---|---|
| MIT | 240 |
| Apache-2.0 | 14 |
| ISC | 12 |
| BSD-3-Clause | 5 |
| BSD-2-Clause | 2 |
| CC-BY-4.0 | 1 |
| 0BSD | 1 |

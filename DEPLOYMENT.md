# Déploiement - Datacloud (Systalink)

> Le règlement (art. 6) impose un projet **déployé et accessible en ligne** avec **au moins un produit ou service Datacloud** acquis avant la soumission (remise de 70 % avec le code promotionnel de l'équipe, art. 9). **Je n'ai pas pu consulter le catalogue Datacloud** : choisissez le produit adapté (hébergement applicatif, conteneur ou VM, plus une base MongoDB) et complétez la section « À renseigner ».

## Prérequis
Node.js 20+ · **MongoDB 6+ réel** (pas une base « compatible » en production) · une URL publique en HTTPS.

## Variables d'environnement
**Backend** (`backend/.env.example`) : `NODE_ENV=production`, `PORT`, `MONGODB_URI`, `JWT_ACCESS_SECRET` et `JWT_REFRESH_SECRET` (**32+ caractères aléatoires, distincts** : `openssl rand -hex 32`), `CORS_ORIGINS` (URL **exacte** du frontend), `BCRYPT_ROUNDS=12`, `RATE_LIMIT_MAX`, `AUTH_RATE_LIMIT_MAX`.
**Frontend** : `NEXT_PUBLIC_API_URL=https://<api>/api`, lue **au build** : la définir avant `npm run build`. Optionnelles (cartes) : `NEXT_PUBLIC_TILE_URL`, `NEXT_PUBLIC_TILE_ATTRIBUTION`, `NEXT_PUBLIC_CONTACT_EMAIL` (voir `CARTOGRAPHIE.md`). Si un proxy (Nginx…) est placé devant le frontend, **ne pas lui faire envoyer `Referrer-Policy: no-referrer`** : les tuiles OpenStreetMap seraient refusées.

## Procédure
```bash
# Backend
cd backend && npm ci && npm test && npm run build
NODE_ENV=production node dist/server.js            # ou : docker build -t pharmaloc-api backend

# Données de démonstration (jamais sur une base réelle de production)
SEED_ALLOW_PRODUCTION=1 npm run seed:reset         # comptes : voir DEMO.md

# Frontend
cd frontend && NEXT_PUBLIC_API_URL=https://<api>/api npm run build
node .next/standalone/server.js                    # ou : docker build -t pharmaloc-web frontend
```
Derrière le proxy Datacloud, l'API active `trust proxy` en production (nécessaire au rate limiting par IP). Supervision : `GET /api/health`.

## Points d'attention
- **MongoDB réel obligatoire** pour la garantie anti-survente (atomicité par document). Exécuter une fois le test de concurrence : `MONGO_REAL=1 TEST_MONGODB_URI=mongodb://… npm test`.
- Les index sont créés au démarrage par Mongoose ; sur une base volumineuse, les créer avant l'ouverture.
- Configurer les sauvegardes MongoDB côté Datacloud.
- La tâche planifiée (expirations, alertes, prévisions) tourne toutes les 15 min **dans le processus API** : une seule instance, ou la déplacer vers un cron.

## À renseigner par l'équipe
Produit(s) Datacloud utilisé(s) : ________ · URL publique du frontend : ________ · URL de l'API : ________ · preuve d'achat Datacloud à joindre à la soumission.

## Checklist avant soumission
Build prod OK · tests OK · secrets réels · seed DEMO chargé · comptes testés · LICENSES.md à jour · AI_USAGE.md complété · URL publique testée depuis un autre réseau.

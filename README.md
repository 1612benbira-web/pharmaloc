# PharmaLoc

Plateforme sénégalaise qui connecte **patients, pharmacies et livreurs** tout en **automatisant la gestion des stocks pharmaceutiques** (CADEV 2026, SYSTALINK SENEGAL). Aucun assistant médical IA.

**Innovation** : une livraison fournisseur met le stock à jour, crée les mouvements tracés, recalcule les alertes ; le système réserve le stock à la commande (pas de survente), anticipe les ruptures par un calcul vérifiable et suggère un réapprovisionnement que le pharmacien valide.

## Démarrage rapide
Prérequis : Node.js 20+ et MongoDB.
```bash
cd backend && cp .env.example .env     # changer les secrets JWT
npm ci && npm run seed:reset           # données DEMO (voir DEMO.md)
npm test && npm run dev                # API : http://localhost:4000/api/health
cd ../frontend && cp .env.example .env.local
npm ci && npm run dev                  # Interface : http://localhost:3000
```
Comptes DEMO : voir `DEMO.md` (mot de passe `Demo1234`). Lancement tout-en-un avec Docker : `docker compose up --build`.

## Contenu
- `backend/` API Express + TypeScript + Mongoose (89 tests) · `frontend/` Next.js + Tailwind (patient, pharmacien, livreur, admin)
- Documentation : `ARCHITECTURE.md` · `API.md` · `DATABASE.md` · `SECURITY.md` · `DEPLOYMENT.md` · `DEMO.md` · `LICENSES.md` · `AI_USAGE.md`
- `memory/` : mémoire de travail du projet (avancement, décisions, conventions, règlement).

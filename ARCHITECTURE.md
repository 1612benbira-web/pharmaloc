# ARCHITECTURE

```
Navigateur (Next.js) ──HTTPS──▶ API Express /api ──Mongoose──▶ MongoDB
                                   │
                         bus d'événements interne ─▶ notifications, alertes, encaissement espèces
                         tâche planifiée (15 min) ─▶ lots expirés, alertes, prévisions
```

## Backend (`backend/src`)
`routes → controller/handlers → service → modèles Mongoose`, avec middleware transverses (auth JWT + rôles, validation Zod, rate limiting, helmet, CORS, erreurs normalisées).
- `modules/stock/` : **stock.service** (seul point de modification du stock : entrées, réservation, libération, vente FEFO, ajustement, expirations), **alert.service**, **forecast.service**, **restock.service**.
- `modules/supplier-deliveries/` : réception fournisseur (pré-validation, écriture, annulation en cas d'échec partiel, événement `DELIVERY_RECEIVED`).
- `modules/orders/` : machine d'états à transitions atomiques, réservation à la création, code de livraison (HMAC) ; `modules/deliveries/` : prise de livraison atomique, récupération (vente), confirmation par code.
- `modules/payments/` : `PaymentService` + fournisseur **DEMO** (point d'extension pour Wave, Orange Money…).
- `events/` : bus (`DELIVERY_RECEIVED`, `ORDER_CONFIRMED`, `ORDER_CANCELLED`, `ORDER_STATUS_CHANGED`, `DELIVERY_COMPLETED`, `PAYMENT_CONFIRMED`) et handlers.
- `seed/` : données DEMO.

## Choix structurants
1. **Anti-survente sans transaction** : `available` dénormalisé + mises à jour conditionnelles atomiques (voir `DATABASE.md`).
2. **Traçabilité** : un `StockMovement` immuable par changement, un `AuditLog` par action sensible.
3. **Stock par lots** (FEFO) : les produits expirés ne sont jamais vendus.
4. **Prévision explicable** : formule affichée à l'utilisateur ; décision finale au pharmacien.
5. **Sécurité côté serveur** : voir `SECURITY.md`.

## Frontend (`frontend/src`)
Next.js (App Router), Tailwind, composants maison (style shadcn), session avec rafraîchissement automatique des jetons, panier, graphiques SVG sans dépendance, **cartes Leaflet + OpenStreetMap** chargées à la demande (`CARTOGRAPHIE.md`). Pages : accueil, recherche, panier, suivi de commande, notifications, tableau de bord et stock pharmacien, nouvelle livraison, commandes, réapprovisionnement, mouvements, espace livreur, administration.
Optimisation d'images de Next désactivée (voir `LICENSES.md`).

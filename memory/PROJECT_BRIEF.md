# PROJECT_BRIEF - PharmaLoc (résumé du cahier des charges)

**Pitch** : « Une plateforme qui connecte patients, pharmacies et services de livraison tout en automatisant la gestion des stocks pharmaceutiques. »
Livraison = partie visible. **Automatisation des stocks = innovation cœur** (côté pharmacie).

## Rôles (enum `Role`)
`PATIENT`, `PHARMACIST`, `DELIVERY_AGENT`, `ADMIN`. Inscription publique = PATIENT seulement ; les autres comptes sont créés par un ADMIN.

## Flux patient
Recherche médicament -> pharmacies dispo (stock, distance, livraison/retrait) -> panier -> retrait OU livraison -> paiement -> suivi -> terminé.
Filtres : disponibilité, distance, livraison, retrait, prix, pharmacie ouverte. Géoloc avec consentement, sinon saisie quartier/ville/adresse.

## Statuts commande
`pending, confirmed, preparing, ready, assigned, picked_up, in_delivery, delivered, cancelled`
Livraison : confirmation par **code OTP / code de livraison**.

## Stock (cœur)
- Réception fournisseur ("Nouvelle livraison" : fournisseur, référence, date, médicament, quantité, lot, expiration, prix d'achat) => 1 enregistrer livraison, 2 +stock, 3 StockMovement, 4 dispo, 5 niveau, 6 alertes, 7 audit.
- `StockMovement.type` : `delivery_received, sale, reservation, cancellation, adjustment, return, expiration` ; champs : stockId, type, quantity(signée), previousQuantity, newQuantity, reference, userId, createdAt. Tout est traçable.
- Réservation : dispo = réel - réservé ; annulation libère automatiquement.
- Alertes : `quantity <= minimumQuantity` => STOCK FAIBLE ; `0` => RUPTURE ; expiration proche (ex: 30 j) ; produits expirés **non vendables**.
- Prévision : jours restants = stock / consommation moyenne journalière (calcul simple, vérifiable, jamais d'IA médicale). Ex : 24 / 8 = 3 jours.
- Suggestion de réapprovisionnement : le pharmacien accepte / modifie / refuse ; **jamais de commande auto en v1**.
- Scan code-barres/QR : prévu, avec saisie manuelle en repli.

## Événements (bus interne)
`DELIVERY_RECEIVED`, `ORDER_CONFIRMED` (réserver stock, notifier pharmacie), `ORDER_CANCELLED` (libérer stock), `DELIVERY_COMPLETED` (commande delivered, notifier client, clôturer).

## Paiement
Abstraction `PaymentService` : `initiatePayment, verifyPayment, getPaymentStatus, refundPayment`. Mode **DEMO** clairement identifié. Types : mobile, à la livraison, au retrait, en ligne. Jamais de données bancaires sensibles stockées.

## Modèles de données
User, Pharmacy, Medicine, Stock, StockMovement, Delivery, DeliveryItem, Supplier, PurchaseOrder, PurchaseOrderItem, Order, OrderItem, Payment, DeliveryAgent, DeliveryAssignment, Address, Notification, InventoryAlert, AuditLog, Review.

## API prévue
GET /api/medicines, /medicines/search, /pharmacies, /stocks ; POST /stocks ; GET /stock-movements ; POST /deliveries ; POST /orders ; GET /orders/:id ; POST /orders/:id/cancel ; POST /delivery-assignments ; POST /deliveries/:id/pickup, /deliveries/:id/complete ; GET /alerts ; GET /health.
Erreurs : 400, 401, 403, 404, 409, 422, 429, 500 (jamais de stack en prod).

## Stack imposée
Frontend : Next.js, React, TypeScript, Tailwind, shadcn/ui. Backend : Node, Express, API REST, TypeScript. DB : MongoDB + Mongoose. Cartographie : compatible règlement. Déploiement : **Datacloud** (≥1 produit Datacloud, app publique en ligne).

## UI
Mobile-first, médical, rassurant, simple. Accueil : titre « Trouvez vos médicaments sans perdre de temps. », sous-titre « Vérifiez les stocks des pharmacies proches de vous et faites-vous livrer. », grande barre « Quel médicament recherchez-vous ? », bouton « Rechercher » ; sections Pharmacies proches / Médicaments populaires / Comment ça marche / Suivre ma commande.

## Démo (jury)
5 pharmacies, 20 médicaments, stocks variés, commandes, livraisons, livreurs, mouvements, alertes ; comptes PATIENT / PHARMACIEN / LIVREUR / ADMIN faciles à tester.
- Scénario 1 (~3 min) : recherche "Paracétamol 1000 mg" -> pharmacie -> livraison -> commande -> pharmacien prépare -> livreur accepte/récupère -> client suit -> livreur confirme.
- Scénario 2 : réception fournisseur Paracétamol 20 + 100 = 120 ; mouvement créé ; Amoxicilline 8 < min 10 => stock faible.
- Scénario 3 : conso 10/j, stock 30 => rupture dans 3 j => réappro recommandé 100 => pharmacien accepte.

## Livrables docs
README, ARCHITECTURE, API, DATABASE, SECURITY, LICENSES, DEPLOYMENT, DEMO, AI_USAGE (.md).
Tests attendus : auth, medicines, stock, orders, delivery, automation, security.
Index MongoDB : medicine name, barcode, pharmacy, stock, order status. Pagination partout.

## Checklist finale CADEV
En ligne - Datacloud - auth - 4 rôles fonctionnels - recherche - dispo temps réel - commande - livraison - paiement - gestion stock - réception fournisseur - MAJ auto stock - historique mouvements - alertes - rupture - prévision - suggestion réappro - lots - expirations - notifications - tests - sécurité - doc - licences - IA déclarée - démo prête.

# Base de données (MongoDB / Mongoose)

## Modèles
| Modèle | Rôle | Index notables |
|---|---|---|
| User | Comptes (4 rôles), `pharmacyId`, `tokenVersion`, **`approvalStatus`** (approved/pending/rejected), `rejectionReason` | email unique ; role + isActive ; approvalStatus + createdAt |
| Pharmacy | Coordonnées, **n° d'agrément**, horaires, livraison/retrait, **tarif à la distance** (`deliveryFee`, `deliveryPerKmFee`, `deliveryIncludedKm`, `deliveryRadiusKm`), validation admin | isActive + isValidated ; city + neighborhood |
| Medicine | Catalogue (champs de recherche normalisés `nameLower`…) | nameLower, genericNameLower, barcode unique sparse, category |
| Stock | Agrégat par pharmacie × médicament | **(pharmacyId, medicineId) unique** ; medicineId + available |
| StockBatch | Lots : numéro, expiration, quantité | (stockId, batchNumber, expirationDate) unique ; stockId + expirationDate |
| StockMovement | Journal **immuable** de tous les changements | stockId + createdAt ; pharmacyId + type + createdAt ; orderId |
| SupplierDelivery | Livraison fournisseur (lignes embarquées) | **(pharmacyId, reference) unique** |
| Supplier | Fournisseurs d'une pharmacie | (pharmacyId, name) unique |
| InventoryAlert | Alertes (un document par stock × type) | **(stockId, type) unique** ; pharmacyId + status + severity |
| PurchaseOrder | Suggestion / bon de réapprovisionnement (lignes embarquées) | pharmacyId + status + createdAt |
| Order | Commande (lignes et prix figés, statut, historique) | userId + createdAt ; pharmacyId + status + createdAt ; status |
| Payment | Référence, montant, statut, **mode DEMO/LIVE** (aucune donnée bancaire) | orderId |
| Delivery, DeliveryAssignment, DeliveryAgent | Livraison au patient (+ **position partagée par le patient**, effacée à la fin), historique d'assignation, profil livreur | status + createdAt ; deliveryAgentId + status |
| Address, Review, Notification, AuditLog | Annexes | userId ; orderId unique ; userId + createdAt ; action, createdAt |

Écart assumé avec la spécification : `Stock` ne porte pas un seul lot mais des **StockBatch** (plusieurs lots et expirations par produit, vente FEFO). `DeliveryItem` et `PurchaseOrderItem` sont des sous-documents.

## Invariants du stock
- `quantity` = somme des lots **non expirés** ; `available = quantity − reservedQuantity` (≥ 0).
- `available` est stocké pour permettre des mises à jour **atomiques conditionnelles** sans transaction : `findOneAndUpdate({available:{$gte:n}}, {$inc:{reservedQuantity:n, available:-n}})`. Si le filtre ne correspond plus, la réservation échoue (409) : pas de survente, même en concurrence (garanti par l'atomicité par document de MongoDB).
- Tout changement passe par `modules/stock/stock.service.ts`, qui écrit le `StockMovement` correspondant. Un contrôle de cohérence stock ↔ lots lève une alerte `anomaly`.
- Mouvement : `quantity` = variation du stock physique (vente : −5) ; `reservedDelta` = variation des unités réservées.

## Réservation et vente
Réservation à la validation de la commande, puis vente (sortie physique, FEFO) quand le **livreur récupère** (livraison) ou quand le pharmacien **remet** (retrait). Libération automatique en cas d'annulation. Les lots expirés ne sont jamais vendus (balayage planifié toutes les 15 min et à chaque commande).

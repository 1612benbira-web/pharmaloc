# Démonstration jury

`npm run seed:reset` (dans `backend/`) crée 5 pharmacies, 20 médicaments, des stocks variés, un historique de ventes, des commandes à tous les statuts, des livreurs et des alertes. **Mot de passe de tous les comptes : `Demo1234`**. Sur la page de connexion, quatre boutons connectent directement chaque rôle.

| Rôle | Email |
|---|---|
| Patient | patient@pharmaloc.sn |
| Pharmacien (Plateau Santé) | pharmacien@pharmaloc.sn (autre pharmacie : pharmacien2@pharmaloc.sn) |
| Livreur | livreur@pharmaloc.sn (livreur2@pharmaloc.sn : indisponible) |
| Admin | admin@pharmaloc.sn |

## Scénario 1 : commande avec livraison (~3 min)
1. **Patient** : accueil, rechercher « Paracétamol 1000 mg ». Résultat : Plateau 20, Médina 50, Liberté 6 : 35, Pikine 12 (« stock limité »), Almadies **rupture**. Activer « Utiliser ma position » ou saisir un quartier.
2. Ajouter la Pharmacie de la Médina au panier, choisir **Livraison**, saisir l'adresse, paiement DEMO, confirmer. Noter le **code de livraison**.
3. **Pharmacien** (autre fenêtre ou navigation privée) : Commandes, Accepter, Préparation, Prête.
4. **Livreur** : « Passer disponible », Accepter, J'ai récupéré, Démarrer, saisir le code, Confirmer.
5. **Patient** : la page de suivi se met à jour seule jusqu'à « Livrée ». Le stock a baissé d'autant (vente au moment de la récupération).

## Scénario 2 : automatisation à la réception fournisseur
Pharmacien, **Nouvelle livraison** : fournisseur Sanofi, référence `LIV-2026-001`, Paracétamol 1000 mg, 100, lot `LOT123`, expiration `2028-04`. À la validation : **stock 20 → 120**, mouvement `delivery_received` (utilisateur, référence), disponibilité à jour, alertes recalculées, audit. Voir **Mouvements**. Re-saisir la même référence : refus (anti-doublon). **Amoxicilline : 8 < minimum 10 → ⚠ STOCK FAIBLE**.

## Scénario 3 : prévision
Tableau de bord : « **Ibuprofène 400 mg risque d'être en rupture dans environ 3 jours** » (stock 30, 10 par jour). Réapprovisionnement, Calculer : **commander 100** (calcul expliqué). Le pharmacien peut **accepter, modifier les quantités ou refuser** : rien n'est commandé automatiquement.

## À montrer aussi
Rupture complète (Salbutamol) · expiration proche (Vitamine C) · annulation (libération automatique du stock) · retrait en pharmacie avec code · admin : validation d'une pharmacie, audit, supervision · notifications 🔔.

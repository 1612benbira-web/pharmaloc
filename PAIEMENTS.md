# Flux financiers : qui reçoit l'argent ?

> **État honnête** : les paiements de PharmaLoc sont en **mode DEMO**. Aucun argent ne circule. Ce document décrit ce que fait l'application aujourd'hui, les modèles possibles, et la **décision métier à prendre**. Je ne suis pas juriste : toute mise en production réelle demande un avis juridique et un prestataire de paiement agréé.

## 1. Ce que fait l'application aujourd'hui
- Une commande a un montant `totalAmount = sous-total (médicaments) + frais de livraison`.
- **Mobile money / carte en ligne** : simulés par le fournisseur `demo` (statut « payé » immédiat, marqué `DEMO`).
- **Espèces à la livraison ou au retrait** : statut « à régler », puis « payé » quand la remise est confirmée par le code.
- **Rien ne détermine à qui va l'argent** : pas de compte de la pharmacie, du livreur ou de la plateforme, pas de reversement. Le livreur voit seulement « à encaisser : 2 250 FCFA ».

## 2. À qui devrait revenir chaque montant
| Montant | Revient à | Remarque |
|---|---|---|
| Médicaments (sous-total) | **La pharmacie** : c'est elle qui vend | Prix fixés par la pharmacie |
| Frais de livraison | **Le livreur** (ou la plateforme qui le rémunère) | À décider |

## 3. Modèles possibles
**A. Paiement en ligne (mobile money, carte)**
- *Idéal* : le prestataire (Wave, Orange Money, PayTech…) crédite directement le **compte marchand de la pharmacie**, avec répartition des frais de livraison si le prestataire le permet. PharmaLoc **ne détient jamais** les fonds.
- *Alternative* : la plateforme encaisse puis reverse. Détenir l'argent de tiers est généralement une activité réglementée : à valider avec un juriste et un prestataire agréé avant d'envisager cette voie.

**B. Espèces à la livraison**
Le **livreur encaisse le total** chez le patient. Il conserve les frais de livraison (si telle est la règle) et **remet le montant des médicaments à la pharmacie**. Le risque est la traçabilité : sans registre, personne ne peut prouver ce qui a été remis.

**C. Espèces au retrait**
La pharmacie encaisse elle-même, sans livreur : aucun problème de reversement.

## 4. Ce qui manque pour le modèle B (non implémenté)
Un **registre de reversement** : pour chaque livraison payée en espèces, le montant encaissé, la part du livreur, la part de la pharmacie, et un statut « à remettre » puis « remis » **confirmé par le pharmacien**. Avec un solde par livreur, une vue pour la pharmacie (espèces dues) et pour l'admin (encours, retards). À construire si ce modèle est retenu.

## 5. Recommandation pour le concours
Garder le mode DEMO, **dire clairement au jury qu'aucun argent réel ne circule**, présenter le modèle retenu (A pour le paiement en ligne, B pour les espèces) et, si le temps le permet, ajouter le registre de reversement qui rend le modèle B vérifiable.

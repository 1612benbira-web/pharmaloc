# Démonstration jury

`npm run seed:reset` (dans `backend/`) crée 5 pharmacies, 20 médicaments, des stocks variés, un historique de ventes, des commandes à tous les statuts, des livreurs et des alertes. **Mot de passe de tous les comptes : `Demo1234`**. Sur la page de connexion, quatre boutons connectent directement chaque rôle.

| Rôle | Email |
|---|---|
| Patient | patient@pharmaloc.sn |
| Pharmacien (Plateau Santé) | pharmacien@pharmaloc.sn (autre pharmacie : pharmacien2@pharmaloc.sn) |
| Livreur | livreur@pharmaloc.sn (livreur2@pharmaloc.sn : indisponible) |
| Admin | admin@pharmaloc.sn |
| Demande en attente (pharmacie) | nouvelle.pharmacie@pharmaloc.sn (voit l'écran « en cours de validation ») |
| Demande en attente (livreur) | nouveau.livreur@pharmaloc.sn |

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

## Scénario 4 : inscription d'une pharmacie et validation
1. Page **Créer un compte** → carte **Pharmacie** : responsable, nom, n° d'agrément, quartier, position (GPS ou quartier), horaires → *Envoyer ma demande*. L'écran « Demande en cours de validation » s'affiche et refuse l'accès aux fonctions professionnelles.
2. **Admin** → onglet **Demandes** (pastille rouge) : détails, lien « vérifier la position sur la carte » → **Approuver** (ou refuser avec un motif).
3. Le demandeur voit son écran se mettre à jour **tout seul** et accède à son tableau de bord ; la pharmacie devient visible des patients. Même parcours pour un **livreur**.

## Scénario 5 : frais de livraison à la distance et position envoyée au livreur
1. **Patient** → panier d'une pharmacie → **Livraison** → « Utiliser ma position » (ou choisir un quartier). Le détail s'affiche : *distance 1,9 km · frais 650 FCFA = 500 + 150 FCFA/km au-delà de 1 km*. Choisir un quartier plus éloigné : les frais augmentent ; trop loin : « hors zone ».
2. Pharmacien → **Paramètres** : modifier le tarif (aperçu à 1, 2, 3, 5, 8 km).
3. Une fois un livreur assigné, le **patient** voit « Aider le livreur à vous trouver » → *Envoyer ma position* (ou mise à jour automatique toutes les 30 s). Le **livreur** voit « position partagée par le client » et un lien d'itinéraire. La pharmacie ne la voit pas ; elle est effacée à la livraison.

## Scénario 6 : horaires d'ouverture et numéro du patient
1. **Pharmacien** → **Paramètres** → « Jours et horaires d'ouverture » : cocher les jours ouvrables, régler l'ouverture et la fermeture de chaque jour (fermeture après minuit possible), « Copier les heures du lundi ». Côté **patient**, les pharmacies affichent « 🟢 Ouverte jusqu'à 20:00 » ou « ⚪ Fermée · ouvre demain à 08:00 ».
2. Une fois un livreur assigné, **patient** → page de la commande → « 📞 Votre numéro pour le livreur » → *Envoyer mon numéro au livreur*. Le **livreur** voit le numéro avec les liens **Appeler** et **WhatsApp**.
3. Sinon, le **livreur** clique « 📞 Demander le numéro du client » : le patient reçoit une notification et une carte jaune « Le livreur demande votre numéro » → **Accepter** ou **Refuser** (le livreur en est informé). Numéro effacé à la fin de la livraison.

## Cartes (Leaflet + OpenStreetMap)
Bouton **« 🗺 Voir la carte »** (rien n'est chargé avant le clic) : *Recherche* (pharmacies, stock, prix) · *Panier* → « Préciser mon point sur la carte » : cliquer ou **déplacer le repère rouge**, la distance et les frais se mettent à jour · *Suivi de commande* (pharmacie, adresse, livreur, position partagée) · *Livreur* · *Admin → Demandes* (vérifier la pharmacie) · *Inscription pharmacie* (placer la pharmacie). L'attribution « © OpenStreetMap contributors » est visible sur chaque carte.

## À montrer aussi
Rupture complète (Salbutamol) · expiration proche (Vitamine C) · annulation (libération automatique du stock) · retrait en pharmacie avec code · admin : validation d'une pharmacie, audit, supervision · notifications 🔔.

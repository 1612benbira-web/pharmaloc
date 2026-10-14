# PROGRESS - état réel du projet

Légende : [x] fait ET testé · [~] partiel / non vérifié · [ ] à faire. Dernière mise à jour : 2026-10-10 (session 3).
**Deadline de soumission : 31 oct 2026 à 17 h 00 (Dakar).** Voir `REGLEMENT_CADEV.md`.

## Phases 1 à 5 + seed : TERMINÉES côté backend (89 tests verts + 1 test de concurrence réservé à MongoDB réel)
- [x] P1 Fondations : auth (register patient / login / refresh / logout / me), RBAC serveur, users admin, audit, sécurité, health
- [x] P2 Catalogue et stock : Pharmacy, Medicine, Supplier, Stock + StockBatch (lots/FEFO) + StockMovement, service de stock atomique, routes, recherche patient (distance, filtres, ouverture, quartier/ville)
- [x] P3 Réception fournisseur (POST /api/supplier-deliveries), réservation / libération, alertes (faible, rupture, expiration proche, expirés, prévision, anomalie), événements, notifications, vente de produit expiré impossible
- [x] P4 Prévision (ventes 14 j) + suggestion de réapprovisionnement (accepter / modifier / refuser, jamais de commande auto)
- [x] P5 Commandes (machine d'états atomique), livraison (prise atomique, pickup = vente, OTP HMAC 5 essais), PaymentService + fournisseur DEMO, remboursement à l'annulation, avis
- [x] Dashboards pharmacien et admin (API), audit-logs, notifications
- [x] Seed DEMO (`npm run seed:reset`) : 5 pharmacies, 20 médicaments, scénarios 1-3, commandes à tous les statuts. **Vérifié** : serveur réel démarré sur la base DEMO, scénarios rejoués par HTTP (20+100=120, doublon 409, Ibuprofène 30 / 10 par jour / 3 j / suggestion 100)
## Phase 6 Frontend : écrit, COMPILE (17 routes), **non testé dans un navigateur**
- [~] Patient : accueil, recherche + géoloc consentie + filtres, panier/checkout, suivi, notifications, connexion/inscription
- [~] Pharmacien : dashboard (graphiques SVG), stock + prévision, nouvelle livraison (+ saisie code-barres manuelle), commandes, réappro, mouvements
- [~] Livreur, Admin (aperçu, pharmacies, utilisateurs, livreurs, audit)
- [ ] **À FAIRE EN PRIORITÉ** : test manuel complet dans un navigateur (scénarios de DEMO.md), corrections UX ; scan caméra du code-barres (saisie manuelle OK) ; accessibilité/mobile à vérifier
## Phase 7 : livraison
- [x] Docs : README, ARCHITECTURE, API, DATABASE, SECURITY, DEPLOYMENT, DEMO, LICENSES, AI_USAGE ; Dockerfiles + docker-compose (non testés, pas de Docker ici)
- [ ] Déploiement réel sur Datacloud (aucune info produit : DEPLOYMENT.md à compléter) ; MongoDB réel ; tester `MONGO_REAL=1 npm test` ; seed sur la base de démo en ligne
- [ ] Soumission : preuve d'achat Datacloud, déclaration composants/licences/IA, déclaration de titularité de chaque membre
## Session 3 : ajouts (118 tests verts + 1 réservé à MongoDB réel)
- [x] Inscription par type : patient (immédiat), pharmacie et livreur (en attente de validation admin) ; file « Demandes » dans l'admin ; écran d'attente qui se met à jour seul
- [x] Frais de livraison à la distance (formule serveur, devis public, hors-zone refusé, réglage par la pharmacie via la page Paramètres)
- [x] Le patient envoie sa position au livreur (volontaire, masquée à la pharmacie/admin, effacée à la fin)
- [~] Frontend de ces trois ajouts : compile, **non testé dans un navigateur**
- [x] Cartes Leaflet + OSM (recherche, panier avec repère déplaçable, suivi, livreur, admin, inscription pharmacie) : conformité à la politique des tuiles documentée (`CARTOGRAPHIE.md`), test jsdom 19/19 ; **rendu visuel non vérifié dans un vrai navigateur**
- [x] Horaires par jour (éditeur semaine, statut « ouverte jusqu'à… / ouvre demain… ») ; partage du numéro du patient avec le livreur (+ demande par le livreur, refus possible) ; **141 tests verts**
- [x] **Répartition automatique de l'argent** (médicaments → pharmacie, frais → livreur), registre des espèces, comptes de réception, pages Paiements / Mes gains / Finances ; **159 tests verts**. Mode DEMO uniquement (`PAIEMENTS.md` §5 pour le réel)
- [ ] Décider qui supporte les frais du prestataire et une éventuelle commission (non modélisé)
- [ ] Renseigner `NEXT_PUBLIC_CONTACT_EMAIL` (contact recommandé par la politique OSM)
- [ ] Redéployer (Render/Vercel) puis `seed:reset` pour obtenir les tarifs et les demandes de démonstration

## Non fait / limites assumées
Signalements (admin) ; téléversement d'ordonnance ; cookies httpOnly ; 2FA ; paiement réel (DEMO seulement) ; shadcn/ui officiel (composants maison de style équivalent) ; tests frontend automatisés.

## Prochaine action précise
1) Lancer backend + frontend en local avec une vraie MongoDB, passer DEMO.md en entier dans un navigateur, noter les bugs. 2) Corriger. 3) Déployer sur Datacloud. 4) Répétition de la démo (3 min) + chaque membre sait expliquer l'architecture.

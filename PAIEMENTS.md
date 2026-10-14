# Paiements et répartition : qui reçoit l'argent ?

> **État honnête** : la **logique de répartition automatique est implémentée et testée**, mais les paiements et les versements restent en **mode DEMO** : **aucun argent réel ne circule**. Brancher un vrai prestataire (Wave, Orange Money, PayTech…) demande un compte professionnel, des clés d'accès et un avis juridique (voir §5). Je ne suis pas juriste.

## 1. La règle de répartition
| Montant | Bénéficiaire |
|---|---|
| Prix des médicaments | **La pharmacie** |
| Frais de livraison | **Le livreur** (il les garde) |
| Commission de la plateforme | **Aucune** à ce stade |

La somme des parts est toujours égale au total payé (testé).

## 2. Ce qui se passe, selon le mode de paiement
| Commande | À la confirmation de la livraison (le patient donne son code) |
|---|---|
| **Livraison payée en ligne** (Wave / Orange Money) | La pharmacie reçoit le prix des médicaments, le livreur reçoit les frais, **chacun sur son compte**, automatiquement |
| **Retrait payé en ligne** | La pharmacie reçoit la totalité |
| **Livraison payée en espèces** | Le livreur a encaissé le total : il **garde ses frais** et doit **remettre le prix des médicaments** à la pharmacie, qui **confirme la réception** dans l'application |
| **Retrait payé en espèces** | La pharmacie encaisse elle-même : rien à reverser |
| **Annulation avant livraison** | Remboursement du patient, aucune répartition |

Le paiement en ligne est considéré comme **conservé jusqu'à la livraison** : rien n'est versé avant le code de confirmation.

## 3. Garanties techniques (testées, 18 scénarios)
- **Jamais de double versement** : une seule répartition par commande, un seul versement par bénéficiaire (index uniques), versement réservé de façon atomique avant envoi, clé d'idempotence transmise au prestataire.
- **Compte de réception absent** : le versement reste « en attente » puis part dès que le bénéficiaire renseigne son compte (Wave / Orange Money). Aucun numéro bancaire n'est demandé.
- **Échec du prestataire** : versement « échec », relance par l'administrateur, **5 tentatives maximum**.
- **Espèces** : plafond d'espèces détenues par un livreur (**50 000 FCFA** par défaut, `CASH_LIMIT_FCFA`) : au-delà, il ne peut plus accepter de livraison tant qu'il n'a pas remis l'argent. Alertes d'ancienneté, vue d'ensemble pour l'admin.
- **Rattrapage** : une livraison sans répartition (panne au mauvais moment) est répartie par l'admin en un clic.
- **Confidentialité** : le numéro du compte de réception n'est visible que de son propriétaire et de l'admin ; l'historique ne garde que les 2 derniers chiffres. Chaque étape est tracée (audit).

## 4. Où voir quoi
Pharmacien : **Paiements** (reçu en ligne, espèces à recevoir, confirmer la réception) · Livreur : **Mes gains** (frais gagnés, espèces à remettre, compte de réception) · Admin : onglet **Finances** (volumes, espèces par livreur, versements à corriger).

## 5. Pour passer à de vrais paiements (non fait)
1. **Compte professionnel** chez un prestataire agréé offrant la **collecte** (paiement du patient, avec confirmation par *webhook*) **et** les **versements** (API de décaissement vers un numéro Wave / Orange Money).
2. Implémenter les deux interfaces déjà prévues : `PaymentProvider` (collecte, `modules/payments/payment.service.ts`) et `PayoutProvider` (versement, `modules/payments/payout.service.ts`, fonction `registerPayoutProvider`), puis les activer par `PAYMENT_PROVIDER` et `PAYOUT_PROVIDER`. Tester dans le **bac à sable** du prestataire.
3. **Cadre juridique** : conserver l'argent d'un client jusqu'à la livraison, puis le répartir, ressemble à de la détention de fonds de tiers, activité réglementée. Le plus sûr est un produit de **séquestre / répartition** fourni par un prestataire agréé, pour que PharmaLoc ne détienne jamais les fonds. À faire valider par un juriste.
4. **Vérification d'identité** (KYC) des pharmacies et des livreurs bénéficiaires.
5. **Décisions à prendre** : qui supporte les **frais du prestataire** (retenue sur chaque part ? sur la pharmacie ?), éventuelle **commission**, traitement fiscal.
6. **Litiges** : après la livraison, aucun remboursement automatique n'est prévu ; à traiter par l'administration.

## 6. Pour le jury
Dire clairement que **le paiement est une démonstration**, montrer que la **logique de répartition est réelle et vérifiable** (tableaux Paiements / Mes gains / Finances), et présenter le plan d'intégration du §5.

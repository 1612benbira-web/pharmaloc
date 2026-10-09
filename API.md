# API PharmaLoc

Base : `/api` · JSON · authentification `Authorization: Bearer <accessToken>` · succès `{ "data": …, "meta"?: … }` · erreur `{ "error": { "code", "message", "details"? } }`.
Codes : 400, 401, 403, 404, 409 (conflit / stock insuffisant), 422 (validation), 429, 500. Listes paginées : `?page=1&limit=20` (max 100).
Rôles : **P** = PATIENT · **PH** = PHARMACIST · **L** = DELIVERY_AGENT · **A** = ADMIN · *public* = sans jeton.

## Observabilité et authentification
| Méthode | Route | Accès | Description |
|---|---|---|---|
| GET | /health | public | `{status:"ok",service:"pharmaloc"}` |
| POST | /auth/register | public | Inscription **patient** (le champ `role` est refusé) |
| POST | /auth/login, /auth/refresh | public | Jetons accès (15 min) + refresh (7 j) |
| POST | /auth/logout | connecté | Invalide tous les jetons du compte |
| GET | /auth/me | connecté | Profil |
| POST, GET | /users | A | Créer un compte avec rôle / lister |
| PATCH | /users/:id/status | A | Activer / désactiver |

## Catalogue, pharmacies, recherche
| Méthode | Route | Accès | Description |
|---|---|---|---|
| GET | /medicines/search?q&lat&lng&neighborhood&city&onlyAvailable&delivery&pickup&maxDistanceKm&maxPrice&openNow&sort | public | Médicament → pharmacies : stock **disponible** (réel − réservé), distance, livraison/retrait, prix, ouverture |
| GET | /medicines, /medicines/:id | public | Catalogue paginé |
| POST, PATCH | /medicines, /medicines/:id | PH, A | Créer / modifier |
| GET | /pharmacies?lat&lng&radiusKm&city&neighborhood&openNow&delivery | public | Pharmacies validées, triées par distance (`all=true` pour A) |
| GET | /pharmacies/:id | public | Détail + note moyenne |
| POST | /pharmacies | A | Créer |
| PATCH | /pharmacies/:id | A (tout), PH (sa pharmacie, champs limités) | Modifier |
| PATCH | /pharmacies/:id/validation | A | Valider / suspendre |

## Stock (un pharmacien est **toujours limité à sa pharmacie**)
| Méthode | Route | Accès | Description |
|---|---|---|---|
| GET, POST | /stocks | PH, A | Liste (`status=ok\|low\|out`, `q`, `includeForecast`) / ajouter un produit au catalogue |
| GET, PATCH | /stocks/:id | PH, A | Détail (lots, prévision) / seuils, prix |
| POST | /stocks/:id/adjust | PH, A | Ajustement `{delta, note, batchNumber?, expirationDate?}` |
| GET | /stocks/:id/forecast | PH, A | Consommation moyenne, jours restants, explication |
| POST | /stocks/sweep-expired | PH, A | Retire les lots expirés (mouvement `expiration`) |
| GET | /stock-movements?stockId&type&from&to | PH, A | Historique immuable (avant/après, référence, utilisateur) |
| POST | /supplier-deliveries | PH, A | **Nouvelle livraison fournisseur** : stock, mouvements, alertes, notification, audit |
| GET | /supplier-deliveries, /supplier-deliveries/:id | PH, A | Historique |
| GET, POST | /suppliers | PH, A | Fournisseurs |
| GET | /alerts?status&type&severity | PH, A | Alertes |
| POST | /alerts/refresh | PH, A | Retire les expirés, recalcule alertes et prévisions |
| GET | /purchase-orders | PH, A | Suggestions de réapprovisionnement |
| POST | /purchase-orders/generate | PH, A | Calcule la suggestion (rien n'est commandé) |
| POST | /purchase-orders/:id/accept, /reject | PH, A | Décision du pharmacien (quantités modifiables) |

## Commandes, livraison, paiement
| Méthode | Route | Accès | Description |
|---|---|---|---|
| POST | /orders | P | Crée la commande et **réserve** le stock (409 si insuffisant) |
| GET | /orders, /orders/:id | selon rôle | Liste filtrée par rôle / détail (le code de livraison n'est visible que du patient) |
| POST | /orders/:id/cancel | P (avant préparation), PH, A | Libère le stock, rembourse |
| POST | /orders/:id/accept, reject, prepare, ready | PH, A | Cycle pharmacie (`ready` ouvre la recherche de livreur) |
| POST | /orders/:id/handover `{code}` | PH, A | Retrait en pharmacie (code du patient) : vente |
| POST | /orders/:id/review | P | Évaluation après livraison |
| GET, PATCH | /agents/me | L | Disponibilité, véhicule, position |
| GET | /agents | A | Supervision des livreurs |
| GET | /deliveries/available, /deliveries/mine | L | Demandes / mes livraisons |
| POST | /delivery-assignments `{deliveryId}` | L | Accepter (prise atomique : un seul livreur) |
| POST | /deliveries/:id/pickup, start, location | L | Récupérer (**le stock est vendu ici**), démarrer, partager la position |
| POST | /deliveries/:id/complete `{code}` | L | Confirmation par code OTP (5 essais maximum) |
| GET | /deliveries/:id | acteurs de la commande | Détail |
| GET, POST | /payments/:id, /payments/:id/verify | propriétaire, A | Statut (mode DEMO) |
| GET, POST, DELETE | /addresses | P | Carnet d'adresses |
| GET, POST | /notifications, /notifications/unread-count, /:id/read, /read-all | connecté | Notifications |
| GET | /dashboard/pharmacy | PH, A | Statistiques + graphiques |
| GET | /dashboard/admin | A | Activité de la plateforme |
| GET | /audit-logs?action&entity | A | Journal d'audit |

## Statuts de commande
`pending → confirmed → preparing → ready → (livraison) assigned → picked_up → in_delivery → delivered` · retrait : `ready → delivered` · `cancelled` possible avant `picked_up`.
Types de mouvement : `delivery_received, sale, reservation, cancellation, adjustment, return, expiration`.
Écart avec la spécification : la réception de marchandise est `POST /supplier-deliveries` (et non `/deliveries`), car `/deliveries/:id/pickup|complete` concernent la livraison au patient.

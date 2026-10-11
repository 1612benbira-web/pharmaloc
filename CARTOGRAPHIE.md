# Cartographie : Leaflet + OpenStreetMap

## Ce qui est utilisé
| Élément | Détail | Licence |
|---|---|---|
| **Leaflet 1.9.4** | Bibliothèque de carte, utilisée **directement** (module `frontend/src/lib/leafletMap.ts`) | BSD-2-Clause |
| `@types/leaflet` | Types TypeScript (développement) | MIT |
| **Tuiles OpenStreetMap** | Fond de carte `https://tile.openstreetmap.org/{z}/{x}/{y}.png` | Données © contributeurs OpenStreetMap, **ODbL** : attribution obligatoire |
| ~~react-leaflet~~ | **Volontairement NON utilisé** : licence **Hippocratic-2.1**, non permissive (le règlement n'admet que MIT, Apache 2.0, BSD) | - |

Aucune image de marqueur n'est embarquée : les repères sont des `divIcon` (emoji + CSS).

## Où les cartes apparaissent
Recherche (pharmacies, stock, prix, position du patient) · Panier (choisir ou ajuster son point de livraison en cliquant ou en déplaçant le repère ; la distance et les frais se mettent à jour) · Suivi de commande (pharmacie, adresse, livreur, position partagée par le patient) · Espace livreur (trajet) · Admin (vérifier la position d'une pharmacie demandeuse) · Inscription d'une pharmacie (placer précisément la pharmacie).

## Conformité à la politique d'usage des tuiles OSM
Texte de référence : https://operations.osmfoundation.org/policies/tiles/ (lu lors de l'intégration : **relisez-le avant la soumission**, il peut évoluer).

| Exigence | Ce que fait PharmaLoc | Où |
|---|---|---|
| URL officielle, HTTPS, **sans sous-domaines a/b/c** | `https://tile.openstreetmap.org/{z}/{x}/{y}.png` | `leafletMap.ts` (testé) |
| **Attribution visible** « © OpenStreetMap contributors » avec lien vers `/copyright` | Contrôle d'attribution de la carte, jamais masqué ; rappelée en pied de page de toutes les pages | `leafletMap.ts`, `layout.tsx` (testé) |
| En-tête **Referer valide** | `Referrer-Policy: strict-origin-when-cross-origin` explicite : **ne jamais passer à `no-referrer`** | `next.config.mjs` (vérifié par requête HTTP) |
| Cache HTTP respecté | Aucun proxy ni contournement : le navigateur gère le cache | - |
| **Pas de pré-chargement ni de téléchargement massif** | Seules les tuiles de la zone visible sont demandées (6 pour une vue standard, testé) ; zoom borné 8-19 ; `keepBuffer: 1` | `leafletMap.ts` |
| Pas de chargement inutile | La carte n'est chargée **qu'après un clic** (bouton « Voir la carte ») | `LazyMap` |
| Adresse de contact et lien « signaler une erreur » | Lien `fixthemap` dans l'attribution et le pied de page ; contact via `NEXT_PUBLIC_CONTACT_EMAIL` (à renseigner) | `layout.tsx` |
| Fournisseur remplaçable | `NEXT_PUBLIC_TILE_URL` et `NEXT_PUBLIC_TILE_ATTRIBUTION` : changer de fournisseur sans toucher au code | `.env.example` |

## Limites et usage en production
- Les serveurs de tuiles OSM sont **fournis par des bénévoles, sans garantie de service**, et leur accès peut être restreint à tout moment. La politique réserve leur usage à une utilisation raisonnable.
- **Pour la démonstration au jury** (quelques dizaines de visiteurs, cartes chargées à la demande), l'usage est cohérent avec la politique.
- **Pour un lancement réel**, utiliser un **fournisseur de tuiles commercial** (MapTiler, Stadia Maps, Mapbox… : vérifier leur licence et leurs conditions d'attribution), ou **héberger ses propres tuiles**. Il suffit de changer les deux variables d'environnement.
- **Vie privée** : en affichant une carte, le navigateur contacte les serveurs OSM, qui voient l'adresse IP et la zone consultée. Un avertissement est affiché sous chaque carte, et rien n'est chargé avant le clic.
- Les distances de livraison restent calculées **côté serveur** à vol d'oiseau : la carte sert à choisir un point, jamais à fixer un prix.
- Le tracé pharmacie → client est une ligne droite, **pas un itinéraire routier**. Pour un itinéraire, des liens vers OpenStreetMap restent proposés.

## Vérifié / non vérifié
- Vérifié par un test automatisé en DOM simulé (`frontend/scripts/map-smoke.ts`, 19 contrôles) : URL des tuiles, attribution, nombre de tuiles, popups sans injection HTML, déplacement/clic, cadrage, nettoyage.
- Vérifié : en-têtes HTTP du frontend.
- **Non vérifié dans un vrai navigateur** : rendu visuel, glisser-déposer à la souris/au doigt, chargement réel des tuiles. À tester avec `DEMO.md`.

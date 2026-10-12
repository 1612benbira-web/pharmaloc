# Sécurité

| Mesure | Mise en œuvre |
|---|---|
| Authentification | Mots de passe **bcrypt** (coût 12) ; JWT HS256 accès 15 min / refresh 7 j ; type de jeton vérifié |
| Invalidation de session | `tokenVersion` : déconnexion ou désactivation ⇒ tous les jetons meurent ; le compte est relu en base à chaque requête |
| Autorisation | `authenticate` + `authorize(rôles)` **côté serveur** sur chaque route ; aucune confiance au frontend |
| Cloisonnement | Pharmacien limité à sa pharmacie (paramètre `pharmacyId` ignoré) ; patient limité à ses commandes ; livreur limité à ses livraisons |
| Escalade de privilèges | `/auth/register` = patient uniquement, schémas stricts (`role`, `approvalStatus`, `isValidated` refusés) ; pharmacies et livreurs s'inscrivent via des routes dédiées mais restent **en attente** : 403 sur toutes les routes protégées tant qu'un administrateur n'a pas approuvé |
| Validation des partenaires | Pharmacie : n° d'agrément + position vérifiable sur carte ; décision admin tracée (audit) et notifiée ; refus = pharmacie désactivée ; décision unique (409 si déjà traitée) |
| Position du patient | Envoyée **volontairement** (clic), visible **du seul livreur assigné** (masquée à la pharmacie et à l'admin), possible uniquement pendant une livraison en cours, **effacée à la livraison/annulation**, arrêt du partage à tout moment |
| Cartes | Popups construits en **texte** (jamais en HTML : pas d'injection via un nom de pharmacie) ; tuiles chargées seulement après un clic, avec avertissement (OSM voit l'IP et la zone consultée) ; `Referrer-Policy` explicite |
| Numéro du patient | Jamais communiqué automatiquement : **le patient décide** (partage de son numéro ou réponse à la demande du livreur, avec possibilité de refuser). Visible du seul livreur assigné (masqué à la pharmacie et à l'admin), 3 demandes maximum par livraison, **effacé à la livraison/annulation**, jamais écrit dans les journaux d'audit |
| Frais de livraison | Calculés **côté serveur** à partir de la position ; le client ne peut ni les fournir ni les modifier (champ refusé) |
| Validation | **Zod** sur body/query/params ; schémas `.strict()` ; opérateurs Mongo injectés refusés (422) ; regex de recherche échappées |
| Intégrité métier | Prix lus côté serveur ; transitions de statut atomiques ; réservations atomiques ; références fournisseur uniques |
| Code de livraison | 6 chiffres dérivés par HMAC, jamais exposé à la pharmacie ni au livreur, 5 essais puis blocage (429) |
| Anti-abus | Rate limiting global + strict sur /auth ; connexion à temps constant (pas d'énumération de comptes) ; taille du corps limitée |
| En-têtes / CORS | **helmet**, `x-powered-by` retiré, CORS restreint à `CORS_ORIGINS` |
| Erreurs | Format normalisé ; **aucune stack trace en production** (testé) |
| Traçabilité | AuditLog (connexions, échecs, commandes, annulations, réceptions, ajustements, décisions) + mouvements de stock immuables |
| Données | Aucun mot de passe ni jeton dans les réponses ; aucune donnée bancaire ; paiements en mode DEMO |
| Géolocalisation | Demandée uniquement après une action explicite ; alternative quartier / ville |
| Secrets | Variables d'environnement validées au démarrage (32 caractères minimum) ; `.env` ignoré par git |

## Limites connues (v1)
- Jetons stockés en `localStorage` côté navigateur (risque XSS). Évolution : cookies httpOnly + rotation du refresh token + CSP stricte.
- Pas de 2FA ni de verrouillage de compte après N échecs (le rate limiting couvre la force brute).
- Les ordonnances ne sont pas téléversées : la pharmacie les vérifie à la remise.
- Bus d'événements en mémoire (un seul processus). Évolution : file de messages en multi-instances.

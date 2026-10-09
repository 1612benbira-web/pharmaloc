# AI_USAGE - Déclaration d'utilisation de l'IA (art. 6 du règlement)

**Dans le produit** : aucune fonctionnalité d'IA. PharmaLoc n'inclut ni assistant médical ni diagnostic. La prévision de rupture est un calcul arithmétique documenté (ventes sur 14 jours ÷ 14, stock ÷ consommation moyenne).

**Pendant le développement** : l'assistant **Claude (Anthropic)** a été utilisé comme outil d'aide au développement.

| Partie du projet | Usage de l'IA |
|---|---|
| Backend : auth, rôles, modèles, services de stock/commandes/livraison, événements | Génération du code initial, relue, exécutée et corrigée avec les tests |
| Tests (89) | Rédaction des scénarios et des cas limites |
| Frontend : pages patient, pharmacien, livreur, admin, composants | Génération du code initial |
| Données de démonstration (seed) | Génération |
| Documentation (API, base, sécurité, déploiement, démo) | Rédaction assistée |
| Analyse des licences | Scan des dépendances installées et neutralisation de `sharp` (LGPL) et `lightningcss` (MPL) |

Les outils de test (serveur compatible MongoDB pour l'exécution locale des tests) ne sont pas livrés avec le projet.

> **L'équipe doit relire, comprendre et pouvoir expliquer l'ensemble du code** (critère « maîtrise » de l'annexe 1). Compléter ce tableau pour toute autre assistance IA utilisée.

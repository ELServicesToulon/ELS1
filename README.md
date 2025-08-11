# EL Services - Système de Réservation et Gestion

## 1. Description

Ce projet est une application de réservation et de gestion de tournées de livraison construite sur la plateforme **Google Apps Script**. Elle est conçue pour être utilisée par une entreprise de services (comme une pharmacie ou un service de livraison) pour gérer les réservations de ses clients, la planification des livreurs, et la facturation.

L'application se compose d'une interface publique de réservation, d'un espace client sécurisé, d'un panneau d'administration, et d'une interface pour les livreurs.

## 2. Fonctionnalités Principales

*   **Interface de Réservation Publique** : Permet aux nouveaux clients et aux clients existants de réserver des tournées de livraison via un calendrier interactif.
*   **Espace Client** : Portail sécurisé où les clients peuvent consulter l'historique de leurs courses et gérer leurs réservations à venir. L'authentification se fait sans mot de passe, via un lien de connexion à durée limitée envoyé par e-mail.
*   **Panneau d'Administration** : Interface complète pour les administrateurs pour superviser toutes les réservations, gérer les clients, configurer les tarifs et les paramètres de l'application, et générer les factures.
*   **Interface Livreur** : Vue simplifiée pour les livreurs, leur permettant de voir les courses qui leur sont assignées pour une date donnée.
*   **Gestion de la Configuration** : La configuration de l'application (tarifs, clés API, IDs de documents, etc.) est gérée de manière centralisée via `PropertiesService` de Google Apps Script, et non codée en dur.
*   **Génération de Factures** : Fonctionnalité pour générer automatiquement des factures au format PDF à partir d'un modèle Google Docs.

## 3. Architecture et Fichiers

L'application est construite comme une **Web App** Google Apps Script.

### Fichiers Principaux (`.gs`)

*   `Code.gs`: Point d'entrée principal de l'application. Gère les requêtes web (`doGet`) et les menus du tableur (`onOpen`).
*   `Configuration.gs`: Gère la récupération des variables de configuration depuis `PropertiesService`.
*   `Reservation.gs`, `Administration.gs`, `ClientEspace.gs`, `Livreur.gs`: Contiennent la logique métier (backend) pour chaque section respective de l'application.
*   `Calendrier.gs`: Gère la logique de calcul des créneaux de disponibilité.
*   `Utilitaires.gs`: Contient des fonctions d'aide partagées (formatage de date, sanitization, etc.).
*   `Setup.gs`: Contient des scripts de configuration à usage unique (ex: `migrerConfigurationVersProperties`).

### Fichiers d'Interface (`.html`)

Le frontend est structuré en "vues" HTML qui sont servies par `Code.gs`. Chaque vue principale a un fichier `_Interface.html`, un fichier `_CSS.html`, et un ou plusieurs fichiers `_JS.html`.

*   `Reservation_Interface.html`: La page de réservation publique.
*   `Admin_Interface.html`: Le tableau de bord de l'administrateur.
*   `Client_Espace.html`: Le portail client.
*   `Livreur_Interface.html`: L'interface du livreur.

## 4. Instructions de Configuration

Pour déployer ou développer ce projet, suivez ces étapes :

1.  **Cloner le projet** : Utilisez `clasp` (l'outil en ligne de commande pour Apps Script) pour cloner ce dépôt dans un nouveau projet Google Apps Script.
2.  **Configurer les Services Google** :
    *   Créez une nouvelle **Feuille de Calcul Google Sheets** et créez les onglets nécessaires (`Clients`, `Facturation`, `Destinataires`, etc.).
    *   Créez un **Modèle de Facture** dans Google Docs.
    *   Créez des **Dossiers Google Drive** pour les archives et les fichiers temporaires.
    *   Notez les IDs de tous ces documents et dossiers.
3.  **Remplir la Configuration** :
    *   Dans l'éditeur de script, exécutez la fonction `migrerConfigurationVersProperties` depuis le fichier `Setup.gs`. Cela initialisera `PropertiesService` avec les valeurs par défaut.
    *   **IMPORTANT** : Vous devrez ensuite manuellement mettre à jour les `Script Properties` via l'interface de l'éditeur de projet pour y mettre vos propres IDs de documents, d'emails, etc.
4.  **Déployer l'Application Web** :
    *   Dans l'éditeur Apps Script, allez dans `Déployer` > `Nouveau déploiement`.
    *   Choisissez "Application web" comme type de déploiement.
    *   Configurez l'application pour qu'elle s'exécute en tant que "Moi" (le propriétaire du projet) et pour qu'elle soit accessible à "Tous" (pour l'interface publique).
    *   Copiez l'URL de l'application web déployée.

## 5. Dépendances

Le projet utilise les **services avancés** de Google Apps Script :
*   **Google Calendar API**

Assurez-vous qu'il est activé dans l'éditeur de script (`Services` > `+`). Le manifeste `appsscript.json` est déjà configuré pour demander les permissions nécessaires (`oauthScopes`).

/**
 * =================================================================
 * LOGIQUE DE L'INTERFACE DE CONFIGURATION ADMIN
 * =================================================================
 * Description: Fournit les fonctions serveur pour charger et
 *              sauvegarder la configuration de l'application.
 * =================================================================
 */

/**
 * Point d'entrée pour l'interface d'administration pour récupérer la configuration.
 * Appelle simplement getConfiguration() qui gère déjà la fusion des surcharges.
 * @returns {Object} L'objet de configuration complet.
 */
function getAdminConfiguration() {
  // On s'assure que seul un admin peut voir la configuration.
  const config = getConfiguration();
  const userEmail = Session.getActiveUser().getEmail();

  if (userEmail !== config.ADMIN_EMAIL) {
    throw new Error("Accès non autorisé. Seul l'administrateur peut accéder à la configuration.");
  }

  return config;
}


/**
 * Sauvegarde les nouvelles valeurs de configuration dans PropertiesService.
 * @param {Object} newConfig - Un objet contenant les clés et valeurs à sauvegarder.
 * @returns {Object} Un objet de statut avec un message de succès ou d'erreur.
 */
function saveConfiguration(newConfig) {
  const CONFIG = getConfiguration();
  const userEmail = Session.getActiveUser().getEmail();

  if (userEmail !== CONFIG.ADMIN_EMAIL) {
    return { success: false, message: "Action non autorisée. Seul l'administrateur peut modifier la configuration." };
  }

  try {
    // Valider et nettoyer les données reçues du client si nécessaire.
    // Pour le moment, nous faisons confiance aux données structurées.

    const properties = PropertiesService.getScriptProperties();

    // Nous ne stockons que les clés qui sont modifiables pour ne pas polluer les properties.
    const configToStore = {
      DELAI_MODIFICATION_MINUTES: parseInt(newConfig.DELAI_MODIFICATION_MINUTES, 10) || 60,
      TARIFS: newConfig.TARIFS || CONFIG.TARIFS // Sauvegarde l'objet TARIFS entier
    };

    properties.setProperty('CONFIG_OVERRIDES', JSON.stringify(configToStore));

    Logger.log(`Configuration mise à jour par ${userEmail}. Nouvelles valeurs : ${JSON.stringify(configToStore)}`);
    return { success: true, message: "Configuration enregistrée avec succès." };

  } catch (e) {
    Logger.log(`Échec de la sauvegarde de la configuration par ${userEmail}. Erreur: ${e.stack}`);
    return { success: false, message: `Une erreur est survenue: ${e.message}` };
  }
}

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
  const userEmail = Session.getActiveUser().getEmail();
  if (!isUserAdmin(userEmail)) {
    throw new Error("Accès non autorisé. Seul l'administrateur peut accéder à la configuration.");
  }

  return getConfiguration();
}


/**
 * Valide la structure et les types de données de l'objet TARIFS.
 * @param {Object} tarifs - L'objet de tarification à valider.
 * @throws {Error} Lance une erreur si la validation échoue.
 */
function validateTarifs(tarifs) {
  if (!tarifs || typeof tarifs !== 'object') {
    throw new Error("L'objet TARIFS est manquant ou n'est pas un objet.");
  }

  const requiredKeys = ['Normal', 'Samedi', 'Urgent', 'Special'];
  for (const key of requiredKeys) {
    if (!tarifs[key] || typeof tarifs[key] !== 'object') {
      throw new Error(`La clé '${key}' est manquante ou n'est pas un objet dans TARIFS.`);
    }
    if (typeof tarifs[key].base !== 'number') {
      throw new Error(`La propriété 'base' pour '${key}' doit être un nombre.`);
    }
    if (!Array.isArray(tarifs[key].arrets) || tarifs[key].arrets.some(isNaN)) {
      throw new Error(`La propriété 'arrets' pour '${key}' doit être un tableau de nombres.`);
    }
  }
}

/**
 * Met à jour une seule valeur de configuration dans PropertiesService.
 * Utile pour les mises à jour programmatiques comme l'incrémentation du numéro de facture.
 * @param {string} key - La clé de configuration à mettre à jour.
 * @param {*} value - La nouvelle valeur.
 */
function updateSingleConfigValue(key, value) {
  const properties = PropertiesService.getScriptProperties();
  const overridesStr = properties.getProperty('CONFIG_OVERRIDES');
  const overrides = overridesStr ? JSON.parse(overridesStr) : {};

  overrides[key] = value;

  properties.setProperty('CONFIG_OVERRIDES', JSON.stringify(overrides));
  Logger.log(`Valeur de configuration unique mise à jour: ${key} = ${value}`);
}


/**
 * Sauvegarde les nouvelles valeurs de configuration depuis l'interface admin dans PropertiesService.
 * @param {Object} newConfig - Un objet contenant les clés et valeurs à sauvegarder.
 * @returns {Object} Un objet de statut avec un message de succès ou d'erreur.
 */
function saveConfiguration(newConfig) {
  const userEmail = Session.getActiveUser().getEmail();
  if (!isUserAdmin(userEmail)) {
    return { success: false, message: "Action non autorisée. Seul l'administrateur peut modifier la configuration." };
  }

  try {
    // --- Validation des données reçues ---
    if (!newConfig) {
        throw new Error("Aucune configuration fournie.");
    }

    // Validation des IDs (ne doivent pas être vides)
    const idsToValidate = ['ID_CALENDRIER', 'ID_FEUILLE_CALCUL', 'ID_MODELE_FACTURE', 'ID_DOSSIER_ARCHIVES'];
    for (const id of idsToValidate) {
      if (!newConfig[id] || String(newConfig[id]).trim() === '') {
        throw new Error(`L'identifiant '${id}' ne peut pas être vide.`);
      }
    }

    validateTarifs(newConfig.TARIFS);

    const delai = parseInt(newConfig.DELAI_MODIFICATION_MINUTES, 10);
    if (isNaN(delai) || delai < 0) {
        throw new Error("Le délai de modification doit être un nombre positif.");
    }

    const prochainNumero = parseInt(newConfig.PROCHAIN_NUMERO_FACTURE, 10);
    if (isNaN(prochainNumero) || prochainNumero < 0) {
        throw new Error("Le prochain numéro de facture doit être un nombre positif.");
    }

    if (!newConfig.PREFIXE_FACTURE || typeof newConfig.PREFIXE_FACTURE !== 'string' || newConfig.PREFIXE_FACTURE.trim() === '') {
        throw new Error("Le préfixe de facture ne peut pas être vide.");
    }


    const properties = PropertiesService.getScriptProperties();
    // On récupère les anciennes surcharges pour ne pas écraser des clés non modifiables dans cette interface
    const overridesStr = properties.getProperty('CONFIG_OVERRIDES');
    const overrides = overridesStr ? JSON.parse(overridesStr) : {};

    // On met à jour les valeurs modifiables
    overrides.DELAI_MODIFICATION_MINUTES = delai;
    overrides.TARIFS = newConfig.TARIFS;
    overrides.PROCHAIN_NUMERO_FACTURE = prochainNumero;
    overrides.PREFIXE_FACTURE = newConfig.PREFIXE_FACTURE.trim();
    // On met à jour les IDs
    idsToValidate.forEach(id => {
        overrides[id] = newConfig[id].trim();
    });


    properties.setProperty('CONFIG_OVERRIDES', JSON.stringify(overrides));

    Logger.log(`Configuration mise à jour par ${userEmail}.`);
    return { success: true, message: "Configuration enregistrée avec succès." };

  } catch (e) {
    Logger.log(`Échec de la sauvegarde de la configuration par ${userEmail}. Erreur: ${e.stack}`);
    return { success: false, message: `Une erreur est survenue: ${e.message}` };
  }
}

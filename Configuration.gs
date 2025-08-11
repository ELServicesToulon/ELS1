/**
 * =================================================================
 *                CONFIGURATION DE L'APPLICATION
 * =================================================================
 * Description: Centralise la récupération de toutes les variables
 *              et paramètres depuis PropertiesService.
 * =================================================================
 */

/**
 * Récupère une propriété depuis PropertiesService, avec une valeur par défaut.
 * Gère la conversion des types (JSON, nombres, booléens).
 * @param {GoogleAppsScript.Properties.Properties} properties - L'instance de PropertiesService.
 * @param {string} key - La clé de la propriété.
 * @param {*} defaultValue - La valeur par défaut si la clé n'est pas trouvée.
 * @returns {*} La valeur de la propriété, convertie au type approprié.
 */
function getProperty(properties, key, defaultValue = null) {
    const value = properties.getProperty(key);
    if (value === null) {
        return defaultValue;
    }
    // Tente de parser la valeur comme du JSON. Si ça échoue,
    // retourne la valeur brute (chaîne), ce qui est le comportement attendu
    // pour les nouvelles configurations saisies via l'UI.
    try {
        return JSON.parse(value);
    } catch (e) {
        // Le parsing a échoué, on suppose que c'est une chaîne de caractères normale.
        return value;
    }
}

/**
 * Retourne un objet contenant toute la configuration de l'application
 * en lisant les valeurs depuis PropertiesService.
 * @returns {Object} L'objet de configuration.
 */
function getConfiguration() {
    const properties = PropertiesService.getScriptProperties();
    const config = {};

    // --- Définition des clés et de leurs valeurs par défaut ---
    // La validation des clés critiques est désormais gérée par CONFIG_verifierConfigurationOuErreur()
    const configMap = {
        // --- Infos Entreprise (les plus critiques n'ont pas de défaut) ---
        NOM_ENTREPRISE: "EL Services",
        ADRESSE_ENTREPRISE: null,
        EMAIL_ENTREPRISE: null,
        SIRET: null,
        RIB_ENTREPRISE: null,
        BIC_ENTREPRISE: null,
        ADMIN_EMAIL: null,
        LIVREUR_EMAILS: [],
        logoCompletClairBase64: "PLACEHOLDER_BASE64_LOGO_STRING",

        // --- Facturation ---
        TVA_APPLICABLE: false,
        TAUX_TVA: 0.20,
        DELAI_PAIEMENT_JOURS: 5,
        PREFIXE_FACTURE: 'FACT',
        PROCHAIN_NUMERO_FACTURE: 1,
        MENTIONS_LEGALES: 'TVA non applicable, art. 293 B du CGI.',
        PAIEMENTS_CONFIG: {},

        // --- IDs Google (critiques, pas de défaut) ---
        ID_CALENDRIER: null,
        ID_DOCUMENT_CGV: null,
        ID_FEUILLE_CALCUL: null,
        ID_MODELE_FACTURE: null,
        ID_DOSSIER_ARCHIVES: null,
        ID_DOSSIER_TEMPORAIRE: null,
        CLIENT_SHEET_ID: null,

        // --- Horaires & Tampons ---
        HEURE_DEBUT_SERVICE: "08:30",
        HEURE_FIN_SERVICE: "18:30",
        DUREE_TAMPON_MINUTES: 15,
        INTERVALLE_CRENEAUX_MINUTES: 15,
        URGENT_THRESHOLD_MINUTES: 30,
        DELAI_MODIFICATION_MINUTES: 60,

        // --- Prestations ---
        DUREE_BASE: 30,
        DUREE_ARRET_SUP: 15,
        KM_BASE: 9,
        KM_ARRET_SUP: 3,
        TARIFS: {},

        // --- Parrainage ---
        PARRAINAGE_CONFIG: {},

        // --- Maintenance ---
        RETENTION_FACTURES_ANNEES: 5,
        RETENTION_LOGS_MOIS: 12,
        FEUILLES_A_SAUVEGARDER: [],

        // --- Colonnes ---
        COLONNE_TYPE_REMISE_CLIENT: "Type de Remise",
        COLONNE_VALEUR_REMISE_CLIENT: "Valeur Remise",
        COLONNE_NB_TOURNEES_OFFERTES: "Nombre Tournées Offertes",
        COLONNE_CODE_PARRAINAGE: "CodeParrainage",
        COLONNE_CODE_UTILISE: "CodeUtilise",
        COLONNE_CREDIT_PARRAINAGE: "CreditParrainage"
    };

    // --- Lecture des propriétés ---
    for (const key in configMap) {
        if (Object.prototype.hasOwnProperty.call(configMap, key)) {
            const defaultValue = configMap[key];
            // La validation est maintenant gérée en amont par CONFIG_verifierConfigurationOuErreur().
            // On se contente de lire la propriété ou d'utiliser la valeur par défaut.
            config[key] = getProperty(properties, key, defaultValue);
        }
    }

    // Conversion explicite des nombres au cas où ils seraient stockés comme chaînes.
    // Ceci reste important car PropertiesService stocke tout en chaîne.
    if (config.PROCHAIN_NUMERO_FACTURE) {
        config.PROCHAIN_NUMERO_FACTURE = parseInt(config.PROCHAIN_NUMERO_FACTURE, 10);
    }
    if (config.DUREE_BASE) {
        config.DUREE_BASE = parseInt(config.DUREE_BASE, 10);
    }
    // ... ajouter d'autres conversions si nécessaire

    return config;
}

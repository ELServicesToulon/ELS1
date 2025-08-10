// =================================================================
//                      CONFIGURATION DE L'APPLICATION
// =================================================================
// Description: Centralise toutes les variables et paramètres
//              dans une fonction pour garantir leur disponibilité
//              dans tout le projet.
// =================================================================

/**
 * Retourne un objet contenant toute la configuration de l'application.
 * La configuration de base est surchargée par les paramètres sauvegardés
 * dans PropertiesService pour permettre une configuration dynamique.
 * @returns {Object} L'objet de configuration.
 */
function getConfiguration() {
  // --- Configuration de base ---
  const config = {
    // --- Informations sur l'entreprise ---
    NOM_ENTREPRISE: "EL Services",
    ADRESSE_ENTREPRISE: "255 Avenue Marcel Castie B, 83000 Toulon",
    EMAIL_ENTREPRISE: "elservicestoulon@gmail.com",
    SIRET: "48091306000020",
    RIB_ENTREPRISE: "FR7640618804760004035757187",
    BIC_ENTREPRISE: "BOUSFRPPXXX",
    ADMIN_EMAIL: "elservicestoulon@gmail.com",
    LIVREUR_EMAILS: ["livreur1@example.com", "livreur2@example.com"], // Emails des livreurs autorisés
    logoCompletClairBase64: "PLACEHOLDER_BASE64_LOGO_STRING",

    // --- Paramètres de facturation ---
    TVA_APPLICABLE: false,
    TAUX_TVA: 0.20, // 20%
    DELAI_PAIEMENT_JOURS: 5,

    // --- Identifiants des services Google ---
    ID_CALENDRIER: "Elservicestoulon@gmail.com",
    ID_DOCUMENT_CGV: "1ze9U3k_tcS-RlhIcI8zSs2OYom2miVy8WxyxT8ktFp0",
    ID_FEUILLE_CALCUL: "1-i8xBlCrl_Rrjo2FgiL33pIRjD1EFqyvU7ILPud3-r4",
    ID_MODELE_FACTURE: "1KWDS0gmyK3qrYWJd01vGID5fBVK10xlmErjgr7lrwmU",
    ID_DOSSIER_ARCHIVES: "1UavaEsq6TkDw1QzJZ91geKyF7hrQY4S8",
    ID_DOSSIER_TEMPORAIRE: "1yDBSzTqwaUt-abT0s7Z033C2WlN1NSs6",
    CLIENT_SHEET_ID: '1-i8xBlCrl_Rrjo2FgiL33pIRjD1EFqyvU7ILPud3-r4',

    // --- Horaires & Tampons ---
    HEURE_DEBUT_SERVICE: "08:30",
    HEURE_FIN_SERVICE: "18:30",
    DUREE_TAMPON_MINUTES: 15,
    INTERVALLE_CRENEAUX_MINUTES: 15,
    URGENT_THRESHOLD_MINUTES: 30,
    DELAI_MODIFICATION_MINUTES: 60, // Délai en minutes avant lequel un client peut modifier/reporter sa course

    // --- Durées des prestations (minutes) ---
    DUREE_BASE: 30,
    DUREE_ARRET_SUP: 15,

    // --- Kilométrage estimé ---
    KM_BASE: 9,
    KM_ARRET_SUP: 3,
    
    // --- Tarification ---
    TARIFS: {
      'Normal': { base: 15, arrets: [5, 3, 4, 5, 5] },
      'Samedi': { base: 25, arrets: [5, 3, 4, 5, 5] },
      'Urgent': { base: 20, arrets: [5, 3, 4, 5, 5] },
      'Special': { base: 10, arrets: [2, 1, 2, 3, 3] }
    },

    // --- Parrainage ---
    PARRAINAGE_CONFIG: {
      MONTANT_REMISE_FILLEUL: 10.00,
      MONTANT_RECOMPENSE_PARRAIN: 5.00,
      PREFIXE_CODE: 'PHARMA-',
      LONGUEUR_CODE: 6
    },

    // --- Paramètres de Maintenance ---
    RETENTION_FACTURES_ANNEES: 5,
    RETENTION_LOGS_MOIS: 12,
    FEUILLES_A_SAUVEGARDER: ["Clients", "Facturation", "Plages_Bloquees", "Logs", "Admin_Logs", "AuthTokens"],

    // --- Noms des colonnes spécifiques ---
    COLONNE_TYPE_REMISE_CLIENT: "Type de Remise",
    COLONNE_VALEUR_REMISE_CLIENT: "Valeur Remise",
    COLONNE_NB_TOURNEES_OFFERTES: "Nombre Tournées Offertes",
    COLONNE_CODE_PARRAINAGE: "CodeParrainage",
    COLONNE_CODE_UTILISE: "CodeUtilise",
    COLONNE_CREDIT_PARRAINAGE: "CreditParrainage"
  };

  try {
    const properties = PropertiesService.getScriptProperties();
    const overridesStr = properties.getProperty('CONFIG_OVERRIDES');
    if (overridesStr) {
      const overrides = JSON.parse(overridesStr);

      // Fusionner les configurations.
      // Note: Cela ne fusionne pas en profondeur, mais remplace les clés de haut niveau.
      // C'est suffisant si nous sauvegardons des objets entiers comme 'TARIFS'.
      Object.assign(config, overrides);
    }
  } catch (e) {
    Logger.log('Erreur lors du chargement de la configuration surchargée depuis PropertiesService: ' + e.message);
    // En cas d'erreur (par ex. JSON mal formé), on retourne la configuration de base.
  }

  return config;
}




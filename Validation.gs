// =================================================================
//                      VALIDATION DE LA CONFIGURATION
// =================================================================
// Description: Vérifie l'intégrité des paramètres critiques définis
//              dans Configuration.gs. Bloque l'exécution et alerte
//              l'administrateur en cas d'erreur.
// =================================================================

/**
 * Fonction principale de validation, appelée au démarrage de l'application.
 * @throws {Error} Lance une erreur si un problème de configuration est détecté.
 */
function validerConfiguration() {
  const erreurs = [];
  
  // --- Vérification des formats ---
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  if (!emailRegex.test(ADMIN_EMAIL)) {
    erreurs.push(`Format de l'e-mail administrateur invalide : ${ADMIN_EMAIL}`);
  }
  
  if (!/^\d{14}$/.test(SIRET)) {
    erreurs.push(`Format du SIRET invalide. Il doit contenir 14 chiffres. Valeur actuelle : ${SIRET}`);
  }
  
  // --- Vérification de la cohérence ---
  if (HEURE_DEBUT_SERVICE >= HEURE_FIN_SERVICE) {
    erreurs.push(`L'heure de début de service (${HEURE_DEBUT_SERVICE}) doit être antérieure à l'heure de fin (${HEURE_FIN_SERVICE}).`);
  }

  // --- Test d'accès aux IDs des services Google ---
  try { DriveApp.getFolderById(ID_DOSSIER_ARCHIVES); } catch (e) { erreurs.push("L'ID du dossier d'archives (ID_DOSSIER_ARCHIVES) est invalide ou l'accès est refusé."); }
  try { DriveApp.getFolderById(ID_DOSSIER_TEMPORAIRE); } catch (e) { erreurs.push("L'ID du dossier temporaire (ID_DOSSIER_TEMPORAIRE) est invalide ou l'accès est refusé."); }
  try { DocumentApp.openById(ID_MODELE_FACTURE); } catch (e) { erreurs.push("L'ID du modèle de facture (ID_MODELE_FACTURE) est invalide ou l'accès est refusé."); }
  try { SpreadsheetApp.openById(ID_FEUILLE_CALCUL); } catch (e) { erreurs.push("L'ID de la feuille de calcul (ID_FEUILLE_CALCUL) est invalide ou l'accès est refusé."); }
  try { DocumentApp.openById(ID_DOCUMENT_CGV); } catch (e) { erreurs.push("L'ID du document des CGV (ID_DOCUMENT_CGV) est invalide ou l'accès est refusé."); }
  try { CalendarApp.getCalendarById(ID_CALENDRIER); } catch (e) { erreurs.push("L'ID du calendrier (ID_CALENDRIER) est invalide ou l'accès est refusé."); }

  // --- Gestion centralisée des erreurs ---
  if (erreurs.length > 0) {
    const messageErreur = `La validation de la configuration a échoué avec ${erreurs.length} erreur(s) :\n- ` + erreurs.join("\n- ");
    Logger.log(messageErreur);
    // Envoie un e-mail à l'administrateur pour l'alerter immédiatement.
    MailApp.sendEmail(ADMIN_EMAIL, `[${NOM_ENTREPRISE}] ERREUR CRITIQUE DE CONFIGURATION`, messageErreur);
    // Stoppe l'exécution de l'application en lançant une erreur.
    throw new Error(messageErreur);
  }
  
  Logger.log("Configuration validée avec succès.");
  return true; // Retourne true si tout est correct.
}


/**
 * =================================================================
 *                      DIAGNOSTIC COMPLET DU SYSTÈME
 * =================================================================
 */

/**
 * Exécute une série de vérifications sur les services et les quotas.
 * @returns {Object} Un objet contenant les résultats du diagnostic.
 */
function effectuerDiagnosticComplet() {
  const CONFIG = getConfiguration();
  const resultats = {
    services: [],
    quotas: [],
    config: []
  };

  // 1. Vérification des services Google
  resultats.services.push(verifierService('Drive', () => DriveApp.getRootFolder().getName()));
  resultats.services.push(verifierService('Calendar', () => CalendarApp.getDefaultCalendar().getName()));
  resultats.services.push(verifierService('Sheets', () => SpreadsheetApp.openById(CONFIG.ID_FEUILLE_CALCUL).getName()));
  resultats.services.push(verifierService('Docs', () => DocumentApp.openById(CONFIG.ID_MODELE_FACTURE).getName()));
  resultats.services.push(verifierService('Mail', () => MailApp.getRemainingDailyQuota()));

  // 2. Vérification des Quotas
  try {
    resultats.quotas.push({
      nom: 'Emails restants',
      valeur: MailApp.getRemainingDailyQuota(),
      limite: 'Varie (100-1500)',
      statut: MailApp.getRemainingDailyQuota() < 20 ? 'AVERTISSEMENT' : 'OK'
    });
  } catch (e) {
    resultats.quotas.push({ nom: 'Emails restants', valeur: 'Erreur', limite: 'N/A', statut: 'ERREUR' });
  }

  // 3. Vérification des IDs de configuration critiques
  resultats.config.push(verifierIdConfig('Dossier Archives', CONFIG.ID_DOSSIER_ARCHIVES, 'Folder'));
  resultats.config.push(verifierIdConfig('Feuille de Calcul Principale', CONFIG.ID_FEUILLE_CALCUL, 'Spreadsheet'));
  resultats.config.push(verifierIdConfig('Modèle de Facture', CONFIG.ID_MODELE_FACTURE, 'Document'));
  resultats.config.push(verifierIdConfig('Calendrier Principal', CONFIG.ID_CALENDRIER, 'Calendar'));

  return resultats;
}

/**
 * Fonction d'aide pour vérifier un service Google.
 * @param {string} nomService Le nom du service à tester.
 * @param {Function} fonctionTest La fonction à exécuter pour tester le service.
 * @returns {Object} Un objet de résultat.
 */
function verifierService(nomService, fonctionTest) {
  try {
    fonctionTest();
    return { nom: nomService, statut: 'OK', message: 'Service accessible.' };
  } catch (e) {
    return { nom: nomService, statut: 'ERREUR', message: e.message };
  }
}

/**
 * Fonction d'aide pour vérifier un ID de la configuration.
 * @param {string} nomRessource Le nom de la ressource.
 * @param {string} id L'ID de la ressource.
 * @param {string} type Le type de ressource (Folder, Spreadsheet, Document, Calendar).
 * @returns {Object} Un objet de résultat.
 */
function verifierIdConfig(nomRessource, id, type) {
    try {
        let ressource;
        switch (type) {
            case 'Folder': ressource = DriveApp.getFolderById(id); break;
            case 'Spreadsheet': ressource = SpreadsheetApp.openById(id); break;
            case 'Document': ressource = DocumentApp.openById(id); break;
            case 'Calendar': ressource = CalendarApp.getCalendarById(id); break;
            default: throw new Error("Type de ressource inconnu.");
        }
        if (ressource) {
            return { nom: nomRessource, statut: 'OK', message: `ID: ${id}` };
        }
    } catch (e) {
        return { nom: nomRessource, statut: 'ERREUR', message: `ID invalide ou accès refusé. Erreur: ${e.message}` };
    }
}

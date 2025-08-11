// =================================================================
//                      FONCTIONS UTILITAIRES
// =================================================================
// Description: Fonctions d'aide génériques, partagées et 
//              réutilisables dans toute l'application.
// =================================================================

// --- FONCTIONS DE FORMATAGE DE DATE (EXISTANTES) ---

/**
 * Convertit un objet Date en chaîne de caractères au format YYYY-MM-DD.
 * @param {Date} date L'objet Date à convertir.
 * @returns {string} La date formatée ou une chaîne vide si l'entrée est invalide.
 */
function formaterDateEnYYYYMMDD(date) {
  if (!(date instanceof Date) || isNaN(date)) {
    Logger.log(`Erreur dans formaterDateEnYYYYMMDD: l'argument n'est pas une Date valide.`);
    return '';
  }
  return Utilities.formatDate(date, Session.getScriptTimeZone(), 'yyyy-MM-dd');
}

/**
 * Convertit un objet Date en chaîne de caractères au format HHhMM.
 * @param {Date} date L'objet Date à convertir.
 * @returns {string} L'heure formatée ou une chaîne vide si l'entrée est invalide.
 */
function formaterDateEnHHMM(date) {
  if (!(date instanceof Date) || isNaN(date)) {
    Logger.log(`Erreur dans formaterDateEnHHMM: l'argument n'est pas une Date valide.`);
    return '';
  }
  return Utilities.formatDate(date, Session.getScriptTimeZone(), "HH'h'mm");
}

/**
 * Formate une date selon un format et un fuseau horaire personnalisés.
 * @param {Date} date L'objet Date à formater.
 * @param {string} format Le format de sortie (ex: "dd/MM/yyyy HH:mm").
 * @param {string} [fuseauHoraire="Europe/Paris"] Le fuseau horaire à utiliser.
 * @returns {string} La date formatée ou une chaîne vide en cas d'erreur.
 */
function formaterDatePersonnalise(date, format, fuseauHoraire = "Europe/Paris") {
  if (!(date instanceof Date) || isNaN(date)) {
    Logger.log(`Erreur dans formaterDatePersonnalise: l'argument n'est pas une Date valide.`);
    return '';
  }
  try {
    return Utilities.formatDate(date, fuseauHoraire, format);
  } catch (e) {
    Logger.log(`Erreur de formatage dans formaterDatePersonnalise: ${e.message}`);
    return '';
  }
}


// --- NOUVELLES FONCTIONS UTILITAIRES AJOUTÉES ---

/**
 * Valide les en-têtes d'une feuille et retourne leurs indices de colonne.
 * @param {GoogleAppsScript.Spreadsheet.Sheet} feuille La feuille à vérifier.
 * @param {Array<string>} enTetesRequis La liste des en-têtes requis.
 * @returns {Object} Un objet mappant les noms d'en-tête à leurs indices.
 */
function obtenirIndicesEnTetes(feuille, enTetesRequis) {
  if (!feuille) throw new Error("La feuille fournie à obtenirIndicesEnTetes est nulle.");
  if (feuille.getLastRow() < 1) throw new Error(`La feuille "${feuille.getName()}" est vide.`);
  const enTete = feuille.getRange(1, 1, 1, feuille.getLastColumn()).getValues()[0];
  const indices = {};
  const enTetesManquants = enTetesRequis.filter(reqHeader => {
    const index = enTete.findIndex(h => String(h).trim() === reqHeader);
    if (index !== -1) {
      indices[reqHeader] = index;
      return false;
    }
    return true;
  });
  if (enTetesManquants.length > 0) {
    throw new Error(`Colonne(s) manquante(s) dans "${feuille.getName()}": ${enTetesManquants.join(', ')}`);
  }
  return indices;
}

/**
 * Obtient un dossier par son nom dans un dossier parent, ou le crée s'il n'existe pas.
 * @param {GoogleAppsScript.Drive.Folder} dossierParent Le dossier parent.
 * @param {string} nomDossier Le nom du dossier à trouver ou créer.
 * @returns {GoogleAppsScript.Drive.Folder} Le dossier trouvé ou créé.
 */
function obtenirOuCreerDossier(dossierParent, nomDossier) {
  const dossiers = dossierParent.getFoldersByName(nomDossier);
  if (dossiers.hasNext()) {
    return dossiers.next();
  }
  return dossierParent.createFolder(nomDossier);
}

/**
 * Trouve le tableau du bordereau dans un document Google Docs.
 * @param {GoogleAppsScript.Document.Body} corps Le corps du document Google Docs.
 * @returns {GoogleAppsScript.Document.Table|null} Le tableau trouvé ou null.
 */
function trouverTableBordereau(corps) {
    const enTetesAttendus = ["Date", "Heure", "Détails de la course", "Notes", "Montant HT"];
    const tables = corps.getTables();
    for (let i = 0; i < tables.length; i++) {
        const table = tables[i];
        if (table.getNumRows() > 0) {
            const premiereLigne = table.getRow(0);
            if (premiereLigne.getNumCells() >= enTetesAttendus.length) {
                let enTetesTrouves = enTetesAttendus.every((enTete, j) => premiereLigne.getCell(j).getText().trim() === enTete);
                if (enTetesTrouves) {
                    return table;
                }
            }
        }
    }
    return null;
}


// --- FONCTION D'INCLUSION DE FICHIERS ---

/**
 * Permet d'inclure des fichiers (CSS, JS) dans les templates HTML.
 * @param {string} nomFichier Le nom du fichier à inclure (sans extension).
 * @returns {string} Le contenu HTML du fichier.
 */
function include(nomFichier) {
  return HtmlService.createHtmlOutputFromFile(nomFichier).getContent();
}

/**
 * Vérifie si l'utilisateur est un administrateur en se basant sur son email.
 * @param {string} email L'adresse email de l'utilisateur à vérifier.
 * @returns {boolean} True si l'email correspond à l'email de l'administrateur, sinon false.
 */
function isUserAdmin(email) {
  if (!email) {
    return false;
  }
  // Récupère la configuration pour accéder à l'email de l'admin.
  const CONFIG = getConfiguration();
  return email.toLowerCase() === CONFIG.ADMIN_EMAIL.toLowerCase();
}

/**
 * Nettoie une chaîne de caractères pour éviter l'injection de formules dans les tableurs.
 * Supprime les caractères de début potentiellement dangereux comme '=', '+', '-', '@'.
 * @param {string} input La chaîne à nettoyer.
 * @returns {string} La chaîne nettoyée.
 */
function sanitizeForSheet(input) {
  if (typeof input !== 'string' || !input) {
    return '';
  }
  let sanitized = input.trim();
  if (['=', '+', '-', '@'].includes(sanitized.charAt(0))) {
    sanitized = "'" + sanitized; // Ajoute une apostrophe pour forcer le traitement en tant que texte
  }
  return sanitized;
}

/**
 * Vérifie si l'utilisateur est un livreur autorisé.
 * @param {string} email - L'adresse email de l'utilisateur.
 * @returns {boolean} - True si l'utilisateur est un livreur, sinon false.
 */
function isUserLivreur(email) {
  if (!email) {
    return false;
  }
  const CONFIG = getConfiguration();
  return CONFIG.LIVREUR_EMAILS.map(e => e.toLowerCase()).includes(email.toLowerCase());
}

/**
 * Échappe les caractères HTML pour prévenir les attaques XSS.
 * @param {*} str La chaîne à échapper.
 * @returns {string} La chaîne échappée.
 */
function escapeHTML(str) {
    if (str === null || str === undefined) {
        return '';
    }
    // Assurons-nous que l'entrée est une chaîne
    const toStr = String(str);
    return toStr.replace(/[&<>"']/g, function(match) {
        switch (match) {
            case '&': return '&amp;';
            case '<': return '&lt;';
            case '>': return '&gt;';
            case '"': return '&quot;';
            case "'": return '&#39;';
            default: return match;
        }
    });
}

/**
 * Sanitize les données pour différents contextes.
 * @param {*} input La donnée à nettoyer.
 * @param {string} context Le contexte ('sheet' ou 'html').
 * @returns {string} La donnée nettoyée.
 */
function sanitize(input, context = 'html') {
  if (context === 'sheet') {
    return sanitizeForSheet(input);
  }
  // Par défaut, ou si le contexte est 'html'
  return escapeHTML(input);
}

/**
 * Journalise une action administrative pour l'audit.
 * @param {string} action Le type d'action (ex: "Génération Factures").
 * @param {string} details Les détails de l'action.
 */
function logAdminAction(action, details) {
    try {
        const CONFIG = getConfiguration();
        const ss = SpreadsheetApp.openById(CONFIG.ID_FEUILLE_CALCUL);
        let logSheet = ss.getSheetByName("Admin_Logs");
        if (!logSheet) {
            logSheet = ss.insertSheet("Admin_Logs");
            logSheet.appendRow(["Date", "Administrateur", "Action", "Détails"]);
            logSheet.setFrozenRows(1);
        }
        const adminEmail = Session.getActiveUser().getEmail();
        logSheet.appendRow([new Date(), adminEmail, action, details]);
    } catch (e) {
        Logger.log(`Échec de l'écriture dans le journal d'administration: ${e.message}`);
    }
}

/**
 * Exécute une fonction avec une politique de tentatives multiples en cas d'échec.
 * Utile pour les appels aux API Google qui peuvent échouer de manière transitoire.
 * @param {function} func La fonction à exécuter.
 * @param {number} [maxRetries=3] Le nombre maximum de tentatives.
 * @param {number} [initialDelay=1000] Le délai initial en ms avant la première nouvelle tentative.
 * @returns {*} La valeur de retour de la fonction exécutée.
 * @throws L'erreur de la dernière tentative si toutes les tentatives échouent.
 */
function executeWithRetry(func, maxRetries = 3, initialDelay = 1000) {
  let retries = 0;
  while (true) {
    try {
      return func();
    } catch (e) {
      // Ne pas réessayer pour les erreurs de validation ou d'autorisation.
      // Réessayer uniquement pour les erreurs génériques de service Google.
      if (e.message.includes("Exception:") || e.message.includes("failed with code")) {
        retries++;
        if (retries > maxRetries) {
          Logger.log(`Échec final après ${maxRetries} tentatives. Erreur: ${e.stack}`);
          throw e;
        }
        const delay = initialDelay * Math.pow(2, retries - 1);
        Logger.log(`Tentative ${retries} échouée. Nouvelle tentative dans ${delay}ms. Erreur: ${e.message}`);
        Utilities.sleep(delay);
      } else {
        // Lancer immédiatement les autres types d'erreurs.
        throw e;
      }
    }
  }
}

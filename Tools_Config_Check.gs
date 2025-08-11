/*********************************************************
 * FICHIER: Tools_Config_Check.gs
 * OBJET: Valider la configuration avant l'exécution métier
 * USAGE: Appeler CONFIG_verifierConfigurationOuErreur() au démarrage
 *********************************************************/

/**
 * @throws {Error}
 * Vérifie que toutes les clés requises existent et ne sont pas vides.
 * Si une ou plusieurs clés manquent, lève une erreur explicite.
 */
function CONFIG_verifierConfigurationOuErreur() {
  // Calcule les clés manquantes
  const manquantes = CONFIG_listerClesManquantes();

  // Si tout est OK, retour silencieux
  if (manquantes.length === 0) return;

  // Construit un message d'erreur clair et franc
  const message =
    'Configuration critique manquante. Veuillez exécuter la configuration initiale ou compléter les Script Properties.\\n' +
    'Clés manquantes: ' + manquantes.join(', ');

  // Journalise pour diagnostic
  Logger.log(message);

  // Propose une aide rapide si le script est lié à Sheets
  try {
    SpreadsheetApp.getUi().alert(message);
  } catch (e) {
    // Ignorer si l’UI Sheets n’est pas disponible
  }

  // Lève l'erreur pour interrompre le flux comme attendu par l'application
  throw new Error(message);
}

/**
 * EXEMPLE D’INTÉGRATION:
 * Appelez cette fonction au tout début de votre point d’entrée (doGet, onOpen, etc.)
 * pour garantir une configuration saine avant toute logique.
 */
function EXEMPLE_pointEntree() {
  // 1) Valider la configuration
  CONFIG_verifierConfigurationOuErreur();

  // 2) Continuer si OK (remplacez par votre logique métier)
  // ... votre code ici ...
  return ContentService.createTextOutput('OK');
}

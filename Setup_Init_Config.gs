/*******************************************************
 * FICHIER: Setup_Init_Config.gs  (Google Sheets)
 * OBJET: Initialiser et gérer les Script Properties requises
 * CONTEXTE: Lancer ces fonctions depuis l'éditeur Apps Script
 * ASTUCE: Menu "ELS > Configuration" ajouté à l'ouverture du classeur
 * ESSAI: Exécutez CONFIG_initialiserValeursExemple() puis mettez vos vraies valeurs
 *******************************************************/

/**
 * @return {PropertiesService.ScriptProperties}
 * Renvoie le conteneur des Script Properties du projet
 */
function CONFIG_getScriptProps_() {
  // Récupère l'objet de propriétés de script
  return PropertiesService.getScriptProperties();
}

/**
 * @return {string[]}
 * Liste des clés obligatoires attendues par l'application
 * Gardez ces libellés EXACTS, sensibles à la casse.
 */
function CONFIG_getRequiredKeys() {
  // Toutes les clés signalées comme manquantes dans le journal d'exécution
  return [
    'ADRESSE_ENTREPRISE',
    'EMAIL_ENTREPRISE',
    'SIRET',
    'RIB_ENTREPRISE',
    'BIC_ENTREPRISE',
    'ADMIN_EMAIL',
    'ID_CALENDRIER',
    'ID_DOCUMENT_CGV',
    'ID_FEUILLE_CALCUL',
    'ID_MODELE_FACTURE',
    'ID_DOSSIER_ARCHIVES',
    'ID_DOSSIER_TEMPORAIRE',
    'CLIENT_SHEET_ID'
  ];
}

/**
 * @return {string[]}
 * Calcule les clés manquantes actuellement dans les Script Properties
 */
function CONFIG_listerClesManquantes() {
  // Obtient les propriétés actuelles
  const props = CONFIG_getScriptProps_().getProperties();
  // Filtre celles qui n'existent pas ou sont vides
  return CONFIG_getRequiredKeys().filter((k) => !(k in props) || String(props[k]).trim() === '');
}

/**
 * Initialise toutes les clés avec des VALEURS D'EXEMPLE à remplacer.
 * Exécuter UNE FOIS puis remplacer manuellement par vos vraies valeurs.
 */
function CONFIG_initialiserValeursExemple() {
  // Prépare un objet map clé -> valeur d'exemple
  const example = {
    ADRESSE_ENTREPRISE: 'VOTRE ADRESSE ICI',
    EMAIL_ENTREPRISE: 'contact@votre-domaine.tld',
    SIRET: '00000000000000',
    RIB_ENTREPRISE: 'FR76 0000 0000 0000 0000 0000 000',
    BIC_ENTREPRISE: 'ABCDEFGHXXX',
    ADMIN_EMAIL: 'admin@votre-domaine.tld',
    ID_CALENDRIER: 'xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx@group.calendar.google.com',
    ID_DOCUMENT_CGV: '1A2B3C_ID_DOC_CGV',
    ID_FEUILLE_CALCUL: '1A2B3C_ID_SPREADSHEET',
    ID_MODELE_FACTURE: '1A2B3C_ID_DOC_MODELE_FACTURE',
    ID_DOSSIER_ARCHIVES: '1A2B3C_ID_DOSSIER_ARCHIVES',
    ID_DOSSIER_TEMPORAIRE: '1A2B3C_ID_DOSSIER_TEMPORAIRE',
    CLIENT_SHEET_ID: '1A2B3C_ID_SHEET_CLIENTS'
  };

  // Écrit toutes les valeurs en une fois
  CONFIG_getScriptProps_().setProperties(example, true /* deleteAllOthers? false ici via setProperties seul */);

  // Journalise l'état final après initialisation
  Logger.log('Configuration initialisée avec des valeurs EXEMPLE. Remplacez-les par vos vraies valeurs.');
  // Affiche un résumé minimal aux utilisateurs de Google Sheets
  try {
    SpreadsheetApp.getUi().alert('Configuration initialisée avec des valeurs EXEMPLE.\\nMettez vos vraies valeurs dans "Projet > Propriétés du projet > Script properties".');
  } catch (e) {
    // Ignorer si le script n’est pas lié à Google Sheets
  }
}

/**
 * Ouvre des invites et enregistre les valeurs saisies pour chaque clé requise.
 * Utile si vous préférez saisir via une boîte de dialogue (Google Sheets uniquement).
 */
function CONFIG_saisirValeursParUI() {
  // Tente d'obtenir l'UI du classeur. Si non dispo, lève une erreur claire.
  const ui = SpreadsheetApp.getUi();
  const scriptProps = CONFIG_getScriptProps_();
  const current = scriptProps.getProperties();

  // Parcourt les clés et demande à l'utilisateur une valeur
  CONFIG_getRequiredKeys().forEach((key) => {
    const defaultValue = key in current ? String(current[key]) : '';
    const prompt = ui.prompt(
      'Configuration requise',
      `Fournissez la valeur pour "${key}"\\nValeur actuelle: ${defaultValue || '(vide)'}\\n\\nLaissez vide pour conserver la valeur actuelle.`,
      ui.ButtonSet.OK_CANCEL
    );
    if (prompt.getSelectedButton() === ui.Button.OK) {
      const value = String(prompt.getResponseText() || '').trim();
      // Si une nouvelle valeur est fournie, l'enregistrer
      if (value) {
        scriptProps.setProperty(key, value);
      }
    }
  });

  // Confirme l'opération
  ui.alert('Configuration mise à jour via l’interface. Vérifiez les valeurs saisies.');
}

/**
 * Supprime toutes les clés requises des Script Properties.
 * Utile pour un "reset" contrôlé.
 */
function CONFIG_supprimerConfiguration() {
  // Supprime clé par clé pour ne pas effacer d’autres propriétés éventuelles
  const sp = CONFIG_getScriptProps_();
  CONFIG_getRequiredKeys().forEach((k) => sp.deleteProperty(k));
  Logger.log('Clés de configuration supprimées.');
  try {
    SpreadsheetApp.getUi().alert('Clés de configuration supprimées.');
  } catch (e) {
    // Ignorer si le script n’est pas lié à Google Sheets
  }
}

/**
 * Affiche un état rapide de la configuration (manquants vs présents).
 */
function CONFIG_afficherEtat() {
  // Récupère listes utile
  const manquantes = CONFIG_listerClesManquantes();
  const total = CONFIG_getRequiredKeys().length;
  const ok = total - manquantes.length;

  // Log technique
  Logger.log({ total, ok, manquantes });

  // Alerte utilisateur si dans Google Sheets
  try {
    SpreadsheetApp.getUi().alert(
      `État configuration:\\n${ok}/${total} présentes.\\nManquantes:\\n${manquantes.join('\\n') || '(aucune)'}`
    );
  } catch (e) {
    // Ignorer si le script n’est pas lié à Google Sheets
  }
}

/**
 * La fonction onOpen() a été déplacée et fusionnée dans Code.gs
 * pour avoir un seul point d'entrée pour la création des menus.
 */

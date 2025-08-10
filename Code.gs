// =================================================================
//                        POINT D'ENTRÉE & MENUS
// =================================================================
// Description: Contrôleur principal qui gère les menus dans le Google
//              Sheet et les requêtes web pour afficher les interfaces.
// =================================================================

// --- Accès centralisé à la configuration ---
const CONFIG = getConfiguration();


/**
 * S'exécute à l'ouverture du Google Sheet pour créer les menus.
 */
function onOpen() {
  const ui = SpreadsheetApp.getUi();
  const menuPrincipal = ui.createMenu('EL Services')
      .addItem('Générer les factures sélectionnées', 'genererFactures')
      .addItem('Envoyer les factures contrôlées', 'envoyerFacturesControlees')
      .addItem("Archiver les factures du mois dernier", "archiverFacturesDuMois")
      .addSeparator()
      .addItem("Vérifier la cohérence du calendrier", "verifierCoherenceCalendrier")
      .addItem("Lancer un audit des partages Drive", "lancerAuditDrive");

  const sousMenuMaintenance = ui.createMenu('Maintenance')
      .addItem("Installer/Mettre à jour les sauvegardes auto", "installerTriggersAutomatiques")
      .addSeparator()
      .addItem("Sauvegarder le code du projet (manuel)", "sauvegarderCodeProjet")
      .addItem("Sauvegarder les données (manuel)", "sauvegarderDonnees")
      .addItem("Purger les anciennes données (RGPD)", "purgerAnciennesDonnees");
      
  const sousMenuDebug = ui.createMenu('Debug')
      .addItem("Lancer tous les tests", "lancerTousLesTests");

  menuPrincipal.addSubMenu(sousMenuMaintenance).addToUi();
  menuPrincipal.addSubMenu(sousMenuDebug).addToUi();
}

/**
 * S'exécute lorsqu'un utilisateur accède à l'URL de l'application web.
 */
function doGet(e) {
  try {
    // Routeur de page
    if (e.parameter.page) {
        const userEmail = Session.getActiveUser().getEmail();

        switch (e.parameter.page) {
            case 'admin':
                if (isUserAdmin(userEmail)) {
                    const template = HtmlService.createTemplateFromFile('Admin_Interface');
                    template.config = JSON.stringify({
                      DUREE_BASE: CONFIG.DUREE_BASE,
                      DUREE_ARRET_SUP: CONFIG.DUREE_ARRET_SUP,
                      TARIFS: CONFIG.TARIFS
                    });
                    template.siret = CONFIG.SIRET;
                    template.rib = CONFIG.RIB_ENTREPRISE;
                    template.bic = CONFIG.BIC_ENTREPRISE;
                    return applySecurityHeaders(template.evaluate(), "Tableau de Bord Administrateur");
                } else {
                    return HtmlService.createHtmlOutput('<h1>Accès Refusé</h1><p>Vous n\'avez pas les permissions nécessaires.</p>');
                }
            case 'admin_config':
                if (isUserAdmin(userEmail)) {
                    const template = HtmlService.createTemplateFromFile('Admin_Config_Interface');
                    return applySecurityHeaders(template.evaluate(), "Configuration");
                } else {
                    return HtmlService.createHtmlOutput('<h1>Accès Refusé</h1><p>Vous n\'avez pas les permissions nécessaires.</p>');
                }
            case 'gestion':
                const templateGestion = HtmlService.createTemplateFromFile('Client_Espace');
                templateGestion.nomEntreprise = CONFIG.NOM_ENTREPRISE;
                templateGestion.appUrl = ScriptApp.getService().getUrl();
                templateGestion.logoUrl = CONFIG.logoCompletClairBase64;
                return applySecurityHeaders(templateGestion.evaluate(), "Mon Espace Client");
            case 'livreur':
                const isLivreurAllowed = CONFIG.LIVREUR_EMAILS.map(email => email.toLowerCase()).includes(userEmail.toLowerCase());
                if (userEmail && isLivreurAllowed) {
                    const template = HtmlService.createTemplateFromFile('Livreur_Interface');
                    return applySecurityHeaders(template.evaluate(), "Espace Livreur");
                } else {
                    return HtmlService.createHtmlOutput('<h1>Accès Refusé</h1><p>Vous n\'avez pas les permissions nécessaires.</p>');
                }
            case 'debug':
                if (isUserAdmin(userEmail)) {
                    const output = HtmlService.createHtmlOutputFromFile('Debug_Interface');
                    return applySecurityHeaders(output, "Panneau de Débogage");
                } else {
                    return HtmlService.createHtmlOutput('<h1>Accès Refusé</h1><p>Vous n\'avez pas les permissions nécessaires.</p>');
                }
            case 'faq':
                const templateFaq = HtmlService.createTemplateFromFile('FAQ');
                return applySecurityHeaders(templateFaq.evaluate(), "FAQ - " + CONFIG.NOM_ENTREPRISE);
            case 'admin-docs':
                if (isUserAdmin(userEmail)) {
                    const template = HtmlService.createTemplateFromFile('Admin_Docs');
                    return applySecurityHeaders(template.evaluate(), "Documentation Admin");
                } else {
                    return HtmlService.createHtmlOutput('<h1>Accès Refusé</h1><p>Vous n\'avez pas les permissions nécessaires.</p>');
                }
            case 'diagnostic':
                if (isUserAdmin(userEmail)) {
                    const template = HtmlService.createTemplateFromFile('Verification');
                    template.resultats = effectuerDiagnosticComplet();
                    return applySecurityHeaders(template.evaluate(), "Diagnostic du Système");
                } else {
                    return HtmlService.createHtmlOutput('<h1>Accès Refusé</h1><p>Vous n\'avez pas les permissions nécessaires.</p>');
                }
        }
    }

    // Page par défaut : Interface de réservation
    const template = HtmlService.createTemplateFromFile('Reservation_Interface');
    template.appUrl = ScriptApp.getService().getUrl();
    template.nomService = CONFIG.NOM_ENTREPRISE;
    template.logoUrl = CONFIG.logoCompletClairBase64;
    template.adresse = CONFIG.ADRESSE_ENTREPRISE;
    template.email = CONFIG.EMAIL_ENTREPRISE;
    template.ID_DOCUMENT_CGV = CONFIG.ID_DOCUMENT_CGV;
    template.TARIFS_JSON = JSON.stringify(CONFIG.TARIFS);
    template.DUREE_BASE = CONFIG.DUREE_BASE;
    template.DUREE_ARRET_SUP = CONFIG.DUREE_ARRET_SUP;
    template.KM_BASE = CONFIG.KM_BASE;
    template.KM_ARRET_SUP = CONFIG.KM_ARRET_SUP;
    template.URGENT_THRESHOLD_MINUTES = CONFIG.URGENT_THRESHOLD_MINUTES;
    template.dateDuJour = Utilities.formatDate(new Date(), Session.getScriptTimeZone(), "yyyy-MM-dd");
    template.heureDebut = CONFIG.HEURE_DEBUT_SERVICE;
    template.heureFin = CONFIG.HEURE_FIN_SERVICE;
    template.prixBase = CONFIG.TARIFS['Normal'].base;
    template.tarifs = CONFIG.TARIFS;

    const output = template.evaluate();
    return applySecurityHeaders(output, CONFIG.NOM_ENTREPRISE + " | Réservation");

  } catch (error) {
    Logger.log(`Erreur critique dans doGet: ${error.stack}`);
    return HtmlService.createHtmlOutput(
      `<h1>Erreur de configuration</h1><p>L'application ne peut pas démarrer. L'administrateur a été notifié.</p><pre>${error.message}</pre>`
    );
  }
}

/**
 * Applique les en-têtes de sécurité et le titre à un objet HtmlOutput.
 * @param {HtmlService.HtmlOutput} htmlOutput L'objet à modifier.
 * @param {string} title Le titre de la page.
 * @returns {HtmlService.HtmlOutput} L'objet modifié.
 */
function applySecurityHeaders(htmlOutput, title) {
  // Une politique de sécurité de contenu (CSP) stricte mais permissive pour les scripts inline et les API Google.
  const csp = "script-src 'self' 'unsafe-inline' https://apis.google.com; object-src 'none'; base-uri 'self';";
  return htmlOutput
    .setTitle(title)
    .setXFrameOptionsMode(HtmlService.XFrameOptionsMode.DEFAULT)
    .addMetaTag('Content-Security-Policy', csp);
}


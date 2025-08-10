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
      .addItem("Sauvegarder le code du projet", "sauvegarderCodeProjet")
      .addItem("Sauvegarder les données", "sauvegarderDonnees")
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
                    return template.evaluate().setTitle("Tableau de Bord Administrateur").setXFrameOptionsMode(HtmlService.XFrameOptionsMode.DEFAULT);
                } else {
                    return HtmlService.createHtmlOutput('<h1>Accès Refusé</h1><p>Vous n\'avez pas les permissions nécessaires.</p>');
                }
            case 'admin_config':
                if (isUserAdmin(userEmail)) {
                    return HtmlService.createTemplateFromFile('Admin_Config_Interface').evaluate().setTitle("Configuration").setXFrameOptionsMode(HtmlService.XFrameOptionsMode.DEFAULT);
                } else {
                    return HtmlService.createHtmlOutput('<h1>Accès Refusé</h1><p>Vous n\'avez pas les permissions nécessaires.</p>');
                }
            case 'gestion':
                const templateGestion = HtmlService.createTemplateFromFile('Client_Espace');
                templateGestion.ADMIN_EMAIL = CONFIG.ADMIN_EMAIL;
                return templateGestion.evaluate().setTitle("Mon Espace Client").setXFrameOptionsMode(HtmlService.XFrameOptionsMode.DEFAULT);
            case 'livreur':
                // Vérifie si l'email du livreur est dans la liste des emails autorisés (insensible à la casse)
                const isLivreurAllowed = CONFIG.LIVREUR_EMAILS.map(email => email.toLowerCase()).includes(userEmail.toLowerCase());

                if (userEmail && isLivreurAllowed) {
                    const template = HtmlService.createTemplateFromFile('Livreur_Interface');
                    return template.evaluate().setTitle("Espace Livreur").setXFrameOptionsMode(HtmlService.XFrameOptionsMode.DEFAULT);
                } else {
                    return HtmlService.createHtmlOutput('<h1>Accès Refusé</h1><p>Vous n\'avez pas les permissions nécessaires.</p>');
                }
            case 'debug':
                if (isUserAdmin(userEmail)) {
                    return HtmlService.createHtmlOutputFromFile('Debug_Interface').setTitle("Panneau de Débogage");
                } else {
                    return HtmlService.createHtmlOutput('<h1>Accès Refusé</h1><p>Vous n\'avez pas les permissions nécessaires.</p>');
                }
        }
    }

    // Page par défaut : Interface de réservation
    const template = HtmlService.createTemplateFromFile('Reservation_Interface');
    template.appUrl = ScriptApp.getService().getUrl();
    template.nomService = CONFIG.NOM_ENTREPRISE;
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

    return template.evaluate()
        .setTitle(CONFIG.NOM_ENTREPRISE + " | Réservation")
        .setXFrameOptionsMode(HtmlService.XFrameOptionsMode.DEFAULT);

  } catch (error) {
    Logger.log(`Erreur critique dans doGet: ${error.stack}`);
    return HtmlService.createHtmlOutput(
      `<h1>Erreur de configuration</h1><p>L'application ne peut pas démarrer. L'administrateur a été notifié.</p><pre>${error.message}</pre>`
    );
  }
}



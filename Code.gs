// =================================================================
//                        POINT D'ENTRÉE WEB
// =================================================================
// Description: Contrôleur principal qui gère les requêtes web (routage)
//              pour afficher les interfaces de l'application.
// =================================================================


/**
 * S'exécute lorsqu'un utilisateur accède à l'URL de l'application web.
 */
function doGet(e) {
  try {
    // 1. Valider la configuration avant toute chose.
    CONFIG_verifierConfigurationOuErreur();
    // 2. Charger la configuration pour l'utiliser dans l'application.
    const CONFIG = getConfiguration();

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
                templateGestion.nomEntreprise = CONFIG.NOM_ENTREPRISE;
                templateGestion.appUrl = ScriptApp.getService().getUrl();
                // Assurez-vous que le logo est une URL publique ou une data URI pour être utilisable dans JSON-LD
                templateGestion.logoUrl = CONFIG.logoCompletClairBase64;
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
    template.logoUrl = CONFIG.logoCompletClairBase64;
    template.adresse = CONFIG.ADRESSE_ENTREPRISE;
    template.email = CONFIG.EMAIL_ENTREPRISE;
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



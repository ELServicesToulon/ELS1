/**
 * =================================================================
 *                SETUP ET MIGRATION DE LA CONFIGURATION
 * =================================================================
 * Ce fichier contient des fonctions à exécuter manuellement pour
 * la configuration initiale ou la migration des données.
 * NE PAS EXÉCUTER sans comprendre les implications.
 * =================================================================
 */

/**
 * Fonction de migration unique.
 * Lit la configuration codée en dur depuis l'ancienne fonction
 * getConfiguration et la sauvegarde dans PropertiesService.
 * Cela permet de retirer les secrets du code source.
 *
 * À exécuter UNE SEULE FOIS depuis l'éditeur de script.
 */
function migrerConfigurationVersProperties() {
  const ui = SpreadsheetApp.getUi();
  const reponse = ui.alert(
    'Migration de la Configuration',
    'Cette action va lire la configuration actuelle et la sauvegarder dans les PropertiesService. ' +
    'Elle ne doit être exécutée qu\'une seule fois. ' +
    'Voulez-vous continuer ?',
    ui.ButtonSet.YES_NO
  );

  if (reponse !== ui.Button.YES) {
    ui.alert('Migration annulée.');
    return;
  }

  try {
    const properties = PropertiesService.getScriptProperties();

    // Ancien objet de configuration, copié ici pour la migration.
    // En production, on s'assurerait d'utiliser la version la plus à jour.
    const config = {
      NOM_ENTREPRISE: "EL Services",
      ADRESSE_ENTREPRISE: "255 Avenue Marcel Castie B, 83000 Toulon",
      EMAIL_ENTREPRISE: "elservicestoulon@gmail.com",
      SIRET: "48091306000020",
      RIB_ENTREPRISE: "FR7640618804760004035757187",
      BIC_ENTREPRISE: "BOUSFRPPXXX",
      ADMIN_EMAIL: "elservicestoulon@gmail.com",
      LIVREUR_EMAILS: ["livreur1@example.com", "livreur2@example.com"],
      logoCompletClairBase64: "PLACEHOLDER_BASE64_LOGO_STRING",
      TVA_APPLICABLE: false,
      TAUX_TVA: 0.20,
      DELAI_PAIEMENT_JOURS: 5,
      PREFIXE_FACTURE: 'FACT',
      PROCHAIN_NUMERO_FACTURE: 1,
      MENTIONS_LEGALES: 'TVA non applicable, art. 293 B du CGI.',
      PAIEMENTS_CONFIG: {
          LIBELLE_VIREMENT: "Veuillez utiliser le numéro de facture comme référence pour votre virement.",
          LIBELLE_CHEQUE: "Veuillez libeller votre chèque à l'ordre de EL Services."
      },
      ID_CALENDRIER: "Elservicestoulon@gmail.com",
      ID_DOCUMENT_CGV: "1ze9U3k_tcS-RlhIcI8zSs2OYom2miVy8WxyxT8ktFp0",
      ID_FEUILLE_CALCUL: "1-i8xBlCrl_Rrjo2FgiL33pIRjD1EFqyvU7ILPud3-r4",
      ID_MODELE_FACTURE: "1KWDS0gmyK3qrYWJd01vGID5fBVK10xlmErjgr7lrwmU",
      ID_DOSSIER_ARCHIVES: "1UavaEsq6TkDw1QzJZ91geKyF7hrQY4S8",
      ID_DOSSIER_TEMPORAIRE: "1yDBSzTqwaUt-abT0s7Z033C2WlN1NSs6",
      CLIENT_SHEET_ID: '1-i8xBlCrl_Rrjo2FgiL33pIRjD1EFqyvU7ILPud3-r4',
      HEURE_DEBUT_SERVICE: "08:30",
      HEURE_FIN_SERVICE: "18:30",
      DUREE_TAMPON_MINUTES: 15,
      INTERVALLE_CRENEAUX_MINUTES: 15,
      URGENT_THRESHOLD_MINUTES: 30,
      DELAI_MODIFICATION_MINUTES: 60,
      DUREE_BASE: 30,
      DUREE_ARRET_SUP: 15,
      KM_BASE: 9,
      KM_ARRET_SUP: 3,
      TARIFS: {
        'Normal': { base: 15, arrets: [5, 3, 4, 5, 5] },
        'Samedi': { base: 25, arrets: [5, 3, 4, 5, 5] },
        'Urgent': { base: 20, arrets: [5, 3, 4, 5, 5] },
        'Special': { base: 10, arrets: [2, 1, 2, 3, 3] }
      },
      PARRAINAGE_CONFIG: {
        MONTANT_REMISE_FILLEUL: 10.00,
        MONTANT_RECOMPENSE_PARRAIN: 5.00,
        PREFIXE_CODE: 'PHARMA-',
        LONGUEUR_CODE: 6
      },
      RETENTION_FACTURES_ANNEES: 5,
      RETENTION_LOGS_MOIS: 12,
      FEUILLES_A_SAUVEGARDER: ["Clients", "Facturation", "Plages_Bloquees", "Logs", "Admin_Logs", "AuthTokens"],
      COLONNE_TYPE_REMISE_CLIENT: "Type de Remise",
      COLONNE_VALEUR_REMISE_CLIENT: "Valeur Remise",
      COLONNE_NB_TOURNEES_OFFERTES: "Nombre Tournées Offertes",
      COLONNE_CODE_PARRAINAGE: "CodeParrainage",
      COLONNE_CODE_UTILISE: "CodeUtilise",
      COLONNE_CREDIT_PARRAINAGE: "CreditParrainage"
    };

    const clesSauvegardees = [];
    for (const key in config) {
      if (Object.prototype.hasOwnProperty.call(config, key)) {
        let value = config[key];
        // Stringify les objets et tableaux pour les stocker correctement
        if (typeof value === 'object' && value !== null) {
          value = JSON.stringify(value);
        }
        properties.setProperty(key, value);
        clesSauvegardees.push(key);
      }
    }

    Logger.log(`Migration réussie. ${clesSauvegardees.length} clés ont été sauvegardées dans PropertiesService.`);
    ui.alert(`Migration terminée avec succès. ${clesSauvegardees.length} clés sauvegardées.`);

  } catch (e) {
    Logger.log(`Erreur durant la migration de la configuration: ${e.stack}`);
    ui.alert(`Une erreur est survenue durant la migration: ${e.message}`);
  }
}

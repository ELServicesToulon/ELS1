/**
 * =================================================================
 *         LOGIQUE SERVEUR POUR L'ESPACE CLIENT
 * =================================================================
 */

/**
 * Génère un token de connexion, l'envoie par e-mail au client.
 * @param {string} email L'adresse e-mail du client.
 * @returns {Object} Un objet de statut.
 */
function demanderLienDeConnexion(email) {
  if (!email || !/\S+@\S+\.\S+/.test(email)) {
    return { success: false, message: "Veuillez fournir une adresse e-mail valide." };
  }

  const CONFIG = getConfiguration();
  // Vérifier si le client existe
  const client = obtenirInfosClientParEmail(email);
  if (!client) {
    return { success: false, message: "Aucun compte n'est associé à cette adresse e-mail." };
  }

  try {
    const token = 'CLIENT_TOKEN_' + Utilities.getUuid();
    // Stocker le token avec l'e-mail du client pour une durée limitée
    const cacheDurationSeconds = CONFIG.DUREE_TAMPON_MINUTES * 60;
    CacheService.getScriptCache().put(token, email, cacheDurationSeconds);

    const url = ScriptApp.getService().getUrl() + '?page=gestion&token=' + token;
    const nomClient = client.nom || 'Client';
    const sujet = `Votre lien de connexion à votre espace client - ${CONFIG.NOM_ENTREPRISE}`;
    const corps = `
      <p>Bonjour ${nomClient},</p>
      <p>Pour accéder à votre espace client et gérer vos réservations, veuillez cliquer sur le lien ci-dessous. Ce lien est valable ${CONFIG.DUREE_TAMPON_MINUTES} minutes.</p>
      <p><a href="${url}" style="padding: 10px 15px; background-color: #3498db; color: white; text-decoration: none; border-radius: 5px;">Accéder à mon espace client</a></p>
      <p>Si vous n'êtes pas à l'origine de cette demande, veuillez ignorer cet e-mail.</p>
      <p>L'équipe ${CONFIG.NOM_ENTREPRISE}</p>
    `;

    MailApp.sendEmail({
      to: email,
      subject: sujet,
      htmlBody: corps,
      name: CONFIG.NOM_ENTREPRISE
    });

    return { success: true, message: "Un lien de connexion a été envoyé à votre adresse e-mail." };
  } catch (e) {
    Logger.log(`Erreur lors de l'envoi du lien de connexion pour ${email}: ${e.stack}`);
    return { success: false, message: "Impossible d'envoyer l'e-mail de connexion." };
  }
}


/**
 * Vérifie un token et retourne les informations du client s'il est valide.
 * @param {string} token Le jeton à vérifier.
 * @returns {Object} Un objet contenant le statut et les données du client.
 */
function verifierTokenEtChargerDonnees(token) {
  if (!token) return { success: false, error: "Token manquant." };

  try {
    const email = CacheService.getScriptCache().get(token);
    if (email) {
      const client = obtenirInfosClientParEmail(email);
      if (client) {
        return { success: true, client: { email: client.email, nom: client.nom } };
      }
    }
    return { success: false, error: "Lien invalide ou expiré. Veuillez en demander un nouveau." };
  } catch (e) {
    Logger.log(`Erreur de validation de token : ${e.stack}`);
    return { success: false, error: "Erreur lors de la validation du token." };
  }
}

/**
 * Récupère les réservations pour un client donné (identifié par son token).
 * @param {string} token Le jeton de session du client.
 * @returns {Object} Un objet contenant le statut et les listes de réservations futures et passées.
 */
function obtenirReservationsClient(token) {
    const email = CacheService.getScriptCache().get(token);
    if (!email) {
        return { success: false, error: "Session invalide ou expirée. Veuillez vous reconnecter." };
    }

    const CONFIG = getConfiguration();
    try {
        const feuille = SpreadsheetApp.openById(CONFIG.ID_FEUILLE_CALCUL).getSheetByName("Facturation");
        const enTetes = ["Date", "Client (Email)", "Event ID", "Détails", "ID Réservation", "Montant", "T° Statut"];
        const indices = obtenirIndicesEnTetes(feuille, enTetes);
        const emailClientIndex = indices["Client (Email)"];

        const donnees = feuille.getDataRange().getValues();
        const maintenant = new Date();

        const reservationsFutures = [];
        const reservationsPassees = [];

        donnees.slice(1).forEach(ligne => {
            if (String(ligne[emailClientIndex]).trim().toLowerCase() === email.trim().toLowerCase()) {
                const dateReservation = new Date(ligne[indices["Date"]]);
                const estModifiable = (dateReservation.getTime() - maintenant.getTime()) > (CONFIG.DELAI_MODIFICATION_MINUTES * 60 * 1000);

                const resa = {
                  id: ligne[indices["ID Réservation"]],
                  start: dateReservation.toISOString(),
                  details: ligne[indices["Détails"]],
                  amount: parseFloat(ligne[indices["Montant"]]) || 0,
                  statut: ligne[indices["T° Statut"]],
                  modifiable: estModifiable
                };

                const matchArrets = resa.details.match(/(\d+)\s*arrêt\(s\)\s*sup/);
                resa.arretsSupplementaires = matchArrets ? parseInt(matchArrets[1], 10) : 0;

                if (dateReservation > maintenant) {
                    reservationsFutures.push(resa);
                } else {
                    reservationsPassees.push(resa);
                }
            }
        });

        return { success: true, futures: reservationsFutures, passees: reservationsPassees };
    } catch (e) {
        Logger.log(`Erreur critique dans obtenirReservationsClient: ${e.stack}`);
        return { success: false, error: e.message };
    }
}


/**
 * Wrapper sécurisé pour la mise à jour des détails d'une réservation par un client.
 * @param {string} token Le jeton de session du client.
 * @param {string} idReservation L'ID de la réservation à modifier.
 * @param {number} nouveauxArrets Le nouveau nombre d'arrêts supplémentaires.
 * @returns {Object} Résultat de l'opération.
 */
function mettreAJourDetailsReservationClient(token, idReservation, nouveauxArrets) {
  const email = validerTokenClient(token, idReservation);
  if (!email) {
    return { success: false, error: "Accès non autorisé ou session expirée." };
  }
  return mettreAJourDetailsReservation(idReservation, nouveauxArrets);
}


/**
 * Wrapper sécurisé pour la replanification d'une réservation par un client.
 * @param {string} token Le jeton de session du client.
 * @param {string} idReservation L'ID de la réservation à déplacer.
 * @param {string} nouvelleDate La nouvelle date au format 'YYYY-MM-DD'.
 * @param {string} nouvelleHeure La nouvelle heure au format 'HHhMM'.
 * @returns {Object} Résultat de l'opération.
 */
function replanifierReservationClient(token, idReservation, nouvelleDate, nouvelleHeure) {
  const email = validerTokenClient(token, idReservation);
  if (!email) {
    return { success: false, error: "Accès non autorisé ou session expirée." };
  }

  const CONFIG = getConfiguration();
  const feuille = SpreadsheetApp.openById(CONFIG.ID_FEUILLE_CALCUL).getSheetByName("Facturation");
  const idResaIndex = feuille.getRange(1, 1, 1, feuille.getLastColumn()).getValues()[0].indexOf("ID Réservation");
  const dateIndex = feuille.getRange(1, 1, 1, feuille.getLastColumn()).getValues()[0].indexOf("Date");
  const donnees = feuille.getDataRange().getValues();
  const ligneResa = donnees.find(row => row[idResaIndex] === idReservation);

  if (ligneResa) {
      const dateDebut = new Date(ligneResa[dateIndex]);
      if ((dateDebut.getTime() - new Date().getTime()) < (CONFIG.DELAI_MODIFICATION_MINUTES * 60 * 1000)) {
          return { success: false, error: "Le délai pour modifier cette course est dépassé." };
      }
  } else {
      return { success: false, error: "Réservation introuvable." };
  }

  return replanifierReservation(idReservation, nouvelleDate, nouvelleHeure);
}


/**
 * Fonction utilitaire pour valider un token et vérifier que le client
 * est bien le propriétaire de la réservation qu'il tente de modifier.
 * @param {string} token Le jeton de session.
 * @param {string} idReservation L'ID de la réservation.
 * @returns {string|null} L'e-mail du client si valide, sinon null.
 */
function validerTokenClient(token, idReservation) {
  const email = CacheService.getScriptCache().get(token);
  if (!email) return null;

  const CONFIG = getConfiguration();
  const feuille = SpreadsheetApp.openById(CONFIG.ID_FEUILLE_CALCUL).getSheetByName("Facturation");
  const enTetes = ["ID Réservation", "Client (Email)"];
  const indices = obtenirIndicesEnTetes(feuille, enTetes);

  const donnees = feuille.getDataRange().getValues();
  const ligneResa = donnees.find(row => row[indices["ID Réservation"]] === idReservation);

  if (ligneResa && String(ligneResa[indices["Client (Email)"]]).trim().toLowerCase() === email.trim().toLowerCase()) {
    return email;
  }

  return null;
}

/**
 * Enregistre le consentement d'un client dans une feuille de calcul dédiée.
 * @param {string} email L'e-mail du client.
 * @param {string} consentText Le texte de la case à cocher de consentement.
 * @param {string} source La source de l'action (ex: "Formulaire Réservation").
 */
function enregistrerConsentementRGPD(email, consentText, source) {
  try {
    const CONFIG = getConfiguration();
    const ss = SpreadsheetApp.openById(CONFIG.ID_FEUILLE_CALCUL);
    let journalSheet = ss.getSheetByName("Journal_RGPD");

    if (!journalSheet) {
      journalSheet = ss.insertSheet("Journal_RGPD");
      journalSheet.appendRow(["Date", "Email Client", "Texte Consentement", "Source"]);
      journalSheet.setFrozenRows(1);
    }

    journalSheet.appendRow([new Date(), email, consentText, source]);
    Logger.log(`Consentement RGPD enregistré pour ${email} depuis ${source}`);

  } catch (e) {
    Logger.log(`Erreur lors de l'enregistrement du consentement RGPD pour ${email}: ${e.stack}`);
    // Ne pas bloquer l'utilisateur pour une erreur de log
  }
}

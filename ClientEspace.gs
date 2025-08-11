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
  const validation = validerTokenEtRecupererReservation(token, idReservation);
  if (!validation) {
    return { success: false, error: "Accès non autorisé, session expirée ou réservation introuvable." };
  }

  const { reservationData } = validation;
  const CONFIG = getConfiguration();

  const dateDebut = new Date(reservationData["Date"]);
  if ((dateDebut.getTime() - new Date().getTime()) < (CONFIG.DELAI_MODIFICATION_MINUTES * 60 * 1000)) {
      return { success: false, error: "Le délai pour modifier cette course est dépassé." };
  }

  // L'appelant n'a pas besoin d'être admin, la validation du token client suffit
  return mettreAJourDetailsReservation(idReservation, nouveauxArrets, reservationData);
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
  const validation = validerTokenEtRecupererReservation(token, idReservation);
  if (!validation) {
    return { success: false, error: "Accès non autorisé, session expirée ou réservation introuvable." };
  }

  const { reservationData } = validation;
  const CONFIG = getConfiguration();

  const dateDebut = new Date(reservationData["Date"]);
  if ((dateDebut.getTime() - new Date().getTime()) < (CONFIG.DELAI_MODIFICATION_MINUTES * 60 * 1000)) {
      return { success: false, error: "Le délai pour modifier cette course est dépassé." };
  }

  // Passer les données déjà chargées pour éviter une relecture
  return replanifierReservation(idReservation, nouvelleDate, nouvelleHeure, reservationData);
}


/**
 * Fonction utilitaire pour valider un token, vérifier que le client est bien le propriétaire
 * de la réservation, et retourner les données de cette réservation.
 * @param {string} token Le jeton de session.
 * @param {string} idReservation L'ID de la réservation.
 * @returns {Object|null} Un objet avec les données de la ligne et les en-têtes, ou null si invalide.
 */
function validerTokenEtRecupererReservation(token, idReservation) {
  const email = CacheService.getScriptCache().get(token);
  if (!email) return null;

  const CONFIG = getConfiguration();
  const sheet = SpreadsheetApp.openById(CONFIG.ID_FEUILLE_CALCUL).getSheetByName("Facturation");
  const headers = sheet.getRange(1, 1, 1, sheet.getLastColumn()).getValues()[0];
  const idColIndex = headers.indexOf("ID Réservation");
  const emailColIndex = headers.indexOf("Client (Email)");

  if (idColIndex === -1 || emailColIndex === -1) {
    throw new Error("Colonnes 'ID Réservation' ou 'Client (Email)' introuvables.");
  }

  const data = sheet.getDataRange().getValues();
  const rowData = data.find(row => String(row[idColIndex]).trim() === idReservation);

  if (rowData && String(rowData[emailColIndex]).trim().toLowerCase() === email.trim().toLowerCase()) {
    const reservationData = {};
    headers.forEach((header, i) => {
        reservationData[header] = rowData[i];
    });
    return { reservationData: reservationData };
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
  const lock = LockService.getScriptLock();
  lock.waitLock(30000);
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
  } finally {
    lock.releaseLock();
  }
}

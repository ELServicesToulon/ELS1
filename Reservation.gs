// =================================================================
//                      LOGIQUE DE RÉSERVATION
// =================================================================
// Description: Fonctions centrales pour la gestion des réservations,
//              incluant la gestion des destinataires tiers.
// =================================================================

/**
 * Traite un panier de réservations soumis par le client.
 * @param {Object} donneesReservation L'objet contenant les infos client, destinataire, et les articles du panier.
 * @returns {Object} Un résumé de l'opération.
 */
function reserverPanier(donneesReservation) {
  const lock = LockService.getScriptLock();
  if (!lock.tryLock(30000)) {
    return { success: false, summary: "Le système est occupé. Veuillez réessayer." };
  }

  try {
    const client = donneesReservation.client;
    const items = donneesReservation.items;
    const destinataire = donneesReservation.destinataire;
    const codeParrainageUtilise = donneesReservation.codeParrainage || null;
    
    let remiseParrainage = 0;
    if (codeParrainageUtilise) {
        const validationResult = verifierCodeParrainage(codeParrainageUtilise, client.email);
        if (validationResult.isValid) {
            remiseParrainage = validationResult.remise;
        } else {
            return { success: false, summary: validationResult.message, failedItemIds: items.map(i => i.id) };
        }
    }

    let failedItemIds = [];
    let successfulReservations = [];
    let clientPourCalcul = obtenirInfosClientParEmail(client.email);

    if (!clientPourCalcul) {
        enregistrerOuMajClient(client);
        clientPourCalcul = { email: client.email, nom: client.nom, adresse: client.adresse, siret: client.siret, typeRemise: '', valeurRemise: 0, nbTourneesOffertes: 0 };
    } else {
        enregistrerOuMajClient(client);
    }

    if (destinataire && destinataire.nom) {
      enregistrerOuMajDestinataire(destinataire, client.email);
    }

    for (const item of items) {
      const success = creerReservationUnique(item, client, clientPourCalcul, destinataire, remiseParrainage);
      if (success) {
        successfulReservations.push(success);
        remiseParrainage = 0; // Appliquer la remise une seule fois
      } else {
        failedItemIds.push(item.id);
      }
    }

    if (successfulReservations.length > 0) {
      Logger.log(`Appel de la logique de parrainage pour ${client.email} avec le code ${codeParrainageUtilise}`);
      enregistrerInfosParrainageApresReservation(client.email, codeParrainageUtilise);
      notifierClientConfirmation(client.email, client.nom, successfulReservations);
    }
    
    if (failedItemIds.length > 0) {
        const summary = successfulReservations.length > 0
            ? "Certains créneaux n'étaient plus disponibles mais le reste a été réservé."
            : "Tous les créneaux sélectionnés sont devenus indisponibles.";
        return { success: false, summary: summary, failedItemIds: failedItemIds };
    }

    return { success: true };

  } catch (e) {
    Logger.log(`Erreur critique dans reserverPanier: ${e.stack}`);
    return { success: false, summary: e.message };
  } finally {
    lock.releaseLock();
  }
}

/**
 * Crée une réservation unique, en incluant les informations du destinataire et une éventuelle remise de parrainage.
 */
function creerReservationUnique(item, client, clientPourCalcul, destinataire, remiseParrainage = 0) {
    const CONFIG = getConfiguration();
    const { date, startTime, totalStops, returnToPharmacy } = item;
    const infosTournee = calculerInfosTourneeBase(totalStops, returnToPharmacy, date, startTime);
    const duree = infosTournee.duree;
    const creneauxDisponibles = obtenirCreneauxDisponiblesPourDate(date, duree);

    if (!creneauxDisponibles.includes(startTime)) {
        return null; // Échec
    }

    const [heure, minute] = startTime.split('h').map(Number);
    const [annee, mois, jour] = date.split('-').map(Number);
    const dateDebut = new Date(annee, mois - 1, jour, heure, minute);
    const dateFin = new Date(dateDebut.getTime() + duree * 60000);
    const idReservation = 'RESA-' + new Date().getTime() + '-' + Math.random().toString(36).substr(2, 9);
    
    const titreEvenement = destinataire ? `Livraison ${destinataire.nom} (via ${client.nom})` : `Réservation ${CONFIG.NOM_ENTREPRISE} - ${client.nom}`;
    const descriptionEvenement = `Client: ${client.nom} (${client.email})\nDestinataire: ${destinataire ? destinataire.nom + ' - ' + destinataire.adresse : 'N/A'}\nID Réservation: ${idReservation}\nDétails: ${infosTournee.details}\nNote: ${client.note || ''}`;
    const evenement = CalendarApp.getCalendarById(CONFIG.ID_CALENDRIER).createEvent(titreEvenement, dateDebut, dateFin, { description: descriptionEvenement });

    if (evenement) {
        const infosPrixFinal = calculerPrixEtDureeServeur(totalStops, returnToPharmacy, date, startTime, clientPourCalcul, remiseParrainage);
        
        const nomDestinataire = destinataire ? destinataire.nom : '';
        const adresseDestinataire = destinataire ? destinataire.adresse : '';
        const facturerA = destinataire ? destinataire.facturerA : 'Client';

        enregistrerReservationPourFacturation(
            dateDebut, client.nom, client.email, infosTournee.typeCourse, 
            infosTournee.details, infosPrixFinal.prix, evenement.getId(), idReservation, 
            client.note, infosPrixFinal.tourneeOfferteAppliquee, 
            clientPourCalcul.typeRemise, clientPourCalcul.valeurRemise,
            nomDestinataire, adresseDestinataire, facturerA
        );

        if (infosPrixFinal.tourneeOfferteAppliquee) {
          decrementerTourneesOffertesClient(client.email);
        }
        return { date: formaterDateEnFrancais(dateDebut), time: startTime, price: infosPrixFinal.prix };
    }
    return null;
}

/**
 * Enregistre ou met à jour un destinataire dans la feuille "Destinataires".
 */
function enregistrerOuMajDestinataire(destinataire, emailClientAssocie) {
  const CONFIG = getConfiguration();
  try {
    const sheet = SpreadsheetApp.openById(CONFIG.ID_FEUILLE_CALCUL).getSheetByName("Destinataires");
    const data = sheet.getDataRange().getValues();
    const headers = data[0];
    
    const nomIndex = headers.indexOf("Nom Complet");
    const clientAssocieIndex = headers.indexOf("Client Associé (Email)");

    let rowIndex = -1;
    for (let i = 1; i < data.length; i++) {
        if (data[i][nomIndex] === destinataire.nom && data[i][clientAssocieIndex] === emailClientAssocie) {
            rowIndex = i + 1;
            break;
        }
    }

    const rowData = [
        destinataire.nom,
        destinataire.adresse,
        destinataire.email || '',
        destinataire.telephone || '',
        emailClientAssocie
    ];

    if (rowIndex !== -1) {
        sheet.getRange(rowIndex, 1, 1, rowData.length).setValues([rowData]);
        Logger.log(`Destinataire mis à jour : ${destinataire.nom}`);
    } else {
        sheet.appendRow(rowData);
        Logger.log(`Nouveau destinataire ajouté : ${destinataire.nom}`);
    }
  } catch(e) {
      Logger.log(`Erreur lors de l'enregistrement du destinataire ${destinataire.nom}: ${e.message}`);
  }
}


/**
 * Génère un devis détaillé à partir du panier et l'envoie par email.
 */
function envoyerDevisParEmail(donneesDevis) {
  const CONFIG = getConfiguration();
  try {
    const client = donneesDevis.client;
    const items = donneesDevis.items;
    const emailClient = client.email;

    if (!emailClient || items.length === 0) {
      throw new Error("Email ou panier manquant pour l'envoi du devis.");
    }

    let totalDevis = 0;
    const lignesHtml = items.map(item => {
      const date = new Date(item.date + 'T00:00:00');
      const dateFormatee = formaterDateEnFrancais(date);
      totalDevis += item.prix;
      return `
        <tr>
          <td style="padding: 8px; border-bottom: 1px solid #ddd;">${dateFormatee} à ${item.startTime}</td>
          <td style="padding: 8px; border-bottom: 1px solid #ddd;">${item.details}</td>
          <td style="padding: 8px; border-bottom: 1px solid #ddd; text-align: right;">${item.prix.toFixed(2)} €</td>
        </tr>
      `;
    }).join('');

    const sujet = `Votre devis de réservation - ${CONFIG.NOM_ENTREPRISE}`;
    const corpsHtml = `
      <div style="font-family: Arial, sans-serif; color: #333;">
        <h2>Devis pour vos réservations de tournées</h2>
        <p>Bonjour ${client.nom || ''},</p>
        <p>Voici le détail du devis pour les tournées actuellement dans votre panier. Ce devis est valable 24 heures, sous réserve de disponibilité des créneaux.</p>
        <table style="width: 100%; border-collapse: collapse;">
          <thead>
            <tr>
              <th style="padding: 8px; border-bottom: 2px solid #333; text-align: left;">Date et Heure</th>
              <th style="padding: 8px; border-bottom: 2px solid #333; text-align: left;">Détail de la prestation</th>
              <th style="padding: 8px; border-bottom: 2px solid #333; text-align: right;">Prix TTC</th>
            </tr>
          </thead>
          <tbody>
            ${lignesHtml}
          </tbody>
          <tfoot>
            <tr>
              <td colspan="2" style="padding: 10px 8px; text-align: right; font-weight: bold;">Total Estimé</td>
              <td style="padding: 10px 8px; text-align: right; font-weight: bold;">${totalDevis.toFixed(2)} €</td>
            </tr>
          </tfoot>
        </table>
        <p>Pour confirmer cette réservation, veuillez retourner sur notre application et valider votre panier.</p>
        <p>Merci de votre confiance,<br>L'équipe ${CONFIG.NOM_ENTREPRISE}</p>
      </div>
    `;

    MailApp.sendEmail({
      to: emailClient,
      subject: sujet,
      htmlBody: corpsHtml,
      replyTo: CONFIG.EMAIL_ENTREPRISE
    });

    return { success: true };

  } catch (e) {
    Logger.log(`Erreur dans envoyerDevisParEmail: ${e.stack}`);
    return { success: false, error: e.message };
  }
}

/**
 * Envoie un email de confirmation de réservation au client.
 */
function notifierClientConfirmation(email, nom, reservations) {
    const CONFIG = getConfiguration();
    try {
        if (!email || !reservations || reservations.length === 0) return;
        let corpsHtml = `
            <h1>Confirmation de votre réservation</h1>
            <p>Bonjour ${nom},</p>
            <p>Nous avons le plaisir de vous confirmer la réservation des tournées suivantes :</p>
            <ul>
                ${reservations.map(r => `<li>Le <strong>${r.date} à ${r.time}</strong> pour un montant de ${r.price.toFixed(2)} €</li>`).join('')}
            </ul>
            <p>Merci de votre confiance.</p>
            <p>L'équipe ${CONFIG.NOM_ENTREPRISE}</p>
        `;
        MailApp.sendEmail({
            to: email,
            subject: `Confirmation de votre réservation - ${CONFIG.NOM_ENTREPRISE}`,
            htmlBody: corpsHtml,
            replyTo: CONFIG.EMAIL_ENTREPRISE
        });
    } catch (e) {
        Logger.log(`Erreur lors de l'envoi de l'email de confirmation à ${email}: ${e.toString()}`);
    }
}


/**
 * Calcule les informations de base d'une tournée (prix, durée, type) avant application des remises client.
 */
function calculerInfosTourneeBase(totalStops, returnToPharmacy, dateString, timeString) {
    const CONFIG = getConfiguration();
    const date = new Date(`${dateString}T${timeString.replace('h', ':')}`);
    const jourSemaine = date.getDay(); // 0 = Dimanche, 6 = Samedi
    const maintenant = new Date();
    const delaiAvantCourseMinutes = (date.getTime() - maintenant.getTime()) / 60000;

    let typeCourse = 'Normal';
    if (jourSemaine === 6) { // Samedi
        typeCourse = 'Samedi';
    } else if (delaiAvantCourseMinutes >= 0 && delaiAvantCourseMinutes < CONFIG.URGENT_THRESHOLD_MINUTES) {
        typeCourse = 'Urgent';
    }

    const tarifs = CONFIG.TARIFS[typeCourse];
    if (!tarifs) {
        throw new Error(`Type de tarif inconnu : ${typeCourse}`);
    }

    let prix = tarifs.base;
    const arretsSupplementaires = totalStops - 1;

    for (let i = 0; i < arretsSupplementaires; i++) {
        const prixArret = tarifs.arrets[i] || tarifs.arrets[tarifs.arrets.length - 1];
        prix += prixArret;
    }
    
    if (returnToPharmacy) {
        const dernierIndexArretSup = arretsSupplementaires;
        const prixRetour = tarifs.arrets[dernierIndexArretSup] || tarifs.arrets[tarifs.arrets.length - 1];
        prix += prixRetour;
    }

    const duree = CONFIG.DUREE_BASE + (arretsSupplementaires + (returnToPharmacy ? 1 : 0)) * CONFIG.DUREE_ARRET_SUP;
    const km = CONFIG.KM_BASE + (arretsSupplementaires + (returnToPharmacy ? 1 : 0)) * CONFIG.KM_ARRET_SUP;
    const details = `Tournée de ${duree}min (${arretsSupplementaires} arrêt(s) sup., retour: ${returnToPharmacy ? 'oui' : 'non'})`;
    
    return {
        prix: prix,
        duree: duree,
        km: km,
        details: details,
        typeCourse: typeCourse
    };
}


/**
 * Calcule le prix et la durée d'une course en fonction des paramètres.
 */
function calculerPrixEtDureeServeur(totalStops, returnToPharmacy, dateString, timeString, client, remiseParrainage = 0) {
  const CONFIG = getConfiguration();
  try {
    const infosBase = calculerInfosTourneeBase(totalStops, returnToPharmacy, dateString, timeString);
    let prixFinal = infosBase.prix;
    let tourneeOfferteAppliquee = false;
    let infoRemisePourDetails = "";

    if (client) {
      if (client.nbTourneesOffertes > 0) {
        prixFinal = 0;
        tourneeOfferteAppliquee = true;
        infoRemisePourDetails = " (Tournée offerte)";
      }
      else if (client.typeRemise && client.valeurRemise > 0) {
        if (client.typeRemise === 'Pourcentage') {
          prixFinal *= (1 - client.valeurRemise / 100);
          infoRemisePourDetails = ` (Remise ${client.valeurRemise}%)`;
        } else if (client.typeRemise === 'Montant Fixe') {
          prixFinal = Math.max(0, prixFinal - client.valeurRemise);
          infoRemisePourDetails = ` (Remise ${client.valeurRemise.toFixed(2)}€)`;
        }
      }
    }

    if (!tourneeOfferteAppliquee && remiseParrainage > 0) {
        prixFinal = Math.max(0, prixFinal - remiseParrainage);
        infoRemisePourDetails += ` (Remise Parrainage ${remiseParrainage.toFixed(2)}€)`;
    }

    const details = `${totalStops} arrêt(s) (${infosBase.duree}min) - Type: ${infosBase.typeCourse}${infoRemisePourDetails}${returnToPharmacy ? ' - retour: oui' : ''}`;

    return {
      prix: parseFloat(prixFinal.toFixed(2)),
      duree: infosBase.duree,
      details: details,
      typeCourse: infosBase.typeCourse,
      tourneeOfferteAppliquee: tourneeOfferteAppliquee
    };
  } catch (e) {
    Logger.log(`Erreur dans calculerPrixEtDureeServeur: ${e.stack}`);
    return { prix: 0, duree: CONFIG.DUREE_BASE, details: "Erreur de calcul", typeCourse: "Erreur", tourneeOfferteAppliquee: false };
  }
}



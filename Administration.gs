/**
 * =================================================================
 * LOGIQUE DE L'ADMINISTRATION
 * =================================================================
 */

function genererFactures() {
  if (!isUserAdmin(Session.getActiveUser().getEmail())) {
    SpreadsheetApp.getUi().alert("Action non autorisée.");
    return;
  }
  const CONFIG = getConfiguration();
  const ui = SpreadsheetApp.getUi();
  try {
    validerConfiguration();
    logAdminAction("Génération Factures", "Démarrée");

    const ss = SpreadsheetApp.openById(CONFIG.ID_FEUILLE_CALCUL);
    const feuilleFacturation = ss.getSheetByName("Facturation");
    const feuilleClients = ss.getSheetByName("Clients");

    if (!feuilleFacturation || !feuilleClients) {
      throw new Error("Une des feuilles requises ('Facturation', 'Clients') est introuvable.");
    }

    const indicesFacturation = obtenirIndicesEnTetes(feuilleFacturation, ['Date', 'Client (Email)', 'Valider', 'N° Facture', 'Montant', 'ID PDF', 'Détails', 'Note Interne', 'Lien Note']);
    const indicesClients = obtenirIndicesEnTetes(feuilleClients, ["Email", "Raison Sociale", "Adresse"]);

    const clientsData = feuilleClients.getDataRange().getValues();
    const mapClients = new Map(clientsData.slice(1).map(row => [
      String(row[indicesClients["Email"]]).trim(),
      { nom: String(row[indicesClients["Raison Sociale"]]).trim() || 'N/A', adresse: String(row[indicesClients["Adresse"]]).trim() || 'N/A' }
    ]));

    const facturationData = feuilleFacturation.getDataRange().getValues();
    const facturesAGenerer = facturationData
      .map((row, index) => ({ data: row, indexLigne: index + 1 }))
      .slice(1)
      .filter(item => item.data[indicesFacturation['Valider']] === true && !item.data[indicesFacturation['N° Facture']]);

    if (facturesAGenerer.length === 0) {
      ui.alert("Aucune nouvelle ligne à facturer n'a été sélectionnée.");
      return;
    }

    const facturesParClient = facturesAGenerer.reduce((acc, item) => {
      const email = String(item.data[indicesFacturation['Client (Email)']]).trim();
      if (email) {
        if (!acc[email]) acc[email] = [];
        acc[email].push(item);
      }
      return acc;
    }, {});

    let prochainNumFacture = CONFIG.PROCHAIN_NUMERO_FACTURE;
    const messagesErreurs = [];
    let compteurSucces = 0;

    for (const emailClient in facturesParClient) {
      try {
        const clientInfos = mapClients.get(emailClient);
        if (!clientInfos) throw new Error(`Client ${emailClient} non trouvé.`);
        
        const lignesFactureClient = facturesParClient[emailClient];
        const numFacture = `${CONFIG.PREFIXE_FACTURE}-${new Date().getFullYear()}-${String(prochainNumFacture).padStart(4, '0')}`;
        const dateFacture = new Date();

        let totalHT = 0;
        const lignesBordereau = [];
        let dateMin = new Date(lignesFactureClient[0].data[indicesFacturation['Date']]);
        let dateMax = new Date(lignesFactureClient[0].data[indicesFacturation['Date']]);

        lignesFactureClient.forEach(item => {
          const ligneData = item.data;
          const montantLigne = parseFloat(ligneData[indicesFacturation['Montant']]) || 0;
          totalHT += montantLigne;
          const dateCourse = new Date(ligneData[indicesFacturation['Date']]);
          if (dateCourse < dateMin) dateMin = dateCourse;
          if (dateCourse > dateMax) dateMax = dateCourse;
          
          lignesBordereau.push({
            date: formaterDatePersonnalise(dateCourse, 'dd/MM/yy'),
            heure: formaterDatePersonnalise(dateCourse, 'HH\'h\'mm'),
            details: ligneData[indicesFacturation['Détails']] || '',
            note: ligneData[indicesFacturation['Note Interne']] || '',
            lienNote: ligneData[indicesFacturation['Lien Note']] || null,
            montant: montantLigne.toFixed(2)
          });
        });

        const tva = CONFIG.TVA_APPLICABLE ? totalHT * CONFIG.TAUX_TVA : 0;
        const totalTTC = totalHT + tva;
        const dateEcheance = new Date(dateFacture.getTime() + (CONFIG.DELAI_PAIEMENT_JOURS * 24 * 60 * 60 * 1000));

        const dossierArchives = DriveApp.getFolderById(CONFIG.ID_DOSSIER_ARCHIVES);
        const dossierAnnee = obtenirOuCreerDossier(dossierArchives, dateFacture.getFullYear().toString());
        const dossierMois = obtenirOuCreerDossier(dossierAnnee, formaterDatePersonnalise(dateFacture, "MMMM yyyy"));

        const modeleFacture = DriveApp.getFileById(CONFIG.ID_MODELE_FACTURE);
        const copieFactureDoc = modeleFacture.makeCopy(`${numFacture} - ${clientInfos.nom}`, dossierMois);
        const doc = DocumentApp.openById(copieFactureDoc.getId());
        const corps = doc.getBody();

        corps.replaceText('{{nom_entreprise}}', CONFIG.NOM_ENTREPRISE);
        corps.replaceText('{{adresse_entreprise}}', CONFIG.ADRESSE_ENTREPRISE);
        corps.replaceText('{{siret}}', CONFIG.SIRET);
        corps.replaceText('{{email_entreprise}}', CONFIG.EMAIL_ENTREPRISE);
        corps.replaceText('{{client_nom}}', clientInfos.nom);
        corps.replaceText('{{client_adresse}}', clientInfos.adresse);
        corps.replaceText('{{numero_facture}}', numFacture);
        corps.replaceText('{{date_facture}}', formaterDatePersonnalise(dateFacture, 'dd/MM/yyyy'));
        corps.replaceText('{{periode_facturee}}', formaterDatePersonnalise(dateMin, 'MMMM yyyy'));
        corps.replaceText('{{date_debut_periode}}', formaterDatePersonnalise(dateMin, 'dd/MM/yyyy'));
        corps.replaceText('{{date_fin_periode}}', formaterDatePersonnalise(dateMax, 'dd/MM/yyyy'));
        corps.replaceText('{{total_ht}}', totalHT.toFixed(2));
        corps.replaceText('{{montant_tva}}', tva.toFixed(2));
        corps.replaceText('{{total_ttc}}', totalTTC.toFixed(2));
        corps.replaceText('{{date_echeance}}', formaterDatePersonnalise(dateEcheance, 'dd/MM/yyyy'));
        corps.replaceText('{{rib_entreprise}}', CONFIG.RIB_ENTREPRISE);
        corps.replaceText('{{bic_entreprise}}', CONFIG.BIC_ENTREPRISE);
        
        const tableBordereau = trouverTableBordereau(corps);
        if (tableBordereau) {
          while(tableBordereau.getNumRows() > 1) { tableBordereau.removeRow(1); }
          
          lignesBordereau.forEach(ligne => {
            const nouvelleLigne = tableBordereau.appendTableRow();
            nouvelleLigne.appendTableCell(ligne.date);
            nouvelleLigne.appendTableCell(ligne.heure);
            nouvelleLigne.appendTableCell(ligne.details);
            
            const celluleNote = nouvelleLigne.appendTableCell('');
            if (ligne.lienNote && ligne.lienNote.startsWith('http')) {
                celluleNote.setText('Voir Note').editAsText().setLinkUrl(ligne.lienNote);
            } else {
                celluleNote.setText(ligne.note);
            }

            nouvelleLigne.appendTableCell(ligne.montant + ' €');
          });
        } else {
            throw new Error("Aucun tableau de bordereau valide trouvé. Vérifiez les en-têtes.");
        }

        doc.saveAndClose();

        const blobPDF = copieFactureDoc.getAs(MimeType.PDF);
        const fichierPDF = dossierMois.createFile(blobPDF).setName(`${numFacture} - ${clientInfos.nom}.pdf`);

        lignesFactureClient.forEach(item => {
          feuilleFacturation.getRange(item.indexLigne, indicesFacturation['N° Facture'] + 1).setValue(numFacture);
          feuilleFacturation.getRange(item.indexLigne, indicesFacturation['Valider'] + 1).setValue(false);
          feuilleFacturation.getRange(item.indexLigne, indicesFacturation['ID PDF'] + 1).setValue(fichierPDF.getId());
        });

        DriveApp.getFileById(copieFactureDoc.getId()).setTrashed(true);
        prochainNumFacture++;
        compteurSucces++;

      } catch (err) {
        messagesErreurs.push(`Erreur pour ${emailClient}: ${err.message}`);
        Logger.log(`Erreur de facturation pour ${emailClient}: ${err.stack}`);
      }
    }

    updateSingleConfigValue('PROCHAIN_NUMERO_FACTURE', prochainNumFacture);
    logAdminAction("Génération Factures", `Succès pour ${compteurSucces} client(s). Erreurs: ${messagesErreurs.length}`);
    
    const messageFinal = `${compteurSucces} facture(s) ont été générée(s) avec succès.\n\n` +
      `Prochaine étape :\n` +
      `1. Contrôlez les PDF dans le dossier Drive.\n` +
      `2. Cochez les cases dans la colonne "Email à envoyer".\n` +
      `3. Utilisez le menu "EL Services > Envoyer les factures contrôlées".\n\n` +
      `Erreurs: ${messagesErreurs.join('\n') || 'Aucune'}`;
    ui.alert("Génération terminée", messageFinal, ui.ButtonSet.OK);

  } catch (e) {
    Logger.log(`ERREUR FATALE dans genererFactures: ${e.stack}`);
    logAdminAction("Génération Factures", `Échec critique: ${e.message}`);
    ui.showModalDialog(HtmlService.createHtmlOutput(`<p>Une erreur critique est survenue:</p><pre>${e.message}</pre>`), "Erreur Critique");
  }
}

function obtenirTousLesClients() {
  if (!isUserAdmin(Session.getActiveUser().getEmail())) return [];
  const CONFIG = getConfiguration();
  try {
    const feuilleClients = SpreadsheetApp.openById(CONFIG.ID_FEUILLE_CALCUL).getSheetByName("Clients");
    if (!feuilleClients) return [];

    const enTetesRequis = ["Email", "Raison sociale", "Adresse", "SIRET", CONFIG.COLONNE_TYPE_REMISE_CLIENT, CONFIG.COLONNE_VALEUR_REMISE_CLIENT, CONFIG.COLONNE_NB_TOURNEES_OFFERTES];
    const indices = obtenirIndicesEnTetes(feuilleClients, enTetesRequis);
    
    const donnees = feuilleClients.getDataRange().getValues();
    const clients = donnees.slice(1).map(ligne => {
      if (!ligne[indices["Email"]]) return null;
      return {
        email: ligne[indices["Email"]],
        nom: ligne[indices["Raison sociale"]] || '',
        adresse: ligne[indices["Adresse"]] || '',
        siret: ligne[indices["SIRET"]] || '',
        typeRemise: String(ligne[indices[CONFIG.COLONNE_TYPE_REMISE_CLIENT]]).trim() || '',
        valeurRemise: parseFloat(ligne[indices[CONFIG.COLONNE_VALEUR_REMISE_CLIENT]]) || 0,
        nbTourneesOffertes: parseInt(ligne[indices[CONFIG.COLONNE_NB_TOURNEES_OFFERTES]]) || 0
      };
    }).filter(Boolean);

    return clients;
  } catch (e) {
    Logger.log(`Erreur dans obtenirTousLesClients : ${e.stack}`);
    return [];
  }
}

function obtenirReservationsAdmin(dateString = null) {
  if (!isUserAdmin(Session.getActiveUser().getEmail())) return { success: false, error: "Accès non autorisé." };
  const CONFIG = getConfiguration();
  try {
    const feuille = SpreadsheetApp.openById(CONFIG.ID_FEUILLE_CALCUL).getSheetByName("Facturation");
    const enTetes = ["Date", "Client (Email)", "Event ID", "Détails", "Client (Raison S. Client)", "ID Réservation", "Montant", "T° Statut", "Type Remise Appliquée", "Valeur Remise Appliquée", "Tournée Offerte Appliquée", "Nom Destinataire", "Adresse Destinataire"];
    const indices = obtenirIndicesEnTetes(feuille, enTetes);
    
    // Cache des adresses des clients pour éviter les appels répétitifs
    const clients = obtenirTousLesClients();
    const mapAdressesClients = new Map(clients.map(c => [c.email, c.adresse]));

    const donnees = feuille.getDataRange().getValues();
    const dateFiltre = dateString ? new Date(dateString + "T00:00:00") : null;
    const dateFiltreString = dateFiltre ? Utilities.formatDate(dateFiltre, Session.getScriptTimeZone(), "yyyy-MM-dd") : null;

    const reservations = donnees
      .slice(1)
      .map(ligne => {
        if (dateFiltreString) {
          const dateLigne = new Date(ligne[indices["Date"]]);
          if (isNaN(dateLigne.getTime())) return null;
          const dateLigneString = Utilities.formatDate(dateLigne, Session.getScriptTimeZone(), "yyyy-MM-dd");
          if (dateLigneString !== dateFiltreString) {
            return null;
          }
        }
        return formaterReservationPourAdmin(ligne, indices, mapAdressesClients);
      })
      .filter(Boolean)
      .sort((a, b) => new Date(a.start) - new Date(b.start));

    return { success: true, reservations: reservations };
  } catch (e) {
    Logger.log(`Erreur critique dans obtenirReservationsAdmin: ${e.stack}`);
    return { success: false, error: e.message };
  }
}

function obtenirToutesReservationsAdmin() {
  return obtenirReservationsAdmin();
}

function obtenirToutesReservationsPourDate(dateString) {
  return obtenirReservationsAdmin(dateString);
}

function creerReservationAdmin(data) {
  if (!isUserAdmin(Session.getActiveUser().getEmail())) return { success: false, error: "Accès non autorisé." };
  const CONFIG = getConfiguration();
  const lock = LockService.getScriptLock();
  if (!lock.tryLock(30000)) {
    return { success: false, error: "Le système est occupé. Veuillez réessayer." };
  }

  try {
    const { client, date, startTime, additionalStops, returnToPharmacy, notifyClient } = data;

    if (!client || !client.email || !date || !startTime) {
      throw new Error("Données de réservation incomplètes.");
    }

    enregistrerOuMajClient(client);
    const totalStops = additionalStops + 1;
    const clientPourCalcul = obtenirInfosClientParEmail(client.email);
    const infosPrixFinal = calculerPrixEtDureeServeur(totalStops, returnToPharmacy, date, startTime, clientPourCalcul);
    const duree = infosPrixFinal.duree;

    const creneauxDisponibles = obtenirCreneauxDisponiblesPourDate(date, duree);
    if (!creneauxDisponibles.includes(startTime)) {
        return { success: false, error: `Le créneau ${startTime} est devenu indisponible.` };
    }

    const [heure, minute] = startTime.split('h').map(Number);
    const [annee, mois, jour] = date.split('-').map(Number);
    const dateDebut = new Date(annee, mois - 1, jour, heure, minute);
    const dateFin = new Date(dateDebut.getTime() + duree * 60000);
    const idReservation = 'RESA-' + new Date().getTime() + '-' + Math.random().toString(36).substr(2, 9);
    
    const titreEvenement = `Réservation ${CONFIG.NOM_ENTREPRISE} - ${client.nom}`;
    const descriptionEvenement = `Client: ${client.nom} (${client.email})\nID Réservation: ${idReservation}\nDétails: ${infosPrixFinal.details}\nNote: Ajouté par Admin.`;
    
    const evenement = CalendarApp.getCalendarById(CONFIG.ID_CALENDRIER).createEvent(titreEvenement, dateDebut, dateFin, { description: descriptionEvenement });

    if (!evenement) throw new Error("Échec de la création de l'événement dans le calendrier.");

    enregistrerReservationPourFacturation(
        dateDebut, client.nom, client.email, infosPrixFinal.typeCourse, infosPrixFinal.details, 
        infosPrixFinal.prix, evenement.getId(), idReservation, "Ajouté par Admin", 
        infosPrixFinal.tourneeOfferteAppliquee, clientPourCalcul.typeRemise, clientPourCalcul.valeurRemise
    );

    if (infosPrixFinal.tourneeOfferteAppliquee) {
      decrementerTourneesOffertesClient(client.email);
    }

    if (notifyClient) {
      notifierClientConfirmation(client.email, client.nom, [{
        date: formaterDateEnFrancais(dateDebut),
        time: startTime,
        price: infosPrixFinal.prix
      }]);
    }
    
    return { success: true };

  } catch (e) {
    Logger.log(`Erreur critique dans creerReservationAdmin: ${e.stack}`);
    return { success: false, error: e.message };
  } finally {
    lock.releaseLock();
  }
}

function supprimerReservation(idReservation) {
  if (!isUserAdmin(Session.getActiveUser().getEmail())) return { success: false, error: "Accès non autorisé." };
  const CONFIG = getConfiguration();
  const lock = LockService.getScriptLock();
  if (!lock.tryLock(30000)) {
    return { success: false, error: "Le système est occupé, veuillez réessayer." };
  }

  try {
    const feuille = SpreadsheetApp.openById(CONFIG.ID_FEUILLE_CALCUL).getSheetByName("Facturation");
    const enTete = feuille.getRange(1, 1, 1, feuille.getLastColumn()).getValues()[0];
    const idResaIndex = enTete.indexOf("ID Réservation");
    const idEventIndex = enTete.indexOf("Event ID");

    if (idResaIndex === -1 || idEventIndex === -1) {
      throw new Error("Colonne 'ID Réservation' ou 'Event ID' introuvable.");
    }

    const donnees = feuille.getDataRange().getValues();
    const indexLigne = donnees.findIndex(row => String(row[idResaIndex]).trim() === String(idReservation).trim());

    if (indexLigne === -1) {
      return { success: false, error: "Réservation introuvable." };
    }

    const idEvenement = donnees[indexLigne][idEventIndex];

    if (idEvenement) {
      try {
        Calendar.Events.remove(CONFIG.ID_CALENDRIER, idEvenement);
      } catch (e) {
        Logger.log(`Avertissement: L'événement Calendar ${idEvenement} n'a pas pu être supprimé. Erreur: ${e.message}`);
      }
    }

    feuille.deleteRow(indexLigne + 1);
    return { success: true };

  } catch (e) {
    Logger.log(`Erreur dans supprimerReservation: ${e.stack}`);
    return { success: false, error: e.message };
  } finally {
    lock.releaseLock();
  }
}

function mettreAJourDetailsReservation(idReservation, nouveauxArrets) {
  if (!isUserAdmin(Session.getActiveUser().getEmail())) return { success: false, error: "Accès non autorisé." };
  const CONFIG = getConfiguration();
  const lock = LockService.getScriptLock();
  if (!lock.tryLock(30000)) return { success: false, error: "Le système est occupé, veuillez réessayer." };

  try {
    const feuille = SpreadsheetApp.openById(CONFIG.ID_FEUILLE_CALCUL).getSheetByName("Facturation");
    const enTete = feuille.getRange(1, 1, 1, feuille.getLastColumn()).getValues()[0];
    const indices = {
      idResa: enTete.indexOf("ID Réservation"), idEvent: enTete.indexOf("Event ID"),
      details: enTete.indexOf("Détails"), email: enTete.indexOf("Client (Email)"),
      montant: enTete.indexOf("Montant"), date: enTete.indexOf("Date")
    };
    if (Object.values(indices).some(i => i === -1)) throw new Error("Colonnes requises introuvables.");

    const donnees = feuille.getDataRange().getValues();
    const indexLigne = donnees.findIndex(row => String(row[indices.idResa]).trim() === String(idReservation).trim());
    if (indexLigne === -1) return { success: false, error: "Réservation introuvable." };

    const ligneDonnees = donnees[indexLigne];
    const idEvenement = String(ligneDonnees[indices.idEvent]).trim();
    const detailsAnciens = String(ligneDonnees[indices.details]);
    const emailClient = ligneDonnees[indices.email];
    
    let ressourceEvenement = null;
    let dateDebutOriginale = new Date(ligneDonnees[indices.date]);

    try {
      if (idEvenement) {
        ressourceEvenement = Calendar.Events.get(CONFIG.ID_CALENDRIER, idEvenement);
        dateDebutOriginale = new Date(ressourceEvenement.start.dateTime);
      }
    } catch (e) {
      Logger.log(`Événement ${idEvenement} introuvable pour modification. Seule la feuille de calcul sera mise à jour.`);
      ressourceEvenement = null;
    }
    
    const dateEvenement = formaterDatePersonnalise(dateDebutOriginale, "yyyy-MM-dd");
    const heureEvenement = formaterDatePersonnalise(dateDebutOriginale, "HH'h'mm");
    const retourPharmacie = detailsAnciens.includes('retour: oui');

    const clientPourCalcul = obtenirInfosClientParEmail(emailClient);
    const { prix: nouveauPrix, duree: nouvelleDuree, details: nouveauxDetails } = calculerPrixEtDureeServeur(nouveauxArrets + 1, retourPharmacie, dateEvenement, heureEvenement, clientPourCalcul);
    
    if (ressourceEvenement) {
      const nouvelleDateFin = new Date(dateDebutOriginale.getTime() + nouvelleDuree * 60000);
      ressourceEvenement.end.dateTime = nouvelleDateFin.toISOString();
      ressourceEvenement.description = ressourceEvenement.description.replace(/Détails: .*/, `Détails: ${nouveauxDetails}`);
      Calendar.Events.patch(ressourceEvenement, CONFIG.ID_CALENDRIER, idEvenement);
    }

    feuille.getRange(indexLigne + 1, indices.details + 1).setValue(nouveauxDetails);
    feuille.getRange(indexLigne + 1, indices.montant + 1).setValue(nouveauPrix);
    
    return { success: true };

  } catch (e) {
    Logger.log(`Erreur dans mettreAJourDetailsReservation: ${e.stack}`);
    return { success: false, error: e.message };
  } finally {
    lock.releaseLock();
  }
}

function replanifierReservation(idReservation, nouvelleDate, nouvelleHeure) {
  if (!isUserAdmin(Session.getActiveUser().getEmail())) return { success: false, error: "Accès non autorisé." };
  const CONFIG = getConfiguration();
  const lock = LockService.getScriptLock();
  if (!lock.tryLock(30000)) return { success: false, error: "Le système est occupé." };

  try {
    const feuille = SpreadsheetApp.openById(CONFIG.ID_FEUILLE_CALCUL).getSheetByName("Facturation");
    const enTete = feuille.getRange(1, 1, 1, feuille.getLastColumn()).getValues()[0];
    const indices = {
      idResa: enTete.indexOf("ID Réservation"), idEvent: enTete.indexOf("Event ID"),
      email: enTete.indexOf("Client (Email)"), date: enTete.indexOf("Date"),
      montant: enTete.indexOf("Montant"), details: enTete.indexOf("Détails")
    };
    if (Object.values(indices).some(i => i === -1)) throw new Error("Colonnes requises introuvables.");

    const donnees = feuille.getDataRange().getValues();
    const indexLigne = donnees.findIndex(row => String(row[indices.idResa]).trim() === String(idReservation).trim());
    if (indexLigne === -1) return { success: false, error: "Réservation introuvable." };

    const ligneDonnees = donnees[indexLigne];
    const idEvenementAncien = String(ligneDonnees[indices.idEvent]).trim();
    const details = String(ligneDonnees[indices.details]);

    const matchDuree = details.match(/(\d+)min/);
    const dureeCalculee = matchDuree ? parseInt(matchDuree[1], 10) : CONFIG.DUREE_BASE;

    const creneauxDisponibles = obtenirCreneauxDisponiblesPourDate(nouvelleDate, dureeCalculee, idEvenementAncien);
    if (!creneauxDisponibles.includes(nouvelleHeure)) {
      return { success: false, error: "Ce créneau n'est plus disponible." };
    }

    const [annee, mois, jour] = nouvelleDate.split('-').map(Number);
    const [heure, minute] = nouvelleHeure.split('h').map(Number);
    const nouvelleDateDebut = new Date(annee, mois - 1, jour, heure, minute);
    
    let ressourceEvenement;
    try {
        ressourceEvenement = idEvenementAncien ? Calendar.Events.get(CONFIG.ID_CALENDRIER, idEvenementAncien) : null;
    } catch(e) {
        ressourceEvenement = null;
        Logger.log(`Événement ancien ${idEvenementAncien} introuvable pour déplacement.`);
    }

    if (ressourceEvenement) {
        const nouvelleDateFin = new Date(nouvelleDateDebut.getTime() + dureeCalculee * 60000);
        const ressourceMaj = {
            start: { dateTime: nouvelleDateDebut.toISOString() },
            end: { dateTime: nouvelleDateFin.toISOString() }
        };
        Calendar.Events.patch(ressourceMaj, CONFIG.ID_CALENDRIER, idEvenementAncien);
        feuille.getRange(indexLigne + 1, indices.date + 1).setValue(nouvelleDateDebut);
    } else {
        feuille.getRange(indexLigne + 1, indices.date + 1).setValue(nouvelleDateDebut);
        Logger.log(`La réservation ${idReservation} a été mise à jour dans le sheet, mais l'événement calendar n'a pas été trouvé pour être déplacé.`);
    }

    return { success: true };

  } catch (e) {
    Logger.log(`Erreur dans replanifierReservation: ${e.stack}`);
    return { success: false, error: e.message };
  } finally {
    lock.releaseLock();
  }
}

function appliquerRemiseReservation(idReservation, typeRemise, valeurRemise, nbTourneesOffertesClient) {
  if (!isUserAdmin(Session.getActiveUser().getEmail())) return { success: false, error: "Accès non autorisé." };
  const CONFIG = getConfiguration();
  try {
    const sheet = SpreadsheetApp.openById(CONFIG.ID_FEUILLE_CALCUL).getSheetByName('Facturation');
    const data = sheet.getDataRange().getValues();
    const headers = data[0];

    const idResaIndex = headers.indexOf("ID Réservation");
    const montantIndex = headers.indexOf("Montant");
    const detailsIndex = headers.indexOf("Détails");
    const clientEmailIndex = headers.indexOf("Client (Email)");
    const dateIndex = headers.indexOf("Date");
    const typeRemiseIndex = headers.indexOf("Type Remise Appliquée");
    const valeurRemiseIndex = headers.indexOf("Valeur Remise Appliquée");
    const tourneeOfferteIndex = headers.indexOf("Tournée Offerte Appliquée");
    
    if ([idResaIndex, montantIndex, detailsIndex, clientEmailIndex, dateIndex, typeRemiseIndex, valeurRemiseIndex, tourneeOfferteIndex].includes(-1)) {
      throw new Error("Une ou plusieurs colonnes requises sont introuvables dans la feuille 'Facturation'.");
    }

    let rowIndex = -1;
    for (let i = 1; i < data.length; i++) {
      if (data[i][idResaIndex] === idReservation) {
        rowIndex = i;
        break;
      }
    }

    if (rowIndex === -1) {
      return { success: false, error: "Réservation introuvable." };
    }

    const rowData = data[rowIndex];
    const clientEmail = rowData[clientEmailIndex];
    
    const details = rowData[detailsIndex];
    const matchArrets = details.match(/(\d+)\s*arrêt\(s\)\s*sup/);
    const matchRetour = details.includes('retour: oui');
    
    const arretsSupplementaires = matchArrets ? parseInt(matchArrets[1], 10) : 0;
    const totalStops = arretsSupplementaires + 1;

    const dateCourse = new Date(rowData[dateIndex]);
    const heureCourse = Utilities.formatDate(dateCourse, Session.getScriptTimeZone(), "HH'h'mm");
    const dateCourseString = Utilities.formatDate(dateCourse, Session.getScriptTimeZone(), 'yyyy-MM-dd');
    
    const infosPrixBase = calculerInfosTourneeBase(totalStops, matchRetour, dateCourseString, heureCourse);
    let prixBase = infosPrixBase.prix;
    let nouveauPrix = prixBase;
    let tourneeOfferteAppliquee = false;

    if (typeRemise === "Tournées Offertes") {
      if (nbTourneesOffertesClient > 0) {
        nouveauPrix = 0;
        tourneeOfferteAppliquee = true;
        decrementerTourneesOffertesClient(clientEmail);
      } else {
        return { success: false, error: "Le client n'a pas de tournée offerte disponible." };
      }
    } else if (typeRemise === "Pourcentage" && valeurRemise > 0) {
      nouveauPrix = prixBase * (1 - valeurRemise / 100);
    } else if (typeRemise === "Montant Fixe" && valeurRemise > 0) {
      nouveauPrix = Math.max(0, prixBase - valeurRemise);
    } else { 
       typeRemise = "";
       valeurRemise = 0;
    }

    sheet.getRange(rowIndex + 1, montantIndex + 1).setValue(nouveauPrix.toFixed(2));
    sheet.getRange(rowIndex + 1, typeRemiseIndex + 1).setValue(typeRemise);
    sheet.getRange(rowIndex + 1, valeurRemiseIndex + 1).setValue(valeurRemise);
    sheet.getRange(rowIndex + 1, tourneeOfferteIndex + 1).setValue(tourneeOfferteAppliquee);

    return { success: true };

  } catch (e) {
    Logger.log(`Erreur dans appliquerRemiseReservation: ${e.stack}`);
    return { success: false, error: e.message };
  }
}

function formaterReservationPourAdmin(ligne, indices, mapAdressesClients) {
  const CONFIG = getConfiguration();
  try {
    const dateSheet = new Date(ligne[indices["Date"]]);
    if (isNaN(dateSheet.getTime())) return null;

    const eventId = String(ligne[indices["Event ID"]]).trim();
    let dateDebut = dateSheet;
    let dateFin;

    if (eventId) {
      try {
        const evenementRessource = Calendar.Events.get(CONFIG.ID_CALENDRIER, eventId);
        dateDebut = new Date(evenementRessource.start.dateTime || evenementRessource.start.date);
        dateFin = new Date(evenementRessource.end.dateTime || evenementRessource.end.date);
      } catch (err) {
        Logger.log(`Avertissement: Événement Calendar (ID: ${eventId}) introuvable pour la résa ${ligne[indices["ID Réservation"]]}.`);
      }
    }

    const details = String(ligne[indices["Détails"]]);
    const matchDuree = details.match(/(\d+)min/);
    const duree = matchDuree ? parseInt(matchDuree[1], 10) : CONFIG.DUREE_BASE;
    if (!dateFin) {
        dateFin = new Date(dateDebut.getTime() + duree * 60000);
    }
    
    const matchArrets = details.match(/(\d+)\s*arrêt\(s\)\s*sup/);
    const retour = details.includes('retour: oui');
    const arrets = matchArrets ? parseInt(matchArrets[1], 10) : 0;
    const totalArretsCalculesPourKm = arrets + (retour ? 1 : 0);
    const km = CONFIG.KM_BASE + (totalArretsCalculesPourKm * CONFIG.KM_ARRET_SUP);
    
    const typeRemise = ligne[indices["Type Remise Appliquée"]] || '';
    const valeurRemise = ligne[indices["Valeur Remise Appliquée"]] || 0;
    const tourneeOfferte = ligne[indices["Tournée Offerte Appliquée"]] === true;
    let infoRemise = '';
    if (tourneeOfferte) {
      infoRemise = 'Tournée Offerte';
    } else if (typeRemise === 'Pourcentage') {
      infoRemise = `-${valeurRemise}%`;
    } else if (typeRemise === 'Montant Fixe') {
      infoRemise = `-${valeurRemise.toFixed(2)}€`;
    }

    const clientEmail = ligne[indices["Client (Email)"]];
    const adresseDestinataire = ligne[indices["Adresse Destinataire"]];
    const adresseFinale = adresseDestinataire || mapAdressesClients.get(clientEmail) || '';

    return {
      id: ligne[indices["ID Réservation"]],
      eventId: eventId,
      start: dateDebut.toISOString(),
      end: dateFin.toISOString(),
      details: details,
      clientName: ligne[indices["Client (Raison S. Client)"]],
      clientEmail: clientEmail,
      destinationAddress: adresseFinale,
      amount: parseFloat(ligne[indices["Montant"]]) || 0,
      km: Math.round(km),
      statut: ligne[indices["T° Statut"]],
      infoRemise: infoRemise
    };
  } catch(e) {
    Logger.log(`Erreur de formatage d'une ligne de réservation admin: ${e.toString()}`);
    return null;
  }
}

function trouverTableBordereau(body) {
    const tables = body.getTables();
    for (let i = 0; i < tables.length; i++) {
        const table = tables[i];
        if (table.getNumRows() > 0) {
            const premiereLigne = table.getRow(0);
            if (premiereLigne.getCell(0).getText().trim() === 'Date' && premiereLigne.getCell(2).getText().trim() === 'Détail') {
                return table;
            }
        }
    }
    return null;
}

function validerConfiguration() {
    const CONFIG = getConfiguration();
    const requis = ['ID_FEUILLE_CALCUL', 'ID_MODELE_FACTURE', 'ID_DOSSIER_ARCHIVES', 'NOM_ENTREPRISE'];
    requis.forEach(constant => {
        if (typeof CONFIG[constant] === 'undefined' || !CONFIG[constant]) {
            throw new Error(`La constante de configuration "${constant}" est manquante ou vide. Veuillez la définir.`);
        }
    });
}

function logAdminAction(action, details) {
    Logger.log(`Action Admin: ${action} - ${details}`);
}

function obtenirOuCreerDossier(parent, nom) {
    const it = parent.getFoldersByName(nom);
    return it.hasNext() ? it.next() : parent.createFolder(nom);
}

function formaterDatePersonnalise(date, format) {
    return Utilities.formatDate(date, Session.getScriptTimeZone(), format);
}

function obtenirIndicesEnTetes(sheet, headers) {
    const enTetesFeuille = sheet.getRange(1, 1, 1, sheet.getLastColumn()).getValues()[0];
    const indices = {};
    headers.forEach(header => {
        const index = enTetesFeuille.indexOf(header);
        if (index !== -1) {
            indices[header] = index;
        } else {
            const trimmedIndex = enTetesFeuille.findIndex(h => String(h).trim() === header.trim());
            if (trimmedIndex !== -1) {
                indices[header] = trimmedIndex;
            } else {
                throw new Error(`La colonne "${header}" est introuvable dans la feuille "${sheet.getName()}".`);
            }
        }
    });
    return indices;
}

function formaterDateEnFrancais(date) {
    const jours = ['Dimanche', 'Lundi', 'Mardi', 'Mercredi', 'Jeudi', 'Vendredi', 'Samedi'];
    const mois = ['janvier', 'février', 'mars', 'avril', 'mai', 'juin', 'juillet', 'août', 'septembre', 'octobre', 'novembre', 'décembre'];
    return `${jours[date.getDay()]} ${date.getDate()} ${mois[date.getMonth()]} ${date.getFullYear()}`;
}


function envoyerFacturesControlees() {
  if (!isUserAdmin(Session.getActiveUser().getEmail())) {
    SpreadsheetApp.getUi().alert("Action non autorisée.");
    return;
  }
  const CONFIG = getConfiguration();
  const ui = SpreadsheetApp.getUi();
  try {
    logAdminAction("Envoi Factures", "Démarré");
    const ss = SpreadsheetApp.openById(CONFIG.ID_FEUILLE_CALCUL);
    const feuilleFacturation = ss.getSheetByName("Facturation");
    if (!feuilleFacturation) throw new Error("Feuille 'Facturation' introuvable.");

    const enTetes = ["Email à envoyer", "Client (Email)", "N° Facture", "ID PDF", "Valider"];
    const indices = obtenirIndicesEnTetes(feuilleFacturation, enTetes);

    const facturationData = feuilleFacturation.getDataRange().getValues();
    const facturesAEnvoyer = facturationData
      .map((row, index) => ({ data: row, indexLigne: index + 1 }))
      .slice(1)
      .filter(item => item.data[indices['Email à envoyer']] === true);

    if (facturesAEnvoyer.length === 0) {
      ui.alert("Aucune facture n'est sélectionnée pour l'envoi.");
      return;
    }

    const messagesErreurs = [];
    let compteurSucces = 0;

    const sujetEmail = CONFIG.SUJET_EMAIL_FACTURE || `Votre facture {{numero_facture}} - ${CONFIG.NOM_ENTREPRISE}`;
    const corpsEmail = CONFIG.CORPS_EMAIL_FACTURE || `Bonjour,\n\nVeuillez trouver ci-joint votre facture n°{{numero_facture}}.\n\nCordialement,\nL'équipe ${CONFIG.NOM_ENTREPRISE}`;

    facturesAEnvoyer.forEach(item => {
      const ligneData = item.data;
      const emailClient = String(ligneData[indices['Client (Email)']]).trim();
      const numFacture = String(ligneData[indices['N° Facture']]).trim();
      const idPdf = String(ligneData[indices['ID PDF']]).trim();

      try {
        if (!emailClient || !numFacture || !idPdf) {
          throw new Error(`Données manquantes sur la ligne ${item.indexLigne}.`);
        }

        const fichierPDF = DriveApp.getFileById(idPdf);
        const sujet = sujetEmail.replace('{{numero_facture}}', numFacture);
        const corps = corpsEmail.replace('{{numero_facture}}', numFacture);

        MailApp.sendEmail({
          to: emailClient,
          subject: sujet,
          body: corps,
          attachments: [fichierPDF.getAs(MimeType.PDF)],
          name: CONFIG.NOM_ENTREPRISE
        });

        // Décocher la case après envoi réussi
        feuilleFacturation.getRange(item.indexLigne, indices['Email à envoyer'] + 1).setValue(false);
        compteurSucces++;

      } catch (err) {
        messagesErreurs.push(`Ligne ${item.indexLigne}: Erreur pour ${emailClient} - ${err.message}`);
        Logger.log(`Erreur envoi facture ${numFacture} à ${emailClient}: ${err.stack}`);
      }
    });

    logAdminAction("Envoi Factures", `Succès: ${compteurSucces}. Erreurs: ${messagesErreurs.length}`);
    const messageFinal = `${compteurSucces} email(s) de facture envoyé(s) avec succès.\n\n` +
      `Erreurs rencontrées:\n${messagesErreurs.join('\n') || 'Aucune'}`;
    ui.alert("Envoi des factures terminé", messageFinal, ui.ButtonSet.OK);

  } catch (e) {
    Logger.log(`ERREUR FATALE dans envoyerFacturesControlees: ${e.stack}`);
    logAdminAction("Envoi Factures", `Échec critique: ${e.message}`);
    ui.showModalDialog(HtmlService.createHtmlOutput(`<p>Une erreur critique est survenue:</p><pre>${e.message}</pre>`), "Erreur Critique");
  }
}


/**
 * Récupère la liste des clients pour le panneau admin.
 */
function getClientsPourAdmin() {
  if (!isUserAdmin(Session.getActiveUser().getEmail())) return [];
  const CONFIG = getConfiguration();
  try {
    const ss = SpreadsheetApp.openById(CONFIG.CLIENT_SHEET_ID);
    const sheet = ss.getSheetByName("Clients");
    if (!sheet) {
      throw new Error("La feuille 'Clients' est introuvable dans le Google Sheets.");
    }

    const values = sheet.getDataRange().getValues();
    const headers = values.shift();

    // Find all column indices
    const indices = {
        nom: headers.findIndex(h => h.trim() === "Raison sociale"),
        email: headers.findIndex(h => h.trim() === "Email"),
        adresse: headers.findIndex(h => h.trim() === "Adresse"),
        siret: headers.findIndex(h => h.trim() === "SIRET"),
        typeRemise: headers.findIndex(h => h.trim() === CONFIG.COLONNE_TYPE_REMISE_CLIENT),
        valeurRemise: headers.findIndex(h => h.trim() === CONFIG.COLONNE_VALEUR_REMISE_CLIENT),
        nbTourneesOffertes: headers.findIndex(h => h.trim() === CONFIG.COLONNE_NB_TOURNEES_OFFERTES)
    };

    if (indices.nom === -1 || indices.email === -1) {
      throw new Error("Impossible de trouver les colonnes de base 'Raison sociale' ou 'Email' dans la feuille 'Clients'.");
    }

    const clients = values.map(row => {
      const email = row[indices.email];
      const nom = row[indices.nom];
      if (email && typeof email === 'string' && email.trim() !== '' && nom && typeof nom === 'string' && nom.trim() !== '') {
        return {
          nom: nom.trim(),
          email: email.trim(),
          adresse: indices.adresse !== -1 && row[indices.adresse] ? String(row[indices.adresse]).trim() : '',
          siret: indices.siret !== -1 && row[indices.siret] ? String(row[indices.siret]).trim() : '',
          typeRemise: indices.typeRemise !== -1 && row[indices.typeRemise] ? String(row[indices.typeRemise]).trim() : '',
          valeurRemise: indices.valeurRemise !== -1 ? parseFloat(row[indices.valeurRemise]) || 0 : 0,
          nbTourneesOffertes: indices.nbTourneesOffertes !== -1 ? parseInt(row[indices.nbTourneesOffertes], 10) || 0 : 0
        };
      }
      return null;
    }).filter(Boolean);

    return clients;
  } catch (e) {
    Logger.log(`Erreur critique dans getClientsPourAdmin : ${e.stack}`);
    return [];
  }
}

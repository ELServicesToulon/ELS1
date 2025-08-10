// =================================================================
//                      LOGIQUE DU CALENDRIER
// =================================================================
// Description: Calcule les créneaux disponibles en croisant les
//              données de Google Calendar et les blocages manuels.
// =================================================================

/**
 * Récupère les événements du calendrier Google pour une période donnée via l'API avancée.
 */
function obtenirEvenementsCalendrierPourPeriode(dateDebut, dateFin) {
  const CONFIG = getConfiguration();
  try {
    const evenements = Calendar.Events.list(CONFIG.ID_CALENDRIER, {
      timeMin: dateDebut.toISOString(),
      timeMax: dateFin.toISOString(),
      singleEvents: true,
      orderBy: 'startTime'
    });
    return evenements.items || [];
  } catch (e) {
    Logger.log(`ERREUR API Calendar: ${e.stack}`);
    return [];
  }
}

/**
 * Calcule les créneaux horaires disponibles pour une date et une durée spécifiques.
 */
function obtenirCreneauxDisponiblesPourDate(dateString, duree, idEvenementAIgnorer = null, evenementsPrecharges = null, autresCoursesPanier = []) {
  const CONFIG = getConfiguration();
  try {
    const [annee, mois, jour] = dateString.split('-').map(Number);
    
    const [heureDebut, minuteDebut] = CONFIG.HEURE_DEBUT_SERVICE.split(':').map(Number);
    const [heureFin, minuteFin] = CONFIG.HEURE_FIN_SERVICE.split(':').map(Number);
    const debutJournee = new Date(annee, mois - 1, jour, heureDebut, minuteDebut);
    const finJournee = new Date(annee, mois - 1, jour, heureFin, minuteFin);

    const estAdmin = (Session.getActiveUser().getEmail().toLowerCase() === CONFIG.ADMIN_EMAIL.toLowerCase());

    if (!estAdmin && new Date(dateString + "T23:59:59") < new Date().setHours(0,0,0,0)) {
        return [];
    }

    const evenementsCalendrier = evenementsPrecharges 
        ? evenementsPrecharges.filter(e => formaterDateEnYYYYMMDD(new Date(e.start.dateTime || e.start.date)) === dateString) 
        : obtenirEvenementsCalendrierPourPeriode(debutJournee, finJournee);
    
    const plagesManuellementBloquees = obtenirPlagesBloqueesPourDate(debutJournee);
    
    const reservationsPanier = autresCoursesPanier.map(item => {
        const [itemHeureDebut, itemMinuteDebut] = item.startTime.split('h').map(Number);
        const dureeNumerique = parseFloat(item.duree);
        const debut = new Date(annee, mois - 1, jour, itemHeureDebut, itemMinuteDebut);
        if (isNaN(debut.getTime()) || isNaN(dureeNumerique)) { return null; }
        const fin = new Date(debut.getTime() + dureeNumerique * 60000);
        return { start: { dateTime: debut.toISOString() }, end: { dateTime: fin.toISOString() }, id: `panier-${item.id}` };
    }).filter(Boolean);

    const indisponibilitesNormalisees = [
      ...evenementsCalendrier.map(e => ({ id: e.id, start: new Date(e.start.dateTime || e.start.date), end: new Date(e.end.dateTime || e.end.date) })),
      ...reservationsPanier.map(e => ({ id: e.id, start: new Date(e.start.dateTime), end: new Date(e.end.dateTime) })),
      ...plagesManuellementBloquees.map((e, i) => ({ id: `manuel-${i}`, start: e.start, end: e.end }))
    ].filter(indispo => !isNaN(indispo.start.getTime()) && !isNaN(indispo.end.getTime()));

    const creneauxPotentiels = [];
    let heureActuelle = new Date(debutJournee);
    const idPropreAIgnorer = idEvenementAIgnorer ? idEvenementAIgnorer.split('@')[0] : null;

    // Règle: Bloquer les créneaux passés et appliquer le tampon par rapport à l'heure actuelle
    if (!estAdmin) {
      const tempsMinimum = new Date(new Date().getTime() + CONFIG.DUREE_TAMPON_MINUTES * 60000);
      if (heureActuelle < tempsMinimum) {
        heureActuelle = new Date(tempsMinimum);
        const minutes = heureActuelle.getMinutes();
        const surplus = minutes % CONFIG.INTERVALLE_CRENEAUX_MINUTES;
        if (surplus > 0) {
          heureActuelle.setMinutes(minutes + (CONFIG.INTERVALLE_CRENEAUX_MINUTES - surplus));
          heureActuelle.setSeconds(0, 0);
        }
      }
    }

    while (heureActuelle < finJournee) {
      const debutCreneau = new Date(heureActuelle);
      const finCreneau = new Date(debutCreneau.getTime() + duree * 60000);

      if (finCreneau > finJournee) break;
      
      let estOccupe = false;
      for (const indispo of indisponibilitesNormalisees) {
        if (indispo.id === idPropreAIgnorer) continue;
        
        const debutIndispo = indispo.start;
        const finIndispoAvecTampon = new Date(indispo.end.getTime() + CONFIG.DUREE_TAMPON_MINUTES * 60000);

        if (debutCreneau < finIndispoAvecTampon && finCreneau > debutIndispo) {
          estOccupe = true;
          break;
        }
      }
      
      if (!estOccupe) {
        creneauxPotentiels.push(debutCreneau);
      }
      
      heureActuelle.setMinutes(heureActuelle.getMinutes() + CONFIG.INTERVALLE_CRENEAUX_MINUTES);
    }
    
    return creneauxPotentiels.map(creneau => formaterDateEnHHMM(creneau));
    
  } catch (e) {
    Logger.log(`Erreur dans obtenirCreneauxDisponiblesPourDate pour ${dateString}: ${e.stack}`);
    return [];
  }
}

/**
 * Renvoie la disponibilité de chaque jour du mois pour l'affichage du calendrier public.
 */
function obtenirDonneesCalendrierPublic(mois, annee) {
  const CONFIG = getConfiguration();
  const cache = CacheService.getScriptCache();
  const cleCache = `dispo_${annee}_${mois}`;
  const donneesEnCache = cache.get(cleCache);

  if (donneesEnCache) {
    return JSON.parse(donneesEnCache);
  }

  try {
    if (typeof mois === 'string') mois = Number(mois);
    if (typeof annee === 'string') annee = Number(annee);
    if (!mois || !annee || mois < 1 || mois > 12) {
      throw new Error("Mois ou année invalide.");
    }

    const disponibilite = {};
    const dateDebutMois = new Date(annee, mois - 1, 1);
    const dateFinMois = new Date(annee, mois, 0);
    const evenementsDuMois = obtenirEvenementsCalendrierPourPeriode(dateDebutMois, new Date(annee, mois, 1));
    
    const maintenant = new Date();
    const dateAujourdhuiString = formaterDateEnYYYYMMDD(maintenant);
    const [heureFin, minuteFin] = CONFIG.HEURE_FIN_SERVICE.split(':').map(Number);

    for (let d = new Date(dateDebutMois); d <= dateFinMois; d.setDate(d.getDate() + 1)) {
      const dateString = formaterDateEnYYYYMMDD(d);
      
      if (d.getDay() === 0) { // Dimanche
        disponibilite[dateString] = { disponibles: 0, total: 0 };
        continue;
      }
      
      const finServiceJour = new Date(d);
      finServiceJour.setHours(heureFin, minuteFin, 0, 0);

      if (dateString < dateAujourdhuiString || (dateString === dateAujourdhuiString && maintenant > finServiceJour)) {
          disponibilite[dateString] = { disponibles: 0, total: 0 };
          continue;
      }

      const creneaux = obtenirCreneauxDisponiblesPourDate(dateString, CONFIG.DUREE_BASE, null, evenementsDuMois);
      
      const debutServiceJour = new Date(d);
      debutServiceJour.setHours(...CONFIG.HEURE_DEBUT_SERVICE.split(':').map(Number));
      const totalCreneauxPossibles = Math.floor(((finServiceJour - debutServiceJour) / 60000) / CONFIG.INTERVALLE_CRENEAUX_MINUTES);
      
      disponibilite[dateString] = { disponibles: creneaux.length, total: totalCreneauxPossibles > 0 ? totalCreneauxPossibles : 1 };
    }

    const resultat = { disponibilite: disponibilite };
    cache.put(cleCache, JSON.stringify(resultat), 7200); // Cache de 2 heures

    return resultat;
  } catch (e) {
    Logger.log(`ERREUR dans obtenirDonneesCalendrierPublic: ${e.toString()}`);
    return { disponibilite: {} };
  }
}


// La chronologie du bien (onglet Bien de la page projet) : le calcul, sans
// l'affichage, pour qu'il se teste hors du navigateur.

import { friseDuProjet } from "./frise-bail.js";

// Comme SecteurChiffres : l'espace fine devient insécable ordinaire.
const format = new Intl.NumberFormat("fr-FR");
const nf = { format: (n) => format.format(n).replace(/\u202f/g, "\u00a0") };

const MOIS = ["janv.", "févr.", "mars", "avr.", "mai", "juin", "juil.", "août", "sept.", "oct.", "nov.", "déc."];

/** Une date lisible : « 12 mars 2019 », ou l'année seule quand on n'a qu'elle. */
export function libelleDate(e) {
  if (e.anneeSeule) return String(e.annee);
  const d = new Date(`${e.iso}T12:00:00`);
  return `${d.getDate()} ${MOIS[d.getMonth()]} ${d.getFullYear()}`;
}

const isoDe = (v) => (v && /^\d{4}-\d{2}-\d{2}/.test(String(v)) ? String(v).slice(0, 10) : null);
const anneeDe = (v) => {
  const m = String(v ?? "").match(/\b(1[5-9]\d{2}|20\d{2})\b/);
  return m ? Number(m[1]) : null;
};

/**
 * Pure : les événements du bien, triés, chacun passé ou à venir.
 * @returns {Array<{cle, iso, annee, anneeSeule, titre, detail, futur, alerte}>}
 */
export function evenementsDuBien(project, friseLue = null, aujourdhui = new Date()) {
  const liste = [];
  const ajouter = (cle, quand, titre, detail = null, alerte = false) => {
    const iso = isoDe(quand);
    const annee = iso ? Number(iso.slice(0, 4)) : anneeDe(quand);
    if (!annee) return;
    liste.push({ cle, iso: iso || `${annee}-07-01`, annee, anneeSeule: !iso, titre, detail, alerte });
  };

  // Les murs.
  const construction = anneeDe(project.type_construction);
  if (construction) ajouter("construction", construction, "Construction de l'immeuble");
  if (project.derniere_vente_annee) {
    const prix = Number(project.derniere_vente_prix) > 0 ? `${nf.format(Number(project.derniere_vente_prix))} €` : null;
    ajouter("vente", project.derniere_vente_annee, "Dernière vente des murs", prix);
  } else if (project.detenu_depuis) {
    ajouter("detenu", project.detenu_depuis, "Achat des murs par le propriétaire actuel");
  }

  // Le locataire et son fonds.
  if (project.locataire_depuis) ajouter("locataire", project.locataire_depuis, `Arrivée du locataire${project.nom_locataire ? ` (${project.nom_locataire})` : ""}`);
  const surPlace = (project.transactions_fonds?.transactions || project.transactions_fonds?.pertinentes || []).filter((t) => t?.sur_place && t.date);
  const vues = new Set();
  for (const t of surPlace) {
    if (vues.has(t.date)) continue;
    vues.add(t.date);
    const prix = Number(t.prix) > 0 ? `${nf.format(Number(t.prix))} €` : null;
    ajouter(`cession-${t.date}`, t.date, "Cession du fonds de commerce", [t.activite, prix].filter(Boolean).join(" · ") || null);
  }

  // Les assemblées générales enregistrées.
  for (const ag of project.assemblees_generales || []) {
    if (!ag?.annee) continue;
    const votees = String(ag.resolutions_votees || "").split(/\n|;/).map((x) => x.trim()).filter(Boolean);
    ajouter(`ag-${ag.annee}`, ag.annee, "Assemblée générale", votees.length ? `${votees.length} résolution${votees.length > 1 ? "s" : ""} votée${votees.length > 1 ? "s" : ""}` : null);
  }

  // Le bail : son début, ses échéances triennales, sa fin.
  const frise = friseDuProjet(project, friseLue);
  if (frise?.debut) {
    // Un début pris sur l'arrivée du locataire est déjà sur la frise.
    if (frise.debutVient !== "arrivee") ajouter("bail-debut", frise.debut, "Début du bail en cours");
    const debut = new Date(`${frise.debut}T12:00:00`);
    const fin = frise.fin ? new Date(`${frise.fin}T12:00:00`) : null;
    for (let n = 3; n < 30; n += 3) {
      const t = new Date(debut);
      t.setFullYear(debut.getFullYear() + n);
      if (fin && t >= fin) break;
      if (!fin && n > 9) break;
      if (t < aujourdhui) continue;
      // Le locataire peut donner congé à chaque échéance triennale : c'est un risque.
      ajouter(`triennale-${n}`, t.toISOString().slice(0, 10), `Échéance triennale (${n} ans)`, "Le locataire peut donner congé", true);
    }
  } else if (frise?.fin) {
    // Sans date de début, on suppose le bail commercial classique de 9 ans :
    // ses échéances tombent 6 et 3 ans avant la fin, et on le dit.
    const fin = new Date(`${frise.fin}T12:00:00`);
    for (const avant of [6, 3]) {
      const t = new Date(fin);
      t.setFullYear(fin.getFullYear() - avant);
      if (t < aujourdhui) continue;
      ajouter(`triennale-${9 - avant}`, t.toISOString().slice(0, 10), `Échéance triennale (${9 - avant} ans)`, "Le locataire peut donner congé · bail de 9 ans supposé", true);
    }
  }
  if (frise?.fin) ajouter("bail-fin", frise.fin, "Fin du bail", "Renouvellement ou départ du locataire", true);

  const maintenant = aujourdhui.toISOString().slice(0, 10);
  return liste
    .map((e) => ({ ...e, futur: e.iso > maintenant }))
    .sort((a, b) => a.iso.localeCompare(b.iso));
}


// La matrice : une ligne par document, une colonne par question.
//
// Ce que Hebbia appelle Matrix, pour les murs de commerce. Chaque cellule
// est la réponse d'un document à une question, avec sa page et sa citation,
// ou « — » si le document ne dit rien. La ligne de synthèse est calculée par
// le code : elle compare les cellules d'une colonne selon la règle de la
// question et pose un statut — Cohérent, Contradictoire, Manquant, Hors
// critère, À vérifier. Le modèle lit ; il ne juge pas.
//
// Le gabarit « Murs de commerce » est la grille par défaut ; il s'enrichit
// quand l'équipe ajoute une colonne et l'enregistre. Au bout de vingt
// dossiers, la grille est la méthode Klocka.

import { Records } from '../db.js';
import { montants, surfaces, dates } from './dossier-lecture.js';

// ---------------------------------------------------------------------------
// Le gabarit par défaut
// ---------------------------------------------------------------------------

// Règles de cohérence, par nom. Chacune reçoit les cellules renseignées d'une
// colonne (avec leur document) et le contexte du dossier, et rend un statut.
//   identique         : toutes les sources disent la même chose (dates, parties)
//   surface           : nombres à ±3 %
//   loyer             : quittances ×12 = loyer du bail ± 5 % ; l'annonce compte
//   presence          : au moins une source doit répondre, sinon Manquant
//   presence_ou_hors  : absent = Hors critère (caution, travaux non provisionnés)
//   permis_par        : activité du bail contre RCP → À vérifier si les deux existent
//   rendement         : recalculé ≠ affiché de plus de 0,3 pt → Contradictoire
//   information       : on relève, on ne juge pas
export const GABARIT_MURS = {
  id: 'murs-de-commerce',
  nom: 'Murs de commerce',
  version: 1,
  colonnes: [
    // Bien
    { id: 'adresse', bloc: 'Bien', libelle: 'Adresse / lots', question: "Adresse du bien et lots concernés (numéros de lots, étage, tantièmes s'ils sont dits)", regle: 'identique', criticite: 'haute' },
    { id: 'surface', bloc: 'Bien', libelle: 'Surface', question: 'Surface du local en m² (Carrez, utile ou déclarée — dire laquelle)', regle: 'surface', criticite: 'haute' },
    { id: 'destination', bloc: 'Bien', libelle: 'Destination', question: "Activité autorisée ou exercée dans le local (destination du bail, activités permises ou interdites par le règlement)", regle: 'permis_par', criticite: 'haute' },
    { id: 'diagnostics', bloc: 'Bien', libelle: 'Diagnostics', question: 'Diagnostics présents (DPE, amiante, ERP, termites, plomb, électricité) avec leur date et leur conclusion', regle: 'presence', criticite: 'moyenne' },
    // Bail
    { id: 'parties', bloc: 'Bail', libelle: 'Parties', question: 'Bailleur et preneur (dénomination, forme, représentant)', regle: 'identique', criticite: 'moyenne' },
    { id: 'dates_bail', bloc: 'Bail', libelle: 'Dates du bail', question: 'Date de prise d\'effet et date de fin du bail en cours (jour/mois/année)', regle: 'identique', criticite: 'haute' },
    { id: 'duree', bloc: 'Bail', libelle: 'Durée', question: 'Durée du bail (années) et périodes triennales', regle: 'identique', criticite: 'moyenne' },
    { id: 'resiliation', bloc: 'Bail', libelle: 'Résiliation triennale', question: 'Faculté de résiliation triennale du preneur : maintenue, écartée, ou aménagée', regle: 'information', criticite: 'moyenne' },
    { id: 'loyer', bloc: 'Bail', libelle: 'Loyer HT/an', question: 'Loyer annuel hors taxes hors charges, et sa périodicité de paiement (mensuel/trimestriel)', regle: 'loyer', criticite: 'haute' },
    { id: 'indexation', bloc: 'Bail', libelle: 'Indexation', question: "Indice d'indexation du loyer (ILC, ILAT, ICC), indice de base et date de révision", regle: 'information', criticite: 'moyenne' },
    { id: 'charges', bloc: 'Bail', libelle: 'Charges refacturées', question: 'Charges, taxes et travaux à la charge du preneur (taxe foncière, TEOM, charges de copropriété, article 606)', regle: 'information', criticite: 'haute' },
    { id: 'depot', bloc: 'Bail', libelle: 'Dépôt de garantie', question: 'Montant du dépôt de garantie et son équivalent en mois de loyer', regle: 'presence', criticite: 'moyenne' },
    { id: 'pas_de_porte', bloc: 'Bail', libelle: 'Pas-de-porte', question: "Pas-de-porte ou droit d'entrée versé, montant", regle: 'information', criticite: 'basse' },
    { id: 'caution', bloc: 'Bail', libelle: 'Caution', question: 'Caution personnelle ou garantie bancaire du preneur (qui, combien, durée)', regle: 'presence_ou_hors', criticite: 'haute' },
    { id: 'travaux_conformite', bloc: 'Bail', libelle: 'Travaux de conformité', question: 'Travaux de mise en conformité ou d\'aménagement prévus, et qui les paie', regle: 'information', criticite: 'moyenne' },
    { id: 'etat_lieux', bloc: 'Bail', libelle: 'État des lieux', question: "État des lieux d'entrée : établi, date, mention", regle: 'presence', criticite: 'moyenne' },
    { id: 'resolutoire', bloc: 'Bail', libelle: 'Clause résolutoire', question: 'Clause résolutoire : conditions et délai', regle: 'information', criticite: 'basse' },
    { id: 'cession', bloc: 'Bail', libelle: 'Cession / sous-location', question: 'Conditions de cession du bail et de sous-location (libre, agrément, interdite)', regle: 'information', criticite: 'haute' },
    // Locataire
    { id: 'creation', bloc: 'Locataire', libelle: 'Création', question: "Date de création de la société preneuse et son numéro d'immatriculation", regle: 'information', criticite: 'basse' },
    { id: 'capital', bloc: 'Locataire', libelle: 'Capital', question: 'Capital social de la société preneuse', regle: 'information', criticite: 'moyenne' },
    { id: 'dirigeants', bloc: 'Locataire', libelle: 'Dirigeants', question: 'Dirigeants de la société preneuse', regle: 'information', criticite: 'basse' },
    { id: 'origine_fonds', bloc: 'Locataire', libelle: 'Origine du fonds', question: 'Origine du fonds de commerce (création, acquisition, date, prix)', regle: 'information', criticite: 'basse' },
    { id: 'paiements', bloc: 'Locataire', libelle: 'Régularité des paiements', question: 'Loyers réglés : périodes couvertes par les quittances, retards ou impayés mentionnés', regle: 'quittances', criticite: 'haute' },
    // Copropriété
    { id: 'tantiemes', bloc: 'Copropriété', libelle: 'Tantièmes', question: 'Tantièmes du lot (généraux et spéciaux) sur le total', regle: 'identique', criticite: 'moyenne' },
    { id: 'charges_copro', bloc: 'Copropriété', libelle: 'Charges annuelles', question: 'Charges de copropriété annuelles du lot (budget, appels de fonds)', regle: 'information', criticite: 'moyenne' },
    { id: 'restrictions', bloc: 'Copropriété', libelle: 'Restrictions RCP', question: 'Restrictions du règlement de copropriété qui touchent le local (activités, enseignes, horaires, nuisances)', regle: 'information', criticite: 'haute' },
    { id: 'travaux_votes', bloc: 'Copropriété', libelle: 'Travaux votés', question: 'Travaux votés ou en discussion en assemblée, montant, répartition, échéance', regle: 'presence_ou_hors', criticite: 'haute' },
    { id: 'procedures', bloc: 'Copropriété', libelle: 'Procédures', question: 'Procédures, contentieux ou impayés dans la copropriété', regle: 'information', criticite: 'haute' },
    // Prix & flux
    { id: 'prix', bloc: 'Prix & flux', libelle: 'Prix', question: 'Prix de vente (FAI ou net vendeur, honoraires)', regle: 'identique', criticite: 'haute' },
    { id: 'rendement_affiche', bloc: 'Prix & flux', libelle: 'Rendement affiché', question: 'Rendement annoncé par le vendeur ou l\'agent (%)', regle: 'rendement', criticite: 'haute' },
    { id: 'charges_non_recup', bloc: 'Prix & flux', libelle: 'Charges non récupérables', question: 'Charges qui restent au bailleur (non refacturées au preneur)', regle: 'information', criticite: 'moyenne' },
    { id: 'taxe_fonciere', bloc: 'Prix & flux', libelle: 'Taxe foncière', question: 'Montant de la taxe foncière et qui la paie', regle: 'presence', criticite: 'moyenne' },
  ],
};

export const STATUTS = ['coherent', 'contradictoire', 'manquant', 'hors_critere', 'a_verifier'];
export const LIBELLE_STATUT = {
  coherent: 'Cohérent', contradictoire: 'Contradictoire', manquant: 'Manquant', hors_critere: 'Hors critère', a_verifier: 'À vérifier',
};

/** Le gabarit en vigueur : celui enregistré, sinon celui du code. */
export function gabarit() {
  const enregistre = Records.filter('TemplateMatrice', { cle: GABARIT_MURS.id })[0];
  if (!enregistre) return { ...GABARIT_MURS, enregistre_id: null };
  return { ...GABARIT_MURS, ...enregistre.gabarit, enregistre_id: enregistre.id };
}

/** Une colonne de plus au gabarit, et une version de plus. */
export function ajouterColonneGabarit(colonne, user) {
  const g = gabarit();
  if (g.colonnes.some((c) => c.id === colonne.id)) return g;
  const suivant = {
    ...g,
    version: (g.version || 1) + 1,
    colonnes: [...g.colonnes, colonne],
    historique: [...(g.historique || []), { version: (g.version || 1) + 1, le: new Date().toISOString(), par: user?.email || null, ajout: colonne.id }].slice(-50),
  };
  const { enregistre_id, ...gab } = suivant;
  if (enregistre_id) Records.update('TemplateMatrice', enregistre_id, { gabarit: gab });
  else Records.create('TemplateMatrice', { cle: GABARIT_MURS.id, gabarit: gab }, user?.email);
  return suivant;
}

// ---------------------------------------------------------------------------
// Remplir la matrice : une lecture par document, toutes les questions
// ---------------------------------------------------------------------------

const VIDE = (r) => !r || /^(—|-|n\/a|non mentionn|non renseign|absent|aucune? mention|ne (dit|mentionne|précise) rien|sans objet)/i.test(String(r).trim());

function brutDe(dealId) {
  return Records.filter('Deal', { deal_id: dealId })[0] || null;
}

/** Remplit (ou complète) la matrice du dossier : chaque document, toutes les colonnes. */
export async function remplirMatrice(dealId, { uploadDir, user, seulementColonnes = null, seulementDocuments = null, onProgres = null } = {}) {
  const brut = brutDe(dealId);
  if (!brut) return { ok: false, error: 'Dossier introuvable' };
  const g = gabarit();
  const colonnes = (brut.matrice?.colonnes_locales || []).length
    ? [...g.colonnes, ...brut.matrice.colonnes_locales]
    : g.colonnes;
  const cibles = seulementColonnes ? colonnes.filter((c) => seulementColonnes.includes(c.id)) : colonnes;

  const { chargerPieces } = await import('./espace.js');
  const { extraireDonneesDocument } = await import('../llm.js');
  const { mesurer } = await import('../llm-couts.js');
  const docs = (brut.documents_espace || []).filter((d) => !seulementDocuments || seulementDocuments.includes(d.id));
  const pieces = chargerPieces(brut, docs.map((d) => d.id), uploadDir, true);

  const lignesExistantes = new Map((brut.matrice?.lignes || []).map((l) => [l.document_id, l]));
  const lignes = [];
  const ecrire = (partiel) => {
    const courant = brutDe(dealId);
    const autres = (courant?.matrice?.lignes || []).filter((l) => !lignes.some((x) => x.document_id === l.document_id));
    Records.update('Deal', brut.id, {
      matrice: {
        ...(courant?.matrice || {}),
        gabarit_version: g.version,
        colonnes_locales: courant?.matrice?.colonnes_locales || [],
        lignes: [...lignes, ...autres],
        revue: courant?.matrice?.revue || {},
        ...(partiel ? {} : { rempli_le: new Date().toISOString(), rempli_par: user?.email || null }),
      },
    });
  };
  let fait = 0;
  const groupe = `matrice:${dealId}:${Date.now()}`;
  for (const p of pieces) {
    const existante = lignesExistantes.get(p.id) || { document_id: p.id, document_nom: p.nom, document_url: p.url, categorie: p.categorie, cellules: {} };
    let cellules = { ...(existante.cellules || {}) };
    try {
      const { resultat: { lignes: reponses } } = await mesurer({ operation: 'matrice', par: user?.email || null, sur: dealId, groupe, libelle: p.nom }, () => extraireDonneesDocument({
        ...p,
        elements: cibles.map((c) => c.question),
        statuts: ['Conforme', 'À vérifier', 'Point de vigilance', 'Non renseigné'],
      }));
      cibles.forEach((c, i) => {
        const r = reponses[i];
        const vide = !r || VIDE(r.constat);
        cellules[c.id] = vide
          ? { reponse: null, page: null, citation: null }
          : { reponse: String(r.constat).slice(0, 400), page: r.page || null, citation: r.citation || null, statut_ligne: r.statut || null, commentaire: r.commentaire || null };
      });
      existante.erreur = null;
    } catch (e) {
      existante.erreur = e?.message || 'Lecture impossible';
    }
    lignes.push({ ...existante, categorie: p.categorie, cellules, lu_le: new Date().toISOString() });
    fait += 1;
    onProgres?.({ fait, total: pieces.length, document: p.nom });
    ecrire(true);
  }
  ecrire(false);
  return { ok: true, matrice: lireMatrice(dealId) };
}

// Le remplissage tourne en tâche de fond ; l'écran interroge l'avancement.
const travaux = new Map();
export function lancerRemplissage(dealId, opts = {}) {
  const enCours = travaux.get(dealId);
  if (enCours?.etat === 'en_cours') return enCours;
  const travail = { etat: 'en_cours', fait: 0, total: null, document: null, erreur: null, demarre_le: new Date().toISOString() };
  travaux.set(dealId, travail);
  remplirMatrice(dealId, { ...opts, onProgres: (p) => Object.assign(travail, p) })
    .then((r) => { travail.etat = r.ok ? 'pret' : 'erreur'; travail.erreur = r.ok ? null : r.error; })
    .catch((e) => { travail.etat = 'erreur'; travail.erreur = e?.message || 'Remplissage impossible'; });
  return travail;
}
export const etatRemplissage = (dealId) => travaux.get(dealId) || null;

// ---------------------------------------------------------------------------
// La ligne de synthèse : le code compare, selon la règle de la question
// ---------------------------------------------------------------------------

const norm = (s) => String(s || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9]+/g, ' ').trim();
const ecart = (a, b) => Math.abs(a - b) / Math.max(a, b);
const val = (champ) => (champ && champ.absent === false ? champ.valeur : null);

function anneesDe(texte) {
  return [...new Set(dates(texte).map((d) => d.annee).filter((a) => a >= 1990 && a <= 2100))];
}

/** Le statut d'une colonne, d'après ses cellules et la règle de la question. */
export function statutColonne(colonne, cellules, contexte = {}) {
  const pleines = cellules.filter((c) => c.reponse);
  const regle = colonne.regle || 'information';
  const detail = (t) => ({ statut: 'coherent', detail: t });

  if (!pleines.length) {
    // L'annonce et la pré-analyse sont une source, mais une source qu'aucune pièce ne confirme.
    if (contexte.annonce?.[colonne.id]) return { statut: 'a_verifier', detail: `Seule l'annonce le dit : ${contexte.annonce[colonne.id]} — aucune pièce ne le confirme.` };
    if (regle === 'presence_ou_hors') return { statut: 'hors_critere', detail: 'Aucun document ne le mentionne : hors critère tant que ce n\'est pas fourni.' };
    return { statut: 'manquant', detail: 'Aucun document ne répond.' };
  }

  switch (regle) {
    case 'identique': {
      // Sur les dates : les années de fin doivent concorder.
      const annees = pleines.map((c) => ({ a: anneesDe(c.reponse), doc: c.document_nom })).filter((x) => x.a.length);
      if (annees.length >= 2) {
        const fins = [...new Set(annees.map((x) => Math.max(...x.a)))];
        if (fins.length > 1) return { statut: 'contradictoire', detail: `Échéances différentes : ${fins.join(' / ')}.` };
        return detail(`Même échéance (${fins[0]}) dans ${annees.length} documents.`);
      }
      if (pleines.length === 1) return detail('Une seule source.');
      const textes = [...new Set(pleines.map((c) => norm(c.reponse).slice(0, 60)))];
      return textes.length > 1 && pleines.length > 1
        ? { statut: 'a_verifier', detail: `${pleines.length} sources, formulations différentes — à recouper.` }
        : detail(`${pleines.length} sources concordantes.`);
    }
    case 'surface': {
      const nombres = pleines.map((c) => ({ v: surfaces(c.reponse)[0]?.valeur, doc: c.document_nom })).filter((x) => x.v);
      if (contexte.surface_annoncee) nombres.push({ v: contexte.surface_annoncee, doc: 'Annonce' });
      if (nombres.length < 2) return detail(nombres.length ? `${nombres[0].v} m² (une source).` : 'Surface citée sans chiffre.');
      const min = Math.min(...nombres.map((x) => x.v));
      const max = Math.max(...nombres.map((x) => x.v));
      const e = ecart(min, max);
      if (e > 0.03) return { statut: 'contradictoire', detail: `Écart ${(e * 100).toFixed(1)} % : ${nombres.map((x) => `${x.v} m² (${x.doc})`).join(' / ')}.` };
      return detail(`Écart ${(e * 100).toFixed(1)} % — cohérent.`);
    }
    case 'loyer': {
      const annuels = [];
      for (const c of pleines) {
        const liste = montants(c.reponse);
        if (!liste.length) continue;
        const dit = (m, x) => m.test(x.avant) || m.test(x.extrait);
        let v = null;
        const an = liste.find((x) => dit(/annuel|par an|\/\s?an\b/i, x));
        const mois = liste.find((x) => dit(/mois|mensuel/i, x));
        if (an) v = an.valeur;
        else if (mois) v = mois.valeur * 12;
        else if (/quittance/i.test(c.categorie || '') || /janvier|fevrier|février|mars|avril|mai|juin|juillet|aout|août|septembre|octobre|novembre|decembre|décembre/i.test(c.reponse)) v = liste[0].valeur * 12;
        else v = liste[0].valeur;
        annuels.push({ v, doc: c.document_nom });
      }
      if (contexte.loyer_annonce) annuels.push({ v: contexte.loyer_annonce, doc: 'Annonce' });
      if (annuels.length < 2) return detail(annuels.length ? `${Math.round(annuels[0].v).toLocaleString('fr-FR')} € (une source).` : 'Loyer cité sans montant.');
      const min = Math.min(...annuels.map((x) => x.v));
      const max = Math.max(...annuels.map((x) => x.v));
      const e = ecart(min, max);
      if (e > 0.05) return { statut: 'contradictoire', detail: `Écart ${(e * 100).toFixed(1)} % : ${annuels.map((x) => `${Math.round(x.v).toLocaleString('fr-FR')} € (${x.doc})`).join(' / ')}.` };
      return detail(`Écart ${(e * 100).toFixed(1)} % — cohérent (indexation comprise).`);
    }
    case 'presence':
    case 'presence_ou_hors': {
      const negatif = pleines.every((c) => /^\s*(non\b|aucun|pas de|néant|inconnu|absent|sans )|non (etabli|établi|mentionn|précisé|renseigné)|ne figure pas|n'est pas (mentionn|précisé|indiqué)/i.test(c.reponse));
      if (negatif) return { statut: regle === 'presence_ou_hors' ? 'hors_critere' : 'manquant', detail: `Les documents disent l'absence : ${pleines[0].reponse.slice(0, 90)}` };
      return detail(`Présent dans ${pleines.length} document${pleines.length > 1 ? 's' : ''}.`);
    }
    case 'permis_par': {
      const bail = pleines.find((c) => /bail/i.test(c.categorie || ''));
      const rcp = pleines.find((c) => /copropri|rcp/i.test(c.categorie || ''));
      if (bail && rcp) return { statut: 'a_verifier', detail: `Activité du bail (${bail.reponse.slice(0, 50)}) à confronter au règlement (${rcp.reponse.slice(0, 50)}).` };
      return detail(pleines.length > 1 ? `${pleines.length} sources.` : 'Une seule source.');
    }
    case 'rendement': {
      const affiche = pleines.map((c) => Number(String(c.reponse).match(/(\d+(?:[.,]\d+)?)\s*%/)?.[1]?.replace(',', '.'))).find((n) => Number.isFinite(n));
      const recalc = contexte.rendement_recalcule;
      if (affiche && recalc) {
        const d = Math.abs(affiche - recalc);
        if (d > 0.3) return { statut: 'contradictoire', detail: `Affiché ${affiche.toFixed(2)} % contre ${recalc.toFixed(2)} % recalculé (loyer / prix).` };
        return detail(`Affiché ${affiche.toFixed(2)} %, recalculé ${recalc.toFixed(2)} %.`);
      }
      return detail(affiche ? `Affiché ${affiche.toFixed(2)} % — pas de quoi recalculer.` : 'Rendement cité sans chiffre.');
    }
    case 'quittances': {
      const impaye = pleines.some((c) => /impay|retard|relance|mise en demeure/i.test(c.reponse));
      if (impaye) return { statut: 'a_verifier', detail: 'Retards ou impayés mentionnés.' };
      return detail(`Paiements documentés (${pleines.length} source${pleines.length > 1 ? 's' : ''}).`);
    }
    default:
      return detail(`${pleines.length} source${pleines.length > 1 ? 's' : ''}.`);
  }
}

/** La matrice lue : colonnes, lignes, et la ligne de synthèse calculée. */
export function lireMatrice(dealId) {
  const brut = brutDe(dealId);
  if (!brut) return null;
  const g = gabarit();
  const colonnes = [...g.colonnes, ...(brut.matrice?.colonnes_locales || [])];
  const lignes = brut.matrice?.lignes || [];
  const lot = brut.lots?.[0]?.lot || {};
  const loyerAnnonce = val(lot.loyer_annuel_ht_hc);
  const prix = val(lot.prix_fai);
  const recalc = loyerAnnonce && prix ? (loyerAnnonce / prix) * 100 : null;
  const contexte = {
    loyer_annonce: loyerAnnonce,
    surface_annoncee: val(lot.surface_m2),
    rendement_recalcule: recalc,
    annonce: {
      prix: prix ? `${Math.round(prix).toLocaleString('fr-FR')} € FAI` : null,
      rendement_affiche: recalc ? `${recalc.toFixed(2)} % (loyer annoncé / prix FAI)` : null,
      loyer: loyerAnnonce ? `${Math.round(loyerAnnonce).toLocaleString('fr-FR')} € HT/an` : null,
      surface: lot.surface_m2 ? `${lot.surface_m2} m²` : null,
    },
  };
  const synthese = {};
  for (const c of colonnes) {
    const cellules = lignes.map((l) => ({ ...(l.cellules?.[c.id] || {}), document_nom: l.document_nom, document_id: l.document_id, categorie: l.categorie }));
    synthese[c.id] = { ...statutColonne(c, cellules, contexte), revue: brut.matrice?.revue?.[c.id] || null };
  }
  const anomalies = colonnes
    .filter((c) => synthese[c.id].statut !== 'coherent')
    .map((c) => ({ colonne: c, ...synthese[c.id] }));
  return {
    gabarit: { id: g.id, nom: g.nom, version: g.version },
    colonnes,
    lignes,
    synthese,
    anomalies,
    remplissage: travaux.get(dealId) || null,
    rempli_le: brut.matrice?.rempli_le || null,
    documents: (brut.documents_espace || []).map((d) => ({ id: d.id, nom: d.nom, categorie: d.categorie || 'Autre', url: d.url })),
    a_classer: (brut.documents_espace || []).filter((d) => !d.categorie).length,
  };
}

// ---------------------------------------------------------------------------
// La revue : confirmé ou faux positif, avec un mot
// ---------------------------------------------------------------------------

export function reviser(dealId, colonneId, { verdict, commentaire, user }) {
  const brut = brutDe(dealId);
  if (!brut) return { ok: false, error: 'Dossier introuvable' };
  if (!['confirme', 'faux_positif', null].includes(verdict)) return { ok: false, error: 'Verdict inconnu' };
  const revue = { ...(brut.matrice?.revue || {}) };
  if (verdict) revue[colonneId] = { verdict, commentaire: commentaire || null, par: user?.email || null, le: new Date().toISOString() };
  else delete revue[colonneId];
  Records.update('Deal', brut.id, { matrice: { ...(brut.matrice || {}), revue } });
  // La mémoire : les faux positifs, colonne par colonne, pour ajuster la règle.
  if (verdict === 'faux_positif') {
    Records.create('MemoireMatrice', { colonne: colonneId, deal_id: dealId, commentaire: commentaire || null, par: user?.email || null, le: new Date().toISOString() });
  }
  return { ok: true };
}

/** Une colonne locale au dossier (et, si on le demande, au gabarit). */
export function ajouterColonne(dealId, colonne, { enregistrerGabarit = false, user } = {}) {
  const brut = brutDe(dealId);
  if (!brut) return { ok: false, error: 'Dossier introuvable' };
  const id = colonne.id || `q_${Date.now().toString(36)}`;
  const propre = {
    id,
    bloc: colonne.bloc || 'Questions',
    libelle: String(colonne.libelle || colonne.question || '').slice(0, 60),
    question: String(colonne.question || '').slice(0, 300),
    regle: STATUTS_REGLES.includes(colonne.regle) ? colonne.regle : 'information',
    criticite: ['haute', 'moyenne', 'basse'].includes(colonne.criticite) ? colonne.criticite : 'moyenne',
  };
  if (!propre.question) return { ok: false, error: 'La question est vide.' };
  if (enregistrerGabarit) ajouterColonneGabarit(propre, user);
  else {
    const locales = [...(brut.matrice?.colonnes_locales || []).filter((c) => c.id !== id), propre];
    Records.update('Deal', brut.id, { matrice: { ...(brut.matrice || {}), colonnes_locales: locales } });
  }
  return { ok: true, colonne: propre };
}
const STATUTS_REGLES = ['identique', 'surface', 'loyer', 'presence', 'presence_ou_hors', 'permis_par', 'rendement', 'quittances', 'information'];

// ---------------------------------------------------------------------------
// Les livrables : depuis la grille validée, jamais depuis les documents bruts
// ---------------------------------------------------------------------------

const QUESTION_VENDEUR = {
  contradictoire: (c, s) => `${c.libelle} : les documents ne concordent pas (${s.detail}). Pouvez-vous nous indiquer la valeur à retenir et la pièce qui fait foi ?`,
  manquant: (c) => `${c.libelle} : aucune pièce ne l'établit. Pouvez-vous nous transmettre le document correspondant (${c.question.toLowerCase()}) ?`,
  hors_critere: (c, s) => `${c.libelle} : ${s.detail} Pouvez-vous confirmer, ou nous fournir la pièce ?`,
  a_verifier: (c, s) => `${c.libelle} : ${s.detail} Pouvez-vous préciser ?`,
};

export function livrables(dealId) {
  const m = lireMatrice(dealId);
  if (!m) return null;
  const brut = brutDe(dealId);
  const { ficheBien } = requireSync();
  const fiche = ficheBien(brut);
  // Ce qui est confirmé ; ce qui n'est pas encore revu compte aussi, marqué.
  const retenues = m.anomalies.filter((a) => a.revue?.verdict !== 'faux_positif');
  const demandes = retenues
    .filter((a) => ['manquant', 'contradictoire', 'hors_critere', 'a_verifier'].includes(a.statut))
    .sort((a, b) => ordreCriticite(a.colonne) - ordreCriticite(b.colonne))
    .map((a) => ({ colonne: a.colonne.libelle, bloc: a.colonne.bloc, statut: a.statut, confirme: a.revue?.verdict === 'confirme', texte: QUESTION_VENDEUR[a.statut]?.(a.colonne, a) || a.detail }));

  const parBloc = {};
  for (const a of retenues) (parBloc[a.colonne.bloc] ||= []).push(a);
  const note = [];
  note.push(`# ${brut.nom || brut.lots?.[0]?.synthese?.titre || 'Dossier'} — note de synthèse`);
  note.push('');
  note.push('## Le bien');
  for (const f of fiche) if (f.affiche) note.push(`- ${f.libelle} : ${f.affiche}${f.source?.document ? ` (${f.source.document}${f.source.page ? `, p. ${f.source.page}` : ''})` : ''}`);
  for (const [bloc, liste] of Object.entries(parBloc)) {
    note.push('');
    note.push(`## ${bloc}`);
    for (const a of liste) {
      const sources = m.lignes.filter((l) => l.cellules?.[a.colonne.id]?.reponse).map((l) => `${l.document_nom}${l.cellules[a.colonne.id].page ? ` p. ${l.cellules[a.colonne.id].page}` : ''}`);
      note.push(`- **${a.colonne.libelle}** — ${LIBELLE_STATUT[a.statut]}${a.revue?.verdict === 'confirme' ? ' (confirmé)' : ''} : ${a.detail}${sources.length ? ` — sources : ${sources.join(', ')}` : ''}${a.revue?.commentaire ? `\n  ${a.revue.commentaire}` : ''}`);
    }
  }
  return {
    demandes,
    demandes_texte: demandes.map((d, i) => `${i + 1}. ${d.texte}`).join('\n'),
    note: note.join('\n'),
    confirmees: retenues.filter((a) => a.revue?.verdict === 'confirme').length,
    en_attente: retenues.filter((a) => !a.revue).length,
  };
}
const ordreCriticite = (c) => ({ haute: 0, moyenne: 1, basse: 2 })[c.criticite] ?? 1;
// Import synchrone du module voisin (déjà chargé) sans cycle au chargement.
let _lecture = null;
function requireSync() {
  return _lecture;
}
import('./dossier-lecture.js').then((m) => { _lecture = m; });

// ---------------------------------------------------------------------------
// Architecture B — la fiche. Un seul objet : le bien. Les cellules de la
// matrice sont le registre de faits (champ, valeur, document, page, citation) ;
// la fiche en retient une valeur par champ, selon une règle déterministe que
// l'humain peut forcer, et déplie les preuves d'un clic.
// ---------------------------------------------------------------------------

// L'autorité d'une pièce : l'acte prime sur le bail, le bail sur le PV, le PV
// sur l'annonce. À autorité égale, la première lue.
const AUTORITE = ['Acte', 'Bail commercial', 'Avenants', 'Règlement de copropriété', 'EDD', "PV d'AG copro", 'Kbis',
  "PV d'AG preneur", 'Diagnostics', 'Taxe foncière', 'Appels de charges', 'Quittances', 'Plans & Carrez', 'Autre'];
const rangAutorite = (categorie) => { const i = AUTORITE.indexOf(categorie || 'Autre'); return i < 0 ? AUTORITE.length : i; };

// Les champs dont les réponses portent des dates qui comptent pour la frise.
const CHAMPS_DATES = new Set(['dates_bail', 'duree', 'resiliation', 'creation', 'diagnostics', 'travaux_votes', 'procedures',
  'paiements', 'travaux_conformite', 'etat_lieux', 'indexation', 'origine_fonds']);

export function lireFiche(dealId) {
  const m = lireMatrice(dealId);
  if (!m) return null;
  const brut = brutDe(dealId);
  const forcages = brut.matrice?.forcages || {};
  const blocs = [];
  const parBloc = new Map();
  const frise = [];
  const vus = new Set();

  for (const c of m.colonnes) {
    const preuves = m.lignes
      .filter((l) => l.cellules?.[c.id]?.reponse)
      .map((l) => ({
        document_id: l.document_id, document_nom: l.document_nom, document_url: l.document_url, categorie: l.categorie || 'Autre',
        reponse: l.cellules[c.id].reponse, page: l.cellules[c.id].page || null, citation: l.cellules[c.id].citation || null,
        autorite: rangAutorite(l.categorie),
      }))
      .sort((a, b) => a.autorite - b.autorite);
    const f = forcages[c.id] || null;
    let retenue = null;
    let source = null;
    if (f?.valeur) { retenue = f.valeur; source = 'forcée'; }
    else if (f?.document_id && preuves.some((p) => p.document_id === f.document_id)) { const p = preuves.find((x) => x.document_id === f.document_id); retenue = p.reponse; source = p.document_nom; }
    else if (preuves.length) { retenue = preuves[0].reponse; source = preuves[0].document_nom; }
    else if (m.synthese[c.id]?.detail?.startsWith("Seule l'annonce")) { retenue = m.synthese[c.id].detail.replace(/^Seule l'annonce le dit : /, '').replace(/ — aucune pièce.*$/, ''); source = 'annonce'; }

    const champ = {
      id: c.id, bloc: c.bloc, libelle: c.libelle, question: c.question, regle: c.regle, criticite: c.criticite,
      valeur: retenue, source, forcage: f, statut: m.synthese[c.id]?.statut || 'manquant', detail: m.synthese[c.id]?.detail || '',
      revue: m.synthese[c.id]?.revue || null, preuves,
    };
    if (!parBloc.has(c.bloc)) { parBloc.set(c.bloc, []); blocs.push({ nom: c.bloc, champs: parBloc.get(c.bloc) }); }
    parBloc.get(c.bloc).push(champ);

    if (CHAMPS_DATES.has(c.id) || c.bloc === 'Questions') {
      for (const p of preuves) {
        for (const d of dates(p.reponse)) {
          if (d.annee < 1990 || d.annee > 2060) continue;
          const cle = `${c.id}|${d.iso}|${p.document_id}`;
          if (vus.has(cle)) continue;
          vus.add(cle);
          frise.push({ iso: d.iso, champ: c.id, libelle: c.libelle, extrait: d.extrait, document_id: p.document_id, document_nom: p.document_nom,
            document_url: p.document_url, categorie: p.categorie, page: p.page, citation: p.citation, reponse: p.reponse });
        }
      }
    }
  }
  frise.sort((a, b) => a.iso.localeCompare(b.iso));

  // Les incohérences de dates : un même champ, des années de fin différentes selon les pièces.
  const tensions = [];
  for (const c of m.colonnes) {
    const evts = frise.filter((e) => e.champ === c.id);
    const parDoc = new Map();
    for (const e of evts) parDoc.set(e.document_id, Math.max(parDoc.get(e.document_id) || 0, Number(e.iso.slice(0, 4))));
    const fins = [...new Set(parDoc.values())];
    if (fins.length > 1) tensions.push({ champ: c.id, libelle: c.libelle, annees: fins.sort(), documents: [...parDoc.keys()].map((id) => m.lignes.find((l) => l.document_id === id)?.document_nom) });
  }

  const tous = blocs.flatMap((b) => b.champs);
  return {
    gabarit: m.gabarit,
    blocs,
    alertes: {
      contradictoires: tous.filter((c) => c.statut === 'contradictoire').map((c) => c.id),
      manquants: tous.filter((c) => c.statut === 'manquant').map((c) => c.id),
      hors_critere: tous.filter((c) => c.statut === 'hors_critere').map((c) => c.id),
      a_verifier: tous.filter((c) => c.statut === 'a_verifier').map((c) => c.id),
    },
    frise,
    tensions,
    nb_documents: m.lignes.length,
    remplissage: m.remplissage,
    rempli_le: brut.matrice?.rempli_le || null,
  };
}

/** Forcer la valeur retenue d'un champ : une pièce, une valeur libre, ou rien (retour à la règle). */
export function forcer(dealId, colonneId, { document_id = null, valeur = null, user } = {}) {
  const brut = brutDe(dealId);
  if (!brut) return { ok: false, error: 'Dossier introuvable' };
  const forcages = { ...(brut.matrice?.forcages || {}) };
  if (document_id || (valeur && String(valeur).trim())) forcages[colonneId] = { document_id: document_id || null, valeur: valeur ? String(valeur).trim() : null, par: user?.email || null, le: new Date().toISOString() };
  else delete forcages[colonneId];
  Records.update('Deal', brut.id, { matrice: { ...(brut.matrice || {}), forcages } });
  return { ok: true };
}

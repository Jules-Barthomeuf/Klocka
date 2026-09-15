// Les cases de la page projet : Bien, Locataire, Analyse du bail.
//
// Une case dit une chose courte (« ILC · annuelle », « 8 000 € »). Le texte lu
// dans le bail passe derrière la pastille « i », et la pièce qui le prouve
// s'ouvre à la bonne page au clic. Ce que l'équipe corrige (cases_forcees) et
// les cases qu'elle ajoute (champs_personnalises) se posent par-dessus, côté
// page : ici, on ne dit que ce que le dossier sait.

import { Records } from './db.js';
import { lireFiche } from './deal/matrice.js';
import { dates, loyerAnnuel } from './deal/dossier-lecture.js';
import { categoriserActivite } from './deal/enrich.js';

// Espace insécable : le format français la veut entre les milliers et avant €.
const INSECABLE = String.fromCharCode(160);
const texte = (v) => (typeof v === 'string' ? v.trim() : '');
const euros = (n) => `${Math.round(n).toLocaleString('fr-FR').replace(/\s/g, INSECABLE)}${INSECABLE}€`;
const MOIS = ['janvier', 'février', 'mars', 'avril', 'mai', 'juin', 'juillet', 'août', 'septembre', 'octobre', 'novembre', 'décembre'];
// \s couvre aussi les espaces insécables que les pièces recopient.
const RE_MONTANT = /(\d{1,3}(?:[\s.]\d{3})+|\d+)(?:,(\d{1,2}))?\s*(?:€|euros?\b|eur\b)/gi;
const nombreDe = (m) => Number(m[1].replace(/[\s.]/g, '') + (m[2] ? `.${m[2]}` : ''));

/** Le premier montant en euros d'une phrase : « 3 105,00 EUROS » → 3105. */
export function montant(t) {
  const m = [...String(t || '').matchAll(RE_MONTANT)][0];
  if (!m) return null;
  const n = nombreDe(m);
  return Number.isFinite(n) ? n : null;
}

/** Le loyer annuel hors taxes d'une clause : un montant TTC n'est jamais pris. */
export function loyerHorsTaxes(t) {
  const s = texte(t);
  if (!s) return null;
  const trouves = [];
  for (const m of s.matchAll(RE_MONTANT)) {
    const apres = s.slice(m.index + m[0].length, m.index + m[0].length + 30);
    if (/^\s*\)?\s*t\.?t\.?c/i.test(apres)) continue;
    trouves.push({
      valeur: nombreDe(m),
      annuel: /^[^€\d]{0,25}(?:par an|annuel|\/\s?an\b)/i.test(apres),
      mensuel: /^[^€\d]{0,25}(?:par mois|mensuel|\/\s?mois)/i.test(apres),
    });
  }
  const annuel = trouves.find((x) => x.annuel) || trouves.find((x) => !x.mensuel);
  if (annuel) return annuel.valeur;
  const mensuel = trouves.find((x) => x.mensuel);
  return mensuel ? mensuel.valeur * 12 : loyerAnnuel(s);
}

// ---------------------------------------------------------------------------
// Lectures courtes
// ---------------------------------------------------------------------------

const MOT_ACTIVITE = {
  alimentaire: 'Alimentaire', restauration: 'Restauration', pret_a_porter: 'Mode', beaute: 'Beauté',
  sante_commerce: 'Santé', services: 'Services', equipement_maison: 'Maison', sport_loisirs: 'Loisirs',
  automobile: 'Automobile', tabac_presse: 'Tabac-presse', bureaux: 'Bureaux', logistique: 'Logistique',
  etablissement_de_nuit: 'Nuit', profession_liberale: 'Libéral', restauration_rapide_kebab: 'Restauration rapide',
};
// Des mots qui annoncent une activité sans la nommer.
const MOTS_VIDES = /^(activit[ée]s?|usage|destination|exploitation|exclusivement|commercial[e]?|non|aucune?|le|la|les|l|un|une|de|du|des|d|pour|à|a)$/i;

/** Un mot pour l'activité ; la phrase entière reste derrière le « i ». */
export function activiteCourte(t, nomLocataire = '') {
  const brut = texte(t).replace(/[«»"“”]/g, '').trim();
  if (!brut || /non pr[ée]cis|non renseign|inconnue?|aucune indication/i.test(brut)) return null;
  const mots = brut.split(/[\s:;,/]+/).filter(Boolean);
  if (brut.length <= 18 && mots.length <= 2) return { valeur: brut[0].toUpperCase() + brut.slice(1), info: null };
  const cat = categoriserActivite(brut, nomLocataire);
  const plein = mots.find((m) => m.length > 3 && !MOTS_VIDES.test(m.replace(/['’].*$/, '')));
  const valeur = MOT_ACTIVITE[cat.code] || (plein ? plein[0].toUpperCase() + plein.slice(1).toLowerCase() : null);
  return valeur ? { valeur, info: brut } : null;
}

const NIVEAUX = [
  [/rdc|rez[\s-]*de[\s-]*chauss/i, 'rez-de-chaussée'], [/sous[\s-]*sol/i, 'sous-sol'], [/mezzanine/i, 'mezzanine'],
  [/r[ée]serve/i, 'réserve'], [/cave/i, 'cave'], [/combles?/i, 'combles'], [/[ée]tage/i, 'étage'],
];
const NIV = 'rdc|rez[\\s-]*de[\\s-]*chauss[ée]e|sous[\\s-]*sol|mezzanine|r[ée]serves?|caves?|combles?|[ée]tages?';

/** Le détail d'une surface : « 40 RDC + 20 soussol » → « 40 m² rez-de-chaussée · 20 m² sous-sol ». */
export function detailSurface(t) {
  const s = String(t || '');
  const parties = new Map();
  const noter = (nombre, niveau) => {
    const libelle = NIVEAUX.find(([re]) => re.test(niveau))?.[1];
    if (libelle && !parties.has(libelle)) parties.set(libelle, Number(String(nombre).replace(',', '.')));
  };
  const avecUnite = new RegExp(`(\\d+(?:[.,]\\d+)?)\\s*m(?:²|2)\\s*(?:en\\s+|au\\s+|de\\s+|d['’]\\s*|:|\\()?\\s*(${NIV})`, 'gi');
  const collee = new RegExp(`(\\d+(?:[.,]\\d+)?)\\s+(${NIV})`, 'gi');
  const apres = new RegExp(`(${NIV})\\s*(?:de\\s+|:|\\(|=)?\\s*(\\d+(?:[.,]\\d+)?)\\s*m(?:²|2)`, 'gi');
  for (const m of s.matchAll(avecUnite)) noter(m[1], m[2]);
  for (const m of s.matchAll(collee)) noter(m[1], m[2]);
  for (const m of s.matchAll(apres)) noter(m[2], m[1]);
  const lignes = [...parties].map(([niveau, n]) => `${String(n).replace('.', ',')}${INSECABLE}m² ${niveau}`);
  const ponderee = s.match(/(\d+(?:[.,]\d+)?)\s*m(?:²|2)?\s*pond[ée]r/i) || s.match(/pond[ée]r[ée]e?s?\s*(?:de\s+|:)?\s*(\d+(?:[.,]\d+)?)\s*m/i);
  if (ponderee) lignes.push(`${ponderee[1]}${INSECABLE}m² pondérés`);
  return lignes.length ? lignes.join(' · ') : null;
}

const CHIFFRES = { un: 1, deux: 2, trois: 3, quatre: 4, cinq: 5, six: 6, sept: 7, huit: 8, neuf: 9, dix: 10, douze: 12 };

export function typeBailCourt(t, duree = '') {
  const s = `${texte(t)} ${texte(duree)}`;
  if (!s.trim()) return null;
  const n = s.match(/(\d{1,2}|un|deux|trois|quatre|cinq|six|sept|huit|neuf|dix|douze)\s*(?:\(\d+\)\s*)?ann[ée]es?/i);
  const annees = n ? (Number(n[1]) || CHIFFRES[n[1].toLowerCase()]) : null;
  let valeur = null;
  if (/d[ée]rogatoire|pr[ée]caire|courte dur[ée]e/i.test(s)) valeur = 'Dérogatoire';
  else if (/professionnel/i.test(s)) valeur = 'Professionnel';
  // Traits d'union insécables : « 3-6-9 » ne se coupe pas en fin de ligne.
  else if (/commercial|3\s*[/-]\s*6\s*[/-]\s*9|L\.?\s?145/i.test(s)) valeur = ['Commercial 3', '6', '9'].join(String.fromCharCode(8209));
  else valeur = s.trim().split(/\s+/).slice(0, 3).join(' ');
  return { valeur, detail: annees ? `${annees} ans` : null };
}

/** Le preneur nommé dans « Les parties ». */
export function preneurDe(t) {
  const m = texte(t).match(/preneur\s*(?:\([^)]*\))?\s*[:—–-]\s*([^;\n]+)/i);
  if (!m) return null;
  const nom = m[1].split(/,|\(|\bau capital\b|\bimmatricul|\bdont le si[èe]ge|\bdemeurant/i)[0].trim().replace(/[.]$/, '');
  return nom.length > 2 ? nom.slice(0, 60) : null;
}

const PRENEUR_PAIE = /rembours\w*|refactur\w*|[àa] la charge (?:exclusive )?du preneur|support\w* par le preneur|acquitt\w* par le preneur|incomb\w* au preneur|le preneur (?:s'engage [àa] )?(?:acquitter|rembourser|supporter)/i;
const BAILLEUR_PAIE = /[àa] la charge (?:exclusive )?du bailleur|rest\w* [àa] la charge du bailleur|non refactur\w*|support\w* par le bailleur/i;

export function tvaCourte(t, soumisSimulateur = false) {
  const s = texte(t);
  const non = /non soumis|non assujetti|exon[ée]r|sans tva|hors champ/i.test(s);
  const oui = !non && /soumis|assujetti|option (?:pour la|[àa] la) tva|tva en sus|\+ ?t\.?v\.?a|ttc|major[ée] de la tva/i.test(s);
  if (!s && !soumisSimulateur) return null;
  if (oui || (!s && soumisSimulateur)) {
    const taux = s.match(/(\d{1,2}(?:[.,]\d{1,2})?)\s*%/)?.[1];
    return { valeur: 'Soumis à TVA', detail: `${taux ? `${taux.replace('.', ',')} %, ` : ''}payée par le preneur` };
  }
  if (non) return { valeur: 'Non soumis', detail: 'Pas de TVA sur le loyer' };
  return { valeur: 'À vérifier', detail: null };
}

export function taxeFonciereCourte(taxe, charges = '') {
  const t = texte(taxe);
  const c = texte(charges);
  const mentionCharges = /imp[ôo]ts? fonciers?|taxe fonci[èe]re/i.test(c);
  let valeur = null;
  if (BAILLEUR_PAIE.test(t)) valeur = 'Non refacturée';
  else if (PRENEUR_PAIE.test(t) || /int[ée]gralement/i.test(t) || (mentionCharges && PRENEUR_PAIE.test(c))) valeur = 'Refacturée';
  else if (mentionCharges && /inventaire|refacturable|r[ée]cup[ée]rable/i.test(c)) valeur = 'Refacturée';
  else if (t) valeur = 'À vérifier';
  const n = montant(t);
  const annee = t.match(/\b(20\d{2})\b/)?.[1];
  return valeur ? { valeur, detail: n ? `${euros(n)}${annee ? ` (${annee})` : ''}` : null } : null;
}

export function depotCourt(t) {
  const s = texte(t);
  const n = montant(s);
  if (!n) return s && /aucun|n[ée]ant|sans d[ée]p[ôo]t/i.test(s) ? { valeur: 'Aucun', detail: null } : null;
  const mois = s.match(/\((\d{1,2})\)\s*mois|(\d{1,2})\s*mois/i);
  const nb = mois ? Number(mois[1] || mois[2]) : null;
  return { valeur: euros(n), detail: nb ? `${nb} mois de loyer` : null };
}

export function pasDePorteCourt(t) {
  const s = texte(t);
  if (!s) return null;
  const n = montant(s);
  if (n) return { valeur: euros(n), detail: /droit d'entr[ée]e/i.test(s) ? "Droit d'entrée" : null };
  if (/aucun|n[ée]ant|pas de pas|sans pas|non pr[ée]vu|ne pr[ée]voit pas/i.test(s)) return { valeur: 'Aucun', detail: null };
  return { valeur: 'À vérifier', detail: null };
}

export function provisionCourte(t) {
  const s = texte(t);
  if (!s) return null;
  if (/aucune provision|pas de provision|sans provision/i.test(s)) return { valeur: 'Aucune', detail: null };
  const n = montant(s);
  if (!n) return { valeur: 'À vérifier', detail: null };
  const periode = /mensuel|par mois|\/\s?mois/i.test(s) ? '/mois' : /trimestr/i.test(s) ? '/trimestre' : /annuel|par an|\/\s?an\b/i.test(s) ? '/an' : '';
  return { valeur: `${euros(n)}${periode}`, detail: /r[ée]gularis/i.test(s) ? 'Régularisée chaque année' : null };
}

export function indexationCourte(t) {
  const s = texte(t);
  if (!s) return null;
  if (/aucune (?:clause d')?index|pas d'index|sans index/i.test(s)) return { valeur: 'Aucune', detail: null };
  const indice = /\bILAT\b|activit[ée]s tertiaires/i.test(s) ? 'ILAT'
    : /\bILC\b|loyers commerciaux/i.test(s) ? 'ILC'
      : /\bICC\b|co[ûu]t de la construction/i.test(s) ? 'ICC'
        : /\bIRL\b|r[ée]f[ée]rence des loyers/i.test(s) ? 'IRL' : null;
  const periode = /triennal/i.test(s) && !/(?:annuel|chaque ann[ée]e|[ée]chelle mobile)/i.test(s) ? 'triennale'
    : /annuel|chaque ann[ée]e|[ée]chelle mobile/i.test(s) ? 'annuelle' : null;
  return { valeur: [indice, periode].filter(Boolean).join(' · ') || 'Clause présente', detail: /r[ée]vision triennale/i.test(s) && periode === 'annuelle' ? 'Révision triennale légale en plus' : null };
}

export function travauxCourts(nonRecup, charges = '') {
  const n = texte(nonRecup);
  const c = texte(charges);
  if (!n && !c) return null;
  let valeur = null;
  if (/606/.test(n) || /grosses r[ée]parations/i.test(n)) valeur = 'Art. 606 : bailleur';
  else if (/606|grosses r[ée]parations/i.test(c) && PRENEUR_PAIE.test(c)) valeur = 'Art. 606 : preneur';
  else valeur = 'À vérifier';
  const entretien = /entretien|menues r[ée]parations|r[ée]parations locatives/i.test(`${n} ${c}`) ? 'Entretien courant : preneur' : null;
  return { valeur, detail: entretien };
}

/** Une date de fiche en ISO : « 2035-03-15 », « 15/03/2035 » ou « 15 mars 2035 ». */
export function isoDe(v) {
  const s = texte(v);
  if (/^\d{4}-\d{2}-\d{2}/.test(s)) return s.slice(0, 10);
  return dates(s)[0]?.iso || null;
}

const dateLongue = (iso) => {
  const [a, m, j] = String(iso).split('-').map(Number);
  return a && m && j ? `${j} ${MOIS[m - 1]} ${a}` : iso;
};

/** Début et fin du bail : les dates les plus tôt et les plus tard de la phrase. */
export function datesDuBail(t) {
  const liste = dates(t).map((d) => d.iso).filter((iso) => !Number.isNaN(Date.parse(iso))).sort();
  if (!liste.length) return { debut: null, fin: null };
  return { debut: liste.length > 1 ? liste[0] : null, fin: liste[liste.length - 1] };
}

/** « 7 ans », « 5 mois » depuis une date, et « depuis novembre 2018 ». */
export function anciennete(iso, maintenant = new Date()) {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime()) || d > maintenant) return null;
  const mois = (maintenant.getFullYear() - d.getFullYear()) * 12 + (maintenant.getMonth() - d.getMonth()) - (maintenant.getDate() < d.getDate() ? 1 : 0);
  const annees = Math.floor(mois / 12);
  return {
    valeur: annees >= 1 ? `${annees} an${annees > 1 ? 's' : ''}` : `${Math.max(mois, 0)} mois`,
    detail: `depuis ${MOIS[d.getMonth()]} ${d.getFullYear()}`,
  };
}

// ---------------------------------------------------------------------------
// Assemblage
// ---------------------------------------------------------------------------

const court = (s, n = 420) => { const t = texte(s); return t ? (t.length > n ? `${t.slice(0, n - 1)}…` : t) : null; };

/**
 * @param {object} projet
 * @param {{fiche?: object|null, lot?: object|null, maintenant?: Date, sansSources?: boolean}} opts
 */
export function casesDuProjet(projet, { fiche = null, lot = null, maintenant = new Date(), sansSources = false } = {}) {
  const champs = new Map((fiche?.blocs || []).flatMap((b) => b.champs || []).map((c) => [c.id, c]));
  const v = (id) => texte(champs.get(id)?.valeur);
  const source = (...ids) => {
    if (sansSources) return null;
    for (const id of ids) {
      const p = champs.get(id)?.preuves?.[0];
      if (p?.document_url) return { document_id: p.document_id || null, document_nom: p.document_nom || 'Document', categorie: p.categorie && p.categorie !== 'Autre' ? p.categorie : null, document_url: p.document_url, page: p.page || null, citation: p.citation || null };
    }
    return null;
  };
  const cas = (id, titre, lu, info, sources) => ({ id, titre, valeur: lu?.valeur ?? null, detail: lu?.detail ?? null, info: lu?.info ?? court(info), source: lu ? source(...sources) : null });

  // --- Bien -----------------------------------------------------------------
  const activite = activiteCourte(projet.activite_locataire || v('destination') || lot?.locataire_activite?.valeur, projet.nom_locataire);
  const loyerActuel = Number(projet.bail_loyer_actuel) || Number(projet.loyer_annuel_ht) || Number(projet.sim_loyer_initial_ht) || 0;
  const surface = Number(projet.sim_surface) || Number(projet.surface_m2) || 0;
  const texteSurface = [v('surface'), texte(lot?.surface_m2?.citation), texte(projet.surface_detail)].filter(Boolean).join(' · ');
  const bien = [
    cas('activite', 'Activité', activite, null, ['destination']),
    cas('loyer_actuel', 'Loyer actuel', loyerActuel > 0 && { valeur: `${euros(loyerActuel)} HT/an`, detail: `${euros(loyerActuel / 12)} HT/mois` }, null, ['paiements', 'loyer']),
    cas('surface', 'Surface exploitée', surface > 0 && { valeur: `${String(surface).replace('.', ',')}${INSECABLE}m²`, detail: detailSurface(texteSurface) }, v('surface'), ['surface']),
  ];

  // --- Bail -----------------------------------------------------------------
  const lus = datesDuBail(v('dates_bail'));
  const debut = isoDe(projet.bail_date_debut) || lus.debut || null;
  const fin = isoDe(projet.bail_date_echeance) || isoDe(projet.echeance_bail) || lus.fin || null;
  // Le loyer facial est celui du bail signé : un loyer lu dans l'annonce n'en est pas un.
  const facial = Number(projet.bail_loyer_initial) || (champs.get('loyer')?.preuves?.length ? loyerHorsTaxes(v('loyer')) : null) || null;
  const preneur = preneurDe(v('parties')) || texte(projet.nom_locataire) || null;
  const bail = [
    cas('type_bail', 'Type de bail', typeBailCourt(projet.bail_type || v('type_bail'), v('duree')), [v('type_bail'), v('duree')].filter(Boolean).join(' '), ['type_bail', 'duree']),
    cas('preneurs', 'Preneur', preneur && { valeur: preneur }, v('parties'), ['parties']),
    cas('loyer_facial', 'Loyer facial', facial && { valeur: `${euros(facial)} HT/an`, detail: 'À la signature du bail' }, v('loyer'), ['loyer']),
    cas('loyer_indexe', 'Loyer actuel indexé', loyerActuel > 0 && {
      valeur: `${euros(loyerActuel)} HT/an`,
      detail: facial && Math.abs(loyerActuel - facial) / facial > 0.005 ? `${loyerActuel > facial ? '+' : ''}${(((loyerActuel - facial) / facial) * 100).toFixed(1).replace(/\.0$/, '').replace('.', ',')} % depuis la signature` : null,
    }, v('paiements'), ['paiements', 'loyer']),
    cas('tva', 'TVA', tvaCourte(v('tva_loyer'), projet.sim_loyer_soumis_tva === true), v('tva_loyer'), ['tva_loyer']),
    cas('taxe_fonciere', 'Taxe foncière', taxeFonciereCourte(v('taxe_fonciere'), v('charges')), v('taxe_fonciere') || v('charges'), ['taxe_fonciere', 'charges']),
    cas('depot', 'Dépôt de garantie', depotCourt(v('depot')) || (Number(projet.bail_depot_garantie) > 0 ? { valeur: euros(projet.bail_depot_garantie) } : null), v('depot'), ['depot']),
    cas('pas_de_porte', 'Pas de porte', pasDePorteCourt(v('pas_de_porte')), v('pas_de_porte'), ['pas_de_porte']),
    cas('provision_charges', 'Provision sur charges', provisionCourte(v('provision_charges') || (/provision/i.test(v('charges_copro')) ? v('charges_copro') : '')), v('provision_charges') || v('charges_copro'), ['provision_charges', 'charges_copro']),
    cas('indexation', 'Indexation et révision', indexationCourte(v('indexation')), v('indexation'), ['indexation']),
    cas('travaux', 'Travaux et entretien', travauxCourts(v('charges_non_recup'), v('charges')), [v('charges_non_recup'), v('charges')].filter(Boolean).join(' '), ['charges_non_recup', 'charges']),
  ];

  // --- Locataire --------------------------------------------------------------
  const creation = dates(v('creation')).map((d) => d.iso).sort()[0] || null;
  const depuis = isoDe(projet.locataire_depuis) || debut || creation;
  const locataire = [
    cas('en_place', 'En place depuis', depuis && anciennete(depuis, maintenant), null, isoDe(projet.locataire_depuis) ? [] : debut ? ['dates_bail'] : ['creation']),
    cas('echeance', 'Échéance du bail', fin && { valeur: dateLongue(fin) }, v('dates_bail'), ['dates_bail']),
  ];

  return {
    bien,
    bail,
    locataire,
    frise: debut || fin ? { debut, fin, source: source('dates_bail') } : null,
    dossier: !!fiche,
  };
}

/** Les cases d'un projet, lues dans le dossier dont il vient. */
export function lireCases(projet, { sansSources = false } = {}) {
  const deal = projet.deal_id ? Records.findBy('Deal', 'deal_id', projet.deal_id) : null;
  let fiche = null;
  try { fiche = deal ? lireFiche(deal.deal_id) : null; } catch { fiche = null; }
  return casesDuProjet(projet, { fiche, lot: deal?.lots?.[0]?.lot || null, sansSources });
}

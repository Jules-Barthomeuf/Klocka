// K-Prospective : trouver, dans une zone, les commerces qui répondent à des
// critères — et savoir à qui l'on parle avant de pousser la porte.
//
// Le parcours en trois temps. D'abord les devantures : OpenStreetMap donne
// les commerces d'une zone pour un type d'activité, avec leur nom, leur rue,
// et souvent leur SIRET (deux sur trois le portent). Ensuite la société
// derrière chaque devanture : l'annuaire des entreprises, par SIRET quand il
// est là, sinon par nom dans la commune en prenant l'établissement le plus
// proche du point. Enfin les critères, appliqués à ce qu'on sait vraiment.
//
// Chaque critère dit sa source, et ceux qu'aucune source ouverte ne sert
// sont marqués indisponibles plutôt que devinés : la solvabilité chiffrée,
// le prix d'acquisition, l'échéance d'un bail sont des données que Data-B
// achète, pas des données publiques.

import { Records } from './db.js';
import { resoudreAdresse } from './data-b.js';
import { commercesDeLaZone } from './kzoning-commerces.js';
import { filtresDe, nomMetierDe, METIERS, TOUS_LES_COMMERCES } from './kzoning-metiers.js';
import { parcellesAutour, locauxDeSection, grouperProprietaires } from './kfoncier.js';
import { contient } from './kvaleurlocative.js';

const ENTITE = 'Prospection';
const CACHE_SOCIETE = 'CacheSocieteCommerce';
const CACHE_JOURS = 30;
const ANNUAIRE = 'https://recherche-entreprises.api.gouv.fr/search';
const UA = 'Klocka/1.0 (sourcing@klocka.immo)';
const DELAI_MS = 30000;
const RAYON_DEFAUT = 500;
const RAYON_MAX = 3000;
const CONCURRENCE = 3;
const PAUSE_MS = 180;
const nomDe = nomMetierDe();
const categorieDe = (metier) => METIERS.find((m) => m.nom === metier)?.categorie || null;

export const ETAPES = [
  { cle: 'adresse', nom: "Localisation de l'adresse" },
  { cle: 'commerces', nom: 'Commerces de la zone (OpenStreetMap)' },
  { cle: 'societes', nom: 'Sociétés derrière chaque devanture (annuaire des entreprises)' },
  { cle: 'rue', nom: 'Typologie des rues' },
  { cle: 'foncier', nom: 'Propriétaires des murs (fichier des personnes morales)' },
  { cle: 'gerants', nom: 'Autres établissements des gérants' },
  { cle: 'criteres', nom: 'Application des critères' },
];

// Les tranches d'effectif de l'INSEE, telles quelles.
const EFFECTIFS = [
  ['00', 'Aucun salarié'], ['01', '1 ou 2 salariés'], ['02', '3 à 5 salariés'], ['03', '6 à 9 salariés'],
  ['11', '10 à 19 salariés'], ['12', '20 à 49 salariés'], ['21', '50 à 99 salariés'], ['22', '100 à 199 salariés'],
  ['31', '200 à 249 salariés'], ['32', '250 à 499 salariés'], ['41', '500 à 999 salariés'], ['42', '1 000 à 1 999 salariés'],
  ['51', '2 000 à 4 999 salariés'], ['52', '5 000 à 9 999 salariés'], ['53', '10 000 salariés et plus'],
];

const o = (valeur, nom, extra = {}) => ({ valeur, nom, ...extra });
const INDISPO = { indisponible: true, pourquoi: 'aucune source ouverte ne le donne' };

/** Les critères, dans l'ordre de l'écran. L'écran les lit d'ici. */
export const CRITERES = [
  {
    cle: 'type_entreprise', nom: "Type d'entreprise", source: 'annuaire des entreprises',
    options: [
      o('independant', 'Indépendant', { aide: 'une société, un seul établissement' }),
      o('enseigne', 'Enseignes', { aide: 'dix établissements ou plus' }),
      o('entreprise', 'Entreprise', { aide: 'de deux à neuf établissements' }),
      o('entrepreneur_individuel', 'Entrepreneur individuel'),
    ],
  },
  { cle: 'effectif', nom: "Effectifs de l'établissement", source: 'annuaire des entreprises', options: EFFECTIFS.map(([v, n]) => o(v, n)) },
  {
    cle: 'nb_etablissements', nom: "Nombre d'établissements de l'entreprise", source: 'annuaire des entreprises',
    options: [o('1', '1 seul établissement'), o('2', '2 établissements'), o('3-5', 'De 3 à 5 établissements'), o('6-10', 'De 6 à 10 établissements'), o('10+', 'Plus de 10 établissements')],
  },
  {
    cle: 'creation', nom: "Date de création de l'entreprise", source: 'annuaire des entreprises',
    options: [o('<1', 'Moins de 1 an'), o('1-3', 'De 1 à 3 ans'), o('3-6', 'De 3 à 6 ans'), o('6-9', 'De 6 à 9 ans'), o('9+', '+ de 9 ans')],
  },
  {
    cle: 'ca', nom: 'CA déclaré', source: 'comptes déposés (annuaire des entreprises)',
    options: [o('0-150', '0 à 150 000 €'), o('150-300', '150 000 à 300 000 €'), o('300-500', '300 000 à 500 000 €'), o('500-1000', '500 000 à 1 000 000 €'), o('1000-2000', '1 000 000 à 2 000 000 €'), o('2000-5000', '2 000 000 à 5 000 000 €'), o('5000+', '+ de 5 000 000 €')],
  },
  {
    cle: 'solvabilite', nom: "Solvabilité de l'entreprise", source: 'annuaire des entreprises',
    options: [
      o('liquidation', 'En cours de liquidation', INDISPO), o('cessation', 'Activité en cours de cessation'), o('procedure', 'Procédure collective en cours', INDISPO),
      o('risque_avere', 'Risque avéré', INDISPO), o('risque_tres_eleve', 'Risque très élevé', INDISPO), o('risque_eleve', 'Risque élevé', INDISPO),
      o('risque_moyen', 'Risque moyen', INDISPO), o('risque_faible', 'Risque faible', INDISPO), o('risque_tres_faible', 'Risque très faible', INDISPO),
      o('sur_demande', 'Solvabilité sur demande', INDISPO),
    ],
  },
  {
    cle: 'immobilier', nom: 'Filtres immobiliers', source: 'fichier des personnes morales (DGFiP)',
    options: [
      o('proprietaire_exploitant', 'Propriétaire exploitant', { aide: 'la société est propriétaire des murs' }),
      o('prix_acquisition', "Avec prix d'acquisition", INDISPO),
      o('proprietaire_foncier', 'Avec propriétaire du foncier', { aide: 'une personne morale propriétaire est connue' }),
      o('copropriete', 'Avec copropriété'),
      o('bail_6_mois', 'Renouvellement du bail sous 6 mois', INDISPO),
    ],
  },
  { cle: 'contacts', nom: 'Moyens de contacts', source: 'OpenStreetMap', options: [o('telephone', 'Avec coordonnées téléphoniques'), o('email', 'Avec adresses emails')] },
  {
    cle: 'rue', nom: 'Typologie de la rue', source: 'OpenStreetMap, commerces relevés dans la rue',
    options: [o('n1', 'Rue N°1'), o('tres_commercante', 'Rue très commerçante'), o('commercante', 'Rue commerçante'), o('semi', 'Rue semi commerçante'), o('residentielle', 'Rue résidentielle')],
  },
  {
    cle: 'age_gerant', nom: 'Âge du gérant', source: 'annuaire des entreprises',
    options: [o('60+', 'Gérant de plus de 60 ans'), o('45-59', 'Gérant de 45 à 59 ans'), o('<45', 'Gérant de moins de 45 ans')],
  },
  {
    cle: 'etab_gerant', nom: "Nombre d'établissements du gérant", source: 'annuaire des entreprises',
    options: [o('1', '1 seul établissement'), o('2-4', 'De 2 à 4 établissements'), o('5-9', 'De 5 à 9 établissements'), o('10-49', 'De 10 à 49 établissements'), o('50-99', 'De 50 à 99 établissements'), o('100+', 'Plus de 100 établissements')],
  },
];

const dansTranche = (n, tranche) => {
  if (n == null) return false;
  if (tranche.endsWith('+')) return n >= Number(tranche.slice(0, -1));
  if (tranche.startsWith('<')) return n < Number(tranche.slice(1));
  const [a, b] = tranche.split('-').map(Number);
  return Number.isNaN(b) ? n === a : n >= a && n <= b;
};

// Les seuils de la typologie de rue : combien de commerces relevés dans la
// même rue, à l'intérieur de la zone. Une rue n°1 en aligne des dizaines.
const SEUILS_RUE = [['n1', 40], ['tres_commercante', 20], ['commercante', 10], ['semi', 4]];
export function typologieRue(nbCommerces) {
  for (const [cle, seuil] of SEUILS_RUE) if (nbCommerces >= seuil) return cle;
  return 'residentielle';
}

const normaliserRue = (s) => String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();

/**
 * Un commerce répond-il aux critères ? Dans un groupe, une option suffit ;
 * entre les groupes, il faut tout. Pure : testée sans réseau.
 */
export function correspond(c, criteres = {}) {
  const s = c.societe || null;
  const annee = new Date().getFullYear();
  const tests = {
    type_entreprise: (v) => {
      if (!s) return false;
      const n = s.nombre_etablissements_ouverts ?? s.nombre_etablissements ?? 1;
      if (v === 'entrepreneur_individuel') return !!s.entrepreneur_individuel;
      if (s.entrepreneur_individuel) return false;
      if (v === 'independant') return n <= 1;
      if (v === 'entreprise') return n >= 2 && n <= 9;
      if (v === 'enseigne') return n >= 10;
      return false;
    },
    effectif: (v) => !!s && (s.effectif_etablissement || s.effectif) === v,
    nb_etablissements: (v) => !!s && dansTranche(s.nombre_etablissements_ouverts ?? s.nombre_etablissements, v),
    creation: (v) => !!s?.creation && dansTranche(Math.floor((Date.now() - Date.parse(s.creation)) / (365.25 * 86400000)), v),
    ca: (v) => s?.ca != null && dansTranche(s.ca / 1000, v),
    solvabilite: (v) => v === 'cessation' && s?.etat === 'C',
    immobilier: (v) => !!c.foncier?.[v],
    contacts: (v) => (v === 'telephone' ? !!c.telephone : v === 'email' ? !!c.email : false),
    rue: (v) => c.rue_typologie === v,
    age_gerant: (v) => {
      const a = s?.annee_naissance_gerant ? annee - Number(s.annee_naissance_gerant) : null;
      if (a == null) return false;
      return v === '60+' ? a > 60 : v === '45-59' ? a >= 45 && a <= 59 : a < 45;
    },
    etab_gerant: (v) => s?.etablissements_gerant != null && dansTranche(s.etablissements_gerant, v),
  };
  for (const [cle, choisis] of Object.entries(criteres)) {
    const liste = (choisis || []).filter(Boolean);
    if (!liste.length || !tests[cle]) continue;
    if (!liste.some((v) => tests[cle](v))) return false;
  }
  return true;
}

// ── L'annuaire ──────────────────────────────────────────────────────────────

async function annuaire(params) {
  const r = await fetch(`${ANNUAIRE}?${new URLSearchParams(params)}`, { headers: { 'user-agent': UA, accept: 'application/json' }, signal: AbortSignal.timeout(DELAI_MS) });
  if (r.status === 429) { await new Promise((ok) => setTimeout(ok, 1500)); return annuaire(params); }
  if (!r.ok) throw new Error(`L'annuaire a répondu ${r.status}`);
  return r.json();
}

const metres = (a, b, c, d) => {
  const R = 6371000; const rad = Math.PI / 180;
  const x = (c - a) * rad; const y = (d - b) * rad;
  const h = Math.sin(x / 2) ** 2 + Math.cos(a * rad) * Math.cos(c * rad) * Math.sin(y / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(h));
};

function ficheDe(r, etab) {
  const finances = r.finances && typeof r.finances === 'object' ? Object.entries(r.finances).sort((a, b) => b[0].localeCompare(a[0]))[0]?.[1] : null;
  const gerant = (r.dirigeants || []).find((d) => d.type_dirigeant === 'personne physique') || null;
  return {
    siren: r.siren,
    siret: etab?.siret || r.siege?.siret || null,
    nom: r.nom_complet,
    raison_sociale: r.nom_raison_sociale,
    nature_juridique: r.nature_juridique,
    entrepreneur_individuel: !!r.complements?.est_entrepreneur_individuel || String(r.nature_juridique) === '1000',
    etat: r.etat_administratif,
    creation: r.date_creation || null,
    effectif: r.tranche_effectif_salarie || null,
    effectif_etablissement: etab?.tranche_effectif_salarie || null,
    nombre_etablissements: r.nombre_etablissements ?? null,
    nombre_etablissements_ouverts: r.nombre_etablissements_ouverts ?? null,
    activite_code: r.activite_principale,
    categorie: r.categorie_entreprise || null,
    ca: finances?.ca ?? null,
    resultat_net: finances?.resultat_net ?? null,
    annee_comptes: finances ? Object.keys(r.finances).sort().pop() : null,
    siege: r.siege ? { adresse: r.siege.adresse, code_postal: r.siege.code_postal, commune: r.siege.libelle_commune, lat: Number(r.siege.latitude) || null, lon: Number(r.siege.longitude) || null } : null,
    etablissement: etab ? { siret: etab.siret, adresse: etab.adresse, enseigne: (etab.liste_enseignes || [])[0] || etab.nom_commercial || null, lat: Number(etab.latitude) || null, lon: Number(etab.longitude) || null, creation: etab.date_creation || null } : null,
    dirigeants: (r.dirigeants || []).map((d) => ({
      nom: d.type_dirigeant === 'personne morale' ? d.denomination : [d.prenoms, d.nom].filter(Boolean).join(' '),
      prenoms: d.prenoms || null, nom_famille: d.nom || null,
      qualite: d.qualite || null, morale: d.type_dirigeant === 'personne morale', annee_naissance: d.annee_de_naissance || null,
    })),
    annee_naissance_gerant: gerant?.annee_de_naissance || null,
    gerant: gerant ? { nom: gerant.nom, prenoms: gerant.prenoms } : null,
  };
}

/** La société derrière une devanture : par SIRET, sinon par nom dans la commune. */
export async function resoudreSociete(c, codeInsee) {
  const cle = `${c.id}|${codeInsee}`;
  const garde = Records.filter(CACHE_SOCIETE, { cle })[0];
  if (garde && Date.now() - Date.parse(garde.le) < CACHE_JOURS * 86400000) return garde.societe;

  let fiche = null;
  let methode = null;
  try {
    if (c.siret) {
      const d = await annuaire({ q: c.siret, per_page: '1', limite_matching_etablissements: '10' });
      const r = d.results?.[0];
      if (r) { fiche = ficheDe(r, (r.matching_etablissements || []).find((e) => e.siret === c.siret) || null); methode = 'siret'; }
    }
    if (!fiche && c.nom) {
      const d = await annuaire({ q: c.nom, code_commune: codeInsee, per_page: '5', limite_matching_etablissements: '10' });
      let meilleur = null;
      for (const r of d.results || []) {
        for (const e of r.matching_etablissements || []) {
          const lat = Number(e.latitude); const lon = Number(e.longitude);
          if (!Number.isFinite(lat) || !Number.isFinite(lon)) continue;
          const dist = metres(c.lat, c.lon, lat, lon);
          if (dist <= 300 && (!meilleur || dist < meilleur.dist)) meilleur = { r, e, dist };
        }
      }
      if (meilleur) { fiche = ficheDe(meilleur.r, meilleur.e); methode = `nom, établissement à ${Math.round(meilleur.dist)} m`; }
    }
  } catch (e) {
    fiche = null; methode = `erreur : ${e?.message || e}`;
  }
  const societe = fiche ? { ...fiche, methode } : null;
  const doc = { cle, societe, methode, le: new Date().toISOString() };
  if (garde) Records.update(CACHE_SOCIETE, garde.id, doc); else Records.create(CACHE_SOCIETE, doc);
  return societe;
}

async function etablissementsDuGerant(s) {
  if (!s?.gerant?.nom) return null;
  try {
    const d = await annuaire({ nom_personne: s.gerant.nom, prenoms_personne: s.gerant.prenoms || '', type_personne: 'dirigeant', per_page: '25', minimal: 'true', include: 'nombre_etablissements_ouverts' });
    return (d.results || []).reduce((n, r) => n + (r.nombre_etablissements_ouverts ?? 1), 0) || null;
  } catch { return null; }
}

async function parLots(liste, n, fn) {
  const sortie = [];
  for (let i = 0; i < liste.length; i += n) {
    sortie.push(...await Promise.all(liste.slice(i, i + n).map(fn)));
    await new Promise((ok) => setTimeout(ok, PAUSE_MS));
  }
  return sortie;
}

// ── Le travail ──────────────────────────────────────────────────────────────

const noter = (id, patch) => Records.update(ENTITE, id, patch);
const etape = (id, cle, etat, detail = null) => {
  const e = Records.get(ENTITE, id);
  const etapes = (e?.etapes || []).map((x) => (x.cle === cle ? { ...x, etat, detail, le: new Date().toISOString() } : x));
  const faites = etapes.filter((x) => ['faite', 'ratee', 'sautee'].includes(x.etat)).length;
  noter(id, { etapes, progression: Math.round((faites / ETAPES.length) * 100) });
};

export function listerProspections() {
  return Records.list(ENTITE)
    .map(({ id, adresse, activite, rayon_m, etat, progression, cree_le, fini_le, par, libelle, nb_retenus, nb_commerces }) => ({ id, adresse, activite, rayon_m, etat, progression, cree_le, fini_le, par, libelle, nb_retenus, nb_commerces }))
    .sort((a, b) => String(b.cree_le || '').localeCompare(String(a.cree_le || '')));
}

export function lireProspection(id) { return Records.get(ENTITE, id) || null; }

export function supprimerProspection(id) {
  if (!Records.get(ENTITE, id)) return { ok: false, error: "Cette prospection n'existe plus." };
  Records.delete(ENTITE, id);
  return { ok: true };
}

export function lancerProspection({ adresse, activite = null, rayon_m = RAYON_DEFAUT, criteres = {} }, user = null) {
  const texte = String(adresse || '').trim();
  if (texte.length < 5) return { ok: false, error: 'Il faut une adresse précise : numéro, rue, ville.' };
  const rayon = Math.min(RAYON_MAX, Math.max(100, Number(rayon_m) || RAYON_DEFAUT));
  const propres = {};
  for (const g of CRITERES) {
    const v = (criteres?.[g.cle] || []).filter((x) => g.options.some((op) => op.valeur === x && !op.indisponible));
    if (v.length) propres[g.cle] = v;
  }
  const e = Records.create(ENTITE, {
    adresse: texte, libelle: texte,
    activite: String(activite || '').trim() || TOUS_LES_COMMERCES.nom,
    rayon_m: rayon, criteres: propres,
    etat: 'en_cours', progression: 0,
    etapes: ETAPES.map((x) => ({ ...x, etat: 'a_faire', detail: null })),
    cree_le: new Date().toISOString(), fini_le: null, par: user?.email || null,
    point: null, commerces: [], retenus: [], nb_commerces: 0, nb_retenus: 0,
  }, user?.email);
  executer(e.id).catch((err) => noter(e.id, { etat: 'echec', fini_le: new Date().toISOString(), erreur: err?.message || String(err) }));
  return { ok: true, id: e.id };
}

async function executer(id) {
  const e = Records.get(ENTITE, id);
  const criteres = e.criteres || {};

  etape(id, 'adresse', 'en_cours');
  let point = null;
  try { point = await resoudreAdresse(e.adresse); } catch (err) { etape(id, 'adresse', 'ratee', err?.message || String(err)); noter(id, { etat: 'echec', fini_le: new Date().toISOString(), erreur: err?.message || String(err) }); return; }
  if (!point) {
    etape(id, 'adresse', 'ratee', 'adresse introuvable dans la Base Adresse Nationale');
    noter(id, { etat: 'echec', fini_le: new Date().toISOString(), erreur: `Adresse introuvable : « ${e.adresse} ».` });
    return;
  }
  const codeInsee = point.code_insee || null;
  noter(id, { point: { lat: point.lat, lon: point.lon, label: point.label, code_insee: codeInsee }, libelle: point.label });
  etape(id, 'adresse', 'faite', point.label);

  etape(id, 'commerces', 'en_cours');
  const metier = e.activite === TOUS_LES_COMMERCES.nom ? null : METIERS.find((m) => m.nom === e.activite)?.nom || null;
  const r = await commercesDeLaZone({ lat: point.lat, lon: point.lon, rayon_m: e.rayon_m, filtres: filtresDe(metier ? [metier] : []) });
  if (!r.ok) { etape(id, 'commerces', 'ratee', r.error); noter(id, { etat: 'echec', fini_le: new Date().toISOString(), erreur: r.error }); return; }
  let commerces = (r.commerces || []).filter((c) => !c.vacant).map((c) => ({ ...c, metier: nomDe(c.genre), categorie: categorieDe(nomDe(c.genre)) }));
  etape(id, 'commerces', 'faite', `${commerces.length} commerces dans ${e.rayon_m} m`);
  noter(id, { commerces, nb_commerces: commerces.length });

  etape(id, 'societes', 'en_cours');
  let resolus = 0;
  commerces = await parLots(commerces, CONCURRENCE, async (c) => {
    const s = codeInsee ? await resoudreSociete(c, codeInsee) : null;
    if (s) resolus++;
    return { ...c, societe: s };
  });
  etape(id, 'societes', 'faite', `${resolus} sociétés identifiées sur ${commerces.length}`);
  noter(id, { commerces });

  etape(id, 'rue', 'en_cours');
  try {
    const tous = await commercesDeLaZone({ lat: point.lat, lon: point.lon, rayon_m: e.rayon_m, filtres: TOUS_LES_COMMERCES.filtres });
    const parRue = new Map();
    for (const c of tous.commerces || []) {
      const rue = normaliserRue((c.adresse || '').replace(/^\d+\w*\s+/, ''));
      if (rue) parRue.set(rue, (parRue.get(rue) || 0) + 1);
    }
    commerces = commerces.map((c) => {
      const rue = normaliserRue((c.adresse || '').replace(/^\d+\w*\s+/, ''));
      const n = rue ? parRue.get(rue) || 0 : null;
      return { ...c, rue_nb_commerces: n, rue_typologie: n == null ? null : typologieRue(n) };
    });
    etape(id, 'rue', 'faite', `${parRue.size} rues comptées`);
  } catch (err) { etape(id, 'rue', 'ratee', err?.message || String(err)); }
  noter(id, { commerces });

  if (criteres.immobilier?.length) {
    etape(id, 'foncier', 'en_cours');
    try {
      const parcelles = await parcellesAutour(point.lat, point.lon, e.rayon_m);
      const sections = new Map();
      commerces = await Promise.all(commerces.map(async (c) => {
        const p = parcelles.find((x) => contient(x.geometry, c.lon, c.lat));
        if (!p) return { ...c, foncier: null };
        const k = `${p.code_insee}|${p.section}`;
        if (!sections.has(k)) sections.set(k, locauxDeSection(p.code_insee, p.section).then((d) => grouperProprietaires(d.lignes)).catch(() => ({})));
        const proprietaires = (await sections.get(k))[p.numero] || [];
        return {
          ...c,
          parcelle: { idu: p.idu, section: p.section, numero: p.numero, contenance: p.contenance },
          foncier: {
            proprietaire_foncier: proprietaires.length > 0,
            proprietaire_exploitant: !!c.societe?.siren && proprietaires.some((x) => x.siren === c.societe.siren),
            copropriete: proprietaires.some((x) => /syndic/i.test(x.droit || '')),
            proprietaires: proprietaires.map(({ nom, siren, droit, lots }) => ({ nom, siren, droit, lots: lots.length })),
          },
        };
      }));
      etape(id, 'foncier', 'faite', `${commerces.filter((c) => c.foncier).length} commerces rattachés à une parcelle`);
    } catch (err) { etape(id, 'foncier', 'ratee', err?.message || String(err)); }
  } else etape(id, 'foncier', 'sautee', 'aucun critère immobilier');
  noter(id, { commerces });

  if (criteres.etab_gerant?.length) {
    etape(id, 'gerants', 'en_cours');
    commerces = await parLots(commerces, CONCURRENCE, async (c) => (c.societe ? { ...c, societe: { ...c.societe, etablissements_gerant: await etablissementsDuGerant(c.societe) } } : c));
    etape(id, 'gerants', 'faite');
  } else etape(id, 'gerants', 'sautee', 'critère non demandé');

  etape(id, 'criteres', 'en_cours');
  const retenus = commerces.filter((c) => correspond(c, criteres)).map((c) => c.id);
  etape(id, 'criteres', 'faite', `${retenus.length} commerces retenus sur ${commerces.length}`);
  noter(id, { commerces, retenus, nb_retenus: retenus.length, etat: 'terminee', fini_le: new Date().toISOString(), progression: 100 });
}

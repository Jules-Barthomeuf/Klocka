// Les cinq outils de l'analyse hors documents, et leurs lancements (11 nov. 2026, Jules : « l'outil est un moteur, ce
// qu'on regarde dans un dossier est une analyse produite par ce moteur ; un seul composant de résultat, affiché à deux
// endroits »).
//
//   locataire    que vaut sa signature ? (annuaire des entreprises, comptes publics, BODACC, Google)
//   loyer        le loyer tient-il face au marché ? (Equimmox)
//   prix         le prix et le rendement sont-ils justes ? (DVF, taux validés de la ville)
//   emplacement  un commerce peut-il vivre ici, celui-là ou le suivant ? (l'outil Rue, outils/rue.js)
//   ville        la ville porte-t-elle l'investissement ? (API Géo, INSEE ; gardée par commune, partagée entre dossiers)
//
// Chaque lancement est un objet enregistré (LancementOutil) : l'outil, les entrées lues, la date, le résultat et ses
// preuves. Relancer crée un nouveau lancement et garde l'ancien ; le dossier montre le dernier. Chaque outil tourne
// seul : s'il échoue ou traîne, les autres s'affichent quand même. Rien n'est deviné : une source muette laisse son
// point « vide » avec sa raison. Data-B n'y entre pas.

import crypto from 'crypto';
import { Records } from '../db.js';

export const ENTITE = 'LancementOutil';
const val = (c) => (c && typeof c === 'object' && 'valeur' in c ? (c.absent === false || c.absent === undefined ? c.valeur : null) : c);
const euros = (n) => `${Math.round(n).toLocaleString('fr-FR')} €`;
const pct = (n, d = 0) => `${Number(n).toLocaleString('fr-FR', { maximumFractionDigits: d })} %`;
const VILLE_JOURS = 30;

// L'ordre de l'écran, et les entrées dont chaque outil dépend : si l'une change dans le dossier, il est « à relancer ».
export const OUTILS = [
  { cle: 'locataire', nom: 'Locataire', question: 'Que vaut sa signature ?', entrees: ['locataire', 'ville', 'loyer', 'siren'] },
  { cle: 'loyer', nom: 'Loyer', question: 'Le loyer tient-il face au marché ?', entrees: ['adresse', 'loyer', 'surface'] },
  { cle: 'prix', nom: 'Prix', question: 'Le prix et le rendement sont-ils justes ?', entrees: ['adresse', 'prix', 'surface', 'loyer', 'echeance'] },
  { cle: 'emplacement', nom: 'Emplacement', question: 'Un commerce peut-il vivre ici, celui-là ou le suivant ?', entrees: ['adresse'] },
  { cle: 'ville', nom: 'Ville', question: "La ville porte-t-elle l'investissement ?", entrees: ['ville'] },
];
const LIBELLES_ENTREES = { siren: 'le SIREN du locataire', adresse: "l'adresse", locataire: 'le locataire', ville: 'la ville', loyer: 'le loyer', surface: 'la surface', prix: 'le prix', echeance: "l'échéance du bail" };

// --- Les jugements, purs ----------------------------------------------------------------------------------------------

/** Pure : le poids du loyer dans le chiffre d'affaires. Repères usuels du commerce : 10 % confortable, 15 % tendu. */
export function jugerEffort(loyer, ca) {
  if (!(loyer > 0) || !(ca > 0)) return null;
  const taux = Math.round((loyer / ca) * 1000) / 10;
  return { taux, statut: taux <= 10 ? 'ok' : taux <= 15 ? 'a_voir' : 'alerte' };
}

/** Pure : le loyer au m² du bien face au loyer de marché. Au-dessus de 15 % : risque de baisse au renouvellement. */
export function jugerLoyer(loyerM2, marcheM2) {
  if (!(loyerM2 > 0) || !(marcheM2 > 0)) return null;
  const ecart = Math.round(((loyerM2 / marcheM2) - 1) * 100);
  if (ecart > 15) return { ecart, statut: 'alerte', mot: `${ecart} % au-dessus du marché : risque de baisse au renouvellement` };
  if (ecart < -15) return { ecart, statut: 'ok', mot: `${-ecart} % sous le marché : marge à la hausse` };
  return { ecart, statut: 'ok', mot: 'dans le marché' };
}

/** Pure : le statut d'un verdict de prix. */
export function statutVerdictPrix(sens, mot) {
  if (!sens) return 'vide';
  if (sens === 'haut') return /légèrement/.test(mot || '') ? 'a_voir' : 'alerte';
  return 'ok';
}

const ORDRE = { alerte: 3, a_voir: 2, ok: 1, vide: 0 };
/** Pure : le statut d'un outil, le pire de ses points lus ; « vide » si rien n'a été lu. */
export function statutDesPoints(points) {
  return points.reduce((pire, p) => ((ORDRE[p.statut] ?? 0) > (ORDRE[pire] ?? 0) ? p.statut : pire), 'vide');
}

/** Pure : l'empreinte des entrées dont un outil dépend. */
export function empreinte(outil, entrees = {}) {
  const def = OUTILS.find((o) => o.cle === outil);
  const sous = Object.fromEntries((def?.entrees || []).map((k) => [k, entrees[k] ?? null]));
  return crypto.createHash('sha1').update(JSON.stringify(sous)).digest('hex').slice(0, 16);
}

/** Pure : ce qui a changé entre les entrées d'un lancement et celles d'aujourd'hui, pour cet outil. */
export function entreesChangees(outil, avant = {}, maintenant = {}) {
  const def = OUTILS.find((o) => o.cle === outil);
  return (def?.entrees || []).filter((k) => String(avant[k] ?? '') !== String(maintenant[k] ?? '')).map((k) => LIBELLES_ENTREES[k] || k);
}

const point = (cle, libelle, statut, resultat, source, detail = null, extra = {}) => ({ cle, libelle, statut, resultat, source, detail, ...extra });
const vide = (cle, libelle, raison, source = null) => point(cle, libelle, 'vide', raison, source);

// --- Les entrées d'un dossier -----------------------------------------------------------------------------------------

/** Ce que les outils lisent d'un lot : l'adresse, le locataire, les chiffres. Pure. */
export async function entreesDuLot(deal, index = 0) {
  const { adresseDuLot, prixFaiDuLot } = await import('../deal/comparaison-marche.js');
  const lu = entreesDe(deal, index, { adresseDuLot, prixFaiDuLot });
  // Une fiche Google simulée posée sur le lot (12 nov. 2026, Jules : « simule les avis pour le KFC à Lyon ») : elle ne sert
  // que si Google ne répond pas, et se dit simulée partout. Hors des entrées dont dépend l'outil : rien n'est « à relancer ».
  const simule = deal?.lots?.[index]?.avis_simules;
  const e = simule ? { ...lu, avis_simules: simule } : lu;
  // Le SIREN du preneur, s'il est connu : confirmé par l'analyste, sinon lu sur le Kbis de la Data Room. Avec lui, l'outil
  // Locataire ne devine plus la société d'après un nom et une adresse (12 nov. 2026, Jules : « fiable tout le temps »).
  const fixe = deal?.lots?.[index]?.locataire_siren;
  if (fixe) return { ...e, siren: fixe, siren_source: 'confirmé' };
  if (index === 0) {
    try {
      const { lireAnalyse } = await import('../deal/analyse-pieces.js');
      const kbis = lireAnalyse(deal.deal_id)?.grilles?.find((g) => g.id === 'kbis')?.lignes?.find((l) => l.id === 'immatriculation')?.valeur;
      const siren = sirenDuTexte(kbis);
      if (siren) return { ...e, siren, siren_source: 'kbis' };
    } catch { /* sans Kbis lu, l'outil cherche comme avant */ }
  }
  return e;
}

/** Pure : le SIREN écrit dans un texte (« RCS Lyon 981 167 141 », « 981167141 »). */
export function sirenDuTexte(t) {
  const m = String(t || '').match(/(?<!\d)(\d{3})[\s.\u00a0\u202f]?(\d{3})[\s.\u00a0\u202f]?(\d{3})(?!\d)/);
  return m ? `${m[1]}${m[2]}${m[3]}` : null;
}
export function entreesDe(deal, index, { adresseDuLot, prixFaiDuLot }) {
  const entree = deal?.lots?.[index];
  const lot = entree?.lot || {};
  const a = val(lot.adresse) || {};
  return {
    adresse: adresseDuLot(entree),
    ville: a.ville || entree?.enrichissement?.commune?.nom || null,
    locataire: String(val(lot.locataire_nom) || '').trim() || null,
    surface: Number(val(lot.surface_m2)) || null,
    loyer: val(lot.occupe) === false ? null : Number(val(lot.loyer_annuel_ht_hc)) || null,
    prix: prixFaiDuLot(lot),
    echeance: val(lot.bail_echeance) || null,
  };
}

// --- Les cinq outils --------------------------------------------------------------------------------------------------

const motsDe = (v) => String(v || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();

/**
 * Pure : l'établissement ouvert du local qui porte le nom du locataire (enseigne, dénomination ou nom affiché, l'un
 * contenant l'autre, forme juridique ôtée). `sansForme` : celle de l'outil Rue.
 */
export function reconnaitreLocataire(nom, exploitants, sansForme = (x) => x) {
  return candidatsLocataire(nom, exploitants, sansForme)[0] || null;
}
/** Pure : les établissements ouverts du local qui portent ce nom, le plus récent d'abord (un exploitant après l'autre). */
export function candidatsLocataire(nom, exploitants, sansForme = (x) => x) {
  const n = motsDe(sansForme(nom));
  if (n.length < 3) return [];
  const pareil = (v) => { const m = motsDe(sansForme(v)); return m.length >= 3 && (m === n || ` ${m} `.includes(` ${n} `) || ` ${n} `.includes(` ${m} `)); };
  return (exploitants || []).filter((x) => x.actif && [x.enseigne, x.denomination, x.nom].some(pareil))
    .sort((a, b) => String(b.ouvert || '').localeCompare(String(a.ouvert || '')));
}

// Les réponses des sources gardées un jour : une source qui tombe rend sa dernière réponse, datée, plutôt qu'une ligne vide.
const CACHE_SOURCES = 'CacheOutilLocataire';
export async function gardeUnJour(cle, fn) {
  const garde = Records.findBy(CACHE_SOURCES, 'cle', cle);
  if (garde && Date.now() - Date.parse(garde.le) < 86400000) return { valeur: garde.valeur, le: garde.le };
  try {
    const valeur = await reessayer(fn);
    if (garde) Records.update(CACHE_SOURCES, garde.id, { valeur, le: new Date().toISOString() });
    else Records.create(CACHE_SOURCES, { cle, valeur, le: new Date().toISOString() });
    return { valeur, le: new Date().toISOString() };
  } catch (err) {
    if (garde) return { valeur: garde.valeur, le: garde.le, perime: true };
    throw err;
  }
}
/** Deux nouveaux essais, espacés, avant d'abandonner : une source publique hoquette souvent une seconde. */
async function reessayer(fn, fois = 2) {
  let erreur;
  for (let i = 0; i <= fois; i += 1) {
    try { return await fn(); } catch (err) { erreur = err; if (i < fois) await new Promise((ok) => setTimeout(ok, 700 * (i + 1))); }
  }
  throw erreur;
}

const jourFr = (d) => String(d || '').slice(0, 10).split('-').reverse().join('/');
/**
 * Pure : ce que disent les procédures collectives des cinq dernières années, d'après le dernier jugement (BODACC).
 * Liquidation, redressement et sauvegarde ouverts : alerte ; un plan arrêté : à voir (l'entreprise continue, sous plan) ;
 * une clôture pour extinction du passif : à voir ; aucune : OK.
 */
export function lireProcedures(evenements) {
  // Seuls les avis de la famille « Procédures collectives » comptent : une modification dont le texte dit « collective »
  // (ELIOR, juillet 2025) n'en est pas une.
  const pr = (evenements || []).filter((x) => (x.famille ? x.famille === 'collective' : x.type === 'procédure collective')).sort((a, b) => String(b.date).localeCompare(String(a.date)));
  if (!pr.length) return { statut: 'ok', texte: 'Aucune procédure collective en 5 ans' };
  // Les avis de suivi (dépôt de l'état des créances, d'un projet de répartition) ne sont pas des jugements : le dernier
  // jugement décide ; sans lui, la procédure est dite passée, à vérifier.
  const jugements = pr.filter((x) => !/[ée]tat des cr[ée]ances|d[ée]p[ôo]t|r[ée]partition/i.test(x.jugement?.nature || ''));
  if (!jugements.length) return { statut: 'a_voir', texte: `Une procédure collective passée : ${(pr[0].jugement?.nature || 'avis').toLowerCase()} le ${jourFr(pr[0].jugement?.date || pr[0].date)}, à vérifier` };
  const der = jugements[0];
  const n = String(der.jugement?.nature || '').toLowerCase();
  const quand = jourFr(der.jugement?.date || der.date);
  const autres = pr.length > 1 ? ` (${pr.length} avis en 5 ans)` : '';
  if (/cl[ôo]ture/.test(n) && /extinction/.test(n)) return { statut: 'a_voir', texte: `Procédure close pour extinction du passif le ${quand}${autres}` };
  if (/cl[ôo]ture/.test(n)) return { statut: 'alerte', texte: `Liquidation close pour insuffisance d'actif le ${quand}${autres}` };
  if (/liquidation/.test(n)) return { statut: 'alerte', texte: `Liquidation judiciaire prononcée le ${quand}${autres}` };
  if (/plan/.test(n)) return { statut: 'a_voir', texte: `Sous plan ${/sauvegarde/.test(n) ? 'de sauvegarde' : /cession/.test(n) ? 'de cession' : 'de redressement'} arrêté le ${quand}${autres}` };
  if (/redressement/.test(n)) return { statut: 'alerte', texte: `Redressement judiciaire ouvert le ${quand}${autres}` };
  if (/sauvegarde/.test(n)) return { statut: 'alerte', texte: `Procédure de sauvegarde ouverte le ${quand}${autres}` };
  return { statut: 'alerte', texte: `${der.jugement?.nature || 'Procédure collective'} le ${quand}${autres}` };
}

/**
 * La société du locataire. D'abord à l'adresse : le registre dit qui exploite le local, ce qui donne le franchisé et
 * pas l'enseigne (KFC à Lyon est une SAS locale, pas KFC France). Puis par le nom. L'annuaire des entreprises donne la
 * fiche ; s'il ne répond pas, l'API Sirene de l'INSEE donne l'identité et data.economie.gouv.fr les comptes.
 */
async function societeDuLocataire(e) {
  const { societe, FORMES } = await import('../kzoning-societe.js');
  let local = null;
  let siren = null;
  let autres = [];
  if (e.siren) {
    // Le SIREN est connu : plus de reconnaissance par le nom.
    siren = e.siren;
    local = { source: e.siren_source === 'kbis' ? 'SIREN du Kbis' : 'SIREN confirmé', fixe: true, trouve: null };
  } else {
    if (e.adresse) {
      const { occupantsDuLocal, sansForme } = await import('./rue.js');
      local = await occupantsDuLocal(e.adresse).catch(() => null);
      if (local?.ok) {
        const c = candidatsLocataire(e.locataire, local.exploitants, sansForme);
        local.trouve = c[0] || null;
        autres = c.slice(1).map((x) => ({ siren: x.siren, nom: x.denomination || x.nom, enseigne: x.enseigne, depuis: x.ouvert }));
      } else local = null;
    }
    siren = local?.trouve?.siren || null;
    // Sans la BAN (panne, réseau), le registre de l'INSEE par nom et code postal, au même numéro de préférence. Le code
    // postal vient de l'adresse écrite, sinon de l'adresse reconnue par la BAN (« 3 Av. de la Gare, Firminy » n'en a pas).
    if (!siren && e.adresse) {
      const cp = String(e.adresse).match(/\b\d{5}\b/)?.[0] || String(local?.adresse || '').match(/\b\d{5}\b/)?.[0];
      const num = String(e.adresse).match(/^\s*(\d+)/)?.[1];
      const { etablissementsParNom } = await import('../insee-sirene.js');
      const es = cp ? await reessayer(() => etablissementsParNom(e.locataire, cp)).catch(() => []) : [];
      const auNumero = es.filter((x) => num && String(x.adresse || '').startsWith(`${num} `)).sort((a, b) => String(b.ouverture || '').localeCompare(String(a.ouverture || '')));
      const ici = auNumero[0] || (es.length === 1 ? es[0] : null);
      if (ici) {
        siren = ici.siren;
        local = { ...(local || {}), source: 'API Sirene (INSEE)', trouve: { siren: ici.siren, enseigne: ici.enseigne, ouvert: ici.ouverture, nom: ici.nom } };
        autres = (auNumero.length ? auNumero : es).filter((x) => x.siren !== ici.siren).map((x) => ({ siren: x.siren, nom: x.nom, enseigne: x.enseigne, depuis: x.ouverture, adresse: x.adresse }));
      }
    }
  }
  autres = [...new Map(autres.filter((x) => x.siren && x.siren !== siren).map((x) => [x.siren, x])).values()].slice(0, 4);
  const r = await societe(siren ? { siret: siren } : { nom: [e.locataire, e.ville].filter(Boolean).join(' ') }).catch((err) => ({ ok: false, error: err?.message || String(err) }));
  if (r.ok) return { s: { ...r.societe, source: 'Annuaire des entreprises' }, local, autres };
  const injoignable = /fetch failed|ECONN|abort|n'a pas répondu/i.test(r.error || '');
  if (siren) {
    const { uniteLegale } = await import('../insee-sirene.js');
    const u = await gardeUnJour(`insee:${siren}`, () => uniteLegale(siren)).catch(() => null);
    if (u?.valeur) return { s: { ...u.valeur, forme: FORMES[Number(u.valeur.forme_code)] || null, source: u.perime ? `API Sirene (INSEE), lue le ${jourFr(u.le)}` : 'API Sirene (INSEE)' }, local, autres };
  }
  return { s: null, local, autres, raison: injoignable ? "L'annuaire des entreprises est injoignable." : r.error || 'Aucune société ne correspond.' };
}

const SOURCE_COMPTES = 'Comptes déposés (INPI, data.economie.gouv.fr)';

/**
 * Pure : la ligne « Poids du loyer » d'après les comptes déposés (12 nov. 2026, Jules : elle revient en troisième mesure
 * du Locataire, lue seulement quand des comptes existent). Le dernier exercice de moins de trois ans ; un chiffre
 * d'affaires nul ou absent est confidentiel ; une perte se dit. `ei` : une entreprise individuelle ne publie pas.
 */
export function pointComptes(comptes, loyer, { annee = new Date().getFullYear(), ei = false } = {}) {
  const L = 'Poids du loyer';
  if (ei) return point('comptes', L, 'vide', 'Entreprise individuelle : pas de comptes publiés.', SOURCE_COMPTES);
  const tous = (comptes || []).filter((c) => Number(c.exercice) > 0).sort((a, b) => Number(b.exercice) - Number(a.exercice));
  const recents = tous.filter((c) => Number(c.exercice) >= annee - 3);
  if (!recents.length) return point('comptes', L, 'vide', tous.length ? `Derniers comptes publiés en ${tous[0].exercice}, trop anciens pour juger.` : 'Comptes non publiés.', SOURCE_COMPTES);
  const c = recents.find((x) => x.chiffre_affaires > 0) || recents[0];
  const res = Number.isFinite(c.resultat_net) ? c.resultat_net : null;
  const detail = { exercice: Number(c.exercice), chiffre_affaires: c.chiffre_affaires > 0 ? c.chiffre_affaires : null, resultat_net: res, loyer: loyer || null };
  const resultat = res == null ? '' : res < 0 ? `, perte de ${euros(-res)}` : `, résultat ${euros(res)}`;
  if (c.chiffre_affaires > 0 && loyer > 0) {
    const j = jugerEffort(loyer, c.chiffre_affaires);
    const taux = j.taux < 0.1 ? 'moins de 0,1 %' : pct(j.taux, 1);
    return point('comptes', L, j.statut, `${taux} du chiffre d'affaires · CA ${euros(c.chiffre_affaires)} en ${c.exercice}${resultat}`, SOURCE_COMPTES, { ...detail, taux: j.taux });
  }
  if (c.chiffre_affaires > 0) return point('comptes', L, 'vide', `CA ${euros(c.chiffre_affaires)} en ${c.exercice}${resultat} ; loyer manquant dans le dossier`, SOURCE_COMPTES, detail);
  // Comptes déposés, chiffre d'affaires confidentiel : seul le résultat se lit ; une perte est à voir.
  return point('comptes', L, res != null && res < 0 ? 'a_voir' : 'vide', `Chiffre d'affaires confidentiel en ${c.exercice}${resultat}`, SOURCE_COMPTES, detail);
}

/**
 * Pure : la ligne « Avis clients » d'après une fiche Google (Places API) ou une fiche simulée posée sur le lot (`simule`),
 * tant que Google n'est pas branché. La note, le nombre d'avis et le nom de la fiche ; plus les derniers avis (12 nov.
 * 2026, Jules : « enlève les derniers avis »).
 */
export function pointAvis(p, { simule = false } = {}) {
  const note = Number(p.rating ?? p.note) || null;
  const n = Number(p.userRatingCount ?? p.nombre) || 0;
  const nom = p.displayName?.text || p.nom || null;
  const ferme = p.businessStatus ? p.businessStatus !== 'OPERATIONAL' : p.ouvert === false;
  const statut = ferme ? 'alerte' : !note ? 'a_voir' : note >= 4 && n >= 20 ? 'ok' : note < 3.5 ? 'alerte' : 'a_voir';
  return point('avis', 'Avis clients', statut,
    ferme ? `Fiche « ${nom} » marquée fermée` : `${note ? String(note).replace('.', ',') : '—'} sur 5, ${n.toLocaleString('fr-FR')} avis (« ${nom} »)${simule ? ' · simulé' : ''}`,
    simule ? 'Simulation : Google Maps pas encore branché' : 'Google Maps',
    { note, nombre: n, nom, ferme, simule }, { lien: simule ? null : p.googleMapsUri || null });
}

async function outilLocataire(e) {
  const P = [['societe', 'Société'], ['procedures', 'Procédures collectives'], ['comptes', 'Poids du loyer'], ['avis', 'Avis clients']];
  if (!e.locataire) return { points: P.map(([k, l]) => vide(k, l, 'Pas de nom de locataire dans le dossier.')) };
  const points = [];
  // L'avis Google ne dépend pas de la société : il part en même temps.
  const avis = avisGoogle(e);
  const { s, local, raison, autres = [] } = await societeDuLocataire(e);
  if (!s) {
    points.push(local?.exploitants?.length && !local.trouve
      ? point('societe', 'Société', 'a_voir', `Aucun établissement au nom de « ${e.locataire} » à cette adresse ; le registre y donne ${local.exploitants.filter((x) => x.actif).map((x) => x.nom).slice(0, 3).join(', ') || 'seulement des établissements fermés'}. ${raison}`, local.source)
      : vide('societe', 'Société', `${raison} Nom cherché : « ${e.locataire} ».`, 'Annuaire des entreprises'));
    points.push(vide('procedures', 'Procédures collectives', 'Société non trouvée.'));
    points.push(vide('comptes', 'Poids du loyer', 'Société non trouvée.'));
  } else {
    const age = s.annee_creation ? new Date().getFullYear() - Number(s.annee_creation) : null;
    const ici = local?.trouve;
    // Trouvée par le nom seul (ni au local, ni au même numéro, ni fixée) : l'annuaire rend sa meilleure réponse à un
    // nom, qui peut être une autre société. On le dit, et la ligne reste à voir jusqu'à « C'est la bonne société ».
    const parLeNomSeul = !ici && !local?.fixe;
    // L'enseigne du local, si elle dit autre chose que la société ; une marque nationale portée par une société qui n'en
    // porte pas le nom fait un franchisé (KFC à Lyon : PKF LYON REPUBLIQUE).
    const enseigne = ici?.enseigne && ici.enseigne !== s.nom && !/code|interne|^\W*\d/i.test(ici.enseigne) ? ici.enseigne : null;
    let franchise = false;
    if (enseigne) {
      const { marqueDuNom } = await import('./rue.js');
      const { indexDesMarques } = await import('../enseignes-autour.js');
      const m = marqueDuNom(enseigne, indexDesMarques());
      franchise = !!m && !String(s.nom || '').toLowerCase().includes(String(m.n).toLowerCase());
    }
    points.push(point('societe', 'Société', !s.active ? 'alerte' : parLeNomSeul || (age != null && age < 2) ? 'a_voir' : 'ok',
      [s.nom, s.forme, s.active ? (age != null ? `créée en ${s.annee_creation} (${age} an${age > 1 ? 's' : ''})` : 'active') : 'fermée',
        ici ? `exploite le local${ici.ouvert ? ` depuis ${ici.ouvert.slice(0, 4)}` : ''}${enseigne ? ` sous l'enseigne ${enseigne}` : ''}` : null,
        parLeNomSeul ? 'trouvée par le nom seul, pas au local : à confirmer' : null].filter(Boolean).join(' · '),
      [...new Set([ici ? local.source : null, s.source].filter(Boolean))].join(' et '),
      { siren: s.siren, nom: s.nom, forme: s.forme || null, active: !!s.active, enseigne, franchise, activite: s.activite_code, etablissements_ouverts: s.etablissements_ouverts, categorie: s.categorie, effectif: s.effectif_societe, confirme: !!local?.fixe, origine: local?.source || null, depuis: ici?.ouvert || null, annee_creation: s.annee_creation || null, nom_seul: parLeNomSeul, autres },
      { lien: `https://annuaire-entreprises.data.gouv.fr/entreprise/${s.siren}` }));
    const { evenementsSociete } = await import('../bodacc.js');
    const lu = await gardeUnJour(`bodacc:${s.siren}`, () => evenementsSociete(s.siren, { mois: 60 })).catch(() => null);
    const ev = lu?.valeur || null;
    if (!ev) points.push(vide('procedures', 'Procédures collectives', "Le BODACC n'a pas répondu.", 'BODACC'));
    else {
      const pr = lireProcedures(ev);
      points.push(point('procedures', 'Procédures collectives', pr.statut, pr.texte, lu.perime ? `BODACC, lu le ${jourFr(lu.le)}` : 'BODACC', { evenements: ev.slice(0, 12) }, { lien: `https://www.bodacc.fr/pages/annonces-commerciales/?q.registre=registre:${s.siren}` }));
    }
    // Le poids du loyer revient (12 nov. 2026, Jules, refonte du bloc Locataire) : lu quand des comptes existent. L'annuaire
    // rend les comptes avec la fiche ; par l'INSEE, ils se lisent à part et se gardent un jour.
    const ei = String(s.forme_code || '') === '1000' || /entrepreneur individuel/i.test(s.forme || '');
    let comptes = s.comptes || [];
    if (!comptes.length && !ei) {
      const { comptesDe } = await import('../kzoning-societe.js');
      comptes = (await gardeUnJour(`comptes:${s.siren}`, () => comptesDe(s.siren)).catch(() => null))?.valeur || [];
    }
    points.push(pointComptes(comptes, e.loyer, { ei }));
  }
  points.push(await avis);
  return { points, resume: s?.nom || null };
}

async function avisGoogle(e) {
  // Tant que Google ne répond pas, une fiche simulée posée sur le lot la remplace, dite simulée (12 nov. 2026, Jules).
  const sinon = (raison) => (e.avis_simules ? pointAvis(e.avis_simules, { simule: true }) : vide('avis', 'Avis clients', raison, 'Google Maps'));
  const k = (process.env.GOOGLE_MAPS_SERVEUR || '').trim();
  if (!k) return sinon("Google Maps n'est pas configuré sur ce serveur.");
  try {
    const r = await fetch('https://places.googleapis.com/v1/places:searchText', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'X-Goog-Api-Key': k, 'X-Goog-FieldMask': 'places.displayName,places.rating,places.userRatingCount,places.googleMapsUri,places.businessStatus' },
      body: JSON.stringify({ textQuery: [e.locataire, e.adresse].filter(Boolean).join(', '), languageCode: 'fr', maxResultCount: 1 }),
      signal: AbortSignal.timeout(10000),
    });
    if (!r.ok) return sinon(`Google Maps a répondu ${r.status}.`);
    const p = ((await r.json()).places || [])[0];
    if (!p) return sinon('Pas de fiche Google à ce nom et cette adresse.');
    return pointAvis(p);
  } catch (err) {
    return sinon(`Google Maps n'a pas répondu (${err?.message || err}).`);
  }
}

// Le loyer de marché d'une adresse, lu une fois quand Loyer et Prix partent ensemble (Equimmox est lent et payant).
// La référence est celle de la préanalyse (valeur-locative.js, loyerDeReference) : même lecture, même échelle, même
// chiffre, pour que les deux écrans disent le même écart (12 nov. 2026, Jules).
const loyersEnVol = new Map();
function loyerDeMarche(adresse) {
  if (loyersEnVol.has(adresse)) return loyersEnVol.get(adresse);
  const p = (async () => {
    const { valeurLocative, loyerDeReference } = await import('../valeur-locative.js');
    const lire = (o) => valeurLocative(adresse, o).catch((err) => ({ ok: false, error: err?.message || String(err) }));
    let v = await lire();
    let ref = v.ok ? loyerDeReference(v.resultat) : null;
    // La page Equimmox photographiée, à chaque fois (12 nov. 2026, Jules : « une image exacte de ce que l'IA a fait ; il
    // faut à chaque fois que ce soit le cas ») : une lecture gardée d'avant les captures se relit une fois ; si Equimmox
    // ne répond pas, la lecture gardée reste, sans image.
    if (ref && !ref.niveau?.capture) {
      const neuve = await lire({ forcer: true });
      const refNeuve = neuve.ok ? loyerDeReference(neuve.resultat) : null;
      if (refNeuve?.niveau?.capture) { v = neuve; ref = refNeuve; }
    }
    return { v, ref, niveau: ref?.niveau || null, m2: ref?.m2 ?? null };
  })().finally(() => setTimeout(() => loyersEnVol.delete(adresse), 60000).unref?.());
  loyersEnVol.set(adresse, p);
  return p;
}

/** Pure : la ligne « Loyer face au marché », d'après la référence (loyerDeReference) et le loyer au m² du bien. */
export function pointLoyer(ref, loyerM2, niveaux = null) {
  const ou = `${ref.ou} (${ref.niveau.rayon || ref.niveau.nom || ''})`.replace(' ()', '');
  const marche = `${ref.reference === 'moyenne' ? 'une moyenne de' : 'un milieu de fourchette de'} ${ref.m2} €/m²/an ${ou}${ref.bas != null && ref.haut != null ? `, de ${ref.bas} à ${ref.haut}` : ''}`;
  const j = jugerLoyer(loyerM2, ref.m2);
  return {
    point: point('loyer_marche', 'Loyer face au marché', j?.statut || 'a_voir',
      j ? `${loyerM2} €/m²/an face à ${marche} : ${j.mot}` : `Marché : ${marche} ; loyer ou surface du bien manquant`,
      'Equimmox', { niveaux, echelle: ref.echelle, reference: ref.reference, loyer_m2: loyerM2, marche_m2: ref.m2 }, { lien: ref.niveau.capture || null }),
    resume: j ? (j.ecart > 0 ? `+${j.ecart} % vs marché` : j.ecart < 0 ? `${j.ecart} % vs marché` : 'au marché') : null,
  };
}

/** Pure : la ligne Loyer d'après une lecture ancienne, toujours « à voir », avec sa date et la raison. */
export function pointLoyerAncien(ref, loyerM2, le, raison = null) {
  const { point: p } = pointLoyer(ref, loyerM2);
  const date = new Date(le).toLocaleDateString('fr-FR', { day: 'numeric', month: 'long', year: 'numeric', timeZone: 'Europe/Paris' });
  return { ...p, statut: 'a_voir', resultat: `${p.resultat} · lecture Equimmox du ${date}${raison ? ` ; aujourd'hui : ${raison}` : ''}` };
}

async function outilLoyer(e) {
  if (!e.adresse) return { points: [vide('loyer_marche', 'Loyer face au marché', "Pas d'adresse dans le dossier.")] };
  const { v, ref } = await loyerDeMarche(e.adresse);
  // Le témoin du jour, après cette lecture : Equimmox a-t-il changé sa page ? (equimmox-temoin.js)
  import('../equimmox-temoin.js').then((m) => m.verifierTemoinDuJour()).catch(() => {});
  const loyerM2 = e.loyer && e.surface ? Math.round(e.loyer / e.surface) : null;
  if (!ref) {
    // Equimmox ne répond pas aujourd'hui : la dernière lecture connue, datée et « à voir », plutôt qu'une case vide.
    const { derniereLectureConnue, loyerDeReference } = await import('../valeur-locative.js');
    const ancienne = await derniereLectureConnue(e.adresse).catch(() => null);
    const refAncienne = ancienne ? loyerDeReference(ancienne.resultat) : null;
    if (refAncienne) return { points: [pointLoyerAncien(refAncienne, loyerM2, ancienne.le, v.ok ? null : v.error)], resume: 'lecture ancienne' };
    return { points: [vide('loyer_marche', 'Loyer face au marché', v.ok ? "Equimmox n'a aucun loyer de commerce comparable autour." : v.error, 'Equimmox')] };
  }
  const { point: p, resume } = pointLoyer(ref, loyerM2, { rue: v.resultat.rue, quartier: v.resultat.quartier, ville: v.resultat.ville });
  return { points: [p], resume };
}

async function outilPrix(e) {
  if (!e.adresse) return { points: [vide('verdict_prix', 'Prix au m² face aux ventes', "Pas d'adresse dans le dossier."), vide('rendement', 'Rendement face au taux de la ville', "Pas d'adresse dans le dossier.")] };
  const { m2 } = await loyerDeMarche(e.adresse);
  const { verdictPrixAdresse } = await import('../deal/verdict-prix.js');
  const r = await verdictPrixAdresse({ adresse: e.adresse, prix: e.prix, surface: e.surface, loyer: e.loyer, echeance: e.echeance, loyerMarcheM2: m2 ? { median: m2, source: 'Equimmox' } : null })
    .catch((err) => ({ ok: false, error: err?.message || String(err) }));
  if (!r.ok) return { points: [vide('verdict_prix', 'Prix au m² face aux ventes', r.error, 'DVF'), vide('rendement', 'Rendement face au taux de la ville', r.error)] };
  const points = [];
  const c = r.comparaison;
  if (!e.prix || !e.surface) points.push(vide('verdict_prix', 'Prix au m² face aux ventes', 'Prix ou surface manquant dans le dossier.', 'DVF'));
  else if (!c) points.push(vide('verdict_prix', 'Prix au m² face aux ventes', r.dvf_erreur || 'Moins de 5 ventes de locaux comparables autour.', 'DVF'));
  else {
    const mot = c.ecart != null ? (c.ecart > 0 ? `${c.ecart} % au-dessus` : c.ecart < 0 ? `${-c.ecart} % en dessous` : 'au niveau') : null;
    const statut = statutVerdictPrix(r.verdict?.sens, r.verdict?.mot);
    // « Voir source » ouvre l'image des ventes exactes que le calcul a comparées (12 nov. 2026, Jules : « un screenshot
    // de ce que l'IA a vu ; juste une image, ça suffit ») : DVF est un fichier, pas une page (releve-dvf.js).
    const { ecrireReleveDvf } = await import('./releve-dvf.js');
    const releve = ecrireReleveDvf({ adresse: r.adresse, comparaison: c, surface: e.surface, statut, le: r.le });
    points.push(point('verdict_prix', 'Prix au m² face aux ventes', statut,
      `${euros(r.bien.prix_m2)}/m² ${mot ? `${mot} de la médiane des ventes (${euros(c.prix_m2.median)}/m², ${c.n} ventes, ${c.cercle})` : `face à ${c.n} ventes`}${r.verdict ? ` · ${r.verdict.mot}, confiance ${r.verdict.confiance}` : ''}`,
      'DVF (actes des notaires)', { comparaison: c, verdict: r.verdict, manque: r.manque }, { lien: releve }));
  }
  const cap = r.capitalisation;
  if (!r.bien.rendement) points.push(vide('rendement', 'Rendement face au taux de la ville', 'Prix ou loyer manquant dans le dossier.'));
  else if (!cap) points.push(point('rendement', 'Rendement face au taux de la ville', 'a_voir', `${pct(r.bien.rendement, 2)} brut ; pas de taux validé à ${r.ville || 'cette ville'} pour comparer`, 'Taux validés de la ville'));
  else {
    const ecart = cap.taux ? Math.round((r.bien.rendement - cap.taux) * 100) / 100 : null;
    points.push(point('rendement', 'Rendement face au taux de la ville', ecart == null ? 'a_voir' : ecart >= -0.25 ? 'ok' : ecart >= -0.75 ? 'a_voir' : 'alerte',
      `${pct(r.bien.rendement, 2)} brut face à un taux de marché de ${pct(cap.taux, 2)}${ecart != null ? ` (${ecart > 0 ? '+' : ''}${String(ecart).replace('.', ',')} pt)` : ''}`,
      cap.source_taux || 'Taux validés de la ville', { capitalisation: cap }));
  }
  return { points, resume: r.verdict ? r.verdict.mot : null };
}

/**
 * Pure : la ligne Vacance d'après l'outil Vacance (tauxDeLaRue) : le taux de la rue entière, locaux vides sur locaux
 * tranchés ; « à voir » sous le seuil de locaux de l'outil. `r` : sa réponse, ou { error }.
 */
export function pointVacance(r) {
  const S = "Outil Vacance (registre, OpenStreetMap, Google Maps)";
  if (!r?.ok || r.statut !== 200) return vide('vacance', 'Vacance', r?.etat === 'chargement' ? "La commune se recense encore : relancez dans quelques minutes." : r?.error || "L'outil Vacance n'a pas répondu.", S);
  const t = r.taux || {};
  if (t.taux == null) return vide('vacance', 'Vacance', `Aucun local tranché sur la rue (${t.locaux || 0} recensé${(t.locaux || 0) > 1 ? 's' : ''}).`, S);
  const detail = `${t.vacants} vide${t.vacants > 1 ? 's' : ''} sur ${t.tranches} locaux${t.incertains ? `, ${t.incertains} incertain${t.incertains > 1 ? 's' : ''}` : ''}`;
  if (!t.fiable) return point('vacance', 'Vacance', 'a_voir', `${String(t.taux).replace('.', ',')} % sur la rue (${detail}) : trop peu de locaux pour un taux sûr`, S, { taux: t });
  return point('vacance', 'Vacance', t.taux < 10 ? 'ok' : t.taux < 20 ? 'a_voir' : 'alerte', `${String(t.taux).replace('.', ',')} % sur la rue (${detail})`, S, { taux: t, troncons: r.troncons || [] });
}

/** Le taux de vacance de la rue par l'outil Vacance ; la première fois, la commune se recense (une à deux minutes). */
async function vacanceDeLaRue(adresse, { attente = 180000 } = {}) {
  const { tauxDeLaRue } = await import('./vacance-taux.js');
  const fin = Date.now() + attente;
  for (;;) {
    const r = await tauxDeLaRue({ commune: adresse.code_insee, voie: adresse.rue }).catch((err) => ({ ok: false, error: err?.message || String(err) }));
    if (!(r.ok && r.statut === 202) || Date.now() > fin) return r;
    await new Promise((ok) => setTimeout(ok, 10000));
  }
}

async function outilEmplacement(e) {
  const P = [['passage', 'Passage'], ['rotation', 'Rotation du local'], ['vacance', 'Vacance'], ['enseignes', 'Enseignes nationales']];
  if (!e.adresse) return { points: P.map(([k, l]) => vide(k, l, "Pas d'adresse dans le dossier.")) };
  const { analyserRue } = await import('./rue.js');
  const r = await analyserRue(e.adresse).catch((err) => ({ ok: false, error: err?.message || String(err) }));
  if (!r.ok) return { points: P.map(([k, l]) => vide(k, l, r.error, 'Outil Rue')) };
  const x = r.resultat;
  const note = x.note_analyste?.note ?? x.passage?.note ?? null;
  const rot = x.local.rotation;
  // La vacance de la rue vient de l'outil Vacance (12 nov. 2026, Jules) : il tranche chaque local avec le registre,
  // OpenStreetMap et Google Maps, là où les « cellules vides » de l'outil Rue ne lisaient que le registre.
  const vac = await vacanceDeLaRue(x.adresse);
  return {
    conclusion: x.conclusion.phrase, statut: x.conclusion.statut,
    rue_id: r.id, rue: x,
    points: [
      note == null ? vide('passage', 'Passage', 'Ni commerces, ni transports, ni photo lus.', 'Outil Rue')
        : point('passage', 'Passage', note >= 7 ? 'ok' : note >= 4.5 ? 'a_voir' : 'alerte', `${String(note).replace('.', ',')} / 10${x.note_analyste?.note != null ? " (note de l'analyste)" : x.passage?.confiance === 'basse' ? ' (provisoire : peu de lectures)' : ''}`, 'Indice Klocka, pas un comptage', { pourquoi: x.passage?.pourquoi || [] }),
      rot.statut === 'vide' ? vide('rotation', 'Rotation du local', rot.verdict, x.rue.source) : point('rotation', 'Rotation du local', rot.statut, rot.verdict, x.rue.source),
      pointVacance(vac),
      x.rue.ouvertes ? point('enseignes', 'Enseignes nationales', x.rue.part_enseignes_pct >= 30 ? 'ok' : x.rue.part_enseignes_pct >= 10 ? 'a_voir' : 'alerte', `${x.rue.part_enseignes_pct} % des commerces ouverts sont des enseignes nationales${x.rue.noms_enseignes.length ? ` (${x.rue.noms_enseignes.slice(0, 4).join(', ')})` : ''}`, 'Registre SIRENE et liste des marques')
        : vide('enseignes', 'Enseignes nationales', 'Aucun commerce ouvert connu dans la rue.', x.rue.source),
    ],
  };
}

/** Pure : la commune en chiffres (surface en km², densité) d'après l'API Géo. */
export function communeLisible(c) {
  if (!c) return null;
  const km2 = c.surface ? Math.round(c.surface / 100) : null;
  return { code: c.code, nom: c.nom, population: c.population ?? null, surface_km2: km2, densite_km2: km2 && c.population ? Math.round(c.population / km2) : null, departement: c.departement?.nom || c.departement || null, region: c.region?.nom || c.region || null };
}

/** Pure : le code de la commune entière pour un arrondissement municipal (Paris, Lyon, Marseille), sinon le code tel quel. */
export function codeCommuneDe(codeInsee) {
  const c = String(codeInsee || '');
  if (/^751\d\d$/.test(c)) return '75056';
  if (/^6938\d$/.test(c)) return '69123';
  if (/^132\d\d$/.test(c)) return '13055';
  return c || null;
}

async function outilVille(e) {
  const P = [['population', 'Population'], ['revenu', 'Revenu médian'], ['chomage', 'Chômage']];
  if (!e.ville) return { points: P.map(([k, l]) => vide(k, l, 'Pas de ville dans le dossier.')) };
  const { communeParNom, communeParCode, chiffresSources } = await import('../chiffres-commune.js');
  // L'API Géo hoquette (12 nov. 2026 : « Lyon » introuvable un matin) : deux essais, puis le code INSEE de l'adresse par
  // la BAN, ramené à la commune entière pour un arrondissement.
  let c = await reessayer(() => communeParNom(e.ville).then((x) => { if (!x) throw new Error('API Géo muette'); return x; }), 1).catch(() => null);
  if (!c && e.adresse) {
    const { resoudreAdresse } = await import('../adresse-ban.js');
    const a = await resoudreAdresse(e.adresse).catch(() => null);
    if (a?.code_insee) c = await reessayer(() => communeParCode(codeCommuneDe(a.code_insee)), 1).catch(() => null);
  }
  if (!c) return { points: P.map(([k, l]) => vide(k, l, `L'API Géo n'a pas rendu la commune « ${e.ville} » : relancez dans quelques minutes.`, 'API Géo')) };
  const s = await chiffresSources(c).catch(() => ({ manquants: [] }));
  const rev = s.revenu_median_uc;
  const montant = Number(rev?.valeur_euros_an);
  const ch = s.chomage_zone_emploi;
  const tx = Number(String(ch?.taux_pct ?? '').replace(',', '.'));
  // Les lectures entières restent dans les points (commune, revenu, chômage, logement) : l'écran s'en sert sans relire.
  return {
    commune: c.code,
    points: [
      point('population', 'Population', c.population >= 20000 ? 'ok' : 'a_voir', `${c.population.toLocaleString('fr-FR')} habitants à ${c.nom}`, 'API Géo (INSEE)', { ...communeLisible(c), logement: s.logement || null, manquants: s.manquants || [] }),
      montant > 0 ? point('revenu', 'Revenu médian', montant >= 21000 ? 'ok' : 'a_voir', `${euros(montant)} par an et par unité de consommation (${rev.annee})`, 'INSEE', { revenu: rev })
        : vide('revenu', 'Revenu médian', (s.manquants || []).find((m) => m.startsWith('revenu')) || 'Non publié.', 'INSEE'),
      tx > 0 ? point('chomage', 'Chômage', tx <= 8 ? 'ok' : tx <= 11 ? 'a_voir' : 'alerte', `${pct(tx, 1)} dans la zone d'emploi${ch?.zone_emploi ? ` de ${ch.zone_emploi}` : ''} (${ch.periode})`, 'INSEE', { chomage: ch })
        : vide('chomage', 'Chômage', (s.manquants || []).find((m) => m.startsWith('chômage')) || 'Non publié.', 'INSEE'),
    ],
  };
}

const MOTEURS = { locataire: outilLocataire, loyer: outilLoyer, prix: outilPrix, emplacement: outilEmplacement, ville: outilVille };

/** Pure : la conclusion en une phrase d'un outil, d'après ses points. */
export function conclusionDe(outil, points, resume = null) {
  const statut = statutDesPoints(points);
  const lus = points.filter((p) => p.statut !== 'vide');
  if (!lus.length) return { statut: 'vide', conclusion: points[0]?.resultat || 'Rien n’a pu être lu.' };
  const pire = lus.find((p) => p.statut === statut);
  const mot = statut === 'ok' ? (outil === 'ville' ? 'Rien à signaler' : outil === 'locataire' ? 'Solide' : 'Dans le marché') : pire.resultat;
  return { statut, conclusion: statut === 'ok' && resume ? `${mot} · ${resume}` : mot };
}

/** Le SIREN du locataire, confirmé par l'analyste (ou retiré, `null`) ; l'outil Locataire repart avec lui. */
export async function fixerSirenLocataire(deal, index, siren, user = null) {
  const propre = siren == null || siren === '' ? null : sirenDuTexte(siren);
  if (siren && !propre) return { ok: false, error: 'Un SIREN a neuf chiffres.' };
  const lots = (deal.lots || []).map((l, i) => (i === index ? { ...l, locataire_siren: propre } : l));
  Records.update('Deal', deal.id, { lots });
  const frais = { ...deal, lots };
  const [lancement] = lancerOutils(await entreesDuLot(frais, index), { outils: ['locataire'], dealId: deal.deal_id, index, user });
  return { ok: true, siren: propre, lancement };
}

// --- La note de l'IA ---------------------------------------------------------------------------------------------------

// La colonne « Note de l'IA » de chaque tableau (12 nov. 2026, Jules : « ce qu'elle pense concrètement du locataire, et
// nous après on peut checker ») : deux phrases au plus, écrites d'après les seuls points lus ; plus de liste « À vérifier ».
// Débranchée le soir même (Jules : « supprime complètement le truc note de l'IA ») : plus d'appel au modèle après un
// lancement ; la consigne et `noterParIA` restent, pour la rebrancher d'un mot si besoin.
const MODELE_NOTE = 'claude-haiku-4-5';
const SCHEMA_NOTE = {
  type: 'object',
  properties: { avis: { type: 'string', description: "Deux phrases au plus : ce que l'analyste doit en retenir." } },
  required: ['avis'],
};

/** Pure : deux phrases au plus (12 nov. 2026, Jules), même si le modèle en écrit davantage. */
export function deuxPhrases(texte) {
  const phrases = String(texte || '').replace(/\s+/g, ' ').trim().match(/[^.!?]+[.!?]+(?=\s|$)|[^.!?]+$/g) || [];
  return phrases.slice(0, 2).map((x) => x.trim()).join(' ');
}

/** Pure : la consigne de la note, d'après les entrées du dossier et les points lus par l'outil. */
export function consigneNote(outil, entrees, resultat) {
  const def = OUTILS.find((o) => o.cle === outil);
  const lignes = (resultat.points || []).map((p) => {
    const d = p.detail || {};
    const plus = p.cle === 'procedures' && d.evenements?.length ? ` [avis BODACC : ${d.evenements.slice(0, 6).map((x) => `${x.date} ${x.jugement?.nature || x.type}`).join(' ; ')}]`
      : p.cle === 'passage' && d.pourquoi?.length ? ` [pourquoi : ${d.pourquoi.join(' ; ')}]` : '';
    return `- ${p.libelle} (${p.statut}) : ${p.resultat}${plus}`;
  }).join('\n');
  const dossier = Object.entries(entrees || {}).filter(([, v]) => v != null && v !== '').map(([k, v]) => `${k} : ${v}`).join(' · ');
  const jour = new Date().toLocaleDateString('fr-FR', { day: 'numeric', month: 'long', year: 'numeric' });
  return `Nous sommes le ${jour}. Tu es analyste en immobilier commercial chez Klocka (murs de commerces achetés par des investisseurs). Un outil a répondu à la question « ${def?.question || outil} » pour un dossier.

Le dossier : ${dossier || 'rien de plus'}.
Ce que l'outil a lu :
${lignes || '- rien'}

Écris en deux phrases courtes (40 mots en tout au plus) ce que tu en penses concrètement, pour un investisseur qui achète ces murs. Appuie-toi seulement sur ces lignes, n'invente aucun fait ni chiffre. Une ligne « vide » veut dire que la source n'a pas répondu : n'en tire aucune conclusion, ne la cite pas. Français simple, pas de tiret cadratin, pas de liste.`;
}

export async function noterParIA(outil, entrees, resultat, { par = null } = {}) {
  // Rien de lu : pas d'appel au modèle, la note le dit.
  if (!(resultat.points || []).some((p) => p.statut !== 'vide')) return { avis: "Aucune source n'a répondu : rien à commenter pour l'instant.", le: new Date().toISOString(), modele: null };
  const { invokeLLM } = await import('../llm.js');
  const { mesurer } = await import('../llm-couts.js');
  const { resultat: r } = await mesurer({ operation: "note de l'IA d'un outil", libelle: outil, par }, () => invokeLLM({ prompt: consigneNote(outil, entrees, resultat), response_json_schema: SCHEMA_NOTE, modele: MODELE_NOTE, max_tokens: 400 }));
  return { avis: deuxPhrases(r?.avis), le: new Date().toISOString(), modele: MODELE_NOTE };
}

// --- Les lancements ---------------------------------------------------------------------------------------------------

const enCours = new Set();

/**
 * Lance un outil en fond et rend le lancement tout de suite (statut « en_cours »). Ville réutilise un lancement de la
 * même commune de moins de trente jours (partagé entre dossiers).
 */
export function lancerOutil(outil, entrees, { dealId = null, index = 0, user = null, moteur = null } = {}) {
  if (!MOTEURS[outil] && !moteur) return { ok: false, error: `Outil inconnu : ${outil}` };
  const cleCours = `${dealId || 'libre'}:${index}:${outil}:${empreinte(outil, entrees)}`;
  if (dealId && enCours.has(cleCours)) {
    const deja = dernierLancement(dealId, index, outil);
    if (deja) return { ok: true, lancement: deja, deja: true };
  }
  if (outil === 'ville' && entrees.ville) {
    // Un lancement sans rien de lu (API Géo muette ce jour-là) ne se partage pas : on relit.
    const recent = Records.filter(ENTITE, { outil: 'ville', statut: 'fini' })
      .filter((l) => l.resultat?.statut && l.resultat.statut !== 'vide' && String(l.entrees?.ville || '').toLowerCase() === String(entrees.ville).toLowerCase() && Date.now() - Date.parse(l.fini_le) < VILLE_JOURS * 86400000)
      .sort((a, b) => String(b.fini_le).localeCompare(String(a.fini_le)))[0];
    if (recent) {
      const copie = Records.create(ENTITE, { ...nettoyer(recent), deal_id: dealId, index, par: user?.email || null, partage_de: recent.id, lance_le: new Date().toISOString() }, user?.email);
      return { ok: true, lancement: copie };
    }
  }
  const rec = Records.create(ENTITE, { outil, entrees, empreinte: empreinte(outil, entrees), deal_id: dealId, index, statut: 'en_cours', lance_le: new Date().toISOString(), fini_le: null, par: user?.email || null }, user?.email);
  enCours.add(cleCours);
  (moteur || MOTEURS[outil])(entrees)
    .then((r) => {
      const c = conclusionDe(outil, r.points, r.resume);
      const resultat = { statut: r.statut || c.statut, conclusion: r.conclusion || c.conclusion, points: r.points, rue_id: r.rue_id || null, rue: r.rue || null, commune: r.commune || null };
      Records.update(ENTITE, rec.id, { statut: 'fini', fini_le: new Date().toISOString(), resultat });
    })
    .catch((err) => {
      console.warn(`[outils] ${outil} : ${err?.message || err}`);
      Records.update(ENTITE, rec.id, { statut: 'echec', fini_le: new Date().toISOString(), erreur: err?.message || String(err) });
    })
    .finally(() => enCours.delete(cleCours));
  return { ok: true, lancement: rec };
}

const nettoyer = ({ id, created_date, updated_date, created_by, ...reste }) => reste;

/** Lance plusieurs outils sur les mêmes entrées ; chacun tourne seul. */
export function lancerOutils(entrees, { outils = null, dealId = null, index = 0, user = null } = {}) {
  const liste = OUTILS.map((o) => o.cle).filter((k) => !outils || outils.includes(k));
  return liste.map((k) => lancerOutil(k, entrees, { dealId, index, user })).map((r) => r.lancement).filter(Boolean);
}

export function dernierLancement(dealId, index, outil) {
  const l = Records.filter(ENTITE, { deal_id: dealId, outil }).filter((x) => (x.index ?? 0) === index)
    .sort((a, b) => String(b.lance_le).localeCompare(String(a.lance_le)))[0] || null;
  return l ? sansOrphelin(l) : null;
}

const ORPHELIN_MS = 10 * 60000;
/**
 * Un lancement « en cours » depuis plus de dix minutes a été coupé (serveur relancé pendant la lecture) : il passe en
 * échec, pour que l'écran propose de relancer au lieu de tourner sans fin.
 */
function sansOrphelin(l) {
  if (l.statut !== 'en_cours' || Date.now() - Date.parse(l.lance_le) < ORPHELIN_MS || enCours.size && [...enCours].some((k) => k.startsWith(`${l.deal_id || 'libre'}:${l.index ?? 0}:${l.outil}:`))) return l;
  const maj = { statut: 'echec', fini_le: new Date().toISOString(), erreur: 'Lecture interrompue (serveur relancé) : relancez cet outil.' };
  Records.update(ENTITE, l.id, maj);
  return { ...l, ...maj };
}

/**
 * Pure : ce qui rend un outil « à relancer » dans un dossier : ses entrées ont changé depuis le lancement, ou, pour
 * Loyer et Prix, le loyer lu dans le bail ou les quittances diffère de celui de la fiche (écart de l'Analyse).
 */
export function aRelancer(lancement, entreesActuelles, { ecartLoyer = null } = {}) {
  if (!lancement || lancement.statut === 'en_cours') return null;
  const raisons = [];
  const changees = entreesChangees(lancement.outil, lancement.entrees || {}, entreesActuelles);
  if (changees.length) raisons.push(`${changees.join(', ')} ${changees.length > 1 ? 'ont changé' : 'a changé'} depuis le lancement`);
  if (ecartLoyer && ['loyer', 'prix'].includes(lancement.outil)) raisons.push(ecartLoyer);
  return raisons.length ? raisons.join(' ; ') : null;
}

/** L'état des cinq outils d'un lot de dossier : le dernier lancement de chacun, et s'il est à relancer. */
export async function etatDuDossier(deal, index = 0) {
  const entrees = await entreesDuLot(deal, index);
  let ecartLoyer = null;
  try {
    const { lireAnalyse } = await import('../deal/analyse-pieces.js');
    const e = lireAnalyse(deal.deal_id)?.ecarts?.find((x) => x.cle === 'loyer');
    if (e?.ecart && !e.retenu) ecartLoyer = `les pièces ne donnent pas le même loyer (${e.valeurs.map((v) => `${v.source} ${v.valeur}`).join(', ')})`;
  } catch { /* sans analyse des pièces, pas d'écart */ }
  const outils = OUTILS.map((o) => {
    const l = dernierLancement(deal.deal_id, index, o.cle);
    return { ...o, lancement: l, a_relancer: aRelancer(l, entrees, { ecartLoyer }), en_cours: l?.statut === 'en_cours' };
  });
  return { outils, entrees, en_cours: outils.some((o) => o.en_cours) };
}

/** L'historique des lancements, les plus récents d'abord ; `hors_dossier` : ceux lancés depuis la page Outils. */
export function historique({ limite = 100, horsDossier = false } = {}) {
  return Records.list(ENTITE).filter((l) => !horsDossier || !l.deal_id)
    .sort((a, b) => String(b.lance_le).localeCompare(String(a.lance_le))).slice(0, limite)
    .map(({ resultat, ...l }) => ({ ...l, resultat: resultat ? { statut: resultat.statut, conclusion: resultat.conclusion } : null }));
}

export function lireLancement(id) { return Records.get(ENTITE, id); }

/** Rattache un lancement fait hors dossier au dernier état d'un dossier : il devient le lancement de cet outil. */
export function rattacher(id, dealId, index = 0) {
  const l = Records.get(ENTITE, id);
  if (!l) return { ok: false, error: 'Lancement introuvable' };
  if (!Records.findBy('Deal', 'deal_id', dealId)) return { ok: false, error: 'Dossier introuvable' };
  const copie = Records.create(ENTITE, { ...nettoyer(l), deal_id: dealId, index, rattache_de: l.id, lance_le: new Date().toISOString() });
  return { ok: true, lancement: copie };
}

/** Marque un lancement vérifié par l'analyste (ou le rend à « lu »). */
export function verifier(id, verifie, user = null) {
  const l = Records.get(ENTITE, id);
  if (!l) return { ok: false, error: 'Lancement introuvable' };
  Records.update(ENTITE, id, { verifie: verifie ? { par: user?.email || null, le: new Date().toISOString() } : null });
  return { ok: true };
}

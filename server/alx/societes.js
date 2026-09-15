// Les portefeuilles : les sociétés qui possèdent des murs commerciaux dans une
// ville, et lequel de leurs biens sortira en premier.
//
// La prospection par la rue part d'une vitrine ; celle-ci part du bailleur.
// Le fichier DGFiP des locaux des personnes morales dit qui possède quoi, au
// 1er janvier de chaque millésime ; le modèle appris (score-ville.js) dit, pour
// chaque parcelle à vitrine, la probabilité qu'un local commercial s'y vende
// dans l'année. Une société se classe par la probabilité qu'AU MOINS UN de ses
// murs se vende, et ses murs se rangent par leur propre probabilité.
//
// Ce qui se mesure, et ce qui ne se mesure pas :
//   - DVF ne dit ni l'acheteur ni le vendeur : une vente de la société se
//     déduit d'une parcelle qu'elle tenait à un millésime et plus au suivant,
//     avec une vente DVF entre les deux (et l'achat, à l'inverse). Les
//     millésimes lus vont de 2021 à 2025, sans 2024, non publié ;
//   - la maturité fiscale (22 et 30 ans de détention) ne se calcule pas : il
//     faudrait la date d'acquisition, absente avant 2021, et le régime fiscal
//     (une SCI à l'IS n'en profite pas) ;
//   - les associés ne sont pas publiés : seuls les dirigeants le sont ;
//   - les profils (arbitre, transmission…) sont des faits affichés, pas des
//     poids : aucun n'a encore été mesuré contre les ventes réelles.

import { Records } from '../db.js';
import { scorer } from './score-ml.js';
import { contexteVille, variablesDeParcelle, tranchesDe, trancheDe, rangDans, raisonsDe } from './score-ville.js';

const GARDE_MS = 6 * 3600 * 1000;
const GARDE_ANNUAIRE_MS = 30 * 86400000;

// Les formes de sociétés privées. Le reste (communes, établissements publics,
// associations, « autres personnes morales ») ne vend pas à un investisseur.
export const FORMES_PRIVEES = new Set(['SCI', 'SC', 'SARL', 'SAS', 'SASU', 'SA', 'STE', 'SNC', 'EURL', 'SCPI', 'SCP', 'SCA', 'SCS', 'SELARL', 'SELAS']);
const PUBLIC = /\b(commune|d[ée]partement|r[ée]gion|m[ée]tropole|office public|hlm|habitat|logement|[ée]tat|sncf|ratp|centre hospitalier|universit[ée]|chambre de commerce|syndicat des copropri)/i;

/** Une société privée, qui peut vendre à un investisseur. */
export const estPrivee = (forme, nom) => FORMES_PRIVEES.has(String(forme || '').toUpperCase()) && !PUBLIC.test(String(nom || ''));

/** La probabilité qu'au moins un des biens se vende, les biens pris comme indépendants. */
export const probaAuMoinsUne = (probas) => 1 - probas.reduce((reste, p) => reste * (1 - p), 1);

/** Les millésimes distincts (l'année courante peut n'être qu'un alias du dernier publié). */
export function millesimesDistincts(pm) {
  const out = [];
  for (const a of [...pm.keys()].sort((x, y) => x - y)) {
    if (out.length && pm.get(a) === pm.get(out[out.length - 1])) continue;
    out.push(a);
  }
  return out;
}

const parcellesDe = (millesime, siren) => new Set((millesime?.sirens.get(siren) || []).filter((g) => !g.droit || g.droit === 'P').map((g) => g.parcelle));

/**
 * Les achats et ventes de murs commerciaux d'une société, déduits d'un
 * millésime au suivant et confirmés par une vente DVF entre les deux.
 * @returns {{type: 'vente'|'achat', parcelle: string, date: string}[]} du plus récent au plus ancien
 */
export function mouvementsDe(pm, siren, ventesParParcelle, { depuis = null } = {}) {
  const annees = millesimesDistincts(pm);
  const out = [];
  for (let i = 1; i < annees.length; i += 1) {
    const [a, b] = [annees[i - 1], annees[i]];
    const avant = parcellesDe(pm.get(a), siren);
    const apres = parcellesDe(pm.get(b), siren);
    const venteEntre = (parcelle) => (ventesParParcelle.get(parcelle) || []).filter((d) => d >= `${a}-01-01` && d < `${b}-01-01`).sort().pop() || null;
    for (const p of avant) if (!apres.has(p)) { const d = venteEntre(p); if (d) out.push({ type: 'vente', parcelle: p, date: d }); }
    for (const p of apres) if (!avant.has(p)) { const d = venteEntre(p); if (d) out.push({ type: 'achat', parcelle: p, date: d }); }
  }
  return out.filter((m) => !depuis || m.date >= depuis).sort((x, y) => y.date.localeCompare(x.date));
}

/** Depuis quel millésime la société tient la parcelle sans interruption. */
export function detentionDe(pm, siren, parcelle) {
  const annees = millesimesDistincts(pm);
  let depuis = null;
  for (const a of annees) depuis = parcellesDe(pm.get(a), siren).has(parcelle) ? (depuis ?? a) : null;
  return depuis == null ? null : { depuis, censuree: depuis === annees[0] };
}

/** Les profils : des faits lisibles, pas des poids. */
export function profilsDe({ mouvements = [], murs = 0, toutesCensurees = false, gerant70 = null, premierMillesime = 2021 }) {
  const ventes = mouvements.filter((m) => m.type === 'vente').length;
  const achats = mouvements.filter((m) => m.type === 'achat').length;
  const out = [];
  // Arbitrer, c'est acheter ET vendre ; acheter sans vendre, c'est investir.
  if (ventes >= 1 && achats >= 1) out.push({ cle: 'rotateur', mot: 'Arbitre', detail: `${ventes} vente${ventes > 1 ? 's' : ''} et ${achats} achat${achats > 1 ? 's' : ''} de murs commerciaux dans la commune depuis ${premierMillesime}.` });
  if (achats >= 2 && ventes === 0) out.push({ cle: 'acheteur', mot: 'Achète sans vendre', detail: `${achats} achats de murs commerciaux dans la commune depuis ${premierMillesime}, aucune vente : un acheteur, pas encore un vendeur.` });
  if (ventes >= 1 && achats === 0) out.push({ cle: 'liquidation', mot: 'Vend sans racheter', detail: `${ventes} vente${ventes > 1 ? 's' : ''} depuis ${premierMillesime}, aucun achat : un portefeuille qui se réduit.` });
  if (gerant70 === true && !mouvements.length && murs >= 2 && murs <= 6) out.push({ cle: 'transmission', mot: 'Transmission', detail: `Dirigeant de plus de 70 ans, ${murs} murs, aucun mouvement depuis ${premierMillesime}.` });
  if (!mouvements.length && toutesCensurees && murs > 0) out.push({ cle: 'stable', mot: `Stable depuis ${premierMillesime}`, detail: `Tous ses murs lui appartenaient déjà en ${premierMillesime}, premier millésime lu, et rien n'a bougé depuis. Quatre ans d'observation : ce n'est pas une détention longue.` });
  return out;
}

const adresseDe = (p) => (p ? [p.numero, p.rue].filter(Boolean).join(' ') || null : null);

/** L'accroche : le bien n°1 d'abord, le reste du portefeuille ensuite. */
export function accrocheDe({ nom, ville, murs, profils = [] }) {
  if (!murs.length) return null;
  const n1 = murs[0];
  const lieu = n1.adresse || `la parcelle ${n1.parcelle}`;
  const niveau = n1.tranche ? ` (${n1.tranche.libelle.toLowerCase()})` : '';
  const cles = new Set(profils.map((p) => p.cle));
  const debut = cles.has('transmission') ? 'Parler transmission avec le dirigeant, et proposer une sortie simple : '
    : cles.has('rotateur') || cles.has('liquidation') ? 'Société qui arbitre : '
      : '';
  if (murs.length === 1) return `${debut}proposer une offre sur ${lieu}${niveau}.`.replace(/^p/, debut ? 'p' : 'P');
  const phrase = `${debut}proposer une offre sur ${lieu}${niveau}, puis ouvrir la discussion sur ${murs.length === 2 ? 'son autre mur commercial' : `ses ${murs.length - 1} autres murs commerciaux`} à ${ville}.`;
  return debut ? phrase : phrase.charAt(0).toUpperCase() + phrase.slice(1);
}

// ---------------------------------------------------------------------------
// Une ville : toutes ses sociétés
// ---------------------------------------------------------------------------

const memo = new Map();

/** Le contexte de la ville et la probabilité de chaque parcelle à vitrine, gardés six heures. */
async function villeScoree(ville) {
  const garde = memo.get(ville.id);
  if (garde && Date.now() - garde.le < GARDE_MS) return garde.promesse;
  const promesse = (async () => {
    const s = scorer();
    if (!s) return { erreur: 'Aucun modèle entraîné.' };
    const ctx = await contexteVille(ville.code_insee);
    if (!ctx) return { erreur: `Pas de fichier des sociétés propriétaires pour le département ${String(ville.code_insee).slice(0, 2)} : ALX ne peut pas lire les portefeuilles de ${ville.nom}.` };
    const probaParParcelle = new Map();
    for (const parcelle of ctx.parcelles.keys()) probaParParcelle.set(parcelle, s.modele.predire(variablesDeParcelle(ctx, parcelle)));
    const probas = [...probaParParcelle.values()].sort((a, b) => b - a);
    return { ctx, s, probaParParcelle, probas, tranches: tranchesDe(s.metrics) };
  })();
  memo.set(ville.id, { promesse, le: Date.now() });
  promesse.then((r) => { if (r.erreur) memo.delete(ville.id); }, () => memo.delete(ville.id));
  return promesse;
}

const annuairesEnCache = () => new Map(Records.list('SocieteAnnuaire').map((r) => [r.siren, r]));
const gerant70De = (annuaire) => (annuaire?.annuaire?.gerants ? annuaire.annuaire.gerants.some((g) => g.tranche_age === '70+') : null);

/** Les sociétés de la ville qui possèdent au moins un mur commercial, classées. */
export async function listerSocietes(villeId) {
  const ville = Records.get('Ville', villeId);
  if (!ville?.code_insee) return { ok: false, erreur: 'Ville sans code INSEE.' };
  const v = await villeScoree(ville);
  if (v.erreur) return { ok: false, erreur: v.erreur };
  const { ctx, probaParParcelle, probas, tranches } = v;
  const dernier = ctx.pm.get(ctx.millesime);
  const annees = millesimesDistincts(ctx.pm);
  const annuaires = annuairesEnCache();
  const adresseCible = new Map(Records.filter('Cible', { ville_id: villeId }).filter((c) => c.score_ml?.parcelle && c.adresse).map((c) => [c.score_ml.parcelle, c.adresse]));

  const societes = [];
  for (const [siren, groupes] of dernier.sirens) {
    const pleins = groupes.filter((g) => !g.droit || g.droit === 'P');
    if (!pleins.length || !estPrivee(pleins[0].forme, pleins[0].nom)) continue;
    const murs = [...new Set(pleins.map((g) => g.parcelle))].filter((p) => probaParParcelle.has(p));
    if (!murs.length) continue;
    const ps = murs.map((p) => probaParParcelle.get(p));
    const meilleure = murs[ps.indexOf(Math.max(...ps))];
    const mouvements = mouvementsDe(ctx.pm, siren, ctx.ventesParParcelle);
    const toutesCensurees = murs.every((p) => detentionDe(ctx.pm, siren, p)?.censuree);
    const annuaire = annuaires.get(siren);
    societes.push({
      siren,
      nom: pleins[0].nom,
      forme: pleins[0].forme,
      murs: murs.length,
      parcelles_commune: new Set(pleins.map((g) => g.parcelle)).size,
      locaux: pleins.reduce((t, g) => t + (g.locaux || 0), 0),
      proba_vente: Math.round(probaAuMoinsUne(ps) * 10000) / 10000,
      ventes_attendues: Math.round(ps.reduce((t, p) => t + p, 0) * 100) / 100,
      meilleur: {
        parcelle: meilleure,
        adresse: adresseDe(ctx.parcelles.get(meilleure)) || adresseCible.get(meilleure) || null,
        proba: Math.round(probaParParcelle.get(meilleure) * 10000) / 10000,
        tranche: trancheDe(tranches, rangDans(probas, probaParParcelle.get(meilleure)))?.cle || null,
      },
      ventes: mouvements.filter((m) => m.type === 'vente').length,
      achats: mouvements.filter((m) => m.type === 'achat').length,
      profils: profilsDe({ mouvements, murs: murs.length, toutesCensurees, gerant70: gerant70De(annuaire), premierMillesime: annees[0] }).map((p) => p.cle),
      annuaire_lu: !!annuaire,
    });
  }
  societes.sort((a, b) => b.proba_vente - a.proba_vente || b.murs - a.murs);
  return {
    ok: true,
    ville: ville.nom,
    millesimes: annees,
    parcelles_a_vitrine: ctx.parcelles.size,
    societes,
  };
}

// ---------------------------------------------------------------------------
// Une société : son portefeuille, son décideur, son analyse
// ---------------------------------------------------------------------------

/** L'annuaire et le BODACC d'une société, gardés trente jours. */
async function annuaireDe(siren, { forcer = false } = {}) {
  const garde = Records.filter('SocieteAnnuaire', { siren })[0] || null;
  if (garde && !forcer && Date.now() - Date.parse(garde.le) < GARDE_ANNUAIRE_MS) return garde;
  const { societe } = await import('./annuaire.js');
  const { evenementsSociete } = await import('../bodacc.js');
  const [annuaire, evenements] = await Promise.all([
    societe({ siren }).catch(() => null),
    evenementsSociete(siren, { mois: 36 }).catch(() => null),
  ]);
  const fiche = { siren, annuaire, evenements: evenements || [], le: new Date().toISOString() };
  return garde ? Records.update('SocieteAnnuaire', garde.id, fiche) : Records.create('SocieteAnnuaire', fiche);
}

const pourcent = (x) => `${String(Math.round(x * 1000) / 10).replace('.', ',')} %`;

export async function detailSociete(villeId, siren, { forcer = false } = {}) {
  const ville = Records.get('Ville', villeId);
  if (!ville?.code_insee) return { ok: false, erreur: 'Ville sans code INSEE.' };
  const v = await villeScoree(ville);
  if (v.erreur) return { ok: false, erreur: v.erreur };
  const { ctx, s, probaParParcelle, probas, tranches } = v;
  const groupes = (ctx.pm.get(ctx.millesime).sirens.get(siren) || []).filter((g) => !g.droit || g.droit === 'P');
  if (!groupes.length) return { ok: false, erreur: 'Cette société ne possède rien dans la commune au dernier millésime.' };
  const annees = millesimesDistincts(ctx.pm);
  const libelles = s.colonnes?.libelles || {};
  const cibles = Records.filter('Cible', { ville_id: villeId });

  const murs = [...new Set(groupes.map((g) => g.parcelle))].filter((p) => probaParParcelle.has(p)).map((parcelle) => {
    const lieu = ctx.parcelles.get(parcelle);
    const variables = variablesDeParcelle(ctx, parcelle);
    const { proba, contributions } = s.modele.expliquer(variables);
    const ventes = ctx.ventesParParcelle.get(parcelle) || [];
    const derniere = (ctx.mutations.get(parcelle) || []).filter((m) => m.vente).pop() || null;
    return {
      parcelle,
      adresse: adresseDe(lieu) || cibles.find((c) => c.score_ml?.parcelle === parcelle)?.adresse || null,
      enseignes: lieu?.enseignes || [],
      vitrines: lieu?.vitrines_parcelle ?? null,
      lat: lieu?.lat ?? null,
      lon: lieu?.lon ?? null,
      locaux: groupes.filter((g) => g.parcelle === parcelle).reduce((t, g) => t + (g.locaux || 0), 0),
      rez_de_chaussee: groupes.some((g) => g.parcelle === parcelle && g.rez_de_chaussee),
      proba: Math.round(proba * 10000) / 10000,
      rang_part: rangDans(probas, proba),
      tranche: trancheDe(tranches, rangDans(probas, proba)),
      raisons: raisonsDe(contributions, variables, libelles, { max: 3 }),
      detention: detentionDe(ctx.pm, siren, parcelle),
      derniere_vente: derniere ? { date: derniere.date, prix: derniere.prix ?? null } : null,
      ventes_dvf: ventes.length,
      cibles: cibles.filter((c) => c.score_ml?.parcelle === parcelle).map((c) => ({ id: c.id, enseigne: c.enseigne || null, adresse: c.adresse || null, pile: c.pile })),
    };
  }).sort((a, b) => b.proba - a.proba).map((m, i) => ({ ...m, rang: i + 1 }));

  const mouvements = mouvementsDe(ctx.pm, siren, ctx.ventesParParcelle).map((m) => ({ ...m, adresse: adresseDe(ctx.parcelles.get(m.parcelle)) }));
  const fiche = await annuaireDe(siren, { forcer }).catch(() => null);
  const gerant70 = gerant70De(fiche);
  const profils = profilsDe({ mouvements, murs: murs.length, toutesCensurees: murs.length > 0 && murs.every((m) => m.detention?.censuree), gerant70, premierMillesime: annees[0] });
  const probaVente = probaAuMoinsUne(murs.map((m) => m.proba));
  const nom = groupes[0].nom;
  const moyenne = tranches?.[0]?.prevalence;

  const analyse = [];
  const autres = new Set(groupes.map((g) => g.parcelle)).size - murs.length;
  analyse.push(`${nom} possède ${murs.length} mur${murs.length > 1 ? 's' : ''} commercia${murs.length > 1 ? 'ux' : 'l'} à ${ville.nom}${autres > 0 ? `, et ${autres} autre${autres > 1 ? 's' : ''} parcelle${autres > 1 ? 's' : ''} sans vitrine connue` : ''}, ${groupes.reduce((t, g) => t + (g.locaux || 0), 0)} locaux en tout (fichier DGFiP ${ctx.millesime}).`);
  if (murs.length) analyse.push(`Selon le modèle, ${pourcent(probaVente)} de chances qu'au moins un de ces murs se vende dans l'année${moyenne ? ` (une adresse moyenne : ${pourcent(moyenne)})` : ''}. Le premier à sortir : ${murs[0].adresse || murs[0].parcelle}, ${murs[0].tranche ? murs[0].tranche.libelle.toLowerCase() : 'hors classement'}.`);
  const ventes = mouvements.filter((m) => m.type === 'vente');
  const achats = mouvements.filter((m) => m.type === 'achat');
  analyse.push(mouvements.length
    ? `Depuis ${annees[0]} : ${ventes.length} vente${ventes.length > 1 ? 's' : ''} et ${achats.length} achat${achats.length > 1 ? 's' : ''} de murs commerciaux dans la commune${mouvements[0] ? `, le dernier en ${mouvements[0].date.slice(0, 4)}` : ''}.`
    : `Aucun achat ni aucune vente de murs commerciaux dans la commune depuis ${annees[0]}.`);
  const a = fiche?.annuaire;
  if (a) {
    const dirigeants = (a.gerants || []).filter((g) => !g.personne_morale);
    analyse.push(`${a.forme || groupes[0].forme}${a.creation ? ` créée en ${a.creation.slice(0, 4)}` : ''}${a.siege?.ville ? `, siège à ${a.siege.ville}` : ''}${a.active === false ? ', fermée' : ''}. ${dirigeants.length ? `${dirigeants.length} dirigeant${dirigeants.length > 1 ? 's' : ''}${gerant70 ? ', dont au moins un de plus de 70 ans' : ''}.` : 'Aucun dirigeant personne physique publié.'}`);
  }
  if (fiche?.evenements?.length) analyse.push(`BODACC, 36 mois : ${fiche.evenements.slice(0, 3).map((e) => `${e.type} (${String(e.date).slice(0, 7)})`).join(', ')}${fiche.evenements.length > 3 ? '…' : ''}.`);

  return {
    ok: true,
    ville: ville.nom,
    societe: { siren, nom, forme: groupes[0].forme },
    proba_vente: Math.round(probaVente * 10000) / 10000,
    moyenne_adresse: moyenne ?? null,
    profils,
    murs,
    autres_parcelles: Math.max(0, autres),
    mouvements,
    decideur: a ? { nom: a.nom, forme: a.forme, creation: a.creation, active: a.active, siege: a.siege, gerants: a.gerants || [], lu_le: fiche.le } : null,
    evenements: fiche?.evenements || [],
    analyse,
    accroche: accrocheDe({ nom, ville: ville.nom, murs, profils }),
    limites: [
      `DVF ne nomme ni l'acheteur ni le vendeur : les ventes et achats sont déduits des millésimes DGFiP (${annees.join(', ')}) croisés avec les ventes DVF.`,
      'La maturité fiscale (22 et 30 ans de détention) ne se calcule pas : pas de date d\'acquisition avant 2021, et elle ne vaut que pour une société à l\'impôt sur le revenu.',
      'Les associés ne sont pas publiés ; les dirigeants le sont, avec une tranche d\'âge.',
      'Le modèle prédit la vente d\'un local commercial sur la parcelle, pas forcément celui de la société quand la parcelle a plusieurs propriétaires.',
    ],
    millesime: ctx.millesime,
  };
}

/** Pour les tests et le rechargement d'un modèle : oublie les villes scorées. */
export const oublierVilles = () => memo.clear();

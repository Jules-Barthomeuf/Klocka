// Off-market : ce qu'on fait des locaux. Les listes (figées ou dynamiques) et
// leur empilement, le pipeline par propriétaire, les courriers préparés par
// l'IA et validés à la main, l'opposition, « Aujourd'hui », le tableau de bord
// et la veille de nuit.
//
// Un espace par pipeline : « klocka » pour l'équipe, l'adresse du mandataire
// pour un mandataire. Un propriétaire est suivi par sa clé (SIREN, sinon nom)
// : son opposition survit à tout nouveau relevé, parce qu'elle n'est pas
// écrite sur le relevé. Rien ne part d'ici : un courrier validé est imprimé et
// posté par la personne, qui le dit d'un clic.

import { Records } from '../db.js';
import { passeFiltres as passeFiltresPartage } from '../../src/lib/off-market-filtres.js';
import { listerLocaux, ficheProprietaire, relevesDuProprietaire, cleProprietaire, territoiresDe, localDe, clientsActifs } from './locaux.js';

export const LISTE = 'OffMarketListe';
export const CONTACT = 'OffMarketContact';
export const COURRIER = 'OffMarketCourrier';
const maintenant = () => new Date().toISOString();
const jour = (d = new Date()) => new Date(d).toISOString().slice(0, 10);
const plusJours = (j, n) => { const d = new Date(`${j}T12:00:00Z`); d.setUTCDate(d.getUTCDate() + n); return d.toISOString().slice(0, 10); };
export const espaceDe = (user) => (user?.role === 'admin' ? 'klocka' : String(user?.email || '').toLowerCase());

export const STATUTS = ['a_contacter', 'contacte', 'en_discussion', 'dossier_recu', 'en_preanalyse', 'propose', 'perdu', 'veille'];
export const LIBELLES_STATUTS = { a_contacter: 'À contacter', contacte: 'Contacté', en_discussion: 'En discussion', dossier_recu: 'Dossier reçu', en_preanalyse: 'En pré-analyse', propose: 'Proposé à un client', perdu: 'Perdu', veille: 'En veille' };
const MOIS_SANS_RECONTACT = 6;

// ---------------------------------------------------------------------------
// Le suivi par propriétaire
// ---------------------------------------------------------------------------

/** Les contacts d'un espace, par clé de propriétaire. */
export const contactsDe = (espace) => new Map(Records.filter(CONTACT, { espace }).map((x) => [x.cle, x]));

export function contactDe(espace, cle) {
  return Records.filter(CONTACT, { espace, cle })[0] || null;
}

function poserContact(espace, cle, champs, { nom = null, siren = null } = {}) {
  const x = contactDe(espace, cle);
  if (x) return Records.update(CONTACT, x.id, { ...champs, maj_le: maintenant() });
  return Records.create(CONTACT, { espace, cle, siren: siren || (/^\d{9}$/.test(cle) ? cle : null), nom, statut: 'a_contacter', interactions: [], oppose: false, prochaine: null, nouveau_signal: null, cree_le: maintenant(), maj_le: maintenant(), ...champs });
}

/** Une interaction : courrier posté, appel, mail, réponse reçue, dossier reçu. */
export function noterInteraction(espace, cle, { canal, texte = null, statut = null, prochaine = null, courrier_id = null, user = null, motivation = null }, infos = {}) {
  const x = contactDe(espace, cle) || poserContact(espace, cle, {}, infos);
  const interaction = { le: maintenant(), canal, texte: texte ? String(texte).slice(0, 1000) : null, par: user?.email || null, courrier_id, motivation };
  const patch = { interactions: [...(x.interactions || []), interaction], nouveau_signal: null };
  if (statut && STATUTS.includes(statut)) patch.statut = statut;
  if (prochaine !== undefined) patch.prochaine = prochaine;
  return { ok: true, contact: Records.update(CONTACT, x.id, { ...patch, maj_le: maintenant() }) };
}

/** Changer l'étape du pipeline à la main. */
export function changerStatut(espace, cle, statut, user = null, infos = {}) {
  if (!STATUTS.includes(statut)) return { ok: false, error: 'Étape inconnue.' };
  const x = contactDe(espace, cle) || poserContact(espace, cle, {}, infos);
  if (x.oppose) return { ok: false, error: 'Ce propriétaire a demandé à ne plus être contacté.' };
  return { ok: true, contact: Records.update(CONTACT, x.id, { statut, interactions: [...(x.interactions || []), { le: maintenant(), canal: 'etape', texte: LIBELLES_STATUTS[statut], par: user?.email || null }], maj_le: maintenant() }) };
}

/** « Ne plus contacter » : tous les canaux, pour de bon, dans tous les espaces. */
export function opposer(cle, user = null, { motif = null } = {}) {
  const tous = Records.list(CONTACT).filter((x) => x.cle === cle);
  const champs = { oppose: true, oppose_le: maintenant(), oppose_par: user?.email || null, oppose_motif: motif ? String(motif).slice(0, 300) : null, prochaine: null };
  if (!tous.length) poserContact('klocka', cle, champs);
  for (const x of tous) Records.update(CONTACT, x.id, { ...champs, maj_le: maintenant() });
  // Les courriers encore à valider ne partent plus.
  for (const c of Records.list(COURRIER).filter((x) => x.cle === cle && x.etat === 'a_valider')) Records.update(COURRIER, c.id, { etat: 'ecarte', ecarte_le: maintenant(), ecarte_motif: 'opposition' });
  return { ok: true };
}
export const estOppose = (cle) => Records.list(CONTACT).some((x) => x.cle === cle && x.oppose);

// ---------------------------------------------------------------------------
// Les listes et l'empilement
// ---------------------------------------------------------------------------

/** Pure : un local passe-t-il les filtres d'une liste dynamique ? Les mêmes règles que l'écran, plus le territoire. */
export function passeFiltres(l, f = {}) {
  if (Array.isArray(f.villes) && f.villes.length && !f.villes.includes(l.ville_id)) return false;
  return passeFiltresPartage(l, f);
}

export function creerListe(espace, { nom, dynamique = false, filtres = {}, locaux = [] }, user = null) {
  const n = String(nom || '').trim().slice(0, 80);
  if (!n) return { ok: false, error: 'Nommez la liste.' };
  return { ok: true, liste: Records.create(LISTE, { espace, nom: n, dynamique: !!dynamique, filtres: filtres || {}, locaux: dynamique ? [] : [...new Set(locaux)].slice(0, 5000), cree_le: maintenant(), cree_par: user?.email || null }) };
}
export function modifierListe(espace, id, patch) {
  const l = Records.get(LISTE, id);
  if (!l || l.espace !== espace) return { ok: false, error: 'Liste introuvable.' };
  const champs = {};
  if (patch.nom != null) champs.nom = String(patch.nom).trim().slice(0, 80);
  if (patch.ajouter) champs.locaux = [...new Set([...(l.locaux || []), ...patch.ajouter])].slice(0, 5000);
  if (patch.retirer) champs.locaux = (champs.locaux || l.locaux || []).filter((x) => !patch.retirer.includes(x));
  if (patch.filtres) champs.filtres = patch.filtres;
  return { ok: true, liste: Records.update(LISTE, id, { ...champs, maj_le: maintenant() }) };
}
export function supprimerListe(espace, id) {
  const l = Records.get(LISTE, id);
  if (!l || l.espace !== espace) return { ok: false, error: 'Liste introuvable.' };
  Records.delete(LISTE, id);
  return { ok: true };
}
export const listesDe = (espace) => Records.filter(LISTE, { espace }).sort((a, b) => String(b.cree_le).localeCompare(String(a.cree_le)));

/**
 * Pure : l'empilement d'une liste de locaux : combien cumulent 1, 2, 3, 4
 * familles de signaux, et combien de propriétaires distincts (une SCI avec
 * six locaux n'est contactée qu'une fois).
 */
export function empilement(locaux) {
  const paliers = [0, 0, 0, 0, 0];
  const proprietaires = new Set();
  for (const l of locaux) { paliers[Math.min(4, l.familles || 0)] += 1; if (l.proprietaire?.cle) proprietaires.add(l.proprietaire.cle); }
  return { paliers: paliers.map((n, i) => ({ familles: i, n })), proprietaires: proprietaires.size, locaux: locaux.length };
}

/** Les locaux d'une liste, figée ou dynamique, dédoublonnés par propriétaire si demandé. */
export async function locauxDeLaListe(espace, id, user) {
  const l = Records.get(LISTE, id);
  if (!l || l.espace !== espace) return null;
  const villes = (await territoiresDe(user)).map((v) => v.id);
  const tous = await listerLocaux(l.dynamique && l.filtres?.villes?.length ? l.filtres.villes.filter((v) => villes.includes(v)) : villes, { contacts: contactsDe(espace) });
  const locaux = l.dynamique ? tous.filter((x) => passeFiltres(x, l.filtres)) : tous.filter((x) => (l.locaux || []).includes(x.id));
  return { ...l, locaux, empilement: empilement(locaux) };
}

// ---------------------------------------------------------------------------
// Les courriers : préparés par l'IA, validés par une personne
// ---------------------------------------------------------------------------

export const VARIANTES = { patrimoniale: 'Patrimoniale', professionnelle: 'Professionnelle', acheteur: 'Un acheteur identifié' };

/** Pure : quelle lettre pour quel propriétaire. */
export function varianteDe(fiche) {
  if (fiche.demande?.length) return 'acheteur';
  if (['marchand', 'fonciere', 'institutionnel', 'holding', 'sci_pro'].includes(fiche.profil?.cle)) return 'professionnelle';
  return 'patrimoniale';
}

/**
 * Pure : les portes qualité avant d'écrire à un propriétaire (règle 7 de la
 * fiabilité) : exact, privé, non opposé, un siège, pas écrit depuis six mois.
 */
export function porteQualite(fiche, contact, { maintenantMs = Date.now() } = {}) {
  if (!fiche) return 'propriétaire inconnu';
  if (fiche.profil?.cle === 'public') return 'propriétaire public';
  if (fiche.confiance?.niveau !== 'exacte') return `propriétaire ${fiche.confiance?.libelle?.toLowerCase() || 'non confirmé'}`;
  if (contact?.oppose) return 'a demandé à ne plus être contacté';
  if (!fiche.contact?.adresse_siege) return 'pas d\'adresse de siège';
  const dernier = (contact?.interactions || []).filter((i) => ['courrier', 'mail', 'appel'].includes(i.canal)).at(-1);
  if (dernier && maintenantMs - Date.parse(dernier.le) < MOIS_SANS_RECONTACT * 30.44 * 86400000) return `déjà contacté le ${String(dernier.le).slice(0, 10)}`;
  return null;
}

const SIGNATURE = (user) => [user?.full_name || user?.email || 'Klocka', user?.role === 'mandataire' ? 'K Partners, par Klocka' : 'Klocka', user?.telephone || ''].filter(Boolean).join('\n');

/** La lettre d'un propriétaire, rédigée par le modèle à partir des seuls faits publics. */
export async function redigerCourrier(fiche, variante, user, { rediger = null } = {}) {
  const locaux = fiche.patrimoine?.locaux || [];
  const premier = locaux[0];
  const faits = [
    `Destinataire : ${fiche.nom}${fiche.forme ? ` (${fiche.forme})` : ''}, siège ${fiche.contact?.adresse_siege}`,
    `Local${locaux.length > 1 ? 'aux' : ''} concerné${locaux.length > 1 ? 's' : ''} : ${locaux.slice(0, 4).map((l) => `${l.adresse}, ${l.ville}${l.enseigne ? ` (${l.enseigne})` : ''}`).join(' ; ')}${locaux.length > 4 ? ` ; et ${locaux.length - 4} autres` : ''}`,
    variante === 'acheteur' ? `Nous avons ${fiche.demande.length === 1 ? 'un investisseur' : fiche.demande.length <= 3 ? `${fiche.demande.length} investisseurs` : 'plusieurs investisseurs'} dont la recherche correspond à ce type de local, financement en place.` : null,
    variante === 'professionnelle' && premier?.marche?.fourchette ? `Fourchette de valeur estimée du premier local : ${premier.marche.fourchette[0]} à ${premier.marche.fourchette[1]} euros (loyer de marché de la rue divisé par le rendement visé).` : null,
  ].filter(Boolean).join('\n');
  const consigne = `Tu écris, pour ${user?.role === 'mandataire' ? 'un mandataire K Partners, le réseau de Klocka' : "l'équipe de Klocka"}, un premier courrier papier à un propriétaire de murs commerciaux jamais contacté.

Klocka achète des murs commerciaux occupés, en direct, pour le compte d'investisseurs privés dont le financement est en place. Sans mandat, sans commission, sans intermédiaire.

Les faits, et rien d'autre :
${faits}

Registre : ${variante === 'professionnelle' ? 'un professionnel de l\'immobilier, direct, chiffré si les faits le permettent' : variante === 'acheteur' ? 'un propriétaire patrimonial à qui l\'on dit, sans prix, qu\'un acheteur existe pour ce type de bien' : 'un propriétaire patrimonial : aucun prix, aucune fourchette, aucune urgence'}.

Règles absolues :
- Texte brut, sans markdown, sans astérisque, sans titre. « Madame, Monsieur, » en tête, formule de politesse brève en fin, puis la signature exactement ainsi, sur ses lignes :
${SIGNATURE(user)}
- Ouvre par une phrase qui cite l'adresse exacte du local et son enseigne : le destinataire doit voir que ce n'est pas un publipostage.
- Dis qui nous sommes en deux lignes, pas plus.
- Une seule demande, petite : savoir s'il serait ouvert à en parler.
- Une phrase, en fin de lettre avant la formule de politesse, dit d'où vient l'information et comment s'opposer : « Vos coordonnées viennent des registres publics (cadastre des personnes morales et registre des entreprises) ; un mot de votre part et nous ne vous écrirons plus. »
- N'invente aucun chiffre, aucune date, aucun nom. Si le nombre d'investisseurs n'est pas donné, écris « plusieurs », jamais un chiffre. Ne mentionne jamais un changement de gérant, un décès, une procédure, une succession, ni rien qui laisserait entendre que nous savons quelque chose de sa situation.
- Ton sobre, direct, respectueux. Pas d'enthousiasme, pas de flatterie, pas de formule creuse. Douze à dix-huit lignes.`;
  let texte;
  if (rediger) texte = await rediger(consigne, fiche);
  else {
    const { invokeLLM } = await import('../llm.js');
    const { mesurer } = await import('../llm-couts.js');
    texte = (await mesurer({ operation: 'courrier off-market', par: user?.email || null }, () => invokeLLM({ prompt: consigne, effort: 'low' }))).resultat;
  }
  return String(texte || '').replace(/[*#_`]+/g, '').trim();
}

/**
 * Prépare les courriers des propriétaires donnés (clés) : la porte qualité
 * d'abord, puis une lettre par propriétaire, à valider. Rend ce qui a été
 * préparé et ce qui a été refusé, avec la raison.
 */
export async function preparerCourriers(espace, cles, user, { rediger = null, max = 30 } = {}) {
  const villes = new Set((await territoiresDe(user)).map((v) => v.id));
  const prepares = [];
  const refuses = [];
  for (const cle of [...new Set(cles || [])].slice(0, max)) {
    const contact = contactDe(espace, cle);
    const fiche = await ficheProprietaire(cle, { contact, villesVisibles: villes });
    const dansTerritoire = fiche && fiche.patrimoine.locaux.some((l) => villes.has(l.ville_id));
    const refus = porteQualite(fiche, contact) || (!dansTerritoire ? 'hors de votre territoire' : null) || (Records.list(COURRIER).some((c) => c.espace === espace && c.cle === cle && c.etat === 'a_valider') ? 'un courrier attend déjà sa validation' : null);
    if (refus) { refuses.push({ cle, nom: fiche?.nom || cle, raison: refus }); continue; }
    const variante = varianteDe(fiche);
    const texte = await redigerCourrier(fiche, variante, user, { rediger });
    const c = Records.create(COURRIER, {
      espace, cle, siren: fiche.siren, destinataire: { nom: fiche.nom, forme: fiche.forme, adresse: fiche.contact.adresse_siege },
      locaux: fiche.patrimoine.locaux.filter((l) => villes.has(l.ville_id)).slice(0, 10).map((l) => ({ id: l.id, adresse: l.adresse, ville: l.ville, enseigne: l.enseigne })),
      profil: fiche.profil.cle, variante, texte, motivation: fiche.motivation?.total ?? null, explication: fiche.motivation?.explication || null,
      etat: 'a_valider', cree_le: maintenant(), cree_par: user?.email || null,
    });
    poserContact(espace, cle, {}, { nom: fiche.nom, siren: fiche.siren });
    prepares.push(c);
  }
  return { ok: true, prepares, refuses };
}

export const courriersAValider = (espace) => Records.filter(COURRIER, { espace }).filter((c) => c.etat === 'a_valider').sort((a, b) => (b.motivation || 0) - (a.motivation || 0));

export function modifierCourrier(espace, id, { texte }) {
  const c = Records.get(COURRIER, id);
  if (!c || c.espace !== espace || c.etat !== 'a_valider') return { ok: false, error: 'Courrier introuvable ou déjà parti.' };
  return { ok: true, courrier: Records.update(COURRIER, id, { texte: String(texte || '').slice(0, 6000), modifie_le: maintenant() }) };
}

/**
 * Valider un courrier : la personne l'imprime et le poste, et le dit ici. Le
 * propriétaire passe « contacté », deux relances se posent (J+30 un second
 * courrier, J+90 un appel si on a un numéro).
 */
export function validerCourrier(espace, id, user, { texte = null, maintenantD = new Date() } = {}) {
  const c = Records.get(COURRIER, id);
  if (!c || c.espace !== espace || c.etat !== 'a_valider') return { ok: false, error: 'Courrier introuvable ou déjà parti.' };
  if (estOppose(c.cle)) return { ok: false, error: 'Ce propriétaire a demandé à ne plus être contacté.' };
  const j = jour(maintenantD);
  const maj = Records.update(COURRIER, id, { etat: 'envoye', envoye_le: maintenantD.toISOString(), par: user?.email || null, ...(texte != null ? { texte: String(texte).slice(0, 6000) } : {}), relance_le: plusJours(j, 30), relance2_le: plusJours(j, 90) });
  noterInteraction(espace, c.cle, { canal: 'courrier', texte: `Courrier posté : ${VARIANTES[c.variante] || c.variante}`, statut: 'contacte', prochaine: { le: plusJours(j, 30), quoi: 'second courrier si pas de réponse' }, courrier_id: id, user, motivation: c.motivation ?? null }, { nom: c.destinataire?.nom, siren: c.siren });
  return { ok: true, courrier: maj };
}

export function ecarterCourrier(espace, id, user = null) {
  const c = Records.get(COURRIER, id);
  if (!c || c.espace !== espace || c.etat !== 'a_valider') return { ok: false, error: 'Courrier introuvable ou déjà parti.' };
  return { ok: true, courrier: Records.update(COURRIER, id, { etat: 'ecarte', ecarte_le: maintenant(), ecarte_par: user?.email || null }) };
}

// ---------------------------------------------------------------------------
// Une réponse, un dossier
// ---------------------------------------------------------------------------

/** Une réponse reçue (courrier, mail, appel) : notée, le propriétaire passe en discussion, la relance tombe. */
export function noterReponse(espace, cle, { canal = 'courrier', texte, positive = true, user = null }) {
  if (!String(texte || '').trim()) return { ok: false, error: 'Dites ce qu\'il a répondu.' };
  const r = noterInteraction(espace, cle, { canal: `reponse_${canal}`, texte, statut: positive ? 'en_discussion' : 'perdu', prochaine: positive ? { le: plusJours(jour(), 7), quoi: 'donner suite à sa réponse' } : null, user });
  return r;
}

/** Un dossier reçu : la fiche commerciale part en pré-analyse comme toute fiche reçue (deal), le pipeline suit. */
export async function noterDossierRecu(espace, cle, { local_id = null, user = null }) {
  const x = noterInteraction(espace, cle, { canal: 'dossier', texte: 'Dossier reçu', statut: 'dossier_recu', prochaine: null, user });
  if (!local_id) return x;
  try {
    const { creerDossierDepuisCible } = await import('../alx/index.js');
    const d = await creerDossierDepuisCible(local_id, user);
    if (d?.ok) { changerStatut(espace, cle, 'en_preanalyse', user); return { ok: true, contact: contactDe(espace, cle), deal_id: d.deal_id || d.deal?.id || null }; }
    return { ok: true, contact: x.contact, note: d?.error || 'Le dossier de pré-analyse n\'a pas pu être créé.' };
  } catch (e) { return { ok: true, contact: x.contact, note: String(e?.message || e) }; }
}

// ---------------------------------------------------------------------------
// Aujourd'hui et le tableau de bord
// ---------------------------------------------------------------------------

/** Les actions du jour : courriers à valider, relances dues, nouveaux signaux, réponses à suivre. */
export function aujourdhui(espace, { maintenantD = new Date() } = {}) {
  const j = jour(maintenantD);
  const contacts = Records.filter(CONTACT, { espace }).filter((x) => !x.oppose);
  return {
    jour: j,
    courriers_a_valider: courriersAValider(espace).length,
    relances: contacts.filter((x) => x.prochaine?.le && x.prochaine.le <= j).map((x) => ({ cle: x.cle, nom: x.nom, statut: x.statut, quoi: x.prochaine.quoi, le: x.prochaine.le, retard: Math.round((Date.parse(`${j}T12:00:00Z`) - Date.parse(`${x.prochaine.le}T12:00:00Z`)) / 86400000) })).sort((a, b) => a.le.localeCompare(b.le)),
    nouveaux_signaux: contacts.filter((x) => x.nouveau_signal).map((x) => ({ cle: x.cle, nom: x.nom, statut: x.statut, signal: x.nouveau_signal })),
    en_discussion: contacts.filter((x) => x.statut === 'en_discussion').map((x) => ({ cle: x.cle, nom: x.nom, dernier: x.interactions?.at(-1) || null })),
  };
}

/** L'entonnoir, la qualité du score et la santé des données. */
export async function tableauDeBord(espace, user) {
  const contacts = Records.filter(CONTACT, { espace });
  const entonnoir = Object.fromEntries(STATUTS.map((s) => [s, contacts.filter((x) => x.statut === s && !x.oppose).length]));
  const courriers = Records.filter(COURRIER, { espace });
  const envoyes = courriers.filter((c) => c.etat === 'envoye');
  // La qualité du score : le taux de réponse par tranche de motivation au moment de l'envoi.
  const tranches = [[0, 25], [25, 50], [50, 75], [75, 101]].map(([a, b]) => {
    const dans = envoyes.filter((c) => (c.motivation ?? 0) >= a && (c.motivation ?? 0) < b);
    const repondu = dans.filter((c) => (contactDe(espace, c.cle)?.interactions || []).some((i) => String(i.canal).startsWith('reponse_') && i.le > c.envoye_le)).length;
    return { tranche: `${a}–${Math.min(100, b - 1)}`, envoyes: dans.length, reponses: repondu, taux: dans.length ? Math.round((repondu / dans.length) * 100) : null };
  });
  const villes = (await territoiresDe(user)).map((v) => v.id);
  const releves = villes.flatMap((id) => Records.filter('Cible', { ville_id: id }));
  const dates = (f) => releves.map(f).filter(Boolean).sort();
  const fraicheur = (f) => { const d = dates(f); return d.length ? { plus_ancienne: d[0].slice(0, 10), plus_recente: d.at(-1).slice(0, 10), n: d.length } : null; };
  const locaux = releves.map((c) => localDe(c));
  return {
    entonnoir, oppositions: contacts.filter((x) => x.oppose).length,
    courriers: { a_valider: courriers.filter((c) => c.etat === 'a_valider').length, envoyes: envoyes.length, ecartes: courriers.filter((c) => c.etat === 'ecarte').length },
    qualite_score: tranches,
    donnees: {
      locaux: releves.length,
      proprietaires_resolus: locaux.filter((l) => l.proprietaire).length,
      exacts: locaux.filter((l) => l.confiance === 'exacte').length,
      a_confirmer: locaux.filter((l) => l.confiance === 'a_confirmer').length,
      avec_gerants: releves.filter((c) => (c.societe?.gerants || []).length).length,
      avec_evenements: releves.filter((c) => (c.evenements || []).length).length,
      fraicheur: { proprietaire: fraicheur((c) => c.proprietaire?.trouve_le), societe: fraicheur((c) => c.societe?.lu_le), vitrine: fraicheur((c) => c.updated_date) },
    },
  };
}

// ---------------------------------------------------------------------------
// La veille de nuit
// ---------------------------------------------------------------------------

/**
 * Relit le BODACC des propriétaires suivis (contactés, en discussion, en
 * veille), au plus `max` par nuit : un événement nouveau se range sur chacun
 * de leurs locaux et remonte le propriétaire dans « Aujourd'hui ».
 */
export async function veilleNocturne({ max = 40, lireEvenements = null } = {}) {
  const suivis = Records.list(CONTACT).filter((x) => !x.oppose && x.siren && ['contacte', 'en_discussion', 'veille', 'a_contacter'].includes(x.statut))
    .sort((a, b) => String(a.veille_le || '').localeCompare(String(b.veille_le || ''))).slice(0, max);
  const lire = lireEvenements || (async (siren) => (await import('../bodacc.js')).evenementsSociete(siren, { mois: 6 }));
  let nouveaux = 0;
  for (const x of suivis) {
    let evenements;
    try { evenements = await lire(x.siren); } catch { continue; }
    const releves = relevesDuProprietaire(x.siren);
    const connus = new Set(releves.flatMap((c) => (c.evenements || []).map((e) => `${e.date}|${e.type}`)));
    const neufs = (evenements || []).filter((e) => !connus.has(`${e.date}|${e.type}`));
    if (neufs.length) {
      for (const c of releves) Records.update('Cible', c.id, { evenements: [...(c.evenements || []), ...neufs.map((e) => ({ ...e, source: e.source || 'BODACC' }))] });
      const premier = [...neufs].sort((a, b) => String(b.date).localeCompare(String(a.date)))[0];
      for (const autre of Records.list(CONTACT).filter((y) => y.cle === x.cle)) Records.update(CONTACT, autre.id, { nouveau_signal: { le: maintenant(), type: premier.type, date: premier.date, detail: premier.detail || null }, veille_le: maintenant() });
      nouveaux += 1;
    } else Records.update(CONTACT, x.id, { veille_le: maintenant() });
  }
  return { relus: suivis.length, nouveaux };
}

export function marquerSignalVu(espace, cle) {
  const x = contactDe(espace, cle);
  if (x) Records.update(CONTACT, x.id, { nouveau_signal: null });
  return { ok: true };
}

export { cleProprietaire, clientsActifs };

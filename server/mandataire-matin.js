// Le matin du mandataire (24 oct. 2026, Jules) : en cinq minutes, au téléphone
// ou à l'ordinateur, les propriétaires à contacter aujourd'hui, chacun avec
// son signal (« gérant de 70 ans et plus », « fonds cédé »), l'argument à
// dire et le moyen de le joindre ; puis les relances et les rendez-vous du
// jour. Une notification par jour ouvré, à 8 h, y mène (page Biens).
//
// Rien ne part vers un propriétaire d'ici : Haka prépare, le mandataire
// appelle, écrit ou passe au commerce lui-même.

import { Records, Meta } from './db.js';

const norm = (e) => String(e || '').trim().toLowerCase();
const jourParis = (d = new Date()) => new Intl.DateTimeFormat('fr-CA', { timeZone: 'Europe/Paris', year: 'numeric', month: '2-digit', day: '2-digit' }).format(d);
const heureParis = (d = new Date()) => Number(String(new Intl.DateTimeFormat('fr-FR', { timeZone: 'Europe/Paris', hour: 'numeric', hour12: false }).format(d)).replace(/\D/g, '')) % 24;
const jourSemaineParis = (d = new Date()) => new Intl.DateTimeFormat('en-US', { timeZone: 'Europe/Paris', weekday: 'short' }).format(d);

// Au plus dix propriétaires par matin : une liste de cent ne se fait pas en cinq minutes.
export const PAR_MATIN = 10;

/**
 * L'argument à dire, selon le signal. Une phrase que le mandataire peut dire
 * telle quelle, qui parle du propriétaire et jamais du registre. Sans signal :
 * la phrase de Jules (24 oct. 2026).
 */
const ARGUMENTS = {
  gerant_age: 'Beaucoup de propriétaires préparent la suite : un investisseur reprend les murs, le bail continue, vous n\'avez plus rien à gérer.',
  fonds_cede: 'Le fonds vient de changer de mains : c\'est souvent le bon moment pour connaître la valeur de vos murs.',
  transmission: 'Une succession se règle plus simplement quand on connaît la valeur des murs : je peux vous la donner, sans engagement.',
  ferme: 'Un local vide coûte chaque mois : un investisseur peut le reprendre tel qu\'il est.',
  detention_30: 'Après tant d\'années, la valeur de vos murs a bougé : je peux vous dire ce qu\'ils valent aujourd\'hui.',
  detention_22: 'La valeur de vos murs a bougé ces dernières années : je peux vous dire ce qu\'ils valent aujourd\'hui.',
  detention_longue: 'Après tant d\'années, la valeur de vos murs a bougé : je peux vous dire ce qu\'ils valent aujourd\'hui.',
  echeance_proche: 'Votre bail arrive à échéance : c\'est le bon moment pour faire le point sur la valeur de vos murs.',
  marchand_fenetre: 'Vous aviez acheté pour revendre : un investisseur cherche exactement ce type de local, sans délai.',
  locataire_en_difficulte: 'Un locataire en difficulté pèse sur vos murs : un investisseur peut les reprendre tels qu\'ils sont.',
};
export const ARGUMENT_PAR_DEFAUT = 'Un investisseur cherche un local comme le vôtre dans votre rue.';

/**
 * Pure : les signaux d'un propriétaire, du commerce de l'Off-market d'où il vient, sinon de la cible de la
 * Prospection par rue (ses signaux forts d'abord, puis ceux qui jouent dans la durée).
 */
export function signauxDe(commerce, drapeaux, cible = null) {
  if (commerce) return (drapeaux(commerce) || []).map((d) => ({ cle: d.cle, texte: d.texte, source: d.source || null }));
  if (!cible?.signaux) return [];
  return [...(cible.signaux.forts || []), ...(cible.signaux.patients || [])]
    .filter((s) => s?.libelle)
    .map((s) => ({ cle: s.cle, texte: s.valeur ? `${s.libelle} (${s.valeur})` : s.libelle, source: null }));
}

/** Pure : l'argument d'après le signal le plus fort (le premier). */
export const argumentDe = (signaux = []) => ARGUMENTS[signaux[0]?.cle] || ARGUMENT_PAR_DEFAUT;

/** Pure : comment le joindre. Le téléphone d'abord, puis le mail, sinon passer au commerce (l'adresse). */
export function contactDe(p) {
  if (p?.telephone) return { moyen: 'telephone', valeur: p.telephone, libelle: 'Appeler' };
  if (p?.email) return { moyen: 'email', valeur: p.email, libelle: 'Écrire' };
  if (p?.adresse) return { moyen: 'passage', valeur: [p.adresse, p.ville].filter(Boolean).join(', '), libelle: 'Passer au commerce' };
  return { moyen: null, valeur: null, libelle: 'Trouver un contact' };
}

/**
 * Pure : qui contacter ce matin. Les fiches « à appeler » dues aujourd'hui ou
 * avant, un signal d'abord (plus il y en a, plus tôt), puis l'échéance la plus
 * ancienne ; au plus `max`, et le compte de celles qui restent.
 */
export function aContacter(proprietaires, { commerceDe = () => null, cibleDe = () => null, drapeaux = () => [], exclu = () => false, aujourdhui = new Date(), max = PAR_MATIN } = {}) {
  const fin = new Date(aujourdhui); fin.setHours(23, 59, 59, 999);
  const dues = proprietaires
    .filter((p) => p.statut === 'a_appeler' && (!p.prochaine_action_le || Date.parse(p.prochaine_action_le) <= fin.getTime()))
    .filter((p) => !exclu(p))
    .map((p) => {
      const signaux = signauxDe(commerceDe(p), drapeaux, cibleDe(p));
      return {
        id: p.id,
        titre: [p.commerce || p.nom, p.ville].filter(Boolean).join(' · ') || 'Propriétaire',
        proprietaire: p.nom || null,
        adresse: p.adresse || null,
        signaux,
        signal: signaux[0]?.texte || p.raison || null,
        argument: argumentDe(signaux),
        contact: contactDe(p),
        echeance: p.prochaine_action_le || p.cree_le || null,
      };
    })
    .sort((a, b) => b.signaux.length - a.signaux.length || String(a.echeance || '').localeCompare(String(b.echeance || '')));
  return { liste: dues.slice(0, max), reste: Math.max(0, dues.length - max) };
}

/** Le matin d'un mandataire : à contacter, relances dues, rendez-vous du jour. */
export async function matinDuMandataire(user) {
  const { mesProprietaires } = await import('./mandataire-espace.js');
  const { tableauDuJour } = await import('./mandataire.js');
  const { drapeauxDe } = await import('./off-market/simple.js');
  const { enseigneNationale, bailleurPublic } = await import('./mandataire-veille.js');
  const commerceDe = (p) => (p.commerce_simple_id ? Records.get('CommerceSimple', p.commerce_simple_id) : null);
  const cibleDe = (p) => (p.cible_id ? Records.get('Cible', p.cible_id) : null);
  // Comme la liste du jour : une enseigne nationale ou un bailleur public ne se démarchent pas.
  const exclu = (p) => {
    const c = cibleDe(p);
    const proprio = p.nom || c?.proprietaire?.nom || '';
    return enseigneNationale(proprio) || bailleurPublic(proprio) || enseigneNationale(p.commerce || '') || !!(c?.proprietaire_occupant && enseigneNationale(c?.enseigne || ''));
  };
  const { liste, reste } = aContacter(mesProprietaires(user), { commerceDe, cibleDe, drapeaux: drapeauxDe, exclu });
  const jour = await tableauDuJour(user);
  const rdv = (jour.a_faire || []).filter((l) => l.genre === 'rdv');
  return { a_contacter: liste, a_contacter_reste: reste, relances: jour.rappels || [], rdv, en_retard: jour.en_retard || 0 };
}

/** Pure : la phrase de la notification du matin, ou null quand il n'y a rien à faire. */
export function phraseDuMatin({ a_contacter = [], a_contacter_reste = 0, relances = [], rdv = [] } = {}) {
  const n = a_contacter.length + a_contacter_reste;
  const morceaux = [
    n ? `${n} propriétaire${n > 1 ? 's' : ''} à contacter` : null,
    relances.length ? `${relances.length} relance${relances.length > 1 ? 's' : ''}` : null,
    rdv.length ? `${rdv.length} rendez-vous` : null,
  ].filter(Boolean);
  if (!morceaux.length) return null;
  return morceaux.length === 1 ? morceaux[0] : `${morceaux.slice(0, -1).join(', ')} et ${morceaux.at(-1)}`;
}

/** Pure : faut-il envoyer le matin maintenant ? Lundi à vendredi, à partir de 8 h, une fois par jour. */
export function aLancer({ maintenant = new Date(), dernier = null } = {}) {
  if (['Sat', 'Sun'].includes(jourSemaineParis(maintenant))) return false;
  if (heureParis(maintenant) < 8) return false;
  return dernier !== jourParis(maintenant);
}

const CLE_DERNIER = 'mandataire.matin.dernier';

/** Le tour du matin : une notification à chaque mandataire qui a quelque chose à faire, une fois par jour ouvré. */
export async function tourDuMatin({ maintenant = new Date() } = {}) {
  if (!aLancer({ maintenant, dernier: Meta.get(CLE_DERNIER) })) return null;
  const jour = jourParis(maintenant);
  Meta.set(CLE_DERNIER, jour);
  const { notifier } = await import('./notifications.js');
  const { estMandataire } = await import('./mandataire-espace.js');
  let envoyees = 0;
  for (const u of Records.list('User').filter(estMandataire)) {
    try {
      const m = await matinDuMandataire(u);
      const phrase = phraseDuMatin(m);
      if (!phrase) continue;
      const n = notifier({ pour: norm(u.email), titre: 'Votre matinée', texte: `${phrase[0].toUpperCase()}${phrase.slice(1)}.`, lien: '/Biens', action: 'Voir', genre: 'matin', cle: `matin:${norm(u.email)}:${jour}` });
      if (n) envoyees += 1;
    } catch (e) { console.warn('[matin] ', u.email, e?.message || e); }
  }
  return { jour, envoyees };
}

/** Toutes les quinze minutes, le tour regarde s'il est l'heure ; sur Render seulement, sauf MANDATAIRE_MATIN=1. */
export function planifier() {
  const actif = process.env.MANDATAIRE_MATIN === '1' || (!!process.env.RENDER && process.env.MANDATAIRE_MATIN !== '0');
  if (!actif) return null;
  const tour = () => tourDuMatin().catch((e) => console.error('[matin] :', e?.message || e));
  const t = setInterval(tour, 15 * 60 * 1000);
  t.unref?.();
  setTimeout(tour, 90 * 1000).unref?.();
  return t;
}

const AGES = { '70+': '70 ans et plus', '50-70': '50 à 70 ans', '-50': 'moins de 50 ans' };
const annee = (d) => { const a = Number(String(d || '').slice(0, 4)); return a > 1900 ? a : null; };

/**
 * Pure : la fiche très courte d'un commerce (24 oct. 2026, Jules) : l'exploitant et depuis quand ; le propriétaire des
 * murs (SCI, gérant, âge) ; le signal ; l'accroche à utiliser. `commerce` : la fiche de l'Off-market, `cible` : celle de
 * la Prospection par rue (l'une ou l'autre, ou aucune), `p` : la fiche du mandataire.
 */
export function ficheCourte({ p = {}, commerce = null, cible = null, drapeaux = () => [] } = {}) {
  const ex = commerce?.exploitant || null;
  const depuis = annee(commerce?.depuis) || annee(ex?.creation);
  const pr = commerce?.proprietaire || cible?.proprietaire || null;
  const gerants = (commerce?.proprietaire?.gerants || cible?.societe?.gerants || []).filter((g) => !g.personne_morale);
  const g = gerants[0] || null;
  const exploitantProprietaire = /^exploitant/.test(String(commerce?.lien || '')) || !!cible?.proprietaire_occupant;
  const signaux = signauxDe(commerce, drapeaux, cible);
  return {
    exploitant: ex?.nom || cible?.enseigne || p.commerce || null,
    depuis,
    proprietaire: exploitantProprietaire ? "L'exploitant lui-même" : pr?.nom || p.nom || null,
    forme: exploitantProprietaire ? null : pr?.forme || cible?.societe?.forme || null,
    gerant: !exploitantProprietaire && g ? { nom: g.nom, age: AGES[g.tranche_age] || null } : null,
    signal: signaux[0] ? String(signaux[0].texte).replace(/\s*\([^)]*\)\s*/g, ' ').trim() : p.raison || null,
    accroche: argumentDe(signaux),
  };
}


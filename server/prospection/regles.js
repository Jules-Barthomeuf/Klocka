// Les règles de la prospection, pures et testées sans réseau.
//
// Le carnet des agents vit dans la plateforme (AgentImmo) : c'est lui qui
// fait foi. Monday reçoit ce que la plateforme écrit, pour piloter.
//
// Après un appel, AK propose la suite et la personne choisit. Les règles
// ci-dessous disent ce que chaque issue appelle :
//   pas de réponse   rappel dans deux jours ouvrés, à l'autre moment de la
//                    journée ; au troisième échec, un mail ou un SMS préparé,
//                    puis un mois de pause ;
//   pas de murs      mail de présentation avec nos critères, relance à un
//                    mois ou à la date du mandat annoncé, et il remonte en
//                    tête s'il publie sur Equimmox ;
//   a des murs       mail de demande de fiche, relance préparée à J+3, appel
//                    à J+7 si rien n'arrive ;
//   veut un mail     même chose ;
//   pas intéressé    six mois de pause ;
//   invalide         archivé, et un autre contact de l'agence proposé.
// Rien ne part tout seul : un mail ou une relance attend toujours un clic.

export const STATUTS = {
  nouveau: 'À appeler',
  a_rappeler: 'À rappeler',
  en_discussion: 'En discussion',
  pas_de_murs: 'Pas de murs',
  envoie_des_fiches: 'Envoie des fiches',
  pause: 'En pause',
  archive: 'Archivé',
};

export const ISSUES = {
  pas_de_reponse: 'Pas de réponse',
  pas_de_murs: 'Pas de murs en ce moment',
  a_des_murs: 'A des murs intéressants',
  veut_mail: 'Veut d\'abord un mail',
  pas_interesse: 'Pas intéressé',
  invalide: 'Mauvais numéro',
  autre: 'Autre',
};

export const ESSAIS_MAX = 3;

export const norm = (s) => String(s || '').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-z0-9@.+ -]/g, ' ').replace(/\s+/g, ' ').trim();

const ADRESSE = /[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/;
// Les adresses des sites d'annonces : jamais celles d'un agent.
const PORTAILS = /@(?:[a-z0-9-]+\.)*(?:seloger|leboncoin|bureauxlocaux|geolocaux|logic-immo|bienici|equimmox|apollo|cessionpme|properstar|greenacres)\.[a-z]+$/;

/** Pure : l'adresse mail utile d'un champ (« Jean <j@x.fr> » → j@x.fr), ou null. */
export function normEmail(v) {
  const m = String(v || '').toLowerCase().match(ADRESSE);
  if (!m || PORTAILS.test(m[0])) return null;
  return m[0];
}

/** Pure : un téléphone réduit à ses neuf derniers chiffres (06 51… et +33 6 51… se rejoignent), ou null. */
export function normTel(v) {
  const chiffres = String(v || '').split(/[,;/]/)[0].replace(/\D/g, '');
  return chiffres.length >= 9 ? chiffres.slice(-9) : null;
}

/** Pure : un téléphone affichable, « 06 51 96 69 14 ». */
export function telAffiche(v) {
  const n = normTel(v);
  return n ? `0${n}`.replace(/(\d{2})(?=\d)/g, '$1 ').trim() : null;
}

/** Pure : les clés qui disent « c'est le même agent » : mail, téléphone, nom et agence ensemble. */
export function clesDe({ email = null, emails = [], telephone = null, telephones = [], nom = null, agence = null } = {}) {
  const cles = [];
  for (const e of [email, ...(emails || [])].map(normEmail).filter(Boolean)) cles.push(`e:${e}`);
  for (const t of [telephone, ...(telephones || [])].map(normTel).filter(Boolean)) cles.push(`t:${t}`);
  const n = norm(nom);
  const a = norm(agence);
  if (n && a && n !== a) cles.push(`n:${n}|${a}`);
  else if (a && cles.length === 0) cles.push(`a:${a}`);
  return [...new Set(cles)];
}

/** Pure : un index des agents connus, clé → agent. */
export function indexer(agents) {
  const index = new Map();
  for (const a of agents || []) for (const c of clesDe(a)) if (!index.has(c)) index.set(c, a);
  return index;
}

/** Pure : l'agent déjà connu qui correspond, ou null. */
export function dejaConnu(index, candidat) {
  for (const c of clesDe(candidat)) if (index.has(c)) return index.get(c);
  return null;
}

// Les dates : des jours civils, à Paris, en AAAA-MM-JJ.
export const jourDe = (d = new Date()) => new Intl.DateTimeFormat('fr-CA', { timeZone: 'Europe/Paris', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date(d));
export const heureDe = (d = new Date()) => Number(new Intl.DateTimeFormat('en-GB', { timeZone: 'Europe/Paris', hour: '2-digit', hour12: false }).formatToParts(new Date(d)).find((p) => p.type === 'hour')?.value) % 24;
export const plusJours = (jour, n) => { const d = new Date(`${jour}T12:00:00Z`); d.setUTCDate(d.getUTCDate() + n); return d.toISOString().slice(0, 10); };
const jourSemaine = (jour) => new Date(`${jour}T12:00:00Z`).getUTCDay();
/** Pure : un samedi ou un dimanche glisse au lundi. */
export const ouvre = (jour) => (jourSemaine(jour) === 6 ? plusJours(jour, 2) : jourSemaine(jour) === 0 ? plusJours(jour, 1) : jour);
export function plusJoursOuvres(jour, n) {
  let j = jour;
  for (let i = 0; i < n; i++) j = ouvre(plusJours(j, 1));
  return j;
}
export const dateCourte = (jour) => (jour ? `${String(jour).slice(8, 10)}/${String(jour).slice(5, 7)}` : '');

/**
 * Pure : ce que l'issue d'un appel change à la fiche de l'agent : statut,
 * essais, prochaine action et sa date, et les mails à proposer.
 * @param {string} issue - une clé d'ISSUES
 * @param {{tentatives?: number, maintenant?: Date, date_dite?: string|null}} ctx
 * @returns {{statut, tentatives, prochaine: {quoi, le, moment?}|null, mails: string[], sms?: boolean, autre_contact?: boolean}}
 */
export function suiteDeLIssue(issue, { tentatives = 0, maintenant = new Date(), date_dite = null } = {}) {
  const auj = jourDe(maintenant);
  const dite = date_dite && /^\d{4}-\d{2}-\d{2}$/.test(date_dite) && date_dite > auj ? ouvre(date_dite) : null;
  if (issue === 'pas_de_reponse') {
    const n = tentatives + 1;
    if (n >= ESSAIS_MAX) return { statut: 'pause', tentatives: 0, prochaine: { quoi: 'rappeler après la pause (3 appels sans réponse)', le: ouvre(plusJours(auj, 30)) }, mails: ['sans_reponse'], sms: true };
    // L'autre moment de la journée : on l'a raté le matin, on l'appelle l'après-midi.
    const moment = heureDe(maintenant) < 13 ? "l'après-midi" : 'le matin';
    return { statut: 'a_rappeler', tentatives: n, prochaine: { quoi: `rappeler (essai ${n + 1} sur ${ESSAIS_MAX}), plutôt ${moment}`, le: plusJoursOuvres(auj, 2), moment }, mails: [] };
  }
  if (issue === 'pas_de_murs') return { statut: 'pas_de_murs', tentatives: 0, prochaine: { quoi: dite ? 'rappeler pour le mandat annoncé' : 'point du mois : a-t-il rentré des murs ?', le: dite || ouvre(plusJours(auj, 30)) }, mails: ['presentation'] };
  if (issue === 'a_des_murs') return { statut: 'en_discussion', tentatives: 0, prochaine: { quoi: 'rappeler si la fiche n\'est pas arrivée', le: ouvre(plusJours(auj, 7)) }, mails: ['demande_fiche'], relance_mail_jours: 3 };
  if (issue === 'veut_mail') return { statut: 'en_discussion', tentatives: 0, prochaine: { quoi: 'rappeler : a-t-il lu notre mail, a-t-il des murs ?', le: ouvre(plusJours(auj, 7)) }, mails: ['presentation'], relance_mail_jours: 3 };
  if (issue === 'pas_interesse') return { statut: 'pause', tentatives: 0, prochaine: { quoi: 'retenter dans six mois', le: ouvre(plusJours(auj, 182)) }, mails: [] };
  if (issue === 'invalide') return { statut: 'archive', tentatives: 0, prochaine: null, mails: [], autre_contact: true };
  return { statut: 'a_rappeler', tentatives: 0, prochaine: { quoi: 'rappeler', le: dite || ouvre(plusJours(auj, 7)) }, mails: [] };
}

/** Pure : le score d'un agent, d'après ce qu'il nous a apporté. Une fiche vaut 10, un Oui 15 de plus, un Non en retire 2. */
export function scoreDe({ fiches = 0, oui = 0, non = 0 } = {}) {
  return Math.max(0, fiches * 10 + oui * 15 - non * 2);
}

const joursDepuis = (iso, auj) => (iso ? Math.round((Date.parse(`${auj}T12:00:00Z`) - Date.parse(`${String(iso).slice(0, 10)}T12:00:00Z`)) / 86400000) : Infinity);

/**
 * Pure : la liste du jour. Dans l'ordre :
 *   1. les relances qui tombent aujourd'hui (ou en retard) ;
 *   2. dans les villes ciblées aujourd'hui, les agents qui publient
 *      régulièrement sur Equimmox (deux annonces ou plus), ceux qui ont des
 *      murs vides d'abord, puis les plus gros publieurs ;
 *   3. les nouveaux agents importés (Apollo, fichier) de ces villes.
 * Un agent appelé depuis moins de 30 jours ne revient que par sa relance.
 * @returns {object[]} chaque agent avec `raison` et `rang`
 */
export function listeDuJour(agents, { villes = [], maintenant = new Date(), regulier = 2 } = {}) {
  const auj = jourDe(maintenant);
  const cibles = new Set(villes.map(norm));
  const dansLaVille = (a) => [a.ville, ...(a.villes || []), ...Object.keys(a.annonces_par_ville || {})].some((v) => cibles.has(norm(v)));
  const annoncesIci = (a) => Object.entries(a.annonces_par_ville || {}).filter(([v]) => cibles.has(norm(v))).reduce((t, [, n]) => t + (n || 0), 0);
  const videsIci = (a) => Object.entries(a.vides_par_ville || {}).filter(([v]) => cibles.has(norm(v))).reduce((t, [, n]) => t + (n || 0), 0);
  const out = [];
  for (const a of agents || []) {
    if (a.statut === 'archive' || (!a.telephones?.length && !a.emails?.length)) continue;
    const du = a.prochaine?.le && a.prochaine.le <= auj;
    if (du) {
      const retard = a.prochaine.le < auj ? ` (prévu le ${dateCourte(a.prochaine.le)})` : '';
      out.push({ ...a, rang: 0, raison: `${a.prochaine.quoi}${retard}` });
      continue;
    }
    if (a.statut === 'pause' || a.statut === 'envoie_des_fiches' || !cibles.size || !dansLaVille(a)) continue;
    if (joursDepuis(a.dernier_contact_le, auj) < 30 || (a.prochaine?.le && a.prochaine.le > auj)) continue;
    const n = annoncesIci(a);
    const vides = videsIci(a);
    if (n >= regulier) {
      out.push({ ...a, rang: vides ? 1 : 2, tri: vides * 100 + n, raison: `${n} annonces de commerce sur Equimmox dans la ville${vides ? `, dont ${vides} murs vides` : ''} : ${a.dernier_contact_le ? 'on ne lui a pas parlé depuis un mois' : 'jamais appelé'}` });
    } else if (!a.dernier_contact_le && a.source && a.source !== 'Equimmox') {
      out.push({ ...a, rang: 3, tri: 0, raison: `nouveau (${a.source}), jamais appelé` });
    }
  }
  return out.sort((x, y) => x.rang - y.rang || (y.tri || 0) - (x.tri || 0) || String(x.prochaine?.le || '').localeCompare(String(y.prochaine?.le || '')) || String(x.nom).localeCompare(String(y.nom)));
}

/** Pure : un verrou encore tenu (30 minutes au plus, le temps d'un appel et de sa suite). */
export const verrouTenu = (verrou, maintenant = Date.now()) => !!verrou?.par && maintenant - Date.parse(verrou.le) < 30 * 60000;

// Les règles de la prospection, pures et testées sans réseau : qui est déjà
// connu, quand rappeler, qui appeler aujourd'hui et qui s'en charge.
//
// Le carnet vit dans Monday, tableau « Prospection Agent Immo » : un agent à
// démarcher par ligne, avec son statut (colonne Priorité Status), sa date de
// premier contact et sa prochaine relance. Klocka ne tient pas de second
// carnet ; il garde seulement ce que Monday ne sait pas dire (combien
// d'appels sans réponse d'affilée, d'où vient l'agent), dans ProspectSuivi.
//
// Après un appel, le statut dit la suite :
//   Pas de réponse    on rappelle dans deux jours ouvrés ; au troisième essai
//                     sans réponse, l'agent dort trois mois.
//   À recontacter     à la date dite, sinon dans une semaine.
//   Intéressé         on lui envoie nos critères, puis on le relance dans deux semaines.
//   Moyenne           dans deux semaines.
//   Contact régulier  dans un mois.
//   Mort              jamais.
//   Passé en Agent immo : il nous a envoyé une fiche, il vit désormais dans le
//                     tableau « Agent immobilier ». Plus rien ici.

export const STATUTS = {
  nouveau: 'Nouveau contact',
  pas_de_reponse: 'Pas de réponse',
  a_recontacter: 'À recontacter',
  interesse: 'Intéressé',
  moyenne: 'Moyenne',
  regulier: 'Contact régulier',
  mort: 'Mort',
  converti: 'Passé en Agent immo',
};
// Les jours avant de rappeler, par statut. Pas de réponse compte en jours ouvrés.
export const DELAIS = { pas_de_reponse: 2, a_recontacter: 7, interesse: 14, moyenne: 14, regulier: 30 };
export const ESSAIS_MAX = 3;
export const DORMANT_JOURS = 90;
export const MAX_PAR_PERSONNE = 25;

export const norm = (s) => String(s || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9@.+ -]/g, ' ').replace(/\s+/g, ' ').trim();

/** Pure : le statut lu dans Monday, en clé (« À recontacter » → a_recontacter). Null si vide ou inconnu. */
export function cleStatut(texte) {
  const t = norm(texte);
  if (!t) return null;
  for (const [cle, libelle] of Object.entries(STATUTS)) if (norm(libelle) === t) return cle;
  if (/pas de rep|no rep|repondeur/.test(t)) return 'pas_de_reponse';
  if (/rappel|recontact/.test(t)) return 'a_recontacter';
  if (/interess/.test(t)) return 'interesse';
  if (/regulier/.test(t)) return 'regulier';
  if (/mort|pas interess|stop/.test(t)) return 'mort';
  if (/nouveau/.test(t)) return 'nouveau';
  if (/agent immo/.test(t)) return 'converti';
  return null;
}

const ADRESSE = /[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/;
// Les adresses des sites d'annonces : jamais celles d'un agent.
const PORTAILS = /@(?:[a-z0-9-]+\.)*(?:seloger|leboncoin|bureauxlocaux|geolocaux|logic-immo|bienici|equimmox|apollo|cessionpme|properstar|greenacres)\.[a-z]+$/;

/** Pure : l'adresse mail utile d'un champ (« Jean <j@x.fr>, j@x.fr » → j@x.fr), ou null. */
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
export function clesDe({ email = null, telephone = null, nom = null, agence = null } = {}) {
  const cles = [];
  const e = normEmail(email);
  if (e) cles.push(`e:${e}`);
  const t = normTel(telephone);
  if (t) cles.push(`t:${t}`);
  const n = norm(nom);
  const a = norm(agence);
  if (n && a && n !== a) cles.push(`n:${n}|${a}`);
  else if (a && !e && !t) cles.push(`a:${a}`);
  return cles;
}

/** Pure : un index des agents déjà connus, clé → agent. */
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

/**
 * Pure : les candidats qui ne sont connus nulle part, une fois chacun (deux
 * sources qui apportent le même agent n'en font qu'un).
 */
export function nouveauxAgents(candidats, connus) {
  const index = indexer(connus);
  const neufs = [];
  for (const c of candidats || []) {
    if (!clesDe(c).length || dejaConnu(index, c)) continue;
    neufs.push(c);
    for (const k of clesDe(c)) index.set(k, c);
  }
  return neufs;
}

// Les dates : des jours civils, à Paris, en AAAA-MM-JJ.
export const jourDe = (d = new Date()) => new Intl.DateTimeFormat('fr-CA', { timeZone: 'Europe/Paris', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date(d));
const plusJours = (jour, n) => { const d = new Date(`${jour}T12:00:00Z`); d.setUTCDate(d.getUTCDate() + n); return d.toISOString().slice(0, 10); };
const jourSemaine = (jour) => new Date(`${jour}T12:00:00Z`).getUTCDay();
/** Pure : un samedi ou un dimanche glisse au lundi. */
export const ouvre = (jour) => (jourSemaine(jour) === 6 ? plusJours(jour, 2) : jourSemaine(jour) === 0 ? plusJours(jour, 1) : jour);
function plusJoursOuvres(jour, n) {
  let j = jour;
  for (let i = 0; i < n; i++) j = ouvre(plusJours(j, 1));
  return j;
}

/**
 * Pure : la prochaine relance après un appel, en AAAA-MM-JJ, et ce qu'il faut
 * en dire. `tentatives` compte les « Pas de réponse » d'affilée, celui-ci compris.
 * @returns {{ date: string|null, dormant?: boolean }}
 */
export function prochaineRelance(statut, { tentatives = 0, dite = null, maintenant = new Date() } = {}) {
  const aujourdhui = jourDe(maintenant);
  if (!statut || statut === 'mort' || statut === 'converti') return { date: null };
  if (statut === 'nouveau') return { date: ouvre(aujourdhui) };
  if (statut === 'pas_de_reponse') {
    if (tentatives >= ESSAIS_MAX) return { date: ouvre(plusJours(aujourdhui, DORMANT_JOURS)), dormant: true };
    return { date: plusJoursOuvres(aujourdhui, DELAIS.pas_de_reponse) };
  }
  if (dite && /^\d{4}-\d{2}-\d{2}$/.test(dite) && dite >= aujourdhui) return { date: ouvre(dite) };
  return { date: ouvre(plusJours(aujourdhui, DELAIS[statut] ?? 7)) };
}

/** Pure : ce prospect est-il à appeler ce jour-là ? */
export function estDu(p, aujourdhui) {
  const statut = cleStatut(p.statut);
  if (statut === 'mort' || statut === 'converti') return false;
  if (!p.telephone && !p.email) return false;
  if (p.prochaine_relance) return p.prochaine_relance <= aujourdhui;
  return true;
}

const RANGS = { a_recontacter: 0, interesse: 1, moyenne: 1, regulier: 2, nouveau: 3, pas_de_reponse: 4 };
const dateCourte = (jour) => (jour ? `${jour.slice(8, 10)}/${jour.slice(5, 7)}` : '');

/** Pure : pourquoi on l'appelle aujourd'hui, en une ligne. */
export function raisonDe(p, suivi = {}, aujourdhui) {
  const statut = cleStatut(p.statut);
  const retard = p.prochaine_relance && p.prochaine_relance < aujourdhui ? ` (prévu le ${dateCourte(p.prochaine_relance)})` : '';
  if (statut === 'a_recontacter') return `rappel promis${p.prochaine_relance ? ` pour le ${dateCourte(p.prochaine_relance)}` : ''}`;
  if (statut === 'interesse') return suivi.criteres_le ? `intéressé, critères envoyés le ${dateCourte(suivi.criteres_le.slice(0, 10))} : a-t-il un bien ?${retard}` : `intéressé : a-t-il un bien ?${retard}`;
  if (statut === 'moyenne') return `à relancer${retard}`;
  if (statut === 'regulier') return `contact régulier, point du mois${retard}`;
  if (statut === 'pas_de_reponse') return `pas de réponse, essai ${Math.min(ESSAIS_MAX, (suivi.tentatives || 0) + 1)} sur ${ESSAIS_MAX}${retard}`;
  const annonces = suivi.annonces ? `, ${suivi.annonces} annonce${suivi.annonces > 1 ? 's' : ''} commerciale${suivi.annonces > 1 ? 's' : ''}${p.ville ? ` à ${p.ville}` : ''}` : '';
  if (statut === 'nouveau' || !statut) return `premier appel${suivi.source ? ` (${suivi.source})` : ''}${annonces}`;
  return `à rappeler${retard}`;
}

/** Pure : l'ordre de la liste : les rappels promis, les chauds, les réguliers, les nouveaux (les plus gros d'abord), les sans-réponse. */
export function ordonner(liste, suivis = {}, aujourdhui) {
  const rang = (p) => RANGS[cleStatut(p.statut)] ?? 3;
  return [...liste].sort((a, b) =>
    rang(a) - rang(b)
    || (rang(a) === 3 ? (suivis[b.id]?.annonces || 0) - (suivis[a.id]?.annonces || 0) : 0)
    || (rang(a) === 4 ? (suivis[a.id]?.tentatives || 0) - (suivis[b.id]?.tentatives || 0) : 0)
    || String(a.prochaine_relance || aujourdhui).localeCompare(String(b.prochaine_relance || aujourdhui))
    || String(a.nom).localeCompare(String(b.nom)));
}

/**
 * Pure : la liste d'appels du jour, répartie entre les prospecteurs sans
 * qu'un agent soit appelé deux fois. Un agent qui a déjà quelqu'un
 * (colonne Collaborateurs) reste à cette personne ; les autres vont à celui
 * qui en a le moins. Au-delà de `max` par personne, le reste attend demain.
 * @param {object[]} prospects - lus dans Monday ({id, nom, collaborateurs: [emails], statut, prochaine_relance, …})
 * @param {{prospecteurs: string[], suivis?: object, max?: number, maintenant?: Date}} opts
 * @returns {{ parPersonne: Object<string, object[]>, reportes: object[] }}
 */
export function listeDuJour(prospects, { prospecteurs = [], suivis = {}, max = MAX_PAR_PERSONNE, maintenant = new Date(), extras = [], fige = {} } = {}) {
  const aujourdhui = jourDe(maintenant);
  const equipe = prospecteurs.map((e) => String(e).toLowerCase());
  const parPersonne = Object.fromEntries(equipe.map((e) => [e, []]));
  const reportes = [];
  const dus = ordonner((prospects || []).filter((p) => estDu(p, aujourdhui)), suivis, aujourdhui)
    .map((p) => ({ ...p, genre: 'prospect', raison: raisonDe(p, suivis[p.id] || {}, aujourdhui) }));
  // Les relances de dossiers et les retours aux gros agents passent devant :
  // un dossier en cours rapporte plus qu'un premier appel.
  const tout = [...(extras || []), ...dus];
  const moinsCharge = () => equipe.reduce((a, b) => (parPersonne[b].length < parPersonne[a].length ? b : a), equipe[0]);
  const attribution = {};
  // D'abord ceux qui ont déjà quelqu'un (la colonne Collaborateurs, ou la
  // répartition de ce matin) ; les autres ensuite, à qui en a le moins : un
  // agent donné à Paul à 8 h ne passe pas chez Nora à 11 h.
  const attitreDe = (p) => (p.collaborateurs || []).map((e) => String(e).toLowerCase()).find((e) => parPersonne[e])
    || (parPersonne[fige[p.id]] ? fige[p.id] : null);
  const ordre = [...tout.filter((p) => attitreDe(p)), ...tout.filter((p) => !attitreDe(p))];
  for (const p of ordre) {
    if (!equipe.length) { reportes.push(p); continue; }
    const qui = attitreDe(p) || moinsCharge();
    if (parPersonne[qui].length >= max) { reportes.push(p); continue; }
    parPersonne[qui].push(p);
    attribution[p.id] = qui;
  }
  // L'ordre de chaque liste reste celui des priorités, pas celui de la répartition.
  const rangs = new Map(tout.map((p, i) => [p.id, i]));
  for (const e of equipe) parPersonne[e].sort((a, b) => rangs.get(a.id) - rangs.get(b.id));
  return { parPersonne, reportes, attribution };
}

/**
 * Pure : ce qui a changé dans le tableau depuis le dernier regard. Un statut,
 * une remarque ou une date qui bouge, c'est quelqu'un qui vient d'appeler.
 * @returns {{ id, avant, apres, relance_touchee: boolean }[]}
 */
export function changements(avant = {}, prospects = []) {
  const out = [];
  for (const p of prospects) {
    const a = avant[p.id];
    if (!a) continue;
    const bouge = (a.statut || '') !== (p.statut || '') || (a.remarques || '') !== (p.remarques || '') || (a.date || '') !== (p.date || '');
    if (!bouge) continue;
    out.push({ id: p.id, avant: a, apres: p, relance_touchee: (a.prochaine_relance || '') !== (p.prochaine_relance || '') });
  }
  return out;
}

/** Pure : l'instantané gardé pour la comparaison suivante. */
export const instantaneDe = (prospects) => Object.fromEntries((prospects || []).map((p) => [p.id, { statut: p.statut || '', remarques: p.remarques || '', date: p.date || '', prochaine_relance: p.prochaine_relance || '' }]));

/** Pure : une remarque datée ajoutée devant les précédentes, sans dépasser ce que Monday garde bien. */
export function ajouterRemarque(existantes, texte, { maintenant = new Date(), par = null, plafond = 1500 } = {}) {
  const t = String(texte || '').replace(/\s+/g, ' ').trim();
  if (!t) return existantes || '';
  const jour = jourDe(maintenant);
  const ligne = `${dateCourte(jour)}${par ? ` ${par}` : ''} : ${t}`;
  return [ligne, String(existantes || '').trim()].filter(Boolean).join(' / ').slice(0, plafond);
}

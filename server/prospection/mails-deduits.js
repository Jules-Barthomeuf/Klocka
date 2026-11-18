// Le mail de chaque personne de la carte d'appel (18 nov. 2026, Jules : « mets leurs mails à chaque fois »).
//
// Quand le mail d'une personne n'est pas connu, il se déduit du format des mails de l'agence : un mail connu d'une
// personne nommée (« s.foucaud@reseau3c.fr » pour Stanislas Foucaud) donne le format (« p.nom ») et le domaine, qui
// s'appliquent aux autres. Sans aucun mail nommé, rien (18 nov. 2026, Jules : « mets rien, je préfère ça plutôt que de
// me tromper ») : plus de « prenom.nom » sur le domaine du site. Le mail déduit se garde à part (`email_deduit`,
// `email_deduit_par`) : il s'affiche, mais ne part jamais pour un vrai (ni Twenty, ni fiche, ni envoi).

import { domaineDe } from '../crm/agents-agences.js';

const net = (t) => String(t || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z\s-]/g, ' ').replace(/\s+/g, ' ').trim();

/** Pure : le prénom et le nom d'un nom complet, prêts pour un mail ; null pour un prénom seul ou une initiale. */
export function morceaux(nom) {
  const mots = net(nom).split(' ').filter(Boolean);
  if (mots.length < 2) return null;
  const famille = mots.slice(1).join('').replace(/-/g, '');
  if (famille.length < 2) return null;
  const prenom = mots[0].replace(/^-+|-+$/g, '');
  if (!prenom) return null;
  return { prenom, prenomColle: prenom.replace(/-/g, ''), initiale: prenom.split('-').filter(Boolean).map((p) => p[0]).join(''), nom: famille };
}

/** Les formats de mail, du plus courant au moins courant. */
export const FORMATS = {
  'prenom.nom': (m, p = m.prenom) => `${p}.${m.nom}`,
  'p.nom': (m) => `${m.initiale}.${m.nom}`,
  pnom: (m) => `${m.initiale}${m.nom}`,
  prenom: (m, p = m.prenom) => p,
  prenomnom: (m, p = m.prenom) => `${p}${m.nom}`,
  'prenom-nom': (m, p = m.prenom) => `${p}-${m.nom}`,
  prenom_nom: (m, p = m.prenom) => `${p}_${m.nom}`,
  'nom.prenom': (m, p = m.prenom) => `${m.nom}.${p}`,
  nom: (m) => m.nom,
  'prenom.n': (m, p = m.prenom) => `${p}.${m.nom[0]}`,
  nomp: (m) => `${m.nom}${m.initiale}`,
};

/** Pure : le format d'un mail connu pour ce nom (« s.foucaud@… » et « Stanislas Foucaud » → « p.nom »), ou null. */
export function formatDe(nom, email) {
  const m = morceaux(nom);
  const local = String(email || '').toLowerCase().split('@')[0];
  if (!m || !local) return null;
  for (const [f, faire] of Object.entries(FORMATS)) {
    if (faire(m) === local || faire(m, m.prenomColle) === local) return f;
  }
  return null;
}

/** Pure : le mail déduit d'une personne, d'après un format et un domaine ; null si son nom ne suffit pas. */
export function mailDe(nom, format, domaine) {
  const m = morceaux(nom);
  return m && FORMATS[format] && domaine ? `${FORMATS[format](m)}@${domaine}` : null;
}

const plusFrequent = (liste) => {
  const n = new Map();
  for (const x of liste.filter(Boolean)) n.set(x, (n.get(x) || 0) + 1);
  return [...n.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] || null;
};

/**
 * Pure : les personnes de la carte, chacune sans mail recevant `email_deduit` d'après le format des mails nommés de
 * l'agence ; sans mail nommé, rien. Les mails connus ne changent pas.
 */
export function avecMailsDeduits(contacts = [], agence = {}) {
  const connus = [...contacts, ...(agence?.agents || [])].filter((x) => x?.email && x?.nom).map((x) => ({ format: formatDe(x.nom, x.email), domaine: domaineDe(x.email, { reseaux: true }) })).filter((x) => x.format && x.domaine);
  const domaineNomme = plusFrequent(connus.map((x) => x.domaine));
  const format = plusFrequent(connus.filter((x) => x.domaine === domaineNomme).map((x) => x.format));
  if (!domaineNomme || !format) return contacts;
  return contacts.map((x) => {
    if (x.standard || x.email) return x;
    const email = mailDe(x.nom, format, domaineNomme);
    return email ? { ...x, email_deduit: email, email_deduit_par: 'format' } : x;
  });
}

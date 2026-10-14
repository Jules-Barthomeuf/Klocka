// Les visiteurs de la plateforme (14 oct. 2026, Jules : « je dois voir que pour
// les clients, donc ceux qui ne sont pas admin ») : visites, visiteurs uniques,
// durée, pages, pays, système, provenance, appareil, connexions. Sur le modèle
// du tableau d'audience du site, mais pour la plateforme : clients,
// mandataires, et les visiteurs anonymes des pages publiques (simulateur,
// projet partagé, portail, quiz). L'équipe n'y compte jamais, même quand elle
// passe sur une page publique sans être connectée (son navigateur est reconnu).
//
// Une visite (VisiteSession) : les pages d'un même navigateur sans pause de
// plus de trente minutes. Le pays se déduit du fuseau horaire du navigateur :
// pas de géolocalisation par l'adresse IP, rien n'est envoyé ailleurs.

import { Records } from './db.js';

const ENTITE = 'VisiteSession';
const PLAFOND = 20000;
const PAUSE_MS = 30 * 60 * 1000;
const court = (v, n) => (v == null ? null : String(v).slice(0, n));

/** Pure : le système et l'appareil d'après l'agent du navigateur et la largeur d'écran. */
export function appareilDe(ua = '', largeur = null) {
  const u = String(ua);
  const os = /iPhone|iPad|iPod/i.test(u) ? 'iOS' : /Android/i.test(u) ? 'Android' : /CrOS/i.test(u) ? 'Chrome OS' : /Windows/i.test(u) ? 'Windows' : /Mac OS X|Macintosh/i.test(u) ? 'Mac OS X' : /Linux/i.test(u) ? 'Linux' : 'Autre';
  const tablette = /iPad|Tablet/i.test(u) || (/Android/i.test(u) && !/Mobile/i.test(u));
  const mobile = !tablette && (/Mobi|iPhone|Android/i.test(u) || (Number(largeur) > 0 && Number(largeur) < 600));
  const robot = /bot|crawl|spider|slurp|headless|lighthouse|preview/i.test(u);
  return { os, appareil: tablette ? 'tablette' : mobile ? 'mobile' : 'ordinateur', robot };
}

// Les fuseaux les plus courants ; les autres se lisent par leur région.
const PAYS_DU_FUSEAU = {
  'Europe/Paris': 'France', 'Europe/Monaco': 'Monaco', 'Europe/Brussels': 'Belgique', 'Europe/Luxembourg': 'Luxembourg', 'Europe/Zurich': 'Suisse',
  'Europe/London': 'Royaume-Uni', 'Europe/Dublin': 'Irlande', 'Europe/Berlin': 'Allemagne', 'Europe/Madrid': 'Espagne', 'Europe/Rome': 'Italie',
  'Europe/Lisbon': 'Portugal', 'Europe/Amsterdam': 'Pays-Bas', 'Europe/Vienna': 'Autriche', 'Europe/Warsaw': 'Pologne', 'Europe/Stockholm': 'Suède',
  'Europe/Oslo': 'Norvège', 'Europe/Copenhagen': 'Danemark', 'Europe/Helsinki': 'Finlande', 'Europe/Prague': 'Tchéquie', 'Europe/Athens': 'Grèce',
  'Europe/Bucharest': 'Roumanie', 'Europe/Istanbul': 'Turquie', 'Europe/Moscow': 'Russie', 'Europe/Kiev': 'Ukraine', 'Europe/Kyiv': 'Ukraine',
  'America/Martinique': 'Martinique', 'America/Guadeloupe': 'Guadeloupe', 'America/Cayenne': 'Guyane', 'Indian/Reunion': 'La Réunion', 'Indian/Mayotte': 'Mayotte', 'Pacific/Noumea': 'Nouvelle-Calédonie', 'Pacific/Tahiti': 'Polynésie française',
  'America/New_York': 'États-Unis', 'America/Chicago': 'États-Unis', 'America/Denver': 'États-Unis', 'America/Los_Angeles': 'États-Unis', 'America/Phoenix': 'États-Unis',
  'America/Toronto': 'Canada', 'America/Montreal': 'Canada', 'America/Vancouver': 'Canada', 'America/Sao_Paulo': 'Brésil', 'America/Mexico_City': 'Mexique',
  'Africa/Casablanca': 'Maroc', 'Africa/Algiers': 'Algérie', 'Africa/Tunis': 'Tunisie', 'Africa/Dakar': 'Sénégal', 'Africa/Abidjan': 'Côte d\'Ivoire',
  'Asia/Dubai': 'Émirats arabes unis', 'Asia/Jerusalem': 'Israël', 'Asia/Tel_Aviv': 'Israël', 'Asia/Singapore': 'Singapour', 'Asia/Shanghai': 'Chine',
  'Asia/Hong_Kong': 'Hong Kong', 'Asia/Tokyo': 'Japon', 'Asia/Kolkata': 'Inde', 'Australia/Sydney': 'Australie',
};
/** Pure : le pays d'après le fuseau horaire, à défaut la région de la langue (« fr-FR »). */
export function paysDe(fuseau, langue) {
  if (PAYS_DU_FUSEAU[fuseau]) return PAYS_DU_FUSEAU[fuseau];
  const region = String(langue || '').split('-')[1]?.toUpperCase();
  const REGIONS = { FR: 'France', BE: 'Belgique', CH: 'Suisse', CA: 'Canada', US: 'États-Unis', GB: 'Royaume-Uni', DE: 'Allemagne', IT: 'Italie', ES: 'Espagne', IE: 'Irlande' };
  if (region && REGIONS[region]) return REGIONS[region];
  return fuseau ? String(fuseau).split('/')[0].replace('America', 'Amériques').replace('Europe', 'Europe, autre').replace('Asia', 'Asie').replace('Africa', 'Afrique') : 'Inconnu';
}

/** Pure : la provenance d'une visite, « Direct » sans page d'avant ou depuis la plateforme elle-même. */
export function provenanceDe(referrer, hoteCourant = '') {
  try {
    const u = new URL(String(referrer));
    if (!/^https?:$/.test(u.protocol) || (hoteCourant && u.host === hoteCourant)) return 'Direct';
    return u.host.replace(/^www\./, '');
  } catch { return 'Direct'; }
}

/**
 * Un passage sur une page : prolonge la visite du navigateur, ou en ouvre une.
 * `user` : la personne connectée, s'il y en a une.
 */
export function consignerPassage({ visiteur, page, url, referrer, largeur, fuseau, langue, ua, hote, user = null, maintenant = new Date() }) {
  const v = court(visiteur, 64);
  if (!v || !page) return null;
  const iso = maintenant.toISOString();
  const { os, appareil, robot } = appareilDe(ua, largeur);
  if (robot) return null;
  const dernieres = Records.list(ENTITE).filter((s) => s.visiteur === v);
  const ouverte = dernieres.find((s) => maintenant.getTime() - Date.parse(s.fin || s.debut) < PAUSE_MS);
  const qui = user?.email ? { par: String(user.email).toLowerCase(), role: user.role || null } : {};
  if (ouverte) {
    const pages = [...(ouverte.pages || []), court(page, 60)].slice(-60);
    Records.update(ENTITE, ouverte.id, { fin: iso, pages, ...qui, ...(qui.role === 'admin' ? { equipe: true } : {}) });
    return ouverte.id;
  }
  const s = Records.create(ENTITE, {
    visiteur: v, debut: iso, fin: iso, pages: [court(page, 60)], entree: court(url, 300),
    provenance: provenanceDe(referrer, hote), os, appareil, pays: paysDe(fuseau, langue), fuseau: court(fuseau, 60),
    ...qui, equipe: qui.role === 'admin',
  });
  elaguer();
  return s.id;
}

/** Le navigateur est encore là (toutes les 30 s quand la page est visible, et à sa fermeture) : la visite dure. */
export function battement({ visiteur, maintenant = new Date() }) {
  const v = court(visiteur, 64);
  if (!v) return null;
  const ouverte = Records.list(ENTITE).find((s) => s.visiteur === v && maintenant.getTime() - Date.parse(s.fin || s.debut) < PAUSE_MS);
  if (ouverte) Records.update(ENTITE, ouverte.id, { fin: maintenant.toISOString() });
  return ouverte?.id || null;
}

function elaguer() {
  const tout = Records.list(ENTITE);
  if (tout.length <= PLAFOND) return;
  for (const s of tout.sort((a, b) => String(a.debut).localeCompare(String(b.debut))).slice(0, tout.length - PLAFOND)) Records.delete(ENTITE, s.id);
}

const compter = (liste, cle) => {
  const m = new Map();
  for (const x of liste) { const k = typeof cle === 'function' ? cle(x) : x[cle]; for (const v of Array.isArray(k) ? k : [k]) if (v) m.set(v, (m.get(v) || 0) + 1); }
  return [...m.entries()].map(([nom, n]) => ({ nom, n })).sort((a, b) => b.n - a.n);
};
const duree = (s) => Math.max(0, Date.parse(s.fin || s.debut) - Date.parse(s.debut)) / 1000;
const evolution = (a, b) => (b ? Math.round(((a - b) / b) * 100) : null);

/**
 * Le tableau d'audience, hors équipe : sur `jours`, comparé aux `jours` d'avant.
 * Un navigateur qui s'est connecté une fois en admin est de l'équipe, toutes ses visites comprises.
 */
export function audience({ jours = 30, maintenant = new Date() } = {}) {
  const fin = maintenant.getTime();
  const depuis = new Date(fin - jours * 86400000).toISOString();
  const avant = new Date(fin - 2 * jours * 86400000).toISOString();
  const tout = Records.list(ENTITE);
  const equipe = new Set(tout.filter((s) => s.equipe || s.role === 'admin').map((s) => s.visiteur));
  const admins = new Set(Records.list('User').filter((u) => u.role === 'admin').map((u) => String(u.email).toLowerCase()));
  const dehors = tout.filter((s) => !equipe.has(s.visiteur) && !(s.par && admins.has(s.par)));
  const periode = dehors.filter((s) => s.debut >= depuis);
  const precedente = dehors.filter((s) => s.debut >= avant && s.debut < depuis);
  const uniques = (l) => new Set(l.map((s) => s.par || s.visiteur)).size;
  const moyenne = (l) => (l.length ? l.reduce((t, s) => t + duree(s), 0) / l.length : 0);
  // Une visite par jour, pour la courbe.
  const parJour = [];
  for (let i = jours - 1; i >= 0; i--) {
    const j = new Date(fin - i * 86400000).toISOString().slice(0, 10);
    const du = periode.filter((s) => s.debut.slice(0, 10) === j);
    parJour.push({ jour: j, visites: du.length, visiteurs: uniques(du) });
  }
  // Les connexions des comptes qui ne sont pas de l'équipe.
  const roles = new Map(Records.list('User').map((u) => [String(u.email).toLowerCase(), u.role]));
  const connexions = Records.list('Session')
    .filter((x) => String(x.created_date || '') >= depuis && x.user_email && roles.get(String(x.user_email).toLowerCase()) && roles.get(String(x.user_email).toLowerCase()) !== 'admin')
    .map((x) => ({ email: String(x.user_email).toLowerCase(), role: roles.get(String(x.user_email).toLowerCase()), le: x.created_date }))
    .sort((a, b) => String(b.le).localeCompare(String(a.le)));
  return {
    jours,
    totaux: {
      visites: periode.length, visites_evolution: evolution(periode.length, precedente.length),
      visiteurs: uniques(periode), visiteurs_evolution: evolution(uniques(periode), uniques(precedente)),
      duree_s: Math.round(moyenne(periode)), duree_evolution: evolution(moyenne(periode), moyenne(precedente)),
      connectes: new Set(periode.filter((s) => s.par).map((s) => s.par)).size,
    },
    par_jour: parJour,
    pages: compter(periode, (s) => [...new Set(s.pages || [])]),
    pays: compter(periode, 'pays'),
    os: compter(periode, 'os'),
    provenances: compter(periode, 'provenance'),
    appareils: compter(periode, 'appareil'),
    roles: compter(periode, (s) => (s.role === 'user' ? 'Client' : s.role === 'mandataire' ? 'Mandataire' : 'Non connecté')),
    // Une ligne par personne : combien de connexions, la dernière.
    connexions: {
      total: connexions.length, personnes: new Set(connexions.map((c) => c.email)).size,
      par_personne: [...new Set(connexions.map((c) => c.email))].map((email) => { const siennes = connexions.filter((c) => c.email === email); return { email, role: siennes[0].role, n: siennes.length, derniere: siennes[0].le }; }).slice(0, 40),
    },
  };
}

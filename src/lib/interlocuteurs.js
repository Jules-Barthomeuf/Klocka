// Qui demander au téléphone (17 nov. 2026, Jules : « pas ceux qui font de la location, mais un conseiller en
// transaction, une responsable administrative, le manager de l'agence »). Partagé par le serveur (l'équipe Apollo, les
// interlocuteurs de la file) et l'écran (la carte d'avant l'appel, qui ajoute l'équipe Apollo à son ouverture).

// La location, la gestion locative, le syndic et les métiers sans rapport ne sont pas des interlocuteurs.
export const HORS_SUJET = /(locat|rental|letting|leasing|gestion|property manag|syndic|copropri|comptab|account|marketing|communication|community|social media|e-?commerce|legal|juridique|travaux|logisti|[ée]v[éeè]nement|event|\\bcto\\b|\\bcfo\\b|t[ée]l[ée]conseill|business develop|d[ée]veloppeu|developer|stagiaire|intern\b|alternan|apprenti|photograph|home ?stag|\bit\b|informati|data|rh\b|ressources humaines|human resources|recrut)/i;
// Un poste mêlé (« négociateur location et transaction ») reste un interlocuteur s'il fait de la transaction ou du commerce.
const MALGRE_TOUT = /(transaction|immobilier (commercial|d.entreprise)|fonds de commerce|locaux commerciaux|murs commerciaux)/i;
// Du plus probable au moins probable : le commerce, la transaction, la direction de l'agence, l'administratif.
export const RANGS = [
  /(immobilier (commercial|d.entreprise)|fonds de commerce|locaux commerciaux|murs commerciaux|cession|(?<![-\w])commerces?\b)/i,
  /(transaction|n[ée]gociat|conseill|agent immobilier|real estate agent|sales|vente|commercial|charg[ée]e? de projet|consultant|broker)/i,
  /(directeur|directrice|director|manager|g[ée]rant|responsable d.agence|head|ceo|founder|fondat|pr[ée]sident|associ[ée]|owner|partner|dirigeant)/i,
  /(assistant|administrati|office|secr[ée]taire|accueil)/i,
];

/** Pure : le rang d'un poste (0 le plus probable), ou null s'il n'est pas un interlocuteur (location, gestion…). */
export function rangPoste(poste) {
  const p = String(poste || '');
  if (HORS_SUJET.test(p) && !MALGRE_TOUT.test(p)) return null;
  // Une assistante reste à l'administratif, même « commerciale » ou « de direction » (17 nov. 2026, Azurea), sauf si elle
  // fait du commerce (immobilier commercial, fonds).
  if (RANGS[3].test(p) && !RANGS[0].test(p)) return 3;
  // Un poste qui ne dit ni transaction, ni direction, ni administratif (« Greenbullien ») n'est pas proposé.
  const i = RANGS.findIndex((re) => re.test(p));
  return i < 0 ? null : i;
}

// Un poste écrit mais inconnu de la grille (« Expert immobilier ») reste proposé, après les autres ; seul un poste hors
// sujet (location, gestion…) écarte la personne. Apollo, lui, ne garde que les postes reconnus (equipeRangee).
const rangContact = (x) => {
  if (!x.fonction) return x.source === 'Registre du commerce' ? 2 : RANGS.length;
  const r = rangPoste(x.fonction);
  if (r != null) return r;
  return HORS_SUJET.test(x.fonction) && !MALGRE_TOUT.test(x.fonction) ? null : RANGS.length;
};

const CONNUS = new Set(['Contact donné', 'Contact Twenty CRM', 'Dernier interlocuteur']);

/**
 * Pure : les interlocuteurs de la carte, dans l'ordre où les demander. D'abord ceux qu'on connaît déjà (contact donné,
 * Twenty CRM, dernier interlocuteur), tels quels ; puis les autres (registre du commerce, site de l'agence, Apollo)
 * rangés par poste, sans la location ni les postes sans rapport ; le standard en dernier. Le premier des rangés porte
 * `probable` quand personne n'est connu. Un poste inconnu (gérant du registre sans qualité) passe après les rangés.
 */
const cle = (s) => String(s || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/[^a-z]+/g, ' ').trim();

/**
 * Pure : une même personne écrite en court par Apollo (« Benjamin C. ») et en entier ailleurs (« Benjamin CASENOBE »,
 * page équipe du site) ne fait qu'une : le nom complet reste, avec le poste et la photo de l'autre s'il lui en manque.
 */
export function fusionnerNoms(contacts = []) {
  const out = contacts.map((x) => ({ ...x }));
  const retires = new Set();
  for (const c of out) {
    const m = String(c.nom || '').trim().match(/^(\S+)\s+(\p{L})\.$/u);
    if (!m || c.standard) continue;
    const prenom = cle(m[1]); const initiale = cle(m[2]);
    const complet = out.find((x) => x !== c && !x.standard && !retires.has(x) && !/^\S+\s+\p{L}\.$/u.test(String(x.nom || '').trim())
      // L'initiale du nom, particule passée (« Claire C. » est « Claire de Chambure », 17 nov. 2026).
      && cle(x.nom).split(' ')[0] === prenom && (cle(x.nom).split(' ').slice(1).filter((w) => !/^(de|du|des|d|la|le|van|von|di|da)$/.test(w))[0]?.[0] || '') === initiale);
    if (!complet) continue;
    complet.fonction = complet.fonction || c.fonction;
    complet.photo = complet.photo || c.photo;
    retires.add(c);
  }
  return out.filter((x) => !retires.has(x));
}

/** Pure : la photo de chaque personne, d'après les photos de la page équipe rangées par nom. */
export const avecPhotos = (contacts = [], parNom = {}) => contacts.map((x) => (x.photo || !parNom?.[cle(x.nom)] ? x : { ...x, photo: parNom[cle(x.nom)] }));

export function rangerInterlocuteurs(contacts0 = [], max = 6) {
  const contacts = fusionnerNoms(contacts0);
  const connus = contacts.filter((x) => !x.standard && CONNUS.has(x.source));
  const autres = contacts.filter((x) => !x.standard && !CONNUS.has(x.source))
    .map((x, i) => ({ x, i, r: rangContact(x) }))
    .filter((c) => c.r != null)
    .sort((a, b) => a.r - b.r || a.i - b.i)
    .map((c, k) => (k === 0 && !connus.length ? { ...c.x, probable: true } : c.x));
  const standard = contacts.filter((x) => x.standard);
  return [...connus, ...autres].slice(0, max).concat(standard);
}

/**
 * Pure : qui a décroché, cochée d'office après l'appel (24 nov. 2026, Jules : « on oublie qui on a appelé, on clique sur
 * qui a décroché et ça remplit les cases de Twenty »). Le nom entendu pendant l'appel s'il est dans la liste (prénom et
 * nom, ou un prénom que personne d'autre ne porte) ; un nom entendu absent de la liste : « autre », avec ce nom ; sinon la
 * personne choisie avant l'appel ; sinon personne. Rend { id, nom, par } : par « entendu », « avant » ou null.
 */
export function quiADecroche({ contacts = [], entendu = null, avant = null } = {}) {
  const gens = contacts.filter((x) => !x.standard && x.nom);
  const e = cle(entendu);
  if (e) {
    const mots = e.split(' ');
    const complet = gens.find((x) => { const n = cle(x.nom).split(' '); return mots.length > 1 && mots.every((m) => n.includes(m)); });
    const parPrenom = gens.filter((x) => cle(x.nom).split(' ')[0] === mots[0]);
    const trouve = complet || (mots.length === 1 && parPrenom.length === 1 ? parPrenom[0] : null);
    if (trouve) return { id: trouve.id, nom: trouve.nom, par: 'entendu' };
    return { id: 'autre', nom: String(entendu).trim(), par: 'entendu' };
  }
  const a = gens.find((x) => x.id === avant);
  return a ? { id: a.id, nom: a.nom, par: 'avant' } : { id: null, nom: null, par: null };
}

/**
 * Pure : les cases du contact Twenty CRM que remplit la personne choisie. Son nom ; son numéro direct et son mail s'ils
 * sont connus (un mail déduit du format de l'agence n'est pas vérifié : il ne part pas dans Twenty). Le standard : le
 * contact reste à compléter, le numéro composé ne change pas.
 */
export function champsDecroche(x) {
  if (!x) return {};
  if (x.standard) return { interlocuteur: '' };
  return { interlocuteur: String(x.nom || '').trim(), ...(x.telephone ? { telephone: x.telephone } : {}), ...(x.email ? { email: x.email } : {}) };
}

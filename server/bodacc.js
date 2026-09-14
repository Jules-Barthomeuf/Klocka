// BODACC — ce qui ouvre, ce qui se vend et ce qui ferme dans la rue.
//
// Une rue se juge mal à ses seuls loyers. Deux artères peuvent afficher le
// même prix au mètre carré et n'avoir rien à voir : dans l'une les commerces
// tiennent, dans l'autre trois ont été liquidés en dix-huit mois. Le second
// cas se paie, tôt ou tard, en vacance.
//
// Le Bulletin officiel des annonces civiles et commerciales publie ces
// mouvements par obligation légale : créations, cessions de fonds, procédures
// collectives, radiations. C'est exhaustif, daté, gratuit, et adossé aux
// greffes — pas un panel.
//
// Ce qu'on en tire et ce qu'on n'en tire pas. On compte les mouvements de la
// RUE et on les rapporte à ceux de la commune, parce qu'un chiffre brut ne dit
// rien sans son fond : trois fermetures dans une rue de quarante commerces
// n'est pas trois fermetures dans une rue de six. En revanche le BODACC ne
// permet PAS de calculer un taux de vacance : il dit qu'un commerce a fermé,
// jamais si le local est resté vide. Ce serait le chiffre le plus utile, et
// aucune source publique ne le donne à l'échelle d'une rue.

import { Records } from './db.js';
import { resoudreAdresse } from './data-b.js';
import { ErreurSource } from './marche/erreurs.js';

const CACHE_JOURS = 7;
const MOIS_DEFAUT = 24;
const PAGE = 100;
// Assez pour une rue, jamais pour une commune : on ne pagine plus la commune.
const PAGES_MAX = 10;
const API = 'https://bodacc-datadila.opendatasoft.com/api/explore/v2.1/catalog/datasets/annonces-commerciales/records';

// Les familles qui parlent de la vie d'un commerce. « dpc » (dépôt des
// comptes) et « modification » sont du bruit administratif : une société qui
// dépose ses comptes ne dit rien de la rue.
const FAMILLES = ['creation', 'vente', 'collective', 'radiation'];

/** Un nom de rue comparable : sans accents, sans type de voie, sans ponctuation. */
export function cleRue(nom) {
  return String(nom || '')
    .normalize('NFD').replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/\b(avenue|av|rue|boulevard|bd|bld|place|pl|impasse|allee|cours|quai|chemin|route|passage|pas|square|voie)\b/g, ' ')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

/** L'adresse d'une annonce : celle du fonds si elle existe, sinon le siège. */
export function adresseDe(annonce) {
  const lire = (v) => {
    if (!v) return null;
    try {
      return typeof v === 'string' ? JSON.parse(v) : v;
    } catch {
      return null;
    }
  };
  const etab = lire(annonce.listeetablissements)?.etablissement;
  const pers = lire(annonce.listepersonnes)?.personne;
  const a = (Array.isArray(etab) ? etab[0] : etab)?.adresse || (Array.isArray(pers) ? pers[0] : pers)?.adresseSiegeSocial;
  if (!a) return null;
  return {
    numero: a.numeroVoie || '',
    voie: [a.typeVoie, a.nomVoie].filter(Boolean).join(' ').trim(),
    code_postal: a.codePostal || '',
    ville: a.ville || '',
  };
}

/** Ce qu'une annonce raconte, en une ligne lisible. */
export function evenementDe(annonce) {
  const lire = (v) => {
    try {
      return typeof v === 'string' ? JSON.parse(v) : v;
    } catch {
      return null;
    }
  };
  const famille = annonce.familleavis;
  const jugement = lire(annonce.jugement);
  const etab = lire(annonce.listeetablissements)?.etablissement;
  const origine = (Array.isArray(etab) ? etab[0] : etab)?.origineFonds || '';
  // « acquis par achat au prix stipulé de 140000.00 euros »
  const prix = origine.match(/prix stipul[ée]\s+de\s+([\d\s.,]+)\s*euros/i);
  const activite = (Array.isArray(etab) ? etab[0] : etab)?.activite || null;

  // Une liquidation n'est pas un redressement : l'une ferme, l'autre tente de
  // continuer. Les confondre ferait d'une rue en difficulté une rue morte.
  const nature = jugement?.nature || jugement?.famille || '';
  const ferme = famille === 'radiation' || /liquidation/i.test(nature);

  return {
    date: annonce.dateparution,
    famille,
    commercant: annonce.commercant || null,
    activite,
    nature: nature || null,
    prix: prix ? Math.round(Number(prix[1].replace(/\s/g, '').replace(',', '.'))) || null : null,
    ferme,
    lien: annonce.url_complete || null,
  };
}

/** Un appel à l'API BODACC. */
async function appeler(params) {
  const url = `${API}?${new URLSearchParams(params)}`;
  let r;
  try {
    r = await fetch(url, { signal: AbortSignal.timeout(20000) });
  } catch (e) {
    throw new ErreurSource(`Le BODACC n'a pas répondu (${e?.message || e}).`, { service: 'BODACC', cause: e });
  }
  if (!r.ok) throw new ErreurSource(`Le BODACC a répondu ${r.status}.`, { service: 'BODACC', statut: r.status });
  return r.json();
}

/** Le mot par lequel chercher une rue : son nom, sans le type de voie. */
export function motDeRue(rue) {
  const propre = cleRue(rue);
  return propre ? propre.replace(/["\\]/g, '') : null;
}

/**
 * La vie commerciale d'une rue et de sa commune, sur les N derniers mois.
 *
 * @param {string} texteAdresse
 * @param {{mois?: number, forcer?: boolean, user?: object}} opts
 */
export async function vitaliteCommerciale(texteAdresse, { mois = MOIS_DEFAUT, forcer = false, user = null } = {}) {
  let adresse;
  try {
    adresse = await resoudreAdresse(texteAdresse);
  } catch (e) {
    return { ok: false, error: e.message, statut: e.statut ?? null, classe: e.classe ?? null };
  }
  if (!adresse) return { ok: false, error: `Adresse introuvable dans la Base Adresse Nationale : « ${String(texteAdresse || '').slice(0, 80)} ».` };
  if (!adresse.code_postal) return { ok: false, error: `Pas de code postal pour « ${adresse.label} » : le BODACC s'interroge par code postal.` };

  const cle = `${adresse.code_postal}|${cleRue(adresse.rue)}|${mois}`;
  if (!forcer) {
    const recent = Records.filter('BodaccRecherche', { cle })
      .filter((x) => Date.now() - Date.parse(x.le) < CACHE_JOURS * 86400000)
      .sort((a, b) => String(b.le).localeCompare(String(a.le)))[0];
    if (recent) return { ok: true, resultat: { ...recent.resultat, du_cache: true } };
  }

  const depuis = new Date(Date.now() - mois * 30.4 * 86400000).toISOString().slice(0, 10);
  const periode = `cp="${adresse.code_postal}" and dateparution>="${depuis}"`;
  const familles = `familleavis in (${FAMILLES.map((f) => `"${f}"`).join(', ')})`;
  const mot = motDeRue(adresse.rue);
  if (!mot) return { ok: false, error: `Pas de nom de rue exploitable dans « ${adresse.label} ».` };

  // La rue se filtre CHEZ LA SOURCE. En paginant la commune entière on ne
  // lisait que les annonces les plus récentes — mille deux cents sur trois
  // mille huit cents à Courbevoie — et les comptes de la rue ne portaient donc
  // que sur une partie de la période, sans que rien ne le dise.
  const ouRue = `${periode} and ${familles} and (search(listeetablissements, "${mot}") or search(listepersonnes, "${mot}"))`;

  const candidats = [];
  let trouves = 0;
  try {
    for (let i = 0; i < PAGES_MAX; i++) {
      const d = await appeler({ where: ouRue, limit: String(PAGE), offset: String(i * PAGE), order_by: 'dateparution desc' });
      trouves = d.total_count ?? 0;
      candidats.push(...(d.results || []));
      if (candidats.length >= trouves) break;
    }
  } catch (e) {
    return { ok: false, error: e.message, statut: e.statut ?? null, classe: e.classe ?? null };
  }

  // La recherche plein texte ratisse large — un patronyme « Marceau », une rue
  // voisine du même nom. L'appartenance à la rue se tranche ici, sur l'adresse.
  const cible = cleRue(adresse.rue);
  const surLaRue = [];
  for (const a of candidats) {
    const ad = adresseDe(a);
    if (!ad) continue;
    if (cleRue(ad.voie) !== cible) continue;
    surLaRue.push({ ...evenementDe(a), numero: ad.numero || null });
  }
  surLaRue.sort((a, b) => String(b.date).localeCompare(String(a.date)));

  const compter = (liste) => ({
    creations: liste.filter((e) => e.famille === 'creation').length,
    cessions: liste.filter((e) => e.famille === 'vente').length,
    procedures: liste.filter((e) => e.famille === 'collective').length,
    fermetures: liste.filter((e) => e.ferme).length,
  });

  // Le fond de tableau : la commune, comptée par la source elle-même. Un
  // agrégat au lieu de milliers d'annonces — exact, et un seul appel.
  let commune = null;
  try {
    const d = await appeler({ where: `${periode} and ${familles}`, group_by: 'familleavis', select: 'familleavis, count(*) as n', limit: '20' });
    const par = Object.fromEntries((d.results || []).map((x) => [x.familleavis, x.n]));
    commune = {
      creations: par.creation || 0,
      cessions: par.vente || 0,
      procedures: par.collective || 0,
      // À l'échelle de la commune, on ne peut pas distinguer les liquidations
      // des autres procédures sans lire chaque annonce : on compte les
      // radiations, et on dit que les procédures sont à côté.
      radiations: par.radiation || 0,
      total: Object.values(par).reduce((t, n) => t + n, 0),
    };
  } catch {
    // Le fond de tableau est un confort : son absence ne perd pas la rue.
    commune = null;
  }

  const resultat = {
    source: 'BODACC · Annonces commerciales',
    adresse: adresse.label,
    rue: adresse.rue,
    commune: adresse.ville,
    code_postal: adresse.code_postal,
    mois,
    depuis,
    // La rue, et la commune pour lui donner son fond.
    sur_la_rue: { ...compter(surLaRue), evenements: surLaRue.slice(0, 40), annonces_lues: surLaRue.length, tronque: candidats.length < trouves },
    commune_entiere: commune,
    // Les prix de cession que le BODACC publie en clair : un contrôle gratuit
    // de ce que Data-B vend.
    cessions_avec_prix: surLaRue.filter((e) => e.prix).map((e) => ({ date: e.date, prix: e.prix, activite: e.activite, commercant: e.commercant, numero: e.numero })),
    lien: `https://www.bodacc.fr/pages/annonces-commerciales-recherche/?q=${encodeURIComponent(adresse.rue + ' ' + adresse.ville)}`,
    le: new Date().toISOString(),
    par: user?.email || null,
  };

  Records.create('BodaccRecherche', { cle, adresse: adresse.label, mois, resultat, le: resultat.le, par: resultat.par });
  console.log(`[bodacc] ${surLaRue.length} annonce(s) sur « ${adresse.rue} » sur ${mois} mois (${candidats.length} candidat(e)s lus sur ${adresse.code_postal})`);
  return { ok: true, resultat };
}

// ---------------------------------------------------------------------------
// ALX : les événements d'UNE société, par SIREN
// ---------------------------------------------------------------------------
//
// À l'échelle d'une rue, « modification » est du bruit administratif. À
// l'échelle d'une société propriétaire, c'est le signal : un changement de
// gérant, un transfert de siège, une dissolution disent qu'une décision se
// prend. On ne filtre donc plus par famille ici.

const TYPE_DE = (a) => {
  const t = `${a.familleavis || ''} ${a.typeavis || ''} ${JSON.stringify(a.listepersonnes || '')} ${JSON.stringify(a.modificationsgenerales || '')}`.toLowerCase();
  if (/liquidation|redressement|sauvegarde|collective/.test(t)) return 'procédure collective';
  if (/dissolution|radiation/.test(t)) return 'radiation ou dissolution';
  // L'avis le dit parfois en clair : « suite au décès de ». Le plus fort des
  // signaux patients, quand on le voit.
  if (/d[ée]c[èe]s|d[ée]c[ée]d[ée]e?/.test(t)) return 'décès d’un dirigeant';
  if (/g[ée]rant|dirigeant|administrat/.test(t)) return 'changement de gérance';
  if (/si[èe]ge|transfert/.test(t)) return 'transfert de siège';
  if (/cession|vente/.test(t)) return 'cession';
  if (a.familleavis === 'creation') return 'création';
  return a.familleavis || 'modification';
};

/**
 * Les annonces BODACC d'une société, les plus récentes en premier.
 * @param {string} siren
 * @param {{mois?: number}} [opts]
 * @returns {Promise<{date: string, type: string, detail: string, source: 'BODACC'}[]>}
 */
export async function evenementsSociete(siren, { mois = 36 } = {}) {
  const propre = String(siren || '').replace(/\s/g, '');
  if (!/^\d{9}$/.test(propre)) return [];
  const depuis = new Date(Date.now() - mois * 30.44 * 86400000).toISOString().slice(0, 10);
  const d = await appeler({
    where: `registre like "${propre}%" and dateparution >= date'${depuis}'`,
    order_by: 'dateparution desc',
    limit: '50',
  });
  return (d.results || []).map((a) => ({
    date: a.dateparution,
    type: TYPE_DE(a),
    detail: [a.commercant, a.typeavis].filter(Boolean).join(' · ').slice(0, 200),
    source: 'BODACC',
  }));
}

// L'espace mandataire : ses objets (spécification V1 du 30 septembre 2026).
//
// Le secteur (un polygone tracé par un admin, jamais par le mandataire), la
// fiche du mandataire (RSAC, RC pro, attestation — avec l'alerte avant
// expiration), les demandes des clients Klocka (saisies par l'admin, servies
// anonymisées), les propriétaires démarchés et la séquence de relance.
//
// Deux règles que le code impose, pas la consigne :
//  - un mandataire ne voit que SON secteur, SES propriétaires, SES
//    prospections : tout est filtré par son adresse mail ;
//  - une demande client sort d'ici sans nom, sans mail, sans société — le
//    mandataire ne doit jamais pouvoir joindre un client Klocka.

import { Records, Meta } from './db.js';
import { dansNJoursParis } from './rappels.js';

const norm = (t) => String(t || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().trim();
const aMidi = (d) => { const x = new Date(d); x.setHours(12, 0, 0, 0); return x; };
const dansJours = (iso) => Math.round((aMidi(new Date(iso)) - aMidi(new Date())) / 86400000);

// ---------------------------------------------------------------------------
// Géométrie — le secteur est un polygone de [lat, lon].
// ---------------------------------------------------------------------------

/** Pure : le point est-il dans le polygone (lancer de rayon) ? */
export function dansPolygone([lat, lon], points) {
  if (!Array.isArray(points) || points.length < 3) return false;
  let dedans = false;
  for (let i = 0, j = points.length - 1; i < points.length; j = i, i += 1) {
    const [lat1, lon1] = points[i];
    const [lat2, lon2] = points[j];
    if (lon1 > lon !== lon2 > lon && lat < ((lat2 - lat1) * (lon - lon1)) / (lon2 - lon1) + lat1) {
      dedans = !dedans;
    }
  }
  return dedans;
}

// Distance d'un point à un segment, en kilomètres (projection locale).
function distanceSegmentKm([la, lo], [la1, lo1], [la2, lo2]) {
  const kx = 111.32 * Math.cos((la * Math.PI) / 180);
  const ky = 110.57;
  const px = (lo - lo1) * kx, py = (la - la1) * ky;
  const sx = (lo2 - lo1) * kx, sy = (la2 - la1) * ky;
  const l2 = sx * sx + sy * sy;
  const t = l2 ? Math.max(0, Math.min(1, (px * sx + py * sy) / l2)) : 0;
  return Math.hypot(px - t * sx, py - t * sy);
}
const distanceBordKm = (p, anneau) => {
  let min = Infinity;
  for (let i = 0; i < anneau.length; i += 1) min = Math.min(min, distanceSegmentKm(p, anneau[i], anneau[(i + 1) % anneau.length]));
  return min;
};
const boite = (a) => a.reduce((b, [la, lo]) => [Math.min(b[0], la), Math.min(b[1], lo), Math.max(b[2], la), Math.max(b[3], lo)], [90, 180, -90, -180]);
const boitesSeTouchent = (a, b) => a[0] <= b[2] && b[0] <= a[2] && a[1] <= b[3] && b[1] <= a[3];

// Deux départements voisins partagent une frontière, mais leurs contours
// simplifiés (à 1 km) ne tombent pas exactement l'un sur l'autre. Un sommet
// n'enfonce donc un chevauchement que s'il est à plus de cette marge du bord.
const MARGE_KM = 1.5;
const entre = (a, b) => a.some((p) => dansPolygone(p, b) && distanceBordKm(p, b) > MARGE_KM);

/**
 * Pure : deux anneaux se chevauchent-ils vraiment ? Un sommet de l'un
 * enfoncé dans l'autre au-delà de la marge. Les secteurs ne se chevauchent
 * pas : c'est la promesse faite aux mandataires, la plateforme la tient ici.
 */
export function seChevauchent(a, b) {
  if (!a?.length || !b?.length) return false;
  if (!boitesSeTouchent(boite(a), boite(b))) return false;
  return entre(a, b) || entre(b, a);
}

/** Les anneaux d'un secteur : plusieurs (une région, des communes), ou le contour dessiné. */
export const anneauxSecteur = (s) => (s?.polygones?.length ? s.polygones : s?.points?.length >= 3 ? [s.points] : []);
export const dansSecteur = (p, s) => anneauxSecteur(s).some((a) => dansPolygone(p, a));

/**
 * Pure : une commune est-elle dans le secteur ? Un secteur fait de communes,
 * départements ou régions se lit par leurs codes : le « centre » que donne
 * l'API Géo est un barycentre, qui tombe parfois hors de la commune (Mâcon,
 * en deux morceaux). Un secteur dessiné à la main se lit par la géométrie.
 * @param {{code?: string, codeDepartement?: string, codeRegion?: string, lat: number, lon: number}} c
 */
export function communeDansSecteur(c, s) {
  const unites = s?.unites || [];
  if (unites.length) {
    const codes = { commune: c.code, departement: c.codeDepartement, region: c.codeRegion };
    if (unites.some((u) => codes[u.niveau] && String(codes[u.niveau]) === String(u.code))) return true;
    if (c.code && unites.every((u) => u.niveau in codes)) return false;
  }
  return dansSecteur([c.lat, c.lon], s);
}

/** Deux secteurs se chevauchent : une même unité (département, commune…), ou la géométrie. */
export function secteursSeChevauchent(a, b) {
  const cles = new Set((a.unites || []).map((u) => `${u.niveau}:${u.code}`));
  if ((b.unites || []).some((u) => cles.has(`${u.niveau}:${u.code}`))) return true;
  const aa = anneauxSecteur(a);
  const bb = anneauxSecteur(b);
  return aa.some((x) => bb.some((y) => seChevauchent(x, y)));
}

// ---------------------------------------------------------------------------
// Secteurs — tracés et attribués par l'admin, lus par le mandataire.
// ---------------------------------------------------------------------------

export function listerSecteurs() {
  return Records.list('SecteurMandataire');
}

export function secteurDe(user) {
  return Records.list('SecteurMandataire').find((s) => s.mandataire_email === String(user?.email || '').toLowerCase()) || null;
}

/** Les villes ALX dont le centre tombe dans le secteur : là où la recherche sait chercher. */
export function villesDuSecteur(secteur) {
  if (!anneauxSecteur(secteur).length) return [];
  return Records.list('Ville')
    .filter((v) => !v.cachee && v.centre?.lat != null && dansSecteur([v.centre.lat, v.centre.lon], secteur))
    .map((v) => ({ id: v.id, nom: v.nom, centre: v.centre, code_insee: v.code_insee }));
}

/**
 * Crée ou redessine un secteur (admin seulement, la route le garantit).
 * Refuse un chevauchement : la spécification laisse le choix entre refuser et
 * signaler, on refuse — un territoire ambigu fait deux mandataires fâchés.
 */
/**
 * Crée ou redessine un secteur (admin seulement, la route le garantit). Le
 * contour vient d'un tracé à la main (`points`), d'unités administratives
 * choisies (`polygones` et `unites` : régions, départements, communes), ou
 * des deux. Refuse un chevauchement : un territoire ambigu fait deux
 * mandataires fâchés.
 */
export function poserSecteur({ id = null, nom, mandataire_email, points = [], polygones = [], unites = [] }, user) {
  const propre = (anneau) => (anneau || []).map((p) => [Number(p[0]), Number(p[1])]);
  const anneaux = [
    ...(Array.isArray(polygones) ? polygones.map(propre) : []),
    ...(Array.isArray(points) && points.length >= 3 ? [propre(points)] : []),
  ].filter((a) => a.length >= 3);
  if (!anneaux.length) return { ok: false, error: 'Un secteur a au moins trois points, ou une commune, un département, une région.' };
  if (anneaux.some((a) => a.some((p) => !isFinite(p[0]) || !isFinite(p[1])))) return { ok: false, error: 'Un point du contour est illisible.' };
  const unitesPropres = (Array.isArray(unites) ? unites : []).map((u) => ({ niveau: String(u.niveau), code: String(u.code), nom: String(u.nom || u.code) }));
  const candidat = { polygones: anneaux, unites: unitesPropres };

  const email = String(mandataire_email || '').toLowerCase() || null;
  const autres = Records.list('SecteurMandataire').filter((s) => s.id !== id);
  const conflit = autres.find((s) => secteursSeChevauchent(candidat, s));
  if (conflit) return { ok: false, error: `Ce contour empiète sur « ${conflit.nom} »${conflit.mandataire_email ? ` (${conflit.mandataire_email})` : ''}.` };
  const deja = email ? autres.find((s) => s.mandataire_email === email) : null;
  if (deja) return { ok: false, error: `${email} a déjà le secteur « ${deja.nom} ».` };

  // Le plus grand anneau reste aussi en `points` : les écrans qui ne
  // connaissent qu'un contour (le centre de la carte) continuent de marcher.
  const principal = anneaux.reduce((a, b) => (b.length > a.length ? b : a));
  const geometrie = { polygones: anneaux, unites: unitesPropres, points: principal };
  const trace = { le: new Date().toISOString(), par: user?.email || null };
  if (id) {
    const s = Records.get('SecteurMandataire', id);
    if (!s) return { ok: false, error: 'Secteur introuvable.' };
    // L'historique dit qui a modifié quoi, et quand. Les propriétaires déjà
    // suivis restent à qui les suit : rien ici ne les rattache au contour.
    const secteur = Records.update('SecteurMandataire', id, {
      nom: nom || s.nom,
      mandataire_email: email,
      ...geometrie,
      historique: [...(s.historique || []), { ...trace, action: 'redessiné' }],
    });
    return { ok: true, secteur };
  }
  const secteur = Records.create('SecteurMandataire', {
    nom: nom || 'Secteur',
    mandataire_email: email,
    ...geometrie,
    cree_le: trace.le,
    historique: [{ ...trace, action: 'créé' }],
  });
  return { ok: true, secteur };
}

/** Changer le mandataire d'un secteur, sans toucher au contour. */
export function attribuerSecteur(id, mandataire_email, user) {
  const s = Records.get('SecteurMandataire', id);
  if (!s) return { ok: false, error: 'Secteur introuvable.' };
  const email = String(mandataire_email || '').toLowerCase() || null;
  const deja = email ? Records.list('SecteurMandataire').find((x) => x.id !== id && x.mandataire_email === email) : null;
  if (deja) return { ok: false, error: `${email} a déjà le secteur « ${deja.nom} ».` };
  const secteur = Records.update('SecteurMandataire', id, {
    mandataire_email: email,
    historique: [...(s.historique || []), { le: new Date().toISOString(), par: user?.email || null, action: email ? `attribué à ${email}` : 'retiré à son mandataire' }],
  });
  return { ok: true, secteur };
}

export function supprimerSecteur(id, user) {
  const s = Records.get('SecteurMandataire', id);
  if (!s) return { ok: false, error: 'Secteur introuvable.' };
  console.log(`[mandataire] secteur « ${s.nom} » supprimé par ${user?.email || '?'}`);
  Records.delete('SecteurMandataire', id);
  return { ok: true };
}

// ---------------------------------------------------------------------------
// Fiche mandataire — RSAC, assurance, attestation. L'admin la tient.
// ---------------------------------------------------------------------------

const JOURS_ALERTE = 30;

function alertesDe(f) {
  const alertes = [];
  for (const [champ, mot] of [['rc_pro_expire_le', 'RC pro'], ['attestation_expire_le', "attestation d'habilitation"]]) {
    // Une date absente ne crie pas : l'alerte ne sert qu'avant une expiration réelle.
    if (!f[champ]) continue;
    const d = dansJours(f[champ]);
    if (d < 0) alertes.push(`${mot} expirée depuis ${-d} jour${-d > 1 ? 's' : ''}`);
    else if (d <= JOURS_ALERTE) alertes.push(`${mot} expire dans ${d} jour${d > 1 ? 's' : ''}`);
  }
  return alertes;
}

/**
 * Mandataire, de rôle ou en plus : un admin garde tous ses droits et peut
 * aussi être mandataire (pour tester l'espace, ou parce qu'il prospecte lui-même).
 */
export const estMandataire = (u) => u?.role === 'mandataire' || (u?.role === 'admin' && u?.aussi_mandataire === true);

/** Un admin se compte (ou non) parmi les mandataires. Le rôle admin ne bouge pas. */
export function cumulerMandataire(user, actif) {
  if (user?.role !== 'admin') return { ok: false, error: 'Réservé aux administrateurs.' };
  const u = Records.list('User').find((x) => String(x.email).toLowerCase() === String(user.email).toLowerCase());
  if (!u) return { ok: false, error: 'Compte introuvable.' };
  if ((u.aussi_mandataire === true) !== !!actif) Records.update('User', u.id, { aussi_mandataire: !!actif });
  return { ok: true, aussi_mandataire: !!actif };
}

export function listerMandataires() {
  const fiches = new Map(Records.list('FicheMandataire').map((f) => [f.email, f]));
  const secteurs = new Map(Records.list('SecteurMandataire').filter((s) => s.mandataire_email).map((s) => [s.mandataire_email, s]));
  return Records.list('User')
    .filter(estMandataire)
    .map((u) => {
      const email = String(u.email).toLowerCase();
      const f = fiches.get(email) || {};
      return {
        email,
        nom: u.full_name || null,
        admin: u.role === 'admin',
        rsac: f.rsac || null,
        rc_pro_expire_le: f.rc_pro_expire_le || null,
        attestation_expire_le: f.attestation_expire_le || null,
        arrivee_le: f.arrivee_le || null,
        analyste_email: f.analyste_email || null,
        telephone: f.telephone || null,
        notes: f.notes || null,
        // Les mentions de ses avis de valeur.
        nom_avis: f.nom_avis || null, qualite_avis: f.qualite_avis || null, ville_rsac: f.ville_rsac || null,
        carte_t: f.carte_t || null, email_avis: f.email_avis || null, ville_signature: f.ville_signature || null,
        photo_url: f.photo_url || null, signature_url: f.signature_url || null,
        secteur: secteurs.get(email) ? { id: secteurs.get(email).id, nom: secteurs.get(email).nom } : null,
        alertes: alertesDe(f),
      };
    });
}

export function poserFicheMandataire(email, patch, user) {
  const propre = String(email || '').toLowerCase();
  if (!propre) return { ok: false, error: 'Adresse du mandataire manquante.' };
  const champs = {};
  // Les mentions de ses avis de valeur aussi : nom, qualité, RSAC, carte T,
  // ville de signature, photo, signature — saisies une fois par l'admin.
  for (const c of ['rsac', 'rc_pro_expire_le', 'attestation_expire_le', 'arrivee_le', 'analyste_email', 'telephone', 'notes',
    'nom_avis', 'qualite_avis', 'ville_rsac', 'carte_t', 'email_avis', 'ville_signature', 'photo_url', 'signature_url']) {
    if (c in patch) champs[c] = patch[c] === '' ? null : patch[c];
  }
  const existante = Records.list('FicheMandataire').find((f) => f.email === propre);
  const fiche = existante
    ? Records.update('FicheMandataire', existante.id, { ...champs, maj_par: user?.email || null })
    : Records.create('FicheMandataire', { email: propre, ...champs, maj_par: user?.email || null });
  return { ok: true, fiche, alertes: alertesDe(fiche) };
}

// Ce que le mandataire tient lui-même sur sa page Compte : comment il se
// présente sur ses documents. Le reste (RSAC, carte, assurances, qualité)
// engage l'agence : Klocka le saisit, il le lit.
export const CHAMPS_MANDATAIRE = ['nom_avis', 'telephone', 'email_avis', 'ville_signature'];

/** La fiche d'un mandataire telle qu'il la voit sur sa page Compte. */
export function compteMandataire(user) {
  const email = String(user?.email || '').toLowerCase();
  const f = Records.list('FicheMandataire').find((x) => x.email === email) || {};
  const secteur = Records.list('SecteurMandataire').find((s) => s.mandataire_email === email) || null;
  return {
    ok: true,
    modifiable: {
      nom_avis: f.nom_avis || null, telephone: f.telephone || null,
      email_avis: f.email_avis || null, ville_signature: f.ville_signature || null,
      photo_url: f.photo_url || null, signature_url: f.signature_url || null,
    },
    klocka: {
      qualite_avis: f.qualite_avis || 'Agent commercial',
      rsac: f.rsac || null, ville_rsac: f.ville_rsac || null, carte_t: f.carte_t || null,
      rc_pro_expire_le: f.rc_pro_expire_le || null, attestation_expire_le: f.attestation_expire_le || null,
      arrivee_le: f.arrivee_le || null,
      secteur: secteur ? secteur.nom : null,
    },
    alertes: alertesDe(f),
  };
}

/** Le mandataire modifie SES champs, et seulement eux. */
export function poserCompteMandataire(user, patch = {}) {
  const propres = {};
  for (const c of CHAMPS_MANDATAIRE) {
    if (!(c in (patch || {}))) continue;
    const v = patch[c] == null ? '' : String(patch[c]).trim().slice(0, c === 'nom_avis' ? 80 : 120);
    if (c === 'email_avis' && v && !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(v)) return { ok: false, error: 'Adresse e-mail illisible.' };
    propres[c] = v;
  }
  const r = poserFicheMandataire(user?.email, propres, user);
  return r.ok ? compteMandataire(user) : r;
}

// ---------------------------------------------------------------------------
// Demandes des clients — l'admin écrit, le mandataire lit anonymisé.
// ---------------------------------------------------------------------------

/** Pure : ce que le mandataire a le droit de voir d'une demande. Rien qui identifie. */
/** Pure : les initiales d'un client — « Alexandre Roux » → « AR ». Rien d'autre ne sort. */
export function initialesDe(nom) {
  const mots = String(nom || '')
    .replace(/^(m|mme|mr|monsieur|madame)\.?\s+/i, '')
    .split(/[\s-]+/)
    .filter((m) => /^[a-zà-ÿ]/i.test(m));
  if (!mots.length) return null;
  return mots.slice(0, 2).map((m) => m[0].toUpperCase()).join('');
}

export function demandeAnonyme(d, i = 0) {
  return {
    id: d.id,
    profil: d.profil || 'Investisseur',
    // Les initiales du client (« AR »), jamais son nom ; sans nom connu, la lettre.
    reference: initialesDe(d.client_nom) || `Client ${String.fromCharCode(65 + (i % 26))}${i >= 26 ? Math.floor(i / 26) + 1 : ''}`,
    type_commerce: d.type_commerce || null,
    zones: d.zones?.length ? d.zones : d.zone_libre ? [d.zone_libre] : [],
    budget_min: d.budget_min ?? null,
    budget_max: d.budget_max ?? null,
    rendement_min: d.rendement_min ?? null,
    bail: d.bail || null,
    apport: d.apport ?? null,
    remarque: d.remarque || null,
    information: d.information || null,
    entre_le: d.entre_le || d.ouverte_le || null,
    depuis_jours: d.ouverte_le ? Math.max(0, -dansJours(d.ouverte_le)) : null,
  };
}

/** Les demandes servies aux mandataires : actives, et que l'admin a choisi de montrer. */
export function demandesVisibles() {
  const vues = new Map();
  return Records.list('DemandeClient')
    .filter((d) => d.active !== false && d.visible !== false)
    .sort((a, b) => String(a.ouverte_le || '').localeCompare(String(b.ouverte_le || '')))
    .map((d, i) => {
      const a = demandeAnonyme(d, i);
      // Deux clients aux mêmes initiales : le second devient « AR·2 ».
      const n = (vues.get(a.reference) || 0) + 1;
      vues.set(a.reference, n);
      return n > 1 ? { ...a, reference: `${a.reference}·${n}` } : a;
    });
}

export function listerDemandesAdmin() {
  return Records.list('DemandeClient').sort((a, b) => String(b.ouverte_le || '').localeCompare(String(a.ouverte_le || '')));
}

export function poserDemande({ id = null, ...champs }, user) {
  const propres = {
    profil: champs.profil || 'Investisseur privé',
    type_commerce: champs.type_commerce || null,
    zones: Array.isArray(champs.zones) ? champs.zones.filter(Boolean) : String(champs.zones || '').split(',').map((z) => z.trim()).filter(Boolean),
    budget_min: champs.budget_min != null && champs.budget_min !== '' ? Number(champs.budget_min) : null,
    budget_max: champs.budget_max != null && champs.budget_max !== '' ? Number(champs.budget_max) : null,
    rendement_min: champs.rendement_min != null && champs.rendement_min !== '' ? Number(champs.rendement_min) : null,
    bail: champs.bail || null,
    // Le lien vers le client reste côté admin, il ne sort jamais d'ici.
    client_email: champs.client_email || null,
    visible: champs.visible !== false,
    active: champs.active !== false,
  };
  if (id) {
    const d = Records.get('DemandeClient', id);
    if (!d) return { ok: false, error: 'Demande introuvable.' };
    // Seul le basculement visible/cachée ne compte pas comme une retouche.
    const retouche = d.source === 'monday' && ['profil', 'type_commerce', 'budget_min', 'budget_max', 'rendement_min', 'bail']
      .some((c) => String(propres[c] ?? '') !== String(d[c] ?? '')) || (d.source === 'monday' && propres.zones.join('|') !== (d.zones || []).join('|'));
    const garde = d.source === 'monday' ? { client_email: d.client_email || null, client_nom: d.client_nom || null } : {};
    return { ok: true, demande: Records.update('DemandeClient', id, { ...propres, ...garde, ...(retouche ? { edit_manuel: true } : {}), maj_par: user?.email || null }) };
  }
  return { ok: true, demande: Records.create('DemandeClient', { ...propres, ouverte_le: champs.ouverte_le || new Date().toISOString(), cree_par: user?.email || null }) };
}

// --- L'import depuis Monday ----------------------------------------------
//
// Les clients du tableau Monday qui cherchent encore (« Recherche », « Def
// Strategie ») deviennent des demandes, un peu anonymisées : ni nom, ni
// fonds propres, ni revenus, et le budget en fourchette arrondie plutôt qu'au
// chiffre exact. Le lien au client (son id Monday) reste côté admin. Une
// demande retouchée à la main n'est plus réécrite par l'import.

export const STATUTS_EN_RECHERCHE = ['Recherche', 'Def Strategie'];
const CLE_SYNC = 'mandataire:demandes-monday';
const SIX_HEURES = 6 * 3600 * 1000;

const arrondi = (n, pas = 50000) => Math.max(pas, Math.round(n / pas) * pas);

/** Pure : le nom du client masqué dans un texte libre — « M. Roux veut… » → « M. R. veut… ». */
export function masquerNom(texte, nom) {
  let t = String(texte || '');
  for (const mot of String(nom || '').split(/[\s-]+/).filter((m) => m.length >= 3)) {
    t = t.replace(new RegExp(`\\b${mot.replace(/[.*+?^$()|[\]\\]/g, '\\$&')}\\b`, 'gi'), `${mot[0].toUpperCase()}.`);
  }
  return t;
}

/** Pure : une ligne Monday devient une demande anonymisée. */
export function demandeDepuisMonday(c) {
  const lieu = String(c.lieu_recherche || '').trim();
  const partout = !lieu || /^(partout|toute france|france enti[eè]re)/i.test(lieu);
  const zones = partout ? [] : lieu.split(/\s*(?:\/|,|;|\bet\b)\s*/i).map((z) => z.trim()).filter((z) => z.length > 2 && !/^\d/.test(z)).slice(0, 4);
  const budget = Number(c.budget) || null;
  const objectifs = { Equilibre: 'équilibre', 'Auto-Finance': 'autofinancement' };
  return {
    profil: `Investisseur privé${objectifs[c.objectif] ? ` · ${objectifs[c.objectif]}` : ''}`,
    type_commerce: null,
    zones,
    zone_libre: partout ? 'Toute la France' : null,
    budget_min: budget ? arrondi(budget * 0.85) : null,
    budget_max: budget ? arrondi(budget * 1.15) : null,
    rendement_min: null,
    bail: null,
    en_strategie: c.statut === 'Def Strategie',
    // Tout, sauf le nom : l'apport, les remarques de l'équipe (nom masqué),
    // et la date d'entrée du client dans Monday.
    apport: Number(c.fonds_propres) || null,
    remarque: c.remarque ? masquerNom(c.remarque, c.nom).slice(0, 1200) : null,
    information: c.information ? masquerNom(c.information, c.nom).slice(0, 400) : null,
    entre_le: c.entre_le || null,
  };
}

export async function synchroniserDemandesMonday({ user = null } = {}) {
  const { clientsActifs } = await import('./alx/clients.js');
  const clients = (await clientsActifs()).filter((c) => STATUTS_EN_RECHERCHE.includes(c.statut));
  const existantes = new Map(Records.list('DemandeClient').filter((d) => d.monday_id).map((d) => [String(d.monday_id), d]));
  let crees = 0;
  let mises_a_jour = 0;
  for (const c of clients) {
    const champs = demandeDepuisMonday(c);
    const deja = existantes.get(String(c.id));
    if (deja) {
      existantes.delete(String(c.id));
      if (deja.edit_manuel) {
        if (deja.active === false) Records.update('DemandeClient', deja.id, { active: true });
        continue;
      }
      Records.update('DemandeClient', deja.id, { ...champs, client_nom: c.nom || null, active: true });
      mises_a_jour += 1;
    } else {
      Records.create('DemandeClient', { ...champs, client_nom: c.nom || null, source: 'monday', monday_id: String(c.id), visible: true, active: true, ouverte_le: new Date().toISOString(), cree_par: user?.email || 'import Monday' });
      crees += 1;
    }
  }
  // Un client qui a trouvé (ou qui est sorti du tableau) : sa demande se ferme.
  let fermees = 0;
  for (const d of existantes.values()) {
    if (d.active !== false) { Records.update('DemandeClient', d.id, { active: false }); fermees += 1; }
  }
  const bilan = { le: new Date().toISOString(), crees, mises_a_jour, fermees, en_recherche: clients.length };
  Meta.set(CLE_SYNC, JSON.stringify(bilan));
  return { ok: true, ...bilan };
}

export function derniereSynchro() {
  try { return JSON.parse(Meta.get(CLE_SYNC) || 'null'); } catch { return null; }
}

/** L'import se refait de lui-même au plus toutes les six heures, à la lecture. */
export async function synchroniserSiVieux() {
  const d = derniereSynchro();
  if (d?.le && Date.now() - Date.parse(d.le) < SIX_HEURES) return d;
  try {
    const { mondayConfigure, TABLEAUX } = await import('./monday.js');
    if (!mondayConfigure() || !TABLEAUX.investisseurs) return d;
    return await synchroniserDemandesMonday();
  } catch (e) {
    console.warn(`[mandataire] import des demandes Monday impossible : ${e?.message || e}`);
    return d;
  }
}

export function supprimerDemande(id) {
  if (!Records.get('DemandeClient', id)) return { ok: false, error: 'Demande introuvable.' };
  Records.delete('DemandeClient', id);
  return { ok: true };
}

/** Pure : une cible (commerce) répond-elle à une demande ? Activité et zone. */
export function correspond(cible, demande) {
  const activite = norm(`${cible.activite || ''} ${cible.categorie_activite || ''} ${cible.enseigne || ''}`);
  const type = norm(demande.type_commerce);
  const activiteOk = !type || type.split(/\s+/).some((m) => m.length > 2 && activite.includes(m));
  const ville = norm(cible.ville);
  const zonesOk = !demande.zones?.length || demande.zones.some((z) => ville.includes(norm(z)) || norm(z).includes(ville));
  return activiteOk && zonesOk;
}

// ---------------------------------------------------------------------------
// Propriétaires — la fiche que le mandataire travaille.
// ---------------------------------------------------------------------------

export const STATUTS_PROPRIETAIRE = ['a_appeler', 'contacte', 'en_discussion', 'rdv_pris', 'mandat_signe', 'pas_vendeur', 'a_recontacter'];
export const LIBELLES_STATUT = {
  a_appeler: 'À appeler', contacte: 'Contacté', en_discussion: 'En discussion', rdv_pris: 'RDV pris',
  mandat_signe: 'Mandat signé', pas_vendeur: 'Pas vendeur', a_recontacter: 'À recontacter',
};

export const mesProprietaires = (user) =>
  Records.list('ProprietaireMandataire').filter((p) => p.mandataire_email === String(user?.email || '').toLowerCase());

/** Une cellule du tableau corrigée à la main : le nom, le téléphone, le mail, le commerce, la remarque. */
export function modifierProprietaire(id, patch, user) {
  const p = proprietaireSien(id, user);
  if (!p) return { ok: false, error: 'Fiche introuvable.' };
  const champs = {};
  for (const c of ['nom', 'telephone', 'email', 'commerce', 'remarque']) {
    if (c in (patch || {})) champs[c] = patch[c] ? String(patch[c]).trim().slice(0, 200) : null;
  }
  if (!Object.keys(champs).length) return { ok: false, error: 'Rien à modifier.' };
  return { ok: true, proprietaire: Records.update('ProprietaireMandataire', p.id, champs) };
}

export function proprietaireSien(id, user) {
  const p = Records.get('ProprietaireMandataire', id);
  return p && p.mandataire_email === String(user?.email || '').toLowerCase() ? p : null;
}

export function creerProprietaire({ nom = null, telephone = null, email = null, commerce = null, activite = null, ville = null, adresse = null, cible_id = null, prospection_id = null, statut = 'a_appeler' }, user) {
  if (!nom && !commerce) return { ok: false, error: 'Il faut au moins un nom ou un commerce.' };
  // Un commerce déjà suivi ne se démarche pas deux fois — par personne.
  if (cible_id) {
    const deja = Records.list('ProprietaireMandataire').find((p) => p.cible_id === cible_id && !['pas_vendeur'].includes(p.statut));
    if (deja) {
      const parMoi = deja.mandataire_email === String(user?.email || '').toLowerCase();
      return { ok: false, error: parMoi ? 'Ce commerce est déjà dans votre liste.' : 'Ce commerce est déjà suivi par un autre mandataire.' };
    }
    const cible = Records.get('Cible', cible_id);
    if (cible?.deal_id) return { ok: false, error: 'Ce commerce est déjà en discussion avec Klocka.' };
  }
  const p = Records.create('ProprietaireMandataire', {
    mandataire_email: String(user?.email || '').toLowerCase(),
    nom, telephone, email, commerce, activite, ville, adresse, cible_id, prospection_id,
    statut: STATUTS_PROPRIETAIRE.includes(statut) ? statut : 'a_appeler',
    tentatives: 0,
    cree_le: new Date().toISOString(),
    prochaine_action: statut === 'a_appeler' ? 'Premier appel' : null,
    prochaine_action_le: statut === 'a_appeler' ? new Date().toISOString() : null,
    historique: [{ le: new Date().toISOString(), type: 'creation', texte: 'Fiche créée' }],
  });
  return { ok: true, proprietaire: p };
}

const nomCourt = (p) => p.commerce || p.nom || 'ce propriétaire';
export const titreProprietaire = (p) => [p.commerce || p.nom, p.ville].filter(Boolean).join(' · ');

function noterHistorique(p, entree) {
  return Records.update('ProprietaireMandataire', p.id, {
    historique: [...(p.historique || []), { le: new Date().toISOString(), ...entree }],
  });
}

/**
 * Retrouve la fiche dont parle une phrase (« le commerce à Mâcon »). Zéro ou
 * plusieurs candidats : on le dit, l'agent demande au lieu de deviner.
 */
export function retrouverProprietaire(qui, user) {
  // Mot à mot (« bar » n'est pas « barbier »), générique mis à part : « la
  // boulangerie rue Carnot » se joue sur boulangerie et carnot, pas sur rue.
  const GENERIQUES = new Set(['rue', 'avenue', 'boulevard', 'place', 'quai', 'chemin', 'allee', 'route', 'impasse', 'cours', 'les', 'des', 'commerce', 'local', 'murs', 'monsieur', 'madame', 'mme']);
  const mots = norm(qui).split(/[^a-z0-9]+/).filter((m) => m.length > 2 && !GENERIQUES.has(m));
  if (!mots.length) return { ambigu: false, candidats: [] };
  const motsDe = (p) => new Set(norm([p.nom, p.commerce, p.activite, p.ville, p.adresse].filter(Boolean).join(' ')).split(/[^a-z0-9]+/));
  const score = (p) => { const t = motsDe(p); return mots.filter((m) => t.has(m)).length; };
  const tous = mesProprietaires(user).map((p) => [p, score(p)]);
  const exacts = tous.filter(([, n]) => n === mots.length).map(([p]) => p);
  if (exacts.length) return { ambigu: exacts.length > 1, candidats: exacts };
  // À un mot manquant près, le doute profite à la question : tout candidat
  // partiel est présenté comme ambigu, jamais choisi en silence.
  const partiels = tous.filter(([, n]) => n >= Math.max(1, mots.length - 1)).map(([p]) => p);
  return { ambigu: partiels.length > 0, candidats: partiels };
}

// ---------------------------------------------------------------------------
// La séquence de relance — proposée par la spécification, posée ici en
// attendant l'arbitrage de Jules : appel à J+2, mail ou courrier à J+5,
// dernier appel à J+10, puis « À recontacter » avec un rappel à J+30.
// ---------------------------------------------------------------------------

export const SEQUENCE_RELANCE = [
  { apres_jours: 2, canal: 'appel', mot: '2e appel' },
  { apres_jours: 5, canal: 'mail', mot: 'mail ou courrier' },
  { apres_jours: 10, canal: 'appel', mot: 'dernier appel' },
  { apres_jours: 30, canal: 'a_recontacter', mot: 'à recontacter' },
];

const ACCROCHES = {
  appel: (p) => `Bonjour, je me permets de revenir vers vous au sujet des murs de ${nomCourt(p)} : plusieurs de nos clients cherchent ce type de bien dans votre secteur.`,
  mail: (p) => `Bonjour, suite à mes appels restés sans réponse au sujet des murs de ${nomCourt(p)} : nous avons des acquéreurs qualifiés pour ce type d'emplacement. Un échange de dix minutes suffit pour vous dire ce que valent vos murs.`,
};

/** À 9 h de Paris, dans n jours ; un samedi ou un dimanche glisse au lundi. */
function echeanceOuvree(dans_jours) {
  const jourDe = (d) => new Intl.DateTimeFormat('en-US', { timeZone: 'Europe/Paris', weekday: 'short' }).format(d);
  const d = dansNJoursParis(dans_jours, 9);
  const jour = jourDe(d);
  if (jour === 'Sat') return dansNJoursParis(dans_jours + 2, 9);
  if (jour === 'Sun') return dansNJoursParis(dans_jours + 1, 9);
  return d;
}

function poserRelance(p, etape, user) {
  const echeance = echeanceOuvree(etape.apres_jours);
  return Records.create('Rappel', {
    // L'état de la fiche avant ce geste : l'Annuler du chat le restaure.
    retour: { tentatives: p.tentatives || 0, statut: p.statut, prochaine_action: p.prochaine_action || null, prochaine_action_le: p.prochaine_action_le || null },
    espace: 'mandataire',
    genre: 'relance',
    proprietaire_id: p.id,
    canal: etape.canal,
    nom: nomCourt(p),
    quoi: `${etape.mot === '2e appel' || etape.mot === 'dernier appel' ? 'Rappeler' : 'Relancer'} ${nomCourt(p)}${p.ville ? ` (${p.ville})` : ''} — ${etape.mot}`,
    note: ACCROCHES[etape.canal] ? ACCROCHES[etape.canal](p) : null,
    telephone: p.telephone || null,
    echeance: echeance.toISOString(),
    cree_le: new Date().toISOString(),
    cree_par: user?.email || null,
    fait_le: null,
  });
}

/** Les relances ouvertes d'une fiche s'effacent : la séquence n'en garde qu'une à la fois. */
function purgerRelances(p) {
  // Les mots qui désignent cette fiche : le commerce, le nom de famille.
  const VIDES = new Set(['rue', 'place', 'avenue', 'des', 'les', 'du', 'de', 'la', 'le', 'chez', 'sarl', 'sci', 'sas', 'monsieur', 'madame']);
  const mots = norm([p.commerce, String(p.nom || '').replace(/^(m|mme|mr|monsieur|madame)\.?\s+/i, '')].filter(Boolean).join(' '))
    .split(/[^a-z0-9]+/).filter((m) => m.length > 3 && !VIDES.has(m));
  const nomme = (r) => {
    if (r.proprietaire_id || r.genre === 'rdv' || r.espace !== 'mandataire' || r.cree_par !== p.mandataire_email) return false;
    const t = new Set(norm(`${r.quoi || ''} ${r.nom || ''}`).split(/[^a-z0-9]+/));
    return mots.some((m) => t.has(m));
  };
  for (const r of Records.list('Rappel').filter((r) => !r.fait_le && (r.proprietaire_id === p.id || nomme(r)))) {
    Records.delete('Rappel', r.id);
  }
}

/**
 * « Pas de réponse » : la tentative s'enregistre, la relance suivante se pose
 * selon la séquence. Après la dernière, le propriétaire passe « À recontacter »
 * avec un rappel lointain.
 */
export function noterSansReponse(id, user) {
  const p = proprietaireSien(id, user);
  if (!p) return { ok: false, error: 'Fiche introuvable.' };
  if (['pas_vendeur', 'a_recontacter'].includes(p.statut)) {
    return { ok: false, error: `Cette fiche est « ${LIBELLES_STATUT[p.statut]} » : sa relance en place reste, rien n'est reposé. Demande s'il faut la repasser en suivi.` };
  }
  const tentatives = (p.tentatives || 0) + 1;
  const etape = SEQUENCE_RELANCE[Math.min(tentatives - 1, SEQUENCE_RELANCE.length - 1)];
  const fini = etape.canal === 'a_recontacter';
  purgerRelances(p);
  const rappel = poserRelance(p, fini ? { ...etape, mot: 'reprendre contact' } : etape, user);
  const maj = Records.update('ProprietaireMandataire', p.id, {
    tentatives,
    statut: fini ? 'a_recontacter' : p.statut === 'a_appeler' ? 'contacte' : p.statut,
    prochaine_action: rappel.quoi,
    prochaine_action_le: rappel.echeance,
    historique: [...(p.historique || []), { le: new Date().toISOString(), type: 'appel', texte: `Appel sans réponse (tentative ${tentatives})` }],
  });
  import('./mandataire-monday.js').then((m) => m.synchroniserEnFond(p.id)).catch(() => {});
  return {
    ok: true, cree: true, rappel_id: rappel.id, proprietaire: maj, tentatives,
    titre: rappel.quoi,
    pour: new Date(rappel.echeance).toLocaleDateString('fr-FR', { weekday: 'long', day: 'numeric', month: 'long' }),
    passe_a_recontacter: fini,
  };
}

/** Un résultat d'appel : le statut change, l'historique s'en souvient. */
export function noterResultat(id, { statut, texte = null, rappel_dans_jours = null }, user) {
  const p = proprietaireSien(id, user);
  if (!p) return { ok: false, error: 'Fiche introuvable.' };
  if (!STATUTS_PROPRIETAIRE.includes(statut)) return { ok: false, error: `Statut inconnu : ${statut}.` };
  purgerRelances(p);
  let rappel = null;
  if (rappel_dans_jours) {
    const echeance = echeanceOuvree(Math.max(1, Math.round(rappel_dans_jours)));
    rappel = Records.create('Rappel', {
      retour: { tentatives: p.tentatives || 0, statut: p.statut, prochaine_action: p.prochaine_action || null, prochaine_action_le: p.prochaine_action_le || null },
      espace: 'mandataire', genre: 'relance', proprietaire_id: p.id,
      nom: nomCourt(p), quoi: `Reprendre contact avec ${nomCourt(p)}${p.ville ? ` (${p.ville})` : ''}`,
      telephone: p.telephone || null, echeance: echeance.toISOString(),
      cree_le: new Date().toISOString(), cree_par: user?.email || null, fait_le: null,
    });
  }
  const maj = Records.update('ProprietaireMandataire', p.id, {
    statut,
    tentatives: 0,
    prochaine_action: rappel?.quoi || null,
    prochaine_action_le: rappel?.echeance || null,
    historique: [...(p.historique || []), { le: new Date().toISOString(), type: 'statut', texte: texte || `Statut : ${LIBELLES_STATUT[statut]}` }],
  });
  import('./mandataire-monday.js').then((m) => m.synchroniserEnFond(p.id)).catch(() => {});
  return { ok: true, proprietaire: maj, rappel_id: rappel?.id || null };
}

export function noterNote(id, texte, user) {
  const p = proprietaireSien(id, user);
  if (!p) return { ok: false, error: 'Fiche introuvable.' };
  if (!String(texte || '').trim()) return { ok: false, error: 'Note vide.' };
  return { ok: true, proprietaire: noterHistorique(p, { type: 'note', texte: String(texte).trim() }) };
}

export function supprimerProprietaire(id, user) {
  const p = proprietaireSien(id, user);
  if (!p) return { ok: false, error: 'Fiche introuvable.' };
  purgerRelances(p);
  Records.delete('ProprietaireMandataire', p.id);
  return { ok: true };
}

// ---------------------------------------------------------------------------
// Prospections — chaque recherche lancée, reprise là où on l'a laissée.
// ---------------------------------------------------------------------------

export const mesProspections = (user) =>
  Records.list('ProspectionMandataire')
    .filter((p) => p.mandataire_email === String(user?.email || '').toLowerCase())
    .sort((a, b) => String(b.cree_le || '').localeCompare(String(a.cree_le || '')));

export function nomDeProspection(criteres) {
  const e = criteres.emplacement ? `n°${criteres.emplacement === 1.5 ? '1 bis' : criteres.emplacement}` : null;
  const activite = criteres.activite ? criteres.activite.charAt(0).toUpperCase() + criteres.activite.slice(1) : 'Commerces';
  return [activite, e, criteres.ville || null].filter(Boolean).join(' ');
}

export function enregistrerProspection({ criteres, mode = 'libre', demande_id = null, trouves = 0 }, user) {
  const nom = nomDeProspection(criteres || {});
  const miennes = mesProspections(user);
  const meme = miennes.find((p) => p.nom === nom);
  if (meme) return Records.update('ProspectionMandataire', meme.id, { criteres, trouves, relancee_le: new Date().toISOString() });
  const p = Records.create('ProspectionMandataire', {
    mandataire_email: String(user?.email || '').toLowerCase(),
    nom, criteres: criteres || {}, mode, demande_id,
    trouves, cree_le: new Date().toISOString(),
  });
  // Au-delà de trente, les plus vieilles partent : c'est un carnet, pas une archive.
  for (const vieille of miennes.slice(29)) Records.delete('ProspectionMandataire', vieille.id);
  return p;
}

/** L'avancement d'une prospection, compté depuis les fiches qui en sont nées. */
export function avancementProspection(prospection, proprietaires) {
  const lies = proprietaires.filter((p) => p.prospection_id === prospection.id);
  return {
    ajoutes: lies.length,
    a_appeler: lies.filter((p) => p.statut === 'a_appeler').length,
    contactes: lies.filter((p) => ['contacte', 'en_discussion'].includes(p.statut)).length,
    rdv: lies.filter((p) => p.statut === 'rdv_pris').length,
  };
}

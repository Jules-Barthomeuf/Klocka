// La lecture générique (partie 2, 13 oct. 2026) : AK lit n'importe quelle fiche
// entière (lire_entite) et cherche dans n'importe quel type (chercher_entites),
// en lecture seule, au lieu de ne voir que ce que chaque outil métier a prévu de
// lui montrer. Le modèle de données qu'il lit avec : docs/ak/modele-donnees.md.
// Rien n'est écrit ici. Les types sont une liste fermée : ni comptes, ni
// sessions, ni boîtes mail.

import { Records } from '../db.js';

/** Les types lisibles : le nom donné à AK, l'entité, la clé qui l'identifie, les champs d'une ligne de résultat. */
export const TYPES = {
  dossier: { entite: 'Deal', cle: 'deal_id', resume: ['deal_id', 'nom', 'statut', 'responsables', 'projet_id', 'cree_le'], extra: (r) => ({ lots: (r.lots || []).map((l) => ({ adresse: l.lot?.adresse || null, prix_fai: l.lot?.prix_fai ?? null, loyer_annuel_ht_hc: l.lot?.loyer_annuel_ht_hc ?? null, surface_m2: l.lot?.surface_m2 ?? null, locataire: l.lot?.locataire_nom || null, verdict: l.evaluation?.verdict || null })) }) },
  projet: { entite: 'Project', resume: ['titre', 'statut', 'adresse_complete', 'surface_m2', 'sim_prix_bien_negocie', 'prix_acquisition', 'sim_loyer_initial_ht', 'loyer_annuel_ht', 'nom_locataire', 'deal_id'] },
  presentation: { entite: 'PresentationBancaire', resume: ['titre', 'projet_id', 'adresse', 'maj_le', 'pdf_url'] },
  loi: { entite: 'LettreIntention', resume: ['projet_id', 'deal_id', 'modele', 'cree_par', 'maj_le'] },
  agent: { entite: 'AgentImmo', resume: ['prenom', 'nom', 'agence', 'ville', 'telephones', 'emails', 'statut', 'score'] },
  agence: { entite: 'AgenceProspect', resume: ['nom', 'adresse', 'code_postal', 'telephone', 'site', 'liste_id', 'note_google'] },
  liste_agences: { entite: 'ListeAgences', resume: ['ville', 'etat', 'lancee_le', 'fini_le'] },
  prospection: { entite: 'Prospection', resume: ['libelle', 'adresse', 'activite', 'rayon_m', 'etat', 'nb_commerces', 'nb_retenus', 'cree_le'] },
  commerce: { entite: 'CommerceSimple', resume: ['nom', 'enseigne', 'activite', 'adresse', 'ville', 'siren', 'exploitant', 'proprietaire'] },
  relance: { entite: 'Rappel', resume: ['quoi', 'nom', 'echeance', 'telephone', 'cree_par', 'note'] },
  dossier_mandataire: { entite: 'DossierMandataire', resume: ['bien', 'adresse', 'prix', 'surface_m2', 'loyer_annuel', 'statut', 'mandataire_email', 'analyste_email'] },
  proprietaire_mandataire: { entite: 'ProprietaireMandataire', resume: ['nom', 'commerce', 'adresse', 'ville', 'statut', 'telephone', 'prochaine_action', 'mandataire_email'] },
};

// Les droits (13 oct. 2026), dans le code et non dans la consigne : dans l'espace de l'équipe, un admin lit
// tout ; dans l'espace mandataire (et pour un mandataire où qu'il soit), seuls ses propres dossiers et
// propriétaires ; sans compte reconnu, rien. Une fiche d'un autre se dit « introuvable », comme une fiche qui
// n'existe pas. La règle du mandataire est celle de mandataire-espace.js (estMandataire).
const TYPES_MANDATAIRE = new Set(['dossier_mandataire', 'proprietaire_mandataire']);
const email = (u) => String(u?.email || '').trim().toLowerCase();
const estAdmin = (u) => u?.role === 'admin';
const estMandataire = (u) => u?.role === 'mandataire' || (u?.role === 'admin' && u?.aussi_mandataire === true);

/** Pure : ce que `user` peut lire dans `espace` : { tout } ou { types, filtre(fiche) }, ou null. */
export function droitsDe(user, espace = 'admin') {
  if (espace === 'admin' && estAdmin(user)) return { tout: true };
  if ((espace === 'mandataire' || !estAdmin(user)) && estMandataire(user) && email(user)) {
    const moi = email(user);
    return { types: TYPES_MANDATAIRE, filtre: (r) => String(r?.mandataire_email || '').trim().toLowerCase() === moi };
  }
  return null;
}
const permis = (droits, type) => !!droits && (droits.tout || droits.types.has(type));
const visible = (droits, r) => !!droits && (droits.tout || droits.filtre(r));

// Ce qui ne sort jamais d'une fiche : secrets, et le lourd qui n'apprend rien (images en base64).
const SECRET = /mot_de_passe|password|token|secret|cookie|b64|base64|api_?key|cle_api|jeton/i;
const norme = (t) => String(t ?? '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
export const lireChemin = (o, chemin) => String(chemin || '').split('.').reduce((x, k) => (x == null ? undefined : x[k]), o);

/** Pure : une fiche nettoyée, tenue sous `plafond` signes (les textes longs, puis les listes, raccourcis). */
export function nettoyer(r, { plafond = 40000 } = {}) {
  const passe = (texte, liste) => {
    const v = (x, prof = 0) => {
      if (typeof x === 'string') return /^data:[^;]+;base64,/.test(x) ? '[image]' : x.length > texte ? `${x.slice(0, texte)}… (${x.length} signes)` : x;
      if (Array.isArray(x)) { const t = x.slice(0, liste).map((y) => v(y, prof + 1)); if (x.length > liste) t.push(`… ${x.length - liste} de plus`); return t; }
      if (x && typeof x === 'object') return Object.fromEntries(Object.entries(x).filter(([k]) => !SECRET.test(k)).map(([k, y]) => [k, prof > 6 ? '[…]' : v(y, prof + 1)]));
      return x;
    };
    return v(r);
  };
  for (const [texte, liste] of [[4000, 60], [1200, 25], [300, 10], [120, 4]]) {
    const o = passe(texte, liste);
    if (JSON.stringify(o).length <= plafond) return o;
  }
  return passe(80, 2);
}

/** Une fiche entière par son type et son identifiant, dans les droits de `user`. */
export function lireEntite({ type, id } = {}, { records = Records, user = null, espace = 'admin' } = {}) {
  const t = TYPES[type];
  if (!t) return { ok: false, error: `Type inconnu : « ${type} ». Types : ${Object.keys(TYPES).join(', ')}.` };
  const droits = droitsDe(user, espace);
  if (!permis(droits, type)) return { ok: false, error: `Tu n'as pas accès aux fiches « ${type} » depuis cet espace.` };
  const cle = String(id || '').trim();
  if (!cle) return { ok: false, error: 'Il faut l\'identifiant (rendu par chercher_entites ou un autre outil).' };
  const r = records.get(t.entite, cle) || (t.cle ? records.findBy(t.entite, t.cle, cle) : null);
  if (!r || !visible(droits, r)) return { ok: false, error: `Aucun ${type} « ${cle} ».` };
  return { ok: true, type, fiche: nettoyer(r) };
}

/** Pure : une valeur respecte-t-elle un filtre (égal, contient, ou { min, max }) ? */
export function respecte(v, f) {
  if (f && typeof f === 'object' && !Array.isArray(f)) {
    // Une case vide n'est ni au-dessus ni en dessous : elle ne passe aucun filtre de nombre.
    if (v == null || v === '') return false;
    const n = Number(v);
    if (!Number.isFinite(n)) return false;
    return (f.min == null || n >= Number(f.min)) && (f.max == null || n <= Number(f.max));
  }
  if (typeof v === 'number' || typeof f === 'number') return Number(v) === Number(f);
  if (typeof v === 'boolean') return v === (f === true || f === 'true' || f === 'oui');
  return norme(Array.isArray(v) ? v.join(' ') : v).includes(norme(f));
}

/**
 * Chercher dans un type : texte libre (partout dans la fiche), filtres par champ, tri, pages de 20 au plus.
 * `champs` choisit ce que rend chaque ligne (pour un export) ; sinon le résumé du type.
 */
export function chercherEntites({ type, texte = '', filtres = {}, tri = null, ordre = 'desc', page = 1, limite = 20, champs = null, archives = false } = {}, { records = Records, user = null, espace = 'admin' } = {}) {
  const t = TYPES[type];
  if (!t) return { ok: false, error: `Type inconnu : « ${type} ». Types : ${Object.keys(TYPES).join(', ')}.` };
  const droits = droitsDe(user, espace);
  if (!permis(droits, type)) return { ok: false, error: `Tu n'as pas accès aux fiches « ${type} » depuis cet espace.` };
  const mots = norme(texte).split(/\s+/).filter(Boolean);
  // Les fiches archivées (un dossier abandonné l'est) ne viennent que sur demande, et leur nombre est dit.
  const tous = records.list(t.entite).filter((r) => visible(droits, r));
  let l = archives ? tous : tous.filter((r) => !r.archived);
  const ecartees = tous.length - l.length;
  if (mots.length) l = l.filter((r) => { const tout = norme(JSON.stringify(r)); return mots.every((m) => tout.includes(m)); });
  for (const [champ, f] of Object.entries(filtres || {})) l = l.filter((r) => respecte(lireChemin(r, champ), f));
  const cleTri = tri || 'updated_date';
  const sens = ordre === 'asc' ? 1 : -1;
  l.sort((a, b) => {
    const x = lireChemin(a, cleTri); const y = lireChemin(b, cleTri);
    if (x == null) return 1; if (y == null) return -1;
    return (typeof x === 'number' && typeof y === 'number' ? x - y : String(x).localeCompare(String(y))) * sens;
  });
  const n = Math.min(20, Math.max(1, Number(limite) || 20));
  const pages = Math.max(1, Math.ceil(l.length / n));
  const p = Math.min(pages, Math.max(1, Number(page) || 1));
  const voulus = Array.isArray(champs) && champs.length ? champs.slice(0, 20) : t.resume;
  const lignes = l.slice((p - 1) * n, p * n).map((r) => ({
    id: r.id,
    ...Object.fromEntries(voulus.map((c) => [c, lireChemin(r, c) ?? null])),
    ...(!champs && t.extra ? t.extra(r) : {}),
  }));
  return {
    ok: true, type, total: l.length, page: p, pages, resultats: nettoyer(lignes, { plafond: 30000 }),
    ...(p < pages ? { suite: `page ${p + 1} sur ${pages} : redemande avec page: ${p + 1}` } : {}),
    ...(ecartees ? { archives_ecartees: ecartees, note: `${ecartees} fiche(s) archivée(s) non comptée(s) : archives: true pour les inclure (un dossier abandonné est archivé).` } : {}),
  };
}

// Supprimer une carte du mode appel, en disant pourquoi, et écarter d'office celles qu'on aurait supprimées pour la même
// raison (24 nov. 2026, Jules : « un bouton supprimer qui demande pourquoi on supprime ; ça va apprendre au fur et à
// mesure pour écarter les mauvais trucs dans les autres cartes, ça va écarter les cartes qu'on aurait écartées de toute
// façon »).
//
// - Supprimer : l'agence sort de la file pour tout le monde (gardée en base, `supprimee`), avec le pourquoi.
// - Apprendre : un appel au modèle rapide lit le pourquoi et la carte, et dit si c'est un genre d'agence (« promoteur »,
//   « que de la location saisonnière ») ou un cas isolé (« il m'a raccroché au nez »). Un genre devient une règle : des
//   mots cherchés dans le nom, le site, l'adresse et les spécialités de l'agence, et/ou sa spécialité (résidentiel).
// - Garde-fous : la règle doit reconnaître l'agence supprimée ; une règle qui écarterait plus d'un quart des agences
//   n'est pas allumée ; une agence intéressée ou à rappeler n'est jamais écartée ; « Annuler » éteint la règle et rend la
//   carte. Les règles se lisent et se coupent dans Suivi › Corrections.
// Pur pour la lecture des cartes et les règles ; `supprimerAgence` et `reglesActives` lisent et écrivent la base.

import { Records } from '../db.js';

export const ENTITE_REGLE = 'RegleAgenceEcartee';
const AGENCE = 'AgenceProspect';
const PART_MAX = 0.25;
const MODELE_RAPIDE = 'claude-haiku-4-5';

export const norm = (t) => String(t || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();

/** Pure : le texte d'une carte où les mots d'une règle se cherchent. */
export function texteDeLAgence(a = {}) {
  const domaine = (u) => String(u || '').replace(/^https?:\/\//, '').replace(/^www\./, '').split('/')[0];
  return norm([
    a.nom, a.raison_sociale, domaine(a.site), String(a.email || '').split('@')[1], ...(a.apollo_mots || []), ...(a.naics_libelles || []),
    typeof a.lecture_site === 'object' ? JSON.stringify(a.lecture_site) : null, a.activite, a.secteur,
  ].filter(Boolean).join(' | '));
}

/** Pure : un mot d'une règle trouvé dans le texte, au début d'un mot (« promot » trouve « promotion », pas « compromot »). */
const trouve = (texte, mot) => {
  const m = norm(mot).trim();
  if (m.length < 3) return false;
  return new RegExp(`(^|[^a-z0-9])${m.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}`).test(texte);
};

/** Pure : cette règle reconnaît-elle cette carte ? `specialite` : celle de la carte (pertinence), si connue. */
export function regleReconnait(r, a, specialite = a?.pertinence?.specialite || null) {
  if (!r) return false;
  const mots = (r.mots || []).filter((m) => norm(m).trim().length >= 3);
  if (!mots.length && !r.specialite) return false;
  const texte = texteDeLAgence(a);
  if (mots.length && !mots.some((m) => trouve(texte, m))) return false;
  if (r.specialite && specialite !== r.specialite) return false;
  return true;
}

/** Pure : une carte qu'on ne cache jamais : quelqu'un s'y intéresse ou elle est à rappeler. */
export const protegee = (a) => !!(a?.statut?.interessee || a?.statut?.a_rappeler);

/**
 * Pure : les cartes gardées et celles écartées par les règles, avec la règle de chacune.
 * @returns {{ gardees: object[], ecartees: { id, regle_id }[] }}
 */
export function trier(agences = [], regles = []) {
  const gardees = [];
  const ecartees = [];
  for (const a of agences) {
    const r = protegee(a) ? null : regles.find((x) => regleReconnait(x, a));
    if (r) ecartees.push({ id: a.id, regle_id: r.id });
    else gardees.push(a);
  }
  return { gardees, ecartees };
}

/**
 * Pure : la règle proposée, ramenée à ce qui est sûr : des mots trouvés sur la carte supprimée (les autres tombent), une
 * spécialité qu'elle a vraiment. Null si rien ne reste, ou si le modèle a vu un cas isolé.
 */
export function regleSure(proposee, agence, specialite) {
  if (!proposee?.regle) return null;
  const texte = texteDeLAgence(agence);
  const mots = [...new Set((proposee.mots || []).map((m) => norm(m).trim()).filter((m) => m.length >= 4 && trouve(texte, m)))].slice(0, 8);
  const spec = ['residentiel', 'generaliste'].includes(proposee.specialite) && proposee.specialite === specialite ? proposee.specialite : null;
  if (!mots.length && !spec) return null;
  return { libelle: String(proposee.libelle || '').trim().slice(0, 80) || mots.join(', '), mots, specialite: spec };
}

/** Pure : la part des agences qu'une règle écarterait. */
export function portee(r, agences = []) {
  if (!agences.length) return { n: 0, part: 0 };
  const n = agences.filter((a) => !protegee(a) && regleReconnait(r, a)).length;
  return { n, part: n / agences.length };
}

const SCHEMA = {
  type: 'object',
  properties: {
    regle: { type: 'boolean', description: 'true si le pourquoi décrit un genre d’agences à ne jamais appeler ; false pour un cas isolé' },
    libelle: { type: 'string', description: 'le genre, en 2 à 5 mots, au pluriel : « Promoteurs immobiliers », « Location saisonnière seule »' },
    mots: { type: 'array', items: { type: 'string' }, description: 'racines de mots, en minuscules sans accents, d’au moins 4 lettres, présentes dans la carte, qui reconnaissent ce genre (« promot », « syndic », « saisonn »)' },
    specialite: { type: 'string', enum: ['aucune', 'residentiel', 'generaliste'], description: '« residentiel » seulement si le pourquoi est « que du résidentiel » ou équivalent' },
  },
  required: ['regle', 'libelle', 'mots', 'specialite'],
};

/** Le prompt du modèle rapide : le pourquoi, la carte, les règles déjà là. */
export function consigne({ pourquoi, agence, specialite, regles = [] }) {
  return [
    'Klocka vend des murs de commerce et des fonds de commerce à des investisseurs. L’équipe appelle des agences immobilières pour qu’elles lui envoient des biens commerciaux.',
    'Un analyste vient de supprimer une agence de sa liste d’appels et a dit pourquoi. Dis si ce pourquoi décrit un GENRE d’agences qu’il faudra écarter partout (promoteurs, assureurs, syndics, location saisonnière seule, gestion locative seule, notaires, administrateurs de biens…), ou un CAS ISOLÉ (numéro faux, agent désagréable, déjà en contact, fermée, doublon, a dit non) qui ne vaut que pour elle.',
    'Pour un genre : donne des racines de mots qui le reconnaissent et qu’on trouve dans le texte de cette carte. Préfère des mots précis : jamais « immo », « agence », « conseil », « groupe ».',
    `Le pourquoi : « ${String(pourquoi).slice(0, 500)} »`,
    `La carte : ${texteDeLAgence(agence).slice(0, 1500)}`,
    `Sa spécialité calculée : ${specialite || 'inconnue'}`,
    regles.length ? `Règles déjà apprises (n’en refais pas une identique) : ${regles.map((r) => `${r.libelle} [${(r.mots || []).join(', ')}]`).join(' ; ')}` : '',
  ].filter(Boolean).join('\n\n');
}

/** Les règles allumées. */
export const reglesActives = () => Records.list(ENTITE_REGLE).filter((r) => r.active);

/**
 * Supprimer une carte et apprendre du pourquoi.
 * `toutes` : les agences annotées (statut, pertinence) où la règle se mesure ; `specialite` : celle de la carte.
 * `lire` : l'appel au modèle (remplacé dans les tests).
 * @returns {Promise<{ ok: boolean, regle?: object|null, ecartees?: number, raison_sans_regle?: string }>}
 */
export async function supprimerAgence(agenceId, pourquoi, user, { toutes = [], specialite = null, lire = null, maintenantD = new Date() } = {}) {
  const a = Records.get(AGENCE, agenceId);
  if (!a) return { ok: false, error: 'Agence introuvable.' };
  const motif = String(pourquoi || '').trim();
  if (!motif) return { ok: false, error: 'Dis pourquoi tu la supprimes.' };
  const moi = String(user?.email || '').toLowerCase() || null;
  const le = maintenantD.toISOString();
  Records.update(AGENCE, a.id, { supprimee: { le, par: moi, pourquoi: motif.slice(0, 500) }, hors_cible: true, hors_cible_le: le, hors_cible_par: moi, hors_cible_pourquoi: motif.slice(0, 200), reservee: null });

  const existantes = Records.list(ENTITE_REGLE);
  let proposee = null;
  try {
    const appeler = lire || (async (prompt) => {
      const { invokeLLM } = await import('../llm.js');
      const { mesurer } = await import('../llm-couts.js');
      return mesurer({ operation: 'agence supprimée', sur: `agence:${a.id}` }, () => invokeLLM({ prompt, response_json_schema: SCHEMA, modele: MODELE_RAPIDE, max_tokens: 400 }));
    });
    proposee = await appeler(consigne({ pourquoi: motif, agence: a, specialite, regles: existantes.filter((r) => r.active) }));
  } catch (e) {
    return { ok: true, regle: null, raison_sans_regle: `pas de règle : ${e.message}` };
  }
  if (proposee?.specialite === 'aucune') proposee.specialite = null;
  const sure = regleSure(proposee, a, specialite);
  if (!sure) return { ok: true, regle: null, raison_sans_regle: proposee?.regle ? 'rien de sûr sur la carte' : 'cas isolé' };

  // La même règle déjà apprise (mêmes mots ou même genre) : elle grandit au lieu d'en faire une seconde.
  const meme = existantes.find((r) => norm(r.libelle) === norm(sure.libelle) || (r.mots || []).some((m) => sure.mots.includes(m)));
  const candidate = meme ? { ...meme, mots: [...new Set([...(meme.mots || []), ...sure.mots])].slice(0, 12), specialite: meme.specialite || sure.specialite } : sure;
  const autres = toutes.filter((x) => x.id !== a.id && !x.hors_cible && !x.supprimee);
  const p = portee(candidate, autres);
  const tropLarge = autres.length >= 20 && p.part > PART_MAX;
  const exemple = { agence_id: a.id, nom: a.nom || null, pourquoi: motif.slice(0, 300), par: moi, le };
  const regle = meme
    ? Records.update(ENTITE_REGLE, meme.id, { mots: candidate.mots, specialite: candidate.specialite, active: meme.active && !tropLarge, trop_large: tropLarge || undefined, exemples: [...(meme.exemples || []), exemple].slice(-20), maj_le: le })
    : Records.create(ENTITE_REGLE, { ...sure, active: !tropLarge, trop_large: tropLarge || undefined, exemples: [exemple], cree_par: moi, cree_le: le, maj_le: le }, moi);
  return { ok: true, regle: { id: regle.id, libelle: regle.libelle, mots: regle.mots, specialite: regle.specialite || null, active: regle.active, trop_large: !!regle.trop_large, nouvelle: !meme }, ecartees: regle.active ? p.n : 0 };
}

/** « Annuler » juste après : la carte revient ; une règle née de ce seul geste s'éteint, une règle plus ancienne perd seulement cet exemple. */
export function annulerSuppression(agenceId, regleId, user) {
  const a = Records.get(AGENCE, agenceId);
  if (!a?.supprimee) return { ok: false, error: 'Rien à annuler.' };
  Records.update(AGENCE, a.id, { supprimee: null, hors_cible: false, hors_cible_le: null, hors_cible_par: null, hors_cible_pourquoi: null });
  const r = regleId ? Records.get(ENTITE_REGLE, regleId) : null;
  if (r) {
    const exemples = (r.exemples || []).filter((x) => x.agence_id !== a.id);
    // Née de cette seule suppression : elle disparaît de l'écran (éteinte, gardée) ; sinon, l'exemple seul s'en va.
    Records.update(ENTITE_REGLE, r.id, exemples.length ? { exemples } : { exemples, active: false, annulee_le: new Date().toISOString(), annulee_par: String(user?.email || '').toLowerCase() || null });
  }
  return { ok: true };
}

/** Allumer ou éteindre une règle (Suivi › Corrections). */
export function basculerRegle(id, active) {
  const r = Records.get(ENTITE_REGLE, id);
  if (!r) return { ok: false, error: 'Règle introuvable.' };
  return { ok: true, regle: Records.update(ENTITE_REGLE, id, { active: !!active, trop_large: active ? undefined : r.trop_large, maj_le: new Date().toISOString() }) };
}

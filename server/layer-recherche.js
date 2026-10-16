// Le Layer, phase 3 (15 oct. 2026) : la recherche hybride.
//
// Deux pistes, sur les faits validés, après les filtres (fiche, ville, type,
// période, personne) que AK a déduits de la question :
//   1. le plein texte : FTS5 sur le résumé et la citation, accents ignorés ;
//   2. le sens : l'embedding du résumé (Mistral, `mistral-embed`, 1024
//      dimensions, vecteurs de norme 1 : le cosinus est un produit scalaire),
//      comparé en JavaScript à celui de la question.
// Les deux classements se fusionnent par rang réciproque (RRF, k = 60), et
// les 10 premiers sont rendus. Les faits « remplacés » n'y sont que pour une
// question d'historique. Chaque recherche entre au journal (layer_requetes),
// avec sa durée : c'est la matière de l'évaluation et du seuil Postgres.
//
// Modèle et dimension vérifiés le 15 oct. 2026 : documentation Mistral (Text
// Embeddings) et un appel réel (POST /v1/embeddings, { model, input } ; la
// réponse porte data[].embedding et usage.prompt_tokens). Le tarif n'est
// pas publié dans les pages lues : le coût se garde en jetons, et en dollars
// seulement si LAYER_EMBED_USD_PAR_MILLION est posé.
//
// Sans clé Mistral (ou si l'appel tombe), la recherche reste debout sur le
// plein texte seul, et le dit (`pistes`).

import { createHash } from 'node:crypto';
import db, { Records } from './db.js';
import { journaliserRequete } from './layer-schema.js';
import { enfiler, enregistrer } from './layer-taches.js';

export const MODELE_EMBED = 'mistral-embed';
export const DIMS = 1024;
export const RRF_K = 60;
export const LIMITE = 10;
const URL_EMBED = 'https://api.mistral.ai/v1/embeddings';
const PAR_LOT = 32;
const FAIT = 'CerveauFait';
const LIEN = 'CerveauLien';
const SOURCE = 'CerveauSource';

const cleMistral = () => (process.env.MISTRAL_API_KEY || '').trim();
const empreinte = (t) => createHash('sha1').update(String(t || '')).digest('hex');
const norm = (t) => String(t || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();

// --- Les embeddings ---------------------------------------------------------------------------

/** Les embeddings de plusieurs textes (Mistral). Rend { vecteurs, jetons, modele }. */
export async function embedder(textes, { fetchFn = fetch } = {}) {
  if (!cleMistral()) throw new Error('MISTRAL_API_KEY manque : pas d\'embeddings.');
  const vecteurs = []; let jetons = 0; let modele = MODELE_EMBED;
  for (let i = 0; i < textes.length; i += PAR_LOT) {
    const lot = textes.slice(i, i + PAR_LOT).map((t) => String(t || ' ').slice(0, 8000));
    const r = await fetchFn(URL_EMBED, {
      method: 'POST', headers: { Authorization: `Bearer ${cleMistral()}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ model: MODELE_EMBED, input: lot }), signal: AbortSignal.timeout(30000),
    });
    const j = await r.json().catch(() => ({}));
    if (!r.ok) throw new Error(`Mistral embeddings : ${r.status} ${j?.message || ''}`.trim());
    for (const d of [...(j.data || [])].sort((a, b) => a.index - b.index)) vecteurs.push(Float32Array.from(d.embedding));
    jetons += j.usage?.prompt_tokens || 0;
    modele = j.model || modele;
  }
  return { vecteurs, jetons, modele };
}

/** Pure : le produit scalaire (le cosinus, pour des vecteurs de norme 1). */
export function cosinus(a, b) {
  let s = 0; let na = 0; let nb = 0;
  for (let i = 0; i < a.length; i += 1) { s += a[i] * b[i]; na += a[i] * a[i]; nb += b[i] * b[i]; }
  return na && nb ? s / Math.sqrt(na * nb) : 0;
}

const versBlob = (v) => Buffer.from(v.buffer, v.byteOffset, v.byteLength);
const depuisBlob = (b) => new Float32Array(b.buffer.slice(b.byteOffset, b.byteOffset + b.byteLength));

// --- L'indexation ------------------------------------------------------------------------------

/** Le fait dans le plein texte (remplace sa ligne), et son embedding en file s'il manque ou si son résumé a changé. */
export function indexer(fait, { file = true } = {}) {
  if (!fait?.id) return;
  db.prepare('DELETE FROM layer_fts WHERE fait_id = ?').run(fait.id);
  db.prepare('INSERT INTO layer_fts (fait_id, resume, citation) VALUES (?, ?, ?)').run(fait.id, String(fait.resume || ''), String(fait.citation || ''));
  const v = db.prepare('SELECT empreinte, modele FROM layer_vecteurs WHERE fait_id = ?').get(fait.id);
  if (file && (!v || v.empreinte !== empreinte(fait.resume) || v.modele !== MODELE_EMBED) && cleMistral()) enfiler('embedder', { fait_ids: [fait.id] }, { cle: `embed:${fait.id}` });
}

/** Calcule et range les embeddings de ces faits. Rend le nombre de jetons. */
export async function embedderFaits(faitIds, { fetchFn = fetch } = {}) {
  const faits = faitIds.map((id) => Records.get(FAIT, id)).filter(Boolean);
  if (!faits.length) return 0;
  const { vecteurs, jetons, modele } = await embedder(faits.map((f) => f.resume), { fetchFn });
  const ecrire = db.prepare('INSERT INTO layer_vecteurs (fait_id, modele, dims, vecteur, empreinte, cree_le) VALUES (?, ?, ?, ?, ?, ?) ON CONFLICT(fait_id) DO UPDATE SET modele = excluded.modele, dims = excluded.dims, vecteur = excluded.vecteur, empreinte = excluded.empreinte, cree_le = excluded.cree_le');
  db.transaction(() => { faits.forEach((f, i) => ecrire.run(f.id, modele, vecteurs[i].length, versBlob(vecteurs[i]), empreinte(f.resume), new Date().toISOString())); })();
  // Le coût d'embedding, sur la source de chaque fait (section 14 de la spec).
  const parSource = new Map();
  for (const f of faits) parSource.set(f.source_id, (parSource.get(f.source_id) || 0) + 1);
  const prix = Number(process.env.LAYER_EMBED_USD_PAR_MILLION) || null;
  for (const [sid, n] of parSource) {
    const s = Records.get(SOURCE, sid);
    if (!s) continue;
    const part = Math.round((jetons * n) / faits.length);
    const c = s.cout || {};
    Records.update(SOURCE, sid, { cout: { ...c, embed_jetons: (c.embed_jetons || 0) + part, ...(prix ? { embed_usd: Math.round(((c.embed_usd || 0) + (part * prix) / 1e6) * 1e6) / 1e6 } : {}) } });
  }
  return jetons;
}
enregistrer('embedder', async ({ fait_ids }) => { await embedderFaits(fait_ids || []); });

/** Les vecteurs de ces faits (modèle courant), en Map id → Float32Array. */
export function vecteursDe(ids) {
  const m = new Map();
  const lire = db.prepare('SELECT vecteur FROM layer_vecteurs WHERE fait_id = ? AND modele = ?');
  for (const id of ids || []) { const r = lire.get(id, MODELE_EMBED); if (r) m.set(id, depuisBlob(r.vecteur)); }
  return m;
}

/** Rattrape l'index des faits existants : plein texte tout de suite, embeddings en file par lots. Rend ce qui a été fait. */
export function rattraper() {
  const faits = Records.list(FAIT);
  const dans = new Set(db.prepare('SELECT fait_id FROM layer_fts').all().map((r) => r.fait_id));
  let fts = 0;
  for (const f of faits) if (!dans.has(f.id)) { indexer(f, { file: false }); fts += 1; }
  const vect = new Map(db.prepare('SELECT fait_id, empreinte, modele FROM layer_vecteurs').all().map((r) => [r.fait_id, r]));
  const manquants = faits.filter((f) => { const v = vect.get(f.id); return !v || v.empreinte !== empreinte(f.resume) || v.modele !== MODELE_EMBED; }).map((f) => f.id);
  if (cleMistral()) for (let i = 0; i < manquants.length; i += PAR_LOT) enfiler('embedder', { fait_ids: manquants.slice(i, i + PAR_LOT) }, { cle: `embed-lot:${manquants[i]}` });
  return { fts, embeddings_en_file: cleMistral() ? manquants.length : 0 };
}

// --- La recherche ------------------------------------------------------------------------------

/** La ville d'une fiche, pour le filtre « ville ». */
function villeDe(l) {
  if (l.type_entite === 'ville') return l.entite_id;
  if (l.type_entite === 'agence') return Records.get('AgenceProspect', l.entite_id)?.ville || null;
  if (l.type_entite === 'agent') return Records.get('AgentImmo', l.entite_id)?.ville || null;
  if (l.type_entite === 'dossier') { const d = Records.findBy('Deal', 'deal_id', l.entite_id); const a = d?.lots?.[0]?.lot?.adresse; const v = a && typeof a === 'object' && 'valeur' in a ? a.valeur : a; return v?.ville || null; }
  return null;
}

/** Pure : le texte d'une question en requête FTS5 (mots de 3 lettres et plus, en préfixe, réunis par OU). */
export function requeteFts(texte) {
  const mots = [...new Set(norm(texte).split(' ').filter((m) => m.length >= 3))].slice(0, 16);
  return mots.length ? mots.map((m) => `"${m}"*`).join(' OR ') : null;
}

/** Pure : la fusion par rang réciproque de plusieurs classements (listes d'identifiants). */
export function fusionRRF(classements, k = RRF_K) {
  const score = new Map();
  for (const liste of classements) liste.forEach((id, rang) => score.set(id, (score.get(id) || 0) + 1 / (k + rang + 1)));
  return [...score.entries()].sort((a, b) => b[1] - a[1]).map(([id, s]) => ({ id, score: s }));
}

/** Les faits candidats, après les filtres. */
function candidats({ type = null, type_entite = null, entite_id = null, ville = null, personne = null, depuis = null, jusqua = null, historique = false } = {}) {
  // En historique : ce qui a été remplacé ou archivé revient aussi (phase 4).
  const statuts = historique ? ['valide', 'remplace', 'archive'] : ['valide'];
  let faits = Records.list(FAIT).filter((f) => statuts.includes(f.statut));
  if (type) faits = faits.filter((f) => f.type === type);
  if (personne) faits = faits.filter((f) => norm(f.personne).includes(norm(personne)));
  if ((type_entite && entite_id) || ville) {
    const liens = Records.list(LIEN);
    if (type_entite && entite_id) { const ids = new Set(liens.filter((l) => l.type_entite === type_entite && String(l.entite_id) === String(entite_id)).map((l) => l.fait_id)); faits = faits.filter((f) => ids.has(f.id)); }
    if (ville) { const v = norm(ville); const ids = new Set(liens.filter((l) => norm(villeDe(l)) === v).map((l) => l.fait_id)); faits = faits.filter((f) => ids.has(f.id)); }
  }
  if (depuis || jusqua) {
    const dateDe = (f) => String(Records.get(SOURCE, f.source_id)?.date || f.cree_le || '').slice(0, 10);
    faits = faits.filter((f) => (!depuis || dateDe(f) >= depuis) && (!jusqua || dateDe(f) <= jusqua));
  }
  return faits;
}

/**
 * La recherche hybride. `texte` : ce qu'on cherche (sinon `question`). Rend
 * { faits (objets CerveauFait, du plus pertinent au moins), requete_id, pistes, duree_ms }.
 */
export async function rechercher({ question = '', texte = null, limite = LIMITE, ...filtres } = {}, { par = null, origine = 'ak', fetchFn = fetch } = {}) {
  const t0 = Date.now();
  const cherche = String(texte ?? question ?? '').trim();
  const pool = candidats(filtres);
  const ids = new Set(pool.map((f) => f.id));
  const pistes = { fts: false, sens: false };
  let classements = [];
  let reseau_ms = 0;
  if (cherche && pool.length) {
    const q = requeteFts(cherche);
    if (q) {
      try {
        const lignes = db.prepare('SELECT fait_id FROM layer_fts WHERE layer_fts MATCH ? ORDER BY bm25(layer_fts) LIMIT 200').all(q).map((r) => r.fait_id).filter((id) => ids.has(id));
        classements.push(lignes); pistes.fts = true;
      } catch { /* une requête FTS mal formée ne casse pas la recherche */ }
    }
    if (cleMistral()) {
      try {
        const t1 = Date.now();
        const { vecteurs } = await embedder([cherche], { fetchFn });
        reseau_ms = Date.now() - t1;
        const vq = vecteurs[0];
        const vect = db.prepare(`SELECT fait_id, vecteur FROM layer_vecteurs WHERE modele = ?`).all(MODELE_EMBED).filter((r) => ids.has(r.fait_id));
        classements.push(vect.map((r) => ({ id: r.fait_id, s: cosinus(vq, depuisBlob(r.vecteur)) })).sort((a, b) => b.s - a.s).slice(0, 200).map((x) => x.id));
        pistes.sens = true;
      } catch { /* sans embeddings, le plein texte seul */ }
    }
  } else {
    // Sans texte : les plus récents de ce que les filtres gardent.
    classements = [pool.map((f) => ({ f, d: String(Records.get(SOURCE, f.source_id)?.date || f.cree_le || '') })).sort((a, b) => b.d.localeCompare(a.d)).map((x) => x.f.id)];
  }
  const fusion = fusionRRF(classements).slice(0, limite);
  const parId = new Map(pool.map((f) => [f.id, f]));
  const faits = fusion.map((x) => parId.get(x.id)).filter(Boolean);
  const duree_ms = Date.now() - t0;
  const duree_locale_ms = duree_ms - reseau_ms;
  const requete_id = par ? journaliserRequete({ par, origine, question: question || cherche, texte: cherche, filtres, faits: faits.map((f) => f.id), duree_ms, duree_locale_ms }) : null;
  return { faits, requete_id, pistes, duree_ms, duree_locale_ms };
}

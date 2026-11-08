// La Data room partagée avec un acquéreur (7 nov. 2026, Jules : « savoir qui a regardé quoi »). Chaque piste du tableau
// des acquéreurs reçoit son lien (/data-room/<jeton>) : l'acquéreur y lit les cases que le mandataire laisse visibles,
// ouvre les fichiers et demande une pièce qui manque. Chaque ouverture et chaque demande se notent sur le dossier
// (`consultations`, `demandes`) : le mandataire voit, case par case, qui a consulté et qui a demandé.
// Par défaut tout est visible, sauf le titre de propriété, interne (`visibilite` du dossier le change case par case).
// Les fichiers sortent par un identifiant, jamais par leur adresse : /uploads reste fermé aux personnes non connectées.

import { createHash, randomBytes } from 'crypto';
import { Records } from './db.js';

const PISTE = 'PisteAcquereur';
const DOSSIER = 'DossierMandataire';
const maintenant = () => new Date().toISOString();
const MAX_CONSULTATIONS = 2000;
const MAX_DEMANDES = 500;

/** Pure : une case est-elle visible des acquéreurs ? Le titre de propriété est interne sauf choix contraire. */
export function caseVisible(dossier, cle) {
  const choix = dossier?.visibilite?.[cle];
  if (typeof choix === 'boolean') return choix;
  return !String(cle || '').includes('titre');
}

/** Pure : l'identifiant d'un fichier, stable tant que son adresse ne change pas. */
export const idFichier = (f) => createHash('sha1').update(String(f?.url || '')).digest('hex').slice(0, 16);

/** Le dossier d'une commercialisation, ou null. */
export const dossierDuMarche = (m) => (m?.dossier_id ? Records.get(DOSSIER, m.dossier_id) : null);

/** Une case montrée ou cachée aux acquéreurs. */
export async function poserVisibilite(dossierId, cle, visible, user) {
  const P = await import('./mandataire-portes.js');
  const d = P.lireDossier(dossierId, user);
  if (!d) return { ok: false, error: 'Dossier introuvable.' };
  if (typeof visible !== 'boolean') return { ok: false, error: 'visible : vrai ou faux.' };
  if (!P.piecesDu(d).some((p) => p.cle === cle)) return { ok: false, error: 'Case inconnue.' };
  const visibilite = { ...(d.visibilite || {}), [cle]: visible };
  Records.update(DOSSIER, d.id, { visibilite });
  return { ok: true, cle, visible, visibilite };
}

/** Le lien de la Data room d'une piste : créé une fois, rendu tel quel ensuite. */
export async function lienDataroom(pisteId, user) {
  const x = Records.get(PISTE, pisteId);
  const moi = String(user?.email || '').toLowerCase();
  if (!x || (x.mandataire_email !== moi && user?.role !== 'admin')) return { ok: false, error: 'Contact introuvable.' };
  const m = Records.get('MiseEnMarche', x.marche_id);
  if (!dossierDuMarche(m)) return { ok: false, error: "Ce bien n'a pas de dossier : la Data room n'existe pas encore." };
  let jeton = x.dataroom?.jeton;
  if (!jeton) {
    jeton = randomBytes(24).toString('base64url');
    Records.update(PISTE, x.id, { dataroom: { jeton, cree_le: maintenant() }, historique: [...(x.historique || []), { le: maintenant(), par: moi, action: 'Lien de la Data room créé' }].slice(-50) });
  }
  return { ok: true, lien: `/data-room/${jeton}` };
}

/** Pure : le chemin public d'une piste, ou null. */
export const lienDe = (x) => (x?.dataroom?.jeton ? `/data-room/${x.dataroom.jeton}` : null);

/** La piste, sa commercialisation et son dossier d'un jeton encore valable ; null sinon. */
export function ouvrirJeton(jeton) {
  const j = String(jeton || '').trim();
  if (j.length < 20 || j.length > 64 || !/^[A-Za-z0-9_-]+$/.test(j)) return null;
  const x = Records.list(PISTE).find((p) => p.dataroom?.jeton === j);
  if (!x || x.statut === 'ecarte') return null;
  const m = Records.get('MiseEnMarche', x.marche_id);
  const d = dossierDuMarche(m);
  if (!m || !d || m.retire_le || d.retire_le) return null;
  return { piste: x, marche: m, dossier: d };
}

/** Pure : le titre que l'acquéreur lit, sans adresse (celui du teaser, sinon le bien sans ce qui suit « · »). */
export function titreAnonyme(m) {
  const t = String(m?.teaser?.titre || '').trim();
  if (t && !t.includes('[à compléter]')) return t;
  return String(m?.bien || 'Bien').split(' · ')[0].replace(/\b\d+\s*(bis|ter)?\s*,?\s*(rue|avenue|av\.|boulevard|bd|place|chemin|allée|impasse|quai|cours|route)\b.*$/i, '').trim() || 'Bien';
}

/** Ce que l'acquéreur voit : les cases visibles et leurs fichiers, par identifiant. */
export async function vuePublique(jeton) {
  const o = ouvrirJeton(jeton);
  if (!o) return { ok: false, error: "Ce lien n'est plus valable : demandez-en un nouveau à votre conseiller." };
  const P = await import('./mandataire-portes.js');
  const { annoterFichiers } = await import('./annotations-documents.js');
  const demandees = new Set((o.dossier.demandes || []).filter((x) => x.piste_id === o.piste.id).map((x) => x.cle));
  const cases = P.checklist(o.dossier).lignes.filter((l) => caseVisible(o.dossier, l.cle)).map((l) => ({
    cle: l.cle, mot: l.mot,
    fichiers: annoterFichiers(l.fichiers || []).map((f) => ({ id: idFichier(f), nom: f.nom || 'Document' })),
    demandee: demandees.has(l.cle),
  }));
  if (!o.piste.dataroom.ouvert_le) Records.update(PISTE, o.piste.id, { dataroom: { ...o.piste.dataroom, ouvert_le: maintenant() } });
  return { ok: true, bien: { titre: titreAnonyme(o.marche) }, cases };
}

/** Un fichier d'une case visible, retrouvé par son identifiant ; la consultation se note. */
export function fichierPublic(jeton, fid) {
  const o = ouvrirJeton(jeton);
  if (!o) return { ok: false, error: 'Lien expiré.' };
  const docs = o.dossier.documents || {};
  for (const [cle, fichiers] of Object.entries(docs)) {
    if (!caseVisible(o.dossier, cle)) continue;
    const f = (fichiers || []).find((y) => idFichier(y) === String(fid || ''));
    if (!f) continue;
    const le = maintenant();
    const consultations = [...(o.dossier.consultations || []), { piste_id: o.piste.id, cle, fichier: f.nom || null, le }].slice(-MAX_CONSULTATIONS);
    Records.update(DOSSIER, o.dossier.id, { consultations });
    // Une ligne dans l'historique de la piste, une fois par heure et par case.
    const h = o.piste.historique || [];
    const action = `Data room : a consulté ${cle}`;
    if (!h.some((e) => e.action === action && Date.now() - Date.parse(e.le) < 3600000)) Records.update(PISTE, o.piste.id, { historique: [...h, { le, par: 'acquereur', action }].slice(-50) });
    return { ok: true, fichier: f };
  }
  return { ok: false, error: 'Document introuvable.' };
}

/** L'acquéreur demande une pièce : notée une fois par case, le mandataire est prévenu. */
export async function demanderPiece(jeton, cle) {
  const o = ouvrirJeton(jeton);
  if (!o) return { ok: false, error: "Ce lien n'est plus valable." };
  const c = String(cle || '').slice(0, 80);
  const P = await import('./mandataire-portes.js');
  const piece = P.piecesDu(o.dossier).find((p) => p.cle === c);
  if (!piece || !caseVisible(o.dossier, c)) return { ok: false, error: 'Pièce inconnue.' };
  const deja = (o.dossier.demandes || []).some((x) => x.piste_id === o.piste.id && x.cle === c);
  if (deja) return { ok: true, deja: true };
  const le = maintenant();
  Records.update(DOSSIER, o.dossier.id, { demandes: [...(o.dossier.demandes || []), { piste_id: o.piste.id, cle: c, le }].slice(-MAX_DEMANDES) });
  Records.update(PISTE, o.piste.id, { historique: [...(o.piste.historique || []), { le, par: 'acquereur', action: `Data room : a demandé ${piece.mot}` }].slice(-50) });
  try {
    const { notifier } = await import('./notifications.js');
    notifier({ pour: o.piste.mandataire_email, titre: `${o.piste.nom} demande une pièce · ${o.dossier.bien}`, texte: piece.mot, lien: `/MandataireBiens?bien=${encodeURIComponent(`dossier:${o.dossier.id}`)}&etape=dataroom`, action: 'Voir le dossier', cle: `demande-dataroom:${o.piste.id}:${c}` });
  } catch { /* la demande est notée, l'alerte attendra */ }
  return { ok: true };
}

/** Pure : les pièces de la vue du dossier, avec leur visibilité, qui les a consultées et qui les a demandées. */
export function enrichirPieces(pieces = [], dossier = {}, pistes = []) {
  const nomDe = (id) => pistes.find((x) => x.id === id)?.nom || 'Contact retiré';
  const cons = dossier.consultations || [];
  const dem = dossier.demandes || [];
  return pieces.map((p) => {
    const parPiste = new Map();
    for (const c of cons.filter((y) => y.cle === p.cle)) {
      const e = parPiste.get(c.piste_id) || { piste_id: c.piste_id, nom: nomDe(c.piste_id), fois: 0, dernier_le: null };
      e.fois += 1;
      if (!e.dernier_le || c.le > e.dernier_le) e.dernier_le = c.le;
      parPiste.set(c.piste_id, e);
    }
    return {
      ...p,
      visible: caseVisible(dossier, p.cle),
      consulte_par: [...parPiste.values()].sort((a, b) => String(b.dernier_le).localeCompare(String(a.dernier_le))),
      demande_par: dem.filter((y) => y.cle === p.cle).map((y) => ({ piste_id: y.piste_id, nom: nomDe(y.piste_id), le: y.le })),
    };
  });
}

/** Les pièces que l'acquéreur d'une piste a consultées, les plus récentes d'abord. */
export function consultationsDe(pisteId, dossier, pieces = []) {
  const mot = (cle) => pieces.find((p) => p.cle === cle)?.mot || cle;
  return (dossier?.consultations || []).filter((c) => c.piste_id === pisteId).map((c) => ({ cle: c.cle, mot: mot(c.cle), le: c.le })).sort((a, b) => String(b.le).localeCompare(String(a.le)));
}

// Un peu de retenue sur les routes publiques : 120 appels par minute et par jeton.
const appels = new Map();
export function tropDAppels(jeton, { max = 120, fenetre = 60000 } = {}) {
  const t = Date.now();
  const k = String(jeton || '').slice(0, 64);
  const liste = (appels.get(k) || []).filter((x) => t - x < fenetre);
  liste.push(t);
  appels.set(k, liste);
  if (appels.size > 5000) appels.clear();
  return liste.length > max;
}

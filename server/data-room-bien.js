// La Data room d'un bien avant son dossier (6 nov. 2026, Jules : « la Data room de l'étape 4 et celle de la vue
// d'ensemble, c'est la même : dès qu'on renomme un truc, ça le renomme dans l'autre »). Avant le mandat, ses pièces vivent
// sur la fiche du bien (`biens.pieces`, `biens.cases_perso`, `biens.cases_masquees`) ; le dossier les reprend à sa
// naissance (heritageDuDossier), puis c'est lui que les deux vues lisent. Cette Data room parle comme celle du dossier
// (mêmes adresses, même forme : `pieces`, `dossier.photos`, `dossier.pieces_masquees`), pour qu'un seul composant
// (src/components/mandataire/DossierVente.jsx, Pieces) les montre l'une et l'autre.

import { Records } from './db.js';
import { casesDuType, caseDuNom, caseDuType, motDeCase } from '../src/lib/data-room.js';
import { deposerAuBien, nouvelleCaseDuBien, retirerPiece } from './documents-du-bien.js';
import { annoterFichiers } from './annotations-documents.js';

const email = (user) => String(user?.email || '').toLowerCase();
const aLui = (p, user) => !!p && (user?.role === 'admin' || String(p.mandataire_email || '').toLowerCase() === email(user));
const fiche = (id, user) => { const p = Records.get('ProprietaireMandataire', id); return aLui(p, user) ? p : null; };

/** Le type du bien, comme typeDuBien à l'écran : l'avis de valeur d'abord, puis la fiche. */
export function typeDeLaFiche(p) {
  const e = Records.list('EstimationMandataire').filter((x) => x.proprietaire_id === p.id && !x.retire_le).sort((a, b) => String(b.updated_date || '').localeCompare(String(a.updated_date || '')))[0];
  return e?.avis?.type_bien || e?.questionnaire?.type_bien || p.type_bien || null;
}

/** Pure : la case d'une pièce de la fiche (sa case nommée, sinon sa nature ou la case du type qui la regroupe), parmi
 * les cases connues ; « autres » sinon. */
const caseDe = (x, perso, type, transaction = null) => (x.case_perso && perso.some((c) => c.cle === x.case_perso) ? x.case_perso : caseDuType(x.nature, type, transaction) || (motDeCase(x.nature) ? x.nature : 'autres'));

/**
 * Pure : la Data room d'une fiche, sous la forme de celle du dossier. Les cases du type, celles qui ont des pièces hors du
 * type (rien ne se perd quand le type change), les cases nommées, puis « Autres documents » ; les masquées en moins. Un
 * bien à louer (`biens.transaction`, 6 nov. 2026) a la liste de la location.
 */
export function dataroomDeLaFiche(p, type) {
  const pieces = (p?.biens?.pieces || []).filter((x) => x?.url && x.nature !== 'avis' && x.nature !== 'mandat');
  const perso = p?.biens?.cases_perso || [];
  const parCase = {};
  for (const x of pieces.filter((y) => y.nature !== 'photos')) (parCase[caseDe(x, perso, type, p)] ||= []).push({ id: x.id, nom: x.nom, url: x.url, le: x.le || null });
  const duType = casesDuType(type, p);
  const gardees = Object.keys(parCase).filter((cle) => !duType.some((c) => c.cle === cle) && motDeCase(cle)).map((cle) => ({ cle, mot: motDeCase(cle), requise: false }));
  const cases = [
    ...duType.filter((c) => c.cle !== 'autres'), ...gardees,
    ...perso.map((c) => ({ cle: c.cle, mot: c.mot, requise: false, perso: true })),
    ...duType.filter((c) => c.cle === 'autres'),
  ];
  const masquees = new Set(p?.biens?.cases_masquees || []);
  return {
    pieces: cases.filter((c) => !masquees.has(c.cle) || (parCase[c.cle] || []).length).map((c) => {
      const fichiers = parCase[c.cle] || [];
      return { ...c, etat: fichiers.length ? 'recue' : 'manquante', fichiers };
    }),
    dossier: { photos: pieces.filter((x) => x.nature === 'photos').map((x) => ({ nom: x.nom, url: x.url, le: x.le || null })), pieces_masquees: [...masquees] },
  };
}

/** La Data room d'un bien, vue par le mandataire (les noms et notes posés sur les pièces compris). */
export function vueDataroom(id, user) {
  const p = fiche(id, user);
  if (!p) return { ok: false, error: 'Bien introuvable.' };
  const v = dataroomDeLaFiche(p, typeDeLaFiche(p));
  return { ok: true, ...v, pieces: v.pieces.map((c) => ({ ...c, fichiers: annoterFichiers(c.fichiers) })), dossier: { ...v.dossier, photos: annoterFichiers(v.dossier.photos) } };
}

/** Une pièce dans une case : sa nature, ou sa case nommée. */
export async function deposerDansCase(id, cle, fichier, user) {
  const p = fiche(id, user);
  if (!p) return { ok: false, error: 'Bien introuvable.' };
  const perso = (p.biens?.cases_perso || []).some((c) => c.cle === cle);
  if (!perso && !motDeCase(cle) && cle !== 'photos') return { ok: false, error: 'Case inconnue.' };
  return deposerAuBien(p.id, [{ nom: fichier.filename, url: fichier.url, mimetype: fichier.mimetype }], user, perso ? { casePerso: cle } : { nature: cle });
}

/** Plusieurs pièces d'un coup : chacune se range d'après son nom parmi les cases du type ; les autres reviennent, à classer. */
export async function deposerParNom(id, fichiers, user) {
  const p = fiche(id, user);
  if (!p) return { ok: false, error: 'Bien introuvable.' };
  const type = typeDeLaFiche(p);
  const rangees = [];
  const aClasser = [];
  for (const f of fichiers) {
    const cle = caseDuNom(f.filename, type, p);
    if (!cle) { aClasser.push(f.filename); continue; }
    const r = await deposerAuBien(p.id, [{ nom: f.filename, url: f.url, mimetype: f.mimetype }], user, { nature: cle });
    if (!r.ok) return r;
    rangees.push({ nom: f.filename, categorie: cle });
  }
  return { ok: true, rangees, a_classer: aClasser };
}

/** Retire une pièce (par son adresse) de sa case ou des photos. */
export function retirerDeLaFiche(id, url, user) {
  const p = fiche(id, user);
  if (!p) return { ok: false, error: 'Bien introuvable.' };
  const x = (p.biens?.pieces || []).find((y) => y.url === url);
  if (!x) return { ok: false, error: 'Pièce introuvable.' };
  return retirerPiece(p.id, x.id, user);
}

/** Masquer une case vide, ou les réafficher toutes (`cle` null et `masquer` faux), comme dans le dossier. */
export function masquerCase(id, cle, masquer, user) {
  const p = fiche(id, user);
  if (!p) return { ok: false, error: 'Bien introuvable.' };
  const deja = new Set(p.biens?.cases_masquees || []);
  if (!cle) { if (masquer) return { ok: false, error: 'Quelle case ?' }; deja.clear(); }
  else if (masquer) {
    if (String(cle) === 'autres') return { ok: false, error: 'La case « + » reste.' };
    const v = dataroomDeLaFiche(p, typeDeLaFiche(p));
    if ((v.pieces.find((c) => c.cle === cle)?.fichiers || []).length) return { ok: false, error: 'Cette case a déjà une pièce : retirez-la d’abord.' };
    deja.add(String(cle));
  } else deja.delete(String(cle));
  Records.update('ProprietaireMandataire', p.id, { biens: { ...(p.biens || {}), cases_masquees: [...deja] } });
  return { ok: true, pieces_masquees: [...deja] };
}

/** Une case nommée : celle du type qui porte ce nom (réaffichée si masquée), sinon une nouvelle. */
export function nouvelleCase(id, mot, user) {
  const p = fiche(id, user);
  if (!p) return { ok: false, error: 'Bien introuvable.' };
  const nom = String(mot || '').replace(/\s+/g, ' ').trim();
  const duType = casesDuType(typeDeLaFiche(p), p).find((c) => c.mot.toLowerCase() === nom.toLowerCase());
  if (duType) {
    const m = (p.biens?.cases_masquees || []).filter((c) => c !== duType.cle);
    Records.update('ProprietaireMandataire', p.id, { biens: { ...(p.biens || {}), cases_masquees: m } });
    return { ok: true, cle: duType.cle, mot: duType.mot };
  }
  return nouvelleCaseDuBien(p.id, nom, user);
}

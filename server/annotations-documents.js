// Le nom et le contexte d'une pièce (4 nov. 2026, Jules : « lorsqu'on ajoute une pièce, dans le dossier on puisse la
// nommer et donner du contexte sous chaque document »). Une fiche par fichier, par son adresse (/uploads/… est unique) :
// la même pièce porte le même nom et la même note dans la vue d'ensemble du bien et dans la page Data room. Le fichier
// lui-même ne change pas.

import { Records } from './db.js';

const ENTITE = 'NoteDocument';
const email = (user) => String(user?.email || '').toLowerCase();

/** Les annotations de ces adresses : `{ [url]: { nom, note } }`. */
export function annotationsDe(urls = []) {
  const voulues = new Set(urls.filter(Boolean));
  if (!voulues.size) return {};
  const out = {};
  for (const x of Records.list(ENTITE)) if (voulues.has(x.url)) out[x.url] = { nom: x.nom || null, note: x.note || null };
  return out;
}

/** Pure : un fichier `{ nom, url }` avec son nom choisi et sa note. */
export const annote = (f, annotations = {}) => {
  const a = f?.url ? annotations[f.url] : null;
  return a ? { ...f, ...(a.nom ? { nom: a.nom, nom_origine: f.nom } : {}), ...(a.note ? { note: a.note } : {}) } : f;
};

/** Des fichiers, annotés. */
export const annoterFichiers = (fichiers = []) => {
  const a = annotationsDe(fichiers.map((f) => f?.url));
  return fichiers.map((f) => annote(f, a));
};

/** Nommer une pièce ou lui donner du contexte ; vide, le nom d'origine revient. */
export function annoter(url, { nom, note } = {}, user) {
  const u = String(url || '').trim();
  if (!/^\/uploads\//.test(u)) return { ok: false, error: 'Document introuvable.' };
  const deja = Records.list(ENTITE).find((x) => x.url === u);
  const champs = {
    ...(nom !== undefined ? { nom: String(nom || '').trim().slice(0, 160) || null } : {}),
    ...(note !== undefined ? { note: String(note || '').trim().slice(0, 1000) || null } : {}),
    par: email(user), le: new Date().toISOString(),
  };
  const r = deja ? Records.update(ENTITE, deja.id, champs) : Records.create(ENTITE, { url: u, ...champs });
  return { ok: true, nom: r.nom || null, note: r.note || null };
}

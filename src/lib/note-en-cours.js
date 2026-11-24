// Une note en attente de son OK (19 nov. 2026) : ce que la personne garde, les dates et les messages qu'elle change,
// ses réponses. Le chat (la réponse de l'assistant) et le panneau de droite (la fiche, le message WhatsApp) lisent et
// écrivent le même état, sans passer par la page.

import { useSyncExternalStore } from "react";

const notes = new Map();
const abonnes = new Set();
const prevenir = () => { for (const f of abonnes) f(); };
const abonner = (f) => { abonnes.add(f); return () => abonnes.delete(f); };

/** Tout ce qui se garde ou se retire d'une proposition. */
export const toutesLesCles = (p) => [
  ...(p?.fiches || []).flatMap((f) => [...(f.elements || []).map((e) => e.id), ...(f.etape ? [`${f.id}-etape`] : []), ...(f.blocage !== undefined ? [`${f.id}-blocage`] : [])]),
  ...(p?.faites || []).map((d) => d.id),
  ...(p?.actions || []).map((a) => a.id),
  // Les règles de travail (22 nov. 2026) : gardées d'office, elles partent au Cerveau au OK.
  ...(p?.regles || []).map((r) => r.id),
  // Les fiches liées à retirer (24 nov. 2026) : cochées d'office, puisque la note le demande.
  ...(p?.retraits || []).map((r) => r.id),
];

/** Pose la note (une fois) ; une note relue avec un lien de plus la remplace. */
export function poserNote(donnees) {
  if (!donnees?.note_id || notes.has(donnees.note_id)) return;
  notes.set(donnees.note_id, { donnees, garde: new Set(toutesLesCles(donnees.proposition)), modifs: {}, reponses: {} });
  prevenir();
}

function changer(id, fn) {
  const n = notes.get(id);
  if (!n) return;
  notes.set(id, fn(n));
  prevenir();
}

export const basculer = (id, cle) => changer(id, (n) => {
  const garde = new Set(n.garde);
  if (garde.has(cle)) garde.delete(cle); else garde.add(cle);
  return { ...n, garde };
});
export const garder = (id, cle, oui) => changer(id, (n) => {
  const garde = new Set(n.garde);
  if (oui) garde.add(cle); else garde.delete(cle);
  return { ...n, garde };
});
export const modifier = (id, actionId, champ, valeur) => changer(id, (n) => ({ ...n, modifs: { ...n.modifs, [actionId]: { ...n.modifs[actionId], [champ]: valeur } } }));
export const repondre = (id, questionId, valeur) => changer(id, (n) => ({ ...n, reponses: { ...n.reponses, [questionId]: valeur } }));

export const lireNote = (id) => notes.get(id) || null;
export function useNote(id) {
  return useSyncExternalStore(abonner, () => (id ? notes.get(id) || null : null));
}

/** Une action telle qu'elle partira : la date et le texte changés par la personne. */
export function actionVue(n, a) {
  const m = n?.modifs?.[a.id] || {};
  return { ...a, echeance: m.echeance !== undefined ? m.echeance : a.echeance, brouillon: a.brouillon ? { ...a.brouillon, texte: m.brouillon ?? a.brouillon.texte } : null };
}

/**
 * Ouvre le panneau de droite : la fiche (onglets Bien, Client, Agent) ou une action (le message WhatsApp, la relance).
 * @param {{ note_id?: string, vue: "fiche"|"action", cle?: string, action_id?: string, action?: object }} detail
 */
export const ouvrirPanneau = (detail) => window.dispatchEvent(new CustomEvent("klocka:panneau-note", { detail }));

/** Ce que la carte demande (19 nov. 2026, Jules : « dans le même message ») : un mot laissé par la réponse précédente. */
export const signaler = (id, texte) => changer(id, (n) => ({ ...n, signal: texte || null }));
/** Une note rangée ou écartée ne demande plus rien. */
export const fermerNote = (id) => changer(id, (n) => ({ ...n, fermee: true }));

/**
 * La prochaine chose à demander sur une note en attente : une question sans réponse, puis une action gardée sans date.
 * @returns {{ genre: "question", q: object } | { genre: "date", a: object, plusieurs: boolean } | null}
 */
export function prochaineEtape(n) {
  if (!n || n.fermee) return null;
  const p = n.donnees?.proposition || {};
  const q = (p.questions || []).find((x) => x?.id && x.texte && !String(n.reponses?.[x.id] || "").trim());
  if (q) return { genre: "question", q };
  const sansDate = (p.actions || []).map((a) => actionVue(n, a)).filter((a) => n.garde.has(a.id) && !a.echeance);
  return sansDate.length ? { genre: "date", a: sansDate[0], plusieurs: (p.actions || []).length > 1 } : null;
}

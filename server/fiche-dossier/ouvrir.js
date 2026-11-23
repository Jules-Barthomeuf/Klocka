// « Ouvre la fiche de Rachel Peyrabout » (23 nov. 2026, Jules : l'assistant lisait le client dans Twenty CRM et
// récitait son profil, au lieu d'ouvrir la fiche que les notes et les groupes WhatsApp ont remplie). L'outil
// `ouvrir_fiche` de l'assistant cherche la fiche Klocka par son nom, comme le champ lien de la saisie
// (fiche-dossier/chercher.js) : les fiches déjà suivies d'abord, puis les biens de la plateforme, les agents et les
// clients du CRM. Une seule qui répond : l'écran l'ouvre (le bloc `fiche_dossier`, server/ak/app.js). Plusieurs :
// l'assistant demande laquelle.

import { Records } from '../db.js';

const sansAccent = (s) => String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();

/**
 * Pure : la fiche à ouvrir parmi les candidates. Le nom exact l'emporte (une fiche déjà suivie avant une autre) ;
 * sans nom exact, une seule candidate suffit ; sinon, la liste pour demander.
 * @returns {{ ouvrir: object } | { candidats: object[] } | { aucune: true }}
 */
export function choisirFiche(nom, candidates = [], { suivies = new Set() } = {}) {
  const n = sansAccent(nom);
  if (!candidates.length) return { aucune: true };
  const exactes = candidates.filter((c) => sansAccent(c.nom) === n);
  const pool = exactes.length ? exactes : candidates;
  const tri = [...pool].sort((a, b) => Number(suivies.has(b.cle)) - Number(suivies.has(a.cle)));
  // Un nom exact : la fiche suivie si elle existe, sinon la seule. Deux homonymes suivis : on demande.
  if (exactes.length === 1 || (exactes.length > 1 && tri.filter((c) => suivies.has(c.cle)).length === 1)) return { ouvrir: tri[0] };
  if (!exactes.length && candidates.length === 1) return { ouvrir: candidates[0] };
  return { candidats: tri.slice(0, 5) };
}

/** L'outil : cherche, choisit, rend de quoi ouvrir la fiche (et une ligne pour la réponse). */
export async function ficheAOuvrir({ nom = '', genre = null } = {}, user) {
  const q = String(nom || '').trim();
  if (q.length < 2) return { ok: false, error: 'Donnez le nom de la fiche à ouvrir.' };
  const { chercher } = await import('./chercher.js');
  const r = await chercher(q, user, { limite: 5 });
  const listes = { client: r.clients || [], agent: r.agents || [], bien: r.biens || [] };
  const candidates = genre && listes[genre] ? listes[genre] : [...listes.client, ...listes.agent, ...listes.bien];
  const suivies = new Set(Records.list('FicheDossier').map((f) => f.cle));
  const choix = choisirFiche(q, candidates, { suivies });
  if (choix.aucune) return { ok: true, aucune: true, rien: `Aucune fiche ne répond à « ${q} ». Dis-le, sans chercher dans un autre outil.` };
  if (choix.candidats) return { ok: true, candidats: choix.candidats.map((c) => ({ nom: c.nom, genre: c.genre, detail: c.detail || null })), consigne: 'Plusieurs fiches répondent : nomme-les et demande laquelle ouvrir.' };
  const c = choix.ouvrir;
  const f = Records.findBy('FicheDossier', 'cle', c.cle);
  return {
    ok: true,
    ouvrir: { cle: c.cle, nom: c.nom, genre: c.genre },
    etape: f?.etape || null,
    consigne: `La fiche de ${c.nom} s'ouvre à l'écran. Réponds en une phrase, sans recopier son contenu.`,
  };
}

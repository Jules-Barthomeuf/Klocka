// La prospection et le CRM. La plateforme fait foi.
//
//   Lecture, une fois : les agents des deux anciens tableaux (« Prospection
//     Agent Immo » et « Agent immobilier ») entrent dans le carnet.
//   Les tableaux « Agents (plateforme) » et « Dossiers (pipeline) » qu'elle tenait sont retirés (28 oct. 2026) : leur
//   création échouait à mi-chemin et recommençait à chaque tour (~9 200 tableaux vides dans Monday).

import { TABLEAUX, colonnesDuTableau, lireTableau, utilisateursMonday, mondayConfigure } from '../monday.js';
import * as R from './regles.js';

export { mondayConfigure };
export const TABLEAU_PROSPECTION = (process.env.MONDAY_BOARD_PROSPECTION || '5104678050').trim();

/** Pure : l'identifiant de la colonne dont le titre correspond, parmi des titres possibles. */
export function colonneParTitre(liste, titres, type = null) {
  const voulus = titres.map(R.norm);
  for (const t of voulus) {
    const c = liste.find((x) => R.norm(x.title) === t && (!type || x.type === type));
    if (c) return c.id;
  }
  for (const t of voulus) {
    const c = liste.find((x) => R.norm(x.title).startsWith(t) && (!type || x.type === type));
    if (c) return c.id;
  }
  return null;
}

async function equipe() {
  const u = await utilisateursMonday();
  return { parNom: new Map(u.map((x) => [R.norm(x.name), x])), parEmail: new Map(u.map((x) => [String(x.email).toLowerCase(), x])) };
}

// ---------------------------------------------------------------------------
// Lecture des anciens tableaux, pour l'import
// ---------------------------------------------------------------------------

export async function lireProspects() {
  const [l, items, qui] = await Promise.all([colonnesDuTableau(TABLEAU_PROSPECTION), lireTableau(TABLEAU_PROSPECTION, 5000), equipe()]);
  const c = {
    collaborateurs: colonneParTitre(l, ['Collaborateurs', 'Responsable'], 'people'),
    email: colonneParTitre(l, ['Email', 'E-mail']), telephone: colonneParTitre(l, ['Téléphone']),
    agence: colonneParTitre(l, ['Agence']), ville: colonneParTitre(l, ['Ville']), remarques: colonneParTitre(l, ['Remarques']),
    statut: colonneParTitre(l, ['Priorité Status', 'Priorité', 'Statut'], 'status'), date: colonneParTitre(l, ['Date'], 'date'),
    prochaine_relance: colonneParTitre(l, ['Prochaine relance'], 'date'),
  };
  const lire = (it, k) => (c[k] ? String(it.colonnes[c[k]] || '').trim() : '');
  return items.map((it) => ({
    id: String(it.id), nom: it.nom,
    collaborateurs: lire(it, 'collaborateurs').split(',').map((n) => qui.parNom.get(R.norm(n))?.email?.toLowerCase()).filter(Boolean),
    email: lire(it, 'email') || null, telephone: lire(it, 'telephone') || null, agence: lire(it, 'agence') || null, ville: lire(it, 'ville') || null,
    remarques: lire(it, 'remarques') || '', statut: lire(it, 'statut') || '', date: lire(it, 'date') || '', prochaine_relance: lire(it, 'prochaine_relance') || '',
  })).filter((p) => p.email || p.telephone);
}

export async function lireAgentsImmo() {
  if (!TABLEAUX.agents) return [];
  const [l, items, qui] = await Promise.all([colonnesDuTableau(TABLEAUX.agents), lireTableau(TABLEAUX.agents, 5000), equipe()]);
  const c = {
    spoc: colonneParTitre(l, ['SPOC', 'Collaborateurs'], 'people'), date: colonneParTitre(l, ['Date'], 'date'),
    email: colonneParTitre(l, ['E-mail', 'Email']), telephone: colonneParTitre(l, ['Téléphone']), ville: colonneParTitre(l, ['Ville']),
    entreprise: colonneParTitre(l, ['Entreprise', 'Agence']), remarques: colonneParTitre(l, ['Remarques']),
    priorite: colonneParTitre(l, ['Priorité'], 'status'), relance: colonneParTitre(l, ['Prochaine relance'], 'date'),
  };
  const lire = (it, k) => (c[k] ? String(it.colonnes[c[k]] || '').trim() : '');
  return items.map((it) => ({
    id: String(it.id), nom: it.nom, email: lire(it, 'email') || null, telephone: lire(it, 'telephone') || null,
    agence: lire(it, 'entreprise') || null, ville: lire(it, 'ville') || null, remarques: lire(it, 'remarques') || '',
    priorite: lire(it, 'priorite'), date: lire(it, 'date') || null, relance: lire(it, 'relance') || null,
    referent: lire(it, 'spoc').split(',').map((n) => qui.parNom.get(R.norm(n))?.email?.toLowerCase()).filter(Boolean)[0] || null,
  })).filter((a) => a.email || a.telephone);
}

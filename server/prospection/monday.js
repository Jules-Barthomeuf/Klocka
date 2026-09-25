// Les deux tableaux Monday de la prospection, lus et écrits par le nom de
// leurs colonnes : l'équipe peut les réordonner, Klocka les retrouve.
//
//   « Prospection Agent Immo » (MONDAY_BOARD_PROSPECTION) : les agents à
//     démarcher. Klocka y ajoute les nouveaux, y lit les statuts posés après
//     un appel, y écrit la prochaine relance.
//   « Agent immobilier » (MONDAY_BOARD_AGENTS) : les agents qui nous
//     envoient des fiches. Klocka le lit pour ne pas redémarcher un agent
//     qu'on connaît, et y fait entrer celui qui nous envoie sa première fiche.

import { TABLEAUX, colonnesDuTableau, lireTableau, creerElement, majElement, commenter, utilisateursMonday, mondayConfigure } from '../monday.js';
import { STATUTS, norm, normEmail, telAffiche, normTel } from './regles.js';

export const TABLEAU_PROSPECTION = (process.env.MONDAY_BOARD_PROSPECTION || '5104678050').trim();
export const TABLEAU_AGENTS = () => TABLEAUX.agents;
export { mondayConfigure };

// Les colonnes de chaque tableau, par titre, lues une fois par quart d'heure.
const colonnesCache = new Map();
async function colonnes(boardId) {
  const c = colonnesCache.get(boardId);
  if (c && Date.now() - c.le < 15 * 60000) return c.liste;
  const liste = await colonnesDuTableau(boardId);
  colonnesCache.set(boardId, { le: Date.now(), liste });
  return liste;
}

/** Pure : l'identifiant de la colonne dont le titre correspond, parmi des titres possibles. */
export function colonneParTitre(liste, titres, type = null) {
  const voulus = titres.map(norm);
  for (const t of voulus) {
    const c = liste.find((x) => norm(x.title) === t && (!type || x.type === type));
    if (c) return c.id;
  }
  for (const t of voulus) {
    const c = liste.find((x) => norm(x.title).startsWith(t) && (!type || x.type === type));
    if (c) return c.id;
  }
  return null;
}

async function carteProspection() {
  const l = await colonnes(TABLEAU_PROSPECTION);
  return {
    collaborateurs: colonneParTitre(l, ['Collaborateurs', 'Responsable', 'SPOC'], 'people'),
    email: colonneParTitre(l, ['Email', 'E-mail', 'Mail']),
    telephone: colonneParTitre(l, ['Téléphone', 'Telephone', 'Tel']),
    agence: colonneParTitre(l, ['Agence', 'Entreprise']),
    ville: colonneParTitre(l, ['Ville']),
    adresse: colonneParTitre(l, ['Adresse du bien', 'Adresse']),
    remarques: colonneParTitre(l, ['Remarques', 'Notes']),
    statut: colonneParTitre(l, ['Priorité Status', 'Priorité', 'Statut', 'Status'], 'status'),
    date: colonneParTitre(l, ['Date', 'Premier contact'], 'date'),
    prochaine_relance: colonneParTitre(l, ['Prochaine relance', 'Relance'], 'date'),
  };
}

async function carteAgents() {
  const l = await colonnes(TABLEAU_AGENTS());
  return {
    spoc: colonneParTitre(l, ['SPOC', 'Collaborateurs', 'Responsable'], 'people'),
    prenom: colonneParTitre(l, ['Prénom', 'Prenom']),
    date: colonneParTitre(l, ['Date'], 'date'),
    email: colonneParTitre(l, ['E-mail', 'Email', 'Mail']),
    telephone: colonneParTitre(l, ['Téléphone', 'Telephone']),
    ville: colonneParTitre(l, ['Ville']),
    entreprise: colonneParTitre(l, ['Entreprise', 'Agence']),
    remarques: colonneParTitre(l, ['Remarques', 'Notes']),
    priorite: colonneParTitre(l, ['Priorité', 'Statut'], 'status'),
    relance: colonneParTitre(l, ['Prochaine relance'], 'date'),
    types: Object.fromEntries(l.map((c) => [c.id, c.type])),
  };
}

// Les collègues, nom Monday → adresse, pour savoir à qui est un agent.
async function equipe() {
  const u = await utilisateursMonday();
  return { parNom: new Map(u.map((x) => [norm(x.name), x])), parEmail: new Map(u.map((x) => [String(x.email).toLowerCase(), x])) };
}

/** Les prospects du tableau, en objets lisibles. Les lignes vides (« Item 2 ») sont laissées de côté. */
export async function lireProspects() {
  const [carte, items, qui] = await Promise.all([carteProspection(), lireTableau(TABLEAU_PROSPECTION, 5000), equipe()]);
  const lire = (it, k) => (carte[k] ? String(it.colonnes[carte[k]] || '').trim() : '');
  return items.map((it) => ({
    id: String(it.id),
    nom: it.nom,
    collaborateurs: lire(it, 'collaborateurs').split(',').map((n) => qui.parNom.get(norm(n))?.email?.toLowerCase()).filter(Boolean),
    collaborateurs_noms: lire(it, 'collaborateurs'),
    email: lire(it, 'email') || null,
    telephone: lire(it, 'telephone') || null,
    agence: lire(it, 'agence') || null,
    ville: lire(it, 'ville') || null,
    adresse: lire(it, 'adresse') || null,
    remarques: lire(it, 'remarques') || '',
    statut: lire(it, 'statut') || '',
    date: lire(it, 'date') || '',
    prochaine_relance: lire(it, 'prochaine_relance') || '',
  })).filter((p) => p.email || p.telephone || p.agence || !/^item \d+$/i.test(p.nom || ''));
}

/** Les agents du tableau « Agent immobilier », pour le dédoublonnage et le passage. */
export async function lireAgentsImmo() {
  if (!TABLEAU_AGENTS()) return [];
  const [carte, items] = await Promise.all([carteAgents(), lireTableau(TABLEAU_AGENTS(), 5000)]);
  const lire = (it, k) => (carte[k] ? String(it.colonnes[carte[k]] || '').trim() : '');
  return items.map((it) => ({ id: String(it.id), nom: it.nom, email: lire(it, 'email') || null, telephone: lire(it, 'telephone') || null, agence: lire(it, 'entreprise') || null, ville: lire(it, 'ville') || null, tableau: 'agents' }));
}

async function personnes(emails = []) {
  const qui = await equipe();
  return emails.map((e) => qui.parEmail.get(String(e).toLowerCase())).filter(Boolean).map((u) => ({ id: Number(u.id), kind: 'person' }));
}

/** Pure : les valeurs Monday d'un prospect, colonne par colonne. */
export function valeursProspect(carte, champs) {
  const v = {};
  const texte = (k, x) => { if (carte[k] && x != null) v[carte[k]] = String(x).slice(0, 2000); };
  texte('email', champs.email);
  texte('telephone', champs.telephone);
  texte('agence', champs.agence);
  texte('ville', champs.ville);
  texte('adresse', champs.adresse);
  texte('remarques', champs.remarques);
  if (carte.statut && champs.statut) v[carte.statut] = { label: STATUTS[champs.statut] || champs.statut };
  if (carte.date && champs.date !== undefined) v[carte.date] = champs.date ? { date: champs.date } : null;
  if (carte.prochaine_relance && champs.prochaine_relance !== undefined) v[carte.prochaine_relance] = champs.prochaine_relance ? { date: champs.prochaine_relance } : null;
  return v;
}

/** Ajoute un agent au tableau de prospection. Rend l'identifiant Monday. */
export async function creerProspect(c, { prochaine_relance = null } = {}) {
  const carte = await carteProspection();
  const valeurs = valeursProspect(carte, {
    email: c.email || null, telephone: c.telephone || null, agence: c.agence || null, ville: c.ville || null,
    adresse: c.adresse || null, remarques: c.remarque || null, statut: 'nouveau', prochaine_relance,
  });
  const it = await creerElement(TABLEAU_PROSPECTION, String(c.nom || c.agence || c.email || 'Agent').slice(0, 250), valeurs, { labels: true });
  return it?.id ? String(it.id) : null;
}

/** Écrit sur un prospect ce que l'appel a changé. `collaborateurs` : des adresses. */
export async function ecrireProspect(itemId, champs) {
  const carte = await carteProspection();
  const valeurs = valeursProspect(carte, champs);
  if (champs.collaborateurs?.length && carte.collaborateurs) {
    const p = await personnes(champs.collaborateurs);
    if (p.length) valeurs[carte.collaborateurs] = { personsAndTeams: p };
  }
  if (!Object.keys(valeurs).length) return null;
  return majElement(TABLEAU_PROSPECTION, itemId, valeurs, { labels: true });
}

export { commenter };

/**
 * Fait entrer un prospect dans « Agent immobilier », au format de l'équipe :
 * le nom complet, le prénom, la date d'entrée, le mail, le téléphone, la ville,
 * l'agence, la priorité Élevée (il envoie des fiches), et d'où il vient.
 */
export async function creerAgentImmo({ nom, email, telephone, ville, agence, remarque, spoc = [], maintenant = new Date() }) {
  if (!TABLEAU_AGENTS()) throw new Error('Tableau « Agent immobilier » non configuré : MONDAY_BOARD_AGENTS.');
  const carte = await carteAgents();
  const v = {};
  const prenom = String(nom || '').trim().split(/\s+/)[0];
  const aUnPrenom = /^[A-ZÀ-Ý][a-zà-ÿ'-]+$/.test(prenom || '');
  if (carte.prenom && aUnPrenom) v[carte.prenom] = prenom;
  if (carte.date) v[carte.date] = { date: new Date(maintenant).toISOString().slice(0, 10) };
  const e = normEmail(email);
  if (carte.email && e) v[carte.email] = carte.types[carte.email] === 'email' ? { email: e, text: e } : e;
  const t = normTel(telephone);
  if (carte.telephone && t) v[carte.telephone] = carte.types[carte.telephone] === 'phone' ? { phone: `0${t}`, countryShortName: 'FR' } : telAffiche(t);
  if (carte.ville && ville) v[carte.ville] = String(ville);
  if (carte.entreprise && agence) v[carte.entreprise] = carte.types[carte.entreprise] === 'dropdown' ? { labels: [String(agence).slice(0, 60)] } : String(agence);
  if (carte.remarques && remarque) v[carte.remarques] = String(remarque).slice(0, 2000);
  if (carte.priorite) v[carte.priorite] = { label: 'Élevée' };
  if (carte.spoc && spoc.length) { const p = await personnes(spoc); if (p.length) v[carte.spoc] = { personsAndTeams: p }; }
  const it = await creerElement(TABLEAU_AGENTS(), String(nom || agence || email).slice(0, 250), v, { labels: true });
  return it?.id ? String(it.id) : null;
}

// La prospection et Monday. La plateforme fait foi ; Monday reçoit ce
// qu'elle écrit, pour piloter, et personne n'y modifie un agent à la main.
//
//   Lecture, une fois : les agents des deux anciens tableaux (« Prospection
//     Agent Immo » et « Agent immobilier ») entrent dans le carnet.
//   Écriture, à chaque tour : deux tableaux créés par la plateforme,
//     « Agents (plateforme) » et « Dossiers (pipeline) », tenus à jour.
//     Chaque dossier est relié à son agent.

import { Meta, Records } from '../db.js';
import { TABLEAUX, colonnesDuTableau, lireTableau, creerElement, majElement, utilisateursMonday, mondayConfigure } from '../monday.js';
import * as R from './regles.js';

export { mondayConfigure };
export const TABLEAU_PROSPECTION = (process.env.MONDAY_BOARD_PROSPECTION || '5104678050').trim();

const TOKEN = (process.env.MONDAY_TOKEN || '').trim();
async function gql(query, variables = {}) {
  const r = await fetch('https://api.monday.com/v2', {
    method: 'POST',
    headers: { Authorization: TOKEN, 'Content-Type': 'application/json', 'API-Version': process.env.MONDAY_API_VERSION || '2024-10' },
    body: JSON.stringify({ query, variables }),
  });
  const d = await r.json().catch(() => ({}));
  if (!r.ok || d.errors?.length) throw new Error(d.errors?.[0]?.message || `Monday a répondu ${r.status}`);
  return d.data;
}

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

// ---------------------------------------------------------------------------
// Les deux tableaux tenus par la plateforme
// ---------------------------------------------------------------------------

const CLE_TABLEAUX = 'prospection.monday.tableaux';
const CLE_DOSSIERS = 'prospection.monday.dossiers';

export const ETAPES_DOSSIER = ['Reçu', 'Préanalysé', 'Oui', 'Non', 'Visite', 'Présenté au client', 'Offre', 'Signé', 'Abandonné'];

const COLONNES_AGENTS = [
  ['agence', 'Agence', 'text'], ['ville', 'Ville', 'text'], ['statut', 'Statut', 'status'], ['referent', 'Référent', 'people'],
  ['dernier_contact', 'Dernier contact', 'date'], ['prochaine', 'Prochaine action', 'text'], ['prochaine_le', 'Date prochaine action', 'date'],
  ['secteurs', 'Secteurs', 'text'], ['score', 'Score', 'numbers'], ['resume', 'Résumé du dernier appel', 'long_text'],
  ['telephone', 'Téléphone', 'text'], ['email', 'Email', 'text'],
];
const COLONNES_DOSSIERS = [
  ['etape', 'Étape', 'status'], ['agent', 'Agent', 'board_relation'], ['referent', 'Référent', 'people'],
  ['ville', 'Ville', 'text'], ['recu_le', 'Reçu le', 'date'], ['lien', 'Lien Klocka', 'link'],
];

const lireJson = (cle, d) => { try { return JSON.parse(Meta.get(cle) || 'null') ?? d; } catch { return d; } };
export const tableaux = () => lireJson(CLE_TABLEAUX, null);

/**
 * Crée les deux tableaux la première fois, dans l'espace de travail du
 * tableau de prospection, avec leurs colonnes ; les retrouve ensuite.
 */
export async function assurerTableaux() {
  const t = tableaux();
  if (t?.agents?.id && t?.dossiers?.id) return t;
  const d = await gql('query ($b: [ID!]) { boards(ids: $b) { workspace_id } }', { b: [TABLEAU_PROSPECTION] });
  const workspace = d?.boards?.[0]?.workspace_id || null;
  const creer = async (nom, colonnes, apres = {}) => {
    const b = await gql('mutation ($n: String!, $w: ID) { create_board(board_name: $n, board_kind: public, workspace_id: $w, empty: true) { id } }', { n: nom, w: workspace });
    const id = String(b.create_board.id);
    const cols = {};
    for (const [cle, titre, type] of colonnes) {
      const defaults = apres[cle] ? JSON.stringify(apres[cle]) : null;
      const c = await gql('mutation ($b: ID!, $t: String!, $ty: ColumnType!, $d: JSON) { create_column(board_id: $b, title: $t, column_type: $ty, defaults: $d) { id } }', { b: id, t: titre, ty: type, d: defaults });
      cols[cle] = c.create_column.id;
    }
    return { id, colonnes: cols };
  };
  const agents = t?.agents?.id ? t.agents : await creer('Agents (plateforme)', COLONNES_AGENTS);
  Meta.set(CLE_TABLEAUX, JSON.stringify({ agents }));
  const dossiers = await creer('Dossiers (pipeline)', COLONNES_DOSSIERS, { agent: { boardIds: [Number(agents.id)] } });
  const suite = { agents, dossiers, cree_le: new Date().toISOString() };
  Meta.set(CLE_TABLEAUX, JSON.stringify(suite));
  console.log(`[prospection] tableaux Monday créés : Agents ${agents.id}, Dossiers ${dossiers.id}`);
  return suite;
}

async function personnes(emails = []) {
  const qui = await equipe();
  return emails.map((e) => qui.parEmail.get(String(e || '').toLowerCase())).filter(Boolean).map((u) => ({ id: Number(u.id), kind: 'person' }));
}

/** Pure : les valeurs Monday d'un agent. */
export function valeursAgent(c, a, referent = []) {
  const v = {};
  const texte = (k, x) => { if (c[k]) v[c[k]] = x == null ? '' : String(x).slice(0, 2000); };
  texte('agence', a.agence);
  texte('ville', a.ville);
  if (c.statut) v[c.statut] = { label: R.STATUTS[a.statut] || R.STATUTS.nouveau };
  if (c.referent) v[c.referent] = referent.length ? { personsAndTeams: referent } : null;
  if (c.dernier_contact) v[c.dernier_contact] = a.dernier_contact_le ? { date: String(a.dernier_contact_le).slice(0, 10) } : null;
  texte('prochaine', a.prochaine?.quoi || '');
  if (c.prochaine_le) v[c.prochaine_le] = a.prochaine?.le ? { date: a.prochaine.le } : null;
  texte('secteurs', (a.secteurs || []).join(', '));
  if (c.score) v[c.score] = String(a.score || 0);
  if (c.resume) v[c.resume] = { text: String(a.resume_dernier_appel || '').slice(0, 2000) };
  texte('telephone', (a.telephones || []).join(', '));
  texte('email', (a.emails || []).join(', '));
  return v;
}

/** Envoie à Monday les agents qui ont changé depuis leur dernier envoi (au plus `max` par tour). */
export async function pousserAgents({ max = 60 } = {}) {
  const t = await assurerTableaux();
  const { agents } = await import('./carnet.js');
  const aEnvoyer = agents().filter((a) => !a.monday_le || String(a.maj_le || '') > String(a.monday_le)).slice(0, max);
  let n = 0;
  for (const a of aEnvoyer) {
    const v = valeursAgent(t.agents.colonnes, a, await personnes([a.referent]));
    const le = new Date().toISOString();
    if (a.monday_id) await majElement(t.agents.id, a.monday_id, v, { labels: true });
    else {
      const it = await creerElement(t.agents.id, String(a.nom).slice(0, 250), v, { labels: true });
      a.monday_id = it?.id ? String(it.id) : null;
    }
    // monday_le un peu après maj_le : l'écriture de monday_le elle-même ne compte pas comme un changement.
    Records.update('AgentImmo', a.id, { monday_id: a.monday_id, monday_le: new Date(Date.parse(le) + 1000).toISOString() });
    n += 1;
  }
  return n;
}

/** Pure : l'étape Monday d'une fiche. */
export function etapeMonday(f) {
  if (f.etape === 'abouti') return 'Signé';
  if (f.etape === 'presente') return 'Présenté au client';
  if (f.etape === 'oui') return f.abandonne ? 'Abandonné' : 'Oui';
  if (f.etape === 'non') return 'Non';
  return f.verdict ? 'Préanalysé' : 'Reçu';
}

/** Envoie à Monday les dossiers nés d'une fiche, reliés à leur agent, et leur étape quand elle change. */
export async function pousserDossiers(fiches, { appUrl = (process.env.APP_URL || '').replace(/\/$/, '') } = {}) {
  const t = await assurerTableaux();
  const { agentParEmail } = await import('./carnet.js');
  const faits = lireJson(CLE_DOSSIERS, {});
  const c = t.dossiers.colonnes;
  let n = 0;
  for (const f of fiches.filter((x) => x.deal_id)) {
    const etape = etapeMonday({ ...f, abandonne: Records.findBy('Deal', 'deal_id', f.deal_id)?.statut === 'abandonne' });
    const agent = f.agent_email ? agentParEmail(f.agent_email) : null;
    const signature = `${etape}|${agent?.monday_id || ''}|${agent?.referent || ''}`;
    if (faits[f.deal_id]?.signature === signature) continue;
    const v = { [c.etape]: { label: etape } };
    if (c.agent && agent?.monday_id) v[c.agent] = { item_ids: [Number(agent.monday_id)] };
    if (c.referent && agent?.referent) { const p = await personnes([agent.referent]); if (p.length) v[c.referent] = { personsAndTeams: p }; }
    if (c.ville && f.ville) v[c.ville] = String(f.ville);
    if (c.recu_le && f.le) v[c.recu_le] = { date: String(f.le).slice(0, 10) };
    if (c.lien && appUrl) v[c.lien] = { url: `${appUrl}/Analyse?deal_id=${f.deal_id}`, text: 'Ouvrir' };
    let id = faits[f.deal_id]?.id;
    if (id) await majElement(t.dossiers.id, id, v, { labels: true });
    else id = String((await creerElement(t.dossiers.id, String(f.titre || 'Dossier').slice(0, 250), v, { labels: true }))?.id || '');
    faits[f.deal_id] = { id, signature };
    n += 1;
  }
  Meta.set(CLE_DOSSIERS, JSON.stringify(faits));
  return n;
}

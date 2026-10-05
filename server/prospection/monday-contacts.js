// Les contacts de la prospection vers Monday, dans « Prospection Agent Immo »
// (5104678050), le tableau que l'équipe suit. Deux portes, depuis la page
// Prospection :
//   - les cases cochées d'une liste de l'agent IA : chaque agence (ses agents
//     qui publient, sinon son standard) devient un élément du tableau ;
//   - une note dite ou tapée après un appel (« Sébastien Exemple 06 78 89 98
//     76, Orpi Nice, rappeler lundi ») : le modèle en tire le contact, qui
//     entre dans le tableau.
// Un contact déjà au tableau (même téléphone ou même mail) n'y est pas recréé.
// Chaque contact entre aussi au carnet de la plateforme.

import { Records } from '../db.js';
import { normEmail, normTel, telAffiche } from './regles.js';
import { TABLEAU_PROSPECTION } from './monday.js';

// Les colonnes du tableau, par leur titre (relues une fois par démarrage).
const TITRES = { email: 'Email', telephone: 'Téléphone', agence: 'Agence', ville: 'Ville', remarques: 'Remarques', priorite: 'Priorité', date: 'Date', relance: 'Prochaine relance', collaborateurs: 'Collaborateurs' };
let colonnes = null;
async function colonnesDuTableau() {
  if (colonnes) return colonnes;
  const { colonnesDuTableau: lire } = await import('../monday.js');
  const liste = await lire(TABLEAU_PROSPECTION);
  const { colonneParTitre } = await import('./monday.js');
  colonnes = Object.fromEntries(Object.entries(TITRES).map(([k, t]) => [k, colonneParTitre(liste, [t])]));
  return colonnes;
}

/** Les téléphones et mails déjà au tableau, pour ne rien y mettre deux fois. */
async function dejaAuTableau() {
  const { lireTableau } = await import('../monday.js');
  const c = await colonnesDuTableau();
  const tels = new Set();
  const mails = new Set();
  for (const it of await lireTableau(TABLEAU_PROSPECTION, 2000)) {
    for (const v of it.column_values || []) {
      if (v.id === c.telephone) for (const t of String(v.text || '').split(/[,;/]/)) { const n = normTel(t); if (n) tels.add(n); }
      if (v.id === c.email) for (const e of String(v.text || '').split(/[,;\s]/)) { const n = normEmail(e); if (n) mails.add(n); }
    }
  }
  return { tels, mails };
}

/** Pure : les valeurs Monday d'un contact. */
export function valeursContact(c, x, { aujourdhui = new Date().toISOString().slice(0, 10), collaborateur = null } = {}) {
  const v = {};
  const texte = (k, val) => { if (c[k] && val) v[c[k]] = String(val).slice(0, 2000); };
  texte('email', x.email);
  texte('telephone', x.telephone ? telAffiche(x.telephone) : null);
  texte('agence', x.agence);
  texte('ville', x.ville);
  texte('remarques', x.remarques);
  if (c.priorite) v[c.priorite] = { label: x.priorite || 'Nouveau contact' };
  if (c.date) v[c.date] = { date: aujourdhui };
  if (c.relance && x.relance) v[c.relance] = { date: x.relance };
  if (c.collaborateurs && collaborateur) v[c.collaborateurs] = { personsAndTeams: [{ id: Number(collaborateur), kind: 'person' }] };
  return v;
}

/**
 * Met des contacts au tableau. `contacts` : [{ nom, email, telephone, agence,
 * ville, remarques, relance }]. Rend ceux créés et ceux déjà là.
 */
export async function versMonday(contacts, user = null) {
  const { mondayConfigure, creerElement, utilisateursMonday } = await import('../monday.js');
  if (!mondayConfigure()) return { ok: false, error: "Monday n'est pas configuré (MONDAY_TOKEN)." };
  const c = await colonnesDuTableau();
  const deja = await dejaAuTableau();
  let collaborateur = null;
  try { collaborateur = (await utilisateursMonday()).find((u) => String(u.email).toLowerCase() === String(user?.email || '').toLowerCase())?.id || null; } catch { collaborateur = null; }
  const crees = [];
  const doublons = [];
  for (const x of contacts) {
    const tel = normTel(x.telephone);
    const mail = normEmail(x.email);
    if (!tel && !mail) { doublons.push({ ...x, raison: 'ni téléphone ni mail' }); continue; }
    if ((tel && deja.tels.has(tel)) || (mail && deja.mails.has(mail))) { doublons.push({ ...x, raison: 'déjà au tableau' }); continue; }
    const it = await creerElement(TABLEAU_PROSPECTION, String(x.nom || x.agence || x.email || 'Contact').slice(0, 250), valeursContact(c, x, { collaborateur }), { labels: false });
    if (tel) deja.tels.add(tel);
    if (mail) deja.mails.add(mail);
    crees.push({ ...x, monday_id: it?.id ? String(it.id) : null });
  }
  // Le carnet de la plateforme les connaît aussi.
  if (crees.length) {
    const C = await import('./carnet.js');
    C.integrer(crees.map((x) => ({ nom: x.nom || x.agence, agence: x.agence || null, email: x.email || null, telephone: x.telephone || null, ville: x.ville || null, onglet: x.ville || null, source: x.source || 'Prospection', remarque: x.remarques || null })));
  }
  return { ok: true, crees: crees.length, doublons: doublons.length, contacts: crees };
}

/** Les agences cochées d'une liste de l'agent IA, vers le tableau : leurs agents, sinon leur standard. */
export async function agencesVersMonday(ids, user = null) {
  const contacts = [];
  const vues = [];
  for (const id of ids || []) {
    const a = Records.get('AgenceProspect', id);
    if (!a) continue;
    const l = Records.get('ListeAgences', a.liste_id);
    vues.push(a);
    const base = { agence: a.nom, ville: l?.ville || null, source: 'Agent IA' };
    const agents = (a.agents || []).filter((x) => x.telephone || x.email);
    if (agents.length) for (const x of agents) contacts.push({ ...base, nom: x.nom || x.email, email: x.email, telephone: x.telephone, remarques: `${x.annonces || 0} annonce${(x.annonces || 0) > 1 ? 's' : ''} sur Equimmox` });
    else contacts.push({ ...base, nom: a.gerants?.[0]?.nom || a.nom, email: a.email, telephone: a.telephone, remarques: a.gerants?.[0] ? `Gérant de ${a.nom}` : null });
  }
  const r = await versMonday(contacts, user);
  if (r.ok) for (const a of vues) Records.update('AgenceProspect', a.id, { monday_le: new Date().toISOString(), monday_par: user?.email || null });
  return r;
}

const SCHEMA = {
  type: 'object',
  properties: {
    contacts: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          nom: { type: 'string', description: 'prénom et nom de la personne, en casse ordinaire' },
          telephone: { type: 'string', description: 'le numéro, chiffres seulement' },
          email: { type: 'string' },
          agence: { type: 'string' },
          ville: { type: 'string' },
          remarques: { type: 'string', description: "ce qui s'est dit, en une ou deux phrases" },
          priorite: { type: 'string', enum: ['Nouveau contact', 'Intéressé', 'À recontacter', 'Pas de réponse', 'Contact régulier', 'Moyenne', 'Mort'] },
          relance: { type: 'string', description: 'AAAA-MM-JJ, si une date de rappel est dite' },
        },
        required: ['nom'],
      },
    },
  },
  required: ['contacts'],
};

/** Une note dite ou tapée après un appel → le ou les contacts qu'elle nomme. */
export async function lireNote(texte, { maintenant = new Date() } = {}) {
  const t = String(texte || '').trim();
  if (!t) return { ok: false, error: 'Dites ou tapez le contact.' };
  const { invokeLLM, llmEnabled } = await import('../llm.js');
  if (!llmEnabled) {
    // Sans modèle : le numéro, et ce qui le précède comme nom.
    const m = t.match(/(\+?\d[\d .-]{8,}\d)/);
    return { ok: true, contacts: m ? [{ nom: t.slice(0, m.index).trim() || 'Contact', telephone: m[1].replace(/\D/g, ''), remarques: t.slice(m.index + m[1].length).replace(/^[\s,.;-]+/, '') || null }] : [] };
  }
  const r = await invokeLLM({
    prompt: `Une personne de Klocka (investissement en murs commerciaux) vient d'appeler un agent immobilier et dicte une note. Tires-en le ou les contacts, sans rien inventer : le nom tel qu'il est dit (corrige seulement la casse), le numéro en chiffres (« zéro six soixante-dix-huit… » → 0678…), le mail, l'agence, la ville, ce qui s'est dit en une ou deux phrases, la priorité qui correspond, et la date de rappel si elle est dite. Aujourd'hui : ${maintenant.toISOString().slice(0, 10)}.

La note :
${t}`,
    response_json_schema: SCHEMA,
  });
  const contacts = (r?.contacts || []).filter((x) => x?.nom || x?.telephone || x?.email).map((x) => ({ ...x, telephone: String(x.telephone || '').replace(/\D/g, '') || null, email: x.email || null, source: 'Note après appel', note: t }));
  return { ok: true, contacts };
}

/** La note dite après l'appel, directement au tableau. */
export async function noteVersMonday(texte, user = null) {
  const lu = await lireNote(texte);
  if (!lu.ok) return lu;
  if (!lu.contacts.length) return { ok: false, error: 'Je ne trouve ni nom ni numéro dans la note.' };
  const r = await versMonday(lu.contacts.map((x) => ({ ...x, remarques: x.remarques || null })), user);
  return { ...r, lus: lu.contacts };
}

/** Un mail à une agence ou à l'un de ses agents, écrit dans la page et envoyé d'un clic. */
export async function envoyerMail({ a, objet, corps, agence_id = null }, user = null) {
  if (!/@/.test(String(a || ''))) return { ok: false, error: "L'adresse manque." };
  if (!String(objet || '').trim() || !String(corps || '').trim()) return { ok: false, error: "L'objet et le texte sont nécessaires." };
  const { functions } = await import('../functions.js');
  const signature = user?.full_name || String(user?.email || '').split('@')[0];
  const texte = String(corps).replace(/\{signature\}/g, signature);
  let r;
  try { r = await functions.sendMail({ to: String(a).trim(), subject: String(objet).trim(), body: texte }, { user }); } catch (e) { r = { success: false, error: e?.message || String(e) }; }
  if (!r?.success && !r?.simulated) return { ok: false, error: r?.error || "Le mail n'est pas parti." };
  if (agence_id && Records.get('AgenceProspect', agence_id)) {
    const ag = Records.get('AgenceProspect', agence_id);
    Records.update('AgenceProspect', agence_id, { mails: [{ a, objet, le: new Date().toISOString(), par: user?.email || null, simule: !r.success }, ...(ag.mails || [])].slice(0, 20) });
  }
  return { ok: true, simule: !r.success };
}

/** Le mail de présentation, prérempli : nos critères (réglages de la prospection). */
export async function brouillon(agenceId, { agent = null } = {}) {
  const a = Records.get('AgenceProspect', agenceId);
  if (!a) return { ok: false, error: 'Agence introuvable.' };
  const x = agent ? (a.agents || []).find((y) => y.email === agent) : null;
  const { reglages } = await import('./reglages.js');
  const { mailDeCriteres } = await import('./mails.js');
  const l = Records.get('ListeAgences', a.liste_id);
  const r = reglages();
  const m = mailDeCriteres({ nom: x?.nom || a.gerants?.[0]?.nom || '', agence: a.nom, ville: l?.ville || '' }, { criteres: r.criteres, objet: r.objet_criteres || undefined });
  return { ok: true, a: x?.email || a.email || '', objet: m.objet, corps: m.corps };
}

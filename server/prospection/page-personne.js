// La page de la personne avec qui on a parlé (16 nov. 2026, Jules : « un lien vers une page avec la personne, genre la page
// équipe de la personne »), montrée dans le chat à la fin de chaque appel.
//
// Cherchée PENDANT l'appel (16 nov. 2026, Jules : « dès qu'il dit son nom, ou qu'on le tape dans les notes, ça lance la
// recherche en parallèle ; dès qu'on ferme, c'est instantané ») : l'écran d'appel envoie la conversation et les notes
// (`reperer`) ; un modèle rapide y lit le nom de la personne de l'agence (dit, épelé, dans son mail ou noté), et la
// recherche web part aussitôt, sans attendre. À la fin, `pagePersonne` rend la page gardée, ou attend la recherche lancée.
//
// Une page par personne, gardée sur la fiche de l'agence (`pages_personnes`, clé : le nom normalisé). Dans l'ordre :
//   1. une recherche web (Claude) sur la personne : sa page de conseiller, son LinkedIn, la page équipe où elle figure,
//      toute page qui la montre avec ses coordonnées ou ses biens, vérifiée sur l'agence et la ville ;
//   2. à défaut, la page équipe du site de l'agence, parmi les pages déjà lues du site (/equipe, /notre-equipe, /team…) ;
//   3. à défaut, son profil LinkedIn, s'il est connu.
// Sans nom, la page équipe ou le LinkedIn de la fiche, sans recherche (on ne cherche pas une agence comme une personne).

import { Records } from '../db.js';

const EQUIPE = /(equipe|équipe|team|nos-?conseillers|nos-?agents|nos-?collaborateurs|conseillers|collaborateurs|qui-sommes|a-propos|about)/i;
const MODELE_RAPIDE = 'claude-haiku-4-5';

/** Pure : la page équipe parmi les pages lues d'un site (la plus parlante d'abord : équipe, puis qui sommes-nous). */
export function pageEquipe(pages = []) {
  const urls = (pages || []).map(String).filter((u) => /^https?:\/\//.test(u) && EQUIPE.test(u));
  return urls.sort((a, b) => Number(/qui-sommes|a-propos|about/i.test(a)) - Number(/qui-sommes|a-propos|about/i.test(b)))[0] || null;
}

/** Pure : la première adresse web d'une réponse, nettoyée de sa ponctuation finale. */
export function premiereUrl(texte) {
  const m = String(texte || '').match(/https?:\/\/[^\s)\]>»"']+/);
  return m ? m[0].replace(/[.,;:]+$/, '') : null;
}

/** Pure : le nom ramené à sa forme de clé (minuscules, sans accents ni ponctuation). */
export const cleNom = (nom) => String(nom || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z ]+/g, ' ').replace(/\s+/g, ' ').trim();

// La distance d'édition entre deux mots courts.
function ecart(a, b) {
  const d = Array.from({ length: a.length + 1 }, (_, i) => [i, ...Array(b.length).fill(0)]);
  for (let j = 1; j <= b.length; j++) d[0][j] = j;
  for (let i = 1; i <= a.length; i++) for (let j = 1; j <= b.length; j++) d[i][j] = Math.min(d[i - 1][j] + 1, d[i][j - 1] + 1, d[i - 1][j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
  return d[a.length][b.length];
}
const memeMot = (m, n) => m === n || (Math.min(m.length, n.length) >= 4 && ecart(m, n) <= (Math.min(m.length, n.length) >= 7 ? 2 : 1));

/**
 * Pure : deux noms désignent la même personne : chaque mot du plus court se retrouve dans l'autre (« Martin » et « Paul
 * Martin »), à une lettre ou deux près, la transcription écorchant les noms (« Menouri » dit, « Menoury » compris ensuite).
 */
export function memePersonne(a, b) {
  const x = cleNom(a), y = cleNom(b);
  if (!x || !y) return false;
  if (x === y) return true;
  const [court, long] = x.split(' ').length <= y.split(' ').length ? [x, y] : [y, x];
  const mots = long.split(' ');
  return court.split(' ').every((m) => m.length > 1 && mots.some((n) => memeMot(m, n)));
}

const GENERIQUES = /^(contact|info|infos|accueil|agence|bonjour|hello|commercial|transaction|gestion|location|vente|direction|secretariat|admin|office|immobilier|reception)$/;

/** Pure : le nom lisible tiré d'une adresse de personne (« paul.martin@agence.fr » → « Paul Martin ») ; rien pour contact@. */
export function nomDuMail(email) {
  const local = String(email || '').toLowerCase().split('@')[0] || '';
  const mots = local.split(/[._-]+/).filter((m) => /^[a-z]{2,}$/.test(m));
  if (mots.length < 2 || mots.some((m) => GENERIQUES.test(m))) return null;
  return mots.slice(0, 3).map((m) => m[0].toUpperCase() + m.slice(1)).join(' ');
}

/** Pure : la consigne qui lit le nom de la personne de l'agence dans la conversation et les notes. */
export function consigneReperage({ texte = '', notes = '', agence = null, analyste = null }) {
  return [
    `Appel de prospection : un analyste de Klocka${analyste ? ` (${analyste})` : ''} appelle une agence immobilière${agence ? ` (${agence})` : ''}. Voici la transcription (sans les noms des voix, parfois mal transcrite) et les notes tapées par l'analyste pendant l'appel.`,
    `Donne le nom de la personne de l'agence qui parle à l'analyste : tel qu'elle le dit (« c'est Paul Martin », « Martin à l'appareil »), l'épelle (« M-A-R-T-I-N »), le donne dans son mail, ou tel que l'analyste l'a noté. Pas l'analyste ni Klocka, pas un collègue seulement cité, pas le nom de l'agence. Prénom et nom quand les deux sont dits, écrits correctement.`,
    `Donne aussi sa fonction et son mail s'ils sont dits ou notés. Laisse vide ce qui n'est pas dit : ne devine rien.`,
    '',
    `Notes : ${String(notes || '').trim() || '(aucune)'}`,
    '',
    `Transcription :`,
    String(texte || '').trim().slice(-4000) || '(rien encore)',
  ].join('\n');
}

const agenceDe = (agent) => Records.list('AgenceProspect').find((g) => g.carnet_id === agent.id)
  || Records.list('AgenceProspect').find((g) => (g.agents || []).some((x) => x.nom && agent.nom && x.nom.toLowerCase() === agent.nom.toLowerCase()))
  || (agent.agence ? Records.list('AgenceProspect').find((g) => String(g.nom || '').toLowerCase() === String(agent.agence).toLowerCase()) : null);

// Les recherches lancées pendant l'appel, par fiche et par personne ; et la dernière personne repérée de chaque fiche.
const EN_COURS = new Map();
const REPEREE = new Map();
const REPERAGE = new Map();

/** La fiche porte-t-elle une personne, ou seulement le nom de l'agence ? */
const nomDeLaFiche = (agent) => (agent.nom && cleNom(agent.nom) !== cleNom(agent.agence) ? agent.nom : null);

async function chercherSurLeWeb(agent, agence, { nom, fonction = null, email = null }) {
  const { invokeLLMGrounded } = await import('../llm.js');
  const ville = agent.ville || agence?.ville || '';
  const nomAgence = agent.agence || agence?.nom || '';
  const r = await invokeLLMGrounded({
    via: 'anthropic',
    prompt: [
      `Trouve la page web qui présente ${nom}${fonction ? `, ${fonction},` : ''} de l'agence immobilière ${nomAgence}${ville ? ` à ${ville}` : ''}${agence?.site ? ` (site ${agence.site})` : ''}${email ? ` (mail ${email})` : ''}.`,
      `Une seule page, sur cette personne : sa page de conseiller sur le site de l'agence ou de son réseau, son profil LinkedIn, la page équipe où elle figure, ou toute autre page qui la montre avec ses coordonnées ou ses biens.`,
      `Vérifie que la page parle bien de cette personne dans cette agence (même métier, même ville) : un homonyme ailleurs ne convient pas. Préfère sa page à elle à une page générale de l'agence.`,
      `Réponds par la seule adresse de la page, sans rien d'autre ; « aucune » si tu ne la trouves pas.`,
    ].join('\n'),
  });
  return premiereUrl(r?.final || r?.text);
}

/** Cherche la page de la personne et la garde sur la fiche ; une seule recherche à la fois par personne. */
function lancer(agent, agence, personne) {
  const cle = `${agent.id}:${cleNom(personne.nom)}`;
  if (EN_COURS.has(cle)) return EN_COURS.get(cle);
  const p = (async () => {
    let url = null, source = null;
    if (!process.env.NODE_TEST_CONTEXT) {
      try { url = await chercherSurLeWeb(agent, agence, personne); source = url ? 'recherche web' : null; } catch (e) { console.warn(`[page personne] ${personne.nom} : ${e?.message || e}`); }
    }
    if (!url) { url = pageEquipe(agence?.pages_lues || []); source = url ? "page équipe du site" : null; }
    if (!url && agent.linkedin && memePersonne(nomDeLaFiche(agent), personne.nom)) { url = agent.linkedin; source = 'LinkedIn'; }
    const page = { url, source, nom: personne.nom, le: new Date().toISOString() };
    const f = Records.get('AgentImmo', agent.id);
    if (f && url) Records.update('AgentImmo', agent.id, { pages_personnes: { ...(f.pages_personnes || {}), [cleNom(personne.nom)]: page } });
    return page;
  })().finally(() => setTimeout(() => EN_COURS.delete(cle), 60_000));
  EN_COURS.set(cle, p);
  return p;
}

const pageGardee = (agent, nom) => Object.values(agent.pages_personnes || {}).find((p) => p?.url && memePersonne(p.nom, nom)) || null;

/**
 * Pendant l'appel : le nom de la personne lu dans la conversation et les notes, et sa recherche lancée sans attendre.
 * `connu` : la personne choisie avant l'appel, cherchée tant que la conversation n'en dit pas une autre.
 * Rend { nom, fonction, email, par ('appel' : dit ou noté ; 'connu' : la personne choisie), cherche }.
 */
export async function reperer(agentId, { texte = '', notes = '', connu = null, analyste = null } = {}) {
  const agent = agentId ? Records.get('AgentImmo', agentId) : null;
  if (!agent) return { nom: null };
  const agence = agenceDe(agent);
  const avant = REPERAGE.get(agent.id) || {};
  let personne = null;
  // Un mail de personne tapé dans les notes suffit, sans modèle.
  const mailNote = String(notes || '').match(/[\w.+-]+@[\w-]+(?:\.[\w-]+)+/)?.[0] || null;
  const parLeMail = mailNote ? nomDuMail(mailNote) : null;
  const sig = `${String(texte).length}|${notes}`;
  if (String(texte).trim().length >= 40 || String(notes).trim()) {
    if (sig === avant.sig && avant.personne) personne = avant.personne;
    else if (sig !== avant.sig) {
      try {
        const { invokeLLM } = await import('../llm.js');
        const r = await invokeLLM({
          prompt: consigneReperage({ texte, notes, agence: agent.agence || agence?.nom, analyste }),
          response_json_schema: { type: 'object', properties: { nom: { type: 'string' }, fonction: { type: 'string' }, email: { type: 'string' } }, required: ['nom'] },
          modele: MODELE_RAPIDE,
          max_tokens: 200,
        });
        const nom = String(r?.nom || '').trim();
        if (nom && cleNom(nom).length >= 3 && !process.env.NODE_TEST_CONTEXT) personne = { par: 'appel', nom, fonction: String(r?.fonction || '').trim() || null, email: String(r?.email || '').trim() || mailNote };
      } catch (e) { console.warn(`[page personne] repérage : ${e?.message || e}`); }
      REPERAGE.set(agent.id, { sig, personne: personne || avant.personne || null });
      personne = personne || avant.personne || null;
    }
  }
  if (!personne && parLeMail) personne = { par: 'appel', nom: parLeMail, fonction: null, email: mailNote };
  if (!personne && connu && cleNom(connu) && cleNom(connu) !== cleNom(agent.agence)) personne = { par: 'connu', nom: connu, fonction: null, email: null };
  if (!personne) return { nom: null };
  REPEREE.set(agent.id, personne);
  const gardee = pageGardee(agent, personne.nom);
  if (!gardee) lancer(agent, agence, personne).catch(() => {});
  return { ...personne, cherche: !gardee };
}

/** La page de la personne. `nom` : la personne de l'appel ; sinon celle repérée pendant l'appel, puis celle de la fiche. */
export async function pagePersonne(agentId, { nom = null, chercher = true } = {}) {
  const agent = agentId ? Records.get('AgentImmo', agentId) : null;
  if (!agent) return { url: null };
  const agence = agenceDe(agent);
  const reperee = REPEREE.get(agent.id) || null;
  // Le nom compris à la fin s'écrit parfois autrement que celui repéré pendant l'appel : la même personne garde sa recherche.
  const personne = reperee && (!nom || memePersonne(reperee.nom, nom)) ? reperee : (nom || nomDeLaFiche(agent)) ? { nom: nom || nomDeLaFiche(agent), fonction: null, email: null } : null;
  if (personne) {
    const gardee = pageGardee(agent, personne.nom);
    if (gardee) return gardee;
    const enCours = EN_COURS.get(`${agent.id}:${cleNom(personne.nom)}`);
    if (enCours) return enCours;
    if (chercher) return lancer(agent, agence, personne);
  }
  // Sans personne : la page équipe du site, ou le LinkedIn de la fiche.
  const equipe = pageEquipe(agence?.pages_lues || []);
  if (equipe) return { url: equipe, source: 'page équipe du site' };
  if (agent.linkedin) return { url: agent.linkedin, source: 'LinkedIn' };
  return { url: null };
}

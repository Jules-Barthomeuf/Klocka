// La fiche d'un agent ou d'une agence, en un coup d'œil (16 oct. 2026, Jules) :
// combien de fois on s'est parlé, ses mails et ses fiches commerciales, son
// parcours avec nous, qui de l'équipe a échangé avec lui, ce qu'il nous dit
// souvent et les actions à proposer.
//
// Tout se calcule à la lecture, depuis ce qui existe déjà : les appels
// (AppelAgent), les mails partis (EmailLog) et reçus (MailRecu), les fiches
// reçues (listerFiches), le journal de l'agent (remarques reprises de Monday)
// et l'Intelligence (faits validés, événements Monday). Seule la lecture par
// l'IA (« ce qu'il dit souvent », « actions proposées ») se garde, dans
// FicheContactLecture, et ne se refait que si un échange nouveau est arrivé.

import { Records } from '../db.js';

const LECTURE = 'FicheContactLecture';
const MODELE_RAPIDE = 'claude-haiku-4-5';
const UNE_HEURE = 3600000;

export const ISSUES = {
  a_des_murs: 'A des murs', interesse: 'Intéressé', veut_mail: 'Veut un mail', a_rappeler: 'À rappeler',
  pas_de_murs: 'Pas de murs', pas_interesse: 'Pas intéressé', repondeur: 'Répondeur', pas_de_reponse: 'Pas de réponse',
};
// Un appel sans personne au bout du fil n'est pas une conversation.
const SANS_PERSONNE = new Set(['repondeur', 'pas_de_reponse']);
const ETAPES_OUI = new Set(['oui', 'presente', 'abouti']);

const norm = (s) => String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/\s+/g, ' ').trim();
const minuscule = (s) => String(s || '').trim().toLowerCase();
const adresses = (v) => (Array.isArray(v) ? v : String(v || '').split(/[,;]/)).map((x) => { const m = String(x).match(/<([^>]+)>/); return minuscule(m ? m[1] : x); }).filter((x) => x.includes('@'));
const nomAgent = (a) => [a?.prenom, a?.nom_famille].filter(Boolean).join(' ') || a?.nom || 'Agent';
const court = (s, n = 220) => { const t = String(s || '').replace(/\s+/g, ' ').trim(); return t.length > n ? `${t.slice(0, n - 1)}…` : t; };
const parDate = (x, y) => String(y.le || '').localeCompare(String(x.le || ''));

/** Pure : un appel qui compte (ni essai, ni démonstration, ni remplacé, ni annulé). */
export const appelReel = (x) => !x.essai && !x.faux && x.etat !== 'remplace' && !x.annule_le;

/**
 * Pure : les échanges d'un ou plusieurs agents, à partir des listes déjà lues.
 * `agents` : les fiches AgentImmo ; `donnees` : { appels, emails, recus, fiches, sources }.
 */
export function echangesDe(agents, { appels = [], emails = [], recus = [], fiches = [], sources = [] } = {}) {
  const ids = new Set(agents.map((a) => a.id));
  const mails = new Set(agents.flatMap((a) => (a.emails || []).map(minuscule)));
  const fichesIds = new Set(agents.flatMap((a) => a.fiches_ids || []));
  const nomDe = new Map(agents.map((a) => [a.id, nomAgent(a)]));
  const qui = (id) => (agents.length > 1 ? nomDe.get(id) || null : null);
  const liste = [];
  for (const x of appels) {
    if (!ids.has(x.agent_id) || !appelReel(x)) continue;
    liste.push({
      genre: 'appel', le: x.le, par: minuscule(x.par) || null, agent_id: x.agent_id, avec: qui(x.agent_id),
      titre: x.rappel_entrant ? 'Il a rappelé' : (SANS_PERSONNE.has(x.issue) ? ISSUES[x.issue] : `Appel : ${ISSUES[x.issue] || x.issue || 'sans issue'}`),
      detail: court(x.resume || x.notes || ''), conversation: !SANS_PERSONNE.has(x.issue), duree_s: Number(x.duree_s) || 0, lien: '/Prospection?onglet=suivi',
    });
  }
  for (const m of emails) {
    if (m.statut !== 'envoye' || !adresses(m.to || m.destinataire).some((e) => mails.has(e))) continue;
    liste.push({ genre: 'mail_envoye', le: m.sent_at || m.created_date, par: minuscule(m.expediteur) || null, titre: `Mail envoyé : ${m.subject || m.sujet || '(sans objet)'}`, detail: court(m.body || m.contenu), lien: m.deal_id ? `/Analyse?deal_id=${m.deal_id}` : null });
  }
  for (const m of recus) {
    if (!mails.has(minuscule(m.de_email))) continue;
    liste.push({ genre: 'mail_recu', le: m.date || m.created_date, par: minuscule(m.compte) || null, titre: `Mail reçu : ${m.objet || '(sans objet)'}`, detail: court(m.texte || m.extrait), lien: m.deal_id ? `/Analyse?deal_id=${m.deal_id}` : null });
  }
  for (const f of fiches) {
    if (!(fichesIds.has(f.deal_id) || mails.has(minuscule(f.agent_email)))) continue;
    const oui = ETAPES_OUI.has(f.etape);
    liste.push({ genre: 'fiche', le: f.le, par: minuscule(f.boite) || null, titre: `Fiche reçue : ${f.titre}`, detail: [f.ville, oui ? 'Oui de l\'équipe' : f.etape === 'non' ? 'Non de l\'équipe' : 'sans décision encore', f.verdict ? `pré-analyse : ${String(f.verdict).toLowerCase()}` : null].filter(Boolean).join(' · '), etape: f.etape, oui, non: f.etape === 'non', lien: f.deal_id ? `/Analyse?deal_id=${f.deal_id}` : null });
  }
  for (const a of agents) {
    for (const j of a.journal || []) {
      // Les remarques reprises de Monday et les SMS ; « Fiche modifiée » n'est pas un échange.
      if (j.type === 'source' && /^Monday\s*:/.test(j.texte || '')) liste.push({ genre: 'monday', le: j.le, par: minuscule(j.par) || null, titre: 'Remarque Monday', detail: court(String(j.texte).replace(/^Monday\s*:\s*/, '')), agent_id: a.id, avec: qui(a.id) });
      else if (j.type === 'sms') liste.push({ genre: 'sms', le: j.le, par: minuscule(j.par) || null, titre: 'SMS', detail: court(j.texte), agent_id: a.id, avec: qui(a.id) });
    }
  }
  for (const s of sources) {
    if (s.type !== 'evenement') continue;
    liste.push({ genre: 'monday', le: s.date, par: null, titre: s.titre || 'Monday', detail: court(s.contenu), lien: s.lien_original || null });
  }
  return liste.sort(parDate);
}

/** Pure : les chiffres d'un coup d'œil. */
export function chiffresDe(echanges) {
  const n = (g) => echanges.filter((e) => e.genre === g).length;
  const fiches = echanges.filter((e) => e.genre === 'fiche');
  const appels = echanges.filter((e) => e.genre === 'appel');
  return {
    conversations: appels.filter((e) => e.conversation).length,
    appels: appels.length,
    minutes: Math.round(appels.reduce((s, e) => s + (e.duree_s || 0), 0) / 60),
    mails_envoyes: n('mail_envoye'),
    mails_recus: n('mail_recu'),
    fiches: fiches.length,
    oui: fiches.filter((f) => f.oui).length,
    non: fiches.filter((f) => f.non).length,
    dernier: echanges[0]?.le || null,
  };
}

/** Pure : qui de l'équipe a échangé avec lui, le plus présent d'abord. */
export function equipeDe(echanges, { referent = null, equipe = [] } = {}) {
  const fiche = new Map(equipe.map((m) => [minuscule(m.email), m]));
  const par = new Map();
  for (const e of echanges) {
    if (!e.par || !fiche.has(e.par)) continue;
    const p = par.get(e.par) || { email: e.par, appels: 0, mails: 0, fiches: 0, dernier: null };
    if (e.genre === 'appel') p.appels += 1;
    else if (e.genre === 'mail_envoye' || e.genre === 'mail_recu') p.mails += 1;
    else if (e.genre === 'fiche') p.fiches += 1;
    if (!p.dernier || String(e.le) > p.dernier) p.dernier = e.le;
    par.set(e.par, p);
  }
  const ref = minuscule(referent);
  if (ref && !par.has(ref)) par.set(ref, { email: ref, appels: 0, mails: 0, fiches: 0, dernier: null });
  return [...par.values()]
    .map((p) => ({ ...p, nom: fiche.get(p.email)?.nom || p.email.split('@')[0], photo: fiche.get(p.email)?.photo || null, referent: p.email === ref }))
    .sort((x, y) => (y.appels + y.mails + y.fiches) - (x.appels + x.mails + x.fiches) || Number(y.referent) - Number(x.referent));
}

/** Pure : son parcours avec nous, de l'entrée au carnet au dernier échange. */
export function parcoursDe(agents, echanges) {
  const tri = [...echanges].sort((x, y) => String(x.le || '').localeCompare(String(y.le || '')));
  const premier = (f) => tri.find(f) || null;
  const etapes = [];
  const entree = agents.map((a) => a.cree_le).filter(Boolean).sort()[0];
  if (entree) etapes.push({ le: entree, quoi: 'Entré au carnet', detail: agents.length === 1 ? agents[0].source || null : `${agents.length} agents` });
  const pa = premier((e) => e.genre === 'appel');
  if (pa) etapes.push({ le: pa.le, quoi: 'Premier appel', detail: pa.titre });
  const pc = premier((e) => e.genre === 'appel' && e.conversation);
  if (pc && pc !== pa) etapes.push({ le: pc.le, quoi: 'Première conversation', detail: pc.detail || null });
  const pm = premier((e) => e.genre === 'mail_envoye');
  if (pm) etapes.push({ le: pm.le, quoi: 'Premier mail', detail: pm.titre.replace(/^Mail envoyé : /, '') });
  const pf = premier((e) => e.genre === 'fiche');
  if (pf) etapes.push({ le: pf.le, quoi: 'Première fiche reçue', detail: pf.titre.replace(/^Fiche reçue : /, '') });
  const po = premier((e) => e.genre === 'fiche' && e.oui);
  if (po) etapes.push({ le: po.le, quoi: 'Premier Oui', detail: po.titre.replace(/^Fiche reçue : /, '') });
  // Dans l'ordre des dates : un agent peut avoir écrit avant d'entrer au carnet.
  etapes.sort((x, y) => String(x.le || '').localeCompare(String(y.le || '')));
  if (tri.length) etapes.push({ le: tri[tri.length - 1].le, quoi: 'Dernier échange', detail: tri[tri.length - 1].titre });
  return etapes;
}

// --- Les données, lues ---------------------------------------------------------------------

async function donneesDe(agents, { liensLayer = [] } = {}) {
  const { listerFiches } = await import('../deal/fiches-stats.js');
  const deals = Records.list('Deal');
  const recus = Records.list('MailRecu');
  const fiches = listerFiches({ deals, mails: recus, projets: Records.list('Project') }, { depuis: null });
  // Les événements Monday entrés dans l'Intelligence et rattachés à ces fiches.
  const cles = new Set(liensLayer.map((l) => `${l.type_entite}:${l.entite_id}`));
  const sources = Records.list('CerveauSource').filter((s) => s.type === 'evenement' && (s.liens || []).some((l) => cles.has(`${l.type_entite}:${l.entite_id}`)));
  return { appels: Records.list('AppelAgent'), emails: Records.list('EmailLog'), recus, fiches, sources };
}

async function equipeConnue() {
  try { return (await import('./agent-ia.js')).equipe(); } catch { return []; }
}

/**
 * Les agents d'une agence : sa ligne au carnet (carnet_id), les adresses
 * trouvées sur son site (agents), l'agence de leurs appels, ou le nom.
 */
export function agentsDeLAgence(agence, { agents = Records.list('AgentImmo').filter((a) => !a.essai), appels = Records.list('AppelAgent') } = {}) {
  const n = norm(agence?.nom);
  const parAppel = new Set(appels.filter((x) => x.agence_id === agence?.id && x.agent_id).map((x) => x.agent_id));
  const mails = new Set((agence?.agents || []).map((x) => minuscule(x?.email)).filter(Boolean));
  return agents.filter((a) => a.id === agence?.carnet_id || parAppel.has(a.id) || (a.emails || []).some((e) => mails.has(minuscule(e)))
    || (n && norm(a.agence) === n && (!agence.ville || !a.ville || norm(a.ville) === norm(agence.ville))));
}

/** L'agence d'un agent : celle dont il est la ligne au carnet ou dont le site donne son adresse, sinon par le nom. */
export async function agenceDeLAgent(a, { agences = Records.list('AgenceProspect') } = {}) {
  const mails = new Set((a.emails || []).map(minuscule));
  const vivantes = agences.filter((x) => !x.fusionnee_dans && !x.retiree_le);
  const proches = vivantes.filter((x) => x.carnet_id === a.id || (x.agents || []).some((y) => mails.has(minuscule(y?.email))));
  // Deux agences peuvent porter la même ligne au carnet : celle dont le nom est celui de l'agence de l'agent d'abord.
  const n = norm(a.agence);
  const memeNom = (x) => n && (norm(x.nom) === n || norm(x.nom).startsWith(`${n} `) || n.startsWith(`${norm(x.nom)} `));
  return proches.find(memeNom) || (await import('../layer-sources.js')).agenceDe(a) || proches.find((x) => x.carnet_id === a.id) || proches[0] || null;
}

function lectureGardee(type, id) {
  return Records.list(LECTURE).find((l) => l.type === type && l.entite_id === id) || null;
}

/** La fiche d'un agent. */
export async function ficheAgent(id) {
  const a = Records.get('AgentImmo', id);
  if (!a) return null;
  const agence = await agenceDeLAgent(a);
  const echanges = echangesDe([a], await donneesDe([a], { liensLayer: [{ type_entite: 'agent', entite_id: a.id }] }));
  const collegues = agence ? agentsDeLAgence(agence).filter((x) => x.id !== a.id) : [];
  const lecture = lectureGardee('agent', a.id);
  return {
    type: 'agent', id: a.id, nom: nomAgent(a), poste: a.poste || null, linkedin: a.linkedin || null, ville: a.ville || null, statut: a.statut || null,
    agence: agence ? { id: agence.id, nom: agence.nom, ville: agence.ville || null } : (a.agence ? { id: null, nom: a.agence, ville: null } : null),
    annonces: a.annonces || 0, referent: a.referent || null,
    chiffres: chiffresDe(echanges), parcours: parcoursDe([a], echanges), echanges: echanges.slice(0, 200),
    equipe: equipeDe(echanges, { referent: a.referent, equipe: await equipeConnue() }),
    collegues: collegues.slice(0, 30).map((c) => ({ id: c.id, nom: nomAgent(c), poste: c.poste || null, statut: c.statut || null, fiches: c.fiches || 0, oui: c.oui || 0, dernier_contact_le: c.dernier_contact_le || null })),
    lecture: lecture ? { themes: lecture.themes || [], actions: lecture.actions || [], genere_le: lecture.genere_le, a_jour: lecture.signature === signatureDe(echanges) } : null,
  };
}

/** La fiche d'une agence : la somme de ses agents. */
export async function ficheAgence(id) {
  const ag = Records.get('AgenceProspect', id);
  if (!ag) return null;
  const agents = agentsDeLAgence(ag);
  const liens = [{ type_entite: 'agence', entite_id: ag.id }, ...agents.map((a) => ({ type_entite: 'agent', entite_id: a.id }))];
  const echanges = echangesDe(agents, await donneesDe(agents, { liensLayer: liens }));
  const lecture = lectureGardee('agence', ag.id);
  const parAgent = new Map();
  for (const e of echanges) if (e.agent_id) parAgent.set(e.agent_id, (parAgent.get(e.agent_id) || 0) + 1);
  return {
    type: 'agence', id: ag.id, nom: ag.nom, ville: ag.ville || null, site: ag.site || ag.sites?.[0] || null,
    chiffres: chiffresDe(echanges), parcours: parcoursDe(agents, echanges), echanges: echanges.slice(0, 200),
    equipe: equipeDe(echanges, { equipe: await equipeConnue() }),
    collegues: agents.map((c) => ({ id: c.id, nom: nomAgent(c), poste: c.poste || null, statut: c.statut || null, fiches: c.fiches || 0, oui: c.oui || 0, dernier_contact_le: c.dernier_contact_le || null, echanges: parAgent.get(c.id) || 0 }))
      .sort((x, y) => y.echanges - x.echanges || String(y.dernier_contact_le || '').localeCompare(String(x.dernier_contact_le || ''))),
    lecture: lecture ? { themes: lecture.themes || [], actions: lecture.actions || [], genere_le: lecture.genere_le, a_jour: lecture.signature === signatureDe(echanges) } : null,
  };
}

// --- La lecture par l'IA ---------------------------------------------------------------------

/** Pure : ce qui change quand un échange nouveau arrive. */
export function signatureDe(echanges) {
  return `${echanges.length}:${echanges[0]?.le || ''}`;
}

const SCHEMA = {
  type: 'object',
  properties: {
    themes: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          theme: { type: 'string', description: 'ce qu\'il nous dit, en une phrase courte, à la troisième personne (« Il en a assez qu\'on refuse ses fiches »)' },
          fois: { type: 'integer', description: 'le nombre d\'échanges distincts où il le dit ou le montre' },
          citation: { type: 'string', description: 'ses mots, recopiés de l\'échange où il le dit' },
          quand: { type: 'string', description: 'la date de cet échange, AAAA-MM-JJ' },
        },
        required: ['theme', 'fois', 'citation'],
      },
    },
    actions: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          action: { type: 'string', description: 'un geste concret pour l\'équipe, à l\'infinitif (« L\'appeler pour lui expliquer nos critères avant sa prochaine fiche »)' },
          pourquoi: { type: 'string', description: 'ce qui, dans les échanges ou les chiffres, justifie ce geste' },
        },
        required: ['action', 'pourquoi'],
      },
    },
  },
  required: ['themes', 'actions'],
};

/** Pure : la consigne, à partir de la fiche calculée et de ce que l'Intelligence sait. */
export function consigneLecture(fiche, faits = []) {
  const c = fiche.chiffres;
  const lignes = fiche.echanges.slice(0, 60).map((e) => `- ${String(e.le || '').slice(0, 10)} · ${e.titre}${e.avec ? ` (${e.avec})` : ''}${e.detail ? ` : ${e.detail}` : ''}`).join('\n');
  const savoir = faits.slice(0, 30).map((f) => `- ${String(f.date || '').slice(0, 10)} · ${f.type} : ${f.resume}`).join('\n');
  return `Tu aides l'équipe de Klocka (achat et vente de murs commerciaux) à connaître ${fiche.type === 'agence' ? `l'agence immobilière ${fiche.nom}` : `l'agent immobilier ${fiche.nom}${fiche.agence?.nom ? `, de ${fiche.agence.nom}` : ''}`}, qui nous apporte des biens.
Chiffres : ${c.conversations} conversations sur ${c.appels} appels, ${c.mails_envoyes} mails envoyés, ${c.mails_recus} reçus, ${c.fiches} fiches commerciales reçues dont ${c.oui} Oui et ${c.non} Non.

Échanges, du plus récent au plus ancien :
${lignes || '(aucun)'}
${savoir ? `\nCe que l'Intelligence de Klocka a retenu (validé) :\n${savoir}\n` : ''}
Rends deux listes.
1. themes : ce qu'IL nous dit souvent, dans un appel (résumé, notes) ou dans un de SES mails (« Mail reçu ») : une attente, un agacement, une habitude, une contrainte (« il en a assez qu'on refuse ses fiches », « il veut un retour sous 48 h », « il n'a que du fonds de commerce »). Jamais ce que nous en déduisons, ni ce que disent nos propres mails (« Mail envoyé »), ni un chiffre. Chaque thème a sa citation, recopiée de l'échange où il le dit ; sans citation, pas de thème. Ce qui revient dans plusieurs échanges d'abord ; un thème dit une seule fois seulement s'il le dit comme important. Compte les échanges distincts. Une liste vide vaut mieux qu'un thème inventé. Au plus 5.
2. actions : au plus 3 gestes concrets pour entretenir ou réparer la relation, chacun justifié par un échange ou un chiffre (beaucoup de Non : lui redire nos critères ; une promesse sans suite : le relancer ; un long silence : reprendre contact). Rien de générique, et rien qui vienne d'être fait (un mail qu'on vient de lui envoyer ne se renvoie pas). Une fiche a deux choses distinctes : la décision de l'équipe (Oui, Non, sans décision) et le verdict de la pré-analyse ; ne les confonds pas.
Écris en français simple, sans tiret long.`;
}

/**
 * La lecture : gardée tant qu'aucun échange nouveau n'est arrivé ; refaite
 * au plus une fois par heure. `forcer` la refait tout de suite.
 */
export async function lire(type, id, { forcer = false, invoke = null, maintenant = new Date() } = {}) {
  const fiche = type === 'agence' ? await ficheAgence(id) : await ficheAgent(id);
  if (!fiche) return null;
  const garde = lectureGardee(type, id);
  const signature = signatureDe(fiche.echanges);
  const recente = garde && maintenant - new Date(garde.genere_le) < UNE_HEURE;
  if (garde && !forcer && (garde.signature === signature || recente)) return { themes: garde.themes || [], actions: garde.actions || [], genere_le: garde.genere_le, a_jour: garde.signature === signature };
  if (!fiche.echanges.length) return { themes: [], actions: [], genere_le: null, a_jour: true, vide: true };
  let faits = [];
  try { faits = (await import('../layer-syntheses.js')).ficheLayer(type, id, { derniers: 30 }).faits || []; } catch { faits = []; }
  const prompt = consigneLecture(fiche, faits);
  let resultat;
  let cout = 0;
  if (invoke) resultat = await invoke(prompt);
  else {
    const { invokeLLM } = await import('../llm.js');
    const { mesurer } = await import('../llm-couts.js');
    const m = await mesurer({ operation: 'fiche contact', sur: `${type}:${id}` }, () => invokeLLM({ prompt, response_json_schema: SCHEMA, modele: MODELE_RAPIDE, max_tokens: 1500 }));
    resultat = m.resultat;
    cout = m.consommation?.cout || 0;
  }
  const themes = (resultat?.themes || []).filter((t) => t?.theme && String(t.citation || '').trim()).slice(0, 5).map((t) => ({ theme: court(t.theme, 200), fois: Math.max(1, Number(t.fois) || 1), citation: t.citation ? court(t.citation, 240) : null, quand: t.quand || null }));
  const actions = (resultat?.actions || []).filter((x) => x?.action).slice(0, 3).map((x) => ({ action: court(x.action, 200), pourquoi: court(x.pourquoi, 240) }));
  const champs = { type, entite_id: id, signature, themes, actions, genere_le: maintenant.toISOString(), cout_usd: (garde?.cout_usd || 0) + cout };
  if (garde) Records.update(LECTURE, garde.id, champs); else Records.create(LECTURE, champs);
  return { themes, actions, genere_le: champs.genere_le, a_jour: true };
}

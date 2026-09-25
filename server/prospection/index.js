// La prospection, du nouvel agent à sa première fiche. Ce module relie les
// règles (regles.js), les sources (sources.js, alertes.js) et le carnet
// Monday (monday.js) :
//
//   la nuit      Equimmox sur les villes cibles et les alertes des sites
//                ajoutent au tableau « Prospection Agent Immo » les agents
//                qu'on ne connaît nulle part, les plus gros publieurs d'abord ;
//   le matin     chacun a sa liste d'appels (appelsDuJour), sans doublon ;
//   après l'appel  un statut posé dans Monday, sur la page ou dicté à AK compte
//                l'appel et cale la prochaine relance (synchroniser, noterAppel) ;
//   la fiche     l'agent qui nous en envoie une passe dans « Agent immobilier ».
//
// Klocka garde à côté ce que Monday ne dit pas : le fil des appels
// (AppelProspection), et pour chaque agent sa source, ses annonces et ses
// essais sans réponse (ProspectSuivi).

import { Records, Meta } from '../db.js';
import * as R from './regles.js';
import * as M from './monday.js';

const SUIVI = 'ProspectSuivi';
const APPEL = 'AppelProspection';
const CLE_REGLAGES = 'prospection.reglages';
const CLE_INSTANTANE = 'prospection.instantane';
const CLE_JOUR = 'prospection.jour';
const CLE_NUIT = 'prospection.nuit';

// ---------------------------------------------------------------------------
// Les réglages : villes cibles, critères, qui prospecte
// ---------------------------------------------------------------------------

export const REGLAGES_DEFAUT = {
  villes: [],
  criteres: '',
  objet_criteres: 'Nos critères d\'investissement',
  prospecteurs: [],
  max: R.MAX_PAR_PERSONNE,
  par_nuit: 40,
  matin: true,
  classes: ['Commercial'],
};

const lireJson = (cle, defaut) => { try { return JSON.parse(Meta.get(cle) || 'null') ?? defaut; } catch { return defaut; } };

export const reglages = () => ({ ...REGLAGES_DEFAUT, ...lireJson(CLE_REGLAGES, {}) });

/** Pure : des réglages propres, bornés. */
export function nettoyerReglages(r = {}) {
  const liste = (v) => (Array.isArray(v) ? v : String(v || '').split(/[,\n]/)).map((x) => String(x).trim()).filter(Boolean);
  const out = {};
  if (r.villes !== undefined) out.villes = [...new Set(liste(r.villes).map((v) => v.slice(0, 60)))].slice(0, 20);
  if (r.criteres !== undefined) out.criteres = String(r.criteres || '').slice(0, 4000);
  if (r.objet_criteres !== undefined) out.objet_criteres = String(r.objet_criteres || '').slice(0, 150) || REGLAGES_DEFAUT.objet_criteres;
  if (r.prospecteurs !== undefined) out.prospecteurs = [...new Set(liste(r.prospecteurs).map((e) => e.toLowerCase()).filter((e) => e.includes('@')))];
  if (r.max !== undefined) out.max = Math.min(80, Math.max(5, Math.round(Number(r.max) || R.MAX_PAR_PERSONNE)));
  if (r.par_nuit !== undefined) out.par_nuit = Math.min(200, Math.max(0, Math.round(Number(r.par_nuit) || 0)));
  if (r.matin !== undefined) out.matin = !!r.matin;
  if (r.classes !== undefined) out.classes = liste(r.classes).filter((c) => ['Commercial', 'Office', 'Industrial', 'Mixed'].includes(c));
  return out;
}

export function enregistrerReglages(r, par = null) {
  const suite = { ...reglages(), ...nettoyerReglages(r), maj_le: new Date().toISOString(), maj_par: par };
  Meta.set(CLE_REGLAGES, JSON.stringify(suite));
  return suite;
}

// ---------------------------------------------------------------------------
// Le suivi que Monday ne garde pas
// ---------------------------------------------------------------------------

export const suiviDe = (id) => Records.filter(SUIVI, { item_id: String(id) })[0] || null;
export const suivis = () => Object.fromEntries(Records.list(SUIVI).map((s) => [s.item_id, s]));
export function poserSuivi(id, champs) {
  const s = suiviDe(id);
  if (s) return Records.update(SUIVI, s.id, champs);
  return Records.create(SUIVI, { item_id: String(id), ...champs });
}

// Le tableau, relu au plus toutes les deux minutes : une page qui s'ouvre ne
// doit pas coûter un appel Monday à chaque fois.
let cache = { le: 0, liste: null };
export async function prospects({ frais = false } = {}) {
  if (!frais && cache.liste && Date.now() - cache.le < 120000) return cache.liste;
  const liste = await M.lireProspects();
  cache = { le: Date.now(), liste };
  return liste;
}
export const oublierCache = () => { cache = { le: 0, liste: null }; };

export function retoucherInstantane(id, valeurs) {
  const inst = lireJson(CLE_INSTANTANE, null);
  if (!inst) return;
  inst[id] = { ...(inst[id] || {}), ...valeurs };
  Meta.set(CLE_INSTANTANE, JSON.stringify(inst));
}

// ---------------------------------------------------------------------------
// L'appel
// ---------------------------------------------------------------------------

/**
 * Compte un appel et calcule la suite. Rend la prochaine relance et les
 * essais sans réponse. Ne touche pas Monday : l'appelant écrit.
 */
function compterAppel(p, { statut, remarque = null, dite = null, par = null, via = 'klocka', maintenant = new Date() }) {
  const s = suiviDe(p.id) || {};
  const tentatives = statut === 'pas_de_reponse' ? (s.tentatives || 0) + 1 : 0;
  const relance = R.prochaineRelance(statut, { tentatives, dite, maintenant });
  Records.create(APPEL, {
    item_id: String(p.id), nom: p.nom, agence: p.agence || null, ville: p.ville || null,
    par: par || p.collaborateurs?.[0] || null, statut: statut ? R.STATUTS[statut] : p.statut || null,
    remarque: remarque ? String(remarque).slice(0, 500) : null, via, le: new Date(maintenant).toISOString(),
    source: s.source || null,
  });
  poserSuivi(p.id, {
    tentatives: relance.dormant ? 0 : tentatives,
    appels: (s.appels || 0) + 1,
    dernier_appel_le: new Date(maintenant).toISOString(),
    ...(relance.dormant ? { dormant_jusqu_au: relance.date } : {}),
  });
  return { relance, tentatives };
}

export const prenomDe = (email) => {
  const u = email ? Records.filter('User', { email: String(email).toLowerCase() })[0] : null;
  return (u?.full_name || email || '').split(/[\s@.]/)[0] || null;
};

/**
 * Un appel noté sur la page ou dicté à AK : le statut, la remarque datée, la
 * prochaine relance et, si l'agent n'avait personne, la personne qui a appelé,
 * écrits dans Monday. La remarque part aussi en commentaire de l'élément :
 * l'historique complet vit là.
 * @param {{item_id, statut, remarque?, relance?, par}} appel - statut en clé (pas_de_reponse…), relance en AAAA-MM-JJ
 */
export async function noterAppel({ item_id, statut, remarque = null, relance = null, par = null, maintenant = new Date() }) {
  if (!R.STATUTS[statut]) return { ok: false, error: `Statut inconnu : ${statut}.` };
  const liste = await prospects({ frais: true });
  const p = liste.find((x) => x.id === String(item_id));
  if (!p) return { ok: false, error: 'Agent introuvable dans « Prospection Agent Immo ».' };
  const { relance: suite, tentatives } = compterAppel(p, { statut, remarque, dite: relance, par, via: 'klocka', maintenant });
  const jour = R.jourDe(maintenant);
  const note = [remarque, suite.dormant ? `${R.ESSAIS_MAX} appels sans réponse, on réessaie le ${suite.date.split('-').reverse().join('/')}` : null].filter(Boolean).join('. ');
  const champs = {
    statut,
    prochaine_relance: suite.date,
    ...(note ? { remarques: R.ajouterRemarque(p.remarques, note, { maintenant, par: prenomDe(par) }) } : {}),
    ...(!p.date ? { date: jour } : {}),
    ...(!p.collaborateurs?.length && par ? { collaborateurs: [par] } : {}),
  };
  await M.ecrireProspect(p.id, champs);
  if (remarque) M.commenter(p.id, `${prenomDe(par) || 'Klocka'} (${R.STATUTS[statut]}) : ${remarque}`).catch(() => {});
  retoucherInstantane(p.id, { statut: R.STATUTS[statut], ...(champs.remarques ? { remarques: champs.remarques } : {}), ...(champs.date ? { date: champs.date } : {}), prochaine_relance: suite.date || '' });
  oublierCache();
  if (statut === 'interesse') await preparerCriteres([{ ...p, statut: R.STATUTS.interesse }]).catch(() => {});
  return { ok: true, nom: p.nom, statut: R.STATUTS[statut], prochaine_relance: suite.date, tentatives, dormant: !!suite.dormant };
}

/** Pure : les prospects qui répondent le mieux à une recherche (nom, agence, téléphone, mail). Plusieurs : la recherche est ambiguë. */
export function trouverProspects(liste, recherche) {
  const q = R.norm(recherche);
  if (!q) return [];
  const tel = R.normTel(recherche);
  const mots = q.split(' ').filter((m) => m.length > 1);
  return (liste || [])
    .map((p) => {
      const cible = R.norm(`${p.nom} ${p.agence || ''} ${p.email || ''} ${p.ville || ''}`);
      let score = 0;
      if (tel && R.normTel(p.telephone) === tel) score += 10;
      if (R.norm(p.nom) === q) score += 8;
      for (const m of mots) if (cible.includes(m)) score += 1;
      return { p, score };
    })
    .filter((x) => x.score >= Math.max(1, Math.min(2, mots.length)))
    .sort((a, b) => b.score - a.score)
    // Les mieux notés seulement : « century 21 cannes » ne rend pas celui de Nice.
    .filter((x, _, l) => x.score === l[0].score)
    .map((x) => x.p);
}

/**
 * Relit le tableau : chaque statut, remarque ou date qui a bougé depuis le
 * dernier passage est un appel fait directement dans Monday. On le compte, et
 * on cale la prochaine relance si la personne ne l'a pas posée elle-même.
 * Puis ceux qui nous ont envoyé une fiche passent dans « Agent immobilier »,
 * et les critères des nouveaux intéressés se préparent.
 */
export async function synchroniser({ maintenant = new Date() } = {}) {
  if (!M.mondayConfigure()) return { ok: false, error: 'Monday non configuré.' };
  const liste = await prospects({ frais: true });
  const avant = lireJson(CLE_INSTANTANE, null);
  const apres = R.instantaneDe(liste);
  let appels = 0;
  if (avant) {
    for (const ch of R.changements(avant, liste)) {
      const p = ch.apres;
      const statut = R.cleStatut(p.statut);
      // Un statut qui n'a pas changé (une remarque ajoutée, la date touchée)
      // reste un appel ; un statut vidé n'en est pas un.
      if (!statut) continue;
      const remarque = p.remarques !== ch.avant.remarques ? p.remarques.slice(0, 300) : null;
      const { relance } = compterAppel(p, { statut, remarque, via: 'monday', maintenant });
      appels += 1;
      const champs = {};
      if (!ch.relance_touchee && relance.date !== (p.prochaine_relance || null)) champs.prochaine_relance = relance.date;
      if (!p.date && statut !== 'nouveau') champs.date = R.jourDe(maintenant);
      if (relance.dormant) champs.remarques = R.ajouterRemarque(p.remarques, `${R.ESSAIS_MAX} appels sans réponse, on réessaie le ${relance.date.split('-').reverse().join('/')}`, { maintenant });
      if (Object.keys(champs).length) {
        try {
          await M.ecrireProspect(p.id, champs);
          apres[p.id] = { ...apres[p.id], ...(champs.prochaine_relance !== undefined ? { prochaine_relance: champs.prochaine_relance || '' } : {}), ...(champs.date ? { date: champs.date } : {}), ...(champs.remarques ? { remarques: champs.remarques } : {}) };
        } catch (e) { console.warn(`[prospection] relance de ${p.nom} non écrite : ${e?.message || e}`); }
      }
      if (statut === 'interesse') await preparerCriteres([p]).catch(() => {});
    }
  }
  Meta.set(CLE_INSTANTANE, JSON.stringify(apres));
  oublierCache();
  const passes = await convertirLesEnvoyeurs(liste, { maintenant }).catch((e) => { console.warn(`[prospection] passage en Agent immobilier : ${e?.message || e}`); return 0; });
  return { ok: true, prospects: liste.length, appels, passes, premier: !avant };
}

// ---------------------------------------------------------------------------
// La première fiche : l'agent passe dans « Agent immobilier »
// ---------------------------------------------------------------------------

async function estInterneDe() {
  const { referentielTri } = await import('../deal/tri-mails.js');
  const ref = referentielTri();
  return (email) => { const e = String(email || '').toLowerCase(); return ref.internes.has(e) || ref.domaines.has(e.split('@')[1] || ''); };
}

export async function fichesDepuisLaRemiseAZero() {
  const { listerFiches } = await import('../deal/fiches-stats.js');
  return listerFiches({ deals: Records.list('Deal'), mails: Records.list('MailRecu'), projets: Records.list('Project') }, { estInterne: await estInterneDe() });
}

async function convertirLesEnvoyeurs(liste, { maintenant = new Date() } = {}) {
  const parEmail = new Map(liste.filter((p) => R.normEmail(p.email)).map((p) => [R.normEmail(p.email), p]));
  if (!parEmail.size) return 0;
  const fiches = (await fichesDepuisLaRemiseAZero()).filter((f) => f.agent_email && parEmail.has(f.agent_email)).reverse();
  let agents = null;
  let passes = 0;
  for (const f of fiches) {
    const p = parEmail.get(f.agent_email);
    if (R.cleStatut(p.statut) === 'converti' || suiviDe(p.id)?.converti_le) continue;
    agents ||= await M.lireAgentsImmo();
    const deja = R.dejaConnu(R.indexer(agents), p);
    const s = suiviDe(p.id) || {};
    const remarque = `Venu de la prospection${s.source ? ` (${s.source})` : ''}. 1re fiche le ${String(f.le || '').slice(0, 10).split('-').reverse().join('/')} : ${f.titre}.${p.remarques ? ` ${p.remarques}` : ''}`;
    const agentId = deja?.id || await M.creerAgentImmo({ nom: f.agent && !f.agent.includes('@') ? f.agent : p.nom, email: p.email, telephone: p.telephone, ville: p.ville, agence: p.agence, remarque, spoc: p.collaborateurs, maintenant });
    const remarques = R.ajouterRemarque(p.remarques, `1re fiche reçue (${f.titre}) : passé dans Agent immobilier`, { maintenant });
    await M.ecrireProspect(p.id, { statut: 'converti', prochaine_relance: null, remarques });
    retoucherInstantane(p.id, { statut: R.STATUTS.converti, prochaine_relance: '', remarques });
    poserSuivi(p.id, { converti_le: new Date(maintenant).toISOString(), agent_item_id: agentId, premiere_fiche: f.id });
    if (agentId && !deja) agents.push({ id: agentId, nom: p.nom, email: p.email, telephone: p.telephone });
    passes += 1;
    console.log(`[prospection] ${p.nom} a envoyé sa première fiche : passé dans Agent immobilier`);
  }
  if (passes) oublierCache();
  return passes;
}

// ---------------------------------------------------------------------------
// Les nouveaux agents
// ---------------------------------------------------------------------------

/** Les agents des dossiers : ils nous connaissent déjà, on ne les démarche pas. */
function agentsDesDossiers() {
  const out = [];
  for (const d of Records.list('Deal')) if (d.contact_agent_email) out.push({ email: d.contact_agent_email });
  for (const c of Records.list('Contact')) if (c.email || c.telephone || c.phone) out.push({ email: c.email, telephone: c.telephone || c.phone, nom: c.nom || c.full_name, agence: c.agence || c.societe });
  return out;
}

/**
 * Ajoute au tableau les candidats qu'on ne connaît nulle part (les deux
 * tableaux Monday, les dossiers, le carnet), les plus gros publieurs d'abord,
 * au plus `max`. Un candidat déjà en prospection voit juste son compte
 * d'annonces mis à jour.
 */
export async function importerCandidats(candidats, { max = reglages().par_nuit, maintenant = new Date() } = {}) {
  if (!M.mondayConfigure()) return { ok: false, error: 'Monday non configuré.' };
  const [liste, agents] = await Promise.all([prospects({ frais: true }), M.lireAgentsImmo()]);
  const tries = [...(candidats || [])].sort((a, b) => (b.annonces || 0) - (a.annonces || 0));
  const indexProspects = R.indexer(liste);
  for (const c of tries) {
    const p = R.dejaConnu(indexProspects, c);
    if (p && c.annonces && c.annonces > (suiviDe(p.id)?.annonces || 0)) poserSuivi(p.id, { annonces: c.annonces, sites: c.sites || [] });
  }
  const neufs = R.nouveauxAgents(tries, [...liste, ...agents, ...agentsDesDossiers()]);
  const crees = [];
  const erreurs = [];
  for (const c of neufs.slice(0, max)) {
    try {
      const id = await M.creerProspect(c, { prochaine_relance: R.ouvre(R.jourDe(maintenant)) });
      if (!id) continue;
      poserSuivi(id, { source: c.source || null, annonces: c.annonces || 0, sites: c.sites || [], cree_le: new Date(maintenant).toISOString() });
      crees.push({ id, nom: c.nom, agence: c.agence, ville: c.ville, annonces: c.annonces || 0, source: c.source });
    } catch (e) {
      erreurs.push(`${c.nom} : ${e?.message || e}`);
      if (erreurs.length >= 3) break;
    }
  }
  if (crees.length) oublierCache();
  return { ok: true, candidats: tries.length, crees, doublons: tries.length - neufs.length, en_attente: Math.max(0, neufs.length - crees.length - erreurs.length), erreurs };
}

/** Les agents qui publient du commerce dans ces villes, d'après Equimmox. Une ville après l'autre. */
export async function candidatsEquimmox(villes, { classes = reglages().classes } = {}) {
  const { exporterAnnoncesVente } = await import('../equimmox.js');
  const { lireXlsx } = await import('../xlsx.js');
  const { agentsDesAnnonces } = await import('./sources.js');
  const candidats = [];
  const parVille = [];
  for (const ville of villes) {
    const r = await exporterAnnoncesVente(ville);
    if (!r.ok) { parVille.push({ ville, erreur: r.error }); continue; }
    const agents = r.buffer ? agentsDesAnnonces(lireXlsx(r.buffer), { classes, ville: r.ville }) : [];
    parVille.push({ ville: r.ville, offres: r.offres, agents: agents.length });
    candidats.push(...agents);
  }
  return { candidats, parVille };
}

// Les recherches Equimmox lancées depuis la page : une minute par ville, on
// rend la main tout de suite et la page vient voir où ça en est.
let recherche = null;
export const rechercheEnCours = () => recherche;
export function lancerRecherche(villes, { par = null } = {}) {
  if (recherche?.etat === 'en_cours') return recherche;
  recherche = { etat: 'en_cours', villes, par, depuis: new Date().toISOString(), resultat: null, erreur: null };
  const travail = recherche;
  (async () => {
    const { candidats, parVille } = await candidatsEquimmox(villes);
    const r = await importerCandidats(candidats, { max: 200 });
    travail.resultat = { parVille, ...r };
    travail.etat = r.ok ? 'fini' : 'erreur';
    travail.erreur = r.ok ? null : r.error;
  })().catch((e) => { travail.etat = 'erreur'; travail.erreur = e?.message || String(e); });
  return travail;
}

/**
 * La nuit, une fois par jour entre 3 h et 6 h : Equimmox sur les villes
 * cibles, puis les alertes des sites, puis les nouveaux dans Monday.
 */
export async function passerLaNuit({ maintenant = new Date(), forcer = false } = {}) {
  const heure = Number(new Intl.DateTimeFormat('fr-FR', { timeZone: 'Europe/Paris', hour: '2-digit', hour12: false }).format(maintenant));
  const jour = R.jourDe(maintenant);
  if (!forcer && (heure < 3 || heure >= 6 || lireJson(CLE_NUIT, {})?.jour === jour)) return null;
  const r = reglages();
  Meta.set(CLE_NUIT, JSON.stringify({ jour, etat: 'en_cours', depuis: new Date().toISOString() }));
  const candidats = [];
  let parVille = [];
  if (r.villes.length) {
    const eq = await candidatsEquimmox(r.villes, { classes: r.classes });
    candidats.push(...eq.candidats);
    parVille = eq.parVille;
  }
  const { candidatsDesAlertes } = await import('./alertes.js');
  const alertes = await candidatsDesAlertes().catch((e) => ({ candidats: [], erreur: e?.message || String(e) }));
  candidats.push(...alertes.candidats);
  const imp = r.par_nuit > 0 && candidats.length ? await importerCandidats(candidats, { max: r.par_nuit, maintenant }) : { crees: [], doublons: 0 };
  const bilan = { jour, etat: 'fini', le: new Date().toISOString(), villes: parVille, alertes: alertes.lues || 0, crees: (imp.crees || []).length, doublons: imp.doublons || 0, en_attente: imp.en_attente || 0, erreurs: imp.erreurs || [] };
  Meta.set(CLE_NUIT, JSON.stringify(bilan));
  console.log(`[prospection] nuit du ${jour} : ${bilan.crees} agents ajoutés, ${bilan.doublons} déjà connus`);
  return bilan;
}
export const derniereNuit = () => lireJson(CLE_NUIT, null);

// ---------------------------------------------------------------------------
// Les appels du jour
// ---------------------------------------------------------------------------

const jourCourt = (iso) => (iso ? String(iso).slice(0, 10).split('-').reverse().slice(0, 2).join('/') : '');

/** Les dossiers dont une pièce se fait attendre : on relance l'agent au téléphone. */
function relancesDeDossiers(aujourdhui, faits) {
  const out = [];
  const vus = new Set();
  for (const e of Records.filter('Engagement', { statut: 'ouvert' })) {
    if (!e.deal_id || !e.echeance || String(e.echeance).slice(0, 10) > aujourdhui || vus.has(e.deal_id)) continue;
    const id = `dossier:${e.deal_id}`;
    if (faits.has(id)) continue;
    const d = Records.findBy('Deal', 'deal_id', e.deal_id);
    if (!d || d.archived || d.test) continue;
    vus.add(e.deal_id);
    const tel = d.apercu?.agent_telephone || d.lots?.[0]?.lot?.contact_telephone?.valeur || null;
    const responsables = (d.responsables || []).map((n) => Records.filter('User', { role: 'admin' }).find((u) => R.norm(u.full_name) === R.norm(n))?.email).filter(Boolean);
    out.push({
      id, genre: 'dossier', nom: d.apercu?.agent_nom || e.de || d.contact_agent_email || 'Agent du dossier', agence: d.apercu?.agence || null,
      email: d.contact_agent_email || e.de || null, telephone: tel, ville: d.lots?.[0]?.lot?.adresse?.valeur?.ville || null,
      deal_id: d.deal_id, dossier: d.nom || e.dossier, collaborateurs: responsables,
      raison: `relancer pour ${e.quoi} (${d.nom || e.dossier})${e.echeance ? `, attendu le ${jourCourt(e.echeance)}` : ''}`,
    });
  }
  return out;
}

/** Un Non à un agent qui nous envoie beaucoup : on l'appelle plutôt qu'un mail. */
async function retoursAuxGrosAgents(aujourdhui, faits) {
  const fiches = await fichesDepuisLaRemiseAZero();
  const parAgent = new Map();
  for (const f of fiches) if (f.agent_email) parAgent.set(f.agent_email, (parAgent.get(f.agent_email) || 0) + 1);
  const huitJours = new Date(Date.parse(`${aujourdhui}T12:00:00Z`) - 8 * 86400000).toISOString();
  return fiches
    .filter((f) => f.etape === 'non' && f.agent_email && (parAgent.get(f.agent_email) || 0) >= 3 && String(f.le) >= huitJours && !faits.has(`retour:${f.deal_id}`))
    .map((f) => {
      const d = Records.findBy('Deal', 'deal_id', f.deal_id);
      return {
        id: `retour:${f.deal_id}`, genre: 'retour', nom: f.agent, email: f.agent_email, agence: d?.apercu?.agence || null,
        telephone: d?.apercu?.agent_telephone || null, ville: f.ville, deal_id: f.deal_id, dossier: f.titre,
        raison: `lui dire pourquoi c'est non sur ${f.titre} : il nous a envoyé ${parAgent.get(f.agent_email)} fiches`,
      };
    });
}

/**
 * Ce qui est déjà fait : une relance de dossier appelée ne revient pas avant
 * trois jours, un retour sur un Non ne revient jamais, un prospect appelé
 * aujourd'hui sort de la liste par sa nouvelle date de relance.
 */
function dejaFaits(maintenant) {
  const troisJours = Date.parse(maintenant) - 3 * 86400000;
  return new Set(Records.list(APPEL)
    .filter((a) => String(a.item_id).startsWith('retour:') || Date.parse(a.le) >= troisJours)
    .map((a) => a.item_id));
}

/**
 * La liste d'appels du jour d'une personne, et le compte de l'équipe.
 *
 * Avec des prospecteurs dans les réglages, la liste se partage entre eux,
 * figée à la première lecture de la journée : un agent donné à Paul à 8 h ne
 * passe pas chez Nora à 11 h. Sans réglage, la liste est commune : chacun
 * voit les agents qui sont à lui et ceux qui ne sont à personne, et l'agent
 * appelé devient à celui qui l'a appelé, ce qui le sort des autres listes.
 */
export async function appelsDuJour({ pour = null, maintenant = new Date() } = {}) {
  const r = reglages();
  const moi = pour ? String(pour).toLowerCase() : null;
  const aujourdhui = R.jourDe(maintenant);
  const faits = dejaFaits(maintenant);
  const tous = M.mondayConfigure() ? await prospects() : [];
  const partage = r.prospecteurs.length > 0;
  const horsEquipe = partage && moi && !r.prospecteurs.includes(moi);
  const liste = partage ? tous : tous.filter((p) => !(p.collaborateurs || []).length || (moi && p.collaborateurs.includes(moi)));
  const equipe = partage ? r.prospecteurs : moi ? [moi] : [];
  const extras = [...relancesDeDossiers(aujourdhui, faits), ...(await retoursAuxGrosAgents(aujourdhui, faits).catch(() => []))]
    .filter((x) => partage || !x.collaborateurs?.length || (moi && x.collaborateurs.includes(moi)));
  const jour = lireJson(CLE_JOUR, {});
  const fige = partage && jour.jour === aujourdhui ? jour.attribution || {} : {};
  const s = suivis();
  const { parPersonne, reportes, attribution } = R.listeDuJour(liste, { prospecteurs: equipe, suivis: s, max: r.max, maintenant, extras, fige });
  if (partage) Meta.set(CLE_JOUR, JSON.stringify({ jour: aujourdhui, attribution: { ...fige, ...attribution } }));
  const enrichir = (p) => {
    const x = s[p.id] || {};
    return { ...p, telephone_affiche: R.telAffiche(p.telephone) || p.telephone || null, source: x.source || null, annonces: x.annonces || 0, sites: x.sites || [], tentatives: x.tentatives || 0, appels: x.appels || 0, dernier_appel_le: x.dernier_appel_le || null };
  };
  const appelsAujourdhui = Records.list(APPEL).filter((a) => R.jourDe(a.le) === aujourdhui);
  return {
    jour: aujourdhui,
    pour,
    partage,
    hors_equipe: !!horsEquipe,
    liste: moi && !horsEquipe ? (parPersonne[moi] || []).map(enrichir) : [],
    equipe: Object.fromEntries(Object.entries(parPersonne).map(([e, l]) => [e, l.length])),
    reportes: reportes.length,
    faits: { moi: moi ? appelsAujourdhui.filter((a) => a.par === moi).length : 0, equipe: appelsAujourdhui.length },
    total_prospects: tous.length,
  };
}

/** Un appel « fait » sur une relance de dossier ou un retour : on le compte, rien à écrire dans Monday. */
export function noterAppelHorsTableau({ id, remarque = null, par = null, maintenant = new Date() }) {
  if (!/^(dossier|retour):/.test(String(id))) return { ok: false, error: 'Élément inconnu.' };
  Records.create(APPEL, { item_id: String(id), nom: null, par, statut: 'fait', remarque: remarque ? String(remarque).slice(0, 500) : null, via: 'klocka', le: new Date(maintenant).toISOString() });
  const [genre, dealId] = String(id).split(':');
  if (remarque && dealId) {
    const d = Records.findBy('Deal', 'deal_id', dealId);
    if (d) Records.update('Deal', d.id, { suivi: [...(d.suivi || []), { le: new Date(maintenant).toISOString(), par, type: 'appel', detail: `${genre === 'retour' ? 'Retour' : 'Relance'} au téléphone : ${remarque}` }] });
  }
  return { ok: true };
}

/** Les appels, pour les comptes de la semaine. */
export const appels = () => Records.list(APPEL);

// ---------------------------------------------------------------------------
// Les mails prêts : critères aux intéressés, retours aux Non
// ---------------------------------------------------------------------------

export { preparerCriteres, preparerRetours, mailsPrets, envoyerMails, ecarterMail, modifierMail } from './mails.js';
import { preparerCriteres } from './mails.js';

// ---------------------------------------------------------------------------
// Le tour de garde
// ---------------------------------------------------------------------------
//
// Toutes les dix minutes : relire le tableau (les appels faits dans Monday),
// passer la nuit quand c'est l'heure, préparer les retours des Non. Il tourne
// là où tourne la plateforme de l'équipe (Render) ; en local, seulement avec
// PROSPECTION_AUTO=true, pour ne pas écrire deux fois dans Monday.

const AUTO = process.env.PROSPECTION_AUTO ? /^(1|true|oui|yes)$/i.test(process.env.PROSPECTION_AUTO) : !!process.env.RENDER;
const MINUTES = Math.max(2, Number(process.env.PROSPECTION_MINUTES) || 10);
let minuterie = null;
let enCours = false;
const etat = { le: null, erreur: null, dernier: null };
export const etatProspection = () => ({ active: !!minuterie, minutes: MINUTES, ...etat, nuit: derniereNuit() });

export async function tour() {
  if (enCours) return null;
  enCours = true;
  try {
    const sync = await synchroniser();
    const nuit = await passerLaNuit();
    const { preparerRetours } = await import('./mails.js');
    const retours = await preparerRetours({ max: 3 }).catch(() => 0);
    etat.le = new Date().toISOString();
    etat.erreur = sync.ok ? null : sync.error;
    etat.dernier = { appels: sync.appels || 0, passes: sync.passes || 0, retours, nuit: !!nuit };
    return etat.dernier;
  } catch (e) {
    etat.erreur = e?.message || String(e);
    return null;
  } finally {
    enCours = false;
  }
}

export function demarrerProspection() {
  if (!AUTO || minuterie || !M.mondayConfigure()) return !!minuterie;
  setTimeout(() => tour().catch(() => {}), 30000);
  minuterie = setInterval(() => tour().catch(() => {}), MINUTES * 60000);
  return true;
}

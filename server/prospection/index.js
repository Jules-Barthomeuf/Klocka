// La prospection, l'alternant en coulisse. La plateforme fait foi (le carnet
// des agents, les appels, les dossiers) ; Monday en reçoit une copie.
//
//   la nuit          Equimmox sur les villes cibles et les alertes des sites
//                    complètent le carnet (qui publie quoi, où, combien de
//                    murs vides) ;
//   le matin         la liste du jour : les relances qui tombent, puis les
//                    agents qui publient régulièrement dans les villes ciblées
//                    aujourd'hui ;
//   l'appel          verrouillé au nom de qui appelle, lu par AK, qui propose
//                    la suite (appel.js) ;
//   à chaque tour    une fiche reçue est rattachée à son agent, ses relances
//                    s'arrêtent, son référent est prévenu ; un agent qui
//                    répond voit ses relances s'arrêter ; les scores se
//                    recalculent ; Monday se met à jour ;
//   le vendredi      le récapitulatif de la semaine.
// Rien ne part vers l'extérieur sans un clic (mails.js).

import { Records, Meta } from '../db.js';
import * as R from './regles.js';
import * as C from './carnet.js';
import { reglages, villesDuJour } from './reglages.js';
import { direEnPrive } from './messages.js';

export { reglages, villesDuJour };
export { enregistrer as enregistrerReglages } from './reglages.js';
export { agents, agentDe, trouver, verrouiller, liberer, integrer, importerDepuisMonday, majAgent, journal } from './carnet.js';
export { analyserAppel, validerAppel, appelAValider, appels } from './appel.js';
export { aEnvoyer, programmes, envoyerMails, ecarterMail, modifierMail, decider, RAISONS_NON } from './mails.js';

const lireJson = (cle, d) => { try { return JSON.parse(Meta.get(cle) || 'null') ?? d; } catch { return d; } };
const APP_URL = () => (process.env.APP_URL || '').replace(/\/$/, '');

// ---------------------------------------------------------------------------
// La liste du jour
// ---------------------------------------------------------------------------

/** La liste du jour, avec pour chacun qui l'appelle déjà (verrou) et ses derniers échanges. */
export function listeDuJour({ pour = null, maintenant = new Date() } = {}) {
  const villes = villesDuJour(maintenant);
  const liste = R.listeDuJour(C.agents(), { villes, maintenant });
  return {
    jour: R.jourDe(maintenant),
    villes,
    liste: liste.map((a) => ({
      id: a.id, nom: a.nom, agence: a.agence, ville: a.ville, telephones: a.telephones || [], emails: a.emails || [],
      statut: a.statut, statut_libelle: R.STATUTS[a.statut] || a.statut, referent: a.referent, raison: a.raison, rang: a.rang,
      score: a.score || 0, annonces: a.annonces || 0, source: a.source, secteurs: a.secteurs || [],
      resume_dernier_appel: a.resume_dernier_appel, dernier_contact_le: a.dernier_contact_le,
      journal: (a.journal || []).slice(0, 5),
      verrou: R.verrouTenu(a.verrou) ? a.verrou : null,
      a_moi: R.verrouTenu(a.verrou) && a.verrou.par === pour,
    })),
  };
}

// ---------------------------------------------------------------------------
// Ce qui se passe à chaque tour
// ---------------------------------------------------------------------------

async function estInterneDe() {
  const { referentielTri } = await import('../deal/tri-mails.js');
  const ref = referentielTri();
  return (email) => { const e = String(email || '').toLowerCase(); return ref.internes.has(e) || ref.domaines.has(e.split('@')[1] || ''); };
}

export async function fiches() {
  const { listerFiches } = await import('../deal/fiches-stats.js');
  return listerFiches({ deals: Records.list('Deal'), mails: Records.list('MailRecu'), projets: Records.list('Project') }, { estInterne: await estInterneDe() });
}

/**
 * Une fiche reçue : rattachée à son agent (créé s'il n'était pas au carnet),
 * ses relances s'arrêtent, il passe « envoie des fiches », et son référent
 * est prévenu quand la préanalyse est prête.
 */
export async function rattacherFiches(liste, { maintenant = new Date() } = {}) {
  const { annulerRelances } = await import('./mails.js');
  let n = 0;
  for (const f of [...liste].reverse()) {
    if (!f.agent_email || !f.deal_id) continue;
    let a = C.agentParEmail(f.agent_email);
    if (a && (a.fiches_ids || []).includes(f.deal_id)) continue;
    if (!a) {
      const { crees } = C.integrer([{ nom: f.agent || f.agent_email, email: f.agent_email, ville: f.ville, source: 'Fiche reçue' }], { maintenant });
      a = crees[0] || C.agentParEmail(f.agent_email);
      if (!a) continue;
    }
    // La préanalyse n'est pas finie : on attend le tour suivant pour prévenir.
    if (!f.verdict && f.etape === 'recue') continue;
    const annulees = annulerRelances(a.id, 'fiche reçue');
    const attendait = a.prochaine && /fiche/.test(a.prochaine.quoi || '');
    C.majAgent(a.id, { fiches_ids: [...(a.fiches_ids || []), f.deal_id], statut: 'envoie_des_fiches', derniere_fiche_le: f.le, ...(attendait ? { prochaine: null } : {}) });
    C.journal(a.id, { type: 'fiche', texte: `Fiche reçue : ${f.titre}${annulees ? ' (relances arrêtées)' : ''}`, lien: `/Analyse?deal_id=${f.deal_id}`, le: f.le || maintenant.toISOString() });
    const pour = a.referent || (f.boite && f.boite.endsWith('@klocka.immo') ? f.boite : null);
    if (pour) direEnPrive(pour, `Nouveau dossier de ${a.nom} : ${f.titre}, préanalyse prête. Oui ou Non ? ${APP_URL()}/Prospection`);
    n += 1;
  }
  return n;
}

/** Un agent qui répond à nos mails : ses relances s'arrêtent, et on le dit à son référent. */
export async function suivreReponses({ maintenant = new Date() } = {}) {
  const { annulerRelances } = await import('./mails.js');
  let n = 0;
  const mails = Records.list('MailRecu');
  for (const a of C.agents().filter((x) => x.dernier_mail_le && (x.emails || []).length)) {
    const reponse = mails
      .filter((m) => (a.emails || []).includes(String(m.de_email || '').toLowerCase()) && String(m.date) > a.dernier_mail_le && String(m.date) > String(a.derniere_reponse_le || ''))
      .sort((x, y) => String(y.date).localeCompare(String(x.date)))[0];
    if (!reponse) continue;
    const annulees = annulerRelances(a.id, 'il a répondu');
    C.majAgent(a.id, { derniere_reponse_le: reponse.date, prochaine: reponse.deal_id ? a.prochaine : { quoi: `il a répondu (« ${String(reponse.objet || '').slice(0, 60)} ») : lire et rappeler`, le: R.jourDe(maintenant) } });
    C.journal(a.id, { type: 'reponse', texte: `Réponse : ${reponse.objet}${annulees ? ' (relances arrêtées)' : ''}`, le: reponse.date });
    if (a.referent) direEnPrive(a.referent, `${a.nom} a répondu : « ${String(reponse.objet || '').slice(0, 80)} ». Ses relances sont arrêtées.`);
    n += 1;
  }
  return n;
}

/** Le score de chaque agent, d'après ses fiches. */
export function recalculerScores(liste) {
  const par = new Map();
  for (const f of liste) {
    if (!f.agent_email) continue;
    const s = par.get(f.agent_email) || { fiches: 0, oui: 0, non: 0 };
    s.fiches += 1;
    if (['oui', 'presente', 'abouti'].includes(f.etape)) s.oui += 1;
    if (f.etape === 'non') s.non += 1;
    par.set(f.agent_email, s);
  }
  let n = 0;
  for (const a of C.agents()) {
    const t = (a.emails || []).map((e) => par.get(e)).filter(Boolean).reduce((x, y) => ({ fiches: x.fiches + y.fiches, oui: x.oui + y.oui, non: x.non + y.non }), { fiches: 0, oui: 0, non: 0 });
    const score = R.scoreDe(t);
    if (score !== (a.score || 0) || t.fiches !== (a.fiches || 0)) { C.majAgent(a.id, { score, fiches: t.fiches, oui: t.oui, non: t.non }); n += 1; }
  }
  return n;
}

// ---------------------------------------------------------------------------
// Equimmox et les alertes
// ---------------------------------------------------------------------------

/** Les agents qui publient du commerce dans ces villes, d'après Equimmox, au carnet. */
export async function chercherSurEquimmox(villes) {
  const { exporterAnnoncesVente } = await import('../equimmox.js');
  const { lireXlsx } = await import('../xlsx.js');
  const { agentsDesAnnonces } = await import('./sources.js');
  const parVille = [];
  let crees = 0;
  let completes = 0;
  for (const ville of villes) {
    const r = await exporterAnnoncesVente(ville);
    if (!r.ok) { parVille.push({ ville, erreur: r.error }); continue; }
    const candidats = r.buffer ? agentsDesAnnonces(lireXlsx(r.buffer), { classes: reglages().classes, ville: r.ville }) : [];
    const res = C.integrer(candidats);
    crees += res.crees.length;
    completes += res.completes;
    parVille.push({ ville: r.ville, offres: r.offres, agents: candidats.length, nouveaux: res.crees.length, reguliers: candidats.filter((c) => c.annonces >= 2).length });
  }
  Meta.set('prospection.equimmox.derniere', JSON.stringify({ le: new Date().toISOString(), parVille }));
  return { parVille, crees, completes };
}

let recherche = null;
export const rechercheEnCours = () => recherche;
export function lancerRecherche(villes, { par = null } = {}) {
  if (recherche?.etat === 'en_cours') return recherche;
  recherche = { etat: 'en_cours', villes, par, depuis: new Date().toISOString(), resultat: null, erreur: null };
  const travail = recherche;
  chercherSurEquimmox(villes)
    .then((r) => { travail.resultat = r; travail.etat = 'fini'; })
    .catch((e) => { travail.etat = 'erreur'; travail.erreur = e?.message || String(e); });
  return travail;
}

const CLE_NUIT = 'prospection.nuit';
export const derniereNuit = () => lireJson(CLE_NUIT, null);

/** La nuit, une fois par jour entre 3 h et 6 h : Equimmox sur les villes cibles, puis les alertes. */
export async function passerLaNuit({ maintenant = new Date(), forcer = false } = {}) {
  const jour = R.jourDe(maintenant);
  const h = R.heureDe(maintenant);
  if (!forcer && (h < 3 || h >= 6 || derniereNuit()?.jour === jour)) return null;
  Meta.set(CLE_NUIT, JSON.stringify({ jour, etat: 'en_cours' }));
  const r = reglages();
  const eq = r.villes.length ? await chercherSurEquimmox(r.villes) : { parVille: [], crees: 0 };
  const { candidatsDesAlertes } = await import('./alertes.js');
  const al = await candidatsDesAlertes().catch(() => ({ candidats: [], lues: 0 }));
  const res = C.integrer(al.candidats);
  const bilan = { jour, etat: 'fini', le: new Date().toISOString(), villes: eq.parVille, crees: eq.crees + res.crees.length, alertes: al.lues };
  Meta.set(CLE_NUIT, JSON.stringify(bilan));
  return bilan;
}

// ---------------------------------------------------------------------------
// Le tableau de bord et le vendredi
// ---------------------------------------------------------------------------

function decisions() {
  const m = new Map();
  for (const d of Records.list('Deal')) {
    const s = (d.suivi || []).find((x) => x.intention === 'demande_documents' || x.vers === 'abandonne' || x.intention === 'refus');
    const le = d.decision?.le || s?.le;
    if (le) m.set(d.deal_id, { le });
  }
  return m;
}

export async function tableauDeBord({ maintenant = new Date() } = {}) {
  const { tableauDeBord: calculer } = await import('./semaine.js');
  const { appels } = await import('./appel.js');
  return calculer({ appels: appels(), fiches: await fiches(), agents: C.agents(), decisions: decisions(), maintenant });
}

const CLE_VENDREDI = 'prospection.vendredi';
/** Le vendredi après 17 h, une fois : le récapitulatif, en privé à ceux qui ont appelé cette semaine. */
export async function direLeVendredi({ maintenant = new Date() } = {}) {
  const jour = R.jourDe(maintenant);
  if (new Date(`${jour}T12:00:00Z`).getUTCDay() !== 5 || R.heureDe(maintenant) < 17 || Meta.get(CLE_VENDREDI) === jour) return null;
  Meta.set(CLE_VENDREDI, jour);
  const { recapitulatif } = await import('./semaine.js');
  const t = await tableauDeBord({ maintenant });
  const texte = recapitulatif(t);
  const { destinataires } = await import('../ak/fiches.js');
  const pour = new Set([...Object.keys(t.appels_par_personne), ...destinataires()].filter((e) => e?.endsWith('@klocka.immo')));
  for (const e of pour) direEnPrive(e, `${texte}\n${APP_URL()}/Prospection`);
  return texte;
}

// ---------------------------------------------------------------------------
// Le tour de garde
// ---------------------------------------------------------------------------
//
// Toutes les cinq minutes, là où tourne la plateforme de l'équipe (Render) ;
// en local seulement avec PROSPECTION_AUTO=true, pour ne pas écrire deux fois
// dans Monday.

const AUTO = process.env.PROSPECTION_AUTO ? /^(1|true|oui|yes)$/i.test(process.env.PROSPECTION_AUTO) : !!process.env.RENDER;
const MINUTES = Math.max(2, Number(process.env.PROSPECTION_MINUTES) || 5);
let minuterie = null;
let enCours = false;
const etat = { le: null, erreur: null, dernier: null };
export const etatProspection = () => ({ active: !!minuterie, minutes: MINUTES, ...etat, nuit: derniereNuit() });

export async function tour({ maintenant = new Date() } = {}) {
  if (enCours) return null;
  enCours = true;
  try {
    const M = await import('./monday.js');
    // Le carnet vide : on reprend une fois les agents des tableaux Monday.
    if (!C.agents().length && M.mondayConfigure() && !Meta.get('prospection.import_monday')) {
      const r = await C.importerDepuisMonday();
      Meta.set('prospection.import_monday', JSON.stringify({ le: new Date().toISOString(), crees: r.crees.length, lus: r.lus }));
    }
    const liste = await fiches();
    const rattachees = await rattacherFiches(liste, { maintenant });
    const reponses = await suivreReponses({ maintenant });
    recalculerScores(liste);
    await passerLaNuit({ maintenant });
    await direLeVendredi({ maintenant });
    let monday = null;
    if (M.mondayConfigure()) {
      try { monday = { agents: await M.pousserAgents(), dossiers: await M.pousserDossiers(liste) }; } catch (e) { monday = { erreur: e?.message || String(e) }; }
    }
    etat.le = new Date().toISOString();
    etat.erreur = monday?.erreur || null;
    etat.dernier = { rattachees, reponses, monday };
    return etat.dernier;
  } catch (e) {
    etat.erreur = e?.message || String(e);
    return null;
  } finally {
    enCours = false;
  }
}

export function demarrerProspection() {
  if (!AUTO || minuterie) return !!minuterie;
  setTimeout(() => tour().catch(() => {}), 30000);
  minuterie = setInterval(() => tour().catch(() => {}), MINUTES * 60000);
  return true;
}

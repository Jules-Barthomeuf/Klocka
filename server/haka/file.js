// Haka : la file « À valider » (17 oct. 2026, Jules).
//
// Une seule file pour tout ce que Haka propose : un mail, une ligne Monday,
// une LOI, un rattachement de dossier. Chaque proposition dit ce qu'elle
// propose, pourquoi (ses sources), à qui elle est (le responsable du dossier ;
// sans propriétaire, le « Commun » que n'importe qui peut prendre), et porte
// trois gestes : valider, modifier (valider une version retouchée), rejeter
// (avec un motif). Valider exécute le pas externe de la tâche : c'est le seul
// chemin par lequel une action part vers l'extérieur.
//
// Les huit files existantes (À envoyer, relances par mail, propositions du
// mode appel, faits du Layer, leçons et brouillons d'AK, tri des mails,
// propositions du Dashboard) y rejoindront page par page : `source` dit d'où
// vient une proposition migrée.

import { Records } from '../db.js';
import { estSuperAdmin } from '../acces-pages.js';
import * as taches from './taches.js';
import { parTache } from './executions.js';

const ENTITE = 'HakaProposition';
const norm = (e) => String(e || '').trim().toLowerCase();
const maintenant = () => new Date().toISOString();
/** L'exécution d'où vient une proposition : on remonte ainsi d'un rejet à la compétence et à la version. */
const executionDeLaTache = (tacheId) => { try { return tacheId ? parTache(tacheId)?.id || null : null; } catch { return null; } };

/** Les libellés des types, pour l'écran et les notifications. */
export const TYPES = {
  demande_documents: { libelle: 'Demander les documents', externe: true },
  relance_mail: { libelle: 'Relancer un agent par mail', externe: true },
  reponse_equipe: { libelle: "Réponse à une demande de l'équipe", externe: false },
  mail_exterieur: { libelle: 'Mail reçu sur sourcing@', externe: false },
  rattacher_ou_creer: { libelle: 'Même adresse : rattacher ou créer ?', externe: false },
  meme_bien_recu: { libelle: "Même bien reçu d'un autre agent", externe: false },
  preanalyser_fiche: { libelle: 'Fiche reçue : pré-analyser ?', externe: false },
  mail_ambiant: { libelle: 'Mail reçu : je fais le geste ?', externe: true },
  transfert_dossier: { libelle: 'Transfert : pour quel dossier ?', externe: false },
};

/**
 * Dépose une proposition dans la file et prévient la personne. Une proposition
 * de même clé déjà en attente n'est pas doublée (elle est rendue).
 */
export async function proposer({ type, titre, resume = null, charge = {}, sources = [], pour = null, dossier = null, competence = null, version = null, tache_id = null, etape = null, cout_usd = 0, cle = null, actions = ['valider', 'modifier', 'rejeter'], choix = null, source_migration = null }) {
  if (cle) {
    const deja = Records.list(ENTITE).find((p) => p.cle === cle && p.etat === 'proposee');
    if (deja) return deja;
  }
  const p = Records.create(ENTITE, {
    type, titre: String(titre || TYPES[type]?.libelle || type).slice(0, 140), resume: resume ? String(resume).slice(0, 600) : null,
    charge: charge || {}, charge_finale: null, sources: Array.isArray(sources) ? sources : [],
    pour: pour ? norm(pour) : null, dossier: dossier || null,
    etat: 'proposee', motif_rejet: null, decidee_par: null, decidee_le: null, erreur: null,
    actions, choix, competence, version, tache_id, etape, cout_usd: Number(cout_usd) || 0, execution_id: executionDeLaTache(tache_id),
    source: source_migration || { module: 'haka' }, resultat: null, cle, pris_par: null, cree_le: maintenant(),
  });
  try {
    const { notifier } = await import('../notifications.js');
    // `question_haka` : la carte se montre, mais la cloche ne la redit pas sous « Notifications » : la question y est déjà,
    // dans « Ce qui t'attend » (22 oct. 2026).
    notifier({ pour: p.pour, titre: `Assistant KPartners : ${p.titre}`, texte: p.resume, lien: `/AValider?id=${p.id}`, action: 'Décider', genre: p.pour ? 'question_haka' : 'haka', cle: `haka:${p.id}` });
  } catch (e) {
    console.warn(`[haka] notification non posée : ${e?.message || e}`);
  }
  return p;
}

/** Pure : la personne peut-elle décider de cette proposition ? */
export function peutDecider(user, p) {
  if (!user || !p) return false;
  if (estSuperAdmin(user)) return true;
  if (user.role !== 'admin') return false;
  if (!p.pour) return true;
  return norm(p.pour) === norm(user.email);
}

const enAttente = () => Records.list(ENTITE).filter((p) => p.etat === 'proposee').sort((a, b) => String(a.cree_le).localeCompare(String(b.cree_le)));

/** Les propositions en attente, par vue : `moi`, `commun`, ou `tout` (Jules). */
export function lister(user, vue = 'moi') {
  const email = norm(user?.email);
  const toutes = enAttente();
  if (vue === 'tout') return estSuperAdmin(user) ? toutes : [];
  if (vue === 'commun') return toutes.filter((p) => !p.pour);
  return toutes.filter((p) => p.pour === email);
}

export function compter(user) {
  const email = norm(user?.email);
  const toutes = enAttente();
  const jules = estSuperAdmin(user);
  return { moi: toutes.filter((p) => p.pour === email).length, commun: toutes.filter((p) => !p.pour).length, tout: jules ? toutes.length : null, peut_tout: jules };
}

export const pourDossier = (dealId) => enAttente().filter((p) => p.dossier === dealId);
export const proposition = (id) => Records.get(ENTITE, id) || null;

/**
 * Valide : la version telle quelle, ou retouchée (`charge`), ou un choix parmi
 * `p.choix` (`choix`). Exécute le pas externe de la tâche, et garde le résultat.
 * Si l'action échoue, la proposition revient en attente avec l'erreur.
 */
export async function valider(id, user, { charge = null, choix = null, motif = null, categorie = null } = {}) {
  const p = proposition(id);
  if (!p) return { ok: false, statut: 404, error: 'Proposition introuvable.' };
  if (!peutDecider(user, p)) return { ok: false, statut: 403, error: "Cette proposition n'est pas à vous." };
  if (p.etat !== 'proposee') return { ok: false, statut: 409, error: `Déjà décidée (${p.etat}).` };
  if (Array.isArray(p.choix) && p.choix.length && !p.choix.some((c) => c.cle === choix)) return { ok: false, statut: 400, error: 'Choisissez une des options.' };
  const etat = charge ? 'modifiee' : 'validee';
  // Un « Non » motivé (une fiche reçue qu'on ne rentre pas, 20 oct. 2026) : le motif reste sur la proposition.
  Records.update(ENTITE, p.id, { etat, charge_finale: charge || null, choix_fait: choix || null, decidee_par: norm(user.email), decidee_le: maintenant(), erreur: null, ...(motif ? { motif_rejet: String(motif).slice(0, 500), categorie_rejet: categorie || null } : {}) });
  if (!p.tache_id || !p.etape) return { ok: true, proposition: proposition(p.id) };
  try {
    const resultat = await taches.executerExterne(p.tache_id, p.etape, { user, charge: { ...(charge || p.charge || {}), ...(choix ? { choix } : {}), ...(motif ? { motif, categorie } : {}), proposition_id: p.id } });
    Records.update(ENTITE, p.id, { resultat: resultat || {} });
    return { ok: true, proposition: proposition(p.id), resultat };
  } catch (e) {
    Records.update(ENTITE, p.id, { etat: 'proposee', decidee_par: null, decidee_le: null, erreur: String(e?.message || e).slice(0, 300) });
    return { ok: false, statut: 502, error: `L'action n'est pas partie : ${e?.message || e}`, proposition: proposition(p.id) };
  }
}

/** Rejette, avec un motif obligatoire : la tâche est annulée, le motif gardé sur le dossier. */
export async function rejeter(id, user, motif) {
  const p = proposition(id);
  if (!p) return { ok: false, statut: 404, error: 'Proposition introuvable.' };
  if (!peutDecider(user, p)) return { ok: false, statut: 403, error: "Cette proposition n'est pas à vous." };
  if (p.etat !== 'proposee') return { ok: false, statut: 409, error: `Déjà décidée (${p.etat}).` };
  const m = String(motif || '').trim();
  if (!m) return { ok: false, statut: 400, error: 'Dites pourquoi : le motif aide Assistant KPartners à faire mieux.' };
  Records.update(ENTITE, p.id, { etat: 'rejetee', motif_rejet: m.slice(0, 500), decidee_par: norm(user.email), decidee_le: maintenant() });
  if (p.tache_id) { try { await taches.surRejet(p.tache_id, p, user); } catch (e) { console.warn(`[haka] surRejet : ${e?.message || e}`); } taches.annuler(p.tache_id, m); }
  if (p.dossier) {
    const deal = Records.findBy('Deal', 'deal_id', p.dossier);
    if (deal) {
      const { ajouterSuivi } = await import('../deal/lifecycle.js');
      ajouterSuivi(deal, { type: 'haka_rejet', detail: `« ${p.titre} » rejetée : ${m.slice(0, 200)}` }, user);
    }
  }
  return { ok: true, proposition: proposition(p.id) };
}

/**
 * Retire une proposition devenue sans objet (le mail a été traité à la main, 22 oct. 2026) : elle quitte la cloche et
 * À valider, sa tâche s'annule, la raison reste sur la proposition.
 */
export function retirer(id, raison) {
  const p = proposition(id);
  if (!p || p.etat !== 'proposee') return { ok: false };
  Records.update(ENTITE, p.id, { etat: 'retiree', motif_rejet: String(raison || 'Sans objet').slice(0, 300), decidee_le: maintenant() });
  if (p.tache_id) { try { taches.annuler(p.tache_id, raison); } catch { /* la tâche est déjà close */ } }
  return { ok: true };
}

/** Prendre une proposition du Commun : elle devient à soi. */
export function prendre(id, user) {
  const p = proposition(id);
  if (!p) return { ok: false, statut: 404, error: 'Proposition introuvable.' };
  if (user?.role !== 'admin') return { ok: false, statut: 403, error: "Réservé à l'équipe." };
  if (p.etat !== 'proposee') return { ok: false, statut: 409, error: `Déjà décidée (${p.etat}).` };
  if (p.pour && p.pour !== norm(user.email) && !estSuperAdmin(user)) return { ok: false, statut: 403, error: 'Déjà prise par quelqu\'un.' };
  Records.update(ENTITE, p.id, { pour: norm(user.email), pris_par: norm(user.email), prise_le: maintenant() });
  return { ok: true, proposition: proposition(p.id) };
}

/** Les chiffres du Suivi : décisions par état, taux de rejet, coût par dossier. */
export function bilan({ jours = 30 } = {}) {
  const depuis = new Date(Date.now() - jours * 86400000).toISOString();
  const toutes = Records.list(ENTITE).filter((p) => String(p.cree_le) >= depuis);
  const par = {};
  for (const p of toutes) par[p.etat] = (par[p.etat] || 0) + 1;
  const decidees = toutes.filter((p) => ['validee', 'modifiee', 'rejetee'].includes(p.etat));
  const motifs = {};
  for (const p of toutes) if (p.etat === 'rejetee' && p.motif_rejet) motifs[p.motif_rejet] = (motifs[p.motif_rejet] || 0) + 1;
  const recentes = taches.tachesRecentes({ limite: 500 }).filter((t) => String(t.cree_le) >= depuis);
  const couts = recentes.filter((t) => t.cout_usd > 0).map((t) => t.cout_usd).sort((a, b) => a - b);
  const mediane = couts.length ? couts[Math.floor(couts.length / 2)] : 0;
  return {
    jours, propositions: toutes.length, par_etat: par,
    taux_rejet: decidees.length ? Math.round((100 * (par.rejetee || 0)) / decidees.length) : null,
    taux_modification: decidees.length ? Math.round((100 * (par.modifiee || 0)) / decidees.length) : null,
    motifs: Object.entries(motifs).sort((a, b) => b[1] - a[1]).slice(0, 10).map(([motif, n]) => ({ motif, n })),
    taches: recentes.length, cout_total_usd: Math.round(couts.reduce((s, x) => s + x, 0) * 100) / 100, cout_median_usd: Math.round(mediane * 1000) / 1000,
    file: taches.etatFile(),
  };
}

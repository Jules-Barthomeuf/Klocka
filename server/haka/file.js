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

const ENTITE = 'HakaProposition';
const norm = (e) => String(e || '').trim().toLowerCase();
const maintenant = () => new Date().toISOString();

/** Les libellés des types, pour l'écran et les notifications. */
export const TYPES = {
  demande_documents: { libelle: 'Demander les documents', externe: true },
  rattacher_ou_creer: { libelle: 'Même adresse : rattacher ou créer ?', externe: false },
  meme_bien_recu: { libelle: "Même bien reçu d'un autre agent", externe: false },
};

/**
 * Dépose une proposition dans la file et prévient la personne. Une proposition
 * de même clé déjà en attente n'est pas doublée (elle est rendue).
 */
export async function proposer({ type, titre, resume = null, charge = {}, sources = [], pour = null, dossier = null, competence = null, version = null, tache_id = null, etape = null, cout_usd = 0, cle = null, actions = ['valider', 'modifier', 'rejeter'], choix = null }) {
  if (cle) {
    const deja = Records.list(ENTITE).find((p) => p.cle === cle && p.etat === 'proposee');
    if (deja) return deja;
  }
  const p = Records.create(ENTITE, {
    type, titre: String(titre || TYPES[type]?.libelle || type).slice(0, 140), resume: resume ? String(resume).slice(0, 600) : null,
    charge: charge || {}, charge_finale: null, sources: Array.isArray(sources) ? sources : [],
    pour: pour ? norm(pour) : null, dossier: dossier || null,
    etat: 'proposee', motif_rejet: null, decidee_par: null, decidee_le: null, erreur: null,
    actions, choix, competence, version, tache_id, etape, cout_usd: Number(cout_usd) || 0,
    source: { module: 'haka' }, resultat: null, cle, pris_par: null, cree_le: maintenant(),
  });
  try {
    const { notifier } = await import('../notifications.js');
    notifier({ pour: p.pour, titre: `Haka : ${p.titre}`, texte: p.resume, lien: `/AValider?id=${p.id}`, action: 'Décider', genre: 'haka', cle: `haka:${p.id}` });
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
export async function valider(id, user, { charge = null, choix = null } = {}) {
  const p = proposition(id);
  if (!p) return { ok: false, statut: 404, error: 'Proposition introuvable.' };
  if (!peutDecider(user, p)) return { ok: false, statut: 403, error: "Cette proposition n'est pas à vous." };
  if (p.etat !== 'proposee') return { ok: false, statut: 409, error: `Déjà décidée (${p.etat}).` };
  if (Array.isArray(p.choix) && p.choix.length && !p.choix.some((c) => c.cle === choix)) return { ok: false, statut: 400, error: 'Choisissez une des options.' };
  const etat = charge ? 'modifiee' : 'validee';
  Records.update(ENTITE, p.id, { etat, charge_finale: charge || null, choix_fait: choix || null, decidee_par: norm(user.email), decidee_le: maintenant(), erreur: null });
  if (!p.tache_id || !p.etape) return { ok: true, proposition: proposition(p.id) };
  try {
    const resultat = await taches.executerExterne(p.tache_id, p.etape, { user, charge: { ...(charge || p.charge || {}), ...(choix ? { choix } : {}), proposition_id: p.id } });
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
  if (!m) return { ok: false, statut: 400, error: 'Dites pourquoi : le motif aide Haka à faire mieux.' };
  Records.update(ENTITE, p.id, { etat: 'rejetee', motif_rejet: m.slice(0, 500), decidee_par: norm(user.email), decidee_le: maintenant() });
  if (p.tache_id) taches.annuler(p.tache_id, m);
  if (p.dossier) {
    const deal = Records.findBy('Deal', 'deal_id', p.dossier);
    if (deal) {
      const { ajouterSuivi } = await import('../deal/lifecycle.js');
      ajouterSuivi(deal, { type: 'haka_rejet', detail: `« ${p.titre} » rejetée : ${m.slice(0, 200)}` }, user);
    }
  }
  return { ok: true, proposition: proposition(p.id) };
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

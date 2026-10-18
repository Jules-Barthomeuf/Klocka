// La collecte des annonces de locaux commerciaux à louer sur les sites d'agences du 06 (18 oct. 2026, lot 3).
//
// Règles de Jules :
//   - seulement les sites « autorisés » (vérifiés il y a moins de 31 jours, voir verification.js) ; un site
//     devenu interdit sort de lui-même ;
//   - seulement les locaux commerciaux à louer, et seulement des faits : adresse, surface, loyer, date, lien ;
//     ni photo ni description ;
//   - une lecture par jour au plus par site ; un budget de requêtes PAR SERVEUR (adresse IP), étalé sur la
//     journée ; un user-agent qui nomme Klocka ;
//   - un 403 ou un 429 coupe la collecte sur ce serveur pour 7 jours et prévient Jules ; jamais de changement
//     d'adresse ni de proxy pour contourner un blocage ;
//   - un lecteur par logiciel de site (Apimo, Hektor…), pas un par agence ;
//   - origine « annonce agence », loyer « demandé », poids 1 ; chaque annonce passe par l'identifiant de local ;
//     la même annonce chez deux agences = un seul loyer.
// Tout est derrière l'interrupteur de la boîte à outils ET celui de la source « annonces » (Paramètres › Sources).

import dns from 'node:dns/promises';
import { Records, Meta } from '../db.js';
import { UA, sitesVerifies, collectable, verifierSite } from './verification.js';
import { sourceActive } from '../socle/registre-sources.js';
import { boiteOutilsActive } from '../socle/drapeaux.js';

const ENTITE = 'AnnonceAgence';
const CLE_SERVEURS = 'annonces.serveurs';
/** Requêtes par serveur et par jour : étalées, une toutes les 86 400 / BUDGET secondes au plus. */
export const BUDGET_PAR_SERVEUR = Number(process.env.ANNONCES_BUDGET_SERVEUR || 120);
export const JOURS_COUPURE = 7;
const DELAI_MS = 20000;

// --- Les lecteurs par logiciel ---------------------------------------------------------------------
// Chaque lecteur sait trouver, sur un site de son logiciel, la liste des locaux commerciaux à louer, et y lire
// des faits. `pages(site)` rend les adresses de liste à lire ; `lire(html, url)` rend [{ url, adresse, surface,
// loyer, periode: 'mois'|'an', date }]. Un logiciel sans lecteur n'est pas collecté.
export const LECTEURS = {};

/** Pure : le loyer annuel d'une annonce (un loyer mensuel ×12). */
export function loyerAnnuel(a) {
  const l = Number(a?.loyer);
  if (!(l > 0)) return null;
  return a.periode === 'mois' ? Math.round(l * 12) : Math.round(l);
}

/** Pure : la même annonce ? Le même local (identifiant, sinon l'adresse), la surface à 2 m² près, le loyer à 3 % près. */
export function memeAnnonce(a, b) {
  const lieu = (x) => x.id_local || String(x.adresse || '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
  if (!lieu(a) || lieu(a) !== lieu(b)) return false;
  if (Math.abs((Number(a.surface) || 0) - (Number(b.surface) || 0)) > 2) return false;
  const la = Number(a.loyer_annuel) || 0; const lb = Number(b.loyer_annuel) || 0;
  return la > 0 && lb > 0 && Math.abs(la - lb) / Math.max(la, lb) <= 0.03;
}

// --- Le budget par serveur ------------------------------------------------------------------------

const lireServeurs = () => { try { return JSON.parse(Meta.get(CLE_SERVEURS) || '{}'); } catch { return {}; } };
const ecrireServeurs = (s) => Meta.set(CLE_SERVEURS, JSON.stringify(s));

/** Pure : un serveur peut-il recevoir une requête maintenant ? Pas coupé, budget du jour non épuisé, écart respecté. */
export function serveurDisponible(etat = {}, now = Date.now(), budget = BUDGET_PAR_SERVEUR) {
  if (etat.coupe_jusqua && now < Date.parse(etat.coupe_jusqua)) return false;
  const jour = new Date(now).toISOString().slice(0, 10);
  if (etat.jour === jour && (etat.requetes || 0) >= budget) return false;
  const ecart = (86400 * 1000) / budget;
  return !etat.derniere || now - Date.parse(etat.derniere) >= ecart;
}

async function ipDe(origine) {
  try { return (await dns.lookup(new URL(origine).hostname)).address; } catch { return `inconnue:${origine}`; }
}

/** Une requête à un site, au compte de son serveur. Un 403 ou un 429 coupe le serveur 7 jours et prévient. */
async function lirePage(url, ip) {
  const serveurs = lireServeurs();
  const now = Date.now();
  const jour = new Date(now).toISOString().slice(0, 10);
  const e = serveurs[ip] || {};
  serveurs[ip] = { ...e, jour, requetes: (e.jour === jour ? e.requetes || 0 : 0) + 1, derniere: new Date(now).toISOString() };
  ecrireServeurs(serveurs);
  let r;
  try {
    r = await fetch(url, { headers: { 'user-agent': UA, accept: 'text/html' }, redirect: 'follow', signal: AbortSignal.timeout(DELAI_MS) });
  } catch (err) {
    return { ok: false, statut: 0, erreur: err?.message || String(err) };
  }
  if (r.status === 403 || r.status === 429) {
    const jusqua = new Date(now + JOURS_COUPURE * 86400000).toISOString();
    const s2 = lireServeurs();
    s2[ip] = { ...s2[ip], coupe_jusqua: jusqua, coupe_pour: `réponse ${r.status} sur ${url}` };
    ecrireServeurs(s2);
    const { notifier } = await import('../notifications.js');
    const pour = String(process.env.SUPER_ADMIN_EMAILS || '').split(',')[0]?.trim() || null;
    notifier({ pour, titre: `Collecte d'annonces coupée 7 jours sur un serveur`, texte: `Le serveur ${ip} a répondu ${r.status} (${new URL(url).host}). Plus aucune lecture jusqu'au ${jusqua.slice(0, 10)} ; aucun contournement.`, genre: 'alerte', cle: `annonces:coupe:${ip}:${jusqua.slice(0, 10)}` });
    return { ok: false, statut: r.status, coupe: true };
  }
  if (!r.ok) return { ok: false, statut: r.status };
  return { ok: true, statut: r.status, html: (await r.text()).slice(0, 3_000_000), url: r.url };
}

// --- Le passage --------------------------------------------------------------------------------------

/** Enregistre les faits d'une annonce, passés par l'identifiant de local et dédoublonnés. */
async function garder(site, brute) {
  const loyer_annuel = loyerAnnuel(brute);
  const surface = Number(brute.surface) || null;
  if (!brute.adresse || !loyer_annuel || !surface) return { garde: false, raison: 'adresse, surface ou loyer absent' };
  let id_local = null;
  try {
    const { resoudreLocal } = await import('../socle/local.js');
    const r = await resoudreLocal(brute.adresse);
    if (r.ok) id_local = r.local.id_local;
  } catch { /* le local se résoudra au passage suivant */ }
  const now = new Date().toISOString();
  const candidats = id_local ? Records.filter(ENTITE, { id_local }) : Records.filter(ENTITE, { adresse: brute.adresse });
  const deja = candidats.find((x) => memeAnnonce(x, { id_local, adresse: brute.adresse, surface, loyer_annuel }));
  const vu = { site: site.origine, url: brute.url, le: now };
  if (deja) {
    const vu_chez = [...(deja.vu_chez || []).filter((v) => v.site !== site.origine), vu];
    Records.update(ENTITE, deja.id, { vu_chez, revue_le: now, retiree_le: null });
    return { garde: true, doublon: vu_chez.length > 1 };
  }
  Records.create(ENTITE, {
    id_local, adresse: brute.adresse, surface, loyer_annuel, loyer_m2: Math.round((loyer_annuel / surface) * 10) / 10,
    date_annonce: brute.date || null, url: brute.url, origine: 'annonce_agence', loyer_type: 'demande', poids_source: 'annonces',
    vu_chez: [vu], vue_le: now, revue_le: now, retiree_le: null,
  });
  return { garde: true };
}

/**
 * Un tour de collecte : pour chaque serveur disponible, le prochain site autorisé de la file dont le logiciel a un
 * lecteur et qui n'a pas été lu aujourd'hui ; une page à la fois.
 */
export async function tourDeCollecte({ max = 20 } = {}) {
  if (!boiteOutilsActive() || !sourceActive('annonces') || process.env.ANNONCES_COLLECTE !== '1') return { actif: false };
  const aujourdhui = new Date().toISOString().slice(0, 10);
  const sites = sitesVerifies().filter((s) => collectable(s) && LECTEURS[s.logiciel] && String(s.collecte_le || '').slice(0, 10) !== aujourdhui);
  const bilan = { lus: 0, annonces: 0, doublons: 0, coupes: 0 };
  const servis = new Set();
  for (const site of sites) {
    if (bilan.lus >= max) break;
    const ip = await ipDe(site.origine);
    if (servis.has(ip) || !serveurDisponible(lireServeurs()[ip])) continue;
    servis.add(ip);
    const lecteur = LECTEURS[site.logiciel];
    const pages = lecteur.pages(site);
    const page = pages[0];
    const r = await lirePage(page, ip);
    bilan.lus++;
    if (r.coupe) { bilan.coupes++; continue; }
    if (!r.ok) continue;
    for (const a of lecteur.lire(r.html, r.url)) {
      const g = await garder(site, a);
      if (g.garde) bilan.annonces++;
      if (g.doublon) bilan.doublons++;
    }
    Records.update('SiteAgence', site.id, { collecte_le: new Date().toISOString() });
  }
  return bilan;
}

/** La revérification mensuelle, au même rythme par serveur : un site vu il y a plus de 30 jours est relu. */
export async function tourDeVerification({ max = 5 } = {}) {
  if (!boiteOutilsActive() || !sourceActive('annonces')) return { actif: false };
  const vieux = sitesVerifies().filter((s) => Date.now() - Date.parse(s.verifie_le) > 30 * 86400000).slice(0, max);
  for (const s of vieux) {
    const ip = await ipDe(s.origine);
    if (!serveurDisponible(lireServeurs()[ip])) continue;
    const fiche = await verifierSite(s.origine, { agences: s.agences, pause: 3000 });
    // Un 403 ou un 429 pendant la vérification coupe aussi le serveur 7 jours.
    if (/réponse (403|429)/.test(fiche?.motif || '')) {
      const serveurs = lireServeurs();
      serveurs[ip] = { ...serveurs[ip], coupe_jusqua: new Date(Date.now() + JOURS_COUPURE * 86400000).toISOString(), coupe_pour: fiche.motif };
      ecrireServeurs(serveurs);
    }
  }
  return { relus: vieux.length };
}

/** Toutes les dix minutes, sur Render seulement (ou ANNONCES_COLLECTE_LOCALE=1) : un tour de vérification et de collecte. */
export function planifierCollecte() {
  const permis = !!process.env.RENDER || process.env.ANNONCES_COLLECTE_LOCALE === '1';
  if (!permis) return null;
  let enCours = false;
  return setInterval(async () => {
    if (enCours) return;
    enCours = true;
    try { await tourDeVerification(); await tourDeCollecte(); } catch (e) { console.warn(`[annonces] tour interrompu : ${e?.message || e}`); } finally { enCours = false; }
  }, 10 * 60 * 1000);
}

/** L'état des serveurs (budget du jour, coupures) et des annonces gardées. */
export function etatCollecte() {
  const annonces = Records.list(ENTITE);
  return { serveurs: lireServeurs(), annonces: annonces.length, doublons: annonces.filter((a) => (a.vu_chez || []).length > 1).length, lecteurs: Object.keys(LECTEURS) };
}

// Les mails de la prospection, préparés d'avance et envoyés en lot depuis la
// page Prospection, après relecture : rien ne part tout seul.
//
//   critères  l'agent qu'on vient d'appeler est intéressé : nos critères, avec
//             le texte des réglages, depuis la boîte de qui valide l'envoi ;
//   retour    un dossier est un Non et l'agent n'a pas eu de nouvelles : le
//             mail de refus du cycle de vie (celui de la fiche du dossier), qui
//             range le dossier en abandonné comme d'habitude.

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { Records } from '../db.js';
import * as R from './regles.js';

const ENTITE = 'ProspectionMail';
const ici = path.dirname(fileURLToPath(import.meta.url));
const PRENOMS = (() => {
  try { const p = JSON.parse(fs.readFileSync(path.join(ici, '../ak/prenoms.json'), 'utf8')); return new Set([...(p.feminins || []), ...(p.masculins || []), ...(p.mixtes || [])]); } catch { return new Set(); }
})();

/** Pure : le prénom d'un nom de personne (« Sophie Martin » → Sophie), ou null pour une agence (« Century 21 Cce »). */
export function prenomDeLAgent(nom, prenoms = PRENOMS) {
  const premier = String(nom || '').trim().split(/[\s,]+/)[0] || '';
  const cle = premier.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z-]/g, '');
  if (!cle || !prenoms.has(cle)) return null;
  return premier.charAt(0).toUpperCase() + premier.slice(1).toLowerCase();
}

/**
 * Pure : le mail de critères d'un agent. Un texte de réglages qui commence
 * par « Bonjour » ou contient {prenom} est le mail entier ; sinon il est
 * posé au milieu d'un mail court. {signature} devient le nom de qui envoie.
 */
export function mailDeCriteres(p, { criteres, objet = 'Nos critères d\'investissement' }) {
  const prenom = prenomDeLAgent(p.nom);
  const remplir = (t) => String(t).replace(/\{prenom\}/g, prenom || '').replace(/\{agence\}/g, p.agence || '').replace(/\{ville\}/g, p.ville || '').replace(/Bonjour ,/g, 'Bonjour,');
  const texte = String(criteres || '').trim();
  const complet = /^bonjour/i.test(texte) || texte.includes('{prenom}');
  const corps = complet
    ? remplir(texte)
    : [
        `Bonjour${prenom ? ` ${prenom}` : ''},`,
        '',
        'Merci pour notre échange. Comme convenu, voici ce que nous recherchons :',
        '',
        remplir(texte),
        '',
        'Dès qu\'un bien s\'en approche, envoyez-nous sa fiche en réponse à ce mail : nous vous disons rapidement si nous y allons, et pourquoi.',
        '',
        'Bien à vous,',
        '{signature}',
      ].join('\n');
  return { objet: remplir(objet), corps: corps.includes('{signature}') ? corps : `${corps}\n\n{signature}` };
}

export const mailsPrets = () => Records.filter(ENTITE, { etat: 'pret' }).sort((a, b) => String(b.cree_le).localeCompare(String(a.cree_le)));

/**
 * Prépare le mail de critères des intéressés qui ne l'ont pas encore eu.
 * Sans critères dans les réglages, rien ne se prépare : la page le dit.
 */
export async function preparerCriteres(liste) {
  const { reglages, suiviDe } = await import('./index.js');
  const r = reglages();
  if (!String(r.criteres || '').trim()) return 0;
  let n = 0;
  for (const p of liste || []) {
    if (R.cleStatut(p.statut) !== 'interesse' || !R.normEmail(p.email) || suiviDe(p.id)?.criteres_le) continue;
    if (Records.filter(ENTITE, { item_id: String(p.id), genre: 'criteres' }).some((m) => m.etat !== 'ecarte')) continue;
    const { objet, corps } = mailDeCriteres(p, { criteres: r.criteres, objet: r.objet_criteres });
    Records.create(ENTITE, { genre: 'criteres', item_id: String(p.id), nom: p.nom, agence: p.agence || null, ville: p.ville || null, a: R.normEmail(p.email), objet, corps, etat: 'pret', cree_le: new Date().toISOString() });
    n += 1;
  }
  return n;
}

// Le motif d'un Non noté à la main dans le suivi du dossier, s'il y en a un.
const motifDuNon = (d) => {
  const s = [...(d.suivi || [])].reverse().find((x) => x.vers === 'abandonne' && x.detail && !/→/.test(x.detail));
  return s?.detail || null;
};

/**
 * Prépare le retour des dossiers Non dont l'agent n'a rien reçu : ni refus, ni
 * abandon parti. Au plus `max` par passage, chacun coûte une rédaction.
 */
export async function preparerRetours({ max = 5 } = {}) {
  const { fichesDepuisLaRemiseAZero } = await import('./index.js');
  const fiches = (await fichesDepuisLaRemiseAZero()).filter((f) => f.etape === 'non' && f.deal_id && f.agent_email);
  let n = 0;
  for (const f of fiches) {
    if (n >= max) break;
    if (Records.filter(ENTITE, { deal_id: f.deal_id, genre: 'retour' }).length) continue;
    const d = Records.findBy('Deal', 'deal_id', f.deal_id);
    if (!d || d.test || !d.lots?.length) continue;
    const dejaDit = (d.suivi || []).some((s) => ['refus', 'abandon'].includes(s.intention))
      || Records.filter('EmailLog', { deal_id: f.deal_id }).some((m) => ['refus', 'abandon'].includes(m.intention) && m.statut === 'envoye');
    if (dejaDit) continue;
    const { redigerMailIntention } = await import('../deal/mails-cycle.js');
    const { lotOuVide, obtenirDossier } = await import('../deal/index.js');
    const dossier = obtenirDossier(f.deal_id);
    if (!dossier) continue;
    const mail = await redigerMailIntention(lotOuVide(dossier, 0), 'refus', { signature: '{signature}', raisons: motifDuNon(d) }).catch(() => null);
    if (!mail?.objet || !mail?.corps) continue;
    Records.create(ENTITE, { genre: 'retour', deal_id: f.deal_id, dossier: f.titre, nom: f.agent, a: f.agent_email, objet: mail.objet, corps: mail.corps, etat: 'pret', cree_le: new Date().toISOString() });
    n += 1;
  }
  return n;
}

export function modifierMail(id, { objet, corps, a }) {
  const m = Records.get(ENTITE, id);
  if (!m || m.etat !== 'pret') return { ok: false, error: 'Mail introuvable ou déjà parti.' };
  const champs = {};
  if (objet !== undefined) champs.objet = String(objet).slice(0, 300);
  if (corps !== undefined) champs.corps = String(corps).slice(0, 20000);
  if (a !== undefined) { const e = R.normEmail(a); if (!e) return { ok: false, error: 'Adresse invalide.' }; champs.a = e; }
  return { ok: true, mail: Records.update(ENTITE, id, champs) };
}

export function ecarterMail(id, par = null) {
  const m = Records.get(ENTITE, id);
  if (!m || m.etat !== 'pret') return { ok: false, error: 'Mail introuvable ou déjà parti.' };
  Records.update(ENTITE, id, { etat: 'ecarte', ferme_le: new Date().toISOString(), par });
  return { ok: true };
}

/**
 * Envoie les mails choisis, tels qu'ils ont été relus, depuis la boîte par
 * défaut de qui valide. Un retour passe par le cycle de vie du dossier (il
 * range le dossier) ; un mail de critères note la date dans le suivi et une
 * ligne dans Monday.
 */
export async function envoyerMails(ids, user) {
  const { functions } = await import('../functions.js');
  const { suiviDe, poserSuivi, prospects, prenomDe, retoucherInstantane, oublierCache } = await import('./index.js');
  const M = await import('./monday.js');
  const signature = user?.full_name || String(user?.email || '').split('@')[0];
  const resultats = [];
  for (const id of ids || []) {
    const m = Records.get(ENTITE, id);
    if (!m || m.etat !== 'pret') { resultats.push({ id, ok: false, error: 'déjà parti ou écarté' }); continue; }
    const corps = String(m.corps).replace(/\{signature\}/g, signature);
    const objet = String(m.objet).replace(/\{signature\}/g, signature);
    let r;
    try {
      r = await functions.sendMail({ to: m.a, subject: objet, body: corps, ...(m.genre === 'retour' ? { deal_id: m.deal_id, intention: 'refus' } : {}) }, { user });
    } catch (e) { r = { success: false, error: e?.message || String(e) }; }
    if (!r?.success && !r?.simulated) { resultats.push({ id, ok: false, error: r?.error || 'envoi raté' }); continue; }
    const maintenant = new Date();
    Records.update(ENTITE, id, { etat: r.success ? 'envoye' : 'simule', envoye_le: maintenant.toISOString(), par: user?.email || null, corps, objet });
    if (m.genre === 'criteres' && m.item_id) {
      poserSuivi(m.item_id, { criteres_le: maintenant.toISOString() });
      try {
        const p = (await prospects({ frais: true })).find((x) => x.id === m.item_id);
        if (p && !suiviDe(m.item_id)?.criteres_note) {
          const remarques = R.ajouterRemarque(p.remarques, 'critères envoyés par mail', { maintenant, par: prenomDe(user?.email) });
          await M.ecrireProspect(p.id, { remarques });
          retoucherInstantane(p.id, { remarques });
          poserSuivi(m.item_id, { criteres_note: true });
          oublierCache();
        }
      } catch { /* le mail est parti, la ligne Monday suivra */ }
    }
    resultats.push({ id, ok: true, simule: !r.success });
  }
  return { ok: true, resultats, envoyes: resultats.filter((x) => x.ok && !x.simule).length, simules: resultats.filter((x) => x.simule).length, rates: resultats.filter((x) => !x.ok).length };
}

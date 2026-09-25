// Ce que la prospection dit dans le chat, et seulement ça :
//
//   à 8 h, les jours ouvrés, chaque prospecteur reçoit en privé sa liste
//   d'appels du jour (les dix premiers, la suite sur la page) ;
//   le lundi à 9 h, le point de la semaine passée : fiches, Oui, appels,
//   appels par fiche, et d'où viennent les fiches.
//
// Rien d'autre ne part tout seul. La liste ne va qu'aux personnes cochées
// dans les réglages de la page Prospection : sans réglage, personne.

import { Meta, Records } from '../db.js';
import * as R from './regles.js';
import { semaineDe, recordDeFiches } from '../deal/fiches-stats.js';

const CLE_MATIN = 'prospection.matin.jour';
const CLE_LUNDI = 'prospection.lundi.jour';
const APP_URL = (process.env.APP_URL || '').replace(/\/$/, '');

/** Pure : l'heure et le jour de la semaine à Paris (0 = dimanche). */
export function aParis(d = new Date()) {
  const p = Object.fromEntries(new Intl.DateTimeFormat('en-GB', { timeZone: 'Europe/Paris', hour: '2-digit', hour12: false, weekday: 'short' }).formatToParts(d).map((x) => [x.type, x.value]));
  return { heure: Number(p.hour) % 24, jour: ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].indexOf(p.weekday) };
}

const tel = (a) => a.telephone_affiche || a.telephone || a.email || 'sans numéro';
const qui = (a) => (a.agence && a.agence !== a.nom ? `${a.nom} (${a.agence})` : a.nom);

/** Pure : le message du matin d'une personne. */
export function messageDuMatin(liste, { prenom = null, lien = null, max = 10 } = {}) {
  if (!liste?.length) return null;
  const lignes = liste.slice(0, max).map((a, i) => {
    const derniere = a.remarques ? ` ; dernier mot : « ${String(a.remarques).split(' / ')[0].slice(0, 90)} »` : '';
    return `${i + 1}. ${qui(a)}, ${tel(a)} : ${a.raison}${derniere}`;
  });
  const reste = liste.length > max ? `\n(et ${liste.length - max} autres sur la page${lien ? ` : ${lien}` : ''})` : lien ? `\ntout est sur ${lien}` : '';
  return [
    `${prenom ? `${prenom}, ` : ''}tes appels du jour : ${liste.length}.`,
    ...lignes,
    reste.trim() ? reste.trim() : null,
    'après un appel, dis-moi par exemple « Rosario, à recontacter lundi, deux murs à Cannes » et je le note dans Monday.',
  ].filter(Boolean).join('\n');
}

/**
 * Envoie les listes du matin, une fois par jour ouvré, à partir de 8 h.
 * @returns {Promise<number>} messages envoyés
 */
export async function envoyerLesListes({ assurerPrive, envoyer, memoriser = () => {}, maintenant = new Date() }) {
  const { reglages, appelsDuJour } = await import('./index.js');
  const r = reglages();
  const { heure, jour } = aParis(maintenant);
  const aujourdhui = R.jourDe(maintenant);
  if (!r.matin || !r.prospecteurs.length || jour === 0 || jour === 6 || heure < 8 || heure >= 12) return 0;
  if (Meta.get(CLE_MATIN) === aujourdhui) return 0;
  Meta.set(CLE_MATIN, aujourdhui);
  const { priveDe } = await import('../ak/fiches.js');
  let n = 0;
  for (const email of r.prospecteurs) {
    try {
      const { liste } = await appelsDuJour({ pour: email, maintenant });
      const u = Records.filter('User', { email })[0];
      const texte = messageDuMatin(liste, { prenom: (u?.full_name || '').split(' ')[0] || null, lien: APP_URL ? `${APP_URL}/Prospection` : null });
      if (!texte) continue;
      const espace = await priveDe(email, { assurerPrive });
      if (!espace) continue;
      await envoyer(espace, texte);
      memoriser(espace, texte, 'liste d\'appels du jour, de appels_du_jour');
      n += 1;
    } catch (e) { console.warn(`[prospection] liste du matin de ${email} : ${e?.message || e}`); }
  }
  return n;
}

const pct = (a, b) => (b ? Math.round((a / b) * 100) : 0);
const date = (jour) => jour.split('-').reverse().slice(0, 2).join('/');

/**
 * Pure : le point de la semaine passée.
 * @param {{fiches, appels, sourceDe?: (email) => string|null, maintenant?: Date}} donnees
 */
export function pointDeLaSemaine({ fiches = [], appels = [], sourceDe = () => null, maintenant = new Date() }) {
  const cetteSemaine = semaineDe(maintenant);
  const d = new Date(`${cetteSemaine}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() - 7);
  const passee = d.toISOString().slice(0, 10);
  const dansLaSemaine = (iso) => semaineDe(iso) === passee;
  const f = fiches.filter((x) => dansLaSemaine(x.le));
  const oui = f.filter((x) => ['oui', 'presente', 'abouti'].includes(x.etape)).length;
  const a = appels.filter((x) => dansLaSemaine(x.le) && x.statut !== 'fait').length;
  const record = recordDeFiches(fiches);
  const sources = {};
  for (const x of f) { const s = sourceDe(x.agent_email); if (s) sources[s] = (sources[s] || 0) + 1; }
  const meilleures = Object.entries(sources).sort((x, y) => y[1] - x[1]);
  const lignes = [
    `le point de la semaine du ${date(passee)} : ${f.length} fiche${f.length > 1 ? 's' : ''} reçue${f.length > 1 ? 's' : ''}${record.fiches ? ` (record : ${record.fiches}${record.semaine === passee ? ', battu cette semaine' : `, semaine du ${date(record.semaine)}`})` : ''}, ${oui} Oui${f.length ? ` (${pct(oui, f.length)} %)` : ''}.`,
    a ? `${a} appel${a > 1 ? 's' : ''} de prospection${f.length ? `, soit ${Math.round(a / f.length)} appel${Math.round(a / f.length) > 1 ? 's' : ''} par fiche` : ''}.` : 'aucun appel de prospection compté.',
    meilleures.length ? `les fiches venues de la prospection : ${meilleures.map(([s, n]) => `${n} par ${s}`).join(', ')}.` : null,
  ];
  return { texte: lignes.filter(Boolean).join('\n'), semaine: passee, fiches: f.length, oui, appels: a, sources };
}
/** Le point du lundi, à partir de 9 h : dans le groupe, ou en privé en mode privé seul. */
export async function pointDuLundi({ envoyer, suivis = [], assurerPrive, maintenant = new Date() }) {
  const { heure, jour } = aParis(maintenant);
  const aujourdhui = R.jourDe(maintenant);
  if (jour !== 1 || heure < 9 || heure >= 13 || Meta.get(CLE_LUNDI) === aujourdhui) return null;
  Meta.set(CLE_LUNDI, aujourdhui);
  const { fichesDepuisLaRemiseAZero, appels } = await import('./index.js');
  const parEmail = new Map();
  const { lireProspects } = await import('./monday.js');
  const liste = await lireProspects().catch(() => []);
  const sourcesParId = new Map(Records.list('ProspectSuivi').map((s) => [s.item_id, s.source || null]));
  for (const p of liste) { const e = R.normEmail(p.email); if (e && sourcesParId.get(p.id)) parEmail.set(e, sourcesParId.get(p.id)); }
  const point = pointDeLaSemaine({ fiches: await fichesDepuisLaRemiseAZero(), appels: appels(), sourceDe: (e) => parEmail.get(String(e || '').toLowerCase()) || null, maintenant });
  const { PRIVE_SEUL } = await import('../ak/chat.js');
  const groupe = suivis.find((s) => s.type === 'SPACE');
  if (groupe && !PRIVE_SEUL) { await envoyer(groupe.nom, point.texte); return point; }
  const { destinataires, priveDe } = await import('../ak/fiches.js');
  for (const email of destinataires()) {
    const espace = await priveDe(email, { assurerPrive }).catch(() => null);
    if (espace) await envoyer(espace, point.texte);
  }
  return point;
}

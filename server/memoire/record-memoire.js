// Le record de fiches reçues, compté dans la Mémoire (24 nov. 2026, Jules : « pour le record, tu regardes dans la
// Mémoire, sur une semaine complète, combien on t'a envoyé et qui l'a envoyé ; le record, c'est Maxime la semaine du
// 16 au 22 novembre inclus » ; « fais un système pour que chaque dimanche ça calcule si le record a été battu »).
//
// Une semaine : du lundi au dimanche, à l'heure de Paris, par le jour où la fiche est arrivée (`recu_le`). Une fiche :
// un bien de la Mémoire venu d'un transfert à sourcing@, de la veille des boîtes, de WhatsApp, ou un dossier né d'une
// fiche. Ne comptent pas : les biens évoqués au téléphone, les annonces, les copies d'un dossier supprimé ou abandonné.
// La même adresse (ou, sans adresse, la même ville au même prix et à la même surface) revenue par un autre envoi ne
// compte qu'une fois par semaine ; les lots d'un même envoi comptent chacun.
// Elle revient à qui l'a envoyée : le collègue qui l'a transférée, le titulaire de la boîte où elle est arrivée, le
// responsable du dossier.
//
// Chaque dimanche soir, le serveur calcule la semaine qui finit et la compare au record gardé (Meta) ; battu, le record
// change, et la pop-up du lundi le fête. Pur pour le calcul ; `verifierRecord` lit et écrit la base.

import { Records, Meta } from '../db.js';
import { ENTITE, jourIso, estAnnonce } from './memoire.js';

const CLE = 'record.memoire';
const min = (e) => String(e || '').trim().toLowerCase();
const COMMUNES = () => new Set([(process.env.AK_COMPTE || 'sourcing@klocka.immo').trim().toLowerCase()]);
const ORIGINES_FICHE = new Set(['transfert', 'scraper', 'veille', 'whatsapp', 'dossier', 'drive']);

/** Pure : le lundi (AAAA-MM-JJ) de la semaine d'un jour AAAA-MM-JJ. */
export function lundiDe(jour) {
  const d = new Date(`${String(jour).slice(0, 10)}T12:00:00Z`);
  if (Number.isNaN(d.getTime())) return null;
  d.setUTCDate(d.getUTCDate() - ((d.getUTCDay() + 6) % 7));
  return d.toISOString().slice(0, 10);
}

/** Pure : le jour à Paris d'un instant ISO, ou le jour lui-même s'il est déjà AAAA-MM-JJ. */
export function jourParis(v) {
  const s = String(v || '');
  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return s;
  const d = new Date(s);
  return Number.isNaN(d.getTime()) ? null : new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Paris' }).format(d);
}

/**
 * Pure : qui a envoyé ce bien. `mails` et `deals` : par identifiant, pour retrouver l'expéditeur d'un transfert ou le
 * responsable d'un dossier.
 */
export function quiDuBien(b, { mails = new Map(), deals = new Map(), estEquipe = (e) => /@klocka\.immo$/.test(e) } = {}) {
  const mail = b.mail_recu_id ? mails.get(b.mail_recu_id) : null;
  const deDuMail = mail && estEquipe(min(mail.de_email)) ? min(mail.de_email) : null;
  const boite = min(b.compte || mail?.compte);
  if (b.origine === 'transfert' || b.origine === 'whatsapp') return min(b.par) || deDuMail || null;
  if (b.origine === 'scraper' || b.origine === 'veille') {
    // Lu dans la boîte commune : c'est le collègue qui l'y a transféré ; lu dans une boîte personnelle : son titulaire.
    if (COMMUNES().has(boite)) return deDuMail || min(b.par) || null;
    return boite && estEquipe(boite) ? boite : deDuMail;
  }
  if (b.origine === 'dossier') {
    const d = b.deal_id ? deals.get(b.deal_id) : null;
    return min(d?.source_mail?.transfere_par) || deDuMail || min(d?.responsable_email) || (estEquipe(min(d?.created_by)) ? min(d?.created_by) : null) || min(b.par) || null;
  }
  return min(b.par) || null;
}

/** Pure : la signature d'un bien pour ne pas le compter deux fois dans la semaine. */
const signature = (b) => b.cle_adresse || (b.ville || b.prix || b.surface_m2 ? `${min(b.ville)}|${b.prix || ''}|${b.surface_m2 || ''}|${b.loyer_annuel || ''}` : `id:${b.id}`);

/**
 * Pure : les fiches de la Mémoire, une ligne par fiche comptée : `{ id, jour, semaine, qui }`, de la plus ancienne à la
 * plus récente. La même règle pour le record, la carte « Fiches reçues » et « Mes statistiques » (24 nov. 2026, Jules).
 */
export function lignesFiches(biens = [], ctx = {}) {
  const lignes = [];
  const vus = new Map();
  const tries = [...biens].sort((a, b) => String(a.recu_le || a.created_date || '').localeCompare(String(b.recu_le || b.created_date || '')));
  for (const b of tries) {
    if (b.supprime_le || estAnnonce(b) || !ORIGINES_FICHE.has(b.origine)) continue;
    const jour = jourParis(jourIso(b.recu_le) || b.created_date);
    const semaine = jour ? lundiDe(jour) : null;
    if (!semaine) continue;
    // Le même bien revenu par un autre envoi (le transfert, puis son dossier ; un renvoi) ne compte qu'une fois ; deux
    // lots du même envoi à la même adresse (sept commerces d'un immeuble) restent deux fiches.
    const sig = `${semaine}|${signature(b)}`;
    const envoi = b.mail_recu_id || b.envoi_id || (b.deal_id ? `deal:${b.deal_id}` : `id:${b.id}`);
    if (vus.has(sig) && vus.get(sig) !== envoi) continue;
    if (!vus.has(sig)) vus.set(sig, envoi);
    lignes.push({ id: b.id, jour, semaine, qui: quiDuBien(b, ctx) || 'personne' });
  }
  return lignes;
}

/**
 * Pure : les fiches de chaque semaine, par personne. `[{ semaine, par: { email: n }, total }]`, de la plus ancienne à la
 * plus récente.
 */
export function fichesParSemaine(biens = [], ctx = {}) {
  const semaines = new Map();
  for (const l of lignesFiches(biens, ctx)) {
    if (!semaines.has(l.semaine)) semaines.set(l.semaine, { semaine: l.semaine, par: {}, total: 0 });
    const s = semaines.get(l.semaine);
    s.par[l.qui] = (s.par[l.qui] || 0) + 1;
    s.total += 1;
  }
  return [...semaines.values()].sort((a, b) => a.semaine.localeCompare(b.semaine));
}

/**
 * Pure : la carte « Fiches reçues » (24 nov. 2026, Jules : « à partir du lundi, ça compte sur la Mémoire combien on en
 * reçoit, toute l'équipe ») : la semaine en cours, du lundi à aujourd'hui ; la semaine d'avant au même jour, pour
 * l'écart ; et les `n` dernières semaines pour les petits bâtons.
 */
export function carteFichesRecues(lignes = [], { aujourdhui, n = 8 } = {}) {
  const lundi = lundiDe(aujourdhui);
  const decaler = (j, d) => new Date(Date.parse(`${j}T12:00:00Z`) + d * 86400000).toISOString().slice(0, 10);
  const fiches = lignes.filter((l) => l.jour >= lundi && l.jour <= aujourdhui).length;
  const avant = lignes.filter((l) => l.jour >= decaler(lundi, -7) && l.jour <= decaler(aujourdhui, -7)).length;
  // Les bâtons partent de la semaine du 16 novembre 2026 (24 nov. 2026, Jules).
  const semaines = Array.from({ length: n }, (_, i) => decaler(lundi, -7 * (n - 1 - i))).filter((s) => s >= '2026-11-16').map((s) => ({ semaine: s, fiches: lignes.filter((l) => l.semaine === s).length }));
  return { depuis: lundi, fiches, avant, semaines };
}

/** Pure : le meilleur d'une semaine (personne exclue), ou null. */
export function meilleurDe(s) {
  const [email, fiches] = Object.entries(s?.par || {}).filter(([e]) => e !== 'personne').sort((a, b) => b[1] - a[1])[0] || [];
  return email ? { email, fiches, semaine: s.semaine } : null;
}

/** Pure : le record sur des semaines finies : le plus de fiches, à égalité le premier à l'avoir atteint. */
export function recordDes(semaines = []) {
  let r = null;
  for (const s of semaines) {
    const m = meilleurDe(s);
    if (m && (!r || m.fiches > r.fiches)) r = m;
  }
  return r;
}

const contexte = () => {
  const mails = new Map(Records.list('MailRecu').map((m) => [m.id, m]));
  const deals = new Map(Records.list('Deal').map((d) => [d.deal_id, d]));
  return { mails, deals };
};

/** Les semaines comptées dans la Mémoire, avec leur détail par personne. */
export const semainesDeLaMemoire = () => fichesParSemaine(Records.list(ENTITE), contexte());
/** Les fiches de la Mémoire, une ligne par fiche comptée (la carte « Fiches reçues », « Mes statistiques »). */
export const lignesDeLaMemoire = () => lignesFiches(Records.list(ENTITE), contexte());

/** Le record gardé ; sans lui, il se calcule sur les semaines finies (avant le lundi de cette semaine, à Paris). */
export function recordGarde({ maintenant = new Date() } = {}) {
  try { const r = JSON.parse(Meta.get(CLE) || 'null'); if (r?.email) return r; } catch { /* recalculé */ }
  const ceLundi = lundiDe(jourParis(maintenant.toISOString()));
  return recordDes(semainesDeLaMemoire().filter((s) => s.semaine < ceLundi));
}

/**
 * Le dimanche soir (ou au démarrage, pour une semaine finie pas encore vérifiée) : la semaine se compte, et le record
 * change s'il est battu. Une seule vérification par semaine.
 * @returns {{ semaine: string, meilleur: object|null, battu: boolean, record: object|null } | null}
 */
export function verifierRecord({ maintenant = new Date(), journal = console.log } = {}) {
  const jour = jourParis(maintenant.toISOString());
  const heure = Number(new Intl.DateTimeFormat('en-GB', { timeZone: 'Europe/Paris', hour: '2-digit', hourCycle: 'h23' }).format(maintenant));
  const dimancheSoir = new Date(`${jour}T12:00:00Z`).getUTCDay() === 0 && heure >= 22;
  // La semaine à vérifier : celle qui finit ce dimanche soir, sinon la dernière semaine finie.
  const ceLundi = lundiDe(jour);
  const semaine = dimancheSoir ? ceLundi : new Date(Date.parse(`${ceLundi}T12:00:00Z`) - 7 * 86400000).toISOString().slice(0, 10);
  const deja = Meta.get(`${CLE}.verifie`);
  if (deja && deja >= semaine) return null;
  const semaines = semainesDeLaMemoire();
  const avant = (() => { try { return JSON.parse(Meta.get(CLE) || 'null'); } catch { return null; } })() || recordDes(semaines.filter((s) => s.semaine < semaine));
  const meilleur = meilleurDe(semaines.find((s) => s.semaine === semaine));
  const battu = !!meilleur && (!avant || meilleur.fiches > avant.fiches);
  const record = battu ? { ...meilleur, battu_le: maintenant.toISOString() } : avant;
  if (record) Meta.set(CLE, JSON.stringify(record));
  Meta.set(`${CLE}.verifie`, semaine);
  journal(`[record] semaine du ${semaine} : ${meilleur ? `${meilleur.email} ${meilleur.fiches} fiche(s)` : 'aucune fiche'} ; ${battu ? 'record battu' : `record tenu (${record?.email || '?'} ${record?.fiches ?? 0}, semaine du ${record?.semaine || '?'})`}`);
  return { semaine, meilleur, battu, record };
}

// La restitution de l'avis de valeur (27 oct. 2026, Jules) : entre l'avis et le mandat, le propriétaire réagit à
// l'estimation, et c'est lui qui décide de la suite.
//
// 1. L'avis fini, Haka propose le mail au propriétaire ; le mandataire le relit et l'envoie de sa messagerie, avec
//    l'avis en PDF (Klocka n'envoie rien pour lui). L'affaire passe en Estimation envoyée, sans relance programmée.
// 2. Ensuite on reste sur l'Estimation, et le chat suit la relation (27 oct. 2026, Jules) : le mandataire raconte
//    (« je l'ai appelé, rendez-vous lundi », « la présentation s'est bien passée, il réfléchit ») ; Haka note
//    l'échange et pose la relance qui convient (noter_echange). Une réponse qui change le statut (accord, pause,
//    perdu) : Haka propose le cas, le mandataire confirme d'un tap ; le prix d'accord va sur la fiche et le bien
//    passe au Mandat.
//
// Les règles : un statut, une prochaine action, une date (aucune affaire sans relance) ; En pause n'est pas Perdu (la
// fiche reste dans Biens) ; Perdu garde son motif ; rien ne part seul, chaque relance est proposée.

import fs from 'fs';
import path from 'path';
import { Records, CHEMIN_UPLOADS } from './db.js';
import { lirePrix, noterPrixAccord, objetsDuBien } from './bien-etapes.js';

const JOUR = 86400000;
const PARIS = 'Europe/Paris';
const maintenant = () => new Date().toISOString();
const emailDe = (u) => String(u?.email || '').toLowerCase();
const plus = (d, j) => new Date(new Date(d).getTime() + j * JOUR).toISOString();
const jourFr = (d) => new Date(d).toLocaleDateString('fr-FR', { day: 'numeric', month: 'long', timeZone: PARIS });
const eur = (n) => `${Math.round(n).toLocaleString('fr-FR')} €`;

/** Les cas de la restitution : ce que dit le propriétaire, le statut qui en sort. */
export const CAS_RESTITUTION = {
  accord_conseille: { statut: 'prix_accord', mot: "D'accord sur le prix conseillé" },
  accord_fourchette: { statut: 'prix_accord', mot: "D'accord à un autre prix, dans la fourchette" },
  accord_au_dessus: { statut: 'prix_accord', mot: 'Veut un prix au-dessus de la fourchette' },
  reflechit: { statut: 'envoyee', mot: 'Hésite, veut réfléchir' },
  sans_reponse: { statut: 'envoyee', mot: 'Ne répond pas' },
  consulte: { statut: 'pause', mot: "Veut d'abord en parler à sa famille ou à son comptable" },
  attend: { statut: 'pause', mot: 'Attend un document ou un événement' },
  trop_bas: { statut: 'pause', mot: 'Trouve le prix trop bas et refuse' },
  concurrent: { statut: 'perdu', motif: 'concurrent', mot: 'A signé avec un autre agent' },
  plus_vendeur: { statut: 'perdu', motif: 'plus_vendeur', mot: 'Ne veut plus vendre' },
  injoignable: { statut: 'perdu', motif: 'injoignable', mot: 'Injoignable' },
  bail_change: { statut: 'envoyee', mot: 'Le bail reçu change la valeur' },
};
/** Les motifs d'une affaire perdue : ils diront plus tard pourquoi les mandats ne se signent pas. */
export const MOTIFS_PERDU = { prix: 'prix', concurrent: 'concurrent', plus_vendeur: 'plus vendeur', injoignable: 'injoignable' };

// Plus de séquence fixe après l'envoi (J+2 appel, J+5 mail, J+10 rappel, puis En pause : retirée le 27 oct. 2026,
// Jules) : la relance suit ce que raconte le mandataire, posée par Haka.

const CANAUX = new Set(['appel', 'mail', 'rdv', 'tache']);
/** Pure : une date dite par Haka (AAAA-MM-JJ, avec l'heure si elle est donnée), en ISO ; null si illisible. */
export function dateDeRelance(d) {
  const t = String(d || '').trim();
  if (/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}/.test(t)) { const x = new Date(/[zZ]|[+-]\d{2}:?\d{2}$/.test(t) ? t : `${t.slice(0, 16)}:00+01:00`); return Number.isNaN(x.getTime()) ? null : x.toISOString(); }
  if (/^\d{4}-\d{2}-\d{2}$/.test(t)) return new Date(`${t}T09:00:00+01:00`).toISOString();
  return null;
}
/** Pure : la relance choisie par Haka ({ relance_le, relance_quoi, canal }), ou null. */
export function relanceDite(o = {}) {
  const le = dateDeRelance(o.relance_le);
  const quoi = String(o.relance_quoi || '').trim().slice(0, 160);
  if (!le || !quoi) return null;
  return { le, canal: CANAUX.has(o.canal) ? o.canal : 'appel', quoi };
}

/** Pure : combien de clients compatibles suivent à ce prix (leur budget le couvre) ; null si on ne connaît pas leurs budgets. */
export function compatiblesAuPrix(liste, prix) {
  const budgets = (liste || []).map((c) => lirePrix(String(c?.budget ?? '').replace(/€/g, ''))).filter(Boolean);
  if (!budgets.length || !prix) return null;
  return budgets.filter((b) => b >= prix).length;
}

/**
 * Pure : ce que fait l'outil pour un cas (le tableau du 27 oct. 2026). Rend le statut, le motif, le prix retenu,
 * l'alerte, et toujours la prochaine action datée.
 * @param {string} cas une clé de CAS_RESTITUTION
 * @param {{ aujourdhui?: Date, envoye_le?: string, prix?: any, date?: string, motif?: string, chiffres?: {valeur, bas, haut}, compatibles?: object[] }} o
 */
export function planDeRestitution(cas, o = {}) {
  const auj = o.aujourdhui ? new Date(o.aujourdhui) : new Date();
  const c = o.chiffres || {};
  let cle = CAS_RESTITUTION[cas] ? cas : null;
  if (!cle) return { ok: false, error: 'Cas inconnu.' };
  let prix = lirePrix(o.prix);
  // Un accord se range selon son prix : sans prix, celui conseillé ; au-dessus du haut de la fourchette, l'alerte.
  if (CAS_RESTITUTION[cle].statut === 'prix_accord') {
    if (!prix && cle === 'accord_conseille') prix = c.valeur ? Math.round(c.valeur) : null;
    if (!prix) return { ok: false, error: "Quel prix ? Dites le chiffre convenu avec le propriétaire." };
    if (c.haut && prix > c.haut) cle = 'accord_au_dessus';
    else if (cle === 'accord_au_dessus') cle = 'accord_fourchette';
  }
  const def = CAS_RESTITUTION[cle];
  const date = /^\d{4}-\d{2}-\d{2}/.test(String(o.date || '')) ? new Date(`${String(o.date).slice(0, 10)}T09:00:00+01:00`).toISOString() : null;
  const dans = (j) => plus(auj, j);
  const plan = { ok: true, cas: cle, mot: def.mot, statut: def.statut, motif: def.motif || null, prix: null, alerte: null, revision_jours: null, a_revoir: false, relance: null };
  const dite = relanceDite(o);
  switch (cle) {
    case 'accord_conseille':
    case 'accord_fourchette':
      plan.prix = prix;
      plan.relance = { le: dans(1), canal: 'tache', quoi: 'Préparer le mandat et réunir les pièces' };
      break;
    case 'accord_au_dessus': {
      plan.prix = prix;
      const n = compatiblesAuPrix(o.compatibles, prix);
      plan.alerte = `${eur(prix)}, au-dessus de la fourchette (haut ${eur(c.haut)}).${n == null ? '' : ` À ce prix, ${n} client${n > 1 ? 's' : ''} compatible${n > 1 ? 's' : ''}.`} Une révision du prix est prévue au mandat, à 30 jours.`;
      plan.revision_jours = 30;
      plan.relance = { le: dans(1), canal: 'tache', quoi: 'Préparer le mandat, avec une révision du prix à 30 jours' };
      break;
    }
    case 'reflechit':
    case 'sans_reponse':
      // La date qu'il donne, sinon une semaine ; Haka peut en dire une autre (relance_le).
      plan.relance = { le: date || dans(7), canal: 'appel', quoi: cle === 'reflechit' ? 'Reprendre des nouvelles de sa réflexion' : 'Le rappeler' };
      break;
    case 'consulte':
      plan.relance = { le: date || dans(14), canal: 'appel', quoi: 'Relancer et proposer un rendez-vous à plusieurs' };
      break;
    case 'attend':
      plan.relance = { le: date || dans(60), canal: 'appel', quoi: "Relancer à la date de l'événement" };
      break;
    case 'trop_bas':
      plan.relance = { le: dans(90), canal: 'appel', quoi: 'Relancer avec les nouvelles ventes du secteur' };
      break;
    case 'concurrent':
      plan.relance = { le: date || dans(90), canal: 'appel', quoi: 'Relancer à la fin probable de son mandat' };
      break;
    case 'plus_vendeur':
      plan.relance = { le: date || dans(180), canal: 'appel', quoi: 'Reprendre des nouvelles' };
      break;
    case 'injoignable':
      plan.relance = { le: dans(90), canal: 'appel', quoi: 'Retenter de le joindre' };
      break;
    case 'bail_change':
      plan.a_revoir = true;
      plan.relance = { le: dans(2), canal: 'tache', quoi: "Renvoyer un avis corrigé avec le bail" };
      break;
    default:
      break;
  }
  if (plan.statut === 'perdu' && MOTIFS_PERDU[o.motif]) plan.motif = o.motif;
  // La relance dite par Haka, adaptée à ce qu'a raconté le mandataire, passe avant celle du cas.
  if (dite) plan.relance = dite;
  return plan;
}

function sienne(id, user) {
  const p = id ? Records.get('ProprietaireMandataire', id) : null;
  return p && p.mandataire_email === emailDe(user) ? p : null;
}

const MOTS_STATUT = { prix_accord: "Prix d'accord", envoyee: 'Estimation envoyée', pause: 'En pause', perdu: 'Perdu' };

/** Pure : la carte « à confirmer » que Haka pose dans le chat pour un cas de restitution. */
export function carteRestitution(p, plan) {
  const titre = [p?.commerce || p?.nom, p?.ville].filter(Boolean).join(' · ') || 'Ce bien';
  const statut = `${MOTS_STATUT[plan.statut]}${plan.motif ? ` (${MOTIFS_PERDU[plan.motif] || plan.motif})` : ''}${plan.a_revoir ? ', à revoir' : ''}`;
  return {
    type: 'confirmer_restitution', id: `restitution-${p?.id}-${plan.cas}`, proprietaire_id: p?.id, cas: plan.cas, prix: plan.prix, date: plan.relance?.le?.slice(0, 10) || null, motif: plan.motif,
    relance_le: plan.relance?.le || null, relance_quoi: plan.relance?.quoi || null, canal: plan.relance?.canal || null, vers_mandat: plan.statut === 'prix_accord',
    titre, mot: statut, pour: [plan.prix ? `${statut} · ${eur(plan.prix)}` : statut, plan.relance ? `${plan.relance.quoi}, le ${jourFr(plan.relance.le)}` : null].filter(Boolean).join(' · '), alerte: plan.alerte,
  };
}

/** Ce que Haka propose après la dictée : le plan, sans rien écrire (le mandataire confirme d'un tap). */
export function proposerRestitution(id, { cas, prix = null, date = null, motif = null, relance_le = null, relance_quoi = null, canal = null } = {}, user) {
  const p = sienne(id, user);
  if (!p) return { ok: false, error: 'Fiche introuvable.' };
  const { estimation: e } = objetsDuBien(p);
  if (!e) return { ok: false, error: "Pas encore d'avis de valeur sur ce bien." };
  const plan = planDeRestitution(cas, { prix, date, motif, relance_le, relance_quoi, canal, envoye_le: e.envoye_le, chiffres: e.avis?.chiffres, compatibles: p.preparation?.clients_compatibles?.liste });
  if (!plan.ok) return plan;
  return { ok: true, a_confirmer: true, plan, carte: carteRestitution(p, plan), note: "Rien n'est écrit : le mandataire confirme d'un tap. Dis en une ligne le statut et la prochaine action datée, et l'alerte s'il y en a une." };
}

/** Le cas confirmé : le statut, le prix ou le motif, la relance programmée et la ligne d'historique. */
export function appliquerRestitution(id, { cas, prix = null, date = null, motif = null, note = null, relance_le = null, relance_quoi = null, canal = null } = {}, user) {
  const p = sienne(id, user);
  if (!p) return { ok: false, error: 'Fiche introuvable.' };
  if (!['rdv_pris', 'mandat_signe'].includes(p.statut)) return { ok: false, error: "Cette fiche n'est pas encore dans Biens." };
  const { estimation: e } = objetsDuBien(p);
  if (!e) return { ok: false, error: "Pas encore d'avis de valeur sur ce bien." };
  const plan = planDeRestitution(cas, { prix, date, motif, relance_le, relance_quoi, canal, envoye_le: e.envoye_le, chiffres: e.avis?.chiffres, compatibles: p.preparation?.clients_compatibles?.liste });
  if (!plan.ok) return plan;
  if (plan.statut === 'prix_accord') {
    const r = noterPrixAccord(p.id, plan.prix, user);
    if (!r.ok) return r;
  }
  const q = Records.get('ProprietaireMandataire', p.id);
  const le = maintenant();
  const biens = { ...(q.biens || {}) };
  biens.restitution = { cas: plan.cas, statut: plan.statut, motif: plan.motif, prix: plan.prix, alerte: plan.alerte, a_revoir: plan.a_revoir, note: note ? String(note).slice(0, 400) : null, le };
  biens.prochaine = plan.relance;
  if (plan.revision_jours) biens.revision_prix_jours = plan.revision_jours;
  biens.pause = plan.statut === 'pause' ? { le, relance_le: plan.relance.le, argument: plan.relance.quoi, cas: plan.cas } : null;
  biens.perdu = plan.statut === 'perdu' ? { motif: plan.motif, le, relance_le: plan.relance.le } : null;
  if (plan.statut !== 'prix_accord' && plan.statut !== 'perdu' && biens.prix_accord && plan.cas !== 'bail_change') biens.prix_accord = null;
  const nom = p.commerce || p.nom || 'ce propriétaire';
  remplacerRelances(p.id, le);
  const rappel = Records.create('Rappel', {
    espace: 'mandataire', genre: 'relance', proprietaire_id: p.id, nom, quoi: `${plan.relance.quoi} (${nom})`, canal: plan.relance.canal,
    note: plan.alerte || null, telephone: p.telephone || null, echeance: plan.relance.le, cree_le: le, cree_par: user?.email || null, fait_le: null,
  });
  const texte = `${plan.mot} : ${MOTS_STATUT[plan.statut]}${plan.motif ? ` (${MOTIFS_PERDU[plan.motif] || plan.motif})` : ''}${plan.prix ? ` à ${eur(plan.prix)}` : ''}. Prochaine action : ${plan.relance.quoi}, le ${jourFr(plan.relance.le)}.`;
  const maj = Records.update('ProprietaireMandataire', p.id, {
    biens, prochaine_action: plan.relance.quoi, prochaine_action_le: plan.relance.le,
    historique: [...(q.historique || []), { le, type: 'restitution', texte }],
  });
  return { ok: true, plan, rappel_id: rappel.id, proprietaire: maj };
}

// --- L'envoi de l'avis --------------------------------------------------------

function estimationDe(id, user) {
  const e = id ? Records.get('EstimationMandataire', id) : null;
  return e && (e.mandataire_email === emailDe(user) || user?.role === 'admin') ? e : null;
}
const PRETE = new Set(['prete', 'en_validation', 'valide', 'envoye']);

/** Pure : le mail qui part avec l'avis, quand Haka n'en a pas écrit (vouvoiement, la valeur, l'appel annoncé). */
export function mailParDefaut({ avis = {}, proprietaire = null, signataire = {} } = {}) {
  const c = avis.chiffres || {};
  const qui = proprietaire?.nom || avis.demandeur || null;
  const bien = [avis.type_libelle ? avis.type_libelle.toLowerCase() : 'votre bien', avis.bien?.rue].filter(Boolean).join(', ');
  const lignes = [
    qui ? `Bonjour ${qui},` : 'Bonjour,',
    '',
    `Suite à notre visite, vous trouverez ci-joint l'avis de valeur de ${bien.startsWith('votre') ? bien : `vos ${bien}`}.`,
    c.valeur ? `Nous l'estimons à ${eur(c.valeur)} net vendeur${c.bas && c.haut ? `, dans une fourchette de ${eur(c.bas)} à ${eur(c.haut)}` : ''}.` : null,
    '',
    "Je vous appelle très prochainement pour vous le présenter et répondre à vos questions.",
    '',
    'Bien cordialement,',
    [signataire.nom, signataire.telephone].filter(Boolean).join('\n') || null,
  ].filter((l) => l !== null);
  return { objet: `Avis de valeur${avis.bien?.rue ? `, ${avis.bien.rue}` : ''}`, texte: lignes.join('\n') };
}

/** Le mail préparé (par Haka, ou par défaut) : gardé sur l'estimation, à relire avant de partir. */
export async function preparerEnvoi(id, { objet = null, texte = null } = {}, user) {
  const e = estimationDe(id, user);
  if (!e) return { ok: false, error: 'Estimation introuvable.' };
  if (!e.avis || !PRETE.has(e.statut)) return { ok: false, error: "L'avis n'est pas encore rédigé." };
  const p = e.proprietaire_id ? Records.get('ProprietaireMandataire', e.proprietaire_id) : null;
  const { signataire } = await import('./mandataire-avis.js');
  const defaut = mailParDefaut({ avis: e.avis, proprietaire: p, signataire: signataire({ email: e.mandataire_email }) });
  const envoi = {
    ...(e.envoi || {}),
    a: e.envoi?.a || p?.email || null,
    // Rouvert sans texte : le mail déjà préparé (celui de Haka) reste, sinon celui par défaut.
    objet: String(objet || '').trim().slice(0, 200) || e.envoi?.objet || defaut.objet,
    texte: String(texte || '').trim().slice(0, 4000) || e.envoi?.texte || defaut.texte,
    prepare_le: maintenant(), par_haka: !!texte || !!e.envoi?.par_haka,
  };
  return { ok: true, envoi, estimation: Records.update('EstimationMandataire', e.id, { envoi }) };
}

/** Le mandataire dit que le mail est parti : Estimation envoyée. Aucune relance programmée : la suite se raconte au chat. */
export function marquerEnvoye(id, { a = null, objet = null, texte = null } = {}, user) {
  const e = estimationDe(id, user);
  if (!e) return { ok: false, error: 'Estimation introuvable.' };
  if (!e.avis || !PRETE.has(e.statut)) return { ok: false, error: "L'avis n'est pas encore rédigé." };
  const le = maintenant();
  const envoi = { ...(e.envoi || {}), ...(a ? { a: String(a).slice(0, 200) } : {}), ...(objet ? { objet: String(objet).slice(0, 200) } : {}), ...(texte ? { texte: String(texte).slice(0, 4000) } : {}), envoye_le: le };
  const maj = Records.update('EstimationMandataire', e.id, { statut: 'envoye', envoye_le: e.envoye_le || le, envoi, historique: [...(e.historique || []), { le, par: user?.email || null, action: 'envoyée au propriétaire' }] });
  const p = e.proprietaire_id ? Records.get('ProprietaireMandataire', e.proprietaire_id) : null;
  if (p) {
    const biens = { ...(p.biens || {}), restitution: { cas: null, statut: 'envoyee', le }, prochaine: null, pause: null, perdu: null };
    Records.update('ProprietaireMandataire', p.id, { biens, historique: [...(p.historique || []), { le, type: 'etape', texte: 'Avis de valeur envoyé au propriétaire.' }] });
  }
  return { ok: true, estimation: maj };
}

// --- Le fil de la relation, après l'envoi -------------------------------------------

/** Les relances encore ouvertes de ce bien sont remplacées par la nouvelle : une seule prochaine action. Gardées, closes. */
function remplacerRelances(pid, le) {
  for (const r of Records.list('Rappel').filter((x) => x.proprietaire_id === pid && x.genre === 'relance' && !x.fait_le)) {
    Records.update('Rappel', r.id, { fait_le: le, remplacee: true });
  }
}

/**
 * Haka note un échange avec le propriétaire (un appel, un rendez-vous fixé, la présentation faite) et, s'il le faut,
 * la relance qui suit : écrit tout de suite, c'est le récit du mandataire. Le statut ne change pas ici.
 */
export function noterEchange(id, { resume, relance_le = null, relance_quoi = null, canal = null } = {}, user) {
  const p = sienne(id, user);
  if (!p) return { ok: false, error: 'Fiche introuvable.' };
  const texte = String(resume || '').trim().slice(0, 600);
  if (!texte) return { ok: false, error: "Rien à noter : dis en une phrase ce qui s'est passé." };
  const le = maintenant();
  const relance = relanceDite({ relance_le, relance_quoi, canal });
  if ((relance_le || relance_quoi) && !relance) return { ok: false, error: 'Relance illisible : relance_le en AAAA-MM-JJ (ou AAAA-MM-JJTHH:MM) et relance_quoi.' };
  let rappel_id = null;
  const maj = { historique: [...(p.historique || []), { le, type: 'echange', texte }] };
  if (relance) {
    const nom = p.commerce || p.nom || 'ce propriétaire';
    remplacerRelances(p.id, le);
    rappel_id = Records.create('Rappel', { espace: 'mandataire', genre: 'relance', proprietaire_id: p.id, nom, quoi: `${relance.quoi} (${nom})`, canal: relance.canal, telephone: p.telephone || null, echeance: relance.le, cree_le: le, cree_par: user?.email || null, fait_le: null }).id;
    maj.biens = { ...(p.biens || {}), prochaine: relance };
    maj.prochaine_action = relance.quoi;
    maj.prochaine_action_le = relance.le;
  }
  Records.update('ProprietaireMandataire', p.id, maj);
  return { ok: true, note: texte, relance: relance ? `${relance.quoi}, le ${jourFr(relance.le)}` : null, rappel_id };
}

/** Pure : le fil de la relation que Haka relit avant de répondre (les échanges et la prochaine action). */
export function filDeLaRelation(p, n = 12) {
  if (!p) return '';
  const lignes = (p.historique || []).filter((h) => ['echange', 'restitution', 'etape', 'visite'].includes(h.type)).slice(-n)
    .map((h) => `- ${new Date(h.le).toLocaleDateString('fr-FR', { day: 'numeric', month: 'short', timeZone: PARIS })} : ${h.texte}`);
  const prochaine = p.biens?.prochaine;
  return [
    lignes.length ? `Le fil avec le propriétaire :\n${lignes.join('\n')}` : 'Le fil avec le propriétaire : rien de noté depuis l\'envoi.',
    prochaine?.le ? `Prochaine action : ${prochaine.quoi}, le ${jourFr(prochaine.le)}.` : 'Aucune relance posée.',
    p.biens?.prix_accord ? `Prix d'accord : ${eur(p.biens.prix_accord)}.` : null,
  ].filter(Boolean).join('\n');
}

// --- L'avis en PDF --------------------------------------------------------------

/** Ce que la page d'impression de l'avis lit, avec un jeton du serveur (deux minutes). */
export async function avisParJeton(jeton) {
  const { cibleDuJeton } = await import('./presentation-pdf.js');
  const cible = cibleDuJeton(jeton);
  if (!cible || !String(cible).startsWith('avis:')) return null;
  const e = Records.get('EstimationMandataire', String(cible).slice(5));
  return e?.avis ? { id: e.id, avis: e.avis } : null;
}

/** Pure : le nom du fichier joint, lisible par le propriétaire. */
export const nomDuPdf = (e) => `Avis de valeur${e?.avis?.bien?.rue ? ` - ${String(e.avis.bien.rue).replace(/[\\/:*?"<>|]/g, ' ')}` : ''}.pdf`;

/**
 * L'avis en PDF, tel que l'éditeur le montre : un navigateur sans écran ouvre la page d'impression (les mêmes pages
 * que l'éditeur, en lecture) et l'imprime en A4. Refait à chaque demande : l'avis a pu être retouché.
 */
export async function exporterAvisPdf(id, user, { base }) {
  const e = estimationDe(id, user);
  if (!e?.avis) return { ok: false, error: "L'avis n'est pas encore rédigé." };
  const { jetonImpression } = await import('./presentation-pdf.js');
  const { lancerNavigateur } = await import('./marche/navigateur.js');
  const nav = await lancerNavigateur("L'avis de valeur en PDF");
  const contexte = await nav.newContext({ viewport: { width: 900, height: 1200 }, locale: 'fr-FR' });
  const dossier = path.join(CHEMIN_UPLOADS, 'avis');
  const fichier = path.join(dossier, `avis-${String(e.id).replace(/[^a-zA-Z0-9_-]/g, '_')}.pdf`);
  try {
    const page = await contexte.newPage();
    const jeton = jetonImpression(`avis:${e.id}`);
    // Les photos et la signature déposées demandent une session : le jeton en tient lieu, le temps de l'impression.
    await page.setExtraHTTPHeaders({ 'X-Klocka-Impression': jeton });
    await page.goto(`${base}/ImpressionAvis?jeton=${jeton}`, { waitUntil: 'networkidle', timeout: 60000 });
    await page.waitForFunction('window.__impressionPrete === true || !!window.__impressionErreur', null, { timeout: 60000 });
    const erreur = await page.evaluate('window.__impressionErreur || null');
    if (erreur) return { ok: false, error: `La page d'impression n'a pas pu s'ouvrir : ${erreur}` };
    await page.emulateMedia({ media: 'print' });
    const pdf = await page.pdf({ format: 'A4', printBackground: true, preferCSSPageSize: true, margin: { top: 0, right: 0, bottom: 0, left: 0 } });
    fs.mkdirSync(dossier, { recursive: true });
    fs.writeFileSync(fichier, pdf);
  } finally {
    await contexte.close().catch(() => {});
  }
  return { ok: true, fichier, nom: nomDuPdf(e) };
}

// --- Les outils de Haka -----------------------------------------------------------

/** Haka note la restitution : ce que le propriétaire a répondu à l'avis. Rien n'est écrit avant le tap du mandataire. */
export const OUTIL_RESTITUTION = {
  name: 'noter_restitution',
  description:
    "Après l'envoi de l'avis de valeur, ce que le propriétaire en dit (la restitution, dictée par le mandataire). Choisis le cas : accord_conseille (d'accord sur le prix conseillé), accord_fourchette (d'accord à un autre prix, donne prix), accord_au_dessus (veut un prix au-dessus de la fourchette, donne prix), reflechit (hésite, veut réfléchir), sans_reponse (ne répond pas), consulte (veut d'abord parler à sa famille, son comptable : date s'il en donne une), attend (un document ou un événement, fin de bail, succession : sa date), trop_bas (trouve le prix trop bas et refuse), concurrent (a signé avec un autre agent), plus_vendeur (ne veut plus vendre), injoignable, bail_change (le bail reçu change la valeur). Rien n'est écrit : l'écran fait confirmer d'un tap. Ensuite, une ligne : le statut et la prochaine action datée, et l'alerte s'il y en a une.",
  input_schema: {
    type: 'object',
    properties: {
      cas: { type: 'string', enum: Object.keys(CAS_RESTITUTION) },
      qui: { type: 'string', description: 'Le commerce ou le propriétaire, comme le mandataire le dit' },
      proprietaire_id: { type: 'string', description: "L'id de la fiche, si on la connaît" },
      prix: { type: 'string', description: 'Le prix convenu ou demandé (« 460 k€ »)' },
      date: { type: 'string', description: 'AAAA-MM-JJ : la date donnée par le propriétaire (événement, rendez-vous de famille)' },
      motif: { type: 'string', enum: Object.keys(MOTIFS_PERDU), description: 'Pour une affaire perdue, si le mandataire le précise' },
      relance_le: { type: 'string', description: "AAAA-MM-JJ (ou AAAA-MM-JJTHH:MM) : la relance qui convient à ce qu'il a raconté, si elle diffère de celle du cas" },
      relance_quoi: { type: 'string', description: 'Ce que fera le mandataire à cette date, en quelques mots' },
      canal: { type: 'string', enum: ['appel', 'mail', 'rdv', 'tache'] },
    },
    required: ['cas'],
  },
};

/** Haka note un échange avec le propriétaire après l'envoi, et la relance qui suit. */
export const OUTIL_ECHANGE = {
  name: 'noter_echange',
  description:
    "Après l'envoi de l'avis, le mandataire raconte la relation avec le propriétaire : un appel, un rendez-vous fixé, la présentation faite, ce qu'il a dit. Note l'échange en une ou deux phrases (resume) et pose la relance qui convient à la situation : un rendez-vous fixé lundi à 10 h → relance_le ce lundi-là, canal rdv ; « il revient vers moi » → une relance raisonnable (quelques jours à une semaine) pour reprendre des nouvelles, sauf s'il a donné une date. Écrit tout de suite (c'est son récit), une seule prochaine action : la nouvelle remplace l'ancienne. Ne change pas le statut : un accord sur un prix, une pause ou une affaire perdue, c'est noter_restitution.",
  input_schema: {
    type: 'object',
    properties: {
      resume: { type: 'string', description: "Ce qui s'est passé, en une ou deux phrases" },
      relance_le: { type: 'string', description: 'AAAA-MM-JJ, ou AAAA-MM-JJTHH:MM pour un rendez-vous' },
      relance_quoi: { type: 'string', description: 'La prochaine action, en quelques mots' },
      canal: { type: 'string', enum: ['appel', 'mail', 'rdv', 'tache'] },
    },
    required: ['resume'],
  },
};

/** Haka prépare le mail qui part avec l'avis en PDF ; le mandataire le relit et l'envoie lui-même. */
export const OUTIL_ENVOI = {
  name: 'preparer_envoi_avis',
  description:
    "Prépare le mail au propriétaire qui accompagne l'avis de valeur en PDF : seulement quand l'avis est fini et que le mandataire a dit oui à ta proposition de l'envoyer. Écris objet et texte : vouvoiement, cinq à huit lignes, la valeur et la fourchette, une phrase sur ce qui la justifie, un appel annoncé pour la présenter, la signature du mandataire. Le mail s'ouvre à l'écran avec l'avis joint : ne le recopie pas dans ta réponse, dis en une ligne qu'il est prêt à relire et à envoyer.",
  input_schema: { type: 'object', properties: { objet: { type: 'string' }, texte: { type: 'string' } }, required: ['objet', 'texte'] },
};

// --- Le Suivi, à gauche de l'avis une fois envoyé (27 oct. 2026, Jules) ------------------

/**
 * Ce que montre l'onglet Suivi : le bien (statut, prix d'accord, l'avis et sa fourchette, ce qu'en pense le
 * propriétaire), ce qu'il reste à faire (les relances ouvertes, la plus proche d'abord), ce qui a été fait, et
 * l'historique entier, le plus récent en tête.
 */
export function suiviDuBien(id, user) {
  const p = sienne(id, user);
  if (!p) return { ok: false, error: 'Fiche introuvable.' };
  const { estimation: e, mandat } = objetsDuBien(p);
  const c = e?.avis?.chiffres || {};
  const b = p.biens || {};
  const statut = b.perdu ? `Perdu${b.perdu.motif ? ` · ${MOTIFS_PERDU[b.perdu.motif] || b.perdu.motif}` : ''}` : b.pause ? 'En pause' : b.prix_accord ? "Prix d'accord" : e?.statut === 'envoye' ? 'Estimation envoyée' : e ? 'Avis de valeur' : 'Visite';
  const rappels = Records.list('Rappel').filter((r) => r.proprietaire_id === p.id && r.espace === 'mandataire');
  const ligne = (r) => ({ id: r.id, quoi: String(r.quoi || '').replace(` (${r.nom})`, '').trim(), canal: r.canal || null, echeance: r.echeance || null, fait_le: r.fait_le || null });
  const a_faire = rappels.filter((r) => !r.fait_le).sort((x, y) => String(x.echeance).localeCompare(String(y.echeance))).map(ligne);
  const faites = rappels.filter((r) => r.fait_le && !r.remplacee).sort((x, y) => String(y.fait_le).localeCompare(String(x.fait_le))).slice(0, 8).map(ligne);
  const cr = b.compte_rendu || null;
  return {
    ok: true,
    bien: {
      titre: [p.commerce || p.nom, p.ville].filter(Boolean).join(' · ') || 'Ce bien',
      statut,
      prix_accord: b.prix_accord || null,
      revision_prix_jours: b.revision_prix_jours || null,
      valeur: c.valeur || null, bas: c.bas || null, haut: c.haut || null,
      envoye_le: e?.envoye_le || null,
      prix_pense: cr?.proprietaire?.prix || null,
      alerte: b.restitution?.alerte || null,
      mandat: mandat ? { statut: mandat.statut, signe: !!mandat.document_signe || mandat.statut === 'enregistre' } : null,
    },
    prochaine: b.prochaine || null,
    a_faire,
    faites,
    historique: [...(p.historique || [])].sort((x, y) => String(y.le).localeCompare(String(x.le))).slice(0, 80),
  };
}

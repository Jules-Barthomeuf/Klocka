// L'analyse d'appel, deuxième version (19 oct. 2026, Jules, suite de l'audit de l'après-appel).
//
// On garde l'architecture : le modèle lit et extrait, le code décide des actions. Ce qui change :
//   1. la compétence publiée « appels-agents » (Paramètres › Compétences) porte notre façon de penser ;
//   2. le modèle reçoit ce qu'on sait déjà de l'agent (biens et dossiers envoyés, derniers mails, statut,
//      tentatives, relance en cours, autres agents de l'agence) ;
//   3. l'issue et chaque action portent un « parce que » ; le modèle peut conseiller une autre date de relance,
//      que le code vérifie avant de la reprendre ;
//   4. chaque validation laisse un journal complet des corrections (CorrectionAppel) ;
//   5. la lecture finale peut tourner à un autre effort que la lecture en direct (APPEL_EFFORT_FINAL).
// Tout est derrière un seul interrupteur : APPELS_V2=1, ou meta « appels_v2.actif ». Éteint, rien ne change.

import { Meta, Records } from '../db.js';
import * as R from './regles.js';
import { dateDepuisTexte } from './dates-fr.js';

const CLE = 'appels_v2.actif';
const vrai = (v) => ['1', 'true', 'oui'].includes(String(v || '').trim().toLowerCase());
export const COMPETENCE = 'appels-agents';

export function appelsV2Actif() {
  if (process.env.APPELS_V2 !== undefined && process.env.APPELS_V2 !== '') return vrai(process.env.APPELS_V2);
  return vrai(Meta.get(CLE));
}
export function poserAppelsV2(actif) {
  Meta.set(CLE, actif ? '1' : '0');
  return appelsV2Actif();
}

/** L'effort de la lecture finale : « low » comme en direct, sauf APPEL_EFFORT_FINAL=medium (ou high). */
export function effortFinal() {
  const e = String(process.env.APPEL_EFFORT_FINAL || '').trim().toLowerCase();
  return ['low', 'medium', 'high'].includes(e) ? e : 'low';
}

/** La compétence publiée : son texte rendu et sa version, ou null (jamais publiée, base absente). */
export async function competencePubliee() {
  try {
    const C = await import('../haka/competences.js');
    const texte = C.pourAK(COMPETENCE);
    if (!texte) return null;
    return { texte, version: C.publiee(COMPETENCE)?.version ?? null };
  } catch { return null; }
}

// --- Ce qu'on sait déjà de l'agent ---------------------------------------------------------------

const court = (t, n = 160) => { const s = String(t ?? '').replace(/\s+/g, ' ').trim(); return s.length > n ? `${s.slice(0, n - 1)}…` : s; };
const jour = (iso) => String(iso || '').slice(0, 10);

/**
 * Pure : le contexte de l'agent, tel que l'analyste le connaît. Les listes sont passées par l'appelant (testable).
 * @returns {{statut, tentatives, dernier_contact, relance, biens: Array, mails: Array, collegues: Array}}
 */
export function contexteAgent(a, { agents = [], deals = [], mailsRecus = [], mailsEnvoyes = [] } = {}) {
  const emails = (a.emails || []).map((e) => R.normEmail(e)).filter(Boolean);
  const aLui = (e) => emails.includes(R.normEmail(e));
  const biens = deals
    .filter((d) => !d.archived && (aLui(d.contact_agent_email) || (d.apports || []).some((x) => aLui(x.de))))
    .sort((x, y) => String(y.cree_le || '').localeCompare(String(x.cree_le || '')))
    .slice(0, 5)
    .map((d) => ({ nom: d.nom || 'Dossier sans nom', statut: d.statut || null, le: jour(d.cree_le) }));
  const recus = mailsRecus.filter((m) => aLui(m.de_email)).map((m) => ({ sens: 'reçu', le: m.date || m.created_date || '', objet: m.objet || '', debut: m.extrait || m.corps || '' }));
  const envoyes = mailsEnvoyes.filter((m) => !m.essai && (m.agent_id === a.id || aLui(m.a))).map((m) => ({ sens: m.etat === 'envoye' ? 'envoyé' : 'préparé', le: m.envoye_le || m.cree_le || '', objet: m.objet || '', debut: m.corps || '' }));
  const mails = [...recus, ...envoyes].sort((x, y) => String(y.le).localeCompare(String(x.le))).slice(0, 3)
    .map((m) => ({ sens: m.sens, le: jour(m.le), objet: court(m.objet, 90), debut: court(m.debut, 140) }));
  const collegues = a.agence
    ? agents.filter((x) => x.id !== a.id && x.statut !== 'archive' && R.norm(x.agence) === R.norm(a.agence)).slice(0, 5)
      .map((x) => ({ nom: x.nom, statut: R.STATUTS[x.statut] || x.statut || null, dernier_contact: jour(x.dernier_contact_le) || null }))
    : [];
  return {
    statut: R.STATUTS[a.statut] || a.statut || 'inconnu',
    tentatives: a.tentatives || 0,
    dernier_contact: jour(a.dernier_contact_le) || null,
    relance: a.prochaine ? { le: a.prochaine.le, quoi: court(a.prochaine.quoi, 100) } : null,
    biens, mails, collegues,
  };
}

/** Le contexte lu dans la base. */
export function contexteDeLaBase(a, tousLesAgents) {
  return contexteAgent(a, { agents: tousLesAgents, deals: Records.list('Deal'), mailsRecus: Records.list('MailRecu'), mailsEnvoyes: Records.list('ProspectionMail') });
}

/** Pure : le bloc de texte que le prompt reçoit. */
export function texteDuContexte(c) {
  const l = [];
  l.push(`- Statut : ${c.statut}. Appels sans réponse de suite : ${c.tentatives}. Dernier contact : ${c.dernier_contact || 'jamais'}.`);
  l.push(`- Relance en cours : ${c.relance ? `le ${c.relance.le}, ${c.relance.quoi}` : 'aucune'}.`);
  l.push(`- Biens et dossiers qu'il nous a déjà envoyés : ${c.biens.length ? c.biens.map((b) => `« ${b.nom} »${b.statut ? ` (${b.statut})` : ''}${b.le ? `, le ${b.le}` : ''}`).join(' ; ') : 'aucun'}.`);
  l.push(`- Derniers mails échangés : ${c.mails.length ? c.mails.map((m) => `${m.le} ${m.sens} « ${m.objet} »${m.debut ? ` : ${m.debut}` : ''}`).join(' | ') : 'aucun'}.`);
  l.push(`- Autres agents de la même agence : ${c.collegues.length ? c.collegues.map((x) => `${x.nom} (${x.statut || 'sans statut'}${x.dernier_contact ? `, contact le ${x.dernier_contact}` : ''})`).join(' ; ') : 'aucun connu'}.`);
  return l.join('\n');
}

/** Pure : ce que le prompt ajoute en deuxième version, ou '' si rien. */
export function blocDuPrompt({ competence = null, contexte = null } = {}) {
  const parties = [];
  if (competence?.texte) parties.push(`NOTRE FAÇON DE PENSER (compétence « ${COMPETENCE} », version ${competence.version ?? '?'}). Elle passe avant tes habitudes ; le format de sortie ci-dessous reste le même :\n${competence.texte}`);
  if (contexte) parties.push(`CE QU'ON SAIT DÉJÀ (état avant cet appel) :\n${texteDuContexte(contexte)}`);
  parties.push(`POURQUOI : dans « parce_que », dis en une phrase, avec les mots de l'appel, pourquoi tu retiens cette issue (issue), cette relance (relance), ce mail (mail), cette mise à jour de la fiche (fiche). Si tu as une bonne raison de t'écarter du délai de relance habituel (contexte, échéance donnée, relation en cours), mets une date en mots dans « relance_conseillee » avec sa raison ; jamais si une date a été dite dans l'appel. Sans bonne raison, laisse-la vide.`);
  return parties.join('\n\n');
}

/** Les champs de plus que le schéma de sortie reçoit en deuxième version. */
export const SCHEMA_V2 = {
  parce_que: {
    type: 'object',
    description: "pourquoi, en une phrase chacun, avec les mots de l'appel",
    properties: { issue: { type: 'string' }, relance: { type: 'string' }, mail: { type: 'string' }, fiche: { type: 'string' } },
  },
  relance_conseillee: {
    type: 'object',
    description: "une autre date de relance que celle par défaut, seulement avec une bonne raison ; vide sinon",
    properties: { date_en_mots: { type: 'string' }, parce_que: { type: 'string' } },
  },
};

const SANS_RELANCE = ['pas_interesse', 'invalide', 'residentiel', 'rappelle_bientot'];

/**
 * Pure : la date de relance conseillée par le modèle, vérifiée. Le code reste maître des règles : une date passée,
 * trop lointaine, ou pour une issue qui ne porte pas de relance est refusée, et la date par défaut reste.
 * @returns {{ok: true, le: string, parce_que: string|null} | {ok: false, refus: string} | null}
 */
export function relanceConseillee(rc, { issue, date_dite = null, maintenant = new Date() } = {}) {
  const mots = String(rc?.date_en_mots || '').trim();
  if (!mots) return null;
  if (date_dite) return { ok: false, refus: 'une date a été dite dans l\'appel : elle l\'emporte' };
  if (SANS_RELANCE.includes(issue)) return { ok: false, refus: `l'issue « ${issue} » ne porte pas de relance` };
  const d = dateDepuisTexte(mots, maintenant);
  if (!d?.le) return { ok: false, refus: `date non comprise : « ${mots} »` };
  const auj = R.jourDe(maintenant);
  if (d.le <= auj) return { ok: false, refus: 'date passée ou d\'aujourd\'hui' };
  if (d.le > R.plusJours(auj, 90)) return { ok: false, refus: 'au-delà de 90 jours' };
  return { ok: true, le: d.le, parce_que: String(rc.parce_que || '').trim().slice(0, 300) || null };
}

/** Les raisons qu'on propose d'un clic quand l'analyste change ce que Haka proposait. */
export const RAISONS = {
  trop_tot: 'Trop tôt',
  trop_tard: 'Trop tard',
  mauvais_ton: 'Mauvais ton',
  deja_fait: 'Déjà fait',
  a_dit_autre_chose: 'Il a dit autre chose',
  autre: 'Autre',
};

/** Pose la raison d'un changement sur l'appel (un clic). */
export function noterRaison(appelId, cle, raison) {
  if (!RAISONS[raison]) return { ok: false, error: 'Raison inconnue.' };
  const a = Records.get('AppelAgent', appelId);
  if (!a) return { ok: false, error: 'Appel introuvable.' };
  const k = String(cle || '').slice(0, 40);
  if (!k) return { ok: false, error: 'Rien à justifier.' };
  Records.update('AppelAgent', a.id, { raisons: { ...(a.raisons || {}), [k]: raison } });
  return { ok: true };
}

// --- Le journal des corrections ---------------------------------------------------------------------

/**
 * Pure : ce que l'analyste a changé de ce que Haka proposait, complet : chaque action gardée, décochée ou ajoutée,
 * la relance, le mail, la phrase « ce qui s'est passé », les champs corrigés, avec les textes d'origine et corrigés
 * et la raison donnée d'un clic.
 */
export function journalDeCorrection({ appel, actions = [], pris = new Set(), mail = null, relanceChoisie = null, passeAvant = null, passeApres = null, corrections = [], issueFinale = null, raisons = {} } = {}) {
  const visibles = actions.filter((p) => !p.cache);
  const decision = (p) => {
    const proposee = p.coche !== false || !!p.toujours;
    const finale = !!p.toujours || pris.has(p.id);
    return proposee && finale ? 'gardee' : proposee && !finale ? 'decochee' : !proposee && finale ? 'ajoutee' : 'laissee';
  };
  const pm = actions.find((p) => p.type === 'mail');
  const pr = actions.find((p) => p.type === 'relance');
  const mailEnvoye = mail && pm && pris.has(pm.id) ? { a: mail.a || '', objet: mail.objet, corps: mail.corps } : null;
  const mailModifie = !!(pm && mailEnvoye && (mailEnvoye.objet !== pm.objet || mailEnvoye.corps !== pm.corps || (mailEnvoye.a || '') !== (pm.a || '')));
  const relanceChangee = !!(pr && relanceChoisie && relanceChoisie !== pr.prochaine?.le);
  const compris = appel?.compris?.champs || {};
  const champs = (corrections || []).filter((c) => c?.cle).map((c) => ({ cle: c.cle, avant: compris[c.cle]?.valeur ?? null, apres: String(c.valeur ?? '').trim() }));
  const passeChangee = passeApres != null && String(passeApres) !== String(passeAvant ?? '');
  const issueChangee = !!(appel?.issue_deduite && issueFinale && issueFinale !== appel.issue_tapee && issueFinale !== appel.issue);
  const lecture = appel?.lecture_v2 || {};
  return {
    appel_id: appel?.id || null, agent_id: appel?.agent_id || null, agent: appel?.agent || null, par: appel?.par || null,
    le: new Date().toISOString(),
    lecture: { competence_version: lecture.competence_version ?? null, effort: lecture.effort || null, contexte: !!lecture.contexte },
    issue: { proposee: appel?.issue || null, finale: issueFinale || appel?.issue || null, changee: issueChangee, raison: raisons.issue || null },
    actions: visibles.map((p) => ({ type: p.type, titre: court(p.titre, 200), parce_que: p.parce_que || null, decision: decision(p), raison: raisons[p.type] || null })),
    relance: pr ? { proposee: pr.prochaine?.le || null, choisie: relanceChoisie || pr.prochaine?.le || null, changee: relanceChangee, conseillee_par_haka: !!pr.conseillee, raison: raisons.relance || null } : null,
    mail: pm ? { propose: { a: pm.a || '', objet: pm.objet, corps: pm.corps }, envoye: mailEnvoye, modifie: mailModifie, raison: raisons.mail || null } : null,
    passe: { origine: passeAvant ?? null, corrigee: passeChangee ? passeApres : null, raison: raisons.passe || null },
    champs,
    corrige: issueChangee || mailModifie || relanceChangee || passeChangee || champs.length > 0 || visibles.some((p) => decision(p) === 'decochee' || decision(p) === 'ajoutee'),
  };
}

export const noterCorrection = (j) => Records.create('CorrectionAppel', j);

/** Les raisons de code, quand une action n'est pas portée par le modèle (Monday, liste de diffusion, SMS…). */
export const PARCE_QUE_REGLE = {
  monday: () => 'Monday garde la trace de chaque appel abouti.',
  diffusion: () => 'La liste de diffusion entretient la relation entre deux appels.',
  sms: () => 'Il a demandé un SMS plutôt qu\'un mail.',
  signaler_bien: () => 'Un bien a été évoqué : on le note pour le suivre quand la fiche arrive.',
  nouveau_contact: () => 'Un autre interlocuteur a été donné pendant l\'appel.',
  prevenir: () => 'La ligne est aussi à un collègue : il doit savoir que l\'agent a été appelé.',
  relance_suivante: () => 'Un mandat à venir a été annoncé : on fait le point à son échéance.',
};

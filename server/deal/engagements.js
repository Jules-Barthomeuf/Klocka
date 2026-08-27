// Le registre des engagements : qui doit quoi, pour quand.
//
// Jusqu'ici la relance reposait sur un minuteur — « statut documents_demandés
// et sept jours écoulés ». Un minuteur ne sait pas ce qui a été demandé, ni ce
// que l'agent a répondu, ni ce qu'il a promis. Le registre remplace le compte à
// rebours par des faits : « on a demandé le bail à Marc le 21 », « Marc a
// promis le PV pour jeudi ».
//
// Deux sources, aucune saisie manuelle :
//   - nos mails sortants (EmailLog garde le corps entier) : une demande de
//     documents ouvre une attente datée — cette source marche dès aujourd'hui ;
//   - leurs réponses (MailRecu) : les promesses en sont extraites par le
//     modèle — dormant tant qu'aucun compte n'autorise la lecture Gmail.
//
// Un engagement se clôt tout seul quand la pièce promise arrive au dossier ou
// quand le statut avance ; le reste se coche à la main. La déduction des
// propositions, elle, reste 100 % déterministe : le modèle n'écrit que le
// registre, jamais le plan de travail.

import { Records } from '../db.js';
import { documentsManquants } from './propositions.js';
import { typeDepuisCategorie } from './grille.js';

const titreDeal = (d) => d?.nom || d?.lots?.[0]?.synthese?.titre || d?.deal_id || 'dossier';

const TYPES_CONNUS = ['bail', 'pv_ag', 'rcp', 'quittances', 'diagnostics'];

/** Un engagement est en retard quand son échéance est passée. */
export const enRetard = (e) =>
  e.statut === 'ouvert' && !!e.echeance && new Date(e.echeance) <= new Date();

/** Les engagements ouverts, du plus urgent au plus lointain. */
export function engagementsOuverts(dealId = null) {
  return Records.filter('Engagement', dealId ? { deal_id: dealId, statut: 'ouvert' } : { statut: 'ouvert' })
    .sort((a, b) => String(a.echeance || '9999').localeCompare(String(b.echeance || '9999')));
}

/** Tout le registre, les ouverts d'abord. */
export function tousLesEngagements() {
  return Records.list('Engagement').sort((a, b) => {
    if (a.statut !== b.statut) return a.statut === 'ouvert' ? -1 : 1;
    return String(a.echeance || a.cree_le || '9999').localeCompare(String(b.echeance || b.cree_le || '9999'));
  });
}

function creer({ deal, de, quoi, types = [], echeance = null, source }) {
  return Records.create('Engagement', {
    // Un engagement dicté à l'assistant peut ne tenir à aucun dossier
    // (« rappeler le notaire jeudi ») : deal_id reste alors vide.
    deal_id: deal?.deal_id || null,
    // Le titre est photographié : le registre doit rester lisible même si le
    // dossier est renommé, archivé ou que son mail d'origine est supprimé.
    dossier: deal ? titreDeal(deal) : null,
    de: de || deal?.contact_agent_email || null,
    quoi,
    types,
    echeance,
    statut: 'ouvert',
    source,
    cree_le: new Date().toISOString(),
  });
}

function tenir(e, commentaire, user = null) {
  return Records.update('Engagement', e.id, {
    statut: 'tenu',
    tenu_le: new Date().toISOString(),
    tenu_par: user?.email || null,
    tenu_comment: commentaire,
  });
}

// ---------------------------------------------------------------------------
// Source 1 — nos envois
// ---------------------------------------------------------------------------

/**
 * Ouvre (ou prolonge) l'attente créée par un mail sortant.
 *
 * Une demande de documents crée UNE attente par dossier ; une seconde demande
 * ou une relance ne s'empile pas, elle repousse l'échéance de la même — c'est
 * la même dette, réclamée deux fois.
 *
 * À appeler APRÈS changerStatut : c'est lui qui pose relance_prevue_le, dont
 * l'échéance hérite.
 */
export function ouvrirDepuisEnvoi(dealId, { intention, objet, destinataire, user } = {}) {
  if (!['demande_documents', 'relance'].includes(intention)) return null;
  const deal = Records.filter('Deal', { deal_id: dealId })[0];
  if (!deal) return null;

  const echeance = deal.relance_prevue_le || new Date(Date.now() + 7 * 86400000).toISOString();
  const existant = engagementsOuverts(dealId).find((e) => e.source?.type === 'mail_sortant');
  if (existant) {
    return Records.update('Engagement', existant.id, {
      echeance,
      source: { ...existant.source, relance_le: new Date().toISOString() },
    });
  }
  if (intention !== 'demande_documents') return null;

  const manquants = documentsManquants(deal);
  return creer({
    deal,
    de: (Array.isArray(destinataire) ? destinataire[0] : destinataire) || deal.contact_agent_email,
    quoi: manquants.length
      ? `Documents demandés : ${manquants.map((m) => m.libelle).join(', ')}`
      : 'Documents du dossier demandés',
    types: manquants.map((m) => m.type),
    echeance,
    source: { type: 'mail_sortant', objet: objet || null, le: new Date().toISOString(), par: user?.email || null },
  });
}

/**
 * Reprend les demandes déjà envoyées avant l'existence du registre.
 *
 * EmailLog garde le corps entier de chaque envoi : les dossiers en attente de
 * documents peuvent donc entrer au registre rétroactivement. Idempotent — un
 * dossier qui a déjà son attente n'en reçoit pas une seconde.
 */
export function rattraperDepuisEmailLog() {
  let crees = 0;
  const logs = Records.list('EmailLog').filter(
    (l) => l.deal_id && l.intention === 'demande_documents' && l.statut !== 'erreur'
  );
  for (const log of logs) {
    const deal = Records.filter('Deal', { deal_id: log.deal_id })[0];
    if (!deal || deal.archived) continue;
    // L'attente n'a de sens que si on attend encore quelque chose.
    if (!['documents_demandes'].includes(deal.statut || 'analyse')) continue;
    const deja = Records.filter('Engagement', { deal_id: log.deal_id }).some(
      (e) => ['mail_sortant', 'reprise'].includes(e.source?.type)
    );
    if (deja) continue;

    const manquants = documentsManquants(deal);
    creer({
      deal,
      de: (log.destinataire || log.to || '').split(',')[0]?.trim() || deal.contact_agent_email,
      quoi: manquants.length
        ? `Documents demandés : ${manquants.map((m) => m.libelle).join(', ')}`
        : 'Documents du dossier demandés',
      types: manquants.map((m) => m.type),
      echeance: deal.relance_prevue_le || log.sent_at || null,
      source: { type: 'reprise', objet: log.subject || log.sujet || null, le: log.sent_at || null },
    });
    crees += 1;
  }
  if (crees) console.log(`[engagements] ${crees} attente(s) reprise(s) depuis l'historique des envois`);
  return crees;
}

// ---------------------------------------------------------------------------
// Source 2 — leurs réponses
// ---------------------------------------------------------------------------

const SCHEMA_PROMESSES = {
  type: 'object',
  properties: {
    engagements: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          quoi: { type: 'string', description: "ce qui est promis, en une phrase courte, ex: « envoi du PV d'AG »" },
          echeance: {
            type: 'string',
            description: 'date promise au format YYYY-MM-DD, ou chaîne vide si le mail ne donne aucune date',
          },
          types: {
            type: 'array',
            items: { type: 'string', enum: TYPES_CONNUS },
            description: 'les types de documents concernés parmi la liste, vide si aucun ne correspond',
          },
        },
        required: ['quoi'],
      },
    },
  },
  required: ['engagements'],
};

/**
 * Extrait les promesses d'un mail reçu et les inscrit au registre.
 *
 * C'est le seul endroit où le modèle touche au registre : il lit un texte
 * libre, il en tire des faits datés. La décision de relancer, elle, restera
 * déterministe. Idempotent par mail — un même message n'est jamais relu.
 */
export async function extraireDepuisMail(mail) {
  if (!mail?.deal_id || !mail.texte || mail.engagements_extraits) return { crees: 0 };
  const deal = Records.filter('Deal', { deal_id: mail.deal_id })[0];
  if (!deal) return { crees: 0 };

  const dejaVu = Records.filter('Engagement', { deal_id: mail.deal_id }).some(
    (e) => e.source?.gmail_message_id === mail.gmail_message_id
  );
  if (dejaVu) {
    Records.update('MailRecu', mail.id, { engagements_extraits: true });
    return { crees: 0 };
  }

  const { invokeLLM } = await import('../llm.js');
  const { mesurer } = await import('../llm-couts.js');
  const attendus = engagementsOuverts(mail.deal_id)
    .map((e) => e.quoi)
    .join(' ; ');

  // mesurer rend { resultat, consommation } : le coût de la lecture est
  // attribué au registre, dossier par dossier.
  const { resultat } = await mesurer({ operation: 'engagements', sur: mail.deal_id }, () =>
    invokeLLM({
      prompt: `Tu lis la réponse d'un agent immobilier sur un dossier de murs commerciaux.
Relève UNIQUEMENT les engagements concrets qu'il prend : envoyer un document, obtenir une pièce auprès d'un tiers, rappeler, organiser une visite. Ignore les formules de politesse et les généralités.
Le mail date du ${mail.date ? mail.date.slice(0, 10) : "jour inconnu"} : résous les dates relatives (« jeudi », « la semaine prochaine ») par rapport à cette date. Sans date explicite ou déductible, laisse echeance vide — n'invente jamais.
${attendus ? `Pour contexte, nous attendons déjà : ${attendus}.` : ''}

Objet : ${mail.objet || '(sans objet)'}
De : ${mail.de || mail.de_email || 'inconnu'}

${String(mail.texte).slice(0, 6000)}`,
      response_json_schema: SCHEMA_PROMESSES,
    })
  );

  let crees = 0;
  for (const p of resultat?.engagements || []) {
    if (!p.quoi?.trim()) continue;
    creer({
      deal,
      de: mail.de_email,
      quoi: p.quoi.trim(),
      types: (p.types || []).filter((t) => TYPES_CONNUS.includes(t)),
      echeance: /^\d{4}-\d{2}-\d{2}$/.test(p.echeance || '') ? `${p.echeance}T12:00:00.000Z` : null,
      source: {
        type: 'mail_recu',
        objet: mail.objet || null,
        le: mail.date || null,
        gmail_message_id: mail.gmail_message_id || null,
      },
    });
    crees += 1;
  }
  Records.update('MailRecu', mail.id, { engagements_extraits: true });
  return { crees };
}

/** Passe sur les mails rattachés dont les promesses n'ont pas été relevées. */
export async function extraireEnAttente() {
  const aLire = Records.list('MailRecu').filter((m) => m.deal_id && m.texte && !m.engagements_extraits);
  let crees = 0;
  const erreurs = [];
  for (const mail of aLire) {
    try {
      crees += (await extraireDepuisMail(mail)).crees;
    } catch (e) {
      erreurs.push(`Engagements de « ${mail.objet || mail.id} » : ${e?.message || e}`);
    }
  }
  return { mails: aLire.length, crees, erreurs };
}

// ---------------------------------------------------------------------------
// Source 3 — dicté à l'assistant
// ---------------------------------------------------------------------------

/**
 * Inscrit un engagement dicté : « Marc envoie le PV jeudi », « rappeler le
 * notaire lundi ». La seule source qui passe par un humain — et c'est
 * l'assistant qui écrit, pas un formulaire.
 */
export function noter({ dealId = null, de = null, quoi, echeance = null, types = [], user = null }) {
  if (!quoi?.trim()) return { ok: false, error: 'Rien à noter' };
  const deal = dealId ? Records.filter('Deal', { deal_id: dealId })[0] : null;
  if (dealId && !deal) return { ok: false, error: 'Dossier introuvable' };
  if (echeance && isNaN(new Date(echeance))) return { ok: false, error: 'Date invalide' };
  const e = creer({
    deal,
    de,
    quoi: quoi.trim(),
    types: types.filter((t) => TYPES_CONNUS.includes(t)),
    echeance: echeance ? new Date(echeance).toISOString() : null,
    source: { type: 'assistant', le: new Date().toISOString(), par: user?.email || null },
  });
  return { ok: true, engagement: e };
}

/** Efface un engagement — l'inverse de « noter », pour l'annulation. */
export function effacer(id) {
  const e = Records.get('Engagement', id);
  if (!e) return { ok: false, error: 'Engagement introuvable' };
  Records.delete('Engagement', id);
  return { ok: true };
}

// ---------------------------------------------------------------------------
// Clôture
// ---------------------------------------------------------------------------

/**
 * Clôt les engagements dont toutes les pièces typées sont arrivées au dossier.
 * Un engagement sans type ne se clôt jamais tout seul : on coche à la main.
 */
export function rapprocherDocuments(dealId, user = null) {
  const deal = Records.filter('Deal', { deal_id: dealId })[0];
  if (!deal) return 0;
  const presents = new Set();
  for (const d of deal.documents_espace || []) {
    const t = typeDepuisCategorie(d.categorie, d.nom);
    if (t) presents.add(t);
  }
  let clos = 0;
  for (const e of engagementsOuverts(dealId)) {
    if (!e.types?.length) continue;
    if (e.types.every((t) => presents.has(t))) {
      tenir(e, 'documents arrivés au dossier', user);
      clos += 1;
    }
  }
  return clos;
}

/**
 * Un statut qui avance solde les attentes documentaires : « documents reçus »
 * dit que la dette est payée, « abandonné » qu'elle n'a plus d'objet.
 */
export function surStatut(dealId, statut, user = null) {
  if (!['documents_recus', 'depouille', 'projet_cree', 'abandonne'].includes(statut)) return 0;
  const motif = statut === 'abandonne' ? 'dossier abandonné' : 'statut avancé : documents reçus';
  let clos = 0;
  for (const e of engagementsOuverts(dealId)) {
    if (!e.types?.length && e.source?.type === 'mail_recu') continue; // une promesse libre survit au statut
    tenir(e, motif, user);
    clos += 1;
  }
  return clos;
}

/** Cocher à la main. */
export function clore(id, { user, commentaire } = {}) {
  const e = Records.get('Engagement', id);
  if (!e) return { ok: false, error: 'Engagement introuvable' };
  if (e.statut !== 'ouvert') return { ok: false, error: 'Déjà clos' };
  return { ok: true, engagement: tenir(e, commentaire || 'coché à la main', user) };
}

/** Repousser l'échéance, en gardant la trace de l'ancienne. */
export function repousser(id, date, user = null) {
  const e = Records.get('Engagement', id);
  if (!e) return { ok: false, error: 'Engagement introuvable' };
  if (e.statut !== 'ouvert') return { ok: false, error: 'Déjà clos' };
  if (isNaN(new Date(date))) return { ok: false, error: 'Date invalide' };
  return {
    ok: true,
    engagement: Records.update('Engagement', e.id, {
      echeance: new Date(date).toISOString(),
      echeances_passees: [...(e.echeances_passees || []), e.echeance].filter(Boolean),
      repousse_par: user?.email || null,
    }),
  };
}

// Tri des mails relevés : ce qui concerne un dossier, et ce qui n'y est pour rien.
//
// Une boîte professionnelle mélange les fiches d'agents et tout le reste —
// échanges internes, factures, newsletters, conversations sans rapport. Tout
// remonter noierait le plan de travail ; tout filtrer ferait rater des fiches.
//
// Le tri se fait en trois couches, de la moins chère à la plus coûteuse :
//
//   A. Ce que l'équipe a tranché. Un « pas pertinent » posé sur un mail devient
//      une règle sur son expéditeur : la décision ne se redemande jamais deux
//      fois. C'est là qu'est l'apprentissage — pas dans le modèle, qui n'a
//      aucune mémoire, mais dans ce que l'application retient des corrections.
//
//   B. Les règles déterministes, gratuites et immédiates :
//      1. Un expéditeur interne (l'équipe elle-même) n'est jamais un dossier.
//      2. Un expéditeur déjà connu comme agent — parce qu'il a apporté un
//         dossier ou qu'il est fiché au CRM — est toujours pertinent.
//      3. Aucun signal du métier, aucune pièce exploitable → écarté.
//
//   C. Le doute, et lui seul, part au modèle : une pièce jointe ou un mot du
//      métier ne dit pas si l'on transmet un bien ou un RIB. La question posée
//      est précise — « ce mail transmet-il un bien à étudier ? » — et les
//      corrections passées lui sont données en exemple.
//
// Chaque mail retenu porte la raison de sa sélection : elle s'affiche, et se
// discute. Un mail écarté n'est pas stocké — la boîte de réception de
// l'application reste le reflet des dossiers, pas une copie de Gmail.

import { Records } from '../db.js';
import { comptesEquipe } from '../google-oauth.js';
import { invokeLLM, llmEnabled } from '../llm.js';

// Domaines de l'équipe : un mail interne parle d'autre chose qu'un dossier.
const DOMAINES_INTERNES = (process.env.MAIL_DOMAINES_INTERNES || '')
  .split(',')
  .map((d) => d.trim().toLowerCase().replace(/^@/, ''))
  .filter(Boolean);

// Expéditeurs à ignorer quoi qu'il arrive (notifications, facturation…).
const EXPEDITEURS_IGNORES = (process.env.MAIL_EXPEDITEURS_IGNORES || '')
  .split(',')
  .map((e) => e.trim().toLowerCase())
  .filter(Boolean);

// Le vocabulaire d'une fiche commerciale de murs commerciaux.
const MOTS_METIER = [
  'bail', 'local commercial', 'locaux commerciaux', 'murs', 'fonds de commerce',
  'rendement', 'loyer', 'fiche', 'annonce', 'investissement', 'copropriété',
  "assemblée générale", 'pv ag', 'diagnostic', 'quittance', 'mandat', 'offre',
  'acquisition', 'cession', 'preneur', 'bailleur', 'taxe foncière', 'lot',
];

// Ce qu'un agent transmet réellement.
const PIECES_UTILES = /\.(pdf|docx?|xlsx?|odt|ods|jpe?g|png|webp|eml)$/i;
const PIECES_INUTILES = /^(image\d+|logo|signature|banniere|banner|icon)/i;

const norm = (s) =>
  String(s || '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '');

const domaineDe = (email) => String(email || '').toLowerCase().split('@')[1] || '';

/** Adresses de l'équipe : comptes connectés et utilisateurs administrateurs. */
function adressesInternes() {
  const comptes = comptesEquipe().map((a) => String(a.email || '').toLowerCase());
  const admins = Records.filter('User', { role: 'admin' }).map((u) => String(u.email || '').toLowerCase());
  return new Set([...comptes, ...admins].filter(Boolean));
}

/** Adresses déjà identifiées comme agents : dossiers apportés et fiches CRM. */
function adressesAgents() {
  const deals = Records.list('Deal')
    .map((d) => String(d.contact_agent_email || '').toLowerCase())
    .filter(Boolean);
  const contacts = Records.list('Contact')
    .map((c) => String(c.email || '').toLowerCase())
    .filter(Boolean);
  return new Set([...deals, ...contacts]);
}

/**
 * Agents dont on attend une réponse : documents demandés, sans retour.
 * Eux seuls passent sans examen — leur « je vous envoie ça demain » compte,
 * même sans pièce jointe ni mot du métier.
 */
function agentsAttendus() {
  return new Set(
    Records.list('Deal')
      .filter((d) => !d.archived && d.contact_agent_email && d.statut === 'documents_demandes')
      .map((d) => String(d.contact_agent_email).toLowerCase())
  );
}

/**
 * Règles dures posées par l'équipe : elles court-circuitent tout le reste.
 * Seules les corrections de portée « expediteur » ou « domaine » en produisent.
 */
function reglesApprises() {
  const parEmail = new Map();
  const parDomaine = new Map();
  for (const r of Records.list('RegleTriMail')) {
    if (r.portee === 'mail') continue; // un exemple n'est pas une règle
    if (r.email) parEmail.set(String(r.email).toLowerCase(), r);
    else if (r.domaine) parDomaine.set(String(r.domaine).toLowerCase(), r);
  }
  return { parEmail, parDomaine };
}

/**
 * Enregistre une correction de l'équipe.
 *
 * La portée est le cœur du sujet : un agent immobilier envoie des dossiers ET
 * des mails sans intérêt. Écarter un de ses mails ne doit pas le faire taire.
 *
 *   portee 'mail'       (défaut) — ce mail-ci ne remonte plus, et sert d'exemple
 *                        au modèle. L'expéditeur continue d'être écouté.
 *   portee 'expediteur' — plus rien de cette adresse. À réserver aux outils et
 *                        aux robots.
 *   portee 'domaine'    — plus rien de ce domaine.
 *
 * @param {'garder'|'ignorer'} decision
 */
export function apprendre({ email, domaine, decision, motif, par, portee = 'mail', exemple = null }) {
  const adresse = String(email || '').toLowerCase();
  if (!adresse && !domaine) return { ok: false, error: 'Expéditeur manquant' };

  const donnees = {
    portee,
    decision,
    motif: motif || null,
    par: par || null,
    le: new Date().toISOString(),
    ...(portee === 'domaine' ? { domaine: String(domaine || adresse.split('@')[1] || '').toLowerCase() } : { email: adresse }),
    // Ce qu'on montrera au modèle : l'objet compte plus que l'adresse.
    ...(exemple ? { objet: exemple.objet || null, pieces: (exemple.pieces_jointes || []).map((p) => p.nom) } : {}),
  };

  // Une règle dure remplace la précédente ; les exemples s'accumulent.
  if (portee !== 'mail') {
    const cle = portee === 'domaine' ? { domaine: donnees.domaine } : { email: adresse };
    const existant = Records.filter('RegleTriMail', cle).find((r) => r.portee !== 'mail');
    if (existant) {
      Records.update('RegleTriMail', existant.id, donnees);
      return { ok: true, regle: donnees };
    }
  }
  Records.create('RegleTriMail', donnees);
  return { ok: true, regle: donnees };
}

/**
 * Les corrections récentes, données en exemple au modèle. Un exemple portant
 * sur un mail précis vaut mieux qu'une adresse : c'est le motif qui apprend.
 */
function exemplesRecents(limite = 12) {
  return Records.list('RegleTriMail')
    .sort((a, b) => String(b.le || '').localeCompare(String(a.le || '')))
    .slice(0, limite)
    .map((r) => {
      const quoi = r.objet ? `« ${r.objet} »` : r.email || `@${r.domaine}`;
      const pieces = r.pieces?.length ? ` [${r.pieces.join(', ')}]` : '';
      return `${quoi}${pieces} → ${r.decision === 'garder' ? 'PERTINENT' : 'NON PERTINENT'}${r.motif ? ` (${r.motif})` : ''}`;
    });
}

/** Le référentiel, chargé une fois par relève plutôt qu'une fois par mail. */
export function referentielTri() {
  const internes = adressesInternes();
  // Le domaine de l'équipe se déduit des comptes connectés si rien n'est déclaré.
  const domaines = new Set(DOMAINES_INTERNES);
  if (!domaines.size) {
    for (const email of internes) {
      const d = domaineDe(email);
      // Les boîtes grand public ne définissent pas un domaine d'équipe.
      if (d && !['gmail.com', 'outlook.com', 'hotmail.com', 'yahoo.fr', 'yahoo.com'].includes(d)) {
        domaines.add(d);
      }
    }
  }
  return {
    internes,
    domaines,
    agents: adressesAgents(),
    attendus: agentsAttendus(),
    ignores: new Set(EXPEDITEURS_IGNORES),
    apprises: reglesApprises(),
    exemples: exemplesRecents(),
  };
}

/**
 * Ce mail concerne-t-il un dossier ?
 * @param {{de_email, objet, extrait, pieces_jointes}} mail
 * @param {object} ref - referentielTri()
 * @returns {{ garder: boolean, raison: string }}
 */
export function trierMail(mail, ref) {
  const email = String(mail.de_email || '').toLowerCase();
  const domaine = domaineDe(email);

  if (!email) return { garder: false, raison: 'expéditeur illisible' };

  // A. Ce que l'équipe a tranché prime sur tout le reste.
  const apprise = ref.apprises?.parEmail.get(email) || (domaine ? ref.apprises?.parDomaine.get(domaine) : null);
  if (apprise) {
    return {
      garder: apprise.decision === 'garder',
      raison: apprise.decision === 'garder' ? 'jugé pertinent par l\'équipe' : 'écarté par l\'équipe',
    };
  }

  // B. Les règles gratuites.
  if (ref.ignores.has(email)) return { garder: false, raison: 'expéditeur ignoré' };
  if (ref.internes.has(email)) return { garder: false, raison: 'échange interne' };
  if (domaine && ref.domaines.has(domaine)) return { garder: false, raison: 'échange interne' };
  // Une réponse attendue passe telle quelle. Un agent connu qui écrit hors
  // dossier, lui, est examiné comme les autres : il envoie de bons biens ET des
  // mails sans intérêt, et les deux ne se valent pas.
  if (ref.attendus?.has(email)) return { garder: true, raison: 'réponse attendue' };

  const pieces = (mail.pieces_jointes || []).filter(
    (p) => PIECES_UTILES.test(p.nom || '') && !PIECES_INUTILES.test(p.nom || '')
  );
  const texte = norm(`${mail.objet || ''} ${mail.extrait || ''}`);
  const mot = MOTS_METIER.find((m) => texte.includes(norm(m)));

  // Aucun signal : inutile de déranger le modèle, même pour un agent connu.
  if (!pieces.length && !mot) return { garder: false, raison: 'sans rapport apparent' };

  // C. Un signal, mais lequel ? Une pièce jointe peut être un bail comme un
  // RIB. C'est le seul cas où l'on paie une lecture.
  return {
    garder: true,
    incertain: true,
    raison: pieces.length ? `pièce jointe (${pieces[0].nom})` : `objet : « ${mot} »`,
    indices: { pieces: pieces.map((p) => p.nom), mot },
  };
}

const SCHEMA_JUGEMENT = {
  type: 'object',
  properties: {
    transmet_un_bien: {
      type: 'boolean',
      description: "true si le mail transmet un bien à étudier ou des documents s'y rapportant",
    },
    motif: { type: 'string', description: 'Six mots maximum, en français.' },
  },
  required: ['transmet_un_bien', 'motif'],
};

/**
 * Lecture du mail par le modèle, pour les seuls cas douteux.
 * En cas d'indisponibilité, on garde le mail : mieux vaut un mail de trop
 * qu'une fiche manquée — l'équipe tranchera d'un clic.
 * @returns {{ garder: boolean, raison: string }}
 */
export async function jugerParIA(mail, ref) {
  if (!llmEnabled) return { garder: true, raison: 'à vérifier' };

  const exemples = ref?.exemples?.length
    ? `\n\nDécisions déjà prises par l'équipe, à respecter :\n${ref.exemples.join('\n')}`
    : '';

  try {
    const r = await invokeLLM({
      prompt: `Klocka investit dans des murs commerciaux. Nous recevons des mails d'agents immobiliers qui nous transmettent des biens à étudier, et beaucoup d'autres mails sans rapport.

Ce mail transmet-il un bien à étudier, ou des documents s'y rapportant (bail, PV d'assemblée générale, règlement de copropriété, quittances, diagnostics) ?

Réponds false pour tout le reste, même avec une pièce jointe : relevé d'identité bancaire, facture, lien de signature électronique, newsletter, prise de rendez-vous, échange administratif, relance commerciale d'un prestataire.

Expéditeur : ${mail.de || mail.de_email}
Objet : ${mail.objet || '(sans objet)'}
Extrait : ${(mail.extrait || '').slice(0, 400)}
Pièces jointes : ${(mail.pieces_jointes || []).map((p) => p.nom).join(', ') || 'aucune'}${exemples}`,
      response_json_schema: SCHEMA_JUGEMENT,
    });
    return {
      garder: !!r?.transmet_un_bien,
      raison: r?.motif ? String(r.motif).slice(0, 60) : r?.transmet_un_bien ? 'transmet un bien' : 'sans rapport',
    };
  } catch {
    return { garder: true, raison: 'à vérifier' };
  }
}

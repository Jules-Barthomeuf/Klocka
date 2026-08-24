// Mail templates + prompt-driven draft composition.
//
// Templates live in the MailTemplate entity (editable from the Mails page) and
// are seeded once from the hard-coded set the app shipped with. composeMail()
// turns a free-form instruction ("envoie le template présentation à Marc de
// l'agence X") into a ready-to-send draft: it picks the template, resolves the
// recipient against the Contact book, and personalises the body.

import { Records } from './db.js';
import { invokeLLM, llmEnabled } from './llm.js';
import { listAccounts } from './email.js';

// ---------------------------------------------------------------------------
// Seeding
// ---------------------------------------------------------------------------

const DEFAULT_TEMPLATES = [
  {
    slug: 'presentation',
    titre: 'Présentation Klocka',
    description: "Présenter l'activité Klocka à un agent / apporteur d'affaires rencontré au téléphone.",
    objet: 'Présentation de notre activité – Klocka',
    contenu: `Bonjour,

Comme convenu, je vous prie de trouver ci-dessous une brève présentation de notre activité.

Je suis {{signature}}, analyste en immobilier commercial chez Klocka. Notre société, fondée en décembre 2024, est spécialisée dans l'investissement clé en main pour une clientèle de cadres supérieurs répartis dans toute la France. Nous sommes rémunérés directement par nos clients, ce qui garantit que vos honoraires ne seront pas impactés.

Concernant notre méthodologie, nous analysons principalement des murs commerciaux occupés. Nous sélectionnons et présentons un maximum de trois projets à nos clients lors de points en visioconférence afin d'assurer un taux de transformation optimal. Les documents relatifs aux dossiers restent confidentiels dans notre base de données et ne sont transmis que lorsque le client souhaite approfondir une opportunité précise.

Dans un premier temps, je vous invite à me transmettre une fiche commerciale. Je la présenterai à mes clients et, si un intérêt se manifeste, nous pourrons approfondir les échanges comme vous l'avez suggéré.

Je vous souhaite une excellente journée.

Bien cordialement,
{{signature}}`,
  },
  {
    slug: 'demande-documents',
    titre: "Suite d'appel – Demande de documents",
    description: "Demander les pièces d'un dossier (bail, RCP, PV d'AG, quittances) après un appel.",
    objet: 'Murs commerciaux - Klocka',
    contenu: `Bonjour,

Pour faire suite à notre échange téléphonique de ce jour, afin d'approfondir notre analyse nous avons besoin des éléments suivants :
- Bail
- RCP
- PV d'AG
- Quittances
- Diagnostiques (si déjà faits)

Pour rappel nous travaillons avec des mandats de recherche vos honoraires resteront inchangés.
De plus je vous transmets le cahier des charges de nos clients :
- Type de bien : Murs commerciaux occupés
- Rendement : 5-7% AEM
- Budget : 100K-3M
- Emplacement : N°1 ou n°1 bis

Bien à vous,
{{signature}}`,
  },
  {
    slug: 'presentation-cahier',
    titre: 'Présentation + Cahier des charges',
    description: "Présentation complète de l'activité accompagnée du cahier des charges clients.",
    objet: 'Présentation de notre activité et cahier des charges – Klocka',
    contenu: `Bonjour,

Suite à notre échange, je me permets de vous adresser une brève présentation de notre activité ainsi que le cahier des charges de nos clients.

Je suis {{signature}}, analyste en immobilier commercial chez Klocka. Notre société, fondée en décembre 2024, est spécialisée dans l'investissement clé en main pour une clientèle de cadres supérieurs répartis sur l'ensemble du territoire français. Nous sommes rémunérés directement par nos clients, ce qui garantit que vos honoraires ne sont pas impactés.

Dans le cadre de notre méthodologie, nous analysons principalement des murs commerciaux occupés. Nous sélectionnons et présentons un maximum de trois opportunités à nos clients lors de points en visioconférence, afin d'assurer un taux de transformation optimal. L'ensemble des documents relatifs aux dossiers reste confidentiel au sein de notre base de données et n'est transmis qu'en cas d'intérêt confirmé pour une opportunité spécifique.

À ce titre, voici le cahier des charges correspondant à la majorité de notre clientèle :
- Type de bien : murs commerciaux occupés
- Rendement : 5 % à 7 % AEM
- Budget : 100 K€ à 3 M€
- Emplacement : n°1 ou n°1 bis

Nous accompagnons également certains clients sur des opérations spécifiques avec des budgets supérieurs à 10 M€, incluant d'autres typologies d'actifs (immeubles, entrepôts, murs vacants, hôtels, etc.).

Dans un premier temps, je vous invite à me transmettre une fiche commerciale. Je pourrai ainsi la présenter à mes clients et, en cas d'intérêt, nous pourrons approfondir nos échanges comme évoqué.

Je reste bien entendu à votre disposition pour toute opportunité correspondant à ces critères.

Je vous souhaite une excellente journée.

Bien cordialement,
{{signature}}`,
  },
  {
    slug: 'loi',
    titre: "Lettre d'intention (LOI)",
    description: "Transmettre une lettre d'intention d'achat sur un bien précis.",
    objet: "Lettre d'intention d'achat – {{adresse}}",
    contenu: `Bonjour Monsieur,

Suite à nos échanges, nos clients souhaitent se positionner sur le local au {{adresse}}. Ainsi, veuillez trouver ci-joint la lettre d'intention d'achat de nos clients concernant ce local.

Je vous laisse en prendre connaissance et reste à votre disposition pour tout complément d'information ou point à éclaircir.

Cordialement,
{{signature}}`,
  },
  {
    slug: 'cahier-des-charges',
    titre: 'Cahier des charges',
    description: 'Communiquer uniquement les critères de recherche des clients Klocka.',
    objet: 'Cahier des charges – Klocka',
    contenu: `Bonjour,

Suite à notre échange je me permets donc de vous communiquer le cahier des charges de nos clients :
- Type de bien : Murs commerciaux occupés
- Rendement : 5-7% AEM
- Budget : 100K-3M
- Emplacement : N°1 ou n°1 bis
Ce cahier des charges est le gros de notre clientèle cependant nous avons également des cas particuliers avec des budgets de plus de 10M et des recherches axées sur d'autres types d'actifs (immeubles, entrepôts, murs vides, hôtels…).

N'hésitez pas à me contacter si vous avez des biens correspondant à nos critères.

Bien cordialement,
{{signature}}`,
  },
];

// Populate the entity on first boot. Safe to call on every start.
export function ensureMailTemplates() {
  if (Records.count('MailTemplate')) return;
  DEFAULT_TEMPLATES.forEach((t, i) => Records.create('MailTemplate', { ...t, ordre: i, archived: false }));
  console.log(`[mail] ${DEFAULT_TEMPLATES.length} templates initialisés.`);
}

export function listTemplates() {
  return Records.list('MailTemplate', { sort: 'ordre' }).filter((t) => !t.archived);
}

// ---------------------------------------------------------------------------
// Recipient book
// ---------------------------------------------------------------------------

function normalize(str) {
  return (str || '')
    .toString()
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9@.\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

// Flatten the two address books into one slim list for matching.
export function addressBook() {
  const out = [];
  for (const c of Records.list('Contact')) {
    if (!c.email) continue;
    out.push({
      id: c.id,
      source: 'Contact',
      nom: c.nom || c.personnes || '',
      entreprise: c.entreprise || '',
      fonction: c.fonction || '',
      email: c.email,
    });
  }
  // De-duplicate on email, keeping the first.
  const seen = new Set();
  return out.filter((c) => {
    const key = c.email.toLowerCase();
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

const EMAIL_RE = /[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/g;

// Score a contact against the instruction: how many of its name/company words
// appear in the prompt.
function matchContacts(prompt, book) {
  const q = normalize(prompt);
  const scored = book
    .map((c) => {
      const words = normalize(`${c.nom} ${c.entreprise}`).split(' ').filter((w) => w.length > 2);
      const hits = words.filter((w) => q.includes(w)).length;
      return { c, score: hits };
    })
    .filter((x) => x.score > 0)
    .sort((a, b) => b.score - a.score);
  return scored.map((x) => x.c);
}

function significantWords(str) {
  return [...new Set(normalize(str).split(' ').filter((w) => w.length > 3))];
}

function matchTemplate(prompt, templates) {
  const q = normalize(prompt);
  const scored = templates
    .map((t) => {
      const titleWords = significantWords(t.titre);
      const descWords = significantWords(t.description || '').filter((w) => !titleWords.includes(w));
      const titleHits = titleWords.filter((w) => q.includes(w)).length;
      const descHits = descWords.filter((w) => q.includes(w)).length;
      // Coverage dominates raw hit count, so "cahier des charges" beats
      // "Présentation + Cahier des charges" on the instruction "le cahier des charges".
      const coverage = titleWords.length ? titleHits / titleWords.length : 0;
      const score = titleHits || descHits ? coverage * 10 + titleHits * 2 + descHits * 0.5 : 0;
      return { t, score };
    })
    .sort((a, b) => b.score - a.score);
  return scored[0]?.score > 0 ? scored[0].t : null;
}

// ---------------------------------------------------------------------------
// Variable filling
// ---------------------------------------------------------------------------

export function fillVariables(text, vars) {
  return (text || '').replace(/\{\{\s*(\w+)\s*\}\}/g, (full, key) => {
    const v = vars[key];
    return v == null || v === '' ? full : String(v);
  });
}

// The mail is signed by whoever it is sent from, not by whoever is logged in
// (they differ when someone sends from a shared mailbox they connected).
function senderName(user, from) {
  const key = String(from || '').trim().toLowerCase();
  const account = key ? listAccounts(user?.email).find((a) => a.id === key) : null;
  if (account) return account.name;
  return user?.full_name || user?.nom || user?.email?.split('@')[0] || 'Klocka';
}

// ---------------------------------------------------------------------------
// Compose
// ---------------------------------------------------------------------------

const DRAFT_SCHEMA = {
  type: 'object',
  properties: {
    template_id: { type: 'string', description: "id du template choisi, ou chaîne vide si aucun ne convient" },
    to: { type: 'array', items: { type: 'string' }, description: 'adresses email des destinataires' },
    cc: { type: 'array', items: { type: 'string' }, description: 'adresses en copie (souvent vide)' },
    subject: { type: 'string' },
    body: { type: 'string', description: 'corps du mail en texte brut, signature incluse' },
    recipient_label: { type: 'string', description: 'nom lisible du destinataire, ex: "Marc Dupont (Agence Centrale)"' },
    warnings: {
      type: 'array',
      items: { type: 'string' },
      description: "points à vérifier avant envoi : destinataire introuvable, information manquante, etc.",
    },
  },
  required: ['template_id', 'to', 'subject', 'body'],
};

/**
 * Turn a free-form instruction into a ready-to-send draft.
 * @param {object} params
 * @param {string} params.prompt - e.g. "envoie le template présentation à Marc"
 * @param {string} [params.from] - sender account id; drives the signature
 * @param {object} ctx
 * @param {object} ctx.user - current user, fallback for the signature
 */
export async function composeMail({ prompt, from } = {}, { user } = {}) {
  const instruction = (prompt || '').trim();
  if (!instruction) return { success: false, error: 'Indiquez ce que vous voulez envoyer et à qui.' };

  const templates = listTemplates();
  if (!templates.length) {
    return { success: false, error: 'Aucun template disponible. Créez-en un dans l’onglet Templates.' };
  }

  const book = addressBook();
  const explicitEmails = instruction.match(EMAIL_RE) || [];
  const signature = senderName(user, from);

  const draft = llmEnabled
    ? await composeWithAI({ instruction, templates, book, signature, explicitEmails })
    : null;

  const result = draft || composeWithoutAI({ instruction, templates, book, signature, explicitEmails });
  if (result.success) result.draft.from = from || null;
  return result;
}

async function composeWithAI({ instruction, templates, book, signature, explicitEmails }) {
  // Pre-filter the address book so a large CRM doesn't blow up the prompt.
  const candidates = matchContacts(instruction, book);
  const shortlist = (candidates.length ? candidates : book).slice(0, 60);

  const prompt = `Tu es l'assistant mail de Klocka (investissement en murs commerciaux).
À partir de l'instruction de l'utilisateur, prépare un brouillon d'email prêt à envoyer.

INSTRUCTION DE L'UTILISATEUR :
"""${instruction}"""

EXPÉDITEUR : ${signature}

TEMPLATES DISPONIBLES :
${templates
  .map(
    (t) => `--- id: ${t.id}
titre: ${t.titre}
usage: ${t.description || '—'}
objet: ${t.objet}
corps:
${t.contenu}
---`
  )
  .join('\n')}

CARNET D'ADRESSES (destinataires possibles) :
${shortlist.map((c) => `- ${c.nom}${c.entreprise ? ` | ${c.entreprise}` : ''}${c.fonction ? ` | ${c.fonction}` : ''} | ${c.email}`).join('\n') || '(vide)'}

RÈGLES :
1. Choisis le template le plus pertinent et renvoie son id exact dans template_id.
2. Résous le destinataire : si l'instruction contient une adresse email, utilise-la telle quelle. Sinon cherche la personne dans le carnet d'adresses (nom, prénom, société). Si tu ne trouves pas, laisse "to" vide et ajoute un warning explicite.
3. Pars du corps du template et garde son ton, sa structure et ses arguments. Remplace toutes les variables {{...}} par les valeurs réelles ({{signature}} = ${signature}).
4. Si le template mentionne le nom d'un autre analyste, remplace-le par ${signature}.
5. Personnalise avec les éléments donnés dans l'instruction (nom du destinataire dans la formule d'appel, adresse du bien, montant, contexte de l'échange…). N'invente jamais un fait qui n'est ni dans le template ni dans l'instruction : si une information manque, laisse le repère entre crochets et signale-le dans warnings.
6. Le corps est en texte brut (pas de markdown, pas de HTML) et se termine par la signature.
7. Rédige en français, vouvoiement.`;

  try {
    const raw = await invokeLLM({ prompt, response_json_schema: DRAFT_SCHEMA });
    if (!raw || typeof raw !== 'object' || !raw.body) return null;

    const template = templates.find((t) => t.id === raw.template_id) || null;
    const to = (Array.isArray(raw.to) ? raw.to : [raw.to]).filter(Boolean);
    const warnings = Array.isArray(raw.warnings) ? raw.warnings.filter(Boolean) : [];
    const finalTo = to.length ? to : explicitEmails;
    if (!finalTo.length && !warnings.length) warnings.push("Destinataire introuvable : renseignez l'adresse manuellement.");

    return {
      success: true,
      ai: true,
      draft: {
        to: finalTo,
        cc: (Array.isArray(raw.cc) ? raw.cc : []).filter(Boolean),
        subject: fillVariables(raw.subject || template?.objet || '', { signature }),
        body: fillVariables(raw.body, { signature }),
        template_id: template?.id || null,
        template_titre: template?.titre || null,
      },
      recipient_label: raw.recipient_label || finalTo.join(', '),
      warnings,
    };
  } catch (e) {
    console.error('[mail] composition IA échouée:', e?.message || e);
    return null;
  }
}

// Keyword fallback so the page stays usable without any LLM key configured.
function composeWithoutAI({ instruction, templates, book, signature, explicitEmails }) {
  const template = matchTemplate(instruction, templates);
  const warnings = [];

  if (!template) {
    return {
      success: false,
      error: "Aucun template ne correspond à votre demande. Précisez son nom (ex : « envoie le template présentation à ... »).",
    };
  }

  const matched = matchContacts(instruction, book);
  const to = explicitEmails.length ? explicitEmails : matched.slice(0, 1).map((c) => c.email);
  if (!to.length) warnings.push("Destinataire introuvable : renseignez l'adresse manuellement.");

  const contact = matched[0] || null;
  const vars = {
    signature,
    nom: contact?.nom || '',
    entreprise: contact?.entreprise || '',
  };

  const body = fillVariables(template.contenu, vars);
  const remaining = body.match(/\{\{\s*\w+\s*\}\}/g);
  if (remaining) warnings.push(`Variables à compléter : ${[...new Set(remaining)].join(', ')}`);
  warnings.push('IA non configurée : le template est envoyé tel quel, sans personnalisation.');

  return {
    success: true,
    ai: false,
    draft: {
      to,
      cc: [],
      subject: fillVariables(template.objet, vars),
      body,
      template_id: template.id,
      template_titre: template.titre,
    },
    recipient_label: contact ? `${contact.nom}${contact.entreprise ? ` (${contact.entreprise})` : ''}` : to.join(', '),
    warnings,
  };
}

// L'assistant de l'extension (28 nov. 2026, Jules : « l'assistant de l'extension est connecté à la plateforme, comme
// notre assistant actuel » ; « il a accès à tous les dossiers, et à toutes les conversations WhatsApp qu'on a
// activées » ; « je suis sur la conversation de Paul, je lui dis : écris un message à Paul pour lui demander des
// précisions sur la question de Christophe Lepas ; ça va lire la conversation de Christophe, revient sur celle de Paul et
// drafte le message »). Le même moteur que le chat de la plateforme (repondreApp), avec tous ses outils, plus trois
// outils que le NAVIGATEUR exécute : le serveur les demande à l'extension par le flux et attend sa réponse.

import { randomBytes } from 'crypto';
import { consigneRegistre, lignesDeStyle } from '../fiche-dossier/repondre.js';

export const OUTILS_NAVIGATEUR = [
  {
    name: 'lire_conversation_whatsapp',
    description: "Lit une autre conversation WhatsApp Web, parmi celles que la personne a activées dans l'extension (liste dans la consigne). L'extension ouvre la conversation, lit les messages chargés à l'écran, puis revient sur celle d'où l'on parle. Pas pour la conversation ouverte : elle est déjà dans la consigne.",
    input_schema: {
      type: 'object',
      properties: { nom: { type: 'string', description: 'le nom de la conversation, tel que dans la liste des conversations activées' } },
      required: ['nom'],
    },
  },
  {
    name: 'poser_brouillon',
    description: "Écrit un message dans la case de réponse de la conversation ouverte (WhatsApp Web) ou du mail ouvert (Gmail). Rien ne part : la personne relit et envoie elle-même. Le texte complet, prêt à envoyer, à sa place et à la première personne ; aucun avis ni jugement qu'elle n'a pas donné ; tutoyer ou vouvoyer comme la personne le fait dans SES messages (la consigne le dit), jamais d'après l'autre ; pour un mail, sans objet ni signature. Après, ne recopie pas le texte dans ta réponse : dis en une ligne que c'est posé.",
    input_schema: {
      type: 'object',
      properties: { texte: { type: 'string', description: 'le message, prêt à envoyer' } },
      required: ['texte'],
    },
  },
  {
    name: 'ranger_conversation',
    description: "Range dans Klocka ce que dit la conversation WhatsApp ouverte : mises à jour des fiches (agents, clients, biens), choses à faire, rappels. L'extension montre la proposition à la personne, qui coche puis valide : rien n'est rangé avant. À utiliser quand on te demande de garder, noter, ranger, mettre à jour une fiche ou ajouter à la liste à faire à partir de cette conversation.",
    input_schema: {
      type: 'object',
      properties: { demande: { type: 'string', description: 'ce que la personne a demandé de ranger, avec ses mots (facultatif)' } },
    },
  },
];

const NOMS = new Set(OUTILS_NAVIGATEUR.map((o) => o.name));
export const estOutilNavigateur = (nom) => NOMS.has(nom);

export const LIBELLES_NAVIGATEUR = {
  lire_conversation_whatsapp: (i) => `Je lis la conversation avec ${i?.nom || 'ce contact'}`,
  poser_brouillon: () => "J'écris le message dans la case de réponse",
  ranger_conversation: () => 'Je regarde ce qui revient à chaque fiche',
};

const propre = (t, n) => String(t ?? '').replace(/\r/g, '').trim().slice(0, n);

/** La consigne propre à l'extension : où l'on est, la conversation ouverte, celles qu'on peut lire. */
export function cadreExtension(contexte = {}) {
  const mail = contexte.canal === 'mail';
  const titre = propre(contexte.titre, 160);
  const fil = propre(contexte.fil, 12000);
  const autres = (Array.isArray(contexte.conversations) ? contexte.conversations : []).map((c) => propre(c, 120)).filter((c) => c && c !== titre).slice(0, 60);
  return [
    '',
    '',
    `TU ES DANS L'EXTENSION KLOCKA DU NAVIGATEUR, avec ${propre(contexte.moi, 80) || 'un membre de l\'équipe'}, un petit chat ouvert à côté ${mail ? "d'un mail ouvert dans Gmail" : "d'une conversation WhatsApp Web"}${titre ? ` : « ${titre} »` : ''}. Tu as tous tes outils de la plateforme (dossiers, projets, fiches, rappels, notes…) et trois de plus, que le navigateur exécute :`,
    mail
      ? '- poser_brouillon : écrire la réponse dans le mail ouvert ; rien ne part.'
      : "- poser_brouillon : écrire un message dans la case de cette conversation ; rien ne part.\n- lire_conversation_whatsapp : lire une autre conversation activée (« la question de Christophe » : lis la conversation de Christophe avant d'écrire).\n- ranger_conversation : garder dans Klocka ce que dit cette conversation, avec le OK de la personne.",
    "Réponds court : une ou deux phrases, en tutoyant, sans markdown. Un message à écrire passe par poser_brouillon ; ensuite ta réponse tient en une phrase (« C'est dans la case, à relire. »), sans recopier ni résumer le message : la personne le lit dans la case. Ajoute une phrase seulement si tu as un doute à signaler (un nom, un dossier, un chiffre incertain). Une question sur un dossier, un projet ou une personne : cherche dans la plateforme avec tes outils, comme dans le chat de Klocka.",
    mail ? 'Une fiche reçue par mail ne se range pas ici : elle se transfère à sourcing@, comme à un collègue.' : '',
    !mail && autres.length ? `Conversations WhatsApp activées que tu peux lire : ${autres.map((c) => `« ${c} »`).join(', ')}. Les autres, tu ne les vois pas : si on t'en demande une, dis qu'il faut l'activer dans l'extension.` : '',
    !mail && !autres.length ? "Aucune autre conversation WhatsApp n'est activée : tu ne lis que celle-ci." : '',
    '',
    `Pour un message à poser dans ce fil : ${consigneRegistre(fil)}`,
    ...lignesDeStyle(contexte.style),
    '',
    mail ? 'LE FIL OUVERT, du plus ancien au plus récent (« De : Vous » : ses mails) :' : `LA CONVERSATION OUVERTE, du plus ancien au plus récent. « Vous » : la personne qui te parle${contexte.moi ? ` (${propre(contexte.moi, 80)})` : ''} ; tous les autres noms sont d'autres personnes, jamais elle. Sans ligne « Vous », elle n'a rien écrit dans ce qui est à l'écran : ne la confonds avec personne.`,
    fil || '(rien à lire à l\'écran)',
  ].filter((l) => l !== null).join('\n');
}

// Les outils demandés au navigateur, en attente de sa réponse : un par identifiant, pour la personne qui l'a lancé.
const EN_ATTENTE = new Map();
const DELAI = 90000;

/** Demande un outil au navigateur par le flux (`envoyer`), et attend la réponse que l'extension poste. */
export function demanderAuNavigateur(appel, email, envoyer, { delai = DELAI } = {}) {
  return new Promise((resoudre) => {
    const id = randomBytes(9).toString('hex');
    const minuterie = setTimeout(() => {
      if (EN_ATTENTE.delete(id)) resoudre({ ok: false, error: "L'extension n'a pas répondu (fenêtre fermée ou page changée)." });
    }, delai);
    EN_ATTENTE.set(id, { email: String(email || '').toLowerCase(), resoudre: (r) => { clearTimeout(minuterie); resoudre(r); } });
    envoyer({ outil_navigateur: { id, nom: appel.name, input: appel.input || {} } });
  });
}

/** La réponse de l'extension à un outil demandé ; faux si l'identifiant est inconnu ou n'est pas à cette personne. */
export function reponseDuNavigateur(id, email, resultat) {
  const a = EN_ATTENTE.get(String(id || ''));
  if (!a || a.email !== String(email || '').toLowerCase()) return false;
  EN_ATTENTE.delete(String(id));
  a.resoudre(resultat && typeof resultat === 'object' ? resultat : { ok: false, error: 'Réponse vide.' });
  return true;
}

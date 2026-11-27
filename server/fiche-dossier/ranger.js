// « Ce que j'en retiens » (19 nov. 2026) : une note écrite en vrac et liée à des fiches, lue par le modèle, rendue en
// mises à jour, décisions et leur raison, ressentis sur les personnes, actions datées (avec un message prêt quand il
// s'agit d'écrire à quelqu'un) et questions. Rien n'est rangé ici : la proposition attend le OK de la personne
// (modele.js, rangerNote). Une demande faite à l'assistant (« fais la LOI ») n'est pas une note : elle repart au chat.

import { dateDuFait } from './date-du-fait.js';
import { Records } from '../db.js';
import { invokeLLM } from '../llm.js';
import { mesurer } from '../llm-couts.js';
import { ETAPES, contexteDe, dateValide, equipe, lieesDe, lienPropre, membreDe, prenomDe, prevuesDes, styleDe, telephoneDe } from './modele.js';
import { conversationLisible, cotes, lireConversation } from './whatsapp.js';

const simple = (t) => String(t || '').normalize('NFD').replace(/\p{M}/gu, '').toLowerCase().replace(/[^a-z0-9 ]+/g, ' ').replace(/\s+/g, ' ').trim();
const propre = (t, n = 1200) => String(t ?? '').replace(/\s+/g, ' ').trim().slice(0, n);
// `profil` : comment parler à une personne (22 nov. 2026, Jules, sur les notes de Maxime : « les profils sont la vraie
// richesse ») ; `ecart` : deux sources qui se contredisent, signalé au lieu d'être tranché en silence (l'import).
const GENRES = ['evenement', 'maj', 'decision', 'negociation', 'ressenti', 'profil', 'ecart'];
export const PORTEES_REGLE = ['prospection', 'dossiers', 'general'];
const CANAUX = ['whatsapp', 'mail'];
export const GENRES_ACTION = ['whatsapp', 'mail', 'appel', 'tache', 'attente'];
// Les chiffres d'un bien qu'une note peut proposer de mettre à jour dans le projet, jamais sans accord (20 nov. 2026).
export const CHAMPS_PROJET = {
  taxe_fonciere_an: { libelle: 'la taxe foncière', unite: '€ par an', nombre: true },
  charges_copropriete: { libelle: 'les charges de copropriété', unite: '€ par an', nombre: true },
  loyer_annuel_ht: { libelle: 'le loyer', unite: '€ HT par an', nombre: true },
  surface_m2: { libelle: 'la surface', unite: 'm²', nombre: true },
  prix_acquisition: { libelle: 'le prix', unite: '€', nombre: true },
  nom_locataire: { libelle: 'le locataire' },
  activite_locataire: { libelle: "l'activité du locataire" },
  echeance_bail: { libelle: 'la fin de bail' },
};
// Où en est un client sur un bien (19 nov. 2026, Jules : la carte du dossier, un lien d'une couleur par position).
export const POSITIONS = ['presente', 'visio', 'positionne', 'offre', 'signe', 'abandon'];
const JOURS = ['dimanche', 'lundi', 'mardi', 'mercredi', 'jeudi', 'vendredi', 'samedi'];
const iso = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;

export const SCHEMA = {
  type: 'object',
  properties: {
    nature: { type: 'string', enum: ['note', 'demande'] },
    titre: { type: 'string' },
    fiches: { type: 'array', items: { type: 'object', properties: {
      lien: { type: 'string' },
      elements: { type: 'array', items: { type: 'object', properties: { genre: { type: 'string', enum: GENRES }, texte: { type: 'string' }, raison: { type: 'string' }, quand: { type: 'string' } }, required: ['genre', 'texte'] } },
      etape: { type: 'string' },
      etat: { type: 'string' },
      position: { type: 'string', enum: POSITIONS },
      position_detail: { type: 'string' },
      vendeur: { type: 'string' },
      donnees: { type: 'array', items: { type: 'object', properties: { champ: { type: 'string', enum: Object.keys(CHAMPS_PROJET) }, valeur: { type: 'string' } }, required: ['champ', 'valeur'] } },
      blocage: { type: 'string' },
      resume: { type: 'string' },
      comment_parler: { type: 'string' },
      retirer: { type: 'array', items: { type: 'string' } },
    }, required: ['lien', 'elements'] } },
    actions: { type: 'array', items: { type: 'object', properties: {
      genre: { type: 'string', enum: GENRES_ACTION },
      titre: { type: 'string' },
      pour: { type: 'string' },
      contexte: { type: 'array', items: { type: 'string' } },
      qui: { type: 'string' },
      echeance: { type: 'string' },
      liens: { type: 'array', items: { type: 'string' } },
      avant: { type: 'string' },
      brouillon: { type: 'object', properties: { canal: { type: 'string', enum: CANAUX }, a: { type: 'string' }, objet: { type: 'string' }, texte: { type: 'string' }, de_l_auteur: { type: 'boolean' } } },
    }, required: ['genre', 'titre', 'qui'] } },
    faites: { type: 'array', items: { type: 'object', properties: { action: { type: 'string' }, restees: { type: 'array', items: { type: 'string' } } }, required: ['action'] } },
    questions: { type: 'array', items: { type: 'object', properties: { texte: { type: 'string' }, lien: { type: 'string' } }, required: ['texte'] } },
    mentions: { type: 'array', items: { type: 'object', properties: { texte: { type: 'string' }, genre: { type: 'string', enum: ['bien', 'agent', 'client'] } }, required: ['texte', 'genre'] } },
    regles: { type: 'array', items: { type: 'object', properties: { texte: { type: 'string' }, portee: { type: 'string', enum: PORTEES_REGLE } }, required: ['texte'] } },
  },
  required: ['nature', 'titre', 'fiches', 'actions', 'questions', 'mentions'],
};

// Ce qu'on lit d'une conversation : les quelque 40 000 derniers caractères (de 500 à 800 messages), le plus récent.
export const LIMITE_CONVERSATION = 40000;

const GENRE_LISIBLE = { bien: 'dossier', agent: 'agent immobilier', client: 'client' };

/**
 * Ce qui est déjà lié à chaque fiche de la note, numéroté D1, D2… (24 nov. 2026, Jules : « enlève ceux-là de la fiche
 * d'Alexis ») : le modèle les nomme pour les retirer. Le même calcul sert à la consigne et à la lecture de la réponse.
 */
export function rattaches(liens) {
  const out = [];
  for (const l of liens) for (const d of lieesDe(l.cle).slice(0, 40)) out.push({ ref: `D${out.length + 1}`, de: l.cle, de_nom: l.nom, vers: d.cle, genre: d.genre, nom: d.nom });
  return out;
}

/** « Appel à Alexandre Lourenço fait », « Message à Bilel envoyé », « Reçu : le mail… », « Fait : … ». */
function faiteLisible(a) {
  if (a.genre === 'appel' && a.pour) return `Appel à ${a.pour} fait`;
  if ((a.genre === 'whatsapp' || a.genre === 'mail') && a.pour) return `${a.genre === 'mail' ? 'Mail' : 'Message'} à ${a.pour} envoyé`;
  if (a.genre === 'attente') return `Reçu : ${a.titre.replace(/^recevoir\s+/i, '')}`;
  return `Fait : ${a.titre}`;
}

/**
 * Ce que les liens disent déjà (20 nov. 2026, Jules : « la crèche est-elle bien celle présentée par Alexandre ? Bah
 * évidemment, j'ai lié cet agent ; de qui vient l'offre ? J'ai lié les clients, c'est eux ») : qui est « ils », de qui
 * vient l'offre, de quel dossier on parle. Dit en toutes lettres sous les fiches, pour ne jamais être demandé.
 */
export function dejaDit(liens) {
  const noms = (g) => liens.map((l, i) => (l.genre === g ? `${l.nom} (L${i + 1})` : null)).filter(Boolean);
  const clients = noms('client');
  const agents = noms('agent');
  const biens = noms('bien');
  const lignes = [
    clients.length ? `- ${clients.length === 1 ? `Le client lié, ${clients[0]}, est celui dont parle la note` : `Les clients liés (${clients.join(', ')}) sont ceux dont parle la note`} : « leur offre », « ils », « elle », « le client », une visite, un avis, c'est ${clients.length === 1 ? 'lui' : 'eux'}. Une offre dont la note ne dit pas l'auteur vient de ${clients.length === 1 ? 'ce client' : 'ces clients'} : pose-la sur ${clients.length === 1 ? 'sa fiche' : 'leurs fiches'} (position, étape) sans demander de qui elle vient.` : null,
    agents.length ? `- ${agents.length === 1 ? `L'agent lié, ${agents[0]}, est` : `Les agents liés (${agents.join(', ')}) sont`} celui qui a présenté le dossier dont parle la note et qui en donne les nouvelles. Un dossier que la note nomme et que sa fiche connaît (« la crèche », « le Basic Fit ») est celui-là : ne demande jamais si c'est bien lui. « Le dossier », « l'offre », « les nouvelles » sans nom : le dossier que sa fiche dit en cours (une offre attendue, une pièce promise, une visite) ; s'il n'y en a qu'un, c'est lui, sans le faire confirmer.` : null,
    biens.length ? `- ${biens.length === 1 ? `Le dossier lié, ${biens[0]}, est` : `Les dossiers liés (${biens.join(', ')}) sont`} celui dont parle la note, sauf si elle en nomme clairement un autre.` : null,
  ].filter(Boolean);
  return lignes.length ? `\nCe que les liens disent déjà, à ne jamais demander :\n${lignes.join('\n')}\n` : '';
}

/** La consigne : la date, l'auteur, l'équipe, les fiches liées avec ce qu'on en sait déjà, puis la note. */
/**
 * `libre` (22 nov. 2026) : une note collée sans « Lier » ; les fiches sont devinées par ses noms, le modèle n'y range
 * que ce qui en parle. `source` : une source passée importée en lot ({ genre, de, le, lieu }), rangée sans OK, datée
 * de son jour. `style` : les derniers messages envoyés par l'auteur, et ce qu'il a changé dans les brouillons.
 */
export function consigne(texte, liens, user, { maintenant = new Date(), conversation = null, ajout = null, connus = [], prevues = [], suite = null, transcription = false, libre = false, source = null, style = null, deja: dejaLies = null } = {}) {
  const lies = dejaLies || (source || libre ? [] : rattaches(liens));
  const auteur = prenomDe(user?.email) || 'la personne';
  const collegues = equipe().map((p) => p.prenom).filter((p) => p !== auteur);
  const conv = conversation ? conversationLisible(conversation, LIMITE_CONVERSATION) : null;
  const qui = conversation ? cotes(conversation, { equipe: equipe().map((p) => p.prenom), liens }) : null;
  const jour = (d) => new Date(d).toLocaleDateString('fr-FR', { day: 'numeric', month: 'long', year: 'numeric', timeZone: 'UTC' });
  const fiches = liens.map((l, i) => {
    const c = contexteDe(l.cle);
    const lignes = [`L${i + 1} : ${GENRE_LISIBLE[l.genre] || l.genre} « ${l.nom} »${l.detail ? ` (${l.detail})` : ''}`];
    if (c?.etape) lignes.push(`  étape : ${c.etape}${c.etat ? ` (${c.etat})` : ''}`);
    if (c?.resume) lignes.push(`  ce qu'on en sait : ${c.resume}`);
    if (c?.blocage) lignes.push(`  blocage : ${c.blocage}`);
    const siennes = prevues.filter((a) => a.fiches.includes(l.cle)).map((a) => a.ref);
    if (siennes.length) lignes.push(`  actions déjà prévues : ${siennes.join(', ')}`);
    else if (c?.actions_ouvertes?.length) lignes.push(`  actions déjà prévues : ${c.actions_ouvertes.join(' ; ')}`);
    if (c?.decisions?.length) lignes.push(`  décisions passées : ${c.decisions.join(' ; ')}`);
    const siens = lies.filter((d) => d.de === l.cle);
    if (siens.length) lignes.push(`  déjà liés à cette fiche : ${siens.map((d) => `${d.ref} ${GENRE_LISIBLE[d.genre] || d.genre} « ${d.nom} »`).join(' ; ')}`);
    return lignes.join('\n');
  }).join('\n');
  const deQui = source?.de || auteur;
  const entete = source
    ? `Voici ${conv ? `une conversation WhatsApp (${conversation.messages.length} messages, du ${jour(conversation.du)} au ${jour(conversation.au)})` : `un message de ${deQui} du ${jour(source.le)}`}${source.lieu ? ` (${source.lieu})` : ''}, importé en lot pour remplir les fiches. C'est une source passée : tu ranges ce qu'elle apprend, daté de son jour ; rien n'est demandé à personne, l'analyste relira la fiche ensuite.${conv ? `\nQui parle : ${[qui.nous.length ? `de notre côté (équipe Klocka) : ${qui.nous.join(', ')}` : null, qui.eux.length ? `en face : ${qui.eux.join(', ')}` : null, qui.autres.length ? `à reconnaître : ${qui.autres.join(', ')}` : null].filter(Boolean).join(' ; ')}. Ce que dit la personne en face est un fait sur elle ou sur le dossier ; ce que nous lui avons écrit n'est pas un fait appris, sauf un engagement pris. Date les faits qui comptent avec le jour du message.` : ''}
`
    : conv
    ? `${auteur} a collé une conversation WhatsApp (${conversation.messages.length} messages, du ${jour(conversation.du)} au ${jour(conversation.au)}) et l'a liée à des fiches. Tu ranges ce qu'elle apprend ; rien n'est enregistré avant son OK.
Qui parle : ${[qui.nous.length ? `de notre côté (équipe Klocka) : ${qui.nous.join(', ')}` : null, qui.eux.length ? `en face (les personnes liées) : ${qui.eux.join(', ')}` : null, qui.autres.length ? `à reconnaître : ${qui.autres.join(', ')} (celui qui écrit au nom de Klocka est sans doute ${auteur} ; les autres sont en face)` : null].filter(Boolean).join(' ; ')}.
Lire une conversation : ce que dit la personne en face est un fait sur elle ou sur le dossier (« selon Alexandre, … ») ; ce que nous lui avons écrit n'est pas un fait appris, sauf un engagement pris. Date les faits qui comptent avec le jour du message (« le 12 nov., Alexandre a promis le bail pour vendredi »). Ne recopie pas la conversation : garde ce qu'un collègue doit savoir. Les actions : ce qui reste ouvert à la fin (une promesse non tenue, une question sans réponse, une pièce attendue). Un message WhatsApp proposé fait suite au dernier message, sur le ton de la conversation (tutoiement si elle tutoie). Le ressenti sur la personne se tire de sa façon de répondre (délais, précision, ton).
`
    : transcription
      ? `${auteur} a enregistré son appel au téléphone, lié à des fiches ; voici sa transcription automatique : les deux voix mêlées, sans dire qui parle, des mots parfois mal entendus. Retrouve qui dit quoi au sens des phrases, garde seulement ce qui est sûr (un chiffre mal entendu se pose en question), ne recopie pas l'échange. Tu ranges ce qu'il apprend ; rien n'est enregistré avant son OK.
`
      : `${auteur} vient d'écrire une note en vrac, pendant ou juste après un échange, et l'a liée à des fiches. Tu ranges ce qu'elle contient ; rien n'est enregistré avant son OK.
`;
  // La note prise depuis la fiche d'appel d'une relance (20 nov. 2026, Jules) : c'est le compte rendu de cet appel.
  const suivie = suite ? prevues.find((a) => a.id === suite) : null;
  return `Tu es l'assistant de l'équipe Klocka (investissement en murs de commerce). ${entete}

Aujourd'hui : ${JOURS[maintenant.getDay()]} ${iso(maintenant)}. Auteur : ${auteur}. Ses collègues : ${collegues.join(', ') || 'aucun'}.
Étapes habituelles d'un dossier, des repères et pas une liste fermée : ${ETAPES.join(', ')}.

${libre ? 'Fiches que les noms de la note évoquent (devinées)' : 'Fiches liées'} :
${fiches || '(aucune)'}
${libre ? '' : dejaDit(liens)}${prevues.length ? `\nActions déjà prévues, encore ouvertes :\n${prevues.map((a) => `${a.ref} : ${a.titre}${a.echeance ? ` (pour le ${a.echeance})` : ''}${a.contexte.length ? `\n${a.contexte.map((q) => `    - ${q}`).join('\n')}` : ''}`).join('\n')}\n` : ''}${suivie ? `\n${transcription ? 'Cet enregistrement' : 'Cette note'} est le compte rendu de l'action ${suivie.ref}, prise depuis sa fiche d'appel : mets-la dans faites, sauf si la note dit que personne n'a répondu.\n` : ''}${connus.length ? `\nPersonnes que la note nomme, connues de Klocka sans être liées (ne demande jamais qui elles sont ; si deux portent le même prénom, tu peux demander laquelle) :\n${connus.map((c) => `- ${c.nom} : ${GENRE_LISIBLE[c.genre] || c.genre}${c.detail && c.detail !== 'Twenty CRM' ? ` (${c.detail})` : ''}`).join('\n')}\n` : ''}
Règles :
- nature : ${conv ? "« note », toujours : une conversation collée n'est jamais une demande, même si elle finit sur une question." : source ? "« note », toujours." : "« demande » seulement si le texte demande à l'assistant de faire ou de répondre quelque chose maintenant (une question, « fais la LOI », « fais l'analyse »). Une demande d'écrire à quelqu'un (« réponds à Étienne sur la fissure », « fais le mail à l'agent pour les PV d'AG ») est une « note » : tu écris le message (voir Les messages). Une note qui contient des choses à faire reste une « note »."}
- Une note peut tout mêler (22 nov. 2026, Jules : les notes de Maxime) : plusieurs dossiers, des choses à faire, des messages, des faits, des profils, sans date ni rattachement. Découpe-la en morceaux et range chacun là où il va.${libre ? `
- Les fiches ci-dessus sont DEVINÉES par les noms de la note : personne ne les a choisies. Range un morceau sur l'une d'elles seulement si ce morceau en parle vraiment (son nom, son adresse, sa ville, une personne qui y est liée). Un morceau dont rien ne dit de quel dossier ou de quelle personne il parle (des chiffres sans nom de bien juste après un autre dossier, une personne qu'on ne sait pas classer client ou agent) : ne le range nulle part, pose la question (« Le droit d'entrée de 30 k€ et les 318 k€ FAI : c'est quel bien ? », « Sarra Gendre : cliente ou agente ? »). Les variantes d'un même nom (Matis, Matiss) sont la même personne. Un dossier ou une personne nommés qui ne sont pas parmi ces fiches : dans mentions.` : ''}${source ? `
- Une source passée (l'import) : les consignes qu'elle donne (« relance Sougiron », « tiens Paul informé », « rentre le dossier ») sont passées ; ce ne sont pas des actions : écris-les en evenement ou maj datés (« Le 30 oct., Nora demande de relancer Sougiron, qui a lu sans répondre »). actions : une liste vide. questions : une liste vide ; ce qui est incertain s'écrit sans le détail incertain, ou pas du tout. Ce qui ne touche aucun dossier ni aucune personne (un souci de la plateforme, une plaisanterie, l'organisation de l'équipe) : rien. Un fait qui contredit ce que la fiche sait déjà : garde le plus récent, et ajoute un élément ecart qui dit les deux (« Écart : le récap du 30 oct. dit 280 à 300 k€, la fiche disait 320 k€ »).` : ''}
- fiches : une entrée par fiche liée touchée par la note (lien = L1, L2…). Dans elements :
  - evenement : ce qui s'est passé, vu de cette fiche, en une ligne sans date dans le texte : c'est la ligne de l'historique de la fiche. « Appel avec Sébastien Robic à propos de la taxe foncière », « Visio de présentation de Comtesse du Barry », « Présentation à Adrien Mina et Claire Dumas », « Demande de documents par la banque », « Thomas Nguyen ne poursuit pas : rendement trop bas », « Annonce d'un local à Vannes par Sébastien Robic », « Visite avec Rachel », « Coralie reprend le dossier », « Dossier mis en stand-by ». Un seul par fiche touchée, sur chaque fiche touchée, dès que la note rapporte un échange qui a eu lieu, une visite faite, une décision ou un changement ; aucun si elle ne rapporte rien qui se soit passé.
    quand : les mots de la note qui disent quand c'est arrivé, recopiés tels quels (« mardi », « hier », « le 12 novembre », « ce matin »), si elle le dit ; sinon rien (la ligne prend le jour de la note). Ne calcule pas de date : le code la calcule.
  Une note qui prépare un appel ou un message (des questions à poser, ce qu'on va dire : « est-ce que vos honoraires sont inclus ? », « le loyer HC HT ? ») n'est pas un échange : aucun événement, aucun fait, rien dans l'historique (20 nov. 2026, Jules). Elle donne une action « appel » vers la personne (ou « whatsapp » si elle répond mieux par message), avec en contexte chaque question telle qu'elle sera posée et ce qu'on doit lui dire ; l'avis qu'on a sur un dossier (« crèche intéressante avec négociation ») est un ressenti sur ce dossier s'il est lié, sinon sur la fiche de la personne, et devient aussi un point à dire pendant l'appel (« Lui dire que la crèche nous intéresse, sous réserve de négociation »).
  - maj : un fait appris ou qui change (prix, document reçu, ce qu'a dit quelqu'un, état du bien). Une phrase qui se comprend seule par un collègue absent, chiffres exacts, qui l'a dit s'il est connu et que ce n'est pas l'auteur (« selon Bilel, … »).
  - decision : ce qui a été décidé, et dans raison le pourquoi s'il est dit (sinon pas de raison). C'est ce qui se perd le plus vite : ne le manque pas.
  - negociation : sur un bien, ce qui touche au prix : une offre, une contre-offre, le prix visé, la marge perçue, une condition posée (« Offre de 600 k€ envoyée », « le vendeur descend à 290 k€ si la LOI est signée avant fin novembre »).
  - ressenti : l'impression laissée, une note libre qui n'est ni un fait ni une action : sur une personne (« un peu lent mais fiable », « optimiste », « réservée : trouve le loyer trop bas pour le prix », « raisonne comme un banquier, prudent », « ne répond jamais au téléphone, préfère WhatsApp », « ne verra le local qu'en photo ») ou sur un dossier (« très bon projet, pile dans nos critères », « bonne rue, beaucoup de passage », « le local de Vannes a l'air intéressant », la raison d'une mise en stand-by). Elle va dans l'onglet Notes de la fiche, et le résumé la reprend.
  Ce qu'une personne dit d'un bien va sur le bien ; l'impression sur la personne va sur la personne. N'invente rien, ne répète pas un même fait sur deux fiches. Ce que tu poses en question ne s'écrit jamais comme un fait : si tu demandes qui a dit quelque chose, le fait ne dit pas « selon X » ; si tu demandes qui est quelqu'un, le fait ne le nomme pas.
  - etape : sur un bien ou sur un client. Sur un client, où il en est dans sa recherche, en un à trois mots (« En recherche », « Projet présenté », « Visio faite », « Offre », « Projet signé », « En pause ») ; ce qu'il en est de chaque bien passe par position. Sur un bien, seulement si la note dit où en est vraiment le dossier, sinon rien. Un dossier qu'on décide de ne plus présenter : « Stand-by », et dans etat la raison en quelques mots. Un à trois mots : une étape habituelle quand l'une convient (« Visios » quand une visio de présentation a eu lieu avec le client), sinon les mots de la note (« Offre », « Préparation de l'offre », « Contre-visite »). La négociation est une étape : une offre envoyée donne « Offre », même si la plateforme en est encore à « Projet ».
  - position : sur la fiche d'un client seulement, où il en est sur le bien lié : « presente » (on le lui a présenté), « visio » (la visio de présentation a eu lieu), « positionne » (il veut y aller, sans offre encore), « offre » (il a fait une offre ou une LOI), « signe » (compromis ou acte), « abandon » (il ne poursuit pas). Seulement si la note le dit ou le montre, sinon rien. position_detail : le détail qui compte en trois à cinq mots, si la note le dit (« à 600 k€ », « bail trop court », « rendement trop bas »), sinon rien.
  - donnees : sur un bien seulement, les chiffres et faits que la note donne et qui changent la fiche du bien : ${Object.keys(CHAMPS_PROJET).join(', ')} ; valeur telle que dite (« 2 400 », « 45 », « Boulangerie Martin »). Ils seront proposés à la mise à jour du projet, jamais écrits sans accord ; le fait va aussi en maj.
  - vendeur : sur un bien seulement, qui vend si la note le dit, en quelques mots (« les vendeurs, en indivision », « M. Le Goff »), sinon rien.
  - etat : ce qui reste en suspens sur cette étape, en quelques mots, si la note le dit (« non contresignée pour l'instant », « en attente de l'accord de la banque »), sinon rien.
  - blocage : ce qui bloque le dossier si la note le dit ; une chaîne vide seulement si elle dit qu'un blocage est levé ; sinon rien.
  - Une présentation à des clients : sur le bien, l'événement « Présentation à X et Y » et une action « Suivre la décision de X et de Y » ; sur chaque client, l'événement « Visio de présentation de [bien] » (ou « Présentation de [bien] »), etape « Projet présenté », sa position et son ressenti. Un client qui refuse : position « abandon » avec la raison en position_detail, l'événement sur les deux fiches.
  - resume : le nouveau résumé de la fiche, fait de ce qu'on en savait et de la note : six à neuf phrases, cent quatre-vingts mots au plus (19 nov. 2026, Jules : un résumé un peu plus long). Pour un bien : ce qu'il est, ce qui compte dans le dossier (prix, locataire, offre), où on en est et ce qu'on attend. Pour une personne : qui elle est, comment on travaille avec elle, les dossiers en cours avec elle, où en est la relation.
- actions : tout ce qu'il reste à faire, une par chose. titre commence par un verbe et se comprend seul (« Demander à Paul si on creuse la cave à vin Paris III sans négociation »).
  - genre : « whatsapp » ou « mail » quand il faut écrire à une personne extérieure et que la note suffit à l'écrire : titre « Écrire un message WhatsApp à Bilel », pour = la personne, brouillon (canal = le genre ; a = la personne ; texte = le message prêt à coller, court, naturel, au nom de ${auteur}, tutoiement si la note tutoie la personne, sinon vouvoiement, sans formule creuse ; WhatsApp par défaut, mail si la note le dit). « appel » pour une relance : appeler quelqu'un pour obtenir ou vérifier quelque chose ; titre « Relance : appeler Bilel pour … », pour = la personne, contexte = les questions à lui poser, une par point, telles qu'on les poserait : toutes celles que la note prépare (jusqu'à dix, sans en fusionner ni en perdre), sinon deux à quatre points courts de ce qu'il faut obtenir ou dire (et, si un message part à la même personne, ce que le message a déjà demandé). Quand un message part à quelqu'un et que la note demande aussi de vérifier ou d'obtenir de lui quelque chose de précis, propose en plus cette relance avec son contexte. « tache » pour le reste (parler à un collègue, vérifier un document, rentrer un dossier, « une fois la fiche reçue, la pré-analyser »). « attente » quand quelqu'un promet d'envoyer ou de faire quelque chose (« il me l'envoie par mail demain ») : titre « Recevoir le mail de Sébastien Robic avec la taxe foncière », echeance = la date promise, qui = moi ; propose alors en plus une relance au cas où (« appel », ou « whatsapp » si la note dit que la personne répond mieux par message ; titre « Relancer Sébastien Robic si la taxe foncière n'est pas arrivée »), sans échéance : on demandera quand. Quelqu'un qui ne répond pas au téléphone se relance par WhatsApp.
  - qui : « assistant » pour un message ou un mail que tu as écrit ; « moi » pour ${auteur} ; le prénom d'un collègue si la note dit que c'est à lui de faire.
  - echeance : la date ISO si la note en donne une (« lundi », « demain », « avant vendredi »), sinon rien. N'invente pas de date.
  - liens : les fiches concernées (L1…) : le bien ET la personne de l'action (« rappeler Paul pour le local de Nice » : le bien et Paul) ; une liste vide si l'action parle d'un dossier qui n'est pas lié (il va alors dans mentions).
- Les messages (22 nov. 2026, Jules : « que Maxime écrive ou demande, on arrive au même endroit »), trois cas, sans demander lequel :
  - un message écrit par ${auteur} à quelqu'un (« Bonjour à tous, voici un point sur… », une réponse à un client) : une action whatsapp ou mail ; brouillon.texte = son message MOT POUR MOT, de_l_auteur = vrai ; qui = moi ; pour = le destinataire si on le sait. Il n'entre dans l'historique qu'une fois envoyé : aucun evenement pour lui. Les faits qu'il apprend (« l'ensemble des travaux a été réalisé, mainlevée de l'arrêté ») vont en maj sur la fiche.
  - une demande d'écrire (« réponds à Étienne sur la fissure de Montauban », « fais le mail à l'agent pour les PV d'AG ») : une action whatsapp ou mail, avec le brouillon que tu rédiges à partir de ce que les fiches savent, dans le style de ${auteur}${style?.envoyes?.length ? ' (ses messages ci-dessous)' : ''} ; qui = assistant. Rien dans l'historique.
  - un message reçu collé (la question d'un client, d'un agent), avec ou sans « réponds » : ce que la personne demande ou dit est un evenement ou une maj sur sa fiche (« Adrien Mina demande pourquoi les frais de notaire passent de 9 200 à 10 400 € ») ; si la note demande de répondre, le brouillon de la réponse en action.
- avant : une action qui doit être faite avant une étape (« avant de faire signer Tony et sa femme, rappeler Matis pour les PV d'AG ») : avant = l'étape qu'elle conditionne, en quelques mots (« la signature de la LOI de Tony Pitiot ») ; et sur la fiche du bien, blocage = « Avant la signature de la LOI : rappeler Matis pour les PV d'AG ».
- profil : sur la fiche d'une personne, ce qui dit comment lui parler et lui présenter un dossier : son métier et sa façon de raisonner (« banquier à la SG, raisonne en gestion du risque »), ce qu'il vise (« vise une offre à 340 k€ »), sa présence (« pas sur place »), le ton (tutoiement). C'est le plus précieux, ne le manque jamais ; un ressenti sur une personne qui dit comment lui parler est un profil. comment_parler : la synthèse à jour de comment lui parler, deux à quatre phrases, faite de ce qu'on savait et de la note (seulement si la note apprend quelque chose là-dessus). Un profil ne dit que ce que le texte montre : pas de métier, de situation ni de trait deviné.
- La vie privée (22 nov. 2026, Jules, sur ses groupes WhatsApp) : rien sur la santé, la famille, un divorce, la religion ou les opinions d'une personne, même quand elle le raconte. Écris seulement ce que ça change au dossier (« en pause pour raisons personnelles », « doit fournir une pièce d'état civil »).
- regles : une leçon ou une règle de travail que la note énonce, valable au-delà de ce dossier (« lors de la prospection, demander le contexte de la vente ») ; portee : prospection, dossiers ou general. Ce n'est pas un fait sur un dossier.
- faites : les actions déjà prévues (A1…) que la note montre faites (20 nov. 2026, Jules) : l'appel a eu lieu avec la personne (même s'il n'a pas répondu à tout), le message est parti, la pièce attendue est arrivée, la tâche est faite. Une note qui prépare l'appel ne le fait pas ; un appel sans réponse (« pas de réponse », « messagerie », « il ne décroche pas ») non plus. restees : les questions de cette action, écrites comme dans la liste, auxquelles la note n'apporte pas de réponse ; une liste vide si tout est répondu. Ne propose pas d'action pour reposer ces questions : elles passent d'office sur la prochaine relance de la personne. Ne repropose pas une action déjà prévue et encore ouverte.
- questions : seulement ce qui manque vraiment pour bien ranger et que les fiches liées ne disent pas (une personne inconnue, un montant flou, une date qui compte). Les fiches liées répondent d'abord (20 nov. 2026, Jules : « j'ai déjà lié les clients et l'agent, c'est bête de me redemander ça ») : une offre, une visite, un avis viennent d'un client lié (s'il n'y en a qu'un, c'est lui) ; ce que dit l'agent vient de l'agent lié ; le bien dont on parle est le bien lié. Jamais « qui est X », « de qui vient l'offre » ou « de quel dossier » quand une fiche liée y répond. Une chose à envoyer, écrire ou demander sans destinataire nommé va à la personne liée quand il n'y en a qu'une (« envoyer les documents sur le cabinet dentaire », Alexis lié : à Alexis ; 25 nov. 2026, Jules) : jamais « à qui ? » ; ni « lesquels ? » pour des documents : ceux du dossier lié. Dans le doute, écris le fait sans le détail incertain plutôt que de deviner. Jamais une question pour faire confirmer ce que tu sais déjà (« est-ce bien l'offre MACSF ? », « c'est bien le 30 novembre ? ») ni pour faire préciser ce que la note dit déjà (elle dit « lundi ou plus tard » : le fait est « lundi ou plus tard », 20 nov. 2026, Jules : « ça me dit est-ce que c'est bien ce dossier alors que je l'ai déjà coché »). Autant qu'il en faut, aucune si tout est clair. Jamais de choix proposés : une question ouverte, à laquelle on répond dans le chat avec ses mots (un choix deviné, « offre Klocka », ne veut rien dire). lien : la fiche visée.
- retirer : dans l'entrée d'une fiche liée, les fiches déjà liées (D1…) que la note dit de retirer ou qui n'ont rien à y faire (« il ne nous a pas envoyé le dossier de Pau, enlève-le de sa fiche ») ; la fiche peut n'avoir alors aucun élément. Retirer n'est jamais une action ni une question : la note le demande, tu le proposes, son OK le fait.
- mentions : les dossiers, agents ou clients nommés dans la note qui ne sont pas parmi les fiches liées (texte = le nom tel qu'écrit). Jamais un collègue de l'équipe ni l'auteur.
- titre : la note en une ligne, quatre-vingts caractères au plus.

${style?.envoyes?.length ? `Les derniers messages envoyés par ${auteur}, pour écrire comme lui (ton, longueur, tutoiement selon la personne) :\n${style.envoyes.map((m) => `- à ${m.pour || 'quelqu\'un'} (${m.canal}) : « ${String(m.texte).slice(0, 500)} »`).join('\n')}\n${style.retouches?.length ? `Ce qu'il a changé dans tes brouillons avant de les envoyer (fais comme la version envoyée) :\n${style.retouches.map((m) => `- proposé : « ${String(m.initial).slice(0, 300)} »\n  envoyé : « ${String(m.texte).slice(0, 300)} »`).join('\n')}\n` : ''}\n` : ''}${ajout ? `Ce que ${auteur} écrit en l'important (à suivre en priorité) : « ${String(ajout).slice(0, 4000)} »\n\n` : ''}${conv ? 'La conversation (un message par ligne : date, qui, texte)' : 'La note'} :
"""
${conv ? conv.texte : String(texte || '').slice(0, transcription ? 42000 : 12000)}
"""`;
}

/** La réponse du modèle, ramenée à ce que l'écran affiche et que le rangement accepte. Les ids sont posés ici. */
const sansAccents = (t) => String(t || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();

export function normaliser(brut, liens, { auteur = null, connus = [], prevues = [], libre = false, source = null, deja: dejaLies = null, maintenant = new Date() } = {}) {
  const r = brut && typeof brut === 'object' ? brut : {};
  const lies = dejaLies || (source || libre ? [] : rattaches(liens));
  const cleDe = (x) => {
    const m = /^L(\d+)$/i.exec(String(x || '').trim());
    return m && liens[Number(m[1]) - 1] ? liens[Number(m[1]) - 1].cle : null;
  };
  let n = 0;
  const id = (p) => `${p}${++n}`;
  const fiches = [];
  const retraits = [];
  for (const f of Array.isArray(r.fiches) ? r.fiches : []) {
    const cle = cleDe(f?.lien);
    const lien = liens.find((l) => l.cle === cle);
    if (!lien || fiches.some((x) => x.cle === cle)) continue;
    for (const ref of Array.isArray(f.retirer) ? f.retirer : []) {
      const d = lies.find((x) => x.ref === String(ref || '').trim().toUpperCase() && x.de === cle);
      if (d && !retraits.some((x) => x.de === d.de && x.vers === d.vers)) retraits.push({ id: `t${retraits.length + 1}`, de: d.de, de_nom: d.de_nom, vers: d.vers, genre: d.genre, nom: d.nom });
    }
    const elements = (Array.isArray(f.elements) ? f.elements : [])
      // Le jour où c'est arrivé, calculé ici depuis les mots relevés (« mardi » → le mardi passé ; 26 nov. 2026, Jules).
      .map((e) => ({ genre: GENRES.includes(e?.genre) ? e.genre : 'maj', texte: propre(e?.texte, 600), raison: propre(e?.raison, 400) || null, ...(e?.genre === 'evenement' && dateDuFait(e?.quand, maintenant) ? { arrive_le: dateDuFait(e.quand, maintenant) } : {}) }))
      .filter((e) => e.texte)
      // Un ressenti vaut sur un dossier comme sur une personne (19 nov. 2026, Jules : l'onglet Notes de toutes les fiches).
      .map((e) => ({ ...e, raison: e.genre === 'decision' ? e.raison : null }))
      // Un profil posé sur un bien (l'acquéreur sans fiche à lui) va dans les Notes du bien, où il se lit.
      .map((e) => (e.genre === 'profil' && lien.genre === 'bien' ? { ...e, genre: 'ressenti' } : e))
      .map((e) => ({ id: id('e'), ...e }));
    // L'étape est celle que la note dit (« Offre »), pas forcément une case de la plateforme (19 nov. 2026, Jules).
    // Le client aussi a son avancement (« En recherche », « Projet présenté »), 20 nov. 2026, Jules.
    let etape = lien.genre === 'bien' || lien.genre === 'client' ? propre(f.etape, 80).replace(/^étape\s*:?\s*/i, '') || null : null;
    let etat = etape ? propre(f.etat, 90) || null : null;
    // Une étape en phrase (« Compromis en attente de l'accord de la banque », import du 22 nov. 2026) : l'étape habituelle
    // qui l'ouvre, le reste dans l'état.
    if (etape && etape.split(/\s+/).length > 3) {
      const connue = ETAPES.find((n) => etape.toLowerCase().startsWith(n.toLowerCase()));
      if (connue) { const reste = etape.slice(connue.length).replace(/^[\s,:·-]+/, ''); etat = etat || propre(reste, 90) || null; etape = connue; }
    }
    etape = etape ? etape.slice(0, 40) : null;
    const position = lien.genre === 'client' && POSITIONS.includes(f.position) ? f.position : null;
    const positionDetail = position ? propre(f.position_detail, 50) || null : null;
    const vendeur = lien.genre === 'bien' ? propre(f.vendeur, 80) || null : null;
    const blocage = f.blocage === undefined || f.blocage === null ? undefined : propre(f.blocage, 300);
    // Les chiffres du bien à reporter dans le projet : proposés en question (oui / non), jamais écrits d'office.
    const donnees = lien.genre === 'bien' ? (Array.isArray(f.donnees) ? f.donnees : [])
      .filter((d) => CHAMPS_PROJET[d?.champ] && propre(d.valeur, 120))
      .filter((d, i, t) => t.findIndex((x) => x.champ === d.champ) === i)
      .map((d) => ({ champ: d.champ, valeur: propre(d.valeur, 120) })) : [];
    const commentParler = lien.genre !== 'bien' ? propre(f.comment_parler, 700) || null : null;
    fiches.push({ donnees, id: id('f'), cle, nom: lien.nom, genre: lien.genre, elements, etape, etat, position, position_detail: positionDetail, vendeur, ...(blocage !== undefined && lien.genre === 'bien' ? { blocage } : {}), resume: propre(f.resume, 1500) || null, comment_parler: commentParler });
  }
  const actions = (Array.isArray(r.actions) ? r.actions : []).map((a) => {
    const titre = propre(a?.titre, 300);
    if (!titre) return null;
    const b = a?.brouillon && typeof a.brouillon === 'object' && propre(a.brouillon.texte, 10) ? {
      canal: CANAUX.includes(a.brouillon.canal) ? a.brouillon.canal : 'whatsapp',
      a: propre(a.brouillon.a, 120) || null,
      objet: propre(a.brouillon.objet, 160) || null,
      texte: String(a.brouillon.texte || '').trim().slice(0, 4000),
      ...(a.brouillon.de_l_auteur ? { de_l_auteur: true } : {}),
    } : null;
    let genre = GENRES_ACTION.includes(a?.genre) ? a.genre : (b ? b.canal : 'tache');
    if (b && genre !== b.canal) genre = b.canal;
    if (!b && CANAUX.includes(genre)) genre = 'tache';
    const contexte = (Array.isArray(a?.contexte) ? a.contexte : a?.contexte ? [a.contexte] : []).map((c) => propre(c, 240)).filter(Boolean).slice(0, 10);
    const q = String(a?.qui || '').trim().toLowerCase();
    const membre = q && q !== 'moi' && q !== 'assistant' ? membreDe(q) : null;
    // Un message écrit par l'auteur lui-même reste le sien (22 nov. 2026) : à lui de l'envoyer, tel quel.
    const qui = b?.de_l_auteur ? 'moi' : q === 'assistant' && b ? 'assistant' : membre && membre.email !== String(auteur || '').toLowerCase() ? membre.prenom : 'moi';
    // Ce que le modèle dit ; rien de dit : toutes les fiches liées, le bien et la personne (24 nov. 2026 ; avant, les
    // biens seuls). Une liste vide dite par le modèle : l'action ne touche aucune fiche liée.
    const dit = Array.isArray(a?.liens);
    const cles = dit ? a.liens.map(cleDe).filter(Boolean) : libre ? [] : liens.map((l) => l.cle);
    // La personne de l'action, quand sa fiche est liée, en est toujours (24 nov. 2026, Jules : « j'ai lié un agent et un
    // bien pour dire de le rappeler tel jour : ça a mis juste un rappel, alors que c'est logique de mettre aussi la fiche
    // du bien et de l'agent ») : « Rappeler Paul » va sur la fiche de Paul autant que sur celle du bien.
    const pour = sansAccents(a?.pour || b?.a || titre);
    for (const l of liens) {
      if (l.genre === 'bien' || cles.includes(l.cle)) continue;
      const mots = sansAccents(l.nom).split(/[^a-z0-9]+/).filter((m) => m.length >= 3);
      if (mots.length && mots.some((m) => pour.includes(m)) && (!dit || cles.length)) cles.push(l.cle);
    }
    // Une action qui conditionne une étape (« avant de faire signer, rappeler Matis ») : l'étape qu'elle précède.
    const avant = propre(a?.avant, 160) || null;
    return { id: id('a'), genre, titre, qui, pour: propre(a?.pour || b?.a, 120) || null, contexte, echeance: dateValide(a?.echeance), fiches: [...new Set(cles)], brouillon: b, ...(avant ? { avant } : {}) };
  }).filter(Boolean);
  // Une source passée importée ne crée ni action ni question (22 nov. 2026) : ses consignes sont de l'histoire, et
  // personne n'est là pour répondre.
  if (source) actions.length = 0;
  // Les actions prévues que la note a faites (20 nov. 2026, Jules) : proposées fermées, à décocher ; les questions
  // restées sans réponse passent sur la prochaine relance de la même personne, ou sur une relance à programmer.
  const faites = [];
  for (const d of Array.isArray(r.faites) ? r.faites : []) {
    const a = prevues.find((x) => x.ref === String(d?.action || '').trim().toUpperCase());
    if (!a || faites.some((x) => x.action_id === a.id)) continue;
    const restees = (Array.isArray(d.restees) ? d.restees : []).map((q) => propre(q, 240)).filter(Boolean).slice(0, 10);
    faites.push({ id: id('d'), action_id: a.id, genre: a.genre, titre: a.titre, pour: a.pour, libelle: faiteLisible(a), restees });
  }
  for (const d of faites) {
    if (!d.restees.length) continue;
    const meme = (x) => x.pour && d.pour && simple(x.pour) === simple(d.pour);
    const suite = actions.find((x) => meme(x) && ['appel', 'whatsapp', 'mail'].includes(x.genre)) || null;
    if (suite) {
      const deja = new Set(suite.contexte.map(simple));
      suite.contexte = [...suite.contexte, ...d.restees.filter((q) => !deja.has(simple(q)))].slice(0, 10);
      if (suite.genre === 'appel') suite.reprises = d.restees.length;
    } else {
      const a = prevues.find((x) => x.id === d.action_id);
      actions.push({ id: id('a'), genre: 'appel', titre: `Relance : rappeler ${d.pour || 'le contact'} pour ce qui reste sans réponse`, qui: 'moi', pour: d.pour, contexte: d.restees, echeance: null, fiches: (a?.fiches || []).filter((c) => liens.some((l) => l.cle === c)), brouillon: null, reprises: d.restees.length });
    }
  }
  for (const a of actions) if (['appel', 'whatsapp'].includes(a.genre)) a.telephone = telephoneDe(a.fiches, a.pour);

  // « Qui est Alexandre Lourenço ? » quand il est lié ou connu : une question qui n'aurait pas dû être posée.
  const deja = [...liens.map((l) => l.nom), ...connus.map((c) => c.nom), ...equipe().map((p) => p.prenom)].map(simple).filter(Boolean);
  const sansObjet = (texte) => {
    const m = /\bqui est\s+(.+?)\s*\?/i.exec(texte);
    if (!m) return false;
    const nom = simple(m[1]);
    return deja.some((d) => d.includes(nom) || nom.includes(d) || d.split(/\s+/)[0] === nom.split(/\s+/)[0]);
  };
  // « Est-ce bien l'offre MACSF ? », « c'est bien le 30 novembre ? » (20 nov. 2026, Jules) : une confirmation de ce qui est
  // déjà su, jamais posée.
  const confirmation = (texte) => /\b(est-ce bien|c'est bien|s'agit-il bien|(?:est|sont)-(?:ils?|elles?) bien|bien (?:celle|celui|ceux|celles) (?:de|du|des|présenté|présentée|dont))\b/i.test(texte.replace(/[’]/g, "'"));
  const questions = (Array.isArray(r.questions) ? r.questions : []).filter((q) => !sansObjet(String(q?.texte || '')) && !confirmation(String(q?.texte || ''))).map((q) => {
    const texte = propre(q?.texte, 300);
    // Pas de choix devinés (20 nov. 2026, Jules : « je préfère que tu mettes rien plutôt qu'un truc faux ») : on répond dans le chat.
    return texte ? { id: id('q'), texte, choix: [], fiche: cleDe(q?.lien) } : null;
  }).filter(Boolean);
  // « Je mets à jour le projet : la taxe foncière à 2 400 € par an ? » (20 nov. 2026, Jules) : une question par chiffre.
  for (const f of fiches) {
    for (const d of f.donnees || []) {
      const c = CHAMPS_PROJET[d.champ];
      const valeur = c.nombre && /^[\d\s.,]+$/.test(d.valeur) ? `${d.valeur} ${c.unite}` : d.valeur;
      questions.push({ id: id('q'), texte: `Je mets à jour le projet ${f.nom} : ${c.libelle} à ${valeur} ?`, choix: ['Oui', 'Non'], fiche: f.cle, maj_projet: { champ: d.champ, valeur: d.valeur } });
    }
  }
  const nomsLies = liens.map((l) => l.nom.toLowerCase());
  const collegues = new Set(equipe().map((p) => p.prenom.toLowerCase()));
  const mentions = (Array.isArray(r.mentions) ? r.mentions : [])
    .map((m) => ({ texte: propre(m?.texte, 120), genre: ['bien', 'agent', 'client'].includes(m?.genre) ? m.genre : 'bien' }))
    .filter((m) => m.texte && !collegues.has(m.texte.toLowerCase()) && !nomsLies.some((x) => x.includes(m.texte.toLowerCase())))
    .slice(0, 6);
  const regles = (Array.isArray(r.regles) ? r.regles : [])
    .map((x) => ({ texte: propre(x?.texte, 300), portee: PORTEES_REGLE.includes(x?.portee) ? x.portee : 'general' }))
    .filter((x) => x.texte).slice(0, 5).map((x) => ({ id: id('r'), ...x }));
  const sansQuestions = source ? [] : questions;
  // Une action « retirer de la fiche » à côté d'un retrait proposé fait double emploi : le retrait suffit.
  if (retraits.length) {
    const noms = retraits.map((x) => sansAccents(x.nom).split(/[^a-z0-9]+/).filter((m) => m.length >= 4)).flat();
    for (let i = actions.length - 1; i >= 0; i--) {
      const t = sansAccents(actions[i].titre);
      if (/\b(retirer|enlever|supprimer|delier|detacher)\b/.test(t) && /\bfiche\b/.test(t) && noms.some((m) => t.includes(m))) actions.splice(i, 1);
    }
  }
  const prop = { nature: r.nature === 'demande' && !source ? 'demande' : 'note', titre: propre(r.titre, 100) || null, fiches, faites, actions, questions: sansQuestions, mentions, regles, retraits };
  // Une note libre : seules les fiches devinées dont un morceau parle restent liées.
  if (libre) {
    const utiles = new Set([...fiches.map((f) => f.cle), ...actions.flatMap((a) => a.fiches || []), ...sansQuestions.map((q) => q.fiche).filter(Boolean)]);
    prop.liens_utiles = liens.filter((l) => utiles.has(l.cle)).map((l) => l.cle);
  }
  return prop;
}

/** Des fiches qui pourraient être celles qu'une mention désigne, pour la lier d'un clic. */
async function candidats(mentions, user) {
  if (!mentions.length) return mentions;
  const { chercher } = await import('./chercher.js');
  return Promise.all(mentions.map(async (m) => {
    try {
      const r = await chercher(m.texte, user, { limite: 3 });
      const liste = m.genre === 'agent' ? r.agents : m.genre === 'client' ? r.clients : r.biens;
      return { ...m, candidats: liste.slice(0, 3) };
    } catch { return { ...m, candidats: [] }; }
  }));
}

/**
 * Lit la note et garde la proposition, sans rien ranger. Rend `{ nature: 'demande' }` quand le texte est une demande
 * à l'assistant : l'écran l'envoie alors au chat, avec le dossier lié en contexte.
 */
/**
 * Les fiches qu'une note sans lien évoque (22 nov. 2026, Jules : « Maxime ne cliquera pas sur Lier à chaque note ») : les
 * sûres et les hésitantes de « Lier », sans IA ; le modèle ne garde que celles dont un morceau parle.
 */
export async function fichesDevinees(texte, user, { noms = [], limite = 12 } = {}) {
  const { suggererPourLier } = await import('./chercher.js');
  const r = await suggererPourLier({ texte: String(texte || '').slice(0, 12000), noms }, user, { equipe: equipe().map((p) => p.prenom) });
  const toutes = [...(r.surs || []), ...(r.choix || []).flatMap((c) => c.options || [])];
  return toutes.map(lienPropre).filter(Boolean).filter((l, i, a) => a.findIndex((x) => x.cle === l.cle) === i).slice(0, limite);
}

export async function proposer({ texte, liens = [], conversation: importee = null, action_id: suite = null, transcription = false, libre = false, source = null, vous = null }, user, { maintenant = new Date(), lire = null, surEtape = () => {} } = {}) {
  const t = String(texte || '').trim();
  const brute = String(importee || '').trim();
  if (!t && !brute) return { ok: false, error: 'La note est vide.' };
  // « Vous » dans un export : la personne qui l'a exporté (celle qui importe, sauf si l'import dit qui).
  const conversation = lireConversation(brute || t, { vous: vous || user?.full_name || null });
  if (brute && !conversation) return { ok: false, error: "Ce fichier n'est pas une conversation WhatsApp exportée." };
  let lies = (Array.isArray(liens) ? liens : []).map(lienPropre).filter(Boolean).filter((l, i, a) => a.findIndex((x) => x.cle === l.cle) === i).slice(0, 8);
  // Une source importée est datée de son jour : ses faits et le résumé partent de là.
  const src = source && source.le && !Number.isNaN(new Date(source.le).getTime()) ? { ...source, le: new Date(source.le).toISOString() } : null;
  if (src) maintenant = new Date(src.le);
  // Sans lien (22 nov. 2026) : la note libre ; les fiches que ses noms évoquent, que le modèle garde ou non.
  const sansLien = !lies.length;
  if (sansLien && !libre && !src) return { ok: false, error: 'Liez la note à un bien, un agent ou un client.' };
  if (sansLien) {
    surEtape('Je cherche de quels dossiers et de quelles personnes parle la note');
    try { lies = await fichesDevinees(brute ? `${t}\n${brute.slice(-8000)}` : t, user, { noms: conversation ? conversation.participants.map((p) => p.nom) : [] }); } catch { lies = []; }
    if (lies.length) surEtape(`J'y vois ${lies.slice(0, 4).map((l) => l.nom).join(', ')}${lies.length > 4 ? '…' : ''}`);
  }
  const devine = sansLien;
  // Le raisonnement montré pendant qu'il travaille (19 nov. 2026, Jules : « on ne voit pas le raisonnement ») : ce
  // qui est vraiment fait, dans l'ordre où c'est fait.
  const j = (d) => new Date(d).toLocaleDateString('fr-FR', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC' });
  if (conversation) {
    const { omis, lus } = conversationLisible(conversation, LIMITE_CONVERSATION);
    surEtape(`Je lis la conversation WhatsApp : ${conversation.messages.length} messages, du ${j(conversation.du)} au ${j(conversation.au)}`);
    if (omis) surEtape(`Je m'en tiens aux ${lus} derniers messages, depuis le ${j(conversation.messages[conversation.messages.length - lus].le)}`);
  } else surEtape('Je lis ta note');
  for (const l of lies) surEtape(contexteDe(l.cle) ? `Je relis la fiche « ${l.nom} » et ce qu'on en sait` : `J'ouvre la fiche « ${l.nom} »`);
  // Les personnes que la note nomme et que Klocka connaît déjà : l'assistant ne demande pas qui elles sont.
  let connus = [];
  try {
    const { suggerer } = await import('./chercher.js');
    const trouves = await suggerer({ texte: (brute ? t : conversation ? '' : t).slice(0, 6000), noms: conversation ? conversation.participants.map((p) => p.nom) : [] }, user, { equipe: equipe().map((p) => p.prenom) });
    connus = trouves.filter((x) => x.genre !== 'bien' && !lies.some((l) => l.cle === x.cle));
  } catch { connus = []; }
  if (connus.length) surEtape(`Je reconnais ${connus.slice(0, 3).map((c) => c.nom).join(', ')}${connus.length > 3 ? '…' : ''}`);
  const prevues = prevuesDes(lies);
  if (prevues.length) surEtape(`Je regarde ${prevues.length === 1 ? "l'action déjà prévue" : `les ${prevues.length} actions déjà prévues`} sur ces fiches`);
  surEtape('Je range ce qui revient à chaque fiche');
  if (transcription && !conversation) surEtape("C'est l'enregistrement de l'appel : je retrouve qui dit quoi");
  let style = null;
  try { style = styleDe(user?.email); } catch { style = null; }
  const deja = src || devine ? [] : rattaches(lies);
  const prompt = consigne(t, lies, user, { maintenant, conversation, ajout: brute ? t || null : null, connus, prevues, suite, transcription: !!transcription && !conversation, libre: devine, source: src, style, deja });
  const appeler = lire || (() => invokeLLM({ prompt, response_json_schema: SCHEMA, effort: 'low', max_tokens: 6000 }));
  const { resultat } = await mesurer({ operation: transcription && !conversation ? 'ranger un enregistrement' : 'ranger une note', par: user?.email || null }, appeler);
  const proposition = normaliser(resultat, lies, { auteur: user?.email, connus, prevues, libre: devine, source: src, deja, maintenant });
  // La note libre ne garde liées que les fiches dont elle parle.
  if (devine) {
    const utiles = new Set(proposition.liens_utiles || []);
    lies = lies.filter((l) => utiles.has(l.cle));
    delete proposition.liens_utiles;
  }
  for (const d of proposition.faites) surEtape(`${d.libelle} : je le ferme avec ton OK${d.restees.length ? `, ${d.restees.length} question${d.restees.length > 1 ? 's' : ''} sans réponse passent sur la prochaine relance` : ''}`);
  if (conversation || transcription || src) proposition.nature = 'note';
  if (proposition.nature === 'demande') { surEtape("C'est une demande : je la passe à l'assistant"); return { ok: true, nature: 'demande', liens: lies }; }
  for (const f of proposition.fiches) {
    const n = f.elements.length;
    if (n || f.etape) surEtape(`« ${f.nom} » : ${n ? `${n} ajout${n > 1 ? 's' : ''}` : ''}${n && f.etape ? ', ' : ''}${f.etape ? `étape ${f.etape}${f.etat ? ` (${f.etat})` : ''}` : ''}`);
  }
  if (proposition.fiches.some((f) => f.elements.some((e) => e.genre === 'decision' && e.raison))) surEtape('Je garde la raison de la décision');
  for (const a of proposition.actions) {
    if (a.genre === 'whatsapp') surEtape(`J'écris le message WhatsApp${a.pour ? ` pour ${a.pour}` : ''}`);
    else if (a.genre === 'mail') surEtape(`J'écris le mail${a.pour ? ` pour ${a.pour}` : ''}`);
    else if (a.genre === 'appel') surEtape(`Je prépare une relance${a.pour ? ` : appeler ${a.pour}` : ''}`);
  }
  for (const r of proposition.retraits || []) surEtape(`Je retire « ${r.nom} » de la fiche ${r.de_nom}, avec ton OK`);
  for (const m of proposition.mentions) surEtape(`Je cherche « ${m.texte} » dans les fiches et le CRM`);
  proposition.mentions = await candidats(proposition.mentions, user);
  if (proposition.questions.length) surEtape(`Il me manque ${proposition.questions.length} précision${proposition.questions.length > 1 ? 's' : ''}`);
  const resumeImport = brute ? `Conversation WhatsApp importée : ${conversation.messages.length} messages, du ${j(conversation.du)} au ${j(conversation.au)}.` : null;
  const note = Records.create('NoteDossier', { texte: brute ? [t, resumeImport].filter(Boolean).join('\n\n') : conversation ? t.slice(-20000) : t.slice(0, transcription ? 60000 : 20000), ...(brute ? { conversation: brute.slice(-200000) } : {}), par: user?.email || null, le: maintenant.toISOString(), liens: lies, etat: 'proposee', proposition, ...(suite ? { action_id: String(suite) } : {}), ...(transcription ? { transcription: true } : {}), ...(devine ? { libre: true } : {}), ...(src ? { source: src, importe: true } : {}) });
  return { ok: true, nature: 'note', note_id: note.id, liens: lies, proposition };
}

/**
 * Une réponse écrite d'un trait aux questions d'une note (20 nov. 2026, Jules : « j'ai répondu à ses questions dans un
 * message, et rien ne s'est passé ») : le modèle la répartit entre les questions encore sans réponse. Rend
 * `{ reponses: { [id]: texte } }`, seulement pour les questions auxquelles le message répond vraiment.
 */
export async function repartirReponses(note, texte, user, { lire = null } = {}) {
  const t = String(texte || '').trim();
  const deja = note?.reponses || {};
  const ouvertes = (note?.proposition?.questions || []).filter((q) => q?.id && !String(deja[q.id] || '').trim());
  if (!t || !ouvertes.length) return { reponses: {} };
  const prompt = `${prenomDe(user?.email) || 'La personne'} répond d'un trait aux questions que tu lui as posées sur sa note. Répartis sa réponse : pour chaque question à laquelle elle répond, la réponse en quelques mots, avec ses chiffres et ses noms exacts ; pour une question à choix, le choix qui correspond, ou la réponse elle-même si aucun ne correspond. N'invente rien : une question dont le message ne parle pas reste sans réponse. Dans « question », seulement le repère (Q1, Q2…).

Les questions :
${ouvertes.map((q, i) => `Q${i + 1} : ${q.texte}${q.choix?.length ? ` (choix : ${q.choix.join(', ')})` : ''}`).join('\n')}

Sa réponse :
"""
${t.slice(0, 4000)}
"""`;
  const schema = { type: 'object', properties: { reponses: { type: 'array', items: { type: 'object', properties: { question: { type: 'string' }, reponse: { type: 'string' } }, required: ['question', 'reponse'] } } }, required: ['reponses'] };
  const appeler = lire || (() => invokeLLM({ prompt, response_json_schema: schema, effort: 'low', max_tokens: 1200 }));
  const { resultat } = await mesurer({ operation: 'ranger une note', par: user?.email || null }, appeler);
  const reponses = {};
  for (const r of Array.isArray(resultat?.reponses) ? resultat.reponses : []) {
    const m = /^Q\s*(\d+)\b/i.exec(String(r?.question || '').trim());
    const q = m ? ouvertes[Number(m[1]) - 1] : null;
    const rep = propre(r?.reponse, 600).replace(/^autre\s*:\s*/i, '');
    if (q && rep) reponses[q.id] = rep;
  }
  return { reponses };
}

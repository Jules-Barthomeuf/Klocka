// « Ce que j'en retiens » (19 nov. 2026) : une note écrite en vrac et liée à des fiches, lue par le modèle, rendue en
// mises à jour, décisions et leur raison, ressentis sur les personnes, actions datées (avec un message prêt quand il
// s'agit d'écrire à quelqu'un) et questions. Rien n'est rangé ici : la proposition attend le OK de la personne
// (modele.js, rangerNote). Une demande faite à l'assistant (« fais la LOI ») n'est pas une note : elle repart au chat.

import { Records } from '../db.js';
import { invokeLLM } from '../llm.js';
import { mesurer } from '../llm-couts.js';
import { ETAPES, contexteDe, dateValide, equipe, lienPropre, membreDe, prenomDe, prevuesDes, telephoneDe } from './modele.js';
import { conversationLisible, cotes, lireConversation } from './whatsapp.js';

const simple = (t) => String(t || '').normalize('NFD').replace(/\p{M}/gu, '').toLowerCase().replace(/[^a-z0-9 ]+/g, ' ').replace(/\s+/g, ' ').trim();
const propre = (t, n = 1200) => String(t ?? '').replace(/\s+/g, ' ').trim().slice(0, n);
const GENRES = ['evenement', 'maj', 'decision', 'negociation', 'ressenti'];
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
      elements: { type: 'array', items: { type: 'object', properties: { genre: { type: 'string', enum: GENRES }, texte: { type: 'string' }, raison: { type: 'string' } }, required: ['genre', 'texte'] } },
      etape: { type: 'string' },
      etat: { type: 'string' },
      position: { type: 'string', enum: POSITIONS },
      position_detail: { type: 'string' },
      vendeur: { type: 'string' },
      donnees: { type: 'array', items: { type: 'object', properties: { champ: { type: 'string', enum: Object.keys(CHAMPS_PROJET) }, valeur: { type: 'string' } }, required: ['champ', 'valeur'] } },
      blocage: { type: 'string' },
      resume: { type: 'string' },
    }, required: ['lien', 'elements'] } },
    actions: { type: 'array', items: { type: 'object', properties: {
      genre: { type: 'string', enum: GENRES_ACTION },
      titre: { type: 'string' },
      pour: { type: 'string' },
      contexte: { type: 'array', items: { type: 'string' } },
      qui: { type: 'string' },
      echeance: { type: 'string' },
      liens: { type: 'array', items: { type: 'string' } },
      brouillon: { type: 'object', properties: { canal: { type: 'string', enum: CANAUX }, a: { type: 'string' }, objet: { type: 'string' }, texte: { type: 'string' } } },
    }, required: ['genre', 'titre', 'qui'] } },
    faites: { type: 'array', items: { type: 'object', properties: { action: { type: 'string' }, restees: { type: 'array', items: { type: 'string' } } }, required: ['action'] } },
    questions: { type: 'array', items: { type: 'object', properties: { texte: { type: 'string' }, lien: { type: 'string' } }, required: ['texte'] } },
    mentions: { type: 'array', items: { type: 'object', properties: { texte: { type: 'string' }, genre: { type: 'string', enum: ['bien', 'agent', 'client'] } }, required: ['texte', 'genre'] } },
  },
  required: ['nature', 'titre', 'fiches', 'actions', 'questions', 'mentions'],
};

// Ce qu'on lit d'une conversation : les quelque 40 000 derniers caractères (de 500 à 800 messages), le plus récent.
export const LIMITE_CONVERSATION = 40000;

const GENRE_LISIBLE = { bien: 'dossier', agent: 'agent immobilier', client: 'client' };

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
    agents.length ? `- ${agents.length === 1 ? `L'agent lié, ${agents[0]}, est` : `Les agents liés (${agents.join(', ')}) sont`} celui qui a présenté le dossier dont parle la note et qui en donne les nouvelles. Un dossier que la note nomme et que sa fiche connaît (« la crèche », « le Basic Fit ») est celui-là : ne demande jamais si c'est bien lui.` : null,
    biens.length ? `- ${biens.length === 1 ? `Le dossier lié, ${biens[0]}, est` : `Les dossiers liés (${biens.join(', ')}) sont`} celui dont parle la note, sauf si elle en nomme clairement un autre.` : null,
  ].filter(Boolean);
  return lignes.length ? `\nCe que les liens disent déjà, à ne jamais demander :\n${lignes.join('\n')}\n` : '';
}

/** La consigne : la date, l'auteur, l'équipe, les fiches liées avec ce qu'on en sait déjà, puis la note. */
export function consigne(texte, liens, user, { maintenant = new Date(), conversation = null, ajout = null, connus = [], prevues = [], suite = null, transcription = false } = {}) {
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
    return lignes.join('\n');
  }).join('\n');
  const entete = conv
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

Fiches liées :
${fiches}
${dejaDit(liens)}${prevues.length ? `\nActions déjà prévues, encore ouvertes :\n${prevues.map((a) => `${a.ref} : ${a.titre}${a.echeance ? ` (pour le ${a.echeance})` : ''}${a.contexte.length ? `\n${a.contexte.map((q) => `    - ${q}`).join('\n')}` : ''}`).join('\n')}\n` : ''}${suivie ? `\n${transcription ? 'Cet enregistrement' : 'Cette note'} est le compte rendu de l'action ${suivie.ref}, prise depuis sa fiche d'appel : mets-la dans faites, sauf si la note dit que personne n'a répondu.\n` : ''}${connus.length ? `\nPersonnes que la note nomme, connues de Klocka sans être liées (ne demande jamais qui elles sont ; si deux portent le même prénom, tu peux demander laquelle) :\n${connus.map((c) => `- ${c.nom} : ${GENRE_LISIBLE[c.genre] || c.genre}${c.detail && c.detail !== 'Twenty CRM' ? ` (${c.detail})` : ''}`).join('\n')}\n` : ''}
Règles :
- nature : ${conv ? "« note », toujours : une conversation collée n'est jamais une demande, même si elle finit sur une question." : "« demande » seulement si le texte demande à l'assistant de faire ou de répondre quelque chose maintenant (une question, « fais la LOI », « prépare le mail »). Une note qui contient des choses à faire reste une « note »."}
- fiches : une entrée par fiche liée touchée par la note (lien = L1, L2…). Dans elements :
  - evenement : ce qui s'est passé, vu de cette fiche, en une ligne sans date (la date est celle de la note) : c'est la ligne de l'historique de la fiche. « Appel avec Sébastien Robic à propos de la taxe foncière », « Visio de présentation de Comtesse du Barry », « Présentation à Adrien Mina et Claire Dumas », « Demande de documents par la banque », « Thomas Nguyen ne poursuit pas : rendement trop bas », « Annonce d'un local à Vannes par Sébastien Robic », « Visite avec Rachel », « Coralie reprend le dossier », « Dossier mis en stand-by ». Un seul par fiche touchée, sur chaque fiche touchée, dès que la note rapporte un échange qui a eu lieu, une visite faite, une décision ou un changement ; aucun si elle ne rapporte rien qui se soit passé.
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
  - liens : les fiches concernées (L1…) ; une liste vide si l'action parle d'un dossier qui n'est pas lié (il va alors dans mentions).
- faites : les actions déjà prévues (A1…) que la note montre faites (20 nov. 2026, Jules) : l'appel a eu lieu avec la personne (même s'il n'a pas répondu à tout), le message est parti, la pièce attendue est arrivée, la tâche est faite. Une note qui prépare l'appel ne le fait pas ; un appel sans réponse (« pas de réponse », « messagerie », « il ne décroche pas ») non plus. restees : les questions de cette action, écrites comme dans la liste, auxquelles la note n'apporte pas de réponse ; une liste vide si tout est répondu. Ne propose pas d'action pour reposer ces questions : elles passent d'office sur la prochaine relance de la personne. Ne repropose pas une action déjà prévue et encore ouverte.
- questions : seulement ce qui manque vraiment pour bien ranger et que les fiches liées ne disent pas (une personne inconnue, un montant flou, une date qui compte). Les fiches liées répondent d'abord (20 nov. 2026, Jules : « j'ai déjà lié les clients et l'agent, c'est bête de me redemander ça ») : une offre, une visite, un avis viennent d'un client lié (s'il n'y en a qu'un, c'est lui) ; ce que dit l'agent vient de l'agent lié ; le bien dont on parle est le bien lié. Jamais « qui est X », « de qui vient l'offre » ou « de quel dossier » quand une fiche liée y répond. Dans le doute, écris le fait sans le détail incertain plutôt que de deviner. Autant qu'il en faut, aucune si tout est clair. Jamais de choix proposés : une question ouverte, à laquelle on répond dans le chat avec ses mots (un choix deviné, « offre Klocka », ne veut rien dire). lien : la fiche visée.
- mentions : les dossiers, agents ou clients nommés dans la note qui ne sont pas parmi les fiches liées (texte = le nom tel qu'écrit). Jamais un collègue de l'équipe ni l'auteur.
- titre : la note en une ligne, quatre-vingts caractères au plus.

${ajout ? `Ce que ${auteur} écrit en l'important (à suivre en priorité) : « ${String(ajout).slice(0, 4000)} »\n\n` : ''}${conv ? 'La conversation (un message par ligne : date, qui, texte)' : 'La note'} :
"""
${conv ? conv.texte : String(texte || '').slice(0, transcription ? 42000 : 12000)}
"""`;
}

/** La réponse du modèle, ramenée à ce que l'écran affiche et que le rangement accepte. Les ids sont posés ici. */
export function normaliser(brut, liens, { auteur = null, connus = [], prevues = [] } = {}) {
  const r = brut && typeof brut === 'object' ? brut : {};
  const cleDe = (x) => {
    const m = /^L(\d+)$/i.exec(String(x || '').trim());
    return m && liens[Number(m[1]) - 1] ? liens[Number(m[1]) - 1].cle : null;
  };
  let n = 0;
  const id = (p) => `${p}${++n}`;
  const fiches = [];
  for (const f of Array.isArray(r.fiches) ? r.fiches : []) {
    const cle = cleDe(f?.lien);
    const lien = liens.find((l) => l.cle === cle);
    if (!lien || fiches.some((x) => x.cle === cle)) continue;
    const elements = (Array.isArray(f.elements) ? f.elements : [])
      .map((e) => ({ genre: GENRES.includes(e?.genre) ? e.genre : 'maj', texte: propre(e?.texte, 600), raison: propre(e?.raison, 400) || null }))
      .filter((e) => e.texte)
      // Un ressenti vaut sur un dossier comme sur une personne (19 nov. 2026, Jules : l'onglet Notes de toutes les fiches).
      .map((e) => ({ ...e, raison: e.genre === 'decision' ? e.raison : null }))
      .map((e) => ({ id: id('e'), ...e }));
    // L'étape est celle que la note dit (« Offre »), pas forcément une case de la plateforme (19 nov. 2026, Jules).
    // Le client aussi a son avancement (« En recherche », « Projet présenté »), 20 nov. 2026, Jules.
    const etape = lien.genre === 'bien' || lien.genre === 'client' ? propre(f.etape, 40).replace(/^étape\s*:?\s*/i, '') || null : null;
    const etat = etape ? propre(f.etat, 90) || null : null;
    const position = lien.genre === 'client' && POSITIONS.includes(f.position) ? f.position : null;
    const positionDetail = position ? propre(f.position_detail, 50) || null : null;
    const vendeur = lien.genre === 'bien' ? propre(f.vendeur, 80) || null : null;
    const blocage = f.blocage === undefined || f.blocage === null ? undefined : propre(f.blocage, 300);
    // Les chiffres du bien à reporter dans le projet : proposés en question (oui / non), jamais écrits d'office.
    const donnees = lien.genre === 'bien' ? (Array.isArray(f.donnees) ? f.donnees : [])
      .filter((d) => CHAMPS_PROJET[d?.champ] && propre(d.valeur, 120))
      .filter((d, i, t) => t.findIndex((x) => x.champ === d.champ) === i)
      .map((d) => ({ champ: d.champ, valeur: propre(d.valeur, 120) })) : [];
    fiches.push({ donnees, id: id('f'), cle, nom: lien.nom, genre: lien.genre, elements, etape, etat, position, position_detail: positionDetail, vendeur, ...(blocage !== undefined && lien.genre === 'bien' ? { blocage } : {}), resume: propre(f.resume, 1500) || null });
  }
  const biens = liens.filter((l) => l.genre === 'bien').map((l) => l.cle);
  const actions = (Array.isArray(r.actions) ? r.actions : []).map((a) => {
    const titre = propre(a?.titre, 300);
    if (!titre) return null;
    const b = a?.brouillon && typeof a.brouillon === 'object' && propre(a.brouillon.texte, 10) ? {
      canal: CANAUX.includes(a.brouillon.canal) ? a.brouillon.canal : 'whatsapp',
      a: propre(a.brouillon.a, 120) || null,
      objet: propre(a.brouillon.objet, 160) || null,
      texte: String(a.brouillon.texte || '').trim().slice(0, 4000),
    } : null;
    let genre = GENRES_ACTION.includes(a?.genre) ? a.genre : (b ? b.canal : 'tache');
    if (b && genre !== b.canal) genre = b.canal;
    if (!b && CANAUX.includes(genre)) genre = 'tache';
    const contexte = (Array.isArray(a?.contexte) ? a.contexte : a?.contexte ? [a.contexte] : []).map((c) => propre(c, 240)).filter(Boolean).slice(0, 10);
    const q = String(a?.qui || '').trim().toLowerCase();
    const membre = q && q !== 'moi' && q !== 'assistant' ? membreDe(q) : null;
    const qui = q === 'assistant' && b ? 'assistant' : membre && membre.email !== String(auteur || '').toLowerCase() ? membre.prenom : 'moi';
    const cles = (Array.isArray(a?.liens) ? a.liens : []).map(cleDe).filter(Boolean);
    // Une liste vide dite par le modèle : l'action ne touche aucune fiche liée. Rien de dit : les biens liés.
    return { id: id('a'), genre, titre, qui, pour: propre(a?.pour || b?.a, 120) || null, contexte, echeance: dateValide(a?.echeance), fiches: cles.length ? [...new Set(cles)] : Array.isArray(a?.liens) ? [] : biens, brouillon: b };
  }).filter(Boolean);
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
  const questions = (Array.isArray(r.questions) ? r.questions : []).filter((q) => !sansObjet(String(q?.texte || ''))).map((q) => {
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
  return { nature: r.nature === 'demande' ? 'demande' : 'note', titre: propre(r.titre, 100) || null, fiches, faites, actions, questions, mentions };
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
export async function proposer({ texte, liens = [], conversation: importee = null, action_id: suite = null, transcription = false }, user, { maintenant = new Date(), lire = null, surEtape = () => {} } = {}) {
  const t = String(texte || '').trim();
  const brute = String(importee || '').trim();
  if (!t && !brute) return { ok: false, error: 'La note est vide.' };
  const conversation = lireConversation(brute || t);
  if (brute && !conversation) return { ok: false, error: "Ce fichier n'est pas une conversation WhatsApp exportée." };
  const lies = (Array.isArray(liens) ? liens : []).map(lienPropre).filter(Boolean).filter((l, i, a) => a.findIndex((x) => x.cle === l.cle) === i).slice(0, 8);
  if (!lies.length) return { ok: false, error: 'Liez la note à un bien, un agent ou un client.' };
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
  const prompt = consigne(t, lies, user, { maintenant, conversation, ajout: brute ? t || null : null, connus, prevues, suite, transcription: !!transcription && !conversation });
  const appeler = lire || (() => invokeLLM({ prompt, response_json_schema: SCHEMA, effort: 'low', max_tokens: 6000 }));
  const { resultat } = await mesurer({ operation: transcription && !conversation ? 'ranger un enregistrement' : 'ranger une note', par: user?.email || null }, appeler);
  const proposition = normaliser(resultat, lies, { auteur: user?.email, connus, prevues });
  for (const d of proposition.faites) surEtape(`${d.libelle} : je le ferme avec ton OK${d.restees.length ? `, ${d.restees.length} question${d.restees.length > 1 ? 's' : ''} sans réponse passent sur la prochaine relance` : ''}`);
  if (conversation || transcription) proposition.nature = 'note';
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
  for (const m of proposition.mentions) surEtape(`Je cherche « ${m.texte} » dans les fiches et le CRM`);
  proposition.mentions = await candidats(proposition.mentions, user);
  if (proposition.questions.length) surEtape(`Il me manque ${proposition.questions.length} précision${proposition.questions.length > 1 ? 's' : ''}`);
  const resumeImport = brute ? `Conversation WhatsApp importée : ${conversation.messages.length} messages, du ${j(conversation.du)} au ${j(conversation.au)}.` : null;
  const note = Records.create('NoteDossier', { texte: brute ? [t, resumeImport].filter(Boolean).join('\n\n') : conversation ? t.slice(-20000) : t.slice(0, transcription ? 60000 : 20000), ...(brute ? { conversation: brute.slice(-200000) } : {}), par: user?.email || null, le: maintenant.toISOString(), liens: lies, etat: 'proposee', proposition, ...(suite ? { action_id: String(suite) } : {}), ...(transcription ? { transcription: true } : {}) });
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

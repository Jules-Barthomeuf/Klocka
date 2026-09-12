// Le premier message à un propriétaire.
//
// Une phrase qui prouve que ce n'est pas du publipostage (l'adresse exacte,
// l'enseigne), qui nous sommes en deux lignes, achat direct sans mandat ni
// commission, une seule question. Signature avec prénom, nom et portable.
//
// Deux voix : le courrier, pour un patrimonial, qui ouvre ses lettres et
// ignore ses mails ; le mail, pour un professionnel. Pas de prix dans un
// premier contact patrimonial ; une fourchette assumée face à un professionnel.
//
// Ce qui ne sort jamais d'ici : un chiffre inventé, un événement BODACC cité
// (on écrit, le calendrier fait le reste), du markdown.

import { invokeLLM } from '../llm.js';

const SIGNATURE = (user) => [user?.full_name || user?.email || 'Klocka', 'Klocka', user?.telephone || ''].filter(Boolean).join('\n');

function faits(c) {
  const f = [];
  f.push(`Adresse du local : ${c.adresse}${c.ville ? `, ${c.ville}` : ''}`);
  if (c.enseigne) f.push(`Enseigne en place : ${c.enseigne}`);
  if (c.activite) f.push(`Activité : ${c.activite}`);
  if (c.proprietaire?.nom) f.push(`Propriétaire : ${c.proprietaire.nom}`);
  if (c.mutation?.date) f.push(`Dernière mutation connue : ${String(c.mutation.date).slice(0, 4)}`);
  const v = c.valorisation;
  if (v?.fourchette?.[0] && v?.fourchette?.[1]) f.push(`Fourchette estimée : ${v.fourchette[0]} à ${v.fourchette[1]} euros (méthode : loyer de marché de la rue divisé par le rendement visé)`);
  return f.join('\n');
}

/**
 * @param {object} cible
 * @param {'mail'|'courrier'} canal
 * @param {object} user - la personne qui signe
 */
export async function rediger(cible, canal, user) {
  const professionnel = /6810Z/i.test(cible.societe?.ape || '') || canal === 'mail';
  const consigne = `Tu écris, pour l'équipe de Klocka, un premier ${canal === 'courrier' ? 'courrier papier' : 'mail'} à un propriétaire de murs commerciaux que nous n'avons jamais contacté.

Klocka achète des murs commerciaux occupés, en direct, pour le compte d'investisseurs privés dont le financement est en place. Sans mandat, sans commission, sans intermédiaire.

Les faits, et rien d'autre :
${faits(cible)}

Règles absolues :
- Texte brut. Aucun markdown, aucun astérisque, aucun titre.
- Ouvre par une phrase qui cite l'adresse exacte et l'enseigne : le destinataire doit voir tout de suite que ce n'est pas un publipostage.
- Dis qui nous sommes en deux lignes, pas plus.
- Une seule demande, minuscule : savoir s'il serait ouvert à en parler.
- ${professionnel ? 'Tu peux donner la fourchette estimée si elle est dans les faits, en disant la méthode en une phrase.' : "Aucun prix, aucune fourchette : c'est un patrimonial, on ne parle pas d'argent au premier contact."}
- N'invente aucun chiffre, aucune date, aucun nom.
- Ne mentionne jamais un changement de gérant, une succession, une procédure, ni rien qui laisserait entendre que nous savons quelque chose de sa situation.
- Ton sobre, direct, respectueux. Pas d'enthousiasme, pas de flatterie, pas de formule creuse.
- ${canal === 'courrier' ? 'Registre du courrier : « Madame, Monsieur, » en tête, formule de politesse brève en fin.' : 'Registre du mail : court, cinq à huit lignes, objet en première ligne sous la forme « Objet : ... ».'}
- Termine par la signature exactement ainsi, sur ses lignes :
${SIGNATURE(user)}`;

  const texte = await invokeLLM({ prompt: consigne });
  const propre = String(texte || '').replace(/[*#_`]+/g, '').trim();
  const objet = canal === 'mail' ? (propre.match(/^Objet\s*:\s*(.+)$/m)?.[1]?.trim() || `Vos murs commerciaux, ${cible.adresse}`) : null;
  return { canal, objet, texte: propre.replace(/^Objet\s*:.*\n+/m, '') };
}

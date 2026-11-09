// Ce que le module pose à son premier démarrage (8 nov. 2026, Jules) : les automatisations de départ, toutes en
// brouillon (aucune ne tourne avant d'avoir été relue et activée), les formulaires des lead magnets, la reprise des
// oppositions et des anciennes séquences. Rejouable : chaque morceau a sa marque. Les anciennes données restent en place.

import { Records, Meta } from '../db.js';
import { E } from './schema.js';
import { reprendreOppositions } from './journal.js';
import { AUTO, creer, normaliser, SORTIES_PROSPECTION } from './automatisations.js';
import { creerFormulaire, formulaireParSlug } from './capture.js';

const mail = (id, objet, texte, plus = {}) => ({ id, type: 'mail', objet, texte, ...plus });
const attendre = (id, jours) => ({ id, type: 'attendre', jours });
const fois = (id, evenement, oui, non) => ({ id, type: 'condition', regle: { genre: 'evenement', evenement }, oui, non });

const SIGNE = '\n\nBien à vous,';

const AGENTS = [
  {
    modele: 'agents-pas-de-bien', nom: 'Agents · après appel, pas de bien', nature: 'prospection',
    declencheurs: [{ evenement: 'appel_abouti', filtre: { issue: 'pas_de_murs' } }],
    etapes: [
      attendre('a1', 7),
      mail('a2', 'Vos murs commerciaux à venir', `{{salutation}}\n\nSuite à notre échange, je reviens vers vous. {{phrase}}\n\nNos investisseurs cherchent toujours des murs occupés, surtout autour de 300 k€. Avez-vous vu passer quelque chose depuis notre appel ?${SIGNE}`, { personnaliser: true }),
      attendre('a3', 21),
      mail('a4', '', `{{salutation}}\n\nJe me permets une dernière relance. Si un bien entre chez vous, la fiche commerciale seule nous suffit pour vous répondre sous 48 h.${SIGNE}`, { meme_fil: true }),
      { id: 'a5', type: 'tag', tag: 'Relancé par séquence' },
    ],
  },
  {
    modele: 'agents-a-un-bien', nom: 'Agents · après appel, a un bien', nature: 'prospection',
    declencheurs: [{ evenement: 'appel_abouti', filtre: { issue: 'a_des_murs' } }],
    etapes: [
      attendre('b1', 3),
      mail('b2', 'La fiche de votre bien', `{{salutation}}\n\nComme convenu, je reste dans l'attente de la fiche commerciale du bien dont nous avons parlé. {{phrase}}\n\nDès réception, nous revenons vers vous rapidement.${SIGNE}`, { personnaliser: true }),
      attendre('b3', 5),
      mail('b4', '', `{{salutation}}\n\nAvez-vous pu retrouver la fiche ? Une simple photo du document nous suffit pour commencer.${SIGNE}`, { meme_fil: true }),
      attendre('b5', 2),
      { id: 'b6', type: 'tache', titre: 'Rappeler {{prenom}} {{nom}} : fiche toujours pas reçue' },
    ],
  },
];

const nurture = (modele, nom, formulaire, premier, suite, lienOutil) => ({
  modele, nom, nature: 'diffusion', declencheurs: [{ evenement: 'lead_magnet_pris', filtre: { formulaire } }], sorties: ['call_pris'],
  etapes: [
    mail('l1', premier.objet, premier.texte, { immediat: true }),
    attendre('l2', 2),
    fois('l3', lienOutil, [
      mail('l4', 'Parlons de votre projet', `Bonjour {{prenom}},\n\nVous avez pris le temps de faire le calcul. La suite la plus utile est une conversation de vingt minutes avec notre équipe, pour voir ce qui correspond à votre budget.\n\n[[Réserver un échange|{{lien_simulateur}}]]`),
    ], [
      mail('l5', suite.objet, suite.texte),
    ]),
    attendre('l6', 5),
    mail('l7', 'Ce qui fait un bon local commercial', `Bonjour {{prenom}},\n\nTrois questions à se poser avant d'acheter des murs : le locataire tient-il dans le temps, le loyer est-il au prix du marché, le bail vous protège-t-il ?\n\nC'est ce que nous vérifions sur chaque dossier.\n\n[[Refaire le calcul|{{lien_simulateur}}]]`),
  ],
});

const DIFFUSION = [
  nurture('lm-simulateur', 'Lead magnet · Simulateur', 'simulateur-de-rentabilite',
    { objet: 'Votre simulateur de rentabilité', texte: `Bonjour {{prenom}},\n\nVoici votre lien personnel. Vous y retrouverez vos chiffres à tout moment.\n\n[[Ouvrir le simulateur|{{lien_simulateur}}]]` },
    { objet: 'Un exemple concret de murs loués', texte: `Bonjour {{prenom}},\n\nUn local loué à un commerce rapporte un loyer dès le premier mois. Le plus simple pour vous en rendre compte reste d'essayer avec un cas réel.\n\n[[Essayer avec un exemple|{{lien_simulateur}}]]` }, 'simulateur'),
  nurture('lm-quiz', 'Lead magnet · Quiz investisseur', 'quiz-investisseur',
    { objet: 'Votre profil d\'investisseur', texte: `Bonjour {{prenom}},\n\nMerci d'avoir fait le quiz. Votre profil vous attend ici.\n\n[[Revoir mon profil|{{APP_URL}}/QuizInvestisseur?k={{k}}]]` },
    { objet: 'Quels commerces pour votre profil ?', texte: `Bonjour {{prenom}},\n\nSelon votre profil, tous les commerces ne se valent pas. Le simulateur vous montre ce que cela donne en chiffres.\n\n[[Ouvrir le simulateur|{{lien_simulateur}}]]` }, 'simulateur'),
  nurture('lm-vision', 'Lead magnet · Vision retraite', 'vision-retraite',
    { objet: 'Votre projection de revenus', texte: `Bonjour {{prenom}},\n\nVotre projection est prête : le revenu visé, le nombre de murs nécessaires et l'année où vous pouvez y arriver.\n\n[[Revoir ma projection|{{APP_URL}}/VisionRetraite?k={{k}}]]` },
    { objet: 'De la projection au premier achat', texte: `Bonjour {{prenom}},\n\nUne projection devient réelle avec le premier achat. Voyez ce que donne un premier local.\n\n[[Ouvrir le simulateur|{{lien_simulateur}}]]` }, 'simulateur'),
  {
    modele: 'webinaire', nom: 'Webinaire · rappels, puis présents et absents', nature: 'diffusion', sorties: ['call_pris'],
    declencheurs: [{ evenement: 'webinaire_inscrit' }],
    etapes: [
      mail('w1', 'Votre place est réservée', `Bonjour {{prenom}},\n\nVotre inscription à « {{webinaire_nom}} » est confirmée : {{webinaire_jour}}.\n\n[[Rejoindre le webinaire|{{lien_webinaire}}]]`, { immediat: true }),
      { id: 'w2', type: 'avant_date', champ: 'webinaire_date', heures: -24 },
      mail('w3', 'C\'est demain', `Bonjour {{prenom}},\n\nRendez-vous demain : {{webinaire_jour}}.\n\n[[Rejoindre le webinaire|{{lien_webinaire}}]]`, { immediat: true }),
      { id: 'w4', type: 'avant_date', champ: 'webinaire_date', heures: -1 },
      mail('w5', 'On commence dans une heure', `Bonjour {{prenom}},\n\nOn se retrouve dans une heure.\n\n[[Rejoindre le webinaire|{{lien_webinaire}}]]`, { immediat: true }),
      { id: 'w6', type: 'avant_date', champ: 'webinaire_date', heures: 48 },
      fois('w7', 'webinaire_present', [
        mail('w8', 'Merci d\'avoir été là', `Bonjour {{prenom}},\n\nMerci pour votre présence. Pour aller plus loin sur votre projet, faites le calcul puis parlons-en.\n\n[[Faire le calcul|{{lien_simulateur}}]]`),
      ], [
        mail('w9', 'Le replay', `Bonjour {{prenom}},\n\nVous n'avez pas pu venir. Voici de quoi rattraper l'essentiel.\n\n[[Voir le replay|{{lien_replay}}]]`),
      ]),
    ],
  },
];

const FORMULAIRES = [
  { nom: 'Simulateur de rentabilité', titre: 'Calculez la rentabilité de vos murs', sous_titre: 'Prix, loyer, apport, crédit : votre rendement année par année.', bouton: 'Ouvrir le simulateur', page: '/SimulateurPublic' },
  { nom: 'Quiz investisseur', titre: 'Quel investisseur en murs êtes-vous ?', sous_titre: 'Cinq questions pour savoir quels commerces vous correspondent.', bouton: 'Faire le quiz', page: '/QuizInvestisseur' },
  { nom: 'Vision retraite', titre: 'Combien de murs pour votre retraite ?', sous_titre: 'Le revenu que vous visez, le nombre de murs et l\'année.', bouton: 'Voir ma projection', page: '/VisionRetraite' },
];

let fait = false;

/** Une fois par processus, et chaque morceau une fois pour toutes. */
export function initialiser() {
  if (fait) return;
  fait = true;
  if (!Meta.get('emailing:module_oppositions')) { reprendreOppositions(); Meta.set('emailing:module_oppositions', '1'); }
  if (!Meta.get('emailing:module_departs')) {
    for (const f of FORMULAIRES) if (!formulaireParSlug(f.nom.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9]+/g, '-'))) creerFormulaire(f);
    for (const a of [...AGENTS, ...DIFFUSION]) {
      if (Records.list(AUTO).some((x) => x.modele === a.modele)) continue;
      creer({ ...a, sorties: a.sorties || SORTIES_PROSPECTION });
    }
    Meta.set('emailing:module_departs', '1');
  }
  if (!Meta.get('emailing:module_sequences')) {
    for (const s of Records.list(E.SEQUENCE)) {
      if (Records.list(AUTO).some((x) => x.repris_de === s.id)) continue;
      const etapes = (s.etapes || []).flatMap((e, i) => [
        ...(e.delai_jours ? [{ id: `att${i}`, type: 'attendre', jours: e.delai_jours }] : []),
        { id: `m${i}`, type: 'mail', objet: e.objet || '', texte: e.texte || '', ...(e.design ? { design: e.design } : {}) },
      ]);
      creer({ nom: `${s.nom} (reprise)`, nature: 'diffusion', declencheurs: [], etapes: normaliser(etapes), sorties: ['call_pris'], repris_de: s.id });
    }
    Meta.set('emailing:module_sequences', '1');
  }
}

export const pourTests = () => { fait = false; };

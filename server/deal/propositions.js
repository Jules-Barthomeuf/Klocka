// Ce qui est à faire, maintenant.
//
// Le plan de travail est produit ICI, en JavaScript ordinaire, à partir de
// l'état en base — jamais par un modèle. C'est la même règle que rules.js : une
// décision se lit et s'explique, elle ne se devine pas. Le modèle n'intervient
// qu'ensuite, pour rédiger le mail que la proposition prépare.
//
// Chaque proposition porte ses actions ; aucune ne part toute seule. Le front
// exécute l'action choisie, l'humain valide l'envoi.

import { Records } from '../db.js';
import { statutDe, aRelancer } from './lifecycle.js';
import { etapeMax } from './etapes.js';
import { typeDepuisCategorie } from './grille.js';

// Le dossier documentaire type d'un deal : ce que l'on demande à l'agent.
const DOSSIER_TYPE = [
  { type: 'bail', libelle: 'le bail commercial' },
  { type: 'pv_ag', libelle: "les procès-verbaux d'assemblée générale" },
  { type: 'rcp', libelle: 'le règlement de copropriété' },
  { type: 'quittances', libelle: 'les quittances de loyer' },
  { type: 'diagnostics', libelle: 'les diagnostics' },
];

// Priorités : 1 = ce qui bloque quelqu'un d'autre (un agent qui attend), 4 = ce
// qui peut attendre demain. Elles ordonnent la pile, rien de plus.
const P = { URGENT: 1, ATTENDU: 2, COURANT: 3, PLUS_TARD: 4 };

const jours = (depuis) => {
  if (!depuis || isNaN(new Date(depuis))) return null;
  return Math.floor((Date.now() - new Date(depuis).getTime()) / 86400000);
};

const leJour = (iso) =>
  !iso || isNaN(new Date(iso)) ? '' : new Date(iso).toLocaleDateString('fr-FR');

// Le message, ouvert dans Gmail, sur le bon compte. L'application n'a pas
// vocation à être une seconde messagerie : elle trie, Gmail affiche.
const lienGmail = (mail) =>
  mail?.gmail_message_id
    ? `https://mail.google.com/mail/u/${encodeURIComponent(mail.compte || 0)}/#all/${mail.gmail_message_id}`
    : 'https://mail.google.com/mail/';

const villeDuLot = (deal) =>
  deal.lots?.[0]?.enrichissement?.commune?.nom || deal.lots?.[0]?.lot?.adresse?.valeur?.ville || '';

const titreDeal = (deal) =>
  deal.nom || deal.lots?.[0]?.synthese?.titre || deal.source?.nom_fichier || deal.deal_id;

/** Types de documents déjà au dossier, d'après la catégorie de chaque pièce. */
function typesPresents(deal) {
  const types = new Set();
  for (const d of deal.documents_espace || []) {
    const t = typeDepuisCategorie(d.categorie, d.nom);
    if (t) types.add(t);
  }
  return types;
}

/** Ce qui manque au dossier documentaire, dans l'ordre de la liste type. */
export function documentsManquants(deal) {
  const presents = typesPresents(deal);
  return DOSSIER_TYPE.filter((d) => !presents.has(d.type));
}

// --- Propositions ----------------------------------------------------------

// Un mail non rattaché : c'est peut-être une fiche à préanalyser.
function surMailsOrphelins(mails) {
  return mails
    .filter((m) => !m.deal_id)
    .map((m) => {
      const pieces = m.pieces_jointes || [];
      const age = jours(m.date);
      return {
        id: `mail:${m.id}`,
        type: 'mail_a_traiter',
        priorite: pieces.length ? P.ATTENDU : P.COURANT,
        titre: `Mail de ${m.de_email || m.de || 'un expéditeur inconnu'}`,
        detail: [
          m.objet ? `« ${m.objet} »` : null,
          pieces.length
            ? `${pieces.length} pièce${pieces.length > 1 ? 's' : ''} jointe${pieces.length > 1 ? 's' : ''} : ${pieces.map((p) => p.nom).slice(0, 3).join(', ')}`
            : 'Sans pièce jointe',
          age != null ? (age === 0 ? "reçu aujourd'hui" : `reçu il y a ${age} j`) : null,
          m.retenu_parce_que ? `retenu : ${m.retenu_parce_que}` : null,
        ]
          .filter(Boolean)
          .join(' · '),
        mail_id: m.id,
        contexte: [
          ['Expéditeur', m.de || m.de_email],
          ['Objet', m.objet || '(sans objet)'],
          ['Reçu le', m.date ? leJour(m.date) : '—'],
          ['Pièces jointes', pieces.length ? pieces.map((p) => p.nom).join(', ') : 'aucune'],
          ['Retenu parce que', m.retenu_parce_que || '—'],
          m.juge_par_ia ? ['Lecture', 'le contenu du mail a été lu pour trancher'] : null,
        ].filter(Boolean),
        actions: [
          { id: 'preanalyser', libelle: 'Lancer la pré-analyse', mode: 'preanalyser', principal: true },
          { id: 'gmail', libelle: 'Ouvrir dans Gmail', mode: 'externe', href: lienGmail(m) },
          // La correction ne vaut que pour ce mail : l'expéditeur reste écouté.
          { id: 'pas_pertinent', libelle: 'Pas pertinent', mode: 'tri', decision: 'ignorer' },
        ],
      };
    });
}

// Une réponse arrivée sur un dossier ouvert, postérieure au dernier événement.
function surReponsesRecues(deal, mails) {
  const dernierSuivi = (deal.suivi || []).slice(-1)[0]?.le;
  const recus = mails.filter(
    (m) => m.deal_id === deal.deal_id && (!dernierSuivi || new Date(m.date) > new Date(dernierSuivi))
  );
  if (!recus.length) return [];
  const avecPieces = recus.filter((m) => (m.pieces_jointes || []).length);
  const m = avecPieces[0] || recus[0];
  const deposes = recus.flatMap((x) => x.pieces_deposees || []);
  return [
    {
      id: `reponse:${m.id}`,
      type: 'reponse_recue',
      priorite: P.ATTENDU,
      titre: `Réponse de l'agent — ${titreDeal(deal)}`,
      detail: [
        m.objet ? `« ${m.objet} »` : null,
        // Les pièces sont déjà au dossier : la carte le dit, sinon l'analyste
        // irait les chercher pour rien.
        deposes.length
          ? `${deposes.length} document(s) déjà versé(s) au dossier et en cours de dépouillement`
          : avecPieces.length
            ? `${avecPieces.reduce((n, x) => n + x.pieces_jointes.length, 0)} pièce(s) jointe(s)`
            : 'Sans pièce jointe',
      ]
        .filter(Boolean)
        .join(' · '),
      deal_id: deal.deal_id,
      mail_id: m.id,
      contexte: [
        ['Expéditeur', m.de || m.de_email],
        ['Objet', m.objet || '(sans objet)'],
        ['Reçu le', m.date ? leJour(m.date) : '—'],
        ['Pièces jointes', (m.pieces_jointes || []).map((p) => p.nom).join(', ') || 'aucune'],
        ['Versées au dossier', deposes.length ? deposes.join(', ') : 'aucune'],
        ['Statut du dossier', deal.statut || '—'],
      ],
      actions: [
        { id: 'ouvrir', libelle: 'Ouvrir le dossier', mode: 'lien', href: `/Analyse?deal_id=${deal.deal_id}`, principal: true },
        { id: 'gmail', libelle: 'Ouvrir dans Gmail', mode: 'externe', href: lienGmail(m) },
      ],
    },
  ];
}

// Dossier ouvert dont il manque des pièces : demander le reste, et ranger.
function surDocumentsManquants(deal) {
  const statut = statutDe(deal);
  if (!['analyse', 'documents_demandes', 'documents_recus'].includes(statut)) return [];
  if (!deal.lots?.length) return [];
  const manquants = documentsManquants(deal);
  if (!manquants.length) return [];

  // Un dossier vierge où rien n'a encore été demandé passe avant celui qui
  // attend une réponse : c'est nous qui bloquons, pas l'agent.
  const rienDemande = statut === 'analyse';
  const actions = [
    {
      id: 'demander',
      libelle: 'Préparer la demande de documents',
      mode: 'mail',
      intention: 'demande_documents',
      principal: true,
    },
  ];
  if (!deal.drive_folder_url) {
    actions.push({ id: 'drive', libelle: 'Créer le dossier Drive', mode: 'drive' });
  }
  actions.push({ id: 'ouvrir', libelle: 'Ouvrir le dossier', mode: 'lien', href: `/Analyse?deal_id=${deal.deal_id}` });

  return [
    {
      id: `manquants:${deal.deal_id}`,
      type: 'documents_manquants',
      priorite: rienDemande ? P.ATTENDU : P.COURANT,
      titre: `Documents manquants — ${titreDeal(deal)}`,
      detail: `Il manque ${manquants.map((m) => m.libelle).join(', ')}.`,
      deal_id: deal.deal_id,
      contexte: [
        ['Manquant', manquants.map((m) => m.libelle).join(', ')],
        ['Déjà au dossier', [...typesPresents(deal)].join(', ') || 'aucun document'],
        ['Contact agent', deal.contact_agent_email || 'inconnu — à renseigner avant l\'envoi'],
        ['Statut', statut],
        ['Dossier Drive', deal.drive_folder_url ? 'créé' : 'pas encore créé'],
      ],
      actions,
    },
  ];
}

// Relance due : documents demandés, échéance passée, silence.
function surRelance(deal) {
  if (!aRelancer(deal)) return [];
  const attente = jours(deal.relance_prevue_le);
  return [
    {
      id: `relance:${deal.deal_id}`,
      type: 'relance_due',
      priorite: P.URGENT,
      titre: `Relancer l'agent — ${titreDeal(deal)}`,
      detail: [
        `Documents demandés, sans réponse.`,
        deal.relance_prevue_le ? `Relance prévue le ${leJour(deal.relance_prevue_le)}` : null,
        attente > 0 ? `en retard de ${attente} j` : null,
      ]
        .filter(Boolean)
        .join(' · '),
      deal_id: deal.deal_id,
      contexte: [
        ['Contact agent', deal.contact_agent_email || 'inconnu'],
        ['Relance prévue le', leJour(deal.relance_prevue_le)],
        ['Retard', attente > 0 ? `${attente} jour(s)` : 'échue aujourd\'hui'],
        ['Dernier événement', (deal.suivi || []).slice(-1)[0]?.detail || '—'],
      ],
      actions: [
        { id: 'relancer', libelle: 'Préparer la relance', mode: 'mail', intention: 'relance', principal: true },
        { id: 'ouvrir', libelle: 'Ouvrir le dossier', mode: 'lien', href: `/Analyse?deal_id=${deal.deal_id}` },
      ],
    },
  ];
}

// Dossier dépouillé qui n'est pas encore entré dans la plateforme.
function surProjetACreer(deal) {
  if (statutDe(deal) !== 'depouille' || deal.projet_id) return [];
  return [
    {
      id: `projet:${deal.deal_id}`,
      type: 'projet_a_creer',
      priorite: P.COURANT,
      titre: `Entrer le deal dans la plateforme — ${titreDeal(deal)}`,
      detail: 'Les documents sont dépouillés : le projet peut être créé pré-rempli.',
      deal_id: deal.deal_id,
      contexte: [
        ['Documents dépouillés', `${(deal.extractions || []).length}`],
        ['Données relevées', `${(deal.extractions || []).reduce((n, e) => n + (e.lignes || []).filter((l) => l.constat).length, 0)}`],
        ['Ville', villeDuLot(deal) || '—'],
      ],
      actions: [
        { id: 'projet', libelle: 'Créer le projet', mode: 'projet', principal: true },
        { id: 'ouvrir', libelle: 'Ouvrir le dossier', mode: 'lien', href: `/Analyse?deal_id=${deal.deal_id}` },
      ],
    },
  ];
}

// Un dossier analysé qui n'a bougé depuis longtemps se rappelle au souvenir.
function surDossierEnSommeil(deal) {
  const statut = statutDe(deal);
  if (!['analyse', 'documents_recus'].includes(statut)) return [];
  const age = jours(deal.updated_date || deal.maj_le);
  if (age == null || age < 14) return [];
  return [
    {
      id: `sommeil:${deal.deal_id}`,
      type: 'dossier_en_sommeil',
      priorite: P.PLUS_TARD,
      titre: `Sans activité depuis ${age} jours — ${titreDeal(deal)}`,
      detail: 'À reprendre ou à abandonner explicitement, pour que la pile reste honnête.',
      deal_id: deal.deal_id,
      contexte: [
        ['Sans activité depuis', `${age} jours`],
        ['Statut', statut],
        ['Dernier événement', (deal.suivi || []).slice(-1)[0]?.detail || '—'],
      ],
      actions: [
        { id: 'ouvrir', libelle: 'Ouvrir le dossier', mode: 'lien', href: `/Analyse?deal_id=${deal.deal_id}`, principal: true },
        { id: 'abandon', libelle: "Préparer un mot d'abandon", mode: 'mail', intention: 'abandon' },
      ],
    },
  ];
}

/**
 * La pile de propositions, la plus urgente d'abord.
 * @param {object} [opts]
 * @param {string[]} [opts.comptes] - boîtes dont on regarde les mails
 * @returns {Array<object>}
 */
export function construirePropositions({ comptes = null } = {}) {
  const deals = Records.list('Deal').filter((d) => !d.archived && !d.test);
  const tousMails = Records.list('MailRecu');
  const mails = comptes ? tousMails.filter((m) => comptes.includes(m.compte)) : tousMails;

  const pile = [...surMailsOrphelins(mails)];
  for (const deal of deals) {
    pile.push(
      ...surReponsesRecues(deal, mails),
      ...surRelance(deal),
      ...surDocumentsManquants(deal),
      ...surProjetACreer(deal),
      ...surDossierEnSommeil(deal)
    );
  }

  // Un dossier ne monopolise pas la pile : une seule proposition de suivi par
  // dossier, la plus prioritaire, plus au plus un rapprochement client — les
  // deux ne disent pas la même chose. Les mails orphelins restent tous listés.
  const vus = new Set();
  return pile
    .sort((a, b) => a.priorite - b.priorite)
    .filter((p) => {
      if (!p.deal_id) return true;
      const cle = `${p.deal_id}:${p.famille || 'dossier'}`;
      if (vus.has(cle)) return false;
      vus.add(cle);
      return true;
    });
}

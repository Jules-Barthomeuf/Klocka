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
import { statutDe } from './lifecycle.js';
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
          ? `${deposes.length} document(s) déjà versé(s) au dossier et en cours de extraction`
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
// La relance ne repose plus sur un minuteur mais sur le registre des
// engagements : un engagement échu dit QUOI relancer, à QUI, et depuis quand.
// Le minuteur disait « sept jours sans réponse » ; le registre dit « Marc
// devait envoyer le PV jeudi, on est lundi ». La règle reste 100 % calculée —
// le modèle écrit le registre, jamais la proposition.
function surEngagements(deal, engagements) {
  const echus = (engagements || []).filter((e) => e.echeance && new Date(e.echeance) <= new Date());
  if (!echus.length) return [];
  const plusAncien = echus[0];
  const retard = jours(plusAncien.echeance);
  return [
    {
      id: `engagement:${deal.deal_id}`,
      type: 'engagement_du',
      priorite: P.URGENT,
      titre: `Relancer ${plusAncien.de || "l'agent"} — ${titreDeal(deal)}`,
      detail: [
        echus.map((e) => e.quoi).join(' ; '),
        `attendu pour le ${leJour(plusAncien.echeance)}`,
        retard > 0 ? `en retard de ${retard} j` : null,
      ]
        .filter(Boolean)
        .join(' · '),
      deal_id: deal.deal_id,
      contexte: [
        ['Doit', plusAncien.de || deal.contact_agent_email || 'inconnu'],
        ...echus.map((e) => [
          e.source?.type === 'mail_recu' ? 'Promis' : 'Demandé',
          `${e.quoi} — pour le ${leJour(e.echeance)}`,
        ]),
        ['Dernier événement', (deal.suivi || []).slice(-1)[0]?.detail || '—'],
      ],
      actions: [
        { id: 'relancer', libelle: 'Préparer la relance', mode: 'mail', intention: 'relance', principal: true },
        { id: 'registre', libelle: 'Voir le registre', mode: 'lien', href: '/Engagements' },
        { id: 'ouvrir', libelle: 'Ouvrir le dossier', mode: 'lien', href: `/Analyse?deal_id=${deal.deal_id}` },
      ],
    },
  ];
}

// Dossier extrait qui n'est pas encore entré dans la plateforme.
function surProjetACreer(deal) {
  if (statutDe(deal) !== 'depouille' || deal.projet_id) return [];
  return [
    {
      id: `projet:${deal.deal_id}`,
      type: 'projet_a_creer',
      priorite: P.COURANT,
      titre: `Entrer le deal dans la plateforme — ${titreDeal(deal)}`,
      detail: 'Les documents sont extraits : le projet peut être créé pré-rempli.',
      deal_id: deal.deal_id,
      contexte: [
        ['Documents extraits', `${(deal.extractions || []).length}`],
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

// Un dossier extrait peut être présenté : à qui ? Les investisseurs viennent
// de Monday, qui en est la source — Klocka les lit, ne les tient pas.
function surInvestisseurs(deal, rapprochements) {
  const candidats = rapprochements.get(deal.deal_id);
  if (!candidats?.length) return [];
  return [
    {
      id: `investisseurs:${deal.deal_id}`,
      famille: 'client',
      type: 'clients_interesses',
      priorite: P.COURANT,
      titre: `${candidats.length} investisseur${candidats.length > 1 ? 's' : ''} pour ${titreDeal(deal)}`,
      detail: candidats.map((c) => c.client.nom).join(', '),
      deal_id: deal.deal_id,
      contexte: candidats.map((c) => [c.client.nom, c.raisons.join(' · ')]),
      actions: [
        {
          id: 'presenter',
          libelle: 'Préparer la présentation client',
          mode: 'mail',
          intention: 'presentation_client',
          principal: true,
        },
      ],
    },
  ];
}

// Une boîte connectée qui n'autorise pas ce que le serveur demande ne sert à
// rien : la veille ne l'ouvre même pas. Jusqu'ici ce défaut ne se signalait que
// par un bandeau discret, et la boîte restait muette pendant des semaines. Il
// devient une proposition prioritaire, avec le bouton qui la répare.
async function surComptesMuets() {
  const { gmailReadDemande, gmailSendDemande, driveDemande, calendarDemande, comptesEquipe } = await import(
    '../google-oauth.js'
  );
  const attendues = [
    gmailReadDemande && ['peut_lire', 'relever la boîte'],
    gmailSendDemande && ['peut_envoyer', 'envoyer les mails'],
    driveDemande && ['peut_drive', 'classer dans le Drive'],
    calendarDemande && ['peut_agenda', "tenir l'agenda"],
  ].filter(Boolean);
  if (!attendues.length) return [];

  const comptes = comptesEquipe().filter((a) => a.provider === 'google');
  const pile = [];
  for (const compte of comptes) {
    const manquantes = attendues.filter(([cle]) => !compte[cle]);
    const perimee = !compte.refresh_token;
    if (!manquantes.length && !perimee) continue;

    // Ne pas pouvoir lire est le seul défaut qui rend le compte totalement
    // sourd : les autres se rattrapent à la main, celui-là non.
    const sourde = manquantes.some(([cle]) => cle === 'peut_lire');
    pile.push({
      id: `compte:${compte.email}`,
      type: 'compte_muet',
      priorite: sourde || perimee ? P.URGENT : P.ATTENDU,
      famille: 'compte',
      titre: sourde
        ? `${compte.email} n'est jamais relevée`
        : `${compte.email} : autorisation manquante`,
      detail: perimee
        ? 'La session Google est incomplète : le compte cessera de fonctionner.'
        : `Le compte n'autorise pas Klocka à ${manquantes.map(([, quoi]) => quoi).join(', ni à ')}. ` +
          "Une autorisation ne s'ajoute jamais après coup : il faut reconnecter le compte.",
      contexte: [
        ['Compte', compte.email],
        ['Connecté le', leJour(compte.connected_at)],
        ['Manquant', manquantes.map(([, quoi]) => quoi).join(', ') || 'session'],
      ],
      actions: [
        {
          id: 'reconnecter',
          libelle: 'Reconnecter le compte',
          mode: 'google',
          principal: true,
        },
      ],
    });
  }
  return pile;
}

// Render efface le système de fichiers à chaque déploiement. Sans disque
// attaché et sans KLOCKA_DATA_DIR pointé dessus, la base — sessions, dossiers,
// clients, tout — repart de zéro à la prochaine mise en ligne. Ce n'est pas un
// réglage : c'est la première chose à faire, et le plan de travail le dit.
function surStockageEphemere() {
  if (!process.env.RENDER || (process.env.KLOCKA_DATA_DIR || '').trim()) return [];
  return [
    {
      id: 'stockage:ephemere',
      type: 'stockage_ephemere',
      priorite: P.URGENT,
      famille: 'stockage',
      titre: 'La base de données sera effacée au prochain déploiement',
      detail:
        "Le service tourne sur Render sans disque persistant : comptes, sessions, dossiers et clients disparaîtront à la prochaine mise en ligne. Attachez un disque et déclarez KLOCKA_DATA_DIR.",
      contexte: [
        ['Hébergeur', 'Render (variable RENDER présente)'],
        ['KLOCKA_DATA_DIR', 'non déclaré'],
        ['À faire', 'Disks → Add Disk (ex. /var/data), puis Environment → KLOCKA_DATA_DIR=/var/data, puis redéployer'],
        ['En attendant', 'téléchargez une sauvegarde avant chaque déploiement, restaurez-la après — les fichiers déposés (documents, photos), eux, ne voyagent pas'],
      ],
      actions: [
        { id: 'sauvegarde', libelle: 'Télécharger une sauvegarde', mode: 'externe', href: '/api/admin/sauvegarde', principal: true },
        { id: 'restaurer', libelle: 'Restaurer une sauvegarde', mode: 'restaurer' },
        { id: 'render', libelle: 'Ouvrir Render', mode: 'externe', href: 'https://dashboard.render.com' },
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
// Les inscrits seuls : un compte découverte, pas encore d'appel. C'est à nous
// de décrocher — la fiche Monday n'existe qu'après. Une seule ligne, les
// personnes en contexte, du plus récent au plus ancien.
function surInscrits() {
  const inscrits = Records.list('User')
    .filter((u) => u.role !== 'admin' && u.acces === 'decouverte')
    .sort((a, b) => String(b.inscrit_le || b.created_date || '').localeCompare(String(a.inscrit_le || a.created_date || '')));
  if (!inscrits.length) return [];
  const recents = inscrits.filter((u) => jours(u.inscrit_le || u.created_date) <= 30);
  const liste = recents.length ? recents : inscrits.slice(0, 8);
  const nomDe = (u) => u.full_name || u.email;
  return [
    {
      id: `inscrits:${liste.map((u) => u.id).join(',')}`,
      famille: 'client',
      type: 'inscrit_decouverte',
      priorite: P.COURANT,
      titre: `${inscrits.length} inscrit${inscrits.length > 1 ? 's' : ''} en découverte${recents.length ? `, ${recents.length} ce mois-ci` : ''}`,
      detail: liste.slice(0, 4).map(nomDe).join(', ') + (liste.length > 4 ? '…' : ''),
      contexte: liste.slice(0, 8).map((u) => [
        nomDe(u),
        [
          `inscrit le ${leJour(u.inscrit_le || u.created_date)}`,
          u.inscription_via === 'google' ? 'via Google' : u.inscription_via === 'email' ? 'par e-mail' : null,
          u.rdv_strategique_le ? `rendez-vous demandé le ${leJour(u.rdv_strategique_le)}` : 'pas encore de rendez-vous',
        ].filter(Boolean).join(' · '),
      ]),
      actions: [{ id: 'clients', libelle: 'Voir les inscrits', mode: 'lien', href: '/AdminClients', principal: true }],
    },
  ];
}

export async function construirePropositions({ comptes = null } = {}) {
  const deals = Records.list('Deal').filter((d) => !d.archived && !d.test);
  const tousMails = Records.list('MailRecu');
  const mails = comptes ? tousMails.filter((m) => comptes.includes(m.compte)) : tousMails;

  // Rapprochements Monday, une seule fois pour toute la pile : l'API est
  // limitée en débit, et la lecture est mise en cache côté module.
  const rapprochements = new Map();
  try {
    const { mondayConfigure } = await import('../monday.js');
    if (mondayConfigure()) {
      const { investisseursPourDeal } = await import('./monday-sync.js');
      for (const deal of deals.filter((d) => ['depouille', 'projet_cree'].includes(statutDe(d)))) {
        rapprochements.set(deal.deal_id, await investisseursPourDeal(deal));
      }
    }
  } catch (e) {
    // Monday indisponible : la pile se construit sans les rapprochements.
    console.warn('[monday] rapprochements indisponibles :', e?.message || e);
  }

  // Un compte muet passe avant tout le reste : sans lui, la pile est fausse —
  // elle décrit un travail calculé sur des boîtes qu'on ne lit pas.
  // Le registre se lit une fois pour toute la pile.
  const parDeal = new Map();
  for (const e of Records.filter('Engagement', { statut: 'ouvert' })) {
    if (!parDeal.has(e.deal_id)) parDeal.set(e.deal_id, []);
    parDeal.get(e.deal_id).push(e);
  }
  for (const liste of parDeal.values()) {
    liste.sort((a, b) => String(a.echeance || '9999').localeCompare(String(b.echeance || '9999')));
  }

  // Les engagements dictés sans dossier (« rappeler le notaire lundi ») n'ont
  // pas de deal à qui s'accrocher : ils remontent tels quels quand ils sont dus.
  const libres = (parDeal.get(null) || [])
    .filter((e) => e.echeance && new Date(e.echeance) <= new Date())
    .map((e) => ({
      id: `engagement-libre:${e.id}`,
      type: 'engagement_du',
      priorite: P.URGENT,
      titre: e.quoi,
      detail: [e.de ? `${e.de}` : null, `pour le ${leJour(e.echeance)}`, jours(e.echeance) > 0 ? `en retard de ${jours(e.echeance)} j` : null]
        .filter(Boolean)
        .join(' · '),
      contexte: [['Noté', e.source?.type === 'assistant' ? "via l'assistant" : e.source?.type || '—']],
      actions: [{ id: 'registre', libelle: 'Voir le registre', mode: 'lien', href: '/Engagements', principal: true }],
    }));

  const pile = [...surStockageEphemere(), ...(await surComptesMuets()), ...libres, ...surInscrits(), ...surMailsOrphelins(mails)];
  for (const deal of deals) {
    pile.push(
      ...surReponsesRecues(deal, mails),
      ...surEngagements(deal, parDeal.get(deal.deal_id)),
      ...surDocumentsManquants(deal),
      ...surProjetACreer(deal),
      ...surInvestisseurs(deal, rapprochements),
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

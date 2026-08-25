// L'assistant de commande : on lui parle, il agit.
//
// Le modèle ne décide de rien sur le fond — il traduit une phrase en appel
// d'outil. « Mets le dossier de Lyon dans Monday » devient : chercher, désigner,
// pousser. Les outils, eux, sont du code ordinaire : ce qu'ils font est vérifié,
// pas deviné.
//
// Deux garde-fous. Une recherche ambiguë ne choisit pas au hasard : elle rend la
// liste et demande. Et rien de destructif n'est exposé — l'assistant sait pousser
// vers Monday et renseigner, pas supprimer.

import path from 'path';
import { fileURLToPath } from 'url';
import { Records } from './db.js';
import { runAgent } from './llm.js';
import { statutDe } from './deal/lifecycle.js';

const UPLOAD_DIR = path.join(path.dirname(fileURLToPath(import.meta.url)), 'uploads');

const norm = (s) =>
  String(s || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').trim();

const titreDeal = (d) =>
  d.nom || d.lots?.[0]?.synthese?.titre || d.source?.nom_fichier || d.deal_id;

const villeDeal = (d) =>
  d.lots?.[0]?.enrichissement?.commune?.nom || d.lots?.[0]?.lot?.adresse?.valeur?.ville || '';

/** Recherche tolérante : tous les mots de la requête doivent apparaître. */
function correspond(texte, requete) {
  const mots = norm(requete).split(/\s+/).filter((m) => m.length > 1);
  if (!mots.length) return false;
  const cible = norm(texte);
  return mots.every((m) => cible.includes(m));
}

const OUTILS = [
  {
    name: 'chercher_dossier',
    description:
      "Cherche un dossier de préanalyse par son nom, sa ville ou son adresse. À utiliser avant toute action sur un dossier.",
    input_schema: {
      type: 'object',
      properties: { recherche: { type: 'string', description: 'Nom, ville ou adresse' } },
      required: ['recherche'],
    },
  },
  {
    name: 'chercher_projet',
    description:
      "Cherche un projet de la plateforme par son titre, sa ville ou son locataire. À utiliser avant toute action sur un projet.",
    input_schema: {
      type: 'object',
      properties: { recherche: { type: 'string' } },
      required: ['recherche'],
    },
  },
  {
    name: 'pousser_dossier_monday',
    description:
      "Pose ou met à jour un dossier dans le tableau Monday « Propriétés ». Nécessite l'identifiant obtenu par chercher_dossier.",
    input_schema: {
      type: 'object',
      properties: {
        deal_id: { type: 'string' },
        motif: { type: 'string', description: 'Note libre à joindre, facultative' },
      },
      required: ['deal_id'],
    },
  },
  {
    name: 'creer_drive_dossier',
    description:
      "Crée le dossier Google Drive d'un dossier et y classe les documents déjà déposés. Nécessite l'identifiant obtenu par chercher_dossier.",
    input_schema: {
      type: 'object',
      properties: { deal_id: { type: 'string' } },
      required: ['deal_id'],
    },
  },
  {
    name: 'etat_dossier',
    description:
      "Donne l'état détaillé d'un dossier : étape, statut, documents présents et manquants, dossier Drive, contact agent, dernier événement. À utiliser pour répondre à « où en est … ».",
    input_schema: {
      type: 'object',
      properties: { deal_id: { type: 'string' } },
      required: ['deal_id'],
    },
  },
  {
    name: 'simuler_dossier',
    description:
      "Rejoue la simulation financière d'un dossier avec des hypothèses données : prix négocié, apport en pourcentage, taux, durée. Rend prix de revient, apport, rentabilité, cash-flow, TRI. À utiliser pour « ça donne quoi à 25 % d'apport », « si on négocie à 340 000 »…",
    input_schema: {
      type: 'object',
      properties: {
        deal_id: { type: 'string' },
        prix_negocie: { type: 'number', description: 'Prix négocié en euros, si différent du prix affiché' },
        apport_pourcent: { type: 'number', description: "Part d'apport en % du prix de revient (défaut 15)" },
        taux: { type: 'number', description: "Taux d'intérêt annuel en % (défaut 3,7)" },
        duree: { type: 'number', description: 'Durée du crédit en années (défaut 20)' },
      },
      required: ['deal_id'],
    },
  },
  {
    name: 'preparer_mail',
    description:
      "Rédige un brouillon de mail à l'agent pour un dossier. Intentions : demande_documents, relance, refus, abandon, presentation_client. Le brouillon n'est PAS envoyé : il est proposé à l'analyste.",
    input_schema: {
      type: 'object',
      properties: {
        deal_id: { type: 'string' },
        intention: {
          type: 'string',
          enum: ['demande_documents', 'relance', 'refus', 'abandon', 'presentation_client'],
        },
      },
      required: ['deal_id', 'intention'],
    },
  },
  {
    name: 'extraire_documents',
    description:
      "Lance l'extraction des documents d'un dossier : chaque pièce est lue et ses données relevées. Le traitement se poursuit en arrière-plan.",
    input_schema: {
      type: 'object',
      properties: { deal_id: { type: 'string' } },
      required: ['deal_id'],
    },
  },
  {
    name: 'marche_ville',
    description:
      "Ce que Klocka sait d'une ville : biens déjà analysés puis écartés, prix au m², loyers observés. Mémoire interne, pas une recherche web.",
    input_schema: {
      type: 'object',
      properties: { ville: { type: 'string' } },
      required: ['ville'],
    },
  },
  {
    name: 'plan_du_jour',
    description:
      "Ce qui est à faire maintenant : mails à traiter, relances dues, documents manquants, dossiers prêts à entrer en plateforme. Répond à « qu'est-ce que je dois faire », « quoi de neuf ».",
    input_schema: { type: 'object', properties: {} },
  },
  {
    name: 'pousser_projet_monday',
    description:
      "Pose ou met à jour un projet dans le tableau Monday « Propriétés ». Nécessite l'identifiant obtenu par chercher_projet.",
    input_schema: {
      type: 'object',
      properties: { projet_id: { type: 'string' }, motif: { type: 'string' } },
      required: ['projet_id'],
    },
  },
];

async function executerOutil({ name, input }, user) {
  if (name === 'chercher_dossier') {
    const trouves = Records.list('Deal')
      .filter((d) => !d.archived && !d.test)
      .filter((d) => correspond(`${titreDeal(d)} ${villeDeal(d)} ${d.contact_agent_email || ''}`, input.recherche))
      .slice(0, 8)
      .map((d) => ({
        deal_id: d.deal_id,
        titre: titreDeal(d),
        ville: villeDeal(d),
        statut: statutDe(d),
        deja_dans_monday: !!d.monday_item_id,
      }));
    return { resultats: trouves, nombre: trouves.length };
  }

  if (name === 'chercher_projet') {
    const trouves = Records.list('Project')
      .filter((p) => !p.archived)
      .filter((p) =>
        correspond(
          `${p.titre || ''} ${p.adresse_complete || ''} ${p.ville_secteur_champ1 || ''} ${p.nom_locataire || ''}`,
          input.recherche
        )
      )
      .slice(0, 8)
      .map((p) => ({
        projet_id: p.id,
        titre: p.titre,
        ville: p.ville_secteur_champ1 || '',
        statut: p.statut,
        deja_dans_monday: !!p.monday_item_id,
      }));
    return { resultats: trouves, nombre: trouves.length };
  }

  if (name === 'simuler_dossier') {
    const deal = Records.filter('Deal', { deal_id: input.deal_id })[0];
    if (!deal) return { erreur: 'Dossier introuvable' };
    const lot = deal.lots?.[0];
    if (!lot?.simulateur?.loyerInitialHTHC) {
      return { erreur: 'Loyer inconnu sur ce dossier : la simulation ne peut rien produire.' };
    }
    const { simuler } = await import('./video/indicateurs.js');
    return {
      titre: titreDeal(deal),
      ...simuler(lot, {
        prixNegocie: input.prix_negocie,
        apportPourcent: input.apport_pourcent,
        taux: input.taux,
        duree: input.duree,
      }),
    };
  }

  if (name === 'preparer_mail') {
    const deal = Records.filter('Deal', { deal_id: input.deal_id })[0];
    if (!deal) return { erreur: 'Dossier introuvable' };
    const lot = deal.lots?.[0];
    if (!lot) return { erreur: 'Aucun lot analysé sur ce dossier' };
    const { redigerMailIntention } = await import('./deal/mails-cycle.js');
    const mail = await redigerMailIntention(lot, input.intention, {
      signature: user?.full_name || user?.email,
      sansIA: !!deal.test,
    });
    if (!mail) return { erreur: 'Intention inconnue' };
    return {
      ok: true,
      brouillon: true,
      titre: titreDeal(deal),
      deal_id: deal.deal_id,
      intention: input.intention,
      destinataire: deal.contact_agent_email || '',
      objet: mail.objet,
      corps: mail.corps,
    };
  }

  if (name === 'extraire_documents') {
    const deal = Records.filter('Deal', { deal_id: input.deal_id })[0];
    if (!deal) return { erreur: 'Dossier introuvable' };
    const aFaire = (deal.documents_espace || []).map((d) => d.id);
    if (!aFaire.length) return { erreur: 'Aucun document au dossier' };
    const { enfiler } = await import('./deal/file-extraction.js');
    enfiler(deal.deal_id, aFaire, { uploadDir: UPLOAD_DIR, user });
    return {
      ok: true,
      titre: titreDeal(deal),
      documents: aFaire.length,
      // L'extraction est séquentielle : mieux vaut annoncer l'attente.
      note: "Le traitement se poursuit en arrière-plan, un document à la fois.",
    };
  }

  if (name === 'marche_ville') {
    const cherche = norm(input.ville);
    const entrees = Records.list('DonneeMarche').filter((e) => norm(e.ville).includes(cherche));
    const ecartes = Records.list('Deal')
      .filter((d) => !d.test && statutDe(d) === 'abandonne' && norm(villeDeal(d)).includes(cherche))
      .slice(0, 6)
      .map((d) => ({
        titre: titreDeal(d),
        prix: d.lots?.[0]?.lot?.prix_fai?.valeur ?? null,
        motif: (d.suivi || []).slice(-1)[0]?.detail || null,
      }));
    if (!entrees.length && !ecartes.length) {
      return { ville: input.ville, connu: false, note: "Rien en mémoire sur cette ville." };
    }
    return { ville: input.ville, connu: true, donnees_marche: entrees.slice(0, 3), biens_ecartes: ecartes };
  }

  if (name === 'plan_du_jour') {
    const { construirePropositions } = await import('./deal/propositions.js');
    const pile = await construirePropositions({});
    return {
      nombre: pile.length,
      propositions: pile.slice(0, 8).map((p) => ({
        quoi: p.titre,
        detail: p.detail,
        urgence: p.priorite === 1 ? "aujourd'hui" : p.priorite === 2 ? 'attendu' : 'courant',
      })),
    };
  }

  if (name === 'creer_drive_dossier') {
    const deal = Records.filter('Deal', { deal_id: input.deal_id })[0];
    if (!deal) return { erreur: 'Dossier introuvable' };
    if (deal.drive_folder_url) {
      return { deja_cree: true, url: deal.drive_folder_url, titre: titreDeal(deal) };
    }
    // Le compte Drive est celui de l'utilisateur qui parle, pas un compte
    // choisi au hasard : c'est son autorisation qui est engagée.
    const { listAccounts } = await import('./email.js');
    const compte = listAccounts(user?.email).find((c) => c.peut_drive)?.id;
    if (!compte) {
      return {
        erreur:
          "Aucun compte Google n'autorise le Drive. Connectez-en un depuis le dashboard, section Comptes Google.",
      };
    }
    const { classerDansDrive } = await import('./google-drive.js');
    const titre = titreDeal(deal);
    const fichiers = (deal.documents_espace || [])
      .filter((d) => d.url)
      .map((d) => ({ nom: d.nom, chemin: d.url }));
    const r = await classerDansDrive(compte, titre, fichiers, UPLOAD_DIR);
    Records.update('Deal', deal.id, { drive_folder_id: r.folder_id, drive_folder_url: r.folder_url });
    return { ok: true, titre, url: r.folder_url, chemin: r.chemin, fichiers_classes: r.envoyes.length };
  }

  if (name === 'etat_dossier') {
    const deal = Records.filter('Deal', { deal_id: input.deal_id })[0];
    if (!deal) return { erreur: 'Dossier introuvable' };
    const { documentsManquants } = await import('./deal/propositions.js');
    const { etapeMax, ETAPES } = await import('./deal/etapes.js');
    const etape = etapeMax(deal);
    return {
      titre: titreDeal(deal),
      ville: villeDeal(deal),
      statut: statutDe(deal),
      etape: `${etape} — ${ETAPES.find((e) => e.n === etape)?.label || ''}`,
      verdict: deal.lots?.[0]?.evaluation?.verdict || null,
      documents: (deal.documents_espace || []).map((d) => d.nom),
      documents_manquants: documentsManquants(deal).map((m) => m.libelle),
      dossier_drive: deal.drive_folder_url || null,
      dans_monday: !!deal.monday_item_id,
      contact_agent: deal.contact_agent_email || null,
      relance_prevue_le: deal.relance_prevue_le || null,
      dernier_evenement: (deal.suivi || []).slice(-1)[0]?.detail || null,
    };
  }

  if (name === 'pousser_dossier_monday') {
    const deal = Records.filter('Deal', { deal_id: input.deal_id })[0];
    if (!deal) return { erreur: 'Dossier introuvable' };
    const { pousserBien } = await import('./deal/monday-sync.js');
    const r = await pousserBien(deal, { motif: input.motif });
    if (r?.ignore) return { erreur: 'Monday n\'est pas configuré' };
    return {
      ok: true,
      titre: titreDeal(deal),
      cree: r.cree,
      url: `https://klocka-company.monday.com/boards/${process.env.MONDAY_BOARD_PROPRIETES || ''}/pulses/${r.id}`,
    };
  }

  if (name === 'pousser_projet_monday') {
    const projet = Records.get('Project', input.projet_id);
    if (!projet) return { erreur: 'Projet introuvable' };
    const { pousserProjet } = await import('./deal/monday-sync.js');
    const r = await pousserProjet(projet, { motif: input.motif });
    if (r?.ignore) return { erreur: 'Monday n\'est pas configuré' };
    return {
      ok: true,
      titre: projet.titre,
      cree: r.cree,
      url: `https://klocka-company.monday.com/boards/${process.env.MONDAY_BOARD_PROPRIETES || ''}/pulses/${r.id}`,
    };
  }

  return { erreur: `Outil inconnu : ${name}` };
}

const CONSIGNE = `Tu es l'assistant de Klocka, conseil en investissement dans les murs commerciaux.

Tu exécutes des demandes courtes portant sur les dossiers de préanalyse et les projets de la plateforme. Tu réponds en français, en une ou deux phrases, sans formule d'attente ni superlatif.

Tu sais : renseigner sur un dossier ou un projet, rejouer leur simulation financière avec d'autres hypothèses, rédiger un brouillon de mail à l'agent, lancer l'extraction des documents, dire ce que Klocka sait d'une ville, donner le plan du jour, envoyer un dossier ou un projet dans Monday, créer leur dossier Google Drive.

Pour tout le reste — droit des baux commerciaux, financement, fiscalité, méthode d'analyse — réponds directement, sans outil, en restant bref et en disant franchement quand tu ne sais pas.

RÈGLES :
1. Cherche toujours avant d'agir sur un dossier ou un projet : tu as besoin de l'identifiant rendu par la recherche.
2. Si la recherche rend plusieurs résultats, n'en choisis aucun : liste-les brièvement et demande lequel.
3. Si elle n'en rend aucun, dis-le, sans inventer.
4. « Dossier » désigne un dossier de préanalyse ; « projet » un projet de la plateforme. Dans le doute, cherche des deux côtés et demande.
5. Une fois l'action faite, dis ce qui a été fait et donne le lien.
6. N'invente jamais un chiffre sur un bien : si tu ne l'as pas reçu d'un outil, dis que tu ne l'as pas.
7. Une simulation se rend avec ses hypothèses : dis toujours sur quel apport, quel taux et quelle durée elle repose.
8. Un brouillon de mail n'est pas un envoi. Annonce-le comme une proposition à relire, jamais comme un message parti.`;

/**
 * Traite une demande en langage naturel.
 * @param {Array<{role, contenu}>} historique
 * @returns {Promise<{ texte: string, actions: Array }>}
 */
export async function commander(historique, user) {
  const actions = [];
  const { text } = await runAgent({
    system: CONSIGNE,
    messages: historique.map((m) => ({ role: m.role, content: m.contenu })),
    tools: OUTILS,
    onTool: async (appel) => {
      const resultat = await executerOutil(appel, user);
      // On garde la trace de ce qui a réellement été fait : le texte du modèle
      // n'est pas une preuve d'action.
      const agissant =
        appel.name.startsWith('pousser') ||
        ['creer_drive_dossier', 'extraire_documents', 'preparer_mail'].includes(appel.name);
      if (agissant && resultat?.ok) actions.push({ ...appel, resultat });
      return resultat;
    },
  });
  return { texte: text, actions };
}

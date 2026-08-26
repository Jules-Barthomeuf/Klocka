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
import { journaliser } from './assistant-journal.js';

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
      "Toutes les données d'un dossier : prix FAI et prix acte en main, loyer, surface, rendements, locataire et activité, bail, commune, projection financière (prix de revient, apport, rentabilité, cash-flow), plus l'étape, le statut, les documents présents et manquants, le Drive et le contact agent. À utiliser pour « où en est … », « quel est le prix de … », toute question sur un bien.",
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
    name: 'etat_projet',
    description:
      "Les données d'un projet de la plateforme : adresse, prix, loyer, surface, rendement, locataire, clients rattachés, présence dans Monday. Nécessite l'identifiant obtenu par chercher_projet.",
    input_schema: {
      type: 'object',
      properties: { projet_id: { type: 'string' } },
      required: ['projet_id'],
    },
  },
  {
    name: 'verifier',
    description:
      "Passe en revue un dossier ou un projet et rend ce qui manque, avec l'action qui le lève : dossier Drive absent, bien pas dans Monday, agent sans fiche, documents non extraits, chiffres introuvables… À utiliser dès qu'on demande « vérifie », « qu'est-ce qui manque », « où ça en est vraiment », et avant de proposer quoi que ce soit sur un dossier ou un projet.",
    input_schema: {
      type: 'object',
      properties: {
        deal_id: { type: 'string', description: 'Pour un dossier de préanalyse' },
        projet_id: { type: 'string', description: 'Pour un projet de la plateforme' },
      },
    },
  },
  {
    name: 'creer_agent_monday',
    description:
      "Crée la fiche d'un agent immobilier dans le tableau Monday « Agent immobilier ». Deux usages : depuis un dossier (deal_id, le contact du dossier est repris), ou de but en blanc à partir des coordonnées données — un agent rencontré n'a pas besoin d'un dossier pour exister. L'adresse mail est le minimum requis.",
    input_schema: {
      type: 'object',
      properties: {
        deal_id: { type: 'string', description: "Pour reprendre le contact d'un dossier" },
        nom: { type: 'string' },
        email: { type: 'string' },
        telephone: { type: 'string' },
        ville: { type: 'string' },
        entreprise: { type: 'string', description: "Agence ou réseau" },
      },
    },
  },
  {
    name: 'interroger_documents',
    description:
      "Pose une question sur le contenu des documents d'un dossier — bail, PV d'assemblée générale, règlement de copropriété, quittances, diagnostics. Le modèle lit les pièces elles-mêmes. À utiliser pour « que dit le bail sur … », « le PV parle-t-il de … ».",
    input_schema: {
      type: 'object',
      properties: {
        deal_id: { type: 'string' },
        question: { type: 'string', description: 'La question, telle qu\'on la poserait à un juriste' },
      },
      required: ['deal_id', 'question'],
    },
  },
  {
    name: 'envoyer_mail',
    description:
      "Envoie un mail déjà rédigé. À n'appeler QUE si l'analyste a explicitement demandé l'envoi après avoir vu le texte. Sans cet accord, propose le brouillon et arrête-toi là.",
    input_schema: {
      type: 'object',
      properties: {
        deal_id: { type: 'string' },
        destinataire: { type: 'string' },
        objet: { type: 'string' },
        corps: { type: 'string' },
        intention: { type: 'string' },
      },
      required: ['destinataire', 'objet', 'corps'],
    },
  },
  {
    name: 'annuler_derniere_action',
    description:
      "Défait la dernière action réversible : élément Monday créé, fiche agent créée, dossier Drive créé. Une mise à jour ou un envoi ne se défont pas — l'outil le dit alors franchement.",
    input_schema: { type: 'object', properties: {} },
  },
  {
    name: 'historique_actions',
    description: "Ce que l'assistant a réellement exécuté récemment, et par qui.",
    input_schema: { type: 'object', properties: {} },
  },
  {
    name: 'plan_du_jour',
    description:
      "Ce qui est à faire maintenant : mails à traiter, relances dues, documents manquants, dossiers prêts à entrer en plateforme. Répond à « qu'est-ce que je dois faire », « quoi de neuf ».",
    input_schema: { type: 'object', properties: {} },
  },
  {
    name: 'registre_engagements',
    description:
      "Le registre des engagements : qui doit quoi, pour quand. Sans deal_id, tout le registre ; avec, les engagements de ce dossier. Répond à « qu'attend-on », « qui doit quoi », « quelles promesses ».",
    input_schema: { type: 'object', properties: { deal_id: { type: 'string' } } },
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
    const { engagementsOuverts } = await import('./deal/engagements.js');
    const mail = await redigerMailIntention(lot, input.intention, {
      signature: user?.full_name || user?.email,
      sansIA: !!deal.test,
      engagements: engagementsOuverts(input.deal_id),
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

  if (name === 'verifier') {
    const { verifierDossier, verifierProjet } = await import('./deal/verifications.js');
    if (input.projet_id) {
      const projet = Records.get('Project', input.projet_id);
      if (!projet) return { erreur: 'Projet introuvable' };
      return verifierProjet(projet);
    }
    const deal = Records.filter('Deal', { deal_id: input.deal_id })[0];
    if (!deal) return { erreur: 'Dossier introuvable' };
    return verifierDossier(deal);
  }

  if (name === 'creer_agent_monday') {
    // Depuis un dossier, ou de but en blanc : un agent rencontré en salon n'a
    // pas de dossier, et n'a pas à en attendre un pour entrer au CRM.
    let agent = {
      nom: input.nom,
      email: input.email,
      telephone: input.telephone,
      ville: input.ville,
      entreprise: input.entreprise,
    };

    if (input.deal_id) {
      const deal = Records.filter('Deal', { deal_id: input.deal_id })[0];
      if (!deal) return { erreur: 'Dossier introuvable' };
      if (!deal.contact_agent_email && !agent.email) {
        return { erreur: "Ce dossier n'a pas d'adresse d'agent : donnez-la directement." };
      }
      const fiche = Records.list('Contact').find(
        (c) => String(c.email || '').toLowerCase() === String(deal.contact_agent_email || '').toLowerCase()
      );
      agent = {
        nom: agent.nom || fiche?.nom,
        email: agent.email || deal.contact_agent_email,
        telephone: agent.telephone || fiche?.telephone,
        ville: agent.ville || fiche?.localisation || villeDeal(deal),
        entreprise: agent.entreprise || fiche?.entreprise,
      };
    }

    if (!agent.email) return { erreur: "Il faut au moins l'adresse mail de l'agent." };

    const { creerAgentMonday } = await import('./deal/monday-sync.js');
    const r = await creerAgentMonday(agent);
    if (r?.ignore) return { erreur: `Rien n'a été posé dans Monday : ${r.raison || 'raison inconnue'}` };
    if (r?.erreur) return r;

    // La fiche entre aussi au CRM local : c'est elle qui fait qu'un mail de cet
    // agent sera reconnu au lieu d'être trié comme inconnu.
    const cle = String(agent.email).toLowerCase();
    const existant = Records.list('Contact').find((c) => String(c.email || '').toLowerCase() === cle);
    if (!existant) {
      Records.create('Contact', {
        nom: agent.nom || agent.email,
        email: agent.email,
        telephone: agent.telephone || '',
        entreprise: agent.entreprise || '',
        localisation: agent.ville || '',
        fonction: 'Agent immobilier',
        source: 'assistant',
      });
    }

    return {
      ok: true,
      cree: r.cree,
      agent: agent.email,
      nom: agent.nom || agent.email,
      titre: agent.nom || agent.email,
      // « Entreprise » est une liste fermée côté Monday : si le libellé n'y
      // figure pas, il n'est pas écrit — et il faut le dire.
      ...(r.entreprise_ignoree
        ? {
            avertissement: `L'entreprise « ${r.entreprise_ignoree} » ne fait pas partie de la liste du tableau Monday : elle n'a pas été enregistrée là-bas (elle l'est au CRM local). À ajouter à la main dans la colonne si besoin.`,
          }
        : {}),
    };
  }

  if (name === 'interroger_documents') {
    const deal = Records.filter('Deal', { deal_id: input.deal_id })[0];
    if (!deal) return { erreur: 'Dossier introuvable' };
    const { questionnerDocuments } = await import('./deal/espace.js');
    const r = await questionnerDocuments(input.deal_id, { question: input.question, uploadDir: UPLOAD_DIR });
    if (!r.ok) return { erreur: r.error };
    return { titre: titreDeal(deal), documents_lus: r.documents_lus, reponse: r.reponse };
  }

  if (name === 'envoyer_mail') {
    const { callFunction } = await import('./functions.js');
    const r = await callFunction(
      'sendMail',
      {
        to: input.destinataire,
        subject: input.objet,
        body: input.corps,
        ...(input.deal_id ? { deal_id: input.deal_id } : {}),
        ...(input.intention ? { intention: input.intention } : {}),
      },
      { user }
    );
    if (r?.error) return { erreur: r.error };
    return {
      ok: true,
      envoye: !r?.simulated,
      simule: !!r?.simulated,
      destinataire: input.destinataire,
      objet: input.objet,
    };
  }

  if (name === 'annuler_derniere_action') {
    const { derniereAnnulable, annuler, dernieresActions } = await import('./assistant-journal.js');
    const cible = derniereAnnulable(user?.email);
    if (!cible) {
      const recentes = dernieresActions(3, user?.email);
      return {
        ok: false,
        message: recentes.length
          ? `Rien d'annulable. Dernière action : ${recentes[0].outil}${recentes[0].effet_annulation ? '' : ' — sans retour'}.`
          : "Aucune action exécutée récemment.",
      };
    }
    return annuler(cible);
  }

  if (name === 'historique_actions') {
    const { dernieresActions } = await import('./assistant-journal.js');
    return {
      actions: dernieresActions(8).map((a) => ({
        outil: a.outil,
        le: a.le,
        par: a.par,
        sur: a.resultat?.titre || a.deal_id || a.projet_id || null,
        annulable: a.annulable && !a.annulee,
        annulee: !!a.annulee,
      })),
    };
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
    return { ok: true, cree: true, titre, url: r.folder_url, chemin: r.chemin, compte, fichiers_classes: r.envoyes.length };
  }

  if (name === 'etat_dossier') {
    const deal = Records.filter('Deal', { deal_id: input.deal_id })[0];
    if (!deal) return { erreur: 'Dossier introuvable' };
    const { documentsManquants } = await import('./deal/propositions.js');
    const { etapeMax, ETAPES } = await import('./deal/etapes.js');
    const etape = etapeMax(deal);
    const lot = deal.lots?.[0];

    // Les faits du bien et ses chiffres : sans eux, l'assistant répondait
    // « je n'ai pas le prix » alors que le dossier le portait, et inventait
    // une explication à cette absence.
    let bien = null;
    let finances = null;
    let marche = null;
    if (lot) {
      try {
        const { vueRedacteur } = await import('./deal/redact.js');
        const vue = vueRedacteur({ lot: lot.lot, enrichissement: lot.enrichissement, evaluation: lot.evaluation });
        bien = vue.bien;
        finances = vue.finances;
        marche = vue.marche;
      } catch {
        // Vue indisponible : le reste de l'état reste utile.
      }
    }

    let projection = null;
    if (lot?.simulateur?.loyerInitialHTHC) {
      const { indicateursCles } = await import('./video/indicateurs.js');
      projection = indicateursCles(lot);
    }

    return {
      titre: titreDeal(deal),
      ville: villeDeal(deal),
      statut: statutDe(deal),
      etape: `${etape} — ${ETAPES.find((e) => e.n === etape)?.label || ''}`,
      verdict: lot?.evaluation?.verdict || null,
      bien,
      finances,
      marche,
      // Prix de revient, apport, rentabilité, cash-flow, sur les hypothèses
      // par défaut du simulateur.
      projection,
      nombre_de_lots: deal.lots?.length || 0,
      documents: (deal.documents_espace || []).map((d) => d.nom),
      documents_manquants: documentsManquants(deal).map((m) => m.libelle),
      dossier_drive: deal.drive_folder_url || null,
      dans_monday: !!deal.monday_item_id,
      contact_agent: deal.contact_agent_email || null,
      relance_prevue_le: deal.relance_prevue_le || null,
      engagements_ouverts: (await import('./deal/engagements.js')).engagementsOuverts(deal.deal_id).map((e) => ({
        de: e.de,
        quoi: e.quoi,
        echeance: e.echeance,
      })),
      dernier_evenement: (deal.suivi || []).slice(-1)[0]?.detail || null,
    };
  }

  if (name === 'etat_projet') {
    const projet = Records.get('Project', input.projet_id);
    if (!projet) return { erreur: 'Projet introuvable' };
    const nombre = (v) => (typeof v === 'number' && v > 0 ? v : null);
    const chiffre = (...c) => c.map(nombre).find((v) => v != null) ?? null;
    // Comme pour Monday : les chiffres vivent souvent dans les champs du
    // simulateur, la fiche d'en-tête restant à zéro.
    const prix = chiffre(projet.prix_acquisition, projet.sim_prix_bien_negocie, projet.sim_prix_bien_fai);
    const loyer = chiffre(projet.loyer_annuel_ht, projet.sim_loyer_initial_ht);
    const surface = chiffre(projet.surface_m2, projet.sim_surface);
    return {
      titre: projet.titre,
      statut: projet.statut,
      adresse: projet.adresse_complete || null,
      ville: projet.ville_secteur_champ1 || null,
      prix,
      loyer_annuel_ht: loyer,
      surface_m2: surface,
      rendement: prix && loyer ? Math.round((loyer / prix) * 10000) / 100 : null,
      locataire: projet.nom_locataire || null,
      activite: projet.activite_locataire || null,
      echeance_bail: projet.echeance_bail || null,
      clients: [projet.client_email, ...(projet.client_emails || [])].filter(Boolean),
      photos: (projet.photos || []).length,
      dans_monday: !!projet.monday_item_id,
      issu_du_dossier: projet.deal_id || null,
    };
  }

  if (name === 'pousser_dossier_monday') {
    const deal = Records.filter('Deal', { deal_id: input.deal_id })[0];
    if (!deal) return { erreur: 'Dossier introuvable' };
    const { pousserBien } = await import('./deal/monday-sync.js');
    const r = await pousserBien(deal, { motif: input.motif });
    if (r?.ignore) return { erreur: `Rien n'a été posé dans Monday : ${r.raison || 'raison inconnue'}` };
    return {
      ok: true,
      titre: titreDeal(deal),
      cree: r.cree,
      url: `https://klocka-company.monday.com/boards/${process.env.MONDAY_BOARD_PROPRIETES || ''}/pulses/${r.id}`,
    };
  }

  if (name === 'registre_engagements') {
    const { engagementsOuverts, tousLesEngagements, enRetard } = await import('./deal/engagements.js');
    const liste = input.deal_id ? engagementsOuverts(input.deal_id) : tousLesEngagements().slice(0, 30);
    return {
      engagements: liste.map((e) => ({
        dossier: e.dossier,
        deal_id: e.deal_id,
        de: e.de,
        quoi: e.quoi,
        echeance: e.echeance,
        statut: e.statut,
        en_retard: enRetard(e),
        source: e.source?.type,
      })),
      nombre: liste.length,
    };
  }

  if (name === 'pousser_projet_monday') {
    const projet = Records.get('Project', input.projet_id);
    if (!projet) return { erreur: 'Projet introuvable' };
    const { pousserProjet } = await import('./deal/monday-sync.js');
    const r = await pousserProjet(projet, { motif: input.motif });
    if (r?.ignore) return { erreur: `Rien n'a été posé dans Monday : ${r.raison || 'raison inconnue'}` };
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

Tu sais aussi vérifier un dossier ou un projet et dire ce qui manque, lire ses documents pour répondre à une question précise, envoyer un mail une fois qu'on te l'a demandé, inscrire un agent immobilier au CRM — avec ou sans dossier rattaché — et annuler ta dernière action.

Pour tout le reste — droit des baux commerciaux, financement, fiscalité, méthode d'analyse — réponds directement, sans outil, en restant bref et en disant franchement quand tu ne sais pas.

RÈGLES :
1. Cherche toujours avant d'agir sur un dossier ou un projet : tu as besoin de l'identifiant rendu par la recherche.
2. Si la recherche rend plusieurs résultats, n'en choisis aucun : liste-les brièvement et demande lequel.
3. Si elle n'en rend aucun, dis-le, sans inventer.
4. « Dossier » désigne un dossier de préanalyse ; « projet » un projet de la plateforme. Dans le doute, cherche des deux côtés et demande.
5. Une fois l'action faite, dis ce qui a été fait et donne le lien.
6. N'invente jamais un chiffre sur un bien : si tu ne l'as pas reçu d'un outil, dis que tu ne l'as pas. Et n'invente pas non plus d'explication à une donnée absente — dis simplement qu'elle n'est pas au dossier.
7. Une simulation se rend avec ses hypothèses : dis toujours sur quel apport, quel taux et quelle durée elle repose.
8. Un brouillon de mail n'est pas un envoi. Annonce-le comme une proposition à relire, jamais comme un message parti.
9. Un mail ne part jamais sans accord explicite : propose le texte, attends « envoie », alors seulement envoie.
10. « Annule » défait la dernière action réversible. Si elle ne l'est pas, dis-le sans détour au lieu de faire semblant.
11. Un agent immobilier n'a pas besoin d'un dossier pour entrer au CRM : si on te donne un nom et une adresse mail, inscris-le. Ne réclame un dossier que si l'adresse manque.
12. Dès qu'on te parle d'un dossier ou d'un projet précis, vérifie-le avant de répondre. Dis ce que tu as constaté, puis propose ce qui manque — une proposition à la fois, en commençant par la plus utile, et attends la réponse avant d'agir. Ne propose pas ce qui n'a pas d'outil : signale-le comme à faire à la main.`;

// L'écran que l'utilisateur a sous les yeux : « mets-le dans Monday » doit
// suffire quand le dossier est déjà ouvert devant lui.
function consigneContexte(contexte) {
  if (!contexte?.deal_id && !contexte?.projet_id) return '';
  const quoi = contexte.deal_id
    ? `le dossier ${contexte.deal_id}`
    : `le projet ${contexte.projet_id}`;
  return `\n\nL'utilisateur regarde en ce moment ${quoi}${contexte.titre ? ` (« ${contexte.titre} »)` : ''}. Quand il dit « ce dossier », « ce projet », « le mettre dans Monday » sans autre précision, c'est de celui-là qu'il parle : utilise directement cet identifiant, sans chercher.`;
}

/**
 * Traite une demande en langage naturel.
 * @param {Array<{role, contenu}>} historique
 * @param {object} user
 * @param {{deal_id?, projet_id?, titre?}} [contexte] - l'écran ouvert
 * @returns {Promise<{ texte: string, actions: Array }>}
 */
export async function commander(historique, user, contexte = null) {
  const actions = [];
  // Tous les outils appelés, y compris ceux qui n'ont fait que lire : le
  // journal doit pouvoir dire ce que l'assistant a consulté.
  const outils = [];
  const { text } = await runAgent({
    system: CONSIGNE + consigneContexte(contexte),
    messages: historique.map((m) => ({ role: m.role, content: m.contenu })),
    tools: OUTILS,
    onTool: async (appel) => {
      outils.push(appel.name);
      const resultat = await executerOutil(appel, user);
      // On garde la trace de ce qui a réellement été fait : le texte du modèle
      // n'est pas une preuve d'action.
      const agissant =
        appel.name.startsWith('pousser') ||
        ['creer_drive_dossier', 'extraire_documents', 'preparer_mail', 'creer_agent_monday', 'envoyer_mail'].includes(
          appel.name
        );
      if (agissant && resultat?.ok) actions.push({ ...appel, resultat });

      // Une action qui touche un système extérieur laisse une trace : qui l'a
      // demandée, ce qui a réellement été exécuté, et si elle se défait.
      //
      // L'échec se consigne aussi. Il ne l'était pas, et une tentative ratée
      // ne laissait donc rien derrière elle : impossible, le lendemain, de
      // dire pourquoi l'assistant avait annoncé un refus.
      if (agissant && appel.name !== 'preparer_mail') {
        try {
          journaliser({ outil: appel.name, args: appel.input, resultat, user });
        } catch (e) {
          console.warn('[assistant] journalisation impossible :', e?.message || e);
        }
      }
      return resultat;
    },
  });
  return { texte: text, actions, outils };
}

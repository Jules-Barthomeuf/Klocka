// Ce qui manque à un dossier ou à un projet, et ce qu'on peut y faire.
//
// L'assistant ne doit pas seulement répondre : il doit constater. « J'ai
// vérifié, le dossier Drive n'existe pas, je le crée ? » vaut mieux qu'une
// question posée à l'aveugle.
//
// Chaque constat porte l'action qui le lève, avec l'outil correspondant. Rien
// n'est exécuté ici : on décrit, l'analyste décide.

import { Records } from '../db.js';
import { statutDe } from './lifecycle.js';
import { engagementsOuverts, enRetard } from './engagements.js';
import { documentsManquants } from './propositions.js';
import { netVendeurSansHonoraires } from './notes-bien.js';

// Les documents d'un projet : ceux de la case « Documents » de l'éditeur.
const DOCUMENTS_PROJET = [
  { key: 'bail', libelle: 'le bail commercial' },
  { key: 'pv_ag', libelle: "les PV d'AG" },
  { key: 'diagnostics', libelle: 'les diagnostics' },
  { key: 'quittances', libelle: 'les quittances de loyer' },
  { key: 'rcp', libelle: 'le règlement de copropriété' },
];

/**
 * Pure : les documents qui manquent à un projet : ni cochés sur le projet, ni
 * reconnus parmi les pièces de son dossier.
 */
export function documentsManquantsProjet(projet, deal = null) {
  const coches = projet?.docs_checklist || {};
  const absentsDuDossier = deal ? new Set(documentsManquants(deal).map((d) => d.type)) : null;
  return DOCUMENTS_PROJET.filter((d) => !coches[d.key] && (!absentsDuDossier || absentsDuDossier.has(d.key)));
}

// Ce qui ressemble à une valeur sans en être une.
const VAGUE = /^(|-|—|n\.?\s*c\.?|activit\p{L}* [àa] qualifier|[àa] (qualifier|pr[ée]ciser|d[ée]finir|v[ée]rifier)|non renseign\p{L}*|inconnu\p{L}*|ind[ée]termin\p{L}*|(locataire )?non identifi\p{L}*)$/iu;

/**
 * Pure : les informations du bail et du locataire qu'un projet devrait
 * porter et qu'il n'a pas, ou qu'il a sous une forme qui ne dit rien.
 */
export function informationsManquantesProjet(projet) {
  const vide = (v) => v == null || VAGUE.test(String(v).trim());
  const zero = (...v) => v.every((x) => !(Number(x) > 0));
  const m = [];
  if (vide(projet.nom_locataire)) m.push("l'enseigne exacte du locataire");
  if (vide(projet.activite_locataire)) m.push("l'activité précise du locataire");
  if (vide(projet.locataire_depuis)) m.push('depuis quand le locataire est en place');
  if (vide(projet.echeance_bail)) m.push("l'échéance du bail");
  if (vide(projet.activites_autorisees)) m.push('la destination du bail (activités autorisées)');
  if (zero(projet.taxe_fonciere_an, projet.sim_taxe_fonciere)) m.push('la taxe foncière');
  if (zero(projet.charges_copropriete, projet.provision_charges, projet.sim_charges_copropriete)) m.push('les charges');
  return m;
}

const titreDeal = (d) => d.nom || d.lots?.[0]?.synthese?.titre || d.deal_id;

const nombre = (v) => (typeof v === 'number' && v > 0 ? v : null);
const chiffre = (...c) => c.map(nombre).find((v) => v != null) ?? null;

/**
 * Vérifie un dossier de préanalyse.
 * @returns {{titre, constats: Array<{manque, action, outil, arguments}>}}
 */
export function verifierDossier(deal) {
  const constats = [];
  const statut = statutDe(deal);

  if (!deal.drive_folder_url) {
    constats.push({
      manque: "le dossier Google Drive n'a pas été créé",
      action: 'le créer et y classer les documents déjà déposés',
      outil: 'creer_drive_dossier',
      arguments: { deal_id: deal.deal_id },
    });
  }

  if (!deal.monday_item_id) {
    constats.push({
      manque: "le bien ne figure pas dans le tableau Monday « Propriétés »",
      action: "l'y poser avec son prix, son loyer et son statut",
      outil: 'pousser_dossier_monday',
      arguments: { deal_id: deal.deal_id },
    });
  }

  if (!deal.contact_agent_email) {
    constats.push({
      manque: "l'adresse de l'agent immobilier est inconnue",
      action: 'à renseigner à la main : sans elle, aucun mail ni aucune liaison Monday',
      outil: null,
    });
  } else if (!agentDansMonday(deal.contact_agent_email)) {
    constats.push({
      manque: `l'agent ${deal.contact_agent_email} n'a pas de fiche dans Monday`,
      action: 'créer sa fiche et la relier au bien',
      outil: 'creer_agent_monday',
      arguments: { deal_id: deal.deal_id },
    });
  }

  const documents = deal.documents_espace || [];
  const nonExtraits = documents.filter((d) => !['fait', 'erreur'].includes(d.extraction?.statut));
  if (documents.length && nonExtraits.length) {
    constats.push({
      manque: `${nonExtraits.length} document(s) sur ${documents.length} n'ont pas été extraits`,
      action: "lancer l'extraction",
      outil: 'extraire_documents',
      arguments: { deal_id: deal.deal_id },
    });
  }

  const manquants = documentsManquants(deal);
  if (manquants.length && ['analyse', 'documents_demandes', 'documents_recus'].includes(statut)) {
    constats.push({
      manque: `il manque ${manquants.map((m) => m.libelle).join(', ')}`,
      action: "préparer la demande de documents à l'agent",
      outil: 'preparer_mail',
      arguments: { deal_id: deal.deal_id, intention: 'demande_documents' },
    });
  }

  // Le registre des engagements dit ce qui est dû, par qui, depuis quand —
  // c'est lui qui fonde le constat, plus le minuteur d'autrefois.
  for (const e of engagementsOuverts(deal.deal_id).filter(enRetard)) {
    constats.push({
      manque: `${e.quoi} — attendu de ${e.de || "l'agent"} pour le ${new Date(e.echeance).toLocaleDateString('fr-FR')}`,
      action: 'préparer la relance',
      outil: 'preparer_mail',
      arguments: { deal_id: deal.deal_id, intention: 'relance' },
    });
  }

  if (statut === 'depouille' && !deal.projet_id) {
    constats.push({
      manque: "le dossier est extrait mais n'est pas entré dans la plateforme",
      action: 'créer le projet pré-rempli',
      outil: null,
    });
  }

  // Ce que la préanalyse n'a pas trouvé dans la fiche : à demander aussi.
  const infos = (deal.lots?.[0]?.evaluation?.libelles_manquants || []).filter((l) => !/pr[ée]-?analyse non faite/i.test(l));
  if (infos.length) constats.push({ genre: 'informations', manque: `la fiche ne dit pas ${infos.join(', ')}`, action: "à demander à l'agent", outil: null });
  const nv = netVendeurSansHonoraires(deal.lots?.[0]);
  if (nv && !nv.chiffres) constats.push({ genre: 'prix', manque: 'le prix est net vendeur et les honoraires ne sont pas chiffrés', action: "demander leur montant à l'agent", outil: null });

  return { type: 'dossier', titre: titreDeal(deal), statut, constats };
}

/** L'agent a-t-il une fiche dans le CRM Monday ? */
function agentDansMonday(email) {
  const cherche = String(email).toLowerCase();
  return Records.list('Contact').some((c) => String(c.email || '').toLowerCase() === cherche);
}

/**
 * Vérifie un projet de la plateforme.
 */
export function verifierProjet(projet) {
  const constats = [];

  if (!projet.monday_item_id) {
    constats.push({
      manque: "le projet ne figure pas dans le tableau Monday « Propriétés »",
      action: "l'y poser",
      outil: 'pousser_projet_monday',
      arguments: { projet_id: projet.id },
    });
  }

  // Les chiffres peuvent vivre dans les champs du simulateur : on ne signale
  // que ce qui est réellement introuvable.
  const prix = chiffre(projet.prix_acquisition, projet.sim_prix_bien_negocie, projet.sim_prix_bien_fai);
  const loyer = chiffre(projet.loyer_annuel_ht, projet.sim_loyer_initial_ht);
  const surface = chiffre(projet.surface_m2, projet.sim_surface);
  const absents = [!prix && 'le prix', !loyer && 'le loyer', !surface && 'la surface'].filter(Boolean);
  if (absents.length) {
    constats.push({
      manque: `${absents.join(', ')} ${absents.length > 1 ? 'sont introuvables' : 'est introuvable'}`,
      action: "à renseigner dans l'éditeur du projet — sans eux, ni simulation ni présentation",
      outil: null,
    });
  }

  if (!projet.adresse_complete) {
    constats.push({ manque: "l'adresse est vide", action: "à renseigner dans l'éditeur", outil: null });
  }

  if (!(projet.photos || []).length) {
    constats.push({
      manque: 'aucune photo',
      action: "à ajouter dans l'éditeur : la présentation client s'appuie dessus",
      outil: null,
    });
  }

  const clients = [projet.client_email, ...(projet.client_emails || [])].filter(Boolean);
  if (!clients.length) {
    constats.push({ manque: "aucun client n'est rattaché", action: "à choisir dans l'éditeur", outil: null });
  }

  // Les documents et les informations du bail : ce qu'on demande à l'agent.
  const deal = projet.deal_id ? Records.findBy('Deal', 'deal_id', projet.deal_id) : null;
  const docs = documentsManquantsProjet(projet, deal);
  if (docs.length) {
    constats.push({
      genre: 'documents',
      manque: `il manque ${docs.map((d) => d.libelle).join(', ')}`,
      action: deal?.contact_agent_email ? "les demander à l'agent" : "les demander à l'agent (son adresse n'est pas sur le dossier)",
      outil: deal ? 'mail_agent' : null,
      arguments: deal ? { deal_id: deal.deal_id, intention: 'demande_documents', raisons: docs.map((d) => d.libelle).join('\n') } : null,
    });
  }
  const infos = informationsManquantesProjet(projet);
  if (infos.length) {
    constats.push({ genre: 'informations', manque: `on ne connaît pas ${infos.join(', ')}`, action: "à lire dans le bail ou à demander à l'agent", outil: null });
  }
  const nv = deal ? netVendeurSansHonoraires(deal.lots?.[0]) : null;
  if (nv && !nv.chiffres) {
    constats.push({ genre: 'prix', manque: "le prix de la fiche est net vendeur et les honoraires ne sont pas chiffrés : le FAI réel est plus haut", action: "demander le montant des honoraires à l'agent", outil: null });
  }

  return { type: 'projet', titre: projet.titre, statut: projet.statut, deal_id: deal?.deal_id || null, constats };
}

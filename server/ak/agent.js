// AK, l'agent : une phrase du chat devient une action sur la plateforme.
//
// Le fond est celui de l'assistant de commande (assistant-commande.js) : les
// mêmes outils, le même principe — le modèle traduit, le code agit. AK y
// ajoute ce que l'équipe lui demande dans le groupe : créer le projet d'un
// dossier, lancer K-Data et ranger le résultat dans le dossier, sortir la
// préz bancaire d'un projet. Et sa personnalité, qui est celle du document
// écrit par Jules (consigne.md), pris tel quel.
//
// Ce qu'AK ne fait pas : envoyer un mail. Il en prépare le texte, quelqu'un
// l'envoie. C'est une décision de l'équipe, pas une limite technique.

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { Records, Conversations, CHEMIN_UPLOADS } from '../db.js';
import { runAgent, provider } from '../llm.js';
import { OUTILS as OUTILS_ASSISTANT, executerOutil as executerOutilAssistant } from '../assistant-commande.js';
import { journaliser } from '../assistant-journal.js';
import { APP_URL_PROD } from '../contexte.js';
import { QUESTIONS, valeursParDefaut } from '../kdata-questions.js';
import { CLES_OUTILS, lancerAnalyses, ranger, lienDe } from '../kdata.js';
import { COMPTE } from './chat.js';
import { verifierRenta, chercherBiens, lirePiece, chercherCibles, lancerAlx, boiteRecue, lireMail, mailsDuDossier, preanalyserMailRecu, chercherSurLeDrive, rangerSurLeDrive, bloquerRendezVous, agendaDuJour } from './outils.js';
import { leconsPourConsigne, souvenirsPourConsigne, retenir, oublier, souvenirs } from './lecons.js';

const AGENT = 'ak';
// Seize messages de mémoire : au-delà, chaque demande relit un roman qu'elle
// paie, pour un chat où l'on parle d'une chose à la fois.
const MAX_MESSAGES = 16;
// AK peut tourner sur un modèle moins cher que le reste de la plateforme :
// il traduit des phrases courtes en appels d'outils, ce n'est pas la lecture
// d'un bail. Vide : le modèle de la configuration.
export const MODELE = (process.env.AK_MODELE || '').trim() || null;
const ici = path.dirname(fileURLToPath(import.meta.url));
const APP_URL = APP_URL_PROD || 'http://localhost:5173';

/** Le document de Jules, mot pour mot. */
export const CONSIGNE = fs.readFileSync(path.join(ici, 'consigne.md'), 'utf8');

// Les outils de l'assistant qu'AK reprend. Pas l'envoi de mail : décidé. Pas
// non plus son creer_dossier, qui enchaîne CRM, Monday et promesse de
// documents : dans le chat, « crée un dossier » crée un dossier, rien d'autre.
const EXCLUS = new Set(['envoyer_mail', 'creer_dossier']);
const NOMS_KDATA = { kzoning: 'K-Zoning', kexpertise: 'K-Expertise', kestimation: 'Estimation', kprospective: 'K-Prospective', kfoncier: 'K-Foncier', 'valeur-locative': 'Valeur locative', kvacance: 'K-Vacance', ktransactions: 'K-Transactions' };

const OUTILS_AK = [
  {
    name: 'creer_dossier',
    description: "Crée un dossier de préanalyse, et rien d'autre : pas de Monday, pas de CRM, pas de promesse. Ce qu'on sait du bien va dans l'aperçu ; tout est facultatif sauf le nom.",
    input_schema: {
      type: 'object',
      properties: {
        nom: { type: 'string', description: "l'enseigne ou le nom du bien, ex: « Devred », « Ben » ; la ville va dans son champ, le titre final sera « Devred - Firminy »" },
        ville: { type: 'string' }, rue: { type: 'string' },
        prix: { type: 'number', description: 'prix FAI en euros, si donné' },
        surface: { type: 'number', description: 'surface en m², si donnée' },
        loyer: { type: 'number', description: 'loyer annuel HT HC en euros, si donné' },
        activite: { type: 'string' },
        agent_nom: { type: 'string' }, agent_email: { type: 'string' }, agent_telephone: { type: 'string' }, agence: { type: 'string' },
      },
      required: ['nom'],
    },
  },
  {
    name: 'analyser_fiche',
    description: "Crée un dossier de préanalyse à partir d'une fiche commerciale, d'un teaser ou d'un investment memorandum (« crée ce dossier », « fais la pré-analyse ») : lecture, extraction du bien, synthèse. La fiche est soit une pièce jointe (donner son chemin tel qu'il est donné dans le message), soit collée dans le message lui-même (mettre texte_du_message à vrai : le texte complet du message est pris, inutile de le recopier). Une minute environ.",
    input_schema: { type: 'object', properties: { chemin: { type: 'string', description: 'le chemin de la pièce jointe, tel que donné' }, texte_du_message: { type: 'boolean', description: 'vrai quand la fiche est le texte du message' }, texte: { type: 'string', description: 'la fiche recopiée par toi, quand elle est sur une image (capture d\'un mail, d\'une annonce) : tout ce que tu y lis, sans rien inventer' } } },
  },
  {
    name: 'boite_recue',
    description: "Les mails reçus par l'équipe et pas encore traités (« y'a quoi dans la boîte ? ») : qui, objet, extrait, pièces jointes. La boîte est relevée toutes les cinq minutes par la plateforme.",
    input_schema: { type: 'object', properties: { limite: { type: 'number' }, tous: { type: 'boolean', description: 'vrai pour voir aussi les mails déjà rattachés à un dossier' } } },
  },
  {
    name: 'lire_mail',
    description: "Le texte complet d'un mail reçu, par son identifiant (boite_recue le donne).",
    input_schema: { type: 'object', properties: { id: { type: 'string' } }, required: ['id'] },
  },
  {
    name: 'mails_du_dossier',
    description: "Les derniers échanges de mails d'un dossier, reçus et envoyés (« qu'est-ce qu'il dit l'agent de Lorient ? »). Chercher le dossier d'abord.",
    input_schema: { type: 'object', properties: { deal_id: { type: 'string' } }, required: ['deal_id'] },
  },
  {
    name: 'preanalyser_mail',
    description: "Crée le dossier de préanalyse à partir d'un mail reçu (sa fiche jointe, son texte), comme le bouton de la plateforme, et lie le mail au dossier. Une minute.",
    input_schema: { type: 'object', properties: { id: { type: 'string', description: 'identifiant du mail, de boite_recue' } }, required: ['id'] },
  },
  {
    name: 'chercher_drive',
    description: "Cherche un fichier sur le Drive partagé (« c'est où la préz de Lorient ? »), dans le dossier Drive d'un deal si on le donne, sinon partout.",
    input_schema: { type: 'object', properties: { recherche: { type: 'string' }, deal_id: { type: 'string' } } },
  },
  {
    name: 'ranger_drive',
    description: "Range une pièce jointe du message dans le dossier Drive d'un deal (« range ça dans le dossier de Devred »). Chercher le dossier d'abord ; le dossier Drive est créé s'il n'existe pas.",
    input_schema: { type: 'object', properties: { deal_id: { type: 'string' }, chemin: { type: 'string', description: 'le chemin de la pièce jointe, tel que donné' }, nom: { type: 'string' } }, required: ['deal_id', 'chemin'] },
  },
  {
    name: 'bloquer_rdv',
    description: "Pose un rendez-vous dans l'agenda d'équipe (« bloque une visite mardi 14 h à Cannes »). Calcule la date exacte depuis la date du jour donnée dans le message ; une heure par défaut.",
    input_schema: { type: 'object', properties: { titre: { type: 'string' }, debut: { type: 'string', description: 'ISO, ex. 2026-09-29T14:00:00+02:00' }, fin: { type: 'string' }, lieu: { type: 'string' }, description: { type: 'string' } }, required: ['titre', 'debut'] },
  },
  {
    name: 'agenda',
    description: "Les rendez-vous de l'agenda d'équipe un jour donné (AAAA-MM-JJ).",
    input_schema: { type: 'object', properties: { jour: { type: 'string' } }, required: ['jour'] },
  },
  {
    name: 'rediger_loi',
    description: "Rédige une lettre d'intention d'achat (LOI) sur le modèle de la maison, en Word (docx, modifiable ; PDF si on le demande), et la pose dans le chat pour relecture. Si un dossier est donné, l'adresse, la surface, le locataire, le bail et le prix en viennent ; le reste est demandé. Ne rédige que quand tous les champs requis sont là : sinon l'outil rend la liste de ce qui manque, et tu la demandes en une ligne.",
    input_schema: {
      type: 'object',
      properties: {
        deal_id: { type: 'string' },
        acquereur_nom: { type: 'string', description: 'la personne qui signe, ex. Olivier LUCCIONI' }, acquereur_societe: { type: 'string' }, acquereur_adresse: { type: 'string' },
        vendeur_societe: { type: 'string' }, vendeur_representant: { type: 'string', description: 'ex. Monsieur Jérôme ABECASSIS' }, vendeur_adresse: { type: 'string' },
        adresse_bien: { type: 'string' }, surface_m2: { type: 'number' }, locataire: { type: 'string', description: "l'enseigne ou la société locataire" }, fin_bail: { type: 'string', description: 'AAAA-MM-JJ' },
        prix: { type: 'number', description: 'prix FAI TTC proposé, en euros' }, apport: { type: 'number' }, duree_ans: { type: 'number' }, taux: { type: 'number', description: 'en %, 4 par défaut' },
        fin_exclusivite: { type: 'string', description: 'AAAA-MM-JJ, 23 jours par défaut' }, limite_documents: { type: 'string', description: 'AAAA-MM-JJ, 9 jours par défaut' }, validite: { type: 'string', description: 'AAAA-MM-JJ, 7 jours par défaut' },
        lieu: { type: 'string', description: 'la ville de signature, Nice par défaut' },
        format: { type: 'string', enum: ['docx', 'pdf'], description: 'docx par défaut' },
      },
    },
  },
  {
    name: 'lancer_design',
    description: "Confie un changement de la plateforme Klocka elle-même à Claude Code (« redesign la page K-Zoning », « ajoute un filtre par ville sur Mes projets ») : il travaille sur une copie du dépôt, vérifie lint et build, et rend une branche à relire. Tâche de fond de cinq à trente minutes ; AK donnera la branche dans le chat. Reformule la demande en une consigne précise : quelle page, quoi changer, ce qu'il ne faut pas toucher.",
    input_schema: { type: 'object', properties: { demande: { type: 'string' } }, required: ['demande'] },
  },
  {
    name: 'version',
    description: "Quelle version de Klocka tourne (le commit git), et si la consigne contient bien un mot donné : pour vérifier qu'un changement est déployé (« t'es à jour ? »).",
    input_schema: { type: 'object', properties: { mot: { type: 'string' } } },
  },
  {
    name: 'retenir',
    description: "Retient un fait durable ou une préférence pour les prochaines fois (« le Devred c'est Firminy », « Max veut pas de Monday sans demander », « le client Dupont a 300 k »). Pas les demandes du moment, pas ce qui est déjà dans la plateforme.",
    input_schema: { type: 'object', properties: { sujet: { type: 'string', description: 'de qui ou de quoi : une personne, un dossier, un client, l\'équipe' }, fait: { type: 'string' } }, required: ['fait'] },
  },
  {
    name: 'oublier',
    description: "Efface un souvenir devenu faux. Prend l'identifiant vu dans souvenirs.",
    input_schema: { type: 'object', properties: { id: { type: 'string' } }, required: ['id'] },
  },
  {
    name: 'souvenirs',
    description: "La liste de ce qu'AK a retenu, avec les identifiants, pour en effacer un.",
    input_schema: { type: 'object', properties: {} },
  },
  {
    name: 'verifier_renta',
    description: "Le couperet : ça tourne, c'est limite, ou c'est dead, avec les seuils de l'équipe (rendement acte en main, bail restant, taux d'effort si le CA est connu). Chercher le dossier ou le projet d'abord.",
    input_schema: { type: 'object', properties: { deal_id: { type: 'string' }, projet_id: { type: 'string' } } },
  },
  {
    name: 'chercher_biens',
    description: "Cherche parmi les dossiers et projets de la plateforme ceux qui répondent à des critères : ville, prix max ou min, rendement FAI minimum en %, bail restant minimum en années, surface minimum, activité. Pour « t'as des murs à Lyon sous 500 k avec un bail de plus de 6 ans ? ».",
    input_schema: { type: 'object', properties: { ville: { type: 'string' }, prix_max: { type: 'number' }, prix_min: { type: 'number' }, rendement_min: { type: 'number' }, bail_min_ans: { type: 'number' }, surface_min: { type: 'number' }, activite: { type: 'string' } } },
  },
  {
    name: 'lire_piece',
    description: "Lit le texte d'une pièce jointe (PDF ou texte) sans rien créer, pour la résumer ou répondre dessus (« c'est quoi ce truc ? »).",
    input_schema: { type: 'object', properties: { chemin: { type: 'string' } }, required: ['chemin'] },
  },
  {
    name: 'chercher_cible',
    description: "Cherche une cible ALX (un commerce repéré en prospection) par son enseigne, son adresse ou sa ville. À faire avant brouillon_proprietaire.",
    input_schema: { type: 'object', properties: { recherche: { type: 'string' } }, required: ['recherche'] },
  },
  {
    name: 'brouillon_proprietaire',
    description: "Rédige le brouillon du premier mail ou courrier au propriétaire d'une cible ALX, et le rend pour le coller dans le chat. Rien n'est envoyé.",
    input_schema: { type: 'object', properties: { cible_id: { type: 'string' }, canal: { type: 'string', enum: ['mail', 'courrier'] } }, required: ['cible_id'] },
  },
  {
    name: 'lancer_alx',
    description: "Lance la prospection ALX d'une ville (« prospecte Antibes, emplacements n°2 ») : rues, commerces, propriétaires, en tâche de fond ; AK préviendra quand c'est fini. classes : les emplacements voulus, 1, 1.5 (1 bis) ou 2 ; vide : tous.",
    input_schema: { type: 'object', properties: { ville: { type: 'string' }, code_postal: { type: 'string' }, classes: { type: 'array', items: { type: 'number' } }, budget: { type: 'number', description: 'budget du client en euros, pour mémoire' } }, required: ['ville'] },
  },
  {
    name: 'ajouter_document',
    description: "Dépose une pièce jointe (bail, PV d'AG, RCP, diagnostics, quittances…) sur un dossier existant : lecture, classement, synthèse des points à vérifier. Chercher le dossier d'abord.",
    input_schema: { type: 'object', properties: { deal_id: { type: 'string' }, chemin: { type: 'string', description: 'le chemin de la pièce jointe, tel que donné' } }, required: ['deal_id', 'chemin'] },
  },
  {
    name: 'creer_client_monday',
    description: "Crée (ou complète) un client dans le tableau Clients de Monday : un investisseur qui cherche des murs. Nom ou mail obligatoire ; le reste si on te le donne. Rien d'autre que ce qu'on te dit.",
    input_schema: {
      type: 'object',
      properties: {
        nom: { type: 'string' }, email: { type: 'string' }, telephone: { type: 'string' },
        budget: { type: 'number', description: 'budget total en euros' }, apport: { type: 'number', description: 'apport en euros' },
        localisation: { type: 'string', description: 'où il cherche : ville, département, région' },
        recherche: { type: 'string', description: 'ce qu\'il cherche, en une phrase' },
        statut: { type: 'string', description: 'Recherche, Intérêt, Mandat signé, Stand-by… seulement si dit' },
      },
    },
  },
  {
    name: 'renommer_dossier',
    description: "Change le nom d'un dossier de préanalyse. Chercher le dossier d'abord.",
    input_schema: { type: 'object', properties: { deal_id: { type: 'string' }, nom: { type: 'string' } }, required: ['deal_id', 'nom'] },
  },
  {
    name: 'supprimer_dossier',
    description: "Retire un dossier de préanalyse de la plateforme (il passe « abandonné » et disparaît des listes ; un admin peut le retrouver). Chercher le dossier d'abord ; s'il y a un doute sur lequel, demander.",
    input_schema: { type: 'object', properties: { deal_id: { type: 'string' }, motif: { type: 'string' } }, required: ['deal_id'] },
  },
  {
    name: 'creer_projet_depuis_dossier',
    description: "Crée la fiche projet d'un dossier de préanalyse déjà là (« crée le projet pour Devred de Firminy »). Chercher le dossier d'abord avec chercher_dossier ; s'il n'existe pas, le dire, ne rien créer de vide.",
    input_schema: { type: 'object', properties: { deal_id: { type: 'string' }, lot_index: { type: 'number', description: 'index du lot, 0 sauf dossier multi-lots' } }, required: ['deal_id'] },
  },
  {
    name: 'outils_kdata',
    description: "La liste des outils K-Data et les réglages que chacun demande. À appeler avant lancer_kdata pour demander à la personne lesquels elle veut et avec quels réglages.",
    input_schema: { type: 'object', properties: {} },
  },
  {
    name: 'lancer_kdata',
    description: "Lance des analyses K-Data sur une adresse et les range dans un dossier. L'adresse est celle du projet ou du dossier (la prendre d'etat_projet ou etat_dossier). Les analyses tournent en tâche de fond : AK préviendra dans le chat quand c'est fini, il ne faut pas attendre ni inventer un résultat.",
    input_schema: {
      type: 'object',
      properties: {
        adresse: { type: 'string', description: 'numéro, rue, ville' },
        outils: { type: 'array', items: { type: 'string', enum: CLES_OUTILS }, description: 'les outils choisis par la personne' },
        reglages: { type: 'object', description: 'par outil, les réponses aux questions : { kzoning: { rayon_m: 500 }, kexpertise: { activite: "boulangerie" } }' },
        deal_id: { type: 'string', description: 'le dossier où ranger les analyses, si connu' },
      },
      required: ['adresse', 'outils'],
    },
  },
  {
    name: 'generer_prez_bancaire',
    description: "Génère la préz bancaire (projet de financement, PPTX) d'un projet de la plateforme et la dépose sur le Drive partagé en Google Slides. Nécessite l'identifiant rendu par chercher_projet. Tâche de fond : AK donnera le lien dans le chat quand c'est prêt.",
    input_schema: { type: 'object', properties: { projet_id: { type: 'string' } }, required: ['projet_id'] },
  },
  {
    name: 'taches_en_cours',
    description: "Ce qu'AK est en train de faire en tâche de fond (analyses K-Data, préz), pour répondre « je suis en train de faire autre chose » ou dire où ça en est.",
    input_schema: { type: 'object', properties: {} },
  },
];

export const OUTILS = [...OUTILS_ASSISTANT.filter((o) => !EXCLUS.has(o.name)), ...OUTILS_AK];

const lien = (chemin) => `${APP_URL}${chemin}`;

/**
 * Le nom d'un dossier, comme l'équipe le dit : « Devred - Firminy », l'enseigne
 * (ou l'activité, ou le nom donné) puis la ville. Pure.
 */
export function titreCourt({ nom = null, enseigne = null, activite = null, ville = null } = {}) {
  const quoi = String(enseigne || nom || activite || 'Local').trim().replace(/\s+/g, ' ');
  const ou = String(ville || '').trim().replace(/\s+/g, ' ');
  if (!ou || new RegExp(`\\b${ou.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`, 'i').test(quoi)) return quoi;
  return `${quoi} - ${ou}`;
}

/** Un dossier tout juste né de la pré-analyse reçoit son nom court. */
function nommer(dealId) {
  const deal = Records.findBy('Deal', 'deal_id', dealId);
  const l = deal?.lots?.[0]?.lot || {};
  const val = (x) => (x && typeof x === 'object' && 'valeur' in x ? x.valeur : x);
  const a = val(l.adresse) || {};
  const ville = (typeof a === 'object' && a.ville) || deal?.lots?.[0]?.enrichissement?.commune?.nom || null;
  const nom = titreCourt({ enseigne: val(l.locataire_nom), activite: val(l.locataire_activite), ville });
  if (deal && nom && nom !== 'Local') Records.update('Deal', deal.id, { nom });
  return nom;
}

/** Ce que chaque outil K-Data demande, lisible par le modèle et par la personne. Pure. */
export function decrireOutilsKdata() {
  return CLES_OUTILS.map((cle) => ({
    outil: cle,
    nom: NOMS_KDATA[cle] || cle,
    questions: (QUESTIONS[cle] || []).filter((q) => !q.groupe).map((q) => ({
      cle: q.cle, libelle: q.libelle, type: q.type, defaut: q.defaut ?? null,
      options: q.options ? q.options.map((o) => o.valeur ?? o.value ?? o).slice(0, 12) : undefined,
    })),
    defauts: valeursParDefaut(cle),
  }));
}

/**
 * Exécute un outil d'AK, ou passe la main à l'assistant. `fond` reçoit les
 * tâches qui continuent après la réponse : c'est la veille qui les suit.
 */
export async function executerOutil({ name, input }, user, { fond = () => {}, message = null } = {}) {
  if (name === 'analyser_fiche' && (input.texte_du_message || input.texte) && !input.chemin) {
    const texte = String(input.texte || message?.texte || '').trim();
    if (texte.length < 80) return { ok: false, error: 'Le message ne contient pas de fiche à lire.' };
    const { analyserFiche } = await import('../deal/index.js');
    const d = await analyserFiche({ texte }, { user });
    const lot = d.lots?.[0];
    return { ok: true, cree: true, deal_id: d.deal_id, titre: nommer(d.deal_id) || lot?.synthese?.titre || 'fiche collée', verdict: lot?.synthese?.verdict || null, lien: lien(`/Analyse?deal_id=${d.deal_id}`) };
  }
  if (name === 'creer_dossier') {
    const { creerCoquille } = await import('../deal/index.js');
    const dossier = creerCoquille({
      nom: titreCourt({ nom: input.nom, ville: input.ville }),
      responsables: user?.full_name ? [user.full_name] : [],
      user,
      contact_agent_email: input.agent_email ? String(input.agent_email).trim().toLowerCase() : null,
      apercu: {
        ville: input.ville || null, rue: input.rue || null, prix: input.prix || null,
        surface: input.surface || null, loyer: input.loyer || null, activite: input.activite || null,
        agent_nom: input.agent_nom || null, agent_telephone: input.agent_telephone || null, agence: input.agence || null,
      },
    });
    return { ok: true, cree: true, deal_id: dossier.deal_id, nom: dossier.nom, lien: lien(`/Analyse?deal_id=${dossier.deal_id}`) };
  }
  if (name === 'analyser_fiche' || name === 'ajouter_document') {
    const chemin = String(input.chemin || '');
    if (!chemin.startsWith(CHEMIN_UPLOADS) || !fs.existsSync(chemin)) return { ok: false, error: 'Pièce jointe introuvable : elle doit venir du message.' };
    const fichier = { buffer: fs.readFileSync(chemin), filename: path.basename(chemin).replace(/^ak-\d+-/, ''), mimetype: /\.pdf$/i.test(chemin) ? 'application/pdf' : undefined, url: `/uploads/${path.basename(chemin)}` };
    if (name === 'analyser_fiche') {
      const { analyserFiche } = await import('../deal/index.js');
      const d = await analyserFiche({ buffer: fichier.buffer, filename: fichier.filename, mimetype: fichier.mimetype, sourceUrl: fichier.url }, { user });
      const lot = d.lots?.[0];
      return { ok: true, cree: true, deal_id: d.deal_id, titre: nommer(d.deal_id) || lot?.synthese?.titre || fichier.filename, verdict: lot?.synthese?.verdict || null, lien: lien(`/Analyse?deal_id=${d.deal_id}`) };
    }
    const { deposerDocument } = await import('../deal/deposer-document.js');
    const r = await deposerDocument(input.deal_id, fichier, { user });
    if (!r.ok) return r;
    return { ok: true, type: r.type || null, statut: r.deal?.statut || null, lien: lien(`/Analyse?deal_id=${input.deal_id}`) };
  }
  if (name === 'boite_recue') { const mails = boiteRecue(undefined, { limite: input.limite || 10, non_rattaches: !input.tous }); return { mails, nombre: mails.length }; }
  if (name === 'lire_mail') return lireMail(input.id);
  if (name === 'mails_du_dossier') return { mails: mailsDuDossier(input.deal_id) };
  if (name === 'preanalyser_mail') {
    const r = await preanalyserMailRecu(input.id, user);
    if (r.ok) r.titre = nommer(r.deal_id) || r.titre;
    return r;
  }
  if (name === 'chercher_drive') return chercherSurLeDrive(input);
  if (name === 'ranger_drive') {
    const chemin = String(input.chemin || '');
    if (!chemin.startsWith(CHEMIN_UPLOADS) || !fs.existsSync(chemin)) return { ok: false, error: 'Pièce jointe introuvable : elle doit venir du message.' };
    return rangerSurLeDrive({ deal_id: input.deal_id, chemin, nom: input.nom || null });
  }
  if (name === 'bloquer_rdv') return bloquerRendezVous(input);
  if (name === 'agenda') return { jour: input.jour, rendez_vous: await agendaDuJour(input.jour) };
  if (name === 'rediger_loi') {
    const { manquants, champsDepuisDeal } = await import('./loi.js');
    const deal = input.deal_id ? Records.findBy('Deal', 'deal_id', input.deal_id) : null;
    if (input.deal_id && !deal) return { ok: false, error: 'Dossier introuvable.' };
    const champs = { ...(deal ? champsDepuisDeal(deal) : {}), ...Object.fromEntries(Object.entries(input).filter(([k, v]) => !['deal_id', 'format'].includes(k) && v !== undefined && v !== null && v !== '')) };
    const m = manquants(champs);
    if (m.length) return { ok: false, manque: m.map((x) => x.question), champs_connus: champs };
    fond({ genre: 'loi', libelle: `la LOI pour ${champs.adresse_bien}`, champs, format: input.format === 'pdf' ? 'pdf' : 'docx', deal_id: input.deal_id || null });
    return { ok: true, note: 'La lettre se rédige ; AK la pose dans le chat dans une minute, à relire avant envoi.' };
  }
  if (name === 'lancer_design') {
    const { designActif } = await import('./design.js');
    if (!designActif()) return { ok: false, error: "Les projets Claude Code ne sont pas activés sur ce serveur (AK_DESIGN)." };
    fond({ genre: 'design', libelle: `le projet « ${String(input.demande).slice(0, 80)} »`, demande: String(input.demande) });
    return { ok: true, note: 'Claude Code s\'y met sur une copie du dépôt ; AK donnera la branche dans le chat quand c\'est prêt.' };
  }
  if (name === 'version') {
    const { versionQuiTourne } = await import('./veille.js');
    return { version: versionQuiTourne(), consigne_contient: input.mot ? CONSIGNE.includes(input.mot) : null, modele: MODELE || 'celui de la plateforme' };
  }
  if (name === 'retenir') return retenir({ sujet: input.sujet, fait: input.fait, par: message?.auteur?.affiche || null });
  if (name === 'oublier') return oublier(input.id);
  if (name === 'souvenirs') return { souvenirs: souvenirs().map((s) => ({ id: s.id, sujet: s.sujet, fait: s.fait })) };
  if (name === 'verifier_renta') return verifierRenta(input);
  if (name === 'chercher_biens') { const biens = chercherBiens(input); return { biens, nombre: biens.length }; }
  if (name === 'lire_piece') {
    const chemin = String(input.chemin || '');
    if (!chemin.startsWith(CHEMIN_UPLOADS) || !fs.existsSync(chemin)) return { ok: false, error: 'Pièce jointe introuvable : elle doit venir du message.' };
    return lirePiece(chemin);
  }
  if (name === 'chercher_cible') { const cibles = chercherCibles(input.recherche); return { cibles, nombre: cibles.length }; }
  if (name === 'brouillon_proprietaire') {
    const { redigerBrouillon } = await import('../alx/enrichir.js');
    const r = await redigerBrouillon(input.cible_id, { canal: input.canal || null, user });
    return { ok: true, brouillon: r.brouillon, enseigne: r.cible?.enseigne || null, proprietaire: r.cible?.foncier?.choix?.nom || null };
  }
  if (name === 'lancer_alx') {
    const r = await lancerAlx({ ville: input.ville, code_postal: input.code_postal || null, classes: input.classes || null, user });
    if (!r.ok) return r;
    fond({ genre: 'alx', libelle: `la prospection ALX de ${r.nom}${input.classes?.length ? ` (emplacements ${input.classes.map((c) => (c === 1.5 ? '1 bis' : c)).join(', ')})` : ''}${input.budget ? `, budget ${Math.round(input.budget / 1000)} k` : ''}`, ville_id: r.ville_id });
    return { ok: true, note: 'La prospection tourne ; AK préviendra dans le chat quand elle sera finie.', lien: lien(`/alx/villes/${r.ville_id}`) };
  }
  if (name === 'creer_client_monday') {
    const { creerClientMonday } = await import('../deal/monday-sync.js');
    const r = await creerClientMonday(input);
    if (r.ignore) return { ok: false, error: r.raison };
    if (r.erreur) return { ok: false, error: r.erreur };
    return { ok: true, cree: r.cree, monday_id: r.id, statut_ignore: r.statut_ignore || null };
  }
  if (name === 'renommer_dossier' || name === 'supprimer_dossier') {
    const deal = Records.findBy('Deal', 'deal_id', input.deal_id);
    if (!deal) return { ok: false, error: 'Dossier introuvable.' };
    if (name === 'renommer_dossier') {
      const nom = String(input.nom || '').trim();
      if (!nom) return { ok: false, error: 'Il faut un nom.' };
      Records.update('Deal', deal.id, { nom });
      return { ok: true, deal_id: deal.deal_id, nom, lien: lien(`/Analyse?deal_id=${deal.deal_id}`) };
    }
    const { changerStatut } = await import('../deal/lifecycle.js');
    changerStatut(deal, 'abandonne', { user, note: `Retiré depuis le chat${input.motif ? ` : ${input.motif}` : ''}` });
    return { ok: true, deal_id: deal.deal_id, retire: true };
  }
  if (name === 'creer_projet_depuis_dossier') {
    const { creerProjetDepuisDeal, completerAvantProjet } = await import('../deal/projet.js');
    try { await completerAvantProjet(input.deal_id, Number(input.lot_index) || 0); } catch { /* la fiche naît de ce qu'on a */ }
    const r = creerProjetDepuisDeal(input.deal_id, Number(input.lot_index) || 0, user);
    if (!r.ok) return { ok: false, error: r.error, lien: r.project_id ? lien(`/projet/${r.project_id}`) : null };
    return { ok: true, projet_id: r.project.id, titre: r.project.titre, lien: lien(`/projet/${r.project.id}`), champs_remplis: r.champs_remplis };
  }
  if (name === 'outils_kdata') return { outils: decrireOutilsKdata() };
  if (name === 'lancer_kdata') {
    const r = lancerAnalyses({ adresse: input.adresse, outils: input.outils, reglages: input.reglages || {} }, user);
    if (!r.ok) return r;
    if (input.deal_id) ranger(r.ids, input.deal_id);
    fond({ genre: 'kdata', libelle: `K-Data sur ${input.adresse} : ${input.outils.map((o) => NOMS_KDATA[o] || o).join(', ')}`, ids: r.ids, deal_id: input.deal_id || null });
    return { ok: true, lancees: input.outils.length, lot: r.lot, note: 'Les analyses tournent ; AK préviendra dans le chat quand elles seront finies.' };
  }
  if (name === 'generer_prez_bancaire') {
    const projet = Records.get('Project', input.projet_id);
    if (!projet) return { ok: false, error: 'Projet introuvable.' };
    fond({ genre: 'prez', libelle: `préz bancaire de ${projet.titre || projet.adresse_complete || projet.id}`, projet_id: projet.id });
    return { ok: true, note: 'La préz part en génération ; AK donnera le lien dans le chat quand elle sera sur le Drive.' };
  }
  if (name === 'taches_en_cours') {
    const { tachesEnCours } = await import('./veille.js');
    return { taches: tachesEnCours() };
  }
  return executerOutilAssistant({ name, input }, user);
}

/**
 * Génère la préz d'un projet et la dépose sur le Drive en Slides. Rend le lien
 * Slides, ou celui du PPTX sur la plateforme si le Drive refuse.
 */
export async function produirePrez(projetId) {
  const projet = Records.get('Project', projetId);
  if (!projet) throw new Error('Projet introuvable.');
  const reglages = Records.filter('AppSettings', { setting_key: 'global' })[0];
  const photos = { conditions: reglages?.presentation_conditions_photo || null };
  const { genererPresentationProjet } = await import('../presentation-projet.js');
  const buffer = await genererPresentationProjet(projet, photos);
  const nomFichier = `presentation-projet-${String(projet.id).replace(/[^a-zA-Z0-9_-]/g, '_')}.pptx`;
  const dossierPres = path.join(CHEMIN_UPLOADS, 'presentations');
  fs.mkdirSync(dossierPres, { recursive: true });
  fs.writeFileSync(path.join(dossierPres, nomFichier), buffer);
  const pptx = lien(`/uploads/presentations/${nomFichier}`);
  const chemin = path.join(dossierPres, nomFichier);
  try {
    const { uploaderEnSlides } = await import('../google-drive.js');
    const r = await uploaderEnSlides(COMPTE, { nom: `Projet de financement — ${projet.titre || projet.adresse_complete || projet.id}`, buffer });
    return { slides: r.slides_url, pptx, chemin, nom_fichier: nomFichier };
  } catch (e) {
    return { slides: null, pptx, chemin, nom_fichier: nomFichier, erreur_drive: e?.message || String(e) };
  }
}

const TYPES_IMAGE = new Set(['image/png', 'image/jpeg', 'image/gif', 'image/webp']);
const IMAGE_MAX_OCTETS = 5 * 1024 * 1024;

/** Les pièces jointes qui sont des images, en blocs pour le modèle. Pure sur des fichiers déjà lus. */
export function imagesDe(pieces, lire = (chemin) => fs.readFileSync(chemin)) {
  if (provider !== 'anthropic') return [];
  return (pieces || [])
    .filter((p) => p.chemin && TYPES_IMAGE.has(p.type) && (p.octets || 0) <= IMAGE_MAX_OCTETS)
    .map((p) => ({ type: 'image', source: { type: 'base64', media_type: p.type, data: lire(p.chemin).toString('base64') } }));
}

/** Le résumé d'une tâche finie, tel qu'AK le postera. Pure. */
export function texteDeFin(tache) {
  if (tache.genre === 'kdata') {
    const lignes = (tache.analyses || []).map((a) => {
      const l = lienDe(a);
      return a.etat === 'terminee' ? `- ${a.nom_outil} : ${a.resume || 'prête'}${l ? ` ${lien(l)}` : ''}` : `- ${a.nom_outil} : raté (${a.erreur || 'sans détail'})`;
    });
    const ou = tache.deal_id ? ' rangé dans le dossier' : '';
    return `c'est bon, ${tache.libelle}${ou} :\n${lignes.join('\n')}`;
  }
  if (tache.genre === 'loi') {
    if (tache.etat === 'ratee') return `dsl, ${tache.libelle} a planté : ${tache.resultat?.erreur || 'sans détail'}`;
    return `voilà ${tache.libelle} en ${tache.resultat?.format === 'pdf' ? 'PDF' : 'Word'}, à relire et retoucher avant envoi${tache.resultat?.drive ? ` (aussi sur le Drive : ${tache.resultat.drive})` : ''}`;
  }
  if (tache.genre === 'design') {
    const r = tache.resultat || {};
    if (tache.etat === 'ratee') return `dsl, ${tache.libelle} a planté : ${r.erreur || 'sans détail'}`;
    if (!r.branche) return `${tache.libelle} : Claude Code n'a rien changé. ${String(r.resume || '').slice(0, 300)}`;
    const verifs = Object.entries(r.verifications || {}).map(([k, v]) => `${k} ${v === true ? 'ok' : 'KO'}`).join(', ');
    return `c'est bon, ${tache.libelle} est prêt sur la branche ${r.branche}${r.poussee ? ' (poussée)' : ' (pas poussée, à récupérer sur le serveur)'} : ${r.fichiers.length} fichier${r.fichiers.length > 1 ? 's' : ''}, ${verifs}. à relire avant de fusionner.\n${String(r.resume || '').slice(0, 600)}`;
  }
  if (tache.genre === 'alx') {
    const r = tache.resultat || {};
    if (tache.etat === 'ratee' || r.etat === 'erreur') return `dsl, ${tache.libelle} s'est arrêtée : ${r.erreur || 'sans détail'}`;
    const piles = Object.entries(r.par_pile || {}).map(([p, n]) => `${n} à ${p === 'ecartee' ? 'écarter' : p}`).join(', ');
    return `c'est bon, ${tache.libelle} est finie : ${r.rues || 0} rues, ${r.cibles || 0} cibles${piles ? ` (${piles})` : ''} ${lien(`/alx/villes/${tache.ville_id}`)}`;
  }
  if (tache.genre === 'prez') {
    if (tache.resultat?.slides) return `📁 c'est fait, ${tache.libelle} est sur le Drive : ${tache.resultat.slides}`;
    return `${tache.libelle} est prête ici : ${tache.resultat?.pptx}${tache.resultat?.erreur_drive ? ` (le Drive a refusé : ${tache.resultat.erreur_drive})` : ''}`;
  }
  return `${tache.libelle} : fini.`;
}

const CADRE = `

---

CE QUE TU SAIS FAIRE SUR LA PLATEFORME KLOCKA (${APP_URL})

Tu as des outils. Le modèle ne décide de rien sur le fond : il traduit une phrase en appel d'outil, et le code agit. « Dossier » désigne un dossier de préanalyse (les documents reçus d'un agent) ; « projet » une fiche projet de la plateforme, créée à partir d'un dossier.

RÈGLES :
1. Cherche toujours avant d'agir (chercher_dossier, chercher_projet) : il te faut l'identifiant. Plusieurs résultats : liste-les et demande lequel. Aucun : dis-le, n'invente rien. Une recherche, puis l'action : n'appelle pas verifier, etat_dossier ou etat_projet si on ne t'a rien demandé dessus, chaque appel coûte.
2bis. Une pièce jointe (PDF) avec « crée ce dossier », « fais la pré-analyse », « mets ça sur la plateforme » : analyser_fiche avec le chemin donné, jamais creer_dossier à vide. Une fiche COLLÉE dans le message (un mémorandum, une annonce, des lignes de description du bien) avec la même demande : analyser_fiche avec texte_du_message, jamais creer_dossier. Une pièce jointe pour un dossier déjà là (bail, PV, RCP…) : ajouter_document. Sans pièce jointe, dis que tu n'as rien reçu.
2. « Crée le projet pour X » : chercher_dossier puis creer_projet_depuis_dossier. Sans dossier, dis qu'il faut d'abord mettre le dossier sur la plateforme. « Crée un dossier X » : creer_dossier, et c'est tout ; Monday ou le CRM seulement si on te le demande.
3. « Fais l'analyse K-Data » : demande TOUJOURS d'abord quels outils (outils_kdata donne la liste et leurs réglages), en une ligne courte avec les noms. Ne lance rien tant que la personne n'a pas choisi. Puis lancer_kdata avec l'adresse du projet ou du dossier et le deal_id pour ranger dans le dossier.
4. Une tâche de fond (K-Data, préz) : dis que c'est parti, sans annoncer de résultat. Tu préviendras toi-même dans le chat quand ce sera fini.
5. Un mail (« prépare le mail de relance pour l'agent de Dieppe ») : chercher_dossier puis preparer_mail ; tu colles l'objet et le corps rendus dans le chat, tels quels, et c'est quelqu'un de l'équipe qui l'envoie. Tu n'envoies jamais rien. Le brouillon au propriétaire d'une cible ALX (chercher_cible puis brouillon_proprietaire) se colle pareil.
5bis. « Vérifie la renta », « ça tourne ? », « c'est dead ? » : verifier_renta, et tu rends le couperet en une ligne, cash : « ça tourne, 7,2 % AEM et 8 ans de bail » ou « c'est dead, 4,8 % AEM et le bail finit dans 14 mois ». Les seuils sont ceux de l'équipe, tu ne les discutes pas.
5ter. « Où en est X ? » : etat_dossier ou etat_projet, puis UNE ligne : statut, ce qui manque, dernier événement. « Compare X et Y » : les deux états, puis trois lignes maximum, un critère par ligne (prix et renta, bail, emplacement), et lequel tu prends. « C'est quoi ce truc ? » avec une pièce jointe : lire_piece puis trois lignes, sans créer de dossier. Une capture d'écran d'un mail ou d'une annonce avec « crée le dossier » : recopie ce que tu lis dans le paramètre texte d'analyser_fiche.
5sexies. « Crée une LOI », « fais la lettre d'intention pour X » : chercher_dossier si un bien de la plateforme est nommé, puis rediger_loi. Il te manque forcément l'acquéreur (nom, société, adresse), le vendeur (société, représentant, adresse), le prix et l'apport si on ne te les a pas donnés : demande TOUT ce qui manque en UNE ligne, puis rédige. Ne devine jamais un nom ou un prix.
5quinquies. Les mails : « y'a quoi dans la boîte ? » : boite_recue, une ligne par mail (qui, quoi, pièce ou pas). « Pré-analyse le mail de Marc » : boite_recue puis preanalyser_mail. « Qu'est-ce qu'il dit l'agent de X ? » : chercher_dossier puis mails_du_dossier, et tu résumes. Le Drive : chercher_drive pour retrouver un fichier, ranger_drive pour y mettre une pièce jointe du message. L'agenda : bloquer_rdv avec la date exacte en ISO (la date du jour t'est donnée), agenda pour lire un jour. Le simulateur : « et si on négocie à 120 k avec 30 % d'apport ? » : simuler_dossier avec prix_negocie, apport_pourcent, taux, duree, et tu rends renta, mensualité et cash-flow en une ligne avec les hypothèses.
5quater. Une question sur une rue ou un secteur (« ça se vend combien un fonds rue d'Antibes ? », « y'a de la vacance avenue X ? ») : lancer_kdata avec ktransactions ou kvacance sur cette adresse, sans dossier, et tu préviendras quand le chiffre est là.
6. N'invente jamais un chiffre sur un bien : ce que tu n'as pas reçu d'un outil, tu ne l'as pas.
7. Une action faite : UNE ligne, comme un collègue qui répond sur son téléphone. « C bon le dossier est créé et tout est dans monday bg ». Pas d'identifiant, pas de numéro d'item Monday, pas de date « par défaut », pas de rappel de ce que tu n'as pas fait, pas de « dis-moi si tu veux que… ». Le lien seulement si la personne en a besoin pour ouvrir un truc. Les réserves, les manques, les détails : uniquement si on te les demande.
8. Si quelqu'un d'autre est mentionné dans la demande (« @Nora tu as fini ? »), tu peux le mentionner en écrivant son identifiant entre chevrons tel qu'il t'est donné : <users/123>. Ne mentionne pas la personne qui te parle : c'est déjà fait devant ta réponse.
11. Tu as un caractère. Quand on t'en demande beaucoup d'un coup (trois choses dans un message, un pavé à lire, une préz et deux analyses), tu peux le dire en une demi-phrase (« bon, y'a du taf là »), puis tu le fais quand même. Jamais de refus sec sauf le jour où t'as la flemme, et jamais plus d'une pique par réponse.
10. Tout le reste : une capture d'écran à commenter (design, ergonomie, une page de la plateforme, un site), une question de droit des baux, de financement, de code, ou n'importe quoi d'autre : réponds directement, sans outil, avec ton avis franc et argumenté, comme un collègue qu'on consulte. Sur une image, dis ce que tu vois, ce qui marche, ce qui cloche, et ce que tu changerais en premier.
9. Tu parles sur Google Chat : texte brut, pas de markdown, pas de titres, pas d'astérisques. Une à deux phrases, jamais de paragraphes, jamais de liste sauf quand on te demande une liste. Tu écris comme l'équipe écrit (voir le document au-dessus) : « c bon », « dcp », « bg », minuscules, pas de ponctuation soignée. Tu n'es pas un service client, tu es un collègue.

CE QU'IL NE FAUT PAS ÉCRIRE (trop corporate) :
« Dossier Ben créé : /Analyse?deal_id=18bd… Comme l'autre : posé dans Monday (item 3236289125) + promesse de docs au 24/09/2026 par défaut. Pas d'agent ni de mail, dcp la veille ne rattachera rien automatiquement. Tu me files l'adresse/agent quand tu l'as et je complète. »
CE QU'IL FAUT ÉCRIRE À LA PLACE :
« c bon le dossier Ben est créé et tout est dans monday bg »`;

/**
 * La consigne complète : le document de Jules, le cadre technique, puis ce
 * que l'équipe lui a appris et ce qu'il a retenu. Les deux derniers blocs
 * changent rarement : ils restent en cache avec le reste.
 */
export const consigne = () => CONSIGNE + CADRE + leconsPourConsigne() + souvenirsPourConsigne();

function fil(espace) {
  return Conversations.list(AGENT).find((c) => c.metadata?.espace === espace) || Conversations.create({ agent_name: AGENT, metadata: { espace } });
}

const sansAccent = (x) => String(x || '').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-z\s-]/g, ' ').replace(/\s+/g, ' ').trim();

/**
 * Le compte Klocka de la personne qui parle : ce qu'AK crée est signé d'elle,
 * pas du premier administrateur venu. Google ne donne que le nom affiché
 * (« Jules Barthomeuf ») ; on le rapproche des comptes de l'équipe par le
 * nom complet, puis par « prénom.initiale » dans l'adresse (jules.b@), puis
 * par le prénom seul. Pure sur `utilisateurs` : testée sans réseau.
 */
export function utilisateurPour(auteur, utilisateurs = Records.filter('User', { role: 'admin' })) {
  const affiche = sansAccent(auteur?.affiche);
  const equipe = utilisateurs.filter((u) => /@klocka\.immo$/i.test(u.email || ''));
  const candidats = [...equipe, ...utilisateurs.filter((u) => !equipe.includes(u))];
  if (!affiche) return null;
  const mots = affiche.split(' ');
  const [prenom, nom] = [mots[0], mots[mots.length - 1]];
  const memeNom = (u) => { const m = sansAccent(u.full_name).split(' '); return m.length >= 2 && ((m[0] === prenom && m[m.length - 1] === nom) || (m[0] === nom && m[m.length - 1] === prenom)); };
  const local = (u) => sansAccent(String(u.email || '').split('@')[0].replace(/\./g, ' '));
  return candidats.find(memeNom)
    || (nom && candidats.find((u) => local(u) === `${prenom} ${nom[0]}`))
    || candidats.find((u) => local(u).split(' ')[0] === prenom && equipe.includes(u))
    || null;
}

/** À défaut : le compte AK_COMPTE, puis un administrateur. */
export function utilisateurAk() {
  return Records.filter('User', { email: COMPTE })[0] || Records.filter('User', { role: 'admin' })[0] || { email: COMPTE, role: 'admin', full_name: 'AK' };
}

/**
 * Répond à un message du chat. Le fil de l'espace fait la mémoire ; les
 * tâches de fond sont rendues à part pour que la veille les suive.
 * @param {{texte:string, auteur:{nom,affiche}, espace:string, mentions:Array}} message
 */
export async function repondre(message) {
  const user = utilisateurPour(message.auteur) || utilisateurAk();
  const conversation = fil(message.espace);
  const prenom = (message.auteur.affiche || 'Quelqu\'un').split(' ')[0];
  const autres = (message.mentions || []).filter((m) => m.affiche).map((m) => `${m.affiche} = ${m.nom}`);
  const pieces = (message.pieces || []).map((p) => (p.chemin ? `${p.nom} (${p.type || 'type inconnu'}, chemin : ${p.chemin})` : `${p.nom} (impossible à télécharger : ${p.erreur})`));
  const aujourdhui = new Date().toLocaleDateString('fr-FR', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric', timeZone: 'Europe/Paris' });
  const entree = `${prenom} (${message.auteur.nom || '?'}, ${aujourdhui}) : ${message.texte}${autres.length ? `\n(mentionnés : ${autres.join(', ')})` : ''}${pieces.length ? `\n(pièces jointes : ${pieces.join(' ; ')})` : ''}${message.insiste ? `\n(tu avais râlé devant ce pavé, ${prenom} insiste : tu t'y mets, ta réponse commence déjà par « ${message.insiste} », enchaîne directement sur le résultat)` : ''}`;
  // Les images se montrent au modèle telles quelles (une capture d'écran à
  // commenter) ; le fil, lui, ne garde que le texte : une image de deux mégas
  // par message ferait grossir la base pour rien.
  const images = imagesDe(message.pieces);
  const courant = images.length ? [{ type: 'text', text: entree }, ...images] : entree;
  const historique = [...conversation.messages, { role: 'user', content: courant }].slice(-MAX_MESSAGES);

  const fond = [];
  const actions = [];
  const outils = [];
  const { text } = await runAgent({
    system: consigne(),
    messages: historique,
    tools: OUTILS,
    model: MODELE,
    cache: true,
    onTool: async (appel) => {
      outils.push(appel.name);
      const resultat = await executerOutil(appel, user, { fond: (t) => fond.push(t), message });
      const agissant = !['chercher_dossier', 'chercher_projet', 'etat_dossier', 'etat_projet', 'verifier', 'outils_kdata', 'taches_en_cours', 'historique_actions', 'plan_du_jour', 'registre_engagements', 'interroger_documents', 'marche_ville'].includes(appel.name);
      if (agissant) {
        if (resultat?.ok !== false) actions.push({ ...appel, resultat });
        try { journaliser({ outil: appel.name, args: appel.input, resultat, user: { ...user, email: `${user.email} (AK pour ${prenom})` } }); } catch (e) { console.warn('[ak] journalisation impossible :', e?.message || e); }
      }
      return resultat;
    },
  });
  const texte = String(text || '').trim() || 'rav, je n\'ai rien à répondre là-dessus.';
  Conversations.setMessages(conversation.id, [...conversation.messages, { role: 'user', content: entree }, { role: 'assistant', content: texte }].slice(-MAX_MESSAGES));
  return { texte, actions, outils, fond };
}

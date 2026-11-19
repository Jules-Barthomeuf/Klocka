// Veille des boîtes mail.
//
// Relève périodique de toutes les boîtes connectées, puis rattachement des
// réponses au dossier concerné. Aujourd'hui la relève est déclenchée à la main
// à la main et `deal_id` restait nul jusqu'à ce qu'un humain clique :
// l'assistant ne peut donc rien voir arriver. C'est ce que ce module corrige.
//
// Le rattachement est déterministe : la conversation d'un dossier d'abord,
// puis l'adresse de l'expéditeur comparée au contact agent des dossiers
// ouverts, jamais pour une fiche. Aucun modèle n'intervient : un mail mal
// rattaché coûterait plus cher que pas de rattachement du tout.

import { Records, CHEMIN_UPLOADS } from '../db.js';
import { comptesEquipe } from '../google-oauth.js';
import { releverBoite } from '../gmail-inbox.js';
import { gmailReadDemande } from '../google-oauth.js';
import { statutDe, ajouterSuivi } from './lifecycle.js';
import { synchroniserAgents } from './crm-sync.js';
import { ingererEnAttente } from './pieces-mails.js';

// Un dossier clos ne reçoit plus de réponse : inutile d'y rattacher un mail.
const OUVERTS = ['analyse', 'documents_demandes', 'documents_recus', 'depouille'];

const MINUTES = Math.max(1, Number(process.env.MAIL_VEILLE_MINUTES || 15));

// La veille tourne sans requête HTTP : elle résout elle-même le dossier des
// uploads, plutôt que de dépendre d'un paramètre transmis.

let minuterie = null;
let enCours = false;
let dernier = { le: null, nouveaux: 0, rattaches: 0, erreurs: [] };

// Seules les boîtes de l'équipe se relèvent. Jamais celle d'un client, quelle
// que soit l'autorisation qu'un jeton pourrait porter.
function comptesLisibles() {
  return comptesEquipe().filter((a) => a.peut_lire && a.email);
}

/**
 * Rattache les mails encore orphelins au dossier dont ils sont la réponse.
 *
 * D'abord la conversation : un mail qui s'inscrit dans le fil d'un dossier,
 * ou qui répond à un mail envoyé pour lui, y entre. Ensuite l'expéditeur :
 * le contact agent d'un dossier ouvert (à égalité, le plus récemment actif),
 * mais jamais pour un mail qui porte une fiche. Une fiche fait un nouveau
 * dossier, quel que soit l'agent : son dossier ouvert parle d'un autre bien.
 * @returns {number} nombre de mails rattachés
 */
export async function rattacherMailsOrphelins() {
  const orphelins = Records.list('MailRecu').filter((m) => !m.deal_id && !m.dossier_supprime_le && m.de_email);
  if (!orphelins.length) return 0;
  const { dossierDeLaConversation, porteUneFiche, contexteDesConversations } = await import('./fiches-auto.js');
  const contexte = contexteDesConversations();

  const ouverts = Records.list('Deal')
    .filter((d) => !d.archived && d.contact_agent_email && OUVERTS.includes(statutDe(d)))
    .sort((a, b) => String(b.updated_date || '').localeCompare(String(a.updated_date || '')));

  let rattaches = 0;
  for (const mail of orphelins) {
    const parLaConversation = dossierDeLaConversation(mail, contexte);
    let deal = parLaConversation ? Records.findBy('Deal', 'deal_id', parLaConversation) : null;
    if (!deal && !porteUneFiche(mail)) {
      const expediteur = String(mail.de_email).toLowerCase();
      deal = ouverts.find((d) => String(d.contact_agent_email).toLowerCase() === expediteur) || null;
    }
    if (!deal) continue;

    Records.update('MailRecu', mail.id, { deal_id: deal.deal_id });
    ajouterSuivi(
      Records.get('Deal', deal.id),
      {
        type: 'mail_recu',
        detail: [
          `Réponse de ${mail.de_email}`,
          mail.objet ? `« ${mail.objet} »` : null,
          (mail.pieces_jointes || []).length
            ? `${mail.pieces_jointes.length} pièce(s) jointe(s)`
            : null,
        ]
          .filter(Boolean)
          .join(' · '),
      },
      null
    );
    rattaches += 1;
    // Dans l'application : la réponse d'un agent arrive sur son dossier, la personne responsable le sait (19 oct. 2026, Jules).
    // Haka ambiant la traite (22 oct. 2026) : sa question oui / non suffit, pas de seconde notification.
    try {
      const { ambiantPour, FILE } = await import('../haka/drapeaux.js');
      if (FILE && (ambiantPour('reponse') || ambiantPour('documents'))) continue;
      const { notifier } = await import('../notifications.js');
      const pj = (mail.pieces_jointes || []).length;
      notifier({
        pour: deal.responsable_email || null,
        titre: `Réponse sur ${deal.nom || 'un dossier'}`,
        texte: [`De ${String(mail.de || mail.de_email).replace(/<[^>]*>/g, '').trim()}.`, mail.objet ? `« ${String(mail.objet).slice(0, 100)} »` : null, pj ? `${pj} pièce(s) jointe(s).` : null].filter(Boolean).join(' '),
        lien: `/Dossiers?deal_id=${deal.deal_id}`, action: 'Ouvrir le dossier', genre: 'mail', cle: `mail-rattache:${mail.id}`,
      });
    } catch (e) {
      console.warn(`[veille] notification non posée : ${e?.message || e}`);
    }
  }
  return rattaches;
}

/**
 * Relève toutes les boîtes connectées, puis rattache ce qui peut l'être.
 * Une boîte en erreur n'empêche pas les autres.
 */
// Une relève demandée pendant qu'une autre tourne (un mail arrivé par notification Gmail, 17 nov. 2026) : elle repart
// juste après, sans quoi le mail attendrait le passage suivant.
let aRefaire = false;
export async function relever(uploadDir = null) {
  if (enCours) { aRefaire = true; return dernier; }
  const { mesurer } = await import('../llm-couts.js');
  // Tout ce que la veille déclenche — tri des mails, lecture des pièces
  // jointes, engagements — porte son nom dans le journal des coûts. Sans ce
  // contexte, la moitié de la dépense de fond s'y affichait « hors contexte »,
  // c'est-à-dire nulle part.
  const { resultat } = await mesurer({ operation: 'veille des boîtes' }, () => releverVraiment(uploadDir));
  return resultat;
}

async function releverVraiment(uploadDir = null) {
  enCours = true;
  const erreurs = [];
  const echecs = [];
  let nouveaux = 0;
  let ecartes = 0;
  try {
    for (const compte of comptesLisibles()) {
      try {
        const { mesurer } = await import('../llm-couts.js');
        const { resultat: r } = await mesurer({ operation: 'veille de la boîte', par: compte.email }, () => releverBoite(compte.email, { max: 25 }));
        nouveaux += r?.nouveaux || 0;
        ecartes += r?.ecartes || 0;
        // Une ligne quand une boîte apporte quelque chose (17 nov. 2026 : la veille ne disait rien, on ne savait pas si elle lisait).
        if (r?.nouveaux || r?.ecartes) console.log(`[veille] ${compte.email} : ${r.nouveaux || 0} mail(s) gardé(s), ${r.ecartes || 0} écarté(s)`);
      } catch (e) {
        // Une boîte qui ne se relève pas se dit au journal, une fois par passage (17 nov. 2026 : elle échouait en silence).
        console.warn(`[veille] ${compte.email} non relevée : ${String(e?.message || e).slice(0, 200)}`);
        erreurs.push(`${compte.email} : ${e?.message || e}`);
        echecs.push({
          operation: 'releve',
          compte: compte.email,
          quoi: `Boîte ${compte.email} non relevée`,
          cause: String(e?.message || e).slice(0, 240),
          le: new Date().toISOString(),
        });
      }
    }
    // Une fiche nouvelle devient un dossier AVANT le rattachement : sans ça,
    // la fiche d'un agent qui a déjà un dossier ouvert y entrait comme une pièce.
    const dossierUploads = uploadDir || CHEMIN_UPLOADS;
    let fiches = { crees: 0, rejoints: 0, lignes: [] };
    try {
      // Haka (17 oct. 2026) : chaque fiche entre en file (une tâche par mail, reprise au démarrage). Depuis le
      // 19 oct. 2026 (Jules : « au lieu de faire la préanalyse tout seul, une notification qu'on accepte ou pas »),
      // la tâche commence par demander : rien n'est pré-analysé sans un clic. Dès que la file existe (HAKA_FILE),
      // c'est ce chemin ; sans elle, plus de pré-analyse automatique : l'ancienne passe ne tourne plus.
      const { FICHES, FILE } = await import('../haka/drapeaux.js');
      if (FICHES || FILE) {
        const { surReleve } = await import('../haka/declencheurs.js');
        fiches = await surReleve({ uploadDir: dossierUploads });
      }
      erreurs.push(...(fiches.erreurs || []));
      echecs.push(...(fiches.echecs || []));
    } catch (e) {
      erreurs.push(`Préanalyse des nouvelles fiches : ${e?.message || e}`);
    }
    const rattaches = await rattacherMailsOrphelins();

    // Haka ambiant (22 oct. 2026) : chaque mail retenu, une fois rattaché, devient une question oui / non. Avant
    // l'ingestion : des pièces qui attendent le oui ne se rangent pas seules.
    let ambiant = null;
    try {
      const { AMBIANT, FILE, TRANSFERT } = await import('../haka/drapeaux.js');
      // Par transfert (23 oct. 2026), Haka ne lit plus les boîtes : c'est l'équipe qui lui transmet.
      if (AMBIANT && FILE && !TRANSFERT) {
        const { surReleveAmbiant } = await import('../haka/ambiant.js');
        ambiant = await surReleveAmbiant({ uploadDir: uploadDir || CHEMIN_UPLOADS });
        erreurs.push(...(ambiant.erreurs || []));
      }
    } catch (e) {
      erreurs.push(`L'Assistant Klocka ambiant : ${e?.message || e}`);
    }

    // Les pièces jointes des réponses entrent dans leur dossier et partent au
    // extraction : quand l'analyste ouvre le dossier, les données sont là.
    let pieces = { mails: 0, documents: 0 };
    const dossier = uploadDir || CHEMIN_UPLOADS;
    if (dossier) {
      pieces = await ingererEnAttente(dossier);
      erreurs.push(...(pieces.erreurs || []));
      echecs.push(...(pieces.echecs || []));
    }

    // Les promesses des réponses entrent au registre : « je vous envoie le PV
    // jeudi » devient une échéance datée, que la relance saura citer.
    let engagements = { crees: 0 };
    try {
      const { extraireEnAttente, solderParMail } = await import('./engagements.js');
      // Le mail promis est là : la promesse est tenue, avant même de lire le texte.
      solderParMail();
      engagements = await extraireEnAttente();
      erreurs.push(...(engagements.erreurs || []));
    } catch (e) {
      erreurs.push(`Registre des engagements : ${e?.message || e}`);
    }

    // Les agents entrent au CRM tout seuls : l'information est déjà sur les
    // dossiers, personne n'a à la ressaisir.
    const crm = synchroniserAgents();
    dernier = { le: new Date().toISOString(), nouveaux, ecartes, rattaches, preanalyses: fiches.crees, pieces, engagements, crm, ambiant, erreurs };

    // Ce que la veille a fait sans personne devant l'écran doit pouvoir se
    // relire : sinon un document apparaît dans un dossier sans qu'on sache d'où.
    const { consignerPasse } = await import('../rapport-auto.js');
    consignerPasse({
      nouveaux,
      ecartes,
      rattaches,
      preanalyses: fiches.crees || 0,
      documents: pieces.documents || 0,
      classes: pieces.classes || 0,
      fiches: pieces.fiches || 0,
      lignes: [...(fiches.lignes || []), ...(pieces.lignes || [])],
      engagements: engagements.crees || 0,
      erreurs,
      echecs,
    });
  } finally {
    enCours = false;
    if (aRefaire) { aRefaire = false; setTimeout(() => relever(uploadDir).catch(() => {}), 0); }
  }
  return dernier;
}

/** Dernier passage de la veille, pour l'afficher sans la déclencher. */
export const etatVeille = () => ({ ...dernier, active: !!minuterie, minutes: MINUTES, lecture: gmailReadDemande });

/**
 * Démarre la veille périodique. Sans portée de lecture Gmail accordée, elle ne
 * démarre pas : il n'y aurait rien à relever.
 * @returns {boolean} true si la veille tourne
 */
/**
 * Les mails de l'équipe écartés à tort sur une boîte commune (17 nov. 2026 : une règle apprise passait avant la boîte
 * commune ; un mail écarté ne repasse jamais) : leur décision est oubliée, la prochaine relève les relit avec la règle
 * corrigée. Seulement ceux des `jours` derniers jours, d'un expéditeur de l'équipe ou de la boîte elle-même.
 */
export async function reexaminerEcartesCommuns({ jours = 3 } = {}) {
  const { referentielTri } = await import('./tri-mails.js');
  const ref = referentielTri();
  const depuis = Date.now() - jours * 86400000;
  const communes = ref.commandes || new Set();
  const domaineDe = (e) => String(e || '').split('@')[1] || '';
  let n = 0;
  for (const e of Records.list('MailEcarte')) {
    const compte = String(e.compte || '').toLowerCase();
    const de = String(e.de_email || '').toLowerCase();
    if (!communes.has(compte) || Date.parse(e.le || 0) < depuis) continue;
    if (!(ref.internes.has(de) || ref.domaines.has(domaineDe(de)) || communes.has(de) || ref.mandataires?.has(de))) continue;
    Records.delete('MailEcarte', e.id);
    n += 1;
  }
  if (n) console.log(`[veille] ${n} mail(s) de l'équipe écarté(s) à tort sur la boîte commune : relus à la prochaine relève`);
  return n;
}

// Le coup d'oeil sur les boîtes communes (19 nov. 2026, Jules : « ça prend trop longtemps quand un mail avec une fiche
// est transféré vers sourcing@ ») : le transfert se traitait en vingt secondes mais attendait la relève suivante, jusqu'à
// quinze minutes (le push Gmail attend toujours son sujet Pub/Sub). Chaque minute, la liste de la réception de sourcing@,
// une lecture ; un mail inconnu fait partir la relève complète. Un mail resté inconnu après sa relève (sa lecture a
// échoué) ne la relance plus : la relève des quinze minutes le reprend.
const COUP_D_OEIL_S = Math.max(30, Number(process.env.MAIL_COMMUNES_SECONDES || 60));
let coupDOeil = null;
const dejaRelances = new Set();

/** Un mail arrivé sur une boîte commune ? La relève part. Rend les ids qui l'ont fait partir. */
export async function regarderCommunes({ inconnus = null, releve = relever } = {}) {
  if (enCours) return [];
  const { BOITES_COMMUNES } = await import('../haka/drapeaux.js');
  const lire = inconnus || (await import('../gmail-inbox.js')).idsInconnus;
  const nouveaux = [];
  for (const compte of comptesLisibles()) {
    if (!BOITES_COMMUNES.has(String(compte.email).toLowerCase())) continue;
    try {
      for (const id of await lire(compte.email)) if (!dejaRelances.has(id)) nouveaux.push(id);
    } catch { /* la relève des quinze minutes dira l'erreur au journal */ }
  }
  if (!nouveaux.length) return [];
  for (const id of nouveaux) dejaRelances.add(id);
  if (dejaRelances.size > 500) dejaRelances.clear();
  await releve();
  return nouveaux;
}

export function demarrerVeille() {
  if (minuterie) return true;
  if (!gmailReadDemande) return false;
  // Premier passage immédiat, puis à intervalle régulier.
  relever().catch(() => {});
  minuterie = setInterval(() => relever().catch(() => {}), MINUTES * 60 * 1000);
  // La veille ne doit pas retenir le processus à l'arrêt.
  minuterie.unref?.();
  coupDOeil = setInterval(() => regarderCommunes().catch(() => {}), COUP_D_OEIL_S * 1000);
  coupDOeil.unref?.();
  return true;
}

export function arreterVeille() {
  if (minuterie) clearInterval(minuterie);
  if (coupDOeil) clearInterval(coupDOeil);
  minuterie = null;
  coupDOeil = null;
}

// Haka : les déclencheurs (17 oct. 2026). Le premier : une fiche commerciale
// arrive dans une boîte de l'équipe. La veille des boîtes (deal/veille-mails.js)
// appelle `surReleve` à la place de l'ancienne passe `preanalyserLesNouvellesFiches`
// quand HAKA_FICHES est allumé. Les règles de tri sont les mêmes (fiches-auto.js :
// une pièce qui peut être une fiche, pas de conversation en cours) ; ce qui
// change, c'est la suite : une tâche par mail, le moteur les traite une à une,
// reprises au démarrage, et le mail à l'agent attend un clic dans la file.

import { Records, Meta } from '../db.js';
import { contexteDesConversations, dossierDeLaConversation, estUneNouvelleFiche, piecesFiche } from '../deal/fiches-auto.js';
import { memoire, verdictAppris } from './apprentissage-fiches.js';
import { proprietaireDeLaBoite } from './proprietaire.js';
import * as taches from './taches.js';
import './competences/fiche-recue.js';
import './competences/relances-matin.js';
import { verdictAmbiant } from './ambiant.js';
import { BOITES_COMMUNES, TRANSFERT } from './drapeaux.js';
import { surTransfert } from './competences/transfert.js';
import { membreDeLEquipe, signalerExterieur } from './competences/demande-equipe.js';
import { porteUneFiche } from '../deal/fiches-auto.js';
import { enPause, ignorer } from './automatismes.js';

const CLE_DEPUIS = 'mail.preanalyse_auto.depuis';

/** Une fiche reçue devient une tâche. Rend la tâche (existante si le mail est déjà en file). */
export function surFicheRecue(mail, { uploadDir = null, lancer } = {}) {
  const pour = proprietaireDeLaBoite(mail.compte)?.email || null;
  // L'automatisme en pause (Jules, 17 oct. 2026) : la fiche est notée « ignorée (en pause) », jamais perdue.
  if (enPause('pre-analyse-fiche')) {
    const id = ignorer('pre-analyse-fiche', { declencheur: 'mail_fiche_recue', relance: { type: 'fiche_recue', charge: { mail_id: mail.id, compte: mail.compte, uploadDir }, cle: `fiche:${mail.id}`, pour } });
    Records.update('MailRecu', mail.id, { haka_ignore: id });
    return { id: null, ignore: id };
  }
  const t = taches.enfiler('fiche_recue', { mail_id: mail.id, compte: mail.compte, uploadDir }, { cle: `fiche:${mail.id}`, pour, ...(lancer === undefined ? {} : { lancer }) });
  if (!mail.haka_tache_id) Records.update('MailRecu', mail.id, { haka_tache_id: t.id });
  return t;
}

/**
 * Après un relevé des boîtes : chaque nouvelle fiche entre en file. Même
 * forme de bilan que l'ancienne passe, pour le rapport de la veille.
 */
export async function surReleve({ uploadDir = null } = {}) {
  const bilan = { crees: 0, rejoints: 0, lignes: [], erreurs: [], echecs: [], en_file: 0 };
  // Seuls les mails arrivés après la première mise en route comptent : pas de rattrapage des années passées.
  let depuis = Meta.get(CLE_DEPUIS);
  if (!depuis) { depuis = new Date().toISOString(); Meta.set(CLE_DEPUIS, depuis); }
  const contexte = contexteDesConversations();
  // Ce que Haka a appris des Oui et des Non (20 oct. 2026) : un expéditeur déjà accepté est proposé même pour un PDF
  // au nom muet ; une pièce ou un expéditeur appris comme « pas une fiche » n'est plus proposé, et c'est noté sur le mail.
  const decisions = memoire();
  const candidats = contexte.mails
    .filter((m) => !m.haka_tache_id && !m.haka_ignore && !m.fiche_ecartee && Date.parse(m.date || 0) >= Date.parse(depuis))
    // Par transfert (23 oct. 2026, Jules) : Haka ne lit plus les boîtes personnelles ; une fiche qu'un collègue transfère
    // à sourcing@ passe par la compétence « transfert », qui la rentre sans redemander.
    .filter((m) => !TRANSFERT || (BOITES_COMMUNES.has(String(m.compte || '').toLowerCase()) && !m.commande))
    .filter((m) => {
      const v = verdictAppris(m, decisions);
      const regles = estUneNouvelleFiche(m, contexte);
      if (regles && v.proposer === false) {
        Records.update('MailRecu', m.id, { fiche_ecartee: { raison: v.raison, le: new Date().toISOString() } });
        bilan.ecartees_apprises = (bilan.ecartees_apprises || 0) + 1;
        return false;
      }
      if (regles) return true;
      return v.proposer === true && !m.deal_id && !m.dossier_supprime_le && !dossierDeLaConversation(m, contexte) && piecesFiche(m).length > 0;
    })
    .sort((a, b) => String(a.date).localeCompare(String(b.date)));
  for (const mail of candidats) {
    try {
      const t = surFicheRecue(mail, { uploadDir });
      if (t.ignore) { bilan.ignorees = (bilan.ignorees || 0) + 1; continue; }
      bilan.en_file += 1;
      bilan.lignes.push({ dossier: null, deal_id: null, de: mail.de_email, documents: piecesFiche(mail).map((p) => (typeof p === 'string' ? p : p?.nom)), haka: t.id, en_file: true });
    } catch (e) {
      bilan.erreurs.push(`Fiche « ${mail.objet || mail.id} » non mise en file : ${e?.message || e}`);
      bilan.echecs.push({ operation: 'haka_fiche', compte: mail.compte, quoi: `Fiche « ${String(mail.objet || '').slice(0, 80)} » non mise en file`, cause: String(e?.message || e).slice(0, 240), le: new Date().toISOString() });
    }
  }
  // Les boîtes communes (sourcing@) : une demande de l'équipe devient une tâche ; un extérieur va dans le Commun.
  for (const mail of contexte.mails.filter((m) => BOITES_COMMUNES.has(String(m.compte || '').toLowerCase()) && !m.haka_tache_id && !m.haka_vu && Date.parse(m.date || 0) >= Date.parse(depuis))) {
    try {
      if (mail.commande && membreDeLEquipe(mail.de_email) && TRANSFERT) {
        surTransfert(mail, { uploadDir });
        bilan.transferts = (bilan.transferts || 0) + 1;
      } else if (mail.commande && membreDeLEquipe(mail.de_email)) {
        const t = taches.enfiler('demande_equipe', { mail_id: mail.id }, { cle: `demande:${mail.id}`, pour: String(mail.de_email).toLowerCase() });
        Records.update('MailRecu', mail.id, { haka_tache_id: t.id });
        bilan.demandes = (bilan.demandes || 0) + 1;
      } else if (!mail.interne && !porteUneFiche(mail)) {
        await signalerExterieur(mail);
        bilan.exterieurs = (bilan.exterieurs || 0) + 1;
      }
    } catch (e) {
      bilan.erreurs.push(`Mail sourcing@ « ${mail.objet || mail.id} » : ${e?.message || e}`);
    }
  }
  return bilan;
}

// ---------------------------------------------------------------------------
// Ce que Haka a fait des mails reçus (21 oct. 2026, Jules : « j'ai reçu une fiche, je n'ai pas eu de notification »)
// ---------------------------------------------------------------------------

/**
 * Pure : pour un mail reçu, ce que Haka en a fait, en clair. `verdict` : 'proposee' (dans la file, une notification
 * est partie), 'ecartee' (pas proposée, avec la raison), 'en_attente' (sera proposée au prochain relevé).
 */
export function verdictDuMail(m, { depuis = null, contexte = {}, decisions = [], tache = null, enPause = false } = {}) {
  const pieces = (m.pieces_jointes || []).map((p) => (typeof p === 'string' ? p : p?.nom)).filter(Boolean);
  const v = (verdict, raison) => ({ id: m.id, date: m.date || null, de: m.de || m.de_email || null, compte: m.compte || null, objet: m.objet || '', pieces, verdict, raison });
  // Haka ambiant (22 oct. 2026) : ce qu'il a fait d'un mail qui n'est pas une fiche.
  const amb = !m.haka_tache_id ? verdictAmbiant(m) : null;
  if (amb) return v(amb.verdict, amb.raison);
  if (m.haka_tache_id) {
    if (tache?.etat === 'en_attente_validation' && tache?.etape === 'accepter_preanalyse') return v('proposee', 'Proposée : elle attend « Je la rentre ? » dans la cloche et À valider.');
    if (m.fiche_refusee) return v('ecartee', `Vous avez répondu Non${m.fiche_refusee.motif ? ` : « ${m.fiche_refusee.motif} »` : ''}.`);
    return v('proposee', `Prise par l'Assistant KPartners${tache?.etat ? ` (${tache.etat.replace(/_/g, ' ')})` : ''}.`);
  }
  if (m.haka_ignore) return v('ecartee', "L'automatisme « pré-analyse des fiches » était en pause à son arrivée (Administration › Automatismes).");
  if (m.deal_id) return v('ecartee', 'Rattachée à un dossier existant (même conversation ou même fiche) : pas de nouvelle proposition.');
  if (m.fiche_ecartee) return v('ecartee', `L'Assistant KPartners a appris que ce n'est pas une fiche : ${m.fiche_ecartee.raison || 'refus précédents'}.`);
  if (depuis && Date.parse(m.date || 0) < Date.parse(depuis)) return v('ecartee', 'Arrivée avant la mise en route de l\'Assistant KPartners sur les fiches.');
  if (dossierDeLaConversation(m, contexte)) return v('ecartee', "Elle répond à la conversation d'un dossier : elle y entre comme une pièce.");
  if (!pieces.length) return v('ecartee', 'Aucune pièce jointe : la fiche est peut-être dans le texte ou derrière un lien. Collez-la dans le chat de l\'Assistant KPartners.');
  if (!piecesFiche(m).length) return v('ecartee', `Aucune pièce ne ressemble à une fiche (${pieces.slice(0, 3).join(', ')}) : un PDF ou un Word, pas un document de dossier.`);
  if (!estUneNouvelleFiche(m, contexte)) return v('ecartee', "Le mail l'annonce comme un complément, ou la pièce porte un nom muet et le mail ne parle pas d'un bien à vendre.");
  const appris = verdictAppris(m, decisions);
  if (appris.proposer === false) return v('ecartee', `L'Assistant KPartners a appris que ce n'est pas une fiche : ${appris.raison}.`);
  return v('en_attente', 'Elle sera proposée au prochain relevé des boîtes (toutes les quelques minutes).');
}

/** Les mails reçus ces derniers jours qui portent une pièce, avec ce que Haka en a fait. */
export async function etatDesFiches({ jours = 3 } = {}) {
  const contexte = contexteDesConversations();
  const depuis = Meta.get(CLE_DEPUIS);
  const decisions = memoire();
  const pause = enPause('pre-analyse-fiche');
  const limite = Date.now() - jours * 86400000;
  return contexte.mails
    .filter((m) => Date.parse(m.date || 0) >= limite && ((m.pieces_jointes || []).length > 0 || m.haka_ambiant) && !m.interne)
    .sort((a, b) => String(b.date).localeCompare(String(a.date)))
    .slice(0, 60)
    .map((m) => verdictDuMail(m, { depuis, contexte, decisions, tache: m.haka_tache_id ? taches.tache(m.haka_tache_id) : null, enPause: pause }));
}

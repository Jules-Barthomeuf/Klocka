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
import { BOITES_COMMUNES } from './drapeaux.js';
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
      if (mail.commande && membreDeLEquipe(mail.de_email)) {
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

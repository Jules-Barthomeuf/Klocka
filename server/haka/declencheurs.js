// Haka : les déclencheurs (17 oct. 2026). Le premier : une fiche commerciale
// arrive dans une boîte de l'équipe. La veille des boîtes (deal/veille-mails.js)
// appelle `surReleve` à la place de l'ancienne passe `preanalyserLesNouvellesFiches`
// quand HAKA_FICHES est allumé. Les règles de tri sont les mêmes (fiches-auto.js :
// une pièce qui peut être une fiche, pas de conversation en cours) ; ce qui
// change, c'est la suite : une tâche par mail, le moteur les traite une à une,
// reprises au démarrage, et le mail à l'agent attend un clic dans la file.

import { Records, Meta } from '../db.js';
import { contexteDesConversations, estUneNouvelleFiche, piecesFiche } from '../deal/fiches-auto.js';
import { proprietaireDeLaBoite } from './proprietaire.js';
import * as taches from './taches.js';
import './competences/fiche-recue.js';

const CLE_DEPUIS = 'mail.preanalyse_auto.depuis';

/** Une fiche reçue devient une tâche. Rend la tâche (existante si le mail est déjà en file). */
export function surFicheRecue(mail, { uploadDir = null, lancer } = {}) {
  const pour = proprietaireDeLaBoite(mail.compte)?.email || null;
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
  const candidats = contexte.mails
    .filter((m) => !m.haka_tache_id && Date.parse(m.date || 0) >= Date.parse(depuis) && estUneNouvelleFiche(m, contexte))
    .sort((a, b) => String(a.date).localeCompare(String(b.date)));
  for (const mail of candidats) {
    try {
      const t = surFicheRecue(mail, { uploadDir });
      bilan.en_file += 1;
      bilan.lignes.push({ dossier: null, deal_id: null, de: mail.de_email, documents: piecesFiche(mail).map((p) => (typeof p === 'string' ? p : p?.nom)), haka: t.id, en_file: true });
    } catch (e) {
      bilan.erreurs.push(`Fiche « ${mail.objet || mail.id} » non mise en file : ${e?.message || e}`);
      bilan.echecs.push({ operation: 'haka_fiche', compte: mail.compte, quoi: `Fiche « ${String(mail.objet || '').slice(0, 80)} » non mise en file`, cause: String(e?.message || e).slice(0, 240), le: new Date().toISOString() });
    }
  }
  return bilan;
}

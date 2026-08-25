// Journal des actions de l'assistant, et leur annulation.
//
// L'assistant écrit dans Monday, crée des dossiers Drive, inscrit des agents.
// Deux exigences en découlent : savoir qui a demandé quoi et ce qui a réellement
// été exécuté, et pouvoir défaire. Tant qu'on ne peut pas dire « annule », on
// hésite avant de laisser agir — et un assistant devant lequel on hésite ne sert
// à rien.
//
// Ce qui est réversible l'est franchement ; ce qui ne l'est pas le dit. On ne
// prétend jamais avoir défait ce qui ne peut pas l'être.

import { Records } from './db.js';

// Ce qu'on sait défaire, et comment. Une action absente d'ici est journalisée
// mais non annulable — c'est un fait, pas un oubli.
const REVERSIBLES = {
  pousser_dossier_monday: "l'élément Monday créé sera supprimé",
  pousser_projet_monday: "l'élément Monday créé sera supprimé",
  creer_agent_monday: "la fiche agent créée sera supprimée",
  creer_drive_dossier: 'le dossier Drive créé partira à la corbeille',
};

/**
 * Consigne une action exécutée.
 * @returns {object} l'entrée du journal
 */
export function journaliser({ outil, args, resultat, user }) {
  // Une mise à jour n'est pas annulable : on ne connaît pas l'état d'avant.
  const creation = resultat?.cree === true;
  const annulable = !!REVERSIBLES[outil] && creation;

  return Records.create('AssistantAction', {
    outil,
    arguments: args || {},
    resultat: resultat || {},
    par: user?.email || null,
    le: new Date().toISOString(),
    deal_id: args?.deal_id || null,
    projet_id: args?.projet_id || null,
    annulable,
    annulee: false,
    // Ce qu'annuler ferait, pour pouvoir l'annoncer avant de le faire.
    effet_annulation: annulable ? REVERSIBLES[outil] : null,
  });
}

/** Les dernières actions, la plus récente d'abord. */
export function dernieresActions(limite = 10, user = null) {
  return Records.list('AssistantAction')
    .filter((a) => !user || a.par === user)
    .sort((a, b) => String(b.le || '').localeCompare(String(a.le || '')))
    .slice(0, limite);
}

/** La dernière action encore annulable. */
export function derniereAnnulable(user = null) {
  return dernieresActions(30, user).find((a) => a.annulable && !a.annulee) || null;
}

/**
 * Défait une action. Chaque outil a son inverse ; sans inverse, on le dit.
 * @returns {Promise<{ok: boolean, message: string}>}
 */
export async function annuler(action) {
  if (!action) return { ok: false, message: "Aucune action annulable dans l'historique récent." };
  if (action.annulee) return { ok: false, message: 'Cette action a déjà été annulée.' };
  if (!action.annulable) {
    return {
      ok: false,
      message: `« ${action.outil} » ne se défait pas : ${
        action.resultat?.cree === false
          ? "il s'agissait d'une mise à jour, l'état précédent n'est pas conservé"
          : 'cette action est sans retour'
      }.`,
    };
  }

  const id = action.resultat?.id;

  if (action.outil.startsWith('pousser_') || action.outil === 'creer_agent_monday') {
    const { supprimerElement } = await import('./monday.js');
    await supprimerElement(id);
    // Le dossier ou le projet ne doit plus pointer vers un élément disparu.
    if (action.deal_id) {
      const deal = Records.filter('Deal', { deal_id: action.deal_id })[0];
      if (deal?.monday_item_id === String(id)) Records.update('Deal', deal.id, { monday_item_id: null });
    }
    if (action.projet_id) {
      const projet = Records.get('Project', action.projet_id);
      if (projet?.monday_item_id === String(id)) Records.update('Project', projet.id, { monday_item_id: null });
    }
    Records.update('AssistantAction', action.id, { annulee: true, annulee_le: new Date().toISOString() });
    return { ok: true, message: `Élément Monday supprimé (${action.resultat?.titre || id}).` };
  }

  if (action.outil === 'creer_drive_dossier') {
    const deal = Records.filter('Deal', { deal_id: action.deal_id })[0];
    const dossierId = deal?.drive_folder_id;
    if (!dossierId) return { ok: false, message: 'Le dossier Drive est introuvable.' };

    const compte = action.resultat?.compte;
    if (!compte) return { ok: false, message: "Le compte Google d'origine n'est pas connu." };

    const { corbeille } = await import('./google-drive.js');
    // À la corbeille, pas détruit : l'annulation ne doit pas être pire que
    // l'action qu'elle défait.
    await corbeille(compte, dossierId);
    Records.update('Deal', deal.id, { drive_folder_id: null, drive_folder_url: null });
    Records.update('AssistantAction', action.id, { annulee: true, annulee_le: new Date().toISOString() });
    return { ok: true, message: 'Dossier Drive mis à la corbeille et délié du dossier.' };
  }

  return { ok: false, message: `Aucune annulation connue pour « ${action.outil} ».` };
}

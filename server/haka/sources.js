// Haka : l'enveloppe d'une source (17 oct. 2026). Chaque proposition dit d'où
// vient ce qu'elle avance, avec la même colonne vertébrale que les connecteurs
// de marché (server/marche/normalise.js) : l'outil, le service, un libellé
// lisible, un lien, une date, et si ça vient du cache. À l'écran : une ligne
// de texte par source, avec son lien (design-system, § 6, « Sources d'une
// réponse »), jamais un aperçu inventé.

/**
 * @param {{outil: string, service?: string|null, libelle: string, lien?: string|null, le?: string, du_cache?: boolean, extrait?: string|null}} s
 */
export function source({ outil, service = null, libelle, lien = null, le = new Date().toISOString(), du_cache = false, extrait = null }) {
  return { outil: String(outil), service, libelle: String(libelle || '').slice(0, 200), lien, le, du_cache: !!du_cache, extrait: extrait ? String(extrait).slice(0, 300) : null };
}

/** Un mail reçu, comme source. */
export const sourceMail = (mail, lien = null) => source({
  outil: 'gmail', service: 'MailRecu',
  libelle: `Mail de ${String(mail?.de || mail?.de_email || '?').replace(/<[^>]*>/g, '').trim()}${mail?.date ? `, ${new Date(mail.date).toLocaleDateString('fr-FR', { day: 'numeric', month: 'short' })}` : ''}`,
  lien, le: mail?.date || new Date().toISOString(), extrait: mail?.objet || null,
});

/** La fiche commerciale d'un dossier, comme source. */
export const sourceFiche = (deal) => source({
  outil: 'fiche', service: 'upload',
  libelle: deal?.source?.nom_fichier || 'Fiche commerciale',
  lien: deal?.source?.url || null, le: deal?.cree_le || new Date().toISOString(),
});

/** L'évaluation d'un dossier (le verdict et ses manques), comme source. */
export const sourceEvaluation = (deal) => {
  const lot = deal?.lots?.[0];
  const verdict = lot?.evaluation?.verdict || null;
  const manques = (lot?.evaluation?.contexte?.informations_manquantes || lot?.synthese?.informations_manquantes || []).slice(0, 6);
  return source({
    outil: 'preanalyse', service: 'rules.json',
    libelle: `Pré-analyse : ${verdict || 'sans verdict'}${manques.length ? ` ; il manque ${manques.join(', ')}` : ''}`,
    lien: deal?.deal_id ? `/Dossiers?deal_id=${deal.deal_id}` : null,
  });
};

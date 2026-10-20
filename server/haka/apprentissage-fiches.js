// Ce que Haka apprend des fiches reçues (20 oct. 2026, Jules : « fais en sorte que ça apprenne bien ») : chaque
// réponse à « Nouvelle fiche : la rentrer ? » est gardée, Oui comme Non, avec la raison du Non (obligatoire). Les
// relevés suivants s'en servent, dans les deux sens :
//   - un expéditeur dont on a déjà rentré une fiche : ses PDF sont proposés même au nom muet (« scan001.pdf ») ;
//   - une pièce dont le gabarit de nom (sans chiffres ni extension) a été refusée comme « pas une fiche » et jamais
//     acceptée n'est plus proposée ;
//   - un expéditeur refusé deux fois comme « pas une fiche », jamais accepté, n'est plus proposé, sauf si le nom
//     de la pièce dit la fiche (« Fiche… », « Teaser… »).
// Seule la raison « Ce n'est pas une fiche commerciale » touche la détection ; « hors critères » ou « déjà reçue »
// sont gardées pour le Suivi, elles ne disent rien de ce qu'est une fiche.

import { Records } from '../db.js';
import { piecesFiche, nomDitFiche } from '../deal/fiches-auto.js';

const ENTITE = 'FicheDecision';

export const RAISONS = {
  pas_une_fiche: "Ce n'est pas une fiche commerciale",
  hors_criteres: 'Hors de nos critères',
  deja_recue: 'Déjà reçue ou déjà en dossier',
  autre: 'Autre',
};

const nomDe = (p) => String((typeof p === 'string' ? p : p?.nom) || '');

/** Pure : le gabarit d'un nom de pièce, pour reconnaître le même document d'un envoi à l'autre. */
export const gabarit = (nom) => nomDe(nom).toLowerCase().replace(/\.[a-z0-9]{1,5}$/, '').replace(/[0-9]+/g, ' ').replace(/[_\-.()[\]]+/g, ' ').replace(/\s+/g, ' ').trim();

/** Garde une décision (Oui ou Non) sur la fiche d'un mail. */
export function enregistrer(mail, { choix, categorie = null, motif = null, par = null }) {
  if (!mail) return null;
  return Records.create(ENTITE, {
    mail_id: mail.id, de_email: String(mail.de_email || '').toLowerCase() || null, compte: mail.compte || null,
    gabarits: piecesFiche(mail).map(gabarit).filter(Boolean), objet: String(mail.objet || '').slice(0, 200),
    choix, categorie: categorie && RAISONS[categorie] ? categorie : (choix === 'ignorer' ? 'autre' : null),
    motif: motif ? String(motif).slice(0, 500) : null, par: par || null, le: new Date().toISOString(),
  });
}

/** Les décisions gardées, pour le verdict. */
export const memoire = () => Records.list(ENTITE);

/**
 * Pure : ce que le vécu dit d'un mail. `proposer` : true (un expéditeur déjà accepté), false (appris : ce n'est
 * pas une fiche), null (rien appris : les règles décident). `raison` dit pourquoi, pour le Suivi.
 */
export function verdictAppris(mail, decisions = []) {
  const de = String(mail?.de_email || '').toLowerCase();
  const pieces = piecesFiche(mail);
  if (!pieces.length) return { proposer: null, raison: null };
  const gabs = pieces.map(gabarit).filter(Boolean);
  const duMeme = decisions.filter((d) => d.de_email && d.de_email === de);
  const accepteesDe = duMeme.filter((d) => d.choix === 'preanalyser').length;
  const pasFiche = (d) => d.choix === 'ignorer' && d.categorie === 'pas_une_fiche';
  const gabaritsRefuses = new Set(decisions.filter(pasFiche).flatMap((d) => d.gabarits || []));
  const gabaritsAcceptes = new Set(decisions.filter((d) => d.choix === 'preanalyser').flatMap((d) => d.gabarits || []));
  // Toutes les pièces candidates déjà refusées comme « pas une fiche », jamais acceptées.
  if (gabs.length && gabs.every((g) => gabaritsRefuses.has(g) && !gabaritsAcceptes.has(g))) {
    return { proposer: false, raison: `pièce déjà refusée comme « pas une fiche » (${gabs[0]})` };
  }
  if (!accepteesDe && duMeme.filter(pasFiche).length >= 2 && !pieces.some(nomDitFiche)) {
    return { proposer: false, raison: `${de} : deux envois refusés comme « pas une fiche », aucun accepté` };
  }
  if (accepteesDe) return { proposer: true, raison: `${de} : ${accepteesDe} fiche${accepteesDe > 1 ? 's' : ''} déjà rentrée${accepteesDe > 1 ? 's' : ''}` };
  return { proposer: null, raison: null };
}

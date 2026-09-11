// Alex — l'agent qui fait la recherche de marché à votre place.
//
// L'équipe ouvrait trois services à la main, l'un après l'autre : Data-B pour
// la valeur locative de la rue puis les cessions de fonds, Equimmox pour les
// baux comparables, Le Figaro pour le résidentiel. Quatre lectures, un
// quart d'heure, et autant d'occasions d'en oublier une.
//
// Alex les enchaîne dans cet ordre et pose chaque résultat sur le lot dès
// qu'il l'a : la page se remplit au fur et à mesure plutôt qu'à la fin.
//
// Une étape qui échoue n'arrête pas les autres. Equimmox demande un navigateur
// que l'hébergeur n'a pas toujours ; ce n'est pas une raison pour se priver du
// Figaro. Le rapport final dit ce qui a marché et ce qui n'a pas marché.

import { Records } from './db.js';

// L'ordre compte : c'est celui que l'équipe suivait.
export const ETAPES_ALEX = [
  { cle: 'valeur_locative', service: 'Data-B', titre: 'la valeur locative' },
  { cle: 'transactions_fonds', service: 'Data-B', titre: 'les cessions de fonds' },
  { cle: 'analyse_loyer', service: 'Equimmox', titre: 'les loyers observés' },
  { cle: 'prix_residentiel', service: 'Le Figaro', titre: 'le marché résidentiel' },
];

const travaux = new Map();
const PLAFOND = 30;

const cleDe = (dealId, index) => `${dealId}|${index}`;

/** Le lot d'un dossier, tel qu'il est à cet instant. */
function lotDe(dealId, index) {
  const deal = Records.filter('Deal', { deal_id: dealId })[0];
  return { deal, lot: deal?.lots?.[index] || null };
}

/** Pose un résultat sur le lot, sans écraser ce qui a pu changer entre-temps. */
function poser(dealId, index, champ, valeur) {
  const deal = Records.filter('Deal', { deal_id: dealId })[0];
  if (!deal) return;
  const lots = [...deal.lots];
  lots[index] = { ...lots[index], [champ]: valeur };
  Records.update('Deal', deal.id, { lots });
}

/**
 * Démarre — ou retrouve — la recherche de marché d'un lot.
 * @returns {{cle, etat, etape, resultats, echecs}}
 */
export function lancerRechercheMarche(dealId, index = 0, { user = null, forcer = false } = {}) {
  const cle = cleDe(dealId, index);
  const enCours = travaux.get(cle);
  if (enCours?.etat === 'en_cours') return { cle, ...enCours };

  const travail = {
    etat: 'en_cours',
    // L'étape en cours, par son rang : c'est ce que l'écran suit.
    etape: 0,
    resultats: {},
    echecs: {},
    depuis: new Date().toISOString(),
  };
  travaux.set(cle, travail);
  if (travaux.size > PLAFOND) {
    for (const [k, t] of travaux) {
      if (t.etat !== 'en_cours') travaux.delete(k);
      if (travaux.size <= PLAFOND) break;
    }
  }

  chercher(dealId, index, travail, { user, forcer }).catch((e) => {
    travail.etat = 'erreur';
    travail.erreur = e?.message || 'La recherche de marché a échoué.';
  });

  return { cle, ...travail };
}

async function chercher(dealId, index, travail, { user, forcer }) {
  const { lot } = lotDe(dealId, index);
  if (!lot) throw new Error('Lot introuvable.');

  const a = lot.lot?.adresse?.valeur;
  const adresse = a ? [a.rue, [a.code_postal, a.ville].filter(Boolean).join(' ')].filter(Boolean).join(', ') : '';
  if (!adresse) throw new Error('Aucune adresse sur ce lot : renseignez-la avant de lancer Alex.');
  const surface = Number(lot.lot?.surface_m2?.valeur) > 0 ? Number(lot.lot.surface_m2.valeur) : null;

  // Une étape : on la joue, on note ce qu'elle rend, on passe à la suivante.
  // Un échec est enregistré et n'interrompt pas la suite.
  const jouer = async (rang, travailler) => {
    travail.etape = rang;
    const { cle } = ETAPES_ALEX[rang];
    try {
      const r = await travailler();
      if (r?.ok) {
        travail.resultats[cle] = r.resultat;
        poser(dealId, index, cle, r.resultat);
      } else {
        travail.echecs[cle] = r?.error || 'Sans réponse.';
      }
    } catch (e) {
      travail.echecs[cle] = e?.message || 'Sans réponse.';
    }
  };

  const { valeurLocative } = await import('./data-b.js');
  await jouer(0, () => valeurLocative(adresse, { forcer, user }));

  const { transactionsFonds } = await import('./data-b-transactions.js');
  await jouer(1, () => transactionsFonds(adresse, { forcer, user }));

  const { analyseLoyer } = await import('./equimmox.js');
  await jouer(2, () => analyseLoyer(adresse, { surface, forcer, user }));

  const { prixResidentiel } = await import('./figaro.js');
  await jouer(3, () => prixResidentiel(adresse, { forcer, user }));

  travail.etape = ETAPES_ALEX.length;
  travail.etat = 'pret';
  const faites = Object.keys(travail.resultats).length;
  console.log(`[alex] ${adresse} — ${faites}/${ETAPES_ALEX.length} lectures${Object.keys(travail.echecs).length ? ` · échecs : ${Object.keys(travail.echecs).join(', ')}` : ''}`);
}

/** Où en est la recherche lancée pour cette clé. */
export function etatRechercheMarche(cle) {
  const t = travaux.get(cle);
  if (!t) return null;
  return {
    cle,
    etat: t.etat,
    etape: t.etape,
    total: ETAPES_ALEX.length,
    resultats: t.resultats,
    echecs: t.echecs,
    erreur: t.erreur || null,
  };
}

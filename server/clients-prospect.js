// Un client ne naît pas : c'est un prospect qui signe.
//
// Le tableau « Prospects » de Monday porte 283 personnes rencontrées, avec ce
// qu'on sait d'elles — leur métier, leurs revenus, leurs fonds propres, leur
// patrimoine, ce qu'on s'est dit. Le tableau « Clients » porte celles qui ont
// signé. Jusqu'ici « créer un client » créait une fiche Clients de zéro et
// laissait le prospect en l'état : la même personne existait deux fois, et
// tout ce que l'appel de découverte avait appris restait de l'autre côté.
//
// Passer en client, c'est donc deux gestes et non un :
//   1. chez le prospect, le statut passe à « Mandat signé » ;
//   2. chez le client, les cases se remplissent de ce que le prospect savait.
//
// Les libellés ne sont pas devinés : « Mandat signé » figure bien dans la
// liste du statut des prospects, relevée sur le tableau lui-même.

import { TABLEAUX, lireTableau, poserElement, mondayConfigure } from './monday.js';

/** Les colonnes du tableau Prospects, relevées sur place. */
const COL = {
  prenom: 'text_mm324cr2',
  personnes: 'multiple_person_mkvpgyzx',
  fonction: 'text_mkvpz940',
  telephone: 'phone_mkvpvev7',
  email: 'email_mkvpa5n9',
  statut: 'color_mkvvbzpv',
  source: 'color_mm1stcp3',
  date: 'date_mkvwd1p',
  revenu: 'numeric_mkvp6zt4',
  fonds_propres: 'numeric_mkvpkpv2',
  patrimoine: 'text_mkvpbre8',
  information: 'long_text_mkvpgdkp',
  lieu: 'location_mkvp6pfz',
};

/** Le statut qui dit qu'un prospect a signé. Il existe dans la liste du tableau. */
export const MANDAT_SIGNE = 'Mandat signé';

// `lireTableau` rend les colonnes en objet, indexé par identifiant — pas en
// tableau. Les lire comme un tableau rendait tous les champs vides, sans rien
// signaler : une fiche client remplie de rien.
const texte = (item, colonne) => {
  const t = String(item?.colonnes?.[colonne] ?? '').trim();
  return t || null;
};
const nombre = (item, colonne) => {
  const t = texte(item, colonne);
  const n = t ? Number(String(t).replace(/[^\d.-]/g, '')) : null;
  return Number.isFinite(n) && n > 0 ? Math.round(n) : null;
};
const normaliser = (s) => String(s || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/\s+/g, ' ').trim();

/**
 * Retrouve un prospect par son adresse mail, sinon par son nom.
 *
 * L'adresse est sûre, le nom ne l'est pas : deux personnes peuvent le porter.
 * En cas d'homonymie on ne choisit pas à la place de l'équipe, on rend les
 * candidats et on laisse trancher.
 *
 * @param {{email?: string, nom?: string}} qui
 * @returns {Promise<{ok: true, prospect: object} | {ok: false, error: string, candidats?: Array}>}
 */
export async function chercherProspect({ email = null, nom = null } = {}) {
  if (!mondayConfigure()) return { ok: false, error: "Monday n'est pas configuré (MONDAY_TOKEN)." };
  if (!TABLEAUX.prospects) return { ok: false, error: "Le tableau Prospects n'est pas déclaré (MONDAY_BOARD_PROSPECTS)." };
  if (!email && !nom) return { ok: false, error: 'Ni nom ni adresse : rien à chercher.' };

  const lignes = await lireTableau(TABLEAUX.prospects);
  const parMail = email
    ? lignes.filter((l) => normaliser(texte(l, COL.email)) === normaliser(email))
    : [];
  if (parMail.length === 1) return { ok: true, prospect: parMail[0] };
  if (parMail.length > 1) return { ok: false, error: `Plusieurs prospects portent l'adresse ${email}.`, candidats: parMail.map(resume) };

  const cherche = normaliser(nom);
  if (!cherche) return { ok: false, error: `Aucun prospect à l'adresse ${email}.` };
  // Le nom de l'élément porte « Prénom NOM » ; on accepte aussi l'inclusion,
  // pour que « Deslis » retrouve « Charles DESLIS ».
  const exacts = lignes.filter((l) => normaliser(l.nom) === cherche);
  const proches = exacts.length ? exacts : lignes.filter((l) => normaliser(l.nom).includes(cherche) || cherche.includes(normaliser(l.nom)));
  if (proches.length === 1) return { ok: true, prospect: proches[0] };
  if (proches.length > 1) return { ok: false, error: `Plusieurs prospects répondent à « ${nom} ».`, candidats: proches.slice(0, 8).map(resume) };
  return { ok: false, error: `Aucun prospect ne répond à « ${nom} ».` };
}

const resume = (l) => ({ id: l.id, nom: l.nom, email: texte(l, COL.email), statut: texte(l, COL.statut) });

/**
 * Ce que le prospect sait, mis à la forme que le tableau Clients attend.
 * Pure : testée sans réseau.
 */
export function champsDepuisProspect(prospect) {
  const nomComplet = String(prospect?.nom || '').trim();
  const prenom = texte(prospect, COL.prenom);
  // Le nom de l'élément est « Prénom NOM » : le prénom vient de sa colonne,
  // le reste est le nom de famille.
  const nom = prenom && nomComplet.toLowerCase().startsWith(prenom.toLowerCase())
    ? nomComplet.slice(prenom.length).trim()
    : nomComplet;
  return {
    prenom: prenom || nomComplet.split(' ')[0] || null,
    nom: nom || null,
    email: texte(prospect, COL.email)?.toLowerCase() || null,
    telephone: texte(prospect, COL.telephone),
    fonction: texte(prospect, COL.fonction),
    localisation: texte(prospect, COL.lieu),
    revenu: nombre(prospect, COL.revenu),
    fonds_propres: nombre(prospect, COL.fonds_propres),
    patrimoine: texte(prospect, COL.patrimoine),
    information: texte(prospect, COL.information),
    source: texte(prospect, COL.source),
    // Il signe : c'est tout l'objet du passage.
    statut: MANDAT_SIGNE,
    mandat_signe: MANDAT_SIGNE,
  };
}

/**
 * Chez le prospect, le statut passe à « Mandat signé ».
 * On ne touche qu'à cet élément-là : `itemId` évite toute création.
 */
export async function cocherMandatSigne(prospectId) {
  if (!TABLEAUX.prospects) return { ok: false, error: "Le tableau Prospects n'est pas déclaré." };
  await poserElement(TABLEAUX.prospects, {
    itemId: prospectId,
    colonnes: { [COL.statut]: { label: MANDAT_SIGNE } },
  });
  return { ok: true };
}

/**
 * Deux sources pour une même personne : ce que l'appel vient d'apprendre prime
 * sur ce que la fiche prospect savait, et le prospect comble les vides.
 */
export function fusionner(duProspect, saisis) {
  const sortie = { ...duProspect };
  for (const [cle, valeur] of Object.entries(saisis || {})) {
    if (valeur === null || valeur === undefined || valeur === '') continue;
    sortie[cle] = valeur;
  }
  // Le passage en client force ces deux-là, quoi qu'ait dit l'appel.
  sortie.statut = MANDAT_SIGNE;
  sortie.mandat_signe = MANDAT_SIGNE;
  return sortie;
}

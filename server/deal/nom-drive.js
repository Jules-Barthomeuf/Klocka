// Le nom d'un dossier Drive : la ville, puis l'adresse.
//
//   « SAINT-NAZAIRE - 12 rue de la Paix »
//
// Chaque appelant prenait jusqu'ici le titre du dossier, qui commence par le
// type de bien et finit par le verdict — « Local commercial à Lyon (69009) :
// Verdict INSUFFISANT ». Dans un Drive, cela range tous les dossiers sous la
// même lettre, et le verdict du jour se fige dans un nom qui, lui, ne bouge
// plus. La ville en tête les classe par endroit, qui est la seule façon de
// retrouver un dossier à la main.
//
// Sans ville, on garde le titre d'avant : mieux vaut un nom imparfait qu'un
// dossier appelé « Dossier ».

// Une barre oblique couperait le nom en deux chez Drive ; les retours à la
// ligne d'une adresse recopiée d'une fiche aussi.
const propre = (s) => String(s || '').replace(/[\\/\n\r\t]+/g, ' ').replace(/\s+/g, ' ').trim();

// Un nom de dossier se lit d'un coup d'œil dans une liste Drive : au-delà,
// il est tronqué à l'écran de toute façon, et une adresse à deux cellules en
// fait vite cent caractères. On coupe au dernier mot entier.
const LONGUEUR_MAX = 80;
const couper = (s) => {
  if (s.length <= LONGUEUR_MAX) return s;
  const coupe = s.slice(0, LONGUEUR_MAX);
  const espace = coupe.lastIndexOf(' ');
  return (espace > LONGUEUR_MAX / 2 ? coupe.slice(0, espace) : coupe).trim();
};

/**
 * @param {object} deal le dossier
 * @returns {string} « VILLE - adresse », ou le titre du dossier sans ville
 */
export function nomDossierDrive(deal) {
  const lot = deal?.lots?.[0] || {};
  const adresse = lot?.lot?.adresse?.valeur || {};
  const ville = propre(lot?.enrichissement?.commune?.nom || adresse.ville);
  const repli = propre(deal?.nom || lot?.synthese?.titre || deal?.source?.nom_fichier || deal?.deal_id) || 'Dossier';
  if (!ville) return couper(repli);
  // À défaut de rue, le code postal situe encore : « LYON - 69009 » vaut mieux
  // que trois dossiers « LYON » côte à côte.
  const suite = propre(adresse.rue) || propre(adresse.code_postal);
  return couper(suite ? `${ville.toUpperCase()} - ${suite}` : ville.toUpperCase());
}

// Le flux, estimé. Pur.
//
// Personne ne compte les passants dans une rue de France : les services
// payants font « un calcul algorithmique », nous aussi. Le nôtre est écrit ici, avec ses
// poids, pour qu'on puisse le lire et le contester.
//
// Le passage à pied tient d'abord à la commercialité : on va où il y a des
// vitrines, et il y a des vitrines où l'on passe. Puis à qui vit là, à qui y
// travaille, à ce qui y amène du monde (gares, métro, tramway, bus). Trois
// sous-notes reprennent ces trois familles : shopping, résidentiel,
// travailleur. La commercialité fait la note ; les autres la nuancent.
//
// Calage : les trois rapports archivés d'un service payant. Rue Dabray à Nice, 13
// commerces sur le tronçon, 3/5 ; avenue Marceau à Courbevoie, 19, 3/5 ;
// rue Saint-Agricol à Avignon, 33 sur une rue de 166 m, 5/5. L'estimation
// retombe à une étoile près, et le dit : `estime: true` partout.

/** Piétons par heure, par note : [creux min, creux max, pointe min, pointe max]. Relevé sur les rapports archivés. */
export const FOURCHETTES = {
  1: [50, 100, 100, 200],
  2: [100, 150, 250, 400],
  3: [150, 250, 400, 750],
  4: [500, 750, 1000, 1500],
  5: [1500, 2000, 4000, 5000],
};
/** Un jour de passage vaut environ vingt-cinq heures de pointe et de creux mêlées : c'est le rapport des rapports archivés. */
const HEURES_PAR_JOUR = 25;

const borne = (n) => Math.max(1, Math.min(5, n));
const palier = (x, seuils) => borne(seuils.findIndex((s) => x < s) === -1 ? 5 : seuils.findIndex((s) => x < s) + 1);

/**
 * La note de commercialité : la moyenne, arrondie vers le bas, de ce que dit
 * le tronçon et de ce que dit la densité de la rue ; une étoile de plus dans
 * une rue piétonne, une de moins dans une rue de quartier presque vide.
 */
export function noteShopping({ commerces_troncon = 0, commerces_rue = 0, longueur_rue_m = null, type_voie = null }) {
  const parTroncon = palier(commerces_troncon, [3, 8, 14, 22]);
  const densite = longueur_rue_m ? commerces_rue / (Math.max(longueur_rue_m, 50) / 100) : 0;
  const parDensite = palier(densite, [1.5, 3, 5, 8]);
  return borne(Math.floor((parTroncon + parDensite) / 2) + (type_voie === 'pedestrian' ? 1 : 0) - (type_voie === 'residential' && parTroncon <= 2 ? 1 : 0));
}

/** Qui vit à cinq minutes. */
export const noteResidentiel = (habitants) => palier(habitants || 0, [2000, 4000, 6000, 9000]);
/** Qui travaille à cinq minutes : les établissements actifs du registre. */
export const noteTravailleur = (entreprises) => palier(entreprises || 0, [300, 800, 1500, 3000]);

/** Ce qui amène du monde à trois cents mètres. */
export function noteTransports(generateurs) {
  const g = generateurs || [];
  const a = (genre) => g.some((x) => x.genre === genre);
  let n = 1;
  if (a('Gare')) n += 2;
  if (a('Métro')) n += 2;
  if (a('Tramway')) n += 1;
  if (g.filter((x) => x.genre === 'Bus').length >= 2) n += 1;
  if (g.some((x) => ['Supermarché', 'Centre commercial', 'Grand magasin'].includes(x.genre))) n += 1;
  return borne(n);
}

/** Le flux piéton, dans la forme que le rapport lit. */
export function fluxPieton(signaux) {
  const shopping = noteShopping(signaux);
  const residentiel = noteResidentiel(signaux.habitants_5min);
  const travailleur = noteTravailleur(signaux.entreprises_5min);
  const transports = noteTransports(signaux.generateurs);
  // La commercialité donne la note ; les trois autres la déplacent d'un quart
  // d'étoile par étoile d'écart avec la moyenne.
  const autres = (residentiel + travailleur + transports) / 3;
  const note = borne(Math.round(shopping + 0.25 * (autres - 3)));
  const [b1, b2, h1, h2] = FOURCHETTES[note];
  const jour = (x) => Math.round((x * HEURES_PAR_JOUR) / 500) * 500;
  return {
    note: { note, sur: 5 },
    estime: true,
    indisponible: false,
    sous_notes: { shopping: { note: shopping, sur: 5 }, résidentiel: { note: residentiel, sur: 5 }, travailleur: { note: travailleur, sur: 5 }, transports: { note: transports, sur: 5 } },
    par_heure: { basse: { min: b1, max: b2 }, haute: { min: h1, max: h2 } },
    par_jour: { basse: { min: jour(b1), max: jour(b2) }, haute: { min: jour(h1), max: jour(h2) } },
    methode: 'Estimation Klocka : la commercialité du tronçon et de la rue donne la note ; les habitants, les établissements et les transports à cinq minutes la nuancent. Pas un comptage.',
  };
}

/** Le flux voiture : le type de voie chez OpenStreetMap dit presque tout. */
export function fluxVoiture(type_voie) {
  const note = { primary: 5, trunk: 5, primary_link: 4, secondary: 4, secondary_link: 3, tertiary: 3, tertiary_link: 2, unclassified: 2, residential: 2, living_street: 1, pedestrian: 1 }[type_voie];
  if (!note) return { note: null, sur: 5, estime: true, indisponible: true };
  return { note: { note, sur: 5 }, estime: true, indisponible: false, methode: `Estimation Klocka d'après la classe de la voie (${type_voie}) chez OpenStreetMap.` };
}

// L'équipe de prospection : à qui un agent peut être attribué.
//
// La liste est fixe et nominative, c'est celle que Jules veut voir dans la
// grille. Elle vaut par l'adresse : c'est elle qui est écrite sur la fiche
// (« referent »), lue par Monday (colonne « Référent ») et par AK (« tu es son
// référent »). Le prénom n'est que ce qu'on affiche.
export const EQUIPE = [
  { prenom: 'Jules', email: 'jules.b@klocka.immo' },
  { prenom: 'Coralie', email: 'coralie.g@klocka.immo' },
  { prenom: 'Nora', email: 'nora.l@klocka.immo' },
  { prenom: 'Maxime', email: 'maxime.p@klocka.immo' },
];

/** Le prénom d'un référent, par son adresse ; sinon ce qui précède l'arobase. */
export const prenomDe = (email) => EQUIPE.find((m) => m.email === String(email || '').toLowerCase())?.prenom || String(email || '').split('@')[0] || null;

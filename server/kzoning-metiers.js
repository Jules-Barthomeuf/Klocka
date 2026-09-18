// Le référentiel des métiers de K-Zoning.
//
// Chaque métier dit deux choses : comment on l'appelle en français, et à quoi
// il correspond dans OpenStreetMap. Le nom est le nôtre — « Traiteur » plutôt
// que « craft=caterer » — parce que c'est celui que l'équipe cherche dans la
// barre de recherche.
//
// Les étiquettes ne sont pas devinées : elles ont été relevées sur le terrain,
// sur près de six mille commerces de Toulouse, Lyon et Bordeaux, et seules
// celles qui existent réellement dans ces relevés figurent ici. Un métier qui
// n'existe pas dans OpenStreetMap ne rendrait jamais rien, et il vaut mieux ne
// pas le proposer que de laisser chercher dans le vide.
//
// `filtres` est une liste de { cle, valeurs } : plusieurs étiquettes peuvent
// désigner un même métier — la téléphonie est à la fois `shop=mobile_phone` et
// `shop=telecommunication`.

/** Les familles, dans l'ordre où elles se lisent. */
export const CATEGORIES = [
  'Alimentaire', 'Restauration', 'Mode', 'Beauté', 'Santé',
  'Maison', 'Loisirs', 'Service', 'Finance', 'Auto / Moto',
  'Immobilier', 'Artisanat', 'Locaux vides',
];

const M = (nom, categorie, filtres) => ({ nom, categorie, filtres });
const shop = (...valeurs) => [{ cle: 'shop', valeurs }];
const amenity = (...valeurs) => [{ cle: 'amenity', valeurs }];
const craft = (...valeurs) => [{ cle: 'craft', valeurs }];
const office = (...valeurs) => [{ cle: 'office', valeurs }];
const leisure = (...valeurs) => [{ cle: 'leisure', valeurs }];

export const METIERS = [
  // --- Alimentaire ---------------------------------------------------------
  M('Boulangerie', 'Alimentaire', shop('bakery')),
  M('Pâtisserie', 'Alimentaire', shop('pastry')),
  M('Boucherie, charcuterie', 'Alimentaire', shop('butcher')),
  M('Poissonnerie', 'Alimentaire', shop('seafood')),
  M('Fromagerie', 'Alimentaire', shop('cheese')),
  M('Primeur', 'Alimentaire', shop('greengrocer')),
  M('Épicerie fine, traiteur de détail', 'Alimentaire', shop('deli')),
  M('Chocolaterie', 'Alimentaire', shop('chocolate')),
  M('Confiserie', 'Alimentaire', shop('confectionery')),
  M('Supérette', 'Alimentaire', shop('convenience')),
  M('Supermarché', 'Alimentaire', shop('supermarket')),
  M('Caviste', 'Alimentaire', shop('alcohol', 'wine')),
  M('Torréfacteur, café en grains', 'Alimentaire', shop('coffee')),
  M('Salon de thé, thé en vrac', 'Alimentaire', shop('tea')),

  // --- Restauration --------------------------------------------------------
  M('Restaurant', 'Restauration', amenity('restaurant')),
  M('Restauration rapide', 'Restauration', amenity('fast_food')),
  M('Café', 'Restauration', amenity('cafe')),
  M('Bar', 'Restauration', amenity('bar', 'pub')),
  M('Discothèque', 'Restauration', amenity('nightclub')),
  M('Glacier', 'Restauration', amenity('ice_cream')),
  M('Traiteur', 'Restauration', craft('caterer')),

  // --- Mode ----------------------------------------------------------------
  M('Prêt-à-porter', 'Mode', shop('clothes')),
  M('Chaussures', 'Mode', shop('shoes')),
  M('Maroquinerie, sacs', 'Mode', shop('bag', 'leather')),
  M('Accessoires de mode', 'Mode', shop('fashion_accessories')),
  M('Bijouterie', 'Mode', shop('jewelry')),
  M('Horlogerie', 'Mode', shop('watches')),
  M('Achat, vente d\'or', 'Mode', shop('gold_buyer')),
  M('Retouches, couture', 'Mode', craft('dressmaker', 'tailor')),

  // --- Beauté --------------------------------------------------------------
  M('Coiffure', 'Beauté', shop('hairdresser')),
  M('Institut de beauté', 'Beauté', shop('beauty')),
  M('Cosmétiques', 'Beauté', shop('cosmetics')),
  M('Parfumerie', 'Beauté', shop('perfumery')),
  M('Massage, bien-être', 'Beauté', shop('massage')),
  M('Tatoueur, perceur', 'Beauté', shop('tattoo')),

  // --- Santé ---------------------------------------------------------------
  M('Pharmacie', 'Santé', amenity('pharmacy')),
  M('Opticien', 'Santé', shop('optician')),
  M('Audioprothésiste', 'Santé', shop('hearing_aids')),
  M('Cabinet dentaire', 'Santé', amenity('dentist')),
  M('Cabinet médical', 'Santé', amenity('doctors', 'clinic')),
  M('Vétérinaire', 'Santé', amenity('veterinary')),
  M('Herboristerie', 'Santé', shop('herbalist')),
  M('Cigarette électronique', 'Santé', shop('e-cigarette')),

  // --- Maison --------------------------------------------------------------
  M('Décoration d\'intérieur', 'Maison', shop('interior_decoration')),
  M('Ameublement', 'Maison', shop('furniture')),
  M('Cuisine, salle de bains', 'Maison', shop('kitchen')),
  M('Arts de la table, ménage', 'Maison', shop('houseware')),
  M('Tissus, rideaux', 'Maison', shop('fabric', 'household_linen')),
  M('Fleuriste', 'Maison', shop('florist')),
  M('Antiquités, brocante', 'Maison', shop('antiques')),
  M('Galerie d\'art', 'Maison', shop('art')),
  M('Cadeaux, souvenirs', 'Maison', shop('gift')),

  // --- Loisirs -------------------------------------------------------------
  M('Librairie', 'Loisirs', shop('books')),
  M('Papeterie', 'Loisirs', shop('stationery')),
  M('Presse, tabac-presse', 'Loisirs', shop('newsagent')),
  M('Tabac', 'Loisirs', shop('tobacco')),
  M('Jeux, jouets', 'Loisirs', shop('toys')),
  M('Disquaire, musique', 'Loisirs', shop('music')),
  M('Instruments de musique', 'Loisirs', shop('musical_instrument')),
  M('Articles de sport', 'Loisirs', shop('sports')),
  M('Vélo', 'Loisirs', shop('bicycle')),
  M('Salle de sport', 'Loisirs', leisure('fitness_centre', 'sports_centre')),
  M('Danse', 'Loisirs', leisure('dance')),
  M('Cinéma', 'Loisirs', amenity('cinema')),
  M('Théâtre', 'Loisirs', amenity('theatre')),
  M('Cannabidiol (CBD)', 'Loisirs', shop('cannabis')),

  // --- Service -------------------------------------------------------------
  M('Téléphonie', 'Service', shop('mobile_phone', 'telecommunication')),
  M('Pressing, blanchisserie', 'Service', shop('dry_cleaning', 'laundry')),
  M('Cordonnerie', 'Service', craft('shoemaker')),
  M('Serrurerie, clés', 'Service', craft('key_cutter', 'locksmith')),
  M('Réparation électronique', 'Service', craft('electronics_repair')),
  M('Reprographie', 'Service', shop('copyshop')),
  M('Photographe', 'Service', craft('photographer')),
  M('Agence de voyages', 'Service', shop('travel_agency')),
  M('Agence d\'intérim', 'Service', office('employment_agency')),
  M('Auto-école', 'Service', amenity('driving_school')),
  M('La Poste', 'Service', amenity('post_office')),
  M('Espace de coworking', 'Service', office('coworking')),

  // --- Finance -------------------------------------------------------------
  M('Banque', 'Finance', amenity('bank')),
  M('Bureau de change', 'Finance', amenity('bureau_de_change')),
  M('Assurance', 'Finance', office('insurance')),
  M('Expert-comptable', 'Finance', office('accountant')),
  M('Notaire', 'Finance', office('notary')),
  M('Avocat', 'Finance', office('lawyer')),

  // --- Auto / Moto ---------------------------------------------------------
  M('Garage, réparation auto', 'Auto / Moto', shop('car_repair')),
  M('Concession auto', 'Auto / Moto', shop('car')),
  M('Accessoire auto, pneus', 'Auto / Moto', shop('car_parts', 'tyres')),
  M('Station-service', 'Auto / Moto', amenity('fuel')),
  M('Lavage auto', 'Auto / Moto', amenity('car_wash')),

  // --- Immobilier ----------------------------------------------------------
  M('Agence immobilière', 'Immobilier', office('estate_agent')),
  M('Administration de biens', 'Immobilier', office('property_management')),
  M('Architecte', 'Immobilier', office('architect')),

  // --- Artisanat du bâtiment ----------------------------------------------
  M('Plomberie, chauffage', 'Artisanat', craft('plumber', 'hvac')),
  M('Menuiserie', 'Artisanat', craft('joiner', 'carpenter')),
  M('Véranda, fermetures', 'Artisanat', craft('window_construction')),
  M('Vitrerie', 'Artisanat', craft('glaziery')),
  M('Tapisserie, sellerie', 'Artisanat', craft('upholsterer', 'saddler')),
  M('Peinture, plâtrerie', 'Artisanat', craft('painter', 'plasterer')),

  // --- Locaux vides --------------------------------------------------------
  // Le local vacant n'est pas un concurrent, c'est une opportunité. Il compte
  // autant que le reste dans une zone qu'on étudie pour s'y implanter.
  M('Local vacant', 'Locaux vides', [{ cle: 'shop', valeurs: ['vacant'] }, { cle: 'office', valeurs: ['vacant'] }]),
];

/** Le choix par défaut : tout ce que le référentiel sait reconnaître. */
export const TOUS_LES_COMMERCES = {
  nom: 'Tous les commerces',
  categorie: null,
  filtres: [
    { cle: 'shop', valeurs: [] },
    { cle: 'craft', valeurs: [] },
    { cle: 'amenity', valeurs: ['restaurant', 'fast_food', 'cafe', 'bar', 'pub', 'nightclub', 'ice_cream', 'pharmacy', 'bank', 'bureau_de_change', 'post_office', 'driving_school', 'veterinary', 'cinema', 'theatre', 'dentist', 'doctors', 'clinic', 'fuel', 'car_wash'] },
  ],
};

/** Les métiers classés de A à Z, comme ils s'affichent. */
export function listerMetiers() {
  return [...METIERS].sort((a, b) => a.nom.localeCompare(b.nom, 'fr'));
}

/**
 * Les filtres d'une sélection de métiers. Sans sélection, ou avec « Tous les
 * commerces », on rend les filtres larges.
 * @param {string[]} noms
 */
export function filtresDe(noms) {
  const voulus = (noms || []).filter(Boolean);
  if (!voulus.length || voulus.includes(TOUS_LES_COMMERCES.nom)) return TOUS_LES_COMMERCES.filtres;
  // Plusieurs métiers peuvent partager une clé : on regroupe par clé pour ne
  // pas envoyer trois fois « shop » à Overpass.
  const parCle = new Map();
  for (const nom of voulus) {
    const metier = METIERS.find((m) => m.nom === nom);
    if (!metier) continue;
    for (const f of metier.filtres) {
      const deja = parCle.get(f.cle) || new Set();
      for (const v of f.valeurs) deja.add(v);
      parCle.set(f.cle, deja);
    }
  }
  return [...parCle.entries()].map(([cle, valeurs]) => ({ cle, valeurs: [...valeurs] }));
}

/**
 * De l'étiquette OpenStreetMap au nom français du métier : `bakery` devient
 * « Boulangerie ». Une table montée une fois, rendue comme fonction.
 */
export function nomMetierDe() {
  const table = new Map();
  for (const m of METIERS) for (const f of m.filtres) for (const v of f.valeurs) if (!table.has(v)) table.set(v, m.nom);
  return (genre) => table.get(genre) || null;
}

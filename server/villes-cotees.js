// Ce que veut dire « Toute la France » pour un client (Jules, 6 nov. 2026) : pas tout le pays, mais les grandes villes
// bien cotées, puis des petites villes très cotées (riches, attractives). Pas les grandes villes peu cotées (Le Havre,
// Saint-Étienne, Mulhouse), ni la banlieue parisienne peu cotée. Liste validée par Jules le même jour ; elle se corrige
// ici. Lue par l'écran (le détail de « +n villes ») et par le serveur (un client « partout » ne vaut que pour elles).

export const VILLES_COTEES = [
  { famille: 'Grandes villes', villes: ['Paris', 'Lyon', 'Bordeaux', 'Nantes', 'Toulouse', 'Lille', 'Rennes', 'Strasbourg', 'Montpellier', 'Nice', 'Aix-en-Provence', 'Annecy', 'Tours', 'Angers', 'Dijon', 'La Rochelle', 'Marseille'] },
  { famille: 'Ouest parisien et proche banlieue', villes: ['Neuilly-sur-Seine', 'Boulogne-Billancourt', 'Levallois-Perret', 'Issy-les-Moulineaux', 'Saint-Cloud', 'Rueil-Malmaison', 'Versailles', 'Le Chesnay', 'Saint-Germain-en-Laye', 'Le Vésinet', 'Vincennes', 'Saint-Mandé', 'Sceaux', 'Chantilly', 'Fontainebleau'] },
  { famille: 'Sud-Est', villes: ['Cannes', 'Antibes', 'Mougins', 'Saint-Paul-de-Vence', 'Villefranche-sur-Mer', 'Saint-Jean-Cap-Ferrat', 'Menton', 'Saint-Tropez', 'Ramatuelle', 'Sainte-Maxime', 'Cassis', 'Saint-Rémy-de-Provence', 'Gordes', "L'Isle-sur-la-Sorgue", 'Uzès'] },
  { famille: 'Montagne', villes: ['Megève', 'Chamonix', 'Courchevel', "Val d'Isère", 'Évian-les-Bains'] },
  { famille: 'Atlantique et Manche', villes: ['Biarritz', 'Saint-Jean-de-Luz', 'Arcachon', 'Lège-Cap-Ferret', 'Saint-Martin-de-Ré', 'La Baule', 'Vannes', 'Saint-Malo', 'Dinard', 'Deauville', 'Trouville-sur-Mer', 'Honfleur', 'Le Touquet'] },
];

export const TOUTES_VILLES_COTEES = VILLES_COTEES.flatMap((f) => f.villes);

const cle = (v) => String(v || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[-'’\s]+/g, ' ').replace(/\bst\b/g, 'saint').trim();
const CLES = new Set(TOUTES_VILLES_COTEES.map(cle));
// Les noms courts d'usage (Le Touquet-Paris-Plage, Chamonix-Mont-Blanc, Trouville, Cap Ferret…).
const ALIAS = { 'le touquet paris plage': 'le touquet', 'chamonix mont blanc': 'chamonix', trouville: 'trouville sur mer', 'cap ferret': 'lege cap ferret', 'la baule escoublac': 'la baule', 'juan les pins': 'antibes' };

/** Pure : la ville est-elle de la liste ? Arrondissements compris (« Paris 8e », « Lyon 6e Arrondissement »). */
export function estVilleCotee(ville) {
  const v = cle(ville).replace(/\s+\d+(er|e|eme)?(\s+arrondissement)?$/, '').trim();
  return !!v && (CLES.has(v) || CLES.has(ALIAS[v]));
}

/** Pure : ce qu'on lit à la place de « Toute la France » : les trois premières villes et le reste en nombre. */
export const resumeVillesCotees = () => `${TOUTES_VILLES_COTEES.slice(0, 3).join(', ')} +${TOUTES_VILLES_COTEES.length - 3} villes`;

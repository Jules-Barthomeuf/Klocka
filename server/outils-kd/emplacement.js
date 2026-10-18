// L'indice de flux et le classement d'un emplacement (18 oct. 2026, lot 8, plan § 3). Pur : aucune base, aucun
// réseau. Le code calcule, l'IA explique.
//
// L'indice de flux est une ESTIMATION RELATIVE (cette rue contre celle d'à côté), pas un nombre de passants :
// aucune source publique ne compte le passage devant chaque vitrine. Chaque composante est notée sur 100 contre
// un plafond, puis pondérée. Les plafonds et les poids sont ici, à étalonner sur les rues que les analystes
// connaissent et, tant que Data-B est branché, sur son classement (validation du plan § 0.4).

/** Les composantes de l'indice : plafond (la valeur qui vaut 100) et poids. */
export const COMPOSANTES = [
  { cle: 'habitants', libelle: 'Habitants à 5 minutes à pied', plafond: 9000, poids: 0.2 },
  { cle: 'emplois', libelle: 'Entreprises à 5 minutes à pied', plafond: 1200, poids: 0.15 },
  { cle: 'gares', libelle: 'Gares proches, pondérées par leurs voyageurs', plafond: 3_000_000, poids: 0.15 },
  { cle: 'arrets', libelle: 'Arrêts de transport à moins de 300 m', plafond: 10, poids: 0.15 },
  { cle: 'generateurs', libelle: 'Générateurs de flux (écoles, grandes surfaces, hôtels, parkings…)', plafond: 25, poids: 0.1 },
  { cle: 'commercialite', libelle: 'Commerces du tronçon', plafond: 20, poids: 0.25 },
];

const borne = (x) => Math.max(0, Math.min(100, Math.round(x)));

/** Pure : le poids d'une gare à une distance : entière à 300 m, nulle au-delà de 1 500 m. */
export function poidsGare(distance_m) {
  if (distance_m == null) return 0;
  if (distance_m <= 300) return 1;
  if (distance_m >= 1500) return 0;
  return 1 - (distance_m - 300) / 1200;
}

/**
 * Pure : l'indice de flux, 0 à 100, et ses composantes. Une composante sans donnée est retirée et les poids des
 * autres sont répartis : l'indice dit sur combien de composantes il repose.
 */
export function indiceDeFlux({ habitants = null, emplois = null, gares = null, arrets = null, generateurs = null, commerces_troncon = null } = {}) {
  const valeurs = {
    habitants,
    emplois,
    gares: Array.isArray(gares) ? Math.round(gares.reduce((s, g) => s + (g.voyageurs || 0) * poidsGare(g.distance_m), 0)) : null,
    arrets: Array.isArray(arrets) ? arrets.filter((a) => (a.distance_m ?? 0) <= 300).length : null,
    generateurs: Array.isArray(generateurs) ? generateurs.length : generateurs,
    commercialite: commerces_troncon,
  };
  const presentes = COMPOSANTES.filter((c) => valeurs[c.cle] != null && Number.isFinite(Number(valeurs[c.cle])));
  const totalPoids = presentes.reduce((s, c) => s + c.poids, 0);
  const composantes = presentes.map((c) => {
    const note = borne((Number(valeurs[c.cle]) / c.plafond) * 100);
    return { cle: c.cle, libelle: c.libelle, valeur: valeurs[c.cle], note, poids: Math.round((c.poids / totalPoids) * 100) / 100 };
  });
  const indice = totalPoids ? borne(composantes.reduce((s, c) => s + c.note * c.poids, 0)) : null;
  return { indice, composantes, sur: `${presentes.length} composantes sur ${COMPOSANTES.length}`, nature: 'estimation relative, pas un nombre de passants' };
}

/** Les seuils du classement (indice de flux et commercialité du tronçon), à étalonner. */
export const SEUILS_CLASSEMENT = [
  { cle: 'n1', libelle: 'Emplacement n°1', indice: 65, commercialite: 60 },
  { cle: 'n1_bis', libelle: 'Emplacement n°1 bis', indice: 50, commercialite: 40 },
  { cle: 'n2', libelle: 'Emplacement n°2', indice: 30, commercialite: 15 },
  { cle: 'secondaire', libelle: 'Emplacement secondaire', indice: 0, commercialite: 0 },
];

/**
 * Pure : le classement du tronçon, avec la note de chaque critère, les réserves (risques, urbanisme, vacance)
 * et les activités adaptées ou déconseillées.
 */
export function classerEmplacement({ flux, revenu_vs_france = null, urbanisme = null, risques = null, vacance = null, loyer = null } = {}) {
  const indice = flux?.indice ?? null;
  const commercialite = flux?.composantes?.find((c) => c.cle === 'commercialite')?.note ?? null;
  if (indice == null) return { classement: null, libelle: 'Classement impossible : pas assez de données', criteres: [], reserves: [], activites: { adaptees: [], deconseillees: [] } };
  const seuil = SEUILS_CLASSEMENT.find((s) => indice >= s.indice && (commercialite == null || commercialite >= s.commercialite)) || SEUILS_CLASSEMENT[SEUILS_CLASSEMENT.length - 1];

  const criteres = [
    { cle: 'flux', libelle: 'Flux', note: indice, detail: flux.sur },
    ...(flux.composantes || []).map((c) => ({ cle: c.cle, libelle: c.libelle, note: c.note, detail: String(c.valeur) })),
  ];
  if (revenu_vs_france != null) criteres.push({ cle: 'revenu', libelle: 'Niveau de vie du quartier face à la France', note: borne(50 + revenu_vs_france), detail: `${revenu_vs_france > 0 ? '+' : ''}${revenu_vs_france} %` });
  if (loyer?.central) criteres.push({ cle: 'loyer', libelle: 'Loyer de marché de la rue', note: null, detail: `${loyer.bas} à ${loyer.haut} €/m²/an, confiance ${loyer.confiance || 'non dite'}` });

  const reserves = [];
  if (urbanisme?.lineaire_commercial) criteres.push({ cle: 'urbanisme', libelle: 'Linéaire commercial protégé au PLU', note: 100, detail: urbanisme.zone?.code || '' });
  if (urbanisme?.zone && urbanisme.zone.type && urbanisme.zone.type !== 'U') reserves.push(`Zone ${urbanisme.zone.code} du PLU (type ${urbanisme.zone.type}) : vérifier que le commerce y est permis.`);
  if (risques?.lourds?.length) reserves.push(`Risques connus de la commune : ${risques.lourds.slice(0, 4).join(', ')}${risques.lourds.length > 4 ? '…' : ''}.`);
  if (vacance?.taux != null && vacance.taux >= 10) reserves.push(`Vacance de la rue élevée (${vacance.taux} %).`);

  const fluxFort = indice >= 50;
  const riche = revenu_vs_france != null && revenu_vs_france >= 10;
  const adaptees = []; const deconseillees = [];
  if (fluxFort) adaptees.push('prêt-à-porter et enseignes nationales', 'restauration rapide et boulangerie', 'téléphonie et services à fort passage');
  if (!fluxFort && riche) adaptees.push('services de proximité (pharmacie, opticien, agence)', 'commerces de destination (caviste, épicerie fine)');
  if (!fluxFort && !riche) adaptees.push('services de proximité du quotidien', 'activités de destination qui n\'attendent pas le passage');
  if (!fluxFort) deconseillees.push('prêt-à-porter et enseignes qui vivent du passage');
  if (fluxFort && (commercialite ?? 0) >= 60) deconseillees.push('activités de destination qui paieraient un loyer de passage sans en profiter');

  return { classement: seuil.cle, libelle: seuil.libelle, indice, commercialite, criteres, reserves, activites: { adaptees, deconseillees }, nature: 'classement estimé, à étalonner sur celui des analystes (8 cas sur 10)' };
}
